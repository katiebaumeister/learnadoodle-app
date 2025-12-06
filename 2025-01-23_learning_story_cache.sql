-- Cache table for learning story narratives to reduce LLM calls
CREATE TABLE IF NOT EXISTS learning_story_cache (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id uuid NOT NULL REFERENCES family(id) ON DELETE CASCADE,
    week_start date NOT NULL,
    data_hash text NOT NULL, -- Hash of children data to detect changes
    narrative_data jsonb NOT NULL, -- Cached narrative: {family_summary, per_child_summaries, tone}
    created_at timestamptz DEFAULT now(),
    UNIQUE(family_id, week_start, data_hash)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_learning_story_cache_lookup 
    ON learning_story_cache(family_id, week_start, data_hash);

-- RLS policies
ALTER TABLE learning_story_cache ENABLE ROW LEVEL SECURITY;

-- Policy: Users can only see cache entries for their own family
CREATE POLICY "Users can view their family's cache"
    ON learning_story_cache FOR SELECT
    USING (
        family_id IN (
            SELECT family_id FROM profiles WHERE id = auth.uid()
        )
    );

-- Policy: Service role can manage all cache entries
CREATE POLICY "Service role can manage cache"
    ON learning_story_cache FOR ALL
    USING (true)
    WITH CHECK (true);

-- Auto-cleanup old cache entries (older than 8 weeks)
CREATE OR REPLACE FUNCTION cleanup_old_learning_story_cache()
RETURNS void
LANGUAGE plpgsql
AS $$
BEGIN
    DELETE FROM learning_story_cache
    WHERE created_at < now() - INTERVAL '8 weeks';
END;
$$;

COMMENT ON TABLE learning_story_cache IS 'Caches LLM-generated weekly learning narratives to reduce API calls';
COMMENT ON COLUMN learning_story_cache.data_hash IS 'MD5 hash of children data to detect when data changes and cache should be invalidated';
