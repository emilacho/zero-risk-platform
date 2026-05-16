# `@zero-risk/dashboard-components`

Component catalog for the new Mission Control dashboard. Prepped in parallel
with the CC#1 scaffold — once the dashboard host lands, drop these in.

## What's inside

### Tremor-style data viz (12 components)

| # | Component | Purpose |
|---|---|---|
| 1 | `KpiCard` | Atomic single-metric card · delta % · sparkline slot |
| 2 | `KpiGrid` | 4-up grid wiring agentes / clientes / spend / workflows |
| 3 | `BarListTopAgents` | Horizontal bar list · top N agents by cost |
| 4 | `LineChartCostTimeline` | Area-line over cost-per-day series |
| 5 | `ActivityFeed` | Time-ordered stream of `agent_invocations` |
| 6 | `SparklineAgentStats` | Single-agent micro-sparkline w/ trend label |
| 7 | `SparklineGrid` | Many-agent grid of sparklines (overview view) |
| 8 | `BentoGrid` | Layout primitive · 12-col bento grid for the dashboard |
| 9 | `CubiculoCard` | Collapsed agent detail card · "cubículo del agente" |
| 10 | `ClienteCarpetaCard` | Cliente folder card · KPIs + last activity |
| 11 | `MemoryGraph` | ReactFlow canvas · client-centric memory web |
| 12 | `MemoryNodes` | Custom node renderers (cliente · agent · workflow · tool) |

### Theme

`src/theme/` ships dark-mode tokens with violet `#7c3aed` primary + cyan
`#06b6d4` accent. Tailwind-friendly CSS variables + a plain TS object so
host apps can wire either Tailwind config or `style={...}` direct.

### Fixtures

`src/fixtures/` ships realistic placeholder data per component so the
showcase renders without backend wiring.

### Showcase

`showcase/page.tsx` renders every component on one dark page (Next.js
App Router compatible · drop into any `app/<route>/page.tsx`).

## Install

When the dashboard host is ready, from the project root:

```bash
pnpm add @xyflow/react recharts   # peer deps the components need
```

Then import directly:

```tsx
import { KpiGrid, MemoryGraph } from '@zero-risk/dashboard-components'
import { agentInvocationFixture } from '@zero-risk/dashboard-components/fixtures'
import { theme } from '@zero-risk/dashboard-components/theme'
```

## Design references

- Tremor blocks · https://blocks.tremor.so (MIT · we copied patterns, not the package)
- Tremor catalog · https://tremor.so
- ReactFlow examples · https://reactflow.dev/examples
- Dark + violet + cyan refs · Dribbble dashboards (per dispatch)

## Status

- [x] 12 components scaffolded with sample data
- [x] ReactFlow memory graph with custom node types
- [x] Dark theme tokens (violet + cyan) wired across all components
- [x] Showcase page ready
- [ ] **Integration with CC#1 scaffold** · pending CC#1 dashboard host landing
- [ ] **Backend wiring** · replace fixtures with real Supabase queries
- [ ] **Storybook / playground** · optional follow-up

Built by CC#4 · 2026-05-16 · parallel with CC#1 dashboard scaffold dispatch.
