/**
 * EL INGENIERO DE PROMPTS · Sprint 1 · mejora 4 (GO Lenovo 16-nov, firma de Emilio 19:46). Puro: sin base, sin red, sin modelo.
 *
 * Después de que la dirección creativa INTEGRA la pieza (el concepto de cada lámina ya está decidido), un turno más de la mesa traduce el concepto de cada imagen
 * que se va a generar a la instrucción EXACTA que recibe el modelo de imagen: en inglés, con escena, lugar, composición, luz, lente y estilo de la marca, sin texto
 * dentro de la imagen (el texto, el logo y los colores los pone después la composición de marca).
 *
 * Quién es el ingeniero lo dice el DATO (`oficina_directorio`): la tarjeta que marca `<tipo>:redacta_prompts`. Sin esa tarjeta la mesa trabaja como antes y el
 * modelo recibe la descripción del director. Sin rejas: lo que el ingeniero no deje para una imagen se cubre con la descripción del director y queda un aviso.
 */
import type { Aporte } from './tipos'

/** la marca del directorio que convierte a una tarjeta en el ingeniero de prompts de un tipo de pieza (`carrusel:redacta_prompts`) */
export const CONDICION_PROMPTS = 'redacta_prompts'

export interface ImagenARedactar { ref: string; descripcion: string }
export interface PromptLeido { prompt: string; foto_de_referencia?: string }
export interface PromptsDeLaPieza { por_ref: Record<string, PromptLeido>; avisos: string[] }

/** el aporte del ingeniero que vale: el último suyo (tipo `aporta`) escrito DESPUÉS de la última integración; lo anterior a esa integración ya no describe la pieza */
export function aporteDePrompts(libro: Aporte[], ingeniero: string | null | undefined): Aporte | null {
  if (!ingeniero) return null
  const ult = [...libro].reverse().find((a) => a.tipo === 'integra')
  if (!ult) return null
  return [...libro].reverse().find((a) => a.tipo === 'aporta' && a.de === ingeniero && a.n > ult.n) ?? null
}

/** ¿este aporte es el texto del ingeniero sobre la pieza integrada? (no cuenta como «aporte nuevo» que obligue a la dirección a integrar otra vez) */
export const esAporteDePrompts = (a: Aporte, ingeniero: string | null | undefined, ultimaIntegracion: Aporte | null): boolean =>
  !!ingeniero && a.tipo === 'aporta' && a.de === ingeniero && !!ultimaIntegracion && a.n > ultimaIntegracion.n

/** la convención que lee `leerPromptsDelIngeniero` (ligera: un encabezado por imagen y dos líneas) */
export const CONVENCION_DE_PROMPTS = [
  'Entrega con esta convención (una sección por imagen de la lista; nada más):',
  '```',
  '## <ref de la imagen>',
  'Prompt: <la instrucción completa para el modelo de imagen, en inglés>',
  'Referencia: foto:<id de una foto propia que muestre el producto o el lugar> | ninguna',
  '```',
].join('\n')

