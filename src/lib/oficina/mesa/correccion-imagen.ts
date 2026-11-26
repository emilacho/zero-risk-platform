/**
 * 20-nov · PUNTO 3 · «dos versiones y hasta tres rondas» (GO Lenovo a CC1 12:18Z · diseño v3 de CC5 con las 9 condiciones de CC6 y CC7, al pie de
 * `2026-11-19-PLAN-CC5-lo-real-es-el-set.md`). Emilio (17:18 Zúrich): «si nos contentamos con lo que nos da una máquina generadora, es mediocre: en ese paso tiene que haber correcciones».
 *
 * Tres pasos entre `imagen` y `observar` de las mesas de imagen (finales: post, carrusel, kit), por vuelta (primero la vuelta 1 de TODAS las imágenes):
 *  1. `corregir_imagen` (agente · el creativo que pidió la imagen, NO la jefatura): mira las versiones como imagen y SOLO pide cambios en lenguaje llano.
 *  2. `editar_imagen` (código): edita SOBRE la versión elegida (base = la generada; las fotos reales van como otras, ≤ 15, la base real primera).
 *     Una llave por (encargo, imagen, vuelta): si el paso se corre dos veces, la edición ya pagada se reusa. Cada versión es un archivo nuevo. En seco, 0 llamadas.
 *  3. `mirar_correccion` (código · el revisor de OTRO proveedor, como `observar`): decide «queda bien», cuál es la mejor y si mejoró. El creador nunca se califica solo.
 *     Decide también si hay otra vuelta: quedan vueltas, alguna imagen sigue pendiente Y CABE la vuelta entera en el tope (como `quedaVueltaALaMesa`). Si no cabe, sale la mejor con
 *     su ficha «no cupo» y el encargo NO se cierra. Al terminar, deja en `imagenes` la mejor versión de cada imagen para la cola de siempre (`observar` → `elegir_version` → …).
 * Lo que ya quedó bien no se edita (la cuenta es por imagen). Progreso monótono: si la mirada prefiere la anterior, esa imagen cierra con la anterior.
 * El registro (`correcciones_de_imagen`) tiene una fila por (imagen, vuelta) con su `motivo_de_cierre` y su `donde`.
 */
import { createHash } from 'node:crypto'
import { MAX_IMAGENES } from '../../imagenes-del-pedido'
import { datos, fichaNueva } from '../ayudas'
import { MAX_OTRAS_FOTOS, otrasFotosDeLaImagen, type FotoDeReferencia } from '../foto-de-referencia'
import type { ResultadoDePaso } from '../motor'
import type { Cambios, Encargo, Puertos } from '../puertos'
import { cabeLaVuelta, quedaVueltaDelPaso } from '../orquestador-video'
import { costoDeVolver, loQueSigueDespuesDelPaso } from '../topes-por-duracion'
import type { Estado, Ficha, Paso, Plantilla } from '../tipos'
import { calidadDeLaFase, PASO_IMAGENES_CLAVE_FINAL, PASO_REVISAR_IMAGENES_CLAVE } from '../video/imagen-clave'
import { fotoPorId } from '../id-de-foto'

export const PASO_CORREGIR_IMAGEN = 'corregir_imagen'
export const PASO_EDITAR_IMAGEN = 'editar_imagen'
export const PASO_MIRAR_CORRECCION = 'mirar_correccion'
export const FUNCION_EDITAR_IMAGEN = 'editar_imagen'
export const FUNCION_MIRAR_CORRECCION = 'mirar_correccion'
export const ARTEFACTO_PEDIDO_DE_CORRECCION = 'pedido_de_correccion'
export const ARTEFACTO_EDICIONES_DE_IMAGEN = 'ediciones_de_imagen'
export const ARTEFACTO_CORRECCIONES_DE_IMAGEN = 'correcciones_de_imagen'
export const ESQUEMA_CORRECCION_IMAGEN = 'correccion_imagen.v1'
/** el creativo que pidió la imagen: el ingeniero de prompts (asiento de las mesas de imagen); no la jefatura */
export const AGENTE_QUE_CORRIGE_LA_IMAGEN = 'design-image-prompt-engineer'
/** Emilio (LENOVO 22:28Z): 3 vueltas por imagen como máximo. Una vuelta = una mirada del creativo + una edición + una mirada de otro proveedor */
export const VUELTAS_DE_CORRECCION_IMAGEN = 3
// los topes, con la regla firmada (topes = 2–3× lo medido; medido en prd el 20-nov, solo lectura, 30 días):
/** la mirada del creativo: un turno de agente con visión · `design-image-prompt-engineer` midió hasta 0,26 por turno (n = 53) sin imágenes; con ellas suma ~0,005 por imagen → 0,75 */
export const TOPE_DE_LA_MIRADA_DEL_CREATIVO_USD = 0.75
/** lo que se reserva por edición: lo cotizado por imagen en calidad media (0,07); lo medido es ≤ 0,018 por imagen (n = 24) */
export const COSTO_ESTIMADO_POR_EDICION_USD = 0.07
/** lo que se reserva por cada llamada al revisor de otro proveedor (una por imagen pendiente): `revisor-externo-gpt` midió 0,038 de promedio y 0,128 de máximo (n = 25) → 0,26 */
export const COSTO_RESERVADO_POR_MIRADA_DE_OTRO_PROVEEDOR_USD = 0.26
/**
 * lo que se ESPERA que gaste la corrección en una pieza (para el piso de `limites.reserva_por_pieza_usd`, no el peor caso): por vuelta, el turno del creativo (~0,15)
 * más una edición (0,0113 de promedio) y una mirada (0,038) por imagen pendiente; se cuentan 2 vueltas (la segunda con la mitad de las imágenes).
 * Post (1 imagen): 2 × (0,15 + 0,0113 + 0,038) ≈ 0,40 · carrusel y kit (hasta 8): 0,15 + 8 × 0,0493 + 0,15 + 4 × 0,0493 ≈ 0,89 → 0,90
 */
export const RESERVA_POR_PIEZA_DE_LA_CORRECCION_USD: Readonly<Record<'post_mesa' | 'carrusel_mesa' | 'kit_mesa', number>> = { post_mesa: 0.4, carrusel_mesa: 0.9, kit_mesa: 0.9 }
export type MotivoDeCierre = 'queda_bien' | 'sin_cambios' | 'tope_de_vueltas' | 'no_cupo' | 'no_mejoro' | 'fallo_la_edicion' | 'sin_lectura'
export type Donde = 'final' | 'video'

// ───────────────────────── tanda 2 · las imágenes clave del video (diseño v3 (a): «el mismo par de pasos entre la imagen clave de cada plano y el clip»)
/** el que pidió la imagen clave y firma la hoja de planos: el director de la mesa de video (lectura de CC5 16:36Z; la decide Lenovo) */
export const AGENTE_QUE_CORRIGE_LA_IMAGEN_CLAVE = 'creative-director-mesa'
export const agenteQueCorrige = (d: Donde): string => (d === 'video' ? AGENTE_QUE_CORRIGE_LA_IMAGEN_CLAVE : AGENTE_QUE_CORRIGE_LA_IMAGEN)
/** dónde corre la corrección: en el video hay imágenes clave finales; en las mesas de imagen, no (cada familia tiene solo una de las dos fuentes) · pura */
export const dondeDe = (e: Pick<Estado, 'artefactos'>): Donde => (e.artefactos?.[PASO_IMAGENES_CLAVE_FINAL] ? 'video' : 'final')
/** la imagen de un plano se nombra por su número (las de la mesa, por su `ref`) */
export const refDelPlano = (n: number): string => `plano-${n}`

