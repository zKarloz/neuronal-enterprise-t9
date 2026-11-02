# NeuroLab Enterprise v0.6.0

Plataforma modular React/TypeScript + FastAPI + PostgreSQL/Supabase para redes neuronales. Conserva los diez módulos y los motores locales de TensorFlow.js.

La nueva etapa incorpora arquitecturas Feedforward inmutables, trabajos persistentes, entrenamiento Keras en worker local y CI con GitHub Actions.

**El entrenamiento remoto completo requiere validar la migración, un worker real con TensorFlow y Supabase Storage; las pruebas de API no sustituyen esa verificación.**

- Interfaz: `apps/web/` (Vercel).
- API: `services/api/` (Render).
- Worker: `workers/training/` (equipo local, Python 3.12).
- Base: Supabase PostgreSQL.
- Almacenamiento: buckets privados `neurolab-datasets` y `neurolab-models`.
- Instrucciones: `docs/operations/ENTRENAMIENTO_REMOTO_V060.md`.
- Estado de implementación: `docs/ESTADO_NEUROLAB_V060.md`.
