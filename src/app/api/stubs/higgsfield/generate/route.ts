/**
 * POST /api/stubs/higgsfield/generate · DEPRECATED 2026-05-22
 *
 * Higgsfield OUT canon Stack V4 (decision 2026-05-22 ·
 * `zr-vault/wiki/decisions/2026-05-22-stack-canon-purge-deprecated-services-audit.md`).
 * Video AI consolidated to Veo 3.1 only · NO split logic · NO Seedance fallback.
 *
 * This stub returns 410 Gone with Deprecation + Sunset headers + Link to
 * canonical successor. Any n8n workflow still calling this URL gets a clear
 * deprecation signal · should migrate to Veo 3.1 endpoint.
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function goneResponse() {
  return NextResponse.json(
    {
      error: 'gone',
      code: 'E-HIGGSFIELD-OUT',
      detail:
        'Higgsfield OUT canon Stack V4 (decision 2026-05-22). Video AI consolidated to Veo 3.1 only.',
      successor: 'Veo 3.1 via downstream worker · invocation pattern documented in editor-en-jefe identity',
      sunset: '2026-05-22',
    },
    {
      status: 410,
      headers: {
        Deprecation: 'true',
        Sunset: 'Thu, 22 May 2026 00:00:00 GMT',
        Link: '<https://zr-vault/wiki/decisions/2026-05-22-stack-canon-purge-deprecated-services-audit>; rel="canonical"',
      },
    },
  )
}

export async function POST() {
  return goneResponse()
}

export async function GET() {
  return goneResponse()
}
