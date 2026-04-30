import { NextResponse } from 'next/server'
import { requireInternalApiKey } from '@/lib/auth-middleware'

const MASTER = process.env.MC_MASTER_PASSWORD || 'zerorisk2026'

export async function GET(req: Request) {
  const auth = await requireInternalApiKey(req)
  if (!auth.ok) return auth.response

  return handle(req)
}

export async function POST(req: Request) {
  const auth = await requireInternalApiKey(req)
  if (!auth.ok) return auth.response

  return handle(req)
}

async function handle(req: Request) {
  const url = new URL(req.url)
  const itemId = url.searchParams.get('item_id')
  const decision = url.searchParams.get('decision')
  const notes = url.searchParams.get('notes') || ''
  const password = url.searchParams.get('masterPassword')

  if (password !== MASTER) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  if (!itemId || !decision || !['approved', 'rejected'].includes(decision)) {
    return new NextResponse('Missing item_id or invalid decision', { status: 400 })
  }

  const baseUrl = url.origin
  const apiKey = process.env.INTERNAL_API_KEY || process.env.CLAUDE_API_KEY || ''
  const result = await fetch(`${baseUrl}/api/hitl/submit-approval`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
    },
    body: JSON.stringify({ item_id: itemId, decision, notes }),
  })

  const ok = result.ok
  const html = `<!DOCTYPE html><html><head><title>${decision === 'approved' ? 'Aprobado' : 'Rechazado'} — Zero Risk</title>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{font-family:system-ui,sans-serif;padding:2rem;max-width:480px;margin:0 auto;color:#222;line-height:1.5}
  h1{font-size:22px;margin-bottom:8px}
  .ok{color:#0f6e56}.err{color:#a32d2d}
  code{background:#f5f5f5;padding:2px 6px;border-radius:3px;font-size:13px}
  a{color:#185fa5;text-decoration:none;font-size:14px}
  a:hover{text-decoration:underline}
  .meta{font-size:13px;color:#666;margin:6px 0}
</style>
</head><body>
<h1 class="${ok ? 'ok' : 'err'}">${ok ? (decision === 'approved' ? '✓ Aprobado' : '✗ Rechazado') : '⚠ Error'}</h1>
<p class="meta">Item: <code>${itemId}</code></p>
<p class="meta">Decisión: <strong>${decision}</strong></p>
${notes ? `<p class="meta">Notas: ${escapeHtml(notes)}</p>` : ''}
<p class="meta">Status: ${ok ? 'Guardado correctamente' : 'Falló — revisar logs'}</p>
<p style="margin-top:1.5rem"><a href="/api/mc/pending?masterPassword=${encodeURIComponent(password)}">← Ver pendientes</a></p>
</body></html>`

  return new NextResponse(html, {
    status: ok ? 200 : 500,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
