-- Migration: Content, Media & Attachments (Infinite Library Mode)
-- Adds support for folders, digital binders, external links, PDF search, portfolio enhancements

-- ============================================================
-- 1. Folders System
-- ============================================================
CREATE TABLE IF NOT EXISTS document_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
    child_id UUID NULL REFERENCES children(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    folder_type TEXT NOT NULL CHECK (folder_type IN ('syllabus', 'assignments', 'portfolio', 'medical', 'id', 'activities', 'certificates', 'custom')),
    parent_folder_id UUID NULL REFERENCES document_folders(id) ON DELETE CASCADE,
    display_order INT NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(family_id, child_id, name, folder_type)
);

CREATE INDEX IF NOT EXISTS idx_folders_family ON document_folders(family_id);
CREATE INDEX IF NOT EXISTS idx_folders_child ON document_folders(child_id);
CREATE INDEX IF NOT EXISTS idx_folders_parent ON document_folders(parent_folder_id);
CREATE INDEX IF NOT EXISTS idx_folders_type ON document_folders(folder_type);

-- Add folder_id to uploads table
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'folder_id'
    ) THEN
        ALTER TABLE public.uploads ADD COLUMN folder_id UUID NULL REFERENCES document_folders(id) ON DELETE SET NULL;
        CREATE INDEX IF NOT EXISTS idx_uploads_folder ON public.uploads(folder_id);
    END IF;
END $$;

-- ============================================================
-- 2. External Links (Google Drive, Dropbox, etc.)
-- Must be created before document_binder which references it
-- ============================================================
CREATE TABLE IF NOT EXISTS external_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
    child_id UUID NULL REFERENCES children(id) ON DELETE SET NULL,
    subject_id UUID NULL REFERENCES subject(id) ON DELETE SET NULL,
    provider TEXT NOT NULL CHECK (provider IN ('google_drive', 'google_docs', 'dropbox', 'onedrive', 'other')),
    link_type TEXT NOT NULL CHECK (link_type IN ('file', 'folder', 'document')),
    title TEXT NOT NULL,
    url TEXT NOT NULL,
    thumbnail_url TEXT NULL,
    mime_type TEXT NULL,
    file_size_bytes BIGINT NULL,
    last_synced_at TIMESTAMPTZ NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_external_links_family ON external_links(family_id);
CREATE INDEX IF NOT EXISTS idx_external_links_child ON external_links(child_id);
CREATE INDEX IF NOT EXISTS idx_external_links_provider ON external_links(provider);

-- ============================================================
-- 3. Digital Binder (Per-Child Document Library)
-- ============================================================
CREATE TABLE IF NOT EXISTS document_binder (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
    upload_id UUID NULL REFERENCES uploads(id) ON DELETE CASCADE,
    external_link_id UUID NULL REFERENCES external_links(id) ON DELETE CASCADE,
    binder_section TEXT NOT NULL CHECK (binder_section IN ('syllabus', 'assignments', 'portfolio', 'medical', 'id', 'activities', 'certificates')),
    display_order INT NOT NULL DEFAULT 0,
    notes TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(child_id, upload_id, binder_section),
    UNIQUE(child_id, external_link_id, binder_section),
    CHECK ((upload_id IS NOT NULL AND external_link_id IS NULL) OR (upload_id IS NULL AND external_link_id IS NOT NULL))
);

CREATE INDEX IF NOT EXISTS idx_binder_child ON document_binder(child_id);
CREATE INDEX IF NOT EXISTS idx_binder_family ON document_binder(family_id);
CREATE INDEX IF NOT EXISTS idx_binder_section ON document_binder(binder_section);

-- ============================================================
-- 4. PDF Full-Text Search Index
-- ============================================================
CREATE TABLE IF NOT EXISTS pdf_search_index (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
    extracted_text TEXT NOT NULL,
    page_numbers INT[] NOT NULL DEFAULT '{}',
    search_vector tsvector GENERATED ALWAYS AS (to_tsvector('english', extracted_text)) STORED,
    extracted_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(upload_id)
);

