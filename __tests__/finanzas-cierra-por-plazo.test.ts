/**
 * LA OFICINA FINANCIERA CIERRA SOLA (CC#1 · 20-oct · encargo de Lenovo 19:35, parte 4). US$ 0, todo simulado.
 * Medido en las dos pruebas del 20-oct: la planeación corta la conversación a los 15 min (`FIN · decidir`), la oficina tarda 19-22 min; el encargo quedaba `en_curso` para siempre sin la ronda 2 ni la firma.
 * Arreglo: (1) la plataforma sabe CERRAR por plazo (`accion: 'cerrar'`: terminal, sin firma, sin modelo, idempotente); (2) la planeación espera 30 min y, si aun así vence, pide ese cierre.
 */
import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { estadoInicial } from '../src/lib/oficina/tipos'
import { cerrarPorPlazo } from '../src/lib/finanzas/conversa/orquestador'
import type { AlmacenDeConversa, CambiosDeEncargo, EncargoDeConversa, PuertosDeConversa, TurnoDeConversa } from '../src/lib/finanzas/conversa/puertos'
import type { ConfigDeFinanzas } from '../src/lib/finanzas/ruta'

// ───────────────────────── la plataforma: cerrar por plazo
function mundo(opts: { estado?: EncargoDeConversa['estado']; turnos?: number; config?: Partial<ConfigDeFinanzas> | 'falla'; candado?: 'tomado' | 'en_vuelo' | 'sin' } = {}) {
  const e: EncargoDeConversa = { id: 'enc-1', client_id: 'c-1', estado: opts.estado ?? 'en_curso', estado_del_motor: { ...estadoInicial(), ultimo: 13, pasos_ejecutados: 13, gasto_usd: 1.22 }, gasto_usd: 1.22, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: false, semilla: {} }
  const turnos: TurnoDeConversa[] = Array.from({ length: opts.turnos ?? 13 }, (_, i) => ({ n: i + 1, paso: 'x' + i, agente: null, ronda: 1, estado: 'hecho', costo_usd: 0.1, salida: {}, error: null }))
  const c = { guardados: [] as CambiosDeEncargo[], modelo: 0, tableros: 0, tomados: 0, soltados: 0 }
  const almacen: AlmacenDeConversa = {
    async crearEncargo() { throw new Error('no se usa') },
    async leerEncargo(id) { return id === e.id ? structuredClone(e) : null },
    async guardar(ch) { c.guardados.push(structuredClone(ch)); if (ch.estado) e.estado = ch.estado; if (ch.turno) turnos.push(structuredClone(ch.turno)) },
    async artefactos() { return {} },
    async turnos() { return structuredClone(turnos) },
    ...(opts.candado === 'sin' ? {} : {
      async tomarPaso() { if (opts.candado === 'en_vuelo') return { ok: true as const, tomado: false }; c.tomados++; return { ok: true as const, tomado: true } },
      async soltarPaso() { c.soltados++ },
    }),
  }
  const P: PuertosDeConversa = {
    almacen,
    modelo: { async invocar() { c.modelo++; return { ok: false, error: 'no debe llamarse', costo_usd: 0 } } },
    slack: { async publicar() { return { ok: false } }, async leer(p) { return { ok: false, mensajes: [], leido_hasta: p.desde_ts } } },
    tableros: { async guardarTablero() { c.tableros++; return { id: 't', version: 1 } }, async actualizarTablero() { c.tableros++ }, async invocacionDelJefe() { return true } },
    async config() {
      if (opts.config === 'falla') throw new Error('base caída')
      return { estado: 'encendida', clientes_ensayo: [], preguntas_slack: 'apagado', conversa: 'enciende', ...(opts.config ?? {}) } as ConfigDeFinanzas
    },
    ahora: () => new Date('2026-10-20T16:03:00Z'), canalDelHilo: '', emilio_id: '',
  }
  return { P, e, turnos, c }
}

