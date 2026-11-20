/**
 * «Crear Campaña» · entrega 2 (GO Lenovo a CC1 y CC3, 20-nov · contrato con CC2 de las 21:04Z y 21:15Z) · CC1.
 *  · el mínimo con la cifra ESCRITA A MANO (no con la misma función);
 *  · crear: cada pregunta mal contestada es un 400 que nombra la pregunta; sin plan aprobado, con la cadena cerrada o con el tope bajo, 409; nada se guarda antes de pasar todo;
 *  · 🔴 CC5 21:48Z: rechazo por tope → la MISMA llave con un tope bueno → crea (la llave no queda usada);
 *  · la misma llave dos veces = «ya pedida», un solo pedido; el sobre lleva la llave y el nombre;
 *  · abrir con el pedido: fechas (origen `emilio`), tope y nombre del pedido, y el pedido queda ligado a SU campaña, nunca a la de otro cliente.
 * Almacén en memoria: US$ 0, sin base, sin red, sin modelo. Cliente sintético.
 */
import { beforeEach, describe, it, expect } from 'vitest'
import { abrirCampana } from '../index'
import { crearCampana, minimoDeCampana, minimoParaElFormulario, PREFIJO_DE_LA_LLAVE, sobreDelPedido, validarEntrada } from '../crear-campana'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import { ACCIONES } from '../../oficina/tablero/acciones'
import { crearCampanaDelTablero } from '../../oficina/tablero/crear-campana'
import type { Campana } from '../almacen'

const CLI = '0b5d3c2a-1111-4c4c-8d8d-000000000001'
const OTRO_CLI = '0b5d3c2a-2222-4c4c-8d8d-000000000002'
const A = { ...clienteA(), clientId: CLI }
const AHORA = '2026-10-12T12:00:00Z' // lunes · hoy = 2026-10-12 (zona UTC)
const LLAVE = '7f1c2e3d-4a5b-4c6d-8e9f-0a1b2c3d4e5f'
const wf = { workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1' }
const almacen = (o: { encendida?: boolean } = {}) => new AlmacenMemoria({
  contextos: { [CLI]: contextoDe(A), [OTRO_CLI]: contextoDe({ ...A, clientId: OTRO_CLI }) },
  planes: { [CLI]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }], [OTRO_CLI]: [{ plan_id: 'plan-9', fecha: '2026-10-08' }] },
  config: { flujos: ['wf-cadena'], puerta_workflow_id: 'wf-puerta', ...(o.encendida ? { estado_cadena: 'encendida' } : {}) },
})
const BUENO = { client_id: CLI, seco: true, llave_formulario: LLAVE, nombre: 'Temporada de lluvias', cambio: 'Que la gente sepa que abrimos de noche', brief_libre: 'Todo lo que el dueño quiere decir', fecha_inicio: '2026-10-12', fecha_fin: '2026-10-25', fechas_clave: [{ fecha: '2026-10-20', que: 'Noche de apertura' }], tope_usd: 30 }
const crear = (al: AlmacenMemoria, extra: Record<string, unknown> = {}) => crearCampana(al, { ...BUENO, ...extra }, 'emilio', AHORA)
const llaveDelPedido = PREFIJO_DE_LA_LLAVE + LLAVE
// la sala de prueba autentica el sobre con la llave interna
beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-interna' })

