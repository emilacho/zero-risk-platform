/**
 * Firmar con cifras cambiadas (05-nov): la ruta. El tablero viejo queda íntegro y `reemplazado`; el nuevo, firmado, con lo propuesto y lo firmado. US$ 0, sin red.
 * La base falsa no valida columnas: `firma_con_cambios` se comprueba contra la base real antes de publicar.
 */
import { describe, expect, it } from 'vitest'
import { calcular } from '../../finanzas/calculadora'
import { huellaDe } from '../../finanzas/firma'
import type { Bloque, Entrada } from '../../finanzas/tipos'
import { ACCIONES } from '../tablero/acciones'
import { DbFalsa } from './dbfalsa'

const AHORA = new Date('2026-11-05T13:00:00Z')
const llamar = (accion: string, db: DbFalsa, cuerpo: Record<string, unknown>) => ACCIONES[accion]({ db, puertos: () => ({}) as never, ahora: () => AHORA }, { cuerpo, reviewer: 'emilio' })
const T = '22222222-2222-4222-8222-222222222222'
const ENTRADA: Entrada = {
  meta_por_semana: 10, dias_activos_por_semana: 5, pasos: [{ tasa: 0.5 }], ticket: 40, margen: 0.5, periodos: 1, costo_entrega: 2,
  referencia: { min: 2, max: 4, base: 3, tipo: 'supuesto', fuente: 'mercado', fecha: '2026-11-01' } as Entrada['referencia'], marca: 0.2,
  produccion: { monto: 100, origen: 'plan' },
}
const B = calcular(ENTRADA) as Bloque
const TOTAL = B.cifras.total_mes.valor as number
const tab = (extra: Record<string, unknown> = {}) => ({ id: T, client_id: 'c1', version: 3, estado: 'sin_firma', vigente: true, dry_run: false, entrada: ENTRADA, bloque: B, huella: huellaDe(B), workflow_execution_id: 'conversa:x', ...extra })
const base = (extra: Record<string, unknown> = {}) => new DbFalsa().semilla('finanzas_tableros', [tab(extra)]).semilla('finanzas_numeros', []).semilla('plan_corridas', [])
const META = [{ clave: 'meta_por_semana', propuesto: 10, firmado: 14 }]
type F = Record<string, any>
const filas = (db: DbFalsa) => db.tablas['finanzas_tableros'] as F[]
const nuevoDe = (db: DbFalsa) => filas(db).find((f) => f.id !== T) as F
const viejoDe = (db: DbFalsa) => filas(db).find((f) => f.id === T) as F

