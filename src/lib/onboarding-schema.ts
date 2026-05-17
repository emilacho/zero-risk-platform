/**
 * Onboarding wizard schema · canonical TypeScript types + validation helpers.
 *
 * No external validation lib (per dispatch · "NO new libs"). Uses TypeScript
 * type guards and small pure functions so client + server share the contract.
 */

export interface Step1ClientInfo {
  client_name: string
  slug: string
  industry: string
  website_url: string
  instagram_handle: string
}

export interface Step2BrandDiscovery {
  logo_url: string | null
  primary_color: string
  accent_color: string
  voice_tone: 'professional' | 'casual' | 'playful' | 'authoritative' | 'warm' | 'edgy'
  target_audience: string
  brand_keywords: string[]
}

export interface Step3UploadedAsset {
  name: string
  size: number
  type: string
  storage_path: string
  public_url: string
  uploaded_at: string
}

export interface Step3UploadAssets {
  assets: Step3UploadedAsset[]
}

export interface Step4CascadeTrigger {
  workflow_id: string
  webhook_url: string
  triggered_at: string | null
  execution_id: string | null
  status: 'idle' | 'triggered' | 'running' | 'success' | 'error'
  progress_message: string | null
}

export interface Step5CascadeOutputs {
  landing_preview_url: string | null
  brand_book_pdf_url: string | null
  social_storyboards: Array<{ platform: string; url: string }>
  agent_outputs: Record<string, unknown>
  reviewed: boolean
  approved: boolean
  iteration_notes: string
}

export interface OnboardingWizardState {
  current_step: 1 | 2 | 3 | 4 | 5
  step1: Step1ClientInfo
  step2: Step2BrandDiscovery
  step3: Step3UploadAssets
  step4: Step4CascadeTrigger
  step5: Step5CascadeOutputs
  onboarding_session_id: string | null
}

// ─────────────────────────────────────────────────────────
// VALIDATION HELPERS · pure functions · shared client+server
// ─────────────────────────────────────────────────────────

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/
const HEX_PATTERN = /^#[0-9A-Fa-f]{6}$/
const URL_PATTERN = /^https?:\/\/[^\s]+$/
const INSTAGRAM_PATTERN = /^@?[a-zA-Z0-9._]{1,30}$/

export interface ValidationResult {
  ok: boolean
  errors: Record<string, string>
}

export function validateStep1(data: Step1ClientInfo): ValidationResult {
  const errors: Record<string, string> = {}
  if (!data.client_name?.trim()) errors.client_name = 'Nombre del cliente requerido'
  if (!data.slug?.trim()) errors.slug = 'Slug requerido'
  else if (!SLUG_PATTERN.test(data.slug)) errors.slug = 'Slug debe ser kebab-case · solo letras minúsculas · números · guiones'
  if (!data.industry?.trim()) errors.industry = 'Industria requerida'
  if (!data.website_url?.trim()) errors.website_url = 'Website URL requerida'
  else if (!URL_PATTERN.test(data.website_url)) errors.website_url = 'URL debe empezar con http:// o https://'
  if (data.instagram_handle && !INSTAGRAM_PATTERN.test(data.instagram_handle))
    errors.instagram_handle = 'Handle Instagram inválido · 1-30 caracteres · letras/números/puntos/guión bajo'
  return { ok: Object.keys(errors).length === 0, errors }
}

export function validateStep2(data: Step2BrandDiscovery): ValidationResult {
  const errors: Record<string, string> = {}
  if (!HEX_PATTERN.test(data.primary_color)) errors.primary_color = 'Color primario debe ser hex válido · ej #3D2466'
  if (!HEX_PATTERN.test(data.accent_color)) errors.accent_color = 'Color accent debe ser hex válido · ej #4DD4D8'
  if (!data.voice_tone) errors.voice_tone = 'Tono de voz requerido'
  if (!data.target_audience?.trim() || data.target_audience.trim().length < 10)
    errors.target_audience = 'Describe la audiencia objetivo · mínimo 10 caracteres'
  return { ok: Object.keys(errors).length === 0, errors }
}

export function validateStep3(data: Step3UploadAssets): ValidationResult {
  const errors: Record<string, string> = {}
  if (!data.assets || data.assets.length === 0)
    errors.assets = 'Sube al menos 1 archivo (logo · fotos · brand book · etc)'
  return { ok: Object.keys(errors).length === 0, errors }
}

export function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export const VOICE_TONE_OPTIONS: Array<{ value: Step2BrandDiscovery['voice_tone']; label: string; description: string }> = [
  { value: 'professional', label: 'Profesional', description: 'Formal · técnico · autoridad institucional' },
  { value: 'casual', label: 'Casual', description: 'Conversacional · cercano · accesible' },
  { value: 'playful', label: 'Playful', description: 'Divertido · juguetón · humor sutil' },
  { value: 'authoritative', label: 'Autoritario', description: 'Experto · directo · alta confianza' },
  { value: 'warm', label: 'Cálido', description: 'Empático · humano · cuidadoso' },
  { value: 'edgy', label: 'Edgy', description: 'Atrevido · provocador · disruptivo' },
]

export const INITIAL_WIZARD_STATE: OnboardingWizardState = {
  current_step: 1,
  step1: { client_name: '', slug: '', industry: '', website_url: '', instagram_handle: '' },
  step2: {
    logo_url: null,
    primary_color: '#3D2466',
    accent_color: '#4DD4D8',
    voice_tone: 'professional',
    target_audience: '',
    brand_keywords: [],
  },
  step3: { assets: [] },
  step4: {
    workflow_id: 'cliente-nuevo-landing',
    webhook_url: '/api/onboarding/trigger-cascade',
    triggered_at: null,
    execution_id: null,
    status: 'idle',
    progress_message: null,
  },
  step5: {
    landing_preview_url: null,
    brand_book_pdf_url: null,
    social_storyboards: [],
    agent_outputs: {},
    reviewed: false,
    approved: false,
    iteration_notes: '',
  },
  onboarding_session_id: null,
}
