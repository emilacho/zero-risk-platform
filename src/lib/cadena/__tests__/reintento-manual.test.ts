/**
 * 21-nov · «REINTENTAR AHORA» UN PASO AGOTADO (GO Lenovo 03:55Z, opción c · CC4).
 * El caso real: la estrategia de `2fd5f619` agotó sus 3 intentos (01:32–01:43Z, tramo am) por un error nuestro ya arreglado (#1260); a las 03:30Z el flujo recibió
 * `intentos_agotados` y no volvería a intentar hasta el tramo pm (12:00Z). Lo que se fija:
 *  · el operador concede una llave nueva `<base>:rmanual-<UTC>` con 3 intentos; el próximo preparar la usa (intento 1) en el MISMO tramo;
 *  · las corridas viejas quedan intactas (ni se mueven ni se borran) y el registro dice quién, cuándo, por qué y la llave agotada;
 *  · idempotente; solo para un paso de verdad agotado; la misma bolsa y el mismo candado del tope; agotada la llave manual, vuelve a «agotado»;
 *  · no vale para `necesita_humano` ni para las campañas excluidas (36e66179), ni para el brief; pide quién y por qué; sin flujo conocido, 403;
 *  · agnóstico: el mismo camino para otro paso (calendario) por `prepararCorrida`.
 */
import { describe, expect, it } from 'vitest'
import { abrirCampana, estrategiaPreparar, estrategiaGuardar } from '../index'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import { CLAVE_DE_LA_LIBRETA_DE_REINTENTOS, estadoDeLaLlave, llaveDeReintentoManual, prepararCorrida, baseDeLaLlave } from '../nucleo'
import { CAMPANAS_SIN_REINTENTO_MANUAL, reintentarAhora } from '../reintento-manual'
import { ACCIONES } from '../acciones'

const A = clienteA()
const ABRE = '2026-10-12T12:00:00Z'
// las 3 caídas y el reintento, en el MISMO tramo am (como en la campaña real)
const T1 = '2026-10-13T01:32:00Z', T2 = '2026-10-13T01:38:00Z', T3 = '2026-10-13T01:43:00Z', AHORA = '2026-10-13T03:56:00Z'
const wf = (ex = 'ex-1') => ({ workflow_id: 'wf-cadena', workflow_execution_id: ex })
const OPERADOR = { workflow_id: 'tablero', workflow_execution_id: 'cc7-reintento-1' }
const almacen = () => new AlmacenMemoria({
  contextos: { [A.clientId]: contextoDe(A) },
  planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
  config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta' },
  journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
})
const caida = { success: false, cost_usd: 0.2, error: 'LLAMADA_CORTADA · sin bytes' }

/** abre la campaña y deja la estrategia con N intentos caídos (N=3: agotada en este tramo) */
async function conCaidas(n: number, al = almacen(), idFijo?: string) {
  const c = await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, ABRE)
  let id = (c.cuerpo.campana as { id: string }).id
  if (idFijo) { al.campanas[0].id = idFijo; id = idFijo }
  for (const [i, t] of [T1, T2, T3].slice(0, n).entries()) {
    const p = await estrategiaPreparar(al, { ...wf(`ex-${i}`), campana_id: id }, t)
    expect(p.status).toBe(200)
    await estrategiaGuardar(al, { ...wf(`ex-${i}`), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: caida }, t)
  }
  return { al, id }
}
const pedir = (al: AlmacenMemoria, extra: Record<string, unknown>) => reintentarAhora(al, { ...OPERADOR, paso: 'estrategia', quien: 'CC7', por_que: 'los 3 intentos cayeron por el corte de 800 s, arreglado en #1260', ...extra }, AHORA)
const libreta = (al: AlmacenMemoria) => (al.config.get(CLAVE_DE_LA_LIBRETA_DE_REINTENTOS) ?? []) as Array<Record<string, string>>

