/**
 * SPRINT 2 · S2-3 · UNA IMAGEN CLAVE POR PLANO (16-nov · GO-LENOVO sprint 2 calidad de video · firma de Emilio 21:55).
 * Antes de filmar, cada plano de la hoja de la mesa tiene su imagen vertical: el storyboard. En las PROPUESTAS sale en borrador (barato y rápido) y,
 * con la propuesta aprobada, en final con la mejor calidad. El borrador y el final son el MISMO camino con otra calidad (DATO de la plantilla):
 * mismo prompt, misma foto, mismo encuadre; aprobar el borrador significa algo.
 *  · La foto real del cliente SOLO en los planos de producto (la que nombra la hoja si sirve; si no, la mejor apta). Los planos de ambiente no llevan la foto del producto.
 *  · Sin foto apta se GENERA desde la hoja: es el camino de los clientes sin fotos y tiene que salir igual de bueno (el prompt lleva todo lo que la hoja sabe del plano).
 *  · El texto en pantalla NUNCA va a la imagen: se compone por código después (S2-5).
 * Puro: sin red, sin base, sin modelo. Agnóstico: no sabe de rubros ni de clientes; lee lo que la hoja traiga y suple lo que falte sin frenar.
 */
import { fotosPorImagen, type FotoDeReferencia } from '../foto-de-referencia'
import type { Estado } from '../tipos'
import type { Plano } from './guion'
import { faseDeLaProduccion } from './propuestas'

export const PASO_IMAGENES_CLAVE = 'imagenes_clave'
export const PASO_REVISAR_IMAGENES_CLAVE = 'revisar_imagenes_clave'
export const ESQUEMA_REVISION_IMAGENES_CLAVE = 'revision_imagenes_clave.v1'

export type FaseDeProduccion = 'borrador' | 'final'
export interface CalidadDeImagenClave { quality: string; size: string }
export type CalidadesDeImagenClave = Record<FaseDeProduccion, CalidadDeImagenClave>

/** la calidad por omisión (la plantilla la puede cambiar en `limites.imagen_clave`): borrador barato, final al máximo que admite el modelo; vertical en los dos */
export const CALIDAD_DE_IMAGEN_CLAVE: CalidadesDeImagenClave = {
  borrador: { quality: 'low', size: '1024x1536' },
  final: { quality: 'max', size: '1024x1536' },
}

/** la hoja de planos (S2-1, CC1): el plano del guion con los campos nuevos, todos opcionales (lo que falta se suple) */
export type PlanoDeLaHoja = Plano & {
  rol?: string
  /** la hoja de CC1 (#1070): true = plano de producto (lleva la foto real) · false = ambiente · sin dato = decide la foto que nombra el plano */
  producto?: boolean
  prompt_imagen?: string
  intencion?: string
  lente?: string
  luz?: string
  estado_final?: string
}

/** la fase: UNA sola verdad, la de CC1 (`faseDeLaProduccion` · #1070): «propuesta» ⇒ borrador; «final» (aprobada, o sin propuestas: el video de hoy) ⇒ final */
export function faseDeProduccion(estado: Pick<Estado, 'artefactos'> | null | undefined): FaseDeProduccion {
  return estado && faseDeLaProduccion(estado) === 'propuesta' ? 'borrador' : 'final'
}

const esTexto = (x: unknown): x is string => typeof x === 'string' && x.trim().length > 0
const esCalidad = (x: unknown): x is CalidadDeImagenClave => !!x && typeof x === 'object' && esTexto((x as CalidadDeImagenClave).quality) && esTexto((x as CalidadDeImagenClave).size)

/** la calidad de la fase: la de la plantilla si está bien escrita; si no, la de por omisión (nunca frena) */
export function calidadDeLaFase(limites: Record<string, unknown> | null | undefined, fase: FaseDeProduccion): CalidadDeImagenClave {
  const de = (limites?.imagen_clave as Partial<Record<FaseDeProduccion, unknown>> | undefined)?.[fase]
  return esCalidad(de) ? { quality: de.quality.trim(), size: de.size.trim() } : CALIDAD_DE_IMAGEN_CLAVE[fase]
}

/** ¿es un plano del producto? lo dice la hoja (`producto`); si la hoja no lo dice, un plano que nombra una foto propia lo es */
export const esPlanoDeProducto = (p: PlanoDeLaHoja): boolean => (typeof p.producto === 'boolean' ? p.producto : esTexto(p.foto_id))

/**
 * el prompt de la imagen clave: el de la hoja si lo trae; si no, se compone con todo lo que la hoja sabe del plano. Siempre pide un cuadro vertical, sin texto
 * (el texto en pantalla se compone por código) y que se pueda continuar en movimiento (es el primer cuadro del clip).
 */
