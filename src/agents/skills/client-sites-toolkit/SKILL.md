---
name: client-sites-toolkit
description: "When designing, planning, or producing copy for a client landing page in the `client-sites` repo (https://github.com/emilacho/client-sites). Use this skill whenever the user mentions 'landing page', 'web design para cliente', 'hero section', 'shadcn component', 'Aceternity', 'Magic UI', 'Framer Motion', 'GSAP animation', 'Lucide icon', '3D scene', or any output that will end up rendered on a Next.js 15 client site. Tells you which components are actually installed in the repo so you don't recommend things that don't exist."
metadata:
  version: 1.0.0
  source: "PR #4 emilacho/client-sites · merge 6c237bf · 2026-05-16"
---

# Client Sites Toolkit

You are working in the `client-sites` repository (Zero Risk's cliente-agnostic
Next.js 15 template). Before you design a section, recommend a visual
pattern, or write copy that anchors to a specific UI behavior, **check what
is actually installed**. The full inventory and usage patterns live in this
skill's `references/` folder · do not invent component names.

## Purpose

Three failure modes this skill prevents:

1. **Hallucinated components.** Recommending `<MagicCard>` or `<Hero3D>`
   when the repo doesn't have them.
2. **Mixed animation runtimes.** Stacking Framer Motion + GSAP + CSS keyframes
   on the same component · tied a render thrashing in past landings.
3. **Theme drift.** Hardcoding `bg-blue-500` instead of the HSL custom
   property tokens (`hsl(var(--primary))`) that per-client overrides depend on.

## When to use this skill

- The user request mentions a landing page, hero, section, CTA, contact
  form, or any visible component on a `client-sites` deploy.
- You're being asked to write copy that will be paired with a specific
  component (e.g., "CTA copy para shimmer button").
- You're producing a visual direction brief or image prompt for the GPT
  Image wrapper · the prompt should align with the components the section
  will actually use.
- A workflow handoff arrives with `available_tools: client-sites-toolkit`
  in the context · always invoke then.

## Available references

| File | When to read it |
|---|---|
| `references/components-catalog.md` | Every time · concrete inventory of every component that exists in the repo right now. |
| `references/usage-patterns.md` | When deciding which component a section should use (hero · cards · CTA · scroll reveal · modals · icons). |
| `references/anti-patterns.md` | Before shipping recommendations · sanity-check against documented mistakes. |

## Quick examples · landing patterns

### Pattern · "ghost kitchen / food delivery" (Náufrago shape)
- Hero · full-bleed `next/image` + dark gradient overlay + Framer Motion
  staggered fade-in + WhatsApp CTA pill (custom, not shadcn)
- Menu cards · `next/image` aspect-4/3 inside a div with rounded-2xl border ·
  scroll-reveal via Framer Motion `whileInView`
- About · two-col grid with Framer slide-in from sides
- CTA strip · primary-colored band, Framer scale-from-0.97
- Footer · 3-col grid, static (no animation noise below the fold)
- Brand tokens · ocean blue primary, sand background, coral accent
- Anchor · this is the Náufrago landing that shipped at
  https://client-sites-template-nnu5wjbi6-zero-risk1.vercel.app

### Pattern · "B2B SaaS feature page"
- Hero · Aceternity `Spotlight` for the radial-gradient mouse-follow effect
- Feature grid · Aceternity `BentoGrid` for asymmetric tiles
- Trust strip · shadcn `Badge` row + Lucide icons + Magic UI `Marquee` for
  logo rolling
- Demo embed · shadcn `Dialog` for inline video modal
- Pricing · shadcn `Card` × 3 + shadcn `Tabs` for monthly/annual toggle
- CTA · Magic UI `ShimmerButton` for the primary action

### Pattern · "agency / portfolio"
- Hero · Aceternity `BackgroundBeams` + Magic UI `AuroraText` for the brand wordmark
- Projects · Aceternity `3DCard` per case study (hover tilt)
- Process · GSAP `ScrollTrigger`-pinned section, step-by-step reveal
- Contact · shadcn `Form` + shadcn `Input`/`Textarea`/`Label`/`Button`

### Pattern · "subtle motion-first product launch"
- Hero · Three.js scene only if the brief is "premium" tier (cost: bundle
  size and LCP impact)
- Body sections · all Framer Motion `whileInView` · don't mix in GSAP
- Hover micro-interactions · shadcn `Button` defaults + Magic UI
  `ShimmerButton` for the primary

### Pattern · "loading-heavy / data-driven"
- Skeletons · shadcn `Skeleton` (mandatory before content lands)
- Toasts · shadcn `Sonner` for confirmations · `Toast` for errors
- Modals · shadcn `Sheet` for side panels, `Dialog` for centered

## Output guidance for downstream agents

When you produce a section spec, name the components explicitly:

> "Hero section · Aceternity `Spotlight` as the background, Magic UI
> `BlurFade` wrapping the heading + subheading + CTA group with 80ms
> stagger, shadcn `Button` size=lg for the primary CTA."

NOT:

> "A modern hero with a cool gradient and animated text and a big button."

When you produce GPT Image prompts, align the imagery with the component
context. If the hero uses `Spotlight` (which adds its own light glow), don't
also bake a strong rim light into the AI-generated photo · they'll fight.

## Anti-patterns (skim before every output)

- **Don't** recommend `aceternity-sparkles` · it was dropped in PR #4 due
  to an upstream `@tsparticles/react` API incompatibility.
- **Don't** recommend `Spline 3D` for production until the user confirms a
  Spline Pro key has been provisioned · it's flagged HALT in
  `client-sites/docs/CANON_STACK.md`.
- **Don't** mix Framer Motion + GSAP on the same DOM node · pick one per
  section.
- **Don't** hand-roll classes that override the theme (`bg-[#0a3]` etc.) ·
  use `hsl(var(--primary))` so per-client overrides keep working.
- **Don't** import shadcn from `@/components/ui/button` · the alias is
  `@/components/shadcn/button` in this repo (see `components.json`).
- **Don't** invent components. If you're not sure something exists, read
  `references/components-catalog.md` first.
