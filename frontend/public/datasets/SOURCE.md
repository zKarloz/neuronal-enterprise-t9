# Dataset real de dígitos manuscritos (8×8)

- **Archivo**: `digits-8x8.csv` (1.797 imágenes de 8×8, 64 píxeles enteros 0..16 y una etiqueta 0..9).
- **Fuente primaria**: Alpaydin, E. & Kaynak, C. (1998). *Optical Recognition of Handwritten Digits*, UCI Machine Learning Repository. https://doi.org/10.24432/C50P49
- **Distribución**: el subconjunto de 1.797 ejemplos distribuido por scikit-learn mediante `load_digits`: https://scikit-learn.org/stable/modules/generated/sklearn.datasets.load_digits.html
- **Nota de atribución**: el conjunto se describe en UCI; consulte las condiciones de atribución de la fuente para reutilización externa.
- **Transformación**: únicamente exportado como CSV con columnas `pixel_0`..`pixel_63`,`label`, en el orden provisto por scikit-learn. No contiene etiquetas ni resultados simulados.

No se crea un proyecto ni se importa este archivo automáticamente. Solo se lee cuando el usuario selecciona «Seleccionar dataset incluido» desde M05.
