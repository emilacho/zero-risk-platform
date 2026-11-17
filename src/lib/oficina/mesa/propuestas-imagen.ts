/**
 * 17-nov · propuestas también en IMAGEN · tramo 1 (CC1 · contrato `CONTRATO-CC5-a-CC1-CC6-CC7-propuestas-en-imagen.md` v1 §1a · decisiones de Lenovo: N=3, 2 vueltas,
 * borrador sin «observar» ni jefatura, la mesa decide si una foto propia basta).
 * La integración de la mesa de imagen (kit · carrusel · foto) con N propuestas → el artefacto `propuestas_imagen`. El corte por propuesta es EL MISMO del video
 * (`partirEnPropuestas` · nada se pierde sin aviso) y cada propuesta se traduce con el traductor de SU clase (`traducirPieza`), sin otra copia.
 * Puro: sin base, sin red, sin modelo. Nada se inventa: lo que la mesa no escribió va ausente.
 */
import { avisosDeCuantasQuedan, cabecera, nombreDeLaPropuesta, partirEnPropuestas } from '../video/propuestas'
import { traducirPieza, type ImagenPedida, type OpcionesDeTraduccion, type Traduccion } from './traductor'

export const ARTEFACTO_PROPUESTAS_IMAGEN = 'propuestas_imagen'
/** la clase de la pieza tal como la lee la tarjeta (contrato §1a/§2): la foto con mesa corta (`post_mesa`) hereda `post_img` */
export type ClaseDeImagen = 'kit' | 'carrusel' | 'post_img'
export const CLASE_DE_IMAGEN: Record<'kit' | 'carrusel' | 'post', ClaseDeImagen> = { kit: 'kit', carrusel: 'carrusel', post: 'post_img' }

export interface LaminaDeLaPropuesta {
  n: number
  /** el `rol` de la lámina (carrusel), la ref del elemento del kit, o `pieza` (foto) */
  rol: string
  eyebrow?: string
  headline?: string
  body?: string
  cta?: string
  /** la dirección visual de esa lámina (lo que la mesa dijo que se ve) */
  se_ve?: string
  /** `ImagenDeRef` sin url: la url sale del borrador */
  foto?: { origen: 'real' | 'generada'; foto_id?: string }
}
export interface PropuestaDeImagen {
  id: string
  nombre: string
  concepto?: string
  objetivo?: string
  por_que?: string
  red?: string
  copy?: { texto_base?: string; pie_de_foto?: string; hashtags?: string[]; llamado?: string }
  laminas: LaminaDeLaPropuesta[]
  /** el texto de ESTA propuesta tal cual (título + cuerpo): al aprobar, es la pieza que se traduce y se fabrica en final (campo del motor; la tarjeta no lo lee) */
  texto: string
}
export interface PropuestasDeImagen { ronda: number; clase: ClaseDeImagen; avisos: string[]; propuestas: PropuestaDeImagen[]; citas: string }

const sinVacios = <T extends Record<string, unknown>>(o: T): T => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== '' && !(Array.isArray(v) && !v.length))) as T
const fotoDe = (img: ImagenPedida | undefined): LaminaDeLaPropuesta['foto'] =>
  !img || img.modo === 'ninguna' ? undefined : img.modo === 'real' ? { origen: 'real', foto_id: img.foto_id } : { origen: 'generada' }
const seVeDe = (img: ImagenPedida | undefined): string | undefined =>
  !img || img.modo === 'ninguna' ? undefined : (img.concepto?.que_se_ve || (img.modo === 'generada' ? img.descripcion : '') || undefined)

/**
 * la cabecera de la PROPUESTA («Concepto: … · Objetivo: … · Por qué: …», antes de su primera lámina) es de la propuesta, no de la pieza: se aparta SOLO si cada línea son
 * únicamente esos campos (los que lee `cabecera`); si trae cualquier otra cosa se deja, y el traductor de la clase avisa lo que no pudo dibujar (nada se pierde en silencio)
 */
