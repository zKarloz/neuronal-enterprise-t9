# NeuroLab Enterprise v0.11.0 — M10: administración, RBAC y auditoría

## Alcance real

Primera entrega de administración **por proyecto**: gestión de miembros registrados, permisos en API, trazabilidad y límites. No representa todavía una consola de administrador global ni un mecanismo de invitaciones por correo; un integrante debe iniciar sesión con Google al menos una vez antes de poder añadirse por su email verificado.

## Matriz de permisos

| Acción | Propietario | Responsable | Ingeniero | Revisor | Lector |
|---|---|---|---|---|---|
| Ver proyectos autorizados, datasets, métricas, reportes y modelos | Sí | Sí | Sí | Sí | Sí |
| Crear versiones de arquitectura, subir/preparar datasets y entrenar | Sí | Sí | Sí | No | No |
| Editar el nombre/estado del proyecto | Sí | Sí | No | No | No |
| Nombrar, anotar modelos | Sí | Sí | Sí | Sí | No |
| Promover/archivar modelos en M08 | Sí | Sí | No | Sí | No |
| Añadir y retirar ingenieros, revisores y lectores | Sí | Sí | No | No | No |
| Añadir o modificar responsables | Sí | No | No | No | No |
| Consultar auditoría del proyecto | Sí | Sí | No | Sí | No |
| Borrar proyecto (si no tiene recursos asociados) | Sí | No | No | No | No |

La propiedad está en `projects.owner_id` y no puede transferirse por `PATCH /members`. Ningún cliente puede establecer el rol `owner`.

## Endpoints protegidos

- `POST /api/v1/me/register`: registra/actualiza el usuario autenticado a partir del JWT validado. No recibe correo desde JSON.
- `GET /api/v1/projects/{project_id}/administration/access`: rol actual y miembros del proyecto.
- `POST /api/v1/projects/{project_id}/administration/members`: añade cuenta previamente registrada por correo verificado.
- `PATCH /api/v1/projects/{project_id}/administration/members/{user_id}`: cambia rol, según jerarquía.
- `DELETE /api/v1/projects/{project_id}/administration/members/{user_id}`: revoca acceso.
- `GET /api/v1/projects/{project_id}/administration/audit?limit=20&offset=0`: eventos (solo responsable, propietario y revisor). Máximo 100 por consulta.
- `GET /api/v1/projects/{project_id}/administration/resources`: uso real y cuotas del proyecto.

Las rutas existentes de datasets, arquitecturas, entrenamiento y modelos también comprueban permisos. Los streams SSE vuelven a verificar pertenencia durante la conexión, de manera que la revocación surte efecto sin esperar a que el stream termine.

## Datos y límites

Migración necesaria `006_administration_audit`: agrega `audit_events.target_id`, `audit_events.details_json` e índice por proyecto/fecha. Las columnas antiguas se conservan. No se guardan correos ni credenciales en los detalles de auditoría; solo cambios estructurados de roles y UUID del miembro.

Cuotas iniciales configurables con variables de entorno de Render:

```dotenv
MAX_PROJECTS_PER_USER=20
MAX_MEMBERS_PER_PROJECT=20
MAX_DATASETS_PER_PROJECT=50
MAX_ARCHITECTURES_PER_PROJECT=100
```

Se mantiene el límite previo de un entrenamiento activo por proyecto. Un error `409` indica cuota alcanzada y `403` permisos insuficientes. El servidor puede aplicar estos límites aunque se eludan los controles del frontend. Los contadores no incluyen archivos físicamente huérfanos en Storage: se trata de registros en PostgreSQL.

## Orden seguro de despliegue

1. Crear rama desde `main` y aplicar parche en la raíz. Ejecutar pruebas locales.
2. Abrir PR hacia `main`; CI debe aprobar frontend (tests, typecheck, build) y API.
3. Antes de desplegar FastAPI v0.11.0, **hacer copia de seguridad de PostgreSQL** y ejecutar `alembic upgrade head` desde `services/api` con la `DATABASE_URL` del entorno de producción. La migración requiere los permisos SQL correspondientes. Verificar `alembic current` = `006_administration_audit`.
4. Desplegar la API en Render (si el despliegue automático empieza al merge, aplicar migración **antes de que atienda tráfico**; alternativamente realizar la migración durante una ventana de mantenimiento o configurar un pre-deploy command gestionado).
5. Confirmar `/api/v1/health` = `0.11.0` y `/api/v1/ready` = `ready`.
6. Confirmar despliegue del frontend Vercel. **No es necesario reiniciar el worker ni crear buckets nuevos.**

> Importante: no ejecutar una nueva versión del backend que lee `audit_events.target_id` y `details_json` antes de migrar. Eso podría provocar HTTP 500. La migración 006 es aditiva y las versiones antiguas de API pueden continuar operando durante la transición.

## Pruebas funcionales reales

1. Inicia sesión con la cuenta propietaria y abre Administración → Servidor, eligiendo un proyecto.
2. Confirma miembros (propietario), auditoría de acciones y cuotas verdaderas.
3. Abre NeuroLab con una segunda cuenta Google, para registrarla con `POST /me/register` desde el topbar. No compartas sesiones ni credenciales.
4. Desde propietario, añade el correo de esa cuenta como `reader`; verifica que pueda consultar proyecto, modelos y reportes, **pero no** modificar datasets o crear entrenamientos.
5. Cambia su rol a `engineer`; comprueba que pueda crear una arquitectura y no modificar miembros.
6. Cámbiala a `reviewer`; comprueba auditoría y cambio de etapa de un modelo existente, sin permiso para crear trabajos.
7. Retira el acceso y verifica que desaparezca el proyecto de su lista. Si tenía un SSE abierto, debe dejar de recibir snapshots.
8. Comprueba que una cuenta ajena sin invitación reciba `404`, sin revelar nombres o identificadores de otros proyectos.
9. Prueba la paginación de auditoría y recarga la ruta `/administracion?vista=servidor`.

La validación automatizada usa SQLite y fakes: no sustituye las pruebas manuales contra Render/PostgreSQL/Supabase ni un pentest. El rol global de administrador, invitaciones pendientes, políticas de retención y límites por plan se considerarán en futuras entregas.
