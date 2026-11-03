import type { MigrationInterface, QueryRunner } from 'typeorm';

export class ResourceJourneys1792400000000 implements MigrationInterface {
  name = 'ResourceJourneys1792400000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE recurso_gratuito ADD COLUMN publicado boolean NOT NULL DEFAULT false,
      ADD COLUMN destacado boolean NOT NULL DEFAULT false,
      ADD CONSTRAINT recurso_destacado_publico CHECK(NOT destacado OR (publicado AND activo));
      ALTER TABLE buyer ALTER COLUMN correo DROP NOT NULL;
      ALTER TABLE lead ALTER COLUMN correo DROP NOT NULL;
      ALTER TABLE lead ADD COLUMN reserva_pendiente boolean NOT NULL DEFAULT false;
      CREATE TABLE enlace_recurso (
        codigo varchar(32) PRIMARY KEY, id_recurso int NOT NULL REFERENCES recurso_gratuito(id_recurso),
        canal varchar(40) NOT NULL, medio varchar(100) NOT NULL, campana varchar(100) NOT NULL,
        publicacion varchar(100), activo boolean NOT NULL DEFAULT true, clics int NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE solicitud_recurso (
        id_solicitud uuid PRIMARY KEY, token_hash varchar(64) NOT NULL UNIQUE,
        id_recurso int NOT NULL REFERENCES recurso_gratuito(id_recurso), titulo varchar(200) NOT NULL,
        formato varchar(10) NOT NULL, codigo_enlace varchar(32) REFERENCES enlace_recurso(codigo),
        id_sesion bigint NOT NULL REFERENCES sesion_landing(id_sesion),
        id_buyer bigint REFERENCES buyer(id_buyer) ON DELETE SET NULL,
        id_lead bigint REFERENCES lead(id_lead) ON DELETE SET NULL,
        canal varchar(40) NOT NULL, medio varchar(100), campana varchar(100), publicacion varchar(100),
        nombres varchar(100), telefono varchar(20), formulario_completado timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(), expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days'
      );
      CREATE INDEX solicitud_buyer_idx ON solicitud_recurso(id_buyer,created_at DESC);
      CREATE INDEX solicitud_lead_idx ON solicitud_recurso(id_lead,created_at DESC);
      CREATE INDEX solicitud_campana_idx ON solicitud_recurso(id_recurso,canal,campana,created_at);
      CREATE TABLE evento_recurso (
        id_evento bigserial PRIMARY KEY, id_solicitud uuid NOT NULL REFERENCES solicitud_recurso(id_solicitud),
        tipo varchar(40) NOT NULL CHECK(tipo IN ('llegada','formulario_completado','opciones_mostradas',
          'descarga_solicitada','archivo_entregado','enlace_externo_abierto','clic_agendar','reserva_confirmada','reserva_cancelada')),
        fecha timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX evento_solicitud_idx ON evento_recurso(id_solicitud,fecha,id_evento);
      CREATE TABLE reunion (
        id_reunion uuid PRIMARY KEY, id_solicitud uuid NOT NULL REFERENCES solicitud_recurso(id_solicitud),
        id_lead bigint NOT NULL REFERENCES lead(id_lead), fecha_inicio timestamptz NOT NULL,
        fecha_fin timestamptz NOT NULL, nombres varchar(100) NOT NULL, telefono varchar(20) NOT NULL,
        correo varchar(150) NOT NULL, universidad varchar(200) NOT NULL, descripcion text NOT NULL,
        estado varchar(15) NOT NULL DEFAULT 'confirmada' CHECK(estado IN ('confirmada','cancelada')),
        motivo_cancelacion varchar(500), created_at timestamptz NOT NULL DEFAULT now(), cancelada_at timestamptz,
        CHECK(fecha_fin=fecha_inicio+interval '30 minutes'),
        CHECK(extract(isodow FROM fecha_inicio AT TIME ZONE 'America/Lima') BETWEEN 1 AND 5),
        CHECK((fecha_inicio AT TIME ZONE 'America/Lima')::time >= time '09:00' AND
          (fecha_inicio AT TIME ZONE 'America/Lima')::time <= time '17:30'),
        CHECK(extract(minute FROM fecha_inicio AT TIME ZONE 'America/Lima') IN (0,30) AND extract(second FROM fecha_inicio)=0)
      );
      CREATE UNIQUE INDEX reunion_cupo_unico ON reunion(fecha_inicio) WHERE estado='confirmada';
      CREATE UNIQUE INDEX reunion_solicitud_unica ON reunion(id_solicitud) WHERE estado='confirmada';`);
  }
  async down(): Promise<void> {
    throw new Error(
      'Respalda las solicitudes, eventos y reservas antes de retirar esta migración.',
    );
  }
}
