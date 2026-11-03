# Validación funcional de R3, R6, R7, R8, R13 y R14

La prueba integrada utiliza PostgreSQL con esquemas temporales y la landing de desarrollo en `http://localhost:4321`. Los datos de prueba se eliminan al finalizar. Los proveedores de IA se simulan: no se necesita una clave real ni se hacen llamadas comerciales al proveedor.

## Repetir la validación

Con PostgreSQL disponible, la configuración privada de conexión del backend y la landing de desarrollo iniciada, ejecutar en el backend:

```powershell
pnpm test:requirements
```

Este comando compila el backend una vez y ejecuta las pruebas de API, PostgreSQL y navegador. Continúa con las demás suites si una falla, termina con código distinto de cero cuando corresponde y guarda el resultado por requerimiento en `.temp/requirements-report.json`. Utiliza Microsoft Edge instalado para las pruebas de navegador.

Las páginas y sus componentes se sirven desde el servidor de desarrollo existente. Para probar el puente privado de Tesi sin tocar la base habitual, el proxy de pruebas ejecuta los handlers fuente de Astro en memoria y dirige sus llamadas al backend temporal. No inicia un servidor de producción ni genera una compilación paralela.

## Cobertura

| Requerimiento | Prueba funcional |
|---|---|
| R3 | Captación por enlace social, identidad sin duplicados, origen y campaña, descarga autorizada y entrega, publicación/edición/retirada, reserva, historial y cancelación; interfaz de escritorio y móvil. |
| R6 | Ficha consolidada, edición parcial y persistencia al reabrir, concurrencia, identidad, historial, reservas y conversaciones vinculadas a sesión, buyer y lead. |
| R7 | Reglas versionadas y configuración inválida, necesidad y clasificación con evidencia, citas inventadas o ajenas rechazadas, negaciones/correcciones, derivación, revisión administrativa y flujo real del puente con proveedor simulado. |
| R8 | Catálogo autorizado, importes exactos y componentes, incompatibilidades, excepciones, versiones, rechazo de importes propuestos por IA, fallo del proveedor, revisión, presentación, aceptación y contratación de la misma propuesta. El navegador genera y reabre una propuesta aceptada. |
| R13 | Distribución exacta, fases, fechas, aprobación, activación, estados, concurrencia, reintentos, entregables y renegociaciones sin duplicar deuda. El navegador guarda, aprueba y recarga. |
| R14 | Registro pendiente, separación asesor/administrador, varios abonos, verificación idempotente, sobrepago, comprobantes privados, históricos, auditoría inmutable y compensaciones con o sin nueva versión R13. El navegador registra como asesor y confirma como administrador. |

Para R3 se conserva la decisión confirmada: **nombre y WhatsApp; buyer al descargar y lead al solicitar cita**. El correo se solicita al completar la reserva; no se cambia la conversión de R6 por una descarga.

## Fallos corregidos durante esta validación

- La prueba de reinicio de Tesi no esperaba el `DELETE` asíncrono y restauraba `document` antes de terminar. Ahora espera el resultado y comprueba también que un fallo de red conserva la conversación.
- Las suites de buyers, recursos y journeys usaban listas de migraciones antiguas. Sus esquemas temporales ahora cargan las migraciones vigentes, incluidas las vistas financieras que utiliza el dashboard.
- El recorrido de navegador R6/R7 dependía de un servidor arrancado desde `dist`. Ahora prueba contra desarrollo, ejecuta los handlers fuente y añade el ciclo de R8 hasta aceptación, contrato y reapertura.
- Las capturas de las suites de Recursos y Buyers se guardan en los artefactos de la landing activa, no en el proyecto frontend antiguo.

Los mocks de interfaz comprueban presentación y acciones; las comprobaciones de persistencia, permisos, importes y evidencia se ejecutan además contra la API y PostgreSQL temporal. El resultado no acredita el comportamiento de una clave o cuenta de IA real, pendiente de configuración por el usuario.
