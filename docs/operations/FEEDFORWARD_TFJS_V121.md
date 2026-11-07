# NeuroLab Enterprise v0.12.1 — Consolidación Feedforward con TensorFlow.js

## Objetivo y alcance

Se sustituye **el motor de entrenamiento Feedforward activo** del navegador por la API de capas de TensorFlow.js (`tf.sequential`, `tf.layers.dense`, `model.compile`, `model.fit`). CNN 8×8 permanece sin modificaciones. No se toca FastAPI, PostgreSQL, SSE remoto, Supabase ni el worker Python.

## Compatibilidad con el historial

- **No borrar datos existentes.** El motor matemático TypeScript (`lib/neural.ts`) continúa disponible para inferencia de versiones anteriores y para pruebas de regresión. Nuevas ejecuciones usan `lib/dense-tfjs.ts`.
- Los pesos nuevos se serializan en el mismo contrato `TrainedNetwork` (`weights[neurona][entrada]`, biases y estadísticas de normalización). El exportador transpone el kernel de TF.js (`[entrada][neurona]`) antes de guardarlo. M08 puede inferir tanto versiones antiguas como nuevas sin conversión de datos; el campo opcional `engine: 'tfjs'` identifica únicamente a las nuevas.
- `localStorage` continúa siendo local y **NO está aislado por cuenta Google ni sincronizado**. Mantén copias de seguridad/exportaciones de los proyectos antes de cambiar de navegador o equipo.

## Preparación y entrenamiento

- Se mantiene el límite actual: 1–4 capas ocultas, 1–64 neuronas por capa, activaciones ReLU/tanh/sigmoid, clasificación binaria (objetivo 0/1) o regresión numérica. Clasificación multiclase tabular **no** está incluida en esta etapa.
- La separación train/validación usa Fisher-Yates con semilla, antes de ajustar escaladores. La media/desviación de cada característica y el escalador del objetivo de regresión usan **únicamente entrenamiento**. No se utilizan valores de validación para ajustar normalización o pesos.
- Clasificación: sigmoid, binaryCrossentropy y accuracy en proporción 0–1. Regresión: salida lineal, meanSquaredError, sin inventar accuracy.
- Optimizador: SGD con tasa elegida en M06. Inicializadores Glorot con semilla. La semilla fija la partición y la inicialización inicial, **no garantiza resultados bit a bit idénticos** en distintas GPU/backends.
- El callback `onEpochEnd` reporta pérdidas/accuracy reales por época, cede un frame para gráficos y atiende cancelación. Si cancelas antes o durante el ajuste no se crea una versión incompleta del modelo.
- Los tensores, el modelo y el optimizador se liberan al finalizar. El entrenamiento consume CPU/RAM y, según el navegador, puede usar GPU compatible; es necesario mantener abierta la pestaña.
- Diferencia metodológica: la pérdida de regresión del motor antiguo se definía como **½ MSE**; TensorFlow.js registra **MSE**. No compares directamente los valores numéricos absolutos de `loss` entre ambas generaciones sin considerar ese factor.

## Pruebas obligatorias antes de fusionar

Desde `apps/web` con Node.js 22 y las dependencias descargadas:

```bash
npm install
npm run test:core
npm run test:tfjs
npm run typecheck
npm run build
```

- `test:core` valida el historial, las rutas, la división reproducible y la ausencia de fuga de datos.
- `test:tfjs` **ejecuta modelos reales** de clasificación y regresión usando TensorFlow.js, registra épocas, hace inferencias mediante los pesos exportados y prueba cancelación. Incluido también en CI.
- Si falla `test:tfjs`, **NO hagas merge**. Revisa los resultados completos sin atribuir de antemano métricas o exactitudes.

## Comprobación manual en Vercel

1. Proyecto local → importar CSV numérico con objetivo 0/1 → Feedforward ReLU/tanh → 20–40 épocas, tasa 0.02–0.05, batch 16/32. Las gráficas deben actualizarse por época y M08 debe ofrecer predicción.
2. Repetir con un CSV de regresión. M07 debe mostrar pérdidas reales, **sin porcentajes de accuracy**.
3. Crear una CNN 8×8 de dígitos y comprobar que sigue entrenando y prediciendo sin worker.
4. Antes de entrenar, exportar al menos un modelo Feedforward histórico, seleccionarlo en M08 y confirmar que su inferencia continúa funcionando.
5. Durante entrenamiento, cancelar y confirmar estado `cancelled`, sin nueva versión de modelo. Recargar y verificar que se mantienen las ejecuciones completas y sus pesos.
6. Verificar `Administración → Herramientas avanzadas` y acceso Google; **no** afirmar sincronización de proyectos del navegador.

## Despliegue

- Sólo frontend; `apps/web/package.json` cambia a v0.12.1. Render `/health` permanece en **v0.11.0**.
- Sin Alembic ni reinicio del worker.
- Flujo Git: actualizar `main` y crear rama **antes** de extraer el ZIP; no agregar archivos de instrucciones inexistentes. `git add README.md apps/web .github/workflows/ci.yml docs/operations/FEEDFORWARD_TFJS_V121.md`.
- Realizar PR/merge cuando CI esté completamente aprobado y `npm run test:tfjs` muestre entrenamiento real exitoso.

## Etapas no incluidas

Sincronización autenticada con PostgreSQL, formatos TF.js en Supabase, autenticación obligatoria, conversión de `.keras` a TF.js, clasificación multiclase tabular y abandono definitivo del motor heredado. Ninguna de estas se activa ni se declara completada en v0.12.1.
