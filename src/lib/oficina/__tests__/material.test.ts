/**
 * EL MATERIAL QUE LA OFICINA LE PIDE AL PORTERO (GO de Lenovo 27-oct) · US$ 0: portero y generador simulados, sin red, sin base real.
 * Cubre las 5 condiciones de CC#3 sobre el portero: ① el turno se guarda ANTES del pedido y el aviso que llega antes de que termine el flujo reanuda el MISMO paso; ② el portero que calla no cuelga la pieza;
 * ④ sin gasto doble (pedido determinista, «negado por tope» = sin dato); ⑤ UNA sola implementación del filtro propio/competencia. La ruta de vuelta (condición ③) está en __tests__/oficina-material-ruta.test.ts.
 */
import { describe, expect, it } from 'vitest'
import { candidatasFoto, type FotoEtiquetada } from '../fotos'
import { origenesDeImagenes } from '../marcas-de-origen'
import { idDelPedido, leerRespuestaDelPortero, limitesDeMaterial, necesidadesQueBloquean, refDeQuienPide, separarFotos, type PedidoAlPortero } from '../material'
import { materialDe, recibirMaterial } from '../material-orquestador'
import { abrirEncargo } from '../orquestador'
import { POST_IMG } from '../plantillas/post-img'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { revisarPasosMuertos } from '../vigia'
import { DbFalsa } from './dbfalsa'
import { BUENOS_PROMPTS, CLIENTE, FICHAS_VACIAS, FUENTES, PARTE, PIEZA_OK, correr, crearMemoria, direccionGenerada, observacion, type Guion, type Memoria } from './memoria'

const indicesDe = (t: string) => [...t.matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))
const guion = (o: Partial<Guion> = {}): Guion => ({
  paquete: () => ({ texto: 'material del portero' }),
  direccion_visual: () => ({ texto: direccionGenerada() }),
  prompts: () => ({ texto: BUENOS_PROMPTS }),
  mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }),
  texto: () => ({ texto: PIEZA_OK }),
  revision_jefe: () => ({ texto: FICHAS_VACIAS }),
  corrige: () => ({ texto: '{"respuestas": []}' }), decide: () => ({ texto: '{"respuestas": []}' }), decide_imagen: () => ({ texto: '{"respuestas": []}' }),
  reimagen_prompts: () => ({ texto: BUENOS_PROMPTS }), reimagen_mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }),
  ...o,
})

/** una foto PROPIA bien etiquetada que muestra OTRO producto (encebollado) cuando el brief es de ceviche: «material cercano» */
const FOTO_CERCANA: FotoEtiquetada = { id: 'cerca-1', url: 'https://fotos.test/cerca-1.jpg', estado: 'ok', que_muestra: 'Un plato de encebollado con yuca', producto_visto: ['Encebollado'], texto_visible: null, con_personas: false, tipo_de_toma: 'producto', formato: 'cuadrado', etiqueta_confianza: 'alta', origen: 'propia' }

/** una foto PROPIA apta: muestra el protagonista del brief (ceviche) */
const FOTO_BUENA: FotoEtiquetada = { ...FOTO_CERCANA, id: 'buena-1', url: 'https://fotos.test/buena-1.jpg', que_muestra: 'Un plato de ceviche completo', producto_visto: ['Ceviches'] }

type Respuesta = { ok: true; body: Record<string, unknown> } | { ok: false; error: string; http?: number }
const EN_PROCESO: Respuesta = { ok: true, body: { estado: 'en_proceso', huecos: [{ hueco: { tipo: 'fotos' }, estado: 'en_cadena' }] } }
const conFotos = (costo = 0.12): Record<string, unknown> => ({ estado: 'completo', costo_usd: costo, huecos: [{ hueco: { tipo: 'fotos' }, estado: 'ya_esta', detalle: 'tenía fotos', fotos: [{ foto_id: 'p-1', origen: 'propia', que_muestra: 'ceviche', producto_visto: ['Ceviches'], url: 'https://fotos.test/p-1.jpg' }] }] })
const sinNada: Record<string, unknown> = { estado: 'completo', costo_usd: 0.05, huecos: [{ hueco: { tipo: 'fotos' }, estado: 'no_resuelto', detalle: 'no hay' }] }

