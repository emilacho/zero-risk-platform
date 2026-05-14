import { EmptyState } from './EmptyState'

interface Props {
  brandPurpose?: string | null
  brandVision?: string | null
  brandMission?: string | null
  brandValues?: unknown
  tagline?: string | null
  elevatorPitch?: string | null
  keyMessages?: unknown
  valuePropositions?: unknown
}

export function MessagingPillarsSection({
  brandPurpose,
  brandVision,
  brandMission,
  brandValues,
  tagline,
  elevatorPitch,
  keyMessages,
  valuePropositions,
}: Props) {
  const values = normalizeArrayOfObjects(brandValues)
  const messages = normalizeArrayOfObjects(keyMessages)
  const props = normalizeArrayOfObjects(valuePropositions)

  const hasAny =
    brandPurpose || brandVision || brandMission || tagline || elevatorPitch ||
    values.length > 0 || messages.length > 0 || props.length > 0

  if (!hasAny) return <EmptyState section="Messaging Pillars" />

  return (
    <div className="space-y-6">
      {tagline && (
        <blockquote className="border-l-4 border-zero-risk-primary bg-zero-risk-primary/5 px-4 py-3">
          <p className="text-lg font-medium italic text-gray-900">&quot;{tagline}&quot;</p>
        </blockquote>
      )}

      {elevatorPitch && (
        <Block label="Elevator Pitch">
          <p className="whitespace-pre-line text-gray-800">{elevatorPitch}</p>
        </Block>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {brandPurpose && <PillarCard title="Purpose" body={brandPurpose} />}
        {brandVision && <PillarCard title="Vision" body={brandVision} />}
        {brandMission && <PillarCard title="Mission" body={brandMission} />}
      </div>

      {values.length > 0 && (
        <Block label="Brand Values">
          <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {values.map((v, i) => (
              <li key={i} className="rounded-md border border-gray-200 bg-white p-3 text-sm">
                <span className="font-semibold text-gray-900">{v.title}</span>
                {v.body && <p className="mt-1 text-gray-700">{v.body}</p>}
              </li>
            ))}
          </ul>
        </Block>
      )}

      {messages.length > 0 && (
        <Block label="Key Messages">
          <ol className="space-y-2 text-sm">
            {messages.map((m, i) => (
              <li key={i} className="rounded-md border border-gray-200 bg-white p-3">
                <span className="font-semibold text-gray-900">
                  {m.title || `Message ${i + 1}`}
                </span>
                {m.body && <p className="mt-1 text-gray-700">{m.body}</p>}
              </li>
            ))}
          </ol>
        </Block>
      )}

      {props.length > 0 && (
        <Block label="Value Propositions">
          <ol className="space-y-2 text-sm">
            {props.map((p, i) => (
              <li key={i} className="rounded-md border border-gray-200 bg-white p-3">
                <span className="font-semibold text-gray-900">{p.title || `Prop ${i + 1}`}</span>
                {p.body && <p className="mt-1 text-gray-700">{p.body}</p>}
              </li>
            ))}
          </ol>
        </Block>
      )}
    </div>
  )
}

function PillarCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-zero-risk-primary">{title}</h4>
      <p className="mt-2 text-sm text-gray-800">{body}</p>
    </div>
  )
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <section>
      <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">{label}</h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

function normalizeArrayOfObjects(input: unknown): { title?: string; body?: string }[] {
  if (!input) return []
  let arr: unknown[] = []
  if (Array.isArray(input)) arr = input
  else if (typeof input === 'string') {
    try {
      const parsed = JSON.parse(input)
      arr = Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }
  return arr
    .map((item) => {
      if (typeof item === 'string') return { title: item }
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        return {
          title: (obj.title || obj.name || obj.value || obj.message) as string | undefined,
          body: (obj.body || obj.description || obj.detail) as string | undefined,
        }
      }
      return { title: String(item) }
    })
    .filter((v) => v.title || v.body)
}
