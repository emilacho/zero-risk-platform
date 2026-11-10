/**
 * 10-nov · decisión C de Emilio: «el agente no debe cambiar una frase sino ver cómo afecta esa petición de cambio a todo el documento; a veces se puede tratar de algo que
 * reestructura todo el documento; debe haber ese análisis de por medio cuando se pide un cambio». Se prueba el MARCO (lo que la mesa recibe) y que los lectores no cambian.
 * Lo que la mesa haga con la orden (un cambio puntual que no reescribe, uno de fondo que reestructura) solo se ve en la corrida real; aquí se fija que la orden pida las dos cosas.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import type { Campana, EstrategiaGuardada } from '../almacen'
import { briefAnteriorParaElMarco, ordenDeAnalisisDeImpacto, sinCodigosInternos, TITULO_DE_LO_QUE_CAMBIO } from '../cambios-pedidos'
import { ideasDelTexto, leerConcepto } from '../conceptos'
import { briefAbrir, briefDevueltoConNota, conceptoAbrir, conceptoDecidir, marcoDelBrief, marcoDelConcepto, MOTIVO_CAMBIOS_DE_EMILIO, pedidoDeCambiosVigente, recibirBrief, recibirConcepto } from '../mesas'

const A = clienteA()
const CAMP = 'camp-1'
const AHORA = '2026-10-09T12:00:00Z'
const NOTA = 'El insight dice «el bueno viene de la costa», pero la ciudad ya es de la Costa: es la PLAYA. Tuteo en todo, como el brief actual.'
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', campana_id: CAMP, ...extra })
const marco = (r: { cuerpo: Record<string, unknown> }) => (r.cuerpo.sobre as { marco_texto: string }).marco_texto

function almacen() {
  const al = new AlmacenMemoria({
    contextos: { [A.clientId]: contextoDe(A) },
    planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'ensayo', clientes_ensayo: [A.clientId], nuevo_orden: { clientes: [A.clientId] } },
    journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
  })
  const campana: Campana = {
    id: CAMP, client_id: A.clientId, plan_id: 'plan-1', fecha_inicio: A.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: A.campana.fecha_fin, zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: ['centro'],
    estado: 'calendario', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: true,
  }
  const estrategia: EstrategiaGuardada = { campana_id: CAMP, version: 1, estado: 'validada', contenido: A.estrategia, agente: 'social-media-strategist', modelo: null, costo_usd: 0, workflow_execution_id: 'ex-0', seco: true }
  al.campanas.push(campana)
  al.estrategias.push(estrategia)
  return al
}

const BRIEF = [
  '## Brief creativo de campaña · Cliente · brf-0123456789ab · v1',
  '## De qué parte del plan sale', 'Fase 1: «Se publican 3 posts por semana en Instagram y 1 en Facebook».',
  '## Insight', 'La gente del barrio desayuna de pie porque cree que no hay dónde sentarse antes de las ocho.',
  '## Mensaje', 'Hay mesa desde las siete.',
  '## Público', 'Vecinos del barrio que desayunan fuera entre semana (del plan).', '## Cómo sabremos que funcionó', 'Pedidos por semana contra la meta del plan, revisados cada lunes.', '## Objetivo', 'Que entren 30 desayunos nuevos por semana.', '- instagram: que miren el pan recién salido · «ven a desayunar»', '- facebook: que guarden el horario · «guarda el horario»',
  '## Tono', 'Cercano y directo, sin exclamaciones.',
  '## Obligatorios', '- vocabulario: pan de masa madre; mesa larga', '- prohibido: barato; gratis', '- lo que no se dice: precios',
  '## Faltantes', '- público: el manual no dice edades',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n')
const CONCEPTO = [
  '## Gran idea  La mesa larga · Noventa días para sentarse juntos',
  '## Por qué funciona  El insight del brief dice que la gente desayuna de pie; la idea lo convierte en costumbre.',
  '## Cómo se ve  Luz cálida, madera, manos sobre la mesa.',
  '## Cómo suena  Voz cercana, frases cortas.',
  '## Capítulo f1 · Abrir la mesa', 'Qué cuenta: la mesa se abre · Objetivo de la fase (cita): «presentar» · Cómo se ve en este capítulo: planos cerrados',
  '## Banco de ideas',
  '- C1-I01 · instagram · carrusel · la primera silla · mensaje: aquí siempre hay una silla para ti · gancho: ¿quién se sentaba aquí? · protagonista: la silla · serie: ninguna · foto:ninguna',
  '- C1-I02 · instagram · foto · la mesa a las 7 · mensaje: la mesa se llena de a poco · gancho: mira lo que pasa en dos horas · protagonista: la mesa · serie: ninguna · foto:ninguna',
  '- C1-I03 · facebook · foto · la silla que nadie usa · mensaje: ninguna silla sobra · gancho: esta silla lleva un mes vacía · protagonista: la silla · serie: ninguna · foto:ninguna',
  '## Caminos descartados y por qué', '- «El plato del día»: habla del producto, no de la mesa',
].join('\n')
const QUE_CAMBIO = `## ${TITULO_DE_LO_QUE_CAMBIO}\n- El cliente pidió «playa» en vez de «costa».\n- Toqué el insight y el mensaje, que se apoyaban en la costa.\n\n`
const entrega = (version: number, texto: string | null) => ({ campana_id: CAMP, version, encargo_id: `enc-${version}`, texto, costo_usd: 0.1, motivo: null })

async function conConceptoListo(al = almacen()) {
  expect((await briefAbrir(al, wf(), AHORA)).status).toBe(200)
  expect(await recibirBrief(al, entrega(1, BRIEF), AHORA)).toMatchObject({ ok: true, estado: 'validada' })
  expect((await conceptoAbrir(al, wf(), AHORA)).status).toBe(200)
  expect(await recibirConcepto(al, entrega(1, CONCEPTO), AHORA)).toMatchObject({ ok: true, estado: 'lista' })
  return al
}

describe('la orden de análisis de impacto (igual para el brief y la gran idea · genérica)', () => {
  for (const doc of ['el brief', 'la gran idea'] as const) {
    const o = ordenDeAnalisisDeImpacto(doc)
    it(`🔴 ${doc}: analizar ANTES el efecto en TODO el documento, cambiar lo pedido y lo que se derive, conservar lo no afectado, y rehacer todo si el cambio lo pide`, () => {
      expect(o).toMatch(/ANTES de escribir, analiza cómo afecta CADA cambio pedido a TODO/)
      expect(o).toMatch(/de rebote/)
      expect(o).toMatch(/reestructurar/)
      expect(o).toMatch(/Cambia lo pedido Y todo lo que se derive/)
      expect(o).toMatch(/No basta con reemplazar una frase/)
      expect(o).toMatch(/Conserva tal cual lo que el cambio no afecta/)
      expect(o).toMatch(/Si el cambio pide rehacer todo, rehazlo todo/)
    })
    it(`🔴 ${doc}: el documento nuevo ABRE con «## Qué cambió y por qué», sin códigos ni versiones`, () => {
      expect(o).toContain(`ABRE con «## ${TITULO_DE_LO_QUE_CAMBIO}»`)
      expect(o).toMatch(/Sin códigos internos, sin números de versión/)
    })
  }
  it('sin nombre de cliente ni de rubro: sirve para cualquiera', () => {
    for (const doc of ['el brief', 'la gran idea'] as const) expect(ordenDeAnalisisDeImpacto(doc)).not.toMatch(/Náufrago|encebollado|costa|playa/i)
  })
})

describe('el marco del brief: el anterior y la orden SOLO con cambios del dueño', () => {
  const ctx = contextoDe(A)
  const ANT = briefAnteriorParaElMarco({ version: 2, texto_md: BRIEF })
  it('🔴 con nota: la nota, la orden y el brief anterior, en ese orden y una vez', () => {
    const m = marcoDelBrief({ ctx, estrategia: A.estrategia, version: 3, devolucion: null, nota: NOTA, anterior: ANT })
    const iNota = m.indexOf('# CAMBIOS PEDIDOS POR EL CLIENTE'), iOrden = m.indexOf('# CÓMO SE APLICAN LOS CAMBIOS'), iAnt = m.indexOf('# EL BRIEF ANTERIOR (versión 2)')
    expect(iNota).toBeGreaterThan(-1)
    expect(iNota).toBeLessThan(iOrden)
    expect(iOrden).toBeLessThan(iAnt)
    expect(m.split('# EL BRIEF ANTERIOR').length).toBe(2)
    expect(m).toContain('La gente del barrio desayuna de pie')
  })
  it('🔴 sin nota no hay orden ni anterior (aunque llegue el anterior)', () => {
    const m = marcoDelBrief({ ctx, estrategia: A.estrategia, version: 2, devolucion: 'falta el público', nota: null, anterior: ANT })
    expect(m).not.toContain('CÓMO SE APLICAN LOS CAMBIOS')
    expect(m).not.toContain('EL BRIEF ANTERIOR')
    expect(m).toContain('# DEVOLUCIÓN')
  })
  it('🔴 el brief anterior viaja sin sus códigos internos', () => {
    expect(ANT).toContain('## Brief creativo de campaña · Cliente')
    expect(ANT).not.toMatch(/brf-|· v1/)
  })
  it('briefDevueltoConNota: solo «devuelta» por el dueño, con nota y con texto', () => {
    const b = { estado: 'devuelta' as const, motivo: MOTIVO_CAMBIOS_DE_EMILIO as string | null, devolucion_texto: 'playa' as string | null, texto_md: BRIEF as string | null }
    expect(briefDevueltoConNota(b)).toBe(true)
    expect(briefDevueltoConNota({ ...b, motivo: null })).toBe(false)
    expect(briefDevueltoConNota({ ...b, estado: 'validada' as const })).toBe(false)
    expect(briefDevueltoConNota({ ...b, devolucion_texto: '  ' })).toBe(false)
    expect(briefDevueltoConNota({ ...b, texto_md: null })).toBe(false)
    expect(briefDevueltoConNota(null)).toBe(false)
  })
})

describe('el camino real: «Pedir cambios» al brief → brief nuevo con el anterior y la orden → gran idea con la orden', () => {
  it('🔴 la mesa del brief recibe la nota, la orden y el brief anterior completo (sin códigos)', async () => {
    const al = await conConceptoListo()
    expect((await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'brief', nota: NOTA }), AHORA)).status).toBe(200)
    const r = await briefAbrir(al, wf(), AHORA)
    expect(r.cuerpo).toMatchObject({ version: 2 })
    const m = marco(r)
    expect(m).toContain(NOTA)
    expect(m).toContain('# CÓMO SE APLICAN LOS CAMBIOS')
    expect(m).toContain('# EL BRIEF ANTERIOR (versión 1)')
    for (const l of ['## Insight', 'La gente del barrio desayuna de pie', '## Obligatorios', '- prohibido: barato; gratis']) expect(m).toContain(l)
    expect(m).not.toContain('brf-0123456789ab')
  })
  it('🔴 si el sobre se rescata (brief en borrador), el anterior y la orden siguen ahí', async () => {
    const al = await conConceptoListo()
    await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'brief', nota: NOTA }), AHORA)
    await briefAbrir(al, wf(), AHORA)
    const r = await briefAbrir(al, wf(), AHORA)
    expect(r.cuerpo).toMatchObject({ ya_abierta: true, version: 2 })
    expect(marco(r)).toContain('# EL BRIEF ANTERIOR (versión 1)')
    expect(marco(r)).toContain('# CÓMO SE APLICAN LOS CAMBIOS')
  })
  it('🔴 después, la gran idea recibe la nota, el resumen de la anterior y la orden de análisis', async () => {
    const al = await conConceptoListo()
    await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'brief', nota: NOTA }), AHORA)
    await briefAbrir(al, wf(), AHORA)
    expect(await recibirBrief(al, entrega(2, QUE_CAMBIO + BRIEF), AHORA)).toMatchObject({ ok: true, estado: 'validada' })
    const m = marco(await conceptoAbrir(al, wf(), AHORA))
    expect(m).toContain(NOTA)
    expect(m).toContain('# LA VERSIÓN ANTERIOR (v1)')
    expect(m).toContain(ordenDeAnalisisDeImpacto('la gran idea'))
  })
  it('🔴 «Pedir cambios» al concepto: la gran idea lleva la orden; el brief no se reabre', async () => {
    const al = await conConceptoListo()
    await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'concepto', nota: NOTA }), AHORA)
    expect((await briefAbrir(al, wf(), AHORA)).cuerpo).toMatchObject({ ya_hecha: true })
    expect(marco(await conceptoAbrir(al, wf(), AHORA))).toContain('# CÓMO SE APLICAN LOS CAMBIOS')
  })
  it('🔴 un brief devuelto por el CÓDIGO (sin nota del dueño) no lleva el anterior ni la orden', async () => {
    const al = almacen()
    await briefAbrir(al, wf(), AHORA)
    expect(await recibirBrief(al, entrega(1, BRIEF.replace('## Insight', '## Insiht')), AHORA)).toMatchObject({ ok: true, estado: 'devuelta' })
    const m = marco(await briefAbrir(al, wf(), AHORA))
    expect(m).toContain('# DEVOLUCIÓN')
    expect(m).not.toContain('EL BRIEF ANTERIOR')
    expect(m).not.toContain('CÓMO SE APLICAN LOS CAMBIOS')
  })
  it('🔴 la primera vez (sin cambios) el marco del brief y el de la gran idea quedan como antes', async () => {
    const al = almacen()
    const m1 = marco(await briefAbrir(al, wf(), AHORA))
    await recibirBrief(al, entrega(1, BRIEF), AHORA)
    const m2 = marco(await conceptoAbrir(al, wf(), AHORA))
    for (const m of [m1, m2]) { expect(m).not.toContain('CÓMO SE APLICAN LOS CAMBIOS'); expect(m).not.toContain('EL BRIEF ANTERIOR') }
  })
})

describe('«## Qué cambió y por qué» no cambia lo que se lee ni lo que se valida', () => {
  it('🔴 brief: con el bloque al inicio queda validado y su copia ordenada es la misma', async () => {
    const sin = almacen(), con = almacen()
    for (const al of [sin, con]) await briefAbrir(al, wf(), AHORA)
    await recibirBrief(sin, entrega(1, BRIEF), AHORA)
    expect(await recibirBrief(con, entrega(1, QUE_CAMBIO + BRIEF), AHORA)).toMatchObject({ ok: true, estado: 'validada' })
    const a = (await sin.briefsDe(CAMP))[0].leido, b = (await con.briefsDe(CAMP))[0].leido
    expect(b).toEqual(a)
  })
  it('🔴 gran idea (caso real de la v2 de Náufrago): mismo nombre, misma frase, mismas ideas, mismos capítulos y mismos bloqueos', () => {
    const V2 = readFileSync(join(__dirname, '../__fixtures__/concepto-v2-28de888e.md'), 'utf8')
    const ins = { fases: [], redes: [], prohibidas: [], fotos: [] }
    const a = leerConcepto(V2, ins), b = leerConcepto(QUE_CAMBIO + V2, ins)
    expect(b.gran_idea).toEqual(a.gran_idea)
    expect(b.banco).toEqual(a.banco)
    expect(b.capitulos).toEqual(a.capitulos)
    expect(b.bloqueos).toEqual(a.bloqueos)
    expect(b.avisos).toEqual(a.avisos)
    expect(ideasDelTexto(QUE_CAMBIO + V2).length).toBe(ideasDelTexto(V2).length)
  })
})

describe('códigos internos fuera de lo que lee el dueño', () => {
  it('🔴 caso real: el título del brief v2 de Náufrago pierde «brf-… · v2»; foto:<id> NO se toca (la cadena lo lee)', () => {
    expect(sinCodigosInternos('## Brief creativo de campaña · Náufrago · brf-28de888eb3f2 · v2 (revisión)')).toBe('## Brief creativo de campaña · Náufrago (revisión)')
    expect(sinCodigosInternos('ver brf-28de888eb3f2-v2 y con-28de888eb3f2-v3')).toBe('ver y')
    expect(sinCodigosInternos('- C1-I01 · instagram · foto · x · foto:9f71b0e9')).toBe('- C1-I01 · instagram · foto · x · foto:9f71b0e9')
  })
})

describe('10-nov · CC7 (a): el pedido de Emilio sigue vivo UNA vez si el brief que siguió lo devolvió el CÓDIGO (caso real Náufrago v2 → v3 → v4)', () => {
  // el brief de la vuelta de cambios, sin las 2 secciones que el formato de hoy exige (como el v3 real)
  const SIN_DOS = (QUE_CAMBIO + BRIEF).replace(/## Público\n.*\n/, '').replace(/## Cómo sabremos que funcionó\n.*\n/, '')
  async function devueltoPorElCodigoTrasCambios() {
    const al = await conConceptoListo()
    expect((await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'brief', nota: NOTA }), AHORA)).status).toBe(200)
    expect((await briefAbrir(al, wf(), AHORA)).cuerpo).toMatchObject({ version: 2 })
    expect(await recibirBrief(al, entrega(2, SIN_DOS), AHORA)).toMatchObject({ estado: 'devuelta' })
    return al
  }
  it('🔴 abrir sin nota en el pedido: sale la versión siguiente con la nota de Emilio, el brief devuelto como base y lo que le falta', async () => {
    const al = await devueltoPorElCodigoTrasCambios()
    const r = await briefAbrir(al, wf(), AHORA)
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ version: 3 })
    const m = marco(r)
    expect(m).toContain(NOTA)
    expect(m).toContain('# CÓMO SE APLICAN LOS CAMBIOS')
    expect(m).toContain('# EL BRIEF ANTERIOR (versión 2)')
    expect(m).toContain('# LO QUE LE FALTA AL BRIEF ANTERIOR')
    expect(m).toContain('«## Público», «## Cómo sabremos que funcionó»')
    expect(m).toContain('# DEVOLUCIÓN')
  })
  it('🔴 con la nota en el pedido (el reintento por la puerta), la base es igual el último texto escrito', async () => {
    const al = await devueltoPorElCodigoTrasCambios()
    const m = marco(await briefAbrir(al, wf({ nota: NOTA }), AHORA))
    expect(m).toContain('# EL BRIEF ANTERIOR (versión 2)')
    expect(m).toContain('# LO QUE LE FALTA AL BRIEF ANTERIOR')
  })
  it('🔴 el rescate del sobre (brief en borrador) conserva la nota heredada y la base', async () => {
    const al = await devueltoPorElCodigoTrasCambios()
    await briefAbrir(al, wf(), AHORA)
    const r = await briefAbrir(al, wf(), AHORA)
    expect(r.cuerpo).toMatchObject({ ya_abierta: true, version: 3 })
    expect(marco(r)).toContain(NOTA)
    expect(marco(r)).toContain('# EL BRIEF ANTERIOR (versión 2)')
  })
  it('🔴 UNA vez: si el código devuelve también esa versión, ya no hay nota y la campaña va a revisión humana', async () => {
    const al = await devueltoPorElCodigoTrasCambios()
    await briefAbrir(al, wf(), AHORA)
    expect(await recibirBrief(al, entrega(3, SIN_DOS), AHORA)).toMatchObject({ estado: 'devuelta' })
    const r = await briefAbrir(al, wf(), AHORA)
    expect(r.status).toBe(409)
    expect(r.cuerpo).toMatchObject({ error: 'brief_agotado', necesita_humano: true })
  })
  it('sin cambios de Emilio no cambia nada: un brief devuelto por el código no hereda nota ni base', () => {
    const v = (version: number, estado: 'devuelta' | 'validada', motivo: string | null) => ({ version, estado, motivo, devolucion_texto: motivo ? NOTA : 'falta el público', texto_md: BRIEF })
    expect(pedidoDeCambiosVigente([v(1, 'devuelta', null)], 2, null)).toEqual({ nota: null, base: null, heredada: false })
    expect(pedidoDeCambiosVigente([v(1, 'devuelta', null), v(2, 'devuelta', null)], 3, null)).toEqual({ nota: null, base: null, heredada: false })
    // la nota del anterior inmediato manda, sin heredar
    expect(pedidoDeCambiosVigente([v(1, 'devuelta', MOTIVO_CAMBIOS_DE_EMILIO)], 2, null)).toMatchObject({ nota: NOTA, heredada: false })
    // si la versión que siguió al pedido salió VALIDADA, el pedido ya se cumplió: no se hereda (abrir otra vez sin nota = «ya hecha»)
    expect(pedidoDeCambiosVigente([v(1, 'devuelta', MOTIVO_CAMBIOS_DE_EMILIO), v(2, 'validada', null)], 3, null)).toEqual({ nota: null, base: null, heredada: false })
    // la herencia salta UNA versión, no dos
    expect(pedidoDeCambiosVigente([v(1, 'devuelta', MOTIVO_CAMBIOS_DE_EMILIO), v(2, 'devuelta', null), v(3, 'devuelta', null)], 4, null)).toMatchObject({ nota: null, base: null })
  })
})

it('🔴 en el camino real: si la versión tras los cambios sale VALIDADA, abrir otra vez sin nota no rehace el brief', async () => {
  const al = await conConceptoListo()
  await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'brief', nota: NOTA }), AHORA)
  await briefAbrir(al, wf(), AHORA)
  expect(await recibirBrief(al, entrega(2, QUE_CAMBIO + BRIEF), AHORA)).toMatchObject({ estado: 'validada' })
  expect((await briefAbrir(al, wf(), AHORA)).cuerpo).toMatchObject({ ya_hecha: true, version: 2 })
})
