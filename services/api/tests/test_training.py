"""M04/M06: pruebas de permisos, FK, transiciones y preprocesamiento sin fuga."""
from uuid import uuid4, UUID

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, event, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.core.auth import Identity, current_user
from app.services.storage import get_storage
from app.core.database import Base, get_db
from app.main import app
from app.models.entities import TrainingJob, TrainingMetric, ModelVersion
from app.services.csv_pipeline import prepare_csv
from workers.training.engine import encode_partition, claim, finish, record_epoch


RAW = (b"edad,ciudad,resultado\n" + b"\n".join(
    f"{20 + i},{'Lima' if i % 2 else 'Cusco'},{'si' if i % 2 else 'no'}".encode()
    for i in range(16)) + b"\n")


@pytest.fixture
def lab():
    eng = create_engine("sqlite+pysqlite://", connect_args={"check_same_thread": False}, poolclass=StaticPool)
    @event.listens_for(eng, "connect")
    def fk(connection, _):
        connection.execute("PRAGMA foreign_keys=ON")
    Base.metadata.create_all(eng)
    state = {"identity": Identity(uuid4(), "owner@example.org")}

    def db():
        with Session(eng) as session:
            yield session
    class UnusedStorage:
        async def delete(self, _key):
            raise AssertionError("El dataset referenciado no debe llegar a Storage.")
    app.dependency_overrides[get_storage] = lambda: UnusedStorage()
    app.dependency_overrides[get_db] = db
    app.dependency_overrides[current_user] = lambda: state["identity"]
    try:
        with TestClient(app, raise_server_exceptions=False) as client:
            yield client, eng, state
    finally:
        app.dependency_overrides.clear()
        eng.dispose()


def setup(lab):
    client, eng, _ = lab
    project = client.post("/api/v1/projects", json={"name": "Analítica de clientes"})
    assert project.status_code == 201, project.text
    pid = project.json()["id"]
    arch = client.post(f"/api/v1/projects/{pid}/architectures", json={
        "name": "Densa básica", "layers": [{"units": 12, "activation": "relu"}]})
    assert arch.status_code == 201, arch.text
    # Archivo real de prueba: filas usadas en preparación sin resultados inventados.
    from app.models.entities import DatasetRecord
    import hashlib
    from uuid import uuid4
    prep = prepare_csv(RAW, "resultado", "classification", 0.2, 0.2, 42)
    with Session(eng) as db:
        dataset = DatasetRecord(project_id=UUID(pid), name="clientes.csv", version=1,
            storage_key=f"{pid}/{uuid4()}.csv", sha256=hashlib.sha256(RAW).hexdigest(),
            size_bytes=len(RAW), row_count=16, column_count=3,
            columns_json=[], preview_json=[], prep_json=prep)
        db.add(dataset)
        db.commit()
        dataset_id = str(dataset.id)
    return pid, arch.json()["id"], dataset_id


def submit(client, pid, aid, did, **overrides):
    return client.post(f"/api/v1/projects/{pid}/training-jobs", json={
        "architecture_id": aid, "dataset_id": did,
        "epochs": 3, "batch_size": 8, "learning_rate": 0.001, **overrides,
    })


def test_create_architecture_version_and_job_snapshot(lab):
    client, eng, _ = lab
    pid, aid, did = setup(lab)
    newer = client.post(f"/api/v1/projects/{pid}/architectures", json={
        "name": "Densa básica", "layers": [{"units": 20, "activation": "tanh"}]})
    assert newer.status_code == 201 and newer.json()["version"] == 2
    response = submit(client, pid, aid, did)
    assert response.status_code == 202, response.text
    job = response.json()
    assert job["status"] == "QUEUED" and job["progress"] == 0 and job["epoch"] == 0
    with Session(eng) as db:
        record = db.get(TrainingJob, UUID(job["id"]))
        assert record.config_snapshot["layers"][0]["units"] == 12
        assert record.preparation_snapshot["split"]["train"] > 0
        assert record.dataset_sha256
    assert submit(client, pid, aid, did).status_code == 409
    assert client.get(f"/api/v1/projects/{pid}/training-jobs/{job['id']}").status_code == 200
    assert client.get(f"/api/v1/projects/{pid}/training-jobs/{job['id']}/metrics").json() == []


