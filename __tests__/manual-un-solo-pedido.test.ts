/**
 * 3-nov · opción B de Lenovo: «Pedir los cambios» manda todo junto. Lo directo se aplica primero, sin gasto, y la reescritura trabaja sobre esa versión, con una sola fila en `plan_cambios`.
 * Sin red: la edición usa la base de pruebas y un cerebro falso.
 */
import { describe, expect, it, vi } from 'vitest'
import { TOPE_DEL_TEXTO_DEL_DUENO } from '../src/lib/limites-de-tamano'
import { rutaEditarManual } from '../src/lib/manual/edicion-rutas'
import { pedirCambiosAlManual, CAMINO_MANUAL_CAMBIOS, type DepsDelPedido } from '../src/lib/oficina/tablero/manual-cambios'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'

const C = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const AHORA = new Date('2026-11-03T17:00:00Z')
const GASTO = { confirmo_gasto: true, tope_usd: 5 }
const META = { mision: { fuente: 'dueno', en: '2026-10-01T00:00:00Z' } }
const base = (pedidos: Array<Record<string, unknown>> = []) => new DbFalsa()
  .semilla('client_brand_books', [{ id: 'v1', client_id: C, version: 1, brand_mission: 'Misión de Emilio', brand_vision: 'Visión vieja', content_text: JSON.stringify({ brand_book_draft: { mision: 'Misión de Emilio', vision: 'Visión vieja', _field_meta: META } }), provenance_tag: {} }])
  .semilla('plan_cambios', pedidos)

function armar(db: DbFalsa) {
  const editarDirecto = vi.fn<DepsDelPedido['editarDirecto']>((client_id, campos, reviewer) => rutaEditarManual({ db, ahora: () => AHORA, empujarManual: () => ({ estado: 'agendado' }), cerebro: { env: { baseUrl: 'x', internalKey: 'k' }, enviar: async () => ({ ok: true, repetida: false }) } }, client_id, { campos, reviewer }, reviewer))
  return { deps: { db, puertos: () => ({}) as never, ahora: () => AHORA, editarDirecto } as DepsDelPedido, editarDirecto }
}
const pedir = (d: DepsDelPedido, cuerpo: Record<string, unknown>) => pedirCambiosAlManual(d, { cuerpo: { client_id: C, ...cuerpo }, reviewer: 'emilio' })
const versiones = (db: DbFalsa) => [...db.tablas['client_brand_books']].sort((a, b) => Number(a.version) - Number(b.version))
const draftDe = (f: Record<string, unknown>) => (JSON.parse(String(f.content_text)) as { brand_book_draft: Record<string, unknown> & { _field_meta: Record<string, { retirado?: boolean; fuente?: string }> } }).brand_book_draft

describe('🔴 todo junto', () => {
  it('aplica lo directo y reescribe sobre ESA versión, con una sola fila', async () => {
    const db = base(), { deps } = armar(db)
    const s = await pedir(deps, { ...GASTO, campos: { vision: 'Visión mía' }, observaciones_por_campo: [{ campo: 'mision', texto: 'más cercana' }], texto: 'Que suene a Guayaquil' })
    expect(s.status).toBe(200)
    expect(versiones(db)).toHaveLength(2)
    const nueva = versiones(db)[1]
    expect(draftDe(nueva).vision).toBe('Visión mía')
    expect(db.tablas['plan_cambios']).toHaveLength(1)
    const fila = db.tablas['plan_cambios'][0]
    expect(fila).toMatchObject({ manual_id: nueva.id, documento: 'manual', estado: 'pendiente', tope_usd: 5 })
    expect(fila.texto).toBe('Campo «Misión»: más cercana\n\nQue suene a Guayaquil')
    expect(s.despertar_flujo).toMatchObject({ camino: CAMINO_MANUAL_CAMBIOS, cuerpo: { manual_base_id: nueva.id, cambios_del_dueno: fila.texto, manual_cambio_id: fila.id } })
    expect(s.cuerpo).toMatchObject({ ok: true, reescribe: true, manual_id: nueva.id, directo: { version_nueva: 2 } })
  })

  it('🔴 retirar[] retira, y queda marcado como retirado por el dueño', async () => {
    const db = base(), { deps } = armar(db)
    await pedir(deps, { ...GASTO, retirar: ['vision'], texto: 'Hazlo más cercano' })
    const nueva = versiones(db)[1]
    expect(draftDe(nueva).vision).toBeNull()
    expect(draftDe(nueva)._field_meta.vision).toMatchObject({ retirado: true, fuente: 'dueno' })
  })

  it('🔴 lo que escribió o retiró en este pedido no lo libera nombrarlo de paso, y sí una observación en ese campo', async () => {
    const db = base(), { deps } = armar(db)
    const s = await pedir(deps, { ...GASTO, campos: { vision: 'Visión mía' }, retirar: ['valores'], texto: 'La visión y los valores deben sonar a mar' })
    expect(s.cuerpo.campos_liberados).toEqual([])

    const db2 = base(), d2 = armar(db2).deps
    const s2 = await pedir(d2, { ...GASTO, campos: { vision: 'Visión mía' }, observaciones_por_campo: [{ campo: 'vision', texto: 'pule mi frase' }] })
    expect(s2.cuerpo.campos_liberados).toEqual(['vision'])
  })

  it('una observación libera su campo del dueño, y uno que no se nombra se queda', async () => {
    const db = base(), { deps } = armar(db)
    expect((await pedir(deps, { ...GASTO, observaciones_por_campo: [{ campo: 'mision', texto: 'más cercana' }] })).cuerpo.campos_liberados).toEqual(['mision'])
    const db2 = base(), d2 = armar(db2).deps
    expect((await pedir(d2, { ...GASTO, texto: 'Hazlo más cercano' })).cuerpo.campos_liberados).toEqual([])
  })
})

