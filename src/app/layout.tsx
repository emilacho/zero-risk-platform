import type { Metadata } from 'next'
import { GoogleAnalytics } from '@next/third-parties/google'
import './globals.css'

export const metadata: Metadata = {
  title: 'Zero Risk Platform',
  description: 'Marketing automation for Zero Risk Ecuador',
}

// Sprint 4 Día 5 · GA4 wire. Component degrades gracefully when the env
// var is absent (returns null · no script tag · zero crash). Populate
// `NEXT_PUBLIC_GA_MEASUREMENT_ID` (format `G-XXXXXXXXXX`) after creating
// the GA4 property in the Analytics console.
const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="es">
      <body>{children}</body>
      {GA_ID ? <GoogleAnalytics gaId={GA_ID} /> : null}
    </html>
  )
}
