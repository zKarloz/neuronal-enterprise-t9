# Decisiones v0.4.0

- Preservar `frontend/` como raíz del despliegue Vercel, sin mover los diez módulos.
- Mantener el entrenamiento real en TensorFlow.js y el estado local de v0.3.1.
- Incorporar un M02 remoto separado del navegador, sin sincronizar datos automáticamente.
- Usar Supabase Auth por magic link, FastAPI con JWT verificado mediante JWKS y PostgreSQL migrado con Alembic.
- Habilitar RLS sin policies para denegar acceso directo a tablas desde cliente. El backend debe verificar propietario y membresía.
- Worker ML y SSE se implementarán en etapas posteriores; no simular métricas ni afirmar que existe entrenamiento remoto.
