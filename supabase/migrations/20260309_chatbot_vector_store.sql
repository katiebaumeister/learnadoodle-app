-- Chatbot vector store: pgvector table + RPC for semantic search over app guide.
-- Embeddings are 1536 dimensions (OpenAI text-embedding-3-small or ada-002).
-- Seed data is populated by a script that chunks docs/APP_GUIDE_FOR_CHATBOT_VECTOR_STORE.md and calls OpenAI embeddings.

-- Enable pgvector (if not already enabled in public or extensions schema)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'vector') THEN
    CREATE EXTENSION vector;
  END IF;
EXCEPTION
  WHEN OTHERS THEN
    NULL; -- Extension may already exist in another schema (e.g. extensions.vector)
END $$;

-- Table for app guide / knowledge chunks (vector type from pgvector, 1536 = OpenAI embedding size)
CREATE TABLE IF NOT EXISTS public.chatbot_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  content TEXT NOT NULL,
  source TEXT,
  metadata JSONB DEFAULT '{}',
  embedding vector(1536),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE public.chatbot_knowledge IS 'Chunks of app guide for chatbot RAG; embedding = OpenAI 1536-dim.';

-- Index for fast similarity search (cosine distance)
CREATE INDEX IF NOT EXISTS idx_chatbot_knowledge_embedding
  ON public.chatbot_knowledge
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- RPC: match chunks by query embedding (cosine similarity). No auth required for read; restrict in app if needed.
CREATE OR REPLACE FUNCTION public.match_chatbot_knowledge(
  query_embedding vector(1536),
  match_count INT DEFAULT 5,
  match_threshold FLOAT DEFAULT 0.5
)
RETURNS TABLE (
  id UUID,
  content TEXT,
  source TEXT,
  similarity FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    k.id,
    k.content,
    k.source,
    1 - (k.embedding <=> query_embedding) AS similarity
  FROM public.chatbot_knowledge k
  WHERE k.embedding IS NOT NULL
    AND (1 - (k.embedding <=> query_embedding)) >= match_threshold
  ORDER BY k.embedding <=> query_embedding
  LIMIT match_count;
$$;

COMMENT ON FUNCTION public.match_chatbot_knowledge IS 'Returns top match_count chunks by cosine similarity for RAG.';

-- Read: anon/authenticated/service_role. Write (for seeding): service_role only.
GRANT SELECT ON public.chatbot_knowledge TO authenticated;
GRANT SELECT ON public.chatbot_knowledge TO service_role;
GRANT SELECT ON public.chatbot_knowledge TO anon;
GRANT INSERT, DELETE ON public.chatbot_knowledge TO service_role;
GRANT EXECUTE ON FUNCTION public.match_chatbot_knowledge TO authenticated;
GRANT EXECUTE ON FUNCTION public.match_chatbot_knowledge TO service_role;
GRANT EXECUTE ON FUNCTION public.match_chatbot_knowledge TO anon;
