<!--
NeuroLab Enterprise — Seguimiento técnico v0.4.2.
Base: Documento Maestro de Desarrollo, documento CSV Tiempo Real,
y el código fuente v0.4.2 con parche de integridad referencial.
No contiene credenciales, tokens, ni identificadores privados de usuarios.
-->

# NeuroLab Enterprise — Estado del proyecto y hoja de ruta

**Corte de seguimiento:** 1 de noviembre de 2026  
**Versión técnica:** v0.4.2 + corrección de clave foránea de proyectos  
**Repositorio:** `neuronal-enterprise` · rama estable `main`  
**Estado general:** laboratorio local funcional + autenticación y proyectos remotos operativos; todavía no existe un motor de entrenamiento en el servidor.

## 1. Alcance y arquitectura vigente

```text
Usuario
  └─ Apps/Web — React + TypeScript + Vite, desplegado en Vercel
       ├─ Laboratorio local — TensorFlow.js + localStorage
       └─ API REST — FastAPI, desplegada en Render
            ├─ Supabase Auth — Google OAuth
            └─ PostgreSQL de Supabase — usuarios, proyectos, miembros, auditoría

Workers Keras, datasets remotos y modelos remotos: aún pendientes.
```

**Decisión arquitectónica:** el frontend no accede directamente a la base PostgreSQL ni a la API administrativa de Supabase. FastAPI valida la sesión y autoriza operaciones de negocio. La redirección de autenticación puede pasar por Google/Supabase OAuth. Los proyectos locales **no se sincronizan automáticamente**.

## 2. Evidencias y verificaciones

| Comprobación                                          | Estado                              | Evidencia                                                                                   |
| ----------------------------------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------- |
| Compilación del frontend v0.4.2                       | Confirmada                          | `npm run typecheck` y `npm run build`, ejecutados por el equipo                             |
| Pruebas del motor local                               | Confirmadas                         | 17/17 al ejecutar `npm run test:core`                                                       |
| Pruebas backend con parche de clave foránea           | Confirmadas en entorno de prueba    | 14/14 (`python -m pytest -q`)                                                               |
| API en Render                                         | Confirmada                          | `/health` informa versión 0.4.2                                                             |
| Conexión PostgreSQL desde FastAPI                     | Confirmada                          | `/ready` devuelve `ready`                                                                   |
| Acceso Google OAuth en Vercel                         | Confirmado                          | El usuario accede a M02 → Servidor                                                          |
| Creación de proyecto en PostgreSQL                    | Confirmada                          | Creación remota con éxito tras corregir el orden de inserción de usuario                    |
| Recuperación después de recarga y nueva autenticación | Confirmada                          | Prueba manual realizada con una cuenta                                                      |
| Aislamiento entre dos cuentas distintas en despliegue | Pendiente                           | Seguir el protocolo adjunto                                                                 |
| Entrenamiento CNN de extremo a extremo en navegador   | Pendiente de certificación integral | Las pruebas existentes no equivalen a una prueba completa de entrenamiento e inferencia CNN |
| Entrenamiento remoto Keras                            | No implementado                     | `workers/training` aún reservado                                                            |

**Incidencia resuelta:** el error `ForeignKeyViolation projects_owner_id_fkey` se corrigió sincronizando el usuario local (`public.users`) y forzando su inserción antes del proyecto dentro de la misma transacción. No se desactivó la clave foránea.

## 3. Estado por módulos

| Módulo                  | Capacidades actuales                                     | Pendiente principal                                            |
| ----------------------- | -------------------------------------------------------- | -------------------------------------------------------------- |
| M01 Dashboard           | Panel y actividad local derivados de datos reales        | Consolidar indicadores de API y trabajos del servidor          |
| M02 Proyectos           | CRUD local, Google OAuth y CRUD de proyectos en servidor | Prueba real con dos usuarios; miembros y roles administrativos |
| M03 Fundamentos         | Conceptos y calculadora neuronal                         | Mejoras didácticas posteriores                                 |
| M04 Arquitecturas       | Diseñador Feedforward/CNN local                          | Versionado y validación en backend                             |
| M05 Datasets            | CSV local numérico y dígitos reales 8×8                  | Subida, análisis, versiones y preparación de datasets remotos  |
| M06 Entrenamientos      | Feedforward y CNN con TensorFlow.js                      | Cola, workers TensorFlow/Keras, checkpoints y continuidad      |
| M07 Evaluación          | Gráficos y métricas locales de entrenamientos            | Métricas persistidas, comparación y eventos SSE                |
| M08 Registro de modelos | Modelos y predicción local con imágenes                  | Artefactos remotos, versiones inmutables e inferencia por API  |
| M09 Reportes            | Exportaciones locales JSON/CSV                           | Reportes server-side con permisos y trazabilidad               |
| M10 Administración      | Almacenamiento y copias locales                          | RBAC completo, cuotas, auditoría consultable y observabilidad  |

**Limitaciones funcionales conocidas:** el motor CNN es específico para dígitos 8×8; RNN y GAN todavía no disponen de motores de entrenamiento. El almacenamiento local depende del navegador y no equivale a persistencia empresarial.

## 4. Seguimiento por fases del Documento Maestro

