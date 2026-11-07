"""Copias JSON del laboratorio del navegador: una por identidad Supabase verificada.

NO es un sistema de sincronización automática ni convierte los modelos a .keras.
La revisión evita sobrescribir una copia creada desde otra computadora sin advertencia.
"""
import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.auth import Identity, current_user
from app.core.database import get_db
from app.models.entities import AuditEvent, BrowserWorkspaceBackup, User

router = APIRouter(prefix="/workspace-backup", tags=["workspace-backup"])
MAX_BYTES = 3 * 1024 * 1024  # Evitar grandes cargas JSON en el plan gratuito de Render/PostgreSQL.
MAX_ITEMS = {"projects": 100, "architectures": 500, "datasets": 100, "runs": 1000, "models": 500}


class BackupPut(BaseModel):
    expected_revision: int = Field(ge=0)
    workspace: dict[str, Any]


def canonical_bytes(value: dict) -> bytes:
    try:
        return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"), allow_nan=False).encode("utf-8")
    except (TypeError, ValueError, OverflowError):
        raise HTTPException(422, "La copia incluye datos que no son JSON válido.") from None


def validate_workspace(value: dict) -> bytes:
    """Comprobar estructura y relaciones sin ejecutar ni interpretar pesos de modelos."""
    expected = ("projects", "architectures", "datasets", "runs", "models")
    if any(not isinstance(value.get(name), list) or len(value[name]) > MAX_ITEMS[name] for name in expected):
        raise HTTPException(422, "El espacio contiene listas ausentes o fuera de los límites admitidos.")
    if not isinstance(value.get("activeArchitectureIds"), dict) or not (
        value.get("activeProjectId") is None or isinstance(value.get("activeProjectId"), str)
    ):
        raise HTTPException(422, "Las preferencias del espacio de trabajo son inválidas.")

    project_ids: set[str] = set()
    for name in expected:
        seen: set[str] = set()
        for record in value[name]:
            if not isinstance(record, dict) or not isinstance(record.get("id"), str) or not 1 <= len(record["id"]) <= 80:
                raise HTTPException(422, f"Registro inválido en {name}.")
            if record["id"] in seen:
                raise HTTPException(422, f"Hay identificadores duplicados en {name}.")
            seen.add(record["id"])
            if name != "projects" and (not isinstance(record.get("projectId"), str)):
                raise HTTPException(422, f"Falta el proyecto asociado de {name}.")
        if name == "projects":
            project_ids = seen
    for name in expected[1:]:
        if any(record["projectId"] not in project_ids for record in value[name]):
            raise HTTPException(422, f"Hay registros huérfanos en {name}.")
    if value["activeProjectId"] is not None and value["activeProjectId"] not in project_ids:
        raise HTTPException(422, "El proyecto activo no existe en la copia.")
    if any(not isinstance(k, str) or k not in project_ids or not isinstance(v, str)
           for k, v in value["activeArchitectureIds"].items()):
        raise HTTPException(422, "Selección de arquitectura inválida.")
    for dataset in value["datasets"]:
        headers = dataset.get("headers")
        rows = dataset.get("rows")
        target = dataset.get("target")
        if (not isinstance(headers, list) or not 1 <= len(headers) <= 65
                or not all(isinstance(h, str) for h in headers)
                or len(headers) != len(set(headers))
                or target not in headers
                or not isinstance(rows, list) or len(rows) > 2000):
            raise HTTPException(422, "El dataset de la copia tiene un esquema inválido.")
        if any(not isinstance(row, list) or len(row) != len(headers) or
               any(isinstance(n, bool) or not isinstance(n, (int, float)) for n in row)
               for row in rows):
            raise HTTPException(422, "El dataset contiene filas numéricas inválidas.")

    encoded = canonical_bytes(value)
    if len(encoded) > MAX_BYTES:
        raise HTTPException(413, "La copia supera 3 MiB. Descarga la copia JSON local y reduce el tamaño antes de subirla.")
    return encoded


def metadata(item: BrowserWorkspaceBackup | None) -> dict:
    if item is None:
        return {"exists": False, "revision": 0, "size_bytes": 0, "sha256": None, "updated_at": None}
    return {"exists": True, "revision": item.revision, "size_bytes": item.size_bytes,
            "sha256": item.sha256, "updated_at": item.updated_at}


@router.get("/status")
def status(response: Response, identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return metadata(db.get(BrowserWorkspaceBackup, identity.id))


@router.get("")
def download_backup(response: Response, identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    item = db.get(BrowserWorkspaceBackup, identity.id)
    if item is None:
        raise HTTPException(404, "No existe ninguna copia guardada en esta cuenta.")
    return {**metadata(item), "workspace": item.workspace_json}


@router.put("")
def upload_backup(payload: BackupPut, response: Response,
                  identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    encoded = validate_workspace(payload.workspace)
    # Bloqueo de la copia actual en PostgreSQL; SQLite conserva la unicidad del PK.
    row = db.scalar(select(BrowserWorkspaceBackup).where(
        BrowserWorkspaceBackup.user_id == identity.id).with_for_update())
    current_revision = row.revision if row else 0
    if current_revision != payload.expected_revision:
        raise HTTPException(409, "La copia de esta cuenta cambió en otra sesión. Consulta su estado antes de sobrescribirla.")
    timestamp = datetime.now(timezone.utc)
    if row is None:
        if db.get(User, identity.id) is None:
            db.add(User(id=identity.id, email=identity.email))
            db.flush()
        row = BrowserWorkspaceBackup(user_id=identity.id, revision=1, workspace_json=payload.workspace,
                                     sha256=hashlib.sha256(encoded).hexdigest(), size_bytes=len(encoded),
                                     updated_at=timestamp)
        db.add(row)
    else:
        row.revision += 1
        row.workspace_json = payload.workspace
        row.sha256 = hashlib.sha256(encoded).hexdigest()
        row.size_bytes = len(encoded)
        row.updated_at = timestamp
    db.add(AuditEvent(actor_id=identity.id, project_id=None, action="workspace.backup.saved",
                      details_json={"revision": row.revision, "size_bytes": row.size_bytes}))
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(409, "Otra sesión creó la copia primero. Consulta el estado y vuelve a intentarlo.") from None
    db.refresh(row)
    response.headers["Cache-Control"] = "no-store"
    return metadata(row)
