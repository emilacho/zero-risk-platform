// Zero Risk V2 — Input Validation Helpers
// Lightweight validation for API endpoints (no external deps)

// UUID v4 format check
export function isValidUUID(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)
}

// Basic email format check
export function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

// Sanitize string input (trim + length limit)
export function sanitizeString(input: unknown, maxLength = 500): string | null {
  if (typeof input !== 'string') return null
  const trimmed = input.trim()
  if (trimmed.length === 0) return null
  return trimmed.slice(0, maxLength)
}

// Validate required fields in an object
export function validateRequired(
  body: Record<string, unknown>,
  fields: string[]
): { valid: boolean; missing: string[] } {
  const missing = fields.filter(
    (f) => body[f] === undefined || body[f] === null || body[f] === ''
  )
  return { valid: missing.length === 0, missing }
}

// Allowed fields filter — prevents mass assignment
export function pickFields<T extends Record<string, unknown>>(
  body: T,
  allowed: string[]
): Partial<T> {
  const result: Record<string, unknown> = {}
  for (const key of allowed) {
    if (key in body) {
      result[key] = body[key]
    }
  }
  return result as Partial<T>
}

// Campaign allowed fields for update
export const CAMPAIGN_FIELDS = [
  'name', 'type', 'status', 'budget', 'spend',
  'platform', 'start_date', 'end_date', 'config',
] as const

// Lead allowed fields for update
export const LEAD_FIELDS = [
  'name', 'email', 'phone', 'source', 'status',
  'assigned_to', 'notes', 'metadata',
] as const

// Content allowed fields for update
export const CONTENT_FIELDS = [
  'title', 'body', 'type', 'status', 'platform',
  'campaign_id', 'generated_by', 'metadata',
] as const