describe('cerrarPorPlazo · la plataforma cierra el encargo abandonado', () => {
  it('🔴 un encargo en curso (13 pasos, sin firma) pasa a «cierre_por_tope», deja el porqué en un turno nuevo y no firma ni llama al modelo ni cambia el gasto', async () => {
    const m = mundo()
    const r = await cerrarPorPlazo(m.P, 'enc-1')
    expect(r.status).toBe(200); expect(r.cuerpo).toMatchObject({ estado: 'cierre_por_tope', terminado: true, razon: 'plazo', gasto_usd: 1.22 })
    expect(m.e.estado).toBe('cierre_por_tope')
    expect(m.c.guardados).toHaveLength(1)
    const g = m.c.guardados[0]
    expect(g.gasto_usd).toBe(1.22); expect(g.estado_del_motor.pasos_ejecutados).toBe(13)
    expect(g.turno).toMatchObject({ n: 14, paso: 'cierre_por_plazo', estado: 'hecho', costo_usd: 0, ronda: 1, agente: null })
    expect(g.turno?.salida).toMatchObject({ razon: 'plazo', sin_firma: true, pasos_ejecutados: 13 })
    expect(m.c.modelo).toBe(0); expect(m.c.tableros).toBe(0)
    expect((r.cuerpo.turnos as TurnoDeConversa[]).at(-1)?.paso).toBe('cierre_por_plazo')
  })
  it('el turno nuevo continúa el conteo (no choca con la clave única encargo+n), también con huecos', async () => {
    const m = mundo({ turnos: 0 }); await cerrarPorPlazo(m.P, 'enc-1'); expect(m.c.guardados[0].turno?.n).toBe(1)
    const k = mundo({ turnos: 5 }); k.turnos.splice(1, 2); await cerrarPorPlazo(k.P, 'enc-1'); expect(k.c.guardados[0].turno?.n).toBe(6)
  })
  it('🔴 idempotente: un encargo que ya es terminal se devuelve tal cual y NO se escribe nada (cerrado, sin_acuerdo, cierre_por_tope, fallido)', async () => {
    for (const estado of ['cerrado', 'sin_acuerdo', 'cierre_por_tope', 'fallido'] as const) {
      const m = mundo({ estado }); const r = await cerrarPorPlazo(m.P, 'enc-1')
      expect(r.status).toBe(200); expect(r.cuerpo).toMatchObject({ estado, terminado: true }); expect(m.c.guardados).toHaveLength(0)
    }
  })
  it('dos cierres seguidos: el segundo ya no escribe', async () => {
    const m = mundo(); await cerrarPorPlazo(m.P, 'enc-1'); await cerrarPorPlazo(m.P, 'enc-1'); expect(m.c.guardados).toHaveLength(1)
  })
  it('apagada ⇒ 409 sin leer ni escribir; configuración ilegible ⇒ 503 (no «apagada»); encargo inexistente ⇒ 404', async () => {
    const a = mundo({ config: { conversa: 'apagado' } }); expect((await cerrarPorPlazo(a.P, 'enc-1')).status).toBe(409); expect(a.c.guardados).toHaveLength(0)
    const b = mundo({ config: { estado: 'apagada' } }); expect((await cerrarPorPlazo(b.P, 'enc-1')).status).toBe(409)
    const c = mundo({ config: 'falla' }); expect((await cerrarPorPlazo(c.P, 'enc-1')).status).toBe(503); expect(c.c.guardados).toHaveLength(0)
    const d = mundo(); expect((await cerrarPorPlazo(d.P, 'otro')).status).toBe(404)
  })
  it('🔴 con un paso EN VUELO no cierra debajo de él (409 «paso_en_vuelo», sin escribir); con el candado libre lo toma y lo suelta', async () => {
    const v = mundo({ candado: 'en_vuelo' }); const r = await cerrarPorPlazo(v.P, 'enc-1')
    expect(r.status).toBe(409); expect(r.cuerpo.error).toBe('paso_en_vuelo'); expect(v.c.guardados).toHaveLength(0); expect(v.e.estado).toBe('en_curso')
    const l = mundo({ candado: 'tomado' }); await cerrarPorPlazo(l.P, 'enc-1'); expect(l.c.tomados).toBe(1); expect(l.c.soltados).toBe(1)
    const s = mundo({ candado: 'sin' }); expect((await cerrarPorPlazo(s.P, 'enc-1')).status).toBe(200)
  })
  it('si guardar falla, el candado SE SUELTA y el error sube (no deja el encargo bloqueado 15 min)', async () => {
    const m = mundo(); m.P.almacen.guardar = async () => { throw new Error('escritura fallida') }
    await expect(cerrarPorPlazo(m.P, 'enc-1')).rejects.toThrow('escritura fallida'); expect(m.c.soltados).toBe(1)
  })
  it('la ruta expone la acción «cerrar» (y la lista de acciones válidas la nombra)', () => {
    const ruta = fs.readFileSync(path.resolve(__dirname, '../src/app/api/finanzas/conversa/route.ts'), 'utf8')
    expect(ruta).toMatch(/c\.accion === 'cerrar' && typeof c\.encargo_id === 'string'\) r = await cerrarPorPlazo\(P, c\.encargo_id\)/)
    expect(ruta).toMatch(/acciones: \['abrir', 'avanzar', 'leer', 'cerrar'/)
  })
})

