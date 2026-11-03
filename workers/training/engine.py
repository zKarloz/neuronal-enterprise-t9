"""Ejecutor Feedforward de CPU separado de FastAPI.

El worker reclama un trabajo por vez. PostgreSQL es la fuente de verdad;
los registros de cada época se confirman de forma independiente. No utiliza
los conjuntos de validación o prueba para ajustar el preprocesamiento.
"""
from __future__ import annotations

import asyncio
import hashlib
import io
import logging
import math
import tempfile
import threading
from contextlib import contextmanager
from datetime import datetime, timezone, timedelta
from pathlib import Path
from uuid import UUID, uuid4

import numpy as np
from sqlalchemy import select, update
from sqlalchemy.orm import Session

from app.core.database import engine
from app.core.config import settings
from app.models.entities import DatasetRecord, ModelVersion, TrainingJob, TrainingMetric
from app.services.csv_pipeline import _all_rows, _number
from app.services.storage import PrivateStorage

LOGGER = logging.getLogger("neurolab.worker")


def claim(session: Session) -> UUID | None:
    """Reclama atómicamente una fila; SKIP LOCKED evita dos workers simultáneos."""
    query = (select(TrainingJob).where(TrainingJob.status == "QUEUED")
             .order_by(TrainingJob.created_at, TrainingJob.id).limit(1))
    if session.bind.dialect.name == "postgresql":
        query = query.with_for_update(skip_locked=True)
    job = session.scalar(query)
    if job is None:
        return None
    job.status = "PREPARING"
    job.started_at = datetime.now(timezone.utc)
    job.heartbeat_at = job.started_at
    job.worker_token = str(uuid4())
    session.commit()
    return job.id



def recover_stale(session: Session, timeout_minutes: int = 10) -> int:
    """Marca como FAILED los trabajos sin heartbeat, nunca los reencola.

    Sin checkpoint del optimizador no podemos reanudar una época con fidelidad.
    Un reintento explícito crea otra ejecución, preservando el registro anterior.
    """
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=timeout_minutes)
    query = select(TrainingJob).where(
        TrainingJob.status.in_(("PREPARING", "RUNNING")),
    )
    if session.bind.dialect.name == "postgresql":
        query = query.with_for_update(skip_locked=True)
    count = 0
    for job in session.scalars(query).all():
        last_seen = job.heartbeat_at or job.started_at
        if last_seen is None:
            last_seen = job.created_at
        # SQLite puede devolver fechas sin tz; normalizamos al compararlas.
        if last_seen.tzinfo is None:
            last_seen = last_seen.replace(tzinfo=timezone.utc)
        if last_seen >= cutoff:
            continue
        job.status = "FAILED"
        job.ended_at = datetime.now(timezone.utc)
        job.error_message = "El worker dejó de enviar señales. Puedes reintentar el entrenamiento."
        job.worker_token = None  # Invalida las escrituras del proceso anterior.
        count += 1
    if count:
        session.commit()
        LOGGER.warning("Se marcaron %d trabajos abandonados como FAILED", count)
    return count


@contextmanager
def lease_heartbeat(db_url: str, job_id: UUID, token: str, interval_seconds: int = 10):
    """Heartbeat separado incluso durante épocas largas, guardado de modelos o I/O."""
    stop = threading.Event()

    def pulse():
        while not stop.wait(interval_seconds):
            try:
                with Session(engine(db_url)) as db:
                    updated = db.execute(update(TrainingJob).where(
                        TrainingJob.id == job_id,
                        TrainingJob.worker_token == token,
                        TrainingJob.status.in_(("PREPARING", "RUNNING")),
                    ).values(heartbeat_at=datetime.now(timezone.utc))).rowcount
                    db.commit()
                if updated != 1:
                    return  # Un job finalizado o recuperado no mantiene la sesión.
            except Exception:
                LOGGER.exception("No se pudo actualizar el heartbeat de %s", job_id)
                # El watchdog detectará el abandono si no se recupera la conexión.
    thread = threading.Thread(target=pulse, name=f"heartbeat-{job_id}", daemon=True)
    thread.start()
    try:
        yield
    finally:
        stop.set()
        thread.join(timeout=3)


def ensure_lease(db_url: str, job_id: UUID, token: str) -> None:
    """Fencing: un proceso caducado jamás debe publicar un modelo como válido."""
    with Session(engine(db_url)) as db:
        job = db.get(TrainingJob, job_id)
        if job is None or job.worker_token != token or job.status not in ("PREPARING", "RUNNING"):
            raise RuntimeError("El trabajo ya no pertenece a este worker.")

