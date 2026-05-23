/**
 * tally-webhook · HMAC verify + field extraction unit tests · Sprint 6 Track C3.
 */
import { describe, expect, it, beforeEach, afterEach } from "vitest"
import { createHmac } from "node:crypto"
import {
  verifyTallyWebhook,
  extractCanonicalFields,
} from "../tally-webhook"

const SECRET = "test-tally-secret-32-bytes-padded-xxxxx"

function signRaw(body: string, secret = SECRET): string {
  return createHmac("sha256", secret).update(body).digest("hex")
}

describe("verifyTallyWebhook", () => {
  let originalSecret: string | undefined
  beforeEach(() => {
    originalSecret = process.env.TALLY_SIGNING_SECRET
    process.env.TALLY_SIGNING_SECRET = SECRET
  })
  afterEach(() => {
    if (originalSecret === undefined) delete process.env.TALLY_SIGNING_SECRET
    else process.env.TALLY_SIGNING_SECRET = originalSecret
  })

  it("returns true for valid raw hex signature", () => {
    const body = JSON.stringify({ formId: "f1", data: { fields: [] } })
    const sig = signRaw(body)
    expect(verifyTallyWebhook({ rawBody: body, signatureHeader: sig })).toBe(true)
  })

  it("returns true for sha256= prefix variant", () => {
    const body = JSON.stringify({ ok: 1 })
    const sig = signRaw(body)
    expect(
      verifyTallyWebhook({ rawBody: body, signatureHeader: `sha256=${sig}` }),
    ).toBe(true)
  })

  it("returns false for tampered body", () => {
    const body = JSON.stringify({ formId: "f1" })
    const sig = signRaw(body)
    const tampered = JSON.stringify({ formId: "f1", evil: true })
    expect(
      verifyTallyWebhook({ rawBody: tampered, signatureHeader: sig }),
    ).toBe(false)
  })

  it("returns false for wrong secret", () => {
    const body = JSON.stringify({ x: 1 })
    const wrongSig = signRaw(body, "another-secret-not-set")
    expect(
      verifyTallyWebhook({ rawBody: body, signatureHeader: wrongSig }),
    ).toBe(false)
  })

  it("returns false when env unset", () => {
    delete process.env.TALLY_SIGNING_SECRET
    const body = JSON.stringify({ x: 1 })
    const sig = signRaw(body)
    expect(verifyTallyWebhook({ rawBody: body, signatureHeader: sig })).toBe(false)
  })

  it("returns false for empty signature header", () => {
    expect(
      verifyTallyWebhook({ rawBody: "{}", signatureHeader: "" }),
    ).toBe(false)
  })

  it("returns false for malformed hex (wrong length)", () => {
    expect(
      verifyTallyWebhook({ rawBody: "{}", signatureHeader: "abc123" }),
    ).toBe(false)
  })
})

describe("extractCanonicalFields", () => {
  it("extracts all canonical fields from Spanish labels", () => {
    const result = extractCanonicalFields({
      data: {
        fields: [
          { label: "Nombre", value: "Emilio" },
          { label: "Email", value: "e@test.com" },
          { label: "Teléfono", value: "+593987654321" },
          { label: "Industria", value: "industrial-safety" },
          { label: "Tipo de servicio", value: "onboarding-completo" },
          { label: "Brand book URL", value: "https://drive.google.com/abc" },
        ],
      },
    })
    expect(result).toEqual({
      name: "Emilio",
      email: "e@test.com",
      phone: "+593987654321",
      vertical: "industrial-safety",
      journey_type: "onboarding-completo",
      brand_book_url: "https://drive.google.com/abc",
      raw_field_count: expect.any(Number),
    })
  })

  it("extracts from English labels (case-insensitive)", () => {
    const result = extractCanonicalFields({
      data: {
        fields: [
          { label: "NAME", value: "Bob" },
          { label: "email", value: "b@x.com" },
          { label: "Phone Number", value: "+15551234567" },
        ],
      },
    })
    expect(result.name).toBe("Bob")
    expect(result.email).toBe("b@x.com")
    expect(result.phone).toBe("+15551234567")
  })

  it("returns nulls when fields missing", () => {
    const result = extractCanonicalFields({ data: { fields: [] } })
    expect(result.name).toBeNull()
    expect(result.email).toBeNull()
    expect(result.phone).toBeNull()
  })

  it("handles array values (multi-select)", () => {
    const result = extractCanonicalFields({
      data: {
        fields: [{ label: "Vertical", value: ["b2b-saas", "restaurant"] }],
      },
    })
    expect(result.vertical).toBe("b2b-saas, restaurant")
  })

  it("handles numeric values", () => {
    const result = extractCanonicalFields({
      data: {
        fields: [{ label: "Phone", value: 1234567890 }],
      },
    })
    expect(result.phone).toBe("1234567890")
  })

  it("ignores fields without label", () => {
    const result = extractCanonicalFields({
      data: {
        fields: [
          { value: "no-label" },
          { label: "Email", value: "x@y.com" },
        ],
      },
    })
    expect(result.email).toBe("x@y.com")
  })
})
