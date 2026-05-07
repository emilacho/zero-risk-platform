interface Props {
  section: string
  hint?: string
}

export function EmptyState({ section, hint }: Props) {
  return (
    <div className="rounded-lg border border-dashed border-gray-300 bg-gray-50 p-8 text-center">
      <p className="text-sm font-medium text-gray-700">No content yet for {section}</p>
      <p className="mt-1 text-xs text-gray-500">
        {hint || 'Brand Strategist will populate this section during onboarding.'}
      </p>
    </div>
  )
}