const CAMPO_DE_CABECERA = /^\*{0,2}(concepto|idea|duraci[oó]n|dura|red|plataforma|objetivo|por qu[eé]|porque|raz[oó]n)\*{0,2}\s*:/i
export function sinCabeceraDeLaPropuesta(lineas: string[]): string[] {
  const i = lineas.findIndex((l) => /^\s{0,3}#/.test(l))
  const antes = i < 0 ? [] : lineas.slice(0, i)
  const soloCabecera = antes.every((l) => !l.trim() || l.replace(/^\s*[-*•]\s+/, '').split(/\s+·\s+/).every((trozo) => CAMPO_DE_CABECERA.test(trozo.trim())))
  return soloCabecera ? lineas.slice(Math.max(i, 0)) : lineas
}

/** las láminas de UNA propuesta, desde la traducción de su clase (ninguna se inventa; las imágenes se enlazan por su ref) */
export function laminasDeLaTraduccion(tipo: 'kit' | 'carrusel' | 'post', tr: Traduccion): LaminaDeLaPropuesta[] {
  const img = (ref: string) => tr.imagenes.find((i) => i.ref === ref)
  if (tipo === 'carrusel') return (tr.laminas ?? []).map((l, i) => sinVacios({ n: i + 1, rol: l.rol, eyebrow: l.eyebrow, headline: l.headline, body: l.body, cta: l.cta, se_ve: seVeDe(img(l.rol)), foto: fotoDe(img(l.rol)) }))
  if (tipo === 'kit') return (tr.estructura ?? []).map((e, i) => {
    const c = (tr.copy_kit ?? []).find((x) => x.ref === e.ref)
    return sinVacios({ n: i + 1, rol: e.ref, eyebrow: c?.eyebrow, headline: c?.headline, body: c?.body, cta: c?.cta, se_ve: seVeDe(img(e.ref)), foto: fotoDe(img(e.ref)) })
  })
  const t = tr.pieza_post?.texto_en_imagen ?? {}
  return [sinVacios({ n: 1, rol: 'pieza', eyebrow: t.etiqueta, headline: t.titular, body: t.bajada, cta: t.boton, se_ve: seVeDe(img('pieza')), foto: fotoDe(img('pieza')) })]
}

const copyDe = (tipo: 'kit' | 'carrusel' | 'post', tr: Traduccion): PropuestaDeImagen['copy'] => {
  const c = tipo === 'carrusel' ? { texto_base: tr.copy_carrusel?.texto_base, pie_de_foto: tr.copy_carrusel?.pie_de_foto ?? tr.pie_de_foto, hashtags: tr.copy_carrusel?.hashtags ?? tr.hashtags, llamado: tr.copy_carrusel?.llamado }
    : tipo === 'post' ? { pie_de_foto: tr.pieza_post?.pie_de_foto ?? tr.pie_de_foto, hashtags: tr.pieza_post?.hashtags ?? tr.hashtags, llamado: tr.pieza_post?.llamado }
    : { pie_de_foto: tr.pie_de_foto, hashtags: tr.hashtags }
  const limpio = sinVacios(c)
  return Object.keys(limpio).length ? limpio : undefined
}

/**
 * La integración → las propuestas de imagen. `objetivo` = cuántas pidió la plantilla. Cada bloque se traduce con el traductor de su clase; uno que no se pueda traducir
 * se descarta CON su motivo y su título; uno sin láminas también (avisado). Si ninguna queda, `ok: false`. Los avisos de cada traducción viajan con el id de su propuesta.
 */
export function traducirPropuestasDeImagen(md: string, tipo: 'kit' | 'carrusel' | 'post', o: { objetivo: number; ronda?: number; traduccion?: OpcionesDeTraduccion }):
  { ok: true; resultado: PropuestasDeImagen } | { ok: false; motivo: string; avisos: string[] } {
  const { bloques, citas, avisos } = partirEnPropuestas(md, o.objetivo)
  const propuestas: PropuestaDeImagen[] = []
  const descartadas: string[] = []
  for (const b of bloques) {
    const cuerpo = sinCabeceraDeLaPropuesta(b.lineas).join('\n')
    const tr = traducirPieza(cuerpo, tipo, { ...(o.traduccion ?? {}), maxPreguntas: 0 })
    const laminas = tr.ok ? laminasDeLaTraduccion(tipo, tr) : []
    if (!tr.ok || !laminas.length) { avisos.push(`«${b.titulo}» se descartó: ${tr.ok ? 'no trae láminas que se puedan leer' : tr.motivo ?? 'no se pudo traducir'}`); descartadas.push(b.titulo); continue }
    const id = `P${propuestas.length + 1}`
    const c = cabecera(b.lineas)
    avisos.push(...tr.avisos.map((a) => `${id}: ${a}`))
    propuestas.push(sinVacios({
      id, nombre: nombreDeLaPropuesta(b.titulo, id), concepto: c.concepto || undefined, objetivo: c.objetivo || tr.objetivo || undefined, por_que: c.por_que || undefined, red: c.red || undefined,
      copy: copyDe(tipo, tr), laminas, texto: [`# ${b.titulo}`, ...b.lineas].join('\n').trim(),
    }) as PropuestaDeImagen)
  }
  if (!propuestas.length) return { ok: false, motivo: 'ninguna propuesta trae láminas que se puedan leer', avisos }
  avisos.push(...avisosDeCuantasQuedan(o.objetivo, bloques.length, propuestas.length, descartadas, 'por sus láminas'))
  return { ok: true, resultado: { ronda: o.ronda ?? 1, clase: CLASE_DE_IMAGEN[tipo], avisos, propuestas, citas } }
}

