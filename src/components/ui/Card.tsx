// Zero Risk V2 — Card Component

interface CardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: { value: number; positive: boolean }
  icon?: React.ReactNode
  className?: string
}

export function Card({ title, value, subtitle, trend, icon, className = '' }: CardProps) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-6 shadow-sm hover:shadow-md transition-shadow ${className}`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500">{title}</p>
          <p className="mt-2 text-3xl font-bold text-gray-900">{value}</p>
          {subtitle && (
            <p className="mt-1 text-sm text-gray-400">{subtitle}</p>
          )}
          {trend && (
            <div className={`mt-2 flex items-center text-sm ${trend.positive ? 'text-green-600' : 'text-red-500'}`}>
              <span>{trend.positive ? '↑' : '↓'} {Math.abs(trend.value)}%</span>
              <span className="ml-1 text-gray-400">vs mes anterior</span>
            </div>
          )}
        </div>
        {icon && (
          <div className="rounded-lg bg-gray-50 p-3 text-gray-600">
            {icon}
          </div>
        )}
      </div>
    </div>
  )
}

interface SimpleCardProps {
  children: React.ReactNode
  className?: string
  title?: string
}

export function SimpleCard({ children, className = '', title }: SimpleCardProps) {
  return (
    <div className={`bg-white rounded-xl border border-gray-200 p-6 shadow-sm ${className}`}>
      {title && <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>}
      {children}
    </div>
  )
}
