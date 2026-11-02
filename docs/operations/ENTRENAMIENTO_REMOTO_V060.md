# NeuroLab Enterprise v0.6.0 — Primer entrenamiento remoto Feedforward

## Alcance

- M04 remoto: arquitectura Feedforward (1–4 capas densas de 2–128 neuronas), guardada como versión inmutable.
- M05: reutiliza los CSV privados y preprocesamiento train/validation/test preparados en v0.5.0.
- M06: encola entrenamientos, muestra el estado y métricas reales por época, solicita cancelación.
- Worker de Python independiente de FastAPI y Vercel, usando TensorFlow/Keras CPU.
- M08, fase inicial: registro de artefactos `.keras` y métricas de test, sin descarga desde UI.
- GitHub Actions para tests CI y entrenamiento de verificación manual sin credenciales.

## Seguridad y decisiones

- El frontend llama únicamente a FastAPI; JWT de Google/Supabase para autorización.
- Worker lee la base y Storage con claves privadas fuera de GitHub; nunca en Vercel.
- La API no instala TensorFlow: corre en un proceso independiente para evitar bloqueos HTTP.
- PostgreSQL registra `QUEUED`, `PREPARING`, `RUNNING`, `COMPLETED`, `FAILED`, `CANCELLED`; el worker persiste las métricas de cada época.
- Los índices y escaladores se congelan al crear el job; train sirve para ajustar; test solo para evaluación final.
- Supabase Storage almacena `.keras` en bucket privado `neurolab-models` y conserva SHA-256.
- Máximo un job activo por proyecto, 40 épocas, 256 batch size; solo CPU para esta fase.

## 1. Crear una rama desde main

```bash
git switch main
git pull origin main
git switch -c feature/entrenamiento-v0.6.0
```

Aplica el parche de v0.6.0 en la raíz del repositorio y revisa `git status`.

## 2. Instalar y validar

En `apps/web`:

```bash
npm install
npm run test:core
npm run typecheck
npm run build
```

En `services/api` (entorno Python 3.12 recomendado):

```bash
python -m pip install -r requirements-dev.txt
# Desde la raíz, para incluir workers/ en imports:
cd ../..
PYTHONPATH="services/api:." python -m pytest -q services/api/tests
```

Git Bash en Windows admite `PYTHONPATH=...` antes de un comando. Alternativamente ejecuta `python -m pytest -q` dentro de `services/api`, ya que las pruebas de la API no requieren TensorFlow y detectan `workers` desde la raíz si se configuró el entorno.

## 3. Crear bucket privado y migrar la base

Supabase → Storage → New bucket:

- Nombre: `neurolab-models`.
- Acceso **privado**.
- Tamaño máximo sugerido: 50 MB para las pruebas iniciales.
- No restringir a `text/csv`: los artefactos son `.keras` / `application/octet-stream`.

En `services/api/.env` agrega `MODEL_BUCKET=neurolab-models` y conserva el `SUPABASE_SECRET_KEY` (solo servidor), `DATABASE_URL` y `SUPABASE_URL`. En Render configura también `MODEL_BUCKET` si cambiaste el nombre predeterminado. **No pongas estas claves en GitHub Actions ni en Vercel.**

Desde `services/api` ejecuta:

```bash
python -m alembic upgrade head
python -m alembic current
```

Resultado esperado: `003_training (head)`.

## 4. Instalar worker local (Python 3.12 separado)

Desde la raíz, con Python 3.12:

```bash
py -3.12 -m venv .venv-worker
source .venv-worker/Scripts/activate    # Git Bash en Windows
python -m pip install --upgrade pip
python -m pip install -r workers/training/requirements.txt
python -c "import tensorflow as tf; print(tf.__version__)"
```

El worker carga `services/api/.env` local (y respeta variables de entorno ya definidas). Confirma que el archivo tiene la conexión PostgreSQL y el secreto privado de Storage. Inícialo desde la raíz:

```bash
python -m workers.training.run
# Alternativa: atender máximo un trabajo y salir
python -m workers.training.run --once
```

Usa **una única instancia** para empezar. El worker se mantiene activo en tu equipo y consulta cada cinco segundos la cola persistida. Los entrenamientos corren aunque cierres Vercel, **mientras el worker siga funcionando**.

## 5. Publicar y probar

1. Sube la rama a GitHub y verifica que GitHub Actions CI pase (no contiene secretos).
2. Aplica la migración `003_training` **antes** de desplegar el código en Render.
3. Una vez revisado, fusiona a `main`, comprueba `/health` devuelve `0.6.0` y Vercel compila.
4. En M05 → Servidor, utiliza un CSV remoto preparado con 2–50 clases o regresión.
5. En M06 → Servidor, guarda una arquitectura Feedforward y encola un job.
6. Comprueba los estados reales y las métricas de cada época; luego `COMPLETED` y un modelo en el bucket privado.
7. Recarga la web y comprueba recuperación del estado y métricas desde PostgreSQL.
8. Prueba otro usuario que no sea propietario: no puede leer ni cancelar trabajos ajenos.

## 6. GitHub Actions

- `NeuroLab — pruebas de frontend y API`: ejecuta en PR y push a main, sin credenciales.
- `NeuroLab — verificación Keras CPU`: ejecución manual `Actions → Run workflow`, entrena sobre los 1.797 dígitos UCI incluidos. No consume los jobs de usuarios y no necesita secretos.
- No utilizar runners de GitHub como workers HTTP permanentes ni como sistema para atender los trabajos de usuarios.

## Limitaciones declaradas

- Sin GPU, sin SSE (lectura REST cada 8 s), sin recuperación automática de un job interrumpido a mitad de una época, sin reintentos automáticos.
- El estado `RUNNING` puede quedar sin finalizar si el worker desaparece de forma abrupta: no lanzar un segundo worker sobre ese trabajo ni editar manualmente el estado sin diagnosticarlo.
- La cancelación de trabajos que ya ejecutan `model.fit` es cooperativa al finalizar la época.
- Almacenamiento de modelos en bucket privado; M08 todavía no permite descargar/importar ese `.keras`.
- El modelo remoto no es automáticamente compatible con TensorFlow.js del navegador.
- La API gratuita de Render y el worker local no sustituyen infraestructura de producción con workers supervisados, cuotas, monitoreo y retención.

## Commit sugerido

```text
feat: incorporar entrenamiento Feedforward remoto y pruebas Keras en GitHub Actions
```
