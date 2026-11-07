# v0.12.3 — Copias privadas del laboratorio TensorFlow.js por cuenta

## Objetivo y alcance

El entrenamiento Feedforward y CNN **permanece exclusivamente en el navegador**. El servicio FastAPI sirve para guardar y recuperar un respaldo manual, de modo que una persona autenticada con Google pueda transportar su espacio de trabajo a otra computadora sin ejecutar un worker Python.

- **M10 → Administración → Copia privada de tu laboratorio:** «Consultar copia», «Guardar copia en mi cuenta», «Descargar copia de mi cuenta», «Recuperar copia» y «Recuperar archivo JSON local».
- Se conserva **el documento completo de WorkspaceState**: proyectos, arquitecturas, filas del CSV, configuraciones, métricas y pesos numéricos TensorFlow.js/Feedforward.
- Una sola copia por **identidad del JWT**. No depende del correo ingresado en un formulario. Las cuentas no pueden listar ni consultar copias ajenas.
- Límite inicial: **3 MiB de JSON por cuenta**, una sola revisión activa. Las copias demasiado grandes siguen pudiendo descargarse como JSON al equipo local; no se almacenan parcialmente.
- La copia se actualiza con **control de revisión** (`expected_revision`): si otra PC guardó algo, el servidor devuelve HTTP 409 y no sobrescribe el respaldo anterior.
- Recuperar siempre exige confirmación. Cuando existen datos locales, obliga a descargar primero una copia JSON y confirmar su recepción. No se mezclan automáticamente proyectos ni se borra la copia de la cuenta. El JSON descargado puede reimportarse desde Administración, incluso sin iniciar sesión.

## Qué NO hace esta entrega

**No crea sincronización en tiempo real, ni fusiona sesiones concurrentes, ni migra los proyectos Keras históricos a los proyectos del navegador.** Tampoco crea modelos `.keras`, lleva cómputo a Render o introduce ejecución de código en la API. No debe activarse aún un login obligatorio: el estado del navegador continúa en `localStorage` y no se aísla físicamente por usuario del mismo equipo.

El backend almacena contenido completo de datasets/modelos **solo por acción consciente del usuario**. Es posible que contenga datos sensibles: no usar datasets personales en computadoras ajenas y mantener TLS, políticas de acceso, respaldos y credenciales del servidor. PostgreSQL no tiene versiones históricas ilimitadas en esta etapa; descargar una copia antes de sobrescribir la revisión anterior si se necesita conservarla.

## API protegida

- `GET /api/v1/workspace-backup/status` → estado/versión/tamaño/fecha; **no devuelve filas ni pesos**.
- `GET /api/v1/workspace-backup` → contenido del respaldo del usuario autenticado; 404 cuando no existe.
- `PUT /api/v1/workspace-backup` → `{ "expected_revision": 0, "workspace": { ... } }`; 409 por carrera, 413 por tamaño, 422 por datos inválidos. Se registra un evento de auditoría **sin incluir filas o pesos**.

Cabeceras `Authorization: Bearer <JWT>`; no se emplean `service_role` ni claves privadas en React. La API incluye CORS explícito para `PUT`. Las respuestas de lectura fijan `Cache-Control: no-store`.

## Despliegue sin interrumpir datos existentes

1. Crear rama desde `main` limpio; aplicar el parche v0.12.3 y ejecutar pruebas locales. **No fusionar aún.**
2. Respaldar PostgreSQL de producción mediante el método de Supabase correspondiente a la cuenta, y confirmar la base/host contra los que se ejecutará Alembic.
3. Ejecutar en `services/api`, sobre **esa misma** conexión de PostgreSQL: `python -m alembic -c alembic.ini current` (debe mostrar `006_administration_audit`), luego `python -m alembic -c alembic.ini upgrade head`, y `python -m alembic -c alembic.ini current` (debe mostrar `007_browser_workspace_backups`). **No compartir DATABASE_URL en los logs.**
4. Confirmar GitHub Actions en verde. Fusionar a `main` para desplegar API v0.12.3 en Render y frontend v0.12.3 en Vercel. Render debe llegar a `/api/v1/health` v0.12.3 y `/api/v1/ready` operativo. Si Render se despliega con retraso, la copia nueva devolverá 404 hasta que llegue la API; el entrenamiento local sigue funcionando.
5. Mantener intactos `neurolab-datasets`, `neurolab-models`, el registro Keras histórico y el worker Python. La nueva tabla es aditiva.

## Validación funcional (dos navegadores, una cuenta Google)

1. PC A: crear un proyecto de prueba con un CSV tabular y arquitectura Feedforward; entrenar 2–5 épocas y verificar métricas y modelo en M08.
2. PC A: iniciar sesión con Google, abrir M10 → Administración, consultar estado y **guardar copia**; comprobar revisión 1 y fecha.
3. PC B: abrir la aplicación en otro perfil o navegador limpio, iniciar sesión con la **misma cuenta**, consultar copia y recuperar; verificar proyecto, número de filas, arquitectura, métricas y predicción sin worker.
4. PC B: con otro proyecto local, confirmar que exige descargar JSON antes de reemplazar el espacio y que no borra nada hasta aceptar. Restaurar luego el JSON descargado con «Recuperar archivo JSON local» y comprobar que regresan los datos originales.
5. PC A: intentar sobrescribir una versión desactualizada mientras PC B guarda una revisión nueva: debe dar **409** y preservar la versión más reciente.
6. Iniciar sesión con **otra cuenta Google** y consultar estado: no puede ver el respaldo de la primera; su estado comienza vacío.
7. Verificar que los archivos `.keras` antiguos continúan en el archivo histórico y no aparecen como modelos TensorFlow.js.

## Pruebas automáticas

- Frontend: `npm run test:core`, `npm run test:tfjs`, `npm run typecheck`, `npm run build` desde `apps/web`.
- Backend: `python -m pytest -q` desde `services/api`; CI añade una migración SQLite desde cero y confirma revisión 007.
- La migración SQLite de desarrollo **no equivale** a probar en PostgreSQL. Hacer respaldo real y revisar migración antes de actualizar Render.

## Próxima etapa

Versionado/merge selectivo de proyectos, persistencia con IDs por cuenta, almacenamiento optimizado (por ejemplo, separar CSV grandes/modelos en Storage privado), pruebas de cuota y aislamiento entre cuentas en navegadores compartidos. **No habilitar sincronización automática hasta completar esa política.**
