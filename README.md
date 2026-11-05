# NeuroLab Enterprise v0.8.1 — gráficas en vivo para M06

Plataforma modular React/TypeScript/Tailwind + FastAPI + PostgreSQL/Supabase para redes neuronales. Se conservan los diez módulos, TensorFlow.js local, CSV remotos, SSE autenticado, worker TensorFlow/Keras y registro privado de modelos.

**Nuevo en v0.8.1:** curvas de pérdida y precisión en M06 que se actualizan por época, se recuperan de PostgreSQL al recargar y resisten respuestas REST atrasadas. Se reutiliza el gráfico SVG de M07 y no se añaden dependencias.

**Base de despliegue:** v0.8.0 estable con migración `005_registry_early_stopping` aplicada. **No se necesita una nueva migración** ni reiniciar el worker para actualizar únicamente el frontend.

Consulta `INSTRUCCIONES_PARCHE_V081.md` y `docs/operations/GRAFICAS_EN_VIVO_V081.md` antes de fusionar este parche.

**v0.8.0:** Early Stopping configurable, registro de modelos con estados candidato/producción/archivado, y datasets públicos Iris, Wine y Wisconsin en `samples/datasets/`.

**v0.7.0:** monitor SSE + fallback REST, heartbeat del worker, detección de abandonos, reintentos e historial de evaluación M07.

- Frontend Vercel: `apps/web/`.
- API FastAPI Render: `services/api/`.
- Worker local Python 3.12: `workers/training/`.
- PostgreSQL y buckets privados: Supabase.

El entrenamiento remoto requiere un worker en funcionamiento. La recuperación no reanuda automáticamente los pesos a mitad de una época; los trabajos abandonados pueden reintentarse desde cero.
