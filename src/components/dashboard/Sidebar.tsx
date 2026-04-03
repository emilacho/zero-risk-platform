'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: '📊' },
  { name: 'Campañas', href: '/dashboard/campaigns', icon: '📢' },
  { name: 'Leads', href: '/dashboard/leads', icon: '👥' },
  { name: 'Contenido', href: '/dashboard/content', icon: '📝' },
  { name: 'Analytics', href: '/dashboard/analytics', icon: '📈' },
]

const bottomNavigation = [
  { name: 'Configuración', href: '/dashboard/settings', icon: '⚙️' },
]

export function Sidebar() {
  const pathname = usePathname()

  return (
    <aside className="fixed inset-y-0 left-0 z-50 flex w-64 flex-col bg-zero-risk-primary">
      {/* Logo */}
      <div className="flex h-16 items-center gap-3 px-6 border-b border-white/10">
        <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-zero-risk-highlight text-white font-bold text-sm">
          ZR
        </div>
        <div>
          <h1 className="text-sm font-bold text-white">Zero Risk</h1>
          <p className="text-[10px] text-gray-400">Platform V2</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 px-3 py-4 space-y-1">
        {navigation.map((item) => {
          const isActive = pathname === item.href ||
            (item.href !== '/dashboard' && pathname.startsWith(item.href))
          return (
            <Link
              key={item.name}
              href={item.href}
              className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-white/10 text-white'
                  : 'text-gray-400 hover:bg-white/5 hover:text-white'
              }`}
            >
              <span className="text-base">{item.icon}</span>
              {item.name}
            </Link>
          )
        })}
      </nav>

      {/* Bottom nav */}
      <div className="border-t border-white/10 px-3 py-4 space-y-1">
        {bottomNavigation.map((item) => (
          <Link
            key={item.name}
            href={item.href}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
          >
            <span className="text-base">{item.icon}</span>
            {item.name}
          </Link>
        ))}

        {/* User */}
        <div className="mt-4 flex items-center gap-3 rounded-lg px-3 py-2.5">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-zero-risk-accent text-xs font-bold text-white">
            EA
          </div>
          <div>
            <p className="text-sm font-medium text-white">Emilio</p>
            <p className="text-[10px] text-gray-400">Admin</p>
          </div>
        </div>
      </div>
    </aside>
  )
}