def test_invalid_layers_and_unprepared_dataset(lab):
    client, eng, _ = lab
    pid, aid, did = setup(lab)
    route = f"/api/v1/projects/{pid}/architectures"
    assert client.post(route, json={"name": "Mal", "layers": [{"units": 0, "activation": "relu"}]}).status_code == 422
    assert client.post(route, json={"name": "Correcto", "layers": [{"units": 8, "activation": "lambda"}]}).status_code == 422
    assert submit(client, pid, aid, str(uuid4())).status_code == 422
    with Session(eng) as db:
        from app.models.entities import DatasetRecord
        item = db.get(DatasetRecord, UUID(did))
        item.prep_json = None
        db.commit()
    assert submit(client, pid, aid, did).status_code == 422


def test_cancel_queued_and_requeue(lab):
    client, eng, _ = lab
    pid, aid, did = setup(lab)
    job = submit(client, pid, aid, did).json()
    stopped = client.post(f"/api/v1/projects/{pid}/training-jobs/{job['id']}/cancel")
    assert stopped.status_code == 200 and stopped.json()["status"] == "CANCELLED"
    assert submit(client, pid, aid, did).status_code == 202
    assert client.post(f"/api/v1/projects/{pid}/training-jobs/{job['id']}/cancel").status_code == 409


def test_permission_isolation_for_jobs_and_models(lab):
    client, _, state = lab
    pid, aid, did = setup(lab)
    job = submit(client, pid, aid, did).json()
    state["identity"] = Identity(uuid4(), "stranger@example.org")
    assert client.get(f"/api/v1/projects/{pid}/training-jobs").status_code == 404
    assert client.get(f"/api/v1/projects/{pid}/training-jobs/{job['id']}").status_code == 404
    assert client.get(f"/api/v1/projects/{pid}/training-jobs/{job['id']}/metrics").status_code == 404
    assert client.post(f"/api/v1/projects/{pid}/training-jobs/{job['id']}/cancel").status_code == 404
    assert client.get(f"/api/v1/projects/{pid}/models").status_code == 404
    assert client.post(f"/api/v1/projects/{pid}/architectures", json={
        "name": "Intruso", "layers": [{"units": 8, "activation": "relu"}]}).status_code == 404


def test_preprocessing_uses_real_rows_and_train_only_statistics():
    prep = prepare_csv(RAW, "resultado", "classification", 0.2, 0.2, 42)
    (train, ty), (validation, vy), (test, ey) = encode_partition(RAW, prep)
    assert len(train) == prep["split"]["train"]
    assert len(validation) == prep["split"]["validation"]
    assert len(test) == prep["split"]["test"]
    assert train.shape[1] == prep["input_dimensions"]
    assert set(ty.tolist()) == {0, 1}
    assert abs(float(train[:, 0].mean())) < 0.00001  # Escalador de train aplicado a train.
    assert set(prep["indices"]["train"]).isdisjoint(prep["indices"]["validation"])
    assert set(prep["indices"]["train"]).isdisjoint(prep["indices"]["test"])


def test_prevent_deleting_referenced_dataset_and_project(lab):
    client, _, _ = lab
    pid, aid, did = setup(lab)
    assert submit(client, pid, aid, did).status_code == 202
    assert client.delete(f"/api/v1/projects/{pid}").status_code == 409
    assert client.delete(f"/api/v1/projects/{pid}/datasets/{did}").status_code == 409


def test_worker_claim_and_epoch_metrics_with_foreign_keys(lab, monkeypatch):
    """La cola y las métricas se persisten con FK activas, sin simular cifras de Keras."""
    client, eng, _ = lab
    pid, aid, did = setup(lab)
    job = submit(client, pid, aid, did).json()
    from workers.training import engine as worker
    monkeypatch.setattr(worker, "engine", lambda url: eng)
    with Session(eng) as db:
        found = claim(db)
        assert found == UUID(job["id"])
        assert db.get(TrainingJob, found).status == "PREPARING"
        assert claim(db) is None
        record = db.get(TrainingJob, found)
        record.status = "RUNNING"
        db.commit()
    # Se emplean valores de prueba para validar el almacenamiento de la API,
    # NO se presentan como métricas de un entrenamiento real.
    record_epoch("test", found, 1, {"loss": 0.7, "val_loss": 0.8, "accuracy": 0.6, "val_accuracy": 0.55}, 3)
    result = client.get(f"/api/v1/projects/{pid}/training-jobs/{found}/metrics")
    assert result.status_code == 200 and len(result.json()) == 1
    assert result.json()[0]["val_loss"] == 0.8
    assert client.get(f"/api/v1/projects/{pid}/training-jobs/{found}").json()["progress"] == 33
    finish("test", found, "COMPLETED")
    assert client.get(f"/api/v1/projects/{pid}/training-jobs/{found}").json()["progress"] == 100


