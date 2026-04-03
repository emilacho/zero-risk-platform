// Zero Risk V2 — Badge Component

const variants = {
  success: 'bg-green-50 text-green-700 border-green-200',
  warning: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  error: 'bg-red-50 text-red-700 border-red-200',
  info: 'bg-blue-50 text-blue-700 border-blue-200',
  neutral: 'bg-gray-50 text-gray-700 border-gray-200',
}

const statusMap: Record<string, keyof typeof variants> = {
  active: 'success',
  completed: 'success',
  published: 'success',
  approved: 'success',
  won: 'success',
  draft: 'neutral',
  new: 'info',
  contacted: 'info',
  qualified: 'info',
  proposal: 'warning',
  paused: 'warning',
  archived: 'neutral',
  lost: 'error',
  error: 'error',
}

interface BadgeProps {
  status: string
  variant?: keyof typeof variants
  className?: string
}

export function Badge({ status, variant, className = '' }: BadgeProps) {
  const v = variant || statusMap[status] || 'neutral'
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium capitalize ${variants[v]} ${className}`}>
      {status}
    </span>
  )
}
