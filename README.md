# NeuroLab Enterprise v0.8.0 — candidata

Plataforma modular React/TypeScript/Tailwind + FastAPI + PostgreSQL/Supabase para redes neuronales. Se conservan los diez módulos, los motores locales de TensorFlow.js, los datasets CSV remotos y el worker TensorFlow/Keras independiente.

**Nuevo en v0.8.0 (primera entrega):** Early Stopping configurable en M06; registro privado de modelos con nombre, notas, estados y promoción única por proyecto en M07. Se incluyen CSV públicos Iris, Wine y WDBC en `samples/datasets/` y la migración `005_registry_early_stopping`.

**No ejecutar la v0.8.0 en producción sin comprobar CI y migración.** Revisa `INSTRUCCIONES_PARCHE_V080.md` y `docs/operations/MODELOS_EARLY_STOPPING_V080.md`. La CNN remota queda para una iteración posterior.

**Nuevo en v0.7.0:** monitor autenticado SSE en M06 con respaldo REST, heartbeat y detección de trabajos abandonados, reintentos explícitos conservando el historial, y evaluación de ejecuciones remotas en M07.

- Frontend Vercel: `apps/web/`.
- API FastAPI Render: `services/api/`.
- Worker local Python 3.12: `workers/training/`.
- PostgreSQL y buckets privados en Supabase.
- Migración requerida antes del despliegue: `004_live_recovery`.
- Guía de operaciones: `docs/operations/TIEMPO_REAL_RECUPERACION_V070.md`.

El entrenamiento sigue requiriendo un worker encendido. La recuperación no reanuda un checkpoint Keras; los trabajos abandonados pasan a FAILED y se pueden reintentar desde cero.
