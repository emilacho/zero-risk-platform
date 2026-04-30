import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { sanitizeString, validateRequired, isValidEmail } from '@/lib/validation'
import { requireInternalApiKey } from '@/lib/auth-middleware'

// POST /api/agents/classify-lead
// RUFLO Lead Qualifier — clasifica leads como caliente/tibio/frío
// Usa Claude Haiku para clasificación rápida y barata
// Input: { name, email?, phone?, source, notes?, campaign_id? }
// Output: { classification, score, reason, actions }

export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  const startTime = Date.now()

  try {
    const body = await request.json()

    const { valid, missing } = validateRequired(body, ['name', 'source'])
    if (!valid) {
      return NextResponse.json(
        { error: `Campos requeridos faltantes: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    const leadData = {
      name: sanitizeString(body.name, 100) || 'Sin nombre',
      email: body.email && isValidEmail(body.email) ? body.email : null,
      phone: sanitizeString(body.phone, 20),
      source: sanitizeString(body.source, 50) || 'organic',
      notes: sanitizeString(body.notes, 500),
      campaign_id: body.campaign_id || null,
      metadata: body.metadata || {},
    }

    // Call Claude Haiku for classification
    const claudeApiKey = process.env.CLAUDE_API_KEY
    if (!claudeApiKey) {
      return NextResponse.json(
        { error: 'CLAUDE_API_KEY no configurada' },
        { status: 500 }
      )
    }

    const systemPrompt = `Eres RUFLO, el clasificador de leads de Zero Risk Ecuador (seguridad industrial).
Tu trabajo es clasificar leads entrantes en 3 categorías:

- "caliente": Empresa que necesita EPP/seguridad YA, tiene presupuesto, contacto directo, o pidió cotización
- "tibio": Interesado pero sin urgencia clara, necesita nurturing (más info, seguimiento)
- "frío": Curiosos, spam, info incompleta, no es empresa, o no es Ecuador

Responde SOLO en JSON válido, sin markdown:`

    const userPrompt = `Clasifica este lead:

NOMBRE: ${leadData.name}
EMAIL: ${leadData.email || 'No proporcionado'}
TELÉFONO: ${leadData.phone || 'No proporcionado'}
FUENTE: ${leadData.source}
NOTAS: ${leadData.notes || 'Ninguna'}
METADATA: ${JSON.stringify(leadData.metadata)}

Responde en este formato JSON exacto:
{
  "classification": "caliente" | "tibio" | "frio",
  "score": 1-100,
  "reason": "explicación breve en español",
  "suggested_action": "acción recomendada",
  "priority": "high" | "medium" | "low"
}`

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    })

    if (!claudeResponse.ok) {
      const errData = await claudeResponse.json()
      return NextResponse.json(
        { error: `Claude API error: ${errData.error?.message || 'Unknown'}` },
        { status: 502 }
      )
    }

    const claudeData = await claudeResponse.json()
    const responseText = claudeData.content?.[0]?.text || ''

    // Parse classification
    let classification = { classification: 'frio', score: 10, reason: 'Error al clasificar', suggested_action: 'Revisar manualmente', priority: 'low' }
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        classification = JSON.parse(jsonMatch[0])
      }
    } catch {
      // Keep default classification on parse error
    }

    // Normalize classification value
    const validClassifications = ['caliente', 'tibio', 'frio']
    if (!validClassifications.includes(classification.classification)) {
      classification.classification = 'frio'
    }

    // Save lead to Supabase with classification
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
          classification: classification.classification,
          score: classification.score,
          reason: classification.reason,
          classified_at: new Date().toISOString(),
          classified_by: 'ruflo_lead_qualifier',
        },
      })
      .select()
      .single()

    if (leadError) {
      return NextResponse.json({ error: leadError.message }, { status: 500 })
    }

    const durationMs = Date.now() - startTime

    // Log agent execution
    await supabase.from('agents_log').insert({
      agent_name: 'ruflo_lead_qualifier',
      action: 'classify_lead',
      input: { lead_name: leadData.name, source: leadData.source },
      output: classification,
      status: 'success',
      duration_ms: durationMs,
      tokens_used: (claudeData.usage?.input_tokens || 0) + (claudeData.usage?.output_tokens || 0),
      cost: 0,
    })

    return NextResponse.json({
      success: true,
      lead_id: savedLead.id,
      classification: classification.classification,
      score: classification.score,
      reason: classification.reason,
      suggested_action: classification.suggested_action,
      priority: classification.priority,
      lead_status: leadStatus,
      assigned_to: classification.classification === 'caliente' ? 'xavier' : null,
      duration_ms: durationMs,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
