import { EmptyState } from './EmptyState'

interface Props {
  primaryColors?: unknown
  typography?: Record<string, unknown> | null
  imageryStyle?: string | null
  logoUsageNotes?: string | null
}

export function VisualIdentitySection({
  primaryColors,
  typography,
  imageryStyle,
  logoUsageNotes,
}: Props) {
  const colors = normalizeColors(primaryColors)
  const fonts = typography && typeof typography === 'object' ? typography : null
  const hasAny = colors.length > 0 || fonts || imageryStyle || logoUsageNotes

  if (!hasAny) return <EmptyState section="Visual Identity" />

  return (
    <div className="space-y-6">
      {colors.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Color Palette
          </h3>
          <div className="mt-3 flex flex-wrap gap-3">
            {colors.map((c, i) => (
              <div key={i} className="flex flex-col items-start">
                <div
                  className="h-16 w-16 rounded-md border border-gray-200 shadow-sm"
                  style={{ backgroundColor: c.hex }}
                  aria-label={c.name || c.hex}
                />
                <span className="mt-1 text-xs font-mono text-gray-700">{c.hex}</span>
                {c.name && <span className="text-xs text-gray-500">{c.name}</span>}
              </div>
            ))}
          </div>
        </section>
      )}

      {fonts && Object.keys(fonts).length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Typography
          </h3>
          <dl className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {Object.entries(fonts).map(([key, value]) => (
              <div key={key} className="rounded-md border border-gray-200 bg-white p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {key}
                </dt>
                <dd className="mt-1 text-sm text-gray-800">
                  {typeof value === 'string' ? value : JSON.stringify(value)}
                </dd>
              </div>
            ))}
          </dl>
        </section>
      )}

      {imageryStyle && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Imagery Style
          </h3>
          <p className="mt-2 text-gray-800">{imageryStyle}</p>
        </section>
      )}

      {logoUsageNotes && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-gray-500">
            Logo Usage
          </h3>
          <p className="mt-2 whitespace-pre-line text-gray-800">{logoUsageNotes}</p>
        </section>
      )}
    </div>
  )
}

function normalizeColors(input: unknown): { hex: string; name?: string }[] {
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
    .map((c) => {
      if (typeof c === 'string') return { hex: c }
      if (c && typeof c === 'object') {
        const obj = c as Record<string, unknown>
        const hex = (obj.hex || obj.value || obj.color) as string | undefined
        if (!hex) return null
        return { hex, name: (obj.name as string | undefined) ?? undefined }
      }
      return null
    })
    .filter((v): v is { hex: string; name?: string } => v !== null)
}
