"""Permite importar el paquete worker del monorepo desde services/api.

Las pruebas mantienen el mismo comando `python -m pytest -q` de v0.5.0.
No acceden a Render, GitHub ni a credenciales privadas.
"""
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[3]
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))
