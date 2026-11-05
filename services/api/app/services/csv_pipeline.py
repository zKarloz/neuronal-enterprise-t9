"""Validación y preparación reproducible de CSV reales (sin registros de ejemplo).

El ajuste de imputadores y escaladores se realiza SOLO con el conjunto train.
Los arrays resultantes se reconstruirán desde el archivo y esta configuración
cuando se implemente el worker de entrenamiento en v0.6.0.
"""
from __future__ import annotations

import csv
import hashlib
import io
import math
import random
import statistics
from collections import Counter
from typing import Any

MAX_CSV_BYTES = 5 * 1024 * 1024
MAX_ROWS = 20_000
MAX_COLUMNS = 65
PREVIEW_ROWS = 8
PIPELINE_VERSION = 1


class CSVValidationError(ValueError):
    """El CSV o la configuración no cumple el contrato del laboratorio."""


def _number(value: str) -> float | None:
    try:
        parsed = float(value)
    except (ValueError, TypeError):
        return None
    return parsed if math.isfinite(parsed) else None


def inspect_csv(raw: bytes) -> dict[str, Any]:
    """Valida encabezados/filas, determina tipos y produce una vista real acotada."""
    if not raw or len(raw) > MAX_CSV_BYTES:
        raise CSVValidationError("El CSV debe tener entre 1 byte y 5 MB.")
    if b"\x00" in raw:
        raise CSVValidationError("El archivo no parece ser texto CSV UTF-8.")
    try:
        text = raw.decode("utf-8-sig")
        rows = csv.reader(io.StringIO(text, newline=""), strict=True)
        header = next(rows)
        headers = [v.strip() for v in header]
        if not (2 <= len(headers) <= MAX_COLUMNS):
            raise CSVValidationError("Se requieren entre 2 y 65 columnas.")
        if any(not h or len(h) > 100 for h in headers) or len(set(h.casefold() for h in headers)) != len(headers):
            raise CSVValidationError("Los encabezados deben ser únicos, no vacíos y de hasta 100 caracteres.")
        records: list[list[str]] = []
        for row in rows:
            if len(row) != len(headers):
                raise CSVValidationError(f"La fila {len(records) + 2} no tiene {len(headers)} columnas.")
            if len(records) >= MAX_ROWS:
                raise CSVValidationError("Límite de 20.000 registros por dataset.")
            if any(len(value) > 4_096 for value in row):
                raise CSVValidationError("Una celda supera el máximo de 4.096 caracteres.")
            records.append([value.strip() for value in row])
    except (UnicodeError, csv.Error, StopIteration) as exc:
        raise CSVValidationError("CSV inválido: se requiere UTF-8 con encabezados y formato consistente.") from exc
    if len(records) < 3:
        raise CSVValidationError("Se requieren al menos tres registros de datos.")
    columns = []
    for index, name in enumerate(headers):
        observed = [row[index] for row in records if row[index] != ""]
        numeric = bool(observed) and all(_number(value) is not None for value in observed)
        columns.append({
            "name": name,
            "type": "number" if numeric else "text",
            "null_count": len(records) - len(observed),
            "distinct_count": len(set(observed)),
        })
    return {
        "columns": columns,
        "preview": records[:PREVIEW_ROWS],
        "row_count": len(records),
        "column_count": len(headers),
        "sha256": hashlib.sha256(raw).hexdigest(),
    }


def _all_rows(raw: bytes) -> tuple[list[str], list[list[str]]]:
    # inspect_csv ya verifica la forma; releer desde el mismo contenido inmutable.
    text = raw.decode("utf-8-sig")
    table = csv.reader(io.StringIO(text, newline=""), strict=True)
    return [v.strip() for v in next(table)], [[v.strip() for v in row] for row in table]


