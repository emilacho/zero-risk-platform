/**
 * PAUSA «HASTA QUE TERMINE LA ALTA» (30-oct · firma de Emilio). US$ 0 · base falsa. Cubre: pausar → la corrida diaria lo salta; la alta (despertar/completar) NO se frena;
 * el «listo» / el completar de la alta cierra la pausa SOLA con motivo y quién; una alta anterior a la pausa no la cierra; una pausa sin condición no se toca; la siguiente corrida diaria lo incluye.
 */
import { describe, expect, it } from 'vitest'
import { alimentarCliente } from '../alimentar'
import { clientesActivos } from '../clientes'
import { rutaDespertar } from '../despertar'
import { rutaListo } from '../listo'
import { FIN_ALTA_TERMINADA, cerrarPausasDeAlta, rutaPausarHastaLaAlta } from '../pausas'
import { AHORA, CASOS, ON, REAL, montar, tablas } from './fixtures-despertar'

type T = Record<string, Array<Record<string, unknown>>>
type Falta = Array<{ funcion: string; objetivo: string }>
const min = (n: number) => new Date(AHORA.getTime() + n * 60_000)
const c = CASOS[0]
const pausa = (t: T, extra: Record<string, unknown> = {}) => t.cerebro_portero_pausas.push({ id: 'p1', client_id: c.id, motivo: 'desde cero', problemas: [], desde: min(-60).toISOString(), levantada_en: null, ...extra })
const activos = async (t: T, ahora: Date) => { const r = await clientesActivos(montar(t, { ahora }).base.db as never); if (!r.ok) throw new Error(r.detalle); return r.datos }
async function cadena(t: T, falta: Falta, cuando: Date) {
  for (const a of falta) t.apify_raw.push({ id: `cad-${a.funcion}-${t.apify_raw.length}`, client_id: c.id, apify_function: a.funcion, ensayo: false, created_at: cuando.toISOString(), params: {}, metadata: {}, respuesta: [] })
  const m = montar(t, { ahora: cuando })
  return alimentarCliente({ db: m.base.db, client_id: c.id, dry_run: false, interruptores: ON, ahora: cuando, gasto_de_hoy_usd: 0, workflow_id: 'ogfq56oIEoHufFPM', workflow_execution_id: 'ex-cadena-1' })
}
const nueva = (): T => { const t = tablas(c) as T; t.cerebro_portero_pausas = []; return t }

describe('pausa hasta la alta', () => {
  it('pausar (o convertir la abierta) deja la condición; dry_run no escribe', async () => {
    const t = nueva(); pausa(t)
    const m = montar(t)
    const seco = await rutaPausarHastaLaAlta({ db: m.base.db as never }, { client_id: c.id, dry_run: true, motivo: 'x', por: 'CC' })
    expect(seco.body).toMatchObject({ dry_run: true }); expect(t.cerebro_portero_pausas[0].termina_con).toBeUndefined()
    const r = await rutaPausarHastaLaAlta({ db: m.base.db as never }, { client_id: c.id, dry_run: false, workflow_id: 'w', workflow_execution_id: 'e', motivo: 'desde cero', por: 'CC-CEREBRO' })
    expect(r.body).toMatchObject({ ok: true, convertida: true })
    expect(t.cerebro_portero_pausas).toHaveLength(1); expect(t.cerebro_portero_pausas[0].termina_con).toBe(FIN_ALTA_TERMINADA)
    const mal = await rutaPausarHastaLaAlta({ db: m.base.db as never }, { client_id: c.id, dry_run: false, workflow_id: 'w', workflow_execution_id: 'e' })
    expect(mal.status).toBe(400)
  })

  it('sin pausa previa abre una con la condición', async () => {
    const t = nueva()
    const r = await rutaPausarHastaLaAlta({ db: montar(t).base.db as never, ahora: AHORA }, { client_id: c.id, dry_run: false, workflow_id: 'w', workflow_execution_id: 'e', motivo: 'desde cero', por: 'CC' })
    expect(r.body).toMatchObject({ abierta: true })
    expect(t.cerebro_portero_pausas[0]).toMatchObject({ client_id: c.id, termina_con: FIN_ALTA_TERMINADA })
    expect(t.cerebro_portero_pausas[0].levantada_en ?? null).toBeNull()
  })

  it('pausa → la alta pasa (despertar no se frena) → completar cierra la pausa sola → la corrida diaria lo incluye', async () => {
    const t = nueva(); pausa(t, { termina_con: FIN_ALTA_TERMINADA })
    const r = await rutaDespertar(montar(t).deps, { client_id: c.id, ...REAL })
    expect(r.body).toMatchObject({ ok: true }) // la pausa no frenó el despertar
    expect(t.cerebro_portero_pausas[0].levantada_en).toBeNull() // el despertar solo deja «completando»: la alta no terminó
    expect((await activos(t, min(5))).excluidos.map((e) => e.client_id)).toContain(c.id)
    const falta = r.body.por_pedir_en_la_corrida_diaria as Falta
    await cadena(t, falta, min(20))
    const p = t.cerebro_portero_pausas[0]
    expect(p.levantada_en).toBeTruthy(); expect(p.levantada_por).toBe('alta terminada'); expect(String(p.motivo_de_levantarla)).toMatch(/alta terminada/)
    expect((await activos(t, min(21))).clientes.map((x) => x.client_id)).toContain(c.id)
  })

  it('el «listo» también la cierra (idempotente) y lo dice', async () => {
    const t = nueva()
    const r = await rutaDespertar(montar(t).deps, { client_id: c.id, ...REAL })
    await cadena(t, r.body.por_pedir_en_la_corrida_diaria as Falta, min(20))
    pausa(t, { desde: min(-5).toISOString(), termina_con: FIN_ALTA_TERMINADA }) // pausa abierta ANTES de que corra el despertar
    const l = await rutaListo(montar(t, { ahora: min(21) }).deps, { client_id: c.id })
    expect(l.body).toMatchObject({ listo: true, pausa_de_alta: { cerradas: 1 } })
    expect(t.cerebro_portero_pausas[0].levantada_por).toBe('alta terminada')
    const otra = await rutaListo(montar(t, { ahora: min(22) }).deps, { client_id: c.id })
    expect((otra.body as { pausa_de_alta?: unknown }).pausa_de_alta).toBeUndefined()
  })

  it('una alta ANTERIOR a la pausa no la cierra, y una pausa sin condición no se toca', async () => {
    const t = nueva(); pausa(t, { termina_con: FIN_ALTA_TERMINADA }); pausa(t, { id: 'p2', client_id: 'otro', termina_con: null })
    const db = montar(t).base.db as never
    expect(await cerrarPausasDeAlta(db, c.id, min(-120), AHORA)).toEqual({ cerradas: 0 })
    expect(await cerrarPausasDeAlta(db, 'otro', min(5), AHORA)).toEqual({ cerradas: 0 })
    expect(t.cerebro_portero_pausas.every((p) => p.levantada_en === null)).toBe(true)
    expect(await cerrarPausasDeAlta(db, c.id, min(5), AHORA)).toEqual({ cerradas: 1 })
  })

  it('si la base falla al cerrar, lo DICE y no lanza', async () => {
    const roto = { from: () => { throw new Error('base caída') } } as never
    expect(await cerrarPausasDeAlta(roto, c.id, AHORA)).toMatchObject({ cerradas: 0, error: 'base caída' })
  })
})
