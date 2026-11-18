import { BadRequestException, ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { DataSource, type EntityManager } from 'typeorm';
import { readFile } from 'node:fs/promises';
import { knowledgeSlugs, knowledgeLimits, parseKnowledgeFaq, selectKnowledge, type KnowledgeAgent, type KnowledgeSlug, type KnowledgeSnapshot } from './knowledge.types.js';

@Injectable()
export class KnowledgeService {
  constructor(private readonly db: DataSource) {}
  private async lock(m: EntityManager) { await m.query("SELECT pg_advisory_xact_lock(hashtextextended('knowledge:publish',0))"); }
  private slug(value: string): KnowledgeSlug {
    if (!knowledgeSlugs.includes(value as KnowledgeSlug)) throw new NotFoundException('Documento no encontrado.');
    return value as KnowledgeSlug;
  }
  private validate(slug: string, markdown: string) {
    const max = slug === 'faq' ? knowledgeLimits.faq : slug === 'business-profile' ? knowledgeLimits.profile : knowledgeLimits.role;
    if (!markdown.trim() || markdown.length > max) throw new BadRequestException(`El documento ${slug} admite entre 1 y ${max} caracteres publicados.`);
    if (/<\/?(?:script|iframe|object|style)\b/i.test(markdown)) throw new BadRequestException('El conocimiento no admite contenido ejecutable.');
    if (/(?:S\s*\/|US\$|USD|PEN|EUR|[$€])\s*\d|\d+\s*(?:soles|d[oó]lares)\b/i.test(markdown))
      throw new BadRequestException('Configura los importes en el catálogo autorizado, no en los documentos de conocimiento.');
    if (slug === 'faq') { try { parseKnowledgeFaq(markdown); } catch (e) { throw new BadRequestException((e as Error).message); } }
  }
  async bootstrap() {
    return this.db.transaction(async m => {
      await this.lock(m);
      const [existing] = await m.query('SELECT release_id FROM knowledge_active WHERE id=1');
      if (existing) return { created: false, releaseId: String(existing.release_id) };
      const [partial] = await m.query('SELECT 1 FROM knowledge_document LIMIT 1');
      if (partial) throw new ConflictException('Hay documentos existentes sin publicación inicial. No se sobrescribieron.');
      const versions: Record<string, string> = {};
      for (const slug of knowledgeSlugs) {
        const markdown = await readFile(new URL(`./documents/${slug}.md`, import.meta.url), 'utf8');
        this.validate(slug, markdown);
        const title = /^# (.+)$/m.exec(markdown)?.[1] || slug;
        const sources = JSON.stringify(['plan-de-negocio.md', ...(slug === 'negociador' || slug === 'cobranza' ? ['audio-3ra-reunion-pt1.txt'] : [])]);
        const draft = slug === 'business-profile' ? markdown + '\n\n## Pendiente de validación (solo borrador)\nConfirmar contacto oficial, dominio, sedes, horarios de atención, identidad legal y garantías antes de publicarlos.\n' : markdown;
        await m.query('INSERT INTO knowledge_document(slug,title,draft_markdown,draft_sources) VALUES($1,$2,$3,$4::jsonb)', [slug, title, draft, sources]);
        const [v] = await m.query("INSERT INTO knowledge_version(slug,version,markdown,sources,reason) VALUES($1,1,$2,$3::jsonb,'Base breve autorizada para la primera instalación') RETURNING id", [slug, markdown, sources]);
        versions[slug] = String(v.id);
      }
      const [release] = await m.query('INSERT INTO knowledge_release(versions) VALUES($1::jsonb) RETURNING id', [JSON.stringify(versions)]);
      await m.query('INSERT INTO knowledge_active(id,release_id) VALUES(1,$1)', [release.id]);
      return { created: true, releaseId: String(release.id) };
    });
  }
  async snapshot(turnKey?: string, operation?: string): Promise<KnowledgeSnapshot> {
    const rows = await this.db.query(`SELECT r.id AS release_id,v.slug,d.title,v.version,v.markdown,v.published_at FROM knowledge_active a
      JOIN knowledge_release r ON r.id=coalesce((SELECT u.release_id FROM knowledge_usage u WHERE u.turn_key=$1 AND u.operation=$2 ORDER BY u.created_at LIMIT 1),a.release_id)
      CROSS JOIN LATERAL jsonb_each_text(r.versions) mapping
      JOIN knowledge_version v ON v.id=mapping.value::bigint AND v.slug=mapping.key JOIN knowledge_document d ON d.slug=v.slug WHERE a.id=1 ORDER BY v.slug`, [turnKey || null, operation || null]);
    if (rows.length !== knowledgeSlugs.length) throw new ServiceUnavailableException('El conocimiento del negocio aún no está publicado. Solicita atención de un asesor.');
    const snapshot = { releaseId: String(rows[0].release_id), documents: rows.map((r: any) => ({ slug: r.slug, title: r.title, version: r.version, markdown: r.markdown, reviewedAt: new Date(r.published_at).toISOString() })) };
    for (const d of snapshot.documents) this.validate(d.slug, d.markdown);
    return snapshot;
  }
  async context(agent: KnowledgeAgent, faq: boolean, turnKey: string, operation: string) {
    const snapshot = await this.snapshot(turnKey, operation);
    await this.record(snapshot, agent, turnKey, operation);
    return selectKnowledge(snapshot, agent, faq);
  }
  async record(snapshot: KnowledgeSnapshot, agent: KnowledgeAgent, turnKey: string, operation: string) {
    await this.db.query('INSERT INTO knowledge_usage(turn_key,operation,agent,release_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING', [turnKey, operation, agent, snapshot.releaseId]);
    const [saved] = await this.db.query('SELECT release_id FROM knowledge_usage WHERE turn_key=$1 AND operation=$2 AND agent=$3', [turnKey, operation, agent]);
    if (String(saved.release_id) !== snapshot.releaseId) throw new ConflictException('El turno ya utiliza otra publicación. Reintenta la solicitud.');
  }
  async list() {
    return this.db.query(`SELECT d.slug,d.title,d.draft_revision AS revision,d.updated_at AS "updatedAt",v.version AS "publishedVersion",
      v.markdown IS DISTINCT FROM d.draft_markdown OR v.sources IS DISTINCT FROM d.draft_sources AS "hasChanges",a.release_id AS "releaseId"
      FROM knowledge_document d LEFT JOIN knowledge_active a ON a.id=1 LEFT JOIN knowledge_release r ON r.id=a.release_id
      LEFT JOIN knowledge_version v ON v.id=(r.versions->>d.slug)::bigint ORDER BY d.slug`);
  }
  async detail(value: string) {
    const slug = this.slug(value);
    const [d] = await this.db.query('SELECT slug,title,draft_markdown AS markdown,draft_sources AS sources,draft_revision AS revision,updated_at AS "updatedAt" FROM knowledge_document WHERE slug=$1', [slug]);
    if (!d) throw new NotFoundException('Inicializa primero el conocimiento del negocio.');
    const [active] = await this.db.query(`SELECT a.release_id AS "releaseId",v.id,v.version,v.markdown,v.sources,v.published_at AS "publishedAt"
      FROM knowledge_active a JOIN knowledge_release r ON r.id=a.release_id JOIN knowledge_version v ON v.id=(r.versions->>$1)::bigint WHERE a.id=1`, [slug]);
    const versions = await this.db.query('SELECT id,version,reason,published_at AS "publishedAt",published_by AS "publishedBy",markdown,sources FROM knowledge_version WHERE slug=$1 ORDER BY version DESC', [slug]);
    return { ...d, published: active || null, versions };
  }
  async draft(value: string, revision: number, markdown: string, sources: string[], user: number) {
    const slug = this.slug(value);
    return this.db.transaction(async m => {
      const [d] = await m.query('SELECT * FROM knowledge_document WHERE slug=$1 FOR UPDATE', [slug]);
      if (!d) throw new NotFoundException('Documento no encontrado.');
      if (d.draft_revision !== revision) throw new ConflictException('El borrador cambió. Recarga antes de guardar.');
      await m.query('UPDATE knowledge_document SET draft_markdown=$2,draft_sources=$3::jsonb,draft_revision=draft_revision+1,updated_by=$4,updated_at=now() WHERE slug=$1', [slug, markdown, JSON.stringify(sources), user]);
      return { revision: revision + 1 };
    });
  }
  async publish(value: string, revision: number, releaseId: string, reason: string, user: number) {
    const slug = this.slug(value);
    reason = reason.trim();
    if (reason.length < 3) throw new BadRequestException('Indica un motivo de publicación.');
    return this.db.transaction(async m => {
      await this.lock(m);
      const [d] = await m.query('SELECT * FROM knowledge_document WHERE slug=$1 FOR UPDATE', [slug]);
      if (!d) throw new NotFoundException('Documento no encontrado.');
      const [active] = await m.query('SELECT r.* FROM knowledge_active a JOIN knowledge_release r ON r.id=a.release_id WHERE a.id=1');
      if (!active || String(active.id) !== releaseId || d.draft_revision !== revision) throw new ConflictException('La publicación o el borrador cambió. Recarga y revisa antes de publicar.');
      this.validate(slug, d.draft_markdown);
      if (!d.draft_sources.length || d.draft_sources.some((s: string) => !s.trim())) throw new BadRequestException('Indica al menos una fuente interna para publicar.');
      const [number] = await m.query('SELECT coalesce(max(version),0)+1 AS next FROM knowledge_version WHERE slug=$1', [slug]);
      const [v] = await m.query('INSERT INTO knowledge_version(slug,version,markdown,sources,reason,published_by) VALUES($1,$2,$3,$4::jsonb,$5,$6) RETURNING id', [slug, number.next, d.draft_markdown, JSON.stringify(d.draft_sources), reason, user]);
      const versions = { ...active.versions, [slug]: String(v.id) };
      const [r] = await m.query('INSERT INTO knowledge_release(versions) VALUES($1::jsonb) RETURNING id', [JSON.stringify(versions)]);
      await m.query('UPDATE knowledge_active SET release_id=$1 WHERE id=1', [r.id]);
      return { releaseId: String(r.id), version: number.next };
    });
  }
  async restore(value: string, id: string, revision: number, user: number) {
    const slug = this.slug(value);
    const [v] = await this.db.query('SELECT * FROM knowledge_version WHERE slug=$1 AND id=$2', [slug, id]);
    if (!v) throw new NotFoundException('Versión no encontrada.');
    return this.draft(slug, revision, v.markdown, v.sources, user);
  }
}