def test_running_cancel_is_cooperative(lab):
    client, eng, _ = lab
    pid, aid, did = setup(lab)
    job = submit(client, pid, aid, did).json()
    with Session(eng) as db:
        item = db.get(TrainingJob, UUID(job["id"]))
        item.status = "RUNNING"
        db.commit()
    response = client.post(f"/api/v1/projects/{pid}/training-jobs/{job['id']}/cancel")
    assert response.status_code == 200
    assert response.json()["status"] == "RUNNING"  # El worker confirma el final.
    assert response.json()["cancel_requested"] is True

# V0.7: streams autenticados, reintento explícito y fencing de trabajos abandonados.
def test_retry_keeps_history_and_snapshots(lab):
    client, eng, _ = lab
    pid, aid, did = setup(lab)
    original = submit(client, pid, aid, did).json()
    url = f"/api/v1/projects/{pid}/training-jobs/{original['id']}"
    assert client.post(f"{url}/retry").status_code == 409  # No reintentar un trabajo activo.
    assert client.post(f"{url}/cancel").status_code == 200
    response = client.post(f"{url}/retry")
    assert response.status_code == 202, response.text
    retry = response.json()
    assert retry["retry_of_job_id"] == original["id"]
    assert retry["id"] != original["id"] and retry["status"] == "QUEUED"
    with Session(eng) as db:
        old = db.get(TrainingJob, UUID(original["id"]))
        new = db.get(TrainingJob, UUID(retry["id"]))
        assert old.status == "CANCELLED"
        assert new.preparation_snapshot == old.preparation_snapshot
        assert new.config_snapshot == old.config_snapshot
        assert new.dataset_sha256 == old.dataset_sha256
    assert client.post(f"{url}/retry").status_code == 409  # Un solo job activo.


def test_recovery_invalidates_late_worker_and_allows_retry(lab, monkeypatch):
    from datetime import timedelta, datetime, timezone
    from workers.training import engine as worker
    client, eng, _ = lab
    pid, aid, did = setup(lab)
    job = submit(client, pid, aid, did).json()
    monkeypatch.setattr(worker, "engine", lambda _url: eng)
    with Session(eng) as db:
        job_id = worker.claim(db)
        assert job_id == UUID(job["id"])
        token = db.get(TrainingJob, job_id).worker_token
        assert token
        assert worker.recover_stale(db) == 0  # Un worker vivo no se interrumpe.
        old = db.get(TrainingJob, job_id)
        old.status = "RUNNING"
        old.heartbeat_at = datetime.now(timezone.utc) - timedelta(minutes=15)
        db.commit()
        assert worker.recover_stale(db) == 1
        db.refresh(old)
        assert old.status == "FAILED" and old.worker_token is None
    with pytest.raises(ValueError):
        worker.record_epoch("test", job_id, 1, {"loss": 0.4, "val_loss": 0.5}, 3, token=token)
    worker.finish("test", job_id, "COMPLETED", token=token)
    with Session(eng) as db:
        assert db.get(TrainingJob, job_id).status == "FAILED"
    retry = client.post(f"/api/v1/projects/{pid}/training-jobs/{job_id}/retry")
    assert retry.status_code == 202 and retry.json()["retry_of_job_id"] == str(job_id)


def test_sse_emits_real_snapshot_and_rejects_other_users(lab):
    import json
    client, eng, state = lab
    pid, aid, did = setup(lab)
    job = submit(client, pid, aid, did).json()
    job_id = UUID(job["id"])
    with Session(eng) as db:
        record = db.get(TrainingJob, job_id)
        record.status = "FAILED"  # Finaliza para que el SSE sea de una sola respuesta.
        record.error_message = "Prueba de evento terminal."
        db.commit()
    url = f"/api/v1/projects/{pid}/training-jobs/{job_id}/events"
    response = client.get(url)
    assert response.status_code == 200 and response.headers["content-type"].startswith("text/event-stream")
    assert "event: snapshot" in response.text
    line = next(line[6:] for line in response.text.splitlines() if line.startswith("data: "))
    event = json.loads(line)
    assert event["job"]["status"] == "FAILED"
    assert event["job"]["id"] == str(job_id)
    assert event["metrics"] == [] and event["model"] is None
    assert "worker_token" not in line  # No revelar fencing ni credenciales.
    state["identity"] = Identity(uuid4(), "intruder@example.org")
    assert client.get(url).status_code == 404
    assert client.post(f"/api/v1/projects/{pid}/training-jobs/{job_id}/retry").status_code == 404

