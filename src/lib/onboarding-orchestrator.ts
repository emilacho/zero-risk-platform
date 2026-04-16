/**
 * ZERO RISK V3 — Onboarding Orchestrator (Pilar 6)
 *
 * Manages the full 7-day client onboarding flow:
 *   Day 1: Auto-discovery (scrape → analyze → Client Brain v0)
 *   Day 2: Intake form (client fills reduced 15-question form)
 *   Days 3-4: Deep enrichment (parallel agent work)
 *   Day 5: HITL review (Emilio approves Brand Book v2)
 *   Day 6: Kick-off call
 *   Day 7: Activation (embeddings generated, status → active)
 *
 * Entry point: startOnboarding() → kicks off Day 1 auto-discovery
 * The flow advances via processIntakeForm(), reviewOnboarding(), activateClient()
 */

import { SupabaseClient } from '@supabase/supabase-js'
import { WebDiscovery } from './web-discovery'
import { BrandAnalyzer } from './brand-analyzer'
import { MissionControlBridge } from './mc-bridge'

// ============================================================
// Types
// ============================================================

export interface OnboardingInput {
  companyName: string
  websiteUrl: string
  industry?: string
  targetAudience?: string
  competitorUrls?: string[]
  additionalNotes?: string
  createdBy?: string           // 'emilio', 'api', 'ghl_webhook'
}

export interface IntakeFormData {
  // Brand validation
  toneAccurate: boolean
  toneAdjustments?: string
  forbiddenWords?: string[]
  requiredTerminology?: string[]
  // ICP refinement
  icpDescription?: string
  painPoints?: string[]
  buyingProcess?: string
  // Competitor review
  competitorsCorrect: boolean
  competitorsMissing?: string[]
  // Goals
  primaryGoal?: string
  targetKpi?: string
  monthlyBudget?: number
  timelineWeeks?: number
}

export interface OnboardingStatus {
  id: string
  clientId: string
  companyName: string
  status: string
  currentDay: number
  brandBookId: string | null
  icpCount: number
  vocCount: number
  competitorCount: number
  pagesScraped: number
  totalCostUsd: number
  createdAt: string
  updatedAt: string
}

export interface OnboardingResult {
  success: boolean
  onboardingId: string
  clientId: string
  status: string
  brandBookCreated: boolean
  icpsCreated: number
  competitorsAnalyzed: number
  vocQuotesFound: number
  pagesScraped: number
  totalCostUsd: number
  errors: string[]
  nextStep: string
}

// ============================================================
// Onboarding Orchestrator Class
// ============================================================

export class OnboardingOrchestrator {
  private supabase: SupabaseClient
  private mc: MissionControlBridge

  constructor(supabase: SupabaseClient, options?: { baseUrl?: string }) {
    this.supabase = supabase
    this.mc = new MissionControlBridge({ zrBaseUrl: options?.baseUrl })
  }

  // ----------------------------------------------------------
  // DAY 1: Start onboarding — auto-discovery
  // ----------------------------------------------------------

