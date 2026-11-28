# Conocimiento del negocio y agentes

La fuente operativa es el contenido Markdown publicado en PostgreSQL. `plan-de-negocio.md` y las transcripciones son referencias internas de curación: no se envían completos al proveedor ni se usan como un respaldo automático.

## Activación

Desde `tesispro_backend`, con la base de destino y sus variables configuradas:

```powershell
pnpm migration:run
pnpm knowledge:bootstrap
```

La migración `BusinessKnowledge1793300000000` añade documentos, versiones, publicaciones y registro de uso; no altera contratos, precios, reuniones ni conversaciones. La carga inicial crea siete documentos y una publicación breve aprobada solamente cuando todavía no existe conocimiento. Repetir el comando no sobrescribe contenido administrado desde el panel. Si encuentra una instalación parcial sin publicación, se detiene para revisión.

Los Markdown iniciales están en `src/modules/knowledge/documents/`. Nest los copia junto al código compilado. Una vez inicializada la base, editar esos archivos no modifica lo publicado: el panel es la fuente vigente.

Desplegar backend y frontend. Astro solo reenvía las consultas al backend y necesita `CRM_API_URL` apuntando a NestJS y el mismo `CRM_BRIDGE_SECRET` privado, de al menos 32 caracteres. No hay un interruptor adicional de conocimiento: si la publicación falta o no puede obtenerse, las operaciones de IA que la necesitan fallan de forma recuperable y ofrecen atención humana; nunca cargan las tarifas o FAQ históricas como alternativa. Los saludos y controles locales seguros pueden funcionar sin llamar al modelo.

## Uso del panel

Entra como administrador a `/admin/conocimiento`:

1. Elige el documento y edita su Markdown y referencias internas.
2. Guarda el borrador. El público y los agentes siguen usando la publicación anterior.
3. Revisa **Vista previa** o **Comparar**. La vista previa no ejecuta HTML ni carga imágenes externas; los enlaces se muestran como texto.
4. Escribe un motivo y pulsa **Publicar versión revisada**. Esto crea una nueva versión inmutable y una publicación coherente del conjunto de documentos.
5. Para recuperar contenido anterior, elige una versión y cárgala como borrador. Solo se activa tras revisarla y publicarla de nuevo.
6. **Exportar Markdown** descarga el contenido publicado, no los cambios del borrador.

Los borradores usan revisión optimista. Un conflicto 409 significa que hay cambios de otro editor o una publicación más reciente; recarga y compara antes de volver a guardar o publicar. El historial conserva fecha, autor y motivo de cada versión. La carga inicial figura con autor de sistema; no se inventa un administrador revisor.

El perfil inicial tiene una nota de datos pendientes en su borrador, ausente de la versión publicada. No están aprobados datos societarios, contactos, sedes, garantías ni tarifas del prototipo.

## Documentos y límites

| Documento | Selección y límite publicado |
| --- | --- |
| `business-profile` | Perfil común en todas las consultas con conocimiento; 4 000 caracteres. |
| `marketing`, `negociador`, `cobranza`, `academico`, `postventa` | Solo el documento del rol que atiende; 4 000 caracteres por documento. |
| `faq` | Se añade cuando corresponde responder FAQ; 8 000 caracteres. |

Una llamada recibe hasta 16 000 caracteres documentales. No se recortan documentos silenciosamente. Los borradores admiten 20 000 caracteres, pero deben cumplir los límites para publicarse y tener al menos una referencia interna. La publicación rechaza contenido ejecutable e importes monetarios con formatos explícitos: los precios se administran en el catálogo. Es un control adicional y no sustituye la revisión humana.

FAQ utiliza encabezados estables:

```markdown
## 1. ¿Pregunta del visitante?
Respuesta confirmada que puede comunicarse.
```

Se admiten hasta 40 entradas, cada una con un identificador único y respuesta no vacía. Conserva el número al actualizar el mismo tema; para otro tema, utiliza un identificador nuevo. Los IDs de las diez preguntas iniciales conservan su orientación general de pregrado, posgrado, avance, observaciones, estadística, universidad, modalidad, proceso, componentes y contacto inicial.

## Integración y autoridad

- `KnowledgeService` resuelve una publicación desde la base. La selección de archivos es una lista fija por rol, no una decisión del modelo ni una ruta de archivos enviada por el navegador.
- Un turno conserva su publicación y sus reintentos la reutilizan. Publicar durante una consulta no mezcla versiones. Un nuevo turno obtiene el conjunto vigente.
- `knowledge_usage` guarda clave de turno, operación, agente y publicación. No duplica mensajes, perfiles ni credenciales.
- Las reglas del código y las validaciones de herramientas siguen siendo obligatorias. Los documentos se incluyen como datos de referencia dentro de la solicitud, nunca como nuevas instrucciones de sistema.
- El enrutador usa el registro fijo de especialidades. Cada agente recibe perfil y especialidad; marketing y académico pueden recibir además FAQ. El generador de propuestas recibe contexto de negociación, conservando sus restricciones actuales sobre importes, garantías y entregables.
- Precios, componentes, condiciones y modalidades de pago proceden del catálogo y servicios autorizados; disponibilidad procede del calendario. Los Markdown no pueden autorizar descuentos ni confirmar pagos.
- El contexto se obtiene dentro de NestJS; `POST /internal/knowledge/context` (protegido por el secreto del puente) ya no lo usa el frontend. No se recurre a la copia histórica de FAQ para completar datos ausentes.
- Las respuestas FAQ conservan `sourceIds` y pueden añadir `knowledgeSources` con identificador documental, versión y fecha. Las referencias deben pertenecer al contexto enviado; referencias inexistentes producen información insuficiente. Las rutas de fuentes internas y las referencias del editor no se envían al modelo.

Este módulo conserva el historial de conversación existente. No añade memoria entre canales, resumen automático, integración de WhatsApp, embeddings, búsqueda semántica ni importación de las transcripciones en tiempo de ejecución.

## Interfaces

Las rutas `/admin/conocimiento` requieren administrador. La lectura de documentos, edición de borrador, publicación, consulta de versiones, restauración y exportación utilizan los mismos controles de sesión y origen del resto del panel. No existe edición pública ni ampliación de permisos a través del Markdown.

La ruta interna acepta únicamente roles conocidos y operaciones FAQ, negociación y propuesta. El proxy público de Astro no reenvía `/internal`.

## Verificación

Con PostgreSQL de pruebas configurado:

```powershell
pnpm test:knowledge
pnpm test:agents
pnpm test:lead-profile
```

Las pruebas crean y eliminan esquemas temporales y simulan proveedores de IA. No publican información en una base operativa ni envían mensajes a clientes. `test:knowledge` también necesita las dependencias del frontend para comprobar ambos motores.

Desde `tesispro_frontend`:

```powershell
pnpm exec tsc --noEmit
node --test tests/faq-ai.test.mjs tests/ai-provider.test.mjs tests/r8-proposal.test.mjs
pnpm test:knowledge:ui
```

La prueba de interfaz usa Edge sin interfaz gráfica y API simulada. Comprueba comparación, aislamiento del borrador, publicación, historial, restauración, vista previa segura, exportación y vista móvil.
