/**
 * POST /api/stubs/firecrawl/scrape
 *
 * Drop-in replacement for Firecrawl's /v1/scrape during smoke tests. Returns
 * a deterministic mock markdown payload that mirrors the real API's shape
 * (`{ success, data: { markdown, html, metadata } }`).
 *
 * Wire the n8n node to hit this via:
 *   {{ $env.FIRECRAWL_API_URL || 'https://zero-risk-platform.vercel.app/api/stubs/firecrawl/scrape' }}
 */

import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  const body = await request.json().catch(() => ({}))
  const url: string = body?.url || 'https://example.com'

  const markdown = `# [stub] Smoke test landing page\n\n_URL: ${url}_\n\n**Headline:** Save 30% today\n\nLimited time offer for new customers. No credit card required.\n\n- Fast shipping\n- 30-day money-back guarantee\n- 24/7 support\n\n> "This product changed my life." — stub testimonial\n\n[Get started](https://example.com/signup)\n`

  return NextResponse.json({
    success: true,
    data: {
      markdown,
      html: `<h1>[stub] Smoke landing page</h1><p>URL: ${url}</p>`,
      metadata: {
        title: '[stub] Save 30% today',
        description: 'Limited time offer for new customers.',
        sourceURL: url,
        statusCode: 200,
      },
      landing_headline: 'Save 30% today',
      landing_body: 'Limited time offer for new customers.',
    },
    landing_headline: 'Save 30% today',
    landing_body: 'Limited time offer for new customers.',
    fallback_mode: true,
  })
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/stubs/firecrawl/scrape',
    method: 'POST',
    body: { url: 'string', formats: 'array', waitFor: 'number' },
    note: 'Drop-in stub for Firecrawl /v1/scrape. Override via env FIRECRAWL_API_URL.',
  })
}
