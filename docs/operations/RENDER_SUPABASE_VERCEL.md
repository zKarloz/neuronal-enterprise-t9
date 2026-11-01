# Despliegue v0.4.0 — Vercel, Render, Supabase

## Preparación del repositorio

Copiar el contenido del paquete completo a la raíz del repositorio actual, conservando `frontend/`. Vercel debe conservar **Root Directory: frontend**. No subir `node_modules`, `dist`, `.env` ni secretos. Ejecutar desde frontend: `npm install`, `npm run test:core`, `npm run typecheck`, `npm run build` antes del push. Conservar y subir el `package-lock.json` generado.

## Supabase

1. Crear proyecto de PostgreSQL/Auth.
2. Activar proveedor de correo en Authentication; configurar Magic Link y URLs de redirección del sitio de Vercel y `http://localhost:5173/**` si se usa localmente. Para producción configurar SMTP propio o verificar límites de correo.
3. Configurar claves JWT **asimétricas** (RS256/ES256). Este backend deliberadamente no acepta JWT HS256 heredados.
4. Copiar Project URL y **publishable key**, ambos públicos, para Vercel. **No copiar service_role ni contraseñas**.
5. Copiar la URL privada de conexión PostgreSQL, con SSL y modalidad de pooler adecuada a Render, en `services/api/.env` para migraciones locales. Nunca subir este archivo.

## Migraciones

Desde `services/api/`:

```bash
python -m venv .venv
# Windows Git Bash: source .venv/Scripts/activate
# Linux/macOS: source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
# Reemplazar marcadores de posición con valores PRIVADOS auténticos.
alembic upgrade head
pytest -q
```

La migración inicial crea `users`, `projects`, `project_members`, `audit_events` y habilita RLS en PostgreSQL. No incluye policies de PostgREST: deniega acceso directo de clientes y exige consultas a través de FastAPI. El usuario SQL del backend debe tener permisos adecuados. No usar una conexión de rol `anon` para migrar.

## Render

Crear Web Service Python desde el mismo repositorio con:

- Root Directory: `services/api`
- Build Command: `pip install -r requirements.txt`
- Start Command: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
- Health Check Path: `/api/v1/health`

Configurar variables privadas `DATABASE_URL`, `SUPABASE_URL`, `FRONTEND_ORIGINS` (ej. `https://TU-WEB.vercel.app,http://localhost:5173`). Verificar `/api/v1/health` y `/api/v1/ready`. La API no corre entrenamientos ML.

## Vercel

El proyecto existente mantiene Root Directory `frontend`. Agregar:

- `VITE_API_BASE_URL=https://TU-API.onrender.com`
- `VITE_SUPABASE_URL=https://PROJECT_REF.supabase.co`
- `VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...`

Redeploy. En M02 → Servidor, entrar con correo y crear un proyecto. Recargar y comprobar que persiste; acceder con otra cuenta y verificar que no aparece. Si no configuras las variables, el frontend sigue funcionando en modo local.

## Limitaciones expresas

Esta versión solo persiste proyectos remotos. No mueve los proyectos existentes del navegador, no sincroniza datasets ni pesos y no contiene workers TensorFlow/Keras. Los tests de integración SQLite no sustituyen una verificación de producción en Supabase/Render.
