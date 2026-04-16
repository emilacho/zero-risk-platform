// Zero Risk V3 — Core Types
// Matches schema V3 (8 original + 5 agency + 8 Client Brain tables)

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

// === AGENCY TABLES (Sesión 8) ===

export interface Department {
  id: string
  name: string
  display_name: string
  description: string | null
  status: 'active' | 'planned' | 'inactive'
  created_at: string
  updated_at: string
}

export interface Agent {
  id: string
  name: string
  display_name: string
  role: 'gerente_general' | 'jefe_departamento' | 'empleado' | 'transversal'
  department_id: string | null
  reports_to: string | null
  identity_source: string
  identity_content: string
  model: 'claude-haiku' | 'claude-sonnet' | 'claude-opus'
  status: 'active' | 'inactive' | 'pending'
  created_at: string
  updated_at: string
}

export interface AgentSkill {
  id: string
  skill_name: string
  skill_source: string
  skill_content: string
  category: string | null
  version: string
  created_at: string
}

export interface AgentSkillAssignment {
  id: string
  agent_id: string
  skill_id: string
  priority: number
}

export interface AgentTool {
  id: string
  agent_id: string
  tool_name: string
  tool_type: 'managed_agent' | 'api_direct' | 'internal'
  config: Record<string, unknown>
  status: 'active' | 'pending' | 'error'
  created_at: string
}

// === CLIENT BRAIN TABLES (Pilar 2 — Sesión 15) ===

export interface Client {
  id: string
  name: string
  slug: string
  website_url: string | null
  industry: string | null
  market: string | null
  status: 'onboarding' | 'active' | 'paused' | 'churned'
  preferred_language: string
  created_at: string
  updated_at: string
}

export interface ClientBrandBook {
  id: string
  client_id: string
  version: number
  content_text: string
  mission: string | null
  vision: string | null
  values: string[] | null
  brand_personality: string[] | null
  voice_description: string | null
  tone_attributes: string[] | null
  writing_style_notes: string | null
  tagline: string | null
  key_messages: string[] | null
  elevator_pitch: string | null
  primary_colors: string[] | null
  logo_url: string | null
  typography_notes: string | null
  forbidden_words: string[]
  required_terminology: string[]
  competitor_mentions_policy: string | null
  compliance_notes: string | null
  auto_generated: boolean
  human_validated: boolean
  created_at: string
  updated_at: string
}

export interface ClientICPDocument {
  id: string
  client_id: string
  audience_segment: string
  content_text: string
  age_range: string | null
  gender: string | null
  location: string | null
  income_level: string | null
  education: string | null
  jobs_to_be_done: string[] | null
  pain_points: string[] | null
  goals: string[] | null
  preferred_channels: string[] | null
  buying_triggers: string[] | null
  objections: string[] | null
  recommended_tone: string | null
  messaging_angle: string | null
  created_at: string
  updated_at: string
}

export interface ClientVOCEntry {
  id: string
  client_id: string
  quote_text: string
  content_text: string
  source: string
  sentiment: 'positive' | 'negative' | 'neutral' | 'mixed'
  category: string | null
  themes: string[] | null
  speaker_persona: string | null
  date_collected: string | null
  times_used: number
  last_used_at: string | null
  created_at: string
  updated_at: string
}

export interface ClientCompetitor {
  id: string
  client_id: string
  competitor_name: string
  content_text: string
  website_url: string | null
  positioning_summary: string | null
  strengths: string[] | null
  weaknesses: string[] | null
  key_differentiators: string[] | null
  market_share_estimate: string | null
  pricing_model: string | null
  target_segments: string[] | null
  recent_campaigns: string | null
  ad_spend_estimate: string | null
  content_strategy_notes: string | null
  last_analyzed_at: string | null
  created_at: string
  updated_at: string
}

export type OutputStatus =
  | 'draft'
  | 'peer_reviewed'
  | 'qa_passed'
  | 'hitl_pending'
  | 'hitl_approved'
  | 'hitl_rejected'
  | 'published'
  | 'archived'

