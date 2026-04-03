// Zero Risk V2 — Core Types
// Matches schema V2 (8 tables)

export interface Campaign {
  id: string
  name: string
  type: 'meta_ads' | 'google_ads' | 'email' | 'organic' | 'whatsapp'
  status: 'draft' | 'active' | 'paused' | 'completed'
  budget: number
  spend: number
  start_date: string
  end_date: string | null
  config: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface Lead {
  id: string
  name: string
  email: string | null
  phone: string | null
  source: 'meta_ads' | 'google_ads' | 'organic' | 'referral' | 'whatsapp' | 'email'
  campaign_id: string | null
  status: 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost'
  assigned_to: 'emilio' | 'xavier'
  notes: string | null
  created_at: string
  updated_at: string
}

export interface Content {
  id: string
  type: 'ad_copy' | 'email' | 'landing_page' | 'social_post' | 'image' | 'video'
  title: string
  body: string | null
  media_url: string | null
  campaign_id: string | null
  status: 'draft' | 'approved' | 'published' | 'archived'
  generated_by: string // agent name
  created_at: string
}

export interface Website {
  id: string
  name: string
  url: string
  type: 'landing_page' | 'main_site'
  status: 'draft' | 'published' | 'archived'
  analytics: Record<string, unknown>
  created_at: string
  updated_at: string
}

export interface AgentLog {
  id: string
  agent_name: string
  action: string
  input: Record<string, unknown>
  output: Record<string, unknown>
  status: 'success' | 'error' | 'timeout'
  duration_ms: number
  cost_usd: number
  created_at: string
}

export interface Cost {
  id: string
  category: 'api_call' | 'ad_spend' | 'subscription' | 'other'
  service: string
  amount_usd: number
  campaign_id: string | null
  description: string | null
  date: string
  created_at: string
}

export interface Analytics {
  id: string
  date: string
  leads_count: number
  spend_total: number
  conversions: number
  revenue: number
  impressions: number
  clicks: number
  ctr: number
  cpl: number // cost per lead
  source_breakdown: Record<string, unknown>
  created_at: string
}

export interface Settings {
  id: string
  key: string
  value: string
  category: 'general' | 'api_keys' | 'notifications' | 'agents'
  updated_at: string
}
