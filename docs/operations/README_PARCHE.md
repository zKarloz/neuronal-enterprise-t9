# Parche v0.4.1 — API propia (aplicar sobre v0.4.0)

**No reemplaces todo tu repositorio por el ZIP completo si ya tienes `apps/web/` desplegado.** Descomprime el ZIP del parche en la raíz de tu repositorio y combina los archivos indicados. Conserva cualquier cambio propio no incluido.

## Archivos afectados

- `apps/web/package.json`
- `apps/web/.env.example`
- `apps/web/src/lib/api/config.ts`
- `apps/web/src/lib/api/client.ts`
- `apps/web/src/lib/api/session.ts` (nuevo)
- `apps/web/src/features/projects/RemoteProjects.tsx`
- `services/api/app/api/authentication.py` (nuevo)
- `services/api/app/core/config.py`
- `services/api/app/main.py`
- `services/api/requirements.txt`
- `services/api/.env.example`
- `services/api/tests/test_authentication.py` (nuevo)
- `docs/operations/INTEGRACION_API_PROPIA_V041.md` (nuevo)

## Validación local

Desde la raíz del repositorio:

```bash
cd apps/web
npm install                   # Actualiza package-lock.json
npm run test:core
npm run typecheck
npm run build
cd ../../services/api
source .venv/Scripts/activate # Git Bash Windows; ajusta si procede
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

## Configuración

1. Supabase: Authentication → Email Templates: incluir `{{ .Token }}` en la plantilla de OTP.
2. Render: añadir `SUPABASE_PUBLISHABLE_KEY` a Environment, mantener `DATABASE_URL`, `SUPABASE_URL` y `FRONTEND_ORIGINS`.
3. Publicar en Render el backend actualizado.
4. Vercel: establecer solo `VITE_API_BASE_URL=https://neuronal-enterprise-api.onrender.com` y volver a desplegar.
5. Probar M02 → Servidor: pedir OTP, verificar, crear proyecto, recargar, y comprobar aislamiento con otra cuenta.

Consulta `docs/operations/INTEGRACION_API_PROPIA_V041.md` para detalles y limitaciones de seguridad.

## Commit recomendado

`feat: centralizar la autenticación y los proyectos en la API propia`
