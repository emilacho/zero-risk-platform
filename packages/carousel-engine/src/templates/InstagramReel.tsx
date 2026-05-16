/**
 * InstagramReel · 1080 x 1920 (9:16 portrait)
 *
 * Reel-style cover. Big bold center-aligned headline · eyebrow chip ·
 * subtle body line · brand footer with subtle scroll cue. Designed to
 * be readable on a phone preview at small sizes.
 */
import { resolveBrand, fitHeadlineSize } from './shared'
import type { TemplateProps } from '../types'

export function InstagramReel({ brand, content, slide_index, total_slides }: TemplateProps) {
  const b = resolveBrand(brand)
  const W = 1080
  const H = 1920
  const headlineSize = fitHeadlineSize(content.headline, {
    canvasWidth: W - 160,
    minSize: 60,
    maxSize: 128,
    targetLines: 4,
  })

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: W,
        height: H,
        color: b.textOnPrimary,
        fontFamily: b.fontFamily,
        padding: 80,
        backgroundImage: `linear-gradient(180deg, ${b.primary}, ${b.secondary})`,
      }}
    >
      {/* Header · slide indicator only */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
        }}
      >
        {b.logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={b.logoUrl} alt="logo" width={72} height={72} style={{ borderRadius: 14 }} />
        ) : (
          <div style={{ display: 'flex', fontSize: 28, fontWeight: 600 }}>{b.brandHandle}</div>
        )}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            padding: '10px 20px',
            borderRadius: 999,
            border: `2px solid ${b.accent}`,
            color: b.accent,
            fontWeight: 700,
            fontSize: 28,
            fontVariantNumeric: 'tabular-nums',
          }}
        >
          {slide_index} · {total_slides}
        </div>
      </div>

      {/* Mid spacer */}
      <div style={{ display: 'flex', flexGrow: 1 }} />

      {/* Eyebrow chip */}
      {content.eyebrow ? (
        <div
          style={{
            display: 'flex',
            alignSelf: 'flex-start',
            padding: '10px 24px',
            borderRadius: 999,
            backgroundColor: b.accent,
            color: b.textOnPrimary,
            fontSize: 28,
            fontWeight: 600,
            letterSpacing: 2,
            textTransform: 'uppercase',
            marginBottom: 40,
          }}
        >
          {content.eyebrow}
        </div>
      ) : null}

      {/* Headline · large center-aligned */}
      <div
        style={{
          display: 'flex',
          fontFamily: b.headlineFamily,
          fontSize: headlineSize,
          fontWeight: 800,
          lineHeight: 1.02,
          letterSpacing: -2,
        }}
      >
        {content.headline}
      </div>

      {/* Body */}
      {content.body ? (
        <div
          style={{
            display: 'flex',
            fontSize: 36,
            marginTop: 36,
            opacity: 0.88,
            lineHeight: 1.4,
          }}
        >
          {content.body}
        </div>
      ) : null}

      {/* Spacer */}
      <div style={{ display: 'flex', flexGrow: 1 }} />

      {/* CTA */}
      {content.cta ? (
        <div
          style={{
            display: 'flex',
            alignSelf: 'center',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '24px 48px',
            backgroundColor: b.textOnPrimary,
            color: b.primary,
            borderRadius: 999,
            fontSize: 36,
            fontWeight: 700,
            marginBottom: 48,
          }}
        >
          {content.cta}
        </div>
      ) : null}

      {/* Footer */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          fontSize: 24,
          opacity: 0.55,
          letterSpacing: 3,
          textTransform: 'uppercase',
        }}
      >
        ↑ desliza para más
      </div>
    </div>
  )
}
