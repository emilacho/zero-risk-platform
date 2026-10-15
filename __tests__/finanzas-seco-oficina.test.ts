/**
 * KIT DEL SECO DE LA OFICINA FINANCIERA (CC#2 · 14-oct): la matriz COMPLETA (7 negocios × tuteo/voseo × 10 casos = 140 celdas) corre contra la RUTA REAL `/api/finanzas/conversa`, con el
 * almacén real sobre una base en memoria y los agentes SIMULADOS. US$ 0, cero red, cero Slack. Es el mismo conductor (`nucleo.mjs`) que el CLI usa contra Vercel y la base real.
 * Si una expectativa de la matriz fuera falsa, esta prueba la nombra ANTES de tocar la base de verdad.
 */
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { CLIENTES, NEGOCIOS } from '../scripts/ops/finanzas-seco/fixtures.mjs'
import { CASOS, celdas, REGISTROS, resumenDeLaMatriz } from '../scripts/ops/finanzas-seco/matriz.mjs'
import { correrCelda } from '../scripts/ops/finanzas-seco/nucleo.mjs'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => h.db }))
import { POST } from '../src/app/api/finanzas/conversa/route'
import { modeloSimulado, validarSimulacion } from '../src/lib/finanzas/conversa/simulado'

const LLAVE = 'llave-interna-de-prueba-del-seco'
const RAIZ = path.resolve(__dirname, '..')
const IDS = CLIENTES.map((c: { id: string }) => c.id)

/** base falsa: tablas en memoria con select/eq/in/order/limit/maybeSingle/single/insert/update/upsert y el índice único «una abierta por cliente» */
function baseFalsa(config: Record<string, unknown>) {
  const t: Record<string, any[]> = { finanzas_config: [{ id: 1, ...config }], finanzas_encargos: [], finanzas_turnos: [], finanzas_artefactos: [] }
  let id = 0
  const from = (tabla: string) => {
    const q: any = { op: 'select', filtros: [] as Array<(f: any) => boolean>, orden: null, lim: Infinity, fila: null, conflicto: null }
    const ejecutar = () => {
      const filas = t[tabla]
      const sel = filas.filter((f) => q.filtros.every((fn: any) => fn(f)))
      if (q.op === 'insert') {
        if (tabla === 'finanzas_encargos' && filas.some((f) => f.client_id === q.fila.client_id && ['abierto', 'en_curso'].includes(f.estado))) return { data: null, error: { message: 'duplicate key', code: '23505' } }
        const nueva = { id: `f-${++id}`, ...structuredClone(q.fila) }
        filas.push(nueva)
        return { data: structuredClone(nueva), error: null }
      }
      if (q.op === 'upsert') {
        const claves = String(q.conflicto).split(',')
        const ya = filas.find((f) => claves.every((k) => f[k] === q.fila[k]))
        if (ya) Object.assign(ya, structuredClone(q.fila)); else filas.push({ id: `f-${++id}`, ...structuredClone(q.fila) })
        return { data: null, error: null }
      }
      if (q.op === 'update') { sel.forEach((f) => Object.assign(f, structuredClone(q.fila))); return { data: null, error: null } }
      let r = sel.map((f) => structuredClone(f))
      if (q.orden) r = r.sort((a, b) => (a[q.orden[0]] > b[q.orden[0]] ? 1 : -1) * (q.orden[1] ? 1 : -1))
      return { data: r.slice(0, q.lim), error: null }
    }
    const api: any = {
      select: () => api,
      insert: (f: any) => { q.op = 'insert'; q.fila = f; return api },
      update: (f: any) => { q.op = 'update'; q.fila = f; return api },
      upsert: (f: any, o: any) => { q.op = 'upsert'; q.fila = f; q.conflicto = o?.onConflict; return api },
      eq: (k: string, v: unknown) => { q.filtros.push((f: any) => f[k] === v); return api },
      in: (k: string, v: unknown[]) => { q.filtros.push((f: any) => v.includes(f[k])); return api },
      order: (k: string, o: any) => { q.orden = [k, o?.ascending !== false]; return api },
      limit: (n: number) => { q.lim = n; return api },
      maybeSingle: async () => { const r = ejecutar(); return { data: (r.data as any[] | null)?.[0] ?? null, error: r.error } },
      single: async () => { const r = ejecutar(); return { data: Array.isArray(r.data) ? r.data[0] : r.data, error: r.error } },
      then: (res: any, rej: any) => Promise.resolve(ejecutar()).then(res, rej),
    }
    return api
  }
  return { db: { from } as any, t }
}

