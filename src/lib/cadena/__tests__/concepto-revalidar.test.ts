/**
 * 09-nov · ALTO de Lenovo 21:56Z · la gran idea v1 de Náufrago quedó `sin_mesa` EN FALSO («sin banco de ideas válido») · CC2 · US$ 0, sin modelo, sin red.
 * Causa: la mesa de concepto entregaba solo la integración de la dirección (que cita los ids del banco) y dejaba afuera los aportes de los miembros, que es donde están
 * las líneas de idea con su mensaje y su gancho. Arreglo: (1) la entrega de la mesa de concepto lleva las líneas de idea de los aportes; (2) `concepto/revalidar` relee una
 * versión ya pagada desde el libro de su mesa, sin rehacerla; (3) `conceptoVigente`: esa versión, esperando a Emilio, manda sobre las `sin_mesa` posteriores.
 * El caso real va con el libro tal cual (`__fixtures__/libro-concepto-577c6038.json`) y la estrategia validada de la campaña (`estrategia-28de888e.json`).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import type { Campana, EstrategiaGuardada } from '../almacen'
import { briefAbrir, conceptoAbrir, conceptoDecidir, conceptoParaElCalendario, conceptoVigente, etapaDeReentrada, recibirBrief, recibirConcepto, TIPO_DE_ESPERA_DE_CONCEPTO } from '../mesas'
import { insumosDesdeEstrategia, leerConcepto } from '../conceptos'
import { conceptoRevalidar } from '../revalidar'
import { ACCIONES } from '../acciones'
import { ideasDeLosAportes, lineaDeIdeaLimpia, textoDeLaMesaParaLaCadena, textoParaLaCadena, TITULO_IDEAS_DE_LOS_APORTES } from '../../oficina/mesa/de-la-cadena'

const A = clienteA()
const CAMP = 'camp-1'
const AHORA = '2026-10-09T12:00:00Z'
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', campana_id: CAMP, ...extra })
type Linea = { n: number; de: string; tipo: string; texto: string }

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

const BRIEF_BUENO = [
  '## De qué parte del plan sale', 'Fase 1: «Se publican 3 posts por semana en Instagram y 1 en Facebook».',
  '## Insight', 'La gente del barrio desayuna de pie porque cree que no hay dónde sentarse antes de las ocho.',
  '## Mensaje', 'Hay mesa desde las siete.',
  '## Público', 'Vecinos del barrio que desayunan fuera entre semana (del plan).', '## Cómo sabremos que funcionó', 'Pedidos por semana contra la meta del plan, revisados cada lunes.', '## Objetivo', 'Que entren 30 desayunos nuevos por semana.', '- instagram: que miren el pan recién salido · «ven a desayunar»', '- facebook: que guarden el horario · «guarda el horario»',
  '## Tono', 'Cercano y directo, sin exclamaciones.',
  '## Obligatorios', '- vocabulario: pan de masa madre; mesa larga', '- prohibido: barato; gratis', '- lo que no se dice: precios',
  '## Faltantes', '- público: el manual no dice edades',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n')

/** la integración como la escribió la dirección de Náufrago: el banco son solo ids; las líneas completas están en el aporte que cita (A5) */
const INTEGRACION = [
  '## Gran idea  La mesa larga · Noventa días para sentarse juntos',
  '## Por qué funciona  El insight del brief dice que la gente desayuna de pie; la idea lo convierte en costumbre.',
  '## Cómo se ve  Luz cálida, madera, manos sobre la mesa.',
  '## Cómo suena  Voz cercana, frases cortas.',
  '## Capítulo f1 · Abrir la mesa', 'Qué cuenta: la mesa se abre · Objetivo de la fase (cita): «presentar» · Cómo se ve en este capítulo: planos cerrados',
  '- C1-I01 · C1-I02 · C1-I03',
  '**A5 usé:** el banco de ideas completo del capítulo.',
  '## Caminos descartados y por qué', '- «El plato del día»: habla del producto, no de la mesa',
].join('\n')
const APORTE_CON_IDEAS = [
  '## Mi banco (lo que propongo)',
  '- `C1-I01 · instagram · carrusel · la primera silla · mensaje: aquí siempre hay una silla para ti · gancho: ¿quién se sentaba aquí? · protagonista: la silla · serie: ninguna · foto:ninguna`',
  '- `C1-I02 · instagram · foto · la mesa a las 7 · mensaje: la mesa se llena de a poco · gancho: mira lo que pasa en dos horas · protagonista: la mesa · serie: ninguna · foto:ninguna`',
  '- **C1-I03** · facebook · foto · la silla que nadie usa · mensaje: ninguna silla sobra · gancho: esta silla lleva un mes vacía · protagonista: la silla · serie: ninguna · foto:ninguna',
].join('\n')
/** otro miembro numeró desde I01 también (lo que pasó en Náufrago): su C1-I01 choca con el citado */
const APORTE_QUE_CHOCA = '## Gran idea  OTRA IDEA QUE NO MANDA\n- `C1-I01 · instagram · reel · otra cosa · mensaje: otro mensaje · gancho: otro gancho · protagonista: x · serie: ninguna · foto:ninguna`'
const LIBRO: Linea[] = [
  { n: 1, de: 'creative-director-mesa', tipo: 'dirige', texto: 'abre la mesa' },
  { n: 5, de: 'content-creator', tipo: 'aporta', texto: APORTE_CON_IDEAS },
  { n: 6, de: 'video-editor', tipo: 'aporta', texto: APORTE_QUE_CHOCA },
  { n: 7, de: 'creative-director-mesa', tipo: 'integra', texto: INTEGRACION },
]
const SIN_GRAN_IDEA_PERO_CON_MOTIVO = 'sin_concepto: sin banco de ideas válido (ninguna idea con mensaje y gancho propios)'

