/**
 * FacebookFeed · 1200 x 630 (1.91:1 landscape)
 *
 * Two-column-ish layout · brand/logo left band + content right. Wider
 * format so headlines breathe. Slide indicator bottom-right when part
 * of a carousel.
 */
import { resolveBrand, fitHeadlineSize } from './shared'
import type { TemplateProps } from '../types'

export function FacebookFeed({ brand, content, slide_index, total_slides }: TemplateProps) {
  const b = resolveBrand(brand)
  const W = 1200
  const H = 630
  const headlineSize = fitHeadlineSize(content.headline, {
    canvasWidth: 720,
    minSize: 40,
    maxSize: 72,
    targetLines: 3,
  })

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'row',
        width: W,
        height: H,
        backgroundColor: b.surface,
        color: b.textOnSurface,
        fontFamily: b.fontFamily,
      }}
    >
      {/* Left band · brand color */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          width: 360,
          height: H,
          padding: 48,
          backgroundColor: b.primary,
          color: b.textOnPrimary,
          backgroundImage: `linear-gradient(180deg, ${b.primary}, ${b.secondary})`,
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {b.logoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={b.logoUrl} alt="logo" width={120} height={120} style={{ borderRadius: 16, marginBottom: 20 }} />
          ) : null}
          <div style={{ display: 'flex', fontSize: 24, fontWeight: 600, opacity: 0.92 }}>{b.brandHandle}</div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          {content.eyebrow ? (
            <div
              style={{
                display: 'flex',
                fontSize: 18,
                fontWeight: 700,
                color: b.accent,
                textTransform: 'uppercase',
                letterSpacing: 3,
                marginBottom: 8,
              }}
            >
              {content.eyebrow}
            </div>
          ) : null}
          <div style={{ display: 'flex', fontSize: 20, opacity: 0.7 }}>
            slide {slide_index} de {total_slides}
          </div>
        </div>
      </div>

      {/* Right · content area */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          flexGrow: 1,
          height: H,
          padding: 48,
          justifyContent: 'center',
        }}
      >
        <div
          style={{
            display: 'flex',
            fontFamily: b.headlineFamily,
            fontSize: headlineSize,
            fontWeight: 700,
            lineHeight: 1.1,
            letterSpacing: -1,
            color: b.textOnSurface,
          }}
        >
          {content.headline}
        </div>
        {content.body ? (
          <div
            style={{
              display: 'flex',
              fontSize: 22,
              lineHeight: 1.45,
              opacity: 0.78,
              marginTop: 24,
              maxWidth: 720,
              color: b.textOnSurface,
            }}
          >
            {content.body}
          </div>
        ) : null}
        {content.cta ? (
          <div
            style={{
              display: 'flex',
              alignSelf: 'flex-start',
              alignItems: 'center',
              padding: '14px 28px',
              marginTop: 32,
              backgroundColor: b.primary,
              color: b.textOnPrimary,
              borderRadius: 8,
              fontSize: 20,
              fontWeight: 600,
            }}
          >
            {content.cta} →
          </div>
        ) : null}
      </div>
    </div>
  )
}
