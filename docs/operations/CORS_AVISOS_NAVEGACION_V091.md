# NeuroLab Enterprise v0.9.1 — CORS, avisos y navegación

## Qué se observó

Un trabajo CNN de v0.9.0 completó su entrenamiento y subió el `.keras` con HTTP 200. Sin embargo, el navegador registró `Failed to fetch` y ausencia de `Access-Control-Allow-Origin` en dos solicitudes GET. Ese mensaje **no demuestra por sí solo** que el problema sea la lista CORS: también puede corresponder a errores HTTP 500 o 502 que no recibieron cabeceras CORS.

## Cambios

1. **CORS exterior.** FastAPI queda envuelto con `CORSMiddleware` para que los errores no capturados que sí llegan a la aplicación incluyan las cabeceras correspondientes al origen permitido. No se habilitan orígenes arbitrarios ni se deshabilita la autorización. No puede reparar respuestas emitidas directamente por Render antes de llegar a FastAPI.
2. **Avisos de M06.** La explicación del worker se muestra como texto informativo, no como advertencia. La confirmación de encolado se retira al avanzar el trabajo y los fallos de sincronización se consideran transitorios; no anulan un `COMPLETED` persistido.
3. **Navegación.** Rutas `/panel`, `/proyectos`, `/fundamentos`, `/arquitecturas`, `/datasets`, `/entrenamientos`, `/evaluacion`, `/modelos`, `/reportes`, `/administracion`. En M02/M05/M06/M07, `?vista=servidor` conserva la vista remota. Los enlaces funcionan al recargar y con Atrás/Adelante; el código OAuth temporal se consume como antes.

## Verificar Render

En **Render → Web Service → Environment**, confirma que la variable exacta `FRONTEND_ORIGINS` incluye:

```
https://neurolab-enterprise-zeta.vercel.app
```

No uses una ruta (`/entrenamientos`) ni un comodín `*`. Si existen varios orígenes, sepáralos con comas sin comillas. Guarda y despliega de nuevo si cambia la configuración.

Desde Git Bash, prueba el preflight **sin token**:

```bash
curl -i -X OPTIONS 'https://neuronal-enterprise-api.onrender.com/api/v1/projects' \
  -H 'Origin: https://neurolab-enterprise-zeta.vercel.app' \
  -H 'Access-Control-Request-Method: GET' \
  -H 'Access-Control-Request-Headers: authorization'
```

Espera HTTP 200 y `access-control-allow-origin: https://neurolab-enterprise-zeta.vercel.app`. Si no aparece, revisa `FRONTEND_ORIGINS` y los logs de Render. Si el preflight es correcto, pero hay un error al consultar una ruta concreta, revisa el **código HTTP** y el registro del servidor en ese instante: podría ser un 500 por una excepción de la aplicación, un 502 del proxy o un fallo temporal del servicio. **Nunca pegues JWT, cookies, `DATABASE_URL` o claves Supabase en un reporte.**

## Verificar Vercel

`apps/web/vercel.json` se encuentra en la raíz configurada para Vercel (`apps/web`). Debe tener esta regla:

```json
{"rewrites":[{"source":"/(.*)","destination":"/index.html"}]}
```

Revisar tras desplegar:

- Abrir directamente `/entrenamientos?vista=servidor`, recargar (F5) y confirmar que no vuelve al panel.
- Usar los diez módulos y los controles Atrás/Adelante.
- Abrir `/proyectos?vista=servidor` y verificar Google OAuth sin perder el retorno.
- Durante un entrenamiento, comprobar que la confirmación de encolado desaparece al empezar a entrenar, y que las gráficas continúan actualizándose por SSE.
- Tras terminar, verificar que `COMPLETED`, las métricas y el modelo `.keras` permanecen visibles sin avisos de error obsoletos.

## Desarrollo

No se necesitan nuevas migraciones ni cambios en el worker. Ejecuta `npm install`, `npm run test:core`, `npm run typecheck`, `npm run build` en `apps/web`; y `python -m pytest -q` en `services/api` con el entorno de pruebas FastAPI, no con `.venv-worker`.
