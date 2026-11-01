# Integración API propia — NeuroLab Enterprise v0.4.1

## Arquitectura

```text
React (Vercel) --> FastAPI (Render) --> Supabase Auth + PostgreSQL
```

La aplicación React usa **solo `VITE_API_BASE_URL`** y nunca llama directamente a Supabase. Se conserva M02 → Navegador y el motor TensorFlow.js existente. M02 → Servidor persiste únicamente los proyectos, no las arquitecturas, datasets ni entrenamientos.

## 1. Actualizar el código en la rama de trabajo

Desde la raíz del repositorio, aplicar el parche (en rutas `apps/web` y `services/api`). No sobrescribir el `package-lock.json` ya generado en el equipo. Ejecutar:

```bash
cd apps/web
npm install
npm run test:core
npm run typecheck
npm run build
cd ../../services/api
source .venv/Scripts/activate   # Windows Git Bash, si no está activado
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

El frontend ya no necesita `@supabase/supabase-js`: `npm install` actualizará el lockfile. No se requieren migraciones nuevas para la autenticación.

## 2. Supabase — plantilla OTP de correo

En Authentication → Email Templates, editar la plantilla **Magic Link / OTP** para que incluya el código `{{ .Token }}` y no dependa de hacer clic en un enlace. Si las cuentas nuevas requieren un correo de confirmación separado, adaptar también la plantilla de confirmación según las reglas del proyecto. Un ejemplo de cuerpo HTML es:

```html
<h2>Tu código de acceso a NeuroLab</h2>
<p>Escribe este código en la aplicación: <strong>{{ .Token }}</strong></p>
```

Verificar que el proveedor Email esté habilitado. El SMTP integrado de Supabase impone límites; para usuarios de producción configurar correo transaccional propio. Consultar la [documentación de plantillas](https://supabase.com/docs/guides/auth/auth-email-templates).

## 3. Render — añadir variable y desplegar backend

Mantener `DATABASE_URL`, `SUPABASE_URL`, `FRONTEND_ORIGINS`. Añadir:

```dotenv
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

Obtener el valor desde Supabase → Project Settings / API Keys. Es una publishable key, **no** usar `service_role` ni claves secretas. Guardarla en Render → Environment; desplegar el commit con el backend actualizado. **No existe una ruta de autenticación para uso real hasta que ese despliegue termine.**

### Comprobaciones rápidas

- `GET /api/v1/health` → 200
- `GET /api/v1/ready` → 200
- `POST /api/v1/auth/otp` con JSON de un correo real → 202 o respuesta controlada del proveedor; puede enviar correo.
- `POST /api/v1/auth/verify` con el correo y el código del mensaje → devuelve token JWT; **no compartir tokens ni publicar respuestas en capturas de pantalla**.
- `GET /api/v1/me` con `Authorization: Bearer <TOKEN>` → identidad autorizada.

La API verifica JWT vía JWKS (RS256/ES256). Si Supabase usa claves JWT heredadas HS256, rotar/configurar una clave asimétrica antes de probar el CRUD remoto. Comprobar que la migración inicial está aplicada.

## 4. Vercel — conectar React

En el proyecto Vercel, mantener `Root Directory = apps/web`. En Settings → Environment Variables para `Production`:

```dotenv
VITE_API_BASE_URL=https://neuronal-enterprise-api.onrender.com
```

Eliminar `VITE_SUPABASE_URL` y `VITE_SUPABASE_PUBLISHABLE_KEY` si existen: **el frontend no las necesita**. Redeploy para incorporar las nuevas variables de build.

Comprobar que `FRONTEND_ORIGINS` en Render incluya la URL exacta de Vercel (esquema HTTPS, sin barra final). El endpoint `/ready` no verifica CORS: la prueba real debe hacerse desde el navegador.

## 5. Flujo funcional para cerrar v0.4.1

1. Vercel → M02 Proyectos → Servidor.
2. Solicitar código a un correo real y verificarlo.
3. Crear un proyecto remoto y recargar la página.
4. Confirmar que aparece el mismo proyecto.
5. Salir y entrar con otro correo; no debe acceder al proyecto anterior.
6. M02 → Navegador debe continuar funcionando como antes, sin transferir proyectos locales.

## Seguridad y limitaciones

- El código de acceso se envía a través del backend hacia Supabase Auth; no se almacena en PostgreSQL de NeuroLab.
- Esta versión guarda los tokens en `sessionStorage` por pestaña para evitar que se pierdan al recargar. `sessionStorage` **no protege frente a XSS**. Antes de producción multiusuario conviene utilizar cookies HttpOnly desde un backend para frontend en dominio propio compatible, protección CSRF y límites de tasa distribuidos.
- Los endpoints de correo están sujetos a los límites de Supabase; antes de exponerlos a un público amplio, aplicar también límites por IP y cuenta en FastAPI (idealmente respaldados por Redis).
- No está implementado el entrenamiento remoto ni la transferencia automática de datos locales.
- No mostrar ni subir `DATABASE_URL`, claves o JWT a GitHub.