// ───────────────────────── la planeación: el plazo y el cierre
const D = path.resolve(__dirname, '../scripts/worker-staging/X9F0zp6LQ2xGEYVS')
const M = await import(pathToFileURL(path.join(D, 'construir-fin-cierra-2026-10-20.mjs')).href)
type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: unknown }
const leer = (f: string) => JSON.parse(fs.readFileSync(path.join(D, f), 'utf8')) as Flujo
const antes = leer('planeacion-ANTES-fin-cierra-2026-10-20.json')
const nuevo = leer('planeacion-ARREGLADO-fin-cierra-2026-10-20.json')
const nodo = (f: Flujo, n: string) => { const x = f.nodes.find((y) => y.name === n); if (!x) throw new Error('falta ' + n); return x }
const MIN = 60_000

/** corre «FIN · decidir» como n8n: la vuelta 0 es la respuesta de «abrir»; las demás, la de «avanzar» */
function decidir(f: Flujo, o: { vuelta: number; minutos: number; http?: number; cuerpo?: Record<string, unknown> }) {
  const t0 = Date.parse('2026-10-20T15:47:48Z')
  vi.useFakeTimers(); vi.setSystemTime(t0 + o.minutos * MIN)
  const $ = (n: string) => {
    if (n === 'FIN · armar la semilla') return { first: () => ({ json: { t0 } }) }
    if (n === 'FIN · decidir') return { first: () => ({ json: { encargo_id: 'enc-1' } }) }
    throw new Error('nodo no ejecutado: ' + n)
  }
  const entrada = { first: () => ({ json: { statusCode: o.http ?? 200, body: o.cuerpo ?? { estado: 'en_curso' } } }) }
  return (new Function('$input', '$', '$runIndex', nodo(f, 'FIN · decidir').parameters.jsCode)(entrada, $, o.vuelta) as Array<{ json: any }>)[0].json
}
afterEach(() => { vi.useRealTimers() })

