# NeuroLab Enterprise v0.11.0 — M10: roles, auditoría y cuotas

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

## Frontend v0.10.1 y v0.10.2

- **v0.10.1:** panel de cuenta, M04 remoto, toasts flotantes, spinner y tema oscuro neutro.
- **v0.10.2:** formularios remotos de Proyectos y Entrenamientos dentro de modales comunes; preparación y vista previa de Datasets en diálogos; subpestaña de modelos con cuadrícula 2×2 en Evaluación; paginación de informes locales y remotos con 5/10/20 (predeterminado 5); panel local y de servidor visualmente alineados; avisos informativos una vez por sesión; bordes y tarjetas atenuados en modo oscuro.
- Solo cambia `apps/web`: API y worker se mantienen en sus versiones actuales. No hay migraciones ni cambios de buckets.

Consulta `docs/operations/EXPERIENCIA_USUARIO_V102.md`.

## v0.11.0 — Administración y seguridad por proyecto

- M10 ofrece pestañas Navegador/Servidor, administración de integrantes y roles en proyectos remotos, auditoría paginada y cuotas consultables.
- Roles por proyecto: propietario implícito, responsable, ingeniero, revisor y lector. FastAPI vuelve a verificar los permisos en cada acción; el frontend no es una barrera de seguridad.
- Un responsable no puede nombrar o modificar a otros responsables. Solo el propietario puede nombrarlos. El revisor puede cambiar la etapa de un modelo, pero no iniciar entrenamientos.
- Una cuenta debe iniciar sesión una vez para registrarse antes de ser añadida por correo; no hay envío de invitaciones en esta etapa.
- Se añade la migración **`006_administration_audit`** y se mantiene el worker de entrenamiento sin modificaciones.
- Los límites configurables (`MAX_PROJECTS_PER_USER`, `MAX_MEMBERS_PER_PROJECT`, `MAX_DATASETS_PER_PROJECT`, `MAX_ARCHITECTURES_PER_PROJECT`) se aplican en FastAPI y no dependen del navegador.
- Administrador **global**, políticas de retención automatizadas, alertas y cuotas dinámicas por plan quedan fuera de esta primera implementación de M10.

Ver `docs/operations/ADMINISTRACION_RBAC_V110.md`.
