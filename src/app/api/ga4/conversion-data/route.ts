/**
 * GA4 — Conversion Data
 *
 * Proxy to Google Analytics Data API v1beta. Returns conversions + revenue
 * per campaign source/medium over specified date range.
 *
 * Used by: Cross-Platform Attribution Validator — compares GA4's attributed
 * conversions against Meta/Google/TikTok platform reports for discrepancy.
 *
 * GET ?property_id=123456789&days=1&client_id=xxx
 *
 * Env vars required:
 *   GA4_SERVICE_ACCOUNT_KEY  — service account JSON as single-line string
 *                              (or base64-encoded; supports both)
 *   GA4_DEFAULT_PROPERTY_ID  — fallback property_id
 *
 * Uses Google OAuth2 service account flow to get access token.
 */

import { NextRequest, NextResponse } from 'next/server'
import { checkInternalKey } from '@/lib/internal-auth'
import { captureRouteError } from '@/lib/sentry-capture'

export const dynamic = 'force-dynamic'
export const maxDuration = 30

interface ServiceAccountKey {
  client_email: string
  private_key: string
  token_uri?: string
}

/**
 * Parse service account key from env — supports raw JSON string or base64-encoded.
 */
function parseServiceAccount(raw: string): ServiceAccountKey | null {
  try {
    return JSON.parse(raw)
  } catch {
    // Try base64
    try {
      return JSON.parse(Buffer.from(raw, 'base64').toString('utf-8'))
    } catch {
      return null
    }
  }
}

/**
 * Generate a Google OAuth2 access token from service account credentials.
 * Uses JWT assertion flow per RFC 7523.
 */
async function getGoogleAccessToken(sa: ServiceAccountKey, scope: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url')
  const payload = Buffer.from(
    JSON.stringify({
      iss: sa.client_email,
      scope,
      aud: sa.token_uri || 'https://oauth2.googleapis.com/token',
      exp: now + 3600,
      iat: now,
    })
  ).toString('base64url')

  const unsigned = `${header}.${payload}`

  // Sign with private key using node crypto
  const crypto = await import('node:crypto')
  const signer = crypto.createSign('RSA-SHA256')
  signer.update(unsigned)
  const signature = signer.sign(sa.private_key).toString('base64url')
  const jwt = `${unsigned}.${signature}`

  // Exchange JWT for access token
  const res = await fetch(sa.token_uri || 'https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  })
  const data = await res.json()
  if (!res.ok) throw new Error(`Token exchange failed: ${JSON.stringify(data)}`)
  return data.access_token as string
}

export async function GET(request: NextRequest) {
  const auth = checkInternalKey(request)
  if (!auth.ok) {
    return NextResponse.json({ error: 'unauthorized', detail: auth.reason }, { status: 401 })
  }

  const keyRaw = process.env.GA4_SERVICE_ACCOUNT_KEY
  const defaultProperty = process.env.GA4_DEFAULT_PROPERTY_ID
  if (!keyRaw) {
    return NextResponse.json(
      { error: 'not_configured', missing: ['GA4_SERVICE_ACCOUNT_KEY'] },
      { status: 503 }
    )
  }

  const sa = parseServiceAccount(keyRaw)
  if (!sa || !sa.client_email || !sa.private_key) {
    return NextResponse.json(
      { error: 'invalid_service_account', detail: 'GA4_SERVICE_ACCOUNT_KEY could not be parsed as JSON' },
      { status: 500 }
    )
  }

  const property_id =
    request.nextUrl.searchParams.get('property_id') || defaultProperty
  if (!property_id) {
    return NextResponse.json(
      { error: 'missing_property_id', detail: 'Provide ?property_id= or set GA4_DEFAULT_PROPERTY_ID' },
      { status: 400 }
    )
  }

  const days = Math.min(Number(request.nextUrl.searchParams.get('days') || '1'), 90)
  const client_id = request.nextUrl.searchParams.get('client_id')

  try {
    const accessToken = await getGoogleAccessToken(
      sa,
      'https://www.googleapis.com/auth/analytics.readonly'
    )

    const runReportUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${property_id}:runReport`
    const reportBody = {
      dateRanges: [{ startDate: `${days}daysAgo`, endDate: 'today' }],
      dimensions: [
        { name: 'sessionSource' },
        { name: 'sessionMedium' },
        { name: 'sessionCampaignName' },
      ],
      metrics: [
        { name: 'conversions' },
        { name: 'totalRevenue' },
        { name: 'sessions' },
        { name: 'engagedSessions' },
        { name: 'purchaseRevenue' },
        { name: 'transactions' },
      ],
      limit: '500',
    }

    const res = await fetch(runReportUrl, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(reportBody),
      signal: AbortSignal.timeout(25000),
    })
    const data = await res.json()

    if (!res.ok) {
      return NextResponse.json(
        { error: 'ga4_api_error', status: res.status, detail: data },
        { status: res.status }
      )
    }

    // Flatten rows into normalized records
    const rows = (data.rows || []).map((r: { dimensionValues: Array<{ value: string }>; metricValues: Array<{ value: string }> }) => ({
      source: r.dimensionValues?.[0]?.value || null,
      medium: r.dimensionValues?.[1]?.value || null,
      campaign: r.dimensionValues?.[2]?.value || null,
      conversions: Number(r.metricValues?.[0]?.value || 0),
      total_revenue: Number(r.metricValues?.[1]?.value || 0),
      sessions: Number(r.metricValues?.[2]?.value || 0),
      engaged_sessions: Number(r.metricValues?.[3]?.value || 0),
      purchase_revenue: Number(r.metricValues?.[4]?.value || 0),
      transactions: Number(r.metricValues?.[5]?.value || 0),
    }))

    const totals = rows.reduce(
      (acc: Record<string, number>, r: Record<string, number | string | null>) => {
        acc.conversions += Number(r.conversions)
        acc.sessions += Number(r.sessions)
        acc.total_revenue += Number(r.total_revenue)
        acc.transactions += Number(r.transactions)
        return acc
      },
      { conversions: 0, sessions: 0, total_revenue: 0, transactions: 0 }
    )

    return NextResponse.json({
      platform: 'ga4',
      client_id: client_id || null,
      property_id,
      days,
      rows,
      totals,
      count: rows.length,
      source: 'ga4_data_api_v1beta',
    })
  } catch (err) {
    captureRouteError(err, request, {
      route: '/api/ga4/conversion-data',
      source: 'route_handler',
    })
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[ga4/conversion-data] error:', msg)
    return NextResponse.json({ error: 'fetch_error', detail: msg }, { status: 502 })
  }
}
