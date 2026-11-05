# NeuroLab Enterprise v0.10.1 — Experiencia de usuario

## Alcance y compatibilidad

Actualización exclusivamente del frontend React/TypeScript/Tailwind/Lucide.
No cambia FastAPI, PostgreSQL, Alembic, worker TensorFlow/Keras, SSE, API de modelos ni reportes.

- **Notificaciones:** los avisos `Notice` utilizan un proveedor compartido con ventana flotante centrada en la franja superior. Permanecen cinco segundos o hasta pulsar X. Se anuncian por roles accesibles, tienen animación de salida y los avisos no bloquean interacciones.
- **Secciones:** el topbar muestra General, Laboratorio o Gestión según el módulo activo.
- **Dashboard:** selector Navegador/Servidor. Cuando existe sesión Google y no se indicó un modo manualmente, entra en Servidor. Se conserva `?vista=navegador` para recordar la elección explícita de usar los datos locales.
- **Indicadores remotos:** consultan proyectos y, por proyecto, datasets, arquitecturas, entrenamientos y modelos mediante FastAPI. Nunca reutilizan las métricas locales ni inventan resultados. Consultas agrupadas en lotes de tres proyectos para acotar concurrencia.
- **Carga:** se reutiliza `LoadingState` para no mostrar mensajes de ausencia antes de recibir datos de la API. Un fallo de red muestra un error, no indicadores vacíos falsos.
- **M04:** nueva pestaña Servidor que consulta configuraciones Feedforward/CNN 8×8 y crea versiones inmutables. La API v0.10.0 no permite PATCH/DELETE de arquitecturas: no se presenta como disponible una edición destructiva.
- **Autenticación:** las pantallas remotas comparten un aviso permanente de inicio de sesión, referenciado al topbar, en lugar de instrucciones antiguas «M02».
- **Métricas:** `accuracy` se presenta como porcentaje; las pérdidas se muestran con máximo tres decimales sin modificar datos de entrenamiento ni reportes originales.
- **Sidebar:** desaparece «Laboratorio híbrido»; se distingue entre contexto local y cuenta remota.
- **Tema oscuro:** alternador en topbar, preferencia persistida en `localStorage`, neutros grises para fondos y superficies. Se permiten colores semánticos para estados y gráficas. El tema también acompaña las rutas recargadas.

## Pasos de aceptación

1. Abrir `/panel` sin sesión: debe aparecer Navegador y mantener los datos locales.
2. Iniciar sesión con Google, abrir `/panel`: debe seleccionarse Servidor y consultar los datos reales de la cuenta. Recargar: debe conservarlo.
3. Elegir Navegador de manera explícita y recargar: debe continuar en Navegador, incluso con Google conectado.
4. En `/arquitecturas?vista=servidor`, consultar las versiones ya creadas y guardar una nueva versión inmutable en un proyecto de prueba. No alterar las existentes.
5. Comprobar pestañas y spinner de los módulos M02, M05, M06, M07, M08 y M09. Verificar un estado vacío verdadero únicamente después de la carga.
6. Generar un aviso de éxito y uno de error: confirmar aparición flotante, cierre X y desaparición automática a los cinco segundos.
7. Cambiar el tema y recargar. Comprobar legibilidad en tablas, formularios, menú de usuario, gráficas y modales.
8. Cerrar sesión mientras un módulo remoto está abierto: no debe seguir mostrándose información privada del proyecto en pantalla.
9. Comprobar la navegación General / Laboratorio / Gestión en el topbar y que las rutas existentes continúan funcionando.

## Verificaciones

- Pruebas de fuente: `npm run test:core`.
- Compilación obligatoria en el equipo de desarrollo: `npm run typecheck && npm run build`.
- El backend conserva las 48 pruebas y la migración `005_registry_early_stopping`.
- La API desplegada puede seguir mostrando v0.10.0 en `/health` porque este parche solo actualiza `apps/web`.

## Consideraciones pendientes

El Dashboard remoto agrega resultados de todos los proyectos de la cuenta, lo que requiere varias solicitudes API por proyecto; para cuentas con cientos de proyectos, se recomienda crear un endpoint de agregación paginado en una versión posterior.
Las notificaciones son efímeras; las instrucciones operativas que deban ser permanentes deben conservarse como texto normal o componente `EmptyState`.
