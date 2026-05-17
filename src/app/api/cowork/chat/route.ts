/**
 * POST /api/cowork/chat
 *
 * Backend del componente `CoworkContextChat` · responde preguntas contextuales
 * del usuario en cualquier paso del wizard onboarding (y otros surfaces que
 * embeban el componente).
 *
 * Estrategia · proxy a `/api/agents/run-sdk` con `agent: 'chief-of-staff'` y
 * un task armado a partir del context + history + message. Respuesta no-stream
 * (single JSON · ~3-5s típico).
 *
 * Body:
 *   {
 *     message: string,
 *     context: { step, step_name, client_name?, slug?, industry? },
 *     history: Array<{ role: 'user' | 'assistant', content: string }>  (last 6)
 *   }
 *
 * Returns:
 *   { reply, agent, latency_ms }
 */
import { NextResponse } from 'next/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'
export const maxDuration = 60

interface ChatContext {
  step: number
  step_name: string
  client_name?: string | null
  slug?: string | null
  industry?: string | null
}

interface ChatBody {
  message?: string
  context?: ChatContext
  history?: Array<{ role: 'user' | 'assistant'; content: string }>
}

const STEP_GUIDANCE: Record<number, string> = {
  1: 'El usuario está en el paso 1 (información del cliente). Ayudalo con: cómo elegir slug · qué escribir en industria · validación de website · uso del Instagram handle para auto-discovery.',
  2: 'El usuario está en el paso 2 (brand discovery). Ayudalo con: paleta de colores · tono de voz · ICP / audiencia objetivo · keywords de marca.',
  3: 'El usuario está en el paso 3 (upload de assets). Ayudalo con: qué archivos subir · formatos válidos · cómo organizarlos · cuántos son suficientes.',
  4: 'El usuario está en el paso 4 (trigger cascade). Ayudalo con: qué hace cada agente · cuánto tarda · qué pasa si falla · cómo reintentar.',
  5: 'El usuario está en el paso 5 (review). Ayudalo con: qué revisar primero · cómo pedir iteración · qué pasa al aprobar · próximos pasos post-activación.',
}

export async function POST(request: Request) {
  const t0 = Date.now()
  let body: ChatBody
  try {
    body = (await request.json()) as ChatBody
  } catch {
    return NextResponse.json({ ok: false, error: 'invalid_json' }, { status: 400 })
  }

  const message = (body.message || '').trim().slice(0, 2000)
  const context = body.context || { step: 1, step_name: 'unknown' }
  const history = Array.isArray(body.history) ? body.history.slice(-6) : []

  if (!message) {
    return NextResponse.json({ ok: false, error: 'message_required' }, { status: 400 })
  }

  const stepGuidance = STEP_GUIDANCE[context.step] || ''
  const clientContext = [
    context.client_name ? `Cliente · ${context.client_name}` : '',
    context.slug ? `Slug · ${context.slug}` : '',
    context.industry ? `Industria · ${context.industry}` : '',
  ]
    .filter(Boolean)
    .join(' · ') || 'Cliente · (sin datos aún)'

  const historyBlock = history.length
    ? '\n\nConversación previa:\n' +
      history.map(h => `[${h.role === 'user' ? 'Usuario' : 'Cowork'}] ${h.content}`).join('\n')
    : ''

  const task = [
    `Sos Cowork · asistente contextual del wizard de onboarding de Zero Risk.`,
    stepGuidance,
    `Contexto del wizard · ${clientContext}.`,
    historyBlock,
    `\nPregunta del usuario (paso ${context.step} · ${context.step_name}) · ${message}`,
    `\nRespondé en español · concreto · 1-3 oraciones · práctico · sin disclaimers. No pidas más contexto · usá lo que hay.`,
  ].join('\n')

  const baseUrl =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, '') ||
    process.env.VERCEL_URL?.replace(/^https?:\/\//, '').replace(/\/$/, '') ||
    'http://localhost:3000'
  const fullBaseUrl = baseUrl.startsWith('http') ? baseUrl : `https://${baseUrl}`

  try {
    const upstream = await fetch(`${fullBaseUrl}/api/agents/run-sdk`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(process.env.INTERNAL_API_KEY ? { 'x-api-key': process.env.INTERNAL_API_KEY } : {}),
      },
      body: JSON.stringify({
        agent: 'chief-of-staff',
        task,
        caller: 'cowork-context-chat',
      }),
      signal: AbortSignal.timeout(45_000),
    })

    const data = (await upstream.json().catch(() => ({}))) as {
      response?: string
      output?: string
      text?: string
      error?: string
    }

    if (!upstream.ok) {
      return NextResponse.json(
        {
          ok: false,
          reply: `⚠️ Cowork no pudo responder (status ${upstream.status}). ${data.error || ''}`.trim(),
          upstream_status: upstream.status,
        },
        { status: 200 },
      )
    }

    const reply = (data.response || data.output || data.text || 'Sin respuesta del agente').trim()

    return NextResponse.json({
      ok: true,
      reply,
      agent: 'chief-of-staff',
      latency_ms: Date.now() - t0,
    })
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        reply: `⚠️ Cowork está offline temporalmente · ${err instanceof Error ? err.message : 'error desconocido'}`,
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 200 },
    )
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: '/api/cowork/chat',
    method: 'POST',
    purpose: 'Step-aware contextual chat backed by chief-of-staff agent',
    body_shape: {
      message: 'string (required · max 2000 chars)',
      context: '{ step: 1-5, step_name, client_name?, slug?, industry? }',
      history: 'Array<{ role: user|assistant, content: string }> (last 6)',
    },
  })
}