export interface VersionDeImagen { vuelta: number; url: string; generation_id: string | null; simulada?: boolean }
export interface ImagenEnCorreccion {
  ref: string
  prompt: string
  /** el item original de `imagenes` (para devolver la mejor con su misma forma) */
  item: Record<string, unknown>
  /** la foto real que fue base de la imagen, si la hubo */
  foto_real_id: string | null
  /** vuelta 0 = las que generó `imagen`; después, una por vuelta editada */
  versiones: VersionDeImagen[]
  /** índice (en `versiones`) de la mejor según la mirada de otro proveedor */
  mejor: number
  cerrada: boolean
  motivo_de_cierre?: MotivoDeCierre
  /** lo que dijo la última mirada de otro proveedor (le llega al creativo en la vuelta siguiente) */
  lectura?: string
  /** los cambios que pidió el creativo en la última vuelta (para la ficha «quedó pendiente») */
  ultimos_cambios?: string
}
export interface FilaDeCorreccion {
  ref: string; vuelta: number; vistas: number[]; elegida: number; queda_bien: boolean | null; cambios: string
  version_nueva: number | null; costo_usd: number; agente: string; llave: string | null; donde: Donde; motivo_de_cierre?: MotivoDeCierre
}
export interface Correcciones {
  donde: Donde
  /** la tanda de `imagenes` sobre la que se corrige (si se regenera, se empieza de nuevo) */
  intento_imagenes: number
  /** la última vuelta TERMINADA (0 = ninguna) */
  vuelta: number
  imagenes: Record<string, ImagenEnCorreccion>
  filas: FilaDeCorreccion[]
  /** ¿hay otra vuelta? (la condición de la vuelta de `mirar_correccion`) */
  sigue: boolean
  /** tanda 2 · las imágenes que ya pasaron por la vuelta EN CURSO, cuando la vuelta se parte en turnos porque no caben todas en un pedido (vacío al terminar la vuelta) */
  hechas_en_la_vuelta?: string[]
}

const arr = <T>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : [])
const str = (x: unknown): string => (typeof x === 'string' ? x : '')

/** la tanda vigente de `imagenes`, agrupada por imagen (`ref`; la foto de la sala 1 no lleva `ref`: es «pieza») */
function itemsVigentes(e: Estado): { intento: number; items: Array<Record<string, unknown>> } {
  if (dondeDe(e) === 'video') {
    // la tanda de las imágenes clave: la versión del artefacto que dejó `imagenes_clave_final`. Al devolver la mejor se anota esa misma tanda, así la reescritura
    //   no abre una tanda nueva; si el paso vuelve a correr (la jefatura devolvió la pieza a la mesa), sus datos llegan sin la marca y con otra versión → tanda nueva
    const a = e.artefactos[PASO_IMAGENES_CLAVE_FINAL]
    const intento = Number(a.datos.tanda_de_correccion ?? a.version)
    return { intento, items: arr<Record<string, unknown>>(a.datos.planos).filter((p) => str(p.url)).map((p) => ({ ...p, ref: refDelPlano(Number(p.n)), intento })) }
  }
  const im = datos(e, 'imagenes')
  const intento = Number(im?.ultimo_intento ?? 0)
  return { intento, items: arr<Record<string, unknown>>(im?.items).filter((x) => Number(x.intento) === intento && str(x.url)) }
}

/** el estado de la corrección: el guardado si es de la misma tanda de imágenes; si no, todas las imágenes pendientes con sus versiones generadas · pura */
export function correccionesVigentes(e: Estado, donde: Donde = dondeDe(e)): Correcciones {
  const { intento, items } = itemsVigentes(e)
  const prev = datos(e, ARTEFACTO_CORRECCIONES_DE_IMAGEN) as unknown as Correcciones | undefined
  if (prev && prev.intento_imagenes === intento && prev.imagenes && typeof prev.imagenes === 'object') return prev
  const imagenes: Record<string, ImagenEnCorreccion> = {}
  for (const it of items) {
    const ref = str(it.ref) || 'pieza'
    const v: VersionDeImagen = { vuelta: 0, url: str(it.url), generation_id: str(it.generation_id) || null }
    if (!imagenes[ref]) imagenes[ref] = { ref, prompt: str(it.prompt), item: it, foto_real_id: str(it.foto_referencia_id) || null, versiones: [], mejor: 0, cerrada: false }
    imagenes[ref].versiones.push(v)
  }
  return { donde, intento_imagenes: intento, vuelta: 0, imagenes, filas: [], sigue: false }
}

export const pendientesDe = (c: Correcciones): ImagenEnCorreccion[] => Object.values(c.imagenes).filter((i) => !i.cerrada)
/** las imágenes que ve el creativo por imagen pendiente: sus versiones más su foto real (una vez por foto en el pedido) */
const imagenesDelPedido = (lote: ImagenEnCorreccion[], donde: Donde): number => {
  const reales = new Set(lote.map((i) => i.foto_real_id).filter((x): x is string => !!x))
  return lote.reduce((n, i) => n + vistasDe(i, donde).length, 0) + reales.size
}
/**
 * el turno de ESTA vuelta: las pendientes que todavía no pasaron por ella, en orden, mientras quepan en un pedido (`MAX_IMAGENES`). Si no caben todas, la vuelta se parte
 * en turnos seguidos (decisión de Lenovo 16:55Z): primero la vuelta 1 de TODAS, después la 2. Al menos una por turno, para que nunca se quede quieta · pura
 */
export function loteDe(c: Correcciones, max: number = MAX_IMAGENES): ImagenEnCorreccion[] {
  const ya = new Set(c.hechas_en_la_vuelta ?? [])
  const lote: ImagenEnCorreccion[] = []
  for (const i of pendientesDe(c).filter((x) => !ya.has(x.ref))) {
    if (lote.length && imagenesDelPedido([...lote, i], c.donde) > max) break
    lote.push(i)
  }
  return lote
}
/** la vuelta que corre ahora (1, 2 o 3) */
export const vueltaEnCurso = (c: Correcciones): number => c.vuelta + 1
/** qué versiones ve el creativo de una imagen: en la vuelta 1, las generadas; después, la mejor y la última editada si es otra.
 *  En el video (decisión de Lenovo 16:55Z, lectura de CC5): solo la elegida, para que quepa el doble de planos en un pedido */
export function vistasDe(i: ImagenEnCorreccion, donde: Donde = 'final'): number[] {
  if (donde === 'video') return [i.mejor]
  if (i.versiones.every((v) => v.vuelta === 0)) return i.versiones.map((_, k) => k)
  const ultima = i.versiones.length - 1
  return ultima === i.mejor ? [i.mejor] : [i.mejor, ultima]
}

// ───────────────────────── 1 · la mirada del creativo (paso de agente)

