/**
 * RECONFIRMACIÓN · CC#1 · 2026-10-08 · relevo 19 (firma «SI APROBADO»).
 * Cuando el recolector vuelve a leer un dato de sede y sigue IGUAL, no crea fila: anota `reconfirmado_en` (la fecha de esa lectura) en la última fila del grupo.
 * Caso real: los horarios de Olón y Guayaquil, que salían «vencidos» aunque se habían vuelto a ver iguales. Modelo y red: ninguno (US$ 0).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { recolectarSedes } from '../src/lib/sedes/recolectar'
import { leerSedes } from '../src/lib/cerebro/lectores'
import { PLAZOS_EN_DIAS } from '../src/lib/cerebro/plazos'

const FX = join(process.cwd(), '__tests__', 'fixtures', 'sedes-naufrago')
const SITIO = JSON.parse(readFileSync(join(FX, 'sitio-pagina.json'), 'utf8'))
const IG = JSON.parse(readFileSync(join(FX, 'instagram-perfil.json'), 'utf8'))
const REALES = JSON.parse(readFileSync(join(FX, 'mapas-fichas-reales-own-profile.json'), 'utf8'))
const CID = '41dd3d62-d6de-4c9a-9996-6df78c1da118'

type Fila = Record<string, unknown>
function base(tablas: Record<string, Fila[]>) {
  let n = 0
  const from = (t: string) => {
    const q: { f: [string, unknown][]; en: [string, unknown[]][]; ord: [string, boolean] | null; tope: number | null; ins: Fila[] | null; upd: Fila | null } = { f: [], en: [], ord: null, tope: null, ins: null, upd: null }
    const api: Record<string, unknown> = {
      select: () => api,
      eq: (c: string, v: unknown) => { q.f.push([c, v]); return api },
      in: (c: string, v: unknown[]) => { q.en.push([c, v]); return api },
      order: (c: string, o: { ascending: boolean }) => { q.ord = [c, o.ascending]; return api },
      limit: (k: number) => { q.tope = k; return api },
      insert: (filas: Fila[]) => { const c = filas.map((x) => ({ id: '00000000-0000-4000-8000-' + String(++n).padStart(12, '0'), ...x })); (tablas[t] ||= []).push(...c); q.ins = c; return api },
      update: (v: Fila) => { q.upd = v; return api },
      then: (ok: (v: unknown) => unknown) => {
        const filtradas = (tablas[t] || []).filter((x) => q.f.every(([c, v]) => x[c] === v) && q.en.every(([c, vs]) => vs.includes(x[c])))
        if (q.upd) { for (const x of filtradas) Object.assign(x, q.upd); return Promise.resolve({ data: filtradas, error: null }).then(ok) }
        let r = q.ins ?? filtradas
        if (q.ord) { const [c, asc] = q.ord; r = [...r].sort((a, b) => (String(a[c]) < String(b[c]) ? -1 : 1) * (asc ? 1 : -1)) }
        if (q.tope !== null) r = r.slice(0, q.tope)
        return Promise.resolve({ data: r, error: null }).then(ok)
      },
    }
    return api
  }
  return { cliente: { from } as never, tablas }
}
const rawIg = (id: string, cuando: string, perfil: unknown = IG): Fila => ({ id, client_id: CID, apify_function: 'instagram_scraper', params: { usernames: ['naufrago.ec'] }, respuesta: [perfil], ensayo: false, created_at: cuando })
const rawMapas = (id: string, cuando: string): Fila => ({ id, client_id: CID, apify_function: 'own_google_maps_profile', params: {}, respuesta: REALES.items, ensayo: false, created_at: cuando })
const mundo = (raws: Fila[]) => base({
  clients: [{ id: CID, name: 'Náufrago', website_url: 'https://www.naufrago.ec', config: { apify: { own_handles: { instagram: 'naufrago.ec' } } } }],
  client_web_pages: [{ client_id: CID, owner_role: 'propio', url: SITIO.url, content_text: SITIO.content_text, crawled_at: SITIO.crawled_at }],
  apify_raw: raws, client_sedes: [], client_sede_datos: [],
})
const datos = (m: ReturnType<typeof mundo>) => m.tablas.client_sede_datos
const T1 = '2026-10-01T23:45:36.495+00:00'
const T2 = '2026-10-08T06:30:00.000+00:00'
const T3 = '2026-10-09T06:30:00.000+00:00'

describe('lo que se vuelve a leer y sigue igual se RECONFIRMA, no se duplica', () => {
  it('🔴 ROJO de hoy → VERDE: segundo raspado del Instagram igual ⇒ 0 filas nuevas y `reconfirmado_en` = fecha del segundo raspado en las filas de Instagram', async () => {
    const m = mundo([rawIg('ig1', T1)])
    await recolectarSedes(m.cliente, CID)
    const filas = datos(m).length
    const deIg = datos(m).filter((d) => d.fuente === 'instagram')
    expect(deIg.length).toBeGreaterThan(0)
    expect(deIg.every((d) => d.reconfirmado_en == null)).toBe(true)
    m.tablas.apify_raw.push(rawIg('ig2', T2))
    const r = await recolectarSedes(m.cliente, CID)
    expect(r.nuevas).toBe(0)
    expect(r.reconfirmadas).toBe(deIg.length)
    expect(datos(m)).toHaveLength(filas)
    for (const d of datos(m).filter((x) => x.fuente === 'instagram')) {
      expect(new Date(String(d.reconfirmado_en)).toISOString()).toBe(new Date(T2).toISOString())
      expect(new Date(String(d.observado_en)).toISOString()).toBe(new Date(T1).toISOString()) // `observado_en` NO se toca
    }
    // las fuentes que NO se volvieron a leer (el sitio) no se tocan
    expect(datos(m).filter((d) => d.fuente === 'sitio').every((d) => d.reconfirmado_en == null)).toBe(true)
  })
  it('repetir la corrida sin raspado nuevo NO cambia nada (idempotente)', async () => {
    const m = mundo([rawIg('ig1', T1), rawIg('ig2', T2)])
    await recolectarSedes(m.cliente, CID)
    const antes = JSON.stringify(datos(m))
    const r = await recolectarSedes(m.cliente, CID)
    expect(r.nuevas).toBe(0)
    expect(r.reconfirmadas).toBe(0)
    expect(JSON.stringify(datos(m))).toBe(antes)
  })
  it('tres raspados iguales en tres días: sigue UNA fila por dato y queda reconfirmada con la fecha del más nuevo', async () => {
    const m = mundo([rawIg('ig1', T1)])
    await recolectarSedes(m.cliente, CID)
    const ids = datos(m).filter((d) => d.fuente === 'instagram').map((d) => d.id).sort()
    m.tablas.apify_raw.push(rawIg('ig2', T2))
    await recolectarSedes(m.cliente, CID)
    m.tablas.apify_raw.push(rawIg('ig3', T3))
    const r = await recolectarSedes(m.cliente, CID)
    const deIg = datos(m).filter((d) => d.fuente === 'instagram')
    expect(r.nuevas).toBe(0)
    expect(deIg.map((d) => d.id).sort()).toEqual(ids)
    for (const d of deIg) expect(new Date(String(d.reconfirmado_en)).toISOString()).toBe(new Date(T3).toISOString())
  })
  it('🔴 si el dato CAMBIÓ no se reconfirma el viejo: entra una fila nueva y la vieja queda como estaba', async () => {
    const m = mundo([rawIg('ig1', T1)])
    await recolectarSedes(m.cliente, CID)
    const antes = datos(m).filter((d) => d.fuente === 'instagram').map((d) => ({ ...d }))
    const otro = { ...IG, biography: 'Abrimos de lunes a domingo 08:00-20:00 en Olón\nGuayaquil: lunes a viernes 11:00-17:00' }
    m.tablas.apify_raw.push(rawIg('ig2', T2, otro))
    await recolectarSedes(m.cliente, CID)
    for (const a of antes) expect(datos(m).find((d) => d.id === a.id)?.reconfirmado_en ?? null).toBeNull()
  })
  it('una lectura MÁS VIEJA con el mismo valor no reconfirma nada (no se retrocede la fecha)', async () => {
    const m = mundo([rawIg('ig2', T2)])
    await recolectarSedes(m.cliente, CID)
    m.tablas.apify_raw.push(rawIg('ig1', T1))
    const r = await recolectarSedes(m.cliente, CID)
    expect(r.reconfirmadas).toBe(0)
    expect(datos(m).every((d) => d.reconfirmado_en == null)).toBe(true)
  })
})

describe('varias lecturas iguales de Mapas en la MISMA corrida (el recolector lee todas las de Mapas, no solo la última)', () => {
  const M1 = '2026-10-02T01:00:00+00:00'
  const M2 = '2026-10-05T01:00:00+00:00'
  const M3 = '2026-10-08T01:00:00+00:00'
  it('dos raspados iguales de la ficha ⇒ la fila NUEVA nace ya reconfirmada con la fecha del segundo (sin una segunda fila)', async () => {
    const m = mundo([rawIg('ig1', T1), rawMapas('m1', M1), rawMapas('m2', M2)])
    const r = await recolectarSedes(m.cliente, CID)
    const deMapas = datos(m).filter((d) => d.fuente === 'mapas')
    expect(deMapas.length).toBeGreaterThan(0)
    expect(r.reconfirmadas).toBeGreaterThanOrEqual(deMapas.length)
    for (const d of deMapas) {
      expect(new Date(String(d.observado_en)).toISOString()).toBe(new Date(M1).toISOString())
      expect(new Date(String(d.reconfirmado_en)).toISOString()).toBe(new Date(M2).toISOString())
    }
    expect(new Set(deMapas.map((d) => [d.sede_id, d.campo].join('|'))).size).toBe(deMapas.length)
  })
  it('🔴 repetir la corrida con los MISMOS 3 raspados: 0 reconfirmaciones y la fecha NO retrocede (la lectura del 05-oct no pisa la del 08-oct)', async () => {
    const m = mundo([rawIg('ig1', T1), rawMapas('m1', M1), rawMapas('m2', M2), rawMapas('m3', M3)])
    await recolectarSedes(m.cliente, CID)
    const deMapas = () => datos(m).filter((d) => d.fuente === 'mapas')
    for (const d of deMapas()) expect(new Date(String(d.reconfirmado_en)).toISOString()).toBe(new Date(M3).toISOString())
    const antes = JSON.stringify(datos(m))
    const r2 = await recolectarSedes(m.cliente, CID)
    expect(r2.reconfirmadas).toBe(0)
    expect(r2.nuevas).toBe(0)
    expect(JSON.stringify(datos(m))).toBe(antes)
  })
})

describe('el lector mide la vigencia desde la lectura MÁS NUEVA', () => {
  const ahora = new Date('2026-10-20T00:00:00Z')
  const lee = async (filas: Fila[]) => {
    const consulta = async (p: { tabla: string }) => ({ error: null, filas: p.tabla === 'client_sede_datos' ? filas : [] })
    const s = await leerSedes({ consulta: consulta as never, cliente: CID, ahora, plazos: PLAZOS_EN_DIAS })
    return s.lineas.find((l) => l.clase === 'dato_de_sede')!
  }
  const horario = (extra: Fila = {}): Fila => ({ id: 'h1', sede_id: null, campo: 'horario', valor_texto: 'lunes a domingo 8–20', fuente: 'instagram', alcance: 'cuenta', observado_en: '2026-10-01T00:00:00Z', ...extra })
  it('🔴 ROJO de hoy → VERDE: un horario visto el 01-oct y reconfirmado el 18-oct NO sale vencido el 20-oct', async () => {
    expect((await lee([horario()])).vencido).toBe(true) // control: sin reconfirmar, sí vence
    const c = await lee([horario({ reconfirmado_en: '2026-10-18T00:00:00Z' })])
    expect(c.vencido).toBe(false)
    expect(c.fecha_fuente).toBe('2026-10-18T00:00:00.000Z')
  })
  it('una reconfirmación MÁS VIEJA que la observación no la retrasa', async () => {
    const c = await lee([horario({ observado_en: '2026-10-15T00:00:00Z', reconfirmado_en: '2026-10-02T00:00:00Z' })])
    expect(c.fecha_fuente).toBe('2026-10-15T00:00:00.000Z')
  })
})
