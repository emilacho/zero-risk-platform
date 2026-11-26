/**
 * SPRINT 2 · S2-3 · UNA IMAGEN CLAVE POR PLANO (16-nov · GO-LENOVO sprint 2 calidad de video · firma de Emilio 21:55).
 * Antes de filmar, cada plano de la hoja de la mesa tiene su imagen vertical: el storyboard. En las PROPUESTAS sale en borrador (barato y rápido) y,
 * con la propuesta aprobada, en final con la mejor calidad. El borrador y el final son el MISMO camino con otra calidad (DATO de la plantilla):
 * mismo prompt, misma foto, mismo encuadre; aprobar el borrador significa algo.
 *  · La foto real del cliente en los planos de producto (la que nombra la hoja si sirve; si no, la mejor apta). 17-nov · GO Lenovo «quitar rejas» (fila 3 de CC1): un plano de
 *    ambiente lleva la foto propia que la hoja le NOMBRE si es apta (la fachada, el local); sin foto nombrada se genera, como antes. No rota sobre las aptas.
 *  · Sin foto apta se GENERA desde la hoja: es el camino de los clientes sin fotos y tiene que salir igual de bueno (el prompt lleva todo lo que la hoja sabe del plano).
 *  · El texto en pantalla NUNCA va a la imagen: se compone por código después (S2-5).
 * Puro: sin red, sin base, sin modelo. Agnóstico: no sabe de rubros ni de clientes; lee lo que la hoja traiga y suple lo que falte sin frenar.
 */
import { MAX_IMAGENES } from '../../imagenes-del-pedido'
import { fotosPorImagen, type FotoDeReferencia } from '../foto-de-referencia'
import type { Estado } from '../tipos'
import type { PersonajeDeLaHoja, Plano } from './guion'
import { MAX_FOTOS_POR_IMAGEN } from '../../imagen-sobre-foto'
import { faseDeLaProduccion } from './propuestas'
import { fotoPorId } from '../id-de-foto'

export const PASO_IMAGENES_CLAVE = 'imagenes_clave'
/** el mismo paso con la propuesta aprobada (orden acordado con CC1: mesa → imagenes_clave → borrador_video → aprobar_propuestas → imagenes_clave_final → pedido…) */
export const PASO_IMAGENES_CLAVE_FINAL = 'imagenes_clave_final'
/** decisión de Lenovo 16-nov 22:23: en el BORRADOR de las propuestas, un plano que dura MÁS de esto lleva dos cuadros (cómo arranca y cómo termina), no uno */
export const SEGUNDOS_PARA_DOS_CUADROS = 3
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

/** ¿el plano lleva dos cuadros? dura más de SEGUNDOS_PARA_DOS_CUADROS y la hoja dice cómo termina (su estado final o su movimiento) */
export const llevaDosCuadros = (p: PlanoDeLaHoja): boolean =>
  Number(p.hasta) - Number(p.desde) > SEGUNDOS_PARA_DOS_CUADROS && (esTexto(p.estado_final) || esTexto(p.movimiento))

/**
 * el segundo cuadro de un plano largo: el MISMO prompt base (misma escena, misma foto) congelado en el instante en que el plano termina.
 * Así el borrador cuenta el plano entero y el clip tiene adónde llegar.
 */
export function promptDelCierre(p: PlanoDeLaHoja, o: { total: number; proporcion: string }): string {
  const fin = esTexto(p.estado_final) ? p.estado_final.trim() : `the moment right after this movement ends: ${String(p.movimiento ?? '').trim()}`
  return [
    // CC7 🟡 (17-nov): el cuerpo heredado no puede pedir a la vez «congela el inicio» y «congela el final»: en el cierre el movimiento es lo que ya pasó
    promptDeImagenClave(p, o)
      .replace('It will be the first frame of the clip of this shot.', 'It will be the LAST frame of the clip of this shot.')
      .replace('The clip will move like this (freeze the starting instant): ', 'The clip has just moved like this (this frame is where that movement ends): '),
    `Freeze the END of the shot, not its start: ${fin}. Same scene, same subject, same product, same light and same framing style as the first frame of this shot.`,
  ].join('\n')
}

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
    // 18-nov · segunda opinión de GPT (CC6): «premium» estaba en el envoltorio de TODOS los prompts y es palabra prohibida de un manual. El envoltorio fijo no
    //   lleva adjetivos de marca: el estilo lo pone la hoja de la mesa (que sí lee el manual del cliente)
    // 19-nov · AVISO Lenovo (Emilio 16:32): tampoco «Photographic and realistic». El estilo de cada imagen sale del manual del cliente («cómo se produce con IA»)
    //   y lo escribe la mesa en su «Prompt de imagen»; aquí solo queda lo funcional (el cuadro tiene que poder seguir en movimiento)
    'A pose or moment that can continue in motion.',
    'No text, letters, captions, logos or watermarks in the image: any text is added later in editing.',
  ].filter(Boolean).join('\n')
}

