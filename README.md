# NeuroLab Enterprise — v0.4.2 (Google OAuth con API propia)

Plataforma de redes neuronales con laboratorio local en React/TypeScript/TensorFlow.js y una primera integración opcional con FastAPI, Render y Supabase.

## Carpetas

```text
apps/web/                  # Frontend actual: Vite, React, Tailwind, Lucide
services/api/              # FastAPI, auth, CRUD de proyectos, Alembic
workers/training/          # Reservado para TensorFlow/Keras (pendiente)
infra/                     # Infraestructura
 docs/                     # Arquitectura, despliegue y operaciones
```

Vercel: **Root Directory `apps/web`**. Render: **Root Directory `services/api`**.

## Funcionalidad

- Los diez módulos existentes, sus proyectos locales, CNN 8×8 y predicciones se conservan.
- La pestaña M02 → Servidor usa exclusivamente nuestra API FastAPI para autenticación mediante OTP de correo y CRUD de proyectos.
- FastAPI utiliza Supabase Auth como proveedor de identidad y PostgreSQL para los proyectos y eventos de auditoría.
- El frontend solo requiere `VITE_API_BASE_URL`; **no utiliza `supabase-js` ni necesita una clave de Supabase**.
- La sesión remota está limitada a la pestaña (sessionStorage). Sus límites y controles pendientes se documentan en la guía.

## Instrucciones

**Guía de integración y despliegue:** [`docs/operations/INTEGRACION_API_PROPIA_V041.md`](docs/operations/INTEGRACION_API_PROPIA_V041.md)

```bash
# Frontend
cd apps/web
npm install
npm run test:core
npm run typecheck
npm run build

# Backend (en otra terminal)
cd services/api
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

## Endpoints

| Método | Ruta | Descripción |
| --- | --- | --- |
| GET | `/api/v1/health` | Estado de API |
| GET | `/api/v1/ready` | Conexión PostgreSQL |
| POST | `/api/v1/auth/otp` | Solicitar código por email |
| POST | `/api/v1/auth/verify` | Verificar código y crear sesión |
| POST | `/api/v1/auth/refresh` | Renovar sesión |
| POST | `/api/v1/auth/logout` | Cerrar sesión |
| GET | `/api/v1/me` | Identidad autenticada |
| GET/POST | `/api/v1/projects` | Listar y crear proyectos autorizados |
| GET/PATCH/DELETE | `/api/v1/projects/{id}` | Consultar, editar y eliminar |

La nueva capa de autenticación **no necesita nuevas migraciones de datos**. Entrenamiento remoto, datasets de servidor y sincronización de modelos siguen pendientes de implementar.

## Autenticación Google OAuth — v0.4.2

La implementación Google OAuth con API propia y PKCE se documenta en `docs/operations/GOOGLE_OAUTH_V042.md`. Para el despliegue a Render, configura `OAUTH_CALLBACK_URL` y `OAUTH_FRONTEND_URL` como indica esa guía.
