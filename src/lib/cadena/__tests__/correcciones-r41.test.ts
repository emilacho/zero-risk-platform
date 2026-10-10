/**
 * Relevo 41 · correcciones de la certificación de CC#3 sobre #464 (rutas + almacén) y los huecos de mutación que listó como comportamiento real.
 * Todo contra el almacén en memoria: US$ 0, sin base, sin red, sin modelo. Cliente sintético.
 */
import { describe, it, expect } from 'vitest'
import {
  abrirCampana, avanzarCampana, estrategiaPreparar, estrategiaGuardar, filasLotes, filasMarcar, relojDeLaCadena, validarSinEscribir, costoEfectivo, topeDelPaso, expiresInHours,
  type Estrategia,
} from '../index'
import { finDelDiaEnZona } from '../esperas'
import { prepararCorrida, resolverEsperas, abrirEsperaDe } from '../nucleo'
import { plazoDeLlamadaMinutos, PLAZO_DE_LLAMADA_POR_DEFECTO_MIN, MAXIMO_DE_INTENTOS } from '../constantes'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe, tandaBuena } from '../__fixtures__/clientes'
import { calendarioGuardar, calendarioPreparar } from '../pasos'
import type { Campana } from '../almacen'
import type { Fila } from '../tipos'

const A = clienteA()
const AHORA = '2026-10-09T12:00:00Z'
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', ...extra })
function almacen(extra: Partial<ConstructorParameters<typeof AlmacenMemoria>[0]> = {}, planes = [{ plan_id: 'plan-1', fecha: '2026-10-08' }]) {
  return new AlmacenMemoria({
    contextos: { [A.clientId]: contextoDe(A) }, planes: { [A.clientId]: planes },
    config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta' }, journeys: [{ journeyId: 'journey-1', clientId: A.clientId }], ...extra,
  })
}
const abrir = (al: AlmacenMemoria, extra: Record<string, unknown> = {}) => abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true, ...extra }, AHORA)
const idDe = (r: { cuerpo: Record<string, unknown> }) => (r.cuerpo.campana as { id: string }).id
const ok = (x: unknown, costo = 0.3) => ({ success: true, structured_output: x, cost_usd: costo })
async function conEstrategia(al: AlmacenMemoria, e: Estrategia = A.estrategia) {
  const id = idDe(await abrir(al))
  const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
  await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: ok(e) }, AHORA)
  return id
}
async function activa(al: AlmacenMemoria) {
  const id = await conEstrategia(al)
  const p = await calendarioPreparar(al, { ...wf(), campana_id: id, tanda: 1 }, AHORA)
  await calendarioGuardar(al, { ...wf(), campana_id: id, tanda: 1, corrida_id: p.cuerpo.corrida_id, resultado: ok(tandaBuena(A)) }, AHORA)
  return id
}
const camp = (al: AlmacenMemoria, id: string) => al.campanas.find((c) => c.id === id) as Campana

describe('#464 C1 · dos llamadas en carrera no pagan dos veces', () => {
  it('tres preparar en paralelo con la misma clave: UNA es lista; las otras dos ven la corrida ya abierta', async () => {
    const al = almacen(); const id = idDe(await abrir(al)); const c = camp(al, id)
    const r = await Promise.all([1, 2, 3].map((n) => prepararCorrida(al, c, 'estrategia', 'v1:c0', 'wf-cadena', `ex-${n}`, AHORA, 'claude-opus-5-5', 'h')))
    expect(r.filter((x) => x.tipo === 'lista')).toHaveLength(1)
    expect(r.filter((x) => x.tipo === 'en_curso')).toHaveLength(2)
    expect(al.corridas).toHaveLength(1)
  })
  it('la perdedora de la carrera ve `ya_hecha` si la ganadora ya terminó bien', async () => {
    const al = almacen(); const id = idDe(await abrir(al)); const c = camp(al, id)
    const orig = al.abrirCorrida.bind(al)
    al.abrirCorrida = async (x) => { const ya = await orig(x); await al.cerrarCorrida(ya.corrida.id, { estado: 'ok' }); return { corrida: { ...ya.corrida, estado: 'ok' as const }, creada: false } }
    const r = await prepararCorrida(al, c, 'estrategia', 'v1:c0', 'wf-cadena', 'ex-1', AHORA, 'm', 'h')
    expect(r.tipo).toBe('ya_hecha')
  })
  it('por la ruta: dos `preparar` en paralelo → una 200 y otra 409 E-EN-CURSO (un solo pago)', async () => {
    const al = almacen(); const id = idDe(await abrir(al))
    const [a, b] = await Promise.all([estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA), estrategiaPreparar(al, { ...wf({ workflow_execution_id: 'ex-2' }), campana_id: id }, AHORA)])
    expect([a.status, b.status].sort()).toEqual([200, 409])
    expect(al.corridas).toHaveLength(1)
  })
})

