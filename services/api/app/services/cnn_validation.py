"""Contrato CNN remoto: la entrada se limita a imágenes 8×8 verificables.

Es importante validar la disposición de los píxeles ANTES de encolar para
impedir que cualquier CSV de 64 características se interprete como imagen.
"""
from __future__ import annotations

from typing import Any

PIXEL_COLUMNS = [f"pixel_{index}" for index in range(64)]


def validate_cnn_preparation(prep: dict[str, Any]) -> str | None:
    """Devuelve una explicación si el snapshot de M05 no es una imagen 8×8."""
    if prep.get("pipeline_version") != 1:
        return "La versión de preparación del dataset no es compatible."
    if prep.get("task") != "classification":
        return "La CNN 8×8 solo admite clasificación de imágenes."
    if prep.get("input_dimensions") != 64:
        return "La CNN necesita exactamente 64 características de píxeles."
    features = prep.get("features")
    if not isinstance(features, list) or len(features) != 64:
        return "La CNN necesita 64 columnas numéricas de píxeles."
    if [feature.get("name") for feature in features] != PIXEL_COLUMNS:
        return "Ordena las columnas como pixel_0 ... pixel_63 para formar imágenes 8×8."
    if any(feature.get("kind") != "numeric" for feature in features):
        return "Todos los píxeles deben ser numéricos."
    if not isinstance(prep.get("classes"), list) or not 2 <= len(prep["classes"]) <= 50:
        return "La CNN debe clasificar entre 2 y 50 clases."
    return None
