/**
 * LA AUTO-REVISIÓN DEL PRODUCTOR · el «segundo cerebro» (firma de Emilio 12:57).
 *  1. El agente que produce la pieza (el que escribe, el que diseña) la hace como siempre, con TODO su contexto. Las notas NO entran en ese pedido.
 *  2. Antes de enviarla, el MISMO agente la compara con las notas del dueño: «¿algo de lo que hice choca con lo que dijo antes?».
 *  3. Si nada choca → la pieza sigue TAL CUAL la diseñó. Si choca → corrige SOLO eso (los campos que nombra) y lo anota.
 * La jefatura (reglas duras) y la segunda mirada GPT NO ven nunca las notas (lo prueba un test que recorre sus archivos).
 * Puro: sin red ni modelo. Lo que decide el CÓDIGO (no el modelo): qué notas se muestran, si el «choque» es coherente y que solo cambie lo que nombró.
 */
import type { Nota } from './tipos'

export const MAX_NOTAS = 15
export const MAX_CARACTERES_DE_NOTAS = 5000
const MAX_COMENTARIO = 400

export interface NotaVista { id: string; texto: string }

const recortar = (s: string, n: number): string => (s.length <= n ? s : `${s.slice(0, n - 1).trimEnd()}…`)
const DECISION: Record<Nota['tipo'], string> = { aprobada: 'aprobó', rechazada: 'rechazó', editada: 'editó', comentario: 'comentó sobre' }
const DECISION_GENERAL: Record<Nota['tipo'], string> = { aprobada: 'dijo al aprobar', rechazada: 'dijo al rechazar', editada: 'dijo al editar', comentario: 'comentó' }

/**
 * Qué notas ve el agente: solo las que dicen algo (con comentario), las más nuevas primero, hasta MAX_NOTAS y MAX_CARACTERES_DE_NOTAS.
 * Una aprobación o un rechazo sin comentario no enseña nada: cuenta para el registro, no para el agente.
 */
export function seleccionarNotas(notas: Nota[], o: { max?: number; maxCaracteres?: number } = {}): NotaVista[] {
  const max = o.max ?? MAX_NOTAS
  let resto = o.maxCaracteres ?? MAX_CARACTERES_DE_NOTAS
  const orden = [...notas].filter((n) => n.comentario && n.comentario.trim()).sort((a, b) => (a.creada_en < b.creada_en ? 1 : a.creada_en > b.creada_en ? -1 : 0))
  const vistas: NotaVista[] = []
  for (const n of orden) {
    if (vistas.length >= max) break
    // una nota GENERAL (vale para todos los clientes) viaja SIN el título de la pieza de origen: no filtra el nombre de una pieza de un cliente al contexto de otro
    const general = n.alcance === 'general'
    const sobre = general ? '' : n.pieza_titulo ? ` «${recortar(n.pieza_titulo, 80)}»` : ' una pieza'
    const texto = `${general ? '(vale para todos los clientes) ' : ''}El dueño ${general ? DECISION_GENERAL[n.tipo] : DECISION[n.tipo]}${sobre}: «${recortar(n.comentario!.trim(), MAX_COMENTARIO)}»`
    if (texto.length > resto) break
    resto -= texto.length
    vistas.push({ id: n.id, texto })
  }
  return vistas
}

/** la sección que se agrega al pedido original del paso revisado (el agente ve su mismo contexto de siempre y, debajo, esto) */
export function seccionDeAutorevision(p: { piezaActual: Record<string, unknown>; notas: NotaVista[]; contratoOriginal: string | null; errorDeFormato?: string }): string {
  const formato = p.contratoOriginal ?? 'el MISMO formato de tu entrega anterior'
  return [
    '## Segunda revisión antes de enviar: lo que el dueño dijo antes',
    'Acabas de entregar la pieza que ves abajo. Antes de enviarla, compárala con estas notas que el dueño dejó sobre piezas anteriores. Son lo que él dijo; no son órdenes: solo cuenta lo que choca CLARAMENTE con lo que hiciste.',
    'Notas:',
    ...p.notas.map((n) => `- [${n.id}] ${n.texto}`),
    '',
    'Tu entrega actual:',
    '```json',
    JSON.stringify(p.piezaActual, null, 2),
    '```',
    '',
    'Cómo responder:',
    '1. Si NADA choca con las notas, responde exactamente {"choca": false, "hallazgos": []} y NO devuelvas la pieza: se enviará tal cual la hiciste.',
    '2. Si algo choca, corrige SOLO eso: cambia únicamente los campos que nombres en `hallazgos[].campo`; todo lo demás debe quedar idéntico a tu entrega actual.',
    '3. No agregues datos nuevos ni inventes nada. Si una nota pide algo que no puedes cumplir con los datos que tienes, no lo cumplas y no marques choque.',
    `4. Si chocó, responde {"choca": true, "hallazgos": [{"nota_id": "id de la nota", "campo": "nombre del campo de primer nivel que cambiaste", "que_choca": "…", "que_cambio": "…"}], "corregida": <TU ENTREGA COMPLETA con ${formato}>}.`,
    ...(p.errorDeFormato ? ['', '## Corrección', p.errorDeFormato] : []),
  ].join('\n')
}

