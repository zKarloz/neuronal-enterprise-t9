# NeuroLab Enterprise — Estado del proyecto (v0.5.0)

**Fecha de planificación:** 1 de noviembre de 2026. Documento de evolución; separar funcionalidades probadas en local de las verificadas en infraestructura real.

## Hitos validados por el equipo

- v0.3.1: frontend local publicado en Vercel; pruebas de Feedforward, dataset dígitos y preprocesamiento de fotografías.
- v0.4.0: FastAPI, conexión a PostgreSQL en Supabase, endpoints de proyectos y migraciones.
- v0.4.1: acceso a Supabase Auth mediante API propia (OTP disponible como alternativa).
- v0.4.2: Google OAuth probado en Vercel/Render, proyectos persistentes tras renovar sesión, aislamiento entre dos cuentas y corrección de clave foránea.
- **v0.5.0:** implementación de datasets CSV remotos, esquema/previsualización, preprocesamiento reproducible y almacenamiento privado; pendiente de verificación en Render y Supabase Storage reales.

## Estado modular

| Módulo | Navegador | Servidor | Siguiente ampliación |
|---|---|---|---|
| M01 Dashboard | Indicadores de datos locales reales | Sin panel remoto | Indicadores persistidos |
| M02 Proyectos | CRUD local | CRUD autenticado y aislamiento | Roles de equipo y permisos avanzados |
| M03 Fundamentos | Conceptos y herramientas | No requiere backend | Mejoras educativas |
| M04 Arquitecturas | Diseñador Feedforward/CNN | Sin guardado remoto | Configuración validada y versionada |
| M05 Datasets | CSV numérico y dataset dígitos | CSV remoto, metadata, preview, versiones, preprocesamiento | Transformaciones avanzadas y jobs de ingesta |
| M06 Entrenamientos | Feedforward/CNN en navegador | No implementado | Keras en workers y cola |
| M07 Evaluación | Gráficos y matriz CNN local | No implementado | Métricas persistentes y SSE |
| M08 Modelos | Registro local e inferencia de imágenes | No implementado | Registro de artefactos remotos |
| M09 Reportes | Exportaciones JSON/CSV | No implementado | Reportes autorizados |
| M10 Administración | Preferencias y copias locales | Esquema RLS, auth, auditoría de proyectos/datasets | Administración de usuarios/cuotas |

## Hitos futuros

1. **Aceptar v0.5.0 en Render/Supabase**: upload privado real, preparación, descarga, versión, borrado, aislamiento entre usuarios.
2. **v0.6.0**: worker TensorFlow/Keras con cola persistente, entrenamientos Feedforward desde dataset/arquitectura versionados.
3. **v0.7.0**: streaming SSE con reconexión, métricas reales persistidas, cancelación y registro de modelos.
4. **v0.8.0**: CNN remota, inferencia de servidor, mejoras del diseñador.

## Decisiones sin cambio

- Frontend: `apps/web` (React, TypeScript, Vite, Tailwind CSS, Lucide React, TensorFlow.js local).
- Backend: `services/api` (FastAPI). Entrenamientos pesados irán a `workers/training`.
- PostgreSQL y archivos privados: Supabase; Render aloja la API, Vercel aloja React.
- Nunca se generan métricas de entrenamiento ficticias ni se alteran los proyectos locales sin autorización explícita.
- Secretos solamente en Render; el frontend se comunica con nuestra API propia.