export interface PedidoDeImagenClave {
  n: number
  prompt: string
  foto: FotoDeReferencia | null
  /** el plano es de producto pero no hay foto apta: se genera desde la hoja (no es un error: es el camino de los clientes sin fotos) */
  sin_foto_apta: boolean
  /** solo los planos largos (`llevaDosCuadros`): el prompt del cuadro de cierre, con la MISMA foto */
  prompt_cierre?: string
  /** 18-nov · las OTRAS fotos reales del plano, detrás de `foto` (las extra que nombra el plano y las de sus personajes), en el orden que explica el prompt */
  otras_fotos?: FotoDeReferencia[]
  /** 18-nov · personajes del plano que no traen foto (ni marca de creación nueva): el prompt pide un diseño nuevo, no uno «real» */
  personajes_sin_foto?: string[]
}

/**
 * un pedido por plano. La foto: solo en los planos de producto; la que nombra la hoja si es apta (si no, queda en `no_aptas` y el plano rota sobre las aptas);
 * los planos de producto sin foto nombrada rotan sobre las aptas que nadie pidió (`fotosPorImagen`, la misma regla del Sprint 1). Determinista: el borrador y el final
 * de la misma hoja piden lo MISMO. `rotar: false` (no se sabe qué fotos muestran el protagonista): solo lleva foto el plano que la nombra; los demás se generan. Puro.
 */
/** 17-nov · fila 3 de CC1: el plano de ambiente que nombra una foto propia APTA la lleva (no rota: solo la que nombra) */
const fotoNombradaApta = (p: PlanoDeLaHoja, aptas: FotoDeReferencia[]): FotoDeReferencia | null => (esTexto(p.foto_id) ? fotoPorId(aptas, p.foto_id) ?? null : null)

export interface FotosDelPlano {
  /** la imagen 1 (la base): la foto del plano; sin ella, la primera foto de sus personajes o de lo que nombra */
  base: FotoDeReferencia | null
  /** las que siguen a la base, en orden */
  otras: FotoDeReferencia[]
  /** lo que el prompt dice de cada imagen y de cada personaje (vacío si el plano no trae nada más que su foto) */
  texto: string
  /** personajes sin foto y sin marca de creación nueva */
  sin_foto: string[]
}

/**
 * 18-nov · GO Lenovo «los creativos ven las fotos» (firma de Emilio 14:16): las fotos reales que lleva la imagen clave de UN plano y lo que es cada una.
 *  · la foto del plano (base) · las otras que el plano nombra (`fotos_extra`) · las de cada personaje que sale (`personajes` → su línea de «## Personajes»).
 *  · un personaje «creación nueva» NO es uno real: su foto es base de estilo y el prompt lo dice.
 *  · un personaje sin foto ni marca: el prompt pide diseñarlo nuevo desde su descripción, sin presentarlo como uno que ya existe (no se inventa lo real).
 * Cada foto va una vez; hasta MAX_FOTOS_POR_IMAGEN con la base. Solo fotos propias con dirección (`propias`). Puro y agnóstico: no sabe de clientes ni de rubros.
 */
