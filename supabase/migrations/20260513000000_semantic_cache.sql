-- ════════════════════════════════════════════════════════════════
--  Semantic Q&A Cache + Historical Power BI Snapshots
--  Run once in Supabase SQL Editor or via: npx supabase db push
-- ════════════════════════════════════════════════════════════════

-- 1. Vector extension (idempotent)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Historical snapshots: add is_current flag to existing table
ALTER TABLE powerbi_resumen_cache
  ADD COLUMN IF NOT EXISTS is_current boolean NOT NULL DEFAULT true;

-- 3. Unique constraint per (project, month) → enables UPSERT and history
ALTER TABLE powerbi_resumen_cache
  DROP CONSTRAINT IF EXISTS powerbi_resumen_cache_project_mes_unique;

ALTER TABLE powerbi_resumen_cache
  ADD CONSTRAINT powerbi_resumen_cache_project_mes_unique
  UNIQUE (project_key, mes_a);

-- Mark only the latest snapshot per project as current (idempotent backfill)
UPDATE powerbi_resumen_cache prc
SET is_current = (
  prc.mes_a = (
    SELECT MAX(mes_a) FROM powerbi_resumen_cache WHERE project_key = prc.project_key
  )
);

-- 4. Semantic Q&A cache
CREATE TABLE IF NOT EXISTS qa_cache (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  project_key  text,                            -- NULL = global query
  question     text        NOT NULL,
  embedding    vector(384) NOT NULL,
  answer       text        NOT NULL,
  mes_a        text        NOT NULL,            -- data version for invalidation
  hit_count    int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now()
);

-- 5. ANN index (ivfflat cosine — optimal for <1M rows)
CREATE INDEX IF NOT EXISTS qa_cache_embedding_idx
  ON qa_cache USING ivfflat (embedding vector_cosine_ops) WITH (lists = 50);

CREATE INDEX IF NOT EXISTS qa_cache_project_key_idx
  ON qa_cache (project_key);

-- 6. Similarity search RPC (called from Edge Function)
CREATE OR REPLACE FUNCTION find_similar_question(
  query_embedding   vector(384),
  query_project_key text,
  similarity_threshold float DEFAULT 0.88,
  match_count       int  DEFAULT 1
)
RETURNS TABLE (
  id           uuid,
  question     text,
  answer       text,
  mes_a        text,
  hit_count    int,
  similarity   float
)
LANGUAGE sql STABLE
AS $$
  SELECT
    id, question, answer, mes_a, hit_count,
    1 - (embedding <=> query_embedding) AS similarity
  FROM qa_cache
  WHERE
    project_key IS NOT DISTINCT FROM query_project_key
    AND (1 - (embedding <=> query_embedding)) >= similarity_threshold
  ORDER BY embedding <=> query_embedding
  LIMIT match_count;
$$;
