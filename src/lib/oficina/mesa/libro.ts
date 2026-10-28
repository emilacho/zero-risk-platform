/**
 * EL LIBRO DE APORTES · lo que el código sabe comprobar (existencia, participación, citas) sin juzgar la calidad: eso lo hace la jefatura.
 * Condición 2 de CC#3: la dirección creativa, al integrar, CITA qué aportes usó y cuáles descartó y por qué; aquí se verifica que las referencias existen y
 * que cada especialidad pertinente está citada (usada, o descartada con motivo). Puro.
 */
import type { Aporte } from './tipos'

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

export interface VerificacionDeCitas {
  ok: boolean
  /** referencias a aportes que no existen en el libro */
  inexistentes: number[]
  /** especialistas pertinentes sin ninguna cita válida (usada, o descartada con motivo) */
  sin_cita: string[]
  /** descartes sin motivo (menos de 8 caracteres) */
  descartes_sin_motivo: number[]
}

/** ¿cada especialidad pertinente está citada? (un aporte citado vale para su autor; un descarte pide motivo) */
export function verificarCitas(texto: string, libro: Aporte[], pertinentes: string[]): VerificacionDeCitas {
  const citas = leerCitas(texto)
  const porN = new Map(libro.map((a) => [a.n, a] as const))
  const inexistentes = [...new Set(citas.filter((c) => !porN.has(c.n)).map((c) => c.n))]
  const descartes_sin_motivo = [...new Set(citas.filter((c) => c.accion === 'descarte' && c.motivo.length < 8).map((c) => c.n))]
  const citados = new Set<string>()
  for (const c of citas) {
    const a = porN.get(c.n)
    if (!a) continue
    if (c.accion === 'descarte' && c.motivo.length < 8) continue
    citados.add(a.de)
  }
  const sin_cita = pertinentes.filter((p) => !citados.has(p))
  return { ok: !inexistentes.length && !sin_cita.length && !descartes_sin_motivo.length, inexistentes, sin_cita, descartes_sin_motivo }
}

/** cuántos aportes REALES (aporta/responde, con texto) hizo cada agente */
export function participacion(libro: Aporte[]): Record<string, number> {
  const c: Record<string, number> = {}
  for (const a of libro) if ((a.tipo === 'aporta' || a.tipo === 'responde') && a.texto.trim()) c[a.de] = (c[a.de] ?? 0) + 1
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

/** huella de un pedido (de, para, texto normalizado): un pedido idéntico de la misma pareja no se anota dos veces */
export function huellaDePedido(de: string, para: string, texto: string): string {
  return `${de}>${para}:${texto.toLowerCase().replace(/\s+/g, ' ').trim().slice(0, 200)}`
}
