/**
 * EL LIBRO DE APORTES · lo que el código sabe comprobar (existencia, participación, citas) sin juzgar la calidad: eso lo hace la jefatura.
 * Condición 2 de CC#3: la dirección creativa, al integrar, CITA qué aportes usó y cuáles descartó y por qué; aquí se verifica que las referencias existen y
 * que cada especialidad pertinente está citada (usada, o descartada con motivo). Puro.
 */
import type { Aporte } from './tipos'
import { TOPE_REAL_DEL_PEDIDO } from '../../limites-de-tamano'

/** la referencia corta que ven los agentes: A<n> */
export const refDe = (a: Pick<Aporte, 'n'>): string => `A${a.n}`

export interface Cita { n: number; accion: 'uso' | 'descarte'; motivo: string }

/**
 * Lee las citas de una integración. Formato tolerante, una por línea (con guion o sin él):
 *   A3 usé: el titular del gancho         · A5 descarté: no cabe con la foto del cliente
 * Acepta uso/usé/usada/usado/tomé/tomada y descarto/descarté/descartada/descartado/no usé/dejé fuera.
 */
export function leerCitas(texto: string): Cita[] {
  const citas: Cita[] = []
  const re = /^[\s>*•-]*\*{0,2}A(\d{1,4})\*{0,2}\s*(?:[:·–—-]\s*)?(?:\*{0,2})(no usé|no use|dejé fuera|deje fuera|descart[eéoóa]\w*|us[eéoóa]\w*|tom[eéoóa]\w*)\*{0,2}\s*[:·–—-]?\s*(.*)$/i
  for (const linea of String(texto ?? '').split(/\r?\n/)) {
    const m = re.exec(linea)
    if (!m) continue
    const verbo = m[2].toLowerCase()
    const descarte = /^(no us|dej|descart)/.test(verbo)
    citas.push({ n: Number(m[1]), accion: descarte ? 'descarte' : 'uso', motivo: m[3].trim() })
  }
  return citas
}

/** el motivo de una cita (usé o descarté) debe decir algo: menos de esto es trámite barato (T4 de CC#3) */
export const MOTIVO_MINIMO = 8

export interface VerificacionDeCitas {
  ok: boolean
  /** referencias a aportes que no existen en el libro */
  inexistentes: number[]
  /** especialistas pertinentes sin ninguna cita válida (usada, o descartada con motivo) */
  sin_cita: string[]
  /** descartes sin motivo (menos de 8 caracteres) */
  descartes_sin_motivo: number[]
  /** «usé» sin motivo (menos de 8 caracteres): no cuenta como cita */
  usos_sin_motivo: number[]
}

/** ¿cada especialidad pertinente está citada? (un aporte citado vale para su autor; un descarte pide motivo) */
export function verificarCitas(texto: string, libro: Aporte[], pertinentes: string[]): VerificacionDeCitas {
  const citas = leerCitas(texto)
  const porN = new Map(libro.map((a) => [a.n, a] as const))
  const inexistentes = [...new Set(citas.filter((c) => !porN.has(c.n)).map((c) => c.n))]
  const descartes_sin_motivo = [...new Set(citas.filter((c) => c.accion === 'descarte' && c.motivo.length < MOTIVO_MINIMO).map((c) => c.n))]
  const usos_sin_motivo = [...new Set(citas.filter((c) => c.accion === 'uso' && c.motivo.length < MOTIVO_MINIMO).map((c) => c.n))]
  const citados = new Set<string>()
  for (const c of citas) {
    const a = porN.get(c.n)
    if (!a) continue
    if (c.motivo.length < MOTIVO_MINIMO) continue
    citados.add(a.de)
  }
  const sin_cita = pertinentes.filter((p) => !citados.has(p))
  return { ok: !inexistentes.length && !sin_cita.length && !descartes_sin_motivo.length && !usos_sin_motivo.length, inexistentes, sin_cita, descartes_sin_motivo, usos_sin_motivo }
}

/**
 * 18-nov · LA DEVOLUCIÓN POR CITAS NO REESCRIBE LA PIEZA (decisión de Emilio 14:00, Lenovo 13:08Z opción 1, «corregir sin rehacer ni frenar»).
 * El código sabe EXACTO qué falta (quién no está citado, qué cita no tiene motivo, qué cita apunta a un aporte que no existe); el director decide
 * con criterio si cada aporte lo usó o lo descartó, y escribe SOLO esas líneas. El código las pega dentro de «## Citas» de su última integración.
 */
