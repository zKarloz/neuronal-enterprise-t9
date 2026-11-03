"""M04/M06: arquitecturas versionadas y cola de trabajos persistidos.

Los entrenamientos nunca se ejecutan en el proceso HTTP. El worker reclama
trabajos desde PostgreSQL. El usuario ve solo recursos de sus proyectos.
"""
from datetime import datetime, timezone
import asyncio
import json
import time
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field, field_validator
from typing import Literal
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.projects import editor, one
from app.core.auth import Identity, current_user
from app.core.database import get_db
from app.models.entities import (
    ArchitectureRecord, AuditEvent, DatasetRecord, ModelVersion, Project, TrainingJob, TrainingMetric,
)

router = APIRouter(prefix="/projects/{project_id}", tags=["training"])
ACTIVELY_RUNNING = ("QUEUED", "PREPARING", "RUNNING")


class DenseLayer(BaseModel):
    units: int = Field(ge=2, le=128)
    activation: str = Field(pattern="^(relu|tanh|sigmoid)$")


class ArchitectureInput(BaseModel):
    name: str = Field(min_length=3, max_length=100)
    layers: list[DenseLayer] = Field(min_length=1, max_length=4)
    @field_validator("name")
    @classmethod
    def name_valid(cls, value: str) -> str:
        name = value.strip()
        if len(name) < 3:
            raise ValueError("El nombre debe tener al menos 3 caracteres.")
        return name


class ArchitectureView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    project_id: UUID
    name: str
    version: int
    family: str
    config_json: dict
    created_at: datetime


class JobInput(BaseModel):
    architecture_id: UUID
    dataset_id: UUID
    epochs: int = Field(default=10, ge=1, le=40)
    batch_size: int = Field(default=32, ge=1, le=256)
    learning_rate: float = Field(default=0.001, gt=0, le=0.1)
    seed: int = Field(default=42, ge=0, le=2_147_483_647)
    early_stopping_patience: int = Field(default=0, ge=0, le=10)


class JobView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    project_id: UUID
    architecture_id: UUID
    dataset_id: UUID
    status: str
    progress: int
    epoch: int
    epochs: int
    batch_size: int
    learning_rate: float
    seed: int
    early_stopping_patience: int
    cancel_requested: bool
    error_message: str | None
    created_at: datetime
    started_at: datetime | None
    ended_at: datetime | None
    heartbeat_at: datetime | None
    retry_of_job_id: UUID | None


class MetricView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    epoch: int
    loss: float
    val_loss: float
    accuracy: float | None
    val_accuracy: float | None


class ModelView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    job_id: UUID
    project_id: UUID
    sha256: str
    test_metrics: dict
    name: str
    stage: str
    notes: str
    best_epoch: int | None
    epochs_trained: int | None
    early_stopped: bool | None
    created_at: datetime
    # No revelar storage_key de los artefactos privados.


def require_editor(db: Session, project_id: UUID, identity: Identity):
    project = one(db, project_id, identity)
    if not editor(db, project, identity):
        raise HTTPException(403, "No tienes permisos para entrenar en este proyecto.")
    if project.status != "active":
        raise HTTPException(409, "El proyecto está archivado.")
    return project