describe('firmar con cambios', () => {
  it('🔴 hay un tablero nuevo firmado por quien firma, con lo propuesto y lo firmado', async () => {
    const db = base()
    const s = await llamar('firmar-tablero', db, { tablero_id: T, cambios: META })
    expect(s.status).toBe(200); expect(s.cuerpo).toMatchObject({ ok: true, estado: 'firmado', firmado_por: 'emilio', de_tablero: T, version: 4 })
    expect(nuevoDe(db)).toMatchObject({ estado: 'firmado', vigente: true, firmado_por: 'emilio', firmado_en: AHORA.toISOString(), version: 4 })
    expect(nuevoDe(db).firma_con_cambios).toMatchObject({ de_tablero: T, de_version: 3, cambios: META, meta_por_semana: 14, propuesto: { meta_por_semana: 10, total_mes: TOTAL }, por: 'emilio', en: AHORA.toISOString() })
    expect(nuevoDe(db).firma_con_cambios.total_mes).toBe(nuevoDe(db).bloque.cifras.total_mes.valor)
    expect(nuevoDe(db).huella).toBe(huellaDe(nuevoDe(db).bloque))
  })
  it('🔴 el anterior queda reemplazado e íntegro: nada se edita a mano', async () => {
    const db = base(), antes = JSON.stringify(B)
    await llamar('firmar-tablero', db, { tablero_id: T, cambios: META })
    expect(viejoDe(db)).toMatchObject({ estado: 'reemplazado', vigente: false, huella: huellaDe(B) })
    expect(viejoDe(db).firmado_por).toBeUndefined(); expect(JSON.stringify(viejoDe(db).bloque)).toBe(antes)
    expect(filas(db).filter((f) => f.vigente).length).toBe(1)
  })
  it('🔴 los números guardados son los del tablero nuevo', async () => {
    const db = base()
    await llamar('firmar-tablero', db, { tablero_id: T, cambios: META })
    const numeros = db.tablas['finanzas_numeros'] as F[]
    expect(numeros.find((n) => n.clave === 'meta_por_semana')).toMatchObject({ tablero_id: nuevoDe(db).id, valor: 14 })
    expect(numeros.every((n) => n.tablero_id === nuevoDe(db).id)).toBe(true)
  })
  it('🔴 al cambiar el presupuesto, la meta firmada también queda en la columna (la corrida siguiente la lee de ahí)', async () => {
    const db = base(), firmado = Math.round(TOTAL * 0.6)
    const s = await llamar('firmar-tablero', db, { tablero_id: T, cambios: [{ clave: 'total_mes', propuesto: TOTAL, firmado }] })
    expect(s.status).toBe(200)
    const f = nuevoDe(db).firma_con_cambios
    expect(f.total_mes).toBe(firmado); expect(f.meta_por_semana).toBeLessThan(10); expect(f.meta_por_semana).toBeGreaterThan(0)
    expect(f.meta_por_semana).toBe(nuevoDe(db).entrada.meta_por_semana)
  })
  it('🔴 sin `cambios`, firma como siempre: el mismo tablero, sin columna nueva', async () => {
    const db = base()
    expect((await llamar('firmar-tablero', db, { tablero_id: T })).status).toBe(200)
    expect(filas(db).length).toBe(1); expect(viejoDe(db).estado).toBe('firmado'); expect(viejoDe(db).firma_con_cambios).toBeUndefined()
  })
  it.each(['esperando', 'corriendo', 'en_pausa'])('🔴 con una corrida %s no se firma: terminaría con la cifra anterior', async (estado) => {
    const db = base().semilla('plan_corridas', [{ id: 'p', client_id: 'c1', estado }])
    const s = await llamar('firmar-tablero', db, { tablero_id: T, cambios: META })
    expect(s.status).toBe(409); expect(s.cuerpo.error).toBe('corrida_viva')
    expect(filas(db).length).toBe(1); expect(viejoDe(db).estado).toBe('sin_firma')
  })
  it('🔴 la corrida viva de otro cliente, o una que ya terminó, no estorba', async () => {
    const db = base().semilla('plan_corridas', [{ id: 'a', client_id: 'otro', estado: 'corriendo' }, { id: 'b', client_id: 'c1', estado: 'hecha' }])
    expect((await llamar('firmar-tablero', db, { tablero_id: T, cambios: META })).status).toBe(200)
  })
  it('🔴 si no se puede saber si hay corrida viva, no se firma', async () => {
    const db = base(); db.fallar['plan_corridas'] = 'se cayó'
    expect((await llamar('firmar-tablero', db, { tablero_id: T, cambios: META })).status).toBe(500)
    expect(filas(db).length).toBe(1); expect(viejoDe(db).estado).toBe('sin_firma')
  })
  it.each<[string, Record<string, unknown>, string]>([
    ['ya firmado', { estado: 'firmado' }, 'no_esta_sin_firma'], ['borrador', { estado: 'borrador' }, 'no_esta_sin_firma'], ['ensayo', { dry_run: true }, 'es_un_ensayo'], ['no vigente', { vigente: false }, 'no_es_el_vigente'],
    ['sin huella', { huella: null }, 'huella_no_coincide'], ['huella ajena', { huella: 'abc' }, 'huella_no_coincide'], ['sin entrada', { entrada: null }, 'no_se_puede_recalcular'], ['entrada que no da el tablero', { entrada: { ...ENTRADA, marca: 0.4 } }, 'no_se_puede_recalcular'],
  ])('%s → 409 y no cambia', async (_n, extra, error) => {
    const db = base(extra), s = await llamar('firmar-tablero', db, { tablero_id: T, cambios: META })
    expect(s.status).toBe(409); expect(s.cuerpo.error).toBe(error)
    expect(filas(db).length).toBe(1); expect(viejoDe(db).estado).toBe(extra.estado ?? 'sin_firma'); expect(viejoDe(db).vigente).toBe(extra.vigente ?? true)
  })
  it.each<[string, unknown]>([['vacío', []], ['no lista', 'x'], ['propuesto no es número', [{ clave: 'total_mes', propuesto: 'a', firmado: 1 }]], ['firmado no es número', [{ clave: 'total_mes', propuesto: 1, firmado: '5' }]], ['null', null], ['demasiados', Array(6).fill(META[0])]])('`cambios` %s → 400 y no firma tal cual', async (_n, cambios) => {
    const db = base(), s = await llamar('firmar-tablero', db, { tablero_id: T, cambios })
    expect(s.status).toBe(400); expect(viejoDe(db).estado).toBe('sin_firma')
  })
  it('id malo → 400; inexistente → 404', async () => {
    expect((await llamar('firmar-tablero', base(), { tablero_id: 'x', cambios: META })).status).toBe(400)
    expect((await llamar('firmar-tablero', new DbFalsa().semilla('finanzas_tableros', []), { tablero_id: T, cambios: META })).status).toBe(404)
  })
  it('🔴 un presupuesto que el reparto no alcanza se rechaza y dice cuál es la cifra más cercana', async () => {
    const entrada: Entrada = { ...ENTRADA, canales: [{ canal: 'TikTok', peso: 0.3, piso_diario: 5 }] }, b = calcular(entrada) as Bloque, t = b.cifras.total_mes.valor as number
    const salidas = await Promise.all(Array.from({ length: 400 }, (_, i) => llamar('recalcular-tablero', base({ entrada, bloque: b, huella: huellaDe(b) }), { tablero_id: T, cambios: [{ clave: 'total_mes', propuesto: t, firmado: Math.round(t * (0.05 + i * 0.005)) }] })))
    const no = salidas.find((s) => s.status === 409)
    expect(no?.cuerpo).toMatchObject({ error: 'presupuesto_no_cuadra', alcanzable: expect.any(Number) })
  })
  it('🔴 si la cifra ya no vale lo que vio, no firma otra cosa', async () => {
    const db = base(), s = await llamar('firmar-tablero', db, { tablero_id: T, cambios: [{ clave: 'meta_por_semana', propuesto: 9, firmado: 14 }] })
    expect(s.status).toBe(409); expect(s.cuerpo.error).toBe('cifras_cambiaron'); expect(filas(db).length).toBe(1)
  })
})

