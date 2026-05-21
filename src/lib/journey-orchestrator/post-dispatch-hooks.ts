/**
 * Post-dispatch hooks · Sprint 5 wire-in.
 *
 * Fire-and-forget side effects after successful L2 invocation. Hooks
 * catch own errors · NEVER throw upstream to dispatch.ts (which would
 * fail the L1 dispatch even though L2 succeeded · bad UX).
 *
 * Hooks ·
 *   1. WhatsApp notify on PRODUCE journey stage='launch' · cliente que
 *      tenga primary champion con phone wireado recibe template
 *      `campaign_published` con campaign_name + landing_url.
 *   2. Social content schedule on PRODUCE journey stage='production' OR
 *      'qa_review' · si params include `social_caption` + `network` ·
 *      crea row social_posts con status='pending_approval'.
 *
 * Both hooks NO-OP cuando env vars Meta missing · solo logs advisory.
 */
import type { JourneyType } from "./types"
import { notifyTemplate, shouldNotifyClient } from "@/lib/integrations/whatsapp-notify"
import {
  scheduleSocialContent,
  type SocialNetwork,
} from "@/lib/integrations/social-content-scheduler"

export interface PostDispatchContext {
  journey: JourneyType
  stage: string | null
  client_id: string | null
  journey_id: string
  params: Record<string, unknown>
}

export async function firePostDispatchHooks(
  ctx: PostDispatchContext,
): Promise<void> {
  // Run both hooks · neither blocks the other · errors swallowed
  await Promise.allSettled([
    firePostLaunchWhatsApp(ctx),
    fireContentSocialSchedule(ctx),
  ])
}

// ─── Hook 1 · WhatsApp notify on PRODUCE launch ─────────────────────────

async function firePostLaunchWhatsApp(ctx: PostDispatchContext): Promise<void> {
  try {
    if (ctx.journey !== "PRODUCE") return
    if (ctx.stage !== "launch") return
    if (!ctx.client_id) return

    const eligibility = await shouldNotifyClient(ctx.client_id)
    if (!eligibility.eligible) {
      console.log(
        `[post-dispatch-hooks] whatsapp skip · client ${ctx.client_id} · reason ${eligibility.reason}`,
      )
      return
    }

    const campaignName =
      typeof ctx.params.campaign_name === "string"
        ? ctx.params.campaign_name
        : "tu campaña"
    const landingUrl =
      typeof ctx.params.landing_url === "string"
        ? ctx.params.landing_url
        : "https://zero-risk.com"

    const result = await notifyTemplate({
      to_phone: eligibility.phone!,
      template_name: "campaign_published",
      variables: [campaignName, landingUrl],
      language: "es",
      client_id: ctx.client_id,
      context: "nexus-publish",
      caller_detail: `journey:${ctx.journey_id}`,
    })

    if (!result.ok) {
      console.log(
        `[post-dispatch-hooks] whatsapp notify failed · ${result.code}:${result.detail?.slice(0, 100)} · journey ${ctx.journey_id}`,
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown"
    console.error("[post-dispatch-hooks] whatsapp hook error:", msg)
  }
}

// ─── Hook 2 · Social content schedule on PRODUCE production/qa_review ───

async function fireContentSocialSchedule(
  ctx: PostDispatchContext,
): Promise<void> {
  try {
    if (ctx.journey !== "PRODUCE") return
    if (ctx.stage !== "production" && ctx.stage !== "qa_review") return

    const socialCaption = ctx.params.social_caption
    const network = ctx.params.network
    if (typeof socialCaption !== "string" || socialCaption.length === 0) return
    if (network !== "facebook" && network !== "instagram") return

    const mediaUrls = Array.isArray(ctx.params.media_urls)
      ? (ctx.params.media_urls as string[])
      : []

    const result = await scheduleSocialContent({
      network: network as SocialNetwork,
      content: socialCaption,
      media_urls: mediaUrls,
      client_id: ctx.client_id,
      created_by_agent:
        typeof ctx.params.created_by_agent === "string"
          ? ctx.params.created_by_agent
          : "nexus-content-cascade",
      caller_phase: ctx.stage,
    })

    if (!result.ok) {
      console.log(
        `[post-dispatch-hooks] social schedule failed · ${result.error} · journey ${ctx.journey_id}`,
      )
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "unknown"
    console.error("[post-dispatch-hooks] social hook error:", msg)
  }
}
