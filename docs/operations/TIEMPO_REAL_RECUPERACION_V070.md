# NeuroLab Enterprise v0.7.0 — M06 en vivo, recuperación de trabajos y M07 remoto

## Alcance implementado

- **M06 SSE:** `GET /api/v1/projects/{project_id}/training-jobs/{job_id}/events` con autenticación Bearer. Envía `event: snapshot` con estado, métricas y registro de modelo de **ese trabajo**. Desconecta al finalizar o a los 45 s; el navegador reconecta si el job continúa. Ping de cortesía cada 12 s.
- **Respaldo REST:** si falla SSE o un proxy bloquea streaming, M06 mantiene consultas REST periódicas; nunca coloca JWT en la URL.
- **Recuperación supervisada:** el worker registra `heartbeat_at` cada 10 segundos e incluye un token de sesión. Al arrancar/consultar la cola, un worker marca `FAILED` los trabajos `PREPARING` o `RUNNING` sin señales durante 10 minutos. **No reejecuta automáticamente** épocas incompletas: evita entrenamiento duplicado y falsas reanudaciones.
- **Reintento manual:** `POST /api/v1/projects/{project_id}/training-jobs/{job_id}/retry`, accesible solo a editores para trabajos `FAILED`/`CANCELLED`, copia snapshots y crea un **nuevo ID** que apunta al original, conservando las métricas históricas. Sigue el límite de un entrenamiento activo por proyecto.
- **Fencing:** un worker con token caducado no puede guardar métricas, finalizar o registrar un nuevo modelo tras la recuperación del trabajo.
- **M07 remoto:** pestaña `Servidor` con curvas reales, métricas test y comparación opcional de ejecuciones; muestra aviso si los datasets no coinciden. Se mantiene intacto M07 local.

## Limitaciones explícitas

- La recuperación **no retoma el estado exacto del optimizador Keras**; eso requiere checkpoints completos y será otra fase. Un trabajo interrumpido se marca como fallido y el usuario puede reintentarlo **desde cero**.
- Los trabajos se detectan como abandonados **cuando hay un worker v0.7 en marcha**; no hay monitor 24/7 en los planes gratuitos.
- La conexión SSE depende de Render/proxy. M06 usa polling REST como respaldo y no promete latencia exacta.
- Si el worker muere durante una subida a Storage, podría quedar un objeto privado huérfano; un registro de modelo válido solo se crea si conserva el token de sesión.
- M07 no genera nuevas evaluaciones: presenta métricas reales de test/validación ya producidas por los trabajos v0.6/v0.7.
- No contiene descarga de modelos ni entrenamiento servido por GitHub Actions; se conservan los límites y permisos v0.6.

## Aplicación segura en tu repositorio

1. `git switch main && git pull origin main && git switch -c feature/tiempo-real-recuperacion-v0.7.0`.
2. Descomprimir el **parche v0.7.0** en la raíz `neuronal-enterprise/`, conservando la estructura.
3. En `apps/web`: `npm install`, `npm run test:core`, `npm run typecheck`, `npm run build`.
4. En `services/api`: `python -m pip install -r requirements-dev.txt`, `python -m pytest -q`.
5. Crear el PR; verificar GitHub Actions. **No fusionar antes de verificar las pruebas.**
6. Antes de migrar, dejar terminar las ejecuciones activas; detener el worker v0.6 con Ctrl+C cuando esté inactivo.
7. En `services/api`, apuntando a la **misma base Supabase**: `python -m alembic upgrade head` y `python -m alembic current`, resultado `004_live_recovery (head)`.
8. Fusionar a main y dejar que Render/Vercel publiquen v0.7; comprobar `/api/v1/health` versión `0.7.0`.
9. En la raíz del repo, activar `.venv-worker` y usar `uv pip install -r workers/training/requirements.txt` si cambian paquetes; arrancar `python -m workers.training.run` con el código actualizado.
10. En M06 → Servidor, enviar un entrenamiento: observar etiqueta `SSE · en vivo`, épocas y estado. En M07 → Servidor, verificar curvas e historial.
11. En entorno de prueba, cancelar un trabajo y usar **Reintentar trabajo**; confirmar nuevo ID e historial anterior.
12. La prueba de recuperación de un worker caído es opcional y debe hacerse con un dataset no sensible. No manipular datos SQL manualmente ni interrumpir trabajos productivos.

## Datos y seguridad

- No configurar secretos en GitHub Actions ni en Vercel; se usan los mismos `.env` y buckets privados de v0.6.
- SSE valida el proyecto y el job antes de iniciar el stream; no filtra `storage_key`, `worker_token` ni contraseñas.
- El esquema 004 agrega columnas **nullable** y preserva trabajos y modelos antiguos.

## Commit sugerido

`feat: incorporar seguimiento SSE, recuperación y evaluación remota`
