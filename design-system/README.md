# Zero Risk · Design System · Tokens

Canonical token system for every Zero Risk surface · landing pages · Mission
Control dashboard · client deliverables. Source of truth for color, spacing,
typography, motion, radius, shadow, breakpoint, and z-index.

**Path** · `zero-risk-platform/design-system/`
**Canonical source** · `tokens.json`
**CSS consumer** · `tokens.css` (CSS custom properties)
**TypeScript consumer** · `tokens.ts` (typed const exports)
**Tailwind consumer** · `tailwind.config.ts` (extends from `tokens.ts`)

## Principle

Tokens are SOURCE OF TRUTH. Components reference tokens. Brand customization
happens ONLY at the token layer. If a hex code lives anywhere outside
`tokens.json`, that's a violation — fix it.

This mirrors how Stripe Press, Linear, Vercel, and Resend operate. Token layer
is the only API surface for brand. Everything downstream consumes from it.

## Quick reference

| Surface | Use | Example |
|---|---|---|
| Color ramps | 9 ramps × 9 stops = 81 colors | `bg-primary-700`, `text-accent-500`, `border-neutral-200` |
| Spacing | 10 stops (4px base) | `p-4` (16px), `gap-5` (24px) |
| Typography | display / heading / body / mono | `font-display text-display-lg` |
| Motion | 6 easings, 5 durations, 3 staggers | `transition-all duration-medium ease-out-expo` |
| Radius | 7 stops + full | `rounded-lg` (12px), `rounded-full` |
| Shadow | 5 elevations + 2 neon | `shadow-medium`, `shadow-neon-cyan` |

## Color ramps

Each ramp has 9 stops (100–900) anchored at a canonical brand stop.

| Ramp | Anchor | Hex | Use |
|---|---|---|---|
| `primary` | 700 | `#3D2466` | Zero Risk violet · brand · headers · primary CTAs |
| `accent` | 400 | `#4DD4D8` | Zero Risk cyan · accents · highlights · success-leaning info |
| `neutral` | 500 | `#64748B` | Slate · body text · borders · backgrounds |
| `success` | 500 | `#00D084` | Emerald · "all clear" states |
| `warning` | 500 | `#F59E0B` | Amber · attention-needed states |
| `danger` | 500 | `#FF3366` | Crimson · errors · destructive actions |
| `info` | 400 | `#4DD4D8` | Alias of accent · info banners · neutral notices |
| `surface` | n/a | light/dark pair | Background · elevated · overlay · borders |
| `text` | n/a | light/dark pair | Primary · secondary · tertiary · inverse · on-primary · on-accent |

### Why these anchors?

- **Primary at 700** · `#3D2466` is a deep, saturated violet. Generating 9 stops
  by lightening (100–600) and darkening (800–900) preserves the brand at its
  natural position rather than forcing it into a 500 base that would have to
  lighten substantially.
- **Accent at 400** · `#4DD4D8` is a mid-light cyan. Anchored at 400, the ramp
  has room to go both bolder (500–900) and softer (100–300).
- **Semantic at 500** · success/warning/danger anchor at the conventional 500
  base, allowing 100–400 for subtle backgrounds and 600–900 for emphatic text.

## Spacing

10 stops on a 4px base grid:

```
0:  0
1:  4px
2:  8px
3: 12px
4: 16px
5: 24px
6: 32px
7: 48px
8: 64px
9: 96px
10: 128px
```

Matches the Refactoring UI 4px-base recommendation. Use the named stop, not the
raw pixel value · the stop number is what stays canonical across surfaces.

## Typography

Four families, each with a defined size/line-height ladder:

### Display · `Space Grotesk Bold`

Hero copy, landing page banners, dashboard hero metrics.

| Stop | Size | Line height | Tracking |
|---|---|---|---|
| `sm` | 32px | 34px | -0.02em |
| `md` | 48px | 50px | -0.02em |
| `lg` | 64px | 67px | -0.02em |
| `xl` | 80px | 84px | -0.02em |
| `2xl` | 96px | 100px | -0.02em |

### Heading · `Inter Bold`

Section titles, card titles, modal headers.

| Stop | Size | Line height | Tracking |
|---|---|---|---|
| `sm` | 20px | 24px | -0.01em |
| `md` | 24px | 29px | -0.01em |
| `lg` | 28px | 33px | -0.01em |
| `xl` | 32px | 38px | -0.01em |

### Body · `Inter Regular`

Paragraphs, descriptions, labels.

| Stop | Size | Line height |
|---|---|---|
| `sm` | 14px | 20px |
| `md` | 16px | 24px |
| `lg` | 18px | 29px |

### Mono · `JetBrains Mono Regular`

Code, IDs, numeric data, timestamps.

| Stop | Size | Line height |
|---|---|---|
| `sm` | 12px | 18px |
| `md` | 14px | 21px |
| `lg` | 16px | 24px |

## Motion

Five easing curves, five duration buckets, three stagger gaps, three spring
configurations. Choose by INTENT, not by aesthetic preference.

### Easing curves

| Token | Cubic-bezier | Intent |
|---|---|---|
| `easeOutExpo` | `(0.16, 1, 0.3, 1)` | Entrances · default · fast settle |
| `easeInOutCubic` | `(0.65, 0, 0.35, 1)` | Bidirectional transitions · navigation |
| `easeOutBack` | `(0.34, 1.56, 0.64, 1)` | Pop-in · slight overshoot · CTAs |
| `easeOutBounce` | `(0.68, -0.55, 0.27, 1.55)` | Playful · use sparingly |
| `easeOutQuad` | `(0.5, 1, 0.89, 1)` | Subtle · micro-interactions |
| `linear` | `linear` | Parallax · marquees · scroll-tied |

