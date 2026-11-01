/**
 * LA PALABRA DEL DUEÑO MANDA (01-nov · firma de Emilio), con las 6 condiciones de CC3. Lo que se prueba es lo que fuerza el código; el juicio del modelo se ve en la corrida real.
 */
import { describe, expect, it } from 'vitest'
import { evaluarOrdenes, partirOrdenes, tareaDeVerificacionDeOrdenes, VERIFICADOR_DE_ORDENES, type FilaDeVerificacion } from '../src/lib/jefatura/revision/orden-del-dueno'
import { elegirVersionDelPlan } from '../src/lib/jefatura/revision/orquestador'
import { armarQueCambio, type EvaluacionDeVersion } from '../src/lib/jefatura/revision/plan'
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

describe('🔴 evaluar: el fallo cuenta como «no cumple»', () => {
  const vs = [V('A', `plan ${CITA}`), V('C', `plan ${SUAVE}`)]
  const veredicto = (filas: FilaDeVerificacion[] | null, ordenes = [ORDEN]) => evaluarOrdenes(ordenes, filas, vs)
  it('con cita literal de esa versión, cumple; las tildes y mayúsculas no cuentan', () => {
    expect(veredicto([cumple('A')]).por_version.A.cumple).toBe(true)
    expect(veredicto([cumple('A', 1, CITA.toUpperCase().replace('Á', 'A'))]).por_version.A.cumple).toBe(true)
  })
  it('sin verificación, ninguna versión cumple', () => {
    const v = veredicto(null)
    expect(v.por_version.A.cumple).toBe(false)
    expect(v.por_version.C.cumple).toBe(false)
  })
  it('una fila que falta: no cumple (una orden omitida no se salva)', () => {
    const v = veredicto([cumple('A')], [ORDEN, 'No uses descuentos en la campaña'])
    expect(v.por_version.A.cumple).toBe(false)
    expect(v.por_version.A.sin_cumplir[0].motivo).toMatch(/no respondió/)
  })
  it('«cumple» con una cita que no está en esa versión, sin cita o demasiado corta: no cumple', () => {
    expect(veredicto([cumple('C')]).por_version.C.cumple).toBe(false)
    expect(veredicto([{ version: 'A', orden: 1, estado: 'cumple' }]).por_version.A.cumple).toBe(false)
    expect(veredicto([cumple('A', 1, 'plan')]).por_version.A.cumple).toBe(false)
  })
  it('una fila dice cumple y otra no: no cumple', () => {
    expect(veredicto([cumple('A'), { version: 'A', orden: 1, estado: 'no_cumple', motivo: 'la aplaza' }]).por_version.A.sin_cumplir[0].motivo).toBe('la aplaza')
  })
  it('un estado desconocido: no cumple', () => {
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
  it('🔴 la salvaguarda avisa pero no salva: la versión que no cumple sigue sin cumplir; fuera de la lista no cuenta', () => {
    const v = veredicto([{ version: 'C', orden: 1, estado: 'no_cumple', motivo: 'es ilegal', salvaguarda: 'ilegal' }])
    expect(v.salvaguardas).toEqual([{ orden: ORDEN, categoria: 'ilegal', motivo: 'es ilegal' }])
    expect(v.por_version.C.cumple).toBe(false)
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

  it('🔴 la versión que suaviza la orden no se adopta: gana la anterior que sí cumple', async () => {
    const { r, evs, notas } = await elegir({ ...CON_TODO, verificador: 'no_cumple_ultima' })
    const ultima = evs[evs.length - 1].etiqueta
    expect(ultima).not.toBe('A')
    expect(r.cuerpo.adoptada).not.toBe(ultima)
    expect((r.cuerpo.palabra_del_dueno as { requiere_humano: boolean }).requiere_humano).toBe(false)
    expect(r.cuerpo.resultado).toBe('con_desacuerdo')
    // la discrepancia no se pierde
    expect(notas).toHaveLength(1)
    expect(notas[0]).toMatchObject({ titulo: expect.stringMatching(/contradecía lo que pediste/), metadata: { requiere_humano: false } })
    expect(notas[0].detalle).toContain(ORDEN)
  })
  it('todo cumple: se adopta la última y no hay nada que anotar', async () => {
    const { r, evs, notas } = await elegir({ ...CON_TODO, verificador: 'cumple' })
    expect(r.cuerpo.adoptada).toBe(evs[evs.length - 1].etiqueta)
    expect((r.cuerpo.palabra_del_dueno as { verificada: boolean; requiere_humano: boolean })).toMatchObject({ verificada: true, requiere_humano: false })
    expect(notas).toEqual([])
  })
  it('🔴 ninguna versión cumple: va a la persona y no se queda en silencio', async () => {
    const { r, notas } = await elegir({ ...CON_TODO, verificador: 'no_cumple_todas' })
    expect(r.cuerpo.adoptada).toBe('A')
    expect((r.cuerpo.palabra_del_dueno as { requiere_humano: boolean }).requiere_humano).toBe(true)
    expect(r.cuerpo.resultado).toBe('con_desacuerdo')
    expect(notas).toHaveLength(1)
    expect(notas[0]).toMatchObject({ titulo: expect.stringMatching(/no quedó cumplido/), metadata: { requiere_humano: true } })
    expect(notas[0].detalle).toContain(ORDEN)
  })
  it('🔴 con una sola versión que no cumple, también queda como desacuerdo aunque sea «la última»', async () => {
    const { r, evs } = await elegir({ fichas: 'ninguna', gpt: 'vacio', verificador: 'no_cumple_todas' })
    expect(evs).toHaveLength(1)
    expect(r.cuerpo.adoptada).toBe('A')
    expect(r.cuerpo.resultado).toBe('con_desacuerdo')
  })
  it('🔴 la salvaguarda va a la persona sin cambiar el texto: se adopta la misma versión', async () => {
    const { r, evs, notas } = await elegir({ ...CON_TODO, verificador: 'salvaguarda' })
    expect(r.cuerpo.adoptada).toBe(evs[evs.length - 1].etiqueta)
    expect((r.cuerpo.palabra_del_dueno as { requiere_humano: boolean }).requiere_humano).toBe(true)
    expect(notas[0].detalle).toMatch(/confirmarla contigo, sin cambiarla/)
  })
  it('🔴 lo que se tomó como «no aplica» queda a la vista del dueño, con su motivo, aunque el resto cumpla', async () => {
    const { r, notas } = await elegir({ ...CON_TODO, verificador: 'no_aplica_una' }, { version: 2, pedido_del_dueno: `${ORDEN}. El informe de la web son mis pruebas. Publica todos los lunes del mes.` })
    expect((r.cuerpo.palabra_del_dueno as { requiere_humano: boolean }).requiere_humano).toBe(true) // dos de tres: más de la mitad
    expect(notas[0].detalle).toMatch(/Se tomó como contexto y no como orden: El informe de la web son mis pruebas.*es contexto/)
  })
  it('🔴 con «no aplica» en justo la mitad o menos no va a la persona, pero se anota', async () => {
    const { r, notas } = await elegir({ ...CON_TODO, verificador: 'no_aplica_una' }, { version: 2, pedido_del_dueno: `${ORDEN}. El informe de la web son mis pruebas.` })
    expect((r.cuerpo.palabra_del_dueno as { requiere_humano: boolean }).requiere_humano).toBe(false)
    expect(notas).toHaveLength(1)
    expect(notas[0]).toMatchObject({ titulo: expect.stringMatching(/cómo se entendió/) })
    expect(notas[0].detalle).toContain('Se tomó como contexto')
  })
  it('🔴 la marca orden_sin_cumplir queda en la revisión cuando va a la persona, y no cuando no', async () => {
    const a = await elegir({ ...CON_TODO, verificador: 'no_cumple_todas' })
    expect((await a.P.almacen.leerRevision(a.id))!.marcas.orden_sin_cumplir).toBe(true)
    const b = await elegir({ ...CON_TODO, verificador: 'cumple' })
    expect((await b.P.almacen.leerRevision(b.id))!.marcas.orden_sin_cumplir).toBeFalsy()
  })
  it('🔴 si la respuesta del verificador es ilegible, la revisión cierra igual y ninguna versión cumple', async () => {
    const { r, rev } = await elegir({ ...CON_TODO, verificador: 'formato_roto' })
    expect(rev!.estado).toBe('cerrada')
    expect((r.cuerpo.palabra_del_dueno as { requiere_humano: boolean }).requiere_humano).toBe(true)
    expect(r.cuerpo.adoptada).toBe('A')
  })
  it('🔴 si había pedido y no se pudo leer, se dice', async () => {
    const { r } = await elegir({ ...CON_TODO }, { version: 2, pedido_del_dueno: null, aviso: 'No se pudo leer' })
    expect(r.cuerpo.palabra_del_dueno).toMatchObject({ verificada: false, requiere_humano: true, orden_ilegible: true })
  })
  it('🔴 sin pedido del dueño no corre el verificador ni gasta', async () => {
    const { rev, r } = await elegir({ ...CON_TODO }, { version: 1, pedido_del_dueno: null })
    expect(rev!.estado_del_motor.artefactos.verificacion_de_ordenes).toBeUndefined()
    expect(r.cuerpo.palabra_del_dueno).toMatchObject({ verificada: false, requiere_humano: false })
  })
  it('🔴 el verificador no es quien escribe, ni quien revisa, ni el externo; y si la política lo pone a escribir, no se verifica', async () => {
    const { P } = puertosDePrueba()
    P.cicloDelPlan = async () => ({ version: 2, pedido_del_dueno: `${ORDEN}.` })
    const c = await correr(P, sobre('plan', { simulacion: CON_TODO }))
    const id = String(c.aperturas[0].cuerpo.revision_id)
    const rev = await P.almacen.leerRevision(id)
    expect(rev!.estado_del_motor.artefactos.verificacion_de_ordenes).toBeDefined()
    expect(rev!.productores.map((x) => x.agente)).not.toContain(VERIFICADOR_DE_ORDENES)
    expect(rev!.policy.revisor_fondo).not.toBe(VERIFICADOR_DE_ORDENES)
    const conEl = puertosDePrueba().P
    conEl.cicloDelPlan = P.cicloDelPlan
    const c2 = await correr(conEl, sobre('plan', { simulacion: CON_TODO, payload: { productores: [{ donde: '*', agente: VERIFICADOR_DE_ORDENES }] } }))
    const rev2 = await conEl.almacen.leerRevision(String(c2.aperturas[0].cuerpo.revision_id))
    expect(rev2!.estado_del_motor.artefactos.verificacion_de_ordenes).toBeUndefined()
    const e = await elegirVersionDelPlan(conEl, rev2!.id, { evaluaciones: ev.slice(0, ((rev2!.estado_del_motor.artefactos.revision?.datos.historial as unknown[]) ?? []).length), idDeA: 'A-id', existentes: [] })
    expect((e.cuerpo.palabra_del_dueno as { requiere_humano: boolean }).requiere_humano).toBe(true)
  })
  it('en seco no anota en la bandeja', async () => {
    const { notas } = await elegir({ ...CON_TODO, verificador: 'no_cumple_todas' }, undefined, true)
    expect(notas).toEqual([])
  })
})

describe('el registro de lo que no entró', () => {
  it('🔴 la lista «Qué cambió» dice lo que no entró por contradecir al dueño', () => {
    expect(armarQueCambio({ ciclo: { version: 2, pedido_del_dueno: ORDEN }, fichas: [], sin_entrar: [`${ORDEN} (la aplaza)`] })).toMatch(/no entró porque contradecía lo que pediste.*la aplaza/)
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
