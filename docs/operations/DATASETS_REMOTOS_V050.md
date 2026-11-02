# NeuroLab Enterprise v0.5.0 — Configuración de datasets remotos

> **Estado:** implementación local verificada con pruebas automatizadas; pendiente de aceptación en Render + Supabase Storage real.

## Arquitectura

```text
Vercel React (M05 → Servidor)
    │ JWT Google OAuth, HTTPS y multipart/form-data
    ▼
Render FastAPI (/api/v1/projects/{project_id}/datasets)
    ├─ Autoriza la propiedad / rol de proyecto con PostgreSQL
    ├─ Comprueba UTF-8, encabezados, filas y límites (sin ejecutar archivos)
    ├─ Guarda metadatos y esquema en PostgreSQL Supabase
    └─ Guarda el CSV bruto en bucket privado Supabase Storage (solo mediante API)
```

**No se guardan archivos CSV en el disco efímero de Render**. La clave de Storage nunca aparece en el bundle React. Los datasets existentes del navegador se conservan sin migración automática.

## 1. Configurar Supabase Storage (una sola vez)

1. En Supabase Dashboard → **Storage** → **New bucket**.
2. Nombre exacto: **`neurolab-datasets`**.
3. Mantener **Public bucket = OFF** (bucket privado).
4. Fijar máximo por archivo **5 MB** y, si la interfaz lo permite, tipo permitido `text/csv`. No habilitar acceso público.
5. En **Project Settings → API Keys**, crea una **Secret API key** (`sb_secret_...`). **NO** uses la clave `sb_publishable_...` para Storage administrativo.
6. En Render → servicio FastAPI → Environment añade **`SUPABASE_SECRET_KEY`** con el valor secreto. **Nunca la pegues en Vercel, en un commit o en un chat**. Alternativa temporal: `SUPABASE_SERVICE_ROLE_KEY` con la clave JWT legacy si es la que tienes disponible.
7. Añade `DATASET_BUCKET=neurolab-datasets` si deseas dejar explícito el valor por defecto. Conserva `SUPABASE_URL`, `DATABASE_URL` y las variables Google OAuth existentes.

El plan gratuito permite Storage privado y tiene límites de almacenamiento; el máximo por archivo admitido por esta versión es intencionalmente **5 MB**, por debajo del máximo global gratuito de Supabase.

## 2. Aplicar la migración

Ejecutar localmente con el `.env` ya configurado en `services/api/`:

```bash
cd services/api
source .venv/Scripts/activate    # Git Bash / Windows, si existe el venv
python -m pip install -r requirements-dev.txt
python -m alembic upgrade head
python -m pytest -q
```

`002_datasets` crea la tabla `public.datasets`, una relación a `projects`, unicidad por nombre/versión dentro de cada proyecto, y **habilita RLS**. Las tablas v0.4.2 no se eliminan ni modifican.

> Importante: la migración funciona usando `DATABASE_URL` de Supabase desde una máquina autorizada. No es necesario ejecutar SQL manual en el dashboard. Confirma que `alembic_version` queda en `002_datasets`.

## 3. Verificaciones locales de frontend

```bash
cd apps/web
npm install
npm run test:core
npm run typecheck
npm run build
```

El frontend continúa usando `VITE_API_BASE_URL=https://neuronal-enterprise-api.onrender.com`; **no requiere ninguna nueva variable de Vercel**.

## 4. Despliegue

1. Crear desde `main` la rama `feature/datasets-v0.5.0` **antes** de copiar la versión.
2. Aplicar el ZIP de parche en la raíz del repositorio.
3. Configurar bucket y `SUPABASE_SECRET_KEY` en Render; ejecutar migración y pruebas.
4. Commit propuesto: `feat: incorporar datasets CSV remotos y preprocesamiento reproducible`.
5. Publicar la rama y verificar la vista previa de Vercel; desplegar la API en Render con el código nuevo.
6. Abrir `https://neuronal-enterprise-api.onrender.com/api/v1/health`: debe indicar versión `0.5.0`.
7. Tras la aceptación funcional, fusionar con `main` y eliminar la rama de trabajo.