const ENSAYO = { estado: 'ensayo', clientes_ensayo: IDS, preguntas_slack: 'apagado', conversa: 'ensayo' }
async function llamar(cuerpo: unknown, llave: string | null = LLAVE) {
  const r = await POST(new Request('http://local/api/finanzas/conversa', { method: 'POST', headers: { 'content-type': 'application/json', ...(llave ? { 'x-api-key': llave } : {}) }, body: JSON.stringify(cuerpo) }))
  return { status: r.status, json: (await r.json().catch(() => null)) as any }
}
const sinFalla = (r: { status: number; json: any }) => ({ status: r.status, json: r.json })

let fake: ReturnType<typeof baseFalsa>
beforeEach(() => { fake = baseFalsa(ENSAYO); h.db = fake.db; process.env.INTERNAL_API_KEY = LLAVE; delete process.env.FINANZAS_RUN_SDK_BASE; delete process.env.SALA_DISPATCH_KEY })

describe('el kit: los clientes de práctica y la matriz', () => {
  it('son 7 negocios muy distintos, marcados de prueba, ninguno es naufrago.ec', () => {
    expect(NEGOCIOS.length).toBeGreaterThanOrEqual(7)
    expect(new Set(NEGOCIOS.map((n: { rubro: string }) => n.rubro)).size).toBe(NEGOCIOS.length)
    expect(new Set(NEGOCIOS.map((n: { evento: string }) => n.evento)).size).toBeGreaterThanOrEqual(5)
    expect(CLIENTES.every((c: { id: string; nombre: string }) => c.id.startsWith('prueba-finanzas-seco-') && c.nombre.includes('(PRUEBA)'))).toBe(true)
    expect(JSON.stringify(CLIENTES) + JSON.stringify(NEGOCIOS)).not.toMatch(/naufrago|náufrago/i)
  })
  it('140 celdas: 7 negocios × tuteo y voseo × 10 casos; cada caso tiene su expectativa', () => {
    const r = resumenDeLaMatriz()
    expect(r.total).toBe(NEGOCIOS.length * REGISTROS.length * CASOS.length)
    expect(celdas()).toHaveLength(r.total)
    expect(REGISTROS).toEqual(['tuteo', 'voseo'])
    expect(CASOS.map((c: { caso: string }) => c.caso)).toEqual(expect.arrayContaining(['completo', 'sin-referencia', 'sin-pauta', 'jefe-sin-respuesta', 'formato-roto-una-vez', 'formato-roto-siempre', 'tope']))
    expect(CASOS.every((c: { espera: unknown }) => !!c.espera)).toBe(true)
  })
  it('el manual del cliente en voseo viaja en la semilla; la instrucción de la oficina no', () => {
    const v = celdas({ registro: 'voseo', caso: 'completo' })[0]
    const t = celdas({ registro: 'tuteo', caso: 'completo' })[0]
    expect(v.semilla.manual_resumen).toMatch(/habla de vos: «contanos»/)
    expect(t.semilla.manual_resumen).toMatch(/habla de tú: «cuéntanos»/)
    expect(t.semilla.manual_resumen).not.toMatch(/contanos/)
  })
})

describe('la matriz completa, por la ruta real y con agentes simulados (US$ 0)', () => {
  it('las 140 celdas dan lo que el diseño espera', async () => {
    const malas: string[] = []
    let hechas = 0
    for (const celda of celdas()) {
      const r = await correrCelda(llamar, celda)
      hechas++
      if (!r.veredicto.ok) malas.push(`${celda.id}: ${r.veredicto.fallas.join(' | ')}`)
    }
    expect(hechas).toBe(140)
    expect(malas).toEqual([])
  }, 120_000)

  it('el seco no escribe tablero ni números ni preguntas: solo encargos, turnos y artefactos de práctica', async () => {
    for (const celda of celdas({ caso: 'completo' })) await correrCelda(llamar, celda)
    expect(fake.t.finanzas_encargos.length).toBeGreaterThan(0)
    expect(fake.t.finanzas_encargos.every((e) => e.dry_run === true && IDS.includes(e.client_id))).toBe(true)
    expect(Object.keys(fake.t).sort()).toEqual(['finanzas_artefactos', 'finanzas_config', 'finanzas_encargos', 'finanzas_turnos'])
  })

  it('una celda de tope termina cerrada por tope y la conversación jamás pasa del tope + una llamada', async () => {
    const c = celdas({ caso: 'tope' })[0]
    const r = await correrCelda(llamar, c)
    expect(r.obs.estado).toBe('cierre_por_tope')
    expect(r.obs.gasto_usd).toBeGreaterThanOrEqual(1.5)
    expect(r.obs.gasto_usd).toBeLessThanOrEqual(1.5 + 0.6 + 1e-9)
  })

  it('la ronda 2 es UNA sola vuelta y solo habla el aludido', async () => {
    const r = await correrCelda(llamar, celdas({ caso: 'ronda-2' })[0])
    expect(r.veredicto.fallas).toEqual([])
    const redes = r.obs.pasos.filter((p: string) => /redes/.test(p))
    expect(redes).toEqual(['redes', 'redes_2'])
    expect(r.obs.pasos.filter((p: string) => /cierre/.test(p)).length).toBeLessThanOrEqual(2)
  })
})