/** el pedido del creativo: cada imagen pendiente con sus versiones numeradas, su prompt, las fotos reales y lo que dijo la mirada de otro proveedor · pura */
export function tareaDeLaCorreccion(e: Estado, o: { contrato: string; errorDeFormato?: string; fotos: Array<{ id: string; url: string }>; brief_texto?: string }): { task: string; images: string[] } {
  const c = correccionesVigentes(e)
  const images: string[] = []
  const bloques: string[] = []
  const reales = new Set<string>()
  for (const i of loteDe(c)) {
    const lineas = vistasDe(i, c.donde).map((k) => { images.push(i.versiones[k].url); return `  · imagen ${images.length}: versión ${k}${i.versiones[k].vuelta ? ` (editada en la vuelta ${i.versiones[k].vuelta})` : ' (generada)'}` })
    const real = i.foto_real_id ? fotoPorId(o.fotos, i.foto_real_id) : undefined
    // cada foto real va una sola vez en el pedido (la misma cuenta que `loteDe`)
    const yaVista = !!real && reales.has(real.id)
    if (real && !yaVista) { images.push(real.url); reales.add(real.id) }
    bloques.push([
      `Imagen «${i.ref}»`,
      `- Lo que se pidió: ${i.prompt || '(sin prompt)'}`,
      ...lineas,
      ...(real ? [yaVista ? `  · su FOTO REAL es «${real.id}», ya mostrada arriba (lo que debe conservarse)` : `  · imagen ${images.length}: la FOTO REAL del cliente «${real.id}» (lo que debe conservarse)`] : []),
      ...(i.lectura ? [`- Lo que vio otro revisor en la vuelta anterior: ${i.lectura}`] : []),
    ].join('\n'))
  }
  const task = [
    c.donde === 'video'
      ? `Eres el director de la mesa: pediste estas imágenes clave en la hoja de planos (cada una es el primer cuadro del clip de su plano; el clip arranca de ella). Míralas como imágenes (vuelta ${vueltaEnCurso(c)} de ${VUELTAS_DE_CORRECCION_IMAGEN}).`
      : `Eres el creativo que pidió estas imágenes. Míralas como imágenes (vuelta ${vueltaEnCurso(c)} de ${VUELTAS_DE_CORRECCION_IMAGEN}).`,
    'Para cada imagen: elige la versión sobre la que se va a editar (el número de versión) y di QUÉ CAMBIAR, en lenguaje llano y concreto, como se lo dirías a un fotógrafo',
    '(por ejemplo: «el tazón es de barro, el caldo más claro, saca la cuchara»). Si no hay nada que cambiar, deja `cambios` vacío.',
    'No calificas la imagen: otro revisor decide si quedó bien. Solo pide cambios que acerquen la imagen a lo pedido y a la foto real.',
    ...(o.brief_texto ? ['', `El brief: ${o.brief_texto}`] : []),
    '',
    ...bloques,
    '',
    `Responde SOLO con este JSON: ${o.contrato}`,
    ...(o.errorDeFormato ? ['', `Tu respuesta anterior no se pudo leer: ${o.errorDeFormato}`] : []),
  ].join('\n')
  return { task, images }
}

/** lo que pidió el creativo → el pedido de corrección (versión base y cambios por imagen). Lo que no nombra queda sin cambios sobre su mejor versión · pura */
export function pedidoDeLaCorreccion(e: Estado, valor: Record<string, unknown>): ResultadoDePaso {
  const c = correccionesVigentes(e)
  const dichas = new Map(arr<Record<string, unknown>>(valor.imagenes).map((x) => [str(x.ref), x]))
  const por_ref: Record<string, { base: number; cambios: string; vistas: number[] }> = {}
  for (const i of loteDe(c)) {
    const vistas = vistasDe(i, c.donde)
    const d = dichas.get(i.ref)
    const pedida = Number(d?.elegida)
    // la versión que elige el creativo es la BASE de la edición (no una aprobación); una que no vio cae en su mejor
    const base = Number.isInteger(pedida) && vistas.includes(pedida) ? pedida : i.mejor
    por_ref[i.ref] = { base, cambios: str(d?.cambios).trim(), vistas }
  }
  return { costo_usd: 0, artefacto: { vuelta: vueltaEnCurso(c), por_ref } }
}

/** ¿hay que llamar al creativo? Si no queda ninguna imagen pendiente en la tanda vigente (todas cerradas, o la regeneración no rehizo ninguna), el paso se salta sin llamar a nadie
 *  y deja un pedido vacío: la edición no edita nada y la mirada no mira nada · pura */
export function saltoDeLaCorreccion(e: Estado, dry_run = false): ResultadoDePaso | null {
  const c = correccionesVigentes(e)
  // en ensayo las imágenes son simuladas: no hay nada que mirar ni que corregir (como la revisión de las imágenes clave del video); la cola sigue con las generadas
  if (dry_run) return { costo_usd: 0, artefacto: { vuelta: vueltaEnCurso(c), por_ref: {}, en_ensayo: true } }
  if (pendientesDe(c).length) return null
  return { costo_usd: 0, artefacto: { vuelta: vueltaEnCurso(c), por_ref: {}, sin_pendientes: true } }
}

/** la respuesta del creativo no se pudo leer tras su reintento: nadie edita en esta vuelta y la mirada de otro proveedor juzga lo que hay (nunca se cae el encargo) */
export function sinLecturaDeLaCorreccion(e: Estado, errores: string[]): ResultadoDePaso {
  const c = correccionesVigentes(e)
  const por_ref: Record<string, { base: number; cambios: string; vistas: number[] }> = {}
  for (const i of loteDe(c)) por_ref[i.ref] = { base: i.mejor, cambios: '', vistas: vistasDe(i, c.donde) }
  return {
    costo_usd: 0, artefacto: { vuelta: vueltaEnCurso(c), por_ref, sin_lectura: true },
    fichas: [fichaNueva(`correccion-sin-lectura-${e.pasos_ejecutados}`, 'chequeo', 'imagen', 'sugerencia', `la respuesta del creativo sobre las imágenes no se pudo leer (${errores.join(' · ')}): en esta vuelta no se editó nada`)],
  }
}

// ───────────────────────── 2 · la edición (paso de código)

/** la llave de una edición: una por (encargo, imagen, vuelta), de largo fijo (la huella md5 de los tres), para que quepa en `agent_image_generations.caller` (40): «ed:» + 32 = 35 */
// la tanda (intento de las imágenes) va en la llave: tras una devolución de la jefatura la vuelta vuelve a 1 y, sin ella, la tanda nueva reusaría la edición de la imagen rechazada (CC6 · 🔴 #1250)
export const llaveDeLaEdicion = (encargoId: string, intento: number, ref: string, vuelta: number): string => `ed:${createHash('md5').update(`${encargoId}|${intento}|${ref}|${vuelta}`).digest('hex')}`

/** el pedido de la edición: lo que se pidió más «cambia SOLO esto» */
export const promptDeLaCorreccion = (prompt: string, cambios: string): string =>
  `${prompt}\n\nEdit the attached image (the first one). Change ONLY this, keep everything else exactly as it is: ${cambios}`

