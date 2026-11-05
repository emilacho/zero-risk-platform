/**
 * PUENTE · el retiro de las fichas de lo cerrado corre en CADA corrida de cada cliente (encargo 05-nov «versión vieja, puente y teléfono», punto 2) · US$ 0 · base falsa.
 * Antes solo corría si el puente tenía pendientes (`p.quedan > 0` en el nodo ④ bis): casi nunca. Ahora corre en /alimentar, que el flujo llama siempre.
 * Una alarma por incidente: leer la base falla para todos (clave común); no poder escribir las fichas de un cliente es SU incidente (su clave).
 * También cubre los mutantes vivos de CC6: las columnas de autor en los dos lectores (con una base que SOLO devuelve las columnas pedidas).
 */
import { describe, expect, it } from 'vitest'
import { planesDeNoventaDias } from '../plan-vigente'
import { retirarFichasDeLoCerrado } from '../retiro-de-lo-cerrado'
import { CLAVE_DEL_RETIRO, claveDelRetiroDe, retirarLoCerradoYAvisar, rutaAlimentar } from '../rutas'
import { crearBaseFalsa } from './base-falsa'

const C = '55555555-5555-4555-8555-555555555555'
const D1 = new Date('2026-10-16T10:30:00Z')
const WF = { workflow_id: 'wf', workflow_execution_id: 'ex' }
type Fila = Record<string, unknown>

/** el mundo mínimo de una corrida + un plan rechazado en la revisión y la ficha que se sacó de él */
const mundo = (cola: Fila[] = [{ client_id: C, output_id: 'P', type: 'plan_aprobacion', status: 'rejected', decision: {}, reviewer: 'emilio', resolved_by: null, resolved_at: '2026-10-15T10:00:00Z', created_at: '2026-10-14T10:00:00Z' }]) => ({
  clients: [{ id: C, name: 'Estudio Brisa', website_url: 'https://brisa.example', config: {} }],
  client_sedes: [{ client_id: C, ciudad: 'Cuenca', clave: 'cuenca' }],
  apify_raw: [] as Fila[], cerebro_unidades_vistas: [], cerebro_ingresos: [], cerebro_portero_corridas: [], costs: [], agent_invocations: [], client_brain_chunks: [] as Fila[],
  cerebro_fichas: [{ id: 'R1', client_id: C, ref: 'client_historical_outputs:P', clase: 'plan', titulo: 'plan', contenido: 'el plan', propiedad: 'propia', origen: 'su_fuente', descartada: false, retirada_en: null }] as Fila[],
  client_historical_outputs: [{ id: 'P', client_id: C, output_type: 'campaign_plan_90d', status: 'pending_review', provenance_tag: {} }],
  hitl_queue: cola, plan_aprobaciones: [] as Fila[],
})
const viva = (t: ReturnType<typeof mundo>) => !(t.cerebro_fichas.find((f) => f.id === 'R1') as Fila).retirada_en

