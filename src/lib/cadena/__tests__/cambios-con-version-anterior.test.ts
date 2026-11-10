/**
 * 10-nov · FASE 2, opción A (Lenovo por Emilio, con las 2 condiciones de CC7): cuando el cliente pide cambios sobre una gran idea, la mesa siguiente recibe
 * su nota y un RESUMEN de la versión anterior (gran idea, por qué funciona, cómo se ve, cómo suena, id · red · idea del banco) para conservarla y COMPLETAR el banco.
 * 1.ª condición: nunca el texto entero. 2.ª: solo después de «cambios», por los dos caminos (brief o gran idea); nunca en una vuelta normal ni tras un «sin mesa».
 * Caso real: la v2 de la campaña 28de888e («El oro que nunca buscaste»), 22 mil caracteres; la v3 salió con otra idea y sin la nota porque los cambios apuntaron al brief.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import type { Campana, ConceptoGuardado, EstrategiaGuardada } from '../almacen'
import { ideasDelTexto, LARGO_MAXIMO_POR_SECCION_DEL_RESUMEN, resumenDeLaVersionAnterior } from '../conceptos'
import { anteriorConCambios, briefAbrir, conceptoAbrir, conceptoDecidir, marcoDelConcepto, recibirBrief, recibirConcepto } from '../mesas'

const V2 = readFileSync(join(__dirname, '../__fixtures__/concepto-v2-28de888e.md'), 'utf8')
const A = clienteA()
const CAMP = 'camp-1'
const AHORA = '2026-10-09T12:00:00Z'
const NOTA = 'Me gusta «El oro que nunca buscaste», quédense con ella. Cambios: (1) tuteo en TODO; (2) completen el banco'
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
const entrega = (version: number, texto: string | null) => ({ campana_id: CAMP, version, encargo_id: `enc-${version}`, texto, costo_usd: 0.1, motivo: null })

async function conConceptoListo() {
  const al = almacen()
  expect((await briefAbrir(al, wf(), AHORA)).status).toBe(200)
  expect(await recibirBrief(al, entrega(1, BRIEF), AHORA)).toMatchObject({ ok: true, estado: 'validada' })
  expect((await conceptoAbrir(al, wf(), AHORA)).status).toBe(200)
  expect(await recibirConcepto(al, entrega(1, CONCEPTO), AHORA)).toMatchObject({ ok: true, estado: 'lista' })
  return al
}

describe('el resumen de la versión anterior (1.ª condición: nunca el texto entero)', () => {
  const r = resumenDeLaVersionAnterior(V2, 2)
  it('🔴 caso real v2: lleva la gran idea, por qué funciona, cómo se ve, cómo suena y cada id del banco con su red', () => {
    expect(r).toContain('(v2)')
    expect(r).toContain('El oro que nunca buscaste')
    for (const t of ['## Por qué funciona', '## Cómo se ve', '## Cómo suena']) expect(r).toContain(t)
    expect(r).toContain('Voz directa y costera')
    // una idea repetida (p. ej. en «Ideas que salen») cuenta una vez, con su primera línea
    const ideas = ideasDelTexto(V2).filter((i, n, t) => t.findIndex((x) => x.id === i.id) === n)
    expect(ideas.length).toBeGreaterThan(5)
    for (const i of ideas) expect(r).toContain(`- ${i.id} · ${i.red} · `)
    expect(r).toContain(`(${ideas.length} ideas)`)
  })
  it('🔴 caso real v2: NO el texto entero (sin capítulos, sin caminos descartados, sin citas, sin mensaje ni gancho de las ideas, sin asteriscos) y mucho más corto', () => {
    expect(r).not.toContain('## Capítulo')
    expect(r).not.toContain('Caminos descartados')
    expect(r).not.toContain('## Citas')
    expect(r).not.toContain('## Ideas que salen')
    expect(r).not.toMatch(/mensaje:|gancho:|protagonista:/)
    expect(r).not.toContain('**')
    expect(r.length).toBeLessThan(V2.length / 2)
  })
  it('🔴 CC7 · las dos órdenes de la opción A: conservar la gran idea corrigiendo SOLO lo pedido, y COMPLETAR el banco sin repetir', () => {
    expect(r).toContain('CONSERVA su gran idea y corrige SOLO lo pedido')
    expect(r).toContain('COMPLÉTALO; no repitas estas, suma las que faltan')
  })
  it('🔴 CC7 · de la gran idea va solo la primera línea; los asteriscos de una idea del banco se limpian', () => {
    const md = '## Gran idea\n**La idea** · su frase\nUn párrafo que explica la idea y no debe viajar.\n## Banco de ideas\n- C1-I01 · instagram · foto · una **idea** con marca · mensaje: m · gancho: g · protagonista: p · serie: ninguna · foto:ninguna'
    const s = resumenDeLaVersionAnterior(md, 1)
    expect(s).toContain('## Gran idea\nLa idea · su frase\n')
    expect(s).not.toContain('Un párrafo que explica')
    expect(s).toContain('- C1-I01 · instagram · ')
    expect(s.split('\n').find((l) => l.startsWith('- C1-I01'))).not.toContain('*')
  })
  it('🔴 cada sección va acotada y cada idea a 120 caracteres', () => {
    const largo = `## Gran idea\nUna idea\n## Por qué funciona\n${'x'.repeat(5000)}\n## Banco de ideas\n- C1-I01 · instagram · foto · ${'y'.repeat(400)} · mensaje: m · gancho: g · protagonista: p · serie: ninguna · foto:ninguna`
    const s = resumenDeLaVersionAnterior(largo, 1)
    expect(s).toContain('x'.repeat(LARGO_MAXIMO_POR_SECCION_DEL_RESUMEN))
    expect(s).not.toContain('x'.repeat(LARGO_MAXIMO_POR_SECCION_DEL_RESUMEN + 1))
    expect(s).toContain(`- C1-I01 · instagram · ${'y'.repeat(120)}`)
    expect(s).not.toContain('y'.repeat(121))
  })
  it('🔴 en el marco va DESPUÉS de la nota y una sola vez; sin resumen, no aparece', () => {
    const ctx = contextoDe(A)
    const m = marcoDelConcepto({ ctx, estrategia: A.estrategia, briefTexto: 'brief', version: 3, nota: NOTA, anterior: r })
    expect(m.indexOf('# CAMBIOS PEDIDOS POR EL CLIENTE')).toBeLessThan(m.indexOf('# LA VERSIÓN ANTERIOR (v2)'))
    expect(m.split('# LA VERSIÓN ANTERIOR').length).toBe(2)
    expect(marcoDelConcepto({ ctx, estrategia: A.estrategia, briefTexto: 'brief', version: 3, nota: NOTA })).not.toContain('LA VERSIÓN ANTERIOR')
  })
})

describe('cuándo viaja (2.ª condición: solo después de «cambios», por los dos caminos)', () => {
  it('🔴 cambios a la GRAN IDEA: la v2 lleva la nota y el resumen de la v1; la reentrada (ya abierta) también', async () => {
    const al = await conConceptoListo()
    expect((await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'concepto', nota: NOTA }), AHORA)).status).toBe(200)
    const a = await conceptoAbrir(al, wf(), AHORA)
    expect(a.cuerpo.version).toBe(2)
    expect(marco(a)).toContain(`# CAMBIOS PEDIDOS POR EL CLIENTE (sobre la versión anterior)\n${NOTA}`)
    expect(marco(a)).toContain('# LA VERSIÓN ANTERIOR (v1)')
    expect(marco(a)).toContain('La mesa larga')
    expect(marco(a)).toContain('- C1-I03 · facebook · ')
    expect(marco(a)).not.toContain('El plato del día')
    const re = await conceptoAbrir(al, wf(), AHORA)
    expect(re.cuerpo).toMatchObject({ ya_abierta: true, version: 2 })
    expect(marco(re)).toBe(marco(a))
  })
  it('🔴 cambios al BRIEF: tras el brief nuevo, la gran idea siguiente recibe también la nota y el resumen (antes iba sin nota)', async () => {
    const al = await conConceptoListo()
    expect((await conceptoDecidir(al, wf({ decision: 'cambios', apunta_a: 'brief', nota: NOTA }), AHORA)).cuerpo).toMatchObject({ siguiente: { mesa: 'brief', version: 2 } })
    expect((await briefAbrir(al, wf({ nota: NOTA }), AHORA)).cuerpo.version).toBe(2)
    expect(await recibirBrief(al, entrega(2, BRIEF), AHORA)).toMatchObject({ ok: true, estado: 'validada' })
    const a = await conceptoAbrir(al, wf(), AHORA)
    expect(a.status, JSON.stringify(a.cuerpo)).toBe(200)
    expect(a.cuerpo).toMatchObject({ version: 2, brief_version: 2 })
    expect(marco(a)).toContain(NOTA)
    expect(marco(a)).toContain('# LA VERSIÓN ANTERIOR (v1)')
    expect(al.conceptos[1].nota_de_emilio).toBe(NOTA)
    const re = await conceptoAbrir(al, wf(), AHORA)
    expect(re.cuerpo).toMatchObject({ ya_abierta: true, version: 2 })
    expect(marco(re)).toBe(marco(a))
  })
  it('🔴 vuelta normal (primera, o con nota pero sin cambios decididos): sin resumen', async () => {
    const al = almacen()
    await briefAbrir(al, wf(), AHORA)
    await recibirBrief(al, entrega(1, BRIEF), AHORA)
    expect(marco(await conceptoAbrir(al, wf(), AHORA))).not.toContain('LA VERSIÓN ANTERIOR')
    await recibirConcepto(al, entrega(1, CONCEPTO), AHORA)
    const otra = await conceptoAbrir(al, wf({ nota: 'otra vuelta' }), AHORA)
    expect(otra.cuerpo.version).toBe(2)
    expect(marco(otra)).not.toContain('LA VERSIÓN ANTERIOR')
  })
  it('🔴 solo la INMEDIATAMENTE anterior, solo `lista` + `cambios` y con texto: nunca tras un «sin mesa» ni sobre una aprobada', () => {
    const k = (version: number, estado: ConceptoGuardado['estado'], aprobacion: ConceptoGuardado['aprobacion'], texto_md: string | null = CONCEPTO) => ({ version, estado, aprobacion, texto_md }) as ConceptoGuardado
    expect(anteriorConCambios([k(1, 'lista', 'cambios')], 2)).toContain('(v1)')
    expect(anteriorConCambios([k(2, 'lista', 'cambios'), k(1, 'lista', 'aprobado')], 3)).toContain('(v2)')
    expect(anteriorConCambios([k(1, 'lista', 'cambios'), k(2, 'sin_mesa', null, null)], 3)).toBeNull()
    expect(anteriorConCambios([k(1, 'lista', 'aprobado')], 2)).toBeNull()
    expect(anteriorConCambios([k(1, 'sin_mesa', 'cambios')], 2)).toBeNull()
    expect(anteriorConCambios([k(1, 'lista', 'pendiente')], 2)).toBeNull()
    expect(anteriorConCambios([k(1, 'lista', 'cambios', null)], 2)).toBeNull()
    expect(anteriorConCambios([k(1, 'lista', 'cambios'), k(2, 'abierta', null, null)], 2)).toContain('(v1)')
    expect(anteriorConCambios([], 1)).toBeNull()
  })
})
