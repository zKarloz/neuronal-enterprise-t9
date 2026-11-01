# NeuroLab Enterprise — v0.4.0 (Base de plataforma)

Plataforma web para crear proyectos de IA, diseñar redes neuronales y ejecutar experimentos reales. Esta versión conserva el laboratorio **v0.3.1** en el navegador e introduce una **API autenticada opcional** para proyectos remotos.

## Estructura

```text
frontend/                  # Vite + React + TypeScript + Tailwind + Lucide + TensorFlow.js
  src/features/             # Los diez módulos M01–M10, sin eliminaciones
  src/lib/api/              # Nueva capa de acceso a FastAPI/Supabase Auth
services/api/              # FastAPI, SQLAlchemy, migraciones Alembic, pruebas
infra/                     # Reservado para infraestructura futura
workers/training/          # Reservado para entrenamiento aislado (NO implementado)
docs/architecture/         # Decisiones técnicas y contratos
docs/operations/           # Despliegue Vercel + Render + Supabase
```

**Compatibilidad con Vercel:** el `Root Directory` continúa siendo **`frontend`**. No hemos movido la aplicación a `apps/web` para evitar romper el despliegue actual.

## Modo local (sin backend)

```bash
cd frontend
npm install
npm run test:core
npm run typecheck
npm run build
npm run dev
```

La pestaña **Navegador** de M02 y todos los entrenamientos locales siguen utilizando `localStorage` y TensorFlow.js. No se generan resultados o métricas ficticias.

## Modo servidor (opt-in)

Consulta [`docs/operations/RENDER_SUPABASE_VERCEL.md`](docs/operations/RENDER_SUPABASE_VERCEL.md) para configurar Supabase, aplicar migraciones, desplegar API Render y añadir variables públicas Vercel.

La pestaña **Servidor** de M02 permite autenticarse por magic link, listar, crear, archivar/restaurar y eliminar proyectos remotos de PostgreSQL. La separación de estados es intencional: no se migra nada automáticamente desde el navegador.

## Endpoints incluidos

| Método | Ruta | Auth | Descripción |
| --- | --- | --- | --- |
| GET | `/api/v1/health` | No | Estado de API. |
| GET | `/api/v1/ready` | No | Conectividad PostgreSQL. |
| GET | `/api/v1/me` | Sí | Identidad verificada. |
| GET | `/api/v1/projects` | Sí | Solo proyectos propios o asignados. |
| POST | `/api/v1/projects` | Sí | Crear proyecto; auditar. |
| GET | `/api/v1/projects/{id}` | Sí | Detalle autorizado. |
| PATCH | `/api/v1/projects/{id}` | Sí | Modificar con rol owner/manager. |
| DELETE | `/api/v1/projects/{id}` | Sí | Eliminar solo propietario; auditar. |

**Seguridad:** Supabase Auth (JWT RS256/ES256 verificado en backend), autorización en API y RLS activo sin políticas de exposición en base. Las credenciales de DB permanecen solo en el servidor.

## Pruebas

```bash
cd services/api
pip install -r requirements-dev.txt
pytest -q
```

Pruebas backend con SQLite en memoria sin necesidad de cuenta Supabase; despliegue real exclusivamente con PostgreSQL. Verificaciones local/frontend y configuración end-to-end se completan después de instalar las dependencias y conectar servicios reales.

## Estado de las fases

**v0.4.0:** base API/proyectos ✅ (código); despliegue real en Render/Supabase pendiente de configuración. **v0.5.0:** carga, validación y persistencia CSV. **v0.6.0:** workers TensorFlow/Keras y cola. **v0.7.0:** métricas SSE, evaluación y versiones de modelos.

Desarrollado a partir del Documento Maestro de Desarrollo y la especificación CSV Real-Time de NeuroLab Enterprise (Semana 11).
