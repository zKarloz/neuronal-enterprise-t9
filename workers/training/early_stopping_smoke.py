"""Prueba manual CPU con Iris real; no requiere credenciales ni servicios externos.

El ejemplo muestra qué registra Early Stopping sin inventar métricas ni prometer
que siempre detendrá antes de agotar las épocas.
"""
from pathlib import Path
import csv
import math
import sys
import numpy as np
import tensorflow as tf

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services" / "api"))
sys.path.insert(0, str(ROOT))
from workers.training.engine import make_model  # noqa: E402

path = ROOT / "samples" / "datasets" / "iris_sklearn.csv"
with path.open(encoding="utf-8", newline="") as handle:
    rows = list(csv.DictReader(handle))
assert len(rows) == 150
features = np.asarray([[float(v) for k, v in row.items() if k != "target"] for row in rows], np.float32)
labels = np.asarray([int(row["target"]) for row in rows], np.int32)
permutation = np.random.default_rng(42).permutation(len(rows))
train, valid, test = permutation[:105], permutation[105:127], permutation[127:]
# Evitar fuga: la normalización se ajusta SOLAMENTE sobre el conjunto train.
center = features[train].mean(axis=0)
spread = features[train].std(axis=0)
spread = np.where(spread < 1e-8, 1.0, spread)
features = (features - center) / spread
model = make_model({"task": "classification", "input_dimensions": 4, "classes": ["0", "1", "2"]},
                   {"layers": [{"units": 16, "activation": "relu"}, {"units": 8, "activation": "relu"}]}, 0.001, 42)
stop = tf.keras.callbacks.EarlyStopping(monitor="val_loss", patience=2, restore_best_weights=True)
history = model.fit(features[train], labels[train], validation_data=(features[valid], labels[valid]),
                    epochs=10, batch_size=16, verbose=0, callbacks=[stop])
evaluation = model.evaluate(features[test], labels[test], verbose=0, return_dict=True)
assert 1 <= len(history.history["val_loss"]) <= 10
assert all(math.isfinite(float(x)) for x in history.history["val_loss"])
assert all(math.isfinite(float(value)) for value in evaluation.values())
print("Iris real, épocas ejecutadas:", len(history.history["val_loss"]), "/ 10")
print("Mejor época (val_loss):", 1 + int(np.argmin(history.history["val_loss"])))
print("Evaluación sobre test independiente:", {k: round(float(v), 5) for k, v in evaluation.items()})
