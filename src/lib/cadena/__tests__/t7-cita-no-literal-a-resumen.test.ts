/**
 * T7 · 18-nov · GO Lenovo opción 3 (para que Emilio la confirme o la revierta): hasta 3 citas no literales se BAJAN a resumen (sin comillas, con la marca,
 * anotadas en «Faltantes») y el brief sigue con un aviso; con 4 o más, el brief vuelve como siempre. La regla no cambia: lo que queda entre comillas es literal.
 * Las 3 clases son las reales del sobre c (campaña 330af967): el encabezado de la tabla pegado a la celda, un valor de la ficha y una paráfrasis de «Público».
 * Agnóstico al rubro: el plan es de una tienda en línea inventada.
 */
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import type { Campana, EstrategiaGuardada } from '../almacen'
import { bajarCitasNoLiterales, citasQueNoAparecen, leerBriefCreativo, REFERENCIA_DEL_BRIEF_CREATIVO, REGLA_DE_CITAR_POCO, TOPE_DE_CITAS_A_RESUMEN } from '../brief-creativo'
import { briefAbrir, recibirBrief } from '../mesas'

const PLAN = [
  '# Plan de la tienda',
  'El perfil objetivo compra ropa en línea por primera vez. La barrera del pago es real pero no es la única — también puede pesar la confianza en una marca nueva, la cobertura y el registro.',
  '| Tanda | Hipótesis A | Hipótesis B |',
  '|---|---|---|',
  '| 1 (sem 2-3) | Envío rápido: llega mañana a tu casa | Cambios fáciles: si no te queda, lo cambias |',
  '- Pedidos entregados atribuibles a pauta — semanal',
].join('\n')
const FUENTES = { plan: PLAN }
const TABLA = 'Hipótesis A — Envío rápido: llega mañana a tu casa' // clase 1: encabezado + celda
const FICHA = 'Pauta liviana en videos (envío rápido + cambios); pedir reseñas' // clase 2: valor de la ficha
const PARAFRASIS = 'La barrera del pago es real pero no es la única — también puede pesar la confianza en la marca, la cobertura y el registro.' // clase 3
const LITERAL = 'Cambios fáciles: si no te queda, lo cambias'
const MARCA = '*(resumen, no cita literal del plan ni del manual)*'

const brief = (extra: string[] = []) => [
  '## De qué parte del plan sale', '«Pedidos entregados atribuibles a pauta — semanal»',
  '## Público', 'Gente que compra ropa en línea por primera vez.', '', `> «${PARAFRASIS}»`,
  '## Insight', 'Comprar sin probarse da miedo.',
  '## Lo único que hay que comunicar', 'Si no te queda, lo cambias sin costo.',
  '## Rutas vivas del plan', 'Tanda 1, una contra otra:', '', `> «${TABLA}»`, '', `> «${LITERAL}»`, '', 'Para la oferta:', '', `> «${FICHA}»`, ...extra,
  '## Objetivo', 'Las ventas que pide el plan: 40 pedidos por semana.',
  '## Cómo sabremos que funcionó', '> «Pedidos entregados atribuibles a pauta — semanal»',
  '## Tono', 'Cercano y claro.',
  '## Obligatorios', '- vocabulario: cambio', '- prohibido: garantizado', '- lo que no se dice: nada',
  '## Faltantes', '- ninguno: nada',
  '## Citas', 'A1 usé: el plan',
].join('\n')
const SIN_FALTAS = brief().replace(`> «${TABLA}»`, '> «Envío rápido: llega mañana a tu casa»').replace(`> «${FICHA}»`, 'la de la ficha (ver «Hechos de las ofertas»)').replace(`> «${PARAFRASIS}»`, '> «también puede pesar la confianza en una marca nueva»')
const ins = { planTexto: PLAN, prohibidas: ['garantizado'] }
const deCitas = (b: string[]) => b.filter((x) => /no está literal en el/.test(x))

