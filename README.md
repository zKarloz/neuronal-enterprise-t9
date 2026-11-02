# NeuroLab Enterprise v0.5.0

Plataforma de experimentación neuronal. Arquitectura híbrida **React/TensorFlow.js local + API propia FastAPI + PostgreSQL/Storage privado Supabase**.

- `apps/web`: diez módulos React/TypeScript, estilos Tailwind y Lucide React; modo local intacto y M05 remoto.
- `services/api`: FastAPI v0.5.0, Google OAuth y endpoints de proyectos/datasets; Alembic `001_init` y `002_datasets`.
- `workers/training`: reservado para la fase posterior; **v0.5.0 no entrena en el servidor**.
- `docs/operations/DATASETS_REMOTOS_V050.md`: **guía principal de configuración, migración, pruebas y despliegue**.
- `docs/ESTADO_NEUROLAB_V050.md`: estado de los diez módulos y próximas versiones.

La persistencia CSV no usa el disco efímero de Render. Se utiliza un bucket **privado** `neurolab-datasets` con secreto únicamente en Render. Los datasets locales nunca se envían automáticamente.

**Verificaciones de esta entrega:** 23 pruebas automatizadas de backend aprobadas y migración comprobada en una base SQLite de prueba con claves foráneas. Se revisó sintaxis de 46 archivos TS/TSX. **Pendiente:** `npm run typecheck`/`npm run build` (no se pudieron instalar dependencias npm en este entorno), migración en Supabase real y prueba de Storage en Render.

### Uso rápido

```bash
cd services/api && python -m pip install -r requirements-dev.txt && python -m pytest -q
cd ../../apps/web && npm install && npm run test:core && npm run typecheck && npm run build
```

Lee **primero** la guía de operaciones antes de fusionar el código con `main`.