export interface FaltanCitas {
  /** especialistas pertinentes sin cita válida, con las referencias de sus aportes en el tablero */
  sin_cita: Array<{ agente: string; aportes: string[] }>
  /** citas que existen pero no dicen por qué (menos de MOTIVO_MINIMO caracteres) */
  sin_motivo: number[]
  /** citas a aportes que no existen en el tablero: el código las quita (no hay criterio que aplicar) */
  inexistentes: number[]
}

const TIPOS_CITABLES = ['dirige', 'aporta', 'responde', 'material']

export function faltanCitasDe(v: VerificacionDeCitas, libro: Aporte[]): FaltanCitas {
  return {
    sin_cita: v.sin_cita.map((agente) => ({ agente, aportes: libro.filter((a) => a.de === agente && TIPOS_CITABLES.includes(a.tipo)).map(refDe) })),
    sin_motivo: [...new Set([...v.usos_sin_motivo, ...v.descartes_sin_motivo])].sort((a, b) => a - b),
    inexistentes: [...v.inexistentes].sort((a, b) => a - b),
  }
}

/** la integración que se devuelve por citas: la ÚLTIMA (el planificador devuelve la última integración) */
export const integracionDevuelta = (libro: Aporte[]): Aporte | undefined => [...libro].reverse().find((a) => a.tipo === 'integra')

/** lo que el director lee: exactamente qué falta, sin pedirle la pieza otra vez */
export function textoDeLoQueFalta(f: FaltanCitas): string {
  const lineas: string[] = []
  for (const s of f.sin_cita) lineas.push(`- **${s.agente}** no está citado. Sus aportes: ${s.aportes.length ? s.aportes.join(', ') : '(no tiene aportes en el tablero)'}.`)
  if (f.sin_motivo.length) lineas.push(`- Estas citas no dicen por qué: ${f.sin_motivo.map((n) => `A${n}`).join(', ')}. Vuelve a escribirlas con su motivo.`)
  if (f.inexistentes.length) lineas.push(`- Estas citas apuntan a aportes que no existen en el tablero: ${f.inexistentes.map((n) => `A${n}`).join(', ')}. El código las quita; no hace falta que las repitas.`)
  return lineas.length ? lineas.join('\n') : '- (el código no encontró qué falta: revisa tus citas)'
}

/** las líneas de cita, tal como las escribió el agente (las que lee `leerCitas`) */
function lineasDeCita(texto: string): Array<{ n: number; linea: string }> {
  const out: Array<{ n: number; linea: string }> = []
  for (const linea of String(texto ?? '').split(/\r?\n/)) { const c = leerCitas(linea); if (c.length && !out.some((x) => x.n === c[0].n)) out.push({ n: c[0].n, linea: linea.trim() }) }
  return out
}

const CABECERA_DE_CITAS = /^#{1,6}\s*Citas\b/i
const CABECERA = /^#{1,6}\s/

/**
 * Pega en la sección «## Citas» de la integración las líneas de cita de la respuesta: una cita nueva de A<n> reemplaza la vieja de A<n>; las citas a
 * aportes que no existen (`quitar`) salen. Todo lo demás de la integración queda tal cual (el banco, la crítica, la pieza). Lo que no es una línea de
 * cita en la respuesta no entra: la pieza no se reescribe. Sin sección de citas, la crea al final. Puro.
 */
export function pegarCitas(integracion: string, respuesta: string, quitar: number[] = []): string {
  const nuevas = lineasDeCita(respuesta)
  const fuera = new Set([...nuevas.map((x) => x.n), ...quitar])
  const lineas = String(integracion ?? '').split(/\r?\n/)
  const ini = lineas.findIndex((l) => CABECERA_DE_CITAS.test(l.trim()))
  if (ini < 0) {
    if (!nuevas.length) return integracion
    return [String(integracion ?? '').replace(/\s+$/, ''), '', '## Citas', ...nuevas.map((x) => x.linea)].join('\n')
  }
  let fin = lineas.findIndex((l, i) => i > ini && CABECERA.test(l.trim()))
  if (fin < 0) fin = lineas.length
  const vieja = lineas.slice(ini + 1, fin)
  const seccion = vieja.filter((l) => { const c = leerCitas(l); return !(c.length && fuera.has(c[0].n)) })
  if (!nuevas.length && seccion.length === vieja.length) return integracion
  const cola: string[] = []
  while (seccion.length && !seccion[seccion.length - 1].trim()) cola.push(seccion.pop() as string)
  return [...lineas.slice(0, ini + 1), ...seccion, ...nuevas.map((x) => x.linea), ...cola, ...lineas.slice(fin)].join('\n')
}

const enUnaLinea = (t: string): string => t.replace(/\s+/g, ' ').trim()

