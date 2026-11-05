# NeuroLab Enterprise v0.10.2 — Modales, paginación y coherencia visual

## Alcance

Actualización **solo frontend** sobre `main` con v0.10.1 integrado.
No cambia FastAPI (su `/health` permanece en `0.10.0`), PostgreSQL, TensorFlow/Keras,
SSE, Storage ni las rutas de autenticación.

| Vista | Comportamiento |
|---|---|
| Proyectos → Servidor | Búsqueda/filtros y tarjetas compatibles con Navegador; crear/editar en modal |
| Entrenamientos → Servidor | Botones que abren Arquitecturas y Nuevo entrenamiento en modal; monitor y SSE siempre visibles |
| Evaluación → Servidor | Dos subpestañas: métricas y modelos; selectores en modal; cuatro modelos por página en cuadrícula de dos columnas |
| Datasets → Servidor | Preparación en modal; esquema paginado 5/10/20; vista previa en modal con desplazamiento horizontal |
| Reportes → ambos modos | Historial de experimentos paginado 5/10/20, comienza en cinco |
| Reportes → Navegador / Administración | Mensaje informativo una sola vez por sesión de pestaña (`sessionStorage`); confirmaciones destructivas siguen explícitas |
| Dashboard → Navegador/Servidor | Mismos bloques de estadísticas, actividad y panel derecho; 4 pasos locales; bienvenida cuando no hay proyectos |
| Tema oscuro | Bordes neutros y tarjetas de éxito/advertencia/error discretas, preservando su significado |

`Modal` (`src/components/ui.tsx`) es el diálogo compartido: cierre con Escape,
X o fondo, foco de teclado contenido, desplazamiento interior y ancho configurable.
`Pagination` (`src/components/Pagination.tsx`) usa helpers puros en `src/lib/pagination.ts`
y garantiza no modificar las listas originales.

## Pruebas locales antes del Pull Request

En Git Bash, desde la raíz del proyecto:

```bash
cd apps/web
npm install
npm run test:core
npm run typecheck
npm run build
```

Expectativa: **38 pruebas** (32 anteriores + 6 nuevas) y compilación correcta.
La librería de pruebas usa TypeScript y Node nativos: no hay nuevas dependencias.

En producción, comprobar manualmente:

1. Proyectos → Servidor: crear y editar un proyecto desde el modal; recargar y comprobar persistencia.
2. Entrenamientos → Servidor: abrir/guardar una arquitectura de prueba y abrir el modal de entrenamiento. Verificar que al cerrar no se encola nada y que el monitor SSE existente se conserva.
3. Evaluación → Servidor: cambiar la selección con modal; abrir Modelos y desplazarse por las páginas 2×2.
4. Datasets → Servidor: seleccionar el dataset de dígitos (65 columnas), paginar 5/10/20, abrir y cerrar vista previa, y abrir preparación sin reescribirla accidentalmente.
5. Reportes: seleccionar un proyecto con más de cinco ejecuciones y usar paginación 5/10/20 en local/servidor.
6. Navegar entre Reportes y Administración: los avisos introductorios no deben repetirse durante la misma sesión de pestaña. El diálogo de confirmación de borrado debe mantenerse.
7. Dashboard: verificar indicadores separados por origen, bienvenida para cuentas vacías y ruta local de cuatro pasos.
8. Tema oscuro: revisar bordes, modales, tabla y tarjeta verde de modelo Keras guardado.

**Seguridad:** las operaciones remotas siguen utilizando JWT y autorización en FastAPI;
no guardar token ni dataset en `sessionStorage`. Solo se guarda la marca de avisos informativos.

## Despliegue

Crear una rama `fix/organizacion-visual-v0.10.2` desde `main` limpio, extraer el parche,
realizar pruebas, añadir **únicamente archivos existentes** y abrir PR:

```bash
git add README.md apps/web docs/operations/EXPERIENCIA_USUARIO_V102.md
git diff --cached --check
git diff --cached --name-only
git commit -m "fix: unificar modales y paginación en módulos"
git push -u origin fix/organizacion-visual-v0.10.2
```

No ejecutar Alembic ni reiniciar el worker; la API mantiene versión `0.10.0`.
