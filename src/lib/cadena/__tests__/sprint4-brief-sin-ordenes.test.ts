/**
 * SPRINT 4 · fase 1 · C · EL BRIEF SIN ÓRDENES (GO Lenovo 17-nov · vara IPA «Better Briefs»).
 * El brief dice el problema de negocio, el público, LO ÚNICO que hay que comunicar con sus razones para creer, las rutas vivas del plan, los límites y cómo
 * se medirá. NO escribe el anuncio, no fija llamados ni formatos, no elige fotos; precio, horario y plazos van a la ficha de la oferta (A · CC3).
 * La MISMA batería corre con tres clientes de rubros distintos (un restaurante, una tienda en línea y un servicio profesional): nada queda atado a un rubro.
 */
import { describe, expect, it } from 'vitest'
import { parsearBrief } from '@/lib/oficina/brief'
import { leerBriefCreativo, REFERENCIA_DEL_BRIEF_CREATIVO, seccionesObligatoriasQueFaltan, TITULO_DE_LA_SECCION } from '../brief-creativo'
import { METODO_BRIEF_POR_OMISION } from '../metodos'
import { leerConcepto } from '../conceptos'
import { escribirHoja, type FilaDeHoja, type InsumosDeLaHoja } from '../hoja'
import type { FormatosPorRed } from '../tipos'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import { fichasEnTexto, TITULO_DEL_BLOQUE, type FichaDeOferta } from '../ficha-de-oferta'
import { marcoDelBrief } from '../mesas'

interface Cliente {
  nombre: string
  plan: string
  /** el brief con el formato NUEVO */
  nuevo: string
  /** el mismo brief con el formato ANTERIOR («Mensaje» + «- red: objetivo · llamado») */
  anterior: string
  proposicion: string
  red: string
  llamado: string
  legal: string
}

const armar = (c: { cita: string; problema: string; publico: string; insight: string; proposicion: string; razones: string[]; rutas: string[]; hechos: string[]; legal: string; objetivo: string; red: string; objetivoRed: string; tono: string }, formato: 'nuevo' | 'anterior', llamado = ''): string => [
  '## De qué parte del plan sale', `«${c.cita}»`,
  ...(formato === 'nuevo' ? ['## Problema de negocio', c.problema] : []),
  '## Público', c.publico,
  '## Insight', c.insight,
  formato === 'nuevo' ? '## Lo único que hay que comunicar' : '## Mensaje', c.proposicion,
  ...(formato === 'nuevo' ? ['## Razones para creer', ...c.razones.map((r) => `- ${r}`), '## Rutas vivas del plan', ...c.rutas.map((r) => `> «${r}»`), '## Hechos de las ofertas', ...c.hechos.map((h) => `- ${h}`)] : []),
  '## Objetivo', c.objetivo, formato === 'nuevo' ? `- ${c.red}: ${c.objetivoRed}` : `- ${c.red}: ${c.objetivoRed} · ${llamado}`,
  '## Cómo sabremos que funcionó', 'Los indicadores del plan, revisados cada semana.',
  '## Tono', c.tono,
  '## Obligatorios', '- vocabulario: confianza', '- prohibido: garantizado', '- lo que no se dice: comparaciones', ...(formato === 'nuevo' ? [`- legales: ${c.legal}`] : []),
  '## Faltantes', '- edades: el plan no las da',
  '## Contradicciones plan vs manual', '- ninguna',
  '## Citas', 'A1 usé: el plan, fase 1.',
].join('\n')

const cliente = (nombre: string, d: Parameters<typeof armar>[0] & { llamado: string }): Cliente => ({
  nombre,
  plan: `# Plan\n## Fase 1\nObjetivo: ${d.cita}. Rutas: ${d.rutas.join('; ')}.`,
  nuevo: armar(d, 'nuevo'),
  anterior: armar(d, 'anterior', d.llamado),
  proposicion: d.proposicion,
  red: d.red,
  llamado: d.llamado,
  legal: d.legal,
})