| Fase                            | Situación                                                                       | Condición pendiente para cierre                                                            |
| ------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| 0 — Descubrimiento y diseño     | Documento maestro, diez módulos y arquitectura base definidos                   | Mantener contratos y decisiones técnicas actualizados                                      |
| 1 — Base de plataforma          | Mayormente implementada: React, API, PostgreSQL, OAuth, proyectos y migraciones | Verificar aislamiento con dos usuarios, controles de roles y automatización de integración |
| 2 — Arquitecturas               | Constructor local implementado                                                  | API de validación y versionado inmutable de arquitecturas                                  |
| 3 — Entrenamiento               | Motores locales implementados                                                   | Cola y worker Keras; entrenamiento remoto reproducible                                     |
| 4 — Tiempo real y evaluación    | Evaluación local disponible                                                     | SSE, persistencia por época y recuperación tras desconexión                                |
| 5 — Registro y reportes         | Capacidades locales disponibles                                                 | Modelos de servidor, comparaciones, auditoría y exportaciones autorizadas                  |
| 6 — Endurecimiento y despliegue | Vercel, Render y Supabase desplegados                                           | Cuotas, rate limits, backups, monitoreo, pruebas de carga y seguridad                      |

**Nota:** despliegue no implica madurez de producción. El backend gratuito de Render es adecuado para probar API CRUD, pero los workers intensivos requieren una decisión posterior de infraestructura y límites de recursos.

## 5. Próximas etapas propuestas

### Cierre inmediato de v0.4.2 — Seguridad funcional

- Ejecutar pruebas de aislamiento con **cuenta A** y **cuenta B** autorizadas en Google OAuth Testing.
- Verificar que B no vea proyectos de A y que los accesos directos `GET`, `PATCH` y `DELETE` ajenos sean rechazados.
- Confirmar que los eventos de auditoría se registren sin exponer credenciales.
- Mantener la versión 0.4.2 mientras solo se realizan verificaciones; cualquier cambio correctivo puede llevar prefijo `fix:`.

### v0.5.0 — M05 Datasets remotos y preprocesamiento

- Ingesta CSV a través de FastAPI, autenticada y asociada a proyectos propios.
- Validaciones de contenido, columnas, tamaño, filas, tipos y objetivos; sin ejecutar archivos aportados por usuarios.
- Registro de metadatos en PostgreSQL y almacenamiento privado de archivos mediante servicio del servidor.
- Preprocesamiento reproducible con separación entrenamiento / validación / prueba y sin fuga de información.
- Visualización de resultados reales desde React; sin métricas ni tablas ficticias.

**Criterio de salida:** una cuenta autorizada carga un CSV real, consulta el esquema validado, conserva el dataset y lo recupera después de iniciar nueva sesión; otra cuenta no puede verlo.

### v0.6.0 — M04/M06 Entrenamiento remoto inicial

- Versiones inmutables de configuraciones Feedforward; trabajos asincrónicos con estados controlados.
- Worker TensorFlow/Keras separado de la API, límites de ejecución, reintentos controlados y cancelación cooperativa.
- Persistencia de métricas y artefactos; ejecución reproducible con parámetros y semilla.

**Criterio de salida:** una red Feedforward entrena sobre un dataset real y su estado puede recuperarse tras desconectar el navegador.

### v0.7.0 — M07/M08 Progreso en tiempo real y registro

- SSE por trabajo con recuperación vía REST, métricas por época, registro de modelos y evaluación.
- Versiones inmutables, permisos y comparaciones.

### v0.8.0 — CNN remota y ampliaciones

- Evolución de CNN 8×8 a ejecución remota comprobable; ampliar opciones de capas por compatibilidad y validación.
- RNN/GAN solo cuando se definan datasets, motores y pruebas adecuados.

## 6. Riesgos y reglas que deben conservarse

1. Ningún resultado, métrica o entrenamiento ficticio.
2. Código TypeScript/Python comentado, módulos separados y diseño profesional Tailwind + Lucide.
3. La API es la única frontera de autorización para operaciones remotas; nunca confiar en un ID recibido del frontend sin verificar permisos.
4. No incluir secretos, tokens ni `.env` real en Git.
5. Revisar el uso de `sessionStorage` para la sesión del navegador antes de un lanzamiento público: la estrategia de tokens aún requiere endurecimiento.
6. Google OAuth permanece en **Testing**: solo pueden acceder usuarios autorizados en la consola de Google.
7. El rol PostgreSQL empleado por la API puede tener privilegios superiores a los clientes públicos: las comprobaciones de permisos de FastAPI son imprescindibles; RLS no las sustituye.
8. Mantener rama `main` como estable; crear ramas por funcionalidad, no obligatoriamente por versión.

## 7. Convención de commits

Prefijos en inglés y descripciones en español. Ejemplos:

- `docs: documentar estado y próximas fases de NeuroLab Enterprise`
- `test: ampliar pruebas de permisos entre proyectos`
- `feat: implementar registro remoto de datasets CSV`
- `fix: corregir validación de acceso a proyectos`

## 8. Próxima decisión de trabajo

**Acción única inmediata:** completar la prueba con dos cuentas siguiendo `docs/operations/PRUEBA_AISLAMIENTO_USUARIOS_v0.4.2.md`. Si aprueba, dar por validado el hito de autenticación y proyectos; comenzar análisis y contratos de M05 remoto.
