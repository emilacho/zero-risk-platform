import type { Metadata } from 'next'
import OnboardingWizard from '@/components/onboarding/OnboardingWizard'

export const metadata: Metadata = {
  title: 'Onboarding Cliente · Zero Risk',
  description: 'Wizard 5-pasos para iniciar un nuevo cliente · brand discovery + assets + cascade trigger.',
}

export const dynamic = 'force-dynamic'

export default function OnboardingNewPage() {
  return (
    <main className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <OnboardingWizard />
    </main>
  )
}
