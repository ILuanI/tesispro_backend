import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ServicePackages1792600000000 implements MigrationInterface {
  name = 'ServicePackages1792600000000';
  async up(q: QueryRunner): Promise<void> {
    const [existing] = await q.query(
      `SELECT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='paquete' AND column_name='id_servicio') AND EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema=current_schema() AND table_name='paquete_version' AND column_name='datos') AS compatible`,
    );
    if (existing.compatible) return; // Use the populated catalog through ExistingPackagesStore; never overwrite its history.
    await q.query(`ALTER TABLE servicio
      ADD COLUMN es_paquete boolean NOT NULL DEFAULT false,
      ADD COLUMN paquete_estado varchar(10) NOT NULL DEFAULT 'borrador' CHECK(paquete_estado IN ('borrador','activo','inactivo')),
      ADD COLUMN paquete_version int NOT NULL DEFAULT 1 CHECK(paquete_version>0),
      ADD COLUMN publico_objetivo text,
      ADD COLUMN entregables jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(entregables)='array'),
      ADD COLUMN restricciones jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(restricciones)='array'),
      ADD COLUMN vigencia_desde date,
      ADD COLUMN vigencia_hasta date,
      ADD COLUMN fecha_creacion timestamptz NOT NULL DEFAULT now(),
      ADD COLUMN fecha_actualizacion timestamptz NOT NULL DEFAULT now(),
      ALTER COLUMN precio_base DROP NOT NULL,
      ADD CONSTRAINT servicio_precio_requerido CHECK(es_paquete OR precio_base IS NOT NULL),
      ADD CONSTRAINT paquete_fechas CHECK(vigencia_hasta IS NULL OR vigencia_desde IS NULL OR vigencia_hasta>=vigencia_desde),
      ADD CONSTRAINT paquete_publicacion CHECK(NOT es_paquete OR (activo=(paquete_estado='activo') AND
        (paquete_estado<>'activo' OR (precio_base IS NOT NULL AND length(btrim(coalesce(descripcion,'')))>0 AND jsonb_array_length(entregables)>0 AND jsonb_array_length(restricciones)>0))));
      CREATE INDEX servicio_paquetes_idx ON servicio(paquete_estado,fecha_actualizacion) WHERE es_paquete;
      CREATE TABLE paquete_componente (
        id_paquete int NOT NULL REFERENCES servicio(id_servicio),
        id_servicio int NOT NULL REFERENCES servicio(id_servicio),
        cantidad smallint NOT NULL CHECK(cantidad BETWEEN 1 AND 1000),
        PRIMARY KEY(id_paquete,id_servicio),CHECK(id_paquete<>id_servicio)
      );
      CREATE TABLE paquete_version (
        id_version bigserial PRIMARY KEY,
        id_paquete int NOT NULL REFERENCES servicio(id_servicio),
        version int NOT NULL CHECK(version>0),
        contenido jsonb NOT NULL,
        cambios jsonb NOT NULL,
        id_usuario int NOT NULL REFERENCES usuario_interno(id_usuario),
        fecha timestamptz NOT NULL DEFAULT now(),UNIQUE(id_paquete,version)
      );
      CREATE TABLE propuesta_paquete (
        id_propuesta bigint PRIMARY KEY REFERENCES propuesta(id_propuesta),
        id_version bigint NOT NULL REFERENCES paquete_version(id_version)
      );
      CREATE FUNCTION r11_version_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'La versión comercial es inmutable' USING ERRCODE='23514'; END; $$;
      CREATE TRIGGER r11_version_inmutable BEFORE UPDATE OR DELETE ON paquete_version FOR EACH ROW EXECUTE FUNCTION r11_version_inmutable();
      CREATE TRIGGER r11_propuesta_inmutable BEFORE UPDATE OR DELETE ON propuesta_paquete FOR EACH ROW EXECUTE FUNCTION r11_version_inmutable();`);
  }
  async down(): Promise<void> {
    throw new Error(
      'Respalda versiones y acuerdos antes de retirar R11; no se permite pérdida de historia automática.',
    );
  }
}
