/**
 * 20-nov · «Crear Campaña» · entrega 3 (GO Lenovo 19:06Z · respuestas de Emilio 20:04 Zúrich) · US$ 0.
 * El brief del dueño es UN documento (`# BRIEF DEL DUEÑO`), ENTERO, que reciben la estrategia, el brief creativo, la gran idea (que sigue SIN plan)
 * y la jefatura de la pieza; el validador lo acepta como TERCERA fuente citable, pero solo el de ESA campaña (nunca el de otra del mismo cliente).
 * Si choca con el plan, manda el del dueño y el choque va a «Faltantes» (la regla viaja en el bloque).
 * Sin pedido del dueño, todo queda como hoy. Genérico: sin nombres de clientes.
 */
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import type { Campana, EstrategiaGuardada } from '../almacen'
import { bajarCitasNoLiterales, citasQueNoAparecen, insumosDelBrief, leerBriefCreativo } from '../brief-creativo'
import { briefDelDuenoDeLaCampana, briefDelDuenoEnTexto, bloqueDelBriefDelDueno, FUENTE_DEL_BRIEF_DEL_DUENO, REGLA_DEL_BRIEF_DEL_DUENO, TITULO_DEL_BRIEF_DEL_DUENO, type PedidoDelDueno } from '../brief-del-dueno'
import { tareaDeEstrategia } from '../indicaciones'
import { abrirCampana, estrategiaGuardar, estrategiaPreparar } from '../index'
import { ponerNecesitaHumano } from '../nucleo'
import { briefRevalidar } from '../revalidar'
import { briefAbrir, conceptoAbrir, marcoDelBrief, marcoDelConcepto, recibirBrief, recibirConcepto } from '../mesas'
import { LA_GRAN_IDEA_SIN_PLAN } from '../../oficina/mesa/pedidos'
import { briefDelDuenoParaRevisar, TITULO_DEL_BRIEF_DEL_DUENO_PARA_REVISAR } from '../../jefatura/revision/carpeta-para-revisar'

const A = clienteA()
const AHORA = '2026-10-09T12:00:00Z'
const UNO = 'camp-dueno-1'
const DOS = 'camp-dueno-2'
const SIN = 'camp-sin-dueno'

// dos campañas del MISMO cliente con briefs distintos (lo que pidió CC5)
const FRASE_UNO = 'los martes la mesa larga abre a las seis y media para los que salen temprano'
const FRASE_DOS = 'el pan de masa madre para llevar se pide por mensaje desde el viernes'
const pedido = (frase: string, extra: Partial<PedidoDelDueno> = {}): PedidoDelDueno => ({
  nombre: 'Campaña del dueño', cambio: 'Que el barrio sepa que hay algo nuevo y venga a probarlo.', fecha_inicio: '2026-10-12', fecha_fin: '2026-11-08',
  fechas_clave: [{ fecha: '2026-10-20', que: 'arranca la oferta' }], brief_libre: `La oferta: ${frase}. Es para los vecinos que ya nos conocen.`, ...extra,
})
const PEDIDO_UNO = pedido(FRASE_UNO)
const PEDIDO_DOS = pedido(FRASE_DOS)

const wf = (campana: string, extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', campana_id: campana, ...extra })

function almacen(): AlmacenMemoria {
  const al = new AlmacenMemoria({
    contextos: { [A.clientId]: contextoDe(A) },
    planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'ensayo', clientes_ensayo: [A.clientId], nuevo_orden: { clientes: [A.clientId] } },
    journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
  })
  for (const [id, llave] of [[UNO, 'tablero-1'], [DOS, 'tablero-2'], [SIN, null]] as const) {
    const c: Campana = {
      id, client_id: A.clientId, plan_id: 'plan-1', fecha_inicio: A.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: A.campana.fecha_fin, zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: ['centro'],
      estado: 'calendario', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: true, llave_de_campana: llave,
    }
    const e: EstrategiaGuardada = { campana_id: id, version: 1, estado: 'validada', contenido: A.estrategia, agente: 'social-media-strategist', modelo: null, costo_usd: 0, workflow_execution_id: 'ex-0', seco: true }
    al.campanas.push(c)
    al.estrategias.push(e)
  }
  al.pedidosDelDueno[UNO] = PEDIDO_UNO
  al.pedidosDelDueno[DOS] = PEDIDO_DOS
  return al
}