export interface ClientHistoricalOutput {
  id: string
  client_id: string
  title: string
  output_type: string
  content_text: string
  campaign_brief_id: string | null
  generated_by_agent: string | null
  workflow_run_id: string | null
  status: OutputStatus
  qa_score: number | null
  qa_feedback: string | null
  performance_metrics: Record<string, unknown> | null
  channel: string | null
  published_at: string | null
  published_url: string | null
  created_at: string
  updated_at: string
}

export interface HITLQueueItem {
  id: string
  client_id: string
  agent_name: string
  task_type: string
  output_preview: string
  status: 'pending' | 'approved' | 'rejected' | 'expired'
  priority: 'low' | 'medium' | 'high' | 'critical'
  assigned_to: string | null
  workflow_run_id: string | null
  campaign_brief_id: string | null
  step_name: string | null
  resolved_by: string | null
  resolved_at: string | null
  resolution_notes: string | null
  continuation_payload: Record<string, unknown> | null
  created_at: string
  expires_at: string | null
}

export interface AgentOutcome {
  id: string
  client_id: string
  pipeline_id: string | null
  step_index: number | null
  step_name: string | null
  agent_name: string
  task_type: string
  task_input: string | null
  output_summary: string | null
  output_id: string | null
  final_verdict: 'approved' | 'rejected' | 'edited' | 'escalated'
  human_feedback: string | null
  edited_delta: string | null
  performance_metrics: Record<string, unknown>
  cost_usd: number | null
  duration_ms: number | null
  tokens_used: number | null
  processed_by_meta_agent: boolean
  meta_agent_run_id: string | null
  created_at: string
}

// === PILAR 5: FEEDBACK LOOP (Sesión 18) ===

export interface CampaignResult {
  id: string
  client_id: string | null
  pipeline_id: string | null
  output_id: string | null
  content_type: string | null
  channel: string | null
  published_url: string | null
  published_at: string | null
  impressions: number
  clicks: number
  ctr: number
  conversions: number
  conversion_rate: number
  cost_per_click: number | null
  cost_per_conversion: number | null
  ad_spend: number
  likes: number
  shares: number
  comments: number
  saves: number
  engagement_rate: number
  open_rate: number | null
  bounce_rate: number | null
  unsubscribe_rate: number | null
  revenue_attributed: number
  roas: number | null
  raw_metrics: Record<string, unknown>
  optimization_notes: string | null
  performance_grade: 'A' | 'B' | 'C' | 'D' | 'F' | null
  collected_at: string
  collection_source: string | null
  created_at: string
  updated_at: string
}

export interface MetaAgentRun {
  id: string
  run_type: 'weekly' | 'manual' | 'triggered'
  status: 'pending' | 'running' | 'completed' | 'failed'
  outcomes_analyzed: number
  outcomes_ids: string[]
  date_range_start: string | null
  date_range_end: string | null
  patterns_detected: Record<string, unknown>[]
  improvements_proposed: number
  input_tokens: number
  output_tokens: number
  cost_usd: number
  duration_ms: number | null
  executive_summary: string | null
  started_at: string | null
  completed_at: string | null
  created_at: string
}

export interface AgentImprovementProposal {
  id: string
  meta_agent_run_id: string
  agent_name: string
  agent_id: string | null
  proposal_type: 'identity_update' | 'skill_adjustment' | 'model_change' | 'workflow_change' | 'parameter_tuning' | 'retirement'
  title: string
  rationale: string
  current_value: string | null
  proposed_value: string | null
  expected_impact: string
  pattern_id: string | null
  supporting_outcomes: string[]
  confidence_score: number | null
  status: 'pending' | 'approved' | 'rejected' | 'deferred' | 'applied'
  reviewed_by: string | null
  review_notes: string | null
  reviewed_at: string | null
  applied_at: string | null
  priority: 'low' | 'medium' | 'high' | 'critical'
  created_at: string
}