interface Escena { limites?: Record<string, unknown>; fotos?: FotoEtiquetada[]; dry?: boolean; responder?: (p: PedidoAlPortero) => Respuesta; leer?: (id: string) => Respuesta; antes?: (p: PedidoAlPortero, M: Memoria, id: string, traer: (f: FotoEtiquetada[]) => void) => Promise<void> }
async function escena(o: Escena = {}) {
  const plantilla = { ...POST_IMG, limites: { ...POST_IMG.limites, material_activo: true, ...(o.limites ?? {}) } }
  const M = crearMemoria({ plantilla })
  let traidas: FotoEtiquetada[] = []
  M.P.fuentes = async () => ({ ...FUENTES, fotos: [...(o.fotos ?? []), ...traidas] })
  const llamadas = { pedir: [] as PedidoAlPortero[], leer: [] as string[] }
  let id = ''
  M.P.cerebro = {
    avisarA: 'https://zero-risk-platform.vercel.app/api/oficina/material-vuelta',
    pedir: async (p) => { llamadas.pedir.push(p); await o.antes?.(p, M, id, (f) => { traidas = f }); return (o.responder ?? (() => EN_PROCESO))(p) },
    leerPedido: async (i) => { llamadas.leer.push(i); return (o.leer ?? (() => EN_PROCESO))(i) },
  }
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: o.dry ?? false, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  id = String(a.cuerpo.encargo_id)
  return { M, id, llamadas, traer: (f: FotoEtiquetada[]) => { traidas = f } }
}
const arte = (M: Memoria, id: string, n: string) => M.encargos.get(id)!.estado_del_motor.artefactos[n]?.datos as Record<string, any>
const aviso = (id: string, n: number, cuerpo: Record<string, unknown>) => ({ pedido_id: idDelPedido(id, n, 'foto'), ref_de_quien_pide: refDeQuienPide(id, n), ...cuerpo })
const PASOS_NORMALES = ['paquete', 'direccion_visual', 'prompts', 'mirar', 'texto', 'revision_jefe']

describe('APAGADO es el comportamiento de hoy', () => {
  it('sin `material_activo` la oficina no le pide nada al portero aunque falten fotos', async () => {
    const { M, id, llamadas } = await escena({ limites: { material_activo: false }, fotos: [] })
    const { ultima, pasos } = await correr(M, id, guion())
    expect(llamadas.pedir).toHaveLength(0)
    expect(pasos).toEqual(PASOS_NORMALES)
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(M.turnos.get(id) ? [...M.turnos.get(id)!.values()].some((t) => t.tipo === 'material') : false).toBe(false)
  })
  it('`material_activo` solo vale si es el booleano true (la cadena «true» no enciende nada)', () => {
    expect(limitesDeMaterial({ material_activo: 'true' }).activo).toBe(false)
    expect(limitesDeMaterial({ material_activo: 1 }).activo).toBe(false)
    expect(limitesDeMaterial({ material_activo: true }).activo).toBe(true)
    expect(limitesDeMaterial(undefined).activo).toBe(false)
  })
  it('con el material encendido y fotos de sobra no se pide nada', async () => {
    const { M, id, llamadas } = await escena({ fotos: [FOTO_BUENA] })
    const { pasos } = await correr(M, id, guion())
    expect(llamadas.pedir).toHaveLength(0)
    expect(pasos).toEqual(PASOS_NORMALES)
  })
})

describe('el umbral de «falta» es DATO de la plantilla', () => {
  it('con `material_fotos_minimas` alto se pide aunque haya fotos; con 0 jamás se pide', async () => {
    const alto = await escena({ fotos: [FOTO_BUENA], limites: { material_fotos_minimas: 99 } })
    await correr(alto.M, alto.id, guion())
    expect(alto.llamadas.pedir).toHaveLength(1)
    const cero = await escena({ fotos: [], limites: { material_fotos_minimas: 0 } })
    await correr(cero.M, cero.id, guion())
    expect(cero.llamadas.pedir).toHaveLength(0)
  })
  it('dos clientes sintéticos con distinta cantidad de fotos: el que no llega al mínimo pide, el que llega no', async () => {
    const pocos = await escena({ fotos: [FOTO_BUENA].slice(0, 1).map((f) => ({ ...f, producto_visto: ['Encebollados'] })) })
    await correr(pocos.M, pocos.id, guion())
    const muchos = await escena({ fotos: [FOTO_BUENA] })
    await correr(muchos.M, muchos.id, guion())
    expect(pocos.llamadas.pedir).toHaveLength(1)
    expect(muchos.llamadas.pedir).toHaveLength(0)
  })
})