const CLIENTES: Cliente[] = [
  cliente('restaurante con reparto', {
    cita: 'que la zona norte sepa que el encebollado ya llega a domicilio', problema: 'La zona norte no sabe que hay reparto y los pedidos de la semana 1 están bajo la meta.',
    publico: 'Familias de la zona norte que piden comida el fin de semana (del plan).', insight: 'Creen que el plato de la costa solo se come en la costa.',
    proposicion: 'El sabor de la costa ya llega a tu casa.', razones: ['la receta es la misma de la casa matriz (plan, fase 1)', 'reparto propio en la zona norte (plan)'],
    rutas: ['A · producto y antojo', 'B · origen', 'se prueban una contra otra por tanda'],
    hechos: ['reparto zona norte · pedido en la web, pago al recibir (fuente: ficha:reparto-norte)', 'reparto zona norte · plato del día US$ 6 (fuente: ficha:reparto-norte)'], legal: 'precio con IVA incluido', objetivo: '40 pedidos nuevos por semana.', red: 'ig', objetivoRed: 'que pidan desde la publicación',
    tono: 'Cercano, con humor.', llamado: '«Pide en la web»',
  }),
  cliente('tienda en línea de ropa', {
    cita: 'que quien compró una vez vuelva por la nueva colección', problema: 'La recompra está en 12 % y el plan la quiere en 20 %.',
    publico: 'Clientas que compraron en los últimos 6 meses (del plan).', insight: 'Sienten que la tienda solo tiene básicos.',
    proposicion: 'La colección nueva está hecha para lo que ya tienes.', razones: ['cada prenda combina con los básicos más vendidos (plan)', 'cambios gratis en 30 días (manual)'],
    rutas: ['A · combinar con lo que ya tienes', 'B · estreno de temporada'],
    hechos: ['colección otoño · envío en 48 h a todo el país (fuente: ficha:coleccion-otono)'], legal: 'cambios sujetos a la política publicada', objetivo: 'Recompra del 20 % en 60 días.', red: 'ig', objetivoRed: 'que guarden la colección',
    tono: 'Directo y cálido.', llamado: '«Mira la colección»',
  }),
  cliente('estudio de abogados', {
    cita: 'que los dueños de pequeñas empresas consulten antes de firmar un contrato', problema: 'Llegan cuando el problema ya está en juicio; el plan quiere consultas preventivas.',
    publico: 'Dueños de empresas de menos de 20 personas (del plan).', insight: 'Creen que un abogado es solo para cuando ya hay pleito.',
    proposicion: 'Una consulta antes de firmar cuesta menos que un juicio después.', razones: ['el estudio revisa contratos comerciales desde hace 15 años (manual)', 'primera consulta de 30 minutos (plan)'],
    rutas: ['A · prevención antes de firmar', 'B · casos reales anonimizados'],
    hechos: ['revisión de contratos · se agenda por el formulario de la web (fuente: ficha:revision-contratos)'], legal: 'la publicidad de abogados no promete resultados', objetivo: '25 consultas preventivas al mes.', red: 'linkedin', objetivoRed: 'que agenden una consulta',
    tono: 'Sobrio y claro.', llamado: '«Agenda tu consulta»',
  }),
]

const ins = (c: Cliente) => ({ planTexto: c.plan, prohibidas: ['garantizado'], redes: [c.red] })