describe('#464 C2 · reemplazar o cerrar una campaña cancela todas sus esperas', () => {
  it('el plan nuevo cancela las esperas vivas de la campaña reemplazada (bandeja incluida) y no toca las de la nueva', async () => {
    const al = almacen({}, [{ plan_id: 'plan-1', fecha: '2026-10-08' }, { plan_id: 'plan-2', fecha: '2026-10-09' }])
    const a = idDe(await abrir(al, { plan_id: 'plan-1' }))
    await abrirEsperaDe(al, camp(al, a), 'aprobacion_bandeja', 's1-d1-a', 'x', AHORA, { fechaPieza: '2026-10-20' })
    await abrirEsperaDe(al, camp(al, a), 'dato_en_investigacion', 's1-d2-a', 'x', AHORA)
    const b = idDe(await abrir(al, { plan_id: 'plan-2' }))
    expect(camp(al, a).estado).toBe('reemplazada')
    expect(al.esperas.filter((e) => e.campana_id === a).map((e) => e.estado)).toEqual(['cancelada', 'cancelada', 'cancelada']) // las 2 + la fecha de inicio
    expect(al.esperas.filter((e) => e.campana_id === b && e.estado === 'viva')).toHaveLength(1) // la fecha de inicio de la nueva
  })
  it('el vigía NO avisa ni vence nada de una campaña reemplazada', async () => {
    const al = almacen({ config: { estado_cadena: 'encendida', flujos: ['wf-cadena', 'wf-vigia'] } }, [{ plan_id: 'plan-1', fecha: '2026-10-08' }, { plan_id: 'plan-2', fecha: '2026-10-09' }])
    const a = idDe(await abrir(al, { plan_id: 'plan-1', seco: false }))
    await abrirEsperaDe(al, camp(al, a), 'aprobacion_bandeja', 's1-d1-a', 'x', AHORA, { fechaPieza: '2026-10-10' })
    await abrir(al, { plan_id: 'plan-2', seco: false })
    const r = await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v' }, '2026-10-20T00:00:00Z')
    expect((r.cuerpo.aplicado as string[]).join('|')).not.toContain('s1-d1-a')
    expect(JSON.stringify(r.cuerpo.alertas)).not.toContain(a)
  })
  it('cerrar una campaña cancela sus esperas vivas', async () => {
    const al = almacen(); const id = idDe(await abrir(al))
    await avanzarCampana(al, { ...wf(), campana_id: id, a: 'cerrada', motivo: 'fin' }, AHORA)
    expect(al.esperas.filter((e) => e.campana_id === id && e.estado === 'viva')).toEqual([])
  })
  it('una espera de OTRA campaña del mismo cliente no se toca al resolver (resolverEsperas acota por campaña, tipo y objeto)', async () => {
    const al = almacen(); const a = idDe(await abrir(al))
    await abrirEsperaDe(al, camp(al, a), 'dato_en_investigacion', 'f1', 'x', AHORA)
    await abrirEsperaDe(al, camp(al, a), 'dato_en_investigacion', 'f2', 'x', AHORA)
    await abrirEsperaDe(al, { id: 'camp-otra', seco: true }, 'dato_en_investigacion', 'f1', 'x', AHORA)
    await resolverEsperas(al, a, 'dato_en_investigacion', 'f1')
    const est = (c: string, o: string) => al.esperas.find((e) => e.campana_id === c && e.objeto_id === o)!.estado
    expect([est(a, 'f1'), est(a, 'f2'), est('camp-otra', 'f1')]).toEqual(['resuelta', 'viva', 'viva'])
    await resolverEsperas(al, a, 'dato_en_investigacion') // sin objeto: todas las de ESA campaña y ese tipo
    expect([est(a, 'f2'), est('camp-otra', 'f1')]).toEqual(['resuelta', 'viva'])
    await resolverEsperas(al, a, 'otro_tipo')
    expect(est('camp-otra', 'f1')).toBe('viva')
  })
})

