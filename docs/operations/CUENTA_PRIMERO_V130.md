# NeuroLab Enterprise v0.13.0 — Cuenta primero

## Objetivo y alcance

La aplicación requiere **correo y contraseña** de Supabase Auth antes de mostrar los diez módulos. Los proyectos, arquitecturas, filas CSV, entrenamientos, métricas y pesos TensorFlow.js se recuperan automáticamente de PostgreSQL para el UUID autenticado. Feedforward y CNN se siguen entrenando en **el navegador** (CPU/GPU compatible), nunca en el worker.

La interfaz de Google OAuth y las pantallas antiguas de servidor dejan de importarse. La API de Google OAuth deja de publicarse. El código histórico permanece en el repositorio, sin exposición en la interfaz, para permitir una retirada controlada. **Ninguna operación elimina usuarios, buckets ni datos antiguos de producción.**

## Limitaciones conocidas, importantes para la evaluación

- Esta etapa reutiliza `browser_workspace_backups` (migración `007_browser_workspace_backups`) como documento de cuenta con **máximo de 3 MiB** y revisionado optimista. Es **almacenamiento remoto real**, pero no está preparado para decenas de CSV grandes o gran cantidad de modelos. La siguiente etapa debe separar datasets y pesos grandes en Supabase Storage privado.
- Hay **autoguardado al modificar datos** con espera aproximada de 700 ms y escrituras seriales. El texto «Guardado en la nube» solo aparece tras respuesta del servidor. Si no se puede guardar, la interfaz muestra un aviso y no permite cerrar sesión desde el menú durante ese estado.
- Si dos navegadores editan la **misma cuenta al mismo tiempo**, el servidor responderá `409` al que tenga una revisión obsoleta. Esta versión **no fusiona cambios automáticamente**; recarga tras resolver el aviso. No sobreescribir a ciegas.
- Los proyectos antiguos guardados en `localStorage` bajo `neurolab-enterprise-workspace-v1` **no se importan**. Se dejan intactos en el navegador para evitar borrados irreversibles, pero **no se muestran** ni se mezclan con las cuentas nuevas. Puedes borrarlos manualmente más adelante.
- No se convierten los `.keras` históricos de Keras/Python al formato TensorFlow.js. Permanecen almacenados por separado y no forman parte del laboratorio nuevo.
- Las pruebas unitarias de backend y núcleo no sustituyen las pruebas de login, correo y dos cuentas en producción.

## Configuración previa (Supabase)

1. En **Supabase → Authentication → Providers → Email**, habilitar Email/Password. **Mantener Confirm Email activado** para cuentas reales.
2. Preparar correo transaccional en **Authentication → SMTP Settings** con un proveedor como Resend o Brevo. El correo predeterminado de Supabase restringe destinatarios externos y tiene tasas muy bajas; para usuarios reales hace falta SMTP propio. Configurar host, puerto, usuario, contraseña SMTP y remitente verificado en Supabase (nunca en React). El dominio remitente debe estar verificado, con SPF/DKIM correspondientes.
3. En **Authentication → URL Configuration**, fijar Site URL: `https://neurolab-enterprise-zeta.vercel.app` y autorizar la URL de retorno necesaria para recuperación de contraseña. El cliente reconoce el flujo *implicit* de Supabase con `#access_token=…&type=recovery`, elimina inmediatamente el fragmento de la URL y permite establecer una contraseña nueva.
4. **No desactivar Google ni borrar usuarios anteriores** hasta terminar la validación de los nuevos accesos. Luego puedes desactivar Google como proveedor desde Supabase, si no existe otra aplicación que lo necesite.
5. Si un correo existente ya se registró **solo con Google**, crear una **cuenta nueva diferente** para la prueba. Suprimir o migrar identidades anteriores requiere revisar sus datos primero; no hacerlo automáticamente.

## Configuración Render

La API continúa desplegada en Render pero ya **no entrena** modelos. Reutiliza sus variables existentes `DATABASE_URL`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `FRONTEND_ORIGINS` y añade:

