/**
 * POST /api/uptime-incidents — UptimeRobot webhook handler stub.
 */

import { handleStubPost } from '@/lib/stub-handler'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

export async function POST(request: Request) {
  return handleStubPost(request, {
    schemaName: 'stub-row',
    table: 'uptime_incidents',
    transform: (r) => ({
      monitor_url: r.monitor_url || r.monitorURL || null,
      monitor_name: r.monitor_name || r.monitorFriendlyName || null,
      alert_type: typeof r.alert_type === 'number' ? r.alert_type : (r.alertType ?? null),
      alert_details: r.alert_details || r.alertDetails || null,
      data: r,
    }),
  })
}
