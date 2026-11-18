export const knowledgeSlugs = ['business-profile', 'marketing', 'negociador', 'cobranza', 'academico', 'postventa', 'faq'] as const;
export type KnowledgeSlug = typeof knowledgeSlugs[number];
export type KnowledgeAgent = Exclude<KnowledgeSlug, 'business-profile' | 'faq'>;
export interface KnowledgeDocument {
  slug: KnowledgeSlug; title: string; version: number; markdown: string; reviewedAt: string;
}
export interface KnowledgeSnapshot { releaseId: string; documents: KnowledgeDocument[] }
export interface KnowledgeContext extends KnowledgeSnapshot { agent: KnowledgeAgent }
export const knowledgeLimits = { profile: 4000, role: 4000, faq: 8000, total: 16000 };
export function selectKnowledge(snapshot: KnowledgeSnapshot, agent: KnowledgeAgent, includeFaq = false): KnowledgeContext {
  const slugs = ['business-profile', agent, ...(includeFaq ? ['faq'] : [])];
  const documents = slugs.map(slug => snapshot.documents.find(d => d.slug === slug));
  if (documents.some(d => !d)) throw new Error('Conocimiento publicado incompleto.');
  const selected = documents as KnowledgeDocument[];
  if (selected.reduce((n, d) => n + d.markdown.length, 0) > knowledgeLimits.total) throw new Error('Contexto documental demasiado extenso.');
  return { releaseId: snapshot.releaseId, agent, documents: selected };
}
export function parseKnowledgeFaq(markdown: string) {
  const entries = [...markdown.matchAll(/^## ([1-9]\d{0,3})\. ([^\n]+)\n([\s\S]*?)(?=^## |$(?![\s\S]))/gm)]
    .map(m => ({ id: Number(m[1]), pregunta: m[2]!.trim(), respuesta: m[3]!.trim() }));
  if (!entries.length || entries.length > 40 || new Set(entries.map(e => e.id)).size !== entries.length || entries.some(e => !e.respuesta))
    throw new Error('FAQ: utiliza encabezados únicos «## 1. Pregunta» seguidos de una respuesta (máximo 40).');
  // Reject unparsed headings rather than silently dropping a malformed FAQ.
  if ((markdown.match(/^## /gm) || []).length !== entries.length) throw new Error('Hay encabezados FAQ inválidos.');
  return entries;
}
