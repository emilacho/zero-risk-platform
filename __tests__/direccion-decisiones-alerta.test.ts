/**
 * 10-nov · cada decisión como alerta: Nueva → Revisada → Resuelta (Emilio 09-nov 23:45Z · `2026-11-10-RESPUESTA-LENOVO-a-CC4-CC1-CC6-310-aprobado-con-ajustes.md`).
 * La marca «✓ Revisar» vive en la libreta de «ya lo vi» del tablero (`alertas_vistas`); la plataforma solo la LEE. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import type { Contexto } from '../src/lib/direccion/comun'
import { leerDecisiones } from '../src/lib/direccion/decisiones'
import { alertaDe, claveDeAlerta, contadoresDeAlertas } from '../src/lib/direccion/decisiones-alerta'

const AHORA = new Date('2026-11-10T01:00:00Z')
const C1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const hace = (h: number) => new Date(AHORA.getTime() - h * 3_600_000).toISOString()
const base = () => new DbFalsa().semilla('clients', [{ id: C1, name: 'Uno', industry: 'restaurante', status: 'active' }])
const ctx = (db: DbFalsa): Contexto => {
  const from = db.from.bind(db)
  db.from = ((t: string) => { const q = from(t) as unknown as Record<string, unknown>; for (const m of ['insert', 'update', 'upsert', 'delete']) q[m] = () => { throw new Error(`ESCRITURA en ${t}`) }; return q }) as unknown as typeof db.from
  return { db, ahora: () => AHORA, env: {} }
}
const TABLERO = { id: 't1', client_id: C1, version: 2, estado: 'sin_firma', vigente: true, dry_run: false, creado_en: hace(48) }
const pregunta = (i: number) => ({ id: `p${i}`, client_id: C1, tema: `tema ${i}`, tema_norm: `t${i}`, pregunta: `¿Pregunta ${i}?`, estado: 'pendiente', canal: 'x', oficina: 'marketing', agente: null, creado_en: hace(2) })
const vista = (clave: string, visto_en: string) => ({ clave, visto_en, visto_por: 'emilio' })

describe('la decisión como alerta: Nueva o Revisada', () => {
  it('🔴 sin marca es Nueva, con su clave `decision:<fuente>:<id>`', async () => {
    const r = await leerDecisiones(ctx(base().semilla('finanzas_tableros', [TABLERO])))
    expect(r.decisiones[0].alerta).toEqual({ clave: 'decision:finanzas_tableros:t1', estado: 'nueva' })
    expect(r.alertas_completo).toBe(true)
  })
  it('🔴 con la marca de «✓ Revisar» posterior a la decisión es Revisada, con la hora de la marca', async () => {
    const r = await leerDecisiones(ctx(base().semilla('finanzas_tableros', [TABLERO]).semilla('alertas_vistas', [vista('decision:finanzas_tableros:t1', hace(1))])))
    expect(r.decisiones[0].alerta).toEqual({ clave: 'decision:finanzas_tableros:t1', estado: 'revisada', revisada_en: hace(1) })
  })
  it('🔴 si la decisión volvió a abrirse después de la marca, vuelve a ser Nueva', () => {
    const marcas = new Map([['decision:dueno_preguntas:p1', hace(5)]])
    expect(alertaDe({ fuente: 'dueno_preguntas', id: 'p1', desde: hace(2) }, marcas).estado).toBe('nueva')
    expect(alertaDe({ fuente: 'dueno_preguntas', id: 'p1', desde: hace(6) }, marcas).estado).toBe('revisada')
    expect(alertaDe({ fuente: 'dueno_preguntas', id: 'p1', desde: null }, marcas).estado).toBe('revisada')
  })
  it('🔴 la marca de otra alerta no cuenta: otra fuente con el mismo id, o un riesgo', async () => {
    const r = await leerDecisiones(ctx(base().semilla('finanzas_tableros', [TABLERO]).semilla('alertas_vistas', [vista('decision:hitl_queue:t1', hace(1)), vista('riesgo:t1', hace(1)), vista('t1', hace(1))])))
    expect(r.decisiones[0].alerta?.estado).toBe('nueva')
  })
  it('🔴 si la libreta no se puede leer, el estado no se inventa y la lista de pendientes sigue entera', async () => {
    const db = base().semilla('finanzas_tableros', [TABLERO])
    db.fallar.alertas_vistas = 'se cayó'
    const r = await leerDecisiones(ctx(db))
    expect(r.decisiones[0].alerta).toEqual({ clave: 'decision:finanzas_tableros:t1', estado: null })
    expect(r.alertas_completo).toBe(false)
    expect(r.fuentes_de_alertas.map((f) => f.estado)).toEqual(['error'])
    expect(r.total).toBe(1); expect(r.completo).toBe(true)
  })
  it('🔴 si leer la libreta LANZA (no devuelve error), tampoco se inventa: todo null y alertas_completo false (pedido de CC7)', async () => {
    const db = base().semilla('finanzas_tableros', [TABLERO]).semilla('dueno_preguntas', [pregunta(1)])
    const from = db.from.bind(db)
    db.from = ((t: string) => { if (t === 'alertas_vistas') throw new Error('se cortó la conexión'); return from(t) }) as typeof db.from
    const r = await leerDecisiones(ctx(db))
    expect(r.decisiones).toHaveLength(2)
    for (const d of r.decisiones) expect(d.alerta, d.id).toEqual({ clave: claveDeAlerta(d), estado: null })
    expect(r.alertas_completo).toBe(false)
    expect(r.contadores).toMatchObject({ nuevas: null, revisadas: null })
    expect(r.completo).toBe(true)
  })
  it('🔴 con muchas decisiones lee por lotes y no pierde la marca del lote de atrás', async () => {
    const ps = Array.from({ length: 150 }, (_, i) => pregunta(i))
    const r = await leerDecisiones(ctx(base().semilla('dueno_preguntas', ps).semilla('alertas_vistas', [vista('decision:dueno_preguntas:p140', hace(1)), vista('decision:dueno_preguntas:p3', hace(1))])))
    expect(r.decisiones).toHaveLength(150)
    const revisadas = r.decisiones.filter((d) => d.alerta?.estado === 'revisada').map((d) => d.id).sort()
    expect(revisadas).toEqual(['p140', 'p3'])
    expect(r.decisiones.every((d) => d.alerta?.clave === claveDeAlerta(d))).toBe(true)
  })
  it('🔴 contadores ya contados: Nuevas y Revisadas de las pendientes, Resueltas del registro de 7 días (preguntas y firmas)', async () => {
    const resuelta = (id: string, estado: string) => ({ ...pregunta(9), id, tema: `r ${id}`, tema_norm: `r${id}`, estado, decidido_en: hace(3) })
    const db = base().semilla('finanzas_tableros', [TABLERO]).semilla('dueno_preguntas', [pregunta(1), pregunta(2), resuelta('r1', 'respondida'), resuelta('r2', 'descartada')])
      .semilla('alertas_vistas', [vista('decision:dueno_preguntas:p1', hace(1))])
    const r = await leerDecisiones(ctx(db))
    expect(r.contestadas).toHaveLength(2)
    expect(r.contadores).toEqual({ nuevas: 2, revisadas: 1, resueltas: 2, resueltas_ventana_dias: 7, resueltas_cuenta: 'preguntas_y_firmas' })
  })
  it('🔴 Resueltas cuenta también la firma del tablero financiero (lo que dice `resueltas_cuenta`)', async () => {
    const firmado = { id: 't0', client_id: C1, version: 1, estado: 'firmado', vigente: false, dry_run: false, creado_en: hace(30), firmado_en: hace(20), firma_con_cambios: null }
    const r = await leerDecisiones(ctx(base().semilla('finanzas_tableros', [TABLERO, firmado])))
    expect(r.contestadas.map((c) => c.tipo)).toEqual(['firma_de_finanzas'])
    expect(r.contadores).toMatchObject({ resueltas: 1, resueltas_cuenta: 'preguntas_y_firmas' })
  })
  it('🔴 sin libreta legible Nuevas y Revisadas salen null (nunca 0); Resueltas sigue', async () => {
    const db = base().semilla('finanzas_tableros', [TABLERO])
    db.fallar.alertas_vistas = 'se cayó'
    expect((await leerDecisiones(ctx(db))).contadores).toMatchObject({ nuevas: null, revisadas: null, resueltas: 0 })
  })
  it('🔴 con el registro incompleto Resueltas sale null, no un número a medias', () => {
    const ds = [{ alerta: { clave: 'a', estado: 'nueva' as const } }, { alerta: { clave: 'b', estado: 'revisada' as const } }]
    expect(contadoresDeAlertas(ds, true, 5, false)).toMatchObject({ nuevas: 1, revisadas: 1, resueltas: null })
    expect(contadoresDeAlertas(ds, true, 5, true).resueltas).toBe(5)
  })
  it('🔴 abrirla no cuenta: leer la lista no escribe nada (cualquier escritura revienta aquí)', async () => {
    await expect(leerDecisiones(ctx(base().semilla('finanzas_tableros', [TABLERO])))).resolves.toMatchObject({ ok: true })
  })
})