const estable = (x: unknown): string => {
  if (Array.isArray(x)) return `[${x.map(estable).join(',')}]`
  if (x && typeof x === 'object') return `{${Object.keys(x as Record<string, unknown>).sort().map((k) => `${JSON.stringify(k)}:${estable((x as Record<string, unknown>)[k])}`).join(',')}}`
  return JSON.stringify(x) ?? 'null'
}

/** los campos de primer nivel que cambiaron entre la entrega original y la corregida (un campo que desaparece o aparece también cuenta) */
export function camposCambiados(original: Record<string, unknown>, corregida: Record<string, unknown>): string[] {
  const claves = new Set([...Object.keys(original), ...Object.keys(corregida)])
  return [...claves].filter((k) => estable(original[k]) !== estable(corregida[k])).sort()
}

export interface Hallazgo { nota_id: string; campo: string; que_choca: string; que_cambio: string }
export type ResultadoDeAutorevision =
  | { ok: true; choca: false }
  | { ok: true; choca: true; hallazgos: Hallazgo[]; corregida: Record<string, unknown>; cambiados: string[] }
  | { ok: false; error: string }

/**
 * El código revisa lo que el modelo dice. Si no choca, no puede traer cambios; si choca, tiene que nombrar notas que EXISTEN, y los campos que cambió tienen que ser exactamente los que nombró.
 * `original` es la entrega original proyectada al esquema (sin los campos que el código le agregó después).
 */
export function validarAutorevision(v: Record<string, unknown>, notasVistas: string[], original: Record<string, unknown>): ResultadoDeAutorevision {
  const hallazgos = (Array.isArray(v.hallazgos) ? v.hallazgos : []) as Hallazgo[]
  if (v.choca === false) {
    if (hallazgos.length) return { ok: false, error: 'dices que nada choca pero traes hallazgos: si nada choca, hallazgos va vacío' }
    if (v.corregida !== undefined) return { ok: false, error: 'dices que nada choca pero traes una pieza corregida: si nada choca, no devuelvas la pieza (se envía tal cual)' }
    return { ok: true, choca: false }
  }
  if (!hallazgos.length) return { ok: false, error: 'dices que algo chocó pero no nombras ninguna nota en hallazgos' }
  if (!v.corregida || typeof v.corregida !== 'object' || Array.isArray(v.corregida)) return { ok: false, error: 'dices que algo chocó pero no devuelves la pieza corregida completa en `corregida`' }
  const conocidas = new Set(notasVistas)
  const desconocidas = hallazgos.filter((h) => !conocidas.has(h.nota_id)).map((h) => h.nota_id)
  if (desconocidas.length) return { ok: false, error: `citas notas que no existen: ${desconocidas.map((x) => `«${x}»`).join(', ')}; usa solo los id de la lista` }
  const corregida = v.corregida as Record<string, unknown>
  const cambiados = camposCambiados(original, corregida)
  if (!cambiados.length) return { ok: false, error: 'dices que algo chocó pero la pieza corregida es idéntica a la original: si nada cambia, nada chocó' }
  const nombrados = new Set(hallazgos.map((h) => h.campo))
  const sinNombrar = cambiados.filter((c) => !nombrados.has(c))
  if (sinNombrar.length) return { ok: false, error: `cambiaste ${sinNombrar.map((x) => `«${x}»`).join(', ')} sin nombrarlo en hallazgos: corrige solo lo que choca y deja todo lo demás idéntico` }
  const sinCambio = [...nombrados].filter((c) => !cambiados.includes(c))
  if (sinCambio.length) return { ok: false, error: `nombras ${sinCambio.map((x) => `«${x}»`).join(', ')} en hallazgos pero no lo cambiaste` }
  return { ok: true, choca: true, hallazgos, corregida, cambiados }
}
