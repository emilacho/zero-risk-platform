/**
 * Double-dispatch fix (CC#1 2026-08-09) · the Vercel→Railway proxy must NOT
 * retry once the agent run is in flight.
 *
 * Real incident · exec 87035 (09-ago) and exec 85860 (08-ago): a single
 * `[RD] Dispatch` produced TWO `onboarding-specialist` runs starting ~302-303 s
 * apart. The graph did not re-fire; the connection dropped ~300 s in and the
 * proxy classified it as retriable, spawning a second billed run that finished
 * late and overwrote state the graph had already consumed.
 */
import { describe, it, expect } from 'vitest'
import { isRetriableRailwayProxyFailure } from '../route'

const WINDOW_MS = 30_000

describe('isRetriableRailwayProxyFailure · ventana de reintento', () => {
  describe('el caso del incidente', () => {
    it('NO reintenta un corte de conexión a los ~300 s (el agente ya está corriendo)', () => {
      expect(
        isRetriableRailwayProxyFailure({
          kind: 'conn_error',
          isAbort: false,
          elapsedMs: 300_000,
        }),
      ).toBe(false)
    })

    it('NO reintenta un 502 que llega tarde', () => {
      expect(
        isRetriableRailwayProxyFailure({
          kind: 'http',
          status: 502,
          isGracefulAgentFailure: false,
          elapsedMs: 300_000,
        }),
      ).toBe(false)
    })
  })

  describe('lo que SÍ debe seguir reintentando · fallo rápido, el trabajo nunca arrancó', () => {
    it('corte de conexión inmediato (contenedor rotando en un deploy)', () => {
      expect(
        isRetriableRailwayProxyFailure({ kind: 'conn_error', isAbort: false, elapsedMs: 120 }),
      ).toBe(true)
    })

    it('502 inmediato', () => {
      expect(
        isRetriableRailwayProxyFailure({
          kind: 'http',
          status: 502,
          isGracefulAgentFailure: false,
          elapsedMs: 50,
        }),
      ).toBe(true)
    })

    it('503 justo por debajo de la ventana', () => {
      expect(
        isRetriableRailwayProxyFailure({
          kind: 'http',
          status: 503,
          isGracefulAgentFailure: false,
          elapsedMs: WINDOW_MS - 1,
        }),
      ).toBe(true)
    })

    it('en el borde exacto de la ventana ya NO reintenta', () => {
      expect(
        isRetriableRailwayProxyFailure({
          kind: 'http',
          status: 503,
          isGracefulAgentFailure: false,
          elapsedMs: WINDOW_MS,
        }),
      ).toBe(false)
    })
  })

  describe('reglas previas · intactas', () => {
    it('un abort propio nunca se reintenta', () => {
      expect(
        isRetriableRailwayProxyFailure({ kind: 'conn_error', isAbort: true, elapsedMs: 10 }),
      ).toBe(false)
    })

    it('un fallo GRACIOSO del agente (success:false) nunca se reintenta', () => {
      expect(
        isRetriableRailwayProxyFailure({
          kind: 'http',
          status: 500,
          isGracefulAgentFailure: true,
          elapsedMs: 10,
        }),
      ).toBe(false)
    })

    it('un 4xx nunca se reintenta', () => {
      expect(
        isRetriableRailwayProxyFailure({
          kind: 'http',
          status: 429,
          isGracefulAgentFailure: false,
          elapsedMs: 10,
        }),
      ).toBe(false)
    })

    it('sin elapsedMs se comporta como antes · retrocompatible', () => {
      expect(isRetriableRailwayProxyFailure({ kind: 'conn_error', isAbort: false })).toBe(true)
      expect(
        isRetriableRailwayProxyFailure({
          kind: 'http',
          status: 502,
          isGracefulAgentFailure: false,
        }),
      ).toBe(true)
      expect(isRetriableRailwayProxyFailure({ kind: 'conn_error', isAbort: true })).toBe(false)
    })
  })
})