const entrega = (version: number, texto: string | null, extra: Record<string, unknown> = {}) => ({ campana_id: CAMP, version, encargo_id: `enc-${version}`, texto, costo_usd: 4.58, motivo: null, ...extra })

/** el caso de Náufrago: v1 entregó solo la integración (sin_concepto), v2 frenada por tope y sin texto → la campaña queda en necesita_humano por la mesa de concepto */
async function comoNaufrago(o: { libro?: Linea[]; v2?: boolean } = {}) {
  const al = almacen()
  expect((await briefAbrir(al, wf(), AHORA)).status).toBe(200)
  expect(await recibirBrief(al, entrega(1, BRIEF_BUENO, { costo_usd: 0.1 }), AHORA)).toMatchObject({ ok: true, estado: 'validada' })
  await conceptoAbrir(al, wf(), AHORA)
  const viejo = textoParaLaCadena(o.libro ?? LIBRO, null) // la entrega de ANTES: solo la integración
  expect(await recibirConcepto(al, entrega(1, viejo), AHORA)).toMatchObject({ ok: true, estado: 'sin_mesa' })
  expect(al.conceptos[0].motivo).toBe(SIN_GRAN_IDEA_PERO_CON_MOTIVO)
  al.libros['enc-1'] = o.libro ?? LIBRO
  if (o.v2 !== false) {
    expect((await conceptoAbrir(al, wf(), AHORA)).cuerpo.version).toBe(2)
    expect(await recibirConcepto(al, entrega(2, null, { motivo: 'la mesa llegó al techo absoluto' }), AHORA)).toMatchObject({ ok: true, estado: 'sin_mesa' })
    expect(al.campanas[0].estado).toBe('necesita_humano')
    expect(al.campanas[0].estado_motivo).toMatch(/^la mesa de concepto no entregó concepto dos veces/)
  }
  return al
}
const foto = (al: AlmacenMemoria) => JSON.stringify({ c: al.campanas, k: al.conceptos, e: al.esperas, t: al.tarjetas })
const nhVivas = (al: AlmacenMemoria) => al.esperas.filter((e) => e.campana_id === CAMP && e.objeto_tipo === 'necesita_humano' && e.estado === 'viva')

