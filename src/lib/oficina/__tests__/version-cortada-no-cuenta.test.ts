/**
 * 11-nov · REGLA (b) de Lenovo (20:10 Zúrich): una versión CORTADA POR CAUSA NUESTRA no cuenta entre las 3 de la pieza. Lo que exige CC7 (FROM-CC7 «lo que voy a exigir»):
 *  1. lista cerrada de orígenes (un origen fuera de la lista no marca) · 2. un solo lugar cuenta el tope (cada llamador lo usa con los hermanos) · 3. el techo (3) con prueba de borde
 *  4. la marca solo al cerrar fallido (re-marcar no devuelve un intento) · 5. las filas sin marca cuentan como antes (fixture de filas REALES del 11-nov y del 28-oct)
 * Dos clientes de rubros distintos: un restaurante (Náufrago) y un B2B de seguridad industrial (Zero Risk Seguridad Industrial).
 */
import { describe, expect, it } from 'vitest'
import { causaDelFallo, conCausaDelFallo, esVersionCortadaPorNosotros, ORIGENES_DE_CORTE_NUESTRO } from '../causa-del-fallo'
import { MAX_VERSIONES_CORTADAS, MAX_VERSIONES_POR_BRIEF, agotaLasVersiones, alcanzaElTechoDeCortadas, bloqueaElReintento, decidirReapertura, intentosQueCuentan, rastroDe, type RastroDeEncargo } from '../reapertura'
import { almacenDeSupabase } from '../almacen-supabase'
import { abrirEncargo, avanzar, corteNuestroDeLaVuelta, fallar, recibirResultado } from '../orquestador'
import { crearPuertos } from '../adaptadores'
import { revisarPasosMuertos } from '../vigia'
import { POST_IMG } from '../plantillas/post-img'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { Encargo, NuevoEncargo } from '../puertos'
import { estadoInicial, type Estado } from '../tipos'
import { DbFalsa } from './dbfalsa'
import { CLIENTE, PARTE, PARTE_REAL, crearMemoria } from './memoria'

const AHORA = new Date('2026-11-11T19:44:00Z')
const MOTIVO_CORREDOR = 'el paso «direccion_visual» falló: el agente FALLÓ · agent-runner upstream failed'