```dotenv
AUTH_FRONTEND_URL=https://neurolab-enterprise-zeta.vercel.app
```

Para producción `FRONTEND_ORIGINS` debe contener la URL HTTPS exacta de Vercel. El backend debe tener aplicada la migración `007_browser_workspace_backups`; si la recuperación de proyectos de v0.12.3 ya funcionaba, la tabla probablemente ya existe. Verificar con `python -m alembic -c alembic.ini current`. **v0.13.0 no añade migración**. `/api/v1/health` debe devolver `0.13.0` tras el despliegue.

Las claves privadas (`DATABASE_URL`, `SUPABASE_SECRET_KEY`, service role, SMTP) **nunca** deben aparecer en `apps/web/.env.local`, código fuente, Vercel ni GitHub.

## Preparación local y Pull Request

**Antes** de extraer el parche ZIP:

```bash
git status --short
git switch main
git pull --ff-only origin main
git switch -c refactor/cuenta-primero-v0.13.0
```

Extrae el ZIP del parche en la raíz del repositorio. Las instrucciones de este archivo **sí** están en `docs/operations`.

```bash
cd apps/web
npm install
npm run test:core
npm run test:tfjs
npm run typecheck
npm run build

cd ../../services/api
# Si el entorno worker está activo, usar primero `deactivate`.
python -m pip install -r requirements-dev.txt
python -m pytest -q

cd ../..
git add README.md apps/web services/api/app services/api/tests services/api/.env.example docs/operations/CUENTA_PRIMERO_V130.md
git diff --cached --check
git diff --cached --stat
git diff --cached --name-only
git commit -m "refactor: exigir cuenta Supabase y guardar proyectos automáticamente"
git push -u origin refactor/cuenta-primero-v0.13.0
```

Abrir PR desde `refactor/cuenta-primero-v0.13.0` hacia `main`. **No hacer merge** hasta que GitHub Actions, las pruebas y la configuración SMTP estén listas. No ejecutar el worker. No tocar las tablas de proyectos antiguos.

## Prueba funcional obligatoria después del despliegue

1. En Brave, sin una sesión v0.13.0, la página muestra exclusivamente el formulario de login/registro; no se puede entrar al Dashboard.
2. Registrar `cuenta-a@example…` con contraseña robusta y confirmar el correo. Iniciar sesión: el Dashboard debe mostrar cero proyectos. Crear proyecto, importar dataset, entrenar Feedforward y esperar a ver **Guardado en la nube** antes de cerrar la pestaña.
3. Entrar en Firefox con la **misma cuenta**: aparecen el proyecto, el CSV, métricas, pesos y predicción. No hace falta pulsar recuperar copia.
4. Salir de Brave, entrar con una **segunda cuenta**: la lista debe estar vacía. Volver a iniciar con la primera cuenta: vuelven sus proyectos sin ver los de la segunda.
5. Durante un error de conexión/409, debe advertirse **Sin guardar** o un error persistente; no mostrar datos de otra cuenta ni afirmar que el guardado se completó.
6. Probar «Olvidé mi contraseña» mediante correo de recuperación. Si el remitente SMTP no está configurado, resolverlo antes de aprobar la versión.
7. En M06 probar Feedforward y CNN con el worker apagado; en M08 comprobar predicciones y en M09 reportes con datos reales.

## Seguridad

- JWT validado por FastAPI; no se confía en identificadores de usuario enviados por React.
- Cada respaldo se consulta/actualiza mediante `identity.id` validado por el servidor; no se aceptan emails como claves de acceso.
- La renovación de sesión no desmonta un entrenamiento activo; el montaje del laboratorio depende del UUID de cuenta y se desmonta al cerrar sesión.
- Una escritura diferida comprueba que el JWT vigente siga correspondiendo al mismo UUID antes de enviarse.
- Las revisiones serializadas protegen de escrituras paralelas y cambios de otro dispositivo.

