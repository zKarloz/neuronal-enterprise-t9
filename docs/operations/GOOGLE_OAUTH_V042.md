# NeuroLab Enterprise v0.4.2 — Integración Google OAuth

## Alcance

- Autenticación federada con Google → Supabase Auth mediante **navegación** externa, sin acceso directo de React a la API de Supabase.
- La app React envía todas las peticiones de autenticación y proyectos a la API **FastAPI propia**.
- PKCE S256: el navegador conserva temporalmente el verificador en `sessionStorage`; FastAPI envía el desafío a Supabase y realiza el intercambio del código temporal mediante `POST /auth/v1/token?grant_type=pkce`.
- Correlación con estado aleatorio: cookie HttpOnly + validación contra `sessionStorage` al regresar al navegador.
- El callback vuelve al frontend únicamente con código de un solo uso; **no incluye access tokens ni refresh tokens en la URL**.
- El inicio de sesión permite crear proyectos en PostgreSQL; los diez módulos locales y TensorFlow.js no cambian.

## 1. Configuración de terceros (ya realizada en esta conversación)

1. Google Cloud: proyecto OAuth externo en modo Testing, test user agregado.
2. Google Auth Platform → Clients: aplicación web y callback **de Supabase** `https://PROJECT_REF.supabase.co/auth/v1/callback` autorizado.
3. Supabase → Authentication → Sign In / Providers → Google: habilitado, Client ID y Client Secret configurados allí (nunca en React).
4. Supabase → Authentication → URL Configuration: incluir `https://neuronal-enterprise-api.onrender.com/api/v1/auth/google/callback` en Redirect URLs.

## 2. Variables necesarias en Render

En Render → servicio `neuronal-enterprise-api` → Environment, mantener estas variables:

```dotenv
DATABASE_URL=postgresql+psycopg://...  # nunca subir credenciales
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
FRONTEND_ORIGINS=https://TU-FRONTEND.vercel.app
```

Añadir **exactamente**:

```dotenv
OAUTH_CALLBACK_URL=https://neuronal-enterprise-api.onrender.com/api/v1/auth/google/callback
OAUTH_FRONTEND_URL=https://TU-FRONTEND.vercel.app
```

Sustituye `TU-FRONTEND` por el dominio real de producción. Debe coincidir con `FRONTEND_ORIGINS` y con la URL autorizada de Supabase. En producción debe usar HTTPS. No se necesita añadir un secreto de Google a Render.

Render detecta nuevos commits de la rama configurada. Al cambiar Environment, vuelve a desplegar el servicio si no se despliega automáticamente.

## 3. Variables en Vercel

Mantener `VITE_API_BASE_URL=https://neuronal-enterprise-api.onrender.com`. **No colocar secretos de Google ni de Supabase en Vercel.**

## 4. Comandos de verificación

Desde la raíz del repositorio:

```bash
cd services/api
python -m pytest -q
# Esperado en esta entrega: 12 pruebas del backend correctas

cd ../../apps/web
npm install
npm run test:core
npm run typecheck
npm run build
```

### Prueba funcional real, tras publicar API + frontend

1. En la URL de Vercel, ir a **Proyectos de IA → Servidor**.
2. Pulsar **Continuar con Google** con el correo incluido en `Test users` de Google Cloud.
3. Autorizar Google; Supabase redirige a `/api/v1/auth/google/callback` de Render.
4. FastAPI devuelve al navegador React con un código temporal y estado; React elimina esos parámetros de la URL e intercambia el código mediante `POST /api/v1/auth/google/exchange`.
5. Crear un proyecto remoto, recargar y verificar que sigue ahí; consultar `GET /api/v1/me` con el Bearer token si es necesario.
6. Cerrar sesión y volver a ingresar para confirmar que no hay dependencia de SMTP/OTP.

## 5. Diagnóstico rápido

| Síntoma | Qué comprobar |
|---|---|
| `Google OAuth todavía no está configurado` (`503`) | Faltan `OAUTH_CALLBACK_URL` u `OAUTH_FRONTEND_URL` en Render, o `SUPABASE_PUBLISHABLE_KEY`. |
| `URL de OAuth incorrecta` | Revisa esquemas HTTPS, ruta exacta y FRONTEND_ORIGINS. |
| Redirige a Vercel pero da `missing_state` | El navegador no devolvió la cookie HttpOnly de Render; iniciar desde el botón en la misma pestaña; revisar bloqueo de cookies o extensiones. |
| `Error al intercambiar el código` (`401`) | Código PKCE expirado o ya usado, verifier no coincide, dirección de callback distinta o proveedor mal configurado. Reinicia el acceso desde la misma pestaña. |
| Google muestra error de consentimiento | Asegúrate de que tu cuenta está en **Test users** y de usar el Client ID correcto. |
| CORS | Agrega la URL exacta de Vercel a `FRONTEND_ORIGINS` (sin slash final). |

## 6. Límites y decisiones de seguridad

- En esta versión mantenemos `sessionStorage` para almacenar el JWT y el refresh token, como en v0.4.1. **No se debe considerar una arquitectura de producción para datos sensibles**, debido a los riesgos de XSS. La siguiente fase puede migrar a BFF/cookies HttpOnly con dominio compartido, más protección CSRF y pruebas de seguridad.
- `sessionStorage` pertenece a una pestaña; iniciar OAuth y completar la vuelta deben ocurrir en la **misma pestaña**. Abrir flujos simultáneos puede invalidar el anterior.
- La expiración de la transacción PKCE en el navegador está limitada a diez minutos; Supabase emite códigos de un solo uso con expiración propia.
- OTP permanece en la API por compatibilidad futura, aunque la interfaz utiliza Google OAuth por defecto.
- El backend no crea cuentas en Google ni guarda contraseñas de usuarios.
- No se enviarán proyectos ni datasets locales automáticamente a Supabase.
- El correo y nombre del usuario son los únicos datos básicos esperados del proveedor; no se solicitan permisos de Gmail, Calendar ni Drive.

## 7. Versionado

Commit recomendado (en español):

`feat: incorporar acceso con Google OAuth mediante API propia`

No fusionar a `main` hasta que los tests del equipo y el despliegue de vista previa validen la autenticación.
