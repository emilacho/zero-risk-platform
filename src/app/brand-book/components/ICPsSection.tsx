import { EmptyState } from './EmptyState'

export interface IcpRow {
  id: string
  audience_segment: string
  segment_priority: number
  job_titles?: unknown
  company_size?: string | null
  industries?: unknown
  geography?: string | null
  goals?: unknown
  pain_points?: unknown
  jobs_to_be_done?: unknown
  objections?: unknown
  preferred_channels?: unknown
  budget_range?: string | null
}

interface Props {
  icps: IcpRow[]
}

export function ICPsSection({ icps }: Props) {
  if (!icps || icps.length === 0) return <EmptyState section="ICPs" />

  const sorted = [...icps].sort((a, b) => (a.segment_priority ?? 99) - (b.segment_priority ?? 99))

  return (
    <div className="space-y-4">
      {sorted.map((icp) => (
        <article
          key={icp.id}
          className="rounded-lg border border-gray-200 bg-white p-5 shadow-sm"
        >
          <header className="flex flex-wrap items-baseline justify-between gap-2">
            <h3 className="text-lg font-semibold text-gray-900">
              <span className="mr-2 inline-block rounded-full bg-zero-risk-primary/10 px-2 py-0.5 text-xs font-bold text-zero-risk-primary">
                P{icp.segment_priority}
              </span>
              {icp.audience_segment}
            </h3>
            {icp.geography && (
              <span className="text-xs text-gray-500">{icp.geography}</span>
            )}
          </header>

          <dl className="mt-4 grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <Field label="Company size" value={icp.company_size} />
            <Field label="Budget range" value={icp.budget_range} />
            <ListField label="Job titles" value={icp.job_titles} />
            <ListField label="Industries" value={icp.industries} />
            <ListField label="Goals" value={icp.goals} />
            <ListField label="Pain points" value={icp.pain_points} />
            <ListField label="Jobs to be done" value={icp.jobs_to_be_done} />
            <ListField label="Common objections" value={icp.objections} />
            <ListField label="Preferred channels" value={icp.preferred_channels} />
          </dl>
        </article>
      ))}
    </div>
  )
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5 text-gray-800">{value}</dd>
    </div>
  )
}

function ListField({ label, value }: { label: string; value: unknown }) {
  const items = normalizeList(value)
  if (items.length === 0) return null
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">{label}</dt>
      <dd className="mt-0.5">
        <ul className="list-disc space-y-0.5 pl-4 text-gray-800">
          {items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </dd>
    </div>
  )
}

function normalizeList(value: unknown): string[] {
  if (!value) return []
  if (Array.isArray(value)) {
    return value
      .map((v) => (typeof v === 'string' ? v : v && typeof v === 'object' ? JSON.stringify(v) : String(v)))
      .filter(Boolean)
  }
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value)
      return normalizeList(parsed)
    } catch {
      return [value]
    }
  }
  return []
}
