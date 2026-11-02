"""Regresión: proyectos y propietarios respetan las claves foráneas reales.

SQLite desactiva FOREIGN KEY por defecto; estas pruebas lo activan
para detectar errores de orden de inserción que PostgreSQL sí rechaza.
"""
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.auth import Identity, current_user
from app.core.database import Base, get_db
from app.main import app
from app.models.entities import AuditEvent, Project, User


@pytest.fixture
def client_with_fk():
    engine = create_engine(
        "sqlite+pysqlite://",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )

    @event.listens_for(engine, "connect")
    def enable_foreign_keys(connection, _):
        # Reproducir las restricciones referenciales de PostgreSQL.
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    holder = {"identity": Identity(uuid4(), "primera@example.org")}

    def db_override():
        with Session(engine) as session:
            yield session

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[current_user] = lambda: holder["identity"]
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            yield client, holder, engine
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


def test_crear_primer_proyecto_crea_usuario_antes(client_with_fk):
    client, holder, engine = client_with_fk
    response = client.post("/api/v1/projects", json={"name": "Primer proyecto"})
    assert response.status_code == 201, response.text
    assert response.json()["owner_id"] == str(holder["identity"].id)

    with Session(engine) as db:
        assert db.get(User, holder["identity"].id) is not None
        assert db.scalar(select(func.count()).select_from(Project)) == 1
        assert db.scalar(select(func.count()).select_from(AuditEvent)) == 1


def test_varios_proyectos_del_mismo_usuario_no_duplican_usuario(client_with_fk):
    client, holder, engine = client_with_fk
    assert client.post("/api/v1/projects", json={"name": "Primer proyecto"}).status_code == 201
    assert client.post("/api/v1/projects", json={"name": "Segundo proyecto"}).status_code == 201
    with Session(engine) as db:
        assert db.scalar(select(func.count()).select_from(User)) == 1
        assert db.scalar(select(func.count()).select_from(Project)) == 2