/**
 * Lo que la JEFATURA ve del tablero (bloqueante 1 de CC#3): cada aporte con su referencia, la cita de la dirección (usados / descartados, con el motivo) y lo que el código comprobó,
 * para que juzgue si cada aporte citado fue REAL (el código verifica existencia y cobertura; la calidad es de la jefatura). Puro.
 * 19-nov · G8 (3) · GO Lenovo 10:36 · firma de Emilio «nada se recorta»: cada aporte va ENTERO (antes 600 por aporte) y el tablero entero hasta el techo real del pedido
 * (antes 7000), con el aviso de cuánto quedó fuera si de verdad lo pasara. La jefatura juzgaba un aporte citado sin ver su final.
 */
export function tableroParaLaJefatura(libro: Aporte[], integracion: string, pertinentes: string[], maxChars = TOPE_REAL_DEL_PEDIDO): string {
  const v = verificarCitas(integracion, libro, pertinentes)
  const citas = leerCitas(integracion)
  const porN = new Map(libro.map((a) => [a.n, a] as const))
  const lineaCita = (c: Cita): string => `- ${refDe({ n: c.n })}${porN.get(c.n) ? ` (${porN.get(c.n)!.de})` : ' (NO EXISTE en el tablero)'}: ${c.motivo || '(sin motivo)'}`
  const lista = (xs: string[]): string[] => (xs.length ? xs : ['(ninguno)'])
  const aportes = libro.filter((a) => ['dirige', 'aporta', 'responde', 'material', 'integra'].includes(a.tipo)).map((a) => `${refDe(a)} · ${a.de} · ${a.tipo}: ${enUnaLinea(a.texto)}`)
  const sinMotivo = [...new Set([...v.usos_sin_motivo, ...v.descartes_sin_motivo])]
  const partes = [
    '## Aportes del equipo (tablero)', ...(aportes.length ? aportes : ['(el tablero no tiene aportes)']),
    '', '## Aportes que la dirección dice que USÓ', ...lista(citas.filter((c) => c.accion === 'uso').map(lineaCita)),
    '', '## Aportes que la dirección dice que DESCARTÓ', ...lista(citas.filter((c) => c.accion === 'descarte').map(lineaCita)),
    '', '## Lo que el código comprobó',
    `- citas a aportes que no existen: ${v.inexistentes.length ? v.inexistentes.map((n) => `A${n}`).join(', ') : 'ninguna'}`,
    `- especialidades pertinentes sin cita válida: ${v.sin_cita.length ? v.sin_cita.join(', ') : 'ninguna'}`,
    `- citas sin motivo suficiente: ${sinMotivo.length ? sinMotivo.map((n) => `A${n}`).join(', ') : 'ninguna'}`,
  ]
  const t = partes.join('\n')
  return t.length > maxChars ? `${t.slice(0, maxChars)}\n[… recortado: ${t.length - maxChars} caracteres más del tablero]` : t
}

/** cuántos aportes REALES (aporta/responde, con texto) hizo cada agente */
export function participacion(libro: Aporte[], desdeN = 0): Record<string, number> {
  const c: Record<string, number> = {}
  for (const a of libro) if (a.n > desdeN && (a.tipo === 'aporta' || a.tipo === 'responde') && a.texto.trim()) c[a.de] = (c[a.de] ?? 0) + 1
  return c
}

/** los pedidos/devoluciones que nadie ha contestado todavía */
export function pedidosSinContestar(libro: Aporte[]): Aporte[] {
  const contestados = new Set(libro.filter((a) => a.responde_a).map((a) => a.responde_a as string))
  return libro.filter((a) => (a.tipo === 'pide' || a.tipo === 'devuelve') && a.para && !contestados.has(a.id))
}

/** idas y vueltas entre dos agentes (en cualquier sentido): pedidos, devoluciones y respuestas entre ellos */
export function idasYVueltas(libro: Aporte[], x: string, y: string): number {
  return libro.filter((a) => ['pide', 'devuelve', 'responde'].includes(a.tipo) && a.para && ((a.de === x && a.para === y) || (a.de === y && a.para === x))).length
}

/** huella de un pedido (de, para, texto normalizado ENTERO): un pedido idéntico de la misma pareja no se anota dos veces.
 *  G8 · 19-nov: comparaba solo los primeros 200 caracteres; con los textos enteros (#1222), dos pedidos distintos con el mismo comienzo
 *  se tomaban por uno y el segundo no se anotaba (lo vio CC6). Ahora solo cuenta como repetido el pedido idéntico. */
export function huellaDePedido(de: string, para: string, texto: string): string {
  return `${de}>${para}:${texto.toLowerCase().replace(/\s+/g, ' ').trim()}`
}
