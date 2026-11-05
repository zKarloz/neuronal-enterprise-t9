"""Smoke test independiente CNN CPU: datos UCI reales, sin credenciales.

Ejecutar: python -m workers.training.cnn_smoke_test
"""
from pathlib import Path
import sys

# El worker vive fuera del paquete FastAPI: incluirlo explícitamente como
# hacen las pruebas Keras anteriores para no depender de PYTHONPATH externo.
ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "services" / "api"))
sys.path.insert(0, str(ROOT))

from app.services.csv_pipeline import prepare_csv
from app.services.cnn_validation import validate_cnn_preparation
from workers.training.engine import encode_partition, make_model


def main():
    raw = (ROOT / "apps/web/public/datasets/digits-8x8.csv").read_bytes()
    prep = prepare_csv(raw, "label", "classification", 0.15, 0.15, 42)
    assert validate_cnn_preparation(prep) is None
    (train_x, train_y), (val_x, val_y), (test_x, test_y) = encode_partition(raw, prep)
    architecture = {"family": "cnn_8x8", "conv_filters": 8, "kernel_size": 3, "dense_units": 16}
    model = make_model(prep, architecture, 0.001, 42)
    history = model.fit(train_x.reshape(-1, 8, 8, 1), train_y,
                        validation_data=(val_x.reshape(-1, 8, 8, 1), val_y),
                        epochs=2, batch_size=32, verbose=0)
    metrics = model.evaluate(test_x.reshape(-1, 8, 8, 1), test_y,
                             return_dict=True, verbose=0)
    print("CNN UCI: imágenes reales", len(train_x) + len(val_x) + len(test_x))
    print("Loss por época:", [round(float(v), 5) for v in history.history["loss"]])
    print("Métricas reales test:", {k: round(float(v), 5) for k, v in metrics.items()})
    assert all(float(v) >= 0 for v in history.history["loss"])


if __name__ == "__main__":
    main()
