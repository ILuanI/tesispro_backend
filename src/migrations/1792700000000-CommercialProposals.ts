import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CommercialProposals1792700000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`
      CREATE TABLE r8_servicio_comercial (
        id_servicio int PRIMARY KEY REFERENCES servicio(id_servicio), precio numeric(10,2) NOT NULL CHECK(precio>=0),
        moneda char(3) NOT NULL CHECK(moneda IN ('PEN','USD','EUR')), activo boolean NOT NULL DEFAULT false,
        plazo_dias int CHECK(plazo_dias BETWEEN 1 AND 3650), entregables jsonb NOT NULL DEFAULT '[]',
        condiciones text NOT NULL DEFAULT '', descuento_max numeric(5,2) NOT NULL DEFAULT 0 CHECK(descuento_max BETWEEN 0 AND 100),
        revision int NOT NULL DEFAULT 1, id_usuario int NOT NULL REFERENCES usuario_interno(id_usuario), actualizado_en timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE r8_paquete_opcional (id_paquete int NOT NULL REFERENCES servicio(id_servicio), id_servicio int NOT NULL REFERENCES servicio(id_servicio), PRIMARY KEY(id_paquete,id_servicio), CHECK(id_paquete<>id_servicio));
      CREATE TABLE r8_incompatibilidad (id_servicio_a int NOT NULL REFERENCES servicio(id_servicio), id_servicio_b int NOT NULL REFERENCES servicio(id_servicio), PRIMARY KEY(id_servicio_a,id_servicio_b), CHECK(id_servicio_a<id_servicio_b));
      CREATE TABLE r8_propuesta (id_propuesta bigint PRIMARY KEY REFERENCES propuesta(id_propuesta), version_actual int NOT NULL DEFAULT 0, estado varchar(30) NOT NULL DEFAULT 'borrador' CHECK(estado IN ('borrador','revisada','enviada','cambios_solicitados','aceptada','rechazada')), actualizado_en timestamptz NOT NULL DEFAULT now());
      CREATE TABLE r8_propuesta_version (
        id_propuesta bigint NOT NULL REFERENCES r8_propuesta(id_propuesta), version int NOT NULL, contenido jsonb NOT NULL,
        excepcion boolean NOT NULL DEFAULT false, motivo_excepcion text, id_autor int NOT NULL REFERENCES usuario_interno(id_usuario),
        creado_en timestamptz NOT NULL DEFAULT now(), PRIMARY KEY(id_propuesta,version)
      );
      CREATE TABLE r8_propuesta_evento (
        id_evento bigserial PRIMARY KEY, id_propuesta bigint NOT NULL, version int NOT NULL,
        tipo varchar(40) NOT NULL, detalle jsonb NOT NULL DEFAULT '{}', id_usuario int NOT NULL REFERENCES usuario_interno(id_usuario), fecha timestamptz NOT NULL DEFAULT now(),
        FOREIGN KEY(id_propuesta,version) REFERENCES r8_propuesta_version(id_propuesta,version)
      );
      CREATE FUNCTION r8_version_inmutable() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Las versiones de propuesta son inmutables' USING ERRCODE='23514'; END $$;
      CREATE TRIGGER r8_version_inmutable BEFORE UPDATE OR DELETE ON r8_propuesta_version FOR EACH ROW EXECUTE FUNCTION r8_version_inmutable();
    `);
  }
  async down() { throw new Error('Las versiones comerciales requieren retirada manual revisada.'); }
}