describe('el mínimo, con la cifra escrita a mano', () => {
  // costos del almacén de prueba: post_img tope 2,5 (sin reserva) · carrusel_mesa tope 5, reserva 3,1 · revisión de registro 0,8
  //   1 tanda: planificación 3 × 4 × (0,7712 + 0,7261) = 17,9676 → 17,97 · pieza 3,1 · jefatura 3 × 0,8 = 2,4 → 23,47 → US$ 24
  //   4 tandas: 3 × 4 × (0,7712 + 4 × 0,7261) = 44,1072 → 44,11 · + 3,1 + 2,4 = 49,61 → US$ 50
  const C = { topes: { post_img: 2.5, carrusel_mesa: 5 }, reservas: { carrusel_mesa: 3.1 }, tope_registro_usd: 0.8 }
  it('🔴 una tanda: US$ 24, con su desglose', () => {
    expect(minimoDeCampana(1, C)).toEqual({ minimo_usd: 24, detalle: { planificacion_usd: 17.97, pieza_peor_usd: 3.1, jefatura_usd: 2.4 } })
  })
  it('🔴 cuatro tandas: US$ 50', () => {
    expect(minimoDeCampana(4, C)).toEqual({ minimo_usd: 50, detalle: { planificacion_usd: 44.11, pieza_peor_usd: 3.1, jefatura_usd: 2.4 } })
  })
  it('🔴 la pieza es la MÁS cara de lo que reserva el freno: sin reserva cuenta el tope (7 > 3,1)', () => {
    expect(minimoDeCampana(1, { ...C, topes: { ...C.topes, video_x: 7 } }).detalle.pieza_peor_usd).toBe(7)
  })
  it('🔴 sin topes de familia o sin tope de registro, LANZA (un mínimo ilegible no es cero)', () => {
    expect(() => minimoDeCampana(1, { ...C, topes: {} })).toThrow(/topes/)
    expect(() => minimoDeCampana(1, { ...C, tope_registro_usd: 0 })).toThrow(/registro/)
  })
  it('🔴 la ruta del formulario: 200 con las fechas pedidas (14 días = 1 tanda) · 400 sin cliente o con una sola fecha · 409 sin plan aprobado', async () => {
    const al = almacen()
    expect(await minimoParaElFormulario(al, { client_id: CLI, fecha_inicio: '2026-10-12', fecha_fin: '2026-10-25' }, AHORA)).toEqual({ status: 200, cuerpo: { ok: true, minimo_usd: 24, detalle: { planificacion_usd: 17.97, pieza_peor_usd: 3.1, jefatura_usd: 2.4 }, fechas: { inicio: '2026-10-12', fin: '2026-10-25' } } })
    expect((await minimoParaElFormulario(al, { client_id: CLI, fecha_inicio: '2026-10-12', fecha_fin: '2027-01-10' }, AHORA)).cuerpo.minimo_usd).toBe(50)
    expect((await minimoParaElFormulario(al, { client_id: 'no-uuid' }, AHORA)).status).toBe(400)
    expect((await minimoParaElFormulario(al, { client_id: CLI, fecha_inicio: '2026-10-12' }, AHORA)).status).toBe(400)
    al.planesSinAprobar.add('plan-1')
    expect(await minimoParaElFormulario(al, { client_id: CLI }, AHORA)).toMatchObject({ status: 409, cuerpo: { ok: false, error: 'sin_plan_aprobado' } })
  })
  it('🔴 costos ilegibles = 503 «minimo_ilegible» (el formulario no deja crear), nunca un mínimo bajo', async () => {
    const al = almacen(); al.costos = new Error('la base no contestó')
    expect(await minimoParaElFormulario(al, { client_id: CLI }, AHORA)).toMatchObject({ status: 503, cuerpo: { ok: false, error: 'minimo_ilegible' } })
  })
})

