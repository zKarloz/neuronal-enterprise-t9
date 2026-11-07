# NeuroLab Enterprise v0.12.0 — Transición frontend-first (etapa 1)

## Decisión de arquitectura

El instructor confirmó que el backend no es obligatorio para la tarea académica. El entrenamiento en navegador pasa a ser el flujo principal. **No se eliminan todavía FastAPI, PostgreSQL, Supabase Storage ni el worker**: contienen información histórica real y siguen siendo útiles para autenticación, auditoría, reportes y compatibilidad.

## Alcance de esta entrega

1. Se elimina el selector visible Navegador/Servidor de los nueve módulos que lo usaban. Todos priorizan las pantallas existentes del navegador, conservando sus rutas `/panel`, `/proyectos`, `/arquitecturas`, `/datasets`, `/entrenamientos`, `/evaluacion`, `/modelos`, `/reportes`, `/administracion`.
2. Los datos anteriores de FastAPI son accesibles desde **Administración → Herramientas avanzadas → Consultar archivo remoto**. Las direcciones `?vista=servidor` siguen funcionando; una banda visible marca el contexto antiguo y permite regresar al laboratorio.
3. Google OAuth PKCE se intercambia en `GoogleOAuthReturn` independientemente de qué página esté visible. El usuario sigue teniendo acceso a su cuenta, pero la sesión no cambia el origen de los proyectos visibles.
4. Las pruebas de regresión garantizan que el entrenamiento local siga utilizando motores reales. No se inventan métricas.

## Limitaciones que no deben ocultarse

- El espacio local continúa usando `localStorage` **sin separación por cuenta**. Iniciar sesión en Google **no lo sincroniza** ni le aplica RBAC. Evitar equipos compartidos hasta implementar almacenamiento por usuario y sincronización autenticada. Por este motivo no se obliga todavía a autenticarse para usar el laboratorio.
- Feedforward local usa una implementación matemática TypeScript propia; CNN local usa TensorFlow.js. No afirmar que toda la plataforma local utiliza TensorFlow.js hasta migrar Feedforward y verificar paridad de sus funciones y resultados.
- Los modelos `.keras` históricos no son directamente modelos TensorFlow.js. No borrarlos ni importarlos como si fueran compatibles.
- La sección avanzada sigue operativa y algunas acciones antiguas pueden encolar trabajos; esos entrenamientos **requieren el worker Python**. El flujo principal del laboratorio no lo requiere.
- No hay migraciones SQL ni cambios de variables de entorno. La API puede continuar en v0.11.0.

## Validación obligatoria antes de fusionar

Desde `apps/web`:

```bash
npm install
npm run test:core
npm run typecheck
npm run build
```

Debe validarse también manualmente:

- Abrir cada uno de los diez módulos desde el sidebar, refrescar (F5), navegar atrás/adelante y comprobar que no aparezcan pestañas de origen.
- Crear un proyecto **local**, importar un CSV real, entrenar Feedforward y/o CNN, revisar las gráficas y el registro local.
- Iniciar sesión con Google desde la barra superior, recargar, verificar que el usuario aparezca y cerrar sesión. El retorno PKCE no debe generar un intercambio duplicado.
- En Administración abrir el archivo remoto, consultar al menos un proyecto y un modelo Keras ya guardado y volver mediante el enlace al laboratorio.
- Comprobar que los datos locales permanecen después de cerrar Google: no deben presentarse falsamente como datos de esa cuenta.
- Tema claro y oscuro, escritorio y móvil.

## Etapas siguientes (no implementadas aquí)

1. Unificar Feedforward bajo TensorFlow.js, manteniendo clasificación, regresión, reproducibilidad y pruebas de métricas.
2. Diseñar un esquema de persistencia **separado por usuario**, RLS, exportación/importación, reconciliación de identificadores y almacenamiento de artefactos TensorFlow.js. No trasladar filas ni pesos a Supabase sin políticas de seguridad explícitas.
3. Solo una vez que los datos estén sincronizados y aislados, considerar la pantalla de acceso obligatoria y retirar las páginas remotas heredadas.
