# NeuroLab Enterprise v0.10.0 — Registro de modelos, reportes e interfaz unificada

Plataforma modular React/TypeScript/Tailwind/Lucide + FastAPI + PostgreSQL/Supabase + TensorFlow/Keras.

**Base v0.9.0:** M05 admite hasta 65 columnas CSV; M06 permite arquitecturas remotas Feedforward y CNN 8×8. Las CNN procesan 64 píxeles numéricos (`pixel_0`...`pixel_63`) y una etiqueta, con Conv2D + MaxPooling + Dense. El worker registra métricas por época mediante PostgreSQL y SSE, aplica Early Stopping y guarda el `.keras` privado.

- Se mantienen los 10 módulos, TensorFlow.js local, Feedforward remoto, SSE y gráficas en vivo, reintentos y registro de modelos.
- **No requiere migración adicional** a `005_registry_early_stopping`, ni buckets o credenciales nuevas.
- Requiere desplegar FastAPI **v0.9.0** y actualizar el worker Python local para entrenamientos CNN; detener el worker anterior si hay trabajos activos.
- Entrada CNN limitada deliberadamente a **8×8, un canal, clasificación**; no se aceptan imágenes arbitrarias, categorías o un CSV tabular cualquiera de 64 características.
- Dataset público incluido: `apps/web/public/datasets/digits-8x8.csv` (UCI, 1797 imágenes, 65 columnas).

Lee `INSTRUCCIONES_PARCHE_V090.md` y `docs/operations/CNN_REMOTA_V090.md`.

## Mantenimiento v0.9.1

- **CORS:** FastAPI queda envuelto por el middleware CORS exterior, incluyendo respuestas HTTP 500. Se mantiene la lista explícita `FRONTEND_ORIGINS`; un 502 del proveedor no puede corregirse desde FastAPI.
- **M06:** los errores temporales de sincronización se separan de los resultados persistidos, el aviso de encolado se retira cuando el trabajo avanza y las recomendaciones del worker dejan de mostrarse como alerta.
- **Navegación:** los diez módulos tienen URLs propias; la pestaña `Servidor` se conserva en `?vista=servidor`. Compatible con recarga y navegación Atrás/Adelante.
- **Vercel:** `apps/web/vercel.json` aplica la reescritura SPA para abrir rutas directamente.
- **Sin cambios en PostgreSQL, jobs, modelos, worker ni buckets.** La migración sigue en `005_registry_early_stopping`.

Consulta `INSTRUCCIONES_PARCHE_V091.md` y `docs/operations/CORS_AVISOS_NAVEGACION_V091.md`.

## v0.10.0 — Artefactos M08, reportes M09 e interfaz coherente

- M08 permite gestionar modelos Keras remotos y descargarlos mediante FastAPI con autenticación, validación SHA-256 y registro de auditoría. El bucket se mantiene privado.
- M09 puede elaborar fichas y reportes remotos en JSON, CSV y PDF con datos realmente persistidos, limitando el alcance para proteger recursos.
- Acceso Google en el extremo derecho del topbar, usuario real visible, pestañas Navegador/Servidor uniformes y eliminación de etiquetas duplicadas en los encabezados.
- Compatible con la navegación por rutas y con la autenticación, SSE y la cola de entrenamientos existentes.
- Sin migraciones nuevas; se añadió la dependencia Python `reportlab` para exportación PDF.

Consulta `INSTRUCCIONES_PARCHE_V100.md` y `docs/operations/MODELOS_REPORTES_UI_V100.md`.
