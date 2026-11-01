/**
 * EL DIRECTORIO VIVO · quién está en la mesa y qué especialidades son pertinentes para cada tipo de pieza. Es DATO (`oficina_directorio`), no código:
 * agregar un agente = insertar una fila; quitarlo = `activo=false`. Puro: sin base ni red.
 */
import { esDeLaCadena, type ClaveDeEquipo, type Tarjeta, type TipoDePieza } from './tipos'

const CONDICION_IMAGEN = 'si_imagen_generada'
/** una tarjeta de dirección que en ESTE tipo de pieza es miembro (no dirige): `concepto:miembro` */
const CONDICION_MIEMBRO = 'miembro'
const CONDICION_DIRIGE = 'dirige'

/** ¿esta tarjeta es de aporte obligatorio en este tipo de pieza? `carrusel` siempre · `carrusel:si_imagen_generada` solo si alguna imagen se genera */
export function esPertinente(t: Tarjeta, tipo: TipoDePieza, hayImagenGenerada: boolean, condiciones: readonly string[] = []): boolean {
  if (!t.activo) return false
  return t.pertinente_en.some((p) => {
    const [tp, cond] = p.split(':')
    if (tp !== tipo) return false
    if (!cond) return true
    if (cond === CONDICION_MIEMBRO) return true
    if (cond === CONDICION_DIRIGE) return false
    if (cond === CONDICION_IMAGEN) return hayImagenGenerada
    return condiciones.includes(cond)
  })
}

/** los especialistas cuyo aporte es obligatorio (sin la dirección y sin el portero: ellos no «aportan», dirigen o traen material) */
export function especialistasPertinentes(directorio: Tarjeta[], tipo: TipoDePieza, hayImagenGenerada: boolean, condiciones: readonly string[] = []): string[] {
  // una tarjeta de DIRECCIÓN entra como miembro solo si lo dice con `<tipo>:miembro` (el director creativo es miembro del calendario y dirige carruseles y kits)
  return directorio.filter((t) => (t.rol === 'miembro' || (t.rol === 'direccion' && marcaMiembro(t, tipo))) && esPertinente(t, tipo, hayImagenGenerada, condiciones)).map((t) => t.agente)
}
const marcaMiembro = (t: Tarjeta, tipo: TipoDePieza): boolean => t.pertinente_en.includes(`${tipo}:${CONDICION_MIEMBRO}`)

/**
 * 31-oct · quién DIRIGE este tipo de pieza (R5 del diseño de la mesa de creativos). En una tarjeta de dirección, `pertinente_en` lista los tipos que dirige (`calendario`); las marcas `<tipo>:miembro` no cuentan.
 * Una dirección sin ningún tipo propio (la de siempre: el director creativo) dirige lo que nadie reclama, pero NUNCA el calendario: ese solo lo dirige quien lo dice. Sin tipo, se conserva el comportamiento de antes.
 */
export function direccionDe(directorio: Tarjeta[], tipo?: TipoDePieza): Tarjeta | null {
  const dirs = directorio.filter((t) => t.rol === 'direccion' && t.activo)
  if (!tipo) return dirs[0] ?? null
  const propios = (t: Tarjeta) => t.pertinente_en.filter((p) => !p.includes(':'))
  const dirige = (t: Tarjeta) => t.pertinente_en.includes(`${tipo}:dirige`)
  const explicita = dirs.find((t) => propios(t).includes(tipo) || dirige(t))
  if (explicita) return explicita
  // las mesas de la cadena (brief, concepto) solo las dirige quien lo dice; las de piezas conservan el respaldo de siempre
  if (esDeLaCadena(tipo)) return null
  return dirs.find((t) => propios(t).length === 0 && !t.pertinente_en.some((p) => p.endsWith(':dirige'))) ?? null
}
export const porteroDe = (directorio: Tarjeta[]): Tarjeta | null => directorio.find((t) => t.rol === 'portero' && t.activo) ?? null

/**
 * 01-nov · el directorio AGRUPADO por equipo del departamento (MAPA «ESTRUCTURA FINAL: 6 EQUIPOS»). Es una lectura, no cambia quién se sienta en qué mesa.
 * Las tarjetas sin equipo (el portero: proveedor fuera del departamento) o leídas sin la columna van bajo `null`. Puro: sin base ni red.
 */
export function porEquipo(directorio: Tarjeta[]): Map<ClaveDeEquipo | null, Tarjeta[]> {
  const out = new Map<ClaveDeEquipo | null, Tarjeta[]>()
  for (const t of directorio) {
    const k = t.equipo ?? null
    out.set(k, [...(out.get(k) ?? []), t])
  }
  return out
}

