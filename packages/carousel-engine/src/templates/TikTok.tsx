/**
 * TikTok · 1080 x 1920 (9:16 portrait)
 *
 * TikTok cover · safe-area aware (avoids right-side action stack +
 * bottom caption bar). Headline left-aligned · chunky · accent
 * underline. Brand handle as a TikTok-style @handle pill.
 */
import { resolveBrand, fitHeadlineSize } from './shared'
import type { TemplateProps } from '../types'

export function TikTok({ brand, content, slide_index, total_slides }: TemplateProps) {
  const b = resolveBrand(brand)
  const W = 1080
  const H = 1920
  // TikTok safe area · keep right 180px clear (action stack) and
  // bottom 320px clear (caption/profile). We pad accordingly.
  const SAFE_RIGHT = 180
  const SAFE_BOTTOM = 320
  const headlineSize = fitHeadlineSize(content.headline, {
    canvasWidth: W - 160 - SAFE_RIGHT,
    minSize: 56,
    maxSize: 120,
    targetLines: 5,
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
        paddingTop: 100,
        paddingLeft: 80,
        paddingRight: 80 + SAFE_RIGHT,
        paddingBottom: 100 + SAFE_BOTTOM,
        backgroundImage: `linear-gradient(160deg, ${b.primary} 0%, ${b.secondary} 100%)`,
      }}
    >
      {/* Header · brand pill */}
      <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', gap: 16 }}>
        {b.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.logoUrl} alt="logo" width={56} height={56} style={{ borderRadius: 999 }} />
        ) : null}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 24px',
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.12)',
            fontWeight: 700,
            fontSize: 28,
          }}
        >
          {b.brandHandle || '@brand'}
        </div>
        <div
          style={{
            display: 'flex',
            marginLeft: 'auto',
            alignItems: 'center',
            padding: '6px 14px',
            borderRadius: 8,
            backgroundColor: b.accent,
            color: b.textOnPrimary,
            fontWeight: 700,
            fontSize: 24,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {slide_index}/{total_slides}
        </div>
      </div>

      {/* Spacer */}
      <div style={{ display: 'flex', flexGrow: 1 }} />

      {/* Eyebrow */}
      {content.eyebrow ? (
        <div
          style={{
            display: 'flex',
            color: b.accent,
            fontSize: 32,
            fontWeight: 700,
            textTransform: 'uppercase',
            letterSpacing: 4,
            marginBottom: 24,
          }}
        >
          {content.eyebrow}
        </div>
      ) : null}

      {/* Headline · with accent underline */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: b.headlineFamily,
            fontSize: headlineSize,
            fontWeight: 800,
            lineHeight: 1,
            letterSpacing: -3,
          }}
        >
          {content.headline}
        </div>
        <div
          style={{
            display: 'flex',
            width: 200,
            height: 12,
            backgroundColor: b.accent,
            marginTop: 32,
            borderRadius: 6,
          }}
        />
      </div>

      {/* Body */}
      {content.body ? (
        <div
          style={{
            display: 'flex',
            fontSize: 36,
            lineHeight: 1.4,
            opacity: 0.9,
            marginTop: 40,
          }}
        >
          {content.body}
        </div>
      ) : null}

      {/* CTA */}
      {content.cta ? (
        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            alignItems: 'center',
            padding: '24px 40px',
            marginTop: 56,
            backgroundColor: b.textOnPrimary,
            color: b.primary,
            borderRadius: 16,
            fontSize: 36,
            fontWeight: 700,
          }}
        >
          {content.cta} →
        </div>
      ) : null}
    </div>
  )
}
