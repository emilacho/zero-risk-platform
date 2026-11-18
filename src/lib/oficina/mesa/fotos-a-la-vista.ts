/**
 * 18-nov · GO de Lenovo (firma de Emilio 14:16 Zúrich) · «los que crean la pieza VEN las fotos y razonan con ellas» · parte de CC2: la MESA.
 *
 * Por qué: en un reel real (encargo `57101e2a`) la foto del personaje estaba en la lista (`8abc6e54`, «Ilustración 3D… un esqueleto con gorra y chaqueta dorada»),
 * pero la mesa solo leía esa descripción: no la reconoció como el personaje y pidió «a generated skeleton character». Ahora cada turno creativo
 * recibe las fotos propias como IMÁGENES reales (el cable `images` del pedido, CC1 25-sep), cada una con su rótulo `foto:<id>`.
 *
 * Agnóstico: no sabe de clientes, personajes ni platos; solo elige QUÉ fotos van a la vista.
 *  · Son las mismas de la lista de texto (`LISTA_DE_FOTOS`: las propias, hasta 24): los ids que lee la mesa coinciden con las imágenes.
 *  · Tope: el máximo técnico del cable (`MAX_IMAGENES`, 20 por pedido).
 *  · ESTABLE: las mismas 20 en todos los turnos de la mesa (por confianza de la etiqueta y, a igual confianza, en el orden de la lista). No depende del
 *    tablero: probado con el caso real, poner primero «las que el tablero ya nombró» sacaba de la vista a la foto del personaje a mitad de la mesa
 *    (el tablero nombra también las fotos que DESCARTA). Lo que queda fuera es lo de menor confianza, y la lista lo dice.
 *  · Una foto sin dirección http(s) no se puede mirar: queda solo como texto.
 */
import type { FotoEtiquetada } from '../fotos'
import { MAX_IMAGENES, type ImagenDelPedido } from '../../imagenes-del-pedido'
import type { TipoDeTurno } from './pedidos'

/** las mismas fotos que lista la mesa en texto (las propias, hasta 24) */
export const MAX_FOTOS_DE_LA_LISTA = 24
/** el máximo técnico del cable de imágenes por pedido */
export const MAX_FOTOS_A_LA_VISTA = MAX_IMAGENES

/** los turnos que crean, critican o integran la pieza: todos ven las fotos */
export const TURNOS_QUE_VEN_LAS_FOTOS: readonly TipoDeTurno[] = ['dirigir', 'aportar', 'responder', 'criticar', 'integrar', 'devolver_citas', 'redactar_prompts']

/** el rótulo con que la imagen llega al modelo: el mismo id que la mesa escribe en «Foto:» */
export const rotuloDeLaFoto = (id: string): string => `foto:${id}`

export const fotosDeLaLista = (fotos: FotoEtiquetada[]): FotoEtiquetada[] => fotos.filter((f) => (f.origen ?? 'propia') === 'propia').slice(0, MAX_FOTOS_DE_LA_LISTA)

const sePuedeMirar = (f: FotoEtiquetada): boolean => typeof f.url === 'string' && /^https?:\/\/\S+$/i.test(f.url.trim())
const PESO_DE_LA_CONFIANZA: Record<string, number> = { alta: 0, media: 1, baja: 2 }

/** las fotos que van A LA VISTA: las de la lista que se pueden mirar, por confianza (alta, media, baja, sin dato) y, a igual confianza, en el orden de la lista; hasta el tope del cable */
export function fotosALaVista(fotos: FotoEtiquetada[]): FotoEtiquetada[] {
  return fotosDeLaLista(fotos)
    .map((f, i) => ({ f, i, peso: PESO_DE_LA_CONFIANZA[f.etiqueta_confianza ?? ''] ?? 3 }))
    .filter((x) => sePuedeMirar(x.f))
    .sort((a, b) => a.peso - b.peso || a.i - b.i)
    .slice(0, MAX_FOTOS_A_LA_VISTA)
    .map((x) => x.f)
}

/** las imágenes del pedido de un turno: solo en los turnos que crean, critican o integran */
export function imagenesDelTurno(tipo: TipoDeTurno, fotos: FotoEtiquetada[]): ImagenDelPedido[] {
  if (!TURNOS_QUE_VEN_LAS_FOTOS.includes(tipo)) return []
  return fotosALaVista(fotos).map((f) => ({ url: (f.url as string).trim(), label: rotuloDeLaFoto(f.id) }))
}

/** la regla de los elementos reales (agnóstica: personaje, producto o plato, local, uniforme, empaque…) · va en la cabecera de todos los turnos de la pieza */
export const REGLA_DE_LOS_ELEMENTOS_REALES = [
  '## Las fotos están a la vista: míralas',
  '- Las fotos marcadas «a la vista» llegan adjuntas como **imágenes reales**, cada una con su rótulo `foto:<id>`. Míralas: la descripción de la lista es solo una ayuda y puede quedarse corta o equivocarse.',
  '- **Cada plano, lámina o idea que use un elemento real del cliente** (un personaje de la marca, un producto o plato, el local, un uniforme, un empaque) **nombra la foto exacta que lo muestra** (`foto:<id>`) y dice en una frase por qué la eligió.',
  '- **Si ninguna foto muestra ese elemento, dilo.** No lo inventes como si fuera real: proponlo como **creación nueva**, escrito así («creación nueva · basada en foto:<id>», con la foto que sirve de base de estilo, o sin foto si no hay ninguna que sirva), para que el equipo sepa que no es el real.',
  '- Un personaje de la marca (mascota, ilustración, figura) es un elemento real: si una foto lo muestra, se usa ESA foto; nunca se dibuja «uno parecido».',
].join('\n')

/** la línea extra de la crítica: revisa con las imágenes a la vista */
export const LA_CRITICA_MIRA_LAS_FOTOS = '- **Qué choca con las fotos**: mira las imágenes adjuntas. Si una propuesta dice que una foto muestra algo que no muestra, si usa un elemento real del cliente sin nombrar la foto que lo muestra (o lo inventa como si fuera real), o si la foto elegida tiene personas o marcas de terceros, dilo citando la foto (`foto:<id>`).'
