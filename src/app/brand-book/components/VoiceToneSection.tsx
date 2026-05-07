import ReactMarkdown from 'react-markdown'
import { EmptyState } from './EmptyState'

interface Props {
  voiceDescription?: string | null
  toneGuidelines?: Record<string, unknown> | null
  writingStyle?: string | null
  brandPersonality?: string | null
}

export function VoiceToneSection({
  voiceDescription,
  toneGuidelines,
  writingStyle,
  brandPersonality,
}: Props) {
  const hasAny = voiceDescription || writingStyle || brandPersonality ||
    (toneGuidelines && Object.keys(toneGuidelines).length > 0)

  if (!hasAny) return <EmptyState section="Voice & Tone" />

  return (
    <article className="space-y-6">
      {brandPersonality && (
        <Block label="Personality">
          <p className="text-gray-800">{brandPersonality}</p>
        </Block>
      )}

      {voiceDescription && (
        <Block label="Voice">
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown>{voiceDescription}</ReactMarkdown>
          </div>
        </Block>
      )}

      {writingStyle && (
        <Block label="Writing Style">
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown>{writingStyle}</ReactMarkdown>
          </div>
        </Block>
      )}

      {toneGuidelines && Object.keys(toneGuidelines).length > 0 && (
        <Block label="Tone by Context">
          <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {Object.entries(toneGuidelines).map(([context, value]) => (
              <div key={context} className="rounded-md border border-gray-200 bg-white p-3">
                <dt className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {context}
                </dt>
                <dd className="mt-1 text-sm text-gray-800">
                  {typeof value === 'string' ? value : JSON.stringify(value)}
                </dd>
              </div>
            ))}
          </dl>
        </Block>
      )}
    </article>
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