const CLIENTES: Array<[string, { client: string; parte: string; brief: string; tipo: string }]> = [
  ['restaurante · Náufrago (foto)', { client: '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', parte: 'ce085548-56a0-4892-8852-74c1d2d54576', brief: 's1-d4-jue_foto_olon', tipo: 'post_img' }],
  ['B2B · seguridad industrial (kit de historias)', { client: 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5', parte: '2a93029a-d4e5-439e-87a8-4b67afdfec33', brief: 'BRF-0004', tipo: 'kit_historias' }],
]
type C = (typeof CLIENTES)[number][1]

/** una fila de `oficina_encargos` del cliente · por defecto una fallida que GASTÓ, sin marca */
const fila = (c: C, version: number, o: Record<string, unknown> = {}): Record<string, unknown> => ({
  id: `e-${c.brief}-${version}`, client_id: c.client, parte_id: c.parte, brief_id: c.brief, tipo_de_grupo: c.tipo, familia: c.tipo, version_encargo: version,
  estado: 'fallido', gasto_usd: 0.4, tope_usd: 1.5, dry_run: false, prueba: false, sala_ref: null,
  estado_del_motor: conCausaDelFallo({ ...estadoInicial(), pasos_ejecutados: 5, gasto_usd: 0.4 }, 'el paso «copy» falló: formato inválido', AHORA), ...o,
})
/** una versión CORTADA por causa nuestra (la marca la puso quien detectó la caída, al cerrar) */
const cortada = (c: C, version: number, origen = 'corredor_caido', o: Record<string, unknown> = {}) =>
  fila(c, version, { estado_del_motor: conCausaDelFallo({ ...estadoInicial(), pasos_ejecutados: 5, gasto_usd: 0.4 }, MOTIVO_CORREDOR, AHORA, origen), ...o })
/** una fallida recuperable (sin gasto, murió al abrir), sin marca */
const recuperable = (c: C, version: number) => fila(c, version, { gasto_usd: 0, estado_del_motor: conCausaDelFallo(estadoInicial(), 'no se pudieron leer las fuentes del cliente: timeout', AHORA) })
const nuevo = (c: C, extra: Partial<NuevoEncargo> = {}): NuevoEncargo => ({ client_id: c.client, parte_id: c.parte, brief_id: c.brief, tipo_de_grupo: c.tipo, familia: c.tipo, tope_usd: 1.5, dry_run: false, prueba: false, sala_ref: null, estado_del_motor: estadoInicial(), ...extra })
const R = (f: Record<string, unknown>): RastroDeEncargo => rastroDe(f)

// FILAS REALES de `oficina_encargos` (lectura de la base 11-nov 19:2xZ, solo SELECT · ninguna tiene marca: son de antes de la regla b)
const REAL_NAUFRAGO_V1 = { id: '7c6f365a-2ac7-4c2e-8ed6-946fac851c2a', brief_id: 's1-d4-jue_foto_olon', tipo_de_grupo: 'post_img', version_encargo: 1, estado: 'fallido', gasto_usd: 0, dry_run: false, estado_del_motor: { ...estadoInicial(), ultimo: -1, pasos_ejecutados: 0 } }
const REAL_SEGURIDAD_V2 = { id: '190af7fc-5083-4da5-8743-01fdb57b0f46', brief_id: 'BRF-0004', tipo_de_grupo: 'kit_historias', version_encargo: 2, estado: 'fallido', gasto_usd: 0.430033, dry_run: false, estado_del_motor: { ...estadoInicial(), ultimo: 9, pasos_ejecutados: 8 } }
const REAL_SEGURIDAD_V3 = { id: 'fcaabccf-14ec-47ea-b50f-ccd032cf57a3', brief_id: 'BRF-0004', tipo_de_grupo: 'kit_historias', version_encargo: 3, estado: 'fallido', gasto_usd: 0.308337, dry_run: false, estado_del_motor: { ...estadoInicial(), ultimo: 3, pasos_ejecutados: 5 } }

describe('1 · la marca: lista cerrada, solo de quien detecta, nunca del texto', () => {
  it('🔴 los 4 orígenes de la lista marcan; cualquier otro (formato inválido, tope de gasto, mayúsculas, vacío) no', () => {
    expect([...ORIGENES_DE_CORTE_NUESTRO]).toEqual(['vigia_sin_vuelta', 'error_interno', 'corredor_caido', 'pedido_no_llego'])
    for (const o of ORIGENES_DE_CORTE_NUESTRO) expect(conCausaDelFallo(estadoInicial(), 'x', AHORA, o).fallo?.corte_nuestro).toEqual({ origen: o })
    for (const o of ['formato_invalido', 'tope_de_gasto', 'mesa_sin_pieza', 'CORREDOR_CAIDO', '', null, undefined, 1, { origen: 'corredor_caido' }]) {
      const f = conCausaDelFallo(estadoInicial(), 'x', AHORA, o).fallo
      expect(f?.motivo).toBe('x')
      expect(f).not.toHaveProperty('corte_nuestro')
    }
  })
  it('🔴 el TEXTO del motivo jamás marca (aunque diga «agent-runner upstream failed» o «murió dos veces»)', () => {
    for (const m of [MOTIVO_CORREDOR, 'el paso «x» murió dos veces (sin vuelta en 12 min)', 'error interno en «x»: boom', 'OFICINA_PEDIDO_NO_LLEGO · timeout']) expect(conCausaDelFallo(estadoInicial(), m, AHORA).fallo).not.toHaveProperty('corte_nuestro')
  })
  it('🔴 una fila guardada con un origen FUERA de la lista se lee como fallo normal (cuenta)', () => {
    const motor = { ...estadoInicial(), fallo: { motivo: 'x', en: AHORA.toISOString(), pasos_ejecutados: 1, gasto_usd: 0.2, corte_nuestro: { origen: 'formato_invalido' } } }
    expect(causaDelFallo(motor)).not.toHaveProperty('corte_nuestro')
    expect(esVersionCortadaPorNosotros('fallido', motor)).toBe(false)
  })
  it('🔴 la marca vale SOLO en una fila que cerró fallido (re-marcar una cerrada, por tope o viva no le devuelve un intento)', () => {
    const marcado = conCausaDelFallo(estadoInicial(), MOTIVO_CORREDOR, AHORA, 'corredor_caido')
    expect(esVersionCortadaPorNosotros('fallido', marcado)).toBe(true)
    for (const e of ['cerrado', 'cerrado_por_tope', 'en_paso', 'abierto']) expect(esVersionCortadaPorNosotros(e, marcado)).toBe(false)
  })
  it('🔴 la primera causa gana: un fallido ya cerrado sin marca NO se marca después', () => {
    const cerrado = conCausaDelFallo(estadoInicial(), 'formato inválido', AHORA)
    expect(conCausaDelFallo(cerrado, MOTIVO_CORREDOR, AHORA, 'corredor_caido')).toBe(cerrado)
    expect(esVersionCortadaPorNosotros('fallido', conCausaDelFallo(cerrado, MOTIVO_CORREDOR, AHORA, 'corredor_caido'))).toBe(false)
  })
  it('🔴 la vuelta del turno: solo los CAMPOS del flujo marcan (upstream_status entero · pedido_no_llego true), nunca el texto', () => {
    expect(corteNuestroDeLaVuelta({ error: MOTIVO_CORREDOR })).toBeUndefined()
    for (const s of [0, 200, 502, 503]) expect(corteNuestroDeLaVuelta({ error: 'x', upstream_status: s })).toBe('corredor_caido')
    expect(corteNuestroDeLaVuelta({ error: 'x', pedido_no_llego: true })).toBe('pedido_no_llego')
    for (const v of [{ upstream_status: null }, { upstream_status: 1.5 }, { upstream_status: '502' as unknown as number }, { pedido_no_llego: false }]) expect(corteNuestroDeLaVuelta({ error: 'x', ...v })).toBeUndefined()
  })
})

describe.each(CLIENTES)('2 · el conteo único · %s', (_n, c) => {
  it('🔴 sin marcas cuenta como antes: el número de versión (y la v3 agota)', () => {
    const h = [R(fila(c, 1)), R(fila(c, 2)), R(fila(c, 3))]
    expect(h.map((x) => intentosQueCuentan(x, h))).toEqual([1, 2, 3])
    expect(agotaLasVersiones(h[1], h)).toBe(false)
    expect(agotaLasVersiones(h[2], h)).toBe(true)
  })
  it('🔴 v1 y v2 cortadas por causa nuestra + v3 recuperable: la v3 cuenta como el 1.er intento y se reabre como v4 (antes quedaba trabada)', () => {
    const h = [R(cortada(c, 1)), R(cortada(c, 2, 'vigia_sin_vuelta')), R(recuperable(c, 3))]
    expect(intentosQueCuentan(h[2], h)).toBe(1)
    expect(decidirReapertura(h[2], h)).toEqual({ accion: 'reabrir', version: 4 })
    expect(bloqueaElReintento(h[2], h)).toBe(false)
    // control: sin las marcas, la misma v3 agota (como hoy)
    const sin = [R(fila(c, 1)), R(fila(c, 2)), R(recuperable(c, 3))]
    expect(decidirReapertura(sin[2], sin)).toEqual({ accion: 'devolver' })
    expect(bloqueaElReintento(sin[2], sin)).toBe(true)
  })
  it('🔴 una cortada que GASTÓ no se reabre sola; con causa declarada sí, porque no gastó un intento', () => {
    const h = [R(fila(c, 1)), R(fila(c, 2)), R(cortada(c, 3))]
    expect(intentosQueCuentan(h[2], h)).toBe(2)
    expect(decidirReapertura(h[2], h)).toEqual({ accion: 'devolver' })
    expect(decidirReapertura(h[2], h, 'cortada por la publicación de #1054')).toEqual({ accion: 'reabrir', version: 4, por_causa: 'cortada por la publicación de #1054' })
    expect(agotaLasVersiones(h[2], h)).toBe(false)
    const sin = [R(fila(c, 1)), R(fila(c, 2)), R(fila(c, 3))]
    expect(decidirReapertura(sin[2], sin, 'cortada por la publicación de #1054')).toEqual({ accion: 'devolver' })
  })
  it(`🔴 TECHO (${MAX_VERSIONES_CORTADAS}) · borde: la cortada N+1 cuenta como un intento normal`, () => {
    const tres = [1, 2, 3].map((v) => R(cortada(c, v)))
    const cuartaCortada = R(cortada(c, 4))
    const cuartaNormal = R(fila(c, 4))
    expect(intentosQueCuentan(tres[2], tres)).toBe(0)
    expect(intentosQueCuentan(cuartaCortada, [...tres, cuartaCortada])).toBe(1)
    expect(intentosQueCuentan(cuartaCortada, [...tres, cuartaCortada])).toBe(intentosQueCuentan(cuartaNormal, [...tres, cuartaNormal]))
    // seis cortadas seguidas: la 6.ª agota (sin techo nunca agotaría: bucle)
    const seis = [1, 2, 3, 4, 5, 6].map((v) => R(cortada(c, v)))
    expect(seis.map((x) => intentosQueCuentan(x, seis))).toEqual([0, 0, 0, 1, 2, 3])
    expect(agotaLasVersiones(seis[4], seis)).toBe(false)
    expect(agotaLasVersiones(seis[5], seis)).toBe(true)
  })
  it('🔴 el aviso del techo es UNO: sale en la 3.ª cortada, no en la 2.ª ni en la 4.ª ni en una normal', () => {
    const h = [1, 2, 3, 4].map((v) => R(cortada(c, v)))
    expect(h.map((x) => alcanzaElTechoDeCortadas(x, h))).toEqual([false, false, true, false])
    const mixto = [R(cortada(c, 1)), R(fila(c, 2)), R(cortada(c, 3)), R(fila(c, 4)), R(cortada(c, 5))]
    expect(mixto.map((x) => alcanzaElTechoDeCortadas(x, mixto))).toEqual([false, false, false, false, true])
  })
  it('🔴 hermanos repetidos o desordenados no cuentan dos veces; los de versión MAYOR no restan', () => {
    const v1 = R(cortada(c, 1)); const v2 = R(fila(c, 2)); const v5 = R(cortada(c, 5))
    expect(intentosQueCuentan(v2, [v5, v2, v1, v1, v1])).toBe(1)
  })
})

describe('5 · filas REALES sin marca (antes de la regla b) cuentan exactamente como antes', () => {
  it('🔴 Náufrago v1 (murió al abrir, US$ 0): recuperable, se reabre como v2', () => {
    const v1 = R(REAL_NAUFRAGO_V1)
    expect(v1.cortada).toBe(false)
    expect(intentosQueCuentan(v1, [v1])).toBe(1)
    expect(decidirReapertura(v1, [v1])).toEqual({ accion: 'reabrir', version: 2 })
  })
  it('🔴 Seguridad industrial v2 y v3 (gastaron): la v3 agota los 3 intentos y no se reabre ni con causa', () => {
    const h = [R(REAL_SEGURIDAD_V2), R(REAL_SEGURIDAD_V3)]
    expect(h.every((x) => !x.cortada)).toBe(true)
    expect(intentosQueCuentan(h[1], h)).toBe(MAX_VERSIONES_POR_BRIEF)
    expect(agotaLasVersiones(h[1], h)).toBe(true)
    expect(decidirReapertura(h[1], h, 'causa corregida')).toEqual({ accion: 'devolver' })
  })
})

describe.each(CLIENTES)('2 · el almacén REAL (crearEncargo sobre la base falsa) · %s', (_n, c) => {
  it('🔴 v1 y v2 cortadas + v3 recuperable: abre la v4 sin tocar las viejas; sin marcas devuelve la v3', async () => {
    const db = new DbFalsa().semilla('oficina_encargos', [cortada(c, 1), cortada(c, 2, 'pedido_no_llego'), recuperable(c, 3)])
    const antes = JSON.stringify(db.tablas['oficina_encargos'])
    const r = await almacenDeSupabase(db as never).crearEncargo(nuevo(c))
    expect(r).toMatchObject({ ok: true, nuevo: true })
    if (r.ok) expect(r.encargo.version_encargo).toBe(4)
    expect(JSON.stringify(db.tablas['oficina_encargos'].slice(0, 3))).toBe(antes)
    const control = new DbFalsa().semilla('oficina_encargos', [fila(c, 1), fila(c, 2), recuperable(c, 3)])
    const rc = await almacenDeSupabase(control as never).crearEncargo(nuevo(c))
    expect(rc).toMatchObject({ ok: true, nuevo: false })
    expect(control.tablas['oficina_encargos']).toHaveLength(3)
  })
  it('🔴 la v3 CORTADA que gastó se reabre con causa declarada (rehacer) como v4; una cortada de ENSAYO no cuenta para la real', async () => {
    const db = new DbFalsa().semilla('oficina_encargos', [fila(c, 1), fila(c, 2), cortada(c, 3)])
    const r = await almacenDeSupabase(db as never).crearEncargo(nuevo(c, { reabrir_causa: 'cortada por la publicación de #1054' }))
    expect(r.ok && r.nuevo && r.encargo.version_encargo).toBe(4)
    const ensayo = new DbFalsa().semilla('oficina_encargos', [fila(c, 1), cortada(c, 2, 'corredor_caido', { dry_run: true }), fila(c, 3)])
    const re = await almacenDeSupabase(ensayo as never).crearEncargo(nuevo(c, { reabrir_causa: 'x' }))
    expect(re).toMatchObject({ ok: true, nuevo: false })
  })
  it('🔴 hermanosDe lee SOLO las versiones reales del mismo brief y grupo', async () => {
    const db = new DbFalsa().semilla('oficina_encargos', [cortada(c, 1), cortada(c, 2, 'corredor_caido', { dry_run: true }), cortada(c, 3, 'corredor_caido', { tipo_de_grupo: 'otro' }), cortada(c, 4, 'corredor_caido', { brief_id: 'otro' }), fila(c, 5)])
    const h = await almacenDeSupabase(db as never).hermanosDe!({ parte_id: c.parte, brief_id: c.brief, tipo_de_grupo: c.tipo } as Encargo)
    expect(h.map((x) => [x.version_encargo, x.cortada]).sort()).toEqual([[1, true], [5, false]])
  })
})

describe.each(CLIENTES)('2 · el cierre (fallar) cuenta con los hermanos · %s', (_n, c) => {
  const encargoEn = (M: ReturnType<typeof crearMemoria>, f: Record<string, unknown>): Encargo => {
    const e = { con_desacuerdo: false, imagen_generada: false, salida_output_id: null, hitl_queue_id: null, ...f } as unknown as Encargo
    M.encargos.set(e.id, JSON.parse(JSON.stringify(e)))
    return e
  }
  const enPaso = (c2: C, v: number): Record<string, unknown> => ({ ...fila(c2, v), estado: 'en_paso', estado_del_motor: { ...estadoInicial(), pasos_ejecutados: 5, gasto_usd: 0.4 } })
  const ladrillos = (M: ReturnType<typeof crearMemoria>) => M.llamadas.avisos.filter((a) => a.texto.includes('🧱')).length
  const techos = (M: ReturnType<typeof crearMemoria>) => M.llamadas.avisos.filter((a) => a.canal === 'alertas' && a.texto.includes('🧯'))
  it('🔴 v1 y v2 cortadas: la v3 que falla normal NO avisa «3 intentos» (lleva 1); sin las marcas, sí', async () => {
    const M = crearMemoria()
    encargoEn(M, cortada(c, 1)); encargoEn(M, cortada(c, 2))
    await fallar(M.P, encargoEn(M, enPaso(c, 3)), 'formato inválido')
    expect(ladrillos(M)).toBe(0)
    const M2 = crearMemoria()
    encargoEn(M2, fila(c, 1)); encargoEn(M2, fila(c, 2))
    await fallar(M2.P, encargoEn(M2, enPaso(c, 3)), 'formato inválido')
    expect(ladrillos(M2)).toBe(1)
  })
  it('🔴 la 3.ª cortada dispara UNA alarma real en #alertas (con su origen); la 4.ª cortada ya no; la fila queda fallida con su marca', async () => {
    const M = crearMemoria()
    encargoEn(M, cortada(c, 1)); encargoEn(M, cortada(c, 2))
    const v3 = encargoEn(M, enPaso(c, 3))
    await fallar(M.P, v3, MOTIVO_CORREDOR, 'corredor_caido')
    expect(techos(M)).toHaveLength(1)
    expect(techos(M)[0].texto).toContain(c.brief)
    expect(techos(M)[0].texto).toContain('corredor_caido')
    expect(M.encargos.get(v3.id)).toMatchObject({ estado: 'fallido' })
    expect(causaDelFallo(M.encargos.get(v3.id)!.estado_del_motor)?.corte_nuestro).toEqual({ origen: 'corredor_caido' })
    expect(ladrillos(M)).toBe(0)
    await fallar(M.P, encargoEn(M, enPaso(c, 4)), MOTIVO_CORREDOR, 'corredor_caido')
    expect(techos(M)).toHaveLength(1)
  })
  it('🔴 un origen fuera de la lista en `fallar` no marca ni dispara el techo', async () => {
    const M = crearMemoria()
    encargoEn(M, cortada(c, 1)); encargoEn(M, cortada(c, 2))
    const v3 = encargoEn(M, enPaso(c, 3))
    await fallar(M.P, v3, 'formato inválido', 'formato_invalido' as never)
    expect(causaDelFallo(M.encargos.get(v3.id)!.estado_del_motor)).not.toHaveProperty('corte_nuestro')
    expect(techos(M)).toHaveLength(0)
  })
})

describe('3 · los puntos de detección marcan en el momento', () => {
  const sobre = { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: 'post_img' }
  const abrir = (M: ReturnType<typeof crearMemoria>) => abrirEncargo(M.P, { cuerpo: sobre, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const corteDe = (M: ReturnType<typeof crearMemoria>, id: string) => causaDelFallo(M.encargos.get(id)!.estado_del_motor)?.corte_nuestro ?? null
  async function enEspera() {
    const M = crearMemoria()
    const a = await abrir(M)
    const id = String(a.cuerpo.encargo_id)
    const t = (a.cuerpo.accion === 'esperar' ? a.cuerpo : (await avanzar(M.P, id)).cuerpo).turno as { n: number }
    return { M, id, n: t.n }
  }
  it('🔴 la vuelta con `upstream_status` (también el 200 del redespliegue) cierra marcada `corredor_caido`', async () => {
    for (const s of [200, 0, 502]) {
      const { M, id, n } = await enEspera()
      const r = await recibirResultado(M.P, id, n, { error: 'el agente FALLÓ · agent-runner upstream failed', upstream_status: s })
      expect(r.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'fallido' })
      expect(corteDe(M, id)).toEqual({ origen: 'corredor_caido' })
    }
  })
  it('🔴 la vuelta con `pedido_no_llego` cierra marcada; el MISMO texto sin campos cierra sin marca (cuenta)', async () => {
    const a = await enEspera()
    await recibirResultado(a.M.P, a.id, a.n, { error: 'OFICINA_PEDIDO_NO_LLEGO · timeout', pedido_no_llego: true })
    expect(corteDe(a.M, a.id)).toEqual({ origen: 'pedido_no_llego' })
    const b = await enEspera()
    await recibirResultado(b.M.P, b.id, b.n, { error: 'el agente FALLÓ · agent-runner upstream failed' })
    expect(b.M.encargos.get(b.id)!.estado).toBe('fallido')
    expect(corteDe(b.M, b.id)).toBeNull()
  })
  it('🔴 un error de NUESTRO código dentro de un paso cierra marcado `error_interno`', async () => {
    const M = crearMemoria()
    const guardar = M.P.almacen.guardar
    let una = true
    M.P.almacen.guardar = async (c) => { if (una && c.turno?.estado === 'corriendo') { una = false; throw new Error('base caída al anotar el turno') } return guardar(c) }
    const a = await abrir(M)
    const id = [...M.encargos.keys()][0]
    expect(a.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'fallido' })
    expect(corteDe(M, id)).toEqual({ origen: 'error_interno' })
  })
  it('🔴 el vigía: el turno que muere por SEGUNDA vez cierra marcado `vigia_sin_vuelta`', async () => {
    const MIN = 60_000
    const db = new DbFalsa()
      .semilla('clients', [{ id: CLIENTE, name: 'C', config: {} }])
      .semilla('client_brand_books', [{ client_id: CLIENTE, version: 1, voice_description: 'Tutea siempre', forbidden_words: [] }])
      .semilla('client_social_images', [])
      .semilla('client_historical_outputs', [{ id: PARTE, client_id: CLIENTE, output_type: 'campaign_brief_pack', content: PARTE_REAL }])
      .semilla('oficina_config', [{ id: 1, estado: 'encendida', familias_activas: ['post_img'], clientes_ensayo: [] }])
      .semilla('oficina_tipos_de_grupo', [{ tipo: 'post_img', familia: 'post_img', clase: 'post_img', pasos: POST_IMG.pasos, indicaciones: POST_IMG.indicaciones, limites: POST_IMG.limites, activo: true }])
    const hora = new Date('2026-10-10T12:00:00Z')
    const P = crearPuertos(db, { baseUrl: 'https://app.test', internalKey: 'k' }, (async () => new Response('{}', { status: 404 })) as typeof fetch, () => hora)
    const a = await abrirEncargo(P, { cuerpo: sobre, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(a.cuerpo.encargo_id)
    const t = db.tablas['oficina_turnos'].find((x) => x.estado === 'corriendo')!
    Object.assign(t, { agente: 'agente-nuevo', dispatch_key: `oficina:${id}:1`, workflow_execution_id: 'ex-acuse', inicio: new Date(hora.getTime() - 40 * MIN).toISOString() })
    const fila0 = db.tablas['oficina_encargos'].find((x) => x.id === id)!
    const motor = fila0.estado_del_motor as Estado
    fila0.estado_del_motor = { ...motor, vueltas: { ...motor.vueltas, [`muerto:${String(t.paso)}`]: 1 } }
    const lector = { despacho: async () => null, duraciones: async () => [] }
    const r = await revisarPasosMuertos(P, db, hora, lector)
    expect(r.fallidos).toEqual([id])
    const fin = db.tablas['oficina_encargos'].find((x) => x.id === id)!
    expect(fin.estado).toBe('fallido')
    expect(causaDelFallo(fin.estado_del_motor)?.corte_nuestro).toEqual({ origen: 'vigia_sin_vuelta' })
  })
})