describe('«FIN · decidir» · el plazo', () => {
  it('🔴 a los 16 min con la oficina sin terminar: ANTES se rendía («vencido», encargo abandonado); AHORA sigue esperando', () => {
    expect(decidir(antes, { vuelta: 12, minutos: 16 })).toMatchObject({ fin: true, finanzas_motivo: 'vencido' })
    expect(decidir(nuevo, { vuelta: 12, minutos: 16 })).toEqual({ fin: false, encargo_id: 'enc-1' })
  })
  it('🔴 a los 22 min (lo que tarda la oficina entera) todavía espera; a los 29,9 también; a los 30,1 vence', () => {
    for (const m of [19, 22, 29.9]) expect(decidir(nuevo, { vuelta: 14, minutos: m }).fin).toBe(false)
    expect(decidir(nuevo, { vuelta: 14, minutos: 30.1 })).toMatchObject({ fin: true, finanzas_motivo: 'vencido' })
  })
  it('🔴 al vencer pide el CIERRE: `leer` + `cerrar_antes` (para que pase por «FIN · leer el encargo»), y conserva el motivo que lee el plan', () => {
    expect(decidir(nuevo, { vuelta: 14, minutos: 31 })).toEqual({ fin: true, encargo_id: 'enc-1', finanzas_motivo: 'vencido', detalle: 'la oficina no terminó a tiempo', leer: true, cerrar_antes: true })
    expect(decidir(nuevo, { vuelta: 40, minutos: 5 })).toMatchObject({ fin: true, finanzas_motivo: 'vencido', cerrar_antes: true })
  })
  it('lo demás no cambió: abrir apagada/falló, terminó, respondió mal, y sigue mientras hay tiempo', () => {
    for (const f of [antes, nuevo]) {
      expect(decidir(f, { vuelta: 0, minutos: 0, http: 409 })).toEqual({ fin: true, resultado: 'apagada' })
      expect(decidir(f, { vuelta: 0, minutos: 0, http: 500 })).toMatchObject({ fin: true, finanzas_motivo: 'sin_bloque' })
      expect(decidir(f, { vuelta: 0, minutos: 0, cuerpo: { encargo_id: 'enc-1' } })).toEqual({ fin: false, encargo_id: 'enc-1' })
      expect(decidir(f, { vuelta: 5, minutos: 6, http: 502 })).toMatchObject({ fin: true, finanzas_motivo: 'sin_bloque' })
      expect(decidir(f, { vuelta: 17, minutos: 21, cuerpo: { terminado: true, estado: 'cerrado' } })).toEqual({ fin: true, encargo_id: 'enc-1', leer: true, estado: 'cerrado' })
      expect(decidir(f, { vuelta: 3, minutos: 4 })).toEqual({ fin: false, encargo_id: 'enc-1' })
    }
  })
})