  async startOnboarding(input: OnboardingInput): Promise<OnboardingResult> {
    const errors: string[] = []
    let totalCost = 0
    let totalTokens = 0

    // Step 1: Create or find client record
    const clientId = await this.ensureClient(input)

    // Step 2: Create onboarding session
    const { data: session, error: sessionError } = await this.supabase
      .from('onboarding_sessions')
      .insert({
        client_id: clientId,
        website_url: input.websiteUrl,
        company_name: input.companyName,
        industry: input.industry || null,
        target_audience: input.targetAudience || null,
        competitor_urls: input.competitorUrls || [],
        additional_notes: input.additionalNotes || null,
        status: 'discovering',
        current_day: 1,
        discovery_started_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (sessionError || !session) {
      return {
        success: false,
        onboardingId: '',
        clientId,
        status: 'failed',
        brandBookCreated: false,
        icpsCreated: 0,
        competitorsAnalyzed: 0,
        vocQuotesFound: 0,
        pagesScraped: 0,
        totalCostUsd: 0,
        errors: [`Failed to create onboarding session: ${sessionError?.message}`],
        nextStep: 'retry',
      }
    }

    const onboardingId = session.id

    // Notify MC about new onboarding
    this.notifyMC(
      `Onboarding iniciado: ${input.companyName}`,
      `Auto-discovery en progreso para ${input.websiteUrl}. Día 1 de 7.`,
      ['zero-risk', 'onboarding', 'pilar-6']
    ).catch(() => {})

    try {
      // Step 3: Web Discovery — scrape client's website
      const discovery = new WebDiscovery(this.supabase, onboardingId)
      const clientData = await discovery.discoverClient(input.websiteUrl, input.companyName)

      await this.updateSession(onboardingId, {
        pages_scraped: clientData.totalPagesScraped,
        scrape_errors: clientData.errors,
        scrape_metadata: {
          pages: clientData.totalPagesScraped,
          social_profiles: clientData.socialProfiles,
          contact_info: clientData.contactInfo,
          colors: clientData.colorPalette,
        },
      })

      // Step 4: Brand Analysis — Claude interprets scraped data
      const analyzer = new BrandAnalyzer(this.supabase)

      // 4a: Analyze brand
      const brandResult = await analyzer.analyzeBrand(
        clientData, input.companyName, input.industry
      )
      totalCost += brandResult.costUsd
      totalTokens += brandResult.tokensUsed

      // 4b: Write brand book to DB
      const brandBookId = await analyzer.writeBrandBookToDB(
        clientId, brandResult.analysis, input.websiteUrl
      )

      // Update detected industry on client record
      if (brandResult.analysis.detected_industry) {
        await this.supabase
          .from('clients')
          .update({
            industry: brandResult.analysis.detected_industry,
            market: brandResult.analysis.detected_market,
          })
          .eq('id', clientId)
      }

      // 4c: Analyze ICPs
      const icpResult = await analyzer.analyzeICPs(
        clientData, input.companyName, input.targetAudience, input.industry
      )
      totalCost += icpResult.costUsd
      totalTokens += icpResult.tokensUsed

      const icpsCreated = await analyzer.writeICPsToDB(clientId, icpResult.analysis)

      // Step 5: Competitor Analysis (if URLs provided)
      let competitorsAnalyzed = 0
      if (input.competitorUrls && input.competitorUrls.length > 0) {
        const competitorData = await discovery.scrapeCompetitors(input.competitorUrls)

        const compResult = await analyzer.analyzeCompetitors(
          clientData, competitorData, input.companyName
        )
        totalCost += compResult.costUsd
        totalTokens += compResult.tokensUsed

        competitorsAnalyzed = await analyzer.writeCompetitorsToDB(clientId, compResult.analyses)
      }

      // Step 6: VOC Discovery (reviews)
      // In production this calls Apify/SerpAPI. For MVP, logs the intent.
      const vocResult = await discovery.discoverReviews(input.companyName, input.websiteUrl)
      const vocCount = vocResult.reduce((sum, r) => sum + r.reviews.length, 0)

      // Step 7: Update onboarding session with results
      await this.updateSession(onboardingId, {
        status: 'discovered',
        discovery_completed_at: new Date().toISOString(),
        brand_book_id: brandBookId,
        icp_count: icpsCreated,
        voc_count: vocCount,
        competitor_count: competitorsAnalyzed,
        total_api_calls: 3 + (input.competitorUrls?.length || 0), // brand + icp + competitors
        total_tokens_used: totalTokens,
        total_cost_usd: totalCost,
      })

      // Notify MC about completion
      this.notifyMC(
        `Auto-discovery completado: ${input.companyName}`,
        [
          `Día 1 completado. Resultados:`,
          `- Brand Book v0 creado (${brandBookId.substring(0, 8)}...)`,
          `- ${icpsCreated} ICPs generados`,
          `- ${competitorsAnalyzed} competidores analizados`,
          `- ${clientData.totalPagesScraped} páginas scrapeadas`,
          `- Costo: $${totalCost.toFixed(4)}`,
          `\nPróximo paso: Enviar formulario de intake al cliente.`,
        ].join('\n'),
        ['zero-risk', 'onboarding', 'day-1-complete']
      ).catch(() => {})

      return {
        success: true,
        onboardingId,
        clientId,
        status: 'discovered',
        brandBookCreated: true,
        icpsCreated,
        competitorsAnalyzed,
        vocQuotesFound: vocCount,
        pagesScraped: clientData.totalPagesScraped,
        totalCostUsd: totalCost,
        errors: clientData.errors,
        nextStep: 'send_intake_form',
      }
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error'
      errors.push(errorMsg)

      await this.updateSession(onboardingId, {
        status: 'failed',
        scrape_errors: errors,
        total_cost_usd: totalCost,
      })

      return {
        success: false,
        onboardingId,
        clientId,
        status: 'failed',
        brandBookCreated: false,
        icpsCreated: 0,
        competitorsAnalyzed: 0,
        vocQuotesFound: 0,
        pagesScraped: 0,
        totalCostUsd: totalCost,
        errors,
        nextStep: 'debug_and_retry',
      }
    }
  }

  // ----------------------------------------------------------
  // DAY 2: Process intake form responses
  // ----------------------------------------------------------

  async processIntakeForm(
    onboardingId: string,
    formData: IntakeFormData
  ): Promise<{ success: boolean; updatedFields: string[] }> {
    const updatedFields: string[] = []

    // Load onboarding session
    const { data: session } = await this.supabase
      .from('onboarding_sessions')
      .select('client_id, brand_book_id')
      .eq('id', onboardingId)
      .single()

    if (!session) {
      return { success: false, updatedFields: [] }
    }

    const clientId = session.client_id

    // Update brand book with human input
    if (session.brand_book_id) {
      const brandUpdates: Record<string, unknown> = {
        human_validated: formData.toneAccurate,
        version: 1,
      }

      if (formData.toneAdjustments) {
        brandUpdates.voice_description = formData.toneAdjustments
        updatedFields.push('voice_description')
      }
      if (formData.forbiddenWords && formData.forbiddenWords.length > 0) {
        brandUpdates.forbidden_words = formData.forbiddenWords
        updatedFields.push('forbidden_words')
      }
      if (formData.requiredTerminology && formData.requiredTerminology.length > 0) {
        brandUpdates.required_terminology = formData.requiredTerminology
        updatedFields.push('required_terminology')
      }

      await this.supabase
        .from('client_brand_books')
        .update(brandUpdates)
        .eq('id', session.brand_book_id)

      updatedFields.push('brand_book_v1')
    }

    // Create additional ICP segments from form
    if (formData.icpDescription) {
      const contentText = [
        `Segment: ${formData.icpDescription}`,
        `Pain points: ${formData.painPoints?.join(', ') || ''}`,
        `Buying process: ${formData.buyingProcess || ''}`,
      ].join('\n')

      await this.supabase
        .from('client_icp_documents')
        .insert({
          client_id: clientId,
          audience_segment: formData.icpDescription,
          segment_priority: 1, // Manual input = highest priority
          pain_points: formData.painPoints || [],
          buying_process: formData.buyingProcess || null,
          goals: formData.primaryGoal ? [formData.primaryGoal] : [],
          content_text: contentText,
        })

      updatedFields.push('icp_from_form')
    }

    // Add missing competitors
    if (formData.competitorsMissing && formData.competitorsMissing.length > 0) {
      // Scrape and analyze new competitors
      const discovery = new WebDiscovery(this.supabase, onboardingId)
      const analyzer = new BrandAnalyzer(this.supabase)

      const newCompetitors = await discovery.scrapeCompetitors(formData.competitorsMissing)

      // Get original client discovery data (simplified — just need services)
      const { data: existingBB } = await this.supabase
        .from('client_brand_books')
        .select('content_text')
        .eq('id', session.brand_book_id!)
        .single()

      // Simple analysis without full client discovery data
      for (const comp of newCompetitors) {
        if (comp.pages.length > 0) {
          const contentText = [
            `Competitor: ${comp.competitorName || comp.competitorUrl}`,
            `Tagline: ${comp.detectedTagline || 'N/A'}`,
            `Services: ${comp.detectedServices.join(', ')}`,
          ].join('\n')

          await this.supabase
            .from('client_competitive_landscape')
            .insert({
              client_id: clientId,
              competitor_name: comp.competitorName || comp.competitorUrl,
              competitor_website: comp.competitorUrl,
              competitor_type: 'direct', // Default for user-provided
              tagline: comp.detectedTagline,
              analysis_source: 'web_scraping',
              last_analyzed_at: new Date().toISOString(),
              content_text: contentText,
            })
          updatedFields.push(`competitor_${comp.competitorUrl}`)
        }
      }
    }

    // Update session
    await this.updateSession(onboardingId, {
      status: 'intake_received',
      current_day: 2,
      intake_form_received_at: new Date().toISOString(),
      intake_responses: formData,
    })

    return { success: true, updatedFields }
  }

  // ----------------------------------------------------------
  // DAY 5: HITL Review
  // ----------------------------------------------------------

  async submitForReview(onboardingId: string): Promise<boolean> {
    const { data: session } = await this.supabase
      .from('onboarding_sessions')
      .select('client_id, company_name, brand_book_id')
      .eq('id', onboardingId)
      .single()

    if (!session) return false

    await this.updateSession(onboardingId, {
      status: 'review_ready',
      current_day: 5,
    })

    // Send to MC inbox for Emilio's review
    this.notifyMC(
      `HITL: Revisar Brand Book — ${session.company_name}`,
      [
        `El Brand Book v1 de ${session.company_name} está listo para revisión.`,
        `Brand Book ID: ${session.brand_book_id}`,
        ``,
        `Acciones:`,
        `- POST /api/onboarding/${onboardingId}/review con decision=approved|revision_needed|rejected`,
      ].join('\n'),
      ['zero-risk', 'onboarding', 'hitl', 'day-5']
    ).catch(() => {})

    return true
  }

  async resolveReview(
    onboardingId: string,
    decision: 'approved' | 'revision_needed' | 'rejected',
    feedback?: string
  ): Promise<boolean> {
    const updates: Record<string, unknown> = {
      hitl_status: decision,
      hitl_reviewer: 'emilio',
      hitl_feedback: feedback || null,
      hitl_reviewed_at: new Date().toISOString(),
    }

    if (decision === 'approved') {
      updates.status = 'reviewed'
      updates.current_day = 5

      // Upgrade brand book to v2
      const { data: session } = await this.supabase
        .from('onboarding_sessions')
        .select('brand_book_id')
        .eq('id', onboardingId)
        .single()

      if (session?.brand_book_id) {
        await this.supabase
          .from('client_brand_books')
          .update({ version: 2, human_validated: true })
          .eq('id', session.brand_book_id)
      }
    } else if (decision === 'rejected') {
      updates.status = 'failed'
    }
    // revision_needed keeps status as review_ready

    await this.updateSession(onboardingId, updates)
    return true
  }

  // ----------------------------------------------------------
  // DAY 7: Activate client
  // ----------------------------------------------------------

  async activateClient(onboardingId: string): Promise<boolean> {
    const { data: session } = await this.supabase
      .from('onboarding_sessions')
      .select('client_id, company_name')
      .eq('id', onboardingId)
      .single()

    if (!session) return false

    // Update client status to active
    await this.supabase
      .from('clients')
      .update({ status: 'active' })
      .eq('id', session.client_id)

    // Update onboarding session
    await this.updateSession(onboardingId, {
      status: 'active',
      current_day: 7,
      activated_at: new Date().toISOString(),
    })

    // Note: Embeddings should be generated via /api/client-brain/generate-embeddings
    // This is a separate async process that can run in background

    this.notifyMC(
      `Cliente activado: ${session.company_name}`,
      `${session.company_name} completó onboarding y está activo. Client Brain operativo. Listo para primera campaña.`,
      ['zero-risk', 'onboarding', 'day-7', 'activated']
    ).catch(() => {})

    return true
  }

  // ----------------------------------------------------------
  // Status & queries
  // ----------------------------------------------------------

  async getStatus(onboardingId: string): Promise<OnboardingStatus | null> {
    const { data } = await this.supabase
      .from('onboarding_sessions')
      .select('*')
      .eq('id', onboardingId)
      .single()

    if (!data) return null

    return {
      id: data.id,
      clientId: data.client_id,
      companyName: data.company_name,
      status: data.status,
      currentDay: data.current_day,
      brandBookId: data.brand_book_id,
      icpCount: data.icp_count,
      vocCount: data.voc_count,
      competitorCount: data.competitor_count,
      pagesScraped: data.pages_scraped,
      totalCostUsd: data.total_cost_usd,
      createdAt: data.created_at,
      updatedAt: data.updated_at,
    }
  }

  async listOnboardings(status?: string): Promise<OnboardingStatus[]> {
    let query = this.supabase
      .from('onboarding_sessions')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(20)

    if (status) {
      query = query.eq('status', status)
    }

    const { data } = await query
    return (data || []).map(d => ({
      id: d.id,
      clientId: d.client_id,
      companyName: d.company_name,
      status: d.status,
      currentDay: d.current_day,
      brandBookId: d.brand_book_id,
      icpCount: d.icp_count,
      vocCount: d.voc_count,
      competitorCount: d.competitor_count,
      pagesScraped: d.pages_scraped,
      totalCostUsd: d.total_cost_usd,
      createdAt: d.created_at,
      updatedAt: d.updated_at,
    }))
  }

  // ----------------------------------------------------------
  // Helpers
  // ----------------------------------------------------------

  private async ensureClient(input: OnboardingInput): Promise<string> {
    // Check if client already exists by slug
    const slug = input.companyName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

    const { data: existing } = await this.supabase
      .from('clients')
      .select('id')
      .eq('slug', slug)
      .single()

    if (existing) return existing.id

    // Create new client
    const { data: newClient, error } = await this.supabase
      .from('clients')
      .insert({
        name: input.companyName,
        slug,
        website_url: input.websiteUrl,
        industry: input.industry || null,
        status: 'onboarding',
        preferred_language: 'es',
      })
      .select('id')
      .single()

    if (error || !newClient) {
      throw new Error(`Failed to create client: ${error?.message}`)
    }

    return newClient.id
  }

  private async updateSession(
    onboardingId: string,
    updates: Record<string, unknown>
  ): Promise<void> {
    await this.supabase
      .from('onboarding_sessions')
      .update(updates)
      .eq('id', onboardingId)
  }

  private async notifyMC(
    title: string,
    body: string,
    tags: string[]
  ): Promise<void> {
    const mcBaseUrl = process.env.MC_BASE_URL || 'http://127.0.0.1:3001'
    const mcApiKey = process.env.MC_API_TOKEN || ''

    // Create task in MC
    await fetch(`${mcBaseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': mcApiKey,
      },
      body: JSON.stringify({
        title,
        description: body,
        importance: 2,
        urgency: 2,
        kanban: 'Bandeja de entrada',
        tags,
      }),
    }).catch(() => {})
  }
}
