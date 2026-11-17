/**
 * SPRINT 3 · T2 · LA FICHA DE PERSONAJE (17-nov · GO Lenovo · firma de Emilio 11:54 · «nada obligatorio» 11:58).
 * Un personaje que sale en varios planos tiene que verse IGUAL en todos. La ficha son las imágenes que lo muestran y viajan como referencia en cada
 * clip donde sale (Seedance 2.5 `reference-to-video`: hasta 30 imágenes por clip; cuesta lo mismo que imagen a video — cotización gratis del 17-nov).
 *  · Herramienta, no regla: si la mesa no escribe «## Personajes», nada cambia (cada plano sigue por imagen a video desde su primer cuadro).
 *  · De dónde salen las imágenes, en orden: (1) las fotos propias del cliente que la mesa le nombra (una persona real solo con su permiso registrado: eso
 *    lo cuida la mesa y la regla del pedido); (2) si no hay, la imagen clave del PRIMER plano donde sale (ya generada y vista por el dueño en el borrador):
 *    sirve de ficha para los planos siguientes. Sin ninguna de las dos, el personaje viaja solo con su descripción.
 *  · El primer cuadro del plano (su imagen clave o su foto) va SIEMPRE primero: el clip arranca de él.
 * Puro: sin red, sin base, sin modelo. Agnóstico: no sabe de rubros ni de clientes.
 */
import type { PersonajeDeLaHoja, Plano } from './guion'

/** lo que admite `reference-to-video` (doc Higgsfield, leída el 17-nov): 30 imágenes por clip */
export const MAX_IMAGENES_POR_CLIP = 30
/** cuántas imágenes de ficha por personaje (frente, perfil, cuerpo, vestuario): más no mejora y quita lugar a los demás */
export const MAX_IMAGENES_POR_PERSONAJE = 4

export type OrigenDeLaFicha = 'fotos_propias' | 'primera_aparicion' | 'solo_descripcion'

export interface FichaDePersonaje {
  id: string
  nombre: string
  descripcion?: string
  /** direcciones https de sus imágenes de referencia */
  imagenes: string[]
  origen: OrigenDeLaFicha
  /** con `primera_aparicion`: el plano cuya imagen clave es la ficha (ese plano no la lleva como referencia: ya es su primer cuadro) */
  plano_de_origen?: number
  /** fotos que la mesa le nombró y no existen entre las propias (se declaran, no se inventan) */
  fotos_no_halladas: string[]
}

const esHttps = (u: unknown): u is string => typeof u === 'string' && /^https:\/\/\S+$/.test(u)

/** las fichas de la pieza · `buscarFoto` = el mismo buscador de fotos propias del pedido · `imagenesClave` = las vigentes (borrador o final) */
export function fichasDeLaPieza(o: {
  personajes: PersonajeDeLaHoja[] | undefined
  planos: Array<Pick<Plano, 'n' | 'personajes'>>
  buscarFoto: (id: string) => string | null
  imagenesClave?: Array<{ n: number; url: string }>
  max?: number
}): FichaDePersonaje[] {
  const max = Math.max(1, o.max ?? MAX_IMAGENES_POR_PERSONAJE)
  const planos = [...o.planos].sort((a, b) => a.n - b.n)
  return (o.personajes ?? []).map((p) => {
    const imagenes: string[] = []
    const fotos_no_halladas: string[] = []
    for (const id of p.fotos_ids) {
      const url = o.buscarFoto(id)
      if (esHttps(url)) { if (!imagenes.includes(url) && imagenes.length < max) imagenes.push(url) } else fotos_no_halladas.push(id)
    }
    const base = { id: p.id, nombre: p.nombre, ...(p.descripcion ? { descripcion: p.descripcion } : {}), fotos_no_halladas }
    if (imagenes.length) return { ...base, imagenes, origen: 'fotos_propias' as const }
    const primero = planos.find((x) => (x.personajes ?? []).includes(p.id))
    const ic = primero ? (o.imagenesClave ?? []).find((x) => x.n === primero.n && esHttps(x.url)) : undefined
    if (primero && ic) return { ...base, imagenes: [ic.url], origen: 'primera_aparicion' as const, plano_de_origen: primero.n }
    return { ...base, imagenes: [], origen: 'solo_descripcion' as const }
  })
}

export interface ReferenciasDelPlano {
  /** las imágenes de ficha que lleva el clip, DESPUÉS de su primer cuadro (sin repetirlo) · vacío = el plano sigue por imagen a video */
  urls: string[]
  /** el texto que explica al modelo qué es cada imagen y cómo es cada personaje (va antes del pedido del clip) · vacío si el plano no tiene personajes */
  texto: string
  /** los personajes del plano que viajan solo con su descripción (sin imagen) */
  sin_imagen: string[]
}

/**
 * las referencias de UN plano: la ficha de cada personaje que sale en él, en el orden en que el plano los nombra.
 * `primerCuadro` = la imagen de la que arranca el clip (su imagen clave o su foto propia), o null si el plano sale desde su texto.
 */
export function referenciasDelPlano(plano: Pick<Plano, 'n' | 'personajes'>, fichas: FichaDePersonaje[], primerCuadro: string | null, max = MAX_IMAGENES_POR_CLIP): ReferenciasDelPlano {
  const ids = plano.personajes ?? []
  if (!ids.length) return { urls: [], texto: '', sin_imagen: [] }
  const cupo = Math.max(0, max - (primerCuadro ? 1 : 0))
  const urls: string[] = []
  const lineas: string[] = []
  const sin_imagen: string[] = []
  for (const id of ids) {
    const f = fichas.find((x) => x.id === id)
    if (!f) continue
    const propias = f.origen === 'primera_aparicion' && f.plano_de_origen === plano.n ? [] : f.imagenes
    const desde = urls.length
    for (const u of propias) if (u !== primerCuadro && !urls.includes(u) && urls.length < cupo) urls.push(u)
    const suyas = urls.length - desde
    const como = f.descripcion ? `: ${f.descripcion}` : ''
    if (suyas) {
      const primera = desde + (primerCuadro ? 2 : 1)
      const ultima = primera + suyas - 1
      lineas.push(`${suyas === 1 ? `Image ${primera} is` : `Images ${primera}-${ultima} are`} the character reference of «${f.nombre}»${como}. Keep the same face, hair, body and clothing.`)
    } else {
      sin_imagen.push(f.nombre)
      lineas.push(`Character «${f.nombre}»${como}. Keep this look identical in every shot.`)
    }
  }
  if (!lineas.length) return { urls: [], texto: '', sin_imagen }
  const inicio = urls.length && primerCuadro ? 'Image 1 is the opening frame of this shot: start from it (same composition, framing and light). ' : ''
  return { urls, texto: `${inicio}${lineas.join(' ')}`, sin_imagen }
}
