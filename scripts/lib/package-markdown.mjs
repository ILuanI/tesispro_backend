import { readFile } from 'node:fs/promises';

const plain = text => text.replace(/\*\*|`/g, '').trim();
const heading = title => title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
function subsection(body, title) {
  const match = body.match(new RegExp(`^### ${heading(title)}\\r?\\n([\\s\\S]*?)(?=^### |$(?![\\s\\S]))`, 'm'));
  if (!match?.[1]?.trim()) throw new Error(`Falta sección: ${title}`);
  return match[1].trim();
}
function tableRows(text) {
  return text.split(/\r?\n/).filter(line => line.startsWith('|')).slice(2)
    .map(line => line.split('|').slice(1, -1).map(plain));
}
export async function readPackageMarkdown(path) {
  const markdown = await readFile(path, 'utf8');
  const sections = [...markdown.matchAll(/^## (\d+)\. ([^\r\n]+)\r?\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)];
  const rules = sections.find(match => match[1] === '7')?.[3]?.trim();
  if (!rules) throw new Error('Faltan reglas de recomendación para Tesi.');
  const expected = ['basico', 'desarrollo-tecnico', 'integral'];
  return expected.map((codigo, index) => {
    const body = sections.find(match => Number(match[1]) === index + 1)?.[3];
    if (!body || !body.includes('`' + codigo + '`')) throw new Error(`Falta paquete ${codigo}`);
    const meta = key => {
      const match = body.match(new RegExp(`^- \\*\\*${key}:\\*\\* (.+)$`, 'm'));
      if (!match) throw new Error(`Falta ${key} de ${codigo}`);
      return plain(match[1]);
    };
    const guide = ['Cuándo recomendarlo (contenido propuesto para Tesi)', 'Cuándo recomendar otra opción', 'Información necesaria para comenzar', 'Diferencias frente a los otros paquetes', 'Preguntas frecuentes', 'Ejemplo de recomendación conversacional']
      .map(title => `### ${title}\n${subsection(body, title)}`).join('\n\n');
    const fields = {
      descripcion: subsection(body, 'Descripción'),
      publicoObjetivo: subsection(body, 'Público objetivo'),
      prestaciones: tableRows(subsection(body, 'Prestaciones')).map(([activity, scope]) => `${activity}: ${scope}`),
      entregables: tableRows(subsection(body, 'Entregables')).map(([name, content, format]) => `${name}: ${content}. Formato: ${format}.`),
      restricciones: [
        ...subsection(body, 'Restricciones').split(/\r?\n/).filter(line => line.startsWith('- ')).map(line => plain(line.slice(2))),
        'Asesoría para tesis de pregrado. La elaboración, autoría y sustentación corresponden al estudiante. No se garantiza aprobación, calificación ni título.',
      ],
      guiaRecomendacion: `Fuente: TesisPro_Paquetes_y_Recomendaciones.md\n\n${guide}\n\n### Reglas de recomendación\n${rules}`,
    };
    for (const [key, limit] of [['descripcion', 3000], ['publicoObjetivo', 2000], ['guiaRecomendacion', 16000]]) {
      if (!fields[key] || fields[key].length > limit) throw new Error(`Longitud inválida: ${codigo}.${key}`);
    }
    for (const key of ['entregables', 'restricciones', 'prestaciones']) {
      if (!fields[key].length || fields[key].some(value => value.length > (key === 'prestaciones' ? 1000 : 500))) throw new Error(`Lista inválida: ${codigo}.${key}`);
    }
    return { codigo, expectedPrice: meta('precioFijo'), expectedDays: Number(meta('duracionDias')), fields };
  });
}
