/**
 * LA PALABRA DEL DUEÑO MANDA (02-nov · opción B de Emilio): la orden llega aparte y marcada como superior; el verificador solo anota; nada se descarta ni se frena.
 */
import { describe, expect, it } from 'vitest'
import { bloqueDeOrdenesDelDueno, evaluarOrdenes, partirOrdenes, tareaDeVerificacionDeOrdenes, VERIFICADOR_DE_ORDENES, type FilaDeVerificacion } from '../src/lib/jefatura/revision/orden-del-dueno'
import { elegirVersionDelPlan } from '../src/lib/jefatura/revision/orquestador'
import { type EvaluacionDeVersion } from '../src/lib/jefatura/revision/plan'
import { tareaDeCorreccion, tareaDeDecision } from '../src/lib/jefatura/revision/pedidos'
import { correr, puertosDePrueba, sobre } from './_helpers/jefatura-revision'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { crearPuertos } from '../src/lib/jefatura/revision/adaptadores'

const ORDEN = 'Que la gente sepa que estamos en Guayaquil por delivery, ahora'
const CITA = 'Desde hoy Náufrago entrega en Guayaquil por delivery'
const SUAVE = 'Guayaquil se anunciará solo cuando esté lista la operación'
const V = (etiqueta: string, texto: string) => ({ etiqueta, texto })
const cumple = (version: string, orden = 1, cita = CITA): FilaDeVerificacion => ({ version, orden, estado: 'cumple', cita })

describe('🔴 las órdenes salen de lo que escribió el dueño', () => {
  it('parte por frases y líneas; lo que es demasiado corto no cuenta como orden', () => {
    expect(partirOrdenes(`${ORDEN}. El local abre en un mes.\nok.\nPublica los lunes; no uses descuentos.`)).toEqual([`${ORDEN}.`, 'El local abre en un mes.', 'Publica los lunes;', 'no uses descuentos.'])
  })
  it('sin texto no hay órdenes', () => {
    for (const x of [null, undefined, '', '   ']) expect(partirOrdenes(x)).toEqual([])
  })
  it('el pedido al verificador lleva cada orden, numerada, y cada versión entera', () => {
    const t = tareaDeVerificacionDeOrdenes({ ordenes: ['uno uno uno', 'dos dos dos'], versiones: [V('A', 'TEXTO-A'), V('C', 'TEXTO-C')] }).task
    for (const x of ['1. uno uno uno', '2. dos dos dos', 'Versión A', 'TEXTO-A', 'Versión C', 'TEXTO-C']) expect(t).toContain(x)
  })
  it('🔴 la lista de la salvaguarda es corta: lo difícil o prematuro no entra', () => {
    const t = tareaDeVerificacionDeOrdenes({ ordenes: [ORDEN], versiones: [V('A', 'x')] }).task
    expect(t).toMatch(/ilegal, dano_a_personas/)
    expect(t).toMatch(/difícil, cara, arriesgada o prematura no entra/)
    expect(t).toMatch(/«ahora».*«cuando esté lista la operación».*no cumple/)
  })
})

describe('🔴 la orden llega aparte, marcada como superior', () => {
  const comun = { politica: {}, tipo: 'plan', dueno: {}, esquema: 'plan_texto_y_resolucion.v1', texto: 'EL PLAN', fichas: [], version_actual: 'A' } as never
  const conOrden = (x: object) => ({ ...(comun as object), payload: { pedido_del_plan: 'EL PEDIDO', ordenes_del_dueno: [ORDEN] }, ...x }) as never
  it('a quien corrige y a quien decide, antes del plan y por encima de lo que opinen los revisores', () => {
    for (const t of [tareaDeCorreccion(conOrden({})).task, tareaDeDecision(conOrden({ opinion: 'LA OPINIÓN' })).task]) {
      expect(t).toContain('Lo que ordenó el dueño (manda sobre lo que opinen los revisores)')
      expect(t).toContain(`- ${ORDEN}`)
      expect(t).toMatch(/no lo suavices ni lo aplaces/)
      expect(t.indexOf(ORDEN)).toBeLessThan(t.indexOf('EL PLAN'))
    }
  })
  it('sin orden no hay bloque', () => {
    expect(bloqueDeOrdenesDelDueno(undefined)).toBe('')
    expect(bloqueDeOrdenesDelDueno([])).toBe('')
    expect(tareaDeCorreccion({ ...(comun as object), payload: {} } as never).task).not.toContain('Lo que ordenó el dueño')
  })
})

