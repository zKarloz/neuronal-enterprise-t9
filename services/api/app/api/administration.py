"""M10: colaboración por proyecto, auditoría y uso de recursos.

Todos los endpoints se autentican con JWT Supabase y comprueban los permisos
contra PostgreSQL. Ningún rol se acepta desde claims editables del navegador.
"""
from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.api.projects import one, require_roles, role_of
from app.core.auth import Identity, current_user
from app.core.config import settings
from app.core.database import get_db
from app.models.entities import (
    ArchitectureRecord, AuditEvent, DatasetRecord, Project, ProjectMember,
    TrainingJob, User,
)

router = APIRouter(prefix="/projects/{project_id}/administration", tags=["administration"])
ASSIGNABLE_ROLES = ("manager", "engineer", "reviewer", "reader")


class MemberInput(BaseModel):
    email: str = Field(min_length=5, max_length=320)
    role: str

    @field_validator("email")
    @classmethod
    def email_normalized(cls, email: str) -> str:
        normalized = email.strip().lower()
        if normalized.count("@") != 1 or normalized.startswith("@") or "." not in normalized.split("@")[-1]:
            raise ValueError("Indica un correo válido.")
        return normalized

    @field_validator("role")
    @classmethod
    def known_role(cls, role: str) -> str:
        if role not in ASSIGNABLE_ROLES:
            raise ValueError("Rol de proyecto desconocido.")
        return role


class RoleChange(BaseModel):
    role: str

    @field_validator("role")
    @classmethod
    def known_role(cls, role: str) -> str:
        if role not in ASSIGNABLE_ROLES:
            raise ValueError("Rol de proyecto desconocido.")
        return role


class MemberView(BaseModel):
    user_id: UUID
    email: str | None
    role: str


class AccessView(BaseModel):
    current_role: str
    members: list[MemberView]


class AuditView(BaseModel):
    id: UUID
    actor_id: UUID
    actor_email: str | None
    action: str
    target_id: str | None
    details: dict | None
    created_at: datetime


class AuditPage(BaseModel):
    total: int
    items: list[AuditView]


def audit_event(db: Session, identity: Identity, project_id: UUID, action: str,
                target_id: UUID | None = None, details: dict | None = None) -> None:
    """Guardar solo campos estructurados, nunca email, JWT ni valores libres."""
    db.add(AuditEvent(actor_id=identity.id, project_id=project_id, action=action,
                      target_id=str(target_id) if target_id else None, details_json=details))


def permission_to_manage(db: Session, project: Project, identity: Identity,
                         target_role: str, new_role: str | None = None) -> str:
    role = require_roles(db, project, identity, "owner", "manager")
    # Un manager no puede nombrar gestores, alterar a otro manager ni elevarse.
    if role == "manager" and (target_role == "manager" or new_role == "manager"):
        raise HTTPException(403, "Solo el propietario puede administrar gestores.")
    return role


@router.get("/access", response_model=AccessView)
def access(project_id: UUID, identity: Identity = Depends(current_user),
           db: Session = Depends(get_db)):
    project = one(db, project_id, identity)
    owner = db.get(User, project.owner_id)
    members = [MemberView(user_id=project.owner_id, email=owner.email if owner else None, role="owner")]
    joined = db.execute(select(ProjectMember, User.email).join(User, User.id == ProjectMember.user_id)
                        .where(ProjectMember.project_id == project_id)
                        .order_by(User.email.asc())).all()
    members.extend(MemberView(user_id=member.user_id, email=email, role=member.role)
                   for member, email in joined)
    return AccessView(current_role=role_of(db, project, identity) or "reader", members=members)


