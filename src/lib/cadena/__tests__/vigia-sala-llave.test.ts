/**
 * EL VIGÍA DE LA CADENA NO CALLA A LA SALA (CC#2 · 21-oct · tercera prueba): a las 22:00Z el vigía calculó el lote y la sala le contestó `401 · missing x-api-key header` porque su nodo mandaba
 * `x-api-key: $env.SALA_INGRESS_API_KEY` sin respaldo (esa variable no llega al n8n); el nodo tiene neverError y la ejecución salió en verde. US$ 0 · el simulador de n8n ejecuta los nodos tal cual.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { SimuladorN8n, type FlujoN8n, type PeticionHttp, type RespuestaHttp } from '../__fixtures__/simulador-n8n'

const RAIZ = resolve(__dirname, '..', '..', '..', '..')
const CADENA = join(RAIZ, 'scripts', 'worker-staging', 'cadena')
const IDS = { estrategia: 'F-EST', calendario: 'F-CAL', fechas: 'F-FEC', puerta: 'F-PUE' }
const ID_VIGIA = 'F-VIG'
const RAILWAY = { INTERNAL_API_KEY: 'k-int', SLACK_BOT_TOKEN: 'xoxb-prueba', ZERO_RISK_API_URL: 'https://api.test' } // SIN SALA_INGRESS_API_KEY: como en el n8n real
const LOTE = { lote: '2026-W44', fila_ids: ['f1', 'f2'], idempotency_key: 'camp-1:2026-W44:1:abcd1234' }

let NUEVO: FlujoN8n, ANTES: FlujoN8n, mod: any, repararVigia: (f: unknown) => FlujoN8n

beforeAll(async () => {
  mod = await import(/* @vite-ignore */ pathToFileURL(join(CADENA, 'construir.mjs')).href)
  repararVigia = (await import(/* @vite-ignore */ pathToFileURL(join(CADENA, 'vigia-llave.mjs')).href)).repararVigia
  const vivo = (f: string) => JSON.parse(readFileSync(join(CADENA, 'vivos', f), 'utf8'))
  NUEVO = mod.construirFlujos({ ids: IDS, parteViva: vivo('PQdIgbuFexuBsoh8.json'), planViva: vivo('X9F0zp6LQ2xGEYVS.json') })['cadena-vigia']
  ANTES = JSON.parse(readFileSync(join(CADENA, 'vigia-ANTES-llave-2026-10-21.json'), 'utf8'))
})

/** la plataforma y la sala de mentira: la sala se porta como la real (401 sin llave válida) */
function mundo(o: { llaves?: string[]; salaResponde?: (cuerpo: any) => RespuestaHttp; tanda?: number | null } = {}) {
  const intake: Array<{ llave: string | undefined; cuerpo: any }> = [], slack: any[] = []
  const llaves = new Set(o.llaves ?? [RAILWAY.INTERNAL_API_KEY])
  const http = async (p: PeticionHttp): Promise<RespuestaHttp> => {
    const u = new URL(p.url)
    if (u.pathname === '/api/cadena/esperas') return { statusCode: 200, body: { latido: '2026-10-20T22:00:00Z', aplicado: [], violaciones: [], alertas: [], enviar_alertas: false } }
    if (u.pathname === '/api/cadena/campanas') return { statusCode: 200, body: { campanas: [{ id: 'camp-1', client_id: 'cli-1', seco: false, sala_ref: {} }] } }
    if (u.pathname === '/api/cadena/filas') return { statusCode: 200, body: { lotes: [LOTE], version: 1 } }
    if (u.pathname === '/api/cadena/calendario') return { statusCode: 200, body: o.tanda ? { tanda: o.tanda } : { tanda: null, motivo: 'faltan 33 días para que termine la tanda 1' } }
    if (u.pathname === '/api/sala/intake') {
      const llave = p.cabeceras['x-api-key']; intake.push({ llave, cuerpo: p.cuerpo })
      if (o.salaResponde) return o.salaResponde(p.cuerpo)
      return llave && llaves.has(llave) ? { statusCode: 200, body: { ok: true, kind: 'accepted' } } : { statusCode: 401, body: { ok: false, code: 'unauthorized', detail: 'internal_key tier · missing x-api-key header' } }
    }
    if (u.hostname === 'slack.com') { slack.push(p.cuerpo); return { statusCode: 200, body: { ok: true } } }
    throw new Error('el simulador no conoce esta dirección: ' + p.url)
  }
  const correr = (flujo: FlujoN8n, env: Record<string, string>) => new SimuladorN8n({ flujos: { [ID_VIGIA]: flujo }, env, http }).ejecutar(ID_VIGIA, [{ json: {} }])
  return { intake, slack, correr }
}
const aceptados = (m: ReturnType<typeof mundo>) => m.intake.filter((x) => x.llave && x.llave === RAILWAY.INTERNAL_API_KEY).length

