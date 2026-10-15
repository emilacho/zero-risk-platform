/**
 * Plan v3 · V3 · la ruta del catálogo (snapshot, falla cerrado), el contrato aditivo del brazo (`origen`, `tope_usd`) y el planificador de relleno
 * («pide SOLO lo que falta», nunca Apify en lugar del cerebro). Sin red, sin base real, sin gasto.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { COLUMNAS_DEL_CATALOGO, leerCatalogo, type Db } from '../src/lib/planeacion/catalogo/leer'
import { planificarRelleno, REGLAS, type ReglasDeRelleno } from '../src/lib/planeacion/dato-v1/relleno'
import { crearSnapshot, type FilasDelCatalogo } from '../src/lib/planeacion/dato-v1/catalogo'
import semilla from '../src/lib/planeacion/catalogo/semilla.json'
import * as gen from '../scripts/ops/plan-v3-catalogo/generar-migracion.mjs'

const F = semilla as unknown as FilasDelCatalogo
const snap = crearSnapshot(F)
const ESQUEMA = gen.ESQUEMA as unknown as Record<string, { columnas: Array<[string, string, string]> }>
const raiz = join(__dirname, '..')

/** una base falsa: `from(t).select(cols).eq('vigente', true)`; `numeric` viaja como texto, como en PostgREST */
function baseFalsa(o: { error?: Record<string, { message: string; code?: string }>; vacia?: string[]; noLista?: string; lanza?: string } = {}): Db & { pedidas: string[] } {
  const pedidas: string[] = []
  const filasDe: Record<string, unknown[]> = {
    plan_catalogo_fuentes: F.fuentes, plan_catalogo_tipos: F.tipos, plan_catalogo_reglas: F.reglas, plan_catalogo_lexico: F.lexico, plan_catalogo_topes: F.topes,
  }
  const comoTexto = (f: unknown) => {
    const r: Record<string, unknown> = { ...(f as Record<string, unknown>) }
    for (const k of ['tope_usd', 'usd', 'frescura_limite_h', 'tolerancia_redondeo']) if (typeof r[k] === 'number') r[k] = String(r[k])
    return r
  }
  return {
    pedidas,
    from(t: string) {
      pedidas.push(t)
      return { select: () => ({ eq: async () => {
        if (o.lanza === t) throw new Error('red caída')
        if (o.error?.[t]) return { data: null, error: o.error[t] }
        if (o.noLista === t) return { data: { no: 'lista' }, error: null }
        return { data: o.vacia?.includes(t) ? [] : filasDe[t].map(comoTexto), error: null }
      } }) }
    },
  }
}