def prepare_csv(raw: bytes, target: str, task: str, validation: float, test: float, seed: int) -> dict[str, Any]:
    """Calcula particiones y preprocesadores usando datos efectivos de train.

    Los índices corresponden a las filas del CSV original (primera fila de datos = 0).
    No se guardan datos sintéticos ni se contamina train con valid/test.
    """
    inspection = inspect_csv(raw)
    headers, rows = _all_rows(raw)
    if target not in headers:
        raise CSVValidationError("La columna objetivo no existe en el CSV.")
    if task not in ("classification", "regression"):
        raise CSVValidationError("El problema debe ser clasificación o regresión.")
    if not (0.05 <= validation <= 0.4 and 0.05 <= test <= 0.4 and validation + test <= 0.6):
        raise CSVValidationError("Los porcentajes de validación y prueba deben estar entre 5 % y 40 % y sumar como máximo 60 %.")
    if not 0 <= seed <= 2_147_483_647:
        raise CSVValidationError("Semilla fuera de los límites permitidos.")
    index = headers.index(target)
    labeled = [i for i, row in enumerate(rows) if row[index] != ""]
    if len(labeled) < 5:
        raise CSVValidationError("Se necesitan al menos cinco registros con variable objetivo.")
    if task == "regression" and any(_number(rows[i][index]) is None for i in labeled):
        raise CSVValidationError("La columna objetivo de regresión debe ser numérica.")
    generator = random.Random(seed)
    chosen = labeled.copy()
    generator.shuffle(chosen)
    test_size = max(1, round(len(chosen) * test))
    valid_size = max(1, round(len(chosen) * validation))
    train = chosen[test_size + valid_size:]
    valid = chosen[test_size:test_size + valid_size]
    testing = chosen[:test_size]
    if not train:
        raise CSVValidationError("La partición dejó el entrenamiento vacío.")
    labels: list[str] = []
    if task == "classification":
        labels = sorted(set(rows[i][index] for i in labeled))
        if not 2 <= len(labels) <= 50:
            raise CSVValidationError("La clasificación debe tener entre 2 y 50 clases.")
        # Estratificación mínima: todas las clases deben tener muestra en train.
        # Cambiar un registro de valid/test a train no usa características ni métricas.
        for label in labels:
            if not any(rows[i][index] == label for i in train):
                source = next((part for part in (valid, testing) if any(rows[i][index] == label for i in part)), None)
                if source is None or len(source) < 2:
                    raise CSVValidationError("Al menos una clase no tiene suficientes registros para entrenar.")
                item = next(i for i in source if rows[i][index] == label)
                source.remove(item)
                train.append(item)
    if not valid or not testing:
        raise CSVValidationError("No quedaron registros suficientes para validación o prueba.")

    features = []
    encoded_dimensions = 0
    for pos, name in enumerate(headers):
        if pos == index:
            continue
        raw_train = [rows[i][pos] for i in train]
        nonempty = [v for v in raw_train if v != ""]
        numeric = inspection["columns"][pos]["type"] == "number"
        if numeric and not nonempty:
            raise CSVValidationError(f"La columna numérica {name!r} no contiene observaciones en train.")
        if numeric:
            values = [_number(v) for v in nonempty]
            # Todos los valores son finitos y válidos tras comprobar numeric.
            numeric_values = [float(v) for v in values if v is not None]
            median = statistics.median(numeric_values)
            filled = [_number(v) if v != "" else median for v in raw_train]
            normalized = [float(v) for v in filled if v is not None]
            mean = statistics.fmean(normalized)
            stdev = math.sqrt(sum((v - mean) ** 2 for v in normalized) / len(normalized))
            features.append({"name": name, "kind": "numeric", "impute_median": median, "mean": mean, "std": stdev if stdev > 0 else 1.0})
            encoded_dimensions += 1
        else:
            mode = Counter(nonempty).most_common(1)[0][0] if nonempty else "__EMPTY__"
            categories = sorted(set(v if v else mode for v in raw_train))
            if len(categories) > 40:
                raise CSVValidationError(f"La columna '{name}' supera 40 categorías en entrenamiento.")
            features.append({"name": name, "kind": "categorical", "impute_mode": mode, "categories": categories, "unknown_policy": "all_zeros"})
            encoded_dimensions += len(categories)
        if encoded_dimensions > 256:
            raise CSVValidationError("La codificación supera 256 características; reduce columnas o categorías.")
    return {
        "pipeline_version": PIPELINE_VERSION,
        "task": task,
        "target_column": target,
        "classes": labels if task == "classification" else None,
        "split": {"train": len(train), "validation": len(valid), "test": len(testing), "seed": seed,
                  "validation_fraction": validation, "test_fraction": test,
                  "dropped_missing_target": len(rows) - len(labeled)},
        "features": features,
        "input_dimensions": encoded_dimensions,
        # El trabajador v0.6 deberá reutilizar estos índices para garantizar la misma partición.
        "indices": {"train": train, "validation": valid, "test": testing},
    }