describe('la puerta de la simulación', () => {
  const SEM = { evento: 'mensaje', dias_activos_por_semana: 5 }
  it('sobre un encargo REAL (dry_run=false) la simulación responde 409 y no llama ni a un agente simulado', async () => {
    const a = await llamar({ accion: 'abrir', client_id: IDS[0], dry_run: false, semilla: SEM })
    expect(a.status).toBe(200)
    const r = await llamar({ accion: 'avanzar', encargo_id: a.json.encargo_id, simulacion: { guion: { planteo: {} } } })
    expect(r.status).toBe(409)
    expect(r.json.error).toBe('simulacion_solo_en_seco')
    const l = await llamar({ accion: 'leer', encargo_id: a.json.encargo_id })
    expect(l.json.turnos).toEqual([])
    expect(fake.t.finanzas_turnos).toHaveLength(0)
  })
  it('una simulación mal formada da 400 y nada se ejecuta', async () => {
    const a = await llamar({ accion: 'abrir', client_id: IDS[0], dry_run: true, semilla: SEM })
    for (const mala of ['texto', [], { guion: 'x' }, { guion: {}, costo_por_llamada_usd: -1 }, { guion: {}, costo_por_llamada_usd: 'caro' }]) {
      const r = await llamar({ accion: 'avanzar', encargo_id: a.json.encargo_id, simulacion: mala })
      expect(r.status).toBe(400)
    }
    expect(fake.t.finanzas_turnos).toHaveLength(0)
  })
  it('apagada manda sobre todo: 409 aunque la simulación sea válida', async () => {
    fake.t.finanzas_config[0].conversa = 'apagado'
    const r = await llamar({ accion: 'avanzar', encargo_id: 'x', simulacion: { guion: {} } })
    expect(r.status).toBe(409)
    expect(r.json.error).toBe('conversa_apagada')
  })
  it('sin llave 401, con una llave equivocada 401; la de despacho no abre', async () => {
    expect((await llamar({ accion: 'leer', encargo_id: 'x' }, null)).status).toBe(401)
    expect((await llamar({ accion: 'leer', encargo_id: 'x' }, 'otra')).status).toBe(401)
    process.env.SALA_DISPATCH_KEY = 'llave-de-despacho'
    expect((await llamar({ accion: 'leer', encargo_id: 'x' }, 'llave-de-despacho')).status).toBe(401)
  })
  it('abrir: dry_run ausente o no booleano 400 · cliente fuera del ensayo 409 · sin semilla 400 · semilla enorme 413', async () => {
    expect((await llamar({ accion: 'abrir', client_id: IDS[0], semilla: SEM })).status).toBe(400)
    expect((await llamar({ accion: 'abrir', client_id: IDS[0], dry_run: 'true', semilla: SEM })).status).toBe(400)
    expect((await llamar({ accion: 'abrir', client_id: 'cliente-que-no-es-de-practica', dry_run: true, semilla: SEM })).status).toBe(409)
    expect((await llamar({ accion: 'abrir', client_id: IDS[0], dry_run: true })).status).toBe(400)
    expect((await llamar({ accion: 'abrir', client_id: IDS[0], dry_run: true, semilla: { ficha_resumen: 'x'.repeat(41_000) } })).status).toBe(413)
    expect((await llamar({ accion: 'avanzar', encargo_id: 'no-existe' })).status).toBe(404)
    expect((await llamar({ accion: 'otra' })).status).toBe(400)
    expect(fake.t.finanzas_encargos).toHaveLength(0)
  })
})

