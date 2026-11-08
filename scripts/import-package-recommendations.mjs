import { fileURLToPath } from 'node:url';
import { readPackageMarkdown } from './lib/package-markdown.mjs';
import ds from '../dist/database/typeorm.config.js';
import { ExistingPackagesStore } from '../dist/modules/admin/existing-packages.store.js';

// Por defecto solo muestra el plan. --apply crea versiones sin reescribir el historial.
const apply = process.argv.includes('--apply');
const entries = await readPackageMarkdown(fileURLToPath(new URL('../../TesisPro_Paquetes_y_Recomendaciones.md', import.meta.url)));
await ds.initialize();
try {
  const store = new ExistingPackagesStore(ds);
  if (!await store.available()) throw new Error('Esta importación requiere el catálogo existente de paquetes.');
  await ds.transaction(async m => {
    const scoped = new ExistingPackagesStore({ manager: m, transaction: callback => callback(m) });
    for (const entry of entries) {
      const rows = await m.query('SELECT id_servicio FROM paquete WHERE codigo=$1 FOR UPDATE', [entry.codigo]);
      if (rows.length !== 1) throw new Error(`Paquete inexistente o ambiguo: ${entry.codigo}`);
      const prior = await scoped.detail(rows[0].id_servicio, m);
      if (prior.precioFijo !== entry.expectedPrice || prior.duracionDias !== entry.expectedDays || prior.moneda !== 'PEN' || prior.modalidad !== 'virtual') throw new Error(`Las condiciones comerciales de ${entry.codigo} difieren del documento; no se sobrescribieron.`);
      const changed = Object.entries(entry.fields).filter(([key, value]) => JSON.stringify(prior[key]) !== JSON.stringify(value)).map(([key]) => key);
      console.log(JSON.stringify({ codigo: entry.codigo, versionAnterior: prior.version, campos: changed, aplicar: apply }));
      if (apply && changed.length) {
        // Actor de sistema: id_usuario nullable; no se atribuye a un administrador ficticio.
        const saved = await scoped.save({ ...prior, ...entry.fields }, null, prior.idServicio);
        console.log(JSON.stringify({ codigo: entry.codigo, version: saved.version, actualizado: true }));
      }
    }
  });
} finally { await ds.destroy(); }
