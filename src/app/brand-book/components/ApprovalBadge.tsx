interface Props {
  approved: boolean
  approvedAt?: string | null
  size?: 'sm' | 'md'
}

export function ApprovalBadge({ approved, approvedAt, size = 'md' }: Props) {
  const padding = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-sm'
  const cls = approved
    ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
    : 'bg-amber-50 text-amber-700 border-amber-200'
  return (
    <span className={`inline-flex items-center rounded-full border font-medium ${padding} ${cls}`}>
      {approved ? 'Approved' : 'Draft'}
      {approved && approvedAt && (
        <span className="ml-1.5 opacity-70">· {new Date(approvedAt).toLocaleDateString()}</span>
      )}
    </span>
  )
}