describe('EL DEFECTO (reproducido en el flujo de ANTES: el que estaba en el n8n)', () => {
  it('🔴 sin SALA_INGRESS_API_KEY la sala contesta 401, no queda ningún sobre y NADIE se entera (ni Slack ni error): la ejecución sale en verde', async () => {
    const m = mundo()
    await expect(m.correr(ANTES, RAILWAY)).resolves.toBeDefined() // no lanza
    expect(m.intake).toHaveLength(1); expect(m.intake[0].llave).toBeFalsy(); expect(aceptados(m)).toBe(0)
    expect(m.slack).toEqual([])
  })
})

describe('LA REPARACIÓN', () => {
  it('🔴 el mismo n8n (sin SALA_INGRESS_API_KEY): el sobre del lote llega a la sala con la llave interna, aceptado, y no hay aviso', async () => {
    const m = mundo()
    await m.correr(NUEVO, RAILWAY)
    expect(aceptados(m)).toBe(1); expect(m.intake[0].cuerpo.idempotency_key).toBe(LOTE.idempotency_key); expect(m.intake[0].cuerpo).toMatchObject({ source: 'cadena/vigia', intent: 'briefear' })
    expect(m.slack).toEqual([])
  })
  it('si SALA_INGRESS_API_KEY existe, manda ESA (el respaldo no la pisa)', async () => {
    const m = mundo({ llaves: ['k-ing'] })
    await m.correr(NUEVO, { ...RAILWAY, SALA_INGRESS_API_KEY: 'k-ing' })
    expect(m.intake[0].llave).toBe('k-ing'); expect(m.slack).toEqual([])
  })
  it('🔴 la sala RECHAZA (llave mala): el rechazo se AVISA a #alertas con el lote, la campaña y el motivo; la ejecución no se cae', async () => {
    const m = mundo({ llaves: ['otra'] })
    await expect(m.correr(NUEVO, RAILWAY)).resolves.toBeDefined()
    expect(m.slack).toHaveLength(1)
    expect(m.slack[0]).toMatchObject({ channel: 'C0B7XUUEBHA' })
    const t = String(m.slack[0].text)
    expect(t).toContain('RECHAZÓ'); expect(t).toContain('2026-W44'); expect(t).toContain('camp-1'); expect(t).toContain('HTTP 401'); expect(t).toContain('unauthorized')
  })
  it('un 500 de la sala también se avisa; un sobre repetido (200 · duplicado) NO', async () => {
    const m5 = mundo({ salaResponde: () => ({ statusCode: 500, body: { error: 'caída' } }) }); await m5.correr(NUEVO, RAILWAY)
    expect(m5.slack).toHaveLength(1); expect(String(m5.slack[0].text)).toContain('HTTP 500')
    const md = mundo({ salaResponde: () => ({ statusCode: 200, body: { ok: true, kind: 'duplicate', event_id: 'ev-1' } }) }); await md.correr(NUEVO, RAILWAY)
    expect(md.slack).toEqual([])
    const mf = mundo({ salaResponde: () => ({ statusCode: 200, body: { ok: false, code: 'regla_no_encontrada' } }) }); await mf.correr(NUEVO, RAILWAY)
    expect(mf.slack).toHaveLength(1) // 200 con ok:false es un rechazo
  })
  it('la rama de la TANDA lleva el mismo respaldo y el mismo aviso', async () => {
    const ok = mundo({ tanda: 2 }); await ok.correr(NUEVO, RAILWAY)
    const deTanda = ok.intake.filter((x) => x.cuerpo?.payload?.modo === 'tanda_siguiente')
    expect(deTanda).toHaveLength(1); expect(deTanda[0].llave).toBe(RAILWAY.INTERNAL_API_KEY); expect(ok.slack).toEqual([])
    const mal = mundo({ tanda: 2, llaves: ['otra'] }); await mal.correr(NUEVO, RAILWAY)
    expect(mal.slack.map((s) => String(s.text)).filter((t) => t.includes('la tanda 2'))).toHaveLength(1)
  })
  it('🔴 ningún nodo del vigía manda SALA_INGRESS_API_KEY sin respaldo', () => {
    for (const f of [NUEVO, JSON.parse(readFileSync(join(CADENA, 'vigia-ARREGLADO-llave-2026-10-21.json'), 'utf8'))]) {
      for (const n of f.nodes) {
        const s = JSON.stringify(n.parameters)
        if (s.includes('SALA_INGRESS_API_KEY')) expect(s, n.name).toContain('SALA_INGRESS_API_KEY || $env.INTERNAL_API_KEY')
      }
    }
  })
})