# v0.8: el modo opcional de Early Stopping se guarda también en los reintentos.
def test_early_stopping_validation_and_retry_snapshot(lab):
    client, eng, _ = lab
    pid, aid, did = setup(lab)
    assert submit(client, pid, aid, did, early_stopping_patience=11).status_code == 422
    assert submit(client, pid, aid, did, early_stopping_patience=-1).status_code == 422
    queued = submit(client, pid, aid, did, early_stopping_patience=3)
    assert queued.status_code == 202, queued.text
    jid = queued.json()["id"]
    assert queued.json()["early_stopping_patience"] == 3
    assert client.post(f"/api/v1/projects/{pid}/training-jobs/{jid}/cancel").status_code == 200
    retried = client.post(f"/api/v1/projects/{pid}/training-jobs/{jid}/retry")
    assert retried.status_code == 202
    assert retried.json()["early_stopping_patience"] == 3
    with Session(eng) as db:
        record = db.get(TrainingJob, UUID(retried.json()["id"]))
        assert record.early_stopping_patience == 3


def test_model_registry_metadata_production_and_authorization(lab):
    client, eng, state = lab
    pid, aid, did = setup(lab)
    first_job = submit(client, pid, aid, did).json()
    with Session(eng) as db:
        job = db.get(TrainingJob, UUID(first_job["id"]))
        job.status = "COMPLETED"
        db.add(ModelVersion(project_id=UUID(pid), job_id=job.id,
            storage_key=f"{pid}/{job.id}.keras", sha256="a" * 64,
            test_metrics={"loss": 0.5, "accuracy": 0.8}, best_epoch=2,
            epochs_trained=3, early_stopped=False, name="Modelo alfa"))
        db.commit()
    second_job = submit(client, pid, aid, did).json()
    with Session(eng) as db:
        job = db.get(TrainingJob, UUID(second_job["id"]))
        job.status = "COMPLETED"
        db.add(ModelVersion(project_id=UUID(pid), job_id=job.id,
            storage_key=f"{pid}/{job.id}.keras", sha256="b" * 64,
            test_metrics={"loss": 0.4, "accuracy": 0.9}, best_epoch=1,
            epochs_trained=2, early_stopped=True, name="Modelo beta"))
        db.commit()
    url = f"/api/v1/projects/{pid}/models"
    models = client.get(url).json()
    assert len(models) == 2
    ids = {m["name"]: m["id"] for m in models}
    first = ids["Modelo alfa"]
    second = ids["Modelo beta"]
    assert client.patch(f"{url}/{first}", json={"name": "  ", "stage": "production"}).status_code == 422
    assert client.patch(f"{url}/{first}", json={"stage": "unapproved"}).status_code == 422
    response = client.patch(f"{url}/{first}", json={"name": "Modelo publicado", "notes": "Prueba WDBC", "stage": "production"})
    assert response.status_code == 200, response.text
    assert response.json()["sha256"] == "a" * 64  # El artefacto no se sobrescribe.
    assert response.json()["best_epoch"] == 2
    other = client.patch(f"{url}/{second}", json={"stage": "production"})
    assert other.status_code == 200
    rows = client.get(url).json()
    assert sum(m["stage"] == "production" for m in rows) == 1
    assert next(m for m in rows if m["id"] == first)["stage"] == "candidate"
    assert client.patch(f"{url}/{uuid4()}", json={"stage": "archived"}).status_code == 404
    state["identity"] = Identity(uuid4(), "stranger@example.org")
    assert client.patch(f"{url}/{second}", json={"name": "No autorizado"}).status_code == 404


def test_public_reference_csvs_are_real_and_compatible():
    """Los archivos públicos se prueban sin usar red ni métricas inventadas."""
    from pathlib import Path
    import csv
    folder = Path(__file__).resolve().parents[3] / "samples" / "datasets"
    expected = {"iris_sklearn.csv": (150, 5, 3),
                "wine_sklearn.csv": (178, 14, 3),
                "breast_cancer_wisconsin_sklearn.csv": (569, 31, 2)}
    for filename, (rows, columns, classes) in expected.items():
        raw = (folder / filename).read_bytes()
        parsed = list(csv.DictReader(raw.decode("utf-8").splitlines()))
        assert len(parsed) == rows
        assert len(parsed[0]) == columns
        assert len({r["target"] for r in parsed}) == classes
        prep = prepare_csv(raw, "target", "classification", 0.15, 0.15, 42)
        partitions = encode_partition(raw, prep)
        assert sum(len(x) for x, _ in partitions) == rows