describe('la ruta SIN simulación (menor 1 de CC#3)', () => {
  const SEM = { evento: 'mensaje', dias_activos_por_semana: 5 }
  it('avanzar sin `simulacion` NO usa el guion: llama al modelo real (aquí sin workflow_id) y no devuelve `simulado`', async () => {
    const a = await llamar({ accion: 'abrir', client_id: IDS[0], dry_run: true, semilla: SEM })
    const id = a.json.encargo_id
    const abrir = await llamar({ accion: 'avanzar', encargo_id: id })
    expect(abrir.status).toBe(200)
    expect(abrir.json.paso).toBe('abrir')
    const planteo = await llamar({ accion: 'avanzar', encargo_id: id })
    expect(planteo.status).toBe(200)
    expect(planteo.json.paso).toBe('planteo')
    expect(planteo.json.simulado).toBeUndefined()
    expect(planteo.json.degradado).toBe(true)
    const l = await llamar({ accion: 'leer', encargo_id: id })
    // la base de run-sdk ya tiene respaldo (ver finanzas-run-sdk-base.test.ts): sin workflow_id real el turno no sale a la red
    expect(l.json.turnos.find((t: { paso: string }) => t.paso === 'planteo').error).toMatch(/sin_workflow_id/)
  })
  it('con `simulacion` sí devuelve `simulado` y el turno sale hecho', async () => {
    const a = await llamar({ accion: 'abrir', client_id: IDS[0], dry_run: true, semilla: SEM })
    const sim = { guion: { planteo: { meta_por_semana: 5, zonas: [], dias_y_horarios: { dias_activos_por_semana: 5 }, evento: 'mensaje', canales: [], no_se: [] } } }
    await llamar({ accion: 'avanzar', encargo_id: a.json.encargo_id, simulacion: sim })
    const r = await llamar({ accion: 'avanzar', encargo_id: a.json.encargo_id, simulacion: sim })
    expect(r.json.simulado.llamadas).toHaveLength(1)
    expect(r.json.degradado).toBe(false)
  })
})

describe('el modelo simulado', () => {
  it('una lista son intentos sucesivos del mismo turno; null no contesta; un paso sin guion falla sin gastar de más', async () => {
    const m = modeloSimulado({ guion: { planteo: ['roto', { ok: 1 }], cierre: null }, costo_por_llamada_usd: 0.2 })
    const p = { agente: 'a', tarea: 't', encargo_id: 'e', client_id: 'c', tope_usd: 1, dry_run: true }
    expect(await m.invocar({ ...p, paso: 'planteo' })).toEqual({ ok: true, salida: 'roto', costo_usd: 0.2 })
    expect(await m.invocar({ ...p, paso: 'planteo' })).toEqual({ ok: true, salida: '{"ok":1}', costo_usd: 0.2 })
    expect(await m.invocar({ ...p, paso: 'planteo' })).toEqual({ ok: true, salida: '{"ok":1}', costo_usd: 0.2 })
    expect(await m.invocar({ ...p, paso: 'cierre' })).toEqual({ ok: false, error: 'sin_respuesta', costo_usd: 0.2 })
    expect((await m.invocar({ ...p, paso: 'otro' })).ok).toBe(false)
  })
  it('valida la forma de la simulación', () => {
    expect(validarSimulacion({ guion: {} }).ok).toBe(true)
    expect(validarSimulacion({ guion: {}, costo_por_llamada_usd: 9 }).ok).toBe(false)
    expect(validarSimulacion(null).ok).toBe(false)
  })
})

describe('lo que el kit nunca toca', () => {
  const kit = ['scripts/ops/finanzas-seco.mjs', 'scripts/ops/finanzas-seco/fixtures.mjs', 'scripts/ops/finanzas-seco/matriz.mjs', 'scripts/ops/finanzas-seco/nucleo.mjs', 'src/lib/finanzas/conversa/simulado.ts']
  it('ni lee ni nombra la llave de despacho, ni a naufrago.ec, ni llama a un proveedor de modelos o a Slack', () => {
    for (const f of kit) {
      const p = path.join(RAIZ, f)
      if (!fs.existsSync(p)) continue
      const s = fs.readFileSync(p, 'utf8').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(s, f).not.toMatch(/process\.env\.SALA_DISPATCH_KEY|x-sala-dispatch-key/i)
      expect(s, f).not.toMatch(/naufrago\.ec|api\.anthropic|slack\.com\/api|chat\.postMessage/i)
    }
  })
  it('el simulador y la ruta no traen fetch propio: el modelo simulado no sale a la red', () => {
    const s = fs.readFileSync(path.join(RAIZ, 'src/lib/finanzas/conversa/simulado.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
    expect(s).not.toMatch(/\bfetch\s*\(/)
  })
})
