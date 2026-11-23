/**
 * «Crear Campaña» sin vuelta atrás, arreglo propio y fallo honesto (GO Lenovo 10:28Z del 21-nov · firma de Emilio 10:25–10:27Z) + nombre genérico del plan (Emilio 10:30Z) · CC1.
 *  · el arreglo propio: un pedido que no nació se re-pide solo, con una llave NUEVA por intento, espaciado y con tope; nunca nacen dos campañas;
 *  · fallida solo al agotarse o con una causa que no se arregla sola, con su código; una vez fallida, la apertura no la deja nacer y crear no la vuelve a mandar;
 *  · el estado que lee el tablero (en_proceso · nacida · fallida);
 *  · el nombre: sin nombre pedido, el genérico del Plan de Marketing, sin versión ni fecha.
 * Almacén en memoria: US$ 0, sin base, sin red, sin modelo. Cliente sintético.
 */
import { beforeEach, describe, it, expect } from 'vitest'
import { abrirCampana } from '../index'
import { crearCampana, estadoParaElTablero, PREFIJO_DE_LA_LLAVE } from '../crear-campana'
import { nombreGenericoDelPlan, NOMBRE_GENERICO_SIN_PLAN } from '../campanas'
import { repararPedidos, ESPERAS_DEL_PEDIDO_MIN, MAX_INTENTOS_DEL_PEDIDO, VENTANA_DEL_ARREGLO_MIN } from '../reparar-pedidos'
import { CLAVE_LIBRETA_DE_PEDIDOS, type LibretaDePedidos } from '../libreta-de-pedidos'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'