describe('V3 · leer el catálogo (snapshot) · falla cerrado', () => {
  it('lee las 5 tablas, solo lo vigente, y arma el MISMO snapshot (misma huella) aunque PostgREST mande numeric como texto', async () => {
    const db = baseFalsa()
    const r = await leerCatalogo(db)
    expect(r.ok).toBe(true)
    expect([...db.pedidas].sort()).toEqual(['plan_catalogo_fuentes', 'plan_catalogo_lexico', 'plan_catalogo_reglas', 'plan_catalogo_tipos', 'plan_catalogo_topes'])
    if (r.ok) expect(r.snapshot.huella).toBe(snap.huella)
  })
  it('un error de la base NO es «catálogo vacío»: lectura_fallida (N6)', async () => {
    const r = await leerCatalogo(baseFalsa({ error: { plan_catalogo_tipos: { message: 'boom', code: '500' } } }))
    expect(r).toMatchObject({ ok: false, causa: 'lectura_fallida' })
  })
  it('una excepción de red tampoco es vacío', async () => {
    expect(await leerCatalogo(baseFalsa({ lanza: 'plan_catalogo_reglas' }))).toMatchObject({ ok: false, causa: 'lectura_fallida' })
  })
  it('tablas sin aplicar (V1 pendiente) ⇒ catalogo_no_aplicado, distinto de un error de lectura', async () => {
    for (const code of ['42P01', 'PGRST205']) expect(await leerCatalogo(baseFalsa({ error: { plan_catalogo_fuentes: { message: 'no existe', code } } }))).toMatchObject({ ok: false, causa: 'catalogo_no_aplicado' })
  })
  it('una respuesta que no es lista, o un catálogo sin fuentes/tipos/topes, NO sirve', async () => {
    expect(await leerCatalogo(baseFalsa({ noLista: 'plan_catalogo_topes' }))).toMatchObject({ ok: false, causa: 'lectura_fallida' })
    for (const t of ['plan_catalogo_fuentes', 'plan_catalogo_tipos', 'plan_catalogo_topes']) {
      expect(await leerCatalogo(baseFalsa({ vacia: [t] })), t).toMatchObject({ ok: false, causa: 'catalogo_incompleto' })
    }
  })
  it('las columnas que pide la ruta son EXACTAMENTE las de negocio de la migración de V1 (más version y pais), sin id ni creado_en', () => {
    expect(Object.keys(COLUMNAS_DEL_CATALOGO).sort()).toEqual(Object.keys(ESQUEMA).sort())
    for (const [tabla, cols] of Object.entries(COLUMNAS_DEL_CATALOGO)) {
      const pedidas = cols.split(',').filter((c) => c !== 'version' && c !== 'pais').sort()
      expect(pedidas, tabla).toEqual(ESQUEMA[tabla].columnas.map(([c]) => c).sort())
      expect(cols.split(',')).not.toContain('id')
      expect(cols.split(',')).not.toContain('creado_en')
    }
  })
  it('la ruta existe, solo lee, falla cerrado y usa la llave interna (nunca SALA_DISPATCH_KEY)', () => {
    const r = readFileSync(join(raiz, 'src/app/api/planeacion/catalogo/route.ts'), 'utf8')
    expect(r).toMatch(/checkInternalKey/)
    expect(r).not.toMatch(/process\.env\.SALA_DISPATCH_KEY/)
    expect(r).not.toMatch(/\.(insert|update|upsert|delete)\(/)
    expect(r).toMatch(/503/)
    expect(r).toMatch(/502/)
    expect(r).toMatch(/409/)
  })
})

describe('V3 · contrato del brazo: `origen` y `tope_usd` son ADITIVOS', () => {
  const ruta = readFileSync(join(raiz, 'src/app/api/planeacion/brazo/apify/route.ts'), 'utf8')
  const puertas = readFileSync(join(raiz, 'src/lib/planeacion/puertas.ts'), 'utf8')
  it('solo viajan si vienen bien formados (ausentes ⇒ el cuerpo al Servicio es el de hoy)', () => {
    expect(ruta).toContain("typeof p.origen === 'string' && /^[a-z0-9_]{1,24}$/.test(p.origen) ? { origen: p.origen } : {}")
    expect(ruta).toContain("typeof p.tope_usd === 'number' && p.tope_usd > 0 && p.tope_usd <= 5 ? { tope_usd: p.tope_usd } : {}")
  })
  it('`origen` se hereda del sobre (una vez para todos los pedidos) y es opcional', () => {
    expect(puertas).toContain('readonly origen?: string')
    expect(puertas).toMatch(/'callback_url',\s*'origen',\s*\] as const/)
  })
})

