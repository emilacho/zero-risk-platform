'use client'
/**
 * Mission Control Dashboard · component showcase.
 *
 * Drop into any Next.js App Router route as `app/<route>/page.tsx`.
 * Renders every component in the package with the fixture data so the
 * full visual surface is reviewable in one place.
 *
 * Once CC#1 lands the dashboard scaffold, wire the same components to
 * real Supabase queries by swapping the `*Fixture` imports for live
 * data hooks.
 */
import {
  ActivityFeed,
  BarListTopAgents,
  BentoGrid,
  ClienteCarpetaCard,
  CubiculoCard,
  KpiGrid,
  LineChartCostTimeline,
  MemoryGraph,
  SparklineGrid,
  theme,
  themeCssVars,
} from '../src'
import {
  agentInvocationFixture,
  agentSparklineFixture,
  clienteCarpetaFixture,
  costTimelineFixture,
  cubiculoFixture,
  kpiSnapshotFixture,
  memoryGraphFixture,
  topAgentsByCostFixture,
} from '../src/fixtures'

export default function DashboardShowcasePage() {
  return (
    <>
      <style>{themeCssVars}</style>
      <main
        style={{
          minHeight: '100vh',
          background: theme.colors.bg.base,
          color: theme.colors.fg.primary,
          padding: '2rem clamp(1rem, 4vw, 3rem)',
          fontFamily: theme.font.sans,
        }}
      >
        {/* Page header */}
        <header style={{ marginBottom: '2rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: theme.radius.full,
                background: `linear-gradient(135deg, ${theme.colors.primary[500]}, ${theme.colors.accent[500]})`,
                boxShadow: theme.shadow.glow,
              }}
            />
            <span style={{ color: theme.colors.fg.muted, fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              Mission Control · component showcase
            </span>
          </div>
          <h1 style={{ margin: 0, fontSize: 28, fontWeight: 600 }}>Zero Risk · dashboard catalog</h1>
          <p style={{ color: theme.colors.fg.secondary, fontSize: 14, marginTop: 6, maxWidth: 720 }}>
            12 Tremor-style components + ReactFlow memory graph prepped for the new dashboard scaffold.
            Tema oscuro · violeta {theme.colors.primary[500]} primario · cyan {theme.colors.accent[500]} accent.
          </p>
        </header>

        {/* KPI grid · top-of-dashboard */}
        <section style={{ marginBottom: '2rem' }}>
          <SectionTitle>1 · KPI cards · agentes · clientes · spend · workflows</SectionTitle>
          <KpiGrid snapshot={kpiSnapshotFixture} />
        </section>

        {/* Main bento · chart + bar list */}
        <section style={{ marginBottom: '2rem' }}>
          <SectionTitle>2 · Bento layout · chart 8 col + bar list 4 col</SectionTitle>
          <BentoGrid columns={12} gap={16}>
            <BentoGrid.Cell colSpan={8} rowSpan={2} minHeight={320}>
              <LineChartCostTimeline data={costTimelineFixture} />
            </BentoGrid.Cell>
            <BentoGrid.Cell colSpan={4} rowSpan={2}>
              <BarListTopAgents agents={topAgentsByCostFixture} />
            </BentoGrid.Cell>
          </BentoGrid>
        </section>

        {/* Sparkline grid */}
        <section style={{ marginBottom: '2rem' }}>
          <SectionTitle>3 · Sparkline grid · 6 agentes en overview</SectionTitle>
          <SparklineGrid agents={agentSparklineFixture} />
        </section>

        {/* Activity feed + cubículo card */}
        <section style={{ marginBottom: '2rem' }}>
          <SectionTitle>4 · Activity feed (8 col) · Cubículo del agente (4 col)</SectionTitle>
          <BentoGrid columns={12} gap={16}>
            <BentoGrid.Cell colSpan={8}>
              <ActivityFeed invocations={agentInvocationFixture} />
            </BentoGrid.Cell>
            <BentoGrid.Cell colSpan={4}>
              <CubiculoCard {...cubiculoFixture} />
            </BentoGrid.Cell>
          </BentoGrid>
        </section>

        {/* Cliente carpeta grid */}
        <section style={{ marginBottom: '2rem' }}>
          <SectionTitle>5 · Carpetas de clientes · 3 clientes</SectionTitle>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
              gap: '1rem',
            }}
          >
            {clienteCarpetaFixture.map((c) => (
              <ClienteCarpetaCard key={c.clientId} folder={c} />
            ))}
          </div>
        </section>

        {/* Memory graph */}
        <section style={{ marginBottom: '2rem' }}>
          <SectionTitle>6 · Memory graph · cliente · agentes · workflows · tools</SectionTitle>
          <MemoryGraph data={memoryGraphFixture} height={600} />
        </section>

        <footer style={{ color: theme.colors.fg.muted, fontSize: 11, paddingTop: 32, borderTop: `1px solid ${theme.colors.border.subtle}` }}>
          Built parallel by CC#4 · 2026-05-16 · ready para integrate con CC#1 dashboard scaffold.
        </footer>
      </main>
    </>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2
      style={{
        margin: '0 0 12px 0',
        fontSize: 12,
        fontWeight: 500,
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
        color: theme.colors.fg.muted,
      }}
    >
      {children}
    </h2>
  )
}
