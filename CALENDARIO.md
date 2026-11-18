# Calendario de citas

Las reservas de la landing, recursos y panel usan PostgreSQL y un calendario exclusivo de la cuenta Google autorizada. El visitante no inicia sesión con Google. El panel está en `/admin/reuniones` (Calendario).

## Activación

1. Aplicar `pnpm migration:run` contra la base elegida, con respaldo previo. La migración `GoogleCalendar1793200000000` conserva las reuniones anteriores como `sin_vincular`; no envía invitaciones antiguas. En Vercel las migraciones se ejecutan por separado, no al arrancar.
2. Configurar en el backend `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI` y `GOOGLE_TOKEN_ENCRYPTION_KEY`. Generar la última una sola vez con `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Guardarla también en el gestor de secretos y conservarla al redesplegar; cambiarla impide descifrar la autorización existente. El refresh token se almacena cifrado con AES-256-GCM en `google_calendar_connection`, nunca en el frontend.
3. En Google Cloud habilitar Calendar API y configurar audiencia y permisos `calendar.events.owned`, `calendar.freebusy` y `calendar.calendars.readonly`. La URI debe coincidir exactamente con `https://tesispro-backend.vercel.app/integrations/google/callback`. Para desarrollo local registrar además `http://localhost:3000/integrations/google/callback` y usar esa dirección en el entorno local. No hacen falta orígenes JavaScript para este flujo de servidor.
4. Crear manualmente «Citas Tesispro» en Google Calendar con la cuenta propietaria. Copiar su ID desde Configuración → Integrar calendario.
5. Abrir el panel como administrador, pulsar **Conectar Google**, autorizar los permisos y regresar al panel. Guardar el ID de «Citas Tesispro» con **Comprobar y guardar**. Alternativamente configurar `GOOGLE_CALENDAR_ID` antes de conectar. `CALENDAR_ADMIN_URL` debe ser la dirección real del panel en el frontend para regresar automáticamente después de OAuth.
6. Crear una cita con un correo controlado, comprobar el evento, la invitación y Meet; probar reprogramación y cancelación. El panel tiene **Abrir Gmail** para preparar un mensaje y enviarlo manualmente desde tu cuenta.

El `.env` local se preparó a partir del archivo de credenciales entregado; sus valores no están versionados. Los secretos deben configurarse también en Vercel. La autorización de Google y el ID de calendario requieren intervención de la cuenta propietaria. No se necesita comprar un dominio ni asumir que la cuenta es Workspace: se consulta si el calendario admite `hangoutsMeet` y, de lo contrario, se conserva la cita sin Meet. Puede añadirse un enlace de Meet manualmente desde el detalle.

Si Google Cloud mantiene una aplicación externa en modo de pruebas, los refresh tokens con permisos Calendar pueden expirar a los siete días. Revisar el estado de publicación y requisitos de Google para el uso previsto; el panel permite reconectar. [OAuth](https://developers.google.com/identity/protocols/oauth2#expiration).

## Comportamiento y recuperación

- Nuevas reservas: 30 minutos, lunes a viernes de 09:00 a 18:00, próximos 30 días, `America/Lima`. Solo «Citas Tesispro» bloquea los horarios de Google. Los intervalos externos se comparan por solapamiento, incluyendo eventos de todo el día.
- La reserva local queda pendiente antes de escribir en Google. El identificador externo deriva del UUID local, evitando crear otro evento al reintentar. Solo se confirma después de persistir la respuesta de Google. Los cupos pendientes se mantienen bloqueados si el resultado remoto es incierto.
- **Actualizar** recupera operaciones pendientes y refleja cambios o cancelaciones de Google. Procesa hasta 10 citas por pulsación, rotando por antigüedad de revisión. La landing conserva la clave de una solicitud pendiente en sessionStorage y permite comprobarla después de una recarga, con acceso restringido a su cookie de sesión.
- Las reprogramaciones mantienen el horario anterior y una reserva del nuevo hasta confirmar Google. Las cancelaciones inciertas mantienen el cupo hasta comprobar que el evento fue eliminado. Los errores de ocupación comprobados antes de una escritura liberan la reserva nueva.
- Los eventos externos bloquean horarios; no se convierten automáticamente en leads. Las citas anteriores solo se vinculan a Google mediante **Sincronizar e invitar**, para evitar correos masivos.
- Los cambios de Google fuera del horario comercial se reflejan igualmente. Si chocan con otra reserva local, el panel informa el conflicto para resolverlo en Google. La API no hace atómica la secuencia consultar ocupación → crear evento; un cambio simultáneo realizado fuera de Tesispro sigue siendo posible.
- Las invitaciones usan `sendUpdates=all`. La visibilidad automática en el calendario del invitado depende de sus preferencias y aceptación. La entrega de correo no se presenta como verificada por Tesispro.
- `calendar_operation` registra intenciones, usuario, resultado y errores sin credenciales. Las rutas administrativas conservan los permisos y comprobación de origen existentes; las reservas públicas tienen límite persistente de 30 intentos por IP cada 10 minutos. No exponer el backend tras un proxy con una configuración de IP que permita falsificar el origen.

## Verificación

`pnpm test:calendar` compila y ejecuta pruebas con un proveedor Google simulado. Crea un esquema PostgreSQL temporal, aplica las migraciones y elimina el esquema al terminar. **No crea eventos reales.** Configurar `DB_*` para una instancia local de pruebas antes de ejecutarlo. Cubre permisos, origen, ocupación parcial, doble envío, simultaneidad, respuestas perdidas, reprogramación, cambios externos, cancelación, Meet opcional y cifrado.

Frontend: `pnpm exec tsc --noEmit`, `pnpm check` y `pnpm build`. La prueba real con Google requiere completar la activación anterior.

En esta instalación, TypeScript, build y pruebas de Edge pasaron. `astro check` falla al cargar el runtime WASM de su dependencia `@astrojs/astro2tsx` (`@emnapi/runtime` 2.0.0-beta.2 con core 1.11.3); es una incompatibilidad del verificador, no un diagnóstico de los componentes. No se cambiaron las versiones de Astro para resolverla.