describe('① el turno `material` se guarda ANTES del pedido y se reanuda en el MISMO paso', () => {
  it('el turno ya está abierto (y el material «abierto» en el estado) cuando el pedido sale; el pedido lleva avisar_a, ref y un pedido_id uuid determinista', async () => {
    let visto: { turno: unknown; material: unknown } | null = null
    const { M, id, llamadas } = await escena({ fotos: [], antes: async (_p, m, i) => { visto = { turno: [...m.turnos.get(i)!.values()].find((t) => t.tipo === 'material'), material: materialDe(m.encargos.get(i)!.estado_del_motor) } } })
    const { ultima } = await correr(M, id, guion())
    expect(visto!.turno).toMatchObject({ tipo: 'material', estado: 'corriendo', paso: 'elegir_foto' })
    expect(visto!.material).toMatchObject({ estado: 'abierto', clase: 'foto', paso: 'elegir_foto' })
    expect(ultima.cuerpo).toMatchObject({ accion: 'esperar_material', turno: { tipo: 'material' } })
    const p = llamadas.pedir[0]
    expect(p.avisar_a).toBe('https://zero-risk-platform.vercel.app/api/oficina/material-vuelta')
    expect(p.pedido_id).toBe(idDelPedido(id, (visto!.turno as { n: number }).n, 'foto'))
    expect(p.pedido_id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[0-9a-f]{4}-[0-9a-f]{12}$/)
    expect(p.ref_de_quien_pide).toBe(refDeQuienPide(id, (visto!.turno as { n: number }).n))
    expect(p.workflow_id && p.workflow_execution_id).toBeTruthy()
    expect(M.encargos.get(id)!.estado).toBe('en_paso')
  })
  it('el AVISO reanuda el encargo en el MISMO paso: las fotos nuevas ya cuentan y la pieza sigue hasta la bandeja', async () => {
    const { M, id, traer } = await escena({ fotos: [] })
    const { ultima } = await correr(M, id, guion())
    const n = (ultima.cuerpo.turno as { n: number }).n
    traer([FOTO_BUENA])
    const r = await recibirMaterial(M.P, aviso(id, n, conFotos()))
    expect(r.cuerpo).toMatchObject({ accion: 'esperar', turno: { paso: 'direccion_visual' } })
    expect(arte(M, id, 'candidatas_foto').candidatas.length).toBeGreaterThan(0)
    expect(materialDe(M.encargos.get(id)!.estado_del_motor)).toMatchObject({ estado: 'resuelto', resultado: { estado: 'resuelto', cerrado_por: 'aviso' } })
    const fin = await correr(M, id, guion())
    expect(fin.ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(M.llamadas.bandeja).toHaveLength(1)
  })
  it('un aviso que llega ANTES de que el pedido termine de volver reanuda igual (el turno ya estaba guardado) y no se cierra dos veces', async () => {
    let aviso1: unknown
    const { M, id, llamadas } = await escena({
      fotos: [],
      antes: async (p, m, i, traer) => { traer([FOTO_BUENA]); aviso1 = (await recibirMaterial(m.P, { pedido_id: p.pedido_id, ref_de_quien_pide: p.ref_de_quien_pide, ...conFotos() })).cuerpo; void i },
    })
    const r = await correr(M, id, guion())
    expect(aviso1).toMatchObject({ accion: 'esperar', turno: { paso: 'direccion_visual' } })
    expect(r.ultima.cuerpo.accion).toBe('esperar_material') // la respuesta vieja del flujo que pidió: ese flujo termina; quien reanuda es el aviso
    expect(llamadas.pedir).toHaveLength(1)
    expect([...M.turnos.get(id)!.values()].filter((t) => t.tipo === 'material')).toHaveLength(1)
    expect(M.gastos.filter((g) => g.ref_tabla === 'cerebro_pedidos')).toHaveLength(1)
    const fin = await correr(M, id, guion())
    expect(fin.ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
  })
  it('un «siguiente» repetido mientras espera NO abre otro pedido: contesta esperar_material otra vez', async () => {
    const { M, id, llamadas } = await escena({ fotos: [] })
    await correr(M, id, guion())
    const { avanzar } = await import('../orquestador')
    const otra = await avanzar(M.P, id)
    expect(otra.cuerpo).toMatchObject({ accion: 'esperar_material', reentrega: true })
    expect(llamadas.pedir).toHaveLength(1)
  })
})

describe('el aviso: idempotente, ajeno o tardío no hace nada', () => {
  it('repetido = sin_efecto; de otro turno o de otro pedido = sin_efecto; sin ref = 400', async () => {
    const { M, id, traer } = await escena({ fotos: [] })
    const { ultima } = await correr(M, id, guion())
    const n = (ultima.cuerpo.turno as { n: number }).n
    expect((await recibirMaterial(M.P, aviso(id, n + 1, conFotos()))).cuerpo.accion).toBe('sin_efecto') // otro turno
    expect((await recibirMaterial(M.P, { ...aviso(id, n, conFotos()), pedido_id: idDelPedido(id, n, 'hecho') })).cuerpo.accion).toBe('sin_efecto') // otro pedido
    expect((await recibirMaterial(M.P, { ...aviso(id, n, conFotos()), ref_de_quien_pide: refDeQuienPide('00000000-0000-4000-8000-0000000000ff', n) })).status).toBe(404)
    expect((await recibirMaterial(M.P, { pedido_id: 'x' })).status).toBe(400)
    expect(materialDe(M.encargos.get(id)!.estado_del_motor)!.estado).toBe('abierto') // nada de eso lo cerró
    traer([FOTO_BUENA])
    expect((await recibirMaterial(M.P, aviso(id, n, conFotos()))).cuerpo.accion).toBe('esperar')
    expect((await recibirMaterial(M.P, aviso(id, n, conFotos()))).cuerpo.accion).toBe('sin_efecto') // repetido
    expect(M.gastos.filter((g) => g.ref_tabla === 'cerebro_pedidos')).toHaveLength(1)
  })
  it('un aviso tardío (el vigía ya siguió sin dato) no revive ni cobra otra vez', async () => {
    const { M, id } = await escena({ fotos: [] })
    const { ultima } = await correr(M, id, guion())
    const n = (ultima.cuerpo.turno as { n: number }).n
    const db = new DbFalsa()
    db.semilla('oficina_turnos', [{ encargo_id: id, n, paso: 'elegir_foto', tipo: 'material', estado: 'corriendo', inicio: '2026-10-10T11:00:00Z' }])
    M.P.ahora = () => new Date('2026-10-10T12:00:00Z')
    await revisarPasosMuertos(M.P, db as never, new Date('2026-10-10T11:31:00Z'))
    expect(materialDe(M.encargos.get(id)!.estado_del_motor)).toMatchObject({ estado: 'resuelto', resultado: { estado: 'sin_dato', cerrado_por: 'plazo' } })
    const gastoAntes = M.encargos.get(id)!.gasto_usd
    expect((await recibirMaterial(M.P, aviso(id, n, conFotos(0.3)))).cuerpo.accion).toBe('sin_efecto')
    expect(M.encargos.get(id)!.gasto_usd).toBe(gastoAntes)
  })
})

describe('② el portero que calla no cuelga la pieza (reloj del vigía)', () => {
  async function esperando() {
    const E = await escena({ fotos: [] })
    const { ultima } = await correr(E.M, E.id, guion())
    const n = (ultima.cuerpo.turno as { n: number }).n
    const db = new DbFalsa()
    const inicio = new Date('2026-10-10T11:00:00Z')
    db.semilla('oficina_turnos', [{ encargo_id: E.id, n, paso: 'elegir_foto', tipo: 'material', estado: 'corriendo', inicio: inicio.toISOString() }])
    const en = (min: number) => new Date(inicio.getTime() + min * 60_000)
    return { ...E, n, db, en }
  }
  it('NO es un paso muerto a los 12 min ni a los 19: no se toca, no falla, no se reintenta', async () => {
    const { M, id, db, en, llamadas } = await esperando()
    for (const min of [13, 19]) expect(await revisarPasosMuertos(M.P, db as never, en(min))).toEqual({ reanudar: [], fallidos: [], cierres: [] })
    expect(M.encargos.get(id)!.estado).toBe('en_paso')
    expect(llamadas.leer).toHaveLength(0)
  })
  it('a los 20 min lee el pedido por su cuenta: si el portero ya terminó, cierra con lo que halló', async () => {
    const E = await esperando()
    E.traer([FOTO_BUENA])
    const M = E.M
    const lec = E.llamadas
    ;(M.P.cerebro as { leerPedido: unknown }).leerPedido = async (i: string) => { lec.leer.push(i); return { ok: true, body: conFotos() } }
    const r = await revisarPasosMuertos(M.P, E.db as never, E.en(21))
    expect(r.reanudar).toEqual([E.id])
    expect(lec.leer).toEqual([idDelPedido(E.id, E.n, 'foto')])
    expect(materialDe(M.encargos.get(E.id)!.estado_del_motor)).toMatchObject({ resultado: { estado: 'resuelto', cerrado_por: 'vigia' } })
  })
  it('entre los 20 y los 30 min, si el portero sigue en proceso, espera; pasados los 30 sigue SIN dato y la pieza se genera (nunca una lámina vacía, nunca colgada)', async () => {
    const { M, id, db, en, llamadas } = await esperando()
    expect(await revisarPasosMuertos(M.P, db as never, en(25))).toEqual({ reanudar: [], fallidos: [], cierres: [] })
    expect(llamadas.leer).toHaveLength(1)
    const r = await revisarPasosMuertos(M.P, db as never, en(31))
    expect(r.reanudar).toEqual([id]); expect(r.fallidos).toEqual([])
    expect(materialDe(M.encargos.get(id)!.estado_del_motor)).toMatchObject({ estado: 'resuelto', resultado: { estado: 'sin_dato', cerrado_por: 'plazo' } })
    expect(M.encargos.get(id)!.estado_del_motor.fichas.some((f) => f.id === 'material-foto-sin_dato' && f.gravedad === 'sugerencia')).toBe(true)
    const fin = await correr(M, id, guion())
    expect(fin.ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(M.llamadas.imagen).toBeGreaterThan(0) // se generó
    expect(M.llamadas.bandeja).toHaveLength(1)
  })
  it('el plazo y el techo son dato de plantilla', async () => {
    const E = await escena({ fotos: [], limites: { material_plazo_min: 5, material_techo_min: 8 } })
    const { ultima } = await correr(E.M, E.id, guion())
    const db = new DbFalsa(); const ini = new Date('2026-10-10T11:00:00Z')
    db.semilla('oficina_turnos', [{ encargo_id: E.id, n: (ultima.cuerpo.turno as { n: number }).n, paso: 'elegir_foto', tipo: 'material', estado: 'corriendo', inicio: ini.toISOString() }])
    // mientras tanto el dato de 12 min del paso muerto no aplica: a los 13 min ya pasó el techo de 8 y se sigue
    const r = await revisarPasosMuertos(E.M.P, db as never, new Date(ini.getTime() + 13 * 60_000))
    expect(r.reanudar).toEqual([E.id])
  })
})

describe('④ sin gasto doble; «negado por tope» es sin dato, no un error', () => {
  it('el portero niega por tope (HTTP 429): la pieza sigue, no falla, no se cobra nada y queda la ficha sugerencia', async () => {
    const { M, id } = await escena({ fotos: [], responder: () => ({ ok: false, error: 'tope diario de la oficina', http: 429 }) })
    const { ultima, pasos } = await correr(M, id, guion())
    expect(pasos).toEqual(PASOS_NORMALES)
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(materialDe(M.encargos.get(id)!.estado_del_motor)).toMatchObject({ estado: 'resuelto', resultado: { estado: 'negado' } })
    expect(M.gastos.filter((g) => g.ref_tabla === 'cerebro_pedidos')).toHaveLength(0)
    expect(M.encargos.get(id)!.estado_del_motor.fichas.find((f) => f.id === 'material-foto-negado')).toMatchObject({ gravedad: 'sugerencia' })
  })
  it('un hueco con estado `tope` o el portero apagado también son sin dato (no error)', () => {
    expect(leerRespuestaDelPortero({ huecos: [{ estado: 'tope' }] }, 'foto').estado).toBe('negado')
    expect(leerRespuestaDelPortero({ apagado: true }, 'foto').estado).toBe('negado')
    expect(leerRespuestaDelPortero({ huecos: [{ estado: 'seco' }] }, 'foto').estado).toBe('seco')
    expect(leerRespuestaDelPortero({ huecos: [{ estado: 'no_resuelto', detalle: 'no hay' }] }, 'foto').estado).toBe('sin_dato')
  })
  it('un error de red al pedir (sin HTTP) es sin dato y la pieza sigue', async () => {
    const { M, id } = await escena({ fotos: [], responder: () => ({ ok: false, error: 'fetch failed' }) })
    const { ultima } = await correr(M, id, guion())
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado' })
    expect(materialDe(M.encargos.get(id)!.estado_del_motor)!.resultado!.estado).toBe('sin_dato')
  })
  it('un solo pedido por clase y por encargo: repetir `siguiente` y el aviso no pagan dos veces; el costo se topa en `material_tope_usd`', async () => {
    const { M, id, llamadas } = await escena({ fotos: [], responder: () => ({ ok: true, body: conFotos(5) }), antes: async (_p, _m, _i, traer) => traer([FOTO_BUENA]) })
    await correr(M, id, guion())
    const { avanzar } = await import('../orquestador')
    await avanzar(M.P, id); await avanzar(M.P, id)
    expect(llamadas.pedir).toHaveLength(1)
    const g = M.gastos.filter((x) => x.ref_tabla === 'cerebro_pedidos')
    expect(g).toHaveLength(1)
    expect(g[0].cost_usd).toBe(0.4) // el portero dijo 5: la oficina carga como máximo su tope
    expect(g[0].ref_id).toBe(idDelPedido(id, (([...M.turnos.get(id)!.values()].find((t) => t.tipo === 'material'))!).n, 'foto'))
  })
  it('el costo que trae el AVISO también se topa en `material_tope_usd` (el portero dice 5, la oficina carga 0,40)', async () => {
    const { M, id, traer } = await escena({ fotos: [] })
    const { ultima } = await correr(M, id, guion())
    traer([FOTO_BUENA])
    await recibirMaterial(M.P, aviso(id, (ultima.cuerpo.turno as { n: number }).n, conFotos(5)))
    expect(M.gastos.filter((x) => x.ref_tabla === 'cerebro_pedidos').map((x) => x.cost_usd)).toEqual([0.4])
  })
  it('si el aviso llega mientras el pedido vuelve con su respuesta, el material se cierra UNA sola vez (un artefacto, un cobro)', async () => {
    const { M, id } = await escena({
      fotos: [],
      responder: () => ({ ok: true, body: conFotos(0.12) }),
      antes: async (p, m, _i, traer) => { traer([FOTO_BUENA]); await recibirMaterial(m.P, { pedido_id: p.pedido_id, ref_de_quien_pide: p.ref_de_quien_pide, ...conFotos(0.12) }) },
    })
    await correr(M, id, guion())
    expect(M.artefactos.filter((a) => a.encargo_id === id && a.tipo === 'material')).toHaveLength(1)
    expect(M.gastos.filter((g) => g.ref_tabla === 'cerebro_pedidos')).toHaveLength(1)
    expect(M.encargos.get(id)!.estado_del_motor.pasos_ejecutados).toBeGreaterThan(0)
    const fin = await correr(M, id, guion())
    expect(fin.ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
  })
  it('el pedido_id es determinista por (encargo, turno, clase) y distinto entre clases', () => {
    const e = '00000000-0000-4000-8000-000000000001'
    expect(idDelPedido(e, 3, 'foto')).toBe(idDelPedido(e, 3, 'foto'))
    expect(idDelPedido(e, 3, 'foto')).not.toBe(idDelPedido(e, 4, 'foto'))
    expect(idDelPedido(e, 3, 'foto')).not.toBe(idDelPedido(e, 3, 'hecho'))
  })
  it('dry_run: no se llama al portero; el material se cierra como «seco» y la pieza sigue', async () => {
    const { M, id, llamadas } = await escena({ fotos: [], dry: true })
    const { ultima } = await correr(M, id, guion())
    expect(llamadas.pedir).toHaveLength(0)
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado', simulado: true })
    expect(materialDe(M.encargos.get(id)!.estado_del_motor)).toMatchObject({ resultado: { estado: 'seco', cerrado_por: 'ensayo' } })
    expect(M.gastos.filter((g) => g.ref_tabla === 'cerebro_pedidos')).toHaveLength(0)
  })
})

describe('el material CERCANO es una respuesta válida (con su etiqueta)', () => {
  it('una foto propia que no muestra el protagonista entra como candidata «cercana» solo con el material encendido', async () => {
    const encendido = await escena({ fotos: [FOTO_CERCANA], responder: () => ({ ok: true, body: sinNada }) })
    await correr(encendido.M, encendido.id, guion())
    const c = arte(encendido.M, encendido.id, 'candidatas_foto')
    expect(c.cercanas).toEqual(['cerca-1'])
    expect(c.candidatas[0].motivo_de_aceptacion).toMatch(/CERCANA/)
    const apagado = await escena({ fotos: [FOTO_CERCANA], limites: { material_activo: false } })
    await correr(apagado.M, apagado.id, guion())
    expect(arte(apagado.M, apagado.id, 'candidatas_foto').candidatas).toHaveLength(0)
  })
  it('lo que el portero devuelve de otro origen es «cercano» (válido) y nunca se vuelve candidata', () => {
    const r = leerRespuestaDelPortero({ huecos: [{ estado: 'no_resuelto', fotos: [{ foto_id: 'c-9', origen: 'competencia', que_muestra: 'ceviche de otra cuenta', url: 'https://x.test/c.jpg' }] }] }, 'foto')
    expect(r.estado).toBe('cercano')
    expect(r.fotos[0].origen).toBe('competencia')
  })
  it('la marca de origen por imagen: propia · cercana · generada · tipográfica', () => {
    const base = { version: 1, version_consumida: 0 }
    const e = (vd: unknown, cands: unknown = { candidatas: [] }) => ({ artefactos: { visual_direction: { ...base, datos: vd }, candidatas_foto: { ...base, datos: cands } } }) as never
    expect(origenesDeImagenes(e({ decision: { modo: 'real', foto_id: 'a' } }, { candidatas: [{ id: 'a' }] }))!.por_imagen[0].origen).toBe('foto_propia')
    expect(origenesDeImagenes(e({ decision: { modo: 'real', foto_id: 'a' } }, { candidatas: [{ id: 'a', cercana: true }] }))!.por_imagen[0].origen).toBe('foto_cercana')
    expect(origenesDeImagenes(e({ decision: { modo: 'generada' } }))!.por_imagen[0].origen).toBe('generada')
    const l = origenesDeImagenes(e({ imagenes: [{ ref: 'hook', modo: 'generada' }, { ref: 'cta', modo: 'ninguna' }, { ref: 'proof', modo: 'ninguna' }] }))!
    expect(l.por_imagen.map((x) => x.origen)).toEqual(['generada', 'tipografica', 'sin_imagen'])
    expect(l.resumen).toMatch(/1 imagen generada con IA · 1 lámina tipográfica de marca · 1 sin imagen/)
  })
  it('la bandeja trae la marca de origen solo si la plantilla la pide', async () => {
    const con = await escena({ fotos: [FOTO_BUENA], limites: { generar_cuando_no_hay_foto: true } })
    await correr(con.M, con.id, guion())
    expect(con.M.llamadas.bandeja[0].metadata).toMatchObject({ origen_de_imagenes_resumen: expect.stringMatching(/generada/) })
    expect(String(con.M.llamadas.bandeja[0].vista_previa)).toMatch(/^🖼️ /)
    const sin = await escena({ fotos: [FOTO_BUENA], limites: { material_activo: false } })
    await correr(sin.M, sin.id, guion())
    expect((sin.M.llamadas.bandeja[0].metadata as Record<string, unknown>).origen_de_imagenes_resumen).toBeUndefined()
  })
})

describe('⑤ UNA sola implementación del filtro propio / competencia / referencia', () => {
  const buena = (id: string, origen?: 'propia' | 'competencia' | 'referencia'): FotoEtiquetada => ({ ...FOTO_CERCANA, id, producto_visto: ['Ceviches'], ...(origen ? { origen } : {}) })
  const propios = FUENTES.propios
  it('una foto de la competencia o de referencia NUNCA es candidata, aunque esté perfecta', () => {
    const r = candidatasFoto([buena('a', 'propia'), buena('b', 'competencia'), buena('c', 'referencia')], { protagonista: ['Ceviches'], prohibe_personas: false, proporcion: '1:1' }, propios)
    expect(r.candidatas.map((x) => x.id)).toEqual(['a'])
    expect(r.descartadas.map((x) => x.id).sort()).toEqual(['b', 'c'])
    expect(r.descartadas[0].motivos.join(' ')).toMatch(/solo sirve como referencia de estilo/)
  })
  it('tampoco con `permitir_cercanas`', () => {
    const r = candidatasFoto([buena('b', 'competencia')], { protagonista: ['Pizza'], prohibe_personas: false, proporcion: '1:1', permitir_cercanas: true }, propios)
    expect(r.candidatas).toHaveLength(0)
  })
  it('al leer la base: owner_role propio → fotos del cliente; competidor/referencia/vacío → referencias (lo dudoso se trata como ajeno)', () => {
    const { propias, referencias } = separarFotos([{ id: '1', owner_role: 'propio' }, { id: '2', owner_role: 'competidor' }, { id: '3', owner_role: 'referencia' }, { id: '4', owner_role: null }, { id: '5' }])
    expect(propias.map((f) => f.id)).toEqual(['1'])
    expect(referencias.map((f) => [f.id, f.origen])).toEqual([['2', 'competencia'], ['3', 'referencia'], ['4', 'competencia'], ['5', 'competencia']])
  })
  it('end to end: una foto de competencia en el expediente no entra a las candidatas del encargo', async () => {
    const { M, id } = await escena({ fotos: [buena('x', 'competencia'), buena('y', 'propia')] })
    await correr(M, id, guion())
    expect(arte(M, id, 'candidatas_foto').candidatas.map((c: { id: string }) => c.id)).toEqual(['y'])
  })
})

describe('b) el campo `necesito` de los agentes ya no es una promesa rota', () => {
  const conNecesito = (n: number) => ({ texto: JSON.stringify({ pie_de_foto: 'Ceviche de Olón a $7.00. Pídelo por WhatsApp al 0997744288.', hashtags: ['#ceviche'], ...(n === 1 ? { necesito: [{ que: '¿Cuál es el horario de atención en feriados?', para_que: 'para el pie de foto', bloquea: true }] } : {}) }) })
  const hechosDelPortero = (): Record<string, unknown> => ({ estado: 'completo', costo_usd: 0.08, huecos: [{ hueco: { objetivo: '¿Cuál es el horario de atención en feriados?' }, estado: 'traido_y_archivado', hallazgos: [{ resumen: 'Abren de 9:00 a 14:00 en feriados', url: 'https://www.naufrago.ec/horario' }] }] })
  it('lo que BLOQUEA al agente se le pide al portero (UNA vez), el mismo agente vuelve con la respuesta y la salida descartada no se registra', async () => {
    const E = await escena({ fotos: [FOTO_BUENA], responder: () => ({ ok: true, body: hechosDelPortero() }) })
    const { ultima, pedidos, pasos } = await correr(E.M, E.id, guion({ texto: (n) => conNecesito(n) }))
    expect(E.llamadas.pedir).toHaveLength(1)
    expect(E.llamadas.pedir[0].huecos[0].objetivo).toMatch(/horario de atención/)
    expect(pasos.filter((p) => p === 'texto')).toHaveLength(2) // el mismo agente, dos veces
    const seg = String(pedidos['texto'][1].task)
    expect(seg).toMatch(/Lo que pediste al portero y lo que trajo/)
    expect(seg).toMatch(/Abren de 9:00 a 14:00 en feriados/)
    expect(pedidos['texto'][0].task).not.toMatch(/Lo que pediste al portero/)
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(M_gastoModelo(E.M)).toBeGreaterThan(0) // el primer intento del agente se pagó y quedó anotado
    expect(materialDe(E.M.encargos.get(E.id)!.estado_del_motor)).toMatchObject({ clase: 'hecho', paso: 'texto' })
  })
  it('si vuelve a pedir lo mismo no se le vuelve a preguntar al portero (sin bucle)', async () => {
    const E = await escena({ fotos: [FOTO_BUENA], responder: () => ({ ok: true, body: hechosDelPortero() }) })
    const { ultima } = await correr(E.M, E.id, guion({ texto: () => conNecesito(1) }))
    expect(E.llamadas.pedir).toHaveLength(1)
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado' })
  })
  it('aunque el cupo de pedidos sea alto, el MISMO paso no vuelve a preguntar lo mismo (una vez por paso)', async () => {
    const E = await escena({ fotos: [FOTO_BUENA], limites: { material_max_pedidos_por_encargo: 5 }, responder: () => ({ ok: true, body: hechosDelPortero() }) })
    const { ultima } = await correr(E.M, E.id, guion({ texto: () => conNecesito(1) }))
    expect(E.llamadas.pedir).toHaveLength(1)
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado' })
  })
  it('una necesidad que no bloquea es una nota, no un pedido; y con el material apagado `necesito` se ignora como hoy', async () => {
    const nota = await escena({ fotos: [FOTO_BUENA] })
    await correr(nota.M, nota.id, guion({ texto: () => ({ texto: JSON.stringify({ pie_de_foto: 'Ceviche de Olón a $7.00. Pídelo por WhatsApp al 0997744288.', hashtags: ['#c'], necesito: [{ que: 'algo', bloquea: false }] }) }) }))
    expect(nota.llamadas.pedir).toHaveLength(0)
    const off = await escena({ fotos: [FOTO_BUENA], limites: { material_activo: false } })
    await correr(off.M, off.id, guion({ texto: (n) => conNecesito(n) }))
    expect(off.llamadas.pedir).toHaveLength(0)
    expect(necesidadesQueBloquean({ necesito: [{ que: 'a', bloquea: true }, { que: 'b' }, { que: '', bloquea: true }] })).toHaveLength(1)
  })
  it('si el portero no tiene lo que el agente pidió, el agente vuelve y lo declara como faltante (sin inventar)', async () => {
    const E = await escena({ fotos: [FOTO_BUENA], responder: () => ({ ok: true, body: sinNada }) })
    const { pedidos, ultima } = await correr(E.M, E.id, guion({ texto: (n) => conNecesito(n) }))
    expect(String(pedidos['texto'][1].task)).toMatch(/el portero no tenía nada de esto/)
    expect(ultima.cuerpo).toMatchObject({ estado: 'cerrado' })
  })
})
const M_gastoModelo = (M: Memoria) => M.gastos.filter((g) => g.concepto === 'modelo').reduce((s, g) => s + g.cost_usd, 0)
