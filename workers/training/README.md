# Worker neuronal NeuroLab v0.9.0

Procesa trabajos **Feedforward y CNN 8×8** desde PostgreSQL y guarda modelos Keras en Supabase Storage privado.
TensorFlow solo está instalado en el worker, no en el servicio FastAPI de Render.

Iniciar desde la raíz del repositorio: `source .venv-worker/Scripts/activate && python -m workers.training.run`.

Prueba CNN con dígitos UCI reales (sin secretos):
`python -m workers.training.cnn_smoke_test`.

El worker no utiliza GitHub Actions para procesar los trabajos de usuarios.
