"""M05: CSV remoto, versiones y preprocesamiento sin tocar el motor local."""
from __future__ import annotations

import re
from pathlib import PurePath
from uuid import UUID, uuid4

from fastapi import APIRouter, Depends, File, HTTPException, Response, UploadFile
from pydantic import BaseModel, Field, ConfigDict
from sqlalchemy import select, func
from sqlalchemy.orm import Session

from app.api.projects import one, editor
from app.core.auth import Identity, current_user
from app.core.database import get_db
from app.models.entities import AuditEvent, DatasetRecord, TrainingJob
from app.services.csv_pipeline import CSVValidationError, MAX_CSV_BYTES, inspect_csv, prepare_csv
from app.services.storage import PrivateStorage, get_storage

router = APIRouter(prefix="/projects/{project_id}/datasets", tags=["datasets"])


class DatasetView(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    project_id: UUID
    name: str
    version: int
    size_bytes: int
    sha256: str
    row_count: int
    column_count: int
    columns_json: list[dict]
    preview_json: list[list[str]]
    prep_json: dict | None


class PreparationRequest(BaseModel):
    target_column: str = Field(min_length=1, max_length=100)
    task: str = Field(pattern="^(classification|regression)$")
    validation_fraction: float = Field(default=0.15, ge=0.05, le=0.4)
    test_fraction: float = Field(default=0.15, ge=0.05, le=0.4)
    seed: int = Field(default=42, ge=0, le=2_147_483_647)


def dataset_or_404(db: Session, project_id: UUID, dataset_id: UUID) -> DatasetRecord:
    item = db.scalar(select(DatasetRecord).where(DatasetRecord.id == dataset_id, DatasetRecord.project_id == project_id))
    if item is None:
        raise HTTPException(404, "Dataset no encontrado.")
    return item


def editable(db: Session, project, identity: Identity):
    if not editor(db, project, identity):
        raise HTTPException(403, "No tienes permisos para modificar datasets de este proyecto.")


def clean_filename(raw_name: str) -> str:
    # Enviar el nombre solo como metadato, sin usarlo jamás para rutas de Storage.
    name = raw_name.replace("\\", "/").split("/")[-1].strip()
    if not re.fullmatch(r"[^\x00-\x1f\x7f]{1,180}\.csv", name, flags=re.IGNORECASE):
        raise HTTPException(422, "El archivo debe tener un nombre CSV válido (hasta 180 caracteres).")
    return name


@router.get("", response_model=list[DatasetView])
def list_datasets(project_id: UUID, identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    one(db, project_id, identity)
    return db.scalars(select(DatasetRecord).where(DatasetRecord.project_id == project_id)
                      .order_by(DatasetRecord.created_at.desc(), DatasetRecord.version.desc())).all()


@router.post("", status_code=201, response_model=DatasetView)
async def upload_dataset(
    project_id: UUID,
    file: UploadFile = File(...),
    identity: Identity = Depends(current_user),
    db: Session = Depends(get_db),
    storage: PrivateStorage = Depends(get_storage),
):
    project = one(db, project_id, identity)
    editable(db, project, identity)
    filename = clean_filename(file.filename or "")
    raw = await file.read(MAX_CSV_BYTES + 1)
    await file.close()
    try:
        metadata = inspect_csv(raw)
    except CSVValidationError as error:
        raise HTTPException(422, str(error)) from None
    # La ruta física usa identificadores del servidor, nunca el nombre original.
    dataset_id = uuid4()
    storage_key = f"{project_id}/{dataset_id}.csv"
    version = (db.scalar(select(func.max(DatasetRecord.version)).where(
        DatasetRecord.project_id == project_id, DatasetRecord.name == filename)) or 0) + 1
    await storage.upload(storage_key, raw)
    item = DatasetRecord(id=dataset_id, project_id=project_id, name=filename, version=version,
                         storage_key=storage_key, sha256=metadata["sha256"], size_bytes=len(raw),
                         row_count=metadata["row_count"], column_count=metadata["column_count"],
                         columns_json=metadata["columns"], preview_json=metadata["preview"], prep_json=None)
    try:
        db.add(item)
        db.flush()
        db.add(AuditEvent(actor_id=identity.id, project_id=project_id, action="dataset.uploaded"))
        db.commit()
        db.refresh(item)
    except Exception:
        db.rollback()
        # Si falla PostgreSQL después de cargar el archivo, evitar objetos huérfanos.
        await storage.delete(storage_key)
        raise
    return item


@router.get("/{dataset_id}", response_model=DatasetView)
def get_dataset(project_id: UUID, dataset_id: UUID, identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    one(db, project_id, identity)
    return dataset_or_404(db, project_id, dataset_id)


@router.post("/{dataset_id}/prepare", response_model=DatasetView)
async def prepare_dataset(
    project_id: UUID, dataset_id: UUID, payload: PreparationRequest,
    identity: Identity = Depends(current_user), db: Session = Depends(get_db),
    storage: PrivateStorage = Depends(get_storage),
):
    project = one(db, project_id, identity)
    editable(db, project, identity)
    item = dataset_or_404(db, project_id, dataset_id)
    raw = await storage.read(item.storage_key)
    try:
        result = prepare_csv(raw, payload.target_column, payload.task,
                             payload.validation_fraction, payload.test_fraction, payload.seed)
    except CSVValidationError as error:
        raise HTTPException(422, str(error)) from None
    # Guardar únicamente estadísticas obtenidas del CSV real y los índices reproducibles.
    item.prep_json = result
    db.add(AuditEvent(actor_id=identity.id, project_id=project_id, action="dataset.prepared"))
    db.commit()
    db.refresh(item)
    return item


@router.get("/{dataset_id}/download")
async def download_dataset(project_id: UUID, dataset_id: UUID,
                           identity: Identity = Depends(current_user), db: Session = Depends(get_db),
                           storage: PrivateStorage = Depends(get_storage)):
    one(db, project_id, identity)
    item = dataset_or_404(db, project_id, dataset_id)
    raw = await storage.read(item.storage_key)
    # No exponer directamente claves, enlaces ni URLs de Storage al cliente.
    from urllib.parse import quote
    return Response(raw, media_type="text/csv; charset=utf-8", headers={
        "Content-Disposition": f"attachment; filename*=UTF-8''{quote(item.name, safe='')}",
        "Cache-Control": "private, no-store",
    })


@router.delete("/{dataset_id}", status_code=204)
async def delete_dataset(project_id: UUID, dataset_id: UUID,
                         identity: Identity = Depends(current_user), db: Session = Depends(get_db),
                         storage: PrivateStorage = Depends(get_storage)):
    project = one(db, project_id, identity)
    editable(db, project, identity)
    item = dataset_or_404(db, project_id, dataset_id)
    # Un entrenamiento versionado necesita conservar su dataset original.
    if db.scalar(select(TrainingJob.id).where(TrainingJob.dataset_id == item.id).limit(1)):
        raise HTTPException(409, "El dataset está referenciado por un entrenamiento; no puede eliminarse.")
    # Borrar el objeto antes de quitar la referencia; si falla, conservar el metadato.
    await storage.delete(item.storage_key)
    db.delete(item)
    db.add(AuditEvent(actor_id=identity.id, project_id=project_id, action="dataset.deleted"))
    db.commit()
    return Response(status_code=204)