/** las fotos que viajan con la base generada: la foto real que fue base de la imagen, PRIMERA, y después las otras; nunca más de `MAX_OTRAS_FOTOS` (15) · pura */
export function fotosDeLaEdicion(real: FotoDeReferencia | null, otras: FotoDeReferencia[]): FotoDeReferencia[] {
  const lista = [...(real ? [real] : []), ...otras.filter((f) => f.id !== real?.id)]
  // corte: la edición acepta 16 fotos (la base generada + 15), condición 5 de CC6 al diseño v2 del punto 3; se quedan las primeras (la real va primera) · firma CC1 2026-11-20
  return lista.slice(0, MAX_OTRAS_FOTOS)
}

interface FotoConUrl { id: string; url?: string | null }
/** las otras fotos reales que nombró quien escribió el prompt de esta imagen (las mismas que viajaron al generarla) */
function otrasDeLaImagen(e: Estado, i: ImagenEnCorreccion, propias: FotoConUrl[], real: FotoDeReferencia | null): FotoDeReferencia[] {
  // la imagen clave guarda las otras fotos que viajaron con su base (personajes, productos, lugares): son las mismas que viajan con la edición
  if (dondeDe(e) === 'video') {
    return arr<string>(i.item.otras_referencias_ids).flatMap((id) => { const f = fotoPorId(propias, id); return f?.url && f.id !== real?.id ? [{ id: f.id, url: f.url }] : [] })
  }
  const pv = datos(e, 'prompts_validos')
  const porRef = (pv?.por_ref ?? null) as Record<string, { prompts?: Array<{ foto_de_referencia?: string; otras_fotos_de_referencia?: string[] }> }> | null
  const nombradas = (p?: { foto_de_referencia?: string; otras_fotos_de_referencia?: string[] }) => [p?.foto_de_referencia, ...(p?.otras_fotos_de_referencia ?? [])]
  let deEsta: Array<string | undefined> = []
  let deLaPieza: Array<string | undefined> = []
  if (porRef) {
    deEsta = nombradas(porRef[i.ref]?.prompts?.[0])
    deLaPieza = Object.values(porRef).flatMap((x) => nombradas(x.prompts?.[0]))
  } else {
    const vf = arr<{ foto_de_referencia?: string; otras_fotos_de_referencia?: string[] }>(pv?.prompts)
    deEsta = nombradas(vf[Number(i.item.prompt_idx ?? 0)])
    deLaPieza = vf.flatMap(nombradas)
  }
  return otrasFotosDeLaImagen(propias as never, real, deEsta, deLaPieza).otras
}

export interface SalidaDeLaEdicion { res: ResultadoDePaso; gastos: NonNullable<Cambios['gastos']> }

/** edita SOBRE la versión elegida las imágenes con cambios pedidos · en seco no llama al generador · una edición ya pagada (misma llave) se reusa */
export async function editarImagenes(P: Puertos, enc: Encargo, pl?: Pick<Plantilla, 'limites'>): Promise<SalidaDeLaEdicion> {
  const e = enc.estado_del_motor
  const c = correccionesVigentes(e)
  // la imagen clave editada sale con la MISMA calidad y forma que la final (DATO `limites.imagen_clave.final`): el clip arranca de ella
  const calidad = c.donde === 'video' ? calidadDeLaFase(pl?.limites as Record<string, unknown> | undefined, 'final') : null
  const vuelta = vueltaEnCurso(c)
  const pedido = (datos(e, ARTEFACTO_PEDIDO_DE_CORRECCION)?.por_ref ?? {}) as Record<string, { base: number; cambios: string }>
  const propias = arr<FotoConUrl>((datos(e, 'encargo') as { F?: { fotos?: unknown } } | undefined)?.F?.fotos)
  const por_ref: Record<string, { version?: VersionDeImagen; costo_usd: number; llave: string; reusada?: boolean; error?: string }> = {}
  const gastos: NonNullable<Cambios['gastos']> = []
  let costo = 0
  for (const i of loteDe(c)) {
    const p = pedido[i.ref]
    if (!p || !p.cambios) continue
    const llave = llaveDeLaEdicion(enc.id, c.intento_imagenes, i.ref, vuelta)
    const base = i.versiones[p.base] ?? i.versiones[i.mejor]
    if (enc.dry_run) { por_ref[i.ref] = { version: { vuelta, url: `${base.url}#simulada-v${vuelta}`, generation_id: null, simulada: true }, costo_usd: 0, llave }; continue }
    const ya = P.imagenYaPedida ? await P.imagenYaPedida({ llave, client_id: enc.client_id }) : null
    if (ya) {
      por_ref[i.ref] = { version: { vuelta, url: ya.url, generation_id: ya.generation_id }, costo_usd: ya.costo_usd, llave, reusada: true }
      costo += ya.costo_usd
      gastos.push({ concepto: 'imagen', ref_tabla: 'agent_image_generations', ref_id: ya.generation_id, cost_usd: ya.costo_usd, base: 'usage' })
      continue
    }
    // 26-nov · el id acortado se guarda ENTERO: así la base no vuelve a viajar como «otra» (observación de la revisión de #1287)
    const fReal = i.foto_real_id ? fotoPorId(propias, i.foto_real_id) : undefined
    const real: FotoDeReferencia | null = fReal?.url ? { id: fReal.id, url: fReal.url } : null
    const otras = fotosDeLaEdicion(real, otrasDeLaImagen(e, i, propias, real))
    const g = await P.imagen({ prompt: promptDeLaCorreccion(i.prompt, p.cambios), client_id: enc.client_id, encargo_id: enc.id, dry_run: false, foto: { id: `version-${p.base}`, url: base.url }, ...(otras.length ? { otras_fotos: otras } : {}), ...(calidad ? { size: calidad.size, quality: calidad.quality } : {}), llave })
    if (!g.ok) { por_ref[i.ref] = { costo_usd: 0, llave, error: g.error }; continue }
    por_ref[i.ref] = { version: { vuelta, url: g.url, generation_id: g.generation_id }, costo_usd: g.costo_usd, llave }
    costo += g.costo_usd
    gastos.push({ concepto: 'imagen', ref_tabla: 'agent_image_generations', ref_id: g.generation_id, cost_usd: g.costo_usd, base: 'usage' })
  }
  return { res: { costo_usd: +costo.toFixed(6), artefacto: { vuelta, por_ref } }, gastos }
}

// ───────────────────────── 3 · la mirada de otro proveedor (paso de código)

/** lo que se le pide al revisor de otro proveedor: con edición compara A (antes) y B (después); sin edición juzga la única */
export function pedidoDeLaMirada(prompt: string, cambios: string, dosVersiones: boolean): string {
  return [
    'You are reviewing an image for a client piece. Look at the image(s) and answer ONLY with JSON.',
    `What was asked for the image: ${prompt || '(no prompt)'}`,
    ...(dosVersiones
      ? [`Image A is the previous version. Image B is an edit of A that was asked to change ONLY this: ${cambios}`,
        'Answer {"mejor": "A" or "B", "queda_bien": true/false, "lectura": "<what you see, short>"}. "mejor" is the version that better matches what was asked (and keeps the real product). "queda_bien" is true only if the better one needs no more changes.']
      : ['Answer {"queda_bien": true/false, "lectura": "<what you see and what is still missing, short>"}. "queda_bien" is true only if it already matches what was asked and needs no changes.']),
  ].join('\n')
}

