# NeuroLab Enterprise v0.7.0

Plataforma modular React/TypeScript/Tailwind + FastAPI + PostgreSQL/Supabase para redes neuronales. Se conservan los diez módulos, los motores locales de TensorFlow.js, los datasets CSV remotos y el worker TensorFlow/Keras independiente.

**Nuevo en v0.7.0:** monitor autenticado SSE en M06 con respaldo REST, heartbeat y detección de trabajos abandonados, reintentos explícitos conservando el historial, y evaluación de ejecuciones remotas en M07.

- Frontend Vercel: `apps/web/`.
- API FastAPI Render: `services/api/`.
- Worker local Python 3.12: `workers/training/`.
- PostgreSQL y buckets privados en Supabase.
- Migración requerida antes del despliegue: `004_live_recovery`.
- Guía de operaciones: `docs/operations/TIEMPO_REAL_RECUPERACION_V070.md`.

El entrenamiento sigue requiriendo un worker encendido. La recuperación no reanuda un checkpoint Keras; los trabajos abandonados pasan a FAILED y se pueden reintentar desde cero.