def encode_partition(raw: bytes, prep: dict):
    """Reconstruye arrays SOLO con estadísticas de train guardadas en M05."""
    headers, rows = _all_rows(raw)
    feature_positions = {name: i for i, name in enumerate(headers)}
    target = prep["target_column"]
    if target not in feature_positions or prep.get("pipeline_version") != 1:
        raise ValueError("El preprocesador del dataset no es compatible.")

    def transform(indices: list[int]):
        x_values = []
        y_values = []
        for index in indices:
            row = rows[index]
            result = []
            for feature in prep["features"]:
                value = row[feature_positions[feature["name"]]]
                if feature["kind"] == "numeric":
                    parsed = _number(value) if value != "" else None
                    number = float(feature["impute_median"] if parsed is None else parsed)
                    result.append((number - float(feature["mean"])) / float(feature["std"]))
                else:
                    name = value or feature["impute_mode"]
                    result.extend(float(name == category) for category in feature["categories"])
            x_values.append(result)
            label = row[feature_positions[target]]
            if prep["task"] == "classification":
                y_values.append(prep["classes"].index(label))
            else:
                y_values.append(float(label))
        dtype = np.int32 if prep["task"] == "classification" else np.float32
        x = np.asarray(x_values, dtype=np.float32)
        y = np.asarray(y_values, dtype=dtype)
        if x.ndim != 2 or x.shape[1] != prep["input_dimensions"] or not np.isfinite(x).all():
            raise ValueError("El CSV y la preparación no coinciden.")
        if not np.isfinite(y).all():
            raise ValueError("Las etiquetas del dataset no son finitas.")
        return x, y

    return tuple(transform(prep["indices"][name]) for name in ("train", "validation", "test"))


def make_model(prep: dict, config: dict, rate: float, seed: int):
    """Importación diferida: la API de Render no necesita TensorFlow instalado."""
    import tensorflow as tf
    tf.keras.utils.set_random_seed(seed)
    model = tf.keras.Sequential([tf.keras.Input(shape=(prep["input_dimensions"],))])
    for layer in config["layers"]:
        model.add(tf.keras.layers.Dense(int(layer["units"]), activation=layer["activation"]))
    if prep["task"] == "classification":
        model.add(tf.keras.layers.Dense(len(prep["classes"]), activation="softmax"))
        model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=rate),
                      loss="sparse_categorical_crossentropy", metrics=["accuracy"])
    else:
        model.add(tf.keras.layers.Dense(1, activation="linear"))
        model.compile(optimizer=tf.keras.optimizers.Adam(learning_rate=rate), loss="mse", metrics=["mae"])
    return model


def cancelled(db_url: str, job_id: UUID, token: str | None = None) -> bool:
    with Session(engine(db_url)) as db:
        job = db.get(TrainingJob, job_id)
        return job is None or (token is not None and job.worker_token != token) or job.cancel_requested or job.status in ("FAILED", "CANCELLED")


def finish(db_url: str, job_id: UUID, status: str, error: str | None = None, token: str | None = None):
    with Session(engine(db_url)) as db:
        job = db.get(TrainingJob, job_id)
        if job and job.status in ("PREPARING", "RUNNING") and (token is None or job.worker_token == token):
            job.status = status
            job.ended_at = datetime.now(timezone.utc)
            job.error_message = error
            if status == "COMPLETED":
                job.progress = 100
            db.commit()


def record_epoch(db_url: str, job_id: UUID, epoch: int, logs: dict, total_epochs: int, token: str | None = None):
    """Persistir los valores reales de Keras inmediatamente después de cada época."""
    values = {name: logs.get(name) for name in ("loss", "val_loss", "accuracy", "val_accuracy")}
    if values["loss"] is None or values["val_loss"] is None:
        raise ValueError("Keras no devolvió pérdida de train/validación.")
    if not all(math.isfinite(float(v)) for v in values.values() if v is not None):
        raise ValueError("El entrenamiento produjo métricas no finitas.")
    with Session(engine(db_url)) as db:
        job = db.get(TrainingJob, job_id)
        if not job or job.status != "RUNNING" or (token is not None and job.worker_token != token):
            raise ValueError("El trabajo no está en ejecución o se perdió el control de la sesión.")
        db.add(TrainingMetric(job_id=job_id, epoch=epoch,
                              loss=float(values["loss"]), val_loss=float(values["val_loss"]),
                              accuracy=float(values["accuracy"]) if values["accuracy"] is not None else None,
                              val_accuracy=float(values["val_accuracy"]) if values["val_accuracy"] is not None else None))
        job.epoch = epoch
        job.progress = round(epoch * 100 / total_epochs)
        job.heartbeat_at = datetime.now(timezone.utc)
        db.commit()


