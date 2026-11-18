import type { MigrationInterface, QueryRunner } from 'typeorm';

export class BusinessKnowledge1793300000000 implements MigrationInterface {
  async up(q: QueryRunner) {
    await q.query(`
      CREATE TABLE knowledge_document (
        slug text PRIMARY KEY CHECK(slug IN ('business-profile','marketing','negociador','cobranza','academico','postventa','faq')),
        title text NOT NULL, draft_markdown text NOT NULL CHECK(length(draft_markdown)<=20000),
        draft_sources jsonb NOT NULL DEFAULT '[]', draft_revision int NOT NULL DEFAULT 1,
        updated_by int REFERENCES usuario_interno(id_usuario), updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE knowledge_version (
        id bigserial PRIMARY KEY, slug text NOT NULL REFERENCES knowledge_document(slug), version int NOT NULL,
        markdown text NOT NULL, sources jsonb NOT NULL, reason text NOT NULL,
        published_by int REFERENCES usuario_interno(id_usuario), published_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE(slug,version)
      );
      CREATE TABLE knowledge_release (
        id bigserial PRIMARY KEY, versions jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE TABLE knowledge_active (
        id int PRIMARY KEY CHECK(id=1), release_id bigint NOT NULL REFERENCES knowledge_release(id)
      );
      CREATE TABLE knowledge_usage (
        turn_key text NOT NULL, operation text NOT NULL, agent text NOT NULL,
        release_id bigint NOT NULL REFERENCES knowledge_release(id), created_at timestamptz NOT NULL DEFAULT now(),
        PRIMARY KEY(turn_key,operation,agent)
      );
      CREATE FUNCTION knowledge_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'Las versiones publicadas de conocimiento son inmutables' USING ERRCODE='23514'; END; $$;
      CREATE TRIGGER knowledge_version_immutable BEFORE UPDATE OR DELETE ON knowledge_version FOR EACH ROW EXECUTE FUNCTION knowledge_immutable();
      CREATE TRIGGER knowledge_release_immutable BEFORE UPDATE OR DELETE ON knowledge_release FOR EACH ROW EXECUTE FUNCTION knowledge_immutable();
    `);
  }
  async down(): Promise<void> { throw new Error('Conserva las publicaciones y su historial antes de retirar el módulo de conocimiento.'); }
}
