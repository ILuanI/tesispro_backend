import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const sqlPath = join(root, 'impulse_fase1_2.sql');
const migrationsDir = join(root, 'src', 'migrations');

const raw = readFileSync(sqlPath, 'utf8');

const lines = raw.split('\n');
const schemaLines = [];
let skipSeeds = false;

for (const line of lines) {
  if (line.includes('-- ------------------------------ SEEDS ------------------------------')) {
    skipSeeds = true;
    continue;
  }
  if (skipSeeds && line.includes('-- ------------------------------ VISTAS KPI')) {
    skipSeeds = false;
  }
  if (skipSeeds) continue;
  schemaLines.push(line);
}

const schemaSql = schemaLines.join('\n').trim();

const downSql = `
DROP VIEW IF EXISTS v_kpi_tpc, v_kpi_tcp, v_kpi_tap, v_kpi_chat, v_kpi_lpo, v_kpi_landing, v_kpi_interaccion_redes, v_kpi_ctr CASCADE;
DROP TRIGGER IF EXISTS trg_pago_cliente ON pago;
DROP TRIGGER IF EXISTS trg_lead_historial ON lead;
DROP TRIGGER IF EXISTS trg_proyecto_updated ON proyecto_tesis;
DROP TRIGGER IF EXISTS trg_lead_updated ON lead;
DROP FUNCTION IF EXISTS fn_semaforo(NUMERIC, NUMERIC, NUMERIC, BOOLEAN);
DROP FUNCTION IF EXISTS fn_pago_a_cliente();
DROP FUNCTION IF EXISTS fn_lead_historial();
DROP FUNCTION IF EXISTS fn_set_updated_at();
DROP TABLE IF EXISTS kpi_medicion, kpi_definicion, cliente, pago, contrato, seguimiento, lead_objecion, objecion, propuesta_detalle, propuesta, derivacion_humana, mensaje, conversacion, descarga_recurso, proyecto_necesidad, proyecto_tesis, servicio, consentimiento_datos, perfil_laboral, perfil_academico, lead_estado_historial, enlace_referido, lead, estado_lead, sesion_landing, recurso_gratuito, convenio_institucional, publicacion, concepto_visual, campana, cuenta_red_social, plataforma, agente_ia, usuario_interno, necesidad_academica, etapa_tesis, directiva_tesis, programa_academico, grado_academico, facultad, universidad CASCADE;
DROP TYPE IF EXISTS semaforo, estado_pago, metodo_pago, estado_seguimiento, tipo_objecion, estado_propuesta, modalidad_servicio, modelo_cobro, estado_derivacion, estado_conversacion, tipo_concepto_visual, estado_publicacion, tipo_contenido, rol_usuario, tipo_agente, tipo_remitente, canal_origen_sesion, canal_contacto, condicion_academica CASCADE;
`.trim();

const timestamp = Date.now();
const className = `InitialSchema${timestamp}`;

const migrationContent = `import { MigrationInterface, QueryRunner } from 'typeorm';

export class ${className} implements MigrationInterface {
  name = '${className}';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(\`${schemaSql.replace(/`/g, '\\`').replace(/\$/g, '\\$')}\`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(\`${downSql.replace(/`/g, '\\`')}\`);
  }
}
`;

if (!existsSync(migrationsDir)) mkdirSync(migrationsDir, { recursive: true });
writeFileSync(join(migrationsDir, `${timestamp}-InitialSchema.ts`), migrationContent, 'utf8');
console.log(`Migration created: ${timestamp}-InitialSchema.ts`);