# v0.9: contrato CNN 8×8 sin dependencias TensorFlow en el servidor FastAPI.
def test_cnn_architecture_validations_and_backward_compatibility(lab):
    client, _, _ = lab
    pid, _, _ = setup(lab)
    url = f"/api/v1/projects/{pid}/architectures"
    good = {"name": "CNN dígitos", "family": "cnn_8x8", "conv_filters": 8,
            "kernel_size": 3, "dense_units": 16}
    result = client.post(url, json=good)
    assert result.status_code == 201, result.text
    assert result.json()["family"] == "cnn_8x8"
    assert result.json()["config_json"]["conv_filters"] == 8
    for wrong in (
        {**good, "conv_filters": 33},
        {**good, "kernel_size": 5},
        {**good, "layers": [{"units": 8, "activation": "relu"}]},
        {**good, "dense_units": 0},
        {**good, "family": "feedforward"},
    ):
        assert client.post(url, json=wrong).status_code == 422
    # Contratos ya publicados siguen admitiendo el payload antiguo sin family.
    old = client.post(url, json={"name": "Densa compatible", "layers": [{
        "units": 8, "activation": "relu"}]})
    assert old.status_code == 201
    assert old.json()["family"] == "feedforward"


def test_cnn_rejects_non_image_dataset(lab):
    client, _, _ = lab
    pid, _, tabular_id = setup(lab)
    result = client.post(f"/api/v1/projects/{pid}/architectures", json={
        "name": "CNN únicamente imágenes", "family": "cnn_8x8", "conv_filters": 8,
        "kernel_size": 3, "dense_units": 16})
    assert result.status_code == 201
    assert submit(client, pid, result.json()["id"], tabular_id).status_code == 422


def test_cnn_uci_real_csv_65_columns_and_queue(lab):
    from pathlib import Path
    from hashlib import sha256
    from app.models.entities import DatasetRecord
    from app.services.cnn_validation import validate_cnn_preparation
    from app.services.csv_pipeline import inspect_csv
    client, eng, _ = lab
    pid, _, _ = setup(lab)
    raw = (Path(__file__).resolve().parents[3] /
           "apps/web/public/datasets/digits-8x8.csv").read_bytes()
    inspection = inspect_csv(raw)
    assert inspection["column_count"] == 65
    assert inspection["row_count"] == 1797
    preparation = prepare_csv(raw, "label", "classification", 0.15, 0.15, 42)
    assert validate_cnn_preparation(preparation) is None
    with Session(eng) as db:
        item = DatasetRecord(project_id=UUID(pid), name="digits-8x8.csv", version=1,
            storage_key=f"{pid}/{uuid4()}.csv", sha256=sha256(raw).hexdigest(),
            size_bytes=len(raw), row_count=1797, column_count=65,
            columns_json=inspection["columns"], preview_json=inspection["preview"], prep_json=preparation)
        db.add(item)
        db.commit()
        did = str(item.id)
    arch = client.post(f"/api/v1/projects/{pid}/architectures", json={
        "name": "CNN dígitos UCI", "family": "cnn_8x8", "conv_filters": 8,
        "kernel_size": 3, "dense_units": 16})
    assert arch.status_code == 201, arch.text
    job = submit(client, pid, arch.json()["id"], did)
    assert job.status_code == 202, job.text
    with Session(eng) as db:
        record = db.get(TrainingJob, UUID(job.json()["id"]))
        assert record.config_snapshot["family"] == "cnn_8x8"
        assert record.preparation_snapshot["input_dimensions"] == 64


def test_cnn_preparation_rejects_disordered_pixels():
    from app.services.cnn_validation import validate_cnn_preparation
    # Los CSV tabulares de 64 dimensiones no se interpretan como imágenes.
    prep = {"pipeline_version": 1, "task": "classification", "input_dimensions": 64,
            "classes": ["0", "1"],
            "features": [{"name": f"pixel_{i}", "kind": "numeric"} for i in range(64)]}
    assert validate_cnn_preparation(prep) is None
    prep["features"][0]["name"] = "edad"
    assert validate_cnn_preparation(prep)
    prep["features"][0]["name"] = "pixel_0"
    prep["task"] = "regression"
    assert validate_cnn_preparation(prep)