describe('crear · cada pregunta mal contestada es un 400 que la nombra, y nada se guarda', () => {
  const casos: Array<[string, Record<string, unknown>, string, RegExp]> = [
    ['cliente', { client_id: 'cliente-a' }, 'client_id', /^cliente:/],
    ['llave', { llave_formulario: 'abc' }, 'llave_formulario', /^formulario:/],
    ['nombre vacío', { nombre: '   ' }, 'nombre', /^nombre:/],
    ['nombre de dos líneas', { nombre: 'a\nb' }, 'nombre', /^nombre:/],
    ['nombre largo', { nombre: 'x'.repeat(121) }, 'nombre', /^nombre:/],
    ['cambio largo', { cambio: 'x'.repeat(4001) }, 'cambio', /^qué cambia:/],
    ['brief vacío', { brief_libre: '' }, 'brief_libre', /^brief:/],
    ['una sola fecha', { fecha_fin: null }, 'fecha_fin', /^fechas: van las dos/],
    ['fecha mal escrita', { fecha_inicio: '12/10/2026' }, 'fecha_inicio', /^fechas:/],
    ['fin antes del inicio', { fecha_fin: '2026-10-12' }, 'fecha_fin', /el fin va después del inicio/],
    ['más de 366 días', { fecha_fin: '2027-10-14' }, 'fecha_fin', /366/],
    ['fechas clave sin qué', { fechas_clave: [{ fecha: '2026-10-20', que: '' }] }, 'fechas_clave', /^fechas clave: la 1\.ª/],
    ['21 fechas clave', { fechas_clave: Array.from({ length: 21 }, () => ({ fecha: '2026-10-20', que: 'x' })) }, 'fechas_clave', /hasta 20/],
    ['sin tope', { tope_usd: undefined }, 'tope_usd', /^tope:/],
    ['tope en texto', { tope_usd: '30' }, 'tope_usd', /^tope:/],
    ['tope cero', { tope_usd: 0 }, 'tope_usd', /^tope:/],
    ['tope con milésimas', { tope_usd: 30.005 }, 'tope_usd', /dos decimales/],
  ]
  for (const [n, extra, campo, detalle] of casos) {
    it(`🔴 ${n}`, async () => {
      const al = almacen()
      const r = await crear(al, extra)
      expect(r.status).toBe(400)
      expect(r.cuerpo).toMatchObject({ ok: false, error: 'entrada_invalida', campo })
      expect(String(r.cuerpo.detalle)).toMatch(detalle)
      expect(al.pedidos).toHaveLength(0)
      expect(al.sobresEmitidos).toHaveLength(0)
    })
  }
  it('🔴 un inicio antes de hoy (en la zona del cliente) y una fecha clave fuera de la campaña, 400', async () => {
    const al = almacen()
    expect(await crear(al, { fecha_inicio: '2026-10-11' })).toMatchObject({ status: 400, cuerpo: { campo: 'fecha_inicio', detalle: 'fechas: el inicio no puede ser antes de hoy (2026-10-12)' } })
    expect(await crear(al, { fechas_clave: [{ fecha: '2026-10-26', que: 'x' }] })).toMatchObject({ status: 400, cuerpo: { campo: 'fechas_clave' } })
    expect(al.pedidos).toHaveLength(0)
  })
  it('🔴 la validación pura acepta lo bueno y arma la llave del pedido', () => {
    const v = validarEntrada(BUENO)
    expect(v.ok && v.e).toMatchObject({ client_id: CLI, seco: true, llave: llaveDelPedido, tope_usd: 30, fechas_clave: [{ fecha: '2026-10-20', que: 'Noche de apertura' }] })
  })
})

describe('crear · lo que frena antes de guardar', () => {
  it('🔴 sin plan aprobado: 409 y nada guardado', async () => {
    const al = almacen(); al.planesSinAprobar.add('plan-1')
    expect(await crear(al)).toMatchObject({ status: 409, cuerpo: { ok: false, error: 'sin_plan_aprobado' } })
    expect(al.pedidos).toHaveLength(0)
  })
  it('🔴 sin plan: 409 sin_plan_aprobado', async () => {
    const al = almacen()
    expect((await crearCampana(al, { ...BUENO, client_id: '0b5d3c2a-3333-4c4c-8d8d-000000000003' }, 'emilio', AHORA)).cuerpo.error).toBe('sin_plan_aprobado')
  })
  it('🔴 de verdad (seco false) con la cadena apagada: 409 «cadena_no_admite» y nada guardado · encendida, crea', async () => {
    const al = almacen()
    expect(await crear(al, { seco: false })).toMatchObject({ status: 409, cuerpo: { ok: false, error: 'cadena_no_admite' } })
    expect(al.pedidos).toHaveLength(0)
    expect((await crear(almacen({ encendida: true }), { seco: false })).cuerpo).toMatchObject({ ok: true, estado: 'pedida' })
  })
  it('🔴 tope bajo el mínimo: 409 con el mínimo (24 para 14 días), y nada guardado', async () => {
    const al = almacen()
    const r = await crear(al, { tope_usd: 23.99 })
    expect(r).toMatchObject({ status: 409, cuerpo: { ok: false, error: 'tope_bajo_minimo', minimo_usd: 24 } })
    expect(al.pedidos).toHaveLength(0)
    expect(al.sobresEmitidos).toHaveLength(0)
  })
  it('🔴 justo el mínimo crea', async () => {
    expect((await crear(almacen(), { tope_usd: 24 })).cuerpo).toMatchObject({ ok: true, estado: 'pedida' })
  })
  it('🔴 CC5 21:48Z · rechazo por tope → la MISMA llave con un tope bueno → crea («pedida», no «ya_pedida»)', async () => {
    const al = almacen()
    expect((await crear(al, { tope_usd: 10 })).cuerpo.error).toBe('tope_bajo_minimo')
    const r = await crear(al, { tope_usd: 30 })
    expect(r).toMatchObject({ status: 200, cuerpo: { ok: true, estado: 'pedida', llave: llaveDelPedido } })
    expect(al.pedidos).toHaveLength(1)
  })
  it('🔴 lo mismo después de un 400: la llave sigue libre', async () => {
    const al = almacen()
    expect((await crear(al, { nombre: '' })).status).toBe(400)
    expect((await crear(al)).cuerpo.estado).toBe('pedida')
  })
  it('🔴 ensayo: dice lo que haría y no escribe nada', async () => {
    const al = almacen()
    const r = await crear(al, { ensayo: true })
    expect(r).toMatchObject({ status: 200, cuerpo: { ok: true, ensayo: true, escrituras: 0, haria: { minimo_usd: 24, pedido: { llave: llaveDelPedido, tope_usd: 30, pedido_por: 'emilio' } } } })
    expect(al.pedidos).toHaveLength(0)
    expect(al.sobresEmitidos).toHaveLength(0)
  })
})

