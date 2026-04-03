import { NextResponse } from 'next/server'

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    app: 'zero-risk-platform',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
  })
}
