import { NextResponse } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { sanitizeString, validateRequired } from '@/lib/validation'
import { requireInternalApiKey } from '@/lib/auth-middleware'

// POST /api/agents/generate-content
// Triggers the Content Creator agent via Claude API
// Input: { campaign_id?, product, audience, tone, channels }
// Output: Generated content variants saved to Supabase

export async function POST(request: Request) {
  const auth = await requireInternalApiKey(request)
  if (!auth.ok) return auth.response

  try {
    const body = await request.json()

    const { valid, missing } = validateRequired(body, ['product', 'audience'])
    if (!valid) {
      return NextResponse.json(
        { error: `Campos requeridos faltantes: ${missing.join(', ')}` },
        { status: 400 }
      )
    }

    const product = sanitizeString(body.product, 200)
    const audience = sanitizeString(body.audience, 200)
    const tone = sanitizeString(body.tone, 100) || 'profesional y confiable'
    const channels = body.channels || ['meta_ads', 'instagram', 'email']
    const campaignId = body.campaign_id || null

    // Build the prompt for Claude API
    const systemPrompt = `Eres el Content Creator de Zero Risk, una empresa de seguridad industrial en Ecuador.
Tu trabajo es generar copy de marketing para campañas publicitarias.
Genera contenido en español, profesional pero accesible.
Zero Risk vende: EPP (equipos de protección personal), extintores, señalización industrial,
capacitaciones de seguridad, auditorías de riesgo, y kits de emergencia.
Siempre incluye un CTA (call to action) claro.`

    const userPrompt = `Genera 3 variantes de copy para esta campaña:

PRODUCTO: ${product}
AUDIENCIA: ${audience}
TONO: ${tone}
CANALES: ${channels.join(', ')}

Para cada variante incluye:
1. Título/Headline (máx 60 caracteres)
2. Cuerpo del mensaje (máx 150 palabras)
3. CTA (call to action)
4. Hashtags relevantes (5-8)

Responde en JSON con este formato:
{
  "variants": [
    {
      "headline": "...",
      "body": "...",
      "cta": "...",
      "hashtags": ["...", "..."]
    }
  ]
}`

    // Call Claude API
    const claudeApiKey = process.env.CLAUDE_API_KEY
    if (!claudeApiKey) {
      return NextResponse.json(
        { error: 'CLAUDE_API_KEY no configurada' },
        { status: 500 }
      )
    }

    const claudeResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
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
    const generatedText = claudeData.content?.[0]?.text || ''

    // Try to parse the JSON response from Claude
    let variants = []
    try {
      const jsonMatch = generatedText.match(/\{[\s\S]*\}/)
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0])
        variants = parsed.variants || []
      }
    } catch {
      // If JSON parsing fails, save raw text
      variants = [{ headline: 'Raw output', body: generatedText, cta: '', hashtags: [] }]
    }

    // Save each variant to Supabase
    const supabase = getSupabase()
    const savedContent = []

    for (const variant of variants) {
      const { data, error } = await supabase
        .from('content')
        .insert({
          title: variant.headline,
          body: JSON.stringify(variant),
          type: 'ad_copy',
          status: 'draft',
          platform: channels[0] || 'meta_ads',
          campaign_id: campaignId,
          generated_by: 'content_creator_agent',
          metadata: {
            product,
            audience,
            tone,
            channels,
            cta: variant.cta,
            hashtags: variant.hashtags,
          },
        })
        .select()
        .single()

      if (!error && data) savedContent.push(data)
    }

    // Log the agent execution
    await supabase.from('agents_log').insert({
      agent_name: 'content_creator',
      action: 'generate_content',
      input: { product, audience, tone, channels, campaign_id: campaignId },
      output: { variants_count: variants.length, saved_count: savedContent.length },
      status: 'success',
      tokens_used: claudeData.usage?.input_tokens + claudeData.usage?.output_tokens || 0,
      cost: 0, // Calculate based on model pricing
    })

    return NextResponse.json({
      success: true,
      variants_generated: variants.length,
      variants_saved: savedContent.length,
      content: savedContent,
    })
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
