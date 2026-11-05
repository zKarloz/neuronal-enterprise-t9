"""M10: probar permisos REALES en API, no solo botones ocultos en React."""
from types import SimpleNamespace
from uuid import uuid4, UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from app.api.training import _job_snapshot
from sqlalchemy.pool import StaticPool

from app.core.auth import Identity, current_user
from app.core.database import Base, get_db
from app.main import app


@pytest.fixture
def team():
    engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    identities = {key: Identity(uuid4(), f"{key}@example.org") for key in
                  ("owner", "manager", "engineer", "reviewer", "reader", "outsider")}
    state = {"identity": identities["owner"]}

    def session():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = session
    app.dependency_overrides[current_user] = lambda: state["identity"]
    with TestClient(app) as client:
        for key, identity in identities.items():
            state["identity"] = identity
            registered = client.post("/api/v1/me/register")
            assert registered.status_code == 200, (key, registered.text)
        state["identity"] = identities["owner"]
        project = client.post("/api/v1/projects", json={"name": "Seguridad compartida"})
        assert project.status_code == 201
        pid = project.json()["id"]
        base = f"/api/v1/projects/{pid}/administration"
        for role in ("manager", "engineer", "reviewer", "reader"):
            created = client.post(f"{base}/members", json={"email": f"{role}@example.org", "role": role})
            assert created.status_code == 201, created.text
        yield client, state, identities, pid, base
    app.dependency_overrides.clear()
    engine.dispose()


def test_role_visibility_and_isolation(team):
    client, state, identities, pid, base = team
    state["identity"] = identities["reader"]
    access = client.get(f"{base}/access")
    assert access.status_code == 200
    assert access.json()["current_role"] == "reader"
    assert len(access.json()["members"]) == 5
    assert client.get(f"/api/v1/projects/{pid}").status_code == 200
    assert client.patch(f"/api/v1/projects/{pid}", json={"name": "No permitido"}).status_code == 403
    assert client.post(f"/api/v1/projects/{pid}/architectures", json={"name": "Nueva", "layers":[{"units": 8,"activation":"relu"}]}).status_code == 403
    # Petición estructuralmente válida: debe fallar por RBAC, no por 422.
    assert client.post(f"/api/v1/projects/{pid}/training-jobs", json={
        "architecture_id":str(uuid4()), "dataset_id":str(uuid4())}).status_code == 403
    assert client.patch(f"/api/v1/projects/{pid}/models/{uuid4()}", json={"name":"Hack"}).status_code == 403
    assert client.get(f"{base}/audit").status_code == 403
    assert client.post(f"{base}/members", json={"email":"outsider@example.org","role":"reader"}).status_code == 403
    state["identity"] = identities["outsider"]
    assert client.get(f"{base}/access").status_code == 404
    assert client.get(f"{base}/resources").status_code == 404
    assert client.get(f"{base}/audit").status_code == 404


def test_engineer_can_create_architecture_but_cannot_manage_project(team):
    client, state, identities, pid, base = team
    state["identity"] = identities["engineer"]
    created = client.post(f"/api/v1/projects/{pid}/architectures", json={
        "name":"Capa de prueba","layers":[{"units":8,"activation":"relu"}]})
    assert created.status_code == 201, created.text
    assert client.patch(f"/api/v1/projects/{pid}", json={"description":"No"}).status_code == 403
    assert client.post(f"{base}/members", json={"email":"outsider@example.org","role":"reader"}).status_code == 403
    assert client.get(f"{base}/audit").status_code == 403
    # Un ingeniero edita nombre/notas de modelos, pero no puede aprobarlos.
    assert client.patch(f"/api/v1/projects/{pid}/models/{uuid4()}",
                        json={"stage":"production"}).status_code == 403
    assert client.patch(f"/api/v1/projects/{pid}/models/{uuid4()}",
                        json={"name":"Nueva versión"}).status_code == 404
    state["identity"] = identities["reviewer"]
    assert client.post(f"/api/v1/projects/{pid}/architectures", json={
        "name":"No permitido", "layers":[{"units":8,"activation":"relu"}]}).status_code == 403
    assert client.patch(f"/api/v1/projects/{pid}/models/{uuid4()}",
                        json={"stage":"production"}).status_code == 404


def test_manager_cannot_grant_manager_or_change_manager(team):
    client, state, identities, pid, base = team
    state["identity"] = identities["manager"]
    assert client.post(f"{base}/members", json={
        "email":"outsider@example.org","role":"manager"}).status_code == 403
    assert client.patch(f"{base}/members/{identities['engineer'].id}", json={"role":"manager"}).status_code == 403
    assert client.patch(f"{base}/members/{identities['manager'].id}", json={"role":"reader"}).status_code == 403
    changed = client.patch(f"{base}/members/{identities['engineer'].id}", json={"role":"reader"})
    assert changed.status_code == 200
    assert changed.json()["role"] == "reader"
    assert client.delete(f"{base}/members/{identities['reviewer'].id}").status_code == 204
    state["identity"] = identities["reviewer"]
    assert client.get(f"/api/v1/projects/{pid}").status_code == 404