describe('#464 C5 · bordes de abrirCampana', () => {
  const dos = [{ plan_id: 'plan-1', fecha: '2026-10-08' }, { plan_id: 'plan-2', fecha: '2026-10-09' }]
  it('reenviar el sobre de un plan YA REEMPLAZADO dice que fue reemplazado (409), no «ya abierta» con la campaña vieja', async () => {
    const al = almacen({}, dos)
    await abrir(al, { plan_id: 'plan-1' }); await abrir(al, { plan_id: 'plan-2' })
    const r = await abrir(al, { plan_id: 'plan-1' })
    expect(r.status).toBe(409)
    expect(r.cuerpo.code).toBe('E-PLAN-REEMPLAZADO')
    expect(al.campanas.filter((c) => c.estado !== 'reemplazada')).toHaveLength(1) // sigue una sola viva: la del plan nuevo
  })
  it('si la inserción de la campaña nueva falla, la anterior VUELVE a como estaba (no queda el cliente sin campaña viva)', async () => {
    const al = almacen({}, dos)
    const a = idDe(await abrir(al, { plan_id: 'plan-1' }))
    al.insertarCampana = async () => { throw new Error('la base se cayó') }
    await expect(abrir(al, { plan_id: 'plan-2' })).rejects.toThrow('la base se cayó')
    expect(camp(al, a).estado).toBe('abierta')
    expect(al.esperas.filter((e) => e.campana_id === a && e.estado === 'viva')).toHaveLength(1) // y su espera sigue viva: no se canceló nada
  })
  it('si OTRO sobre igual ganó la carrera (único del plan), la respuesta es «ya abierta», no un 500', async () => {
    const al = almacen({}, dos)
    await abrir(al, { plan_id: 'plan-1' })
    const orig = al.insertarCampana.bind(al)
    let primera = true
    al.insertarCampana = async (c) => {
      if (primera) { primera = false; await orig(c); throw Object.assign(new Error('duplicate key value violates unique constraint "cadena_campanas_un_plan"'), { code: '23505' }) }
      return orig(c)
    }
    const r = await abrir(al, { plan_id: 'plan-2' })
    expect(r.status).toBe(200)
    expect(r.cuerpo.ya_abierta).toBe(true)
    expect(al.campanas.filter((c) => c.estado !== 'reemplazada')).toHaveLength(1)
  })
})

