> **Actualización v0.12.1:** el motor Feedforward nuevo usa TensorFlow.js (clasificación binaria y regresión); la CNN ya usaba TensorFlow.js. El motor TypeScript anterior permanece solo para compatibilidad de los modelos históricos y sus pruebas de regresión. Ejecuta `npm run test:tfjs` para verificar entrenamiento y predicción reales con TensorFlow.js. Los datos siguen en el navegador y **no** se sincronizan automáticamente con Google.

> **v0.5.0:** Este frontend mantiene la ejecución local y añade **M05 → Servidor** para CSV remotos mediante FastAPI. Consulta `../../docs/operations/DATASETS_REMOTOS_V050.md` para configurar Supabase Storage y el despliegue. Los proyectos/datasets locales no se transfieren automáticamente.

# NeuroLab Enterprise v0.3.1 — CNN con importación de fotografías propias

**React + Vite + TypeScript + Tailwind CSS + Lucide React + TensorFlow.js.** Basado en el Documento Maestro NeuroLab Enterprise (M04, M05, M06, M07, M08 y estructura de los diez módulos, pp. 4–7).

## Ejecutar

Requiere **Node.js compatible con Vite 6**, **npm** y un navegador moderno. La instalación inicial necesita Internet para descargar las dependencias npm; el entrenamiento posterior se realiza localmente, sin API.

```bash
npm install
npm run dev
```

Abrir `http://localhost:5173`. Para verificar localmente: `npm run typecheck`, `npm run build`, `npm run test:core`.

**Esta entrega no contiene Python ni base de datos.** TensorFlow.js se importa bajo demanda y calcula convoluciones y gradientes en el navegador. Los proyectos, las configuraciones, las métricas y los pesos se guardan en `localStorage`. Los datos del dataset incluido son **muestras científicas auténticas, no datos de demostración inventados**. No se añaden registros ni métricas a un proyecto hasta que el usuario los genera.

## Recorrido completo para una CNN

1. **M02 Proyectos:** crear un proyecto.
2. **M05 Datasets:** pulsar **Seleccionar dataset incluido** y después **Usar este dataset**. También se admite importar un CSV de dígitos compatible desde el equipo o descargar el CSV para trabajarlo. No se autoincorpora ningún dataset al crear el proyecto.
3. **M04 Arquitecturas:** crear una arquitectura nueva, seleccionar **CNN**, elegir **8/16/32 filtros** y **16/32/64 neuronas densas**, asignar nombre y pulsar **Guardar arquitectura**.
4. **M06 Entrenamientos:** seleccionar la arquitectura CNN. El motor establece clasificación multiclase `0…9`, 12 épocas por defecto, batch 32, Adam con LR 0.003 y validación 20 %. Pulsar **Iniciar entrenamiento real**. Se grafican pérdidas y exactitudes reales por época y se puede solicitar cancelación (efectiva entre épocas).
5. **M07 Evaluación:** consultar métricas y **exactitud de prueba independiente**, y una **matriz de confusión de 10×10** calculada con etiquetas y predicciones sobre ejemplos no usados para entrenamiento ni validación.
6. **M08 Modelos:** abrir la versión CNN creada, seleccionar una muestra del dataset **o importar fotografías propias**, normalizar la entrada, inferir el dígito y observar las probabilidades Softmax. Exportar pesos en JSON.
7. **M09 Reportes:** exportar métricas y resumen, incluyendo el conjunto de prueba dentro del registro de ejecución.

### NUEVO: importar números escritos a mano (M08)

1. Entrena una CNN desde M06 y selecciona su versión en **M08 Registro de modelos**.
2. En **Reconocer mis números escritos**, pulsa **Importar imágenes**, arrastra fotos, o utiliza **Tomar foto** desde el teléfono. Se admiten **PNG, JPG y WebP**, máximo **8 fotos por selección** y **5 MB por foto**.
3. Selecciona una fotografía. El navegador muestra la **imagen original** y la **entrada normalizada 8×8** que recibirá el modelo. No se necesita el CSV original para predecir fotografías personales una vez entrenada la CNN.
4. Mantén **Tipo de fondo: Automático** (papel blanco/tinta oscura o fondo oscuro/tinta clara). Si hay sombras, ajusta el **umbral para detectar trazos**; si el trazo desaparece, reduce el umbral.
5. Pulsa **Predecir número con mi CNN**. Se utilizan los **pesos aprendidos** del modelo seleccionado. Aparecen el dígito previsto y las 10 salidas Softmax.

**Importante:** las imágenes se procesan en la memoria del navegador mediante Canvas, se encuadran sin deformar y se remuestrean a 8×8 con intensidad de 0 a 16. No se suben a ningún servidor ni se guardan en `localStorage`. **Esta importación sirve para inferencia, no para entrenamiento.** Las fotos no tienen etiqueta verificada y, por tanto, las probabilidades mostradas no constituyen métricas de exactitud. La diferencia entre fotos reales y el dataset 8×8 puede reducir la precisión; conviene escribir un solo número por foto, grande, bien enfocado y sobre papel blanco.

## Arquitectura CNN real de la primera implementación