describe('el caso de la campaña frenada: 3 caídas en el tramo am', () => {
  it('🔴 sin permiso, el preparar de las 03:56Z dice «agotado» (la regla de siempre)', async () => {
    const { al, id } = await conCaidas(3)
    const r = await estrategiaPreparar(al, { ...wf('ex-9'), campana_id: id }, AHORA)
    expect(r).toMatchObject({ status: 409, cuerpo: { error: 'intentos_agotados' } })
  })
  it('🔴 el operador concede la llave manual; el próximo preparar abre el intento 1 con ESA llave, en el mismo tramo', async () => {
    const { al, id } = await conCaidas(3)
    const antes = structuredClone(al.corridas)
    const r = await pedir(al, { campana_id: id })
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ ok: true, intentos_libres: 3, permiso: { campana_id: id, paso: 'estrategia', clave_agotada: 'v1:c0', llave: 'v1:c0:rmanual-20261013t035600', quien: 'CC7', cuando: AHORA } })
    expect(al.corridas).toEqual(antes) // no mueve ni borra corridas
    const p = await estrategiaPreparar(al, { ...wf('ex-9'), campana_id: id }, AHORA)
    expect(p.status).toBe(200)
    const nueva = al.corridas.find((x) => x.id === p.cuerpo.corrida_id)!
    expect(nueva).toMatchObject({ clave_idempotencia: 'v1:c0:rmanual-20261013t035600', intento: 1, estado: 'en_curso' })
  })
  it('🔴 el registro: quién, cuándo, por qué y la llave que se agotó, en la libreta', async () => {
    const { al, id } = await conCaidas(3)
    await pedir(al, { campana_id: id })
    expect(libreta(al)).toEqual([{ campana_id: id, paso: 'estrategia', clave_agotada: 'v1:c0', llave: 'v1:c0:rmanual-20261013t035600', quien: 'CC7', por_que: 'los 3 intentos cayeron por el corte de 800 s, arreglado en #1260', cuando: AHORA }])
  })
  it('🔴 idempotente: pedirlo otra vez devuelve el MISMO permiso y no anota otro', async () => {
    const { al, id } = await conCaidas(3)
    await pedir(al, { campana_id: id })
    const otra = await reintentarAhora(al, { ...OPERADOR, campana_id: id, paso: 'estrategia', quien: 'CC7', por_que: 'otra vez' }, '2026-10-13T03:58:00Z')
    expect(otra.cuerpo).toMatchObject({ ok: true, ya_estaba: true, permiso: { llave: 'v1:c0:rmanual-20261013t035600' } })
    expect(libreta(al)).toHaveLength(1)
  })
  it('🔴 la llave manual tiene 3 intentos: agotada, el preparar vuelve a «agotado» y un permiso nuevo da otra llave', async () => {
    const { al, id } = await conCaidas(3)
    await pedir(al, { campana_id: id })
    for (const [i, t] of ['2026-10-13T03:57:00Z', '2026-10-13T04:05:00Z', '2026-10-13T04:20:00Z'].entries()) {
      const p = await estrategiaPreparar(al, { ...wf(`m-${i}`), campana_id: id }, t)
      expect(p.cuerpo.intento ?? al.corridas.find((x) => x.id === p.cuerpo.corrida_id)!.intento).toBe(i + 1)
      await estrategiaGuardar(al, { ...wf(`m-${i}`), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: caida }, t)
    }
    expect(await estrategiaPreparar(al, { ...wf('m-9'), campana_id: id }, '2026-10-13T04:30:00Z')).toMatchObject({ status: 409, cuerpo: { error: 'intentos_agotados' } })
    const otra = await reintentarAhora(al, { ...OPERADOR, campana_id: id, paso: 'estrategia', quien: 'CC7', por_que: 'segunda vez' }, '2026-10-13T04:31:00Z')
    expect(otra.cuerpo).toMatchObject({ ok: true, permiso: { llave: 'v1:c0:rmanual-20261013t043100', clave_agotada: 'v1:c0' } })
    expect(otra.cuerpo.ya_estaba).toBeUndefined()
  })
  it('🔴 (pedido de CC6 03:53Z) el núcleo real de punta a punta: base agotada am → manual intento 1 → 3 caídas → agotado en el am → el tramo pm estrena la SUYA (no la manual)', async () => {
    const { al, id } = await conCaidas(3)
    const c = () => al.campanas[0]
    await pedir(al, { campana_id: id })
    for (const t of ['2026-10-13T03:57:00Z', '2026-10-13T04:05:00Z', '2026-10-13T04:20:00Z']) {
      const r = await prepararCorrida(al, c(), 'estrategia', 'v1:c0', 'wf-cadena', 'e', t, 'claude-opus-5-5', null)
      expect(r).toMatchObject({ tipo: 'lista', corrida: { clave_idempotencia: 'v1:c0:rmanual-20261013t035600' } })
      if (r.tipo === 'lista') await al.cerrarCorrida(r.corrida.id, { estado: 'fallida', costo_usd: 0.2 })
    }
    expect((await prepararCorrida(al, c(), 'estrategia', 'v1:c0', 'wf-cadena', 'e', '2026-10-13T11:59:00Z', 'claude-opus-5-5', null)).tipo).toBe('intentos_agotados')
    const pm = await prepararCorrida(al, c(), 'estrategia', 'v1:c0', 'wf-cadena', 'e', '2026-10-13T12:00:00Z', 'claude-opus-5-5', null)
    expect(pm).toMatchObject({ tipo: 'lista', corrida: { clave_idempotencia: 'v1:c0:r2026-10-13pm', intento: 1 } })
    // ninguna llave pasa de 3 intentos
    const porLlave = new Map<string, number>()
    for (const x of al.corridas) porLlave.set(x.clave_idempotencia, Math.max(porLlave.get(x.clave_idempotencia) ?? 0, x.intento))
    expect(Math.max(...porLlave.values())).toBeLessThanOrEqual(3)
  })
})