describe('🔴 solo lo directo', () => {
  it.each([[{ campos: { vision: 'Visión mía' } }], [{ retirar: ['vision'] }]])('%j: no reescribe, no gasta y no pide confirmar gasto', async (cuerpo) => {
    const db = base(), { deps } = armar(db)
    const s = await pedir(deps, cuerpo)
    expect(s.status).toBe(200)
    expect(s.cuerpo).toMatchObject({ ok: true, reescribe: false, directo: { version_nueva: 2 } })
    expect(s.despertar_flujo).toBeUndefined()
    expect(db.tablas['plan_cambios']).toHaveLength(0)
    expect(versiones(db)).toHaveLength(2)
  })
})

describe('🔴 nada a medias: lo que se rechaza no escribe', () => {
  const noEscribio = (db: DbFalsa, e: ReturnType<typeof armar>['editarDirecto']) => {
    expect(e).not.toHaveBeenCalled()
    expect(versiones(db)).toHaveLength(1)
    expect(db.tablas['plan_cambios']).toHaveLength(0)
  }
  it.each<[string, Record<string, unknown>, string]>([
    ['campo que no existe', { ...GASTO, campos: { inventado: 'x' }, texto: 'Hazlo más cercano' }, 'inventado'],
    ['valor que no es texto', { campos: { vision: 3 } }, 'vision'],
    ['retirar que no es lista', { retirar: 'vision' }, 'retirar'],
    ['el mismo campo en los dos', { campos: { vision: 'x' }, retirar: ['vision'] }, 'dos veces'],
    ['observación sin campo', { ...GASTO, observaciones_por_campo: [{ campo: 'nada', texto: 'x' }] }, 'observación'],
    ['observación sin texto', { ...GASTO, observaciones_por_campo: [{ campo: 'mision', texto: ' ' }] }, 'observación'],
    ['observaciones que no son lista', { ...GASTO, observaciones_por_campo: 'x' }, 'observaciones_por_campo'],
    ['retirar y observar el mismo campo', { ...GASTO, retirar: ['vision'], observaciones_por_campo: [{ campo: 'vision', texto: 'pule' }] }, 'deja una'],
    ['pedido vacío', { ...GASTO }, 'texto'],
  ])('%s', async (_n, cuerpo, dice) => {
    const db = base(), { deps, editarDirecto } = armar(db)
    const s = await pedir(deps, cuerpo)
    expect(s.status).toBe(400)
    expect(String(s.cuerpo.detalle)).toContain(dice)
    noEscribio(db, editarDirecto)
  })

  it('🔴 con observaciones y sin confirmar el gasto, lo directo tampoco se aplica', async () => {
    const db = base(), { deps, editarDirecto } = armar(db)
    expect((await pedir(deps, { campos: { vision: 'x' }, texto: 'Hazlo más cercano' })).cuerpo.error).toBe('falta_confirmar_el_gasto')
    noEscribio(db, editarDirecto)
  })

  it('🔴 el texto armado cuenta entero contra el tope', async () => {
    const db = base(), { deps, editarDirecto } = armar(db)
    const s = await pedir(deps, { ...GASTO, campos: { vision: 'x' }, observaciones_por_campo: [{ campo: 'mision', texto: 'a'.repeat(TOPE_DEL_TEXTO_DEL_DUENO - 5) }], texto: 'b'.repeat(50) })
    expect(s.status).toBe(400)
    noEscribio(db, editarDirecto)
  })

  it('el texto en el tope entra: no se recorta nada', async () => {
    const db = base(), { deps } = armar(db)
    const texto = 'a'.repeat(TOPE_DEL_TEXTO_DEL_DUENO)
    expect((await pedir(deps, { ...GASTO, texto })).status).toBe(200)
    expect(db.tablas['plan_cambios'][0].texto).toBe(texto)
  })

  it.each([['pendiente'], ['en_reescritura']])('🔴 con una reescritura %s da 409 y lo directo no se aplica', async (estado) => {
    const db = base([{ id: 'c1', client_id: C, documento: 'manual', manual_id: 'v1', estado, despertado: true }]), { deps, editarDirecto } = armar(db)
    const s = await pedir(deps, { campos: { vision: 'x' } })
    expect(s.status).toBe(409)
    expect(editarDirecto).not.toHaveBeenCalled()
    expect(versiones(db)).toHaveLength(1)
  })

  it('🔴 si no puede leer los pedidos abiertos, lo directo no se aplica', async () => {
    const db = base(), { deps, editarDirecto } = armar(db)
    db.fallar['plan_cambios'] = 'caída'
    expect((await pedir(deps, { campos: { vision: 'x' } })).status).toBe(500)
    expect(editarDirecto).not.toHaveBeenCalled()
  })
})

