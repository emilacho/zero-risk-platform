/**
 * ZERO RISK V3 — Brand Analyzer (Pilar 6)
 *
 * Takes raw scraped web data and uses Claude to generate structured
 * Client Brain entries: brand book, ICPs, competitive landscape.
 *
 * This module is the "intelligence" layer of auto-discovery.
 * WebDiscovery scrapes → BrandAnalyzer interprets → Client Brain populated.
 *
 * Model: claude-sonnet-4-20250514 (good balance of quality + cost for analysis)
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { DiscoveryResult, CompetitorScrapeResult } from './web-discovery'

// ============================================================
// Types
// ============================================================

export interface BrandAnalysis {
  // Brand Identity
  brand_purpose: string
  brand_vision: string | null
  brand_mission: string | null
  brand_values: { name: string; description: string }[]
  brand_personality: string
  // Voice & Tone
  voice_description: string
  tone_guidelines: Record<string, string>  // context → tone description
  writing_style: string
  // Messaging
  tagline: string | null
  elevator_pitch: string
  key_messages: string[]
  value_propositions: string[]
  // Visual Identity
  primary_colors: string[]
  imagery_style: string
  // Industry
  detected_industry: string
  detected_market: string      // B2B, B2C, etc.
  // Guardrails (initial — will be refined by human)
  suggested_forbidden_words: string[]
  suggested_required_terminology: string[]
  competitor_mentions_policy: string
}

export interface ICPAnalysis {
  segments: {
    audience_segment: string
    segment_priority: number
    job_titles: string[]
    company_size: string | null
    industries: string[]
    geography: string | null
    goals: string[]
    pain_points: string[]
    jobs_to_be_done: string[]
    objections: string[]
    preferred_channels: string[]
    buying_process: string | null
    recommended_tone: string
    messaging_angle: string
  }[]
}

export interface CompetitorAnalysis {
  competitor_name: string
  competitor_website: string
  competitor_type: 'direct' | 'indirect' | 'aspirational' | 'alternative'
  tagline: string | null
  value_proposition: string
  key_differentiators: string[]
  weaknesses: string[]
  pricing_model: string | null
  target_audience: string
  content_strategy_summary: string
  ad_strategy_summary: string | null
}

// Cost constants for Sonnet
const SONNET_INPUT_COST = 3.0 / 1_000_000
const SONNET_OUTPUT_COST = 15.0 / 1_000_000

// ============================================================
// Brand Analyzer Class
// ============================================================

export class BrandAnalyzer {
  private claudeApiKey: string
  private model: string
  private supabase: SupabaseClient

  constructor(supabase: SupabaseClient, options?: { model?: string }) {
    this.supabase = supabase
    this.claudeApiKey = process.env.CLAUDE_API_KEY || ''
    this.model = options?.model || 'claude-sonnet-4-20250514'
  }

  // ----------------------------------------------------------
  // Analyze brand identity from scraped website data
  // ----------------------------------------------------------

  async analyzeBrand(
    discovery: DiscoveryResult,
    companyName: string,
    industry?: string
  ): Promise<{ analysis: BrandAnalysis; tokensUsed: number; costUsd: number }> {
    // Build context from scraped pages
    const pagesSummary = discovery.pages.map(p => {
      return [
        `## Page: ${p.url}`,
        `Title: ${p.title}`,
        `Meta: ${p.metaDescription}`,
        `Headings: ${p.headings.join(' | ')}`,
        `Content (excerpt): ${p.bodyText.substring(0, 3000)}`,
      ].join('\n')
    }).join('\n\n---\n\n')

    const systemPrompt = `Eres un Brand Strategist experto de la agencia Zero Risk. Tu tarea es analizar el contenido web de un cliente y generar un Brand Book v0 estructurado.

REGLAS:
- Basa tu análisis SOLO en la evidencia del contenido web proporcionado.
- Si no hay suficiente información para un campo, pon un valor razonable basado en la industria o marca null.
- Sé específico y accionable — esto será usado directamente por agentes de marketing.
- Los valores de marca deben reflejar lo que la empresa MUESTRA, no lo que tú crees que debería ser.
- El tone_guidelines debe tener variantes por contexto (social_media, email, blog, ads).

Responde SOLO con JSON válido, sin texto adicional.`

    const userMessage = `## Empresa: ${companyName}
## Industria sugerida: ${industry || 'No especificada — inferir del contenido'}
## URL principal: ${discovery.websiteUrl}
## Social profiles: ${JSON.stringify(discovery.socialProfiles)}
## Colores detectados: ${discovery.colorPalette.join(', ')}
## Contacto: ${JSON.stringify(discovery.contactInfo)}
## Tagline detectado: ${discovery.detectedTagline || 'No detectado'}
## Servicios detectados: ${discovery.detectedServices.join(', ') || 'No detectados'}

## Contenido web scrapeado (${discovery.totalPagesScraped} páginas):

${pagesSummary.substring(0, 25000)}

---

Genera un JSON con esta estructura exacta:
{
  "brand_purpose": "Por qué existe esta marca",
  "brand_vision": "Hacia dónde va",
  "brand_mission": "Cómo lo logra",
  "brand_values": [{"name": "valor", "description": "descripción"}],
  "brand_personality": "Personalidad de marca en una frase",
  "voice_description": "Cómo suena la marca (formal/informal, técnica/accesible, etc.)",
  "tone_guidelines": {"social_media": "...", "email": "...", "blog": "...", "ads": "..."},
  "writing_style": "Estilo de escritura preferido",
  "tagline": "Tagline de la empresa o null",
  "elevator_pitch": "Pitch de 2 oraciones",
  "key_messages": ["mensaje clave 1", "mensaje clave 2", "..."],
  "value_propositions": ["propuesta de valor 1", "..."],
  "primary_colors": ["#hex1", "#hex2"],
  "imagery_style": "Descripción del estilo visual",
  "detected_industry": "Industria detectada",
  "detected_market": "B2B|B2C|B2B2C|etc.",
  "suggested_forbidden_words": ["palabra1", "palabra2"],
  "suggested_required_terminology": ["término1", "término2"],
  "competitor_mentions_policy": "never_mention|compare_favorably|acknowledge_neutral"
}`

    const result = await this.callClaude(systemPrompt, userMessage)

    let analysis: BrandAnalysis
    try {
      const jsonStr = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      analysis = JSON.parse(jsonStr)
    } catch {
      console.error('[BrandAnalyzer] Failed to parse brand analysis JSON')
      analysis = this.defaultBrandAnalysis(companyName)
    }

    return {
      analysis,
      tokensUsed: result.inputTokens + result.outputTokens,
      costUsd: (result.inputTokens * SONNET_INPUT_COST) + (result.outputTokens * SONNET_OUTPUT_COST),
    }
  }

  // ----------------------------------------------------------
  // Analyze ICPs from scraped content + provided audience info
  // ----------------------------------------------------------

  async analyzeICPs(
    discovery: DiscoveryResult,
    companyName: string,
    targetAudience?: string,
    industry?: string
  ): Promise<{ analysis: ICPAnalysis; tokensUsed: number; costUsd: number }> {
    const contentSummary = discovery.pages
      .map(p => `${p.title}: ${p.bodyText.substring(0, 2000)}`)
      .join('\n\n')
      .substring(0, 15000)

    const systemPrompt = `Eres un experto en Market Research de la agencia Zero Risk. Analiza el contenido web y genera perfiles de cliente ideal (ICP) para esta empresa.

Genera 1-3 segmentos de audiencia basados en la evidencia. El segmento principal (#1) es el más importante.

Responde SOLO con JSON válido.`

    const userMessage = `## Empresa: ${companyName}
## Industria: ${industry || 'Inferir del contenido'}
## Audiencia mencionada por el cliente: ${targetAudience || 'No especificada'}
## Servicios detectados: ${discovery.detectedServices.join(', ')}

## Contenido web:
${contentSummary}

Genera JSON:
{
  "segments": [
    {
      "audience_segment": "Nombre del segmento (ej: 'Gerentes de Planta Industrial')",
      "segment_priority": 1,
      "job_titles": ["titulo1", "titulo2"],
      "company_size": "rango o null",
      "industries": ["industria1"],
      "geography": "geografía o null",
      "goals": ["objetivo1", "objetivo2"],
      "pain_points": ["dolor1", "dolor2"],
      "jobs_to_be_done": ["jtbd1", "jtbd2"],
      "objections": ["objeción1"],
      "preferred_channels": ["canal1", "canal2"],
      "buying_process": "Descripción del proceso de compra",
      "recommended_tone": "Tono recomendado para este segmento",
      "messaging_angle": "Ángulo de mensajería principal"
    }
  ]
}`

    const result = await this.callClaude(systemPrompt, userMessage)

    let analysis: ICPAnalysis
    try {
      const jsonStr = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      analysis = JSON.parse(jsonStr)
    } catch {
      console.error('[BrandAnalyzer] Failed to parse ICP analysis JSON')
      analysis = { segments: [] }
    }

    return {
      analysis,
      tokensUsed: result.inputTokens + result.outputTokens,
      costUsd: (result.inputTokens * SONNET_INPUT_COST) + (result.outputTokens * SONNET_OUTPUT_COST),
    }
  }

  // ----------------------------------------------------------
  // Analyze competitors from scraped data
  // ----------------------------------------------------------

  async analyzeCompetitors(
    clientDiscovery: DiscoveryResult,
    competitors: CompetitorScrapeResult[],
    companyName: string
  ): Promise<{ analyses: CompetitorAnalysis[]; tokensUsed: number; costUsd: number }> {
    if (competitors.length === 0) {
      return { analyses: [], tokensUsed: 0, costUsd: 0 }
    }

    const competitorsSummary = competitors.map(c => {
      const content = c.pages
        .map(p => `Title: ${p.title}\nMeta: ${p.metaDescription}\nHeadings: ${p.headings.join(' | ')}\nContent: ${p.bodyText.substring(0, 2000)}`)
        .join('\n---\n')
      return `## Competitor: ${c.competitorName || c.competitorUrl}\nURL: ${c.competitorUrl}\nTagline: ${c.detectedTagline || 'N/A'}\nServices: ${c.detectedServices.join(', ')}\n\n${content}`
    }).join('\n\n===\n\n')

    const systemPrompt = `Eres un experto en Competitive Intelligence de la agencia Zero Risk. Analiza los competidores de "${companyName}" y genera un análisis estructurado de cada uno.

REGLAS:
- Basa el análisis en la evidencia del contenido web.
- Identifica debilidades que representen oportunidades para nuestro cliente.
- competitor_type: 'direct' (mismo servicio, mismo mercado), 'indirect' (mismo problema, diferente solución), 'aspirational' (referente a imitar), 'alternative' (alternativa que el cliente podría elegir).

Responde SOLO con JSON válido.`

    const userMessage = `## Nuestro cliente: ${companyName}
## URL: ${clientDiscovery.websiteUrl}
## Industria: ${clientDiscovery.detectedIndustry || 'Ver servicios abajo'}
## Servicios del cliente: ${clientDiscovery.detectedServices.join(', ')}

## Competidores (${competitors.length}):

${competitorsSummary.substring(0, 20000)}

Genera JSON:
{
  "competitors": [
    {
      "competitor_name": "Nombre",
      "competitor_website": "URL",
      "competitor_type": "direct|indirect|aspirational|alternative",
      "tagline": "Su tagline o null",
      "value_proposition": "Su propuesta de valor",
      "key_differentiators": ["diferenciador1"],
      "weaknesses": ["debilidad1 (oportunidad para nosotros)"],
      "pricing_model": "Modelo de precios o null",
      "target_audience": "A quién apuntan",
      "content_strategy_summary": "Cómo hacen contenido",
      "ad_strategy_summary": "Cómo hacen publicidad o null"
    }
  ]
}`

    const result = await this.callClaude(systemPrompt, userMessage)

    let analyses: CompetitorAnalysis[]
    try {
      const jsonStr = result.text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim()
      const parsed = JSON.parse(jsonStr)
      analyses = parsed.competitors || []
    } catch {
      console.error('[BrandAnalyzer] Failed to parse competitor analysis JSON')
      analyses = []
    }

    return {
      analyses,
      tokensUsed: result.inputTokens + result.outputTokens,
      costUsd: (result.inputTokens * SONNET_INPUT_COST) + (result.outputTokens * SONNET_OUTPUT_COST),
    }
  }

  // ----------------------------------------------------------
  // Call Claude API
  // ----------------------------------------------------------

  private async callClaude(
    systemPrompt: string,
    userMessage: string
  ): Promise<{ text: string; inputTokens: number; outputTokens: number }> {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.claudeApiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.model,
        max_tokens: 4096,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      throw new Error(`Claude API error ${response.status}: ${errText.substring(0, 500)}`)
    }

    const data = await response.json()
    return {
      text: data.content?.[0]?.text || '{}',
      inputTokens: data.usage?.input_tokens || 0,
      outputTokens: data.usage?.output_tokens || 0,
    }
  }

  // ----------------------------------------------------------
  // Default brand analysis (fallback)
  // ----------------------------------------------------------

  private defaultBrandAnalysis(companyName: string): BrandAnalysis {
    return {
      brand_purpose: `${companyName} — purpose to be determined from manual review`,
      brand_vision: null,
      brand_mission: null,
      brand_values: [],
      brand_personality: 'Professional',
      voice_description: 'Professional and approachable',
      tone_guidelines: {
        social_media: 'Friendly and engaging',
        email: 'Professional and direct',
        blog: 'Informative and expert',
        ads: 'Compelling and clear',
      },
      writing_style: 'Clear and concise',
      tagline: null,
      elevator_pitch: `${companyName} provides solutions to its target market.`,
      key_messages: [],
      value_propositions: [],
      primary_colors: [],
      imagery_style: 'Professional',
      detected_industry: 'Unknown',
      detected_market: 'Unknown',
      suggested_forbidden_words: [],
      suggested_required_terminology: [],
      competitor_mentions_policy: 'never_mention',
    }
  }

  // ----------------------------------------------------------
  // Write analysis results to Client Brain tables
  // ----------------------------------------------------------

  async writeBrandBookToDB(
    clientId: string,
    analysis: BrandAnalysis,
    sourceUrl: string
  ): Promise<string> {
    // Build content_text for embedding
    const contentText = [
      analysis.brand_purpose,
      analysis.brand_mission,
      analysis.voice_description,
      analysis.elevator_pitch,
      analysis.key_messages.join('. '),
      analysis.value_propositions.join('. '),
    ].filter(Boolean).join('\n\n')

    const { data, error } = await this.supabase
      .from('client_brand_books')
      .insert({
        client_id: clientId,
        brand_purpose: analysis.brand_purpose,
        brand_vision: analysis.brand_vision,
        brand_mission: analysis.brand_mission,
        brand_values: analysis.brand_values,
        brand_personality: analysis.brand_personality,
        voice_description: analysis.voice_description,
        tone_guidelines: analysis.tone_guidelines,
        writing_style: analysis.writing_style,
        tagline: analysis.tagline,
        elevator_pitch: analysis.elevator_pitch,
        key_messages: analysis.key_messages,
        value_propositions: analysis.value_propositions,
        primary_colors: analysis.primary_colors,
        imagery_style: analysis.imagery_style,
        forbidden_words: analysis.suggested_forbidden_words,
        required_terminology: analysis.suggested_required_terminology,
        competitor_mentions_policy: analysis.competitor_mentions_policy,
        auto_generated: true,
        auto_generated_from: sourceUrl,
        human_validated: false,
        version: 0,
        content_text: contentText,
      })
      .select('id')
      .single()

    if (error) throw new Error(`Failed to write brand book: ${error.message}`)
    return data!.id
  }

  async writeICPsToDB(
    clientId: string,
    icpAnalysis: ICPAnalysis
  ): Promise<number> {
    let count = 0
    for (const segment of icpAnalysis.segments) {
      const contentText = [
        `Segment: ${segment.audience_segment}`,
        `Goals: ${segment.goals.join(', ')}`,
        `Pain points: ${segment.pain_points.join(', ')}`,
        `JTBD: ${segment.jobs_to_be_done.join(', ')}`,
        `Channels: ${segment.preferred_channels.join(', ')}`,
      ].join('\n')

      const { error } = await this.supabase
        .from('client_icp_documents')
        .insert({
          client_id: clientId,
          audience_segment: segment.audience_segment,
          segment_priority: segment.segment_priority,
          job_titles: segment.job_titles,
          company_size: segment.company_size,
          industries: segment.industries,
          geography: segment.geography,
          goals: segment.goals,
          pain_points: segment.pain_points,
          jobs_to_be_done: segment.jobs_to_be_done,
          objections: segment.objections,
          preferred_channels: segment.preferred_channels,
          buying_process: segment.buying_process,
          recommended_tone: segment.recommended_tone,
          messaging_angle: segment.messaging_angle,
          content_text: contentText,
        })

      if (!error) count++
    }
    return count
  }

  async writeCompetitorsToDB(
    clientId: string,
    analyses: CompetitorAnalysis[]
  ): Promise<number> {
    let count = 0
    for (const comp of analyses) {
      const contentText = [
        `Competitor: ${comp.competitor_name}`,
        `Type: ${comp.competitor_type}`,
        `Value prop: ${comp.value_proposition}`,
        `Differentiators: ${comp.key_differentiators.join(', ')}`,
        `Weaknesses: ${comp.weaknesses.join(', ')}`,
        `Target: ${comp.target_audience}`,
      ].join('\n')

      const { error } = await this.supabase
        .from('client_competitive_landscape')
        .insert({
          client_id: clientId,
          competitor_name: comp.competitor_name,
          competitor_website: comp.competitor_website,
          competitor_type: comp.competitor_type,
          tagline: comp.tagline,
          value_proposition: comp.value_proposition,
          key_differentiators: comp.key_differentiators,
          weaknesses: comp.weaknesses,
          pricing_model: comp.pricing_model,
          target_audience: comp.target_audience,
          content_strategy_summary: comp.content_strategy_summary,
          ad_strategy_summary: comp.ad_strategy_summary,
          analysis_source: 'web_scraping',
          last_analyzed_at: new Date().toISOString(),
          content_text: contentText,
        })

      if (!error) count++
    }
    return count
  }
}
