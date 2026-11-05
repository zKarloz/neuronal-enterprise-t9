"""Arranque del worker local: python -m workers.training.run [--once]."""
import argparse
import logging
import sys
import time
from pathlib import Path

from dotenv import load_dotenv

ROOT = Path(__file__).resolve().parents[2]
# Usar solo la configuración secreta del backend, nunca archivos Vite.
load_dotenv(ROOT / "services" / "api" / ".env", override=False)
sys.path.insert(0, str(ROOT / "services" / "api"))
from app.core.config import settings  # noqa: E402
from workers.training.engine import run_once  # noqa: E402


def main():
    parser = argparse.ArgumentParser(description="Worker neuronal de NeuroLab Enterprise")
    parser.add_argument("--once", action="store_true", help="Procesa máximo un trabajo y termina")
    args = parser.parse_args()
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    url = settings().database_url
    if not url:
        parser.error("DATABASE_URL no está configurada en services/api/.env")
    logging.info("Worker v0.9 iniciado (Feedforward/CNN). Consultando la cola cada cinco segundos.")
    while True:
        did_work = run_once(url)
        if args.once:
            break
        if not did_work:
            time.sleep(5)


if __name__ == "__main__":
    main()
