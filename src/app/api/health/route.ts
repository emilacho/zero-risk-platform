import { NextResponse } from 'next/server'
import { allowPublic } from '@/lib/auth-middleware'

export async function GET() {
  // Wave 13: explicit auth-tier marker · enables audit script to distinguish
  // intentional vs forgotten auth gaps.
  allowPublic('@public-intentional: liveness probe · no PII · no mutation · used by Vercel + UptimeRobot')

  return NextResponse.json({
    status: 'ok',
    app: 'zero-risk-platform',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  })
}
