<!-- Protocolo de aceptación manual para proyecto remoto; no utilizar tokens reales en registros compartidos. -->

# NeuroLab Enterprise — Prueba de aislamiento de proyectos entre usuarios

**Versión:** 0.4.2 · **Entorno:** Vercel + Render + Supabase  
**Objetivo:** comprobar que cada identidad solamente ve y administra los proyectos a los que está autorizada.

## Preparación

1. En Google Cloud → **Google Auth Platform → Audience → Test users**, añade **dos cuentas Google diferentes** (A y B). No es necesario publicar la aplicación OAuth ni configurar SMTP.
2. En la ventana habitual del navegador, accede a NeuroLab con A mediante **M02 → Servidor**.
3. Abre una ventana privada o un **perfil de navegador separado** para B. Asegúrate de que la cuenta activa en NeuroLab sea distinta; no basta con cambiar de cuenta en la web de Google si NeuroLab aún conserva otra sesión.
4. No compartas JWT, refresh tokens, cookies ni contraseñas. Para comprobar IDs, solo se necesita el identificador público del proyecto (UUID), no el token.

## Casos de aceptación

| ID | Acción | Resultado esperado |
|---|---|---|
| SEG-01 | A crea `Proyecto privado A` | API devuelve 201 y aparece solo en la lista de A |
| SEG-02 | B inicia sesión y abre M02 → Servidor | `Proyecto privado A` **no** aparece en la lista de B |
| SEG-03 | B crea `Proyecto privado B` | B ve su proyecto; A no lo ve en su lista |
| SEG-04 | B intenta consultar el UUID de un proyecto de A mediante la API autenticada como B | HTTP **404** sin detalles del proyecto |
| SEG-05 | B intenta modificar ese UUID mediante PATCH | HTTP **404** y contenido de A inalterado |
| SEG-06 | B intenta eliminar ese UUID mediante DELETE | HTTP **404** y el proyecto de A sigue existiendo |
| SEG-07 | Una solicitud a `/api/v1/projects` sin `Authorization` | HTTP **401** |
| SEG-08 | A cierra sesión, vuelve a entrar y recarga | Los proyectos de A persisten; no aparecen proyectos de B |

**Para SEG-04 a SEG-06:** no pruebes modificando la base de datos ni pegando tokens en chats. Utiliza el panel de pruebas de FastAPI `/docs` con la sesión B en un entorno controlado, o añade pruebas automatizadas equivalentes. El formulario actual de M02 no permite consultar directamente un UUID arbitrario, por lo que SEG-04/05/06 no se completan solamente mirando la interfaz.

## Evidencia mínima

Conserva una captura de la lista de proyectos de cada cuenta, los códigos HTTP de cada caso y el registro de despliegue (sin información sensible). Marca aprobado solo cuando todos los casos tengan el resultado esperado.

## Diagnóstico si falla

- Si B ve proyectos de A, detén la prueba y revisa el filtro por identidad en `app/api/projects.py`.
- Si un intento ajeno devuelve 500 en vez de 404, revisa el traceback en Render; no desactives restricciones o RLS.
- Si B no puede iniciar sesión por `access_denied`, revisa que esté incluido en Google Auth Platform → Audience → Test users.
- Si la lista de B queda vacía sin errores, es el comportamiento esperado mientras B no tenga proyectos propios.

## Cierre

Solo después de aprobar esta comprobación se debe marcar como **validado en producción** el aislamiento básico por propietario. Las asignaciones de miembros/roles y su administración siguen siendo una fase posterior.
