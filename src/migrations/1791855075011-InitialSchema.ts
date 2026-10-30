import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1791855075011 implements MigrationInterface {
  name = 'InitialSchema1791855075011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`-- =====================================================================
-- IMPULSE · Asesoría de Tesis (Perú) · Fases 1 y 2  ·  PostgreSQL 14+
-- Orden: ENUMS → tablas → FKs circulares → índices → triggers → seeds → vistas KPI
-- =====================================================================

-- ------------------------------- ENUMS -------------------------------
CREATE TYPE condicion_academica AS ENUM ('estudiante','egresado','bachiller');
CREATE TYPE canal_contacto AS ENUM ('whatsapp','correo','instagram','facebook','tiktok','linkedin','web_chat','llamada','presencial');
CREATE TYPE canal_origen_sesion AS ENUM ('red_social','referido','directo','busqueda','correo','whatsapp','convenio_institucional','otro');
CREATE TYPE tipo_remitente AS ENUM ('lead','agente_ia','humano');
CREATE TYPE tipo_agente AS ENUM ('marketing','negociador');
CREATE TYPE rol_usuario AS ENUM ('administrador','community_manager','asesor_comercial','asesor_metodologico','investigador');
CREATE TYPE tipo_contenido AS ENUM ('post','historia','reel','carrusel','articulo','faq');
CREATE TYPE estado_publicacion AS ENUM ('idea','programada','publicada','descartada');
CREATE TYPE tipo_concepto_visual AS ENUM ('logo','paleta','tipografia','estilo','plantilla');
CREATE TYPE estado_conversacion AS ENUM ('abierta','derivada','cerrada');
CREATE TYPE estado_derivacion AS ENUM ('pendiente','en_atencion','resuelta');
CREATE TYPE modelo_cobro AS ENUM ('pago_unico','por_etapa','por_ciclo');
CREATE TYPE modalidad_servicio AS ENUM ('virtual','presencial','hibrida');
CREATE TYPE estado_propuesta AS ENUM ('borrador','enviada','aceptada','rechazada','vencida');
CREATE TYPE tipo_objecion AS ENUM ('precio','tiempo','modalidad','alcance','condiciones','confianza','otra');
CREATE TYPE estado_seguimiento AS ENUM ('programado','enviado','respondido','cancelado');
CREATE TYPE metodo_pago AS ENUM ('yape','plin','transferencia','deposito','tarjeta','efectivo');
CREATE TYPE estado_pago AS ENUM ('pendiente','confirmado','rechazado','reembolsado');
CREATE TYPE semaforo AS ENUM ('rojo','amarillo','verde');

-- ===================== A. CATÁLOGO ACADÉMICO =====================
CREATE TABLE universidad (
  id_universidad SERIAL PRIMARY KEY,
  nombre         VARCHAR(200) NOT NULL UNIQUE,
  siglas         VARCHAR(20),
  tipo_gestion   VARCHAR(10) CHECK (tipo_gestion IN ('publica','privada')),
  departamento   VARCHAR(60),
  ciudad         VARCHAR(80),
  sitio_web      VARCHAR(200),
  activa         BOOLEAN NOT NULL DEFAULT TRUE,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE facultad (
  id_facultad    SERIAL PRIMARY KEY,
  id_universidad INT NOT NULL REFERENCES universidad(id_universidad),
  nombre         VARCHAR(200) NOT NULL,
  activa         BOOLEAN NOT NULL DEFAULT TRUE,
  UNIQUE (id_universidad, nombre)
);

CREATE TABLE grado_academico (
  id_grado                     SMALLSERIAL PRIMARY KEY,
  codigo                       VARCHAR(20) NOT NULL UNIQUE,
  nombre                       VARCHAR(60) NOT NULL,
  modelo_cobro_sugerido        modelo_cobro,
  requiere_perfil_investigador BOOLEAN NOT NULL DEFAULT FALSE
);

CREATE TABLE programa_academico (
  id_programa SERIAL PRIMARY KEY,
  id_facultad INT NOT NULL REFERENCES facultad(id_facultad),
  id_grado    SMALLINT NOT NULL REFERENCES grado_academico(id_grado),
  nombre      VARCHAR(200) NOT NULL,
  UNIQUE (id_facultad, id_grado, nombre)
);

CREATE TABLE directiva_tesis (
  id_directiva         SERIAL PRIMARY KEY,
  id_facultad          INT NOT NULL REFERENCES facultad(id_facultad),
  id_grado             SMALLINT NOT NULL REFERENCES grado_academico(id_grado),
  version              VARCHAR(20) NOT NULL DEFAULT '1.0',
  estructura_tesis     JSONB,
  formato_caratula_url TEXT,
  esquema_documentario JSONB,
  umbral_similitud_pct NUMERIC(5,2) CHECK (umbral_similitud_pct BETWEEN 0 AND 100),
  exige_deteccion_ia   BOOLEAN NOT NULL DEFAULT FALSE,
  documento_url        TEXT,
  vigente_desde        DATE,
  vigente_hasta        DATE,
  vigente              BOOLEAN NOT NULL DEFAULT TRUE,
  notas                TEXT,
  UNIQUE (id_facultad, id_grado, version)
);

CREATE TABLE etapa_tesis (
  id_etapa    SERIAL PRIMARY KEY,
  id_grado    SMALLINT REFERENCES grado_academico(id_grado),
  nombre      VARCHAR(80) NOT NULL,
  orden       SMALLINT NOT NULL,
  descripcion TEXT
);

CREATE TABLE necesidad_academica (
  id_necesidad SERIAL PRIMARY KEY,
  nombre       VARCHAR(100) NOT NULL UNIQUE,
  descripcion  TEXT
);

-- ===================== B. USUARIOS INTERNOS Y AGENTES IA =====================
CREATE TABLE usuario_interno (
  id_usuario          SERIAL PRIMARY KEY,
  nombres             VARCHAR(100) NOT NULL,
  apellidos           VARCHAR(100) NOT NULL,
  correo              VARCHAR(150) NOT NULL UNIQUE,
  rol                 rol_usuario NOT NULL,
  perfil_investigador BOOLEAN NOT NULL DEFAULT FALSE,
  activo              BOOLEAN NOT NULL DEFAULT TRUE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE agente_ia (
  id_agente   SERIAL PRIMARY KEY,
  nombre      VARCHAR(100) NOT NULL UNIQUE,
  tipo        tipo_agente NOT NULL,
  modelo      VARCHAR(80),
  version     VARCHAR(20),
  descripcion TEXT,
  activo      BOOLEAN NOT NULL DEFAULT TRUE
);

-- ===================== C. MARKETING Y CAPTACIÓN (FASE 1) =====================
CREATE TABLE plataforma (
  id_plataforma SERIAL PRIMARY KEY,
  nombre        VARCHAR(50) NOT NULL UNIQUE
);

CREATE TABLE cuenta_red_social (
  id_cuenta      SERIAL PRIMARY KEY,
  id_plataforma  INT NOT NULL REFERENCES plataforma(id_plataforma),
  nombre_usuario VARCHAR(100) NOT NULL,
  url            VARCHAR(250),
  activa         BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE campana (
  id_campana   SERIAL PRIMARY KEY,
  nombre       VARCHAR(150) NOT NULL,
  objetivo     TEXT,
  fecha_inicio DATE,
  fecha_fin    DATE,
  utm_campaign VARCHAR(100) UNIQUE,
  presupuesto  NUMERIC(10,2),
  activa       BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE concepto_visual (
  id_concepto  SERIAL PRIMARY KEY,
  id_agente    INT REFERENCES agente_ia(id_agente),
  tipo         tipo_concepto_visual NOT NULL,
  nombre       VARCHAR(100) NOT NULL,
  descripcion  TEXT,
  valor        JSONB,
  aprobado     BOOLEAN NOT NULL DEFAULT FALSE,
  aprobado_por INT REFERENCES usuario_interno(id_usuario),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE publicacion (
  id_publicacion    SERIAL PRIMARY KEY,
  id_cuenta         INT NOT NULL REFERENCES cuenta_red_social(id_cuenta),
  id_campana        INT REFERENCES campana(id_campana),
  id_concepto       INT REFERENCES concepto_visual(id_concepto),
  id_agente         INT REFERENCES agente_ia(id_agente),
  tipo_contenido    tipo_contenido NOT NULL,
  titulo            VARCHAR(200),
  texto             TEXT,
  llamado_accion    VARCHAR(200),
  estado            estado_publicacion NOT NULL DEFAULT 'idea',
  fecha_programada  TIMESTAMPTZ,
  fecha_publicacion TIMESTAMPTZ,
  url               VARCHAR(300),
  impresiones       INT NOT NULL DEFAULT 0,
  alcance           INT NOT NULL DEFAULT 0,
  likes             INT NOT NULL DEFAULT 0,
  comentarios       INT NOT NULL DEFAULT 0,
  compartidos       INT NOT NULL DEFAULT 0,
  clics             INT NOT NULL DEFAULT 0,
  generada_por_ia   BOOLEAN NOT NULL DEFAULT FALSE,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE convenio_institucional (
  id_convenio    SERIAL PRIMARY KEY,
  id_universidad INT REFERENCES universidad(id_universidad),
  nombre         VARCHAR(200) NOT NULL,
  descripcion    TEXT,
  fecha_inicio   DATE,
  fecha_fin      DATE,
  activo         BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE recurso_gratuito (
  id_recurso  SERIAL PRIMARY KEY,
  titulo      VARCHAR(200) NOT NULL,
  descripcion TEXT,
  tipo        VARCHAR(30),
  archivo_url TEXT NOT NULL,
  id_etapa    INT REFERENCES etapa_tesis(id_etapa),
  id_grado    SMALLINT REFERENCES grado_academico(id_grado),
  activo      BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE sesion_landing (
  id_sesion           BIGSERIAL PRIMARY KEY,
  fecha               TIMESTAMPTZ NOT NULL DEFAULT now(),
  canal_origen        canal_origen_sesion NOT NULL DEFAULT 'directo',
  id_publicacion      INT REFERENCES publicacion(id_publicacion),
  id_campana          INT REFERENCES campana(id_campana),
  id_referido         INT,  -- FK se agrega después (dependencia circular con enlace_referido)
  id_convenio         INT REFERENCES convenio_institucional(id_convenio),
  id_recurso          INT REFERENCES recurso_gratuito(id_recurso),
  detalle_otro_origen VARCHAR(200),
  utm_source          VARCHAR(100),
  utm_medium          VARCHAR(100),
  dispositivo         VARCHAR(30),
  tuvo_interaccion    BOOLEAN NOT NULL DEFAULT FALSE,
  visito_formulario   BOOLEAN NOT NULL DEFAULT FALSE,
  completo_formulario BOOLEAN NOT NULL DEFAULT FALSE,
  CHECK (NOT completo_formulario OR visito_formulario)
);

-- ===================== D. LEADS Y PERFIL =====================
CREATE TABLE estado_lead (
  id_estado SMALLSERIAL PRIMARY KEY,
  codigo    VARCHAR(30) NOT NULL UNIQUE,
  nombre    VARCHAR(60) NOT NULL,
  fase      SMALLINT NOT NULL CHECK (fase IN (1,2)),
  orden     SMALLINT NOT NULL
);

CREATE TABLE lead (
  id_lead                BIGSERIAL PRIMARY KEY,
  id_sesion_origen       BIGINT REFERENCES sesion_landing(id_sesion),
  id_estado              SMALLINT NOT NULL REFERENCES estado_lead(id_estado),
  id_responsable         INT REFERENCES usuario_interno(id_usuario),
  nombres                VARCHAR(100) NOT NULL,
  apellidos              VARCHAR(100),
  correo                 VARCHAR(150) NOT NULL UNIQUE,
  telefono               VARCHAR(20) NOT NULL,
  fecha_nacimiento       DATE,
  departamento           VARCHAR(60),
  canal_preferido        canal_contacto,
  horario_preferido      VARCHAR(80),
  modalidad_preferida    modalidad_servicio,
  cumple_perfil_objetivo BOOLEAN NOT NULL DEFAULT FALSE,
  nivel_interes          SMALLINT CHECK (nivel_interes BETWEEN 0 AND 100),
  fecha_registro         TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE enlace_referido (
  id_referido       SERIAL PRIMARY KEY,
  id_lead_referente BIGINT NOT NULL REFERENCES lead(id_lead),
  codigo            VARCHAR(30) NOT NULL UNIQUE,
  fecha_creacion    TIMESTAMPTZ NOT NULL DEFAULT now(),
  activo            BOOLEAN NOT NULL DEFAULT TRUE
);

ALTER TABLE sesion_landing
  ADD CONSTRAINT fk_sesion_referido FOREIGN KEY (id_referido) REFERENCES enlace_referido(id_referido);

CREATE TABLE lead_estado_historial (
  id_historial BIGSERIAL PRIMARY KEY,
  id_lead      BIGINT NOT NULL REFERENCES lead(id_lead),
  id_estado    SMALLINT NOT NULL REFERENCES estado_lead(id_estado),
  fecha        TIMESTAMPTZ NOT NULL DEFAULT now(),
  motivo       TEXT,
  id_usuario   INT REFERENCES usuario_interno(id_usuario),
  id_agente    INT REFERENCES agente_ia(id_agente)
);

CREATE TABLE perfil_academico (
  id_perfil        SERIAL PRIMARY KEY,
  id_lead          BIGINT NOT NULL UNIQUE REFERENCES lead(id_lead),
  id_universidad   INT REFERENCES universidad(id_universidad),
  id_facultad      INT REFERENCES facultad(id_facultad),
  id_programa      INT REFERENCES programa_academico(id_programa),
  id_grado         SMALLINT REFERENCES grado_academico(id_grado),
  universidad_otra VARCHAR(200),
  ciclo            SMALLINT CHECK (ciclo BETWEEN 1 AND 20),
  condicion        condicion_academica,
  anio_egreso      SMALLINT
);

CREATE TABLE perfil_laboral (
  id_perfil_laboral   SERIAL PRIMARY KEY,
  id_lead             BIGINT NOT NULL UNIQUE REFERENCES lead(id_lead),
  trabaja             BOOLEAN,
  ocupacion           VARCHAR(120),
  horas_libres_semana SMALLINT
);

CREATE TABLE consentimiento_datos (
  id_consentimiento SERIAL PRIMARY KEY,
  id_lead           BIGINT NOT NULL REFERENCES lead(id_lead),
  finalidad         VARCHAR(100) NOT NULL,
  aceptado          BOOLEAN NOT NULL,
  version_politica  VARCHAR(20),
  fecha             TIMESTAMPTZ NOT NULL DEFAULT now(),
  ip                INET,
  medio             VARCHAR(50)
);

-- ===================== F (parcial). SERVICIO — se crea antes de proyecto_tesis =====================
CREATE TABLE servicio (
  id_servicio               SERIAL PRIMARY KEY,
  codigo                    VARCHAR(30) NOT NULL UNIQUE,
  nombre                    VARCHAR(150) NOT NULL,
  descripcion               TEXT,
  id_grado                  SMALLINT REFERENCES grado_academico(id_grado),
  modelo_cobro              modelo_cobro NOT NULL DEFAULT 'pago_unico',
  modalidad                 modalidad_servicio NOT NULL DEFAULT 'virtual',
  alcance                   TEXT,
  duracion_dias             INT,
  precio_base               NUMERIC(10,2) NOT NULL CHECK (precio_base >= 0),
  moneda                    CHAR(3) NOT NULL DEFAULT 'PEN',
  incluye_control_similitud BOOLEAN NOT NULL DEFAULT TRUE,
  activo                    BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE proyecto_tesis (
  id_proyecto         SERIAL PRIMARY KEY,
  id_lead             BIGINT NOT NULL REFERENCES lead(id_lead),
  tema                TEXT,
  id_etapa            INT REFERENCES etapa_tesis(id_etapa),
  id_servicio_interes INT REFERENCES servicio(id_servicio),
  fecha_limite        DATE,
  observaciones       TEXT,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE proyecto_necesidad (
  id_proyecto  INT NOT NULL REFERENCES proyecto_tesis(id_proyecto) ON DELETE CASCADE,
  id_necesidad INT NOT NULL REFERENCES necesidad_academica(id_necesidad),
  prioridad    SMALLINT DEFAULT 1,
  PRIMARY KEY (id_proyecto, id_necesidad)
);

CREATE TABLE descarga_recurso (
  id_descarga   BIGSERIAL PRIMARY KEY,
  id_recurso    INT NOT NULL REFERENCES recurso_gratuito(id_recurso),
  id_lead       BIGINT NOT NULL REFERENCES lead(id_lead),
  id_sesion     BIGINT REFERENCES sesion_landing(id_sesion),
  fecha         TIMESTAMPTZ NOT NULL DEFAULT now(),
  canal_entrega canal_contacto,
  entregado     BOOLEAN NOT NULL DEFAULT FALSE
);

-- ===================== E. CONVERSACIONES =====================
CREATE TABLE conversacion (
  id_conversacion       BIGSERIAL PRIMARY KEY,
  id_lead               BIGINT REFERENCES lead(id_lead),
  id_agente             INT REFERENCES agente_ia(id_agente),
  id_publicacion        INT REFERENCES publicacion(id_publicacion),
  canal                 canal_contacto NOT NULL,
  identificador_externo VARCHAR(150),
  fase                  SMALLINT NOT NULL DEFAULT 1 CHECK (fase IN (1,2)),
  estado                estado_conversacion NOT NULL DEFAULT 'abierta',
  id_necesidad          INT REFERENCES necesidad_academica(id_necesidad),
  nivel_interes         SMALLINT CHECK (nivel_interes BETWEEN 0 AND 100),
  iniciada_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrada_en            TIMESTAMPTZ
);

CREATE TABLE mensaje (
  id_mensaje           BIGSERIAL PRIMARY KEY,
  id_conversacion      BIGINT NOT NULL REFERENCES conversacion(id_conversacion) ON DELETE CASCADE,
  remitente            tipo_remitente NOT NULL,
  id_agente            INT REFERENCES agente_ia(id_agente),
  id_usuario           INT REFERENCES usuario_interno(id_usuario),
  contenido            TEXT NOT NULL,
  es_consulta_servicio BOOLEAN NOT NULL DEFAULT FALSE,
  enviado_en           TIMESTAMPTZ NOT NULL DEFAULT now(),
  tiempo_respuesta_ms  INT CHECK (tiempo_respuesta_ms >= 0),
  calificacion_positiva BOOLEAN
);

CREATE TABLE derivacion_humana (
  id_derivacion       SERIAL PRIMARY KEY,
  id_conversacion     BIGINT NOT NULL REFERENCES conversacion(id_conversacion),
  id_lead             BIGINT REFERENCES lead(id_lead),
  motivo              TEXT NOT NULL,
  id_usuario_asignado INT REFERENCES usuario_interno(id_usuario),
  estado              estado_derivacion NOT NULL DEFAULT 'pendiente',
  derivada_en         TIMESTAMPTZ NOT NULL DEFAULT now(),
  atendida_en         TIMESTAMPTZ,
  resolucion          TEXT
);

-- ===================== F. NEGOCIACIÓN Y CIERRE (FASE 2) =====================
CREATE TABLE propuesta (
  id_propuesta      BIGSERIAL PRIMARY KEY,
  id_lead           BIGINT NOT NULL REFERENCES lead(id_lead),
  id_proyecto       INT REFERENCES proyecto_tesis(id_proyecto),
  id_conversacion   BIGINT REFERENCES conversacion(id_conversacion),
  id_agente         INT REFERENCES agente_ia(id_agente),
  id_usuario        INT REFERENCES usuario_interno(id_usuario),
  estado            estado_propuesta NOT NULL DEFAULT 'borrador',
  modalidad         modalidad_servicio,
  tiempo_entrega_dias INT,
  monto_total       NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (monto_total >= 0),
  moneda            CHAR(3) NOT NULL DEFAULT 'PEN',
  condiciones       TEXT,
  fecha_envio       TIMESTAMPTZ,
  vigente_hasta     DATE,
  fecha_respuesta   TIMESTAMPTZ,
  motivo_rechazo    TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE propuesta_detalle (
  id_detalle      BIGSERIAL PRIMARY KEY,
  id_propuesta    BIGINT NOT NULL REFERENCES propuesta(id_propuesta) ON DELETE CASCADE,
  id_servicio     INT NOT NULL REFERENCES servicio(id_servicio),
  id_etapa        INT REFERENCES etapa_tesis(id_etapa),
  descripcion     VARCHAR(250),
  cantidad        SMALLINT NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  precio_unitario NUMERIC(10,2) NOT NULL CHECK (precio_unitario >= 0),
  descuento       NUMERIC(10,2) NOT NULL DEFAULT 0 CHECK (descuento >= 0),
  subtotal        NUMERIC(10,2) GENERATED ALWAYS AS (cantidad * precio_unitario - descuento) STORED
);

CREATE TABLE objecion (
  id_objecion       SERIAL PRIMARY KEY,
  tipo              tipo_objecion NOT NULL,
  descripcion       VARCHAR(250) NOT NULL,
  respuesta_sugerida TEXT,
  activa            BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE lead_objecion (
  id_lead_objecion BIGSERIAL PRIMARY KEY,
  id_lead          BIGINT NOT NULL REFERENCES lead(id_lead),
  id_propuesta     BIGINT REFERENCES propuesta(id_propuesta),
  id_objecion      INT NOT NULL REFERENCES objecion(id_objecion),
  id_mensaje       BIGINT REFERENCES mensaje(id_mensaje),
  detalle          TEXT,
  resuelta         BOOLEAN NOT NULL DEFAULT FALSE,
  registrada_en    TIMESTAMPTZ NOT NULL DEFAULT now(),
  resuelta_en      TIMESTAMPTZ
);

CREATE TABLE seguimiento (
  id_seguimiento   BIGSERIAL PRIMARY KEY,
  id_propuesta     BIGINT NOT NULL REFERENCES propuesta(id_propuesta),
  id_lead          BIGINT NOT NULL REFERENCES lead(id_lead),
  id_agente        INT REFERENCES agente_ia(id_agente),
  nro_intento      SMALLINT NOT NULL DEFAULT 1,
  canal            canal_contacto,
  estado           estado_seguimiento NOT NULL DEFAULT 'programado',
  fecha_programada TIMESTAMPTZ NOT NULL,
  fecha_envio      TIMESTAMPTZ,
  mensaje          TEXT,
  resultado        TEXT,
  generado_por_ia  BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE contrato (
  id_contrato               SERIAL PRIMARY KEY,
  id_propuesta              BIGINT NOT NULL UNIQUE REFERENCES propuesta(id_propuesta),
  id_lead                   BIGINT NOT NULL REFERENCES lead(id_lead),
  version_clausulas         VARCHAR(20) NOT NULL DEFAULT '1.0',
  acepta_autoria_estudiante BOOLEAN NOT NULL DEFAULT TRUE CHECK (acepta_autoria_estudiante),
  archivo_url               TEXT,
  fecha_firma               TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE pago (
  id_pago              SERIAL PRIMARY KEY,
  id_contrato          INT NOT NULL REFERENCES contrato(id_contrato),
  id_lead              BIGINT NOT NULL REFERENCES lead(id_lead),
  nro_cuota            SMALLINT NOT NULL DEFAULT 1,
  concepto             VARCHAR(150),
  monto                NUMERIC(10,2) NOT NULL CHECK (monto > 0),
  moneda               CHAR(3) NOT NULL DEFAULT 'PEN',
  metodo               metodo_pago,
  estado               estado_pago NOT NULL DEFAULT 'pendiente',
  referencia_operacion VARCHAR(100),
  comprobante_url      TEXT,
  fecha_pago           TIMESTAMPTZ,
  created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cliente (
  id_cliente          SERIAL PRIMARY KEY,
  id_lead             BIGINT NOT NULL UNIQUE REFERENCES lead(id_lead),
  id_propuesta_origen BIGINT REFERENCES propuesta(id_propuesta),
  fecha_conversion    TIMESTAMPTZ NOT NULL DEFAULT now(),
  activo              BOOLEAN NOT NULL DEFAULT TRUE
);

-- ===================== G. KPIs =====================
CREATE TABLE kpi_definicion (
  id_kpi         SERIAL PRIMARY KEY,
  codigo         VARCHAR(20) NOT NULL UNIQUE,
  nombre         VARCHAR(120) NOT NULL,
  fase           SMALLINT NOT NULL CHECK (fase IN (1,2)),
  formula        TEXT,
  unidad         VARCHAR(10),
  umbral_rojo    NUMERIC(10,2) NOT NULL,
  umbral_verde   NUMERIC(10,2) NOT NULL,
  mayor_es_mejor BOOLEAN NOT NULL DEFAULT TRUE,
  descripcion    TEXT
);

CREATE TABLE kpi_medicion (
  id_medicion    BIGSERIAL PRIMARY KEY,
  id_kpi         INT NOT NULL REFERENCES kpi_definicion(id_kpi),
  periodo_inicio DATE NOT NULL,
  periodo_fin    DATE NOT NULL,
  numerador      NUMERIC(14,2),
  denominador    NUMERIC(14,2),
  valor          NUMERIC(12,4) NOT NULL,
  semaforo       semaforo,
  id_universidad INT REFERENCES universidad(id_universidad),
  id_campana     INT REFERENCES campana(id_campana),
  id_agente      INT REFERENCES agente_ia(id_agente),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (periodo_fin >= periodo_inicio)
);

-- ------------------------------ ÍNDICES ------------------------------
CREATE INDEX idx_publicacion_fecha     ON publicacion (fecha_publicacion);
CREATE INDEX idx_publicacion_estado    ON publicacion (estado);
CREATE INDEX idx_sesion_fecha          ON sesion_landing (fecha);
CREATE INDEX idx_sesion_publicacion    ON sesion_landing (id_publicacion);
CREATE INDEX idx_lead_telefono         ON lead (telefono);
CREATE INDEX idx_lead_estado           ON lead (id_estado);
CREATE INDEX idx_lead_registro         ON lead (fecha_registro);
CREATE INDEX idx_lead_historial        ON lead_estado_historial (id_lead, fecha);
CREATE INDEX idx_perfil_universidad    ON perfil_academico (id_universidad);
CREATE INDEX idx_conversacion_lead     ON conversacion (id_lead);
CREATE INDEX idx_mensaje_conv          ON mensaje (id_conversacion, enviado_en);
CREATE INDEX idx_propuesta_lead        ON propuesta (id_lead);
CREATE INDEX idx_propuesta_estado      ON propuesta (estado, fecha_envio);
CREATE INDEX idx_seguimiento_pend      ON seguimiento (estado, fecha_programada);
CREATE INDEX idx_pago_lead             ON pago (id_lead);
CREATE INDEX idx_kpi_medicion          ON kpi_medicion (id_kpi, periodo_inicio);

-- ------------------------------ TRIGGERS ------------------------------
CREATE OR REPLACE FUNCTION fn_set_updated_at() RETURNS trigger AS \$\$
BEGIN NEW.updated_at = now(); RETURN NEW; END; \$\$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lead_updated     BEFORE UPDATE ON lead
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();
CREATE TRIGGER trg_proyecto_updated BEFORE UPDATE ON proyecto_tesis
  FOR EACH ROW EXECUTE FUNCTION fn_set_updated_at();

-- Registra automáticamente el historial al cambiar el estado del lead
CREATE OR REPLACE FUNCTION fn_lead_historial() RETURNS trigger AS \$\$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.id_estado IS DISTINCT FROM OLD.id_estado THEN
    INSERT INTO lead_estado_historial (id_lead, id_estado) VALUES (NEW.id_lead, NEW.id_estado);
  END IF;
  RETURN NEW;
END; \$\$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lead_historial AFTER INSERT OR UPDATE OF id_estado ON lead
  FOR EACH ROW EXECUTE FUNCTION fn_lead_historial();

-- Primer pago confirmado => el lead pasa a payer (cliente)
CREATE OR REPLACE FUNCTION fn_pago_a_cliente() RETURNS trigger AS \$\$
DECLARE v_prop BIGINT; v_estado SMALLINT;
BEGIN
  IF NEW.estado = 'confirmado' THEN
    SELECT id_propuesta INTO v_prop FROM contrato WHERE id_contrato = NEW.id_contrato;
    INSERT INTO cliente (id_lead, id_propuesta_origen, fecha_conversion)
    VALUES (NEW.id_lead, v_prop, COALESCE(NEW.fecha_pago, now()))
    ON CONFLICT (id_lead) DO NOTHING;
    SELECT id_estado INTO v_estado FROM estado_lead WHERE codigo = 'payer';
    UPDATE lead SET id_estado = v_estado WHERE id_lead = NEW.id_lead AND id_estado <> v_estado;
  END IF;
  RETURN NEW;
END; \$\$ LANGUAGE plpgsql;

CREATE TRIGGER trg_pago_cliente AFTER INSERT OR UPDATE OF estado ON pago
  FOR EACH ROW EXECUTE FUNCTION fn_pago_a_cliente();

-- Calcula el color del semáforo de un KPI
CREATE OR REPLACE FUNCTION fn_semaforo(p_valor NUMERIC, p_rojo NUMERIC, p_verde NUMERIC, p_mayor_mejor BOOLEAN)
RETURNS semaforo AS \$\$
BEGIN
  IF p_mayor_mejor THEN
    RETURN CASE WHEN p_valor < p_rojo THEN 'rojo' WHEN p_valor > p_verde THEN 'verde' ELSE 'amarillo' END;
  ELSE
    RETURN CASE WHEN p_valor > p_rojo THEN 'rojo' WHEN p_valor < p_verde THEN 'verde' ELSE 'amarillo' END;
  END IF;
END; \$\$ LANGUAGE plpgsql IMMUTABLE;

-- ------------------------------ VISTAS KPI (mensuales) ------------------------------
CREATE VIEW v_kpi_ctr AS
SELECT date_trunc('month', fecha_publicacion)::date AS mes,
       SUM(clics) AS clics, SUM(impresiones) AS impresiones,
       ROUND(100.0 * SUM(clics) / NULLIF(SUM(impresiones),0), 2) AS ctr
FROM publicacion WHERE estado = 'publicada' GROUP BY 1;

CREATE VIEW v_kpi_interaccion_redes AS
SELECT date_trunc('month', fecha_publicacion)::date AS mes,
       ROUND(100.0 * SUM(likes + comentarios + compartidos) / NULLIF(SUM(alcance),0), 2) AS tasa_interaccion
FROM publicacion WHERE estado = 'publicada' GROUP BY 1;

CREATE VIEW v_kpi_landing AS
SELECT date_trunc('month', fecha)::date AS mes,
       COUNT(*) AS sesiones,
       ROUND(100.0 * COUNT(*) FILTER (WHERE tuvo_interaccion) / NULLIF(COUNT(*),0), 2) AS tasa_interaccion,
       ROUND(100.0 * COUNT(*) FILTER (WHERE completo_formulario)
             / NULLIF(COUNT(*) FILTER (WHERE visito_formulario),0), 2) AS tcl
FROM sesion_landing GROUP BY 1;

CREATE VIEW v_kpi_lpo AS
SELECT date_trunc('month', fecha_registro)::date AS mes,
       COUNT(*) AS leads,
       ROUND(100.0 * COUNT(*) FILTER (WHERE cumple_perfil_objetivo) / NULLIF(COUNT(*),0), 2) AS lpo
FROM lead GROUP BY 1;

CREATE VIEW v_kpi_chat AS
SELECT date_trunc('month', enviado_en)::date AS mes,
       ROUND(AVG(tiempo_respuesta_ms) / 1000.0, 2) AS tpr_segundos,
       ROUND(100.0 * COUNT(*) FILTER (WHERE calificacion_positiva)
             / NULLIF(COUNT(*) FILTER (WHERE calificacion_positiva IS NOT NULL),0), 2) AS tsu
FROM mensaje WHERE remitente = 'agente_ia' GROUP BY 1;

CREATE VIEW v_kpi_tap AS
SELECT date_trunc('month', fecha_envio)::date AS mes,
       COUNT(*) AS enviadas,
       COUNT(*) FILTER (WHERE estado = 'aceptada') AS aceptadas,
       ROUND(100.0 * COUNT(*) FILTER (WHERE estado = 'aceptada') / NULLIF(COUNT(*),0), 2) AS tap
FROM propuesta WHERE estado <> 'borrador' AND fecha_envio IS NOT NULL GROUP BY 1;

CREATE VIEW v_kpi_tcp AS
SELECT date_trunc('month', l.fecha_registro)::date AS mes,
       COUNT(*) AS leads, COUNT(c.id_cliente) AS payers,
       ROUND(100.0 * COUNT(c.id_cliente) / NULLIF(COUNT(*),0), 2) AS tcp
FROM lead l LEFT JOIN cliente c ON c.id_lead = l.id_lead GROUP BY 1;

CREATE VIEW v_kpi_tpc AS
SELECT date_trunc('month', c.fecha_conversion)::date AS mes,
       ROUND(AVG(EXTRACT(EPOCH FROM (c.fecha_conversion - p.fecha_envio)) / 86400)::numeric, 2) AS tpc_dias
FROM cliente c JOIN propuesta p ON p.id_propuesta = c.id_propuesta_origen
WHERE p.fecha_envio IS NOT NULL GROUP BY 1;`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP VIEW IF EXISTS v_kpi_tpc, v_kpi_tcp, v_kpi_tap, v_kpi_chat, v_kpi_lpo, v_kpi_landing, v_kpi_interaccion_redes, v_kpi_ctr CASCADE;
DROP TRIGGER IF EXISTS trg_pago_cliente ON pago;
DROP TRIGGER IF EXISTS trg_lead_historial ON lead;
DROP TRIGGER IF EXISTS trg_proyecto_updated ON proyecto_tesis;
DROP TRIGGER IF EXISTS trg_lead_updated ON lead;
DROP FUNCTION IF EXISTS fn_semaforo(NUMERIC, NUMERIC, NUMERIC, BOOLEAN);
DROP FUNCTION IF EXISTS fn_pago_a_cliente();
DROP FUNCTION IF EXISTS fn_lead_historial();
DROP FUNCTION IF EXISTS fn_set_updated_at();
DROP TABLE IF EXISTS kpi_medicion, kpi_definicion, cliente, pago, contrato, seguimiento, lead_objecion, objecion, propuesta_detalle, propuesta, derivacion_humana, mensaje, conversacion, descarga_recurso, proyecto_necesidad, proyecto_tesis, servicio, consentimiento_datos, perfil_laboral, perfil_academico, lead_estado_historial, enlace_referido, lead, estado_lead, sesion_landing, recurso_gratuito, convenio_institucional, publicacion, concepto_visual, campana, cuenta_red_social, plataforma, agente_ia, usuario_interno, necesidad_academica, etapa_tesis, directiva_tesis, programa_academico, grado_academico, facultad, universidad CASCADE;
DROP TYPE IF EXISTS semaforo, estado_pago, metodo_pago, estado_seguimiento, tipo_objecion, estado_propuesta, modalidad_servicio, modelo_cobro, estado_derivacion, estado_conversacion, tipo_concepto_visual, estado_publicacion, tipo_contenido, rol_usuario, tipo_agente, tipo_remitente, canal_origen_sesion, canal_contacto, condicion_academica CASCADE;`);
  }
}
