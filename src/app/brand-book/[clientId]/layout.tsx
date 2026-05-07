import { redirect } from 'next/navigation'
import { getSession } from '@/lib/supabase-auth'

interface Props {
  children: React.ReactNode
  params: Promise<{ clientId: string }>
}

export default async function BrandBookLayout({ children, params }: Props) {
  const session = await getSession()
  if (!session) {
    const { clientId } = await params
    redirect(`/login?redirect=${encodeURIComponent(`/brand-book/${clientId}`)}`)
  }
  return <>{children}</>
}