export function promptDeImagenClave(p: PlanoDeLaHoja, o: { total: number; proporcion: string }): string {
  const cuerpo = esTexto(p.prompt_imagen)
    ? p.prompt_imagen.trim()
    : [
        esTexto(p.se_ve) ? `Scene: ${p.se_ve.trim()}` : '',
        esTexto(p.intencion) ? `Intention: ${p.intencion.trim()}` : '',
        esTexto(p.lente) ? `Lens / shot size: ${p.lente.trim()}` : '',
        esTexto(p.luz) ? `Light: ${p.luz.trim()}` : '',
        esTexto(p.movimiento) ? `The clip will move like this (freeze the starting instant): ${p.movimiento.trim()}` : '',
        esTexto(p.estado_final) ? `End state of the shot: ${p.estado_final.trim()}` : '',
      ].filter(Boolean).join('\n')
  return [
    `Key frame for shot ${p.n} of ${o.total} of a short vertical video (${o.proporcion}). It will be the first frame of the clip of this shot.${esTexto(p.rol) ? ` Narrative role of the shot: ${p.rol.trim()}.` : ''}`,
    cuerpo,
    'Photographic, realistic and premium. A pose or moment that can continue in motion.',
    'No text, letters, captions, logos or watermarks in the image: any text is added later in editing.',
  ].filter(Boolean).join('\n')
}

export interface PedidoDeImagenClave {
  n: number
  prompt: string
  foto: FotoDeReferencia | null
  /** el plano es de producto pero no hay foto apta: se genera desde la hoja (no es un error: es el camino de los clientes sin fotos) */
  sin_foto_apta: boolean
}

/**
 * un pedido por plano. La foto: solo en los planos de producto; la que nombra la hoja si es apta (si no, queda en `no_aptas` y el plano rota sobre las aptas);
 * los planos de producto sin foto nombrada rotan sobre las aptas que nadie pidió (`fotosPorImagen`, la misma regla del Sprint 1). Determinista: el borrador y el final
 * de la misma hoja piden lo MISMO. `rotar: false` (no se sabe qué fotos muestran el protagonista): solo lleva foto el plano que la nombra; los demás se generan. Puro.
 */
export function pedidosDeImagenClave(o: { planos: PlanoDeLaHoja[]; aptas: FotoDeReferencia[]; proporcion: string; rotar?: boolean }): { pedidos: PedidoDeImagenClave[]; no_aptas: Array<{ n: number; id: string }> } {
  const deProducto = o.planos.filter(esPlanoDeProducto)
  const pedidas = deProducto.map((p) => (esTexto(p.foto_id) ? p.foto_id.trim() : null))
  const porFoto = fotosPorImagen(o.aptas, pedidas)
  if (o.rotar === false) porFoto.fotos = porFoto.fotos.map((f, i) => (pedidas[i] && f?.id === pedidas[i] ? f : null))
  const fotoDe = new Map(deProducto.map((p, i) => [p.n, porFoto.fotos[i] ?? null]))
  const pedidos = o.planos.map((p) => {
    const producto = esPlanoDeProducto(p)
    const foto = producto ? fotoDe.get(p.n) ?? null : null
    return { n: p.n, prompt: promptDeImagenClave(p, { total: o.planos.length, proporcion: o.proporcion }), foto, sin_foto_apta: producto && !foto }
  })
  return { pedidos, no_aptas: porFoto.no_aptas.map(({ i, id }) => ({ n: deProducto[i].n, id })) }
}

export interface ImagenClaveDelPlano {
  n: number
  url: string
  prompt: string
  foto_referencia_id: string | null
  referencia_usada: boolean
  costo_usd: number
  generation_id: string
}

/** lo que deja el paso `imagenes_clave` (lo leen la revisión, el clip de cada plano · S2-4 · y la tarjeta de propuestas) */
export interface ImagenesClave {
  fase: FaseDeProduccion
  calidad: CalidadDeImagenClave
  planos: ImagenClaveDelPlano[]
  /** hay imágenes REALES que mirar (en ensayo son simuladas: false, y la revisión no se llama) */
  hay_imagenes: boolean
  simulado?: boolean
  planos_sin_imagen?: number[]
}

// ───────────────────────── la revisión con visión (decisión de Emilio 16-nov 20:53: AVISA y devuelve a la mesa UNA vez; luego sigue)
export interface RevisionDeImagenesClave {
  coincide: boolean
  por_plano: Array<{ plano: number; coincide: boolean; correccion: string }>
  para_la_mesa: string
}

const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** lo que el agente devolvió → lo que guarda la sala (ya pasó el esquema); nada se inventa */
export function leerRevisionDeImagenesClave(v: Record<string, unknown>): RevisionDeImagenesClave {
  const por_plano = (Array.isArray(v.por_plano) ? v.por_plano : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({ plano: Number(x.plano), coincide: x.coincide === true, correccion: txt(x.correccion) }))
    .filter((x) => Number.isFinite(x.plano))
  return { coincide: v.coincide === true, por_plano, para_la_mesa: txt(v.para_la_mesa) }
}

