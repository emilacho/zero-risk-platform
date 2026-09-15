/**
 * El LATIDO del corredor · E44.
 *
 * 🔴 Lo que esta prueba tiene que demostrar, y no describir:
 *   ① sin latido hay un SILENCIO tan largo como el trabajo  → es lo que mata la corrida
 *   ② con latido no hay silencio mayor al intervalo          → el borde da los 15 minutos
 *   ③ el cuerpo SIGUE siendo JSON válido para el que llama   → cero cambios río abajo
 *
 * Los tres se corren contra un servidor HTTP de verdad (el `http` de Node, sin
 * dependencias) con los tiempos en escala: 900 ms de trabajo y 100 ms de latido
 * en vez de 9 minutos y 20 segundos. Lo que se prueba es la MECÁNICA.
 *
 * Sin dependencias del servicio a propósito: la integración NO instala las de
 * `services/agent-runner` (lección de CC#2 · 15-sep · «que ande en tu máquina
 * no significa que ande en la integración»).
 */
import { describe, it, expect, vi } from 'vitest'
import { createServer, type Server } from 'node:http'
import {
  abrirLatido,
  intervaloDelLatido,
  BYTE_DEL_LATIDO,
  LATIDO_MS_POR_DEFECTO,
} from '../latido.js'

// ── ayudas ──────────────────────────────────────────────────────────────────

/** Levanta un servidor que tarda `trabajoMs` y contesta el JSON · con o sin latido. */
async function servidor(opts: {
  trabajoMs: number
  latidoMs: number
  cuerpo: unknown
}): Promise<{ url: string; cerrar: () => Promise<void> }> {
  const s: Server = createServer((_req, res) => {
    const conLatido = opts.latidoMs > 0
    if (conLatido) {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
      res.flushHeaders()
    }
    const latido = conLatido ? abrirLatido(res, opts.latidoMs) : null
    setTimeout(() => {
      latido?.detener()
      if (conLatido) res.end(JSON.stringify(opts.cuerpo))
      else {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' })
        res.end(JSON.stringify(opts.cuerpo))
      }
    }, opts.trabajoMs)
  })
  await new Promise<void>((ok) => s.listen(0, '127.0.0.1', ok))
  const dir = s.address()
  const puerto = typeof dir === 'object' && dir ? dir.port : 0
  return {
    url: `http://127.0.0.1:${puerto}/`,
    cerrar: () => new Promise<void>((ok) => s.close(() => ok())),
  }
}

/** Pide y anota CUÁNDO llegó cada pedazo · así se puede medir el silencio. */
async function pedirMidiendoSilencio(url: string): Promise<{
  texto: string
  mayorSilencioMs: number
  pedazos: number
}> {
  const t0 = Date.now()
  const r = await fetch(url)
  const lector = r.body!.getReader()
  const dec = new TextDecoder()
  let texto = ''
  let ultimo = t0
  let mayor = 0
  let pedazos = 0
  for (;;) {
    const { done, value } = await lector.read()
    const ahora = Date.now()
    if (done) {
      mayor = Math.max(mayor, ahora - ultimo)
      break
    }
    mayor = Math.max(mayor, ahora - ultimo)
    ultimo = ahora
    pedazos += 1
    texto += dec.decode(value, { stream: true })
  }
  return { texto, mayorSilencioMs: mayor, pedazos }
}

const CUERPO = {
  success: true,
  response: 'un plan de 90 dias',
  costUsd: 0.562083,
  sessionId: '9d1c33d4-7578-415d-a526-553241e3f5a4',
}

// ── ① el rojo que explica por qué existe todo esto ──────────────────────────

