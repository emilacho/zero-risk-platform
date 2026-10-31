/**
 * EL DIRECTORIO VIVO · quién está en la mesa y qué especialidades son pertinentes para cada tipo de pieza. Es DATO (`oficina_directorio`), no código:
 * agregar un agente = insertar una fila; quitarlo = `activo=false`. Puro: sin base ni red.
 */
import { esDeLaCadena, type Tarjeta, type TipoDePieza } from './tipos'

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
const PERSONAS = /\b(personas?|gente|rostros?|caras?|clientes?|comensales?|familias?|ni[ñn]os?|ni[ñn]as?|mujeres?|hombres?|equipo|chef|cocineros?|meseros?|mozos?|amigos?|parejas?|grupo|sonri\w+|manos|retratos?|people|persons?|faces?|customers?|family|kids?|children|women|men|friends|couples?|staff|waiters?)\b/i

/** T6 · las condiciones que la mesa calcula SOLA al abrir una pieza de calendario (carrusel o kit) a partir de su brief; las de la cadena las declara la cadena */
export function condicionesDeLaPieza(briefTexto: string): string[] {
  return PERSONAS.test(briefTexto ?? '') ? ['si_personas'] : []
}
