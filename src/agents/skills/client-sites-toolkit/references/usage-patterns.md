# Usage Patterns · which component for which job

Decision matrix for every common landing section. Pair this with
`components-catalog.md` (inventory) and `anti-patterns.md` (don'ts).

---

## Hero

| Style intent | First-choice component | Notes |
|---|---|---|
| Editorial / image-first (Náufrago shape) | `next/image` full-bleed + Framer Motion stagger | Cheapest LCP · best for food, hospitality, lifestyle |
| Tech / SaaS / product | Aceternity `Spotlight` background | Mouse-follow radial gradient · feels "modern" |
| Premium / brand-led | Aceternity `BackgroundBeams` + Magic UI `AuroraText` | Animated SVG paths + gradient wordmark |
| Motion-led / launch | GSAP-pinned scroll sequence | Only when story demands it · costs LCP |
| 3D / interactive | Three.js scene | Only after confirming Three.js install + perf budget |

**Hero copy rules** (for marketing-content-creator):
- Heading: ≤7 words, display-serif weight, brand wordmark
- Subheading: 1 sentence, 8-18 words, value prop + audience
- CTA pair: primary action verb + secondary "ver más" / "menu" anchor

---

## Service / feature cards

| Quantity | First-choice |
|---|---|
| 2 items | shadcn `Card` × 2 in `grid-cols-2 gap-6` |
| 3 items | shadcn `Card` × 3 in `grid-cols-3 gap-6` |
| 4-6 items | Aceternity `BentoGrid` for asymmetric variety |
| 6+ items | shadcn `Card` × N in `grid-cols-2 lg:grid-cols-3` |
| Premium showcase | Aceternity `3DCard` (mouse-tilt) |

Each card has: image (next/image, aspect-4/3) + heading + 1-2 sentence
description + optional tag row (shadcn `Badge`) + optional per-card CTA.

---

## CTA buttons

| Tier | Component | Use when |
|---|---|---|
| Primary action | shadcn `Button` size=lg | Default · works for 90% of CTAs |
| Premium feel | Magic UI `ShimmerButton` | Limited per page (1-2 max · loses impact if overused) |
| WhatsApp / channel-specific | Custom `WhatsAppButton` (legacy) | Food, hospitality, B2C chat-led businesses |
| Ghost / outline | shadcn `Button` variant=outline | Secondary scroll-to or "ver más" |
| Link-style | shadcn `Button` variant=link | Inline CTAs in prose |

---

## Scroll-reveal animations

| Pattern | Component / lib |
|---|---|
| Single element fade-up on view | Framer Motion `whileInView` (canonical) |
| Wrapped reveal of arbitrary children | Magic UI `BlurFade` |
| Word-by-word scroll-driven reveal | Magic UI `TextReveal` |
| Pinned multi-step sequence | GSAP `ScrollTrigger` |
| Staggered list reveal | Framer Motion children variants OR Magic UI `AnimatedList` |

Mix at most ONE animation system per section. Never wrap a Magic UI
component in a Framer `motion.div` · it already animates internally.

---

## Contact form

| Need | Component |
|---|---|
| Field | shadcn `Input` (text/email/tel) + shadcn `Label` |
| Multi-line | shadcn `Textarea` + shadcn `Label` |
| Schema validation wrapper | shadcn `Form` (uses react-hook-form) |
| Submit feedback | shadcn `Sonner` toast on success |
| Anti-spam | Cloudflare Turnstile (HALT · not installed · brief: post-launch) |

For Náufrago and other WhatsApp-led businesses, the contact form may be
deferred entirely · the `WhatsAppButton` IS the contact path.

---

## Loading states

- Shimmer placeholders: shadcn `Skeleton`
- Inline spinners: Lucide `Loader2` with `animate-spin`
- Page-level: skeleton + suspense boundary

---

## Modals & overlays

| Need | Component |
|---|---|
| Centered confirm / video embed | shadcn `Dialog` |
| Side panel · mobile menu, filters | shadcn `Sheet` |
| Toast notification | shadcn `Sonner` |

---

## Icons

`lucide-react` only. Default size:
- Inline body text: 16px (`h-4 w-4`)
- Buttons: 20px (`h-5 w-5`)
- Standalone illustration: 24-32px

Never mix Heroicons / Tabler / FontAwesome / phosphor with Lucide. Pick one
icon family per project · this skill mandates Lucide.

---

## Tabs / accordion / disclosure

| Need | Component |
|---|---|
| Toggleable sections (FAQ, expandable) | shadcn `Accordion` |
| Side-by-side switchable views (pricing freq) | shadcn `Tabs` |
| Section dividers | shadcn `Separator` |

---

## Marquee / logo strips

- Magic UI `Marquee` for infinite horizontal scroll
- Pair with grayscale logos (next/image) + max-h-12

---

## 3D / WebGL

Only recommend if:
1. The brief explicitly asks for 3D
2. The user confirms Three.js is installed (it's NOT in the repo by default)
3. The perf budget allows ~200KB bundle increase

Default to a flat image with subtle animation (Framer or Spotlight) for
any "wow factor" ask · 3D is premium-tier-only.

---

## Brand theming

Theme tokens live in `app/globals.css` as HSL custom properties:

```css
:root {
  --background: <h s% l%>;
  --foreground: <h s% l%>;
  --primary: <h s% l%>;
  --accent: <h s% l%>;
  --muted: <h s% l%>;
  --border: <h s% l%>;
  --radius: 0.5rem;
}
```

Per-client overrides go in this file ONLY. Component code uses:

```tsx
className="bg-primary text-primary-foreground"
```

NEVER:

```tsx
className="bg-[#0a3] text-white"   // ❌ blocks per-client override
```

Náufrago palette: ocean blue primary (`207 70% 22%`) + sand background
(`36 33% 97%`) + coral accent (`16 84% 56%`).