const CLI = '0b5d3c2a-1111-4c4c-8d8d-000000000001'
const A = { ...clienteA(), clientId: CLI }
const AHORA = '2026-10-12T12:00:00Z'
const T0 = new Date(AHORA).getTime()
const LLAVE = '7f1c2e3d-4a5b-4c6d-8e9f-0a1b2c3d4e5f'
const OTRA_LLAVE = '11111111-2222-4333-8444-555555555555'
const wf = { workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1' }
const TITULO_REAL = '# Plan de campaña · 90 días · Náufrago · Versión 3\n**6 de noviembre de 2026 – 28 de enero de 2027**\n---\n'
const almacen = (o: { encendida?: boolean; intakeApagado?: boolean; plan?: string } = {}) => new AlmacenMemoria({
  contextos: { [CLI]: contextoDe({ ...A, ...(o.plan !== undefined ? { planTexto: o.plan } : {}) }) },
  planes: { [CLI]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
  config: { flujos: ['wf-cadena'], puerta_workflow_id: 'wf-puerta', ...(o.encendida ? { estado_cadena: 'encendida' } : {}) },
  ...(o.intakeApagado ? { intakeApagado: true } : {}),
})
const BUENO = { client_id: CLI, seco: true, llave_formulario: LLAVE, nombre: 'Temporada de lluvias', cambio: 'Que la gente sepa que abrimos de noche', brief_libre: 'Todo lo que el dueño quiere decir', fecha_inicio: '2026-10-12', fecha_fin: '2026-10-25', fechas_clave: [], tope_usd: 50 }
const crear = (al: AlmacenMemoria, extra: Record<string, unknown> = {}) => crearCampana(al, { ...BUENO, ...extra }, 'emilio', AHORA)
const en = (min: number) => new Date(T0 + min * 60000)
const libreta = (al: AlmacenMemoria) => (al.config.get(CLAVE_LIBRETA_DE_PEDIDOS) ?? {}) as LibretaDePedidos
const llavesEmitidas = (al: AlmacenMemoria) => (al.sobresEmitidos as Array<{ idempotency_key: string }>).map((s) => s.idempotency_key)
/** crea el pedido (sale el sobre del botón, que la sala de prueba guarda sin abrir la campaña: es justo el hueco) y fija la hora del pedido en AHORA */
const pedidoSinNacer = async (al: AlmacenMemoria, extra: Record<string, unknown> = {}) => {
  const r = await crear(al, extra)
  expect(r.cuerpo.estado).toBe('pedida')
  const p = al.pedidos[al.pedidos.length - 1]
  p.creado_en = AHORA
  return p
}
beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-interna' })

describe('el nombre genérico del Plan de Marketing (Emilio 10:30Z: sin fecha de inicio)', () => {
  it('🔴 el título real de Náufrago: sin la versión y sin la línea de fechas', () => {
    expect(nombreGenericoDelPlan(TITULO_REAL)).toBe('Plan de campaña · 90 días · Náufrago')
  })
  it('🔴 sin título «# …» (o sin plan), el genérico fijo', () => {
    expect(nombreGenericoDelPlan('Plan de 90 días de una cafetería de barrio.\n## Canales')).toBe(NOMBRE_GENERICO_SIN_PLAN)
    expect(nombreGenericoDelPlan('')).toBe(NOMBRE_GENERICO_SIN_PLAN)
    expect(nombreGenericoDelPlan(null)).toBe(NOMBRE_GENERICO_SIN_PLAN)
  })
  it('🔴 las partes con fecha (ISO o escrita) se van, las negritas también; un título que solo era fecha y versión da el genérico fijo', () => {
    expect(nombreGenericoDelPlan('# **Plan de 90 dias** · 2026-11-06 · versión B')).toBe('Plan de 90 dias')
    expect(nombreGenericoDelPlan('# Campaña de verano · 6 de noviembre · Quito')).toBe('Campaña de verano · Quito')
    expect(nombreGenericoDelPlan('# Plan · noviembre de 2026')).toBe('Plan')
    expect(nombreGenericoDelPlan('# 2026-11-06 · Versión 2')).toBe(NOMBRE_GENERICO_SIN_PLAN)
  })
  it('🔴 (s14 y s12 de CC5 en #369) un plan con saltos de Windows da el mismo nombre; un título con un carácter de control (tabulador) da el genérico fijo', () => {
    expect(nombreGenericoDelPlan('# Plan de campaña · 90 días · Náufrago · Versión 3\r\n**6 de noviembre de 2026**\r\n')).toBe('Plan de campaña · 90 días · Náufrago')
    expect(nombreGenericoDelPlan('# Campaña de verano · Quito\r\nresto')).toBe('Campaña de verano · Quito')
    expect(nombreGenericoDelPlan('# Plan\tuno · Quito')).toBe(NOMBRE_GENERICO_SIN_PLAN)
    // el título con sangría (lo que de verdad protege el trim de la línea; el \r ya lo quita el trim de cada parte)
    expect(nombreGenericoDelPlan('Intro\r\n   # Campaña de verano · Quito · Versión 2\r\n')).toBe('Campaña de verano · Quito')
  })
  it('🔴 un título que no cabe en un nombre (más de 120) da el genérico fijo, nunca un nombre cortado', () => {
    expect(nombreGenericoDelPlan(`# ${'x'.repeat(121)}`)).toBe(NOMBRE_GENERICO_SIN_PLAN)
    expect(nombreGenericoDelPlan(`# ${'x'.repeat(120)}`)).toBe('x'.repeat(120))
  })
  it('🔴 crear SIN nombre guarda el genérico del plan del cliente; con nombre, el suyo', async () => {
    const al = almacen({ plan: TITULO_REAL + 'resto del plan' })
    expect((await crear(al, { nombre: undefined })).cuerpo.estado).toBe('pedida')
    expect(al.pedidos[0].nombre).toBe('Plan de campaña · 90 días · Náufrago')
    const al2 = almacen({ plan: TITULO_REAL })
    await crear(al2, { nombre: '' })
    expect(al2.pedidos[0].nombre).toBe('Plan de campaña · 90 días · Náufrago')
    const al3 = almacen({ plan: TITULO_REAL })
    await crear(al3)
    expect(al3.pedidos[0].nombre).toBe('Temporada de lluvias')
  })
  it('🔴 una campaña que nace del plan (sin pedido ni nombre) nace con el genérico; con nombre pedido, con ese', async () => {
    const al = almacen({ plan: TITULO_REAL })
    const r = await abrirCampana(al, { ...wf, client_id: CLI, seco: true }, AHORA)
    expect((r.cuerpo.campana as { nombre_de_campana?: string }).nombre_de_campana).toBe('Plan de campaña · 90 días · Náufrago')
    const al2 = almacen()
    const r2 = await abrirCampana(al2, { ...wf, client_id: CLI, seco: true, llave_de_campana: 'manual-1', nombre_de_campana: 'Mi campaña' }, AHORA)
    expect((r2.cuerpo.campana as { nombre_de_campana?: string }).nombre_de_campana).toBe('Mi campaña')
  })
})

describe('el arreglo propio: el pedido que no nació se re-pide solo', () => {
  it('🔴 antes de su plazo no hace nada; a los 10 min re-emite con la llave del intento 1 y lo anota', async () => {
    const al = almacen()
    const p = await pedidoSinNacer(al)
    const base = llavesEmitidas(al)[0]
    expect(await repararPedidos(al, en(ESPERAS_DEL_PEDIDO_MIN[0] - 1), { ejecutar: true })).toMatchObject({ accion: 'reparado', reintentos: [], fallidos: [] })
    const r = await repararPedidos(al, en(ESPERAS_DEL_PEDIDO_MIN[0]), { ejecutar: true })
    expect(r).toMatchObject({ accion: 'reparado', revisados: 1, reintentos: [{ pedido_id: p.id, intento: 1, resultado: 'aceptado' }], fallidos: [] })
    expect(llavesEmitidas(al)).toEqual([base, `${base}:r1`])
    expect(libreta(al)[p.id]).toEqual({ n: 1, ultimo_en: en(10).toISOString(), ultimo: 'aceptado' })
  })
  it('🔴 la escalera completa: 5 intentos espaciados 10 · 10 · 20 · 30 · 60 y, 60 min después del último, fallida E-TIEMPO (nunca un 6.º intento)', async () => {
    const al = almacen()
    const p = await pedidoSinNacer(al)
    const base = llavesEmitidas(al)[0]
    let t = 0
    for (let i = 0; i < MAX_INTENTOS_DEL_PEDIDO; i++) {
      t += ESPERAS_DEL_PEDIDO_MIN[i]
      expect(await repararPedidos(al, en(t - 1), { ejecutar: true })).toMatchObject({ accion: 'reparado', reintentos: [], fallidos: [] })
      const r = await repararPedidos(al, en(t), { ejecutar: true })
      expect(r).toMatchObject({ reintentos: [{ intento: i + 1 }] })
    }
    expect(t).toBe(130)
    expect(llavesEmitidas(al)).toEqual([base, `${base}:r1`, `${base}:r2`, `${base}:r3`, `${base}:r4`, `${base}:r5`])
    expect(await repararPedidos(al, en(t + 59), { ejecutar: true })).toMatchObject({ reintentos: [], fallidos: [] })
    const fin = await repararPedidos(al, en(t + 60), { ejecutar: true })
    expect(fin).toMatchObject({ reintentos: [], fallidos: [{ pedido_id: p.id, codigo: 'E-TIEMPO' }] })
    expect(libreta(al)[p.id].fallida).toMatchObject({ codigo: 'E-TIEMPO', en: en(190).toISOString() })
    // ya fallida: nada más, nunca
    expect(await repararPedidos(al, en(t + 600), { ejecutar: true })).toMatchObject({ reintentos: [], fallidos: [] })
    expect(llavesEmitidas(al)).toHaveLength(6)
  })
  it('🔴 la sala rechaza: cada rechazo gasta un intento y la falla dice E-SALA', async () => {
    const al = almacen({ intakeApagado: true })
    const p = await pedidoSinNacer(al)
    let t = 0
    for (let i = 0; i < MAX_INTENTOS_DEL_PEDIDO; i++) { t += ESPERAS_DEL_PEDIDO_MIN[i]; await repararPedidos(al, en(t), { ejecutar: true }) }
    expect(libreta(al)[p.id]).toMatchObject({ n: 5, ultimo: 'rechazado' })
    expect(await repararPedidos(al, en(t + 60), { ejecutar: true })).toMatchObject({ fallidos: [{ codigo: 'E-SALA' }] })
  })
  it('🔴 sin plan aprobado: fallida E-PLAN en la primera pasada vencida, sin re-emitir ni gastar intento', async () => {
    const al = almacen()
    const p = await pedidoSinNacer(al)
    al.planesSinAprobar.add('plan-1')
    const r = await repararPedidos(al, en(10), { ejecutar: true })
    expect(r).toMatchObject({ reintentos: [], fallidos: [{ pedido_id: p.id, codigo: 'E-PLAN' }] })
    expect(libreta(al)[p.id]).toMatchObject({ n: 0, fallida: { codigo: 'E-PLAN' } })
    expect(llavesEmitidas(al)).toHaveLength(1)
    // fallida es para siempre: aunque el plan vuelva a estar aprobado (y el pedido siga dentro de la ventana), no se re-pide ni se re-anota
    al.planesSinAprobar.delete('plan-1')
    expect(await repararPedidos(al, en(30), { ejecutar: true })).toMatchObject({ revisados: 1, reintentos: [], fallidos: [] })
    expect(llavesEmitidas(al)).toHaveLength(1)
    expect(libreta(al)[p.id].fallida).toMatchObject({ codigo: 'E-PLAN', en: en(10).toISOString() })
  })
  it('🔴 la cadena no admite al cliente (pedido real con la cadena apagada): fallida E-ADMITE', async () => {
    const al = almacen({ encendida: true })
    const p = await pedidoSinNacer(al, { seco: false })
    al.config.set('estado_cadena', 'apagada')
    expect(await repararPedidos(al, en(10), { ejecutar: true })).toMatchObject({ reintentos: [], fallidos: [{ pedido_id: p.id, codigo: 'E-ADMITE' }] })
  })
  it('🔴 un pedido que ya nació no se toca; uno más viejo que la ventana tampoco', async () => {
    const al = almacen()
    const p = await pedidoSinNacer(al)
    await abrirCampana(al, { ...wf, client_id: CLI, seco: true, llave_de_campana: p.llave, nombre_de_campana: p.nombre }, AHORA)
    expect(al.pedidos[0].campana_id).not.toBeNull()
    expect(await repararPedidos(al, en(10), { ejecutar: true })).toMatchObject({ revisados: 0, reintentos: [] })
    const al2 = almacen()
    const viejo = await pedidoSinNacer(al2)
    viejo.creado_en = en(-VENTANA_DEL_ARREGLO_MIN - 1).toISOString()
    expect(await repararPedidos(al2, en(0), { ejecutar: true })).toMatchObject({ revisados: 0, reintentos: [] })
    expect(llavesEmitidas(al2)).toHaveLength(1)
  })
  it('🔴 en seco: calcula lo que haría y no emite ni anota', async () => {
    const al = almacen()
    const p = await pedidoSinNacer(al)
    expect(await repararPedidos(al, en(10), { ejecutar: false })).toMatchObject({ accion: 'en_seco', reintentos: [{ pedido_id: p.id, intento: 1, resultado: 'en_seco' }] })
    al.planesSinAprobar.add('plan-1')
    expect(await repararPedidos(al, en(10), { ejecutar: false })).toMatchObject({ fallidos: [{ codigo: 'E-PLAN' }] })
    expect(llavesEmitidas(al)).toHaveLength(1)
    expect(al.config.has(CLAVE_LIBRETA_DE_PEDIDOS)).toBe(false)
  })
  it('🔴 si la libreta cambió durante la pasada, no la pisa; la pasada siguiente re-emite la MISMA llave y la sala dice «duplicado»', async () => {
    const al = almacen()
    const p = await pedidoSinNacer(al)
    const leer = al.leerConfigConSello.bind(al)
    al.leerConfigConSello = async (k: string) => { const r = await leer(k); await al.escribirConfig(CLAVE_LIBRETA_DE_PEDIDOS, { otro: { n: 1 } }); return r }
    const r = await repararPedidos(al, en(10), { ejecutar: true })
    expect(r).toMatchObject({ reintentos: [{ intento: 1, resultado: 'aceptado' }], sin_escribir: expect.stringMatching(/cambió/) })
    expect(libreta(al)).toEqual({ otro: { n: 1 } })
    al.leerConfigConSello = leer
    expect(await repararPedidos(al, en(20), { ejecutar: true })).toMatchObject({ reintentos: [{ pedido_id: p.id, intento: 1, resultado: 'duplicado' }] })
    expect(libreta(al)[p.id]).toMatchObject({ n: 1, ultimo: 'duplicado' })
  })
  it('🔴 un pedido que no se pudo leer no gasta intento y no frena a los demás', async () => {
    const al = almacen()
    const p1 = await pedidoSinNacer(al)
    const p2 = await pedidoSinNacer(al, { llave_formulario: OTRA_LLAVE })
    const resolver = al.resolverPlan.bind(al)
    let n = 0
    al.resolverPlan = async (...a: Parameters<typeof resolver>) => { if (++n === 1) throw new Error('base caída'); return resolver(...a) }
    const r = await repararPedidos(al, en(10), { ejecutar: true })
    expect(r).toMatchObject({ errores: [{ pedido_id: p1.id, detalle: 'base caída' }], reintentos: [{ pedido_id: p2.id, intento: 1 }] })
    expect(libreta(al)[p1.id]).toBeUndefined()
  })
  it('🔴 sin los puertos (otro almacén), no hace nada y lo dice', async () => {
    const al = almacen()
    ;(al as unknown as { pedidosSinNacer?: unknown }).pedidosSinNacer = undefined
    expect(await repararPedidos(al, en(10), { ejecutar: true })).toMatchObject({ accion: 'sin_puertos' })
  })
})

describe('nunca dos campañas', () => {
  it('🔴 re-pedido varias veces, la campaña nace UNA vez por llave (la apertura contesta «ya abierta» a los sobres repetidos)', async () => {
    const al = almacen()
    const p = await pedidoSinNacer(al)
    await repararPedidos(al, en(10), { ejecutar: true })
    const abrir = () => abrirCampana(al, { ...wf, client_id: CLI, seco: true, llave_de_campana: p.llave, nombre_de_campana: p.nombre }, AHORA)
    expect((await abrir()).cuerpo.resultado ?? 'abierta').not.toBe('error')
    expect((await abrir()).cuerpo.ya_abierta).toBe(true)
    expect(al.campanas.filter((c) => c.llave_de_campana === p.llave)).toHaveLength(1)
  })
  it('🔴 un pedido FALLIDO no nace aunque llegue un sobre tardío (409 E-PEDIDO-FALLIDO, sin campaña)', async () => {
    const al = almacen()
    const p = await pedidoSinNacer(al)
    al.planesSinAprobar.add('plan-1')
    await repararPedidos(al, en(10), { ejecutar: true })
    al.planesSinAprobar.delete('plan-1')
    const r = await abrirCampana(al, { ...wf, client_id: CLI, seco: true, llave_de_campana: p.llave, nombre_de_campana: p.nombre }, AHORA)
    expect(r).toMatchObject({ status: 409, cuerpo: { code: 'E-PEDIDO-FALLIDO' } })
    expect(al.campanas).toHaveLength(0)
    expect(al.pedidos[0].campana_id).toBeNull()
  })
  it('🔴 una libreta ilegible tampoco deja nacer (409), nunca a ciegas', async () => {
    const al = almacen()
    const p = await pedidoSinNacer(al)
    const leer = al.leerConfig.bind(al)
    al.leerConfig = async (k: string) => { if (k === CLAVE_LIBRETA_DE_PEDIDOS) throw new Error('config caída'); return leer(k) }
    const r = await abrirCampana(al, { ...wf, client_id: CLI, seco: true, llave_de_campana: p.llave, nombre_de_campana: p.nombre }, AHORA)
    expect(r).toMatchObject({ status: 409, cuerpo: { code: 'E-LIBRETA-ILEGIBLE' } })
    expect(al.campanas).toHaveLength(0)
  })
  it('🔴 crear con la MISMA llave de un pedido fallido: «ya_pedida», fallida con su código y SIN volver a mandar el sobre', async () => {
    const al = almacen()
    await pedidoSinNacer(al)
    al.planesSinAprobar.add('plan-1')
    await repararPedidos(al, en(10), { ejecutar: true })
    al.planesSinAprobar.delete('plan-1')
    const antes = llavesEmitidas(al).length
    const r = await crear(al)
    expect(r.cuerpo).toMatchObject({ ok: true, estado: 'ya_pedida', estado_del_pedido: 'fallida', codigo: 'E-PLAN' })
    expect(llavesEmitidas(al)).toHaveLength(antes)
  })
  it('🔴 «Crear nuevamente» (otra llave) después de una falla: un pedido nuevo que sí nace; el fallido sigue sin campaña', async () => {
    const al = almacen()
    const viejo = await pedidoSinNacer(al)
    al.planesSinAprobar.add('plan-1')
    await repararPedidos(al, en(10), { ejecutar: true })
    al.planesSinAprobar.delete('plan-1')
    const nuevo = await pedidoSinNacer(al, { llave_formulario: OTRA_LLAVE })
    await abrirCampana(al, { ...wf, client_id: CLI, seco: true, llave_de_campana: nuevo.llave, nombre_de_campana: nuevo.nombre }, AHORA)
    await abrirCampana(al, { ...wf, client_id: CLI, seco: true, llave_de_campana: viejo.llave, nombre_de_campana: viejo.nombre }, AHORA)
    expect(al.campanas.map((c) => c.llave_de_campana)).toEqual([nuevo.llave])
  })
})

describe('el estado que lee el tablero', () => {
  const leer = (al: AlmacenMemoria, extra: Record<string, unknown> = {}) => estadoParaElTablero(al, { client_id: CLI, llave_formulario: LLAVE, seco: 'true', ...extra })
  it('🔴 sin pedido: 404 sin_pedido (el formulario puede volver a mandar con la misma llave)', async () => {
    expect(await leer(almacen())).toMatchObject({ status: 404, cuerpo: { ok: false, error: 'sin_pedido' } })
  })
  it('🔴 recién pedido: en_proceso · la respuesta del POST también lo dice', async () => {
    const al = almacen()
    expect((await crear(al)).cuerpo).toMatchObject({ estado: 'pedida', estado_del_pedido: 'en_proceso' })
    expect(await leer(al)).toMatchObject({ status: 200, cuerpo: { ok: true, estado_del_pedido: 'en_proceso' } })
    expect((await crear(al)).cuerpo).toMatchObject({ estado: 'ya_pedida', estado_del_pedido: 'en_proceso' })
  })
  it('🔴 CC5 10:32Z · si dejar el sobre LANZA después de guardar: «pedida» con despertado false (nunca un 500), y el arreglo propio lo re-pide', async () => {
    const al = almacen()
    const emitir = al.emitirSobre.bind(al)
    al.emitirSobre = async () => { throw new Error('la base de la sala cayó') }
    const r = await crear(al)
    expect(r).toMatchObject({ status: 200, cuerpo: { ok: true, estado: 'pedida', despertado: false, estado_del_pedido: 'en_proceso', motivo_sin_despertar: expect.stringMatching(/la base de la sala cayó/) } })
    expect(al.pedidos).toHaveLength(1)
    expect((await crear(al)).cuerpo).toMatchObject({ estado: 'ya_pedida', despertado: false })
    al.emitirSobre = emitir
    al.pedidos[0].creado_en = AHORA
    expect(await repararPedidos(al, en(10), { ejecutar: true })).toMatchObject({ reintentos: [{ intento: 1, resultado: 'aceptado' }] })
  })
  it('🔴 nacida, con su campaña · fallida, con su código', async () => {
    const al = almacen()
    const p = await pedidoSinNacer(al)
    await abrirCampana(al, { ...wf, client_id: CLI, seco: true, llave_de_campana: p.llave, nombre_de_campana: p.nombre }, AHORA)
    expect(await leer(al)).toMatchObject({ status: 200, cuerpo: { estado_del_pedido: 'nacida', campana_id: al.campanas[0].id } })
    const al2 = almacen()
    await pedidoSinNacer(al2)
    al2.planesSinAprobar.add('plan-1')
    await repararPedidos(al2, en(10), { ejecutar: true })
    expect(await leer(al2)).toMatchObject({ status: 200, cuerpo: { estado_del_pedido: 'fallida', codigo: 'E-PLAN' } })
  })
  it('🔴 s20 de CC6 en #1268 · la carrera: la campaña nació Y la libreta tiene la falla anotada → gana «nacida» (en el GET y en crear con la misma llave), nunca «Crear nuevamente»', async () => {
    const al = almacen()
    const p = await pedidoSinNacer(al)
    // el arreglo leyó el pedido sin campaña, la apertura miró la libreta sin falla y siguió; el arreglo anotó la falla y después nació la campaña
    al.config.set(CLAVE_LIBRETA_DE_PEDIDOS, { [p.id]: { n: 5, ultimo_en: en(130).toISOString(), ultimo: 'aceptado', fallida: { codigo: 'E-TIEMPO', en: en(190).toISOString(), detalle: 'agotado' } } })
    al.campanas.push({ id: 'camp-de-la-carrera' } as never)
    p.campana_id = 'camp-de-la-carrera'
    expect(await leer(al)).toMatchObject({ status: 200, cuerpo: { estado_del_pedido: 'nacida', campana_id: 'camp-de-la-carrera' } })
    expect((await leer(al)).cuerpo).not.toHaveProperty('codigo')
    const antes = llavesEmitidas(al).length
    const r = await crear(al)
    expect(r.cuerpo).toMatchObject({ estado: 'ya_pedida', estado_del_pedido: 'nacida', campana_id: 'camp-de-la-carrera' })
    expect(r.cuerpo).not.toHaveProperty('codigo')
    expect(llavesEmitidas(al)).toHaveLength(antes)
  })
  it('🔴 seco separa: el pedido en seco no se ve sin seco=true', async () => {
    const al = almacen()
    await pedidoSinNacer(al)
    expect((await leer(al, { seco: null })).status).toBe(404)
  })
  it('🔴 400 con cliente o llave que no son uuid, o con seco raro; la llave se lee sin mayúsculas', async () => {
    const al = almacen()
    await pedidoSinNacer(al)
    expect((await leer(al, { client_id: 'x' })).status).toBe(400)
    expect((await leer(al, { llave_formulario: 'x' })).status).toBe(400)
    expect((await leer(al, { seco: 'si' })).status).toBe(400)
    expect((await leer(al, { llave_formulario: LLAVE.toUpperCase() })).status).toBe(200)
    expect(al.pedidos[0].llave).toBe(PREFIJO_DE_LA_LLAVE + LLAVE)
  })
})