/** evalúa el cuerpo de «FIN · leer el encargo» (una expresión de n8n) con el ítem que le llega */
function cuerpoDeLeer(f: Flujo, json: Record<string, unknown>) {
  const expr = String(nodo(f, 'FIN · leer el encargo').parameters.jsonBody).replace(/^=\{\{/, '').replace(/\}\}$/, '')
  const $ = (n: string) => { if (n === 'FIN · decidir') return { first: () => ({ json: { encargo_id: 'enc-1' } }) }; throw new Error('nodo no ejecutado: ' + n) }
  return JSON.parse(new Function('$json', '$', '$workflow', '$execution', 'JSON', `return ${expr}`)(json, $, { id: 'WF' }, { id: 'EX' }, JSON) as string) as Record<string, unknown>
}
describe('«FIN · leer el encargo» · cerrar o leer', () => {
  it('🔴 con `cerrar_antes` manda `cerrar`; sin él (terminó solo) sigue siendo `leer`', () => {
    expect(cuerpoDeLeer(nuevo, { fin: true, encargo_id: 'enc-1', leer: true, cerrar_antes: true, finanzas_motivo: 'vencido' })).toMatchObject({ accion: 'cerrar', encargo_id: 'enc-1', workflow_id: 'WF', workflow_execution_id: 'EX' })
    expect(cuerpoDeLeer(nuevo, { fin: true, encargo_id: 'enc-1', leer: true, estado: 'cerrado' })).toMatchObject({ accion: 'leer', encargo_id: 'enc-1' })
    expect(cuerpoDeLeer(nuevo, { fin: true, leer: true, cerrar_antes: false })).toMatchObject({ accion: 'leer' })
    expect(cuerpoDeLeer(antes, { cerrar_antes: true })).toMatchObject({ accion: 'leer' })
  })
  it('«FIN · cerrar la oficina» sigue leyendo «vencido» para el plan, con la respuesta del cierre o sin ella', () => {
    const codigo = String(nodo(nuevo, 'FIN · cerrar la oficina').parameters.jsCode)
    const correr = (dec: Record<string, unknown>, leido: Record<string, unknown> | null) => {
      const $ = (n: string) => {
        if (n === 'FIN · decidir') return { first: () => ({ json: dec }) }
        if (n === 'Webhook · planeacion') return { first: () => ({ json: { body: { client_id: 'c-1' } } }) }
        if (n === 'FIN · leer el encargo') { if (!leido) throw new Error('no corrió'); return { first: () => ({ json: leido }) } }
        throw new Error('nodo no ejecutado: ' + n)
      }
      return (new Function('$', codigo)($) as Array<{ json: any }>)[0].json
    }
    const cerrado = { statusCode: 200, body: { estado: 'cierre_por_tope', terminado: true, razon: 'plazo', turnos: [{ paso: 'cierre_por_plazo', salida: { sin_firma: true } }] } }
    expect(correr({ fin: true, finanzas_motivo: 'vencido', cerrar_antes: true }, cerrado)).toEqual({ finanzas_id: null, finanzas_motivo: 'vencido' })
    expect(correr({ fin: true, finanzas_motivo: 'vencido', cerrar_antes: true }, { statusCode: 409, body: { error: 'paso_en_vuelo' } })).toEqual({ finanzas_id: null, finanzas_motivo: 'vencido' })
    expect(correr({ fin: true, leer: true, estado: 'cierre_por_tope' }, cerrado)).toEqual({ finanzas_id: null, finanzas_motivo: 'vencido' })
  })
})

describe('la forma del cambio (planeación)', () => {
  it('🔴 LINAJE: el constructor reproduce el ARREGLADO desde el ANTES (vivo de hoy) y no se construye dos veces', () => {
    expect(JSON.stringify(M.construirFlujo(antes))).toBe(JSON.stringify(nuevo))
    expect(() => M.construirFlujo(nuevo)).toThrow(/ya cierra por plazo/)
  })
  it('cambian EXACTAMENTE dos nodos (decidir y leer el encargo), en un solo campo cada uno; nodos y cables iguales', () => {
    expect(nuevo.nodes.map((n) => n.name)).toEqual(antes.nodes.map((n) => n.name))
    const distintos = nuevo.nodes.filter((n, i) => JSON.stringify(n) !== JSON.stringify(antes.nodes[i]))
    expect(distintos.map((n) => n.name).sort()).toEqual(['FIN · decidir', 'FIN · leer el encargo'])
    for (const n of distintos) {
      const a = nodo(antes, n.name).parameters
      expect(Object.keys(n.parameters).filter((k) => JSON.stringify(n.parameters[k]) !== JSON.stringify(a[k]))).toEqual([n.name === 'FIN · decidir' ? 'jsCode' : 'jsonBody'])
    }
    expect(JSON.stringify(nuevo.connections)).toBe(JSON.stringify(antes.connections))
  })
  it('el código compila, conserva los saltos de línea y no lleva llaves', () => {
    expect(() => new Function('$input', '$', '$runIndex', nodo(nuevo, 'FIN · decidir').parameters.jsCode)).not.toThrow()
    const CRLF = String.fromCharCode(13, 10)
    expect(nodo(nuevo, 'FIN · decidir').parameters.jsCode.includes(CRLF)).toBe(nodo(antes, 'FIN · decidir').parameters.jsCode.includes(CRLF))
    expect(JSON.stringify(nuevo)).not.toMatch(/sk-[A-Za-z0-9]{10,}|eyJ[A-Za-z0-9_-]{20,}/)
  })
})