| Operación | Salida |
|---|---|
| Entrada, intensidad 0–16 normalizada a [0,1] | 8 × 8 × 1 |
| Conv2D(3×3, ReLU, filtros configurables, valid padding) | 6 × 6 × F |
| MaxPooling2D(2×2) | 3 × 3 × F |
| Flatten | 9F |
| Dense(ReLU, neuronas configurables) | H |
| Dense(10, Softmax) | 10 probabilidades |

**Optimizador:** Adam. **Pérdida:** entropía cruzada categórica. **Métricas:** pérdida, exactitud, pérdida validación, exactitud validación, pérdida y exactitud en conjunto de prueba más matriz de confusión. 

Se hace partición reproducible por semilla: **15 % prueba**, el porcentaje elegido para **validación** y el resto para **entrenamiento**, antes de ajustar los pesos. La semilla rige el orden y la partición del dataset; la inicialización de parámetros de TensorFlow.js puede variar. No se garantiza una exactitud fija, dado que los resultados dependen del entrenamiento y el dispositivo.

## Dataset entregado

`public/datasets/digits-8x8.csv` contiene **1.797 imágenes de 8×8 en escala de grises**, con 64 columnas `pixel_0..pixel_63` (valores enteros de `0..16`) y columna `label` (`0..9`). Proviene del conjunto *Optical Recognition of Handwritten Digits* (Alpaydin & Kaynak, 1998, UCI) tal como lo distribuye `scikit-learn.datasets.load_digits`.

- Fuente: https://scikit-learn.org/stable/modules/generated/sklearn.datasets.load_digits.html
- Fuente original: https://doi.org/10.24432/C50P49
- Detalle y créditos: `public/datasets/SOURCE.md`

El importador valida el formato y acepta de **30 a 5.000** registros, 65 columnas exactas, 64 intensidades enteras `0..16`, etiqueta entera `0..9` y al menos dos clases diferentes. Límite de importación: **1,5 MB**. El importador M05 todavía se reserva para datasets CSV; **M08 sí permite usar imágenes PNG/JPG/WebP propias para hacer inferencias** con un modelo CNN ya entrenado.

## Compatibilidad y limitaciones

- **Feedforward** sigue usando datasets CSV tabulares, ahora con TensorFlow.js. El motor CNN también utiliza TensorFlow.js; se carga bajo demanda para ambas familias. RNN y GAN siguen siendo documentales.
- Se mantienen las diez carpetas dentro de `src/features/`, con `index.ts` por módulo, diseño responsive y scrollbars minimalistas.
- El dataset del proyecto es único; importar otro lo reemplaza, pero el historial de entrenamiento y los modelos persistidos continúan registrados. Para predecir con muestras etiquetadas necesitas el CSV original; para imágenes propias en M08 basta contar con los pesos de una CNN entrenada.
- La CNN se ajusta únicamente para **dígitos 8×8 de diez clases**. La importación de PNG/JPG/WebP solo admite **un dígito por fotografía**: no segmenta varios números ni añade fotos al entrenamiento. No es un clasificador universal de imágenes. No se ofrece ejecución persistente en segundo plano.
- `localStorage` tiene capacidad limitada, el entrenamiento requiere mantener la pestaña abierta y no existe autenticación real, ni servidor, ni roles seguros.
- Un entrenamiento CNN exporta pesos en JSON propios del frontend, no archivos Keras `.h5` ni TensorFlow SavedModel. No hay una función de reimportación de modelos exportados.
- La cancelación se verifica entre épocas; una época en curso puede continuar hasta terminar antes de cancelarse.
- No uses datos personales sensibles; el almacenamiento se encuentra en el navegador local.

## Pruebas y verificación

`npm run test:core` incluye **17 pruebas automatizadas** del motor Feedforward, lógica de la arquitectura, migración de datos anteriores, formato del dataset científico, partición reproducible y preprocesamiento de imágenes propias. También se revisó la sintaxis de los archivos TS/TSX. **No incluye prueba ejecutada de entrenamiento y predicción CNN de extremo a extremo en navegador** en este entorno, porque la descarga de dependencias npm no estuvo disponible. Se requiere ejecutar `npm install`, `npm run typecheck`, `npm run build` y una prueba CNN manual en un equipo con npm accesible.

### Estructura modular

```text
src/
  app/                    # Shell y estado local
  components/             # UI y gráficas compartidas
  features/
    dashboard/            # M01
    projects/             # M02
    fundamentals/         # M03
    architectures/        # M04: editor y diagrama CNN
    datasets/             # M05: CSV tabular y dígitos 8×8
    training/             # M06: Feedforward y CNN
    evaluation/           # M07: gráficas y matriz de confusión
    model-registry/       # M08: pesos, inferencia CNN e importación de fotos
    reports/              # M09
    administration/       # M10
  lib/
    neural.ts             # Feedforward TS local
    digits.ts             # Parser/validación/partición 8×8
    image-preprocess.ts   # Canvas: PNG/JPG/WebP a intensidades 8×8
    cnn.ts                # CNN TensorFlow.js (importación bajo demanda)
    csv.ts
    storage.ts
  types/domain.ts
public/datasets/
  digits-8x8.csv          # Dataset real UCI
  SOURCE.md               # Créditos y referencia
```
