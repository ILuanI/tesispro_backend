# WhatsApp con Tesi

El módulo está deshabilitado por defecto (`WHATSAPP_ENABLED=false`). Todas las variables se documentan en `.env.example`, sección 6, y los modelos de IA en la sección 4.

## Flujo

1. Meta envía cada mensaje a `POST /webhooks/whatsapp`. Se valida la firma con el App Secret, se guarda el evento y se responde 200.
2. En segundo plano se procesa la cola. En Vercel, `waitUntil` mantiene viva la función hasta terminar; en un servidor Node la tarea sigue ejecutándose.
3. Cada mensaje pasa por el mismo orquestador que el chat web. El orquestador elige uno o más agentes (marketing, negociador, cobranza, académico o postventa) y se envía la respuesta por Cloud API.

`GET /webhooks/whatsapp` responde el desafío de verificación de Meta. `POST /internal/whatsapp/jobs/process` es opcional: con `WHATSAPP_WORKER_SECRET` permite que un cron externo procese la cola y reintente envíos fallidos. Sin él, los reintentos pendientes se procesan cuando llega el siguiente mensaje.

PostgreSQL conserva el orden por remitente: un mensaje en espera de reintento bloquea los posteriores del mismo remitente. Después de 5 intentos el evento queda `failed`. El texto entrante de la cola se borra al terminar; la conversación queda en el CRM. El token interno de contacto se cifra con `WHATSAPP_SESSION_KEY` (AES-256-GCM).

## Ventana de 24 horas

Meta solo permite mensajes libres durante las 24 horas siguientes al último mensaje del usuario. Tesi responde siempre a un mensaje entrante, así que no usa plantillas. Antes de enviar se comprueba la ventana; si venció (por ejemplo, tras reintentos), el mensaje se omite.

## Contexto de la conversación

`WHATSAPP_CONTEXT_MINUTES` (defecto 5) es una decisión de la aplicación, no una regla de Meta. Mientras el usuario escribe sin pausas mayores a ese tiempo, Tesi recibe el historial reciente (hasta 12 mensajes). Tras una pausa más larga, el siguiente mensaje empieza sin historial. Lo que ya se sabe del contacto (datos, necesidad, etapa, calificación) se conserva siempre.

## Identidad y clasificación

El `sender_id` de Meta (ID de usuario de WhatsApp o, si no existe, el número) identifica al contacto en `whatsapp_session`:

- Si el número ya pertenece a un buyer o lead, la sesión se vincula a él.
- Si no existe, se crea un buyer con canal `whatsapp` y ese teléfono. Si Meta no envía número, se atiende sin crear contacto.
- Un buyer ya convertido se sigue hasta su lead.

Después de cada turno del negociador, la calificación de Tesi puede avanzar la clasificación. Nunca retrocede:

| Situación | Cambio |
| --- | --- |
| Buyer con necesidad y etapa identificadas, consulta de precio, modalidad o plazo, o intención de contratar | Se convierte en lead (`nuevo`) |
| Lead `nuevo` con necesidad y etapa | `calificado` |
| Lead `nuevo` o `calificado` con intención de contratar | `en_negociacion` |

`propuesta_enviada`, `payer` (cliente) y `perdido` los decide el equipo comercial; el chat no los cambia. Si el contacto ya es cliente, el orquestador lo sabe: sus pagos van a cobranza y sus incidencias o avances a postventa.

Cuando el usuario pide un asesor o confirma que quiere contratar, la conversación pasa a atención humana: se registra la solicitud, se avisa al usuario y Tesi deja de responder hasta que un asesor reanude la atención.

## IA, cupo y respaldo

- `WHATSAPP_AI_MODE=live` (defecto) usa los agentes con IA. `off` responde solo por reglas: saludos, catálogo, paquetes por nombre y recursos públicos.
- `WHATSAPP_AI_DAILY_LIMIT` (defecto 500) limita los turnos con IA por día UTC. Al superarlo se responde por reglas.
- Si todos los proveedores fallan, el mensaje se responde por reglas en lugar de quedar sin respuesta.
- No se guardan contraseñas ni números de tarjeta: el mensaje se omite y se pide no compartirlos.

## Puesta en marcha

1. Aplicar las migraciones (`pnpm migration:run`) con las variables de la base de producción.
2. En Vercel, configurar las claves de IA (sección 4) y las variables de WhatsApp (sección 6), con `WHATSAPP_ENABLED=true` y `WHATSAPP_ALLOWED_SENDERS` vacío. Desplegar.
3. En Meta > WhatsApp > Configuración: URL `https://<backend>/webhooks/whatsapp`, Verify Token igual a `WHATSAPP_VERIFY_TOKEN`, y suscribir el campo `messages`. Usar un token permanente de System User.
4. Escribir al número desde un WhatsApp personal y comprobar la respuesta, el buyer creado y su conversación en el panel.

Para probar con pocas personas antes de abrirlo, poner sus números en `WHATSAPP_ALLOWED_SENDERS`.

Si el token tiene acceso a varias cuentas de mensajería en el número, configurar `WHATSAPP_MESSAGING_ACCOUNT_ID`. [Graph API v27.0](https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/) · [Envío de mensajes por Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages)

## Pruebas locales

Compilar con `pnpm build` y ejecutar `pnpm test`. Para la integración, usar un clúster PostgreSQL local descartable con una base vacía `whatsapp_test` en `127.0.0.1`, definir `WHATSAPP_TEST_DATABASE_URL` solo para esa base y ejecutar `pnpm test:e2e test/whatsapp.e2e-spec.ts`. La prueba aplica migraciones en un esquema temporal; Cloud API y los proveedores de IA se simulan. Los casos con IA llevan el prefijo `live:`.
