import { ApprovalBadge } from './ApprovalBadge'

export interface ClientHeaderShape {
  id: string
  name: string
  industry?: string | null
  slug?: string | null
  market?: string | null
  status?: string | null
}

interface Props {
  client: ClientHeaderShape
  approved: boolean
  approvedAt?: string | null
  version?: number | null
}

export function BrandBookHeader({ client, approved, approvedAt, version }: Props) {
  return (
    <header className="border-b border-gray-200 pb-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight text-gray-900">
            {client.name} · Brand Book
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {[client.industry, client.market, client.status].filter(Boolean).join(' · ') || 'Onboarding'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {version != null && (
            <span className="text-xs font-medium text-gray-500">v{version}</span>
          )}
          <ApprovalBadge approved={approved} approvedAt={approvedAt} />
        </div>
      </div>
    </header>
  )
}