// el brief bueno del cliente A (cita LITERAL de su plan) · se le cambian las citas en cada caso
const CITA_DEL_PLAN = '«Se publican 3 posts por semana en Instagram y 1 en Facebook»'
const BRIEF_BUENO = [
  '## De qué parte del plan sale', `Fase 1: ${CITA_DEL_PLAN}.`,
  '## Insight', 'La gente del barrio desayuna de pie porque cree que no hay dónde sentarse antes de las ocho.',
  '## Mensaje', 'Hay mesa desde las siete.',
  '## Público', 'Vecinos del barrio que desayunan fuera entre semana (del plan).', '## Cómo sabremos que funcionó', 'Pedidos por semana contra la meta del plan, revisados cada lunes.', '## Objetivo', 'Que entren 30 desayunos nuevos por semana.', '- instagram: 30 desayunos · reserva por mensaje', '- facebook: 30 desayunos · reserva por mensaje',
  '## Tono', 'Cercano y directo, sin exclamaciones.',
  '## Obligatorios', '- vocabulario: pan de masa madre; mesa larga', '- prohibido: barato; gratis', '- lo que no se dice: precios',
  '## Faltantes', '- público: el manual no dice edades',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n')
const conBloque = (frase: string) => BRIEF_BUENO.replace('## Mensaje\nHay mesa desde las siete.', `## Mensaje\nHay mesa desde las siete.\n> «${frase}»`)
const conAtribuida = (frase: string) => BRIEF_BUENO.replace('Hay mesa desde las siete.', `Hay mesa desde las siete. El dueño dice: «${frase}».`)
const deQueParte = (frase: string) => BRIEF_BUENO.replace(`Fase 1: ${CITA_DEL_PLAN}.`, `La campaña del dueño: «${frase}».`)
const entrega = (campana: string, texto: string) => ({ campana_id: campana, version: 1, encargo_id: `enc-${campana}`, texto, costo_usd: 0.1, motivo: null })

async function recibir(campana: string, texto: string) {
  const al = almacen()
  expect((await briefAbrir(al, wf(campana), AHORA)).status).toBe(200)
  const r = await recibirBrief(al, entrega(campana, texto), AHORA)
  const guardado = (await al.ultimoBriefCreativo(campana))!
  return { r, guardado }
}

describe('el documento del dueño', () => {
  it('lleva las respuestas TAL CUAL y el brief libre ENTERO (sin cortes, aunque sea enorme)', () => {
    const enorme = `${'La oferta va así. '.repeat(5000)}FIN-DEL-BRIEF`
    const t = briefDelDuenoEnTexto({ ...PEDIDO_UNO, brief_libre: enorme })!
    expect(t).toContain(enorme)
    expect(t).toContain('## Nombre de la campaña\nCampaña del dueño')
    expect(t).toContain(PEDIDO_UNO.cambio!)
    expect(t).toContain('- de 2026-10-12 a 2026-11-08')
    expect(t).toContain('  - 2026-10-20 · arranca la oferta')
  })
  it('sin cambio ni brief no hay documento; lo que no tiene forma de fecha clave no se inventa', () => {
    expect(briefDelDuenoEnTexto(null)).toBeNull()
    expect(briefDelDuenoEnTexto({ ...PEDIDO_UNO, cambio: '  ', brief_libre: '' })).toBeNull()
    const t = briefDelDuenoEnTexto({ ...PEDIDO_UNO, fechas_clave: [null, 3, { que: 'sin fecha' }, { fecha: '2026-10-25' }], fecha_inicio: null, fecha_fin: null })!
    expect(t).toContain('- fechas clave:\n  - 2026-10-25')
    expect(t).not.toContain('sin fecha')
    expect(t).not.toContain('- de ')
  })
  it('el bloque: título, la regla (manda el dueño · el choque a «Faltantes») y el documento entero con su fuente; vacío sin brief', () => {
    const b = bloqueDelBriefDelDueno('texto del dueño').join('\n')
    expect(b).toContain(TITULO_DEL_BRIEF_DEL_DUENO)
    expect(b).toContain(REGLA_DEL_BRIEF_DEL_DUENO)
    expect(REGLA_DEL_BRIEF_DEL_DUENO).toContain('MANDA sobre el plan')
    expect(REGLA_DEL_BRIEF_DEL_DUENO).toContain('«Faltantes»')
    expect(b).toContain(`<documento fuente="${FUENTE_DEL_BRIEF_DEL_DUENO}">\ntexto del dueño\n</documento>`)
    expect(bloqueDelBriefDelDueno(null)).toEqual([])
    expect(bloqueDelBriefDelDueno('   ')).toEqual([])
  })
  it('se lee por campaña: cada una el suyo; sin pedido (o sin lector) nada; un error de la base NO se traga', async () => {
    const al = almacen()
    expect(await briefDelDuenoDeLaCampana(al, UNO)).toContain(FRASE_UNO)
    expect(await briefDelDuenoDeLaCampana(al, DOS)).toContain(FRASE_DOS)
    expect(await briefDelDuenoDeLaCampana(al, DOS)).not.toContain(FRASE_UNO)
    expect(await briefDelDuenoDeLaCampana(al, SIN)).toBeNull()
    expect(await briefDelDuenoDeLaCampana({}, UNO)).toBeNull()
    await expect(briefDelDuenoDeLaCampana({ pedidoDelDueno: async () => { throw new Error('se cayó la base') } }, UNO)).rejects.toThrow('se cayó la base')
  })
})

describe('el validador: tercera fuente citable, solo la de ESA campaña', () => {
  const dueno = briefDelDuenoEnTexto(PEDIDO_UNO)!
  const otro = briefDelDuenoEnTexto(PEDIDO_DOS)!
  const plan = contextoDe(A).planTexto
  it('un bloque `>` del dueño vale con SU brief; con el de otra campaña o sin brief, no', () => {
    expect(citasQueNoAparecen(conBloque(FRASE_UNO), { plan, dueno })).toEqual([])
    expect(citasQueNoAparecen(conBloque(FRASE_UNO), { plan, dueno: otro })).toHaveLength(1)
    expect(citasQueNoAparecen(conBloque(FRASE_UNO), { plan })).toHaveLength(1)
  })
  it('«el dueño dice: «…»» se comprueba contra el brief del dueño (fuente `dueno`); sin brief del dueño no se comprueba, como antes', () => {
    expect(citasQueNoAparecen(conAtribuida(FRASE_UNO), { plan, dueno })).toEqual([])
    const r = citasQueNoAparecen(conAtribuida(FRASE_UNO), { plan, dueno: otro })
    expect(r).toEqual([{ cita: FRASE_UNO, seccion: 'Mensaje', fuente: 'dueno' }])
    expect(citasQueNoAparecen(conAtribuida(FRASE_UNO), { plan })).toEqual([])
    for (const quien of ['el brief del dueño dice', 'el dueno pide', 'El Dueño afirma que']) {
      const md = BRIEF_BUENO.replace('Hay mesa desde las siete.', `Hay mesa desde las siete. ${quien} «${FRASE_UNO}».`)
      expect(citasQueNoAparecen(md, { plan, dueno: otro }).map((x) => x.fuente)).toEqual(['dueno'])
      expect(citasQueNoAparecen(md, { plan, dueno })).toEqual([])
    }
  })
  it('una cita del dueño ALTERADA bloquea, nombrando el brief del dueño', () => {
    const l = leerBriefCreativo(conAtribuida(FRASE_UNO.replace('seis y media', 'cinco y media')), { ...insumosDelBrief(contextoDe(A), A.estrategia.canales, dueno) })
    expect(l.estado).toBe('devuelta')
    expect(l.bloqueos.join('\n')).toContain('no está literal en el brief del dueño')
  })
  it('una cita del PLAN sigue valiendo con brief del dueño (el plan no deja de ser fuente)', () => {
    const l = leerBriefCreativo(BRIEF_BUENO, insumosDelBrief(contextoDe(A), A.estrategia.canales, dueno))
    expect(l.bloqueos).toEqual([])
    expect(l.estado).toBe('validada')
  })
  it('«De qué parte del plan sale» puede citar al dueño; el motivo nombra al dueño solo si hay brief del dueño', () => {
    const md = deQueParte(FRASE_UNO)
    expect(leerBriefCreativo(md, insumosDelBrief(contextoDe(A), A.estrategia.canales, dueno)).estado).toBe('validada')
    const conOtro = leerBriefCreativo(md, insumosDelBrief(contextoDe(A), A.estrategia.canales, otro))
    expect(conOtro.estado).toBe('devuelta')
    expect(conOtro.bloqueos.join('\n')).toContain('no se encuentra literal en el plan ni en el brief del dueño')
    const sin = leerBriefCreativo(md, insumosDelBrief(contextoDe(A), A.estrategia.canales))
    expect(sin.estado).toBe('devuelta')
    expect(sin.bloqueos.join('\n')).toContain('no se encuentra literal en el plan · no se puede verificar')
  })
  it('sin brief del dueño los insumos y las respuestas quedan como hoy (ni clave nueva, ni otra marca)', () => {
    expect('duenoTexto' in insumosDelBrief(contextoDe(A), A.estrategia.canales)).toBe(false)
    expect('duenoTexto' in insumosDelBrief(contextoDe(A), A.estrategia.canales, '  ')).toBe(false)
    expect(bajarCitasNoLiterales(conBloque(FRASE_UNO), { plan }).texto).toContain('*(resumen, no cita literal del plan ni del manual)*')
  })
  it('a resumen: el bloque que no está en ninguna de las 3 lo dice; la atribuida al dueño, «del brief del dueño»', () => {
    expect(bajarCitasNoLiterales(conBloque(FRASE_UNO), { plan, dueno: otro }).texto).toContain('*(resumen, no cita literal del plan, del manual ni del brief del dueño)*')
    const b = bajarCitasNoLiterales(conAtribuida(FRASE_UNO), { plan, dueno: otro })
    expect(b.texto).toContain('*(resumen, no cita literal del brief del dueño)*')
    expect(b.bajadas).toEqual([expect.objectContaining({ fuente: 'dueno' })])
    expect(bajarCitasNoLiterales(conAtribuida(FRASE_UNO), { plan, dueno }).bajadas).toEqual([])
  })
})

describe('punta a punta en la cadena: dos campañas del mismo cliente con briefs distintos', () => {
  it('la mesa del brief recibe el brief del dueño de SU campaña, entero, y no el de la otra; sin pedido, sin bloque', async () => {
    const al = almacen()
    const m = async (c: string) => ((await briefAbrir(al, wf(c), AHORA)).cuerpo.sobre as { marco_texto: string }).marco_texto
    const [uno, dos, sin] = [await m(UNO), await m(DOS), await m(SIN)]
    expect(uno).toContain(TITULO_DEL_BRIEF_DEL_DUENO)
    expect(uno).toContain(briefDelDuenoEnTexto(PEDIDO_UNO)!)
    expect(uno).not.toContain(FRASE_DOS)
    expect(dos).toContain(briefDelDuenoEnTexto(PEDIDO_DOS)!)
    expect(dos).not.toContain(FRASE_UNO)
    expect(sin).not.toContain(TITULO_DEL_BRIEF_DEL_DUENO)
    expect(sin).not.toContain(REGLA_DEL_BRIEF_DEL_DUENO)
  })
  it('un bloque `>` del dueño: en SU campaña se valida tal cual; en la otra baja a resumen', async () => {
    const uno = await recibir(UNO, conBloque(FRASE_UNO))
    expect(uno.r).toMatchObject({ ok: true, estado: 'validada' })
    expect(uno.guardado.texto_md).toContain(`> «${FRASE_UNO}»`)
    expect(uno.guardado.texto_md).not.toContain('*(resumen')
    const dos = await recibir(DOS, conBloque(FRASE_UNO))
    expect(dos.guardado.texto_md).toContain('*(resumen, no cita literal del plan, del manual ni del brief del dueño)*')
  })
  it('«De qué parte del plan sale» con la cita del dueño: su campaña la valida; la otra y la sin pedido la devuelven', async () => {
    expect((await recibir(UNO, deQueParte(FRASE_UNO))).r).toMatchObject({ ok: true, estado: 'validada' })
    expect((await recibir(DOS, deQueParte(FRASE_UNO))).r).toMatchObject({ ok: true, estado: 'devuelta' })
    expect((await recibir(SIN, deQueParte(FRASE_UNO))).r).toMatchObject({ ok: true, estado: 'devuelta' })
  })
  it('la gran idea recibe el brief del dueño ENTERO como bloque propio y sigue SIN el plan', async () => {
    const al = almacen()
    for (const c of [UNO, SIN]) {
      expect((await briefAbrir(al, wf(c), AHORA)).status).toBe(200)
      expect(await recibirBrief(al, entrega(c, BRIEF_BUENO), AHORA)).toMatchObject({ ok: true, estado: 'validada' })
    }
    const uno = ((await conceptoAbrir(al, wf(UNO), AHORA)).cuerpo.sobre as { marco_texto: string; plan_texto?: string })
    expect(uno.marco_texto).toContain(TITULO_DEL_BRIEF_DEL_DUENO)
    expect(uno.marco_texto).toContain(briefDelDuenoEnTexto(PEDIDO_UNO)!)
    expect(uno.marco_texto).not.toContain(FRASE_DOS)
    expect(uno.plan_texto).toBeUndefined()
    expect(uno.marco_texto).not.toContain(contextoDe(A).planTexto)
    const sin = ((await conceptoAbrir(al, wf(SIN), AHORA)).cuerpo.sobre as { marco_texto: string })
    expect(sin.marco_texto).not.toContain(TITULO_DEL_BRIEF_DEL_DUENO)
    expect(LA_GRAN_IDEA_SIN_PLAN).toContain('no se repite')
  })
  it('la vuelta de la gran idea no se cae con el brief del dueño (recibe como siempre)', async () => {
    const al = almacen()
    expect((await briefAbrir(al, wf(UNO), AHORA)).status).toBe(200)
    expect(await recibirBrief(al, entrega(UNO, conBloque(FRASE_UNO)), AHORA)).toMatchObject({ ok: true, estado: 'validada' })
    expect((await conceptoAbrir(al, wf(UNO), AHORA)).status).toBe(200)
    const r = await recibirConcepto(al, { ...entrega(UNO, '## Cómo se ve  Luz cálida.'), encargo_id: 'enc-c' }, AHORA)
    expect(r.ok).toBe(true)
  })
})

describe('los marcos y la estrategia sin brief del dueño quedan idénticos', () => {
  const ctx = contextoDe(A)
  const base = { ctx, estrategia: A.estrategia, version: 1, devolucion: null, nota: null }
  it('marcoDelBrief y marcoDelConcepto: igual sin clave, con null y con vacío; con brief, el bloque entero', () => {
    const b0 = marcoDelBrief(base)
    expect(marcoDelBrief({ ...base, ctx: { ...ctx, briefDelDueno: null } })).toBe(b0)
    expect(marcoDelBrief({ ...base, ctx: { ...ctx, briefDelDueno: '  ' } })).toBe(b0)
    expect(marcoDelBrief({ ...base, ctx: { ...ctx, briefDelDueno: 'EL BRIEF X' } })).toContain(`${TITULO_DEL_BRIEF_DEL_DUENO}\n${REGLA_DEL_BRIEF_DEL_DUENO}\n<documento fuente="${FUENTE_DEL_BRIEF_DEL_DUENO}">\nEL BRIEF X\n</documento>`)
    const c = { ctx, estrategia: A.estrategia, briefTexto: 'brief', version: 1, nota: null }
    const c0 = marcoDelConcepto(c)
    expect(marcoDelConcepto({ ...c, ctx: { ...ctx, briefDelDueno: null } })).toBe(c0)
    expect(marcoDelConcepto({ ...c, ctx: { ...ctx, briefDelDueno: 'EL BRIEF X' } })).toContain('EL BRIEF X')
  })
  it('tareaDeEstrategia: el bloque va con los documentos (después del manual, antes de «Qué te pido»); sin brief, igual que hoy', () => {
    const p = { ctx, formatosPermitidos: { instagram: ['post'] }, version: 1 }
    const t0 = tareaDeEstrategia(p)
    expect(tareaDeEstrategia({ ...p, briefDelDueno: null })).toBe(t0)
    const t = tareaDeEstrategia({ ...p, briefDelDueno: 'EL BRIEF X' })
    const i = t.indexOf(TITULO_DEL_BRIEF_DEL_DUENO)
    expect(i).toBeGreaterThan(t.indexOf('# MANUAL DE MARCA'))
    expect(i).toBeLessThan(t.indexOf('# Qué te pido'))
    expect(t).toContain(`<documento fuente="${FUENTE_DEL_BRIEF_DEL_DUENO}">\nEL BRIEF X\n</documento>`)
  })
})

describe('la jefatura de la pieza recibe el mismo documento', () => {
  const lector = (r: { data?: PedidoDelDueno | null; lanza?: string }, vistos: string[] = []) => async (id: string) => { vistos.push(id); if (r.lanza) throw new Error(r.lanza); return r.data ?? null }
  it('con pedido: la regla y el documento entero, leídos por la campaña de la pieza', async () => {
    const vistos: string[] = []
    const d = await briefDelDuenoParaRevisar(lector({ data: PEDIDO_UNO }, vistos), UNO)
    expect(vistos).toEqual([UNO])
    expect(d?.titulo).toBe(TITULO_DEL_BRIEF_DEL_DUENO_PARA_REVISAR)
    expect(d?.texto).toBe(`${REGLA_DEL_BRIEF_DEL_DUENO}\n\n${briefDelDuenoEnTexto(PEDIDO_UNO)}`)
  })
  it('sin pedido: nada; si la lectura falla, viaja DICHO (nunca lanza)', async () => {
    expect(await briefDelDuenoParaRevisar(lector({ data: null }), SIN)).toBeNull()
    expect((await briefDelDuenoParaRevisar(lector({ lanza: 'tiempo agotado' }), UNO))?.texto).toContain('(no se pudo leer: tiempo agotado.')
  })
})

describe('por los pasos reales: la estrategia y la revalidación', () => {
  const ok = (o: unknown) => ({ success: true, structured_output: o, cost_usd: 0.3 })
  const MALO = BRIEF_BUENO.replace(CITA_DEL_PLAN, '«esta frase no está en ningún plan»')
  async function abierta(conPedido: boolean) {
    const al = new AlmacenMemoria({
      contextos: { [A.clientId]: contextoDe(A) },
      planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
      config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'ensayo', clientes_ensayo: [A.clientId], nuevo_orden: { clientes: [A.clientId] } },
      journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
    })
    const c = await abrirCampana(al, { workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', client_id: A.clientId, seco: true }, AHORA)
    const id = (c.cuerpo.campana as { id: string }).id
    if (conPedido) al.pedidosDelDueno[id] = PEDIDO_UNO
    return { al, id }
  }
  it('la tarea de la estrategia lleva el brief del dueño entero de su campaña; sin pedido, no', async () => {
    for (const conPedido of [true, false]) {
      const { al, id } = await abierta(conPedido)
      const p = await estrategiaPreparar(al, wf(id), AHORA)
      expect(p.status).toBe(200)
      const tarea = JSON.stringify(p.cuerpo.run_sdk)
      expect(tarea.includes(JSON.stringify(briefDelDuenoEnTexto(PEDIDO_UNO)).slice(1, -1))).toBe(conPedido)
      expect(tarea.includes(TITULO_DEL_BRIEF_DEL_DUENO)).toBe(conPedido)
    }
  })
  it('revalidar usa el brief del dueño de la campaña: la cita del dueño en «De qué parte del plan sale» pasa; sin pedido, no', async () => {
    for (const conPedido of [true, false]) {
      const { al, id } = await abierta(false)
      const p = await estrategiaPreparar(al, wf(id), AHORA)
      expect((await estrategiaGuardar(al, { ...wf(id), corrida_id: p.cuerpo.corrida_id, resultado: ok(A.estrategia) }, AHORA)).status).toBe(200)
      await briefAbrir(al, wf(id), AHORA)
      expect(await recibirBrief(al, { ...entrega(id, MALO), version: 1 }, AHORA)).toMatchObject({ estado: 'devuelta' })
      await briefAbrir(al, wf(id), AHORA)
      expect(await recibirBrief(al, { ...entrega(id, deQueParte(FRASE_UNO)), version: 2 }, AHORA)).toMatchObject({ estado: 'devuelta' })
      const b = al.briefsCreativos.find((x) => x.campana_id === id && x.version === 2)!
      await ponerNecesitaHumano(al, al.campanas.find((x) => x.id === id)!, `el brief creativo se devolvió por código dos veces: ${((b.leido as { bloqueos: string[] }).bloqueos).slice(0, 3).join(' · ')}`, AHORA)
      if (conPedido) al.pedidosDelDueno[id] = PEDIDO_UNO
      const r = await briefRevalidar(al, wf(id), AHORA)
      expect(r.status, JSON.stringify(r.cuerpo)).toBe(200)
      expect(r.cuerpo.pasa).toBe(conPedido)
    }
  })
})
