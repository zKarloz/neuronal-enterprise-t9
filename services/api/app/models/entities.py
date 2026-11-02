"""Entidades SQL versionadas, sin datos de ejemplo precargados."""
from datetime import datetime, timezone
from uuid import UUID, uuid4
from sqlalchemy import DateTime, ForeignKey, String, Text, Uuid
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database import Base
def clock(): return datetime.now(timezone.utc)
class User(Base):
    __tablename__ = "users"
    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True)
    email: Mapped[str | None] = mapped_column(String(320), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=clock)
class Project(Base):
    __tablename__ = "projects"
    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    owner_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), index=True)
    name: Mapped[str] = mapped_column(String(80))
    description: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(20), default="active")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=clock)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=clock, onupdate=clock)
class ProjectMember(Base):
    __tablename__ = "project_members"
    project_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), primary_key=True)
    user_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"), primary_key=True)
    role: Mapped[str] = mapped_column(String(24))
class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    actor_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("users.id"))
    project_id: Mapped[UUID | None] = mapped_column(Uuid(as_uuid=True), nullable=True)
    action: Mapped[str] = mapped_column(String(80))
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=clock)

# Los datos pesados permanecen en Supabase Storage; PostgreSQL solo guarda metadatos.
from sqlalchemy import JSON, Integer, BigInteger, UniqueConstraint

class DatasetRecord(Base):
    __tablename__ = "datasets"
    __table_args__ = (UniqueConstraint("project_id", "name", "version", name="uq_dataset_project_name_version"),)
    id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), primary_key=True, default=uuid4)
    project_id: Mapped[UUID] = mapped_column(Uuid(as_uuid=True), ForeignKey("projects.id", ondelete="CASCADE"), index=True)
    name: Mapped[str] = mapped_column(String(180))
    version: Mapped[int] = mapped_column(Integer, default=1)
    storage_key: Mapped[str] = mapped_column(String(200), unique=True)
    sha256: Mapped[str] = mapped_column(String(64))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    row_count: Mapped[int] = mapped_column(Integer)
    column_count: Mapped[int] = mapped_column(Integer)
    columns_json: Mapped[list] = mapped_column(JSON)
    preview_json: Mapped[list] = mapped_column(JSON)
    prep_json: Mapped[dict | None] = mapped_column(JSON, nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=clock)
