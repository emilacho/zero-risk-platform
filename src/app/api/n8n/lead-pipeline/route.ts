import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { sanitizeString, isValidEmail } from '@/lib/validation'

// POST /api/n8n/lead-pipeline
// Endpoint que n8n llama para procesar un lead completo
// Flow: Recibe lead → Clasifica (Haiku) → Guarda → Retorna acciones a n8n
// n8n se encarga de: notificar Slack, enviar emails, etc.

// Simple auth check for n8n webhook calls
function validateN8nAuth(request: Request): boolean {
  const authHeader = request.headers.get('authorization')
  const n8nSecret = process.env.N8N_WEBHOOK_SECRET
  if (!n8nSecret) return true // Skip if not configured
  return authHeader === `Bearer ${n8nSecret}`
}

export async function POST(request: Request) {
  // Verify n8n authorization
  if (!validateN8nAuth(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const startTime = Date.now()

  try {
    const body = await request.json()

    // Accept leads from multiple sources (landing page, Meta Lead Ads, manual)
    const leadData = {
      name: sanitizeString(body.name, 100) || sanitizeString(body.full_name, 100) || 'Sin nombre',
      email: body.email && isValidEmail(body.email) ? body.email : null,
      phone: sanitizeString(body.phone || body.phone_number, 20),
      source: sanitizeString(body.source || body.utm_source, 50) || 'organic',
      notes: sanitizeString(body.notes || body.message || body.comments, 500),
      campaign_id: body.campaign_id || body.ad_campaign_id || null,
      company: sanitizeString(body.company || body.empresa, 200),
      city: sanitizeString(body.city || body.ciudad, 100),
      product_interest: sanitizeString(body.product_interest || body.producto, 200),
      metadata: {
        utm_medium: body.utm_medium || null,
        utm_campaign: body.utm_campaign || null,
        utm_content: body.utm_content || null,
        ad_id: body.ad_id || null,
        ad_set_id: body.ad_set_id || null,
        form_id: body.form_id || null,
        landing_page: body.landing_page || body.page_url || null,
        ip_country: body.ip_country || null,
        raw_source: body.source_platform || null,
      },
    }

    // Step 1: Classify lead using Claude Haiku
    const claudeApiKey = process.env.CLAUDE_API_KEY
    let classification = {
      classification: 'tibio' as string,
      score: 50,
      reason: 'Clasificación por defecto (Claude API no disponible)',
      suggested_action: 'Revisar manualmente',
      priority: 'medium' as string,
    }

    if (claudeApiKey) {
      try {
        const classifyResponse = await fetch('https://api.anthropic.com/v1/messages', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': claudeApiKey,
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: 'claude-haiku-4-5-20251001',
            max_tokens: 250,
            system: `Eres RUFLO, clasificador de leads de Zero Risk Ecuador (seguridad industrial: EPP, extintores, señalización, capacitaciones). Clasifica leads como "caliente" (urgencia + presupuesto), "tibio" (interesado sin urgencia), o "frio" (spam/no relevante). Responde SOLO JSON válido.`,
            messages: [{
              role: 'user',
              content: `Clasifica: ${leadData.name} | Email: ${leadData.email || 'N/A'} | Tel: ${leadData.phone || 'N/A'} | Fuente: ${leadData.source} | Empresa: ${leadData.company || 'N/A'} | Ciudad: ${leadData.city || 'N/A'} | Interés: ${leadData.product_interest || 'N/A'} | Notas: ${leadData.notes || 'N/A'}
Responde: {"classification":"caliente|tibio|frio","score":1-100,"reason":"...","suggested_action":"...","priority":"high|medium|low"}`
            }],
          }),
        })

        if (classifyResponse.ok) {
          const data = await classifyResponse.json()
          const text = data.content?.[0]?.text || ''
          const jsonMatch = text.match(/\{[\s\S]*\}/)
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0])
            if (['caliente', 'tibio', 'frio'].includes(parsed.classification)) {
              classification = parsed
            }
          }
        }
      } catch {
        // Keep default classification on error
      }
    }

    // Step 2: Save lead to Supabase
    const supabase = getSupabase()

    const leadStatus = classification.classification === 'caliente' ? 'qualified'
      : classification.classification === 'tibio' ? 'contacted'
      : 'new'

    const { data: savedLead, error: leadError } = await supabase
      .from('leads')
      .insert({
        name: leadData.name,
        email: leadData.email,
        phone: leadData.phone,
        source: leadData.source,
        status: leadStatus,
        assigned_to: classification.classification === 'caliente' ? 'xavier' : null,
        notes: leadData.notes,
        campaign_id: leadData.campaign_id,
        metadata: {
          ...leadData.metadata,
          company: leadData.company,
          city: leadData.city,
          product_interest: leadData.product_interest,
          classification: classification.classification,
          score: classification.score,
          reason: classification.reason,
          classified_at: new Date().toISOString(),
        },
      })
      .select()
      .single()

    if (leadError) {
      return NextResponse.json({ error: leadError.message }, { status: 500 })
    }

    const durationMs = Date.now() - startTime

    // Step 3: Log agent execution
    await supabase.from('agents_log').insert({
      agent_name: 'ruflo_lead_qualifier',
      action: 'n8n_lead_pipeline',
      input: { lead_name: leadData.name, source: leadData.source },
      output: { lead_id: savedLead.id, classification: classification.classification, score: classification.score },
      status: 'success',
      duration_ms: durationMs,
      cost: 0,
    })

    // Step 4: Return structured response for n8n to act on
    // n8n will use these "actions" to decide what to do next
    const actions: Array<{ type: string; channel?: string; message?: string; sequence?: string }> = []

    if (classification.classification === 'caliente') {
      actions.push({
        type: 'notify_slack',
        channel: '#zero-risk-leads',
        message: `🔥 LEAD CALIENTE: ${leadData.name} | ${leadData.company || 'Sin empresa'} | ${leadData.phone || leadData.email || 'Sin contacto'} | Score: ${classification.score}/100 | ${classification.reason}`,
      })
      actions.push({
        type: 'notify_slack_dm',
        channel: '@xavier',
        message: `Nuevo lead caliente asignado: ${leadData.name} (${leadData.company || 'empresa no especificada'}). ${classification.suggested_action}`,
      })
    }

    if (classification.classification === 'tibio') {
      actions.push({
        type: 'notify_slack',
        channel: '#zero-risk-leads',
        message: `🟡 Lead tibio: ${leadData.name} | ${leadData.source} | Score: ${classification.score}/100`,
      })
      actions.push({
        type: 'add_to_nurturing',
        sequence: 'welcome_sequence',
      })
    }

    if (classification.classification === 'frio') {
      actions.push({
        type: 'log_only',
        message: `❄️ Lead frío registrado: ${leadData.name} | ${classification.reason}`,
      })
    }

    return NextResponse.json({
      success: true,
      lead_id: savedLead.id,
      classification: classification.classification,
      score: classification.score,
      reason: classification.reason,
      priority: classification.priority,
      lead_status: leadStatus,
      assigned_to: classification.classification === 'caliente' ? 'xavier' : null,
      actions,
      duration_ms: durationMs,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}

// GET /api/n8n/lead-pipeline — health check
export async function GET() {
  return NextResponse.json({
    status: 'ok',
    endpoint: 'lead-pipeline',
    version: '1.0',
    description: 'n8n Lead Processing Pipeline — RUFLO classifier + Supabase + Slack actions',
  })
}
