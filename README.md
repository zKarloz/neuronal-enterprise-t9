# NeuroLab Enterprise v0.9.0 — CNN remota de imágenes 8×8

Plataforma modular React/TypeScript/Tailwind/Lucide + FastAPI + PostgreSQL/Supabase + TensorFlow/Keras.

**Nuevo en v0.9.0:** M05 admite hasta 65 columnas CSV; M06 permite arquitecturas remotas Feedforward y CNN 8×8. Las CNN procesan 64 píxeles numéricos (`pixel_0`...`pixel_63`) y una etiqueta, con Conv2D + MaxPooling + Dense. El worker registra métricas por época mediante PostgreSQL y SSE, aplica Early Stopping y guarda el `.keras` privado.

- Se mantienen los 10 módulos, TensorFlow.js local, Feedforward remoto, SSE y gráficas en vivo, reintentos y registro de modelos.
- **No requiere migración adicional** a `005_registry_early_stopping`, ni buckets o credenciales nuevas.
- Requiere desplegar FastAPI **v0.9.0** y actualizar el worker Python local para entrenamientos CNN; detener el worker anterior si hay trabajos activos.
- Entrada CNN limitada deliberadamente a **8×8, un canal, clasificación**; no se aceptan imágenes arbitrarias, categorías o un CSV tabular cualquiera de 64 características.
- Dataset público incluido: `apps/web/public/datasets/digits-8x8.csv` (UCI, 1797 imágenes, 65 columnas).

Lee `INSTRUCCIONES_PARCHE_V090.md` y `docs/operations/CNN_REMOTA_V090.md`.
