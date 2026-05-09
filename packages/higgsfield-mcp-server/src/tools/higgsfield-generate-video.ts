import { z } from 'zod'
import type { HiggsfieldClient } from '../client.js'

export const name = 'higgsfield_generate_video'
export const description =
  'Submit a text-to-video generation job to Higgsfield Lite (Seedance 2.0). Returns the job id immediately; poll status via higgsfield_get_status. When HIGGSFIELD_WEBHOOK_URL is configured the client also registers a completion webhook for that job.'

export const argsSchema = z.object({
  prompt: z.string().min(1).max(2000),
  aspect: z.enum(['16:9', '9:16', '1:1', '4:5']),
  duration_sec: z.number().int().min(1).max(30),
  style: z.string().min(1).max(100).optional(),
})

export type Args = z.infer<typeof argsSchema>

export interface VideoJobResponse {
  job_id: string
  eta_seconds: number
  webhook_registered: boolean
}

interface RawJob {
  id?: string
  job_id?: string
  eta?: number
  eta_seconds?: number
}

export async function handler(client: HiggsfieldClient, raw: unknown): Promise<VideoJobResponse> {
  const args = argsSchema.parse(raw)
  const job = (await client.post('/v1/videos', args)) as RawJob
  const jobId = job.job_id ?? job.id
  if (!jobId) {
    throw new Error('higgsfield_generate_video: response did not include a job id')
  }
  let webhookRegistered = false
  if (client.webhookUrl) {
    try {
      await client.post('/v1/webhooks', {
        jobId,
        url: client.webhookUrl,
        events: ['completed', 'failed'],
      })
      webhookRegistered = true
    } catch (err) {
      // Best-effort · job is already enqueued, polling stays available.
      webhookRegistered = false
      console.error(
        '[higgs-mcp] webhook registration failed:',
        err instanceof Error ? err.message : String(err),
      )
    }
  }
  return {
    job_id: jobId,
    eta_seconds: job.eta_seconds ?? job.eta ?? 60,
    webhook_registered: webhookRegistered,
  }
}