describe('lo que frena', () => {
  it('🔴 un paso que NO está agotado: 409 y no se anota nada (el flujo sigue solo)', async () => {
    const { al, id } = await conCaidas(1)
    expect(await pedir(al, { campana_id: id })).toMatchObject({ status: 409, cuerpo: { code: 'E-REINTENTO-NO-AGOTADO' } })
    expect(libreta(al)).toEqual([])
  })
  it('🔴 sin corridas del paso: 409', async () => {
    const { al, id } = await conCaidas(0)
    expect((await pedir(al, { campana_id: id })).cuerpo).toMatchObject({ code: 'E-REINTENTO-SIN-CORRIDAS' })
  })
  it('🔴 una campaña en necesita_humano: 409 y nada anotado', async () => {
    const { al, id } = await conCaidas(3)
    al.campanas[0].estado = 'necesita_humano'
    expect((await pedir(al, { campana_id: id })).cuerpo).toMatchObject({ code: 'E-REINTENTO-ESTADO' })
    expect(libreta(al)).toEqual([])
  })
  it('🔴 la campaña 36e66179: 409 aunque esté en marcha y agotada', async () => {
    expect(CAMPANAS_SIN_REINTENTO_MANUAL).toEqual(['36e66179-3061-4a7d-94db-932a900d9515'])
    const { al, id } = await conCaidas(3, almacen(), '36e66179-3061-4a7d-94db-932a900d9515')
    expect(al.campanas[0].estado).toBe('estrategia')
    expect((await pedir(al, { campana_id: id })).cuerpo).toMatchObject({ code: 'E-REINTENTO-EXCLUIDA' })
    expect(libreta(al)).toEqual([])
  })
  it('🔴 la misma bolsa y el mismo candado del tope: si el intento no cabe, 409 y nada anotado', async () => {
    const { al, id } = await conCaidas(3)
    al.campanas[0].presupuesto_planificacion_usd = 2
    al.campanas[0].tope_gasto_usd = 2 // gastado 0,6 + tope 3 > 2, y la bolsa no puede pasar el tope de la campaña
    expect((await pedir(al, { campana_id: id })).cuerpo).toMatchObject({ code: 'E-PRESUPUESTO' })
    expect(libreta(al)).toEqual([])
  })
  it('🔴 la bolsa que se agranda hasta el tope sí deja pasar (la misma regla de preparar)', async () => {
    const { al, id } = await conCaidas(3)
    al.campanas[0].presupuesto_planificacion_usd = 2
    al.campanas[0].tope_gasto_usd = 300
    expect((await pedir(al, { campana_id: id })).status).toBe(200)
  })
  it('🔴 una llamada viva del paso: 409', async () => {
    const { al, id } = await conCaidas(2)
    const p = await estrategiaPreparar(al, { ...wf('viva'), campana_id: id }, T3)
    expect(p.status).toBe(200)
    const dentroDelPlazo = (t: string) => reintentarAhora(al, { ...OPERADOR, campana_id: id, paso: 'estrategia', quien: 'CC7', por_que: 'p' }, t)
    expect((await dentroDelPlazo('2026-10-13T01:50:00Z')).cuerpo).toMatchObject({ code: 'E-EN-CURSO' }) // 7 min de los 14 del plazo
    expect(libreta(al)).toEqual([])
    expect((await dentroDelPlazo(AHORA)).status).toBe(200) // pasado su plazo ya no frena: cuenta como intento perdido y el paso está agotado
  })
  it('🔴 campos: sin quién o sin por qué 400; el brief 400; un por qué de más de 500 400; campaña inexistente 404', async () => {
    const { al, id } = await conCaidas(3)
    expect((await pedir(al, { campana_id: id, quien: '' })).status).toBe(400)
    expect((await pedir(al, { campana_id: id, por_que: undefined })).status).toBe(400)
    expect((await pedir(al, { campana_id: id, paso: 'brief' })).cuerpo).toMatchObject({ code: 'E-PASO' })
    expect((await pedir(al, { campana_id: id, por_que: 'x'.repeat(501) })).cuerpo).toMatchObject({ code: 'E-POR-QUE' })
    expect((await pedir(al, { campana_id: id, por_que: 'x'.repeat(500) })).status).toBe(200)
    expect((await pedir(al, { campana_id: '00000000-0000-0000-0000-000000000000' })).status).toBe(404)
  })
  it('🔴 sin el contexto de un flujo conocido (o del operador por la entrada humana): 403', async () => {
    const { al, id } = await conCaidas(3)
    expect((await reintentarAhora(al, { workflow_id: 'otro', workflow_execution_id: 'x', campana_id: id, paso: 'estrategia', quien: 'CC7', por_que: 'p' }, AHORA)).status).toBe(403)
    expect(libreta(al)).toEqual([])
  })
  it('🔴 la ruta la expone: campanas · reintentar', () => {
    expect(ACCIONES.campanas.reintentar).toBe(reintentarAhora)
  })
})

