# M06: curvas en vivo de entrenamiento — v0.8.1

## Objetivo

Visualizar la evolución real de **pérdida** y **precisión** mientras un trabajo Keras se ejecuta en el worker remoto, aprovechando las métricas persistidas por FastAPI y el streaming SSE autenticado ya disponible desde v0.7.0.

## Flujo de datos

`Keras (fin de época) → PostgreSQL → FastAPI SSE autenticado → M06 → MetricChart SVG`.

- El navegador únicamente dibuja las épocas que devuelve el servidor; no calcula, genera ni interpola métricas ficticias.
- El evento `snapshot` contiene el estado del trabajo y su lista de épocas. Se almacenan por `job_id` y se fusionan por número de época para evitar pérdidas por respuestas retrasadas.
- En caso de corte de SSE, M06 usa consultas REST de respaldo, que completan las épocas faltantes sin borrar las ya vistas.
- Al abrir un trabajo anterior, `GET /training-jobs/{id}/metrics` reconstruye su curva desde PostgreSQL.
- Para clasificación: dos gráficos, pérdida y precisión. Para regresión: únicamente pérdida (no existe `accuracy`).
- Se mantienen los estados `QUEUED`, `PREPARING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`; los resultados finales y los artefactos `.keras` siguen sin cambios.

## Verificación y límites

Ejecutar desde `apps/web`:

```bash
npm run test:core
npm run typecheck
npm run build
```

La serie de pruebas `tests/remote-metrics.test.cjs` comprueba ordenación y deduplicación de épocas, protección frente a respuestas REST antiguas, ausencia de precisión para regresión y conservación de valores de clasificación.

Se esperan **21 pruebas de frontend** en total. La actualización es al final de cada época (no cada batch). Si el worker finaliza una época en muy poco tiempo, pueden aparecer varios puntos juntos. La recepción depende de la conexión SSE y, en su defecto, del polling REST. **No hay migración de base de datos ni nuevo secreto.**

## Alcance

Solo interfaz v0.8.1: `RemoteTraining`, `MetricChart`, versión visible en `App`, adaptador de métricas y pruebas. No cambia la lógica de aprendizaje, Early Stopping, autorización, versionado de modelos ni M07.