/** el turno del ingeniero: qué se le pide y sobre qué imágenes (puro: lo arma `armarTarea`) */
export function tareaDelIngeniero(imagenes: ImagenARedactar[]): string {
  const lista = imagenes.length
    ? imagenes.map((i) => `- **${i.ref}** · lo que pidió la dirección: ${i.descripcion}`).join('\n')
    : '- (la integración no dejó imágenes a generar legibles: revisa la última integración del tablero y escribe una sección por cada «generar:»)'
  return [
    '## Tu turno · INGENIERO DE PROMPTS: la instrucción exacta para el modelo de imagen',
    'La dirección creativa ya integró la pieza (la última integración del tablero). El concepto de cada lámina está decidido: tú NO lo cambias. Tu trabajo es traducirlo, imagen por imagen, a la instrucción EXACTA que recibirá el modelo de imagen. Lo que escribas en «Prompt:» es literalmente lo que se le envía.',
    '',
    '### Imágenes a generar',
    lista,
    '',
    '### Cómo se escribe cada prompt',
    '- En **inglés**, prosa natural y concreta (de 60 a 150 palabras), nunca una lista de palabras sueltas.',
    '- La **escena** al servicio del objetivo de la pieza (míralo en el brief): sujeto y acción, y el **lugar** concreto donde ocurre según el brief, el manual y la ciudad o el país del cliente.',
    '- **Composición y encuadre** (plano, ángulo, qué ocupa el centro y dónde queda aire), **luz** (fuente, dirección, hora), **lente/cámara** (focal, profundidad de campo) y **textura/realismo**.',
    '- El **estilo de la marca**: la paleta, el ambiente y el tipo de imagen que fija el manual de marca de este cliente (léelo arriba; no impongas un estilo propio).',
    '- **Sin texto dentro de la imagen**: ni letras, ni números, ni logos, ni carteles legibles, ni marcas. El texto, el logo y los colores de la marca se componen DESPUÉS sobre la imagen. Escríbelo en el prompt (p. ej. «no text, no letters, no logos, no signage»). Deja aire limpio donde irá el texto si la lámina lo lleva.',
    '- El **producto del cliente** se muestra como es: si una foto propia lo muestra (lista de fotos arriba), nómbrala en «Referencia:» y describe el producto tal como se ve en ella; no lo inventes ni lo «mejores».',
    '- **No inventes** datos, sellos, precios, marcas ajenas ni personas reales; si la escena lleva personas, que se vean reales y del país del cliente.',
    '- Sin relación de aspecto ni parámetros del modelo: el tamaño lo fija la oficina.',
    '',
    CONVENCION_DE_PROMPTS,
    'Tu respuesta ES esas secciones: no escribas antes ni después lo que vas a hacer ni lo que leíste.',
  ].join('\n')
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[*_`#]/g, '').replace(/\s+/g, ' ').trim()
const LINEA_PROMPT = /^\s*[-*]?\s*(?:\*\*)?\s*(?:prompt|instrucci[oó]n|instruction)\s*(?:\*\*)?\s*[:：]\s*(?:\*\*)?\s*/i
const LINEA_REFERENCIA = /^\s*[-*]?\s*(?:\*\*)?\s*(?:referencia|reference|foto de referencia)\s*(?:\*\*)?\s*[:：]\s*(?:\*\*)?\s*(.*)$/i
const ID_DE_FOTO = /foto\s*:\s*([A-Za-z0-9][\w-]*)/i

/** una sección del ingeniero → su prompt (todo lo que va después de «Prompt:», aunque siga en varias líneas, hasta «Referencia:») y su foto de referencia */
function leerSeccion(cuerpo: string): PromptLeido | null {
  const lineas = cuerpo.split('\n')
  const iP = lineas.findIndex((l) => LINEA_PROMPT.test(l))
  const iR = lineas.findIndex((l) => LINEA_REFERENCIA.test(l))
  let partes: string[]
  if (iP >= 0) {
    const fin = iR > iP ? iR : lineas.length
    partes = [lineas[iP].replace(LINEA_PROMPT, ''), ...lineas.slice(iP + 1, fin)]
  } else partes = lineas.filter((_, k) => k !== iR)
  const prompt = partes.map((l) => l.replace(/\*\*/g, '').trim()).filter(Boolean).join(' ').replace(/^["“]|["”]$/g, '').trim()
  if (!prompt) return null
  const ref = iR >= 0 ? ID_DE_FOTO.exec(LINEA_REFERENCIA.exec(lineas[iR])?.[1] ?? '')?.[1] : undefined
  return { prompt, ...(ref ? { foto_de_referencia: ref } : {}) }
}

/**
 * lee el texto del ingeniero (convención tolerante): una sección `## <ref>` por imagen. Un encabezado vale si CONTIENE el ref («## Lámina 1 · hook» vale para `hook`).
 * Con UNA sola imagen a generar y sin encabezados, el texto entero es su prompt. Nunca rechaza: lo que no se lee queda como aviso y esa imagen usa la descripción del director.
 */
export function leerPromptsDelIngeniero(texto: string, refs: string[]): PromptsDeLaPieza {
  const por_ref: Record<string, PromptLeido> = {}
  const avisos: string[] = []
  const t = String(texto ?? '').trim()
  if (!t || !refs.length) return { por_ref, avisos }
  const secciones = t.split(/^(?=#{1,4}\s)/m).map((s) => {
    const [cab, ...resto] = s.split('\n')
    return /^#{1,4}\s/.test(cab) ? { cab: norm(cab.replace(/^#{1,4}\s*/, '')), cuerpo: resto.join('\n') } : { cab: '', cuerpo: s }
  })
  const conCab = secciones.filter((s) => s.cab)
  for (const ref of refs) {
    const r = norm(ref)
    const exacta = conCab.find((s) => s.cab === r)
    const contiene = exacta ?? conCab.find((s) => new RegExp(`(^|[^a-z0-9-])${r.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}($|[^a-z0-9-])`).test(s.cab))
    const leido = contiene ? leerSeccion(contiene.cuerpo) : null
    if (leido) por_ref[ref] = leido
  }
  if (refs.length === 1 && !por_ref[refs[0]] && !conCab.length) {
    const leido = leerSeccion(t)
    if (leido) por_ref[refs[0]] = leido
  }
  return { por_ref, avisos }
}

/**
 * lo que recibe el brazo de imagen: el prompt del ingeniero para cada imagen y, si no dejó uno, la descripción del director (con un aviso para el equipo).
 * Sin ingeniero en la mesa (`texto` null) no hay aviso: es el comportamiento de siempre.
 */
export function promptsParaElBrazo(generadas: ImagenARedactar[], texto: string | null): PromptsDeLaPieza & { del_ingeniero: string[] } {
  const leidos = texto == null ? { por_ref: {}, avisos: [] } : leerPromptsDelIngeniero(texto, generadas.map((g) => g.ref))
  const por_ref: Record<string, PromptLeido> = {}
  const avisos = [...leidos.avisos]
  const del_ingeniero: string[] = []
  for (const g of generadas) {
    const p = leidos.por_ref[g.ref]
    if (p) { por_ref[g.ref] = p; del_ingeniero.push(g.ref) }
    else {
      por_ref[g.ref] = { prompt: g.descripcion }
      if (texto != null) avisos.push(`el ingeniero de prompts no dejó una instrucción legible para «${g.ref}»: el modelo recibe la descripción de la dirección`)
    }
  }
  return { por_ref, avisos, del_ingeniero }
}
