# Piloto local de WhatsApp

El módulo está deshabilitado por defecto. Los valores de configuración se documentan en `.env.example`. Los remitentes incluidos en el piloto deben conocer el alcance de la prueba y evitar enviar datos personales o documentos. Se aceptan consultas generales en texto. Los casos privados requieren verificación por el canal de atención de TesisPro.

## Flujo

- `GET /webhooks/whatsapp` devuelve el desafío de Meta después de comprobar el token de verificación.
- `POST /webhooks/whatsapp` autentica el cuerpo original y confirma recepción después de guardar los eventos.
- `POST /internal/whatsapp/jobs/process` acepta un Bearer independiente y ejecuta un trabajo o una recuperación por invocación. Operarlo requiere un disparador aprobado. El endpoint no tiene un bucle en memoria que espere trabajo.

PostgreSQL conserva el orden recibido por sesión. Un evento anterior en espera de reintento bloquea a los posteriores de la misma sesión. El UUID de turno permanece estable. El texto entrante de la cola se borra al finalizar el evento. La conversación de Tesi conserva su historial conforme a la política del CRM. La configuración de retención de ese historial, de sesiones de canal y de salidas sigue pendiente antes de abrir el canal a terceros. El token interno de contacto se cifra con AES-256-GCM mediante `WHATSAPP_SESSION_KEY`. Conservar la clave fuera de la base y de sus copias. La rotación requiere recifrar las sesiones existentes. Los identificadores y el contenido de canal requieren acceso restringido a la base y a sus copias.

El estado `ambiguous` requiere conciliación. Un webhook de estado con el ID de Graph o con el identificador opaco enviado en la solicitud permite registrar el resultado. Si Meta no devuelve un estado correlacionable, revisar manualmente la salida sin volver a enviarla por defecto.

## IA opcional y presupuesto

Empezar con `WHATSAPP_AI_MODE=off`. Saludos, catálogo, paquetes reconocidos y recursos públicos usan datos locales. `simulate` sustituye la clasificación opcional por una decisión determinista. `live` permite una llamada de clasificación para consultas comerciales ambiguas, sin historial, documentos ni un segundo proveedor. Si no hay cupo o falla el proveedor, el turno devuelve una aclaración local. El modo de IA solo controla el proveedor de IA. Para pruebas sin envíos, usar el cliente simulado de la suite.

El límite compartido `WHATSAPP_AI_DAILY_LIMIT` cuenta intentos reservados por día UTC, incluso si el proveedor falla. El valor `0` bloquea las llamadas. `WHATSAPP_AI_OUTPUT_TOKENS` limita la salida configurada en el proveedor y `WHATSAPP_AI_TIMEOUT_MS` limita el tiempo de espera. Los valores iniciales son 10 intentos, 128 tokens de salida y 5000 ms. El límite de intentos corresponde a WhatsApp; el proveedor puede facturar también los tokens de entrada de cada intento.

## Activación pendiente

El plan real y las extensiones disponibles deben confirmarse en los paneles. No iniciar una suscripción nueva.

- Si el proyecto ya usa Vercel Pro, un Cron por minuto permite activar el consumidor. Vercel Cron invoca por GET. Haría falta aprobar un puente GET protegido por `CRON_SECRET` al consumidor existente. Sin cola acumulada, la espera suele corresponder al siguiente minuto, más el tiempo del turno. Un disparo por minuto representa 43.200 invocaciones en 30 días y se suma al uso de funciones del proyecto. Vercel Cron no reintenta una invocación fallida. PostgreSQL mantiene el trabajo disponible para la próxima invocación.
- En Hobby, una tarea cron admite frecuencia diaria con precisión de una hora. Una tarea diaria no sirve como único disparador del chat de 24 horas. Confirmar también las condiciones de uso de Hobby para el proyecto.
- Si el PostgreSQL contratado ya incluye `pg_cron`, salida HTTPS asíncrona y almacenamiento seguro de secretos del proveedor, puede programarse un POST autenticado al consumidor cada minuto. Antes de hacerlo, confirmar límites de ejecución, de red y cargos en ambos paneles. Se puede filtrar por trabajos vencidos o listos para evitar invocaciones HTTP vacías, conservando una revisión periódica que recupere reservas. No usar una llamada de red síncrona en la transacción del webhook.
- Para la primera prueba, una invocación manual del endpoint protegido después de recibir el mensaje comprueba el flujo con una sola ejecución adicional. Se puede elegir esta opción mientras se confirma el disparador automático.

Fuentes: [Límites y precios de Vercel Cron](https://vercel.com/docs/schedules/cron-jobs/usage-and-pricing) · [Reintentos de Vercel Cron](https://vercel.com/docs/schedules/cron-jobs/manage-cron-jobs) · [pg_cron](https://github.com/citusdata/pg_cron).

Si el token tiene acceso a varias cuentas de mensajería en el número, configurar `WHATSAPP_MESSAGING_ACCOUNT_ID` para seleccionar la cuenta explícitamente.

La versión inicial de Graph API es v27.0 y se puede configurar explícitamente. [Referencia oficial de Graph API v27.0](https://developers.facebook.com/docs/graph-api/reference/whats-app-business-account/) · [Envío de mensajes por Cloud API](https://developers.facebook.com/documentation/business-messaging/whatsapp/messages/send-messages)

## Primera prueba real, después de la aprobación

1. En el proyecto NestJS, aplicar las migraciones aprobadas y configurar los secretos en el panel del backend. Usar un token de usuario de sistema autorizado para el número de TesisPro, el App Secret de la app, un Verify Token propio, un secreto distinto para el consumidor y una clave de sesión de 32 bytes en Base64. Configurar el ID del número y solo los remitentes internos. Dejar `WHATSAPP_AI_MODE=off`.
2. Habilitar WhatsApp en el entorno autorizado, desplegarlo y configurar el callback HTTPS `/webhooks/whatsapp` con el Verify Token. Suscribir `messages` y confirmar la cuenta y la app en Meta.
3. Un remitente autorizado escribe primero desde su WhatsApp personal. Confirmar que el webhook guardó el evento e invocar una vez el POST protegido. Verificar una respuesta de texto, su estado de entrega y ausencia de gasto de IA. Revisar registros por identificador operativo, sin copiar mensajes, teléfonos ni credenciales. Mantener la respuesta dentro de la ventana de 24 horas y usar exclusivamente texto libre.

## Pruebas locales

Compilar con `pnpm build` y ejecutar `pnpm test`. Para la integración, usar un clúster PostgreSQL local descartable y una base vacía llamada `whatsapp_test` en `127.0.0.1`. Definir `WHATSAPP_TEST_DATABASE_URL` exclusivamente para esa base y ejecutar `pnpm test:e2e test/whatsapp.e2e-spec.ts`. La prueba aplica migraciones y limpia tablas de WhatsApp en esa base. Cloud API y el proveedor de IA se simulan.


Para ejecutar solo los casos nuevos de costo: `pnpm test:e2e test/whatsapp.e2e-spec.ts -t 'cost:'`.
