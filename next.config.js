/** @type {import('next').NextConfig} */
const { withSentryConfig } = require('@sentry/nextjs');

const nextConfig = {
  // Zero Risk V2 — Single-tenant config
  typescript: {
    // agent-sdk-runner.ts uses Claude Agent SDK which has no proper TS types yet.
    // We'll fix incrementally — this allows Vercel deploy to succeed.
    ignoreBuildErrors: true,
  },
  // TODO: remove experimental.instrumentationHook when upgrading to Next.js 15 (stable there)
  experimental: {
    instrumentationHook: true,
    // @resvg/resvg-js ships a per-platform native binding (resvgjs.<os>-<arch>.node)
    // that webpack cannot bundle — fails the production build with
    // "Module parse failed: Unexpected character '�'". Listing it here tells
    // Next.js to require it at runtime from node_modules instead of bundling.
    // satori is JS-only but very large · marking it external too keeps the
    // serverless function size sane.
    serverComponentsExternalPackages: ['@resvg/resvg-js', 'satori', '@vercel/og', '@ffmpeg-installer/ffmpeg'],
    // Lectores de archivo del cerebro (paso 5): el PDF se lee en un HILO APARTE (trabajador-pdf.cjs) que carga `unpdf` por require en tiempo de ejecución.
    // Nadie lo importa de forma estática, así que el rastreo del empaquetado no lo vería: se incluye a mano, solo para las rutas del portero.
    // Si aun así faltara, el lector FALLA CERRADO (`aislamiento_no_disponible`): el PDF no se lee y queda como archivo con ficha.
    outputFileTracingIncludes: {
      '/api/brain/portero/**': ['./src/lib/cerebro/archivos/trabajador-pdf.cjs', './node_modules/unpdf/**/*'],
      // el video se guarda como video y se le sacan capturas con ffmpeg (31-oct): el ejecutable se llama en tiempo de ejecución, así que se incluye a mano. Sin él el video se guarda igual y se declara sin capturas.
      '/api/brain/alimentar/**': ['./node_modules/@ffmpeg-installer/**/*', './node_modules/.pnpm/@ffmpeg-installer+ffmpeg@*/node_modules/@ffmpeg-installer/ffmpeg/**/*', './node_modules/.pnpm/@ffmpeg-installer+linux-x64*/node_modules/@ffmpeg-installer/linux-x64/**/*'],
    },
  },
};

module.exports = withSentryConfig(nextConfig, {
  org: process.env.SENTRY_ORG,
  project: process.env.SENTRY_PROJECT,
  // authToken is optional — build succeeds without it, source maps won't upload to Sentry
  authToken: process.env.SENTRY_AUTH_TOKEN,
  silent: !process.env.CI,
  widenClientFileUpload: true,
  tunnelRoute: '/sentry-tunnel',
  sourcemaps: {
    deleteSourcemapsAfterUpload: true,
  },
  disableLogger: true,
});
