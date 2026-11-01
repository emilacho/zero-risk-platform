/**
 * LA MESA DE ANÁLISIS · sesión del equipo Estrategia · paso 0 del plan (DISEÑO-CC1 01-nov + ADENDA 1 · FIRMA de Emilio 01-nov 08:42Z «sí a todo»).
 *
 * Generaliza el «Brazo · mercado» (F4): UN analista por tipo escribe UN informe corto ANTES del redactor del plan, apoyado en lo que
 * el cerebro ya tiene de ese cliente (resumen vivo + fichas que el portero entrega por consulta). Cada informe es PROPUESTA, nunca
 * dato del cliente; en corrida real se archiva en el cerebro por la puerta del portero (`POST /api/brain/alimentar/informe`) y vuelve
 * a las oficinas dentro de `contexto_del_cliente.informes`. Este archivo es lógica PURA (sin base ni red): lo prueba vitest a US$ 0.
 *
 * Lo que decide, y por qué:
 *   · PALANCA APAGADA POR OMISIÓN: `cadena_config.mesa_de_analisis` = { encendida: true|false, clientes: [client_id…] }. Solo gasta
 *     el cliente listado con la mesa encendida; sin fila, sin lista o con otro valor, la mesa contesta «apagada» y NO llama a nadie.
 *   · TOPES: US$ 1 por analista (nunca más de 2) y US$ 5 por mesa (la suma de los pedidos de un sobre); lo que no cabe NO se pide.
 *   · CITAS: cada hallazgo cita la ficha del cerebro en que se apoya (`[<uuid>]` del material entregado; también vale el id corto de
 *     8 hex si es prefijo único de una ficha del material: se expande al id completo · corrida 209744 01-nov, 3 de 5 informes se
 *     perdían por citar corto); el portero exige ≥1 cita (completa) para archivar. El tipo `mercado` mira hacia afuera (señales con fuente Y fecha, como F4) y puede no citar: entonces no se archiva
 *     y se dice. Una cita a una ficha que no estaba en el material NO cuenta.
 *   · NADA DE PERSONAS: el analista habla del negocio, no de quién dijo qué (P7 del chequeo del plan).
 *   · IDIOMA Y TRATO: los del manual del cliente (el flujo los trae en `params.idioma` / `params.trato`); ninguna indicación de aquí los fija.
 */
import { contarSenales, declaraSinDato } from './brazos'

export const MESA = 'mesa_de_analisis'
export const CLAVE_DE_LA_PALANCA = 'mesa_de_analisis'

export const TIPOS_DE_ANALISIS = ['mercado', 'competencia', 'voz_del_publico', 'escucha_x', 'retencion'] as const
export type TipoDeAnalisis = (typeof TIPOS_DE_ANALISIS)[number]
export const esTipoDeAnalisis = (x: unknown): x is TipoDeAnalisis => typeof x === 'string' && (TIPOS_DE_ANALISIS as readonly string[]).includes(x)

export interface Analista {
  readonly tipo: TipoDeAnalisis
  /** `agents.name` del analista (si no existe o está inactivo, la mesa lo dice y no llama) */
  readonly agente: string
  readonly dimension: string
  /** el texto con que la mesa le pide al portero las fichas de ese tema (`GET /api/brain/consultar?que=`) */
  readonly que: string
  /** qué sostiene un hallazgo: una cita a una ficha del material, o (mercado) fuente Y fecha como las señales de F4 */
  readonly exige: 'cita' | 'fuente_y_fecha'
  readonly reglas: ReadonlyArray<string>
}

