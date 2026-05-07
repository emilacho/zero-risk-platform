import { EmptyState } from './EmptyState'

interface Props {
  forbiddenWords?: unknown
  requiredTerminology?: unknown
  competitorMentionsPolicy?: string | null
  complianceNotes?: string | null
}

export function ForbiddenWordsSection({
  forbiddenWords,
  requiredTerminology,
  competitorMentionsPolicy,
  complianceNotes,
}: Props) {
  const forbidden = normalizeTerms(forbiddenWords)
  const required = normalizeTerms(requiredTerminology)

  const hasAny =
    forbidden.length > 0 || required.length > 0 || competitorMentionsPolicy || complianceNotes

  if (!hasAny) return <EmptyState section="Forbidden Words" />

  return (
    <div className="space-y-6">
      {forbidden.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-600">
            Forbidden Terms
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Never use these words or phrases in any client-facing copy.
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {forbidden.map((t, i) => (
              <li
                key={i}
                className="rounded-md border border-rose-200 bg-rose-50 p-3 text-sm"
              >
                <span className="font-semibold text-rose-900 line-through">{t.term}</span>
                {t.reason && (
                  <p className="mt-1 text-xs text-rose-700">Reason: {t.reason}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {required.length > 0 && (
        <section>
          <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
            Required Terminology
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Always use these exact terms when relevant.
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {required.map((t, i) => (
              <li
                key={i}
                className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm"
              >
                <span className="font-semibold text-emerald-900">{t.term}</span>
                {t.reason && (
                  <p className="mt-1 text-xs text-emerald-700">{t.reason}</p>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {(competitorMentionsPolicy || complianceNotes) && (
        <section className="rounded-md border border-gray-200 bg-gray-50 p-4">
          {competitorMentionsPolicy && (
            <div>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Competitor Mentions Policy
              </h4>
              <p className="mt-1 text-sm text-gray-800">{competitorMentionsPolicy}</p>
            </div>
          )}
          {complianceNotes && (
            <div className={competitorMentionsPolicy ? 'mt-3' : ''}>
              <h4 className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Compliance Notes
              </h4>
              <p className="mt-1 whitespace-pre-line text-sm text-gray-800">
                {complianceNotes}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  )
}

function normalizeTerms(input: unknown): { term: string; reason?: string }[] {
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
      if (typeof item === 'string') return { term: item }
      if (item && typeof item === 'object') {
        const obj = item as Record<string, unknown>
        const term = (obj.term || obj.word || obj.value || obj.name) as string | undefined
        if (!term) return null
        return {
          term,
          reason: (obj.reason || obj.because || obj.note) as string | undefined,
        }
      }
      return null
    })
    .filter((v): v is { term: string; reason?: string } => v !== null)
}