def test_owner_can_manage_roles_and_audit_is_paginated(team):
    client, state, identities, _, base = team
    state["identity"] = identities["owner"]
    created = client.post(f"{base}/members", json={"email":"outsider@example.org","role":"manager"})
    assert created.status_code == 201
    changed = client.patch(f"{base}/members/{identities['outsider'].id}", json={"role":"reviewer"})
    assert changed.status_code == 200
    result = client.get(f"{base}/audit?limit=2&offset=0")
    assert result.status_code == 200
    assert result.json()["total"] >= 6
    assert len(result.json()["items"]) == 2
    assert result.json()["items"][0]["action"] == "member.role_changed"
    assert result.json()["items"][0]["details"] == {"previous_role":"manager","new_role":"reviewer"}
    assert "token" not in result.text.lower()
    assert client.get(f"{base}/audit?limit=101").status_code == 422
    state["identity"] = identities["reviewer"]
    assert client.get(f"{base}/audit").status_code == 200


def test_missing_email_registration_and_validation(team):
    client, state, identities, _, base = team
    state["identity"] = identities["owner"]
    assert client.post(f"{base}/members", json={"email":"missing@example.org","role":"reader"}).status_code == 404
    assert client.post(f"{base}/members", json={"email":"outsider@example.org","role":"owner"}).status_code == 422
    assert client.post(f"{base}/members", json={"email":"owner@example.org","role":"reader"}).status_code == 409
    assert client.post(f"{base}/members", json={"email":"reader@example.org","role":"reader"}).status_code == 409


def test_resource_usage_is_real_not_fabricated(team):
    client, state, identities, _, base = team
    state["identity"] = identities["reader"]
    result = client.get(f"{base}/resources")
    assert result.status_code == 200
    counts = result.json()
    assert counts["members"]["used"] == 4
    assert counts["active_training"]["used"] == 0
    assert counts["datasets"]["used"] == 0
    assert counts["architectures"]["used"] == 0
    assert counts["role"] == "reader"


def test_member_quota_is_enforced_before_insert(team, monkeypatch):
    client, state, identities, _, base = team
    monkeypatch.setattr("app.api.administration.settings", lambda: SimpleNamespace(max_members_per_project=4))
    state["identity"] = identities["owner"]
    response = client.post(f"{base}/members", json={"email":"outsider@example.org","role":"reader"})
    assert response.status_code == 409
    assert "límite" in response.json()["detail"].lower()


def test_project_and_architecture_quotas(team, monkeypatch):
    client, state, identities, pid, _ = team
    state["identity"] = identities["owner"]
    monkeypatch.setattr("app.api.projects.settings", lambda: SimpleNamespace(max_projects_per_user=1))
    assert client.post("/api/v1/projects", json={"name":"Otro proyecto"}).status_code == 409
    monkeypatch.setattr("app.api.training.settings", lambda: SimpleNamespace(max_architectures_per_project=0))
    assert client.post(f"/api/v1/projects/{pid}/architectures", json={
        "name":"Límite de arquitectura", "layers":[{"units":8,"activation":"relu"}]}).status_code == 409



def test_sse_snapshot_stops_after_access_is_revoked():
    # Esta función se ejecuta cada 2 s con sesiones nuevas en el stream SSE.
    from app.models.entities import Project, ProjectMember, TrainingJob, User
    engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    Base.metadata.create_all(engine)
    owner_id, reader_id, pid, job_id = uuid4(), uuid4(), uuid4(), uuid4()
    with Session(engine) as db:
        db.add_all([User(id=owner_id, email="owner@example.org"), User(id=reader_id, email="reader@example.org")])
        db.flush()
        db.add(Project(id=pid, owner_id=owner_id, name="SSE seguro", description=""))
        db.flush()
        db.add(ProjectMember(project_id=pid, user_id=reader_id, role="reader"))
        db.add(TrainingJob(id=job_id, project_id=pid, architecture_id=uuid4(), dataset_id=uuid4(),
                           epochs=2, batch_size=8, learning_rate=0.001, seed=42,
                           config_snapshot={}, preparation_snapshot={}, dataset_sha256="a" * 64))
        db.commit()
        assert _job_snapshot(engine, pid, job_id, reader_id) is not None
        assert _job_snapshot(engine, pid, job_id, owner_id) is not None
        member = db.get(ProjectMember, (pid, reader_id))
        db.delete(member)
        db.commit()
        assert _job_snapshot(engine, pid, job_id, reader_id) is None
        assert _job_snapshot(engine, pid, job_id, owner_id) is not None
    engine.dispose()
