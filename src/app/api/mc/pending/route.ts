import { NextResponse } from 'next/server'
import { getSupabaseAdmin } from '@/lib/supabase'

const MASTER = process.env.MC_MASTER_PASSWORD || 'zerorisk2026'

export async function GET(req: Request) {
  const url = new URL(req.url)
  const password = url.searchParams.get('masterPassword')

  if (password !== MASTER) {
    return new NextResponse('Forbidden', { status: 403 })
  }

  const supabase = getSupabaseAdmin()
  const { data: items, error } = await supabase
    .from('hitl_pending_approvals')
    .select('item_id, agent_slug, preview, full_content, editor_verdict, revisions_attempted, client_id, approval_type, expires_at, created_at, status')
    .eq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(50)

  if (error) {
    return new NextResponse(
      `<!DOCTYPE html><html><body><h1>Error</h1><pre>${escapeHtml(error.message)}</pre></body></html>`,
      { status: 500, headers: { 'Content-Type': 'text/html; charset=utf-8' } }
    )
  }

  const encodedPassword = encodeURIComponent(password)

  const rows = (items || []).map(item => {
    const verdict = (item.editor_verdict as Record<string, unknown>) || {}
    const issues = Array.isArray(verdict.issues) ? (verdict.issues as string[]) : []
    const feedback = typeof verdict.feedback === 'string' ? verdict.feedback : ''
    const severity = typeof verdict.severity === 'string' ? verdict.severity : 'low'
    const reviewers = verdict.reviewers as Record<string, { status: string; severity: string }> | undefined
    const disagreement = typeof verdict.disagreement === 'boolean' ? verdict.disagreement : false
    const disagreementReason = typeof verdict.disagreement_reason === 'string' ? verdict.disagreement_reason : ''
    const approvalType = item.approval_type || 'editor_escalation'

    const reviewerRows = reviewers
      ? `<p style="font-size:12px;color:#555;margin:4px 0">
          Editor: <strong>${reviewers.editor?.status || '-'}</strong> (${reviewers.editor?.severity || '-'}) ·
          Brand Strategist: <strong>${reviewers.brand_strategist?.status || '-'}</strong> (${reviewers.brand_strategist?.severity || '-'})
        </p>`
      : ''

    const disagreementBadge = disagreement
      ? `<span style="background:#fff0b3;color:#7a5a00;padding:2px 8px;border-radius:4px;font-size:11px;font-weight:600;margin-left:6px">⚡ DISAGREEMENT</span>`
      : ''

    return `
<article style="border:1px solid #ddd;padding:1rem;margin-bottom:1rem;border-radius:8px;background:#fafaf7">
  <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
    <div>
      <strong style="font-size:15px">${escapeHtml(item.agent_slug || 'unknown')}</strong>
      ${disagreementBadge}
    </div>
    <div>
      <span style="font-size:11px;background:#fee;color:#a32d2d;padding:2px 8px;border-radius:4px">${escapeHtml(severity)}</span>
      <span style="font-size:11px;background:#eef;color:#335;padding:2px 8px;border-radius:4px;margin-left:4px">${escapeHtml(approvalType)}</span>
    </div>
  </div>
  <p style="font-size:12px;color:#666;margin:3px 0">Cliente: ${escapeHtml(item.client_id || '-')} · Revisiones: ${item.revisions_attempted ?? 0} · Creado: ${new Date(item.created_at).toLocaleString('es-EC')}</p>
  ${reviewerRows}
  ${disagreement && disagreementReason ? `<p style="font-size:12px;color:#7a5a00;background:#fff9e6;padding:6px 8px;border-radius:4px;margin:6px 0">${escapeHtml(disagreementReason)}</p>` : ''}
  <details style="margin:8px 0">
    <summary style="cursor:pointer;font-size:13px;color:#185fa5">Editor feedback (${issues.length} issues)</summary>
    <p style="font-size:12px;color:#444;margin:8px 0;white-space:pre-wrap">${escapeHtml(feedback)}</p>
    <ul style="font-size:12px;color:#444;margin:4px 0">
      ${issues.map(x => `<li>${escapeHtml(x)}</li>`).join('')}
    </ul>
  </details>
  <details style="margin:8px 0">
    <summary style="cursor:pointer;font-size:13px;color:#185fa5">Contenido (preview)</summary>
    <pre style="background:#f5f5f5;padding:8px;overflow:auto;max-height:200px;font-size:12px;border-radius:4px;margin:6px 0;white-space:pre-wrap">${escapeHtml(item.preview || '')}</pre>
  </details>
  <p style="font-size:11px;color:#888;margin:4px 0">Expira: ${new Date(item.expires_at).toLocaleString('es-EC')}</p>
  <p style="margin-top:12px;display:flex;gap:8px">
    <a href="/api/mc/quick-approve?item_id=${encodeURIComponent(item.item_id)}&decision=approved&masterPassword=${encodedPassword}"
       style="background:#0f6e56;color:white;padding:8px 16px;text-decoration:none;border-radius:4px;font-size:13px">✓ Aprobar</a>
    <a href="/api/mc/quick-approve?item_id=${encodeURIComponent(item.item_id)}&decision=rejected&masterPassword=${encodedPassword}"
       style="background:#a32d2d;color:white;padding:8px 16px;text-decoration:none;border-radius:4px;font-size:13px">✗ Rechazar</a>
  </p>
</article>`
  }).join('')

  const html = `<!DOCTYPE html><html><head>
<title>HITL Pendientes — Zero Risk</title>
<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body{font-family:system-ui,sans-serif;padding:1rem;max-width:800px;margin:0 auto;background:#fff;color:#222}
  h1{font-size:20px;margin-bottom:1rem}
  .meta{font-size:13px;color:#666;margin-bottom:1rem}
</style>
</head><body>
<h1>Approvals Pendientes (${items?.length || 0})</h1>
<p class="meta">Actualizado: ${new Date().toLocaleString('es-EC')}</p>
${rows || '<p style="color:#888;text-align:center;padding:2rem">No hay items pendientes.</p>'}
</body></html>`

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  })
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
