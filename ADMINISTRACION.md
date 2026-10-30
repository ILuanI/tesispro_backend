# API del panel administrativo

La guía de instalación y operación está en `../tesispro_frontend/ADMINISTRACION.md`.

## Datos y compatibilidad

`cronograma_pago` representa la distribución del saldo de un contrato; es único por contrato. `cuota_pago` contiene número, monto y fecha de vencimiento. `pago` conserva los cobros e incorpora `id_cuota`, `id_usuario_registro` y una clave UUID única de idempotencia. Los registros históricos pueden conservar `id_cuota=NULL`.

Los importes se reciben y devuelven como cadenas decimales. El cálculo utiliza centavos con `bigint`. Los identificadores PostgreSQL `bigint`, incluidos los de leads y propuestas, siguen siendo cadenas. Las fechas de vencimiento son `YYYY-MM-DD`; los instantes de abonos incluyen zona horaria.

La migración nueva no reemplaza la migración inicial ni modifica sus datos históricos. Completa por código los estados de leads ausentes, sin reemplazar estados existentes. Al revertir conserva estos catálogos porque los historiales y pagos pueden referenciarlos.

Los servicios administrativos utilizan consultas parametrizadas mediante `DataSource`/`EntityManager` de TypeORM. La creación/edición del cronograma y los abonos bloquean el contrato; el abono además bloquea su cuota. Esto serializa las operaciones financieras de un mismo contrato. La suma programada es exacta y los cobros no pueden superar el saldo.

El trigger de conversión de pago a cliente se conserva. El trigger de historial lee el autor y motivo establecidos mediante variables transaccionales de PostgreSQL, registrando una sola entrada por cambio real de estado.

## Endpoints

| Endpoint | Operación |
| --- | --- |
| `POST /auth/login` | Correo y contraseña; establece cookie de sesión |
| `POST /auth/logout` | Revoca sesión y elimina cookie |
| `GET /auth/me` | Administrador autenticado, sin credenciales |
| `GET /admin/catalogos` | Estados, responsables activos, canales, modalidades y métodos |
| `GET /admin/resumen` | Leads, distribución de estados, saldos por moneda y próximos cobros |
| `GET/POST /admin/leads` | Listar/crear leads |
| `GET/PATCH /admin/leads/:id` | Consultar/editar campos del formulario |
| `GET /admin/leads/:id/historial` | Historial de estados con autor y motivo |
| `GET /admin/contratos` | Buscar contratos y consultar saldo |
| `GET /admin/contratos/catalogos` | Servicios activos, monedas y modalidades |
| `GET /admin/contratos/:id` | Detalle documental, propuesta, servicios y permisos de edición/eliminación |
| `POST /admin/contratos` | Crear propuesta aceptada, detalles y contrato en una transacción |
| `PATCH /admin/contratos/:id` | Editar contrato y propuesta, con bloqueo financiero por dependencias |
| `DELETE /admin/contratos/:id` | Eliminar sin cronograma ni pagos, conservando propuesta y detalles |
| `GET/POST/PATCH /admin/contratos/:id/cronograma` | Consultar/crear/editar cuotas |
| `POST /admin/contratos/:id/cronograma/preview` | Generar distribución mensual sin persistir |
| `GET /admin/cuotas` | Listado de cobranza filtrado |
| `GET/POST /admin/cuotas/:id/abonos` | Historial/registro de abonos confirmados |
| `PATCH /admin/pagos-previos/:id` | Resolver cobros históricos pendientes antes de programar |

Los listados devuelven `{ items, total, page, pageSize }`, con 20 registros por defecto y máximo 100. `q` busca contacto; leads admiten `estado`, `responsable` o `sin_asignar`, `canal`, `desde`, `hasta`; cuotas admiten `estado`, `contrato`, `moneda`, `vencida`, `desde`, `hasta`. `sort` y `direction` tienen listas de valores permitidos. Los filtros se ejecutan en PostgreSQL.

Contratos admite `q` (nombre, correo o número), `moneda`, `desde`/`hasta` (fecha de firma en Lima), `planificacion=con|sin`, `page` y `pageSize`. El formato existente usado por Pagos se conserva y añade `fechaFirma`, `versionClausulas`, `archivoUrl`, `aceptaAutoriaEstudiante` y `tienePagos`. El detalle añade `propuesta.detalles`, `editableFinanciero` y `eliminable`.

## Registro de contratos

Ejemplo de `POST /admin/contratos` (el ID de servicio debe existir en el catálogo):

```json
{
  "idLead": "1",
  "fechaFirma": "2026-10-15T09:00:00-05:00",
  "versionClausulas": "1.0",
  "aceptaAutoriaEstudiante": true,
  "archivoUrl": null,
  "propuesta": {
    "moneda": "PEN",
    "modalidad": "virtual",
    "tiempoEntregaDias": 20,
    "condiciones": "Condiciones acordadas con el estudiante",
    "detalles": [
      { "idServicio": 1, "descripcion": "Revisión metodológica", "cantidad": 1, "precioUnitario": "200.00", "descuento": "0.00" }
    ]
  }
}
```

El administrador autor se toma de la sesión. El servidor calcula `monto_total` con centavos enteros; cada descuento es monetario para toda la línea. Se rechazan descuentos superiores al bruto, total no positivo o mayor a `99999999.99`, más de 100 líneas o cantidades fuera de 1–32767. La fecha requiere zona horaria, la autoría debe ser `true` y el documento admite URL HTTPS o `null`. `idEtapa` opcional se conserva al editar detalles históricos; no se introduce un editor de etapas.