describe('el retiro corre en cada corrida de /alimentar, haya o no pendientes en el puente', () => {
  it('con el puente APAGADO (nada que reconciliar): igual retira la ficha de lo cerrado, con su motivo y su autor', async () => {
    const t = mundo()
    const r = await rutaAlimentar({ db: crearBaseFalsa(t as never).db, interruptores: { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: false }, ahora: D1 }, { client_id: C, dry_run: false, ...WF })
    expect(r.status).toBe(200)
    expect(viva(t)).toBe(false)
    expect(String((t.cerebro_fichas[0] as Fila).motivo_retirada)).toMatch(/la plataforma lo cerró: .*rechazado en la revisión.*emilio/)
    expect(r.body.retiro_de_lo_cerrado).toEqual({ retiradas: 1, errores: [] })
  })
  it('con el puente encendido y SIN pendientes (quedan 0): también retira', async () => {
    const t = mundo()
    const r = await rutaAlimentar({ db: crearBaseFalsa(t as never).db, interruptores: { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: true }, ahora: D1, puente: async () => ({ escritos: 0, sacados: 0, errores: [] }) }, { client_id: C, dry_run: false, ...WF })
    expect((r.body.puente as { quedan: number }).quedan).toBe(0)
    expect(viva(t)).toBe(false)
  })
  it('en seco: dice qué retiraría y no toca nada', async () => {
    const t = mundo()
    const r = await rutaAlimentar({ db: crearBaseFalsa(t as never).db, interruptores: { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: false }, ahora: D1 }, { client_id: C, dry_run: true })
    expect(r.body.retiro_de_lo_cerrado).toEqual({ retiradas: 1, errores: [] })
    expect(viva(t)).toBe(true)
  })
  it('una falla del retiro no apaga al portero: va por su alarma y se dice aparte, sin volver «con errores» la corrida', async () => {
    const t = mundo()
    const alarmas: string[] = []
    const r = await rutaAlimentar({ db: crearBaseFalsa(t as never, { fallaEn: 'plan_aprobaciones' }).db, interruptores: { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: false }, ahora: D1, avisarIncidente: async (_x: string, c: string) => { alarmas.push(c) } }, { client_id: C, dry_run: false, ...WF })
    expect(r.status).toBe(200)
    expect((r.body.retiro_de_lo_cerrado as { errores: string[] }).errores).toHaveLength(1)
    expect(r.body.estado).not.toBe('con_errores')
    expect(alarmas).toEqual([CLAVE_DEL_RETIRO])
  })
  it('un cliente que no existe no dispara el retiro', async () => {
    const t = mundo()
    const r = await rutaAlimentar({ db: crearBaseFalsa({ ...t, clients: [] } as never).db, interruptores: { alimentar: true, proponer_busquedas: false, menciones: false, puente_al_indice: false }, ahora: D1 }, { client_id: C, dry_run: false, ...WF })
    expect(r.status).toBe(404)
    expect(r.body.retiro_de_lo_cerrado).toBeUndefined()
    expect(viva(t)).toBe(true)
  })
})

describe('una alarma por incidente', () => {
  const registro = () => { const avisos: Array<[string, string]> = [], cierres: string[] = []; return { avisos, cierres, deps: { avisarIncidente: async (x: string, c: string) => { avisos.push([x, c]) }, resolverIncidente: async (c: string) => { cierres.push(c) } } } }
  /** la base deja leer pero no escribir fichas */
  const sinEscribirFichas = (db: { from: (t: string) => any }) => ({ from(tabla: string) {
    const q = db.from(tabla)
    if (tabla !== 'cerebro_fichas') return q
    q.update = () => { q.then = (ok: (x: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'sin permiso' } }).then(ok); return q }
    return q
  } })
  it('leer falla: clave COMÚN (un incidente aunque fallen todos los clientes); no se cierra nada', async () => {
    const r = registro()
    for (const cliente of [C, '66666666-6666-4666-8666-666666666666']) await retirarLoCerradoYAvisar({ db: crearBaseFalsa(mundo() as never, { fallaEn: 'hitl_queue' }).db, ...r.deps }, cliente, false)
    expect(r.avisos.map((a) => a[1])).toEqual([CLAVE_DEL_RETIRO, CLAVE_DEL_RETIRO])
    expect(r.avisos[0][0]).toContain('no se están retirando')
    expect(r.cierres).toEqual([])
  })
  it('no poder LEER las fichas también es falla de lectura: clave común, no la del cliente', async () => {
    const r = registro()
    const cierre = await retirarLoCerradoYAvisar({ db: crearBaseFalsa(mundo() as never, { fallaEn: 'cerebro_fichas' }).db, ...r.deps }, C, false)
    expect(cierre.lectura_fallida).toBe(true)
    expect(r.avisos.map((a) => a[1])).toEqual([CLAVE_DEL_RETIRO])
    expect(r.cierres).toEqual([])
  })
  it('escribir falla para un cliente: SU clave; la común se cierra porque leer sí funciona', async () => {
    const r = registro()
    const cierre = await retirarLoCerradoYAvisar({ db: sinEscribirFichas(crearBaseFalsa(mundo() as never).db), ...r.deps }, C, false)
    expect(cierre.lectura_fallida).toBeUndefined()
    expect(r.avisos.map((a) => a[1])).toEqual([claveDelRetiroDe(C)])
    expect(r.avisos[0][0]).toContain(C)
    expect(r.cierres).toEqual([CLAVE_DEL_RETIRO])
  })
  it('la corrida sana de OTRO cliente no cierra el incidente del primero', async () => {
    const r = registro()
    const otro = '66666666-6666-4666-8666-666666666666'
    await retirarLoCerradoYAvisar({ db: crearBaseFalsa(mundo() as never).db, ...r.deps }, otro, false)
    expect(r.cierres).toEqual([CLAVE_DEL_RETIRO, claveDelRetiroDe(otro)])
    expect(r.cierres).not.toContain(claveDelRetiroDe(C))
  })
  it('en seco no avisa ni cierra', async () => {
    const r = registro()
    await retirarLoCerradoYAvisar({ db: crearBaseFalsa(mundo() as never, { fallaEn: 'hitl_queue' }).db, ...r.deps }, C, true)
    expect([r.avisos, r.cierres]).toEqual([[], []])
  })
})

