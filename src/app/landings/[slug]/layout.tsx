import type { Metadata } from 'next'
import { getSupabaseAdmin } from '@/lib/supabase'

interface LandingMeta {
  title: string
  meta_description: string | null
  meta_og_image_url: string | null
  hero_headline: string
}

async function fetchLandingMeta(slug: string): Promise<LandingMeta | null> {
  try {
    const supabase = getSupabaseAdmin()
    const { data } = await supabase
      .from('landings')
      .select('title, meta_description, meta_og_image_url, hero_headline')
      .eq('slug', slug)
      .eq('is_active', true)
      .maybeSingle()
    return (data as LandingMeta | null) ?? null
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: { params: { slug: string } }): Promise<Metadata> {
  const meta = await fetchLandingMeta(params.slug)
  if (!meta) {
    return {
      title: 'Landing · Zero Risk',
      description: 'Página no disponible',
    }
  }
  return {
    title: meta.title,
    description: meta.meta_description ?? meta.hero_headline,
    openGraph: {
      title: meta.title,
      description: meta.meta_description ?? meta.hero_headline,
      images: meta.meta_og_image_url ? [{ url: meta.meta_og_image_url }] : undefined,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title: meta.title,
      description: meta.meta_description ?? meta.hero_headline,
      images: meta.meta_og_image_url ? [meta.meta_og_image_url] : undefined,
    },
  }
}

export default function LandingLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-screen bg-white text-zinc-900">{children}</div>
}