@router.post("/members", response_model=MemberView, status_code=201)
def add_member(project_id: UUID, payload: MemberInput,
               identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    project = one(db, project_id, identity)
    permission_to_manage(db, project, identity, payload.role, payload.role)
    if project.status != "active":
        raise HTTPException(409, "No se pueden añadir miembros a un proyecto archivado.")
    # El bloqueo de proyecto serializa invitaciones y hace efectiva la cuota.
    if db.bind.dialect.name == "postgresql":
        db.execute(select(Project.id).where(Project.id == project_id).with_for_update()).first()
    existing_count = db.scalar(select(func.count(ProjectMember.user_id)).where(
        ProjectMember.project_id == project_id)) or 0
    if existing_count >= settings().max_members_per_project:
        raise HTTPException(409, "Límite de miembros alcanzado.")
    users = db.scalars(select(User).where(func.lower(User.email) == payload.email).limit(2)).all()
    if len(users) != 1:
        raise HTTPException(404, "No se encontró esa cuenta. Debe iniciar sesión en NeuroLab al menos una vez.")
    user = users[0]
    if user.id == project.owner_id:
        raise HTTPException(409, "El propietario ya tiene acceso al proyecto.")
    if db.get(ProjectMember, (project_id, user.id)):
        raise HTTPException(409, "El usuario ya pertenece a este proyecto.")
    db.add(ProjectMember(project_id=project_id, user_id=user.id, role=payload.role))
    audit_event(db, identity, project_id, "member.added", user.id, {"role": payload.role})
    db.commit()
    return MemberView(user_id=user.id, email=user.email, role=payload.role)


@router.patch("/members/{user_id}", response_model=MemberView)
def change_role(project_id: UUID, user_id: UUID, payload: RoleChange,
                identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    project = one(db, project_id, identity)
    member = db.get(ProjectMember, (project_id, user_id))
    if member is None:
        raise HTTPException(404, "Miembro no encontrado.")
    permission_to_manage(db, project, identity, member.role, payload.role)
    previous = member.role
    member.role = payload.role
    audit_event(db, identity, project_id, "member.role_changed", user_id,
                {"previous_role": previous, "new_role": payload.role})
    db.commit()
    user = db.get(User, user_id)
    return MemberView(user_id=user_id, email=user.email if user else None, role=member.role)


@router.delete("/members/{user_id}", status_code=204)
def remove_member(project_id: UUID, user_id: UUID,
                  identity: Identity = Depends(current_user), db: Session = Depends(get_db)):
    project = one(db, project_id, identity)
    member = db.get(ProjectMember, (project_id, user_id))
    if member is None:
        raise HTTPException(404, "Miembro no encontrado.")
    permission_to_manage(db, project, identity, member.role)
    audit_event(db, identity, project_id, "member.removed", user_id, {"role": member.role})
    db.delete(member)
    db.commit()
    return Response(status_code=204)


@router.get("/audit", response_model=AuditPage)
def list_audit(project_id: UUID, limit: int = Query(20, ge=1, le=100),
               offset: int = Query(0, ge=0), identity: Identity = Depends(current_user),
               db: Session = Depends(get_db)):
    project = one(db, project_id, identity)
    require_roles(db, project, identity, "owner", "manager", "reviewer")
    base = select(AuditEvent).where(AuditEvent.project_id == project_id)
    total = db.scalar(select(func.count(AuditEvent.id)).where(AuditEvent.project_id == project_id)) or 0
    events = db.scalars(base.order_by(AuditEvent.created_at.desc(), AuditEvent.id.desc())
                        .offset(offset).limit(limit)).all()
    actors = {event.actor_id for event in events}
    emails = dict(db.execute(select(User.id, User.email).where(User.id.in_(actors))).all()) if actors else {}
    return AuditPage(total=total, items=[AuditView(
        id=event.id, actor_id=event.actor_id, actor_email=emails.get(event.actor_id),
        action=event.action, target_id=event.target_id,
        details=event.details_json, created_at=event.created_at,
    ) for event in events])


@router.get("/resources")
def resource_usage(project_id: UUID, identity: Identity = Depends(current_user),
                   db: Session = Depends(get_db)):
    project = one(db, project_id, identity)
    def count(model):
        return db.scalar(select(func.count(model.id)).where(model.project_id == project_id)) or 0
    members = db.scalar(select(func.count(ProjectMember.user_id)).where(
        ProjectMember.project_id == project_id)) or 0
    active_jobs = db.scalar(select(func.count(TrainingJob.id)).where(
        TrainingJob.project_id == project_id,
        TrainingJob.status.in_(("QUEUED", "PREPARING", "RUNNING")))) or 0
    return {
        "role": role_of(db, project, identity),
        "projects": {"limit": settings().max_projects_per_user,
                     "used": db.scalar(select(func.count(Project.id)).where(Project.owner_id == identity.id)) or 0},
        "members": {"used": members, "limit": settings().max_members_per_project},
        "datasets": {"used": count(DatasetRecord), "limit": settings().max_datasets_per_project},
        "architectures": {"used": count(ArchitectureRecord), "limit": settings().max_architectures_per_project},
        "active_training": {"used": active_jobs, "limit": 1},
    }
