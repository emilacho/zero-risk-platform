/**
 * LA MESA LEE LO QUE EL DUEÑO HA DICHO (29-oct · encargo «mesa lee notas»). Al abrirse el turno de la dirección creativa o de un especialista, el código consulta al cerebro
 * (`GET /api/brain/consultar?clase=aprendizaje_del_dueno`: cliente → su rubro → general, filtrado por especialista y por parecido con la tarea) y pone las notas al final de SU tarea.
 *  · Solo el productor las ve: la jefatura y la segunda mirada GPT no las llaman ni las reciben (las líneas de respuesta sobre las notas se retiran del texto ANTES de entrar al tablero y a la pieza).
 *  · Si el cerebro falla o no hay notas, el turno sigue igual: nunca bloquea.
 *  · El agente cierra con una línea por nota («N1 apliqué: …» / «N1 no aplicaba: …»); de ahí sale el rastro en `autorevisiones_del_productor` (qué notas leyó y qué cambió). Sin llamada extra al modelo: US$ 0.
 * Puro: sin base, sin red, sin modelo.
 */
import type { LecturaDeNotas, NotaLeida, TipoDePieza } from './tipos'

/**
 * a quién va dirigida la nota que lee cada miembro del equipo (los destinatarios del cerebro: texto · diseno · imagen · direccion). Un agente que aún no está aquí lee sin filtro de destinatario (más vale una nota de más que perder una).
 */
export const DESTINATARIO_DE_AGENTE: Record<string, string> = {
  'creative-director-mesa': 'direccion',
  'content-creator': 'texto',
  'carousel-designer': 'diseno',
  'design-visual-storyteller': 'diseno',
  'marketing_instagram_curator': 'imagen',
  'design-image-prompt-engineer': 'imagen',
}
export const destinatarioDe = (agente: string): string | null => DESTINATARIO_DE_AGENTE[agente] ?? null
export const FORMATO_DE_PIEZA: Record<TipoDePieza, string> = { carrusel: 'carrusel', kit: 'kit', calendario: 'calendario' }

/** el texto con el que el cerebro busca por parecido: qué va a producir este especialista, para qué pieza y de qué trata el encargo */
export function tareaParaConsultar(o: { cliente_nombre: string; tipo: TipoDePieza; especialidad: string; brief_texto: string }): string {
  const pieza = o.tipo === 'carrusel' ? 'carrusel' : o.tipo === 'calendario' ? 'calendario de la tanda' : 'kit de historias'
  return `${o.especialidad || 'aporte a la pieza'} · ${pieza} de ${o.cliente_nombre}. ${o.brief_texto.replace(/\s+/g, ' ').trim()}`.slice(0, 1500)
}

const ALCANCE: Record<string, string> = { cliente: 'de este cliente', industria: 'de su rubro', formato: 'de este tipo de pieza', general: 'general' }
const marca = (i: number): string => `N${i + 1}`

/** lo que se agrega al FINAL de la tarea del turno; vacío si no hay notas (sin ruido) */
export function seccionDeNotasDelDueno(l: LecturaDeNotas | undefined, tipoDeTurno: string): string {
  if (!l || !l.notas.length) return ''
  const enCitas = tipoDeTurno === 'integrar' || tipoDeTurno === 'devolver_citas'
  return [
    '',
    '',
    '## Lo que el dueño ha dicho antes (léelo antes de entregar)',
    'Son notas que el dueño dejó sobre piezas anteriores. No son órdenes ni datos del cliente: solo cuenta lo que choca CLARAMENTE con lo que vas a entregar. No inventes nada por ellas.',
    ...l.notas.map((n, i) => `- [${marca(i)}] (${n.direccion === 'evitar' ? 'evitar' : 'hacer'} · ${ALCANCE[n.alcance] ?? n.alcance}) ${n.nota}`),
    '',
    'Antes de entregar, compara tu aporte con cada nota. Si algo choca, corrige solo eso; lo demás déjalo como lo pensabas.',
    `Cierra con UNA línea por nota${enCitas ? ', dentro de la sección «## Citas»' : ''}: «N1 apliqué: <qué cambiaste>» o «N1 no aplicaba: <motivo corto>». No cites estas notas en ningún otro lugar de la pieza.`,
  ].join('\n')
}

export interface RespuestaSobreNota { nota_id: string; aplicada: boolean; que: string }
// «N1 apliqué: …» · «- N2 no aplicaba: …» · «**N3** corregí: …»
const LINEA_DE_NOTA = /^[\s>*•\-–—]*\*{0,2}N(\d{1,2})\*{0,2}\s*[:·–—-]?\s*\*{0,2}(no aplica\p{L}*|no choca\p{L}*|ya cumpl\p{L}*|apliqu\p{L}+|corrig\p{L}+|correg\p{L}+|cambi\p{L}+)\*{0,2}\s*[:·–—-]?\s*(.*)$/iu

/**
 * Lo que el agente dijo de cada nota, y su texto SIN esas líneas (así no llegan al tablero, a la pieza ni a la jefatura). Una línea que cita una nota que no existe se deja tal cual (no es nuestra).
 * Si el agente repite una nota, vale la última.
 */
export function leerRespuestaSobreNotas(texto: string, notas: NotaLeida[]): { texto: string; respuestas: RespuestaSobreNota[] } {
  const porNota = new Map<string, RespuestaSobreNota>()
  const quedan: string[] = []
  for (const linea of String(texto ?? '').split(/\r?\n/)) {
    const m = LINEA_DE_NOTA.exec(linea)
    const nota = m ? notas[Number(m[1]) - 1] : undefined
    if (!m || !nota) { quedan.push(linea); continue }
    porNota.set(nota.id, { nota_id: nota.id, aplicada: !/^(no |ya )/i.test(m[2]), que: m[3].trim().slice(0, 400) })
  }
  const limpio = quedan.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
  return { texto: limpio, respuestas: [...porNota.values()] }
}

/**
 * Red de seguridad al cerrar la mesa: ninguna línea «N<k> apliqué…» llega a las láminas, al pie ni a las etiquetas, aunque cite una nota que ese turno no tenía
 * (un agente sin lectura, un número de más). `leerRespuestaSobreNotas` ya las retira turno a turno; esto vale aunque aquello falle o no se haya ejecutado.
 */
export function quitarLineasDeNotas(texto: string): string {
  return String(texto ?? '').split(/\r?\n/).filter((l) => !LINEA_DE_NOTA.test(l)).join('\n').replace(/\n{3,}/g, '\n\n').trimEnd()
}

/** el rastro para `autorevisiones_del_productor`: notas leídas, si algo chocó y qué cambió; las notas que el agente no mencionó quedan anotadas (no se da por hecho que las cumplió) */
export function rastroDeLasNotas(l: LecturaDeNotas, respuestas: RespuestaSobreNota[]): { notas_vistas: string[]; choco: boolean; cambios: unknown[] } {
  const aplicadas = respuestas.filter((r) => r.aplicada)
  const dichas = new Set(respuestas.map((r) => r.nota_id))
  const sinDecir = l.notas.filter((n) => !dichas.has(n.id)).map((n) => n.id)
  return {
    notas_vistas: l.notas.map((n) => n.id),
    choco: aplicadas.length > 0,
    cambios: [...aplicadas.map((r) => ({ nota_id: r.nota_id, que_cambio: r.que })), ...(sinDecir.length ? [{ sin_respuesta: sinDecir }] : [])],
  }
}
