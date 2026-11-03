import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BuyerAcademicCatalogs1792310000000 implements MigrationInterface {
  name = 'BuyerAcademicCatalogs1792310000000';
  async up(q: QueryRunner): Promise<void> {
    await q.query(`INSERT INTO grado_academico(codigo,nombre) VALUES
      ('pregrado','Pregrado'),('maestria','Maestría'),('doctorado','Doctorado')
      ON CONFLICT(codigo) DO NOTHING`);
    await q.query(`INSERT INTO etapa_tesis(nombre,orden)
      SELECT x.nombre,x.orden FROM (VALUES
        ('Buscando tema',1),('Proyecto de tesis',2),('Desarrollo de tesis',3),
        ('Tengo observaciones',4),('Preparando sustentación',5)
      ) AS x(nombre,orden)
      WHERE NOT EXISTS(SELECT 1 FROM etapa_tesis e WHERE lower(e.nombre)=lower(x.nombre) AND e.id_grado IS NULL)`);
  }
  async down(): Promise<void> {
    // Conserva los catálogos: pueden tener modificaciones y perfiles asociados.
  }
}
