-- Zero Risk V2 — Schema (8 tables)
-- Single-tenant: No RLS, no organizations, no billing
-- Apply via Supabase SQL Editor

-- 1. Settings
CREATE TABLE IF NOT EXISTS settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  key TEXT NOT NULL UNIQUE,
  value TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('general', 'api_keys', 'notifications', 'agents')),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Campaigns
CREATE TABLE IF NOT EXISTS campaigns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('meta_ads', 'google_ads', 'email', 'organic', 'whatsapp')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'active', 'paused', 'completed')),
  budget DECIMAL(10,2) DEFAULT 0,
  spend DECIMAL(10,2) DEFAULT 0,
  start_date DATE,
  end_date DATE,
  config JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Leads
CREATE TABLE IF NOT EXISTS leads (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  email TEXT,
  phone TEXT,
  source TEXT NOT NULL CHECK (source IN ('meta_ads', 'google_ads', 'organic', 'referral', 'whatsapp', 'email')),
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'new' CHECK (status IN ('new', 'contacted', 'qualified', 'proposal', 'won', 'lost')),
  assigned_to TEXT NOT NULL DEFAULT 'xavier' CHECK (assigned_to IN ('emilio', 'xavier')),
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 4. Content
CREATE TABLE IF NOT EXISTS content (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  type TEXT NOT NULL CHECK (type IN ('ad_copy', 'email', 'landing_page', 'social_post', 'image', 'video')),
  title TEXT NOT NULL,
  body TEXT,
  media_url TEXT,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'published', 'archived')),
  generated_by TEXT NOT NULL DEFAULT 'manual',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Websites
CREATE TABLE IF NOT EXISTS websites (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  url TEXT NOT NULL,
  type TEXT NOT NULL DEFAULT 'landing_page' CHECK (type IN ('landing_page', 'main_site')),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  analytics JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 6. Agents Log
CREATE TABLE IF NOT EXISTS agents_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  agent_name TEXT NOT NULL,
  action TEXT NOT NULL,
  input JSONB DEFAULT '{}',
  output JSONB DEFAULT '{}',
  status TEXT NOT NULL CHECK (status IN ('success', 'error', 'timeout')),
  duration_ms INTEGER DEFAULT 0,
  cost_usd DECIMAL(8,4) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 7. Costs
CREATE TABLE IF NOT EXISTS costs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  category TEXT NOT NULL CHECK (category IN ('api_call', 'ad_spend', 'subscription', 'other')),
  service TEXT NOT NULL,
  amount_usd DECIMAL(10,2) NOT NULL,
  campaign_id UUID REFERENCES campaigns(id) ON DELETE SET NULL,
  description TEXT,
  date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 8. Analytics (daily aggregates)
CREATE TABLE IF NOT EXISTS analytics (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  date DATE NOT NULL UNIQUE,
  leads_count INTEGER DEFAULT 0,
  spend_total DECIMAL(10,2) DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  revenue DECIMAL(10,2) DEFAULT 0,
  impressions INTEGER DEFAULT 0,
  clicks INTEGER DEFAULT 0,
  ctr DECIMAL(5,2) DEFAULT 0,
  cpl DECIMAL(10,2) DEFAULT 0,
  source_breakdown JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
CREATE INDEX IF NOT EXISTS idx_leads_source ON leads(source);
CREATE INDEX IF NOT EXISTS idx_leads_campaign ON leads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);
CREATE INDEX IF NOT EXISTS idx_content_campaign ON content(campaign_id);
CREATE INDEX IF NOT EXISTS idx_agents_log_agent ON agents_log(agent_name);
CREATE INDEX IF NOT EXISTS idx_agents_log_created ON agents_log(created_at);
CREATE INDEX IF NOT EXISTS idx_costs_date ON costs(date);
CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics(date);