describe('si algo falla a medias, el cliente conserva su tablero', () => {
  it('🔴 fallan los números: vuelve el anterior sin firma y el parcial no queda', async () => {
    const db = base(); db.fallar['finanzas_numeros'] = 'se cayó'
    const s = await llamar('firmar-tablero', db, { tablero_id: T, cambios: META })
    expect(s.status).toBe(500); expect(filas(db).length).toBe(1); expect(viejoDe(db)).toMatchObject({ estado: 'sin_firma', vigente: true })
  })
  it('🔴 otra decisión entra antes de firmar el nuevo: se borra y vuelve el anterior', async () => {
    const db = base(), from = db.from.bind(db)
    ;(db as any).from = (t: string) => {
      const q = from(t) as any, u = q.update.bind(q)
      q.update = (p: Record<string, unknown>) => { if (p.firma_con_cambios) nuevoDe(db).estado = 'otro'; return u(p) }
      return q
    }
    const s = await llamar('firmar-tablero', db, { tablero_id: T, cambios: META })
    expect(s.status).toBe(500); expect(filas(db).length).toBe(1); expect(viejoDe(db)).toMatchObject({ estado: 'sin_firma', vigente: true })
  })
  it('🔴 dos firmas a la vez: pasa una sola y la otra no toca nada', async () => {
    const db = base()
    const [a, b] = await Promise.all([llamar('firmar-tablero', db, { tablero_id: T, cambios: META }), llamar('firmar-tablero', db, { tablero_id: T, cambios: [{ clave: 'meta_por_semana', propuesto: 10, firmado: 20 }] })])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    expect(filas(db).filter((f) => f.vigente).length).toBe(1); expect(filas(db).filter((f) => f.estado === 'firmado').length).toBe(1)
  })
})

describe('recalcular-tablero · ver antes de firmar', () => {
  it('🔴 devuelve las cifras nuevas y no escribe nada', async () => {
    const db = base(), antes = JSON.stringify(db.tablas)
    const s = await llamar('recalcular-tablero', db, { tablero_id: T, cambios: META })
    expect(s.status).toBe(200); expect(s.cuerpo).toMatchObject({ ok: true, tablero_id: T, cambios: META })
    const cifras = s.cuerpo.cifras as { clave: string; valor: number }[]
    expect(cifras.find((c) => c.clave === 'meta_por_semana')?.valor).toBe(14)
    expect(cifras.find((c) => c.clave === 'total_mes')?.valor).toBeGreaterThan(TOTAL)
    expect(JSON.stringify(db.tablas)).toBe(antes)
  })
  it('🔴 con las mismas guardas: corrida viva, no sin firma', async () => {
    expect((await llamar('recalcular-tablero', base().semilla('plan_corridas', [{ id: 'p', client_id: 'c1', estado: 'corriendo' }]), { tablero_id: T, cambios: META })).cuerpo.error).toBe('corrida_viva')
    expect((await llamar('recalcular-tablero', base({ estado: 'firmado' }), { tablero_id: T, cambios: META })).cuerpo.error).toBe('no_esta_sin_firma')
  })
  it('🔴 lo que recalcula es lo mismo que firma', async () => {
    const db = base(), v = await llamar('recalcular-tablero', db, { tablero_id: T, cambios: META }), f = await llamar('firmar-tablero', db, { tablero_id: T, cambios: META })
    expect(f.cuerpo.cifras).toEqual(v.cuerpo.cifras)
  })
})