describe('crear · guarda el pedido y deja el sobre', () => {
  it('🔴 el pedido queda con las 5 respuestas y el sobre lleva la llave, el nombre y el seco', async () => {
    const al = almacen()
    const r = await crear(al)
    expect(r.cuerpo).toMatchObject({ ok: true, estado: 'pedida', pedido_id: 'ped-1', llave: llaveDelPedido, despertado: true })
    expect(al.pedidos[0]).toMatchObject({ client_id: CLI, seco: true, llave: llaveDelPedido, nombre: 'Temporada de lluvias', cambio: BUENO.cambio, brief_libre: BUENO.brief_libre, fecha_inicio: '2026-10-12', fecha_fin: '2026-10-25', fechas_clave: BUENO.fechas_clave, tope_usd: 30, pedido_por: 'emilio', campana_id: null })
    expect(al.sobresEmitidos).toEqual([sobreDelPedido(al.pedidos[0], 'plan-1')])
    expect(al.sobresEmitidos[0]).toMatchObject({ source: 'planeacion/plan-listo', intent: 'briefear', payload: { client_id: CLI, plan_id: 'plan-1', dry_run: true, desde_worker: 'tablero/crear-campana', llave_de_campana: llaveDelPedido, nombre_de_campana: 'Temporada de lluvias' } })
  })
  it('🔴 la misma llave otra vez: «ya_pedida», un solo pedido; el sobre se repite con la misma llave y la sala no lo duplica', async () => {
    const al = almacen()
    await crear(al)
    const r = await crear(al, { nombre: 'Otro nombre', tope_usd: 99 })
    expect(r.cuerpo).toMatchObject({ ok: true, estado: 'ya_pedida', pedido_id: 'ped-1', llave: llaveDelPedido, despertado: true })
    expect(al.pedidos).toHaveLength(1)
    expect(al.pedidos[0]).toMatchObject({ nombre: 'Temporada de lluvias', tope_usd: 30 })
    expect(al.sobresEmitidos).toHaveLength(2)
    expect((al.sobresEmitidos[1] as { idempotency_key: string }).idempotency_key).toBe((al.sobresEmitidos[0] as { idempotency_key: string }).idempotency_key)
  })
  it('🔴 la sala no acepta el sobre: el pedido queda guardado y la respuesta dice despertado:false con el motivo', async () => {
    const al = new AlmacenMemoria({ contextos: { [CLI]: contextoDe(A) }, planes: { [CLI]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] }, config: {}, intakeApagado: true })
    const r = await crear(al)
    expect(r.cuerpo).toMatchObject({ ok: true, estado: 'pedida', despertado: false })
    expect(String(r.cuerpo.motivo_sin_despertar)).toMatch(/intake_apagado/)
    expect(al.pedidos).toHaveLength(1)
  })
  it('🔴 dos pestañas a la vez (la base contesta 23505): la segunda es «ya_pedida» del mismo pedido', async () => {
    const al = almacen()
    const original = al.pedidoPorLlave.bind(al)
    let primera = true
    const v = validarEntrada(BUENO)
    if (!v.ok) throw new Error('la entrada buena no valida')
    const { ensayo: _e, ...fila } = v.e
    al.pedidoPorLlave = async (...a: Parameters<typeof original>) => { if (primera) { primera = false; await al.insertarPedidoDeCampana({ ...fila, pedido_por: 'otra pestaña' }); return null } return original(...a) }
    const r = await crear(al)
    expect(r.cuerpo).toMatchObject({ ok: true, estado: 'ya_pedida', pedido_id: 'ped-1' })
    expect(al.pedidos).toHaveLength(1)
  })
})

