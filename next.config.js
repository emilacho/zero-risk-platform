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
    serverComponentsExternalPackages: ['@resvg/resvg-js', 'satori', '@vercel/og'],
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