describe('#464 C3 · el reloj de la bandeja tiene quien lo abre', () => {
  async function conLote() {
    const al = almacen({ config: { estado_cadena: 'encendida', flujos: ['wf-cadena', 'wf-vigia'] } })
    const id = await activa(al)
    camp(al, id).seco = true
    await filasMarcar(al, { ...wf(), campana_id: id, estado: 'lista_para_brief', fila_ids: ['s1-d1-a'] }, AHORA)
    return { al, id }
  }
  it('marcar `briefeada` abre la espera `aprobacion_bandeja` con reloj hasta el final del día de la pieza, y devuelve expires_in_hours', async () => {
    const { al, id } = await conLote()
    const r = await filasMarcar(al, { ...wf(), campana_id: id, estado: 'briefeada', fila_ids: ['s1-d1-a'] }, AHORA)
    expect(r.status).toBe(200)
    const e = al.esperas.find((x) => x.objeto_tipo === 'aprobacion_bandeja' && x.objeto_id === 's1-d1-a')!
    expect(e).toMatchObject({ estado: 'viva', accion_al_vencer: 'perdio_su_fecha', campana_id: id })
    expect(Date.parse(e.vence_en)).toBe(finDelDiaEnZona('2026-10-12', camp(al, id).zona_horaria))
    const h = (r.cuerpo.expires_in_hours as Record<string, number>)['s1-d1-a']
    expect(h).toBe(expiresInHours(AHORA, '2026-10-12', 72, camp(al, id).zona_horaria))
    expect(h).toBeGreaterThan(72) // la alerta de 72 h sale ANTES de que el ítem caduque
  })
  it('marcar otra cosa no devuelve expires_in_hours ni abre esperas de bandeja', async () => {
    const { al, id } = await conLote()
    const r = await filasMarcar(al, { ...wf(), campana_id: id, estado: 'cancelada', fila_ids: ['s1-d1-a'] }, AHORA)
    expect(r.cuerpo.expires_in_hours).toBeUndefined()
    expect(al.esperas.some((e) => e.objeto_tipo === 'aprobacion_bandeja')).toBe(false)
  })
  it('de punta a punta: briefeada → nadie aprueba → el vigía la marca `perdio_su_fecha` (y nunca `aprobada`)', async () => {
    const { al, id } = await conLote()
    await filasMarcar(al, { ...wf(), campana_id: id, estado: 'briefeada', fila_ids: ['s1-d1-a'] }, AHORA)
    const r = await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v', seco: true }, '2026-10-14T00:00:00Z')
    expect(r.cuerpo.aplicado).toContain('s1-d1-a perdió su fecha')
    expect((await al.filas(id)).find((f) => f.id === 's1-d1-a')!.estado).toBe('perdio_su_fecha')
    expect((await al.filas(id)).some((f) => f.estado === 'aprobada')).toBe(false)
  })
  it('si Emilio aprueba a tiempo la espera se resuelve y el vigía no la pierde', async () => {
    const { al, id } = await conLote()
    await filasMarcar(al, { ...wf(), campana_id: id, estado: 'briefeada', fila_ids: ['s1-d1-a'] }, AHORA)
    await filasMarcar(al, { ...wf(), campana_id: id, estado: 'en_oficina', fila_ids: ['s1-d1-a'] }, AHORA)
    expect(al.esperas.find((x) => x.objeto_tipo === 'aprobacion_bandeja')!.estado).toBe('viva') // en la oficina sigue esperando la bandeja
    await filasMarcar(al, { ...wf(), campana_id: id, estado: 'aprobada', fila_ids: ['s1-d1-a'] }, AHORA)
    expect(al.esperas.find((x) => x.objeto_tipo === 'aprobacion_bandeja')!.estado).toBe('resuelta')
    const r = await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v', seco: true }, '2026-10-14T00:00:00Z')
    expect((r.cuerpo.aplicado as string[]).join('|')).not.toContain('s1-d1-a')
    expect((await al.filas(id)).find((f) => f.id === 's1-d1-a')!.estado).toBe('aprobada')
  })
  it('una fila briefeada dos veces no duplica la espera (dedup)', async () => {
    const { al, id } = await conLote()
    await filasMarcar(al, { ...wf(), campana_id: id, estado: 'briefeada', fila_ids: ['s1-d1-a'] }, AHORA)
    await abrirEsperaDe(al, camp(al, id), 'aprobacion_bandeja', 's1-d1-a', 'x', AHORA, { fechaPieza: '2026-10-12', zona: camp(al, id).zona_horaria })
    expect(al.esperas.filter((x) => x.objeto_tipo === 'aprobacion_bandeja')).toHaveLength(1)
  })
})

describe('#459 menor · «el final del día de la pieza» es el de la zona de la campaña', () => {
  it('Guayaquil (UTC−5): el día 2026-10-09 termina a las 04:59:59 UTC del 10; sin zona, como antes (UTC)', () => {
    expect(new Date(finDelDiaEnZona('2026-10-09', 'America/Guayaquil')).toISOString()).toBe('2026-10-10T04:59:59.000Z')
    expect(new Date(finDelDiaEnZona('2026-10-09')).toISOString()).toBe('2026-10-09T23:59:59.000Z')
    expect(new Date(finDelDiaEnZona('2026-10-09', null)).toISOString()).toBe('2026-10-09T23:59:59.000Z')
  })
  it('una zona al este de UTC adelanta el final; una zona inexistente cae a UTC sin romper', () => {
    expect(new Date(finDelDiaEnZona('2026-10-09', 'Asia/Tokyo')).toISOString()).toBe('2026-10-09T14:59:59.000Z')
    expect(new Date(finDelDiaEnZona('2026-10-09', 'No/Existe')).toISOString()).toBe('2026-10-09T23:59:59.000Z')
  })
  it('cruce de horario de verano: el final del día usa el desfase de ESE día', () => {
    expect(new Date(finDelDiaEnZona('2026-07-01', 'America/New_York')).toISOString()).toBe('2026-07-02T03:59:59.000Z')
    expect(new Date(finDelDiaEnZona('2026-01-15', 'America/New_York')).toISOString()).toBe('2026-01-16T04:59:59.000Z')
  })
})

