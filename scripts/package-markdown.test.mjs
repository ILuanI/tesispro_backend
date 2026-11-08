import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readPackageMarkdown } from './lib/package-markdown.mjs';

const entries = await readPackageMarkdown(new URL('../../TesisPro_Paquetes_y_Recomendaciones.md', import.meta.url));
test('importa los tres paquetes del documento con sus condiciones originales', () => {
  assert.deepEqual(entries.map(e => [e.codigo, e.expectedPrice, e.expectedDays]), [
    ['basico', '299.00', 15], ['desarrollo-tecnico', '799.00', 30], ['integral', '1499.00', 90],
  ]);
  assert.deepEqual(entries.map(e => e.fields.entregables.length), [5, 8, 11]);
  for (const { fields } of entries) {
    assert.ok(fields.publicoObjetivo.includes('pregrado'));
    assert.ok(fields.guiaRecomendacion.includes('Preguntas frecuentes'));
    assert.ok(fields.guiaRecomendacion.includes('Cuándo recomendar otra opción'));
    assert.ok(fields.restricciones.some(s => s.includes('No se garantiza')));
  }
});
test('conserva formatos y sesiones de defensa pendientes sin inventar condiciones', () => {
  assert.ok(entries[0].fields.entregables.some(s => s.includes('PDF confirmado')));
  assert.ok(entries[0].fields.entregables.some(s => s.includes('Pendiente de definir')));
  assert.ok(entries[2].fields.guiaRecomendacion.includes('pendiente definir si las de defensa están dentro de las doce'));
  assert.ok(entries[2].fields.restricciones.some(s => s.includes('Relación entre sesiones generales y de defensa pendiente')));
});
