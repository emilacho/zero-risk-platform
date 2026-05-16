/**
 * InstagramFeed · 1080 x 1350 (4:5 portrait)
 *
 * Layout · primary-color full-bleed background with a soft accent corner.
 * Brand handle + slide indicator top bar · eyebrow over a big headline ·
 * body paragraph · CTA pill bottom-right.
 */
import { resolveBrand, fitHeadlineSize } from './shared'
import type { TemplateProps } from '../types'

export function InstagramFeed({ brand, content, slide_index, total_slides }: TemplateProps) {
  const b = resolveBrand(brand)
  const W = 1080
  const H = 1350
  const headlineSize = fitHeadlineSize(content.headline, {
    canvasWidth: W - 160,
    minSize: 48,
    maxSize: 96,
    targetLines: 4,
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
        padding: 80,
        // Decorative corner accent · linear gradient
        backgroundImage: `linear-gradient(135deg, ${b.primary} 60%, ${b.secondary})`,
      }}
    >
      {/* Top row · handle + indicator */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
          fontSize: 28,
          fontWeight: 500,
          opacity: 0.85,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center' }}>
          {b.logoUrl ? (
            // satori supports <img> with remote URL
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.logoUrl} alt="logo" width={64} height={64} style={{ borderRadius: 12, marginRight: 16 }} />
          ) : null}
          <span>{b.brandHandle}</span>
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: '8px 16px',
            borderRadius: 999,
            backgroundColor: 'rgba(255,255,255,0.12)',
            fontVariantNumeric: 'tabular-nums',
            fontSize: 24,
          }}
        >
          {String(slide_index).padStart(2, '0')} / {String(total_slides).padStart(2, '0')}
        </div>
      </div>

      {/* Spacer */}
      <div style={{ display: 'flex', flexGrow: 1 }} />

      {/* Eyebrow */}
      {content.eyebrow ? (
        <div
          style={{
            display: 'flex',
            fontSize: 28,
            letterSpacing: 4,
            textTransform: 'uppercase',
            color: b.accent,
            marginBottom: 24,
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
          marginBottom: 32,
        }}
      >
        {content.headline}
      </div>

      {/* Body */}
      {content.body ? (
        <div
          style={{
            display: 'flex',
            fontSize: 32,
            lineHeight: 1.4,
            opacity: 0.92,
            maxWidth: W - 200,
          }}
        >
          {content.body}
        </div>
      ) : null}

      {/* Spacer */}
      <div style={{ display: 'flex', flexGrow: 1 }} />

      {/* Footer · CTA pill */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          width: '100%',
        }}
      >
        <div style={{ display: 'flex', fontSize: 22, opacity: 0.6 }}>desliza →</div>
        {content.cta ? (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px 36px',
              fontSize: 28,
              fontWeight: 600,
              backgroundColor: b.accent,
              color: b.textOnPrimary,
              borderRadius: 999,
            }}
          >
            {content.cta}
          </div>
        ) : null}
      </div>
    </div>
  )
}