`PATCH` admite los campos documentales y, antes de tener cronograma/pagos, `propuesta` completa, `fechaFirma` y confirmación de autoría. Lead y propuesta asociados no se pueden reemplazar. Con cronograma o cualquier pago, solo se admite `archivoUrl` y `versionClausulas`; otros cambios válidos devuelven 409. La eliminación devuelve 409 con cualquier dependencia, incluso un pago rechazado o reembolsado. No hay eliminación en cascada de datos financieros. Las operaciones bloquean el contrato igual que cronogramas y abonos.

Crear un contrato no cambia el estado del lead ni crea un cliente: se mantiene el trigger del primer pago confirmado. Se conservan las reglas de indicadores y las rutas heredadas de escritura continúan bloqueadas.

La migración `ContractServices1792060000000` inserta por código los tres servicios iniciales sin sobrescribir entradas existentes. `precio_base=0` es solo un valor técnico: el precio contractual se introduce manualmente, sin aplicar las tarifas provisionales de Tesi. Su reversión conserva el catálogo para proteger referencias e información comercial.

`pnpm run test:contracts` verifica HTTP y PostgreSQL en un esquema temporal: migración idempotente, validación, atomicidad, filtros, edición, eliminación, concurrencia con cronogramas/abonos y conservación histórica. No introduce datos de prueba en la base de trabajo.

Crear o editar cronograma recibe `{ cuotas: [{ nroCuota, monto, fechaVencimiento }] }`. Preview recibe `{ cantidad, primerVencimiento }`. Registrar abono recibe `{ monto, metodo, fechaPago, claveIdempotencia, referenciaOperacion?, comprobanteUrl? }`. Reutilizar una clave con datos diferentes devuelve 409.

El `PATCH` de lead recibe los mismos campos requeridos que el formulario de creación; no es una modificación arbitraria de la entidad. Campos requeridos: `nombres`, `correo`, `telefono`, `idEstado`. Campos opcionales: contacto secundario, preferencias, responsable, perfil objetivo, interés y `motivo` (obligatorio al cambiar estado).

## Autenticación y operación

Hash scrypt con sal aleatoria; sesiones PostgreSQL con token almacenado como SHA-256. No se guardan tokens en `localStorage`. Se verifica usuario activo y rol administrador en cada solicitud. Login tiene un límite por IP de diez intentos por quince minutos en este monolito; las mutaciones verifican `Origin` contra `APP_ORIGIN`.

`pnpm run admin:create` configura el primer acceso desde una terminal con contraseña oculta. No hay registro público ni credencial predeterminada. Para revocar accesos, desactiva el usuario o elimina sus sesiones en PostgreSQL mediante el procedimiento operativo correspondiente.

`pnpm run db:inspect` muestra estructura, conteos y triggers sin revelar credenciales ni contactos. `pnpm run test:admin` compila y prueba HTTP real en un esquema nuevo que se elimina al terminar; nunca usa las tablas de la base de trabajo para los datos de prueba.

## Datos de demostración para visualización

`pnpm run demo:seed` carga en la base configurada en `.env` una muestra identificada por nombres `[DEMO]`, condiciones/referencias `[DEMO TESISPRO]` y correos `demo.visualizacion.01@example.test` hasta `demo.visualizacion.32@example.test`. No crea usuarios, no modifica contraseñas ni registros existentes, y no envía comunicaciones ni consulta proveedores de IA. Usar esta carga solo en una base destinada a demostración/desarrollo: sus cifras se incluyen en los agregados generales del panel.

La muestra contiene 32 leads (4 del día), 28 propuestas, 20 contratos, 16 cronogramas, 64 cuotas y 23 pagos. Incluye contratos sin cronograma, cuotas pagadas/parciales/pendientes/vencidas, cobros previos confirmados/pendientes/rechazados, PEN y USD, perfiles académicos y seguimientos simulados. Los nombres de universidades y etapas demo son ficticios. Todos los importes son de demostración, sin relación con tarifas comerciales. Los triggers existentes realizan la conversión a cliente y registran el historial de los abonos.

Las fechas se distribuyen en los 30 días anteriores a la primera carga tomando Lima como referencia, y los vencimientos incluyen fechas futuras. Dashboard e Indicadores consultan las mismas tablas: recargar las páginas o pulsar Actualizar en Indicadores, con el rango **Últimos 30 días**. Con la muestra sola se obtienen LPO 75 %, TCP 28,13 %, TAP 74,07 % y TPC 2 días, además de distribuciones por día, universidad, ciclo, etapa y estado de propuesta. Las métricas de anuncios, visitas y chat conservan «Sin datos» porque no se fabrican esos eventos.

Repetir el comando no duplica ni actualiza la muestra. Si está parcialmente cargada o se cambiaron sus correos, el comando se detiene sin escribir cambios. No refresca las fechas de datos ya creados: para una muestra antigua, utilizar el filtro de fechas del periodo de carga. Para localizar o retirar posteriormente estos registros, utilizar la lista exacta `demoEmails` y `demoMarker` del script, respetando sus dependencias financieras.

`pnpm run test:demo` prueba la carga, idempotencia, coherencia financiera y agregados de dashboard/indicadores en un esquema temporal aislado que se elimina al terminar. No añade datos a la base de trabajo.
