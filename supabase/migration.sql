-- ═══════════════════════════════════════════════════════════
-- eMenu Smart Tags — Supabase Migration
-- Table: analysis_history
-- Stores prediction history for cross-device sync
-- ═══════════════════════════════════════════════════════════

-- 1. Create the table
CREATE TABLE IF NOT EXISTS analysis_history (
  id          TEXT PRIMARY KEY,
  tenant_id   TEXT NOT NULL DEFAULT 'restaurant_001',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  source      TEXT NOT NULL CHECK (source IN ('analyze', 'tables')),
  input       JSONB NOT NULL,
  prediction  JSONB NOT NULL
);

-- 2. Enable Row Level Security
ALTER TABLE analysis_history ENABLE ROW LEVEL SECURITY;

-- 3. RLS Policies — open for anon key (tighten with auth later)
--    This allows the frontend to read/write using the anon key.
--    In production with authentication, replace these with user-scoped policies.
CREATE POLICY "Allow select for all"
  ON analysis_history FOR SELECT
  USING (true);

CREATE POLICY "Allow insert for all"
  ON analysis_history FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Allow delete for all"
  ON analysis_history FOR DELETE
  USING (true);

-- 4. Indexes for performance
CREATE INDEX IF NOT EXISTS idx_history_tenant
  ON analysis_history (tenant_id);

CREATE INDEX IF NOT EXISTS idx_history_created
  ON analysis_history (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_history_source
  ON analysis_history (source);

-- ═══════════════════════════════════════════════════════════
-- HOW TO USE:
-- 1. Go to https://supabase.com and create a free project
-- 2. Open SQL Editor in the Supabase dashboard
-- 3. Paste and run this entire file
-- 4. Copy your Project URL and anon key from Project Settings > API
-- 5. Add to your .env:
--      VITE_SUPABASE_URL=https://your-project.supabase.co
--      VITE_SUPABASE_ANON_KEY=eyJhbGciOi...
-- ═══════════════════════════════════════════════════════════
