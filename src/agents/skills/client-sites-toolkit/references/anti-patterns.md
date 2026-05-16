# Anti-Patterns · what NOT to recommend

Skim this list before every output that touches the `client-sites` repo.
Every entry here is something that broke or wasted time in a past run.

---

## Component-level

### ❌ Recommending components that don't exist

The repo's `package.json` + `components/shadcn/` + `components/ui/` is
finite. If you can't find the component name in `components-catalog.md`,
it isn't installed. Don't invent. Don't pattern-match from older briefs.

Common hallucinations to avoid:
- `<MagicCard>` (not in Magic UI · use shadcn `Card`)
- `<Hero3D>` / `<Scene3D>` (no Three.js installed)
- `<Spline>` (HALT · no Spline key)
- `<AceternityCard>` (Aceternity's card is named `3DCard` · check)
- shadcn `Toast` (deprecated · use `Sonner`)

### ❌ Recommending `aceternity-sparkles`

It was dropped in PR #4 due to an incompatible `@tsparticles/react` API.
The export shape, init function, and option types all mismatch our strict
TS config. Use `meteors`, `background-beams`, or Framer Motion particles
if you need ambient motion.

### ❌ Recommending Spline 3D before key is provisioned

`SPLINE_API_KEY` is not in `.env.local`. The Spline Pro subscription is
flagged HALT in `client-sites/docs/CANON_STACK.md`. Don't include Spline
in section specs · flag the gap if the brief demands 3D.

### ❌ Recommending Three.js without confirming install

`three` and `@react-three/fiber` are NOT installed by default. If the
brief calls for 3D, FIRST flag the gap, then propose flat alternatives
(Spotlight, Beams) as the default deliverable.

---

## Animation runtime

### ❌ Mixing Framer Motion + GSAP on the same DOM node

They both manipulate transform/opacity · they fight. Pick ONE per section.
Rule of thumb: Framer for declarative state-driven; GSAP for imperative
pinned/multi-step.

### ❌ Wrapping Magic UI components in your own `<motion.div>`

`BlurFade`, `TextReveal`, `ShimmerButton`, `Marquee` all animate
internally. Double-wrapping causes jank.

### ❌ Wrapping Aceternity components in your own `<motion.div>`

Same reason · `3DCard`, `Spotlight`, `BackgroundBeams`, `Meteors`, and
`AnimatedTooltip` all use `framer-motion` under the hood.

### ❌ Importing GSAP at module top-level

Next.js SSR breaks · GSAP touches `window`. Always:

```tsx
useEffect(() => {
  gsap.registerPlugin(ScrollTrigger)
  // ...
}, [])
```

---

## Theming

### ❌ Hardcoding colors in className

```tsx
className="bg-[#1a3b5c] text-white"   // ❌
className="bg-blue-500 text-white"    // ❌
```

Use the HSL custom property tokens:

```tsx
className="bg-primary text-primary-foreground"   // ✅
```

Per-client overrides only work if you respect this contract.

### ❌ Adding new Tailwind utilities mid-flight

`@tailwindcss/forms`, `@tailwindcss/typography` are NOT installed. If you
need `prose` or `form-input` classes, request the install first, don't
assume.

### ❌ Adding global CSS rules to override component styles

Edit theme tokens, not specificity wars. If shadcn `Button` doesn't look
right, fix `--primary` or pick a variant · don't `!important` your way
through.

---

## Imports

### ❌ Using the default shadcn alias `@/components/ui/<x>`

In this repo the alias is `@/components/shadcn/<x>`. The `components/ui/`
folder hosts Aceternity components and legacy custom primitives. Mixing
them up = import not found / wrong component renders.

Wrong:
```tsx
import { Button } from "@/components/ui/button"  // ❌ doesn't exist
```

Right:
```tsx
import { Button } from "@/components/shadcn/button"   // ✅ shadcn variant
import { Button } from "@/components/ui/Button"        // ✅ legacy custom (PascalCase)
```

The lowercase/PascalCase difference matters on Linux (Vercel builds).

### ❌ Importing from `@radix-ui/react-*` directly

Radix is a peer dep · you should always use the shadcn wrapper. Direct
Radix imports bypass our theming and break consistency.

---

## Copy / CTA pairing

### ❌ Generic CTAs that don't match the component behavior

If the CTA is a `ShimmerButton` (Magic UI · premium feel), don't write
"Click here" · write something that earns the visual treatment. Generic
copy on a premium button feels worse than plain copy on a plain button.

### ❌ Pluralizing things the client didn't say

If the IG scrape or brief lists "ceviche · encebollado", don't write
"our menu of 12+ dishes". Stay literal. Make the constraint a feature
("dos clásicos hechos como deben hacerse" beats "extensive menu").

### ❌ Inventing testimonials, reviews, social proof

If the scrape didn't surface them, don't fabricate. Either omit the
testimonials section entirely or flag the gap for the user to fill in.

---

## Image / GPT Image prompts

### ❌ Stacking competing light sources

If the hero uses Aceternity `Spotlight` (which adds its own light glow),
don't bake a strong rim light into the GPT Image prompt · they'll fight
visually. Match the prompt to the component's existing light direction.

### ❌ Ignoring brand color tokens in image prompts

When generating a hero image for a brand with ocean blue primary, prompt
the GPT Image wrapper with "cool tones · deep blue accents" · not generic
"warm sunlight". Image must integrate with the theme.

### ❌ Generating images bigger than the section needs

`/api/images/generate` defaults to 1024×1024. Don't ask for `1536x1024`
unless the section actually displays landscape. Costs $0.06 vs $0.04 with
no visual win.

---

## Workflow / agent handoff

### ❌ Producing output without naming components

Section specs that say "a hero with a cool gradient" force the next agent
to re-decide. Name the components explicitly: "Hero · Aceternity
`Spotlight` + Magic UI `BlurFade` + shadcn `Button size=lg`".

### ❌ Recommending content the next agent can't produce

If you're the creative-director and you spec "live video background", the
GPT Image wrapper can't generate that · it's a still-image-only service.
Stay within tool capabilities.

### ❌ Ignoring the `available_tools` context input

When a workflow invokes you with `available_tools: client-sites-toolkit`
in the context, you MUST consult this skill before outputting. Don't fall
back to generic web design recommendations.
