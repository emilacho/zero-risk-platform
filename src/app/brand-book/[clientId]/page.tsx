import { notFound } from 'next/navigation'
import { getSupabaseAdmin } from '@/lib/supabase'
import { BrandBookViewer, type BrandBookData } from '../components/BrandBookViewer'
import type { ClientHeaderShape } from '../components/BrandBookHeader'
import type { IcpRow } from '../components/ICPsSection'

interface Props {
  params: Promise<{ clientId: string }>
}

export const dynamic = 'force-dynamic'

export default async function BrandBookPage({ params }: Props) {
  const { clientId } = await params
  const supabase = getSupabaseAdmin()

  const [clientRes, brandBookRes, icpsRes] = await Promise.all([
    supabase
      .from('clients')
      .select('id, name, slug, industry, market, status')
      .eq('id', clientId)
      .maybeSingle(),
    supabase
      .from('client_brand_books')
      .select(
        'brand_purpose, brand_vision, brand_mission, brand_values, brand_personality, ' +
          'voice_description, tone_guidelines, writing_style, ' +
          'tagline, elevator_pitch, key_messages, value_propositions, ' +
          'primary_colors, typography, imagery_style, logo_usage_notes, ' +
          'forbidden_words, required_terminology, competitor_mentions_policy, compliance_notes, ' +
          'human_validated, version, updated_at',
      )
      .eq('client_id', clientId)
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('client_icp_documents')
      .select(
        'id, audience_segment, segment_priority, job_titles, company_size, industries, geography, ' +
          'goals, pain_points, jobs_to_be_done, objections, preferred_channels, budget_range',
      )
      .eq('client_id', clientId)
      .order('segment_priority', { ascending: true }),
  ])

  if (!clientRes.data) notFound()

  const client = clientRes.data as unknown as ClientHeaderShape
  const brandBook = (brandBookRes.data ?? null) as unknown as BrandBookData | null
  const icps = (icpsRes.data ?? []) as unknown as IcpRow[]

  return <BrandBookViewer client={client} brandBook={brandBook} icps={icps} />
}
