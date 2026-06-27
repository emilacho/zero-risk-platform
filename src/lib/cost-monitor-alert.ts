/**
 * §150 G5 cost monitor · Slack alert dispatcher (post-shadow flip).
 *
 * Wraps a single POST to `SLACK_WEBHOOK_URL_EQUIPO` so the cron route stays
 * focused on aggregation + audit. Best-effort · a failed dispatch must NOT
 * fail the cron (audit row still writes, response still 200). Caller decides
 * what to record in `cost_monitor_runs.alert_dispatched` based on the returned
 * boolean.
 *
 * Canon · 3 thresholds preserved · $10/day per workflow · $100/day aggregate
 * · $5/hour burst. Message format includes run_id for forensics jump-back
 * into Supabase.
 */
export interface CostMonitorBreach {
  type: 'daily_per_workflow' | 'daily_aggregate' | 'hourly_burst' | 'per_run_cap'
  workflow_id?: string
  spend_usd: number
  threshold: number
}

export interface DispatchInput {
  breaches: CostMonitorBreach[]
  aggregate_24h_usd: number
  aggregate_1h_usd: number
  invocations_24h: number
  invocations_1h: number
  run_id: string | null
  ran_at: string
  fetchImpl?: typeof fetch
  webhookUrl?: string
}

export interface DispatchResult {
  dispatched: boolean
  reason?: string
}

const BREACH_LABELS: Record<CostMonitorBreach['type'], string> = {
  hourly_burst: 'Pico horario',
  daily_per_workflow: 'Workflow diario',
  daily_aggregate: 'Agregado diario',
  per_run_cap: 'Tope por corrida (§150 #5)',
}

function formatBreachLine(b: CostMonitorBreach): string {
  const label = BREACH_LABELS[b.type] ?? b.type
  const spend = `$${b.spend_usd.toFixed(2)}`
  const threshold = `$${b.threshold}`
  const wf = b.workflow_id ? ` · workflow \`${b.workflow_id}\`` : ''
  return `• *${label}* · gasto ${spend} · umbral ${threshold}${wf}`
}

export function buildAlertPayload(input: DispatchInput): { text: string; blocks: unknown[] } {
  const lines = input.breaches.map(formatBreachLine).join('\n')
  const header = `:rotating_light: *§150 G5 · cost monitor breach* · ${input.breaches.length} alerta(s)`
  const summary =
    `Agregado 24h · $${input.aggregate_24h_usd.toFixed(2)} (${input.invocations_24h} invocaciones) · ` +
    `1h · $${input.aggregate_1h_usd.toFixed(2)} (${input.invocations_1h} invocaciones)`
  const runRef = input.run_id ? `run_id \`${input.run_id}\`` : 'run_id n/a'
  const ranAt = `ran_at \`${input.ran_at}\``
  const text = `${header}\n${lines}\n${summary}\n${runRef} · ${ranAt}`
  return {
    text,
    blocks: [
      { type: 'section', text: { type: 'mrkdwn', text: header } },
      { type: 'section', text: { type: 'mrkdwn', text: lines } },
      { type: 'context', elements: [{ type: 'mrkdwn', text: `${summary} · ${runRef} · ${ranAt}` }] },
    ],
  }
}

export async function dispatchCostMonitorAlert(input: DispatchInput): Promise<DispatchResult> {
  if (input.breaches.length === 0) {
    return { dispatched: false, reason: 'no breaches to dispatch' }
  }
  const webhookUrl = input.webhookUrl ?? process.env.SLACK_WEBHOOK_URL_EQUIPO
  if (!webhookUrl) {
    return { dispatched: false, reason: 'SLACK_WEBHOOK_URL_EQUIPO env var not configured' }
  }
  const fetchImpl = input.fetchImpl ?? fetch
  const payload = buildAlertPayload(input)
  try {
    const res = await fetchImpl(webhookUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    })
    if (!res.ok) {
      const body = await safeReadBody(res)
      return { dispatched: false, reason: `webhook returned ${res.status} ${body.slice(0, 120)}` }
    }
    return { dispatched: true }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    return { dispatched: false, reason: `fetch threw: ${msg.slice(0, 160)}` }
  }
}

async function safeReadBody(res: Response): Promise<string> {
  try {
    return await res.text()
  } catch {
    return ''
  }
}