describe('agnóstico: cualquier paso que cuenta intentos', () => {
  it('🔴 calendario: 3 caídas en el tramo → agotado; con permiso, la llave manual', async () => {
    const { al, id } = await conCaidas(0)
    const c = al.campanas[0]
    for (const t of [T1, T2, T3]) {
      const r = await prepararCorrida(al, c, 'calendario', 't1:v1:c0', 'wf-cadena', 'e', t, 'claude-opus-5-5', null)
      expect(r.tipo).toBe('lista')
      if (r.tipo === 'lista') await al.cerrarCorrida(r.corrida.id, { estado: 'fallida', costo_usd: 0.2 })
    }
    expect((await prepararCorrida(al, c, 'calendario', 't1:v1:c0', 'wf-cadena', 'e', AHORA, 'claude-opus-5-5', null)).tipo).toBe('intentos_agotados')
    const r = await reintentarAhora(al, { ...OPERADOR, campana_id: id, paso: 'calendario', quien: 'CC7', por_que: 'p' }, AHORA)
    expect(r.cuerpo).toMatchObject({ ok: true, permiso: { clave_agotada: 't1:v1:c0', llave: 't1:v1:c0:rmanual-20261013t035600' } })
    const p = await prepararCorrida(al, c, 'calendario', 't1:v1:c0', 'wf-cadena', 'e', AHORA, 'claude-opus-5-5', null)
    expect(p).toMatchObject({ tipo: 'lista', corrida: { clave_idempotencia: 't1:v1:c0:rmanual-20261013t035600', intento: 1 } })
  })
  it('🔴 un permiso de OTRA llave base (otra tanda) no sirve', async () => {
    const { al, id } = await conCaidas(0)
    const c = al.campanas[0]
    al.config.set(CLAVE_DE_LA_LIBRETA_DE_REINTENTOS, [{ campana_id: id, paso: 'calendario', clave_agotada: 't2:v1:c0', llave: 't2:v1:c0:rmanual-x', quien: 'q', por_que: 'p', cuando: AHORA }])
    for (const t of [T1, T2, T3]) {
      const r = await prepararCorrida(al, c, 'calendario', 't1:v1:c0', 'wf-cadena', 'e', t, 'claude-opus-5-5', null)
      if (r.tipo === 'lista') await al.cerrarCorrida(r.corrida.id, { estado: 'fallida', costo_usd: 0.2 })
    }
    expect((await prepararCorrida(al, c, 'calendario', 't1:v1:c0', 'wf-cadena', 'e', AHORA, 'claude-opus-5-5', null)).tipo).toBe('intentos_agotados')
  })
})