describe('bajar a resumen · las 3 clases reales de T7', () => {
  const md = brief()
  const r = bajarCitasNoLiterales(md, FUENTES)
  it('las 3 no literales se bajan: el chequeo de hoy ya no encuentra ninguna, y el brief no vuelve por citas', () => {
    expect(citasQueNoAparecen(md, FUENTES)).toHaveLength(3)
    expect(r.bajadas.map((x) => [x.seccion, x.cita])).toEqual([['Público', PARAFRASIS], ['Rutas vivas del plan', TABLA], ['Rutas vivas del plan', FICHA]])
    expect(citasQueNoAparecen(r.texto, FUENTES)).toEqual([])
    expect(deCitas(leerBriefCreativo(r.texto, ins).bloqueos)).toEqual([])
  })
  it('cada una queda como prosa, sin `> «…»`, con la marca de resumen', () => {
    for (const c of [TABLA, FICHA, PARAFRASIS]) {
      expect(r.texto).not.toContain(`> «${c}»`)
      expect(r.texto).not.toContain(`«${c}»`)
      expect(r.texto.split('\n')).toContain(`${c} ${MARCA}`)
    }
  })
  it('la cita literal del mismo apartado NO se toca', () => {
    expect(r.texto.split('\n')).toContain(`> «${LITERAL}»`)
    expect(r.texto.split('\n')).toContain('> «Pedidos entregados atribuibles a pauta — semanal»')
  })
  it('se anotan en «Faltantes», una línea por cita, después de lo que ya había', () => {
    const f = r.texto.split('## Faltantes')[1].split('## Citas')[0].split('\n').map((x) => x.trim()).filter(Boolean)
    expect(f).toEqual([
      '- ninguno: nada',
      `- cita no literal (en «## Público»): se dejó como resumen, sin comillas · ${PARAFRASIS.slice(0, 80)}…`,
      `- cita no literal (en «## Rutas vivas del plan»): se dejó como resumen, sin comillas · ${TABLA.slice(0, 80)}…`,
      `- cita no literal (en «## Rutas vivas del plan»): se dejó como resumen, sin comillas · ${FICHA.slice(0, 80)}…`,
    ])
  })
  it('fuera de las líneas tocadas y de «Faltantes», el brief queda igual', () => {
    const fuera = (t: string) => t.split('\n').filter((l) => !l.includes('resumen, no cita literal') && !l.startsWith('> «') && !l.startsWith('- cita no literal'))
    expect(fuera(r.texto)).toEqual(fuera(md))
  })
})

describe('el tope · lo que NO cambia', () => {
  it(`el tope es ${TOPE_DE_CITAS_A_RESUMEN}`, () => expect(TOPE_DE_CITAS_A_RESUMEN).toBe(3))
  it('con 4 no literales no se toca nada: el texto vuelve idéntico y el brief se devuelve con las 4', () => {
    const md = brief(['', '> «Una cuarta frase que el plan no dice en ninguna parte»'])
    const r = bajarCitasNoLiterales(md, FUENTES)
    expect(r).toEqual({ texto: md, bajadas: [] })
    expect(deCitas(leerBriefCreativo(md, ins).bloqueos)).toHaveLength(4)
  })
  it('sin citas no literales el texto vuelve idéntico (ni siquiera cambia «Faltantes»)', () => {
    expect(citasQueNoAparecen(SIN_FALTAS, FUENTES)).toEqual([])
    expect(bajarCitasNoLiterales(SIN_FALTAS, FUENTES)).toEqual({ texto: SIN_FALTAS, bajadas: [] })
  })
  it('«De qué parte del plan sale» no se baja nunca (tiene su propio chequeo): sigue devolviendo', () => {
    const md = brief().replace('## De qué parte del plan sale\n«Pedidos entregados atribuibles a pauta — semanal»', '## De qué parte del plan sale\n«una frase que el plan no tiene»')
    const r = bajarCitasNoLiterales(md, FUENTES)
    expect(r.texto).toContain('## De qué parte del plan sale\n«una frase que el plan no tiene»')
    expect(leerBriefCreativo(r.texto, ins).bloqueos.some((b) => /no se encuentra literal en el plan/.test(b))).toBe(true)
  })
  it('🟡 m6: aunque en el mismo brief se bajen otras citas, un `> «…»` no literal en «De qué parte del plan sale» queda TAL CUAL (y sigue devolviendo)', () => {
    const md = brief().replace('## De qué parte del plan sale\n«Pedidos entregados atribuibles a pauta — semanal»', '## De qué parte del plan sale\n> «una frase que el plan no tiene en ninguna parte»')
    const r = bajarCitasNoLiterales(md, FUENTES)
    expect(r.bajadas).toHaveLength(3)
    expect(r.texto).toContain('## De qué parte del plan sale\n> «una frase que el plan no tiene en ninguna parte»\n## Público')
    expect(leerBriefCreativo(r.texto, ins).bloqueos.some((b) => /no se encuentra literal en el plan/.test(b))).toBe(true)
  })
  it('una cita atribuida en la línea («el plan dice: «…»») que no es literal pierde sus comillas y lleva la marca del plan', () => {
    const md = SIN_FALTAS.replace('Comprar sin probarse da miedo.', 'Comprar sin probarse da miedo; el plan dice: «la confianza en la marca es lo único que pesa».')
    const r = bajarCitasNoLiterales(md, FUENTES)
    expect(r.bajadas).toEqual([{ cita: 'la confianza en la marca es lo único que pesa', seccion: 'Insight', fuente: 'plan' }])
    expect(r.texto).toContain('el plan dice: la confianza en la marca es lo único que pesa *(resumen, no cita literal del plan)*.')
    expect(citasQueNoAparecen(r.texto, FUENTES)).toEqual([])
  })
  it('la misma cita no literal repetida cuenta y se anota UNA vez (como la cuenta el chequeo)', () => {
    const md = SIN_FALTAS.replace('## Objetivo', `> «${FICHA}»\n\n> «${FICHA}»\n## Objetivo`)
    const r = bajarCitasNoLiterales(md, FUENTES)
    expect(r.bajadas).toHaveLength(1)
    expect(r.texto.split('\n').filter((l) => l === `${FICHA} ${MARCA}`)).toHaveLength(2)
    expect(r.texto.split('\n').filter((l) => l.startsWith('- cita no literal'))).toHaveLength(1)
  })
})

