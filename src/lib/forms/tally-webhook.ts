/**
 * Tally webhook verify · Sprint 6 Track C3.
 *
 * Tally signs webhooks with HMAC-SHA256 using `TALLY_SIGNING_SECRET` ·
 * header `tally-signature: <hex>`. Verify via constant-time compare ·
 * reject mismatched signatures with 401.
 *
 * Per Tally docs · canonical signature scheme ·
 *   sig = HMAC_SHA256(secret, raw_body_bytes)
 *   header value · raw hex (NO `sha256=` prefix · unlike Meta)
 */
import { createHmac, timingSafeEqual } from "node:crypto"

export interface TallyVerifyInput {
  /** Raw request body string · EXACT bytes Tally sent · NO re-stringify */
  rawBody: string
  /** Value of `tally-signature` header */
  signatureHeader: string
}

export function verifyTallyWebhook(input: TallyVerifyInput): boolean {
  const secret = process.env.TALLY_SIGNING_SECRET
  if (!secret) return false
  if (!input.signatureHeader || input.signatureHeader.length === 0) return false

  // Accept both raw hex and sha256= prefix forms (Tally evolved · be lenient)
  const expectedHex = input.signatureHeader.startsWith("sha256=")
    ? input.signatureHeader.slice("sha256=".length)
    : input.signatureHeader

  if (expectedHex.length !== 64) return false

  const hmac = createHmac("sha256", secret)
  hmac.update(input.rawBody)
  const actualHex = hmac.digest("hex")

  if (actualHex.length !== expectedHex.length) return false

  try {
    return timingSafeEqual(
      Buffer.from(expectedHex, "hex"),
      Buffer.from(actualHex, "hex"),
    )
  } catch {
    return false
  }
}

/**
 * Tally webhook payload shape (canonical 2026 · subset we care about).
 * Fields beyond `fields[]` array passed through as raw to form_submissions.
 */
export interface TallyWebhookPayload {
  eventId?: string
  eventType?: string
  createdAt?: string
  formId?: string
  responseId?: string
  data?: {
    responseId?: string
    submissionId?: string
    formId?: string
    fields?: Array<{
      key?: string
      label?: string
      type?: string
      value?: string | number | boolean | string[] | null
    }>
  }
}

export interface ExtractedFields {
  name: string | null
  email: string | null
  phone: string | null
  vertical: string | null
  journey_type: string | null
  brand_book_url: string | null
  raw_field_count: number
}

/**
 * Canonical field extraction from Tally payload · maps field labels
 * (lowercased + trimmed) to our canonical field names. Tolerant of
 * label variation (e.g. "Nombre" vs "Name" vs "Tu nombre").
 */
export function extractCanonicalFields(
  payload: TallyWebhookPayload,
): ExtractedFields {
  const fields = payload.data?.fields ?? []
  const map = new Map<string, string | null>()

  for (const f of fields) {
    if (!f.label) continue
    const key = f.label.toLowerCase().trim()
    const val =
      typeof f.value === "string"
        ? f.value
        : typeof f.value === "number"
          ? String(f.value)
          : Array.isArray(f.value)
            ? f.value.join(", ")
            : null
    map.set(key, val)
  }

  const find = (...candidates: string[]): string | null => {
    for (const c of candidates) {
      const v = map.get(c.toLowerCase())
      if (v !== undefined && v !== null && v.length > 0) return v
    }
    return null
  }

  return {
    name: find("name", "nombre", "tu nombre", "full name", "nombre completo"),
    email: find("email", "correo", "email address", "tu email"),
    phone: find("phone", "telefono", "teléfono", "phone number", "wa", "whatsapp"),
    vertical: find("vertical", "industria", "industry", "rubro", "sector"),
    journey_type: find(
      "journey_type",
      "journey",
      "tipo de servicio",
      "service type",
      "what do you need",
    ),
    brand_book_url: find(
      "brand_book_url",
      "brand book",
      "brand book url",
      "url brand book",
      "drive folder",
    ),
    raw_field_count: fields.length,
  }
}