@router.get("/architectures", response_model=list[ArchitectureView])
def list_architectures(project_id: UUID, identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    one(db, project_id, identity)
    return db.scalars(select(ArchitectureRecord).where(ArchitectureRecord.project_id == project_id)
                      .order_by(ArchitectureRecord.created_at.desc())).all()


@router.post("/architectures", status_code=201, response_model=ArchitectureView)
def create_architecture(project_id: UUID, payload: ArchitectureInput,
                        identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    require_editor(db, project_id, identity)
    # Cada edición crea un recurso inmutable, nunca sobrescribe un modelo utilizado.
    version = (db.scalar(select(func.max(ArchitectureRecord.version)).where(
        ArchitectureRecord.project_id == project_id, ArchitectureRecord.name == payload.name)) or 0) + 1
    record = ArchitectureRecord(project_id=project_id, name=payload.name, version=version,
                                family="feedforward", config_json={"layers": [layer.model_dump() for layer in payload.layers]})
    db.add(record)
    db.flush()
    db.add(AuditEvent(actor_id=identity.id, project_id=project_id, action="architecture.created"))
    db.commit()
    db.refresh(record)
    return record


@router.get("/training-jobs", response_model=list[JobView])
def list_jobs(project_id: UUID, identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    one(db, project_id, identity)
    return db.scalars(select(TrainingJob).where(TrainingJob.project_id == project_id)
                      .order_by(TrainingJob.created_at.desc()).limit(100)).all()


@router.post("/training-jobs", status_code=202, response_model=JobView)
def enqueue_job(project_id: UUID, payload: JobInput,
                identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    require_editor(db, project_id, identity)
    architecture = db.scalar(select(ArchitectureRecord).where(
        ArchitectureRecord.id == payload.architecture_id, ArchitectureRecord.project_id == project_id))
    dataset = db.scalar(select(DatasetRecord).where(
        DatasetRecord.id == payload.dataset_id, DatasetRecord.project_id == project_id))
    if architecture is None or architecture.family != "feedforward":
        raise HTTPException(422, "Selecciona una arquitectura Feedforward remota válida.")
    if dataset is None or not dataset.prep_json:
        raise HTTPException(422, "Selecciona un dataset remoto preparado en M05.")
    if dataset.prep_json.get("pipeline_version") != 1:
        raise HTTPException(422, "Versión de preprocesamiento no compatible.")
    # Bloquear el proyecto mientras comprobamos trabajos activos; dos POST
    # concurrentes no pueden encolar trabajos activos del mismo proyecto.
    if db.bind.dialect.name == "postgresql":
        db.execute(select(Project.id).where(Project.id == project_id).with_for_update()).first()
    # Un solo entrenamiento activo por proyecto durante el MVP de recursos limitados.
    active = db.scalar(select(TrainingJob.id).where(TrainingJob.project_id == project_id,
                    TrainingJob.status.in_(ACTIVELY_RUNNING)).limit(1))
    if active:
        raise HTTPException(409, "Ya existe un entrenamiento activo en este proyecto.")
    record = TrainingJob(project_id=project_id, architecture_id=architecture.id,
        dataset_id=dataset.id, epochs=payload.epochs, batch_size=payload.batch_size,
        learning_rate=payload.learning_rate, seed=payload.seed,
        early_stopping_patience=payload.early_stopping_patience, status="QUEUED",
        config_snapshot=dict(architecture.config_json), preparation_snapshot=dict(dataset.prep_json),
        dataset_sha256=dataset.sha256)
    db.add(record)
    db.flush()
    db.add(AuditEvent(actor_id=identity.id, project_id=project_id, action="training.queued"))
    db.commit()
    db.refresh(record)
    return record


@router.get("/training-jobs/{job_id}", response_model=JobView)
def get_job(project_id: UUID, job_id: UUID, identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    one(db, project_id, identity)
    job = db.scalar(select(TrainingJob).where(TrainingJob.id == job_id, TrainingJob.project_id == project_id))
    if job is None:
        raise HTTPException(404, "Trabajo no encontrado.")
    return job


@router.get("/training-jobs/{job_id}/metrics", response_model=list[MetricView])
def job_metrics(project_id: UUID, job_id: UUID, identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    get_job(project_id, job_id, identity, db)
    return db.scalars(select(TrainingMetric).where(TrainingMetric.job_id == job_id)
                      .order_by(TrainingMetric.epoch)).all()


@router.post("/training-jobs/{job_id}/cancel", response_model=JobView)
def cancel_job(project_id: UUID, job_id: UUID, identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    require_editor(db, project_id, identity)
    job = db.scalar(select(TrainingJob).where(TrainingJob.id == job_id, TrainingJob.project_id == project_id))
    if job is None:
        raise HTTPException(404, "Trabajo no encontrado.")
    if job.status not in ACTIVELY_RUNNING:
        raise HTTPException(409, "Este entrenamiento ya finalizó.")
    if job.status == "QUEUED":
        job.status = "CANCELLED"
        job.ended_at = datetime.now(timezone.utc)
    else:
        # RUNNING: el worker confirma CANCELLED al terminar la época vigente.
        job.cancel_requested = True
    db.add(AuditEvent(actor_id=identity.id, project_id=project_id, action="training.cancel_requested"))
    db.commit()
    db.refresh(job)
    return job



@router.post("/training-jobs/{job_id}/retry", status_code=202, response_model=JobView)
def retry_job(project_id: UUID, job_id: UUID, identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    """Reintenta manualmente sin reescribir épocas ni artefactos anteriores."""
    require_editor(db, project_id, identity)
    if db.bind.dialect.name == "postgresql":
        db.execute(select(Project.id).where(Project.id == project_id).with_for_update()).first()
    original = db.scalar(select(TrainingJob).where(
        TrainingJob.id == job_id, TrainingJob.project_id == project_id))
    if original is None:
        raise HTTPException(404, "Trabajo no encontrado.")
    if original.status not in ("FAILED", "CANCELLED"):
        raise HTTPException(409, "Solo es posible reintentar trabajos fallidos o cancelados.")
    active = db.scalar(select(TrainingJob.id).where(
        TrainingJob.project_id == project_id, TrainingJob.status.in_(ACTIVELY_RUNNING)).limit(1))
    if active:
        raise HTTPException(409, "Ya existe otro entrenamiento activo en este proyecto.")
    # Reutilizar el snapshot original garantiza un experimento reproducible.
    # La eliminación de datasets asociados ya está bloqueada por su relación FK.
    retry = TrainingJob(project_id=project_id, architecture_id=original.architecture_id,
        dataset_id=original.dataset_id, epochs=original.epochs,
        batch_size=original.batch_size, learning_rate=original.learning_rate,
        seed=original.seed, early_stopping_patience=original.early_stopping_patience, status="QUEUED",
        config_snapshot=dict(original.config_snapshot),
        preparation_snapshot=dict(original.preparation_snapshot),
        dataset_sha256=original.dataset_sha256, retry_of_job_id=original.id)
    db.add(retry)
    db.flush()
    db.add(AuditEvent(actor_id=identity.id, project_id=project_id, action="training.retried"))
    db.commit()
    db.refresh(retry)
    return retry


def _job_snapshot(bind, project_id: UUID, job_id: UUID) -> dict | None:
    """Cada consulta SSE usa una sesión breve y no retiene una conexión SQL abierta."""
    with Session(bind) as session:
        job = session.scalar(select(TrainingJob).where(
            TrainingJob.id == job_id, TrainingJob.project_id == project_id))
        if job is None:
            return None
        rows = session.scalars(select(TrainingMetric).where(
            TrainingMetric.job_id == job_id).order_by(TrainingMetric.epoch)).all()
        model = session.scalar(select(ModelVersion).where(ModelVersion.job_id == job_id))
        return {
            "job": JobView.model_validate(job).model_dump(mode="json"),
            "metrics": [MetricView.model_validate(row).model_dump(mode="json") for row in rows],
            "model": ModelView.model_validate(model).model_dump(mode="json") if model else None,
        }


@router.get("/training-jobs/{job_id}/events")
async def job_events(project_id: UUID, job_id: UUID, request: Request,
                     identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    """SSE por fetch con Bearer; no usar token en URL ni EventSource nativo.

    El stream dura hasta 45 s en estado activo y el navegador reconecta;
    cada conexión se autoriza antes de crear el stream.
    """
    get_job(project_id, job_id, identity, db)
    bind = db.get_bind()
    # Release la transacción utilizada para autorizar; el stream consulta con
    # sesiones SQL breves en lugar de ocupar una conexión durante 45 segundos.
    db.rollback()

    async def events():
        previous = None
        start = time.monotonic()
        next_ping = start + 12
        while time.monotonic() - start < 45:
            if await request.is_disconnected():
                return
            current = await asyncio.to_thread(_job_snapshot, bind, project_id, job_id)
            if current is None:
                return
            payload = json.dumps(current, ensure_ascii=False, separators=(",", ":"))
            if payload != previous:
                yield f"event: snapshot\ndata: {payload}\n\n"
                previous = payload
            if current["job"]["status"] in ("COMPLETED", "FAILED", "CANCELLED"):
                return
            if time.monotonic() >= next_ping:
                yield ": heartbeat\n\n"
                next_ping = time.monotonic() + 12
            await asyncio.sleep(2)

    return StreamingResponse(events(), media_type="text/event-stream", headers={
        "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no",
    })

@router.get("/models", response_model=list[ModelView])
def list_models(project_id: UUID, identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    one(db, project_id, identity)
    return db.scalars(select(ModelVersion).where(ModelVersion.project_id == project_id)
                      .order_by(ModelVersion.created_at.desc())).all()


class ModelUpdate(BaseModel):
    """Solo metadatos; no se altera el binario, SHA-256 o resultados del test."""
    name: str | None = Field(default=None, min_length=3, max_length=100)
    notes: str | None = Field(default=None, max_length=500)
    stage: Literal["candidate", "production", "archived"] | None = None

    @field_validator("name")
    @classmethod
    def clean_name(cls, value: str | None):
        if value is not None:
            value = value.strip()
            if len(value) < 3:
                raise ValueError("El nombre debe tener al menos 3 caracteres.")
        return value


@router.patch("/models/{model_id}", response_model=ModelView)
def update_model(project_id: UUID, model_id: UUID, payload: ModelUpdate,
                 identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    """Registro privado: editor puede nombrar, anotar o promover un modelo."""
    require_editor(db, project_id, identity)
    if db.bind.dialect.name == "postgresql":
        # Serializar promociones por proyecto, sin carreras entre solicitudes.
        db.execute(select(Project.id).where(Project.id == project_id).with_for_update()).first()
    model = db.scalar(select(ModelVersion).where(
        ModelVersion.id == model_id, ModelVersion.project_id == project_id))
    if model is None:
        raise HTTPException(404, "Modelo no encontrado.")
    if payload.name is not None:
        model.name = payload.name
    if payload.notes is not None:
        model.notes = payload.notes.strip()
    if payload.stage is not None:
        if payload.stage == "production":
            # Promover uno automáticamente devuelve el anterior a candidato.
            from sqlalchemy import update
            db.execute(update(ModelVersion).where(
                ModelVersion.project_id == project_id,
                ModelVersion.id != model_id,
                ModelVersion.stage == "production").values(stage="candidate"))
        model.stage = payload.stage
    db.add(AuditEvent(actor_id=identity.id, project_id=project_id, action="model.updated"))
    db.commit()
    db.refresh(model)
    return model