describe('#464 C4 · plazo de la llamada alineado con el nodo (290 s)', () => {
  it('el plazo por defecto es de 6 min (nodo 290 s + margen), no 15', async () => {
    expect(PLAZO_DE_LLAMADA_POR_DEFECTO_MIN).toBe(6)
    const al = new AlmacenMemoria(); al.config.delete('plazo_llamada_agente_minutos')
    expect(await plazoDeLlamadaMinutos(al)).toBe(6)
    al.config.set('plazo_llamada_agente_minutos', 9)
    expect(await plazoDeLlamadaMinutos(al)).toBe(9)
    for (const malo of [0, -3, 'x', null]) { al.config.set('plazo_llamada_agente_minutos', malo); expect(await plazoDeLlamadaMinutos(al)).toBe(6) }
  })
  it('una corrida perdida deja de bloquear al pasar su plazo de 6 min: el siguiente preparar abre el intento 2', async () => {
    const al = almacen(); const id = idDe(await abrir(al))
    await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
    expect((await estrategiaPreparar(al, { ...wf({ workflow_execution_id: 'e2' }), campana_id: id }, '2026-10-09T12:05:00Z')).status).toBe(409)
    const r = await estrategiaPreparar(al, { ...wf({ workflow_execution_id: 'e3' }), campana_id: id }, '2026-10-09T12:07:00Z')
    expect(r.status).toBe(200)
    expect(r.cuerpo.intento).toBe(2)
  })
})

describe('D3 · el léxico de afirmaciones viaja por cadena_config hasta el validador', () => {
  it('un patrón agregado en cadena_config hace bloquear una afirmación que la base del idioma no conoce (sin publicar)', async () => {
    const al = almacen(); const id = await conEstrategia(al)
    const tema = 'Si no te gusta, devolvemos tu dinero'
    const pieza = tandaBuena(A).piezas[0]
    const cuerpo = { ...wf(), campana_id: id, tanda: 1, tipo: 'calendario', tanda_agente: { ajustes_al_patron: [], piezas: [{ ...pieza, tema }] } }
    const sin = await validarSinEscribir(al, cuerpo, AHORA)
    expect((sin.cuerpo.hallazgos as { ficha: { que: string } }[]).some((h) => h.ficha.que.includes('devolvemos tu dinero'))).toBe(false)
    al.config.set('lexico_afirmaciones', { patrones: [{ subtipo: 'garantia', re: 'devolvemos tu dinero' }] })
    const con = await validarSinEscribir(al, cuerpo, AHORA)
    expect((con.cuerpo.hallazgos as { ficha: { que: string } }[]).some((h) => h.ficha.que.includes('devolvemos tu dinero'))).toBe(true)
  })
})

