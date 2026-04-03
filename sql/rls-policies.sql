-- Zero Risk V2 — Row Level Security Policies
-- Single-tenant: authenticated users get full access to all tables
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor → New Query)

-- ============================================
-- Step 1: Enable RLS on all tables
-- ============================================
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE content ENABLE ROW LEVEL SECURITY;
ALTER TABLE agents_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE costs ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE performance_metrics ENABLE ROW LEVEL SECURITY;

-- ============================================
-- Step 2: Policies — Authenticated users = full CRUD
-- (Single-tenant: solo Emilio y Xavier acceden)
-- ============================================

-- CAMPAIGNS
CREATE POLICY "Authenticated users can read campaigns"
  ON campaigns FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert campaigns"
  ON campaigns FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update campaigns"
  ON campaigns FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete campaigns"
  ON campaigns FOR DELETE
  TO authenticated
  USING (true);

-- LEADS
CREATE POLICY "Authenticated users can read leads"
  ON leads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert leads"
  ON leads FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update leads"
  ON leads FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete leads"
  ON leads FOR DELETE
  TO authenticated
  USING (true);

-- CONTENT
CREATE POLICY "Authenticated users can read content"
  ON content FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert content"
  ON content FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update content"
  ON content FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

CREATE POLICY "Authenticated users can delete content"
  ON content FOR DELETE
  TO authenticated
  USING (true);

-- AGENTS_LOG
CREATE POLICY "Authenticated users can read agents_log"
  ON agents_log FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert agents_log"
  ON agents_log FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- COSTS
CREATE POLICY "Authenticated users can read costs"
  ON costs FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert costs"
  ON costs FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- NOTIFICATIONS
CREATE POLICY "Authenticated users can read notifications"
  ON notifications FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert notifications"
  ON notifications FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update notifications"
  ON notifications FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- SETTINGS
CREATE POLICY "Authenticated users can read settings"
  ON settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert settings"
  ON settings FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Authenticated users can update settings"
  ON settings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- PERFORMANCE_METRICS
CREATE POLICY "Authenticated users can read performance_metrics"
  ON performance_metrics FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can insert performance_metrics"
  ON performance_metrics FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- ============================================
-- Step 3: Allow anon inserts on leads (for landing page contact form)
-- ============================================
CREATE POLICY "Anonymous users can submit leads via contact form"
  ON leads FOR INSERT
  TO anon
  WITH CHECK (true);

-- ============================================
-- Step 4: Service role bypass (for n8n webhooks)
-- Note: service_role key already bypasses RLS by default in Supabase
-- No additional policy needed for n8n webhook calls
-- ============================================
