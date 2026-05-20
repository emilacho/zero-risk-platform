import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase'
import LandingTemplate, { type LandingData } from './LandingTemplate'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function fetchLanding(slug: string): Promise<LandingData | null> {
  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase
      .from('landings')
      .select(
        'slug, title, hero_headline, hero_subhead, hero_image_url, cta_text, cta_url, sections, vertical',
      )
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle()
    return (data as LandingData | null) ?? null
  } catch {
    return null
  }
}

export default async function LandingPage({ params }: { params: { slug: string } }) {
  const landing = await fetchLanding(params.slug)
  if (!landing) notFound()
  return <LandingTemplate data={landing} />
}
