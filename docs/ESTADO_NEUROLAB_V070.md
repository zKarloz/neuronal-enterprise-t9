# NeuroLab Enterprise — estado técnico v0.7.0

## Base verificada por el usuario (v0.6.0)

- API Render `0.6.0` desplegada y workflow Keras CPU aprobado.
- Primer trabajo Feedforward remoto completado: 5/5 épocas, evaluación de test persistida, SHA-256 y subida HTTP 200 a `neurolab-models`.
- Los resultados son reales: el usuario informó accuracy test `0.19289` y loss test `1.64515` en ese trabajo.
- El usuario confirmó que el texto «Sin ejecuciones» era un error de copiado, **no** un defecto reproducido de M06.

## Código nuevo v0.7.0

- SSE por Fetch autenticado en M06 y fallback REST.
- Nueva pestaña M07 → Servidor que recupera curvas, modelo y evaluación final de PostgreSQL; conserva la pestaña Navegador.
- Recuperación conservadora con heartbeat y fencing de worker tras interrupción.
- POST de reintento manual que preserva historial, crea otro job y guarda linaje.
- Nueva migración aditiva `004_live_recovery`, sin cambio en buckets ni configuración OAuth.

## Estado de verificación de este paquete

- Pruebas Python automatizadas: 34/34 aprobadas en entorno de desarrollo (sin servicios externos).
- Migración SQLite a `004_live_recovery (head)` validada con Alembic.
- Sintaxis TypeScript/TSX examinada con el compilador disponible; la instalación completa de npm no pudo finalizar en este entorno, por lo que **typecheck, build y pruebas de frontend en Node deben ejecutarse en el equipo del usuario o GitHub Actions**.
- **SSE sobre Render, reinicios reales del worker, comparador M07 y migración en PostgreSQL de Supabase:** pendientes de comprobación en el entorno del usuario.
- No afirmar despliegue, tiempos SSE, recuperación real de red o cambios de GitHub como ya realizados.

## Condiciones de aceptación para cerrar v0.7.0

1. 17 pruebas del frontend, TypeScript y build aprobados.
2. Pruebas backend aprobadas en Python 3.12 y CI en GitHub.
3. Alembic `004_live_recovery (head)` sobre PostgreSQL.
4. Un trabajo nuevo aparece en M06 con SSE (o REST respaldando ante bloqueo).
5. M07 → Servidor muestra las curvas y test del trabajo completado previamente.
6. Reintento manual sobre job cancelado: nuevo ID, origen registrado y resultados persistidos; el anterior permanece intacto.
7. Prueba controlada de desconexión del worker, seguida de recuperación: `FAILED` tras el umbral y reintento explícito. Evitar pruebas destructivas con trabajos importantes.
