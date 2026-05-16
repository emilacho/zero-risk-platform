# Components Catalog · `client-sites` repo

Authoritative inventory of every UI component, animation library, and
icon set installed in `emilacho/client-sites`. Source of truth: PR #4
merge commit `6c237bf` (2026-05-16).

If you're about to recommend a component, it must appear in this file.

---

## shadcn/ui (14 components)

Path: `components/shadcn/` · alias `@/components/shadcn/<name>`

| Component | File | Typical use |
|---|---|---|
| Button | `button.tsx` | Primary CTA, secondary actions, form submit |
| Card | `card.tsx` | Feature cards, pricing tiers, content blocks |
| Input | `input.tsx` | Text/email/tel fields |
| Textarea | `textarea.tsx` | Message body, long-form input |
| Label | `label.tsx` | Form labels (always pair with Input/Textarea) |
| Separator | `separator.tsx` | Section dividers, list separators |
| Dialog | `dialog.tsx` | Centered modal · video demo, confirm action |
| Accordion | `accordion.tsx` | FAQ, expandable sections |
| Tabs | `tabs.tsx` | Pricing monthly/annual, feature comparison |
| Skeleton | `skeleton.tsx` | Loading placeholders before data lands |
| Badge | `badge.tsx` | Status pills, tag chips, "new" markers |
| Sonner | `sonner.tsx` | Toast notifications (confirmations) |
| Form | `form.tsx` | react-hook-form wrapper · structured forms |
| Sheet | `sheet.tsx` | Side panel modal (mobile menu, filters) |

Theme: HSL CSS custom properties · `--primary`, `--background`,
`--muted`, `--accent`, `--border`, `--radius`. Configured in
`app/globals.css` per client. NEVER hardcode hex/rgb in className.

---

## Aceternity UI (6 components installed · 1 deferred)

Path: `components/ui/` · alias `@/components/ui/<name>`

| Component | File | Typical use | Notes |
|---|---|---|---|
| Spotlight | `spotlight.tsx` | Hero backgrounds · radial-gradient mouse-follow | High visual impact · use sparingly |
| 3D Card | `3d-card.tsx` | Case study cards, product showcases | Mouse-tilt perspective · disable on mobile if hurts UX |
| Animated Tooltip | `animated-tooltip.tsx` | Team avatars, contributor strips | Has inline `<img>` not `next/image` |
| Background Beams | `background-beams.tsx` | Hero backgrounds (alternative to Spotlight) | Animated SVG paths |
| Bento Grid | `bento-grid.tsx` | Asymmetric feature grids, dashboards | Pairs well with shadcn Card inside cells |
| Meteors | `meteors.tsx` | Hero accents (falling streaks) | Performance-friendly · 20 elements default |
| ~~Sparkles~~ | DEFERRED | — | Upstream `@tsparticles/react` API incompatible · don't recommend until Aceternity refresh |

These use `framer-motion` under the hood · don't double-wrap them in your
own `<motion.div>`.

---

## Magic UI (6 components)

Path: `components/shadcn/` (same dir as shadcn primitives · alias
`@/components/shadcn/<name>`)

| Component | File | Typical use |
|---|---|---|
| Blur Fade | `blur-fade.tsx` | Wrap any element · `whileInView` blur+opacity reveal |
| Animated List | `animated-list.tsx` | Notification feeds, testimonials marquee |
| Marquee | `marquee.tsx` | Logo strips, "as featured in" sections |
| Text Reveal | `text-reveal.tsx` | Scroll-driven word-by-word reveal |
| Shimmer Button | `shimmer-button.tsx` | Premium CTA · shine sweep on hover |
| Aurora Text | `aurora-text.tsx` | Gradient brand wordmark (rename of "gradient-text") |

Magic UI mutates `app/globals.css` to add their keyframes · review the
globals after `pnpm dlx shadcn@latest add https://magicui.design/r/<x>.json`.

---

## Lucide React (icons)

Package: `lucide-react@^0.469`

Import per icon: `import { ChevronRight, Mail, Phone } from "lucide-react"`

Use this for ALL icons · don't mix in Heroicons, Tabler, Font Awesome, etc.
Default size: 16px (h-4 w-4) · 20px (h-5 w-5) for buttons.

Common picks:
- `ArrowRight`, `ChevronRight`, `ChevronDown` · navigation
- `Mail`, `Phone`, `MessageCircle`, `MapPin` · contact
- `Check`, `X`, `AlertCircle`, `Info` · status
- `Menu`, `Search` · navigation
- `Star`, `Heart`, `Sparkles` · social proof

---

## Framer Motion (declarative animations)

Package: `framer-motion@^11`

Use for: section-level reveals (`whileInView`), staggered children, hover
states with state-driven animation.

Patterns the existing landing uses:

```tsx
<motion.h1
  initial={{ opacity: 0, y: 24 }}
  animate={{ opacity: 1, y: 0 }}
  transition={{ duration: 0.7, ease: "easeOut" }}
>
```

For scroll-triggered:

```tsx
<motion.div
  initial={{ opacity: 0, y: 24 }}
  whileInView={{ opacity: 1, y: 0 }}
  viewport={{ once: true, margin: "-80px" }}
  transition={{ duration: 0.6, ease: "easeOut" }}
>
```

---

## GSAP (imperative animations + ScrollTrigger)

Package: `gsap@^3.13` · includes `ScrollTrigger` plugin.

Use for: pinned scroll sequences, timeline-orchestrated multi-element
animations, anything where Framer Motion's declarative model gets clunky.

Always register inside `useEffect` and clean up on unmount:

```tsx
"use client"
import { useEffect, useRef } from "react"
import gsap from "gsap"
import { ScrollTrigger } from "gsap/ScrollTrigger"

export function PinnedSection() {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    gsap.registerPlugin(ScrollTrigger)
    const ctx = gsap.context(() => { /* timelines */ }, ref)
    return () => ctx.revert()
  }, [])
  return <div ref={ref}>{/* ... */}</div>
}
```

DON'T import GSAP at module top-level · breaks Next.js SSR.

---

## Custom utility primitives (legacy, kept)

Path: `components/ui/<PascalCase>.tsx` · still imported by the live
Náufrago landing. Do NOT remove or refactor until master workflow v1 ships:

- `Button.tsx` · custom Tailwind-utility button
- `Input.tsx` · custom input + textarea + label
- `WhatsAppButton.tsx` · branded WhatsApp CTA with inline SVG logo

These coexist with shadcn variants (`button.tsx` lowercase in
`components/shadcn/`). When generating new sections, prefer shadcn variants
· when touching the live Náufrago, keep the custom ones.

---

## What is NOT installed

If you see these recommended in older briefs or templates, they're absent
in this repo as of 2026-05-16:

- **Spline 3D** · HALT · awaiting Spline Pro key (`SPLINE_API_KEY`)
- **Google Stitch SDK** · HALT · awaiting Google Cloud credential
- **21st.dev** · per-component copy-paste only · no NPM, no bulk install
- **Three.js / react-three-fiber** · not installed despite STACK_FINAL_V3
  mention · recommend only if user explicitly confirms · install would be
  `pnpm add three @react-three/fiber @react-three/drei`
- **Tailwind CSS plugins** (forms, typography) · base `tailwindcss@^4`
  only · request before assuming `prose` or `form-input` utilities work
- **shadcn `Toast`** · `Sonner` is the canonical toast lib in this repo
- **aceternity-sparkles** · upstream broken (see catalog above)
