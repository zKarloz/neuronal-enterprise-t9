# NeuroLab Enterprise v0.12.2 — Importación única de CSV en M05

## Motivo

En v0.12.1 los CSV de Feedforward y las imágenes 8×8 se importaban desde botones diferentes. Elegir «Importar CSV CNN propio» con un archivo tabular daba el error de encabezados `pixel_0` a `pixel_63`, incluso si el archivo era válido para Feedforward.

## Solución

- Un único botón **Importar dataset** abre el componente `Modal` compartido.
- **Elegir archivo CSV** detecta automáticamente el formato mediante el encabezado. El sistema utiliza `parseCsv` para datos tabulares y `parseDigitsCsv` para imágenes 8×8; las validaciones siguen siendo estrictas y no se mezclan.
- La columna objetivo es seleccionable para CSV tabulares; para dígitos CNN queda fijada a `label`.
- **Usar dígitos incluidos** se conserva en el mismo modal. Hay un enlace para descargar el CSV de referencia.
- Solo existe un dataset activo por proyecto; al reemplazarlo, los modelos y ejecuciones históricos permanecen intactos.
- Se bloquea la sustitución de datasets durante un entrenamiento local en curso.
- No se hacen peticiones a FastAPI ni cambios de almacenamiento remoto.

## Límites existentes

| Formato | Restricciones |
|---|---|
| Feedforward tabular | Hasta 900 KB, 2.000 filas, 2–16 columnas numéricas. Clasificación binaria o regresión. |
| CNN dígitos | Hasta 1,5 MB, 30–5.000 imágenes 8×8, 64 columnas `pixel_0`…`pixel_63` y `label` de 0 a 9. |

## Validación antes del merge

Desde `apps/web`:

```bash
npm install
npm run test:core
npm run test:tfjs
npm run typecheck
npm run build
```

Pruebas manuales con proyectos separados:
1. Importar el CSV de cáncer de mama desde el botón único; comprobar que se detecta Feedforward, elegir `diagnostico` y entrenar una clasificación.
2. Importar el CSV de diabetes; elegir `progresion` y entrenar regresión sin mostrar accuracy.
3. Importar el CSV de dígitos incluido o seleccionar `digits-8x8.csv`; comprobar que se detecta CNN y entrenar cinco épocas.
4. Importar un CSV CNN con un encabezado mal escrito; debe seguir rechazándolo. Probar Cancelar en el modal y volver a abrirlo.
5. Recargar la página y comprobar que el dataset del proyecto y los modelos ya entrenados persisten.

## Despliegue

Parche solo de frontend, sobre `main` después del merge de v0.12.1. No requiere migración Alembic, worker Python, nuevas claves ni cambios a Render. El backend puede continuar indicando `0.11.0`.
