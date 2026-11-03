# Datasets de referencia para NeuroLab (sin datos sintéticos)

Estos CSV se exportaron **sin entrenamiento ni generación sintética** desde los conjuntos de datos distribuidos con `scikit-learn`, módulo `sklearn.datasets`, con las funciones `load_iris`, `load_wine` y `load_breast_cancer`.

## Contenido

| Archivo | Filas | Características | Clases | Columna objetivo |
| --- | ---: | ---: | ---: | --- |
| `iris_sklearn.csv` | 150 | 4 | 3 | `target` |
| `wine_sklearn.csv` | 178 | 13 | 3 | `target` |
| `breast_cancer_wisconsin_sklearn.csv` | 569 | 30 | 2 | `target` |

Los valores de `target` son índices de clase originales de scikit-learn (0, 1, 2; o 0, 1). Sin identificadores personales. Todos son compatibles con el límite de 64 columnas de M05.

## Fuentes

- Iris: R. A. Fisher, dataset clásico. [UCI Iris](https://archive.ics.uci.edu/dataset/53/iris), CC BY 4.0. **Nota:** la versión empacada con scikit-learn procede de la distribución de Fisher y puede diferir de ciertos registros corregidos publicados por UCI. Se especifica `sklearn` en el nombre para dejarlo claro.
- Wine: S. Aeberhard y colaboradores. [UCI Wine](https://archive.ics.uci.edu/dataset/109/wine), CC BY 4.0.
- Breast Cancer Wisconsin (Diagnostic): W. Wolberg, N. Street y O. Mangasarian; fuente histórica UCI, disponible en [UCI WDBC](https://archive.ics.uci.edu/dataset/17/breast+cancer+wisconsin+diagnostic). Datos para prácticas de clasificación, no diagnósticos médicos.
- Distribución de referencia: [scikit-learn datasets](https://scikit-learn.org/stable/datasets/toy_dataset.html).

Se conservaron 15 cifras significativas en las características; los encabezados se normalizaron sin alterar los valores. Los CSV incluyen `target` al final, tienen UTF-8 y no usan valores de prueba creados por IA.

## Ensayo sugerido

1. Crear un proyecto remoto nuevo para cada dataset (evita confundir experimentos).
2. M05 → Servidor → importar el CSV; `target` como variable objetivo y **clasificación**.
3. Particiones: entrenamiento 70 %, validación 15 %, prueba 15 %; semilla 42.
4. M06 → Arquitectura Feedforward 16 → 8 ReLU, Adam 0.001, hasta 30 épocas.
5. Comparar dos trabajos: Early Stopping activo (paciencia 3) y desactivado. **No elegir hiperparámetros usando métricas de test.**
6. M07 → comparar pérdidas de validación, accuracy test y metadatos. Los resultados dependen del experimento y no se prometen precisiones concretas.

El dataset WDBC se comparte solo para pruebas de software: no usar modelos del ejemplo para orientar decisiones clínicas.