describe('V3 · planificarRelleno: pide SOLO lo que falta', () => {
  const faltan = [{ tipo_id: 'seguidores', motivo: 'sin_ficha' as const }, { tipo_id: 'precio', motivo: 'vencida' as const }, { tipo_id: 'visitas_periodo', motivo: 'sin_ficha' as const }]
  it('una llamada por fuente (cubre varios tipos), con su tope y origen `plan`; nada de «las 5 de siempre»', () => {
    const p = planificarRelleno({ snapshot: snap, faltantes: [{ tipo_id: 'seguidores', motivo: 'sin_ficha' }, { tipo_id: 'publicaciones_n', motivo: 'sin_ficha' }], cerebro_listo: true })
    expect(p.pedidos).toHaveLength(1)
    expect(p.pedidos[0]).toMatchObject({ fuente_id: 'instagram_perfil', funcion: 'instagram_scraper', brazo: 'apify', origen: 'plan', tope_usd: 0.08, reintentos: 0 })
    expect([...p.pedidos[0].tipos].sort()).toEqual(['publicaciones_n', 'seguidores'])
    expect(p.comprometido_usd).toBeCloseTo(0.08)
  })
  it('PostHog sale por su propio brazo y sin tope (no cobra)', () => {
    const p = planificarRelleno({ snapshot: snap, faltantes: [{ tipo_id: 'visitas_periodo', motivo: 'sin_ficha' }], cerebro_listo: true })
    expect(p.pedidos[0]).toMatchObject({ brazo: 'posthog', tope_usd: 0, funcion: 'visitas_por_dominio' })
  })
  it('🔴 sin «cerebro listo» NO sale ni una llamada (nunca Apify en lugar del cerebro)', () => {
    for (const l of [false, null, undefined]) {
      const p = planificarRelleno({ snapshot: snap, faltantes: faltan, cerebro_listo: l })
      expect(p.pedidos, String(l)).toEqual([])
      expect(p.omitidos.every((o) => o.motivo === 'cerebro_no_listo')).toBe(true)
      expect(p.omitidos).toHaveLength(3)
    }
  })
  it('un tipo que ninguna fuente de relleno provee queda omitido con motivo (no se inventa una fuente)', () => {
    const p = planificarRelleno({ snapshot: snap, faltantes: [{ tipo_id: 'tipo_que_nadie_provee', motivo: 'sin_ficha' }], cerebro_listo: true })
    expect(p.pedidos).toEqual([])
    expect(p.omitidos).toEqual([{ tipo_id: 'tipo_que_nadie_provee', motivo: 'sin_fuente_en_catalogo' }])
  })
  it('el tope del tramo (0,40) manda: lo crítico entra primero y lo que no cabe se omite con motivo; nada se pierde en silencio', () => {
    const todo = ['puntaje_resenas', 'precio', 'seguidores', 'resenas_texto', 'menciones', 'texto_sitio', 'anuncios_activos'].map((t) => ({ tipo_id: t, motivo: 'sin_ficha' as const }))
    const p = planificarRelleno({ snapshot: snap, faltantes: todo, cerebro_listo: true })
    const suma = p.pedidos.reduce((a, x) => a + x.tope_usd, 0)
    expect(p.tope_recoleccion_usd).toBe(0.4)
    expect(suma).toBeLessThanOrEqual(0.4 + 1e-9)
    expect(p.pedidos.some((x) => x.tipos.includes('precio'))).toBe(true)
    expect(p.omitidos.some((o) => o.motivo === 'tope_recoleccion')).toBe(true)
    const cubiertos = new Set([...p.pedidos.flatMap((x) => x.tipos), ...p.omitidos.map((o) => o.tipo_id)])
    for (const f of todo) expect(cubiertos.has(f.tipo_id), f.tipo_id).toBe(true)
  })
  it('lo ya gastado en recolección ese día cuenta contra el tope', () => {
    const p = planificarRelleno({ snapshot: snap, faltantes: [{ tipo_id: 'seguidores', motivo: 'sin_ficha' }], cerebro_listo: true, gastado_recoleccion_usd: 0.35 })
    expect(p.pedidos).toEqual([])
    expect(p.omitidos[0].motivo).toBe('tope_recoleccion')
  })
  it('un tipo repetido se pide una sola vez', () => {
    const p = planificarRelleno({ snapshot: snap, faltantes: [{ tipo_id: 'seguidores', motivo: 'sin_ficha' }, { tipo_id: 'seguidores', motivo: 'vencida' }], cerebro_listo: true })
    expect(p.pedidos[0].tipos).toEqual(['seguidores'])
  })
  it('muere: autorizar con la señal ausente o en falso (la regla rota SÍ pediría; la real no)', () => {
    const rota: ReglasDeRelleno = { autoriza: () => true }
    expect(planificarRelleno({ snapshot: snap, faltantes: faltan, cerebro_listo: null }, rota).pedidos.length).toBeGreaterThan(0)
    expect(planificarRelleno({ snapshot: snap, faltantes: faltan, cerebro_listo: null }, REGLAS).pedidos).toEqual([])
  })
  it('sin fila de tope de recolección no se gasta (falla cerrado)', () => {
    const sinTope = crearSnapshot({ ...F, topes: F.topes.filter((t) => t.tramo !== 'recoleccion') })
    const p = planificarRelleno({ snapshot: sinTope, faltantes: [{ tipo_id: 'seguidores', motivo: 'sin_ficha' }], cerebro_listo: true })
    expect(p.tope_recoleccion_usd).toBe(0)
    expect(p.pedidos).toEqual([])
  })
})
