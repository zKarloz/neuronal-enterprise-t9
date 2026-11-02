# Estado de NeuroLab Enterprise — v0.6.0 (implementación, pendiente de despliegue)

| Módulo | Local | Servidor |
|---|---|---|
| M01 Dashboard | Indicadores reales locales | Resumen remoto aún pendiente |
| M02 Proyectos | CRUD local | CRUD, Google OAuth y permisos (v0.4.2, verificado) |
| M03 Fundamentos | Operativo | No requiere backend |
| M04 Arquitecturas | Constructor Feedforward y CNN local | Feedforward denso versionado (nuevo; pendiente de probar en Render) |
| M05 Datasets | CSV numérico y dígitos 8×8 | CSV privado, preparación y particiones (v0.5.0, verificado) |
| M06 Entrenamiento | Feedforward y CNN reales en navegador | Cola y motor Keras en worker independiente (nuevo; pendiente de prueba E2E) |
| M07 Evaluación | Gráficas locales | Métricas por época vía REST y test final (nuevo; sin SSE) |
| M08 Modelos | Registro y predicción local | Artefactos `.keras` y SHA-256 privados, sin inferencia remota todavía |
| M09 Reportes | Exportaciones locales | Sin informes remotos |
| M10 Administración | Preferencias y copias locales | Auditoría parcial, sin consola de administración |

## Criterio de salida v0.6.0

Un usuario autenticado selecciona un CSV remoto preparado, guarda arquitectura Feedforward, encola trabajo, el worker lo entrena en CPU con Keras y persiste métricas y modelo inmutable. El estado sigue disponible tras recargar la web. Probar cancelación y acceso entre usuarios antes de fusionar.

## Correspondencia con documento maestro

Fase 0/1: bases definidas y verificadas. Fase 2: arquitecturas remotas Feedforward ahora implementadas. Fase 3: cola, worker y TensorFlow/Keras implementados en código, pendiente ejecución real de extremo a extremo. Fase 4: seguimiento REST, SSE y recuperación robusta aún pendientes. Fase 5/6: registro básico, endurecimiento y despliegue final pendientes.