export function leerLaMirada(texto: string): { mejor?: 'A' | 'B'; queda_bien?: boolean; lectura: string } | null {
  const m = texto.match(/\{[\s\S]*\}/)
  if (!m) return null
  try {
    const j = JSON.parse(m[0]) as Record<string, unknown>
    if (typeof j.queda_bien !== 'boolean') return null
    const mejor = j.mejor === 'A' || j.mejor === 'B' ? j.mejor : undefined
    return { queda_bien: j.queda_bien, ...(mejor ? { mejor } : {}), lectura: str(j.lectura) }
  } catch { return null }
}

/** ¿cabe OTRA vuelta (o turno) entera (mirada del creativo + edición + mirada de otro proveedor, cada paso a su tope) MÁS todo lo que sigue después de la corrección
 *  (`loQueSigueDespuesDelPaso`: en el video, el clip, la revisión, la mirada del video y la jefatura) en el tope del encargo? Si cabe, ningún paso de la vuelta ni de lo
 *  que sigue dispara el freno del motor; si no cabe, no se vuelve: sale la mejor de cada imagen con `no_cupo` y el encargo sigue (20-nov · CC6 🔴 #1254) · pura */
export function cabeOtraVuelta(pl: Plantilla, e: Estado, gastoTrasEstaMirada: number): boolean {
  const paso = pl.pasos.find((p) => p.clave === PASO_MIRAR_CORRECCION)
  // al motor le tienen que quedar vueltas de este paso: si la jefatura devolvió la pieza a la mesa, la cuenta del encargo sigue (el motor no la reinicia)
  if (!paso || !quedaVueltaDelPaso(paso, e)) return false
  return cabeLaVuelta(pl, { ...e, gasto_usd: gastoTrasEstaMirada }, costoDeVolver(pl, paso) + loQueSigueDespuesDelPaso(pl, PASO_MIRAR_CORRECCION, e))
}

/** la mejor versión de cada imagen → `imagenes` con la misma forma de siempre (una versión por imagen, en la misma tanda): la cola de siempre la toma sin cambios · pura */
export function imagenesConLaMejor(e: Estado, c: Correcciones): Record<string, unknown> {
  const im = datos(e, 'imagenes') ?? {}
  const otras = arr<Record<string, unknown>>(im.items).filter((x) => Number(x.intento) !== c.intento_imagenes)
  const items = [...otras]
  for (const i of Object.values(c.imagenes)) {
    const v = i.versiones[i.mejor] ?? i.versiones[0]
    if (!v) continue
    items.push({ ...i.item, indice: items.length, url: v.url, generation_id: v.generation_id ?? i.item.generation_id ?? null, ...(v.vuelta ? { corregida_en_la_vuelta: v.vuelta } : {}) })
  }
  return { ...im, items, ultimo_intento: c.intento_imagenes }
}

/**
 * la mejor versión de cada plano → `imagenes_clave_final` con la misma forma de siempre: `url` e `imagenes` apuntan a la mejor (lo que leen la revisión, el clip
 * y la mirada del video), con la marca de la tanda para que la reescritura no abra una tanda nueva. Los planos sin imagen y el resto de los datos quedan igual · pura
 */
export function imagenesClaveConLaMejor(e: Estado, c: Correcciones): Record<string, unknown> {
  const d = (datos(e, PASO_IMAGENES_CLAVE_FINAL) ?? {}) as Record<string, unknown>
  const planos = arr<Record<string, unknown>>(d.planos).map((p) => {
    const i = c.imagenes[refDelPlano(Number(p.n))]
    const v = i ? i.versiones[i.mejor] : undefined
    if (!v || !v.vuelta) return p
    return { ...p, url: v.url, imagenes: [v.url], generation_id: v.generation_id ?? p.generation_id ?? null, corregida_en_la_vuelta: v.vuelta, ...(str(p.url) && str(p.url) !== v.url ? { generada_url: p.url } : {}) }
  })
  return { ...d, planos, tanda_de_correccion: c.intento_imagenes }
}

export interface SalidaDeLaMirada { res: ResultadoDePaso; gastos: NonNullable<Cambios['gastos']> }

