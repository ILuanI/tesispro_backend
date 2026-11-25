# R13 — Cronogramas flexibles

En desarrollo, usar los servidores habituales: backend `pnpm start:dev` y landing `pnpm astro dev --background`. No se necesita un build paralelo ni un servidor de producción.

## Preparación

Ejecutar `pnpm migration:run` en el backend. La migración `1792800000000-FlexiblePaymentSchedules` conserva los IDs de cronogramas, cuotas y abonos anteriores; los incorpora como versiones históricas en operación. `1792810000000-PaymentActivationGuard` comprueba el pago de la primera cuota efectiva para esa regla, sin contar abonos de otras cuotas como si la hubieran pagado. Si los importes históricos no concuerdan con el acuerdo, la migración falla y no modifica parcialmente esos datos.

En **Pagos → Modalidades de pago**, configurar y habilitar las alternativas. Las cuatro modalidades iniciales están deshabilitadas y sin regla de activación. No se inventan condiciones comerciales. Se pueden configurar sus nombres, tipo, cantidad, condiciones, regla y fases. En fases, los porcentajes se expresan en puntos básicos: 2000 + 4000 + 4000 = 10000 (100%). Los días se cuentan desde la fecha base seleccionada para la generación.

## Operación

Desde el contrato, abrir su cronograma. La propuesta debe estar aceptada y ser del mismo lead. Generar la distribución, ajustar importes, fechas y entregables, motivar las excepciones y guardar el borrador. Solicitar aprobación y luego aprobar mediante la acción explícita. El mismo administrador activo puede solicitar y aprobar; autor, fecha, motivo y versión quedan registrados. Cambiar una distribución o condición aprobada siempre requiere una nueva versión.

Estados: `borrador → pendiente_aprobacion → negociado → en_ejecucion → completado`. Al aprobar un reemplazo, la versión anterior queda `sustituido`. Los borradores no entran en cartera ni admiten abonos. Guardar un reemplazo no sustituye la versión vigente hasta aprobarlo.

Reglas de activación, copiadas en cada versión:

- Sin configurar: el cronograma permanece negociado. Para incorporar una regla, configurar la modalidad y aprobar una nueva versión.
- Primer abono: cualquier importe positivo confirmado del contrato, incluidos los anteriores, activa la ejecución.
- Primera cuota: los cobros confirmados posteriores a la preparación de esta versión deben cubrir el importe de su primera cuota. No exige un solo pago. Los cobros reconocidos al preparar una renegociación no se vuelven a aplicar.

Al cubrir toda la deuda, se marca completado. Las fechas pactadas no se desplazan al activar. Los cronogramas nuevos negociados muestran saldo sin marcar vencidos; los activos en ejecución sí muestran vencidos según la fecha de Lima. Los históricos conservan su comportamiento anterior.

La moneda y el total vienen de la propuesta. Se calcula exclusivamente en centavos (`BigInt`) y `NUMERIC` en PostgreSQL. En cada versión: **cobros reconocidos al preparar + suma de cuotas = total acordado**. La base valida la suma mediante un trigger diferido. Los abonos posteriores reducen el saldo actual sin modificar esta instantánea.

Una renegociación programa únicamente el saldo pendiente. Los pagos siguen vinculados a sus cuotas originales. Si se confirma un pago mientras se revisa el reemplazo, su aprobación falla con `409`: preparar una versión actualizada. Las cuotas sustituidas no admiten nuevos abonos ni duplican deuda en los listados. Los reintentos de pagos anteriores con la misma clave y datos devuelven el pago original incluso tras sustituir su versión.

Los entregables se toman de la propuesta aceptada o se registran como compromisos adicionales. Su progreso es independiente de la obligación de pago y se audita. No implica prórrogas automáticas.

## API

- `GET/PATCH /admin/modalidades-pago[/:id]`: configuración con revisión optimista.
- `GET /public/modalidades-pago`: solo alternativas habilitadas, sin datos de contactos ni cronogramas privados.
- `POST /admin/contratos/:id/cronograma/preview`: generación según modalidad (`idModalidad`, `cantidad`, `primerVencimiento`).
- `POST/PATCH /admin/contratos/:id/cronograma`: nuevo borrador (`revision`, `idModalidad`, `cuotas`, `condiciones`, `motivo`). Ambos verbos crean versiones; no editan cuotas anteriores.
- `GET /admin/contratos/:id/cronograma`: respuesta anterior más `perfilPagos`, con versiones, auditoría y entregables de origen.
- `GET /admin/contratos/:id/cronograma/versiones`: historial y revisión.
- `POST /admin/contratos/:id/cronograma/versiones/:version/acciones`: `solicitar` o `aprobar`, con `revision` y `motivo` cuando corresponde.
- `PATCH /admin/cuotas/:id/entregables/:indice`: avance `pendiente`, `en_progreso` o `entregado`.

Se conservan las rutas de abonos. Las escrituras requieren sesión de administrador activo y Origin permitido. Tesi consulta únicamente el catálogo público, explica las opciones y no registra ni aprueba acuerdos financieros. No se agrega otro proveedor de IA ni se requiere una clave para esta explicación.

## Verificación

`pnpm test:payment-schedules` compila el backend y prueba migración, pagos, concurrencia, versiones, permisos y sumas en un esquema PostgreSQL temporal que se elimina al finalizar. `node scripts/test-payment-schedules.mjs --browser` añade la prueba sobre la landing de desarrollo en `http://localhost:4321`; intercepta sus llamadas administrativas hacia el backend del esquema temporal. No inserta fixtures en el esquema habitual. Guarda una captura en `.temp/r13-browser.png`. Si falta Chromium de Playwright, se puede usar Microsoft Edge instalado con `$env:R13_BROWSER_CHANNEL='msedge'` en PowerShell.

`node scripts/test-packages.mjs --finance-only` ejecuta los ocho grupos de regresión de catálogo, contratos y pagos afectados por R13. El harness antiguo de chat R11 sigue separado; las pruebas actuales del puente de Tesi están en la landing y en `test-lead-profile.mjs`.

En la landing: `pnpm test:payment-modes`, `pnpm test:negotiation`, `pnpm check` y `pnpm build`. Las pruebas de Tesi usan simulaciones; no requieren una clave real.
