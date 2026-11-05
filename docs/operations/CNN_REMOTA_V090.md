# CNN remota v0.9.0 — Contrato y operación

## Alcance

M06 incorpora la familia `cnn_8x8` sin cambiar las tablas de PostgreSQL. Un `ArchitectureRecord` guarda el campo `family` y un snapshot inmutable. Entrenar solo es posible cuando la preparación de M05 cumple estos requisitos:

- CSV UTF-8 de hasta 5 MiB, hasta 20.000 registros y ahora **hasta 65 columnas**.
- Columnas de entrada **numéricas y ordenadas** exactamente `pixel_0` … `pixel_63`; columna objetivo distinta (en UCI: `label`).
- Tarea `classification`, de 2 a 50 clases, preparación `pipeline_version=1` y 64 dimensiones codificadas.
- Particiones exclusivas train/validation/test; las estadísticas de imputación/escalado se obtienen exclusivamente de train y se usan en las demás particiones.

## Arquitectura y ejecución

La familia CNN se configura con `conv_filters` entre 4 y 32, `kernel_size=3` y `dense_units` entre 8 y 128. El worker reconstruye imágenes de `8×8×1` y ejecuta `Conv2D(ReLU,padding=same) → MaxPooling2D(2×2) → Flatten → Dense(ReLU) → Dense(softmax)`. La salida utiliza el número real de clases; Adam y `sparse_categorical_crossentropy` como antes.

Se mantienen las mismas reglas de trabajos persistidos, métricas por época, control de propiedad, Heartbeat/fencing, cancelación cooperativa, Early Stopping, evaluación independiente y guardado `.keras` privado. No se requiere GPU ni una instancia nueva en Render.

## Pruebas y despliegue

1. Ejecutar `python -m pytest -q` desde `services/api` (esperadas: 41 pruebas).
2. Ejecutar `npm install`, `npm run test:core`, `npm run typecheck`, `npm run build` desde `apps/web`.
3. Con el entorno TensorFlow/Python 3.12: `python -m workers.training.cnn_smoke_test` desde la raíz del repositorio. Verifica datos UCI reales; las métricas de exactitud no se predefinen.
4. Crear PR, comprobar GitHub Actions. El workflow manual `NeuroLab — verificación Keras CPU` incluye la prueba CNN tras fusionar.
5. Detener worker mientras esté ocioso; desplegar API y frontend a **0.9.0** y ejecutar `git switch main && git pull --ff-only origin main`, luego reiniciar el worker local.
6. En M05 → Servidor subir `apps/web/public/datasets/digits-8x8.csv`, elegir `label`, Clasificación, validación 15 %, prueba 15 %, semilla 42.
7. En M06 crear arquitectura `CNN - Dígitos 8×8` con 8 filtros y 16 neuronas densas; encolar 3–5 épocas, batch 32, learning rate 0.001, semilla 42.
8. Observar SSE, curvas en vivo, historial M07 y artefacto en bucket privado `neurolab-models`.

## Seguridad y limitaciones

- Nunca subir `services/api/.env` ni claves privadas al repositorio.
- Los modelos `.keras` de terceros son artefactos potencialmente peligrosos al cargarlos: no implementar carga de modelos no confiables por parte de usuarios sin aislamiento.
- El CSV 8×8 no debe confundirse con imágenes de alta resolución; no se admiten rutas de archivo ni expresiones de código arbitrarias.
- La CNN es de un solo bloque convolucional, preparada para entrenamientos ligeros en CPU. Familias CNN avanzadas y otros tamaños quedan para una fase posterior.
- Los entrenamientos no continúan si el worker está apagado; una interrupción se detecta por heartbeat y requiere reintento explícito.
- **El smoke test Keras y el build React deben ejecutarse en el entorno del usuario o CI** antes de considerar la versión estable.