## 5. Prueba manual M05 → Servidor

1. Accede a NeuroLab con Google OAuth desde **M02 → Servidor**.
2. En **M05 → Servidor**, selecciona un proyecto remoto propio y sube un CSV auténtico de prueba, sin datos sensibles.
3. Comprueba el número de filas, esquema, nulos y las primeras 8 filas reales. El nombre puede repetirse: la API crea versión 2, 3, etc.
4. Configura la columna objetivo, tarea, validación, prueba y semilla. Pulsa **Preparar dataset**.
5. Verifica que las cantidades train/valid/test sumen los registros etiquetados y que aparezca la dimensionalidad.
6. Recarga la aplicación, vuelve a M05 y comprueba que persistió la preparación.
7. Descarga el CSV: debe ser idéntico al original. Borra una versión y confirma que desaparece del proyecto y del bucket.
8. Inicia sesión con otra cuenta: no debe listar, leer, descargar ni preparar el CSV del primer usuario.

El proyecto no puede eliminarse si aún contiene datasets remotos (HTTP 409), para evitar dejar ficheros privados huérfanos. Borra primero las versiones de M05.

## 6. Contratos de API

Todos requieren un token JWT de Google/Supabase validado por FastAPI:

| Verbo | Ruta (prefijo `/api/v1`) | Resultado |
|---|---|---|
| `GET` | `/projects/{project_id}/datasets` | Lista de versiones autorizadas |
| `POST` | `/projects/{project_id}/datasets` | Carga multipart `file`, valida y guarda, HTTP 201 |
| `GET` | `/projects/{project_id}/datasets/{dataset_id}` | Esquema y preparación |
| `GET` | `/projects/{project_id}/datasets/{dataset_id}/download` | Descarga privada del CSV |
| `POST` | `/projects/{project_id}/datasets/{dataset_id}/prepare` | Calcula y registra preprocesamiento real |
| `DELETE` | `/projects/{project_id}/datasets/{dataset_id}` | Elimina objeto privado y metadatos |

Cuerpo de preparación:

```json
{
  "target_column": "objetivo",
  "task": "classification",
  "validation_fraction": 0.15,
  "test_fraction": 0.15,
  "seed": 42
}
```

### Reglas efectivas de v0.5.0

- CSV UTF-8 con encabezados únicos; 2–64 columnas; 3–20.000 filas; máx. **5 MiB**.
- El esquema y la vista previa vienen de registros reales; se admiten celdas faltantes y columnas categóricas.
- Se excluyen de la preparación las filas sin objetivo y se reporta cuántas; el original sigue intacto.
- Validación y prueba: 5–40 % cada una; suma máxima 60 %.
- Regresión requiere objetivo numérico; clasificación entre 2 y 50 clases.
- Las medianas, las medias, las desviaciones y el vocabulario de categorías se **ajustan exclusivamente sobre train**. Categorías no observadas en train tienen codificación cero.
- Se conservan particiones reproducibles por semilla, índices originales, parámetros de preparación y versión de pipeline.
- No se entrena en el backend en v0.5.0; la preparación sirve de base al worker v0.6.0.
- El usuario propietario y el rol *manager* pueden importar/preparar/eliminar; miembros autorizados de lectura solo pueden consultar y descargar.

## 7. Limitaciones y próximos controles

- El almacenamiento en Supabase Storage no se ha probado en vivo desde este entorno; primero verifica un upload pequeño. Ante error `502` comprueba nombre del bucket y clave secreta en Render.
- La operación de borrar archivo y su metadato abarca dos servicios; existe una pequeña ventana de fallo entre ambos. Para producción se añadirá limpieza compensatoria y auditoría estructurada.
- El API no permite ejecutar CSV como código y no expone claves de Storage, pero **no debe usarse aún con información personal/sensible** hasta completar controles de privacidad y cuotas.
- La codificación de texto está limitada a 40 categorías por columna y 256 dimensiones resultantes. Archivos más complejos se gestionarán en fases posteriores.
- Importar no inicia entrenamientos. Esto quedará pendiente de workers, cola persistente y Keras v0.6.0.