export function fotosDelPlano(p: Pick<PlanoDeLaHoja, 'fotos_extra' | 'personajes'>, base: FotoDeReferencia | null, personajes: PersonajeDeLaHoja[], propias: FotoDeReferencia[], /** 19-nov · «lo real es el set» · las fotos que la mesa eligió para la pieza (solo viajan si hay base) */ heredadas: string[] = []): FotosDelPlano {
  const items: Array<{ foto: FotoDeReferencia; que: string }> = []
  const lineas: string[] = []
  const sin_foto: string[] = []
  // 26-nov · los ids de `fotos_extra`, las heredadas y los personajes los escribe un agente: valen acortados (`id-de-foto.ts`)
  const de = (id: string): FotoDeReferencia | null => fotoPorId(propias, id) ?? null
  const poner = (f: FotoDeReferencia | null, que: string): boolean => {
    if (!f || items.length >= MAX_FOTOS_POR_IMAGEN || items.some((x) => x.foto.id === f.id)) return false
    items.push({ foto: f, que }); return true
  }
  if (base) poner(base, 'the real photo chosen for this shot')
  for (const id of p.fotos_extra ?? []) poner(de(id), 'another real element of the client that this shot shows: keep it exactly as in the photo')
  if (base) for (const id of heredadas) poner(de(id), 'a real photo of the client chosen for this piece: keep the same real place, light and colors (do not add its contents if this shot does not show them)')
  for (const pid of p.personajes ?? []) {
    const c = personajes.find((x) => x.id === pid)
    if (!c) continue
    const como = c.descripcion ? ` (${c.descripcion})` : ''
    let suyas = 0
    for (const id of c.fotos_ids) if (poner(de(id), c.creacion_nueva ? `only a STYLE base for «${c.nombre}», a NEW character created for this piece: not an existing one` : `the reference of the real character «${c.nombre}»: same face, body, colors, clothing and details`)) suyas++
    if (!suyas && !c.fotos_ids.some((id) => items.some((x) => x.foto.id === id.trim()))) {
      if (c.creacion_nueva) lineas.push(`«${c.nombre}»${como} is a NEW character created for this piece, designed from this description.`)
      else { sin_foto.push(c.nombre); lineas.push(`«${c.nombre}»${como}: there is no photo of this character, so design it new from this description and do not present it as an existing character of the brand.`) }
    }
  }
  const [primera, ...otras] = items
  const roles = items.length > 1 || (items.length === 1 && items[0].foto.id !== base?.id) ? items.map((x, i) => `Image ${i + 1} is ${x.que}.`) : []
  const texto = [...(roles.length ? [`Reference images, in order: ${roles.join(' ')}`] : []), ...lineas].join('\n')
  return { base: primera?.foto ?? null, otras: otras.map((x) => x.foto), texto, sin_foto }
}

export function pedidosDeImagenClave(o: { planos: PlanoDeLaHoja[]; aptas: FotoDeReferencia[]; proporcion: string; rotar?: boolean; /** 18-nov · los personajes de la hoja */ personajes?: PersonajeDeLaHoja[]; /** 18-nov · las fotos propias con dirección (para las extra y las de los personajes) */ propias?: FotoDeReferencia[] }): { pedidos: PedidoDeImagenClave[]; no_aptas: Array<{ n: number; id: string }> } {
  const deProducto = o.planos.filter(esPlanoDeProducto)
  const pedidas = deProducto.map((p) => (esTexto(p.foto_id) ? p.foto_id.trim() : null))
  const porFoto = fotosPorImagen(o.aptas, pedidas)
  if (o.rotar === false) porFoto.fotos = porFoto.fotos.map((f, i) => (pedidas[i] && f?.id === pedidas[i] ? f : null))
  const fotoDe = new Map(deProducto.map((p, i) => [p.n, porFoto.fotos[i] ?? null]))
  // 19-nov · «lo real es el set» (ADENDA 1: nadie arma un juego aparte) · las fotos que la mesa nombró en la hoja valen para toda la pieza: un plano que no nombra
  //   fotos extra ni personajes las hereda (las de personajes NO: no se mete a un personaje en un plano que no lo muestra)
  const deLaPieza = [...new Set(o.planos.flatMap((p) => [p.foto_id, ...(p.fotos_extra ?? [])]).filter(esTexto).map((s) => s.trim()))]
  const pedidos = o.planos.map((p) => {
    const producto = esPlanoDeProducto(p)
    const fotoDelPlano = producto ? fotoDe.get(p.n) ?? null : fotoNombradaApta(p, o.aptas)
    const forma = { total: o.planos.length, proporcion: o.proporcion }
    const r = fotosDelPlano(p, fotoDelPlano, o.personajes ?? [], o.propias ?? [], p.fotos_extra?.length || p.personajes?.length ? [] : deLaPieza)
    const mas = (s: string) => (r.texto ? `${s}\n${r.texto}` : s)
    return {
      n: p.n, prompt: mas(promptDeImagenClave(p, forma)), foto: r.base, sin_foto_apta: producto && !fotoDelPlano,
      ...(llevaDosCuadros(p) ? { prompt_cierre: mas(promptDelCierre(p, forma)) } : {}),
      ...(r.otras.length ? { otras_fotos: r.otras } : {}), ...(r.sin_foto.length ? { personajes_sin_foto: r.sin_foto } : {}),
    }
  })
  return { pedidos, no_aptas: porFoto.no_aptas.map(({ i, id }) => ({ n: deProducto[i].n, id })) }
}

