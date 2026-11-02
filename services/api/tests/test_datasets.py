"""Pruebas de M05 real: Storage simulado, metadatos SQL con FK activas."""
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.auth import Identity, current_user
from app.core.database import Base, get_db
from app.main import app
from app.models.entities import DatasetRecord
from app.services.csv_pipeline import CSVValidationError, inspect_csv, prepare_csv
from app.services.storage import get_storage


class InMemoryPrivateStorage:
    """No guarda datos ficticios: persiste exclusivamente archivos subidos en cada prueba."""
    def __init__(self):
        self.objects = {}

    async def upload(self, key, content):
        assert key not in self.objects
        self.objects[key] = content

    async def read(self, key):
        return self.objects[key]

    async def delete(self, key):
        del self.objects[key]


@pytest.fixture
def lab():
    engine = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)

    @event.listens_for(engine, "connect")
    def foreign_keys(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")

    Base.metadata.create_all(engine)
    state = {"identity": Identity(uuid4(), "test@example.org")}
    storage = InMemoryPrivateStorage()

    def db_override():
        with Session(engine) as db:
            yield db

    app.dependency_overrides[get_db] = db_override
    app.dependency_overrides[current_user] = lambda: state["identity"]
    app.dependency_overrides[get_storage] = lambda: storage
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            yield client, state, storage, engine
    finally:
        app.dependency_overrides.clear()
        engine.dispose()


CSV = b"age,city,approved\n20,Lima,yes\n21,Cusco,no\n22,Lima,yes\n23,,no\n24,Cusco,yes\n25,Lima,no\n26,Cusco,yes\n27,Lima,no\n28,Lima,yes\n29,Cusco,no\n"


def create_project(client):
    response = client.post("/api/v1/projects", json={"name": "Experimento remoto"})
    assert response.status_code == 201, response.text
    return response.json()["id"]


def upload(client, project, payload=CSV, name="clientes.csv"):
    return client.post(f"/api/v1/projects/{project}/datasets", files={"file": (name, payload, "text/csv")})


def test_import_preview_versions_download_and_delete(lab):
    client, state, storage, engine = lab
    project = create_project(client)
    first = upload(client, project)
    assert first.status_code == 201, first.text
    dataset = first.json()
    assert dataset["name"] == "clientes.csv" and dataset["row_count"] == 10
    assert dataset["columns_json"][0]["type"] == "number"
    assert dataset["columns_json"][1]["type"] == "text"
    assert dataset["columns_json"][1]["null_count"] == 1
    assert dataset["preview_json"][0] == ["20", "Lima", "yes"]
    second = upload(client, project)
    assert second.status_code == 201 and second.json()["version"] == 2
    assert len(client.get(f"/api/v1/projects/{project}/datasets").json()) == 2
    downloaded = client.get(f"/api/v1/projects/{project}/datasets/{dataset['id']}/download")
    assert downloaded.content == CSV and downloaded.headers["cache-control"] == "private, no-store"
    assert client.delete(f"/api/v1/projects/{project}/datasets/{dataset['id']}").status_code == 204
    assert len(storage.objects) == 1
    with Session(engine) as db:
        assert len(db.scalars(select(DatasetRecord)).all()) == 1


def test_isolation_other_project_and_missing_auth(lab):
    client, state, storage, _ = lab
    project = create_project(client)
    dataset = upload(client, project).json()
    state["identity"] = Identity(uuid4(), "intruder@example.org")
    assert client.get(f"/api/v1/projects/{project}/datasets").status_code == 404
    assert client.get(f"/api/v1/projects/{project}/datasets/{dataset['id']}").status_code == 404
    assert client.get(f"/api/v1/projects/{project}/datasets/{dataset['id']}/download").status_code == 404
    assert client.post(f"/api/v1/projects/{project}/datasets/{dataset['id']}/prepare", json={
        "target_column": "approved", "task": "classification"}).status_code == 404
    assert client.delete(f"/api/v1/projects/{project}/datasets/{dataset['id']}").status_code == 404
    assert len(storage.objects) == 1


def test_prepare_reproducible_train_only_and_saved(lab):
    client, _, _, _ = lab
    project = create_project(client)
    dataset = upload(client, project).json()
    path = f"/api/v1/projects/{project}/datasets/{dataset['id']}/prepare"
    parameters = {"target_column": "approved", "task": "classification", "seed": 12}
    response = client.post(path, json=parameters)
    assert response.status_code == 200, response.text
    prepared = response.json()["prep_json"]
    assert prepared["task"] == "classification"
    assert prepared["split"]["train"] + prepared["split"]["validation"] + prepared["split"]["test"] == 10
    assert prepared["classes"] == ["no", "yes"]
    assert prepared["input_dimensions"] >= 2
    assert prepared["indices"]["train"] == client.post(path, json=parameters).json()["prep_json"]["indices"]["train"]
    assert prepared["features"][0]["mean"] == pytest.approx(
        sum(20 + i for i in prepared["indices"]["train"]) / prepared["split"]["train"])
    assert client.get(f"/api/v1/projects/{project}/datasets/{dataset['id']}").json()["prep_json"] == prepared


def test_reject_invalid_files_and_targets(lab):
    client, _, storage, _ = lab
    project = create_project(client)
    assert upload(client, project, b"x,y\n1,2\n3\n", "bad.csv").status_code == 422
    assert upload(client, project, b"x,x\n1,2\n2,3\n3,4\n").status_code == 422
    assert upload(client, project, b"\xff\xfe", "bad.csv").status_code == 422
    assert upload(client, project, CSV, "../danger.csv").status_code == 201  # Sanitiza path, no escritura en filesystem.
    assert upload(client, project, CSV, "evil.py").status_code == 422
    assert len(storage.objects) == 1
    dataset = client.get(f"/api/v1/projects/{project}/datasets").json()[0]
    assert client.post(f"/api/v1/projects/{project}/datasets/{dataset['id']}/prepare", json={
        "target_column": "missing", "task": "regression"}).status_code == 422


def test_preprocessing_reject_non_numeric_regression_and_fit_only_train():
    with pytest.raises(CSVValidationError):
        prepare_csv(CSV, "approved", "regression", 0.15, 0.15, 42)
    processed = prepare_csv(CSV, "age", "regression", 0.2, 0.2, 19)
    assert processed["classes"] is None
    assert "age" not in [feature["name"] for feature in processed["features"]]
    assert processed["split"]["dropped_missing_target"] == 0


def test_no_leakage_when_validation_contains_outlier():
    raw = b"value,label\n1,ok\n2,ok\n3,ok\n4,ok\n5,ok\n6,other\n7,other\n8,other\n100000,other\n9,other\n"
    metadata = prepare_csv(raw, "label", "classification", 0.2, 0.2, 5)
    train = metadata["indices"]["train"]
    values = [1, 2, 3, 4, 5, 6, 7, 8, 100000, 9]
    expected = sum(values[i] for i in train) / len(train)
    assert metadata["features"][0]["mean"] == pytest.approx(expected)


def test_project_cannot_be_removed_with_private_datasets(lab):
    client, _, storage, engine = lab
    project = create_project(client)
    assert upload(client, project).status_code == 201
    assert storage.objects
    response = client.delete(f"/api/v1/projects/{project}")
    assert response.status_code == 409, response.text
    assert len(storage.objects) == 1
    with Session(engine) as db:
        assert len(db.scalars(select(DatasetRecord)).all()) == 1


def test_storage_accepts_new_secret_key_without_fake_bearer(monkeypatch):
    from types import SimpleNamespace
    from app.services.storage import PrivateStorage
    monkeypatch.setattr("app.services.storage.settings", lambda: SimpleNamespace(
        supabase_url="https://example.supabase.co", supabase_secret_key="sb_secret_sample",
        supabase_service_role_key="", dataset_bucket="neurolab-datasets"))
    storage = PrivateStorage()
    assert storage.headers == {"apikey": "sb_secret_sample"}
    assert storage.url("abc/file.csv").endswith("/neurolab-datasets/abc/file.csv")


def test_storage_accepts_legacy_service_role_jwt(monkeypatch):
    from types import SimpleNamespace
    from app.services.storage import PrivateStorage
    monkeypatch.setattr("app.services.storage.settings", lambda: SimpleNamespace(
        supabase_url="https://example.supabase.co", supabase_secret_key="",
        supabase_service_role_key="legacy-jwt", dataset_bucket="neurolab-datasets"))
    assert PrivateStorage().headers["Authorization"] == "Bearer legacy-jwt"