describe('lo que sobrevivía a mis sabotajes (r4, r5, m6, m13)', () => {
  const fallar = async (al: AlmacenMemoria, paso: 'estrategia' | 'fichas', clave: string, tiempos: string[]) => {
    for (const t of tiempos) {
      const r = await prepararCorrida(al, al.campanas[0], paso, clave, 'wf-cadena', 'e', t, 'claude-opus-5-5', null)
      expect(r.tipo).toBe('lista')
      if (r.tipo === 'lista') await al.cerrarCorrida(r.corrida.id, { estado: 'fallida', costo_usd: 0.1 })
    }
  }
  it('🔴 r4 · un permiso de la ESTRATEGIA no sirve a las FICHAS aunque compartan la llave base `v1:c0`', async () => {
    const { al, id } = await conCaidas(3)
    await pedir(al, { campana_id: id })
    await fallar(al, 'fichas', 'v1:c0', [T1, T2, T3])
    expect((await prepararCorrida(al, al.campanas[0], 'fichas', 'v1:c0', 'wf-cadena', 'e', AHORA, 'claude-opus-5-5', null)).tipo).toBe('intentos_agotados')
  })
  it('🔴 r5 · con dos permisos, vale el ÚLTIMO (el primero ya gastó sus 3)', async () => {
    const { al, id } = await conCaidas(3)
    await pedir(al, { campana_id: id })
    await fallar(al, 'estrategia', 'v1:c0', ['2026-10-13T03:57:00Z', '2026-10-13T04:05:00Z', '2026-10-13T04:20:00Z'])
    await reintentarAhora(al, { ...OPERADOR, campana_id: id, paso: 'estrategia', quien: 'CC7', por_que: 'segunda' }, '2026-10-13T04:31:00Z')
    expect(libreta(al)).toHaveLength(2)
    const r = await prepararCorrida(al, al.campanas[0], 'estrategia', 'v1:c0', 'wf-cadena', 'e', '2026-10-13T04:32:00Z', 'claude-opus-5-5', null)
    expect(r).toMatchObject({ tipo: 'lista', corrida: { clave_idempotencia: 'v1:c0:rmanual-20261013t043100', intento: 1 } })
  })
  it('🔴 m6 · un paso que ya terminó bien (2 caídas y 1 ok) no se reabre: 409 y nada anotado', async () => {
    const { al, id } = await conCaidas(2)
    const r = await prepararCorrida(al, al.campanas[0], 'estrategia', 'v1:c0', 'wf-cadena', 'e', T3, 'claude-opus-5-5', null)
    if (r.tipo === 'lista') await al.cerrarCorrida(r.corrida.id, { estado: 'ok', costo_usd: 0.3 })
    expect((await pedir(al, { campana_id: id })).cuerpo).toMatchObject({ code: 'E-REINTENTO-YA-HECHO' })
    expect(libreta(al)).toEqual([])
  })
  it('🔴 m13 · la llave agotada es la de la ÚLTIMA corrida: la ronda 0 terminó bien, la ronda 1 se agotó → el permiso es para `v1:c1`', async () => {
    const { al, id } = await conCaidas(0)
    const r = await prepararCorrida(al, al.campanas[0], 'estrategia', 'v1:c0', 'wf-cadena', 'e', T1, 'claude-opus-5-5', null)
    if (r.tipo === 'lista') await al.cerrarCorrida(r.corrida.id, { estado: 'ok', costo_usd: 0.3 })
    await fallar(al, 'estrategia', 'v1:c1', [T1, T2, T3])
    expect((await pedir(al, { campana_id: id })).cuerpo).toMatchObject({ ok: true, permiso: { clave_agotada: 'v1:c1', llave: 'v1:c1:rmanual-20261013t035600' } })
  })
})