export interface ImagenClaveDelPlano {
  n: number
  /** el primer cuadro (lo leen el clip de CC3 y la revisión) */
  url: string
  /** todos los cuadros del plano, en orden: [arranque] o [arranque, cierre] en los planos largos (contrato con CC1/CC5: la tarjeta los muestra) */
  imagenes?: string[]
  prompt: string
  foto_referencia_id: string | null
  referencia_usada: boolean
  /** 18-nov · las otras fotos reales que viajaron con la base (personajes, productos, lugares) */
  otras_referencias_ids?: string[]
  /** lo que costaron TODOS los cuadros del plano */
  costo_usd: number
  generation_id: string
}

/** las imágenes clave de UNA propuesta (fase de propuestas: la tarjeta del dueño las lee por id · `decisiones-propuestas.ts` de CC1) */
export interface ImagenesClaveDeLaPropuesta {
  id: string
  planos: ImagenClaveDelPlano[]
  costo_usd: number
  planos_sin_imagen?: number[]
}

/** lo que deja el paso `imagenes_clave` (lo leen la revisión, el clip de cada plano · S2-4 · y la tarjeta de propuestas) */
export interface ImagenesClave {
  fase: FaseDeProduccion
  calidad: CalidadDeImagenClave
  /** en final: las del guion. En borrador (propuestas) va vacía y cada propuesta trae las suyas en `propuestas` */
  planos: ImagenClaveDelPlano[]
  propuestas?: ImagenesClaveDeLaPropuesta[]
  /** el paso final no regeneró: el encargo no tenía propuestas y `imagenes_clave` ya era final (copia, sin gasto) */
  copiado_de?: string
  /** hay imágenes REALES que mirar (en ensayo son simuladas: false, y la revisión no se llama) */
  hay_imagenes: boolean
  simulado?: boolean
  planos_sin_imagen?: number[]
}

/**
 * las imágenes clave FINALES del encargo (las que leen la revisión, el clip y la mirada): las de `imagenes_clave_final` si ese paso corrió; si no, las de
 * `imagenes_clave` cuando ya eran finales (el video sin propuestas). Las de borrador de las propuestas NUNCA: esas solo son para que el dueño elija. Puro
 */
export function imagenesClaveVigentes(e: Pick<Estado, 'artefactos'>): ImagenesClave | null {
  for (const k of [PASO_IMAGENES_CLAVE_FINAL, PASO_IMAGENES_CLAVE]) {
    const d = e.artefactos?.[k]?.datos as unknown as ImagenesClave | undefined
    if (d && d.fase !== 'borrador') return d
  }
  return null
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
export function tareaDeLaRevisionDeImagenesClave(o: { imagenes: ImagenClaveDelPlano[]; planos: PlanoDeLaHoja[]; fotos: Array<{ id: string; url: string }>; brief_texto: string; red: string; contrato: string; errorDeFormato?: string; max?: number }): { task: string; images: string[] } {
  // CC7 (16-nov): el servicio de agentes acepta como mucho MAX_IMAGENES por pedido (la misma constante que valida la puerta). Primero las imágenes clave
  //   (repartidas parejo si no caben todas); cada foto real se muestra UNA vez aunque sea la vara de varios planos, y solo si queda lugar. Lo que no cabe, se dice
  const max = Math.max(1, o.max ?? MAX_IMAGENES)
  const vistas = o.imagenes.length <= max ? o.imagenes : Array.from(new Set(Array.from({ length: max }, (_, i) => Math.round((i * (o.imagenes.length - 1)) / Math.max(1, max - 1))))).map((i) => o.imagenes[i])
  let lugar = max - vistas.length
  const images: string[] = []
  const lineas: string[] = []
  const fotoEn = new Map<string, number>()
  for (const im of vistas) {
    images.push(im.url)
    lineas.push(`- imagen ${images.length}: imagen clave del plano ${im.n}${im.foto_referencia_id ? ` (hecha sobre la foto real «${im.foto_referencia_id}»)` : ''}`)
    const real = im.foto_referencia_id ? fotoPorId(o.fotos, im.foto_referencia_id) : undefined
    if (!real?.url) continue
    const ya = fotoEn.get(real.id)
    if (ya) lineas.push(`  (la vara del producto del plano ${im.n} es la foto REAL «${real.id}», ya mostrada como imagen ${ya})`)
    else if (lugar > 0) { images.push(real.url); lugar--; fotoEn.set(real.id, images.length); lineas.push(`- imagen ${images.length}: la foto REAL «${real.id}» del cliente: es la vara del producto del plano ${im.n}`) }
    else lineas.push(`  (la foto real «${real.id}» del plano ${im.n} no se muestra: el pedido admite ${max} imágenes)`)
  }
  const sinImagen = o.planos.filter((p) => !vistas.some((im) => im.n === p.n)).map((p) => p.n)
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