describe('🔴 evaluar: lo que se anota es honesto', () => {
  const vs = [V('A', `plan ${CITA}`), V('C', `plan ${SUAVE}`)]
  const veredicto = (filas: FilaDeVerificacion[], ordenes = [ORDEN]) => evaluarOrdenes(ordenes, filas, vs)
  it('con cita literal de esa versión, cumple; las tildes y mayúsculas no cuentan', () => {
    expect(veredicto([cumple('A')]).por_version.A.cumple).toBe(true)
    expect(veredicto([cumple('A', 1, CITA.toUpperCase().replace('Á', 'A'))]).por_version.A.cumple).toBe(true)
  })
  it('una fila que falta se anota', () => {
    const v = veredicto([cumple('A')], [ORDEN, 'No uses descuentos en la campaña'])
    expect(v.por_version.A.cumple).toBe(false)
    expect(v.por_version.A.sin_cumplir[0].motivo).toMatch(/no respondió/)
  })
  it('«cumple» con una cita que no está en esa versión, sin cita o demasiado corta: se anota', () => {
    expect(veredicto([cumple('C')]).por_version.C.cumple).toBe(false)
    expect(veredicto([{ version: 'A', orden: 1, estado: 'cumple' }]).por_version.A.cumple).toBe(false)
    expect(veredicto([cumple('A', 1, 'plan')]).por_version.A.cumple).toBe(false)
  })
  it('una fila dice cumple y otra no: se anota con su motivo', () => {
    expect(veredicto([cumple('A'), { version: 'A', orden: 1, estado: 'no_cumple', motivo: 'la aplaza' }]).por_version.A.sin_cumplir[0].motivo).toBe('la aplaza')
  })
  it('un estado desconocido se anota', () => {
    expect(veredicto([{ version: 'A', orden: 1, estado: 'quizas' as never, cita: CITA }]).por_version.A.cumple).toBe(false)
  })
  it('🔴 «no aplica» pide motivo, queda a la vista y no puede ser la respuesta a todo', () => {
    const dos = [ORDEN, 'El informe de la web son mis pruebas']
    const bien = veredicto([cumple('A'), { version: 'A', orden: 2, estado: 'no_aplica', motivo: 'es contexto' }], dos)
    expect(bien.por_version.A.cumple).toBe(true)
    expect(bien.sin_aplicar).toEqual([{ orden: dos[1], motivo: 'es contexto' }])
    expect(veredicto([cumple('A'), { version: 'A', orden: 2, estado: 'no_aplica' }], dos).por_version.A.cumple).toBe(false)
    expect(veredicto([{ version: 'A', orden: 1, estado: 'no_aplica', motivo: 'x' }]).por_version.A.cumple).toBe(false)
  })
  it('🔴 la salvaguarda solo avisa; fuera de la lista no cuenta', () => {
    const v = veredicto([{ version: 'C', orden: 1, estado: 'no_cumple', motivo: 'es ilegal', salvaguarda: 'ilegal' }])
    expect(v.salvaguardas).toEqual([{ orden: ORDEN, categoria: 'ilegal', motivo: 'es ilegal' }])
    expect(veredicto([{ version: 'C', orden: 1, estado: 'no_cumple', motivo: 'es prematuro', salvaguarda: 'prematuro' }]).salvaguardas).toEqual([])
  })
})