describe('abrir con el pedido', () => {
  const abrir = (al: AlmacenMemoria, extra: Record<string, unknown> = {}) => abrirCampana(al, { ...wf, client_id: CLI, seco: true, llave_de_campana: llaveDelPedido, nombre_de_campana: 'Temporada de lluvias', ...extra }, AHORA)
  const idDe = (r: { cuerpo: Record<string, unknown> }) => (r.cuerpo.campana as { id: string }).id
  it('🔴 nace con las fechas del dueño (origen emilio), su tope y su nombre, y el pedido queda ligado a ella', async () => {
    const al = almacen(); await crear(al)
    const r = await abrir(al)
    expect(r.status).toBe(201)
    const c = al.campanas.find((x) => x.id === idDe(r)) as Campana
    expect(c).toMatchObject({ llave_de_campana: llaveDelPedido, fecha_inicio: '2026-10-12', fecha_fin: '2026-10-25', fecha_inicio_origen: 'emilio', tope_gasto_usd: 30, nombre_de_campana: 'Temporada de lluvias', seco: true })
    expect(r.cuerpo).toMatchObject({ pedido_id: 'ped-1' })
    expect(r.cuerpo.aviso_pedido).toBeUndefined()
    expect(al.pedidos[0].campana_id).toBe(c.id)
    expect(await al.pedidoDeLaCampana(c.id)).toMatchObject({ nombre: 'Temporada de lluvias', brief_libre: BUENO.brief_libre })
  })
  it('🔴 sin fechas en el pedido: la regla de siempre (día 1 = hoy), con el tope del pedido', async () => {
    const al = almacen(); await crear(al, { fecha_inicio: null, fecha_fin: null, fechas_clave: [], tope_usd: 60 })
    const id = idDe(await abrir(al))
    const c = al.campanas.find((x) => x.id === id) as Campana
    expect(c).toMatchObject({ fecha_inicio: '2026-10-12', fecha_inicio_origen: 'regla', tope_gasto_usd: 60 })
  })
  it('🔴 el mismo sobre otra vez: «ya abierta», la misma campaña, el pedido sigue ligado a ella', async () => {
    const al = almacen(); await crear(al)
    const a = idDe(await abrir(al)); const r = await abrir(al)
    expect(r.cuerpo).toMatchObject({ ya_abierta: true })
    expect(idDe(r)).toBe(a)
    expect(al.pedidos[0].campana_id).toBe(a)
    expect(al.campanas).toHaveLength(1)
  })
  it('🔴 si ligar falla, la campaña existe y lo dice; el siguiente sobre lo liga', async () => {
    const al = almacen(); await crear(al)
    al.falloAlLigar = 'la base no contestó'
    const r1 = await abrir(al)
    expect(r1.status).toBe(201)
    expect(String(r1.cuerpo.aviso_pedido)).toMatch(/no se pudo ligar/)
    expect(al.pedidos[0].campana_id).toBeNull()
    al.falloAlLigar = null
    const r2 = await abrir(al)
    expect(r2.cuerpo).toMatchObject({ ya_abierta: true })
    expect(r2.cuerpo.aviso_pedido).toBeUndefined()
    expect(al.pedidos[0].campana_id).toBe(idDe(r1))
  })
  it('🔴 cruce: OTRO cliente con la MISMA llave no ve el pedido; su campaña nace sin él y el pedido sigue libre para la suya', async () => {
    const al = almacen(); await crear(al)
    const r = await abrirCampana(al, { ...wf, client_id: OTRO_CLI, seco: true, llave_de_campana: llaveDelPedido }, AHORA)
    expect(r.status).toBe(201)
    const c = al.campanas.find((x) => x.id === idDe(r)) as Campana
    expect(c.client_id).toBe(OTRO_CLI)
    expect(c.fecha_inicio_origen).toBe('regla')
    expect(r.cuerpo.pedido_id).toBeUndefined()
    expect(al.pedidos[0].campana_id).toBeNull()
    // y el almacén, como el candado de la base, no deja ligar el pedido a la campaña de otro cliente
    await expect(al.ligarPedidoDeCampana('ped-1', c.id)).rejects.toThrow(/no es la de este pedido/)
  })
  it('🔴 cruce: el pedido en seco no lo usa una apertura de verdad con la misma llave', async () => {
    const al = almacen({ encendida: true }); await crear(al)
    const r = await abrirCampana(al, { ...wf, client_id: CLI, seco: false, llave_de_campana: llaveDelPedido }, AHORA)
    expect(r.status).toBe(201)
    expect(r.cuerpo.pedido_id).toBeUndefined()
    expect(al.pedidos[0].campana_id).toBeNull()
  })
  it('🔴 CC6 m15 · pedido YA ligado: repetir el POST es «ya_pedida» con su campaña y NO vuelve a mandar el sobre', async () => {
    const al = almacen(); await crear(al)
    const id = idDe(await abrir(al))
    const antes = al.sobresEmitidos.length
    const r = await crear(al)
    expect(r.cuerpo).toMatchObject({ ok: true, estado: 'ya_pedida', pedido_id: 'ped-1', campana_id: id })
    expect(r.cuerpo.despertado).toBeUndefined()
    expect(al.sobresEmitidos).toHaveLength(antes)
  })
  it('🔴 CC6 a4 · el sobre llega SIN nombre pero con la llave del pedido: la campaña nace con el nombre del pedido', async () => {
    const al = almacen(); await crear(al)
    const r = await abrirCampana(al, { ...wf, client_id: CLI, seco: true, llave_de_campana: llaveDelPedido }, AHORA)
    expect(r.status).toBe(201)
    expect((al.campanas.find((x) => x.id === idDe(r)) as Campana).nombre_de_campana).toBe('Temporada de lluvias')
  })
  it('🔴 sin llave, la apertura de siempre no mira pedidos', async () => {
    const al = almacen(); await crear(al)
    const r = await abrirCampana(al, { ...wf, client_id: CLI, seco: true }, AHORA)
    expect(r.status).toBe(201)
    expect(r.cuerpo.pedido_id).toBeUndefined()
    expect(al.pedidos[0].campana_id).toBeNull()
  })
})

