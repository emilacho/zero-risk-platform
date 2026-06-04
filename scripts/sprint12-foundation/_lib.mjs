/**
 * Sprint 12 Fase 0 · ENCENDIDO escalón 1 · smoke harness shared lib
 *
 * §144 GATE · harnesses 01–06 require Emilio OK + migration #141 applied.
 * DRY-RUN (07) does NOT touch DB · can run anytime.
 *
 * Canon · NO harness runs without SPRINT12_FOUNDATION_OK=1.
 * Canon · result format · single JSON line on stdout + non-zero exit on FAIL.
 */
import { createClient } from '@supabase/supabase-js'
import { randomUUID } from 'node:crypto'

export const SAFETY_FLAG = 'SPRINT12_FOUNDATION_OK'

export function assertSafety() {
  if (process.env[SAFETY_FLAG] !== '1') {
    console.error(
      `[smoke] REFUSE · env ${SAFETY_FLAG}=1 required · §144 Emilio OK gate · NO touch prod sin OK`,
    )
    process.exit(2)
  }
}

export function requireEnv(name) {
  const v = process.env[name]
  if (!v) {
    console.error(`[smoke] env ${name} missing`)
    process.exit(2)
  }
  return v
}

export function serviceClient() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('SUPABASE_SERVICE_ROLE_KEY'),
    { auth: { persistSession: false } },
  )
}

export function anonClient() {
  return createClient(
    requireEnv('NEXT_PUBLIC_SUPABASE_URL'),
    requireEnv('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
    { auth: { persistSession: false } },
  )
}

export function newUuids(n) {
  return Array.from({ length: n }, () => randomUUID())
}

export function report(name, result) {
  const line = JSON.stringify({ harness: name, ts: new Date().toISOString(), ...result })
  console.log(line)
  if (!result.pass) process.exit(1)
}

export const TABLE = 'sala_event_log'