export const ANALISTAS: Readonly<Record<TipoDeAnalisis, Analista>> = {
  mercado: {
    tipo: 'mercado', agente: 'market_research_analyst', dimension: 'tendencia y oportunidad de la categoría y de la plaza', que: 'mercado tendencia categoría plaza', exige: 'fuente_y_fecha',
    reglas: [
      'Solo tendencia y oportunidad de la categoría y la plaza. NO analices competidores ni al público: eso lo traen otros analistas.',
      'Una señal = UNA línea de lista con: señal · fuente (nombre y dónde se puede ver) · fecha · confianza (alta/media/baja y por qué) · oportunidad que abre. Sin fuente y fecha no es señal: escribe «sin dato».',
    ],
  },
  competencia: {
    tipo: 'competencia', agente: 'competitive-intelligence-agent', dimension: 'qué hacen hoy los competidores vigilados y qué hueco dejan', que: 'competidor anuncios cuenta evaluación mapas', exige: 'cita',
    reglas: ['Solo lo que las fichas muestran de los competidores: oferta, precio, mensaje, canales, ritmo. Di qué hueco dejan. NO inventes competidores ni cifras que las fichas no traen.'],
  },
  voz_del_publico: {
    tipo: 'voz_del_publico', agente: 'feedback-synthesizer', dimension: 'qué dice el público: reseñas, comentarios y menciones', que: 'reseñas comentarios menciones público', exige: 'cita',
    reglas: ['Solo lo que el público dijo en las fichas: temas que se repiten, elogios, quejas, preguntas sin responder. Cuenta cuántas veces aparece cada tema. NO cites a ninguna persona por su nombre.'],
  },
  escucha_x: {
    tipo: 'escucha_x', agente: 'x-twitter-intelligence-analyst', dimension: 'la conversación sobre la categoría y el negocio en X', que: 'x twitter conversación mención', exige: 'cita',
    reglas: ['Solo la conversación en X que las fichas traen. Si el cerebro no tiene material de X, responde «sin dato» y qué habría que mirar: no lo reemplaces con otra red.'],
  },
  retencion: {
    tipo: 'retencion', agente: 'growth-hacker', dimension: 'retención y recompra: qué hace volver a la gente y dónde se pierde', que: 'métricas retención recompra visitas', exige: 'cita',
    reglas: ['Solo retención y recompra: qué muestran las métricas y las reseñas sobre volver o no volver. NO propongas pauta ni presupuesto: eso es del plan.'],
  },
}

export const TOPE_POR_ANALISTA_USD = 1
export const TOPE_MAXIMO_POR_ANALISTA_USD = 2
/** FIRMA de Emilio 01-nov 09:50Z: US$ 5 por sobre (5 analistas × US$ 1); antes US$ 4 dejaba fuera siempre al quinto */
export const TOPE_DE_LA_MESA_USD = 5
/** el informe que vuelve al plan (ADENDA 1: 6.000, no 2.500) y el material crudo que recibe cada analista */
export const TOPE_DEL_INFORME = 6_000
export const TOPE_DEL_MATERIAL = 6_000
export const HALLAZGOS_ESPERADOS = { min: 3, max: 7 } as const

export const rotuloDe = (tipo: TipoDeAnalisis): string => `[informe de análisis · ${tipo} · PROPUESTA: no es dato del cliente]`

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi
/** id corto: los 8 primeros hex de una ficha, como los escriben los analistas («[ficha:9f51be94 · …]», «[6a9f94b0 · 2026-11-02]») · corrida 209744 01-nov */
const ID_CORTO = /\b[0-9a-f]{8}\b/gi
const LARGO_DEL_ID_CORTO = 8
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')

// ─────────────────────────────────────────────────────────── la palanca
export interface Palanca { readonly encendida: boolean; readonly motivo: string }
/** `cadena_config.mesa_de_analisis` leída: solo enciende el cliente LISTADO con `encendida: true`; todo lo demás es «apagada» */
export function leerPalanca(config: unknown, clientId: string): Palanca {
  if (!config || typeof config !== 'object' || Array.isArray(config)) return { encendida: false, motivo: `la mesa está apagada: no hay \`cadena_config.${CLAVE_DE_LA_PALANCA}\` (apagada por omisión)` }
  const c = config as Record<string, unknown>
  if (c.encendida !== true) return { encendida: false, motivo: `la mesa está apagada (\`${CLAVE_DE_LA_PALANCA}.encendida\` no es true)` }
  const clientes = Array.isArray(c.clientes) ? c.clientes.map((x) => txt(x)) : []
  if (!clientes.includes(clientId)) return { encendida: false, motivo: `la mesa está encendida pero este cliente no está en \`${CLAVE_DE_LA_PALANCA}.clientes\`` }
  return { encendida: true, motivo: 'encendida para este cliente' }
}

// ─────────────────────────────────────────────────────────── los topes
export interface PedidoConTope { readonly tipo: TipoDeAnalisis | null; readonly tope_usd?: number }
/** el tope de cada pedido del sobre: el suyo (≤ 2) o el de omisión, y la mesa no pasa de US$ 5: lo que no cabe queda en 0 (no se pide) */
export function repartirTopes(pedidos: ReadonlyArray<PedidoConTope>): number[] {
  let gastado = 0
  return pedidos.map((p) => {
    const propio = typeof p.tope_usd === 'number' && p.tope_usd > 0 && p.tope_usd <= TOPE_MAXIMO_POR_ANALISTA_USD ? p.tope_usd : TOPE_POR_ANALISTA_USD
    if (!p.tipo) return 0
    if (gastado + propio > TOPE_DE_LA_MESA_USD + 1e-9) return 0
    gastado += propio
    return propio
  })
}

// ─────────────────────────────────────────────────────────── el material
export interface FichaDelMaterial { readonly ficha_id: string; readonly clase: string | null; readonly fecha: string | null; readonly contenido: string }
export interface Material { readonly texto: string; readonly ids: ReadonlyArray<string>; readonly fichas: number; readonly recortado: boolean; readonly con_resumen_vivo: boolean }