describe('las columnas de autor: los dos lectores las piden de verdad (base que solo devuelve lo pedido)', () => {
  /** como la base real: cada consulta devuelve SOLO las columnas que nombró su select */
  const soloLoPedido = (db: { from: (t: string) => any }) => ({ from(tabla: string) {
    const q = db.from(tabla)
    let cols: string[] | null = null
    const select = q.select
    q.select = (c?: string) => { if (c && c.trim() !== '*') cols = c.split(',').map((s) => s.trim()); select(c); return q }
    const then = q.then
    q.then = (ok: (x: unknown) => unknown, ko?: (e: unknown) => unknown) => then((r: { data: unknown }) => ok(cols && Array.isArray(r?.data) ? { ...r, data: (r.data as Fila[]).map((f) => Object.fromEntries(cols!.map((k) => [k, f[k]]))) } : r), ko)
    return q
  } })
  const conAutor = (col: 'reviewer' | 'resolved_by') => mundo([{ client_id: C, output_id: 'P', type: 'plan_aprobacion', status: 'rejected', decision: {}, reviewer: null, resolved_by: null, [col]: `autor-en-${col}`, resolved_at: '2026-10-15T10:00:00Z', created_at: '2026-10-14T10:00:00Z' }])
  for (const col of ['reviewer', 'resolved_by'] as const) {
    it(`retiro: el motivo nombra al autor que está en \`${col}\``, async () => {
      const t = conAutor(col)
      const r = await retirarFichasDeLoCerrado(soloLoPedido(crearBaseFalsa(t as never).db), C, { dryRun: true })
      expect(r.retiradas.map((x) => x.motivo)).toEqual([expect.stringContaining(`autor-en-${col}`)])
    })
    it(`plan de 90 días: el motivo del cerrado nombra al autor que está en \`${col}\``, async () => {
      const t = conAutor(col)
      const p = await planesDeNoventaDias(soloLoPedido(crearBaseFalsa(t as never).db), C)
      expect(p.ok && p.cerrados.map((x) => x.motivo)).toEqual([expect.stringContaining(`autor-en-${col}`)])
    })
  }
  it('una limpieza no es una decisión: la fila marcada por limpieza no cierra el plan (autor leído de la columna)', async () => {
    const t = mundo([{ client_id: C, output_id: 'P', type: 'plan_aprobacion', status: 'rejected', decision: {}, reviewer: 'limpieza-cc2', resolved_by: null, resolved_at: '2026-10-15T10:00:00Z', created_at: '2026-10-14T10:00:00Z' }])
    const p = await planesDeNoventaDias(soloLoPedido(crearBaseFalsa(t as never).db), C)
    expect(p.ok && p.vigentes).toEqual(['P'])
    const r = await retirarFichasDeLoCerrado(soloLoPedido(crearBaseFalsa(t as never).db), C, { dryRun: true })
    expect(r.retiradas).toEqual([])
  })
})