describe('🟡 CC6 04:09Z · varias llaves a la vez en el mismo paso (fechas, tandas)', () => {
  const corre = async (al: AlmacenMemoria, clave: string, t: string, estado: 'fallida' | 'ok') => {
    const r = await prepararCorrida(al, al.campanas[0], 'fechas', clave, 'wf-cadena', 'e', t, 'claude-opus-5-5', null)
    expect(r.tipo).toBe('lista')
    if (r.tipo === 'lista') await al.cerrarCorrida(r.corrida.id, { estado, costo_usd: 0.1 })
  }
  const pedirFechas = (al: AlmacenMemoria, id: string, extra: Record<string, unknown> = {}) => reintentarAhora(al, { ...OPERADOR, campana_id: id, paso: 'fechas', quien: 'CC7', por_que: 'p', ...extra }, AHORA)
  it('🔴 la sonda de CC6: feriado agotado y DESPUÉS fecha_comercial ok → el permiso es para el feriado, y el preparar del feriado lo usa', async () => {
    const { al, id } = await conCaidas(0)
    for (const t of [T1, T2, T3]) await corre(al, 'f:feriado:pais:2026', t, 'fallida')
    await corre(al, 'f:fecha_comercial:pais:2026', '2026-10-13T01:50:00Z', 'ok')
    const r = await pedirFechas(al, id)
    expect(r.cuerpo).toMatchObject({ ok: true, permiso: { clave_agotada: 'f:feriado:pais:2026', llave: 'f:feriado:pais:2026:rmanual-20261013t035600' } })
    const p = await prepararCorrida(al, al.campanas[0], 'fechas', 'f:feriado:pais:2026', 'wf-cadena', 'e', AHORA, 'claude-opus-5-5', null)
    expect(p).toMatchObject({ tipo: 'lista', corrida: { clave_idempotencia: 'f:feriado:pais:2026:rmanual-20261013t035600', intento: 1 } })
  })
  it('🔴 dos llaves agotadas: sin `clave`, 409 con la lista y nada anotado; con `clave`, esa', async () => {
    const { al, id } = await conCaidas(0)
    for (const t of [T1, T2, T3]) await corre(al, 'f:feriado:pais:2026', t, 'fallida')
    for (const t of [T1, T2, T3]) await corre(al, 'f:fecha_comercial:pais:2026', t, 'fallida')
    const sin = await pedirFechas(al, id)
    expect(sin.cuerpo).toMatchObject({ code: 'E-REINTENTO-ELEGIR-CLAVE' })
    expect(JSON.stringify(sin.cuerpo)).toContain('f:feriado:pais:2026')
    expect(libreta(al)).toEqual([])
    expect((await pedirFechas(al, id, { clave: 'f:fecha_comercial:pais:2026' })).cuerpo).toMatchObject({ ok: true, permiso: { clave_agotada: 'f:fecha_comercial:pais:2026' } })
  })
  it('🔴 k3 · una llave que usó sus 3 intentos pero terminó BIEN no cuenta como agotada: sin `clave`, el permiso va a la otra', async () => {
    const { al, id } = await conCaidas(0)
    for (const t of [T1, T2, T3]) await corre(al, 'f:feriado:pais:2026', t, 'fallida')
    await corre(al, 'f:fecha_comercial:pais:2026', T1, 'fallida')
    await corre(al, 'f:fecha_comercial:pais:2026', T2, 'fallida')
    await corre(al, 'f:fecha_comercial:pais:2026', T3, 'ok')
    expect((await pedirFechas(al, id)).cuerpo).toMatchObject({ ok: true, permiso: { clave_agotada: 'f:feriado:pais:2026' } })
  })
  it('🔴 m13 · sin ninguna agotada manda la ÚLTIMA corrida: ronda 0 ok, ronda 1 con 1 caída → «no agotado» (no «ya hecho»)', async () => {
    const { al, id } = await conCaidas(0)
    const r = await prepararCorrida(al, al.campanas[0], 'estrategia', 'v1:c0', 'wf-cadena', 'e', T1, 'claude-opus-5-5', null)
    if (r.tipo === 'lista') await al.cerrarCorrida(r.corrida.id, { estado: 'ok', costo_usd: 0.3 })
    const r2 = await prepararCorrida(al, al.campanas[0], 'estrategia', 'v1:c1', 'wf-cadena', 'e', T2, 'claude-opus-5-5', null)
    if (r2.tipo === 'lista') await al.cerrarCorrida(r2.corrida.id, { estado: 'fallida', costo_usd: 0.3 })
    expect((await pedir(al, { campana_id: id })).cuerpo).toMatchObject({ code: 'E-REINTENTO-NO-AGOTADO', llave: 'v1:c1' })
  })
  it('🔴 `clave` que el paso no tiene: 409; `clave` de una llave ya ok: 409 ya hecho', async () => {
    const { al, id } = await conCaidas(0)
    for (const t of [T1, T2, T3]) await corre(al, 'f:feriado:pais:2026', t, 'fallida')
    await corre(al, 'f:fecha_comercial:pais:2026', '2026-10-13T01:50:00Z', 'ok')
    expect((await pedirFechas(al, id, { clave: 'f:otra:pais:2026' })).cuerpo).toMatchObject({ code: 'E-REINTENTO-CLAVE' })
    expect((await pedirFechas(al, id, { clave: 'f:fecha_comercial:pais:2026' })).cuerpo).toMatchObject({ code: 'E-REINTENTO-YA-HECHO' })
    expect(libreta(al)).toEqual([])
  })
})