const lineaDelPlano = (p: PlanoDeLaHoja): string => {
  const campos = [
    esTexto(p.rol) ? `rol: ${p.rol.trim()}` : '',
    esTexto(p.intencion) ? `intención: ${p.intencion.trim()}` : '',
    esTexto(p.se_ve) ? `se ve: ${p.se_ve.trim()}` : '',
    esTexto(p.lente) ? `lente: ${p.lente.trim()}` : '',
    esTexto(p.luz) ? `luz: ${p.luz.trim()}` : '',
    esTexto(p.estado_final) ? `estado final: ${p.estado_final.trim()}` : '',
    esPlanoDeProducto(p) ? 'sale el producto' : '',
  ].filter(Boolean)
  return `- Plano ${p.n} (${p.desde}–${p.hasta} s)${campos.length ? `: ${campos.join(' · ')}` : ''}`
}

/**
 * el pedido al agente: cada imagen clave con su plano y, en los planos de producto, la foto real que la imagen tenía que respetar.
 * JUZGA EL AGENTE: no hay lista de cosas que buscar; el código solo arma el pedido y lee `coincide`.
 */
export function tareaDeLaRevisionDeImagenesClave(o: { imagenes: ImagenClaveDelPlano[]; planos: PlanoDeLaHoja[]; fotos: Array<{ id: string; url: string }>; brief_texto: string; red: string; contrato: string; errorDeFormato?: string }): { task: string; images: string[] } {
  const images: string[] = []
  const lineas: string[] = []
  for (const im of o.imagenes) {
    images.push(im.url)
    lineas.push(`- imagen ${images.length}: imagen clave del plano ${im.n}${im.foto_referencia_id ? ` (hecha sobre la foto real «${im.foto_referencia_id}»)` : ''}`)
    const real = im.foto_referencia_id ? o.fotos.find((f) => f.id === im.foto_referencia_id) : undefined
    if (real?.url) { images.push(real.url); lineas.push(`- imagen ${images.length}: la foto REAL «${real.id}» del cliente: es la vara del producto del plano ${im.n}`) }
  }
  const sinImagen = o.planos.filter((p) => !o.imagenes.some((im) => im.n === p.n)).map((p) => p.n)
  const task = [
    '## La pieza\nUn video corto en preparación. Antes de filmar, cada plano tiene su imagen clave (el primer cuadro de su clip). Revisas el storyboard ANTES de gastar en el video.',
    `## La fila del brief (lo que la pieza tiene que contar)\n${o.brief_texto.trim() || '(sin texto)'}\nRed: ${o.red || '(sin red)'}`,
    `## La hoja de planos (lo que cada plano tiene que mostrar)\n${o.planos.map(lineaDelPlano).join('\n') || '- (sin planos)'}`,
    `## Las imágenes que te muestro (en orden)${sinImagen.length ? ` · los planos ${sinImagen.join(', ')} no tienen imagen: no los juzgues` : ''}\n${lineas.join('\n') || '- (ninguna)'}`,
    '## Tu trabajo\nMira cada imagen clave contra su plano como lo haría el director antes de filmar: ¿cumple el rol y la intención del plano?, ¿se ve lo que la hoja pide?, en los planos de producto, ¿el producto es el de la foto real (mismo plato u objeto, sin agregados ni cambios)?, ¿hay texto, letras o logos que no deberían estar? Lo importante lo decides tú leyendo la hoja y la fila. Por cada plano di si coincide y, si no, la corrección concreta que el equipo creativo tendría que hacer en la hoja. Si todo coincide, dilo y no inventes defectos.',
    ...(o.errorDeFormato ? [`## Corrige el formato\n${o.errorDeFormato}`] : []),
    `## Formato de tu respuesta\nSolo este JSON:\n${o.contrato}`,
  ].join('\n\n')
  return { task, images }
}

/** lo que la mesa recibe cuando las imágenes clave vuelven (la dirección lo lee como devolución). Puro */
export function avisoDeLaRevisionALaMesa(r: RevisionDeImagenesClave): string {
  const malos = r.por_plano.filter((p) => !p.coincide)
  return [
    'Un agente revisó las imágenes clave (el storyboard) ANTES de filmar y no todas cuentan lo que pide la hoja. Corrijan la hoja de esos planos y vuelvan a integrarla completa:',
    ...malos.map((p) => `- plano ${p.plano}: ${p.correccion || 'no coincide con la hoja'}`),
    ...(r.para_la_mesa ? [`Lo que pide el agente: ${r.para_la_mesa}`] : []),
  ].join('\n').slice(0, 3000)
}

/** lo que la jefatura y la entrega leen: lo que vio el agente, legible */
export function revisionLegible(r: RevisionDeImagenesClave): string {
  return [
    `Revisión de las imágenes clave antes de filmar: ${r.coincide ? 'coinciden con la hoja' : 'NO todas coinciden'}.`,
    ...r.por_plano.filter((p) => !p.coincide).map((p) => `- plano ${p.plano}: ${p.correccion || 'no coincide'}`),
  ].join('\n')
}