/** la mirada de otro proveedor decide cada imagen pendiente, y si hay otra vuelta (quedan vueltas + alguna pendiente + cabe) */
export async function mirarCorreccion(P: Puertos, enc: Encargo, pl: Plantilla): Promise<SalidaDeLaMirada> {
  const e = enc.estado_del_motor
  const c0 = correccionesVigentes(e)
  const c: Correcciones = structuredClone(c0)
  const vuelta = vueltaEnCurso(c0)
  // en ensayo (el creativo se saltó: imágenes simuladas) no se mira nada ni se reescribe `imagenes`: la cola sigue con las generadas, sin otra vuelta
  if (enc.dry_run && datos(e, ARTEFACTO_PEDIDO_DE_CORRECCION)?.en_ensayo === true) return { res: { costo_usd: 0, artefacto: { ...c, sigue: false, en_ensayo: true } as unknown as Record<string, unknown> }, gastos: [] }
  const pedido = (datos(e, ARTEFACTO_PEDIDO_DE_CORRECCION)?.por_ref ?? {}) as Record<string, { base: number; cambios: string; vistas?: number[] }>
  const ediciones = (datos(e, ARTEFACTO_EDICIONES_DE_IMAGEN)?.por_ref ?? {}) as Record<string, { version?: VersionDeImagen; costo_usd: number; llave: string; error?: string }>
  const gastos: NonNullable<Cambios['gastos']> = []
  const fichas: Ficha[] = []
  let costo = 0
  const cerrar = (i: ImagenEnCorreccion, motivo: MotivoDeCierre) => { i.cerrada = true; i.motivo_de_cierre = motivo }
  const lote = loteDe(c)
  for (const i of lote) {
    const p = pedido[i.ref] ?? { base: i.mejor, cambios: '' }
    const ed = ediciones[i.ref]
    const base = p.base in i.versiones ? p.base : i.mejor
    i.ultimos_cambios = p.cambios || i.ultimos_cambios
    const fila: FilaDeCorreccion = { ref: i.ref, vuelta, vistas: p.vistas ?? vistasDe(i, c.donde), elegida: base, queda_bien: null, cambios: p.cambios, version_nueva: null, costo_usd: ed?.costo_usd ?? 0, agente: agenteQueCorrige(c.donde), llave: ed?.llave ?? null, donde: c.donde }
    if (p.cambios && ed?.error) {
      // el generador no devolvió la edición: sale la mejor que hay, con su aviso (sin reintentar a ciegas)
      i.mejor = base
      cerrar(i, 'fallo_la_edicion')
      fichas.push(fichaNueva(`correccion-fallo-${i.ref}-${vuelta}`, 'chequeo', 'imagen', 'sugerencia', `no se pudo editar la imagen «${i.ref}» (${ed.error}): sale la mejor versión que había`, 'corrección de la imagen', `quedó pendiente: ${p.cambios}`))
    } else {
      const nueva = p.cambios && ed?.version ? ed.version : null
      const urls = nueva ? [i.versiones[base].url, nueva.url] : [i.versiones[base].url]
      const rr = await P.revisor({ texto: pedidoDeLaMirada(i.prompt, p.cambios, !!nueva), imagenes_urls: urls, dry_run: enc.dry_run, client_id: enc.client_id, ref_id: enc.id, n: vuelta })
      if ((rr.costo_usd ?? 0) > 0) { costo += rr.costo_usd ?? 0; gastos.push({ concepto: 'revisor_externo', ref_tabla: null, ref_id: null, cost_usd: rr.costo_usd ?? 0, base: 'usage' }) }
      const m = rr.ok ? leerLaMirada(rr.texto) : null
      if (nueva) { i.versiones.push(nueva); fila.version_nueva = i.versiones.length - 1 }
      if (!m) {
        // nadie pudo juzgar: no se elige a ciegas la editada; sale la base y una persona mira
        i.mejor = base
        cerrar(i, 'sin_lectura')
        fichas.push(fichaNueva(`correccion-sin-mirada-${i.ref}-${vuelta}`, 'chequeo', 'imagen', 'sugerencia', `nadie de otro proveedor pudo mirar la imagen «${i.ref}» (${rr.ok ? 'respuesta ilegible' : rr.error ?? 'sin respuesta'}): sale la versión elegida, sin confirmar`, 'corrección de la imagen', p.cambios ? `quedó pendiente: ${p.cambios}` : 'que una persona la mire'))
      } else {
        fila.queda_bien = m.queda_bien ?? null
        i.lectura = m.lectura
        if (nueva && m.mejor === 'A') { i.mejor = base; cerrar(i, 'no_mejoro') }
        else {
          i.mejor = nueva ? (fila.version_nueva as number) : base
          if (m.queda_bien) cerrar(i, nueva ? 'queda_bien' : 'sin_cambios')
          else if (vuelta >= VUELTAS_DE_CORRECCION_IMAGEN) cerrar(i, 'tope_de_vueltas')
        }
      }
    }
    if (i.motivo_de_cierre) fila.motivo_de_cierre = i.motivo_de_cierre
    c.filas.push(fila)
  }
  const pendientes = pendientesDe(c)
  const gastoTras = +(e.gasto_usd + costo).toFixed(6)
  const pasoMirar = pl.pasos.find((p) => p.clave === PASO_MIRAR_CORRECCION)
  // ¿la vuelta en curso terminó? Si quedan pendientes que no pasaron por ella (no cabían en el pedido), el próximo turno es de la MISMA vuelta
  const hechas = [...(c.hechas_en_la_vuelta ?? []), ...lote.map((i) => i.ref)]
  const otroTurno = pendientes.some((i) => !hechas.includes(i.ref))
  if (otroTurno) c.hechas_en_la_vuelta = hechas
  else { c.vuelta = vuelta; c.hechas_en_la_vuelta = [] }
  const cabe = pendientes.length > 0 && (otroTurno || vuelta < VUELTAS_DE_CORRECCION_IMAGEN) && cabeOtraVuelta(pl, e, gastoTras)
  // sin vueltas: se acabaron las 3 (solo al terminar la vuelta) o el techo del motor
  const sinVueltas = (!otroTurno && vuelta >= VUELTAS_DE_CORRECCION_IMAGEN) || !pasoMirar || !quedaVueltaDelPaso(pasoMirar, e)
  if (pendientes.length && !cabe) for (const i of pendientes) { cerrar(i, sinVueltas ? 'tope_de_vueltas' : 'no_cupo'); const f = c.filas.find((x) => x.ref === i.ref && x.vuelta === vuelta); if (f) f.motivo_de_cierre = i.motivo_de_cierre }
  for (const i of Object.values(c.imagenes)) {
    if (i.motivo_de_cierre !== 'tope_de_vueltas' && i.motivo_de_cierre !== 'no_cupo') continue
    if (c0.imagenes[i.ref]?.cerrada) continue
    fichas.push(fichaNueva(`correccion-pendiente-${i.ref}`, 'chequeo', 'imagen', 'sugerencia', `la imagen «${i.ref}» sale con la mejor versión ${i.motivo_de_cierre === 'no_cupo' ? '(otra vuelta no cupo en el tope del encargo)' : `tras ${vuelta} vuelta${vuelta === 1 ? '' : 's'} (no quedan más)`}`, 'corrección de la imagen', `quedó pendiente: ${i.ultimos_cambios || i.lectura || '(sin detalle)'}`))
  }
  c.sigue = cabe
  const res: ResultadoDePaso = { costo_usd: +costo.toFixed(6), artefacto: c as unknown as Record<string, unknown>, ...(fichas.length ? { fichas } : {}) }
  // terminó: la cola de siempre recibe la mejor versión de cada imagen
  // (sin imágenes de esta tanda no se reescribe `imagenes`: no hay nada que cambiar)
  if (!cabe && Object.keys(c.imagenes).length) res.otros_artefactos = c.donde === 'video' ? { [PASO_IMAGENES_CLAVE_FINAL]: imagenesClaveConLaMejor(e, c) } : { imagenes: imagenesConLaMejor(e, c) }
  return { res, gastos }
}

// ───────────────────────── la plantilla

/** los tres pasos, con la condición de las imágenes generadas (la misma de `observar`) · la vuelta vuelve a `corregir_imagen` mientras `sigue` (máx. vueltas − 1 regresos) */
export function pasosDeLaCorreccion(generada: Paso['condicion'], pl: Pick<Plantilla, 'limites'>, techo: number = VUELTAS_DE_CORRECCION_IMAGEN - 1): Paso[] {
  const n = Number(pl.limites.imagenes_generadas_max ?? 2)
  return [
    { clave: PASO_CORREGIR_IMAGEN, tipo: 'agente', quien: AGENTE_QUE_CORRIGE_LA_IMAGEN, condicion: structuredClone(generada), entrada: ['imagenes'], salida_artefacto: ARTEFACTO_PEDIDO_DE_CORRECCION, tope_usd: TOPE_DE_LA_MIRADA_DEL_CREATIVO_USD, salida: { esquema: ESQUEMA_CORRECCION_IMAGEN, reintento_formato: 1 } },
    { clave: PASO_EDITAR_IMAGEN, tipo: 'codigo', quien: 'sala', funcion: FUNCION_EDITAR_IMAGEN, condicion: structuredClone(generada), entrada: [ARTEFACTO_PEDIDO_DE_CORRECCION], salida_artefacto: ARTEFACTO_EDICIONES_DE_IMAGEN, tope_usd: +(n * COSTO_ESTIMADO_POR_EDICION_USD).toFixed(4) },
    { clave: PASO_MIRAR_CORRECCION, tipo: 'codigo', quien: 'sala', funcion: FUNCION_MIRAR_CORRECCION, condicion: structuredClone(generada), entrada: [ARTEFACTO_EDICIONES_DE_IMAGEN], salida_artefacto: ARTEFACTO_CORRECCIONES_DE_IMAGEN, tope_usd: +(n * COSTO_RESERVADO_POR_MIRADA_DE_OTRO_PROVEEDOR_USD).toFixed(4),
      vuelve_a: { paso: PASO_CORREGIR_IMAGEN, max: techo, si: { tipo: 'si_artefacto', artefacto: ARTEFACTO_CORRECCIONES_DE_IMAGEN, campo: 'sigue', igual: true } } },
  ]
}

