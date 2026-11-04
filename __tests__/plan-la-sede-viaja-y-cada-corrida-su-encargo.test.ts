/**
 * 04-nov · el plan como se diseñó, puntos 4 y 5 (la traza de la corrida `2c0d2236`):
 *  · el precio de una sede dejó de decir de qué sede era al pasar a la tabla de datos, y el plan lo presentó como de la otra;
 *  · finanzas reabrió el encargo de la corrida anterior y heredó su gasto, y por eso le faltó tope.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { almacenDeConversa } from '@/lib/finanzas/conversa/almacen-supabase'
import { fichasAEntradas } from '@/lib/planeacion/dato-v1/lector-cerebro'
import { normalizarDatos } from '@/lib/planeacion/dato-v1/normalizador'
import { crearSnapshot, type FilasDelCatalogo } from '@/lib/planeacion/dato-v1/catalogo'
import semilla from '@/lib/planeacion/catalogo/semilla.json'
import { DbFalsa } from '@/lib/oficina/__tests__/dbfalsa'

const snap = crearSnapshot(semilla as unknown as FilasDelCatalogo)
const ficha = (o: Record<string, unknown>) => ({ id: 'f', clase: 'precio', atributo: 'precio:producto encebollado', titulo: 't', que_es: 'producto encebollado precio 4 00 usd', contenido: 'producto encebollado precio 4 00 usd', origen: 'su_fuente', observado_en: '2026-10-14T00:00:00Z', propiedad: 'propia', ...o })
const ctx = { ahora: new Date('2026-11-04T00:00:00Z'), cliente: { nombre: 'X', ubicacion: [], handles: [], dominios: [], telefonos: [], rubro: [] }, pais: 'EC' }
const datosDe = (fichas: unknown[]) => {
  const { entradas } = fichasAEntradas(fichas as never, snap)
  return normalizarDatos(entradas, ctx, snap).datos
}

describe('la sede viaja a la tabla', () => {
  it('🔴 el dato conserva la sede de la ficha', () => {
    const [d] = datosDe([ficha({ sede: 'guayaquil' })])
    expect(d.sede).toBe('guayaquil')
  })
  it('🔴 sin sede en la ficha, el dato queda como siempre', () => {
    expect(datosDe([ficha({ sede: null })])[0]).not.toHaveProperty('sede')
  })
  it('🔴 el mismo producto a otro precio en otra sede no es una contradicción', () => {
    const ds = datosDe([ficha({ id: 'a', huella: 'a', sede: 'guayaquil' }), ficha({ id: 'b', huella: 'b', sede: 'olon', que_es: 'producto encebollado precio 3 50 usd', contenido: 'producto encebollado precio 3 50 usd' })])
    expect(ds).toHaveLength(2)
    for (const d of ds) expect(d.contradice?.con ?? []).toEqual([])
  })
  it('🔴 dos precios distintos en la misma sede, de dos fuentes, sí se contradicen; en dos sedes, no', () => {
    const entrada = (sede: string, contenido: string, huella: string) => ({ fuente_id: 'cerebro_vivo', tipo_id: 'precio', atributo: 'precio:x', sede, estado: 'trajo' as const, via: 'cerebro' as const, contenido, medido_en: '2026-11-01T00:00:00Z', identidad: { via: 'portero' as const }, origen_ficha: 'su_fuente' as const, huella })
    const misma = normalizarDatos([entrada('olon', '4.00', 'a'), entrada('olon', '3.50', 'b')], ctx, snap).datos
    expect(misma.some((d) => (d.contradice?.con ?? []).length > 0)).toBe(true)
    const otra = normalizarDatos([entrada('olon', '4.00', 'a'), entrada('guayaquil', '3.50', 'b')], ctx, snap).datos
    expect(otra.some((d) => (d.contradice?.con ?? []).length > 0)).toBe(false)
  })
  it('🔴 dos fichas vivas del mismo atributo y sede: manda la más nueva, como siempre', () => {
    expect(datosDe([ficha({ id: 'a', huella: 'a', sede: 'olon', creado_en: '2026-10-01' }), ficha({ id: 'b', huella: 'b', sede: 'olon', creado_en: '2026-10-02' })])).toHaveLength(1)
  })
  it('🔴 la fila que lee el redactor lo dice', () => {
    const js = fs.readFileSync('scripts/worker-staging/planeacion-v3/pedido-v3.js', 'utf8').replace(/\r\n/g, '\n')
    const i = js.indexOf('function _v3FilaDeTabla'), fin = js.indexOf('\n}\n', i) + 3
    const fila = new Function(`function _v3Valor(d) { return 'v' }\n${js.slice(i, fin)}\nreturn _v3FilaDeTabla`)() as (d: unknown) => string
    expect(fila({ id: 'D1', tipo_id: 'precio', atributo: 'precio:x', sede: 'guayaquil' })).toContain('precio (precio:x) · sede guayaquil')
    expect(fila({ id: 'D1', tipo_id: 'precio', atributo: 'precio:x' })).not.toContain('sede')
  })
})

describe('cada corrida abre su encargo de finanzas', () => {
  const base = (corrida?: string) => ({ client_id: 'c', dry_run: false, semilla: { rubro: 'r', ...(corrida ? { corrida } : {}) } }) as never
  const abierto = (corrida?: string, gasto = 0.233) => ({ id: 'viejo', client_id: 'c', estado: 'en_curso', gasto_usd: gasto, dry_run: false, semilla: corrida ? { corrida } : {}, estado_del_motor: { pasos_ejecutados: 2 } })
  const crear = async (filas: Record<string, unknown>[], corrida?: string) => {
    const db = new DbFalsa()
    db.semilla('finanzas_encargos', filas)
    const r = await almacenDeConversa(db as never).crearEncargo(base(corrida))
    return { db, r }
  }
  it('🔴 lo abierto de otra corrida se cierra y la nueva empieza de cero', async () => {
    const { db, r } = await crear([abierto('r2')], 'r3')
    expect(r).toMatchObject({ ok: true, nuevo: true })
    expect((r as { encargo: { gasto_usd: number } }).encargo.gasto_usd).toBe(0)
    expect(db.tablas['finanzas_encargos'].find((f) => f.id === 'viejo')).toMatchObject({ estado: 'fallido' })
  })
  it('🔴 un re-disparo de la MISMA corrida sigue en el suyo', async () => {
    const { db, r } = await crear([abierto('r3')], 'r3')
    expect(r).toMatchObject({ ok: true, nuevo: false })
    expect(db.tablas['finanzas_encargos']).toHaveLength(1)
  })
  it('🔴 sin corrida en el pedido, como siempre: se reutiliza el abierto', async () => {
    const { db, r } = await crear([abierto('r2')])
    expect(r).toMatchObject({ ok: true, nuevo: false })
    expect(db.tablas['finanzas_encargos'][0]).toMatchObject({ estado: 'en_curso' })
  })
  it('🔴 si otra llamada ya lo cerró en este instante, no se pisa su estado', async () => {
    const db = new DbFalsa()
    db.semilla('finanzas_encargos', [abierto('r2')])
    const from = db.from.bind(db)
    // entre la lectura y el cierre, otro lo cierra: la escritura solo debe tocar lo que sigue abierto
    let lecturas = 0
    db.from = ((tabla: string) => {
      if (tabla === 'finanzas_encargos' && lecturas++ === 1) db.tablas['finanzas_encargos'][0].estado = 'cerrado'
      return from(tabla)
    }) as typeof db.from
    await almacenDeConversa(db as never).crearEncargo(base('r3'))
    expect(db.tablas['finanzas_encargos'].find((f) => f.id === 'viejo')).toMatchObject({ estado: 'cerrado' })
  })
  it('🔴 lo que quedó abierto sin corrida (de antes) tampoco se hereda', async () => {
    const { r } = await crear([abierto()], 'r3')
    expect(r).toMatchObject({ ok: true, nuevo: true })
  })
})
