-- Schema-only reproduction of the alternative catalog. Isolated tests only.
CREATE TABLE paquete (
 id serial PRIMARY KEY,codigo varchar(30) NOT NULL UNIQUE,nombre varchar(150) NOT NULL,
 categoria varchar(30) NOT NULL CHECK(categoria IN ('puntual','etapas','integral','complementario')),
 descripcion text NOT NULL DEFAULT '',entregables text[] NOT NULL DEFAULT '{}',restricciones text[] NOT NULL DEFAULT '{}',
 precio numeric(10,2) CHECK(precio IS NULL OR precio>0),moneda char(3) NOT NULL DEFAULT 'PEN',
 duracion_dias int DEFAULT 30 CHECK(duracion_dias BETWEEN 1 AND 3650),publicado boolean NOT NULL DEFAULT false,
 version int NOT NULL DEFAULT 1,estado varchar(20) NOT NULL DEFAULT 'borrador' CHECK(estado IN ('borrador','publicado','archivado')),
 precio_tipo varchar(10) NOT NULL DEFAULT 'fijo' CHECK(precio_tipo IN ('fijo','desde')),
 sesiones int NOT NULL DEFAULT 0,minutos_sesion int NOT NULL DEFAULT 60,max_capitulos int,rondas_revision int NOT NULL DEFAULT 1,
 max_paginas int,cuotas int NOT NULL DEFAULT 1,prestaciones text[] NOT NULL DEFAULT '{}',destacado boolean NOT NULL DEFAULT false,
 id_servicio int NOT NULL UNIQUE REFERENCES servicio(id_servicio),actualizado_en timestamptz NOT NULL DEFAULT now(),
 negociacion_habilitada boolean NOT NULL DEFAULT false,opciones_negociacion jsonb NOT NULL DEFAULT '[]',
 CHECK(NOT publicado OR(precio IS NOT NULL AND precio>0 AND cardinality(entregables)>0 AND cardinality(restricciones)>0 AND length(btrim(descripcion))>0)),
 CHECK(categoria='complementario' OR(precio_tipo='fijo' AND duracion_dias IS NOT NULL))
);
CREATE TABLE paquete_version(id_paquete int NOT NULL REFERENCES paquete(id),version int NOT NULL,datos jsonb NOT NULL,id_usuario int REFERENCES usuario_interno(id_usuario),fecha timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(id_paquete,version));
ALTER TABLE contrato ADD COLUMN paquete_snapshot jsonb;
INSERT INTO servicio(codigo,nombre,precio_base,activo) VALUES('heredado_desde','Fixture desde',20,false),('heredado_fijo','Fixture fijo',25,false);
INSERT INTO paquete(codigo,nombre,categoria,descripcion,entregables,restricciones,precio,precio_tipo,publicado,estado,id_servicio,negociacion_habilitada,sesiones,prestaciones,opciones_negociacion)
SELECT codigo,nombre,'complementario','Condiciones heredadas ficticias',ARRAY['Entrega anterior de prueba'],ARRAY['Restricción anterior de prueba'],precio_base,
 CASE WHEN codigo='heredado_desde' THEN 'desde' ELSE 'fijo' END,true,'publicado',id_servicio,false,7,ARRAY['Prestación anterior de prueba'],'[{"tipo":"fixture"}]'::jsonb FROM servicio WHERE codigo IN ('heredado_desde','heredado_fijo');
INSERT INTO paquete_version(id_paquete,version,datos) SELECT id,version,to_jsonb(p) FROM paquete p;