describe('🔴 de punta a punta, con el motor real', () => {
  const ev: EvaluacionDeVersion[] = [{ etiqueta: 'A', marcas: 0, largo: 30000 }, { etiqueta: 'B', marcas: 0, largo: 30500 }, { etiqueta: 'C', marcas: 0, largo: 31000 }]
  const elegir = async (simulacion: Record<string, unknown>, ciclo: { version: number | null; pedido_del_dueno: string | null; aviso?: string } = { version: 2, pedido_del_dueno: `${ORDEN}.` }, seco = false) => {
    const { P } = puertosDePrueba()
    P.cicloDelPlan = async () => ciclo
    const notas: Array<Record<string, unknown>> = []
    P.anotarPalabraDelDueno = async (x) => { notas.push(x as never) }
    const c = await correr(P, sobre('plan', { simulacion }))
    const id = String(c.aperturas[0].cuerpo.revision_id)
    const rev = await P.almacen.leerRevision(id)
    // el motor corre con el molde del seco; al elegir, salvo que se pida seco, la revisión se presenta como real para ejercer la anotación
    if (!seco) { const leer = P.almacen.leerRevision.bind(P.almacen); P.almacen.leerRevision = async (x) => { const f = await leer(x); return f ? { ...f, dry_run: false } : f } }
    const producidas = ((rev!.estado_del_motor.artefactos.revision?.datos.historial as unknown[]) ?? []).length
    const evs = ev.slice(0, Math.max(1, producidas))
    return { P, id, rev, notas, evs, r: await elegirVersionDelPlan(P, id, { evaluaciones: evs, idDeA: 'A-id', existentes: [] }) }
  }
  const CON_TODO = { fichas: 'bloquea', toma: 'algo' }

  it('🔴 nada se descarta: la versión que al verificador le parece que no cumple se adopta igual, y queda anotada', async () => {
    const { r, evs, notas } = await elegir({ ...CON_TODO, verificador: 'no_cumple_ultima' })
    const ultima = evs[evs.length - 1].etiqueta
    expect(ultima).not.toBe('A')
    expect(r.cuerpo.adoptada).toBe(ultima)
    expect(r.cuerpo.resultado).not.toBe('con_desacuerdo')
    expect(notas).toHaveLength(1)
    expect(notas[0].detalle).toMatch(/Al verificador le parece que no se cumple/)
    expect(notas[0].detalle).toContain(ORDEN)
  })
  it('🔴 solo se anota la versión que queda: lo que le parece de otra no se le muestra al dueño', async () => {
    const { P, id, evs, notas } = await elegir({ ...CON_TODO, verificador: 'no_cumple_ultima' })
    expect(evs.length).toBeGreaterThan(1)
    notas.length = 0
    const ultima = evs[evs.length - 1].etiqueta
    const r = await elegirVersionDelPlan(P, id, { evaluaciones: evs.map((x) => (x.etiqueta === ultima ? { ...x, marcas: 9 } : x)), idDeA: 'A-id', existentes: [] })
    expect(r.cuerpo.adoptada).not.toBe(ultima)
    expect(notas).toEqual([])
  })
  it('todo cumple: se adopta la última y no hay nada que anotar', async () => {
    const { r, evs, notas } = await elegir({ ...CON_TODO, verificador: 'cumple' })
    expect(r.cuerpo.adoptada).toBe(evs[evs.length - 1].etiqueta)
    expect(r.cuerpo.palabra_del_dueno).toMatchObject({ verificada: true })
    expect(notas).toEqual([])
  })
  it('🔴 ninguna versión cumple: se anota y la marca de la revisión no cambia', async () => {
    const { r, evs, notas, P, id } = await elegir({ ...CON_TODO, verificador: 'no_cumple_todas' })
    expect(r.cuerpo.adoptada).toBe(evs[evs.length - 1].etiqueta)
    expect(r.cuerpo.resultado).not.toBe('con_desacuerdo')
    expect((await P.almacen.leerRevision(id))!.marcas).not.toHaveProperty('orden_sin_cumplir')
    expect(notas).toHaveLength(1)
    expect(notas[0].detalle).toContain(ORDEN)
  })
  it('🔴 la elección por chequeos sigue igual: la versión con más marcas no se adopta, con o sin orden', async () => {
    const { P, id, evs } = await elegir({ ...CON_TODO, verificador: 'cumple' })
    const peor = evs.map((x) => (x.etiqueta === 'A' ? x : { ...x, marcas: 9 }))
    const r = await elegirVersionDelPlan(P, id, { evaluaciones: peor, idDeA: 'A-id', existentes: [] })
    expect(r.cuerpo.adoptada).toBe('A')
    expect(r.cuerpo.resultado).toBe('con_desacuerdo')
  })
  it('🔴 la salvaguarda avisa y no cambia el texto: se adopta la misma versión', async () => {
    const { r, evs, notas } = await elegir({ ...CON_TODO, verificador: 'salvaguarda' })
    expect(r.cuerpo.adoptada).toBe(evs[evs.length - 1].etiqueta)
    expect(notas[0].detalle).toMatch(/confirmarla contigo, sin cambiarla/)
  })
  it('🔴 lo que se tomó como «no aplica» queda a la vista del dueño, con su motivo', async () => {
    const { notas } = await elegir({ ...CON_TODO, verificador: 'no_aplica_una' }, { version: 2, pedido_del_dueno: `${ORDEN}. El informe de la web son mis pruebas.` })
    expect(notas).toHaveLength(1)
    expect(notas[0].detalle).toMatch(/Se tomó como contexto y no como orden: El informe de la web son mis pruebas.*es contexto/)
  })
  it('🔴 si la respuesta del verificador es ilegible, la revisión cierra, se adopta igual y se dice', async () => {
    const { r, rev, evs, notas } = await elegir({ ...CON_TODO, verificador: 'formato_roto' })
    expect(rev!.estado).toBe('cerrada')
    expect(r.cuerpo.adoptada).toBe(evs[evs.length - 1].etiqueta)
    expect(r.cuerpo.palabra_del_dueno).toMatchObject({ verificada: false })
    expect(notas[0].detalle).toMatch(/No se pudo comprobar/)
  })
  it('🔴 si había pedido y no se pudo leer, se dice', async () => {
    const { r, notas } = await elegir({ ...CON_TODO }, { version: 2, pedido_del_dueno: null, aviso: 'No se pudo leer' })
    expect(r.cuerpo.palabra_del_dueno).toMatchObject({ verificada: false, orden_ilegible: true })
    expect(notas[0].detalle).toMatch(/No se pudo leer lo que pediste/)
  })
  it('🔴 sin pedido del dueño no corre el verificador, no gasta y no anota', async () => {
    const { rev, r, notas } = await elegir({ ...CON_TODO }, { version: 1, pedido_del_dueno: null })
    expect(rev!.estado_del_motor.artefactos.verificacion_de_ordenes).toBeUndefined()
    expect(r.cuerpo.palabra_del_dueno).toMatchObject({ verificada: false })
    expect(notas).toEqual([])
  })
  it('🔴 el verificador no es quien escribe, ni quien revisa; si la política lo pone a escribir, no verifica y se dice', async () => {
    const { P } = puertosDePrueba()
    P.cicloDelPlan = async () => ({ version: 2, pedido_del_dueno: `${ORDEN}.` })
    const c = await correr(P, sobre('plan', { simulacion: CON_TODO }))
    const rev = await P.almacen.leerRevision(String(c.aperturas[0].cuerpo.revision_id))
    expect(rev!.estado_del_motor.artefactos.verificacion_de_ordenes).toBeDefined()
    expect(rev!.productores.map((x) => x.agente)).not.toContain(VERIFICADOR_DE_ORDENES)
    expect(rev!.policy.revisor_fondo).not.toBe(VERIFICADOR_DE_ORDENES)
    const conEl = puertosDePrueba().P
    conEl.cicloDelPlan = P.cicloDelPlan
    const c2 = await correr(conEl, sobre('plan', { simulacion: CON_TODO, payload: { productores: [{ donde: '*', agente: VERIFICADOR_DE_ORDENES }] } }))
    const rev2 = await conEl.almacen.leerRevision(String(c2.aperturas[0].cuerpo.revision_id))
    expect(rev2!.estado_del_motor.artefactos.verificacion_de_ordenes).toBeUndefined()
    const e = await elegirVersionDelPlan(conEl, rev2!.id, { evaluaciones: ev.slice(0, ((rev2!.estado_del_motor.artefactos.revision?.datos.historial as unknown[]) ?? []).length), idDeA: 'A-id', existentes: [] })
    expect(e.cuerpo.palabra_del_dueno).toMatchObject({ verificada: false })
  })
  it('en seco no anota en la bandeja', async () => {
    const { notas } = await elegir({ ...CON_TODO, verificador: 'no_cumple_todas' }, undefined, true)
    expect(notas).toEqual([])
  })
})

describe('🔴 el registro en la bandeja', () => {
  const PLAN = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
  const pedir = () => ({ client_id: 'c1', plan_id: PLAN, titulo: 'T', detalle: 'D', metadata: { revision_id: 'r' } })
  const puertos = (db: DbFalsa) => crearPuertos(db as never, {} as never)
  it('deja una sola por plan, visible en las decisiones del dueño', async () => {
    const db = new DbFalsa()
    const P = puertos(db)
    await P.anotarPalabraDelDueno!(pedir())
    await P.anotarPalabraDelDueno!(pedir())
    expect(db.tablas['hitl_queue']).toHaveLength(1)
    expect(db.tablas['hitl_queue'][0]).toMatchObject({ type: 'palabra_del_dueno', output_id: PLAN, status: 'pending', title: 'T', output_preview: 'D' })
  })
  it('nunca lanza', async () => {
    const P = puertos({ from() { throw new Error('caída') } } as never)
    await expect(P.anotarPalabraDelDueno!(pedir())).resolves.toBeUndefined()
  })
})
