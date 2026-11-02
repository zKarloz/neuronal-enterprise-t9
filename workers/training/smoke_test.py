"""Smoke de Keras sin credenciales: dataset real Optical Recognition of Handwritten Digits.

No utiliza datos de entrenamiento precargados artificialmente ni modelos ficticios.
Solo comprueba que TensorFlow en Linux pueda entrenar y evaluar una red real.
"""
import csv
import math
import sys
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services" / "api"))
sys.path.insert(0, str(ROOT))
from workers.training.engine import make_model  # noqa: E402


with (ROOT / "apps/web/public/datasets/digits-8x8.csv").open(encoding="utf-8") as source:
    rows = list(csv.DictReader(source))
assert len(rows) == 1797, "El dataset real de dígitos no está íntegro."
features = np.asarray([[float(row[f"pixel_{i}"]) / 16.0 for i in range(64)] for row in rows], dtype=np.float32)
labels = np.asarray([int(row["label"]) for row in rows], dtype=np.int32)
assert set(labels.tolist()) == set(range(10))

rng = np.random.default_rng(42)
ids = rng.permutation(len(rows))
train, validation, test = ids[:1257], ids[1257:1527], ids[1527:]
model = make_model({"task": "classification", "input_dimensions": 64,
                    "classes": [str(i) for i in range(10)]},
                   {"layers": [{"units": 32, "activation": "relu"}]}, 0.001, 42)
history = model.fit(features[train], labels[train], epochs=2, batch_size=32,
                    validation_data=(features[validation], labels[validation]), verbose=0)
results = model.evaluate(features[test], labels[test], verbose=0, return_dict=True)
assert len(history.history["loss"]) == 2
assert all(math.isfinite(float(v)) for v in results.values())
assert 0 <= results["accuracy"] <= 1
print("Dataset UCI:", len(rows), "muestras; particiones:", len(train), len(validation), len(test))
print("Pérdida por época:", [round(float(x), 5) for x in history.history["loss"]])
print("Métricas reales de test:", {k: round(float(v), 5) for k, v in results.items()})