describe('la entrega de la mesa de concepto lleva las ideas de los aportes', () => {
  const libroReal = (JSON.parse(readFileSync(join(__dirname, '..', '__fixtures__', 'libro-concepto-577c6038.json'), 'utf8')) as { libro: Linea[] }).libro
  const e = JSON.parse(readFileSync(join(__dirname, '..', '__fixtures__', 'estrategia-28de888e.json'), 'utf8')) as Parameters<typeof insumosDesdeEstrategia>[0]
  const insReal = insumosDesdeEstrategia(e, [], [])

  it('🔴 caso real 577c6038: con la entrega de ANTES (solo la integración) el lector da el mismo falso rojo que se vio en producción', () => {
    const l = leerConcepto(textoParaLaCadena(libroReal, null), insReal)
    expect(l.estado).toBe('sin_concepto')
    expect(l.bloqueos).toEqual(['sin banco de ideas válido (ninguna idea con mensaje y gancho propios)'])
  })
  it('🔴 caso real 577c6038: con la entrega de HOY el lector encuentra el banco; manda el aporte que cita la dirección (A23) y los choques de id se declaran', () => {
    const texto = textoParaLaCadena(libroReal, null, true)
    const l = leerConcepto(texto, insReal)
    expect(l.estado, JSON.stringify(l.bloqueos)).not.toBe('sin_concepto')
    expect(l.bloqueos).toEqual([])
    expect(l.gran_idea?.nombre).toBeTruthy()
    expect(l.banco.length).toBeGreaterThanOrEqual(40)
    // C1-I01 es la del aporte A23 (content-creator), la que la dirección dice que usó entera
    const a23 = libroReal.find((x) => x.n === 23)!.texto.split('\n').find((x) => x.includes('C1-I01'))!
    expect(l.banco.find((i) => i.id === 'C1-I01')!.linea).toBe(lineaDeIdeaLimpia(a23))
    expect(l.ideas_descartadas.some((d) => d.motivo.startsWith('id duplicado'))).toBe(true)
    // los títulos de los aportes NO entran: solo la integración + UNA sección de líneas
    const titulos = texto.split('\n').filter((x) => /^## /.test(x))
    expect(titulos).toEqual([...libroReal.find((x) => x.n === 29)!.texto.split('\n').filter((x) => /^## /.test(x)), TITULO_IDEAS_DE_LOS_APORTES])
  })
  it('🔴 sin la opción (la mesa del brief) o sin integración: nada cambia', () => {
    expect(textoParaLaCadena(LIBRO, null)).toBe(INTEGRACION)
    expect(textoDeLaMesaParaLaCadena({ familia: 'brief_mesa' }, LIBRO, null)).toBe(INTEGRACION)
    expect(textoDeLaMesaParaLaCadena({ familia: 'concepto_mesa' }, LIBRO, null)).toContain(TITULO_IDEAS_DE_LOS_APORTES)
    const sinIntegra = LIBRO.filter((x) => x.tipo !== 'integra')
    expect(textoParaLaCadena(sinIntegra, null, true)).toBe(textoParaLaCadena(sinIntegra, null, false))
    expect(textoParaLaCadena([], 'la pieza', true)).toBe('la pieza')
  })
  it('🔴 el orden: primero los aportes citados por la dirección; después el resto, del más nuevo al más viejo · la dirección y las líneas repetidas no entran', () => {
    const ideas = ideasDeLosAportes(LIBRO, INTEGRACION)
    expect(ideas[0]).toBe('- C1-I01 · instagram · carrusel · la primera silla · mensaje: aquí siempre hay una silla para ti · gancho: ¿quién se sentaba aquí? · protagonista: la silla · serie: ninguna · foto:ninguna')
    expect(ideas[2]).toMatch(/^- C1-I03 · facebook/)
    expect(ideas[3]).toMatch(/^- C1-I01 · instagram · reel · otra cosa/)
    expect(ideas).toHaveLength(4)
    const sinCita = ideasDeLosAportes(LIBRO, INTEGRACION.replace('A5', 'nadie'))
    expect(sinCita[0]).toMatch(/otra cosa/) // sin cita: el más nuevo primero
    const repetido = ideasDeLosAportes([...LIBRO, { n: 8, de: 'tiktok-strategist', tipo: 'responde', texto: APORTE_CON_IDEAS }], INTEGRACION)
    expect(repetido).toHaveLength(4)
    expect(ideasDeLosAportes([{ n: 1, de: 'dir', tipo: 'integra', texto: '- C1-I09 · instagram · foto · x · mensaje: m · gancho: g' }], '')).toEqual([])
    // lo que la dirección contesta en el camino (`responde`) es borrador: su palabra es la integración
    expect(ideasDeLosAportes([...LIBRO, { n: 9, de: 'creative-director-mesa', tipo: 'responde', texto: '- C1-I09 · instagram · foto · borrador · mensaje: m · gancho: g' }], INTEGRACION)).toHaveLength(4)
  })
  it('🔴 la línea limpia: sin el envoltorio de código ni de negrita, con viñeta «- »', () => {
    expect(lineaDeIdeaLimpia('- `C1-I01 · instagram · foto · x · mensaje: m · gancho: g`')).toBe('- C1-I01 · instagram · foto · x · mensaje: m · gancho: g')
    expect(lineaDeIdeaLimpia('* **C2-I10** · instagram · foto · x · mensaje: m · gancho: g **')).toBe('- C2-I10 · instagram · foto · x · mensaje: m · gancho: g')
    expect(lineaDeIdeaLimpia('3. C3-I02 · instagram · foto · `código` dentro · mensaje: m · gancho: g')).toBe('- C3-I02 · instagram · foto · `código` dentro · mensaje: m · gancho: g')
  })
})

describe('concepto/revalidar · la gran idea ya pagada se relee desde el libro de su mesa', () => {
  it('🔴 Náufrago: la v1 pasa → lista con tarjeta y espera para Emilio, la campaña vuelve a calendario, su espera se resuelve y NO se abre una v3', async () => {
    const al = await comoNaufrago()
    const r = await conceptoRevalidar(al, wf({ version: 1 }), AHORA)
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200)
    expect(r.cuerpo).toMatchObject({ pasa: true, version: 1, ideas_en_el_banco: 3, bloqueos: [], campana: { estado: 'calendario' } })
    expect(al.conceptos.map((k) => [k.version, k.estado, k.aprobacion])).toEqual([[1, 'lista', 'pendiente'], [2, 'sin_mesa', null]])
    expect(al.conceptos[0].texto_md).toContain(TITULO_IDEAS_DE_LOS_APORTES)
    expect(al.conceptos[0].motivo).toMatch(/^revalidado por wf-cadena · ejecución ex-1 · .* · antes: sin_concepto/)
    expect(al.conceptos[0].hitl_id).toBeTruthy()
    expect(al.tarjetas).toHaveLength(1)
    expect(al.esperas.filter((e) => e.objeto_tipo === TIPO_DE_ESPERA_DE_CONCEPTO && e.estado === 'viva')).toHaveLength(1)
    expect(al.campanas[0].estado).toBe('calendario')
    expect(al.campanas[0].estado_motivo).toMatch(/^gran idea v1 revalidada con la entrega de hoy: espera a Emilio/)
    expect(nhVivas(al)).toEqual([])
    // lo que la cadena ve después: espera la decisión de Emilio sobre la v1 · ninguna mesa nueva
    expect((await conceptoParaElCalendario(al, al.campanas[0])).espera).toMatchObject({ falta: 'aprobacion', version: 1 })
    expect(await etapaDeReentrada(al, al.campanas[0])).toBeNull()
    expect((await conceptoAbrir(al, wf(), AHORA)).cuerpo).toMatchObject({ ya_hecha: true, version: 1, aprobacion: 'pendiente' })
    expect(al.conceptos).toHaveLength(2)
    // y Emilio decide sobre esa versión como sobre cualquier otra
    const d = await conceptoDecidir(al, wf({ version: 1, decision: 'aprobar' }), AHORA)
    expect(d.status, JSON.stringify(d.cuerpo)).toBe(200)
    expect((await conceptoParaElCalendario(al, al.campanas[0])).version).toBe(1)
  })
  it('🔴 con la campaña todavía en calendario (sin v2): pasa y la campaña no se mueve', async () => {
    const al = await comoNaufrago({ v2: false })
    const r = await conceptoRevalidar(al, wf({ version: 1 }), AHORA)
    expect(r.cuerpo).toMatchObject({ pasa: true, campana: { estado: 'calendario' }, esperas_resueltas: [] })
    expect(al.conceptos[0]).toMatchObject({ estado: 'lista', aprobacion: 'pendiente' })
  })
  it('🔴 ensayo: dice lo que haría y no escribe nada', async () => {
    const al = await comoNaufrago()
    const antes = foto(al)
    const r = await conceptoRevalidar(al, wf({ version: 1, ensayo: true }), AHORA)
    expect(r.cuerpo).toMatchObject({ ensayo: true, escrituras: 0, pasa: true, haria: { campana: 'calendario' } })
    expect((r.cuerpo.haria as { esperas_que_se_resuelven: unknown[] }).esperas_que_se_resuelven).toHaveLength(1)
    expect(foto(al)).toBe(antes)
  })
  it('🔴 idempotente: otra vez contesta ya_revalidada y no escribe nada', async () => {
    const al = await comoNaufrago()
    await conceptoRevalidar(al, wf({ version: 1 }), AHORA)
    const antes = foto(al)
    expect((await conceptoRevalidar(al, wf({ version: 1 }), AHORA)).cuerpo).toMatchObject({ ya_revalidada: true, version: 1 })
    expect(foto(al)).toBe(antes)
  })
  it('🔴 si el libro tampoco tiene ideas válidas: pasa=false con los bloqueos de hoy y no escribe nada', async () => {
    const libro = LIBRO.filter((x) => x.n !== 5 && x.n !== 6)
    const al = await comoNaufrago({ libro })
    const antes = foto(al)
    const r = await conceptoRevalidar(al, wf({ version: 1 }), AHORA)
    expect(r.cuerpo).toMatchObject({ pasa: false, version: 1, ideas_en_el_banco: 0, campana: { estado: 'necesita_humano' } })
    expect((r.cuerpo.bloqueos as string[])[0]).toMatch(/^sin banco de ideas/)
    expect(foto(al)).toBe(antes)
  })
  it('🔴 guardas: solo una sin_mesa por el lector, con encargo, sin versiones vivas después, sin gran idea ya decidida, brief validado y campaña detenida por la mesa de concepto', async () => {
    const casos: Array<[string, (al: AlmacenMemoria) => void, string]> = [
      ['venció por plazo', (al) => { al.conceptos[0].motivo = 'la mesa no entregó a tiempo' }, 'E-NO-LA-DEJO-EL-LECTOR'],
      ['sin encargo', (al) => { al.conceptos[0].encargo_id = null }, 'E-SIN-ENCARGO'],
      ['una posterior abierta', (al) => { al.conceptos[1].estado = 'abierta' }, 'E-HAY-UNA-VERSION-POSTERIOR'],
      ['una posterior devolvió el brief', (al) => { al.conceptos[1].estado = 'brief_devuelto' }, 'E-HAY-UNA-VERSION-POSTERIOR'],
      ['ya hay una aprobada', (al) => { al.conceptos[1].aprobacion = 'aprobado' }, 'E-YA-HAY-GRAN-IDEA'],
      ['el brief ya no está validado', (al) => { al.briefsCreativos[0].estado = 'devuelta' }, 'E-SIN-BRIEF'],
      ['detenida por otra cosa', (al) => { al.campanas[0].estado_motivo = 'el brief creativo se devolvió por código dos veces: x' }, 'E-NO-SE-REVALIDA'],
      ['pausada', (al) => { al.campanas[0].estado = 'pausada' }, 'E-NO-SE-REVALIDA'],
      ['una versión brief_devuelto', (al) => { al.conceptos[0].estado = 'brief_devuelto' }, 'E-NO-SIN-MESA'],
    ]
    for (const [nombre, preparar, code] of casos) {
      const al = await comoNaufrago()
      preparar(al)
      const antes = foto(al)
      const r = await conceptoRevalidar(al, wf({ version: 1 }), AHORA)
      expect([r.status, r.cuerpo.code], nombre).toEqual([409, code])
      expect(foto(al), nombre).toBe(antes)
    }
    const al = await comoNaufrago()
    expect((await conceptoRevalidar(al, wf({ version: 7 }), AHORA)).status).toBe(404)
    expect((await conceptoRevalidar(al, wf({}), AHORA)).status).toBe(400)
    expect((await conceptoRevalidar(al, { campana_id: CAMP, version: 1 }, AHORA)).cuerpo.code).toBe("E-WORKFLOW-CTX") // sin workflow_id no entra
  })
  it('🔴 carrera: si otro pedido ya movió la versión, este no escribe nada (ni campaña ni esperas)', async () => {
    const al = await comoNaufrago()
    const orig = al.actualizarConceptoSi.bind(al)
    al.actualizarConceptoSi = async (...a) => { al.conceptos[0].estado = 'lista'; return orig(...a) }
    const antesCampana = JSON.stringify(al.campanas)
    expect((await conceptoRevalidar(al, wf({ version: 1 }), AHORA)).cuerpo).toMatchObject({ ya_revalidada: true })
    expect(JSON.stringify(al.campanas)).toBe(antesCampana)
    expect(nhVivas(al)).toHaveLength(1)
    expect(al.tarjetas).toHaveLength(0)
  })
  it('🔴 la campaña movida por otro a mitad: la versión vuelve a sin_mesa, la campaña queda como la dejó el otro, las esperas siguen vivas y hay error', async () => {
    const al = await comoNaufrago()
    const orig = al.actualizarConceptoSi.bind(al)
    al.actualizarConceptoSi = async (...a) => { const r = await orig(...a); al.campanas[0].estado = 'pausada'; return r }
    await expect(conceptoRevalidar(al, wf({ version: 1 }), AHORA)).rejects.toThrow(/cambió de estado/)
    expect(al.conceptos[0]).toMatchObject({ estado: 'sin_mesa', aprobacion: null, motivo: SIN_GRAN_IDEA_PERO_CON_MOTIVO })
    expect(al.campanas[0].estado).toBe('pausada')
    expect(nhVivas(al)).toHaveLength(1)
    expect(al.tarjetas).toHaveLength(0)
  })
  it('🔴 si la tarjeta falla: todo vuelve atrás (versión, campaña y esperas)', async () => {
    const al = await comoNaufrago()
    const antes = JSON.stringify({ c: al.campanas, k: al.conceptos })
    al.abrirTarjetaDeConcepto = async () => { throw new Error('la bandeja no responde') }
    await expect(conceptoRevalidar(al, wf({ version: 1 }), AHORA)).rejects.toThrow('la bandeja no responde')
    expect(JSON.stringify({ c: al.campanas, k: al.conceptos })).toBe(antes)
    expect(nhVivas(al)).toHaveLength(1)
    // 🟡 de CC7: ninguna espera de aprobación viva para una tarjeta que no existe
    expect(al.esperas.filter((e) => e.campana_id === CAMP && e.objeto_tipo === TIPO_DE_ESPERA_DE_CONCEPTO && e.estado === 'viva')).toEqual([])
    // y si se reintenta con la bandeja de vuelta, la espera (misma llave) revive y la tarjeta se abre
    al.abrirTarjetaDeConcepto = AlmacenMemoria.prototype.abrirTarjetaDeConcepto.bind(al)
    expect((await conceptoRevalidar(al, wf({ version: 1 }), AHORA)).cuerpo).toMatchObject({ pasa: true })
    expect(al.esperas.filter((e) => e.campana_id === CAMP && e.objeto_tipo === TIPO_DE_ESPERA_DE_CONCEPTO).map((e) => e.estado)).toEqual(['viva'])
    expect(al.tarjetas).toHaveLength(1)
  })
  it('🔴 la ruta: `concepto/revalidar` está en la tabla de acciones', () => {
    expect(ACCIONES.concepto.revalidar).toBe(conceptoRevalidar)
  })
})

describe('conceptoVigente · una versión lista esperando a Emilio manda sobre las sin_mesa posteriores', () => {
  const k = (version: number, estado: string, aprobacion: string | null) => ({ version, estado, aprobacion }) as unknown as Parameters<typeof conceptoVigente>[0][number]
  it('🔴 sin una lista pendiente, la última sigue mandando (el camino de siempre)', () => {
    expect(conceptoVigente([])).toBeNull()
    expect(conceptoVigente([k(1, 'sin_mesa', null), k(2, 'abierta', null)])?.version).toBe(2)
    expect(conceptoVigente([k(1, 'sin_mesa', null), k(2, 'sin_mesa', null)])?.version).toBe(2)
    // una lista con cambios pedidos ya se decidió: no vuelve a mandar
    expect(conceptoVigente([k(1, 'lista', 'cambios'), k(2, 'sin_mesa', null)])?.version).toBe(2)
  })
  it('🔴 la lista pendiente anterior manda solo si la última quedó sin_mesa', () => {
    expect(conceptoVigente([k(1, 'lista', 'pendiente'), k(2, 'sin_mesa', null)])?.version).toBe(1)
    expect(conceptoVigente([k(1, 'lista', 'pendiente'), k(2, 'abierta', null)])?.version).toBe(2)
  })
  it('🔴 Emilio pidió cambios y la vuelta siguiente quedó sin_mesa: la cadena reabre (no revive la versión con cambios)', async () => {
    const al = await comoNaufrago({ v2: false })
    Object.assign(al.conceptos[0], { estado: 'lista', aprobacion: 'cambios', apunta_a: 'concepto' })
    expect((await conceptoParaElCalendario(al, al.campanas[0])).espera).toMatchObject({ falta: 'concepto', version: 1 })
  })
})

// casos propios de CC7 (raw/evidencia/2026-11-09-concepto-con-aportes/cc7/cc7-casos-propios.test.snippet.ts) · copiados tal cual
describe('CC7 · casos propios', () => {
  it('CC7-1 · si la tarjeta falla, no queda viva la espera de aprobación del concepto', async () => {
    const al = await comoNaufrago()
    al.abrirTarjetaDeConcepto = async () => { throw new Error('la bandeja no responde') }
    await expect(conceptoRevalidar(al, wf({ version: 1 }), AHORA)).rejects.toThrow()
    const vivasDeConcepto = al.esperas.filter((e) => e.campana_id === CAMP && e.objeto_tipo !== 'necesita_humano' && e.estado === 'viva')
    expect(vivasDeConcepto.map((e) => e.objeto_tipo + ':' + e.motivo)).toEqual([])
  })
  it('CC7-2 · el caso de HOY en producción: v2 lista y pendiente → revalidar v1 se niega sin escribir', async () => {
    const al = await comoNaufrago()
    al.conceptos.push({ ...structuredClone(al.conceptos[0]), version: 2, estado: 'lista', aprobacion: 'pendiente', motivo: null } as never)
    const antes = JSON.stringify(al.conceptos)
    const r = await conceptoRevalidar(al, wf({ version: 1 }), AHORA)
    expect(r.status).toBe(409)
    expect(JSON.stringify(al.conceptos)).toBe(antes)
  })
})
