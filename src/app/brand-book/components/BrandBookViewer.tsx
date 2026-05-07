'use client'

import { useState } from 'react'
import { BrandBookHeader, type ClientHeaderShape } from './BrandBookHeader'
import { VoiceToneSection } from './VoiceToneSection'
import { ICPsSection, type IcpRow } from './ICPsSection'
import { VisualIdentitySection } from './VisualIdentitySection'
import { MessagingPillarsSection } from './MessagingPillarsSection'
import { ForbiddenWordsSection } from './ForbiddenWordsSection'

export interface BrandBookData {
  brand_purpose: string | null
  brand_vision: string | null
  brand_mission: string | null
  brand_values: unknown
  brand_personality: string | null
  voice_description: string | null
  tone_guidelines: Record<string, unknown> | null
  writing_style: string | null
  tagline: string | null
  elevator_pitch: string | null
  key_messages: unknown
  value_propositions: unknown
  primary_colors: unknown
  typography: Record<string, unknown> | null
  imagery_style: string | null
  logo_usage_notes: string | null
  forbidden_words: unknown
  required_terminology: unknown
  competitor_mentions_policy: string | null
  compliance_notes: string | null
  human_validated: boolean
  version: number
  updated_at: string | null
}

interface Props {
  client: ClientHeaderShape
  brandBook: BrandBookData | null
  icps: IcpRow[]
}

type TabId = 'voice_tone' | 'icps' | 'visual_identity' | 'messaging_pillars' | 'forbidden_words'

const TABS: { id: TabId; label: string }[] = [
  { id: 'voice_tone', label: 'Voice & Tone' },
  { id: 'icps', label: 'ICPs' },
  { id: 'visual_identity', label: 'Visual Identity' },
  { id: 'messaging_pillars', label: 'Messaging' },
  { id: 'forbidden_words', label: 'Forbidden' },
]

export function BrandBookViewer({ client, brandBook, icps }: Props) {
  const [activeTab, setActiveTab] = useState<TabId>('voice_tone')
  const approved = brandBook?.human_validated ?? false

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <BrandBookHeader
        client={client}
        approved={approved}
        approvedAt={brandBook?.updated_at ?? null}
        version={brandBook?.version ?? null}
      />

      <nav className="mt-6 flex flex-wrap gap-2 border-b border-gray-200">
        {TABS.map(({ id, label }) => {
          const isActive = activeTab === id
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveTab(id)}
              className={`-mb-px border-b-2 px-4 py-2 text-sm font-medium transition ${
                isActive
                  ? 'border-zero-risk-primary text-zero-risk-primary'
                  : 'border-transparent text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              {label}
            </button>
          )
        })}
      </nav>

      <div className="mt-6">
        {activeTab === 'voice_tone' && (
          <VoiceToneSection
            voiceDescription={brandBook?.voice_description ?? null}
            toneGuidelines={brandBook?.tone_guidelines ?? null}
            writingStyle={brandBook?.writing_style ?? null}
            brandPersonality={brandBook?.brand_personality ?? null}
          />
        )}
        {activeTab === 'icps' && <ICPsSection icps={icps} />}
        {activeTab === 'visual_identity' && (
          <VisualIdentitySection
            primaryColors={brandBook?.primary_colors}
            typography={brandBook?.typography ?? null}
            imageryStyle={brandBook?.imagery_style ?? null}
            logoUsageNotes={brandBook?.logo_usage_notes ?? null}
          />
        )}
        {activeTab === 'messaging_pillars' && (
          <MessagingPillarsSection
            brandPurpose={brandBook?.brand_purpose ?? null}
            brandVision={brandBook?.brand_vision ?? null}
            brandMission={brandBook?.brand_mission ?? null}
            brandValues={brandBook?.brand_values}
            tagline={brandBook?.tagline ?? null}
            elevatorPitch={brandBook?.elevator_pitch ?? null}
            keyMessages={brandBook?.key_messages}
            valuePropositions={brandBook?.value_propositions}
          />
        )}
        {activeTab === 'forbidden_words' && (
          <ForbiddenWordsSection
            forbiddenWords={brandBook?.forbidden_words}
            requiredTerminology={brandBook?.required_terminology}
            competitorMentionsPolicy={brandBook?.competitor_mentions_policy ?? null}
            complianceNotes={brandBook?.compliance_notes ?? null}
          />
        )}
      </div>
    </div>
  )
}