describe('la referencia pide citar poco', () => {
  it('lleva la regla, una vez, y lo que dice', () => {
    expect(REFERENCIA_DEL_BRIEF_CREATIVO.split(REGLA_DE_CITAR_POCO)).toHaveLength(2)
    expect(REGLA_DE_CITAR_POCO).toBe('Cita POCO: solo la frase del plan o del manual que sostiene una decisión del brief y que los creativos necesitan leer tal cual. No cites números sueltos ni celdas de indicadores (escríbelos con su fuente, sin comillas), ni la misma frase dos veces; lo demás dilo con tus palabras, sin comillas.')
  })
})

// ─── el camino real: la mesa recibe el brief, lo baja ANTES de leerlo y guarda ESE texto ───
const A = clienteA()
const CAMP = 'camp-1'
const AHORA = '2026-10-09T12:00:00Z'
const wf = () => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', campana_id: CAMP })
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
const BRIEF_A = (extra: string[]) => [
  '## De qué parte del plan sale', 'Fase 1: «Se publican 3 posts por semana en Instagram y 1 en Facebook».',
  '## Insight', 'La gente del barrio desayuna de pie porque cree que no hay dónde sentarse antes de las ocho.',
  '## Lo único que hay que comunicar', 'Hay mesa desde las siete.',
  '## Público', 'Vecinos del barrio que desayunan fuera entre semana (del plan).', ...extra,
  '## Cómo sabremos que funcionó', 'Pedidos por semana contra la meta del plan, revisados cada lunes.',
  '## Objetivo', 'Que entren 30 desayunos nuevos por semana.',
  '## Tono', 'Cercano y directo, sin exclamaciones.',
  '## Obligatorios', '- vocabulario: pan de masa madre; mesa larga', '- prohibido: barato; gratis', '- lo que no se dice: precios',
  '## Faltantes', '- público: el manual no dice edades',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n')
const entrega = (texto: string) => ({ campana_id: CAMP, version: 1, encargo_id: 'enc-1', texto, costo_usd: 0.1, motivo: null })

describe('el camino real de la mesa (recibirBrief)', () => {
  it('una cita del plan con una palabra cambiada y una del manual alterada: el brief queda VALIDADO, se guarda el texto bajado y lo leído trae un aviso por cada una', async () => {
    const al = almacen()
    await briefAbrir(al, wf(), AHORA)
    const md = BRIEF_A(['', '> «Se publican 3 posts por semana en Instagram y 2 en Facebook»', '', 'Y el manual dice «Café de la casa. Servimos almuerzos».'])
    expect(await recibirBrief(al, entrega(md), AHORA)).toMatchObject({ ok: true, estado: 'validada' })
    const b = al.briefsCreativos[0]
    expect(b.devolucion_texto).toBeNull()
    expect(b.texto_md).not.toBe(md)
    expect(b.texto_md).toContain(`Se publican 3 posts por semana en Instagram y 2 en Facebook ${MARCA}`)
    expect(b.texto_md).toContain('Y el manual dice Café de la casa. Servimos almuerzos *(resumen, no cita literal del manual)*.')
    expect(b.texto_md).toContain('- cita no literal (en «## Público»): se dejó como resumen, sin comillas · Café de la casa. Servimos almuerzos…')
    const avisos = (b.leido as { avisos: string[] }).avisos.filter((x) => /se dejó como resumen/.test(x))
    expect(avisos).toEqual([
      'la cita «Se publican 3 posts por semana en Instagram y 2 en Facebook» (en «## Público») no estaba literal en el plan · se dejó como resumen, sin comillas, y se anotó en «Faltantes»',
      'la cita «Café de la casa. Servimos almuerzos» (en «## Público») no estaba literal en el manual · se dejó como resumen, sin comillas, y se anotó en «Faltantes»',
    ])
  })
  it('con 4 no literales el brief se DEVUELVE como siempre, con el texto tal cual llegó', async () => {
    const al = almacen()
    await briefAbrir(al, wf(), AHORA)
    const md = BRIEF_A(['', '> «Se publican 3 posts por semana en Instagram y 2 en Facebook»', '', '> «Se publican 4 posts por semana en Instagram»', '', '> «La sede abre de martes a lunes»', '', '> «El primer anuncio sale el día 30»'])
    expect(await recibirBrief(al, entrega(md), AHORA)).toMatchObject({ ok: true, estado: 'devuelta' })
    expect(al.briefsCreativos[0].texto_md).toBe(md)
    expect(al.briefsCreativos[0].devolucion_texto!.split('\n').filter((x) => /no está literal en el plan/.test(x))).toHaveLength(4)
  })
  it('sin citas no literales se guarda el texto que llegó, idéntico', async () => {
    const al = almacen()
    await briefAbrir(al, wf(), AHORA)
    const md = BRIEF_A(['', '> «Se publican 3 posts por semana en Instagram y 1 en Facebook»'])
    expect(await recibirBrief(al, entrega(md), AHORA)).toMatchObject({ ok: true, estado: 'validada' })
    expect(al.briefsCreativos[0].texto_md).toBe(md)
  })
})