describe('huecos de mutación de CC#3 · comportamiento real que no tenía prueba', () => {
  it('costoEfectivo: el costo medido manda; sin medida, solo un cierre MALO cuenta el tope; ok con 0 cuesta 0; cada paso su tope', () => {
    expect(costoEfectivo({ costo_usd: 0.31, estado: 'fallida', paso: 'estrategia' })).toBe(0.31)
    for (const estado of ['fallida', 'vencida', 'cerrada_por_tope'] as const) expect(costoEfectivo({ costo_usd: 0, estado, paso: 'calendario' })).toBe(topeDelPaso('calendario'))
    expect(costoEfectivo({ costo_usd: null, estado: 'fallida', paso: 'fechas' })).toBe(topeDelPaso('fechas'))
    for (const estado of ['ok', 'en_curso'] as const) expect(costoEfectivo({ costo_usd: 0, estado, paso: 'brief' })).toBe(0)
    expect(costoEfectivo({ costo_usd: null, estado: 'ok', paso: 'brief' })).toBe(0)
    expect(costoEfectivo({ costo_usd: -1, estado: 'ok', paso: 'brief' })).toBe(0)
  })
  it('numeración de intentos por clave: cada clave cuenta aparte; la misma clave sube 1, 2, 3 y el cuarto no abre', async () => {
    const al = almacen(); const id = idDe(await abrir(al)); const c = camp(al, id)
    camp(al, id).presupuesto_planificacion_usd = 100
    const p = (clave: string, n: number, t = AHORA) => prepararCorrida(al, c, 'estrategia', clave, 'wf-cadena', `ex-${n}`, t, 'm', 'h')
    const a1 = await p('A', 1); expect(a1.tipo === 'lista' && a1.corrida.intento).toBe(1)
    const b1 = await p('B', 2); expect(b1.tipo === 'lista' && b1.corrida.intento).toBe(1) // otra clave: empieza en 1
    if (a1.tipo === 'lista') await al.cerrarCorrida(a1.corrida.id, { estado: 'fallida' })
    const a2 = await p('A', 3); expect(a2.tipo === 'lista' && a2.corrida.intento).toBe(2)
    if (a2.tipo === 'lista') await al.cerrarCorrida(a2.corrida.id, { estado: 'fallida' })
    const a3 = await p('A', 4); expect(a3.tipo === 'lista' && a3.corrida.intento).toBe(3)
    if (a3.tipo === 'lista') await al.cerrarCorrida(a3.corrida.id, { estado: 'fallida' })
    expect((await p('A', 5)).tipo).toBe('intentos_agotados')
    expect(MAXIMO_DE_INTENTOS).toBe(3)
    expect(al.corridas.filter((x) => x.clave_idempotencia === 'B')).toHaveLength(1) // lo de A no tocó a B
  })
  it('una corrida de otro PASO con la misma clave no cuenta como intento', async () => {
    const al = almacen(); const id = idDe(await abrir(al)); const c = camp(al, id)
    const e = await prepararCorrida(al, c, 'estrategia', 'K', 'wf-cadena', 'e1', AHORA, 'm', 'h')
    if (e.tipo === 'lista') await al.cerrarCorrida(e.corrida.id, { estado: 'fallida' })
    const f = await prepararCorrida(al, c, 'fechas', 'K', 'wf-cadena', 'e2', AHORA, 'm', 'h')
    expect(f.tipo === 'lista' && f.corrida.intento).toBe(1)
  })
  it('una campaña NUEVA nace sin autoproducir (el brief no se produce solo)', async () => {
    const al = almacen(); const r = await abrir(al)
    expect((r.cuerpo.campana as Campana).autoproducir).toBe(false)
  })
  it('/validar: `bloquea` dice true con un bloqueo y false sin él (no al revés), y no escribe nada', async () => {
    const al = almacen(); const id = await conEstrategia(al)
    const buena = tandaBuena(A)
    const base = { ...wf(), campana_id: id, tipo: 'calendario', tanda: 1 }
    const limpio = await validarSinEscribir(al, { ...base, tanda_agente: buena }, AHORA)
    const malo = await validarSinEscribir(al, { ...base, tanda_agente: { ...buena, piezas: buena.piezas.map((p, i) => (i === 0 ? { ...p, red: 'red-inexistente' } : p)) } }, AHORA)
    expect(limpio.cuerpo.bloquea).toBe(false)
    expect(malo.cuerpo.bloquea).toBe(true)
    expect(al.validaciones).toHaveLength(1) // solo la de guardar la estrategia: validar no escribió
  })
  it('/validar de una estrategia: forma_valida y bloquea coherentes', async () => {
    const al = almacen(); const id = idDe(await abrir(al))
    const bien = await validarSinEscribir(al, { ...wf(), campana_id: id, tipo: 'estrategia', estrategia: A.estrategia }, AHORA)
    expect(bien.cuerpo.forma_valida).toBe(true)
    expect(bien.cuerpo.bloquea).toBe(false)
    const mal = await validarSinEscribir(al, { ...wf(), campana_id: id, tipo: 'estrategia', estrategia: { canales: 'no' } }, AHORA)
    expect(mal.cuerpo.forma_valida).toBe(false)
    expect(mal.cuerpo.bloquea).toBe(true)
  })
  it('el vigía exige AMBOS ids (workflow_id y workflow_execution_id); con uno solo, 400', async () => {
    const al = almacen({ config: { estado_cadena: 'encendida', flujos: ['wf-vigia'] } })
    expect((await relojDeLaCadena(al, { workflow_id: 'wf-vigia' }, AHORA)).status).toBe(400)
    expect((await relojDeLaCadena(al, { workflow_execution_id: 'x' }, AHORA)).status).toBe(400)
    expect((await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'x' }, AHORA)).status).toBe(200)
  })
  it('lotes: el lead de cada formato manda (la historia se briefea 2 días antes; el carrusel, 4) y lo pasado de fecha no sale', async () => {
    const al = almacen(); const id = await activa(al); const c = camp(al, id)
    c.estado = 'activa'
    const mk = (id2: string, fecha: string, red: string, formato: string): Fila & { campana_id: string; calendario_version: number } => ({
      id: id2, tanda: 1, semana: 1, dia_semana: 1, fecha, hora: '10:00', red, formato, pilar: 'p', tema: 't', sede: null, requiere_abierto: false, depende_de: [], datos: [], pendientes: [], pieza_fija: null, origen: 'agente', estado: 'validada', avisos: [], campana_id: id, calendario_version: 1,
    })
    al.filasGuardadas.splice(0, al.filasGuardadas.length, mk('hist', '2026-11-20', 'instagram', 'historia'), mk('carr', '2026-11-20', 'instagram', 'carrusel'), { ...mk('video', '2026-11-20', 'instagram', 'reel'), estado: 'espera_video' as const }, mk('pasada', '2026-11-01', 'instagram', 'foto'))
    al.config.set('holgura_dias', 0)
    const salen = async (hoy: string) => ((await filasLotes(al, { ...wf(), campana_id: id, hoy }, AHORA)).cuerpo.lotes as { fila_ids: string[] }[]).flatMap((l) => l.fila_ids).sort()
    expect(await salen('2026-11-15')).toEqual([])
    expect(await salen('2026-11-16')).toEqual(['carr']) // 20 − 4
    expect(await salen('2026-11-17')).toEqual(['carr'])
    expect(await salen('2026-11-18')).toEqual(['carr', 'hist']) // 20 − 2
    expect(await salen('2026-11-21')).toEqual([]) // ya pasó
  })
  it('lotes: un formato desconocido usa el lead de 3 días y la holgura de la config se suma', async () => {
    const al = almacen(); const id = await activa(al); camp(al, id).estado = 'activa'
    al.filasGuardadas.splice(0, al.filasGuardadas.length, { id: 'x', tanda: 1, semana: 1, dia_semana: 1, fecha: '2026-11-20', hora: null, red: 'red-x', formato: 'formato-x', pilar: null, tema: 't', sede: null, requiere_abierto: false, depende_de: [], datos: [], pendientes: [], pieza_fija: null, origen: 'agente', estado: 'validada', avisos: [], campana_id: id, calendario_version: 1 })
    const salen = async (hoy: string) => ((await filasLotes(al, { ...wf(), campana_id: id, hoy }, AHORA)).cuerpo.lotes as { fila_ids: string[] }[]).flatMap((l) => l.fila_ids)
    al.config.set('holgura_dias', 2)
    expect(await salen('2026-11-14')).toEqual([])
    expect(await salen('2026-11-15')).toEqual(['x']) // 20 − (3 + 2)
    al.config.delete('holgura_dias') // por defecto 3: 20 − (3 + 3) = 14
    expect(await salen('2026-11-13')).toEqual([])
    expect(await salen('2026-11-14')).toEqual(['x'])
  })
})