describe('lo que sobrevivía a los sabotajes de CC6 (s3, s17, s18, n2)', () => {
  it('🔴 s3 · cerrada y reemplazada: 409 y nada anotado', async () => {
    for (const estado of ['cerrada', 'reemplazada'] as const) {
      const { al, id } = await conCaidas(3)
      al.campanas[0].estado = estado
      expect((await pedir(al, { campana_id: id })).cuerpo).toMatchObject({ code: 'E-REINTENTO-ESTADO' })
      expect(libreta(al)).toEqual([])
    }
  })
  it('🔴 s17 · la compuerta de la cadena: campaña de verdad (no seco) con la cadena apagada → 409 y nada anotado', async () => {
    const { al, id } = await conCaidas(3)
    al.campanas[0].seco = false
    al.config.set('estado_cadena', 'apagada')
    expect((await pedir(al, { campana_id: id })).cuerpo).toMatchObject({ code: 'E-CADENA-APAGADA' })
    expect(libreta(al)).toEqual([])
  })
  it('🔴 s18 · la libreta se escribe con sello: si otro escribe a la vez dos veces seguidas, 409 E-LIBRETA-OCUPADA y no pisa lo ajeno', async () => {
    const { al, id } = await conCaidas(3)
    const ajeno = { campana_id: 'otra', paso: 'estrategia', clave_agotada: 'v1:c0', llave: 'v1:c0:rmanual-x', quien: 'otro', por_que: 'p', cuando: AHORA }
    al.config.set(CLAVE_DE_LA_LIBRETA_DE_REINTENTOS, [ajeno])
    const original = al.escribirConfigSiSello.bind(al)
    let llamadas = 0
    al.escribirConfigSiSello = async () => { llamadas++; return false }
    expect((await pedir(al, { campana_id: id })).cuerpo).toMatchObject({ code: 'E-LIBRETA-OCUPADA' })
    expect(llamadas).toBe(2)
    expect(libreta(al)).toEqual([ajeno])
    al.escribirConfigSiSello = original
    expect((await pedir(al, { campana_id: id })).status).toBe(200)
    expect(libreta(al)).toHaveLength(2)
    expect(libreta(al)[0]).toEqual(ajeno)
  })
  it('🔴 n2 · un permiso de OTRA campaña con la misma llave base (`v1:c0`, la de todas) no sirve', async () => {
    const { al, id } = await conCaidas(3)
    al.config.set(CLAVE_DE_LA_LIBRETA_DE_REINTENTOS, [{ campana_id: 'otra-campana', paso: 'estrategia', clave_agotada: 'v1:c0', llave: 'v1:c0:rmanual-20261013t030000', quien: 'CC7', por_que: 'p', cuando: AHORA }])
    expect(await estrategiaPreparar(al, { ...wf('ex-9'), campana_id: id }, AHORA)).toMatchObject({ status: 409, cuerpo: { error: 'intentos_agotados' } })
    expect((await pedir(al, { campana_id: id })).cuerpo).toMatchObject({ ok: true, permiso: { campana_id: id } })
    expect((await pedir(al, { campana_id: id })).cuerpo.ya_estaba).toBe(true)
  })
})