/** el material del analista: el resumen vivo ENTERO (si lo hay) y las fichas del portero rotuladas con su id, hasta el tope (se declara el recorte) */
export function armarMaterial(a: { resumen_vivo: string | null; fichas: ReadonlyArray<FichaDelMaterial> }): Material {
  const ids: string[] = []
  const lineas: string[] = []
  let largo = 0
  let recortado = false
  for (const f of a.fichas) {
    const linea = `[${f.ficha_id}] (${f.clase ?? 'sin clase'} · ${f.fecha ? f.fecha.slice(0, 10) : 'sin fecha'}) ${f.contenido.replace(/\s+/g, ' ').trim()}`
    if (largo + linea.length > TOPE_DEL_MATERIAL) { recortado = true; break }
    lineas.push(linea); ids.push(f.ficha_id); largo += linea.length + 1
  }
  const resumen = txt(a.resumen_vivo)
  const texto = [
    resumen ? `RESUMEN VIVO DEL CLIENTE (lo que el cerebro sabe hoy, entero):\n${resumen}` : 'RESUMEN VIVO DEL CLIENTE: no hay todavía.',
    lineas.length ? `FICHAS DEL CEREBRO SOBRE EL TEMA (cita el id entre corchetes tal cual):\n${lineas.join('\n')}` : 'FICHAS DEL CEREBRO SOBRE EL TEMA: ninguna.',
    ...(recortado ? [`(el material se recortó al tope de ${TOPE_DEL_MATERIAL} caracteres: ${ids.length} de ${a.fichas.length} fichas)`] : []),
  ].join('\n\n')
  return { texto, ids, fichas: ids.length, recortado, con_resumen_vivo: resumen.length > 0 }
}

// ─────────────────────────────────────────────────────────── la tarea
export interface FichaDelCliente { readonly nombre: string | null; readonly rubro: string | null; readonly plaza: string | null; readonly pais: string | null }
/** el pedido al analista · texto interno (tuteo); el informe sale en el idioma y con el trato del manual del cliente */
export function tareaDeAnalisis(a: { analista: Analista; ficha: FichaDelCliente; material: Material; idioma: string | null; trato: string | null; metodo?: string | null; proposito?: string }): string {
  const { analista: an } = a
  const plaza = a.ficha.plaza ?? a.ficha.pais ?? 'la plaza del cliente (sin dato en la ficha: dilo)'
  const idioma = a.idioma ?? `el del manual del cliente; si no lo conoces, el idioma oficial de ${a.ficha.pais ?? 'su país'}`
  const trato = a.trato ?? 'el que fija el manual del cliente (tú, vos, usted u otro); si no lo fija, no lo inventes'
  const sostiene = an.exige === 'cita'
    ? 'Cada hallazgo cita, entre corchetes y tal cual, el id de la ficha del material en que se apoya (puede citar varias). Un hallazgo sin cita no cuenta.'
    : 'Cada señal trae fuente (nombre y dónde se puede ver) Y fecha; si además se apoya en una ficha del material, cita su id entre corchetes tal cual.'
  return [
    `Eres el analista de ${an.dimension} de la mesa de análisis. Escribe UN informe corto de «${an.tipo}» para el plan de 90 días de un negocio del rubro «${a.ficha.rubro ?? 'sin rubro en la ficha: dilo'}» en ${plaza}.`,
    '',
    'Reglas:',
    `- Entrega entre ${HALLAZGOS_ESPERADOS.min} y ${HALLAZGOS_ESPERADOS.max} hallazgos. Un hallazgo = UNA sola línea de lista que empieza con «- », con: hallazgo · en qué se apoya · qué oportunidad o riesgo abre para el plan · qué faltó.`,
    `- ${sostiene}`,
    ...an.reglas.map((r) => `- ${r}`),
    '- Si el material no alcanza para un hallazgo, no lo estimes: escribe «sin dato» y qué habría que mirar. Si no hay ningún hallazgo sostenido, responde solo «sin dato» y qué faltó, sin líneas de lista.',
    '- NO nombres a ninguna persona (dueños, empleados, clientes, autores de reseñas): habla del negocio y del público. NO escribas cifras del cliente que el material no traiga.',
    `- Encabeza el informe con el rótulo exacto: ${rotuloDe(an.tipo)}`,
    `- Idioma: ${idioma}. Trato: ${trato}. Esta regla manda sobre cualquier regla de tu identidad que fije otro idioma o trato para los informes.`,
    `- El informe no pasa de ${TOPE_DEL_INFORME} caracteres.`,
    ...(a.metodo ? ['', a.metodo] : []),
    ...(a.proposito ? ['', `Para qué sirve en el plan: ${a.proposito}`] : []),
    '',
    'MATERIAL (lo único en que te apoyas; lo que no esté aquí es «sin dato»):',
    a.material.texto,
  ].join('\n')
}