/** la indicación del creativo cuando mira la imagen final: pide cambios, no califica (lo decide otro proveedor) */
export const INDICACION_DE_LA_CORRECCION = { regla: 'Cuando miras las imágenes finales que pediste, NO las calificas: eliges la versión sobre la que se edita y dices qué cambiar, en lenguaje llano y concreto, para que se parezcan a lo pedido y a la foto real. Si no hay nada que cambiar, no inventes cambios.', aplica: 'guia' } as const

/**
 * 20-nov · decisión LENOVO 12:4x (opción (a) de CC5): la cuenta que decide es POR IMAGEN, en `correcciones_de_imagen` (3 vueltas por tanda, firma de Emilio 23:27).
 * El `max` del motor es solo el TECHO DE SEGURIDAD: 2 regresos por cada pasada que puede hacer la corrección. Pasadas = 1 + los máximos de las vueltas que la ENVUELVEN
 * (hoy la de la jefatura a la mesa, 6): 2 × (1 + 6) = 14. El motor no reinicia contadores, así que con el techo nunca se queda corta una tanda nueva. Puro.
 */
export function techoDeLaCorreccion(pasos: Paso[], desde: number, hasta: number, /** tanda 2 · los turnos en que se puede partir una vuelta (mesa: 1) */ turnos = 1): number {
  const pasadas = 1 + pasos.reduce((s, p, k) => {
    const t = p.vuelve_a ? pasos.findIndex((x) => x.clave === p.vuelve_a!.paso) : -1
    return t >= 0 && t < desde && k > hasta ? s + Number(p.vuelve_a!.max) : s
  }, 0)
  // por pasada: 3 vueltas de hasta `turnos` turnos cada una; el primer turno no es un regreso
  return (VUELTAS_DE_CORRECCION_IMAGEN * turnos - 1) * pasadas
}
/** cuántos pasos de más puede ejecutar la corrección en el peor caso: el techo de regresos × 3 pasos, más 2 de holgura (reintentos de formato de la mirada del creativo) */
export const margenDeLaCorreccion = (techo: number): number => techo * 3 + 2
/** sin vueltas que la envuelvan (una pasada): 2 × 3 + 2 = 8 */
export const MARGEN_DE_LA_CORRECCION = margenDeLaCorreccion(VUELTAS_DE_CORRECCION_IMAGEN - 1)

/** la mesa de imagen → la misma con la corrección entre `imagen` y `observar` (ubicada por CLAVE, no por posición) · pura · si ya la tiene, la devuelve igual */
export function conCorreccionDeImagen(pl: Plantilla): Plantilla {
  if (pl.pasos.some((p) => p.clave === PASO_CORREGIR_IMAGEN)) return structuredClone(pl)
  const pasos = structuredClone(pl.pasos)
  const i = pasos.findIndex((p) => p.clave === 'imagen')
  const j = pasos.findIndex((p) => p.clave === 'observar')
  if (i < 0 || j !== i + 1) throw new Error(`la plantilla ${pl.familia} no tiene «imagen» seguida de «observar»`)
  // las vueltas que envuelven a la corrección: destino en o antes de `imagen` y origen en o después de `observar` (índices de antes de insertar)
  const techo = techoDeLaCorreccion(pasos, i + 1, j - 1)
  pasos.splice(j, 0, ...pasosDeLaCorreccion(pasos[i].condicion, pl, techo))
  const indicaciones = structuredClone(pl.indicaciones ?? {}) as Plantilla['indicaciones']
  const propias = indicaciones[AGENTE_QUE_CORRIGE_LA_IMAGEN] ?? []
  if (!propias.some((r) => r.regla === INDICACION_DE_LA_CORRECCION.regla)) indicaciones[AGENTE_QUE_CORRIGE_LA_IMAGEN] = [...propias, structuredClone(INDICACION_DE_LA_CORRECCION)]
  return { ...structuredClone(pl), pasos, indicaciones, limites: { ...structuredClone(pl.limites), margen: Number(pl.limites.margen ?? 0) + margenDeLaCorreccion(techo), vueltas_de_correccion_imagen: VUELTAS_DE_CORRECCION_IMAGEN } as Plantilla['limites'] }
}

// ───────────────────────── tanda 2 · la plantilla del video
// los topes del video crecen con el largo (`limites.video.segundos_max`), como las imágenes clave. PROPUESTA de CC1 (16:3xZ), pendiente de la decisión de Lenovo:
//   en prd no hay ninguna imagen clave final real que medir (los 2 videos reales son los reels quietos); se parte de la tanda de imágenes clave (0,2/s) y de la mirada
//   de otro proveedor de la tanda 1 (0,26 por imagen), contando un plano por segundo (el peor caso)
/** la edición de las imágenes clave reserva lo mismo que una tanda de imágenes clave (`imagenes_clave_final`): como mucho, una edición por plano por vuelta */
export const TOPE_DE_LA_EDICION_DE_IMAGEN_CLAVE_POR_SEGUNDO_USD = 0.2
/** la mirada de otro proveedor: 0,26 por plano, contando un plano por segundo */
export const TOPE_DE_LA_MIRADA_DE_IMAGEN_CLAVE_POR_SEGUNDO_USD = COSTO_RESERVADO_POR_MIRADA_DE_OTRO_PROVEEDOR_USD
/** lo que suma al tope del encargo UNA pasada de la corrección (las vueltas 2 y 3 se saltan si no caben): el creativo fijo y lo demás por segundo */
export const TOPE_FIJO_DE_LA_CORRECCION_DEL_VIDEO_USD = TOPE_DE_LA_MIRADA_DEL_CREATIVO_USD
/** tanda 2 · la vuelta 1 se parte en turnos (un turno del director por cada `MAX_IMAGENES` imágenes): el director de los turnos que siguen al primero, por segundo
 *  (0,75 × 2 imágenes por plano ÷ 20 por pedido = 0,075). Así una pasada cubre el turno fijo más uno por cada 10 s */
export const TOPE_DEL_DIRECTOR_POR_SEGUNDO_USD = +((TOPE_DE_LA_MIRADA_DEL_CREATIVO_USD * 2) / MAX_IMAGENES).toFixed(4)
/**
 * 20-nov · LENOVO 18:30Z, opción (a) (tras el 🔴 de CC6): la edición y la mirada de UN turno topan por TURNO, no por segundo. Un turno lleva como mucho `MAX_IMAGENES` planos
 * (sin foto real, una imagen por plano), así que 20 × 0,2 = 4,0 y 20 × 0,26 = 5,2. Con los topes por segundo (24 y 31,2 a 120 s) cada turno reservaba la pieza entera y,
 * con lo que sigue guardado, la vuelta 1 no llegaba a todos los planos en el peor caso. El tope del ENCARGO sigue por segundo (cubre todos los turnos de una pasada)
 */
