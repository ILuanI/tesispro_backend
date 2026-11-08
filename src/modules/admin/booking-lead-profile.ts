import type { EntityManager } from 'typeorm';

// La reserva aporta datos declarados, sin sustituir información ya registrada.
export async function completeBookingLeadProfile(
  m: EntityManager,
  lead: string,
  input: { universidad?: string | null; descripcion?: string | null },
) {
  const provenance: Record<string, unknown> = {};
  const universidad = input.universidad?.trim();
  if (universidad) {
    const [before] = await m.query('SELECT id_universidad,universidad_otra FROM perfil_academico WHERE id_lead=$1 FOR UPDATE', [lead]);
    if (!before?.id_universidad && !before?.universidad_otra?.trim()) {
      await m.query(`INSERT INTO perfil_academico(id_lead,universidad_otra) VALUES($1,$2)
        ON CONFLICT(id_lead) DO UPDATE SET universidad_otra=excluded.universidad_otra`, [lead, universidad]);
      provenance['perfilAcademico.universidadOtra'] = { origen: 'reserva', confirmado: true };
    }
  }
  const descripcion = input.descripcion?.trim();
  if (descripcion) {
    const projects = await m.query('SELECT id_proyecto,observaciones FROM proyecto_tesis WHERE id_lead=$1 ORDER BY id_proyecto FOR UPDATE', [lead]);
    let project: { id_proyecto: number } | undefined;
    if (!projects.length) {
      [project] = await m.query('INSERT INTO proyecto_tesis(id_lead,observaciones) VALUES($1,$2) RETURNING id_proyecto', [lead, descripcion]);
    } else if (projects.length === 1 && !projects[0].observaciones?.trim()) {
      project = projects[0];
      await m.query('UPDATE proyecto_tesis SET observaciones=$2,updated_at=now() WHERE id_proyecto=$1', [project!.id_proyecto, descripcion]);
    }
    // Con varios proyectos, la consulta queda en la reunión, sin atribuirla a uno al azar.
    if (project) provenance[`proyectos.${project.id_proyecto}.observaciones`] = { origen: 'reserva', confirmado: true };
  }
  if (Object.keys(provenance).length) {
    await m.query('UPDATE lead SET procedencia_campos=procedencia_campos || $2::jsonb WHERE id_lead=$1', [lead, JSON.stringify(provenance)]);
  }
}