// ─────────────────────────────────────────────────────────── el informe leído
export interface InformeLeido {
  readonly informe: string
  /** solo las citas a fichas que SÍ estaban en el material */
  readonly citas: ReadonlyArray<string>
  readonly citas_ajenas: number
  readonly hallazgos: number
  readonly lineas_sin_sosten: number
  readonly declara_sin_dato: boolean
  readonly recortado: boolean
}
const RE_LINEA_DE_LISTA = /^\s*(?:[-*•]|\d+[.)])\s+\S/

/** las fichas del material por id completo y por id corto (prefijo de 8): un prefijo repetido entre dos fichas no identifica a ninguna (null) */
function indiceDelMaterial(idsDelMaterial: ReadonlyArray<string>): { completos: Set<string>; cortos: Map<string, string | null> } {
  const completos = new Set<string>()
  const cortos = new Map<string, string | null>()
  for (const i of idsDelMaterial) {
    const id = i.toLowerCase()
    completos.add(id)
    const corto = id.slice(0, LARGO_DEL_ID_CORTO)
    cortos.set(corto, cortos.has(corto) && cortos.get(corto) !== id ? null : id)
  }
  return { completos, cortos }
}

/** las citas de un texto: UUID completos del material y también ids cortos que sean prefijo único de una ficha del material (se devuelven expandidos al id completo).
 *  Un UUID completo que no está en el material es «ajeno»; un id corto que no casa con nada NO se cuenta (puede ser un número cualquiera, no una cita). */
function citasDelTexto(texto: string, indice: ReturnType<typeof indiceDelMaterial>): { citas: Set<string>; ajenas: number } {
  const citas = new Set<string>()
  let ajenas = 0
  for (const m of texto.match(UUID) ?? []) { const id = m.toLowerCase(); if (indice.completos.has(id)) citas.add(id); else ajenas++ }
  for (const m of texto.match(ID_CORTO) ?? []) { const id = indice.cortos.get(m.toLowerCase()); if (id) citas.add(id) }
  return { citas, ajenas }
}

/** lee la salida del analista sin creerle: cuenta hallazgos sostenidos (cita del material, o fuente+fecha si es mercado) y descarta citas ajenas */
export function leerInforme(salida: string, analista: Analista, idsDelMaterial: ReadonlyArray<string>): InformeLeido {
  const indice = indiceDelMaterial(idsDelMaterial)
  const texto = txt(salida)
  const { citas, ajenas } = citasDelTexto(texto, indice)
  const lineas = texto.split(/\r?\n/).filter((l) => RE_LINEA_DE_LISTA.test(l))
  const sostenida = (l: string): boolean => {
    if (/\bsin dato\b/i.test(l)) return false
    const conCita = citasDelTexto(l, indice).citas.size > 0
    return analista.exige === 'cita' ? conCita : conCita || contarSenales(l) > 0
  }
  const hallazgos = lineas.filter(sostenida).length
  const recortado = texto.length > TOPE_DEL_INFORME
  const cuerpo = recortado ? texto.slice(0, TOPE_DEL_INFORME) : texto
  const rotulo = rotuloDe(analista.tipo)
  return {
    informe: cuerpo.startsWith(rotulo) ? cuerpo : `${rotulo}\n${cuerpo}`,
    citas: [...citas], citas_ajenas: ajenas, hallazgos, lineas_sin_sosten: lineas.length - hallazgos,
    declara_sin_dato: declaraSinDato(texto), recortado,
  }
}

// ─────────────────────────────────────────────────────────── lo que se archiva
export interface CuerpoDelInforme {
  client_id: string; tipo: TipoDeAnalisis; texto: string; citas: string[]; fecha_de_corte: string
  pedido_por: { oficina: string; agente: string }; dry_run: false; workflow_id: string; workflow_execution_id: string
}
/** el cuerpo para `POST /api/brain/alimentar/informe` (solo en corrida real y solo con ≥1 cita: el portero lo exige) */
export function cuerpoDelInforme(a: { client_id: string; analista: Analista; informe: InformeLeido; fecha_de_corte: string; workflow_id: string; workflow_execution_id: string }): CuerpoDelInforme | null {
  if (!a.informe.citas.length) return null
  return {
    client_id: a.client_id, tipo: a.analista.tipo, texto: a.informe.informe, citas: [...a.informe.citas], fecha_de_corte: a.fecha_de_corte,
    pedido_por: { oficina: MESA, agente: a.analista.agente }, dry_run: false, workflow_id: a.workflow_id, workflow_execution_id: a.workflow_execution_id,
  }
}