export const PLANOS_MAX_POR_TURNO = MAX_IMAGENES
export const TOPE_DE_LA_EDICION_DE_IMAGEN_CLAVE_POR_TURNO_USD = +(PLANOS_MAX_POR_TURNO * TOPE_DE_LA_EDICION_DE_IMAGEN_CLAVE_POR_SEGUNDO_USD).toFixed(4)
export const TOPE_DE_LA_MIRADA_DE_IMAGEN_CLAVE_POR_TURNO_USD = +(PLANOS_MAX_POR_TURNO * TOPE_DE_LA_MIRADA_DE_IMAGEN_CLAVE_POR_SEGUNDO_USD).toFixed(4)
export const TOPE_DE_LA_CORRECCION_DEL_VIDEO_POR_SEGUNDO_USD = +(TOPE_DE_LA_EDICION_DE_IMAGEN_CLAVE_POR_SEGUNDO_USD + TOPE_DE_LA_MIRADA_DE_IMAGEN_CLAVE_POR_SEGUNDO_USD + TOPE_DEL_DIRECTOR_POR_SEGUNDO_USD).toFixed(4)
/**
 * lo ESPERADO de la corrección en un video (sube `reserva_por_pieza_usd` de video_mesa, punto 1 de CC6; no es el peor caso): la cuenta de la tanda 1 con 15 planos
 * (un reel de 15 s a un plano por segundo; no hay ninguna imagen clave final real en prd que medir): vuelta 1 = 2 turnos × 0,15 + 15 × 0,0493 ≈ 1,04 · vuelta 2 = 1 × 0,15 +
 * 7,5 × 0,0493 ≈ 0,52 → 1,56 → 1,6. Con historia, manda el promedio real (`reservasDesdeLaHistoria`)
 */
export const RESERVA_POR_VIDEO_DE_LA_CORRECCION_USD = 1.6

/** la indicación del director cuando mira las imágenes clave que pidió: pide cambios, no califica (lo decide otro proveedor) */
export const INDICACION_DE_LA_CORRECCION_DEL_VIDEO = { regla: 'Cuando miras las imágenes clave que pediste en la hoja de planos, NO las calificas: eliges la versión sobre la que se edita y dices qué cambiar, en lenguaje llano y concreto, para que cada una cumpla su plano y se parezca a la foto real. Si no hay nada que cambiar, no inventes cambios.', aplica: 'guia' } as const

/** los tres pasos del video: los de la mesa, con quien corrige, la fuente y los topes POR TURNO (opción (a) de Lenovo 18:30Z) · puro */
export function pasosDeLaCorreccionDelVideo(condicion: Paso['condicion'], techo: number): Paso[] {
  const [corr, ed, mir] = pasosDeLaCorreccion(condicion, { limites: { imagenes_generadas_max: 0 } } as never, techo)
  return [
    { ...corr, quien: AGENTE_QUE_CORRIGE_LA_IMAGEN_CLAVE, entrada: [PASO_IMAGENES_CLAVE_FINAL] },
    { ...ed, tope_usd: TOPE_DE_LA_EDICION_DE_IMAGEN_CLAVE_POR_TURNO_USD },
    { ...mir, tope_usd: TOPE_DE_LA_MIRADA_DE_IMAGEN_CLAVE_POR_TURNO_USD },
  ]
}

/** cuántas imágenes ve el director por plano en el peor caso: la elegida y su foto real */
export const IMAGENES_POR_PLANO_EN_EL_PEDIDO = 2
/** en cuántos turnos se puede partir una vuelta del video: un plano por segundo de la pieza más larga (el peor caso, como los topes), `MAX_IMAGENES` por pedido · pura */
export const turnosDeLaVueltaDelVideo = (segundosMax: number, max: number = MAX_IMAGENES): number =>
  Math.max(1, Math.ceil((Math.max(1, Math.ceil(segundosMax)) * IMAGENES_POR_PLANO_EN_EL_PEDIDO) / Math.max(1, max)))

/** suma lo mismo a cada resolución del tope por segundo del encargo (número o por resolución) · pura */
const sumarPorSegundo = (x: unknown, mas: number): unknown =>
  typeof x === 'number' ? +(x + mas).toFixed(4)
    : x && typeof x === 'object' ? Object.fromEntries(Object.entries(x as Record<string, unknown>).map(([k, v]) => [k, typeof v === 'number' ? +(v + mas).toFixed(4) : v]))
      : mas

/** la mesa de video → la misma con la corrección entre `imagenes_clave_final` y `revisar_imagenes_clave` (ubicada por CLAVE) · pura · si ya la tiene, la devuelve igual */
export function conCorreccionDeImagenClave(pl: Plantilla): Plantilla {
  if (pl.pasos.some((p) => p.clave === PASO_CORREGIR_IMAGEN)) return structuredClone(pl)
  const pasos = structuredClone(pl.pasos)
  const i = pasos.findIndex((p) => p.clave === PASO_IMAGENES_CLAVE_FINAL)
  const j = pasos.findIndex((p) => p.clave === PASO_REVISAR_IMAGENES_CLAVE)
  if (i < 0 || j !== i + 1) throw new Error(`la plantilla ${pl.familia} no tiene «${PASO_IMAGENES_CLAVE_FINAL}» seguida de «${PASO_REVISAR_IMAGENES_CLAVE}»`)
  const turnos = turnosDeLaVueltaDelVideo(Number((pl.limites.video as { segundos_max?: unknown } | undefined)?.segundos_max ?? 15))
  const techo = techoDeLaCorreccion(pasos, i + 1, j - 1, turnos)
  // la misma condición que la revisión: solo si hay imágenes clave REALES (en ensayo son simuladas y los tres pasos no corren)
  pasos.splice(j, 0, ...pasosDeLaCorreccionDelVideo(pasos[j].condicion, techo))
  const indicaciones = structuredClone(pl.indicaciones ?? {}) as Plantilla['indicaciones']
  const propias = indicaciones[AGENTE_QUE_CORRIGE_LA_IMAGEN_CLAVE] ?? []
  if (!propias.some((r) => r.regla === INDICACION_DE_LA_CORRECCION_DEL_VIDEO.regla)) indicaciones[AGENTE_QUE_CORRIGE_LA_IMAGEN_CLAVE] = [...propias, structuredClone(INDICACION_DE_LA_CORRECCION_DEL_VIDEO)]
  const l = structuredClone(pl.limites) as Record<string, unknown>
  return {
    ...structuredClone(pl), pasos, indicaciones,
    limites: {
      ...l,
      margen: Number(l.margen ?? 0) + margenDeLaCorreccion(techo),
      vueltas_de_correccion_imagen: VUELTAS_DE_CORRECCION_IMAGEN,
      turnos_de_correccion_imagen: turnos,
      ...(typeof l.reserva_por_pieza_usd === 'number' ? { reserva_por_pieza_usd: +(l.reserva_por_pieza_usd + RESERVA_POR_VIDEO_DE_LA_CORRECCION_USD).toFixed(4) } : {}),
      tope_encargo_usd: +(Number(l.tope_encargo_usd ?? 0) + TOPE_FIJO_DE_LA_CORRECCION_DEL_VIDEO_USD).toFixed(4),
      ...(l.tope_encargo_usd_por_segundo !== undefined ? { tope_encargo_usd_por_segundo: sumarPorSegundo(l.tope_encargo_usd_por_segundo, TOPE_DE_LA_CORRECCION_DEL_VIDEO_POR_SEGUNDO_USD) } : {}),
    } as unknown as Plantilla['limites'],
  }
}