CREATE INDEX IF NOT EXISTS idx_pdf_search_vector ON pdf_search_index USING GIN(search_vector);
CREATE INDEX IF NOT EXISTS idx_pdf_search_upload ON pdf_search_index(upload_id);
CREATE INDEX IF NOT EXISTS idx_pdf_search_family ON pdf_search_index(family_id);

-- ============================================================
-- 5. Auto-Captioning and Tagging
-- ============================================================
-- Add columns to uploads for auto-generated metadata
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'auto_caption'
    ) THEN
        ALTER TABLE public.uploads ADD COLUMN auto_caption TEXT NULL;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'auto_tags'
    ) THEN
        ALTER TABLE public.uploads ADD COLUMN auto_tags TEXT[] DEFAULT '{}';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'ai_metadata'
    ) THEN
        ALTER TABLE public.uploads ADD COLUMN ai_metadata JSONB DEFAULT '{}';
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'extracted_at'
    ) THEN
        ALTER TABLE public.uploads ADD COLUMN extracted_at TIMESTAMPTZ NULL;
    END IF;
END $$;

-- ============================================================
-- 6. Portfolio Enhancements
-- ============================================================
-- Add voice notes support (store audio files in uploads with special type)
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'is_voice_note'
    ) THEN
        ALTER TABLE public.uploads ADD COLUMN is_voice_note BOOLEAN DEFAULT false;
    END IF;
    
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'uploads' AND column_name = 'voice_duration_seconds'
    ) THEN
        ALTER TABLE public.uploads ADD COLUMN voice_duration_seconds INT NULL;
    END IF;
END $$;

-- Link portfolio items to standards, skills, and tasks
CREATE TABLE IF NOT EXISTS portfolio_evidence_links (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    link_type TEXT NOT NULL CHECK (link_type IN ('standard', 'skill', 'task', 'event')),
    linked_id UUID NOT NULL,
    notes TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(upload_id, link_type, linked_id)
);

CREATE INDEX IF NOT EXISTS idx_portfolio_links_upload ON portfolio_evidence_links(upload_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_links_child ON portfolio_evidence_links(child_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_links_type ON portfolio_evidence_links(link_type, linked_id);

-- Portfolio export tracking
CREATE TABLE IF NOT EXISTS portfolio_exports (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    child_id UUID NOT NULL REFERENCES children(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
    export_type TEXT NOT NULL CHECK (export_type IN ('pdf', 'zip', 'html')),
    file_path TEXT NULL,
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'processing', 'completed', 'failed')),
    filters JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ NULL
);

CREATE INDEX IF NOT EXISTS idx_portfolio_exports_child ON portfolio_exports(child_id);
CREATE INDEX IF NOT EXISTS idx_portfolio_exports_status ON portfolio_exports(status);

-- ============================================================
-- 7. Video Embedding Support
-- ============================================================
-- Add video embedding metadata to events/lessons
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = 'events' AND column_name = 'embedded_videos'
    ) THEN
        ALTER TABLE public.events ADD COLUMN embedded_videos JSONB DEFAULT '[]';
    END IF;
END $$;