describe('el latido del corredor', () => {
  it('🔴 SIN latido el pedido queda en silencio TODO el trabajo · es lo que cierra el borde', async () => {
    const s = await servidor({ trabajoMs: 900, latidoMs: 0, cuerpo: CUERPO })
    try {
      const { texto, mayorSilencioMs } = await pedirMidiendoSilencio(s.url)
      expect(JSON.parse(texto)).toEqual(CUERPO)
      // el silencio es tan largo como el trabajo · a escala real, 9 minutos
      expect(mayorSilencioMs).toBeGreaterThan(700)
    } finally {
      await s.cerrar()
    }
  })

  it('🟢 CON latido no hay ningún silencio largo · el dato sigue fluyendo', async () => {
    const s = await servidor({ trabajoMs: 900, latidoMs: 100, cuerpo: CUERPO })
    try {
      const { texto, mayorSilencioMs, pedazos } = await pedirMidiendoSilencio(s.url)
      expect(JSON.parse(texto)).toEqual(CUERPO)
      // ningún hueco mayor a ~2 intervalos · el borde nunca ve 5 minutos callados
      expect(mayorSilencioMs).toBeLessThan(400)
      // y llegaron varios pedazos, no uno solo
      expect(pedazos).toBeGreaterThan(3)
    } finally {
      await s.cerrar()
    }
  })

  // ── ③ el contrato con los 44 llamadores ──────────────────────────────────

  it('🟢 el cuerpo sigue siendo JSON válido para quien lo lee con .json()', async () => {
    const s = await servidor({ trabajoMs: 300, latidoMs: 50, cuerpo: CUERPO })
    try {
      const r = await fetch(s.url)
      expect(r.status).toBe(200)
      await expect(r.json()).resolves.toEqual(CUERPO)
    } finally {
      await s.cerrar()
    }
  })

  it('los latidos van DELANTE del valor · JSON.parse los ignora por contrato', () => {
    const cuerpo = BYTE_DEL_LATIDO.repeat(28) + JSON.stringify(CUERPO)
    expect(JSON.parse(cuerpo)).toEqual(CUERPO)
  })

  // ── la mecánica, con reloj falso ─────────────────────────────────────────

  it('late una vez por intervalo y para cuando se le dice', () => {
    vi.useFakeTimers()
    try {
      const escrito: string[] = []
      const destino = { write: (c: string) => (escrito.push(c), true), writableEnded: false }
      const l = abrirLatido(destino, 1000)
      expect(l.latidos()).toBe(0)
      vi.advanceTimersByTime(3000)
      expect(l.latidos()).toBe(3)
      expect(escrito.join('')).toBe(BYTE_DEL_LATIDO.repeat(3))
      l.detener()
      vi.advanceTimersByTime(10_000)
      expect(l.latidos()).toBe(3)
      expect(l.vivo()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('detenerlo dos veces no rompe nada', () => {
    const l = abrirLatido({ write: () => true, writableEnded: false }, 1000)
    l.detener()
    expect(() => l.detener()).not.toThrow()
    expect(l.vivo()).toBe(false)
  })

  it('🔴 si el que llamó se fue, el latido se apaga solo y NO tumba la corrida', () => {
    vi.useFakeTimers()
    try {
      const destino = {
        write: () => {
          throw new Error('ERR_STREAM_WRITE_AFTER_END')
        },
        writableEnded: false,
      }
      const l = abrirLatido(destino, 1000)
      expect(() => vi.advanceTimersByTime(5000)).not.toThrow()
      expect(l.latidos()).toBe(0)
      expect(l.vivo()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('si la respuesta ya terminó, deja de latir sin escribir', () => {
    vi.useFakeTimers()
    try {
      const escrito: string[] = []
      const l = abrirLatido(
        { write: (c: string) => (escrito.push(c), true), writableEnded: true },
        1000,
      )
      vi.advanceTimersByTime(5000)
      expect(escrito).toEqual([])
      expect(l.vivo()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  // ── la perilla de apagado, que es la que permite volver atrás sin desplegar ──

  it('la perilla del entorno · vacío = por defecto · 0 = APAGADO · número = ese número', () => {
    expect(intervaloDelLatido({})).toBe(LATIDO_MS_POR_DEFECTO)
    expect(intervaloDelLatido({ AGENT_RUNNER_HEARTBEAT_MS: '' })).toBe(LATIDO_MS_POR_DEFECTO)
    expect(intervaloDelLatido({ AGENT_RUNNER_HEARTBEAT_MS: '0' })).toBe(0)
    expect(intervaloDelLatido({ AGENT_RUNNER_HEARTBEAT_MS: '-5' })).toBe(0)
    expect(intervaloDelLatido({ AGENT_RUNNER_HEARTBEAT_MS: 'apagado' })).toBe(0)
    expect(intervaloDelLatido({ AGENT_RUNNER_HEARTBEAT_MS: '5000' })).toBe(5000)
  })

  it('con el intervalo en 0 NO late nunca · la conducta de siempre', () => {
    vi.useFakeTimers()
    try {
      const escrito: string[] = []
      const l = abrirLatido({ write: (c: string) => (escrito.push(c), true), writableEnded: false }, 0)
      vi.advanceTimersByTime(600_000)
      expect(escrito).toEqual([])
      expect(l.vivo()).toBe(false)
    } finally {
      vi.useRealTimers()
    }
  })

  it('el intervalo por defecto deja margen de sobra contra el corte de 5 minutos', () => {
    expect(LATIDO_MS_POR_DEFECTO).toBeLessThan(300_000 / 10)
  })
})