### Durations

| Token | Value | Use |
|---|---|---|
| `instant` | 0ms | Skip animation · accessibility · immediate state |
| `fast` | 150ms | Hover, focus, checkbox tick |
| `medium` | 300ms | Default · card lift, button press, modal open |
| `slow` | 500ms | Section entrance, deliberate reveal |
| `cinematic` | 800ms | Hero curtain, page load reveal |

### Stagger

| Token | Gap | Use |
|---|---|---|
| `tight` | 60ms | Dense lists, table rows |
| `default` | 100ms | Card grids, feature lists |
| `loose` | 150ms | Hero composition, emphatic reveals |

### Spring (Framer Motion)

| Token | Config | Feel |
|---|---|---|
| `snap` | `{stiffness: 300, damping: 25}` | Interactive snap · default UI |
| `soft` | `{stiffness: 180, damping: 30}` | Gentle settle |
| `bouncy` | `{stiffness: 400, damping: 18}` | Playful · CTAs |

### Reduced motion

`tokens.css` includes `@media (prefers-reduced-motion: reduce)` overrides that
halve standard durations and collapse springy easings to linear. Components
that respect the cascading variables get accessibility for free.

## Radius

| Token | Value | Use |
|---|---|---|
| `none` | 0 | Sharp · technical UI |
| `sm` | 4px | Small inputs, tags |
| `md` | 8px | Default · cards, buttons |
| `lg` | 12px | Larger cards, modals |
| `xl` | 16px | Hero cards, banners |
| `2xl` | 24px | Floating modals |
| `3xl` | 32px | Bento, statement surfaces |
| `full` | 9999px | Pill, avatar, circular icon |

## Shadow

| Token | Use |
|---|---|
| `none` | Flat surface |
| `subtle` | Resting card |
| `medium` | Hovered card, raised button |
| `strong` | Modal, popover, dropdown |
| `neon-violet` | Hero hero-CTA glow, primary cinematic accent |
| `neon-cyan` | Accent emphasis, agent-active state, success cinematic |

Dark mode automatically deepens the shadow opacity (see `tokens.css`).

## Consumption examples

### CSS

```css
.hero {
  color: var(--zr-color-primary-700);
  padding: var(--zr-space-7);
  font-family: var(--zr-font-display);
  font-size: var(--zr-text-display-xl);
  line-height: var(--zr-text-display-lh-xl);
  letter-spacing: var(--zr-text-display-tracking);
  transition:
    opacity var(--zr-duration-medium) var(--zr-easing-easeOutExpo),
    transform var(--zr-duration-medium) var(--zr-easing-easeOutBack);
  border-radius: var(--zr-radius-xl);
  box-shadow: var(--zr-shadow-neon-violet);
}
```

### TypeScript / React

```ts
import { tokens, colors, motion } from '@/design-system/tokens'

const styles = {
  background: colors.primary[700],
  padding: tokens.spacing[5],
  transition: `opacity ${motion.duration.medium} ${motion.easing.easeOutExpo}`,
}
```

### Framer Motion

```tsx
import { motion as fm } from 'framer-motion'
import { motion as tokensMotion } from '@/design-system/tokens'

<fm.div
  initial={{ opacity: 0, y: 16 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{
    duration: tokensMotion.durationMs.medium / 1000,
    ease: [0.16, 1, 0.3, 1], // easeOutExpo
  }}
/>
```

### Tailwind classes (after `tailwind.config.ts` extend)

```tsx
<button className="bg-primary-700 hover:bg-primary-600 text-on-primary px-5 py-3 rounded-lg shadow-medium transition duration-medium ease-out-expo">
  Empezar
</button>
```

## Dark mode

Strategy is **next-themes attribute** (recommended) or **class** (legacy).
`tokens.css` ships overrides for both. Activation:

```tsx
// app/layout.tsx
import { ThemeProvider } from 'next-themes'

<ThemeProvider attribute="data-theme" defaultTheme="light" enableSystem>
  {children}
</ThemeProvider>
```

Surface and text tokens auto-swap. Color ramps stay constant (each stop is
already calibrated for both modes via the lightness ladder).

## Guardrails

1. **Never hardcode a hex** outside `tokens.json`. Run
   `grep -RnoE '#[0-9A-Fa-f]{6}' src/` periodically · any match in app code is
   a violation.
2. **Never invent a new token in app code.** If a hex you need doesn't exist,
   add a new stop or ramp to `tokens.json` and regenerate the consumers.
3. **Semantic color names beat literal ones.** `bg-primary-700` not
   `bg-violet-900`. The point is brand swap-ability per cliente without
   rewriting components.
4. **Per-cliente brand override is a token-layer concern.** Future
   `cliente.config.ts` will swap the primary/accent ramps via CSS variable
   re-binding · the components don't care.

## Changelog

- **2026-05-17** · v1.0.0 · CC#2 initial implementation · D1 designer-quality
  10K plan execution.

## Related

- Source plan · `zr-vault/raw/state/2026-05-16-designer-quality-10k-plan-D1-D8.md`
- Audit doc · `zr-vault/raw/state/2026-05-17-design-tokens-canonical-implemented.md`
- D2 (next) · component library production-grade
