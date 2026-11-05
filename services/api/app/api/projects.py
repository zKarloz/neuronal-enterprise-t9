"""M02 remoto: CRUD real, controles de propiedad y eventos de auditoría."""
from datetime import datetime, timezone
from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException, Response
from pydantic import BaseModel, Field, ConfigDict, field_validator
from sqlalchemy import select, exists, or_, func
from sqlalchemy.orm import Session
from app.core.auth import current_user, Identity
from app.core.database import get_db
from app.models.entities import User, Project, ProjectMember, AuditEvent, DatasetRecord, TrainingJob, ArchitectureRecord
from app.core.config import settings
router=APIRouter(prefix="/projects", tags=["projects"])
class ProjectCreate(BaseModel):
    name: str=Field(min_length=3,max_length=80)
    description: str=Field(default="",max_length=600)
    @field_validator("name")
    @classmethod
    def trimmed(cls, value):
        value=value.strip()
        if not 3 <= len(value) <= 80: raise ValueError("Nombre inválido")
        return value
class ProjectPatch(BaseModel):
    name: str | None=Field(default=None,min_length=3,max_length=80)
    description: str | None=Field(default=None,max_length=600)
    status: str | None=Field(default=None,pattern="^(active|archived)$")
    @field_validator("name")
    @classmethod
    def trimmed(cls, value):
        if value is not None and len(value.strip()) < 3: raise ValueError("Nombre inválido")
        return value.strip() if value else value
class ProjectView(BaseModel):
    model_config=ConfigDict(from_attributes=True)
    id: UUID
    owner_id: UUID
    name: str
    description: str
    status: str
    created_at: datetime
    updated_at: datetime
def permitted(db, uid):
    return or_(Project.owner_id==uid, exists(select(ProjectMember.project_id).where(ProjectMember.project_id==Project.id,ProjectMember.user_id==uid)))
def one(db, pid, identity):
    project=db.scalar(select(Project).where(Project.id==pid,permitted(db, identity.id)))
    if project is None: raise HTTPException(404,"Proyecto no encontrado.")
    return project
# Matriz de permisos: la propiedad se deriva de projects.owner_id (nunca del cliente).
PROJECT_ROLES = ("owner", "manager", "engineer", "reviewer", "reader")


def role_of(db: Session, project: Project, identity: Identity) -> str | None:
    if project.owner_id == identity.id:
        return "owner"
    return db.scalar(select(ProjectMember.role).where(
        ProjectMember.project_id == project.id, ProjectMember.user_id == identity.id))


def require_roles(db: Session, project: Project, identity: Identity, *allowed: str) -> str:
    role = role_of(db, project, identity)
    if role not in allowed:
        raise HTTPException(403, "No tienes permisos para esta operación.")
    return role


def editor(db: Session, project: Project, identity: Identity) -> bool:
    """Modificar recursos de IA; NO implica poder editar el proyecto ni gestionar miembros."""
    return role_of(db, project, identity) in ("owner", "manager", "engineer")

@router.get("",response_model=list[ProjectView])
def list_projects(identity: Identity=Depends(current_user),db: Session=Depends(get_db)):
    return db.scalars(select(Project).where(permitted(db,identity.id)).order_by(Project.created_at.desc())).all()
@router.post("",response_model=ProjectView,status_code=201)
def create(payload: ProjectCreate, identity: Identity=Depends(current_user),db: Session=Depends(get_db)):
    # La tabla de usuarios de la aplicación es distinta de auth.users en Supabase.
    # Insertar y confirmar el orden con flush antes de crear un proyecto que
    # referencia a users.id mediante una clave foránea (sin cerrar la transacción).
    if db.get(User, identity.id) is None:
        db.add(User(id=identity.id, email=identity.email))
        db.flush()

    # Serializar la cuota de proyectos por cuenta en PostgreSQL.
    if db.bind.dialect.name == "postgresql":
        db.execute(select(User.id).where(User.id == identity.id).with_for_update()).first()
    used = db.scalar(select(func.count(Project.id)).where(Project.owner_id == identity.id)) or 0
    if used >= settings().max_projects_per_user:
        raise HTTPException(409, "Has alcanzado el límite de proyectos de tu cuenta.")
    item=Project(owner_id=identity.id,name=payload.name,description=payload.description.strip())
    db.add(item);db.flush()
    db.add(AuditEvent(actor_id=identity.id,project_id=item.id,action="project.created"));db.commit();db.refresh(item)
    return item
@router.get("/{pid}",response_model=ProjectView)
def get(pid:UUID,identity:Identity=Depends(current_user),db:Session=Depends(get_db)): return one(db,pid,identity)
@router.patch("/{pid}",response_model=ProjectView)
def edit(pid:UUID,payload:ProjectPatch,identity:Identity=Depends(current_user),db:Session=Depends(get_db)):
    item=one(db,pid,identity)
    require_roles(db,item,identity,"owner","manager")
    for k,v in payload.model_dump(exclude_unset=True).items():
        if v is not None: setattr(item,k,v)
    item.updated_at=datetime.now(timezone.utc)
    db.add(AuditEvent(actor_id=identity.id,project_id=item.id,action="project.updated"));db.commit();db.refresh(item)
    return item
@router.delete("/{pid}",status_code=204)
def delete(pid:UUID,identity:Identity=Depends(current_user),db:Session=Depends(get_db)):
    item=one(db,pid,identity)
    if item.owner_id!=identity.id: raise HTTPException(403,"Solo propietario")
    # Impedir borrados parciales: cada archivo debe eliminarse explícitamente
    # desde M05 antes de eliminar su proyecto (evita objetos privados huérfanos).
    if db.scalar(select(DatasetRecord.id).where(DatasetRecord.project_id == pid).limit(1)):
        raise HTTPException(409, "Elimina primero los datasets remotos del proyecto.")
    if db.scalar(select(TrainingJob.id).where(TrainingJob.project_id == pid).limit(1)):
        raise HTTPException(409, "El proyecto tiene entrenamientos registrados; archívalo en lugar de eliminarlo.")
    db.add(AuditEvent(actor_id=identity.id,project_id=None,action="project.deleted"))
    db.delete(item);db.commit()
    return Response(status_code=204)
