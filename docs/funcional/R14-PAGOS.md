# R14: registro y verificación independiente de abonos

## Uso en desarrollo

Aplicar `pnpm migration:run` en el backend. R14 añade `1792900000000-PaymentVerification` y `1792910000000-PaymentLegacyChecks`. Los pagos anteriores conservan sus importes, referencias, estados y autores disponibles, y se identifican como históricos; no se inventan verificadores.

La landing usa el servidor de desarrollo en `http://localhost:4321`, administrable con `pnpm astro dev status`, `stop` y `logs`. El backend usa `pnpm start:dev`. No se requiere una compilación paralela ni servir `dist` para trabajar en el panel.

## Roles

- **Asesor comercial:** selecciona titular, contrato y cuota, registra abonos pendientes, incorpora comprobantes, regulariza históricos sin autor y solicita rectificaciones. Su panel y API se limitan a estas operaciones.
- **Administrador:** consulta la bandeja, verifica evidencia y confirma o rechaza abonos y rectificaciones. Conserva las operaciones de R13.
- No se puede verificar un movimiento propio, incluso después de cambiar de rol. La regularización histórica también queda vinculada al asesor que la realizó.

No se crean cuentas automáticamente. Tras compilar el backend, usar `node scripts/create-admin.mjs --asesor` para crear un asesor o habilitar la contraseña de uno existente que todavía no tenga acceso. El script solicita la contraseña sin mostrarla y conserva su política de mínimo 12 caracteres. Sin `--asesor` mantiene su función administrativa anterior. No cambia de rol ni sobrescribe contraseñas existentes.

## Registro y verificación

En **Pagos**, el asesor selecciona al titular del contrato (aunque aún no haya realizado su primer pago), el contrato y la cuota vigente de un cronograma aprobado. Registra importe, fecha y hora de Lima, método, referencia y comprobante opcional. La moneda se obtiene del contrato.

Registrar produce **pendiente**, sin reducir saldo, convertir al lead en cliente ni activar el cronograma. Solo un administrador puede confirmar o rechazar con fundamento. Un pendiente no reserva saldo. Si dos verificadores compiten, la transacción vuelve a comprobar el saldo antes de aplicar cada abono.

Los excedentes quedan pendientes y generan una incidencia: no se distribuyen entre cuotas ni crean saldo a favor. El administrador debe resolverlos externamente y rechazar el registro incorrecto o duplicado cuando corresponda. El historial se conserva.

Se señalan posibles duplicados con la misma referencia normalizada, método, moneda, importe y fecha de Lima. Si realmente son operaciones diferentes, el administrador debe documentar `Operaciones distintas:` seguido de la evidencia de conciliación en su fundamento. Un registro sin referencia sigue protegido contra reintentos mediante su UUID; la ausencia de referencia no demuestra que sea una operación distinta.

La clave UUID de registro se reutiliza al reintentar el mismo formulario. Cada decisión tiene su propia clave: repetir exactamente una decisión devuelve el resultado anterior; una decisión contradictoria devuelve `409`. Los cálculos financieros usan centavos `BigInt` y PostgreSQL `NUMERIC`.

## Comprobantes privados

Se aceptan PDF, PNG y JPEG de hasta 10 MB. Se comprueban extensión y firma del contenido, se sanea el nombre y se guarda la huella SHA-256 junto al contenido en PostgreSQL. Las rutas de descarga exigen una sesión financiera autorizada y responden sin caché.

No se sustituyen ni borran comprobantes; se añaden nuevas evidencias. Los enlaces HTTPS anteriores permanecen visibles como evidencia histórica externa. Los nuevos registros no admiten URLs externas. Sin comprobante se muestra **evidencia incompleta**; la confirmación requiere documentar la revisión bancaria o externa realizada.

## Correcciones e históricos

Un registro pendiente incorrecto se rechaza y se registra otro, indicando el ID del pago que reemplaza. El original no cambia.

Un confirmado se rectifica por completo: el asesor solicita el movimiento compensatorio y un administrador distinto lo aprueba. No se altera el importe ni el estado original; `pago_neto` expresa el importe aplicado después de la compensación. Solo se permite una compensación confirmada de cada pago.

Si la cuota sigue vigente, la compensación reabre su saldo. Un cronograma completado vuelve a ejecución y registra la reapertura. No se elimina el cliente ni se deshace el historial de inicio del servicio.

Si el pago ya fue reconocido al aprobar una versión posterior, la compensación requiere una nueva versión R13. Abrir el cronograma, seleccionar la **rectificación a incorporar**, generar la distribución del saldo corregido y aprobarla. La compensación y la aplicación de esa versión se confirman en una sola transacción. Si cambian los cobros durante la revisión, debe prepararse una versión actualizada. El reemplazo del pago, si corresponde, se registra posteriormente como un nuevo pendiente.

Los pendientes históricos sin registrador requieren regularización explícita de un asesor. Si carecen de método o fecha válidos, se rechazan y se registra un reemplazo completo. Un histórico sin cuota no se confirma cuando el contrato ya tiene cronograma: debe conciliarse mediante rechazo y nuevo registro en la cuota correspondiente. Ninguna regularización sobrescribe los datos originales.

## API y compatibilidad

- `POST /admin/cuotas/:id/abonos`: registro **pendiente**, exclusivo del asesor; JSON o multipart con el campo opcional `archivo`.
- `GET /admin/pagos`: bandeja paginada; filtros `estado`, `contrato`, `q`, `incidencias`, `page` y `pageSize`.
- `GET /admin/pagos/:id`: original, importe aplicado, comprobantes, eventos y rectificaciones.
- `POST /admin/pagos/:id/decision`: `estado`, `motivo` y `claveIdempotencia`; exclusivo del administrador.
- `POST /admin/pagos/:id/comprobantes`: añade evidencia privada.
- `GET /admin/pagos/comprobantes/:id`: descarga autenticada.
- `POST /admin/pagos/:id/regularizacion`: asesor, con motivo y clave.
- `POST /admin/pagos/:id/rectificaciones`: solicitud del asesor con motivo y clave.
- `POST /admin/pagos/rectificaciones/:id/decision`: decisión independiente del administrador.
- `PATCH /admin/pagos-previos/:id`: conserva la ruta y utiliza el nuevo DTO y servicio de decisión; no permite eludir las reglas.
- Generación y guardado de versiones R13 aceptan `idRectificacion` opcional.

Las demás rutas siguen siendo administrativas por defecto. Las escrituras genéricas de pagos están bloqueadas. El agente de cobranza y el envío de recordatorios quedan fuera; no se envían mensajes ni se declaran depósitos recibidos sin confirmación.

## Pruebas

`pnpm test:payment-verification` compila el backend y ejecuta la aceptación y casos de permisos, concurrencia, excedentes, evidencia e historial en esquemas PostgreSQL temporales. `node scripts/test-payment-verification.mjs --browser` añade la prueba del panel de desarrollo en 4321 con datos temporales e intercepta sus llamadas financieras. Usa Edge instalado por defecto; `R14_BROWSER_CHANNEL` permite seleccionar otro canal compatible. Guarda `.temp/r14-browser.png`.

También se ejecutan las regresiones `test-payment-schedules.mjs`, `test-admin.mjs`, `test-contracts.mjs`, `test-packages.mjs --finance-only` y `test-lead-profile.mjs`. Los helpers de los casos financieros anteriores registran mediante un asesor y confirman explícitamente con otro administrador; las pruebas nuevas de R14 llaman a los endpoints directamente para comprobar los pendientes y la separación de roles.
