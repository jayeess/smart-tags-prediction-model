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
-- eMenu Smart Tags — Feedback Loop Table
-- Stores ground-truth outcomes for model accuracy monitoring
-- ═══════════════════════════════════════════════════════════

-- 5. Feedback table for closing the prediction loop
CREATE TABLE IF NOT EXISTS prediction_feedback (
  id            TEXT PRIMARY KEY,
  record_id     TEXT NOT NULL,
  tenant_id     TEXT NOT NULL DEFAULT 'restaurant_001',
  guest_name    TEXT NOT NULL DEFAULT '',
  outcome       TEXT NOT NULL CHECK (outcome IN ('showed_up', 'no_show', 'cancelled')),
  predicted_risk FLOAT NOT NULL DEFAULT 0.0,
  predicted_label TEXT NOT NULL DEFAULT '',
  drift         FLOAT NOT NULL DEFAULT 0.0,
  notes         TEXT DEFAULT '',
  submitted_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  -- Link back to the prediction record
  CONSTRAINT fk_record FOREIGN KEY (record_id) REFERENCES analysis_history(id) ON DELETE CASCADE
);

-- 6. Enable RLS on feedback
ALTER TABLE prediction_feedback ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow select feedback for all"
  ON prediction_feedback FOR SELECT
  USING (true);

CREATE POLICY "Allow insert feedback for all"
  ON prediction_feedback FOR INSERT
  WITH CHECK (true);

-- 7. Indexes for feedback queries
CREATE INDEX IF NOT EXISTS idx_feedback_tenant
  ON prediction_feedback (tenant_id);

CREATE INDEX IF NOT EXISTS idx_feedback_record
  ON prediction_feedback (record_id);

CREATE INDEX IF NOT EXISTS idx_feedback_outcome
  ON prediction_feedback (outcome);

CREATE INDEX IF NOT EXISTS idx_feedback_submitted
  ON prediction_feedback (submitted_at DESC);

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
