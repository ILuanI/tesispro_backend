import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceLibrary1792200000000 implements MigrationInterface {
  name = 'ResourceLibrary1792200000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE recurso_gratuito
      ADD COLUMN categoria varchar(40) NOT NULL DEFAULT 'material_propio',
      ADD COLUMN formato varchar(10) NOT NULL DEFAULT 'pdf',
      ADD COLUMN fecha_creacion timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN fecha_actualizacion timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN archivo_nombre varchar(255),
      ADD COLUMN archivo_mime varchar(100),
      ADD COLUMN archivo_contenido bytea`);
    await q.query(`UPDATE recurso_gratuito SET formato = CASE
      WHEN lower(coalesce(tipo,'')) IN ('word','doc','docx') OR archivo_url ~* '\\.(docx?)([?#]|$)' THEN 'word'
      WHEN lower(coalesce(tipo,'')) IN ('video','mp4','webm','mov') OR archivo_url ~* '\\.(mp4|webm|mov)([?#]|$)' THEN 'video'
      WHEN lower(coalesce(tipo,'')) = 'png' OR archivo_url ~* '\\.png([?#]|$)' THEN 'png'
      ELSE 'pdf' END`);
    await q.query(`ALTER TABLE recurso_gratuito
      ADD CONSTRAINT recurso_categoria_check CHECK (categoria IN ('asesoria_academica','metodologia_investigacion','guias_universitarias','material_propio')),
      ADD CONSTRAINT recurso_formato_check CHECK (formato IN ('pdf','word','video','png'))`);
    await q.query(
      'CREATE INDEX recurso_gratuito_filtros_idx ON recurso_gratuito(categoria,formato,activo,fecha_creacion)',
    );
  }
  async down(): Promise<void> {
    // Impide perder archivos y evita marcar como revertida una migración conservada.
    throw new Error(
      'Esta migración conserva archivos subidos. Para revertirla se requiere respaldar y migrar esos archivos explícitamente.',
    );
  }
}
