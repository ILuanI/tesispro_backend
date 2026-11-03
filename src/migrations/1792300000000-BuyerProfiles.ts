import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BuyerProfiles1792300000000 implements MigrationInterface {
  name = 'BuyerProfiles1792300000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE TABLE buyer (
      id_buyer BIGSERIAL PRIMARY KEY,
      nombres VARCHAR(100) NOT NULL,
      apellidos VARCHAR(100),
      correo VARCHAR(150) NOT NULL UNIQUE CHECK(correo=lower(btrim(correo))),
      telefono VARCHAR(20) NOT NULL,
      fecha_nacimiento DATE,
      edad_declarada SMALLINT CHECK(edad_declarada BETWEEN 0 AND 120),
      departamento VARCHAR(60),
      id_universidad INT REFERENCES universidad(id_universidad),
      universidad_otra VARCHAR(200),
      id_grado SMALLINT REFERENCES grado_academico(id_grado),
      condicion condicion_academica,
      id_etapa INT REFERENCES etapa_tesis(id_etapa),
      canal_origen VARCHAR(40) NOT NULL,
      fecha_registro TIMESTAMPTZ NOT NULL DEFAULT now(),
      motivo_captacion VARCHAR(30) NOT NULL DEFAULT 'otro' CHECK(motivo_captacion IN ('descarga_recurso','contenido','consulta_general','otro')),
      recurso_interes VARCHAR(200),
      notas TEXT,
      consentimiento_at TIMESTAMPTZ,
      estado VARCHAR(10) NOT NULL DEFAULT 'buyer' CHECK(estado IN ('buyer','lead')),
      id_lead BIGINT UNIQUE REFERENCES lead(id_lead),
      fecha_conversion TIMESTAMPTZ,
      id_usuario_conversion INT REFERENCES usuario_interno(id_usuario),
      created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
      CHECK((estado='buyer' AND id_lead IS NULL AND fecha_conversion IS NULL)
         OR (estado='lead' AND id_lead IS NOT NULL AND fecha_conversion IS NOT NULL))
    )`);
    await q.query(
      "CREATE INDEX buyer_pendientes_idx ON buyer(fecha_registro DESC) WHERE estado='buyer'",
    );
    await q.query(
      "CREATE INDEX buyer_filtros_idx ON buyer(canal_origen,id_grado,id_etapa) WHERE estado='buyer'",
    );
  }
  async down(): Promise<void> {
    throw new Error(
      'Respalda los perfiles y sus conversiones antes de retirar la tabla buyer.',
    );
  }
}
