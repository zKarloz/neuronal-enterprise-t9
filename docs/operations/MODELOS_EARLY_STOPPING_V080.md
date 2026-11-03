# NeuroLab Enterprise v0.8.0 — Registro de modelos y Early Stopping

## Objetivo

La primera entrega v0.8.0 refuerza el flujo Feedforward existente; no integra todavía CNN remota.

- M06 permite activar Early Stopping por `val_loss`, con paciencia de 1 a 10 épocas.
- Se guardan los pesos de la mejor validación (`restore_best_weights=True`) y la evaluación final se realiza **una sola vez** sobre test independiente.
- El contador real de épocas queda en `training_metrics`, incluso si Keras termina antes del máximo solicitado.
- M07 muestra nombre, notas, estado (`candidate`, `production`, `archived`), época óptima, épocas ejecutadas y SHA-256. No reescribe artefactos ni métricas.
- Al promover un modelo a producción, el anterior se convierte en candidato. El backend usa bloqueo por proyecto y un índice único parcial en PostgreSQL.
- Los permisos y auditoría continúan gestionados por FastAPI. Nunca se expone la clave de Storage.

## Despliegue controlado

1. Conservar la versión estable v0.7.0 hasta superar las pruebas locales y GitHub Actions.
2. Detener el worker y dejar la cola vacía.
3. Aplicar migración `005_registry_early_stopping` contra PostgreSQL de Supabase **antes de desplegar la API 0.8.0**. No borrar historial.
4. Publicar FastAPI v0.8.0 y M06/M07 desde main; comprobar `/api/v1/health`.
5. Reiniciar el worker desde `.venv-worker` (Python 3.12, TensorFlow 2.20.0).
6. Importar Iris y Wine, configurar M05 con target `target`, semilla 42 y partición 70/15/15, y comparar Early Stopping activado/desactivado en M06.
7. Comprobar en M07 modelos anteriores y nuevos, editar notas, promover un candidato, y acceso restringido entre usuarios.

**Precaución:** los modelos anteriores tendrán `best_epoch`, `epochs_trained` y `early_stopped` en NULL: no se inventan estadísticas históricas. Las pérdidas y SHA originales se conservan.

## Riesgo y limitaciones

El worker corre en una computadora; no es disponibilidad 24/7. Early Stopping mejora el criterio de selección de pesos, pero no garantiza una mejora de accuracy. El estado `production` es un metadato del registro, **no activa aún un endpoint de inferencia servido continuamente**. No subir datos personales para ensayos.
