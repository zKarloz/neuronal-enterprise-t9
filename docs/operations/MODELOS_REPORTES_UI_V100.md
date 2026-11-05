# NeuroLab Enterprise v0.10.0 — M08/M09 remotos y coherencia visual

## Alcance

Esta entrega amplía los módulos existentes sin modificar el esquema PostgreSQL ni el worker. Se conserva el entrenamiento local TensorFlow.js y remoto TensorFlow/Keras, la cola, los modelos históricos y el retorno Google OAuth.

### M08: registro y artefactos Keras

- **Servidor:** lista de versiones en proyectos autorizados, nombre, notas y estado del registro. El archivo `.keras` es inmutable y permanece en el bucket privado `neurolab-models`.
- `GET /api/v1/projects/{project_id}/models/{model_id}/artifact` exige JWT y permiso para consultar el proyecto. Verifica SHA-256 después de leer Storage, audita `model.downloaded` y entrega el binario únicamente por FastAPI.
- El botón "Descargar .keras" se realiza con cabecera Authorization; no se colocan tokens en la URL ni se exponen claves de Supabase.
- Se conservan los estados existentes `candidate`, `production`, `archived`; aún no se implementa el circuito de aprobación independiente de un revisor. El estado `production` **no activa un servicio de inferencia**.

### M09: reportes remotos

- `GET /api/v1/projects/{project_id}/reports/summary` devuelve metadatos de proyecto, arquitecturas, datasets, entrenamientos y modelos (hasta 200 por categoría). No expone filas originales, `storage_key` ni credenciales.
- `GET /api/v1/projects/{project_id}/reports/epochs.csv` genera CSV con épocas reales guardadas, codificado en UTF-8 con BOM. Neutraliza nombres que comienzan con caracteres de fórmula de hoja de cálculo.
- `GET /api/v1/projects/{project_id}/reports/project.pdf` genera ficha PDF A4 con resumen y hasta 30 trabajos, usando ReportLab. La exportación CSV/PDF registra eventos de auditoría. Los tres endpoints requieren autenticación y permiso sobre el proyecto.
- El PDF y el resumen **no son** un sistema completo de auditoría o informe regulatorio; no se inventan métricas de entrenamiento.

### Ajustes de interfaz

- Elimina etiquetas de sección como `Documentación · M09` de todos los encabezados. El nombre de la sección ya figura en el breadcrumb del shell.
- Elimina la frase `Laboratorio de redes neuronales` del topbar.
- El extremo superior derecho incluye `Iniciar sesión` cuando no existe una sesión remota. Con Google autenticado muestra el identificador de la cuenta y un menú para salir.
- El login centralizado se sincroniza con la pantalla de proyectos mediante el evento local `neurolab:session-changed`, sin exponer tokens.
- M02/M05/M06/M07/M08/M09 utilizan el mismo componente `ModeTabs` (Tailwind + Lucide), con estado de modo guardado en `?vista=servidor`.

## Seguridad y limitaciones

- La sesión OAuth sigue almacenándose en `sessionStorage` por pestaña, igual que versiones anteriores. Para una instalación empresarial robusta se recomienda migrarla a un BFF con cookies HttpOnly, SameSite y protección CSRF.
- La descarga de modelos está limitada a 50 MiB en el servidor. Se confirma el hash SHA-256 antes de enviar el archivo al navegador. Para artefactos más grandes deberá implementarse streaming autenticado verificable y límites adecuados.
- Las exportaciones M09 están acotadas a 200 ejecuciones recientes y hasta 30 entradas de trabajo en la ficha PDF; se informan estos límites en pantalla. No son exportaciones exhaustivas del historial de una instalación de gran escala.
- En los reportes se utiliza el acceso al proyecto (lector incluido); para editar o promover modelos se requiere rol de editor, con controles ya existentes.
- No modifica la migración `005_registry_early_stopping`, los buckets ni las variables de entorno actuales. **No ejecutar Alembic para esta versión.**

## Verificación local antes del merge

Desde la raíz del repositorio:

```bash
cd apps/web
npm install
npm run test:core
npm run typecheck
npm run build
cd ../../services/api
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

Se esperan 27 pruebas de frontend y 48 de backend. En algunos entornos el frontend puede depender de que `npm install` termine correctamente; no considerar aprobado el build sin ejecutarlo.

## Pruebas de aceptación después del despliegue

1. Render `/api/v1/health` debe mostrar `0.10.0`. Vercel debe contener el topbar actualizado.
2. Desde una página cualquiera, pulsar `Iniciar sesión`; al completar Google se debe mostrar el correo de la sesión y poder cerrar sesión desde el topbar.
3. Proyectos y Datasets deben tener pestañas idénticas a Entrenamientos y Evaluación; la URL debe conservar el modo servidor al recargar.
4. En M08 → Servidor, elegir proyecto con modelo Keras. Descargar `.keras` y confirmar que su SHA-256 coincide con el registrado.
5. En M09 → Servidor, seleccionar el mismo proyecto. Exportar JSON, CSV y PDF; confirmar datos reales y que no aparecen claves ni filas originales del dataset.
6. Iniciar sesión con otro usuario que no tenga acceso al proyecto; las rutas M08/M09 de ese proyecto deben devolver 404.
7. Reabrir M06 y M07: SSE, gráficos e historiales deben seguir funcionando.

## Despliegue y dependencias

Se añadió `reportlab>=4.2,<5` a `services/api/requirements.txt`. Render necesita reinstalar dependencias tras desplegar. No se requieren credenciales nuevas ni actualizar el worker local para este cambio.