describe('🔴 si algo falla después de lo directo', () => {
  it('si el pedido no se guarda, lo dice y declara lo que ya quedó', async () => {
    const db = base(), { deps } = armar(db)
    const original = db.from.bind(db)
    let n = 0
    const conFalla = { ...deps, db: { from: (t: string) => { if (t === 'plan_cambios' && ++n === 2) { db.fallar['plan_cambios'] = 'caída' } return original(t) } } } as DepsDelPedido
    const s = await pedir(conFalla, { ...GASTO, campos: { vision: 'Visión mía' }, texto: 'Hazlo más cercano' })
    expect(s.status).toBe(500)
    expect(s.cuerpo).toMatchObject({ ok: false, directo: { version_nueva: 2 } })
    expect(s.despertar_flujo).toBeUndefined()
  })

  it('🔴 reintentar SOLO la reescritura: no crea otra versión, lo directo sigue y es la misma fila', async () => {
    const db = base(), { deps, editarDirecto } = armar(db)
    await pedir(deps, { ...GASTO, campos: { vision: 'Visión mía' }, observaciones_por_campo: [{ campo: 'mision', texto: 'más cercana' }] })
    Object.assign(db.tablas['plan_cambios'][0], { despertado: false })
    const s = await pedir(deps, { ...GASTO, observaciones_por_campo: [{ campo: 'mision', texto: 'más cercana' }] })
    expect(s.status).toBe(200)
    expect(s.cuerpo).toMatchObject({ reescribe: true, reintento: true, manual_cambio_id: db.tablas['plan_cambios'][0].id })
    expect(editarDirecto).toHaveBeenCalledTimes(1)
    expect(versiones(db)).toHaveLength(2)
    expect(db.tablas['plan_cambios']).toHaveLength(1)
    expect(draftDe(versiones(db)[1]).vision).toBe('Visión mía')
  })

  it('🔴 si la reescritura falló del todo, lo directo sigue y se puede pedir otra vez sin repetirlo', async () => {
    const db = base(), { deps, editarDirecto } = armar(db)
    await pedir(deps, { ...GASTO, campos: { vision: 'Visión mía' }, texto: 'Hazlo más cercano' })
    Object.assign(db.tablas['plan_cambios'][0], { estado: 'fallido' })
    const s = await pedir(deps, { ...GASTO, texto: 'Hazlo más cercano' })
    expect(s.status).toBe(200)
    expect(editarDirecto).toHaveBeenCalledTimes(1)
    expect(draftDe(versiones(db)[1]).vision).toBe('Visión mía')
    expect(db.tablas['plan_cambios'][1]).toMatchObject({ estado: 'pendiente', manual_id: versiones(db)[1].id })
  })

  it('si la edición falla, no se pide nada y no se gasta', async () => {
    const db = base(), { deps } = armar(db)
    const conFalla = { ...deps, editarDirecto: vi.fn(async () => ({ status: 502, body: { ok: false, error: 'no_se_pudo_guardar' }, toca: { client_id: C } })) } as DepsDelPedido
    const s = await pedir(conFalla, { ...GASTO, campos: { vision: 'x' }, texto: 'Hazlo más cercano' })
    expect(s.status).toBe(502)
    expect(s.despertar_flujo).toBeUndefined()
    expect(db.tablas['plan_cambios']).toHaveLength(0)
  })

  it('🔴 un pedido colgado se reutiliza: sigue siendo una sola fila, sobre la versión nueva', async () => {
    const db = base([{ id: 'c1', client_id: C, documento: 'manual', manual_id: 'v1', estado: 'pendiente', despertado: false, texto: 'viejo' }]), { deps } = armar(db)
    const s = await pedir(deps, { ...GASTO, campos: { vision: 'x' }, texto: 'Hazlo más cercano' })
    expect(s.cuerpo).toMatchObject({ manual_cambio_id: 'c1', reintento: true })
    expect(db.tablas['plan_cambios']).toHaveLength(1)
    expect(db.tablas['plan_cambios'][0].manual_id).toBe(versiones(db)[1].id)
  })
})

describe('lo de siempre sigue igual', () => {
  it('🔴 `campos` como lista libera los campos, sin aplicar nada directo', async () => {
    const db = base(), { deps, editarDirecto } = armar(db)
    const s = await pedir(deps, { ...GASTO, texto: 'Hazlo más cercano', campos: ['mision'] })
    expect(s.cuerpo.campos_liberados).toEqual(['mision'])
    expect(editarDirecto).not.toHaveBeenCalled()
    expect(versiones(db)).toHaveLength(1)
  })
})