describe('n6 (CC6 04:18Z) · una libreta mezclada', () => {
  it('🔴 los permisos con campos que no son texto (o que no son objetos) se descartan: el preparar usa el válido, aunque los malos vengan después', async () => {
    const { al, id } = await conCaidas(3)
    const valido = { campana_id: id, paso: 'estrategia', clave_agotada: 'v1:c0', llave: 'v1:c0:rmanual-20261013t035000', quien: 'CC7', por_que: 'p', cuando: AHORA }
    al.config.set(CLAVE_DE_LA_LIBRETA_DE_REINTENTOS, [
      valido,
      { ...valido, llave: 5 },
      { ...valido, quien: null },
      { ...valido, por_que: undefined },
      null, 'texto suelto', 7,
    ])
    const p = await estrategiaPreparar(al, { ...wf('ex-9'), campana_id: id }, AHORA)
    expect(p.status).toBe(200)
    expect(al.corridas.find((x) => x.id === p.cuerpo.corrida_id)).toMatchObject({ clave_idempotencia: 'v1:c0:rmanual-20261013t035000', intento: 1 })
  })
  it('🔴 y la ruta, con esa libreta, devuelve el válido como `ya_estaba`', async () => {
    const { al, id } = await conCaidas(3)
    const valido = { campana_id: id, paso: 'estrategia', clave_agotada: 'v1:c0', llave: 'v1:c0:rmanual-20261013t035000', quien: 'CC7', por_que: 'p', cuando: AHORA }
    al.config.set(CLAVE_DE_LA_LIBRETA_DE_REINTENTOS, [valido, { ...valido, llave: 5 }, null])
    expect((await pedir(al, { campana_id: id })).cuerpo).toMatchObject({ ok: true, ya_estaba: true, permiso: { llave: 'v1:c0:rmanual-20261013t035000' } })
  })
})

describe('las piezas puras', () => {
  it('la llave manual: la base + «:rmanual-» + la hora UTC sin separadores; la base sale quitando el reintento', () => {
    expect(llaveDeReintentoManual('v1:c0', '2026-11-21T04:05:09.123Z')).toBe('v1:c0:rmanual-20261121t040509')
    expect(baseDeLaLlave('v1:c0:rmanual-20261121t040509')).toBe('v1:c0')
    expect(baseDeLaLlave('t3:v1:c2:r2026-11-21am')).toBe('t3:v1:c2')
    expect(baseDeLaLlave('v1:c0')).toBe('v1:c0')
  })
  it('estadoDeLaLlave: base con intentos libre; base agotada en el mismo tramo agotada; en el tramo siguiente, la del tramo con intento 1', () => {
    const tres = [T1, T2, T3].map((t) => ({ clave_idempotencia: 'v1:c0', creada_en: t }))
    expect(estadoDeLaLlave(tres.slice(0, 2), 'v1:c0', AHORA)).toEqual({ llave: 'v1:c0', intento: 3, agotada: false })
    expect(estadoDeLaLlave(tres, 'v1:c0', AHORA)).toEqual({ llave: 'v1:c0:r2026-10-13am', intento: 1, agotada: true })
    expect(estadoDeLaLlave(tres, 'v1:c0', '2026-10-13T12:00:00Z')).toEqual({ llave: 'v1:c0:r2026-10-13pm', intento: 1, agotada: false })
  })
})