describe('el tablero', () => {
  it('🔴 «crear-campana» es una acción del tablero', () => {
    expect(typeof ACCIONES['crear-campana']).toBe('function')
  })
  it('🔴 CC7 t2 · el pedido lleva a QUIEN lo pidió (el reviewer), no un nombre fijo', async () => {
    const al = almacen()
    const r = await crearCampanaDelTablero(() => al)({ ahora: () => new Date(AHORA) } as never, { cuerpo: { ...BUENO }, reviewer: 'socia-de-emilio' })
    expect(r.cuerpo).toMatchObject({ ok: true, estado: 'pedida' })
    expect(al.pedidos[0].pedido_por).toBe('socia-de-emilio')
    expect(r.toca).toEqual({ client_id: CLI, comentario: 'Temporada de lluvias' })
  })
})

describe('CC7 · lo que sobrevivía a #1259 f609d64', () => {
  it('🔴 c25 · dos pedidos del mismo cliente con llaves distintas: dos sobres con llaves de sala distintas, y las dos campañas abren', async () => {
    const al = almacen()
    const otra = '7f1c2e3d-4a5b-4c6d-8e9f-0a1b2c3d4e60'
    expect((await crear(al)).cuerpo).toMatchObject({ estado: 'pedida', despertado: true })
    expect((await crear(al, { llave_formulario: otra, nombre: 'Navidad' })).cuerpo).toMatchObject({ estado: 'pedida', despertado: true })
    const llaves = al.sobresEmitidos.map((s) => (s as { idempotency_key: string }).idempotency_key)
    expect(new Set(llaves).size).toBe(2)
    const abrirCon = (llave: string) => abrirCampana(al, { ...wf, client_id: CLI, seco: true, llave_de_campana: llave }, AHORA)
    expect((await abrirCon(llaveDelPedido)).status).toBe(201)
    expect((await abrirCon(PREFIJO_DE_LA_LLAVE + otra)).status).toBe(201)
    expect(al.pedidos.map((p) => p.campana_id).filter(Boolean)).toHaveLength(2)
  })
  it('🔴 c13 · seco o ensayo escritos como texto: 400 (no se leen como «de verdad»)', async () => {
    const al = almacen()
    expect(await crear(al, { seco: 'true' })).toMatchObject({ status: 400, cuerpo: { campo: 'seco' } })
    expect(await crear(al, { ensayo: 'true' })).toMatchObject({ status: 400, cuerpo: { campo: 'ensayo' } })
    expect(al.pedidos).toHaveLength(0)
  })
  it('🔴 c27 · «hoy» es el del cliente: a las 22:00 de Ecuador (03:00Z del día siguiente) una campaña que empieza hoy pasa', async () => {
    const al = new AlmacenMemoria({
      contextos: { [CLI]: { ...contextoDe(A), zonaHoraria: 'America/Guayaquil' } },
      planes: { [CLI]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
      config: { flujos: ['wf-cadena'], puerta_workflow_id: 'wf-puerta' },
    })
    const r = await crearCampana(al, { ...BUENO }, 'emilio', '2026-10-13T03:00:00Z')
    expect(r.cuerpo).toMatchObject({ ok: true, estado: 'pedida' })
    // y el día anterior en Ecuador sí es «antes de hoy»
    expect((await crearCampana(al, { ...BUENO, llave_formulario: '7f1c2e3d-4a5b-4c6d-8e9f-0a1b2c3d4e61', fecha_inicio: '2026-10-11' }, 'emilio', '2026-10-13T03:00:00Z')).cuerpo).toMatchObject({ campo: 'fecha_inicio', detalle: 'fechas: el inicio no puede ser antes de hoy (2026-10-12)' })
  })
  it('🔴 c5 · tope: 1 000 000 se acepta; 1 000 000,01 es 400', async () => {
    expect((await crear(almacen(), { tope_usd: 1_000_000 })).cuerpo).toMatchObject({ ok: true, estado: 'pedida' })
    expect(await crear(almacen(), { tope_usd: 1_000_000.01 })).toMatchObject({ status: 400, cuerpo: { campo: 'tope_usd' } })
  })
  it('🔴 c11 · el «qué» de una fecha clave: 120 caracteres pasa, 121 es 400', async () => {
    expect((await crear(almacen(), { fechas_clave: [{ fecha: '2026-10-20', que: 'q'.repeat(120) }] })).cuerpo).toMatchObject({ estado: 'pedida' })
    expect(await crear(almacen(), { fechas_clave: [{ fecha: '2026-10-20', que: 'q'.repeat(121) }] })).toMatchObject({ status: 400, cuerpo: { campo: 'fechas_clave' } })
  })
  it('🔴 c29 · el GET del mínimo con el fin antes (o igual) que el inicio: 400', async () => {
    const al = almacen()
    expect((await minimoParaElFormulario(al, { client_id: CLI, fecha_inicio: '2026-10-20', fecha_fin: '2026-10-12' }, AHORA)).status).toBe(400)
    expect((await minimoParaElFormulario(al, { client_id: CLI, fecha_inicio: '2026-10-20', fecha_fin: '2026-10-20' }, AHORA)).status).toBe(400)
  })
})