describe('LA FORMA DEL CAMBIO sobre el vivo', () => {
  it('🔴 LINAJE: el ARREGLADO es exactamente lo que produce el reparador sobre el vivo de hoy (ANTES)', () => {
    const arreglado = JSON.parse(readFileSync(join(CADENA, 'vigia-ARREGLADO-llave-2026-10-21.json'), 'utf8'))
    expect(JSON.stringify(repararVigia(ANTES))).toBe(JSON.stringify(arreglado))
  })
  it('cambia 2 nodos (la cabecera) y agrega 4 (2 de revisión + 2 de aviso); ningún otro nodo ni cable cambia', () => {
    const a = JSON.parse(readFileSync(join(CADENA, 'vigia-ARREGLADO-llave-2026-10-21.json'), 'utf8'))
    const antes = new Map((ANTES.nodes as any[]).map((n) => [n.name, JSON.stringify(n)]))
    expect(a.nodes).toHaveLength(ANTES.nodes.length + 4)
    expect(a.nodes.filter((n: any) => antes.has(n.name) && antes.get(n.name) !== JSON.stringify(n)).map((n: any) => n.name).sort()).toEqual(['3 · Sobre a la sala (lote)', '4 · Sobre a la sala (tanda)'])
    expect(a.nodes.filter((n: any) => !antes.has(n.name)).map((n: any) => n.name).sort()).toEqual(['3 · Aviso · la sala rechazó el lote', '3 · ¿La sala aceptó el lote?', '4 · Aviso · la sala rechazó la tanda', '4 · ¿La sala aceptó la tanda?'].sort())
    const distintas = Object.keys({ ...ANTES.connections, ...a.connections }).filter((k) => JSON.stringify((ANTES.connections as any)[k]) !== JSON.stringify(a.connections[k])).sort()
    expect(distintas).toEqual(['3 · Sobre a la sala (lote)', '3 · ¿La sala aceptó el lote?', '4 · Sobre a la sala (tanda)', '4 · ¿La sala aceptó la tanda?'].sort())
  })
  it('el reloj, los avisos del reloj y el latido NO se tocan (mismos nodos que el vivo)', () => {
    const a = JSON.parse(readFileSync(join(CADENA, 'vigia-ARREGLADO-llave-2026-10-21.json'), 'utf8'))
    for (const nombre of ['Cada 12 horas', '1 · Reloj', '1 · Avisos', '1 · Aviso · #alertas', '2 · Campañas activas', '3 · Lotes', '3 · Sobres de lote', '4 · Tanda siguiente', '4 · Sobres de tanda']) {
      expect(JSON.stringify(a.nodes.find((n: any) => n.name === nombre)), nombre).toBe(JSON.stringify((ANTES.nodes as any[]).find((n) => n.name === nombre)))
    }
  })
  it('repararlo dos veces, o reparar algo que no es el vigía, falla (no duplica nodos)', () => {
    expect(() => repararVigia(NUEVO)).toThrow(); expect(() => repararVigia({ nodes: [], connections: {} })).toThrow()
  })
  it('los nodos de código nuevos compilan y solo leen nodos que existen en el flujo', () => {
    const nombres = new Set(NUEVO.nodes.map((n) => n.name))
    for (const n of NUEVO.nodes.filter((x) => /¿La sala aceptó/.test(x.name))) {
      expect(() => new (Object.getPrototypeOf(async function () {}).constructor)('$input', '$json', '$', '$env', n.parameters.jsCode)).not.toThrow()
      for (const m of String(n.parameters.jsCode).matchAll(/\$\('([^']+)'\)/g)) expect(nombres.has(m[1]), `${n.name} lee «${m[1]}»`).toBe(true)
    }
  })
})