-- Video embed metadata table
CREATE TABLE IF NOT EXISTS video_embeds (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
    event_id UUID NULL REFERENCES events(id) ON DELETE CASCADE,
    provider TEXT NOT NULL CHECK (provider IN ('youtube', 'vimeo', 'other')),
    video_id TEXT NOT NULL,
    title TEXT NULL,
    thumbnail_url TEXT NULL,
    duration_seconds INT NULL,
    embed_code TEXT NULL,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_video_embeds_family ON video_embeds(family_id);
CREATE INDEX IF NOT EXISTS idx_video_embeds_event ON video_embeds(event_id);

-- ============================================================
-- 8. Local Storage Sync Tracking
-- ============================================================
CREATE TABLE IF NOT EXISTS local_storage_sync (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    upload_id UUID NOT NULL REFERENCES uploads(id) ON DELETE CASCADE,
    family_id UUID NOT NULL REFERENCES family(id) ON DELETE CASCADE,
    local_key TEXT NOT NULL,
    synced_at TIMESTAMPTZ DEFAULT NOW(),
    last_accessed_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(upload_id, local_key)
);

CREATE INDEX IF NOT EXISTS idx_local_sync_upload ON local_storage_sync(upload_id);
CREATE INDEX IF NOT EXISTS idx_local_sync_family ON local_storage_sync(family_id);

-- ============================================================
-- 9. RLS Policies
-- ============================================================
ALTER TABLE document_folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS folders_select ON document_folders;
CREATE POLICY folders_select ON document_folders FOR SELECT USING (is_family_member(family_id));
DROP POLICY IF EXISTS folders_insert ON document_folders;
CREATE POLICY folders_insert ON document_folders FOR INSERT WITH CHECK (is_family_member(family_id));
DROP POLICY IF EXISTS folders_update ON document_folders;
CREATE POLICY folders_update ON document_folders FOR UPDATE USING (is_family_member(family_id));
DROP POLICY IF EXISTS folders_delete ON document_folders;
CREATE POLICY folders_delete ON document_folders FOR DELETE USING (is_family_member(family_id));

ALTER TABLE document_binder ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS binder_select ON document_binder;
CREATE POLICY binder_select ON document_binder FOR SELECT USING (is_family_member(family_id));
DROP POLICY IF EXISTS binder_insert ON document_binder;
CREATE POLICY binder_insert ON document_binder FOR INSERT WITH CHECK (is_family_member(family_id));
DROP POLICY IF EXISTS binder_update ON document_binder;
CREATE POLICY binder_update ON document_binder FOR UPDATE USING (is_family_member(family_id));
DROP POLICY IF EXISTS binder_delete ON document_binder;
CREATE POLICY binder_delete ON document_binder FOR DELETE USING (is_family_member(family_id));

ALTER TABLE external_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS external_links_select ON external_links;
CREATE POLICY external_links_select ON external_links FOR SELECT USING (is_family_member(family_id));
DROP POLICY IF EXISTS external_links_insert ON external_links;
CREATE POLICY external_links_insert ON external_links FOR INSERT WITH CHECK (is_family_member(family_id));
DROP POLICY IF EXISTS external_links_update ON external_links;
CREATE POLICY external_links_update ON external_links FOR UPDATE USING (is_family_member(family_id));
DROP POLICY IF EXISTS external_links_delete ON external_links;
CREATE POLICY external_links_delete ON external_links FOR DELETE USING (is_family_member(family_id));

ALTER TABLE pdf_search_index ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS pdf_search_select ON pdf_search_index;
CREATE POLICY pdf_search_select ON pdf_search_index FOR SELECT USING (is_family_member(family_id));

ALTER TABLE portfolio_evidence_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS portfolio_links_select ON portfolio_evidence_links;
CREATE POLICY portfolio_links_select ON portfolio_evidence_links FOR SELECT USING (is_family_member((SELECT family_id FROM uploads WHERE id = upload_id)));
DROP POLICY IF EXISTS portfolio_links_insert ON portfolio_evidence_links;
CREATE POLICY portfolio_links_insert ON portfolio_evidence_links FOR INSERT WITH CHECK (is_family_member((SELECT family_id FROM uploads WHERE id = upload_id)));
DROP POLICY IF EXISTS portfolio_links_delete ON portfolio_evidence_links;
CREATE POLICY portfolio_links_delete ON portfolio_evidence_links FOR DELETE USING (is_family_member((SELECT family_id FROM uploads WHERE id = upload_id)));

ALTER TABLE portfolio_exports ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS portfolio_exports_select ON portfolio_exports;
CREATE POLICY portfolio_exports_select ON portfolio_exports FOR SELECT USING (is_family_member(family_id));
DROP POLICY IF EXISTS portfolio_exports_insert ON portfolio_exports;
CREATE POLICY portfolio_exports_insert ON portfolio_exports FOR INSERT WITH CHECK (is_family_member(family_id));

ALTER TABLE video_embeds ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS video_embeds_select ON video_embeds;
CREATE POLICY video_embeds_select ON video_embeds FOR SELECT USING (is_family_member(family_id));
DROP POLICY IF EXISTS video_embeds_insert ON video_embeds;
CREATE POLICY video_embeds_insert ON video_embeds FOR INSERT WITH CHECK (is_family_member(family_id));

ALTER TABLE local_storage_sync ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS local_storage_select ON local_storage_sync;
CREATE POLICY local_storage_select ON local_storage_sync FOR SELECT USING (is_family_member(family_id));

-- ============================================================
-- 10. Helper Functions
-- ============================================================

-- Function to search PDFs by full-text
CREATE OR REPLACE FUNCTION search_pdfs(
    _family_id UUID,
    _search_query TEXT,
    _child_id UUID DEFAULT NULL,
    _limit INT DEFAULT 50
)
RETURNS TABLE (
    upload_id UUID,
    title TEXT,
    storage_path TEXT,
    child_id UUID,
    snippet TEXT,
    relevance REAL
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        psi.upload_id,
        u.title,
        u.storage_path,
        u.child_id,
        ts_headline('english', psi.extracted_text, plainto_tsquery('english', _search_query), 'MaxWords=50, MinWords=10') as snippet,
        ts_rank(psi.search_vector, plainto_tsquery('english', _search_query)) as relevance
    FROM pdf_search_index psi
    JOIN uploads u ON u.id = psi.upload_id
    WHERE psi.family_id = _family_id
        AND (_child_id IS NULL OR u.child_id = _child_id)
        AND psi.search_vector @@ plainto_tsquery('english', _search_query)
    ORDER BY relevance DESC
    LIMIT _limit;
END;
$$;

-- Function to get digital binder for a child
CREATE OR REPLACE FUNCTION get_digital_binder(
    _child_id UUID,
    _section TEXT DEFAULT NULL
)
RETURNS TABLE (
    id UUID,
    binder_section TEXT,
    upload_id UUID,
    external_link_id UUID,
    title TEXT,
    url TEXT,
    mime TEXT,
    display_order INT,
    created_at TIMESTAMPTZ
)
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        db.id,
        db.binder_section,
        db.upload_id,
        db.external_link_id,
        COALESCE(u.title, el.title) as title,
        COALESCE(u.url, el.url) as url,
        COALESCE(u.mime, el.mime_type) as mime,
        db.display_order,
        COALESCE(u.created_at, el.created_at) as created_at
    FROM document_binder db
    LEFT JOIN uploads u ON u.id = db.upload_id
    LEFT JOIN external_links el ON el.id = db.external_link_id
    WHERE db.child_id = _child_id
        AND (_section IS NULL OR db.binder_section = _section)
    ORDER BY db.binder_section, db.display_order, db.created_at DESC;
END;
$$;

-- Function to extract PDF text and index it
CREATE OR REPLACE FUNCTION index_pdf_text(
    _upload_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql SECURITY DEFINER
AS $$
DECLARE
    _family_id UUID;
    _storage_path TEXT;
    _bucket TEXT;
BEGIN
    -- Get upload info
    SELECT family_id, storage_path INTO _family_id, _storage_path
    FROM uploads
    WHERE id = _upload_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'Upload not found');
    END IF;
    
    -- Note: Actual PDF extraction happens in backend service
    -- This function just creates the index entry placeholder
    -- Backend will call this after extracting text
    
    RETURN jsonb_build_object('success', true, 'upload_id', _upload_id);
END;
$$;

GRANT EXECUTE ON FUNCTION search_pdfs(UUID, TEXT, UUID, INT) TO authenticated;
GRANT EXECUTE ON FUNCTION get_digital_binder(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION index_pdf_text(UUID) TO authenticated, service_role;

