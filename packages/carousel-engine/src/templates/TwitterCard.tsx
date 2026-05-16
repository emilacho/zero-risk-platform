/**
 * TwitterCard · 1200 x 675 (16:9 landscape)
 *
 * Tight, minimal · Twitter/X link-preview style. Single column ·
 * headline-dominant · slim footer with brand handle + indicator.
 */
import { resolveBrand, fitHeadlineSize } from './shared'
import type { TemplateProps } from '../types'

export function TwitterCard({ brand, content, slide_index, total_slides }: TemplateProps) {
  const b = resolveBrand(brand)
  const W = 1200
  const H = 675
  const headlineSize = fitHeadlineSize(content.headline, {
    canvasWidth: W - 160,
    minSize: 44,
    maxSize: 84,
    targetLines: 3,
  })

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: W,
        height: H,
        backgroundColor: b.primary,
        color: b.textOnPrimary,
        fontFamily: b.fontFamily,
        padding: 64,
        backgroundImage: `linear-gradient(120deg, ${b.primary}, ${b.secondary})`,
      }}
    >
      {/* Top · logo + accent dot */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 16,
        }}
      >
        {b.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.logoUrl} alt="logo" width={56} height={56} style={{ borderRadius: 8 }} />
        ) : (
          <div
            style={{
              display: 'flex',
              width: 12,
              height: 12,
              borderRadius: 999,
              backgroundColor: b.accent,
            }}
          />
        )}
        <div style={{ display: 'flex', fontSize: 22, fontWeight: 600, opacity: 0.88 }}>
          {b.brandHandle}
        </div>
      </div>

      {/* Spacer */}
      <div style={{ display: 'flex', flexGrow: 1 }} />

      {/* Eyebrow */}
      {content.eyebrow ? (
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: b.accent,
            marginBottom: 16,
            fontWeight: 600,
          }}
        >
          {content.eyebrow}
        </div>
      ) : null}

      {/* Headline */}
      <div
        style={{
          display: 'flex',
          fontFamily: b.headlineFamily,
          fontSize: headlineSize,
          fontWeight: 700,
          lineHeight: 1.05,
          letterSpacing: -1,
          maxWidth: W - 128,
        }}
      >
        {content.headline}
      </div>

      {/* Body */}
      {content.body ? (
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            marginTop: 18,
            opacity: 0.78,
            lineHeight: 1.4,
            maxWidth: W - 200,
          }}
        >
          {content.body}
        </div>
      ) : null}

      {/* Spacer */}
      <div style={{ display: 'flex', flexGrow: 1 }} />

      {/* Footer · CTA + indicator */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          paddingTop: 24,
          borderTop: `1px solid rgba(255,255,255,0.15)`,
        }}
      >
        {content.cta ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              fontSize: 24,
              fontWeight: 600,
              color: b.accent,
            }}
          >
            {content.cta} →
          </div>
        ) : (
          <div style={{ display: 'flex' }} />
        )}
        <div
          style={{
            display: 'flex',
            fontSize: 20,
            opacity: 0.55,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {slide_index} / {total_slides}
        </div>
      </div>
    </div>
  )
}