/** el directorio que TODOS reciben en cada turno (en español, escrito para compañeros); `yo` se marca para que cada uno sepa quién es */
export function seccionDelDirectorio(directorio: Tarjeta[], yo: string): string {
  const linea = (t: Tarjeta): string => {
    const partes = [
      `**${t.agente}**${t.agente === yo ? ' (tú)' : ''} — ${t.especialidad}`,
      t.sabe_hacer.length ? `  Sabe hacer: ${t.sabe_hacer.join('; ')}.` : '',
      t.necesita.length ? `  Necesita para trabajar: ${t.necesita.join('; ')}.` : '',
      t.entrega.length ? `  Entrega: ${t.entrega.join('; ')}.` : '',
    ].filter(Boolean)
    return partes.join('\n')
  }
  const activos = directorio.filter((t) => t.activo)
  return ['## El equipo (directorio vivo)', ...activos.map(linea)].join('\n\n')
}

/** palabras que dicen que la pieza muestra personas (rostros, cuerpos, manos): es lo que enciende `si_personas` · deliberadamente literal y corto; una pieza sin estas palabras no llama al especialista de inclusión */
const PERSONAS = /\b(personas?|gente|rostros?|caras?|comensales?|familias?|ni[ñn]os?|ni[ñn]as?|mujeres?|hombres?|chef|cocineros?|meseros?|mozos?|amigos?|parejas?|sonri\w+|retratos?|people|persons?|faces?|famil(?:y|ies)|kids?|children|women|men|friends|couples?|waiters?)\b/i

/** una frase que niega o prohíbe («No aparecen personas», «sin gente», «VISUAL PROHIBIDO») no cuenta: un brief que EXCLUYE personas no convoca al especialista de inclusión */
const NIEGA = /\b(no|sin|ni|nunca|nadie|ning[uú]n[ao]?|evit\w+|excluy\w+|descart\w+|nada de|without|never|avoid\w*)\b|prohib/i
/** y una negación que viene DESPUÉS de la palabra («humor fuera», «bromas excluidas») */
const NIEGA_DESPUES = /\b(fuera|excluid\w+|descartad\w+|prohibid\w+|out)\b/i

/** palabras de tono lúdico (humor, juego, sorpresa, encanto) que piden a Whimsy en una pieza · el manual, el brief o el plan "lo ameritan" cuando las afirman (no cuando las niegan) */
const LUDICO = /\b(l[úu]dic\w*|humor\w*|juegos? de palabras|jugue\w*|divert\w*|sorpres\w*|travesur\w*|ingenio\w*|ocurrente\w*|encanto|playful|whimsical?|witty|fun|humou?r\w*|delight\w*|surpris\w*)\b/i

/** ¿el texto AFIRMA una palabra de la lista? La negación cuenta solo si está PEGADA (las 4 palabras de antes, misma frase); lo que cuelga de un encabezado «… PROHIBIDO:» no cuenta */
function afirma(texto: string, palabras: RegExp): boolean {
  const sinProhibido = String(texto ?? '').replace(/prohib[^\n]*\n(?:[ \t]+-[^\n]*\n?)*/gi, '')
  const frases = sinProhibido.split(/[.\n;:]+/)
  const hay = (f: string): boolean => {
    for (const m of f.matchAll(new RegExp(palabras.source, 'gi'))) {
      const antes = f.slice(0, m.index).trim().split(/\s+/).slice(-4).join(' ')
      const despues = f.slice((m.index ?? 0) + m[0].length).trim().split(/\s+/).slice(0, 2).join(' ')
      if (!NIEGA.test(antes) && !NIEGA_DESPUES.test(despues)) return true
    }
    return false
  }
  return frases.some(hay)
}

/** T6 · las condiciones que la mesa calcula SOLA al abrir una pieza de calendario (carrusel o kit); las de la cadena las declara la cadena · `si_personas`: el BRIEF muestra personas · `si_whimsy`: el brief, el manual o el plan piden tono lúdico */
export function condicionesDeLaPieza(briefTexto: string, ...contexto: Array<string | null | undefined>): string[] {
  const out: string[] = []
  if (afirma(briefTexto, PERSONAS)) out.push('si_personas')
  if ([briefTexto, ...contexto].some((t) => afirma(String(t ?? ''), LUDICO))) out.push('si_whimsy')
  return out
}