describe.each(CLIENTES)('Sprint 4 · C · $nombre · el brief nuevo se lee entero y sin órdenes', (c) => {
  it('se valida y trae lo único que hay que comunicar, el problema, las razones y las rutas', () => {
    const b = leerBriefCreativo(c.nuevo, ins(c))
    expect(b.bloqueos).toEqual([])
    expect(b.estado).toBe('validada')
    expect(b.mensaje).toBe(c.proposicion)
    const debajo = (t: string) => c.nuevo.split(`## ${t}\n`)[1].split('\n## ')[0].trim()
    expect(b.problema_de_negocio).toBe(debajo('Problema de negocio'))
    expect(b.razones_para_creer).toBe(debajo('Razones para creer'))
    expect(b.rutas_del_plan).toBe(debajo('Rutas vivas del plan'))
    expect(b.rutas_del_plan).toMatch(/^> «A · /)
    expect(b.hechos_de_las_ofertas).toBe(debajo('Hechos de las ofertas'))
    expect(b.hechos_de_las_ofertas).toMatch(/\(fuente: ficha:/)
    expect(b.obligatorios.legales).toEqual([c.legal])
    expect(b.razones_para_creer).not.toMatch(/A · /)
  })
  it('una red con objetivo y sin llamado NO se avisa (el llamado va en la ficha de la oferta)', () => {
    const b = leerBriefCreativo(c.nuevo, ins(c))
    expect(b.avisos.filter((a) => /llamado/.test(a))).toEqual([])
    expect(b.por_red).toEqual([{ red: c.red, objetivo: expect.any(String), llamado: '' }])
  })
  it('una red de la estrategia sin objetivo sí se declara', () => {
    const b = leerBriefCreativo(c.nuevo, { ...ins(c), redes: [c.red, 'tiktok'] })
    expect(b.avisos).toContain('la red tiktok no tiene objetivo en el brief')
  })
  it('el brief ANTERIOR («Mensaje» + llamado por red) se sigue leyendo igual: mismo mensaje, mismo llamado, sigue validado', () => {
    const b = leerBriefCreativo(c.anterior, ins(c))
    expect(b.estado).toBe('validada')
    expect(b.mensaje).toBe(c.proposicion)
    expect(b.por_red[0].llamado).toBe(c.llamado)
    // las secciones nuevas no son obligatorias: un brief ya validado no se devuelve al re-leerlo
    expect(b.problema_de_negocio).toBe('')
    expect(seccionesObligatoriasQueFaltan(c.anterior)).toEqual([])
  })
  it('sin lo único que hay que comunicar, la devolución nombra la sección con su nombre nuevo', () => {
    const sin = c.nuevo.replace(`## Lo único que hay que comunicar\n${c.proposicion}\n`, '')
    expect(leerBriefCreativo(sin, ins(c)).bloqueos).toContain('falta la sección «## Lo único que hay que comunicar»')
    expect(seccionesObligatoriasQueFaltan(sin)).toEqual(['Lo único que hay que comunicar'])
  })
})

describe('Sprint 4 · C · ADENDA 2 · el brief es el único camino del plan', () => {
  const c = CLIENTES[0]
  it('las rutas van citadas LITERAL del plan: una ruta reescrita se devuelve por el chequeo de citas que ya existe', () => {
    const malo = c.nuevo.replace('> «A · producto y antojo»', '> «A · el antojo del producto estrella»')
    expect(leerBriefCreativo(malo, ins(c)).bloqueos.some((x) => /no está literal en el plan/.test(x))).toBe(true)
  })
  it('los hechos de la ficha (con «fuente: ficha:…») NO pasan por el chequeo de citas del plan: un hecho bueno no devuelve el brief', () => {
    expect(leerBriefCreativo(c.nuevo, ins(c)).bloqueos).toEqual([])
  })
  it('un brief anterior SIN rutas ni hechos se re-lee igual y no se devuelve (condición 3 de CC6)', () => {
    const b = leerBriefCreativo(c.anterior, ins(c))
    expect(b.estado).toBe('validada')
    expect(b.rutas_del_plan).toBe('')
    expect(b.hechos_de_las_ofertas).toBe('')
    expect(b.obligatorios.legales).toEqual([])
  })
  it('la plantilla dice que el brief es lo único del plan que ven los creativos, y pide hechos citados de la ficha, legales y barreras', () => {
    expect(REFERENCIA_DEL_BRIEF_CREATIVO).toContain('Este brief es lo ÚNICO del plan que reciben los creativos')
    expect(REFERENCIA_DEL_BRIEF_CREATIVO).toMatch(/## Hechos de las ofertas · .*«# FICHAS DE LAS OFERTAS».*\(fuente: <la de la ficha>\).*«sin ficha de la oferta».*nunca los escribas de memoria/)
    expect(REFERENCIA_DEL_BRIEF_CREATIVO).toMatch(/«- legales: …»/)
    expect(REFERENCIA_DEL_BRIEF_CREATIVO).toMatch(/## Público · .*barreras/)
    expect(REFERENCIA_DEL_BRIEF_CREATIVO).toMatch(/## Rutas vivas del plan · TODAS .*cita LITERAL del plan en un bloque `> «…»`/)
    expect(REFERENCIA_DEL_BRIEF_CREATIVO).toMatch(/precio, el horario y los plazos escritos de memoria/)
  })
})

// CC6 · ADENDA 2 · condición 1: nada se pierde del plan al brief · el caso real del `brief v4` (dos rutas en el plan; el brief viejo se quedó con una)
describe('Sprint 4 · C · el caso del brief v4: un plan con dos rutas llega entero al brief', () => {
  const PLAN = [
    '# Plan de 90 días',
    '## Hipótesis a probar',
    'Hipótesis A · Producto y antojo: la gente pide por el plato que ya conoce.',
    'Hipótesis B · Origen: la gente pide porque viene de un lugar con historia.',
    'Regla: probar A contra B por tanda y quedarse con la que dé más pedidos.',
    '## Meta',
    'Meta: 120 pedidos en las primeras 4 semanas.',
    '## Público',
    'Familias de la ciudad que piden a domicilio y dudan de que el producto llegue igual que en el origen.',
  ].join('\n')
  const BRIEF_V4_NUEVO = [
    '## De qué parte del plan sale', '«Meta: 120 pedidos en las primeras 4 semanas.»',
    '## Problema de negocio', 'Hace falta llegar a la meta de pedidos del plan.',
    '## Público', '> «Familias de la ciudad que piden a domicilio y dudan de que el producto llegue igual que en el origen.»',
    '## Insight', 'Creen que lo bueno no viaja.',
    '## Lo único que hay que comunicar', 'Llega igual que en el origen.',
    '## Razones para creer', '- misma receta (plan)',
    '## Rutas vivas del plan',
    '> «Hipótesis A · Producto y antojo: la gente pide por el plato que ya conoce.»',
    '> «Hipótesis B · Origen: la gente pide porque viene de un lugar con historia.»',
    '> «Regla: probar A contra B por tanda y quedarse con la que dé más pedidos.»',
    '## Hechos de las ofertas', '- sin ficha de la oferta',
    '## Objetivo', '120 pedidos en las primeras 4 semanas.', '- ig: que pidan',
    '## Cómo sabremos que funcionó', 'Pedidos por semana contra la meta.',
    '## Tono', 'Cercano.',
    '## Obligatorios', '- vocabulario: casa', '- prohibido: garantizado', '- lo que no se dice: comparaciones',
  ].join('\n')
  it('el brief nuevo lleva las DOS rutas y la regla, cada una citada literal, y se valida', () => {
    const b = leerBriefCreativo(BRIEF_V4_NUEVO, { planTexto: PLAN, prohibidas: [], redes: ['ig'] })
    expect(b.bloqueos).toEqual([])
    expect(b.rutas_del_plan).toContain('Hipótesis A · Producto y antojo')
    expect(b.rutas_del_plan).toContain('Hipótesis B · Origen')
    expect(b.rutas_del_plan).toContain('probar A contra B por tanda')
  })
  it('el objetivo conserva su número del plan y el público sus barreras', () => {
    const b = leerBriefCreativo(BRIEF_V4_NUEVO, { planTexto: PLAN, prohibidas: [], redes: ['ig'] })
    expect(b.objetivo).toBe('120 pedidos en las primeras 4 semanas.')
    expect(b.publico).toContain('dudan de que el producto llegue igual')
  })
  it('tres citas seguidas se comprueban una por una: si una no es literal, se nombra ESA, no el bloque', () => {
    const malo = BRIEF_V4_NUEVO.replace('Hipótesis B · Origen: la gente pide porque viene de un lugar con historia.', 'Hipótesis B · Origen: la gente pide por la playa.')
    const b = leerBriefCreativo(malo, { planTexto: PLAN, prohibidas: [], redes: ['ig'] })
    expect(b.bloqueos).toHaveLength(1)
    expect(b.bloqueos[0]).toContain('«Hipótesis B · Origen: la gente pide por la playa.»')
    expect(b.bloqueos[0]).not.toContain('Hipótesis A')
  })
  it('sin ficha, el brief lo declara con la frase de la plantilla', () => {
    expect(leerBriefCreativo(BRIEF_V4_NUEVO, { planTexto: PLAN, prohibidas: [] }).hechos_de_las_ofertas).toBe('- sin ficha de la oferta')
  })
})

describe('Sprint 4 · C · quitar órdenes se prueba como quitar', () => {
  it('la plantilla ya no pide el llamado por red', () => {
    expect(REFERENCIA_DEL_BRIEF_CREATIVO).not.toMatch(/objetivo · llamado/)
    expect(REFERENCIA_DEL_BRIEF_CREATIVO).toContain('por red una línea «- <red>: objetivo»')
  })
  it('la plantilla ya no pide «## Mensaje»: pide lo único que hay que comunicar, que no es un anuncio', () => {
    expect(REFERENCIA_DEL_BRIEF_CREATIVO).not.toMatch(/## Mensaje\b/)
    expect(REFERENCIA_DEL_BRIEF_CREATIVO).toMatch(/## Lo único que hay que comunicar · .*NO es un anuncio ni un eslogan: sin llamado/)
  })
  it('la plantilla dice qué no va en el brief y adónde va: anuncio, llamado, formatos, fotos; precio, horario y plazos a la ficha', () => {
    const no = REFERENCIA_DEL_BRIEF_CREATIVO.split('\n').find((l) => l.startsWith('Lo que NO va en el brief'))!
    for (const x of ['texto final de un anuncio', 'llamado a la acción', 'formatos', 'fotos', 'citadas por número', 'precio', 'horario', 'plazos', 'ficha de cada oferta']) expect(no).toContain(x)
    expect(REFERENCIA_DEL_BRIEF_CREATIVO).toContain('No prescribas la solución')
  })
  it('la plantilla pide las secciones de la vara IPA: problema, razones para creer y TODAS las rutas del plan', () => {
    for (const s of ['## Problema de negocio', '## Razones para creer', '## Rutas vivas del plan', '## Público', '## Cómo sabremos que funcionó', '## Obligatorios']) expect(REFERENCIA_DEL_BRIEF_CREATIVO).toContain(s)
    expect(REFERENCIA_DEL_BRIEF_CREATIVO).toMatch(/TODAS las rutas o hipótesis que el plan quiere probar/)
  })
  it('la guía de dirección: el techo es una proposición (no un anuncio) y el llamado lo deciden los creativos', () => {
    expect(METODO_BRIEF_POR_OMISION).toContain('«Lo único que hay que comunicar»')
    expect(METODO_BRIEF_POR_OMISION).toContain('no es un anuncio ni un eslogan')
    expect(METODO_BRIEF_POR_OMISION).toContain('«Razones para creer»')
    expect(METODO_BRIEF_POR_OMISION).toContain('el llamado exacto y el formato los deciden los creativos')
    expect(METODO_BRIEF_POR_OMISION).not.toMatch(/qué acción pide/)
  })
  it('el nombre visible de «Mensaje» es el nuevo', () => {
    expect(TITULO_DE_LA_SECCION.Mensaje).toBe('Lo único que hay que comunicar')
  })
})

describe('Sprint 4 · C · agnóstico', () => {
  it('ni la plantilla ni la guía nombran un rubro, un lugar ni un cliente', () => {
    for (const t of [REFERENCIA_DEL_BRIEF_CREATIVO, METODO_BRIEF_POR_OMISION]) expect(t).not.toMatch(/(?<!\p{L})(sedes?|locales|platos?|restaurantes?|men[úu]|comida|náufrago|naufrago|encebollado|olón|guayaquil|ecuador)(?!\p{L})/iu)
    // «local» suelto también es «capa local» (la guía): se busca solo como lugar
    for (const t of [REFERENCIA_DEL_BRIEF_CREATIVO, METODO_BRIEF_POR_OMISION]) expect(t).not.toMatch(/(?<!\p{L})(el|del|un|tu) local(?!\p{L})/iu)
  })
})

// ───────────────────────────────────────────────────────── nada se pierde: la hoja con el brief anterior y con el nuevo
const CONCEPTO = leerConcepto([
  '## Gran idea  Lo que ya tienes · La campaña de prueba',
  '## Cómo se ve  Luz natural.',
  '## Capítulo F1 · Abrir', 'Qué cuenta: abre · Objetivo de la fase (cita): «que vuelva» · Cómo se ve en este capítulo: planos cerrados',
  '## Banco de ideas',
  '- C1-I01 · ig · carrusel · lo que ya tienes · mensaje: combina con lo tuyo · gancho: ¿y esto con qué? · protagonista: la prenda · serie: ninguna · foto:ninguna',
].join('\n'), { fases: [{ clave: 'F1', semanas: 1 }], redes: [{ red: 'ig', huecos_por_semana: 1 }], prohibidas: [], fotos: [] })
const FORMATOS: FormatosPorRed = { ig: [{ formato: 'carrusel', produccion: 'opera', lead_dias: 2, max_por_dia: 1, familia: 'imagen_fija' }] }
const FILA: FilaDeHoja = { id: 'F1-S1-ig-01', fecha: '2026-11-20', hora: '09:00', red: 'ig', formato: 'carrusel', pilar: 'producto', tema: 'lo que ya tienes', datos: [], fase: 'F1', idea_ref: 'C1-I01' }
const hojaCon = (brief: ReturnType<typeof leerBriefCreativo>) => escribirHoja({
  client_name: 'Cliente de prueba', plan_id: '11111111-2222-3333-4444-555555555555', manual_version: 1, manual_id: 'man-1', hoy: '2026-11-17', lote_key: '2026-W47',
  brief, brief_id: 'brf-1', concepto: CONCEPTO, concepto_id: 'con-1', filas: [FILA], formatos: FORMATOS,
} satisfies InsumosDeLaHoja)

describe('Sprint 4 · C · nada se pierde en la hoja', () => {
  const tienda = CLIENTES[1]
  it('con el brief ANTERIOR la hoja sale igual que hoy: mensaje de campaña y LLAMADO del brief', () => {
    const b = parsearBrief(hojaCon(leerBriefCreativo(tienda.anterior, ins(tienda))).texto_md, FILA.id)!
    expect(b.texto).toContain(`- MENSAJE DE CAMPAÑA: ${tienda.proposicion}`)
    expect(b.llamado).toBe(tienda.llamado)
  })
  it('con el brief NUEVO la hoja lleva lo único que hay que comunicar como mensaje de campaña, y el mismo público, tono y límites', () => {
    const nuevo = parsearBrief(hojaCon(leerBriefCreativo(tienda.nuevo, ins(tienda))).texto_md, FILA.id)!
    const viejo = parsearBrief(hojaCon(leerBriefCreativo(tienda.anterior, ins(tienda))).texto_md, FILA.id)!
    expect(nuevo.texto).toContain(`- MENSAJE DE CAMPAÑA: ${tienda.proposicion}`)
    expect(nuevo.mensaje).toBe(viejo.mensaje)
    expect(nuevo.sintaxis).toBe(viejo.sintaxis)
    expect(nuevo.vocabulario_obligatorio).toEqual(viejo.vocabulario_obligatorio)
    expect(nuevo.prohibido).toEqual(viejo.prohibido)
    expect(nuevo.negativos).toEqual(viejo.negativos)
    // el LLAMADO ya no viene del brief: lo trae la ficha de la oferta (A · CC3) · sin ficha, la hoja de CC3 lo DECLARA, nunca en blanco (pedido 3 de CC7)
    expect(nuevo.llamado).toMatch(/^sin llamado: la mesa lo escribe/)
  })
})

// CC6 · ADENDA 2: lo que es tubería · el marco del brief recibe `fichasEnTexto` de CC3 TAL CUAL; sin ficha, el bloque lo dice
describe('Sprint 4 · C · el marco del brief recibe las fichas de las ofertas', () => {
  const FICHAS: Record<string, FichaDeOferta[]> = {
    'restaurante con reparto': [{ clave: 'reparto-norte', nombre: 'Reparto zona norte', oferta_y_precio: [{ valor: 'plato del día US$ 6', fuente: 'ficha:reparto-norte' }], como_se_compra: [{ valor: 'pedido en la web, pago al recibir', fuente: 'manual:p4' }] }],
    'tienda en línea de ropa': [{ clave: 'coleccion-otono', nombre: 'Colección otoño', como_se_compra: [{ valor: 'en la tienda en línea', fuente: 'plan:canales' }], obligatorios_legales: [{ valor: 'cambios sujetos a la política publicada', fuente: 'manual:legal' }] }],
    'estudio de abogados': [{ clave: 'revision-contratos', nombre: 'Revisión de contratos', que_es: [{ valor: 'revisión de contratos comerciales antes de firmar', fuente: 'manual:servicios' }] } as unknown as FichaDeOferta],
  }
  // el título del bloque también aparece citado en la plantilla («copiados de «# FICHAS DE LAS OFERTAS»»): se busca el bloque en su propia línea
  const BLOQUE_EN_SU_LINEA = `\n${TITULO_DEL_BLOQUE}\n`
  const ctx = contextoDe(clienteA())
  const marco = (fichas?: FichaDeOferta[] | null) => marcoDelBrief({ ctx, estrategia: clienteA().estrategia, version: 1, devolucion: null, nota: null, fichas })
  it.each(Object.keys(FICHAS))('%s · el bloque de fichas llega al marco tal como lo escribe `fichasEnTexto`', (nombre) => {
    const bloque = fichasEnTexto(FICHAS[nombre])
    expect(bloque.startsWith(TITULO_DEL_BLOQUE)).toBe(true)
    expect(marco(FICHAS[nombre])).toContain(bloque)
  })
  it('sin fichas, el marco trae el bloque que lo declara (nunca falta en silencio)', () => {
    for (const sin of [undefined, null, []]) {
      const m = marco(sin as FichaDeOferta[] | null | undefined)
      expect(m).toContain(fichasEnTexto(null))
      expect(m.split(BLOQUE_EN_SU_LINEA)).toHaveLength(2)
    }
  })
  it('con la fecha de hoy, lo que todavía no rige llega marcado, nunca como presente (CC6 · 🟡 3 a #1131)', () => {
    const apertura: FichaDeOferta[] = [{ clave: 'nueva', se_puede_afirmar: [{ valor: 'ya abrimos en el norte', fuente: 'plan:fase-2', vigente_desde: '2026-11-21' }] }]
    const m = marcoDelBrief({ ctx, estrategia: clienteA().estrategia, version: 1, devolucion: null, nota: null, fichas: apertura, hoy: '2026-11-17' })
    expect(m).toContain(fichasEnTexto(apertura, '2026-11-17'))
    expect(fichasEnTexto(apertura, '2026-11-17')).not.toBe(fichasEnTexto(apertura))
    expect(m).toMatch(/AÚN NO VIGENTE/)
  })
  it('las fichas van antes del plan, junto a la estrategia, y una sola vez', () => {
    const m = marco(FICHAS['tienda en línea de ropa'])
    const donde = m.indexOf(BLOQUE_EN_SU_LINEA)
    expect(donde).toBeGreaterThan(m.indexOf('# ESTRATEGIA · fases'))
    expect(donde).toBeLessThan(m.indexOf('# PLAN\n'))
    expect(m.split(BLOQUE_EN_SU_LINEA)).toHaveLength(2)
  })
})