def train_one(db_url: str, job_id: UUID, storage: PrivateStorage | None = None):
    """Entrena, evalúa sobre test independiente y registra un artefacto inmutable."""
    import tensorflow as tf
    storage = storage or PrivateStorage()
    with Session(engine(db_url)) as db:
        job = db.get(TrainingJob, job_id)
        if job is None or job.status != "PREPARING":
            return
        dataset = db.get(DatasetRecord, job.dataset_id)
        if dataset is None:
            raise ValueError("El dataset del entrenamiento ya no existe.")
        storage_key = dataset.storage_key
        snapshot = dict(job.preparation_snapshot)
        architecture = dict(job.config_snapshot)
        expected_hash = job.dataset_sha256
        epochs, batch, lr, seed = job.epochs, job.batch_size, job.learning_rate, job.seed
        project_id = job.project_id
        token = job.worker_token
        if token is None:
            raise RuntimeError("El trabajo no tiene una sesión de worker válida.")
    if cancelled(db_url, job_id, token):
        finish(db_url, job_id, "CANCELLED", token=token)
        return
    raw = asyncio.run(storage.read(storage_key))
    if hashlib.sha256(raw).hexdigest() != expected_hash:
        raise ValueError("El contenido del dataset no coincide con su SHA-256 guardado.")
    (train_x, train_y), (valid_x, valid_y), (test_x, test_y) = encode_partition(raw, snapshot)
    model = make_model(snapshot, architecture, lr, seed)
    with Session(engine(db_url)) as db:
        job = db.get(TrainingJob, job_id)
        if job is None or job.worker_token != token or job.status != "PREPARING":
            raise RuntimeError("El worker perdió el control durante la preparación.")
        if job.cancel_requested:
            job.status = "CANCELLED"
            job.ended_at = datetime.now(timezone.utc)
            db.commit()
            return
        job.status = "RUNNING"
        db.commit()

    class Progress(tf.keras.callbacks.Callback):
        def on_epoch_end(self, epoch, logs=None):
            record_epoch(db_url, job_id, epoch + 1, logs or {}, epochs, token=token)
            if cancelled(db_url, job_id, token):
                self.model.stop_training = True

    try:
        model.fit(train_x, train_y, validation_data=(valid_x, valid_y),
                  epochs=epochs, batch_size=batch, verbose=0, callbacks=[Progress()])
        if cancelled(db_url, job_id, token):
            finish(db_url, job_id, "CANCELLED", token=token)
            return
        evaluation = model.evaluate(test_x, test_y, verbose=0, return_dict=True)
        metrics = {key: float(value) for key, value in evaluation.items()}
        if not all(math.isfinite(value) for value in metrics.values()):
            raise ValueError("La evaluación produjo métricas no finitas.")
        with tempfile.TemporaryDirectory(prefix="neurolab-model-") as folder:
            path = Path(folder) / "model.keras"
            model.save(path)
            data = path.read_bytes()
        # El lease se comprueba antes y después de subir el artefacto privado.
        ensure_lease(db_url, job_id, token)
        key = f"{project_id}/{job_id}.keras"
        asyncio.run(storage.upload_model(key, data))
        # No sobrescribir versiones anteriores; una fila por trabajo.
        with Session(engine(db_url)) as db:
            job = db.get(TrainingJob, job_id)
            if job is None or job.status != "RUNNING" or job.worker_token != token:
                # Si el lease caducó durante el upload, no registrar el modelo.
                # El objeto huérfano se puede eliminar en una tarea de mantenimiento.
                raise RuntimeError("El entrenamiento perdió el control antes de guardar el modelo.")
            db.add(ModelVersion(job_id=job_id, project_id=project_id,
                storage_key=key, sha256=hashlib.sha256(data).hexdigest(), test_metrics=metrics))
            job.status = "COMPLETED"
            job.progress = 100
            job.ended_at = datetime.now(timezone.utc)
            db.commit()
    finally:
        tf.keras.backend.clear_session()


def run_once(db_url: str, storage: PrivateStorage | None = None) -> bool:
    """Devuelve False si no había trabajo disponible; no oculta fallos operativos."""
    with Session(engine(db_url)) as db:
        recover_stale(db)
        job_id = claim(db)
        token = db.get(TrainingJob, job_id).worker_token if job_id else None
    if job_id is None:
        return False
    LOGGER.info("Se reclamó el trabajo %s; iniciando TensorFlow/Keras", job_id)
    try:
        with lease_heartbeat(db_url, job_id, token):
            train_one(db_url, job_id, storage)
        LOGGER.info("Procesamiento finalizado para el trabajo %s", job_id)
    except Exception:
        # No filtrar SQL ni credenciales a la interfaz. El detalle técnico va a los logs privados.
        LOGGER.exception("Falló el trabajo %s", job_id)
        finish(db_url, job_id, "FAILED", "El worker no pudo completar el entrenamiento. Revisa sus logs privados.", token=token)
    return True