describe('mutantes vivos de la 1.ª corrida del mutador sobre #464 (relevo 41)', () => {
  it('presupuesto: gastar EXACTAMENTE lo que queda se permite; un centavo menos, no', async () => {
    const al = almacen(); const id = idDe(await abrir(al)); const c = camp(al, id)
    const tope = topeDelPaso('estrategia')
    c.presupuesto_planificacion_usd = tope
    expect((await prepararCorrida(al, c, 'estrategia', 'P1', 'wf-cadena', 'e1', AHORA, 'm', 'h')).tipo).toBe('lista')
    const al2 = almacen(); const id2 = idDe(await abrir(al2)); const c2 = camp(al2, id2)
    c2.presupuesto_planificacion_usd = tope - 0.01
    expect((await prepararCorrida(al2, c2, 'estrategia', 'P1', 'wf-cadena', 'e1', AHORA, 'm', 'h')).tipo).toBe('presupuesto_agotado')
  })
  it('avanzar exige campana_id Y a: con uno solo, 400', async () => {
    const al = almacen(); const id = idDe(await abrir(al))
    expect((await avanzarCampana(al, { ...wf(), campana_id: id }, AHORA)).status).toBe(400)
    expect((await avanzarCampana(al, { ...wf(), a: 'estrategia' }, AHORA)).status).toBe(400)
  })
  it('un error de la base con código 23505 y cualquier mensaje es «el otro sobre ganó»; un error SIN ese código se propaga', async () => {
    const dos = [{ plan_id: 'plan-1', fecha: '2026-10-08' }, { plan_id: 'plan-2', fecha: '2026-10-09' }]
    const al = almacen({}, dos); const a = idDe(await abrir(al, { plan_id: 'plan-1' }))
    const orig = al.insertarCampana.bind(al)
    al.insertarCampana = async (c) => { await orig(c); throw Object.assign(new Error('boom'), { code: '23505' }) }
    expect((await abrir(al, { plan_id: 'plan-2' })).cuerpo.ya_abierta).toBe(true)
    const al2 = almacen({}, dos); const a2 = idDe(await abrir(al2, { plan_id: 'plan-1' }))
    al2.insertarCampana = async () => { throw Object.assign(new Error('otra cosa'), { code: '08006' }) }
    await expect(abrir(al2, { plan_id: 'plan-2' })).rejects.toThrow('otra cosa')
    expect(camp(al2, a2).estado).toBe('abierta')
    void a
  })
  it('V21: una espera que ya no está viva sin vence_en NO es violación; una viva sin vence_en, sí', async () => {
    const { invarianteDeReloj } = await import('../esperas')
    const base = { ahora: AHORA, esperas: [], campanasEnEspera: [], filasEnEspera: [], esperasPorCampana: [], corridasEnCurso: [], ultimoLatido: AHORA, latidoMaxHoras: 18 }
    const e = (estado: string) => ({ id: 1, estado, vence_en: null, recordatorio_en: null, alerta_en: null, rung_enviado: 0, objeto_tipo: 't', objeto_id: 'o' })
    expect(invarianteDeReloj({ ...base, esperas: [e('resuelta')] })).toEqual([])
    expect(invarianteDeReloj({ ...base, esperas: [e('viva')] }).map((v) => v.tipo)).toEqual(['espera_sin_plazo'])
  })
  it('calcularReloj: una regla que necesita la fecha de la pieza o la de inicio y no la recibe, falla fuerte (nunca una espera sin reloj)', async () => {
    const { calcularReloj } = await import('../esperas')
    const plazo = (vence_regla: string) => ({ tipo: 't', recordatorio_horas: null, alerta_horas: null, vence_horas: null, vence_regla, accion_al_vencer: 'x' })
    expect(() => calcularReloj(plazo('fecha_menos_lead_dias_video'), AHORA, {})).toThrow()
    expect(() => calcularReloj(plazo('fecha_inicio_menos_1_dia'), AHORA, {})).toThrow()
    expect(() => calcularReloj(plazo('fecha_de_la_pieza'), AHORA, {})).toThrow()
    expect(new Date(calcularReloj(plazo('fecha_menos_lead_dias_video'), AHORA, { fechaPieza: '2026-10-20', leadDiasVideo: 4 }).vence_en).toISOString()).toBe('2026-10-16T00:00:00.000Z')
    expect(new Date(calcularReloj(plazo('fecha_inicio_menos_1_dia'), AHORA, { fechaInicio: '2026-10-20' }).vence_en).toISOString()).toBe('2026-10-19T00:00:00.000Z')
  })
})
