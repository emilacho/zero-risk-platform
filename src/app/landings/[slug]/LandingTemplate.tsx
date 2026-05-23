/**
 * LandingTemplate · Sprint 4 · CC#2
 *
 * Canonical landing template · Hero + N sections + footer.
 * Sections jsonb shape ·
 *   [
 *     { type: 'feature_grid', title: '...', items: [{ icon, title, body }, ...] },
 *     { type: 'testimonial', quote: '...', author: '...', role: '...' },
 *     { type: 'text_block', title: '...', body: '...' },
 *     { type: 'cta_band', headline: '...', cta_text: '...', cta_url: '...' },
 *   ]
 * Unknown section types render as a safe empty placeholder.
 */
import type { ReactNode } from 'react'

export interface LandingSection {
  type: string
  title?: string
  headline?: string
  body?: string
  quote?: string
  author?: string
  role?: string
  cta_text?: string
  cta_url?: string
  items?: Array<{ icon?: string; title?: string; body?: string }>
}

export interface LandingData {
  slug: string
  title: string
  hero_headline: string
  hero_subhead: string | null
  hero_image_url: string | null
  cta_text: string
  cta_url: string
  sections: LandingSection[]
  vertical: string | null
}

function Hero({ data }: { data: LandingData }) {
  return (
    <section className="relative overflow-hidden bg-gradient-to-br from-zinc-50 to-zinc-100 px-6 py-24 sm:px-12 lg:px-24">
      <div className="mx-auto grid max-w-7xl gap-12 lg:grid-cols-2 lg:items-center">
        <div>
          <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 sm:text-5xl lg:text-6xl">
            {data.hero_headline}
          </h1>
          {data.hero_subhead ? (
            <p className="mt-6 text-lg leading-relaxed text-zinc-600 sm:text-xl">{data.hero_subhead}</p>
          ) : null}
          <div className="mt-10 flex flex-wrap gap-4">
            <a
              href={data.cta_url}
              className="inline-flex items-center justify-center rounded-full bg-zinc-900 px-8 py-3 text-base font-medium text-white transition hover:bg-zinc-700"
            >
              {data.cta_text}
            </a>
          </div>
        </div>
        {data.hero_image_url ? (
          <div className="relative aspect-square overflow-hidden rounded-2xl bg-zinc-200 shadow-xl">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={data.hero_image_url} alt={data.title} className="h-full w-full object-cover" />
          </div>
        ) : (
          <div className="hidden aspect-square rounded-2xl bg-gradient-to-br from-zinc-200 to-zinc-300 lg:block" />
        )}
      </div>
    </section>
  )
}

function FeatureGrid({ section }: { section: LandingSection }) {
  const items = section.items ?? []
  return (
    <section className="bg-white px-6 py-20 sm:px-12 lg:px-24">
      <div className="mx-auto max-w-7xl">
        {section.title ? (
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">{section.title}</h2>
        ) : null}
        <div className="mt-12 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, i) => (
            <div key={i} className="rounded-xl border border-zinc-200 p-6 transition hover:border-zinc-400 hover:shadow-md">
              {item.icon ? <div className="mb-3 text-3xl">{item.icon}</div> : null}
              {item.title ? <h3 className="text-lg font-semibold text-zinc-900">{item.title}</h3> : null}
              {item.body ? <p className="mt-2 text-sm leading-relaxed text-zinc-600">{item.body}</p> : null}
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

function Testimonial({ section }: { section: LandingSection }) {
  return (
    <section className="bg-zinc-50 px-6 py-20 sm:px-12 lg:px-24">
      <div className="mx-auto max-w-4xl text-center">
        {section.quote ? (
          <blockquote className="text-2xl font-medium leading-relaxed text-zinc-800 sm:text-3xl">
            &ldquo;{section.quote}&rdquo;
          </blockquote>
        ) : null}
        <footer className="mt-8 text-sm text-zinc-600">
          {section.author ? <span className="font-semibold text-zinc-900">{section.author}</span> : null}
          {section.role ? <span className="ml-2">· {section.role}</span> : null}
        </footer>
      </div>
    </section>
  )
}

function TextBlock({ section }: { section: LandingSection }) {
  return (
    <section className="bg-white px-6 py-20 sm:px-12 lg:px-24">
      <div className="mx-auto max-w-4xl">
        {section.title ? (
          <h2 className="text-3xl font-semibold tracking-tight text-zinc-900 sm:text-4xl">{section.title}</h2>
        ) : null}
        {section.body ? <p className="mt-6 text-lg leading-relaxed text-zinc-700">{section.body}</p> : null}
      </div>
    </section>
  )
}

function CtaBand({ section }: { section: LandingSection }) {
  return (
    <section className="bg-zinc-900 px-6 py-20 sm:px-12 lg:px-24">
      <div className="mx-auto flex max-w-7xl flex-col items-start gap-6 lg:flex-row lg:items-center lg:justify-between">
        {section.headline ? (
          <h2 className="text-3xl font-semibold tracking-tight text-white sm:text-4xl">{section.headline}</h2>
        ) : null}
        {section.cta_text && section.cta_url ? (
          <a
            href={section.cta_url}
            className="inline-flex items-center justify-center rounded-full bg-white px-8 py-3 text-base font-medium text-zinc-900 transition hover:bg-zinc-200"
          >
            {section.cta_text}
          </a>
        ) : null}
      </div>
    </section>
  )
}

function renderSection(section: LandingSection, key: number): ReactNode {
  switch (section.type) {
    case 'feature_grid':
      return <FeatureGrid key={key} section={section} />
    case 'testimonial':
      return <Testimonial key={key} section={section} />
    case 'text_block':
      return <TextBlock key={key} section={section} />
    case 'cta_band':
      return <CtaBand key={key} section={section} />
    default:
      return null
  }
}

function Footer({ data }: { data: LandingData }) {
  return (
    <footer className="border-t border-zinc-200 bg-white px-6 py-12 sm:px-12 lg:px-24">
      <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 text-sm text-zinc-500 sm:flex-row">
        <span>© {new Date().getFullYear()} {data.title}</span>
        <span className="text-xs uppercase tracking-wider">Powered by Zero Risk</span>
      </div>
    </footer>
  )
}

export default function LandingTemplate({ data }: { data: LandingData }) {
  return (
    <main>
      <Hero data={data} />
      {data.sections.map((s, i) => renderSection(s, i))}
      <Footer data={data} />
    </main>
  )
}
