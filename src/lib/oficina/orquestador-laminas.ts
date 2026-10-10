/**
 * EL ORQUESTADOR DE LÁMINAS · lo que el orquestador de la sala 1 delega cuando la plantilla es de varias láminas (sala 2 «carrusel» y sala 3 «historias y estados»).
 * Mismo motor, mismos puertos, mismas reglas de oficio (dry_run no llama a nadie, nadie pregunta al cliente, el formato y el contrato los hace cumplir el CÓDIGO); aquí solo viven las
 * FUNCIONES de código y el tratamiento de la salida de cada agente de esas plantillas. Diseño: docs/DISENO-2026-10-09-oficina-salas-2-3-4.md §2, §3, §4.
 * No publica en ninguna red: la entrega (sala 4) deja los archivos y la hoja de pasos para publicar A MANO.
 */
import { datos, fichaNueva, reglasParaPrompts, reglasVisuales } from './ayudas'
import { elementosDelKit, esCarrusel, esKitDeHistorias, fechaLimiteDelBrief, parsearBrief, prohibePersonas, protagonistasDelBrief, proporcionDelBrief, type BriefLeido, type ElementoDelKit } from './brief'
import { aUtc, chequeosDeEntrega, leerMedidas, manifiesto, nombreDeArchivo, textoParaCopiar, type ArchivoDeEntrega, type FilaDeFormato } from './entrega'
import { candidatasFoto, confianzaDeLaFoto } from './fotos'
import {
  armarLaminasDeCarrusel, armarLaminasDeKit, chequeosDeLaminas, problemasDeContrato, problemasDeHistoria, problemasDeKit, refsInvalidos, textoFueraDelAutor,
  type ElementoDeCopyKit, type ElementoDeEstructura, type ImagenDeRef, type Lamina,
} from './laminas'
import type { ResultadoDePaso } from './motor'
import { construirTareaLaminas, fuentesDelCiegoLaminas, INSTRUCCION_DEL_CIEGO_LAMINAS, type ContextoLaminas } from './pedidos-laminas'
import type { Cambios, Encargo, FuentesCompletas, Puertos } from './puertos'
import { chequearPrompts, citasExisten, elegirVersion, veredictoDeImagenes, type ObservacionDeImagen, type ReglasDeImagen } from './reglas-de-imagen'
import { ROLES_DE_LAMINA } from './salida'
import type { Estado, Ficha, Paso, Plantilla } from './tipos'

export type FamiliaDeLaminas = 'carrusel' | 'kit'
/** la plantilla es de varias láminas si es una de estas dos (el resto de las familias las atiende el orquestador de la sala 1) */
export const familiaDeLaminas = (pl: Pick<Plantilla, 'familia'>): FamiliaDeLaminas | null => (pl.familia === 'carrusel_ig_v1' ? 'carrusel' : pl.familia === 'kit_historias' ? 'kit' : null)

export interface BaseL { brief: BriefLeido; proporcion: string; F: FuentesCompletas; familia: FamiliaDeLaminas; plataforma: string; elementos: ElementoDelKit[] }
const baseL = (e: Estado): BaseL => datos(e, 'encargo') as unknown as BaseL
const arr = <T = Record<string, unknown>>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : [])
const txt = (x: unknown): string => (typeof x === 'string' ? x : x == null ? '' : String(x))
const refsValidosDe = (b: BaseL): string[] => (b.familia === 'kit' ? b.elementos.map((x) => x.ref) : [...ROLES_DE_LAMINA])

interface ImagenDecidida { ref: string; modo: 'real' | 'generada' | 'ninguna'; foto_id?: string; motivo: string }
const direccion = (e: Estado) => datos(e, 'visual_direction') as ({ imagenes?: ImagenDecidida[]; refs_generadas?: string[] } & Record<string, unknown>) | undefined
const refsGeneradas = (e: Estado): string[] => direccion(e)?.refs_generadas ?? []
/** índice de las fotos reales que el curador mira (no chocan con los de las imágenes generadas) */
const BASE_INDICE_REAL = 1000

export function imagenesAMirarL(e: Estado): Array<{ indice: number; url: string; ref: string }> {
  const b = baseL(e)
  const out: Array<{ indice: number; url: string; ref: string }> = []
  const im = datos(e, 'imagenes')
  const ult = (im?.ultimo_intento as number | undefined) ?? 0
  if (ult > 0) for (const x of arr<{ indice: number; intento: number; url: string; ref: string }>(im?.items)) if (x.intento === ult) out.push({ indice: x.indice, url: x.url, ref: x.ref })
  // las fotos reales de confianza no alta se miran UNA vez (la primera)
  if (!datos(e, 'observacion_imagen')) {
    arr<ImagenDecidida>(direccion(e)?.imagenes).filter((i) => i.modo === 'real' && confianzaDeLaFoto(b.F.fotos, i.foto_id) !== 'alta').forEach((i, k) => {
      const f = b.F.fotos.find((x) => x.id === i.foto_id)
      if (f?.url) out.push({ indice: BASE_INDICE_REAL + k, url: f.url, ref: i.ref })
    })
  }
  return out.slice(0, 12)
}
function refDeIndice(e: Estado, indice: number): string | null {
  const b = baseL(e)
  if (indice >= BASE_INDICE_REAL) return arr<ImagenDecidida>(direccion(e)?.imagenes).filter((i) => i.modo === 'real' && confianzaDeLaFoto(b.F.fotos, i.foto_id) !== 'alta')[indice - BASE_INDICE_REAL]?.ref ?? null
  return arr<{ indice: number; ref: string }>(datos(e, 'imagenes')?.items).find((x) => x.indice === indice)?.ref ?? null
}

export function contextoL(pl: Plantilla, e: Estado): ContextoLaminas {
  const b = baseL(e)
  return {
    fuentes: b.F, brief: b.brief, proporcion: b.proporcion, estado: e, reglas: reglasVisuales(e, b.brief), imagenesAMirar: imagenesAMirarL(e), art: (n) => datos(e, n),
    familia: b.familia, limites: pl.limites, elementos: b.elementos, plataforma: b.plataforma, refsValidos: refsValidosDe(b), refsGeneradas: refsGeneradas(e), png: arr<string>(datos(e, 'render')?.urls),
  }
}

// ───────────────────────── de quién es cada hallazgo
const DONDE_DEL_PASO: Record<string, string[]> = {
  corrige_texto: ['texto', 'hashtags'], decide_texto: ['texto', 'hashtags'],
  ajusta_laminas: ['laminas'], ajusta_laminas_2: ['laminas'], corrige_laminas: ['laminas'], decide_laminas: ['laminas'],
  corrige_estructura: ['estructura'], decide_estructura: ['estructura'],
}
/** fichas abiertas que ESTE paso debe atender: las de su ronda (jefe: las que bloquean; externa: todas) cuyo «donde» le pertenece */
export function fichasQueTocanL(e: Estado, paso: Paso): Ficha[] {
  const donde = DONDE_DEL_PASO[paso.clave]
  if (!donde) return []
  const origen = paso.ronda === 2 ? 'externa' : 'jefe'
  return e.fichas.filter((f) => f.estado === 'abierta' && f.origen === origen && donde.includes(f.donde) && (origen === 'externa' || f.gravedad === 'bloquea'))
}

export function armarPedidoL(pl: Plantilla, paso: Paso, e: Estado, extra?: { fichas?: Ficha[]; errorDeFormato?: string }) {
  return construirTareaLaminas(paso.clave, contextoL(pl, e), { fichas: extra?.fichas ?? fichasQueTocanL(e, paso), ...(extra?.errorDeFormato ? { errorDeFormato: extra.errorDeFormato } : {}) })
}

/** pasos de agente que se saltan sin llamar a nadie: mirar sin ninguna imagen que mirar */
export function saltoL(paso: Paso, e: Estado): ResultadoDePaso | null {
  if (paso.clave === 'mirar' && imagenesAMirarL(e).length === 0) {
    const sin = refsGeneradas(e)
    return {
      costo_usd: 0, artefacto: { observaciones: [], aceptadas: {}, preferencia: [], veredicto: { pasan: [], porImagen: [], regenerar: false, refs_sin_imagen: sin }, sin_imagenes: true },
      fichas: sin.length ? [fichaNueva('mirar-sin-imagen', 'chequeo', 'imagen', 'bloquea', 'no hay ninguna imagen que mirar (ningún prompt pasó el brief o el generador falló)', 'reglas de imagen del brief', 'declarar la pieza sin esas imágenes')] : [],
      reemplazar_fichas: { origen: 'chequeo', donde: 'imagen' },
    }
  }
  return null
}

// ───────────────────────── funciones de código
export type SalidaCodigoL = { res: ResultadoDePaso; gastos?: Cambios['gastos']; usos?: Cambios['usos_de_fotos']; imagen_generada?: boolean; fallido?: string }

export async function ejecutarCodigoL(P: Puertos, enc: Encargo, pl: Plantilla, paso: Paso): Promise<SalidaCodigoL> {
  const e = enc.estado_del_motor
  switch (paso.funcion) {
    case 'abrir_laminas': return abrir(P, enc, pl)
    case 'asignar_fotos': return asignarFotos(P, pl, e)
    case 'chequear_prompts_ref': return chequearPromptsRef(e)
    case 'imagen_ref': return imagenRef(P, enc, pl)
    case 'elegir_version_ref': return elegirVersionRef(e)
    case 'armar_laminas': return armar(e)
    case 'render_laminas': return render(P, enc)
    case 'chequeos_laminas': return chequeos(pl, e)
    case 'empaquetar_entrega_laminas': return empaquetar(P, enc)
    default: return { res: { costo_usd: 0 }, fallido: `función de código «${paso.funcion}» sin implementar` }
  }
}

async function abrir(P: Puertos, enc: Encargo, pl: Plantilla): Promise<SalidaCodigoL> {
  const fam = familiaDeLaminas(pl)!
  const fu = await P.fuentes(enc.client_id)
  if ('error' in fu) return { res: { costo_usd: 0 }, fallido: `no se pudieron leer las fuentes del cliente: ${fu.error}` }
  const parte = await P.parte(enc.parte_id, enc.client_id)
  if (!parte) return { res: { costo_usd: 0 }, fallido: `la parte ${enc.parte_id} no existe para este cliente` }
  const brief = parsearBrief(parte.texto, enc.brief_id)
  if (!brief) return { res: { costo_usd: 0 }, fallido: `el brief ${enc.brief_id} no está en la parte` }
  let elementos: ElementoDelKit[] = []
  if (fam === 'carrusel') {
    if (!esCarrusel(brief)) return { res: { costo_usd: 0 }, fallido: `el brief ${enc.brief_id} no es un carrusel (${brief.formato}): esta sala arma carruseles` }
  } else {
    if (!esKitDeHistorias(brief)) return { res: { costo_usd: 0 }, fallido: `el brief ${enc.brief_id} no es un kit de historias y estados (${brief.formato})` }
    const k = elementosDelKit(brief)
    if (k.ilegibles.length) return { res: { costo_usd: 0 }, fallido: `el kit trae ${k.ilegibles.length} elemento(s) que no se entienden (se piden como «AAAA-MM-DD HH:MM | historia o estado | tema | pilar | datos»): ${k.ilegibles.slice(0, 2).join(' // ')}` }
    if (!k.elementos.length) return { res: { costo_usd: 0 }, fallido: 'el kit no trae ningún elemento' }
    elementos = k.elementos
  }
  if (!fu.marca) return { res: { costo_usd: 0 }, fallido: 'el cliente no tiene identidad visual legible (colores y tipografía del manual): no se pueden dibujar láminas' }
  if (!fu.slug) return { res: { costo_usd: 0 }, fallido: 'el cliente no tiene identificador de carpeta (slug) para guardar las láminas' }
  const proporcion = fam === 'kit' ? '9:16' : proporcionDelBrief(brief, String(pl.limites.formato_por_omision ?? '4:5'))
  const plataforma = String(pl.limites.plataforma ?? (fam === 'kit' ? 'instagram-reel' : 'instagram-feed'))
  return { res: { costo_usd: 0, artefacto: { brief, proporcion, F: fu, familia: fam, plataforma, elementos } } }
}

function asignarFotos(P: Puertos, pl: Plantilla, e: Estado): SalidaCodigoL {
  const b = baseL(e)
  const vocab = b.F.vocabulario_de_productos
  const protas = b.familia === 'kit' ? protagonistasDelBrief({ protagonista: b.elementos.map((x) => `${x.tema}. ${x.datos.join(' ')}`).join('. ') }, vocab) : protagonistasDelBrief(b.brief, vocab)
  const prohibe = prohibePersonas(b.brief)
  const pedido = { protagonista: protas, prohibe_personas: prohibe, proporcion: b.proporcion, usos: b.F.usos, reuso_dias: Number(pl.limites.reuso_dias ?? 14), ahora: P.ahora() }
  let cf = candidatasFoto(b.F.fotos, { ...pedido, excluir_reusadas: true }, b.F.propios)
  let reusoPermitido = false
  if (cf.candidatas.length === 0) {
    // «una foto sola que sirve no se bloquea»: si no hay otra, se permite repetir (con aviso)
    const laxa = candidatasFoto(b.F.fotos, { ...pedido, excluir_reusadas: false }, b.F.propios)
    if (laxa.candidatas.length) { cf = laxa; reusoPermitido = true }
  }
  return { res: { costo_usd: 0, artefacto: { ...cf, protagonistas: protas, prohibe_personas: prohibe, reuso_permitido: reusoPermitido, reusadas: cf.candidatas.filter((c) => c.reusada).map((c) => c.id) } } }
}

function chequearPromptsRef(e: Estado): SalidaCodigoL {
  const b = baseL(e)
  const gen = refsGeneradas(e)
  const pr = arr<{ ref: string; prompts: Array<{ prompt: string; idea_en_una_linea: string }> }>(datos(e, 'prompts')?.imagenes)
  const reglas = reglasParaPrompts(e, b.brief, b.F)
  const porRef: Record<string, { indices: number[]; prompts: Array<{ prompt: string; idea_en_una_linea: string }> }> = {}
  const fichas: Ficha[] = []
  for (const ref of gen) {
    const lista = pr.find((x) => x.ref === ref)?.prompts ?? []
    const ch = chequearPrompts(lista.map((p) => p.prompt), reglas, b.F.propios)
    porRef[ref] = { indices: ch.pasan, prompts: ch.pasan.map((i) => lista[i]) }
    if (!ch.pasan.length) fichas.push(fichaNueva(`prompts-ninguno-${ref}`, 'chequeo', 'imagen', 'sugerencia', `ningún prompt de «${ref}» cumple las reglas del brief: esa lámina sale sin imagen generada`, 'reglas de imagen del brief', 'declarar la lámina sin imagen generada'))
  }
  const ninguno = gen.length > 0 && gen.every((r) => !porRef[r].prompts.length)
  const repeticion = (e.vueltas['chequear_prompts'] ?? 0) >= 1
  return {
    res: {
      costo_usd: 0, artefacto: { por_ref: porRef, ninguno },
      // mientras haya una repetición pendiente del ingeniero no se declara nada; tras la repetición (o si solo algunas imágenes quedan sin prompt) sí
      ...((ninguno && !repeticion) ? {} : { fichas, reemplazar_fichas: { origen: 'chequeo' as const, donde: 'imagen' } }),
    },
  }
}

async function imagenRef(P: Puertos, enc: Encargo, pl: Plantilla): Promise<SalidaCodigoL> {
  const e = enc.estado_del_motor
  const porRef = (datos(e, 'prompts_validos')?.por_ref ?? {}) as Record<string, { prompts: Array<{ prompt: string }> }>
  const maxRefs = Number(pl.limites.imagenes_generadas_max ?? 2)
  const versiones = Number(pl.limites.versiones_por_ref ?? 2)
  const previo = arr<Record<string, unknown>>(datos(e, 'imagenes')?.items)
  const intento = ((datos(e, 'imagenes')?.ultimo_intento as number | undefined) ?? 0) + 1
  const aceptadas = (datos(e, 'observacion_imagen')?.aceptadas ?? {}) as Record<string, number[]>
  // en una regeneración solo se rehacen las imágenes que todavía no tienen una versión aceptada
  const pendientes = refsGeneradas(e).filter((r) => porRef[r]?.prompts?.length && (intento === 1 || !(aceptadas[r]?.length))).slice(0, maxRefs)
  const items = [...previo]
  const gastos: NonNullable<Cambios['gastos']> = []
  const fichas: Ficha[] = []
  let costo = 0, hubo = false
  for (const ref of pendientes) {
    const prompts = porRef[ref].prompts.slice(0, versiones)
    for (let k = 0; k < prompts.length; k++) {
      const g = await P.imagen({ prompt: prompts[k].prompt, client_id: enc.client_id, encargo_id: enc.id, dry_run: enc.dry_run })
      if (!g.ok) { fichas.push(fichaNueva(`imagen-${intento}-${ref}-${k}`, 'chequeo', 'imagen', 'sugerencia', `el generador no devolvió una imagen para «${ref}» (prompt ${k + 1}): ${g.error}`)); continue }
      items.push({ indice: items.length, ref, intento, prompt_idx: k, url: g.url, generation_id: g.generation_id, prompt: prompts[k].prompt })
      costo += g.costo_usd; hubo = true
      gastos.push({ concepto: 'imagen', ref_tabla: 'agent_image_generations', ref_id: g.generation_id, cost_usd: g.costo_usd, base: 'usage' })
    }
  }
  return { res: { costo_usd: costo, artefacto: { items, ultimo_intento: intento }, ...(fichas.length ? { fichas } : {}) }, gastos, imagen_generada: hubo ? true : undefined }
}

function elegirVersionRef(e: Estado): SalidaCodigoL {
  const b = baseL(e)
  const obs = datos(e, 'observacion_imagen')
  const aceptadas = (obs?.aceptadas ?? {}) as Record<string, number[]>
  const pref = arr<number>(obs?.preferencia)
  const items = arr<{ indice: number; url: string; generation_id: string }>(datos(e, 'imagenes')?.items)
  const porRef: Record<string, ImagenDeRef> = {}
  const usos: NonNullable<Cambios['usos_de_fotos']> = []
  for (const i of arr<ImagenDecidida>(direccion(e)?.imagenes)) {
    if (i.modo === 'real') {
      const f = b.F.fotos.find((x) => x.id === i.foto_id)
      if (f?.url && i.foto_id) { porRef[i.ref] = { origen: 'real', url: f.url, foto_id: i.foto_id }; usos.push({ foto_id: i.foto_id, rol: i.ref }) }
    } else if (i.modo === 'generada') {
      const el = elegirVersion(aceptadas[i.ref] ?? [], pref)
      const it = el === null ? null : items.find((x) => x.indice === el)
      if (it) porRef[i.ref] = { origen: 'generada', url: it.url, generation_id: it.generation_id }
    }
  }
  return { res: { costo_usd: 0, artefacto: { por_ref: porRef } }, usos }
}

function armar(e: Estado): SalidaCodigoL {
  const b = baseL(e)
  const porRef = (datos(e, 'imagenes_elegidas')?.por_ref ?? {}) as Record<string, ImagenDeRef>
  if (b.familia === 'carrusel') {
    const lam = arr<Lamina>(datos(e, 'laminas')?.laminas)
    if (!lam.length) return { res: { costo_usd: 0 }, fallido: 'no hay láminas que armar' }
    const r = armarLaminasDeCarrusel(lam, porRef)
    return { res: { costo_usd: 0, artefacto: { slides: r.slides, sin_lamina: r.sinLamina, problemas: [] as string[] } } }
  }
  const est = arr<ElementoDeEstructura>(datos(e, 'estructura')?.elementos)
  const copia = arr<ElementoDeCopyKit>(datos(e, 'copy_kit')?.elementos)
  if (!est.length || !copia.length) return { res: { costo_usd: 0 }, fallido: 'falta la estructura o el texto del kit' }
  const r = armarLaminasDeKit(est, copia, porRef)
  if (!r.slides.length) return { res: { costo_usd: 0 }, fallido: `no se pudo armar ninguna lámina del kit: ${r.problemas.join(' · ')}` }
  return { res: { costo_usd: 0, artefacto: { slides: r.slides, refs: r.refs, sin_lamina: [] as string[], problemas: r.problemas } } }
}

async function render(P: Puertos, enc: Encargo): Promise<SalidaCodigoL> {
  const e = enc.estado_del_motor
  const b = baseL(e)
  const slides = arr<Record<string, unknown>>(datos(e, 'laminas_armadas')?.slides)
  if (!slides.length) return { res: { costo_usd: 0 }, fallido: 'no hay láminas armadas que dibujar' }
  const pedido = { client_id: enc.client_id, encargo_id: enc.id, plataforma: b.plataforma, marca: b.F.marca!, slug: b.F.slug!, slides: slides as never, subcarpeta: `oficina/${enc.id}`, dry_run: enc.dry_run }
  // un reintento y luego falla visible (nunca se entrega una pieza sin sus láminas)
  let r = await P.renderLaminas(pedido)
  if (!r.ok) r = await P.renderLaminas(pedido)
  if (!r.ok) return { res: { costo_usd: 0 }, fallido: `no se pudieron dibujar las láminas (tras reintentar): ${r.error}` }
  if (r.urls.length !== slides.length) return { res: { costo_usd: 0 }, fallido: `el brazo devolvió ${r.urls.length} imagen(es) y se pidieron ${slides.length}` }
  return { res: { costo_usd: 0, artefacto: { urls: r.urls, ancho: r.ancho, alto: r.alto, fonts_usadas: r.fonts_usadas, fonts_faltantes: r.fonts_faltantes, simulado: enc.dry_run } } }
}

function textosDeLaminas(slides: Array<Record<string, unknown>>): string[] {
  return slides.flatMap((s) => [s.eyebrow, s.headline, s.body, s.cta].map(txt).filter(Boolean))
}
function chequeos(pl: Plantilla, e: Estado): SalidaCodigoL {
  const b = baseL(e)
  const kit = b.familia === 'kit'
  const slides = arr<Record<string, unknown>>(datos(e, 'laminas_armadas')?.slides)
  const armado = datos(e, 'laminas_armadas')
  const render = datos(e, 'render')
  const copiaC = datos(e, 'copy_carrusel') as unknown as { texto_base: string; pie_de_foto: string; hashtags: string[]; llamado?: string } | undefined
  const copiaK = arr<ElementoDeCopyKit>(datos(e, 'copy_kit')?.elementos)
  const laminas = arr<Lamina>(datos(e, 'laminas')?.laminas)
  const elegidas = (datos(e, 'imagenes_elegidas')?.por_ref ?? {}) as Record<string, ImagenDeRef>
  const usadas = Object.values(elegidas).filter((x) => x.origen === 'real' && x.foto_id).map((x) => x.foto_id!)
  const repetidas = usadas.filter((id, i) => usadas.indexOf(id) !== i)
  const reusadas = [...new Set([...usadas.filter((id) => arr<string>(datos(e, 'candidatas_foto')?.reusadas).includes(id)), ...repetidas])]
  const lim = { pie_de_foto_max: Number(pl.limites.pie_de_foto_max ?? 2200), hashtags_max: Number(pl.limites.hashtags_max ?? 30), limites_verificados: pl.limites.limites_verificados === true }
  const material = txt(datos(e, 'material_portero')?.texto)
  const fuentesCifras = [b.F.manual_texto, b.F.plan_texto ?? '', b.brief.texto, material, ...b.F.fuentes.precios, ...b.elementos.flatMap((x) => [x.tema, x.pilar, ...x.datos, x.fecha ?? '', x.hora ?? ''])]
  const lamCant = { laminas_min: Number(pl.limites.laminas_min ?? 1), laminas_max: Number(pl.limites.laminas_max ?? 10) }
  const problemasContrato = kit
    ? problemasDeHistoria(copiaK, { headline_historia: Number(pl.limites.headline_historia ?? 60), body_historia: Number(pl.limites.body_historia ?? 140) })
    : problemasDeContrato(laminas, lamCant)
  const refsConLamina = kit ? arr<string>(armado?.refs) : []
  const todasFichas = chequeosDeLaminas({
    familia: b.familia, fuentes: b.F.fuentes, limites: lim, prohibidas_del_brief: b.brief.prohibido,
    texto_del_autor: kit
      ? { texto: copiaK.map((x) => [x.eyebrow, x.headline, x.body, x.cta].filter(Boolean).join(' ')).join('\n'), hashtags: [...new Set(copiaK.flatMap((x) => x.hashtags ?? []))], acompanamiento: copiaK.map((x) => x.acompanamiento ?? '').join('\n') }
      : { texto: txt(copiaC?.texto_base), hashtags: copiaC?.hashtags ?? [], llamado: copiaC?.llamado, acompanamiento: txt(copiaC?.pie_de_foto) },
    textos_de_laminas: textosDeLaminas(slides), fuentes_de_cifras: fuentesCifras,
    imagen_generada: Object.values(elegidas).some((x) => x.origen === 'generada'),
    fonts_faltantes: arr<string>(render?.fonts_faltantes),
    imagenes_sin_lamina: arr<string>(armado?.sin_lamina), fotos_reusadas: reusadas,
    problemas_de_contrato: problemasContrato,
    texto_fuera_del_autor: kit || !copiaC ? [] : textoFueraDelAutor(laminas, copiaC),
    problemas_de_armado: arr<string>(armado?.problemas),
    problemas_de_kit: kit ? problemasDeKit(b.elementos, refsConLamina) : [],
  })
  // el estado de WhatsApp: el límite del acompañamiento no está verificado ⇒ solo avisa
  if (kit) {
    const max = Number(pl.limites.acompanamiento_max ?? 700)
    for (const x of copiaK) if ((x.acompanamiento ?? '').length > max) todasFichas.push({ id: `lam-acomp-${x.ref}`, origen: 'chequeo', donde: 'texto', gravedad: 'sugerencia', estado: 'abierta', que: `el acompañamiento de «${x.ref}» tiene ${(x.acompanamiento ?? '').length} caracteres y se usa un tope de ${max} (sin verificar)`, contra_que: 'límite del acompañamiento (sin verificar)', propuesta: 'acortar' })
  }
  const prefijo = `chk${e.pasos_ejecutados}`
  return { res: { costo_usd: 0, artefacto: { fichas: todasFichas.length }, fichas: todasFichas.map((f, i) => ({ ...f, id: `${prefijo}-${i}` })), reemplazar_fichas: { origen: 'chequeo', donde: ['texto', 'hashtags', 'laminas', 'estructura'] } } }
}

// ───────────────────────── sala 4 · entrega de láminas
const sinTildes = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
export function resumenDeEntrega(e: Estado): { expires_at: string | null } {
  const ent = datos(e, 'entrega')
  return { expires_at: (ent?.expires_at as string | null | undefined) ?? null }
}

async function empaquetar(P: Puertos, enc: Encargo): Promise<SalidaCodigoL> {
  const e = enc.estado_del_motor
  const b = baseL(e)
  const urls = arr<string>(datos(e, 'render')?.urls)
  if (!urls.length) return { res: { costo_usd: 0 }, fallido: 'no hay láminas dibujadas que empaquetar' }
  const kit = b.familia === 'kit'
  const redBrief = sinTildes(b.brief.red).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'red'
  const png: ArchivoDeEntrega[] = []
  for (let i = 0; i < urls.length; i++) {
    const bytes = await P.descargar(urls[i])
    if (!bytes) return { res: { costo_usd: 0 }, fallido: `no se pudo descargar la lámina ${i + 1} para empaquetarla` }
    png.push({ nombre: '', bytes })
  }
  const N = png.length
  const fichasTodas: Ficha[] = []
  const extras: Array<{ nombre: string; bytes: Buffer; tipo: string }> = []
  let expires: string | null = null
  const zona = b.F.zona
  let hojaTexto = ''
  let textoCopiable = ''
  const nombresPng: string[] = []

  if (!kit) {
    const copia = datos(e, 'copy_carrusel') as unknown as { pie_de_foto: string; hashtags: string[] }
    const limite = fechaLimiteDelBrief(b.brief.aprueba)
    expires = limite ? aUtc(limite.fecha, limite.hora, zona) : null
    png.forEach((a, i) => { a.nombre = nombreDeArchivo({ fecha: null, hora: null, red: redBrief, formato: 'carrusel', brief_id: b.brief.id, n: i + 1, de: N, ext: leerMedidas(a.bytes)?.tipo === 'jpeg' ? 'jpg' : 'png' }); nombresPng.push(a.nombre) })
    const fila = await P.almacen.leerFormato(redBrief, 'carrusel')
    const man = manifiesto(png, { encargo_id: enc.id, brief_id: b.brief.id, aprobada_version: e.artefactos['copy_carrusel']?.version ?? 1, expires_at: expires, imagen_generada: enc.imagen_generada })
    fichasTodas.push(...chequeosDeEntrega(png, fila ?? null, { pie_de_foto: copia.pie_de_foto, hashtags: copia.hashtags }, man))
    textoCopiable = textoParaCopiar({ pie_de_foto: copia.pie_de_foto, hashtags: copia.hashtags })
    const base = nombreDeArchivo({ fecha: null, hora: null, red: redBrief, formato: 'carrusel', brief_id: b.brief.id, n: 1, de: N, ext: 'txt' }).replace(/_\d+-de-\d+\.txt$/, '')
    hojaTexto = `# Publicar a mano · ${b.brief.id}\nRed: ${b.brief.red} · carrusel de ${N} láminas, en el orden de los nombres de archivo\nHora de publicación: ${limite ? `(aprobar antes de ${limite.fecha})` : 'sin fecha en el brief: se decide al aprobar'}\n${enc.imagen_generada ? '⚠️ Alguna imagen es GENERADA, no una foto real del cliente.\n' : ''}${txt((copia as unknown as Record<string, unknown>).nota_para_quien_publica) ? `Nota: ${txt((copia as unknown as Record<string, unknown>).nota_para_quien_publica)}\n` : ''}\n## Pasos\n${(fila?.pasos_publicacion ?? ['(sin especificación de formato)']).map((x, i) => `${i + 1}. ${x}`).join('\n')}\n`
    extras.push({ nombre: `${base}_texto.txt`, bytes: Buffer.from(textoCopiable, 'utf8'), tipo: 'text/plain' }, { nombre: `${base}_publicar.md`, bytes: Buffer.from(hojaTexto, 'utf8'), tipo: 'text/markdown' })
    return finalizarEntrega(P, enc, png, extras, man, fichasTodas, expires, textoCopiable, nombresPng, [])
  }

  // ── kit: una carpeta con todas las láminas, el texto de cada una y UNA hoja con día, hora y destino
  const copia = arr<ElementoDeCopyKit>(datos(e, 'copy_kit')?.elementos)
  const refs = arr<string>(datos(e, 'laminas_armadas')?.refs)
  const filas = new Map<string, FilaDeFormato | null>()
  const lineas: string[] = []
  const expiraciones: string[] = []
  for (let i = 0; i < png.length; i++) {
    const el = b.elementos.find((x) => x.ref === refs[i])
    const destino = el?.destino ?? 'historia'
    const red = destino === 'estado' ? 'whatsapp' : redBrief
    png[i].nombre = nombreDeArchivo({ fecha: el?.fecha ?? null, hora: el?.hora ?? null, red, formato: destino, brief_id: b.brief.id, n: i + 1, de: N, ext: leerMedidas(png[i].bytes)?.tipo === 'jpeg' ? 'jpg' : 'png' })
    nombresPng.push(png[i].nombre)
    const clave = `${red}/${destino}`
    if (!filas.has(clave)) filas.set(clave, await P.almacen.leerFormato(red, destino))
    const c = copia.find((x) => x.ref === refs[i])
    const t = textoParaCopiar({ pie_de_foto: c?.acompanamiento ?? '', hashtags: c?.hashtags ?? [] })
    extras.push({ nombre: png[i].nombre.replace(/\.[a-z]+$/, '_texto.txt'), bytes: Buffer.from(t, 'utf8'), tipo: 'text/plain' })
    const cuando = el?.fecha ? aUtc(el.fecha, el.hora, zona) : null
    if (cuando) expiraciones.push(cuando)
    lineas.push(`- ${png[i].nombre} → ${destino}${el?.fecha ? ` · ${el.fecha}${el.hora ? ' ' + el.hora : ''}${zona ? ` (${zona})` : ' (sin zona del cliente)'}` : ' · sin fecha'} · texto: ${png[i].nombre.replace(/\.[a-z]+$/, '_texto.txt')}`)
  }
  expires = expiraciones.length ? expiraciones.sort()[0] : null
  const man = manifiesto(png, { encargo_id: enc.id, brief_id: b.brief.id, aprobada_version: e.artefactos['copy_kit']?.version ?? 1, expires_at: expires, imagen_generada: enc.imagen_generada, elementos: png.length })
  // medidas, tipo, peso y cantidad por destino (cada destino con su propia especificación)
  for (const [clave, fila] of filas) {
    const [red, destino] = clave.split('/')
    const grupo = png.filter((_, i) => (b.elementos.find((x) => x.ref === refs[i])?.destino ?? 'historia') === destino && (destino === 'estado' ? 'whatsapp' : redBrief) === red)
    const manG = manifiesto(grupo, {})
    fichasTodas.push(...chequeosDeEntrega(grupo, fila, { pie_de_foto: '', hashtags: [] }, manG))
    if (fila) for (const c of copia) {
      const el = b.elementos.find((x) => x.ref === c.ref)
      if (el && el.destino === destino && (c.acompanamiento ?? '').length > fila.texto_max) fichasTodas.push({ id: `ent-txt-${c.ref}`, origen: 'chequeo', donde: 'texto', gravedad: fila.verificado ? 'bloquea' : 'sugerencia', estado: 'abierta', que: `el acompañamiento de «${c.ref}» tiene ${(c.acompanamiento ?? '').length} caracteres y el límite de ${destino} es ${fila.texto_max}`, contra_que: 'especificación del formato', propuesta: 'acortar' })
    }
  }
  hojaTexto = `# Publicar a mano · ${b.brief.id} · kit de ${N} láminas\nCada lámina lleva en su nombre el día y la hora; la hora es la del cliente${zona ? ` (${zona})` : ' (la zona del cliente no está registrada: confirmarla)'}.\n${enc.imagen_generada ? '⚠️ Alguna imagen es GENERADA, no una foto real del cliente.\n' : ''}\n## Orden de publicación\n${lineas.join('\n')}\n\n## Pasos por destino\n${[...filas.entries()].map(([clave, fila]) => `### ${clave}\n${(fila?.pasos_publicacion ?? ['(sin especificación de formato)']).map((x, i) => `${i + 1}. ${x}`).join('\n')}`).join('\n\n')}\n`
  extras.push({ nombre: nombreDeArchivo({ fecha: null, hora: null, red: redBrief, formato: 'kit', brief_id: b.brief.id, n: 1, de: 1, ext: 'md' }).replace(/_01-de-01\.md$/, '_publicar.md'), bytes: Buffer.from(hojaTexto, 'utf8'), tipo: 'text/markdown' })
  textoCopiable = copia.map((c) => `${c.ref}: ${textoParaCopiar({ pie_de_foto: c.acompanamiento ?? '', hashtags: c.hashtags ?? [] })}`).join('\n\n')
  return finalizarEntrega(P, enc, png, extras, man, fichasTodas, expires, textoCopiable, nombresPng, refs)
}

async function finalizarEntrega(P: Puertos, enc: Encargo, png: ArchivoDeEntrega[], extras: Array<{ nombre: string; bytes: Buffer; tipo: string }>, man: ReturnType<typeof manifiesto>, fichas: Ficha[], expires: string | null, textoCopiable: string, nombresPng: string[], refs: string[]): Promise<SalidaCodigoL> {
  const e = enc.estado_del_motor
  const todos = [...png.map((a) => ({ ...a, tipo: a.nombre.endsWith('.jpg') ? 'image/jpeg' : 'image/png' })), ...extras, { nombre: 'manifest.json', bytes: Buffer.from(JSON.stringify(man, null, 2), 'utf8'), tipo: 'application/json' }]
  let urls: Record<string, string> = {}
  if (!enc.dry_run) {
    const g = await P.guardarArchivos(`oficina/${enc.client_id}/${enc.id}`, todos)
    if (!g.ok) return { res: { costo_usd: 0 }, fallido: `no se pudieron guardar los archivos de la entrega: ${g.error}` }
    urls = g.urls
  }
  const prefijo = `ent${e.pasos_ejecutados}`
  return {
    res: {
      costo_usd: 0,
      artefacto: { archivos: man.archivos, nombres: todos.map((x) => x.nombre), laminas: nombresPng, refs, urls, texto_para_copiar: textoCopiable, expires_at: expires, simulado: enc.dry_run },
      fichas: fichas.map((f, i) => ({ ...f, id: `${prefijo}-${i}` })), reemplazar_fichas: { origen: 'chequeo', donde: 'entrega' },
    },
  }
}

// ───────────────────────── lo que cada paso de agente hace con su salida (validadores de código)
export type ProcesoL = { res?: ResultadoDePaso; fallido?: string; /** mensaje literal para el reintento de formato (lo manda el orquestador mientras queden reintentos) */ reintentar?: string }
const sin = <T extends { ref: string }>(xs: T[], validos: string[]): T[] => xs.filter((x) => validos.includes(x.ref))

export function procesarValorL(paso: Paso, v: Record<string, unknown>, enc: Encargo, e: Estado, pl: Plantilla, intentos: number): ProcesoL {
  const b = baseL(e)
  const quedan = intentos < (paso.salida?.reintento_formato ?? 0)
  const retry = (problemas: string[]): ProcesoL | null => (problemas.length && quedan ? { reintentar: `Tu respuesta no cumple lo que la sala comprueba por código: ${problemas.slice(0, 6).join(' · ')}. Corrígelo y devuelve solo el JSON del contrato.` } : null)
  switch (paso.clave) {
    case 'direccion_visual': return direccionVisual(v, b, e, pl, retry)
    case 'narrativa': {
      const els = arr<ElementoDeEstructura>(v.elementos)
      const faltan = b.elementos.map((x) => x.ref).filter((r) => !els.some((x) => x.ref === r))
      const r = retry([...(refsInvalidos(els.map((x) => x.ref), b.elementos.map((x) => x.ref)).map((x) => `el elemento «${x}» no existe en el kit`)), ...faltan.map((x) => `falta la estructura del elemento «${x}»`)])
      if (r) return r
      return { res: { costo_usd: 0, artefacto: { elementos: sin(els, b.elementos.map((x) => x.ref)) } } }
    }
    case 'prompts': {
      const gen = refsGeneradas(e)
      const imgs = arr<{ ref: string; prompts: unknown[] }>(v.imagenes)
      const r = retry([...refsInvalidos(imgs.map((x) => x.ref), gen).map((x) => `«${x}» no es una imagen a generar`), ...gen.filter((g) => !imgs.some((x) => x.ref === g)).map((g) => `faltan los prompts de «${g}»`)])
      if (r) return r
      return { res: { costo_usd: 0, artefacto: { imagenes: sin(imgs, gen) } } }
    }
    case 'mirar': return mirar(v, b, e, pl)
    case 'texto': {
      if (b.familia === 'carrusel') return { res: { costo_usd: 0, artefacto: v } }
      const els = arr<ElementoDeCopyKit>(v.elementos)
      const lim = { headline_historia: Number(pl.limites.headline_historia ?? 60), body_historia: Number(pl.limites.body_historia ?? 140) }
      const validos = b.elementos.map((x) => x.ref)
      const r = retry([...problemasDeHistoria(els, lim), ...refsInvalidos(els.map((x) => x.ref), validos).map((x) => `el elemento «${x}» no existe en el kit`), ...validos.filter((x) => !els.some((y) => y.ref === x)).map((x) => `falta el texto del elemento «${x}»`)])
      if (r) return r
      return { res: { costo_usd: 0, artefacto: { elementos: sin(els, validos) } } }
    }
    case 'laminas': {
      const lam = arr<Lamina>(v.laminas).map((l, i) => ({ ...l, orden: i + 1 }))
      const r = retry(problemasDeLaminas(lam, e, pl))
      if (r) return r
      return { res: { costo_usd: 0, artefacto: { laminas: lam } } }
    }
    case 'revision_jefe': {
      const fs = arr<{ que: string; donde: string; contra_que: string; gravedad: 'bloquea' | 'sugerencia'; propuesta: string }>(v.fichas).map((f, i) => fichaNueva(`jefe-${e.pasos_ejecutados}-${i}`, 'jefe', f.donde, f.gravedad, f.que, f.contra_que, f.propuesta))
      return { res: { costo_usd: 0, artefacto: { fichas: fs.length }, fichas: fs } }
    }
    case 'corrige_texto': case 'decide_texto': case 'ajusta_laminas': case 'ajusta_laminas_2': case 'corrige_laminas': case 'decide_laminas': case 'corrige_estructura': case 'decide_estructura':
      return resolver(paso, v, b, e, pl, retry)
    default: return { res: { costo_usd: 0, artefacto: v } }
  }
}

function problemasDeLaminas(lam: Lamina[], e: Estado, pl: Plantilla): string[] {
  const copia = datos(e, 'copy_carrusel') as unknown as { texto_base: string; pie_de_foto: string; llamado?: string } | undefined
  const fuera = copia ? textoFueraDelAutor(lam, copia).map((x) => `lámina ${x.lamina}: «${x.texto.slice(0, 50)}» (${x.campo}) no es un recorte literal del texto del autor`) : []
  return [...fuera, ...problemasDeContrato(lam, { laminas_min: Number(pl.limites.laminas_min ?? 1), laminas_max: Number(pl.limites.laminas_max ?? 10) })]
}

function direccionVisual(v: Record<string, unknown>, b: BaseL, e: Estado, pl: Plantilla, retry: (p: string[]) => ProcesoL | null): ProcesoL {
  const validos = refsValidosDe(b)
  let imgs = arr<ImagenDecidida>(v.imagenes)
  const dup = imgs.map((i) => i.ref).filter((r, k, a) => a.indexOf(r) !== k)
  const malos = refsInvalidos(imgs.map((i) => i.ref), validos)
  const r = retry([...malos.map((x) => `la imagen «${x}» no existe (usa solo: ${validos.join(', ')})`), ...[...new Set(dup)].map((x) => `la imagen «${x}» está repetida`)])
  if (r) return r
  const fichas: Ficha[] = []
  imgs = imgs.filter((i, k) => validos.includes(i.ref) && imgs.findIndex((y) => y.ref === i.ref) === k)
  const cand = arr<{ id: string }>(datos(e, 'candidatas_foto')?.candidatas)
  const politica = String(pl.limites.politica_imagen_generada ?? 'permitida')
  const maxGen = Number(pl.limites.imagenes_generadas_max ?? 2)
  let generadas = 0
  const efectivas: ImagenDecidida[] = imgs.map((i) => {
    let modo = i.modo, foto = i.foto_id
    // el CÓDIGO decide lo que no se confía al modelo: una foto real tiene que ser una de las candidatas
    if (modo === 'real' && !cand.some((c) => c.id === foto)) { fichas.push(fichaNueva(`vd-foto-invalida-${i.ref}`, 'chequeo', 'imagen', 'sugerencia', `el curador eligió la foto «${foto ?? '(sin id)'}» para «${i.ref}», que no es una candidata: se genera una imagen`, 'candidatas de la sala')); modo = 'generada'; foto = undefined }
    if (modo === 'generada' && politica === 'prohibida') { fichas.push(fichaNueva(`vd-prohibida-${i.ref}`, 'chequeo', 'imagen', 'sugerencia', `la política del cliente prohíbe imágenes generadas y no hay foto real apta para «${i.ref}»: esa lámina sale sin imagen`, 'política de imagen generada')); modo = 'ninguna' }
    if (modo === 'generada') { generadas++; if (generadas > maxGen) { fichas.push(fichaNueva(`vd-tope-${i.ref}`, 'chequeo', 'imagen', 'sugerencia', `se pidieron más de ${maxGen} imágenes generadas: «${i.ref}» sale sin imagen`, 'tope de imágenes generadas')); modo = 'ninguna' } }
    return { ...i, modo, foto_id: foto }
  })
  const ci = citasExisten((v.reglas_de_imagen ?? { obligatorio: [], prohibido: [] }) as ReglasDeImagen, b.brief.texto)
  for (const x of ci.rechazadas) fichas.push(fichaNueva(`vd-regla-${x.id}`, 'chequeo', 'imagen', 'sugerencia', `regla de imagen «${x.id}» descartada: ${x.motivo}`, 'citas literales del brief'))
  const gen = efectivas.filter((i) => i.modo === 'generada').map((i) => i.ref)
  const requiere = gen.length > 0 || efectivas.some((i) => i.modo === 'real' && confianzaDeLaFoto(b.F.fotos, i.foto_id) !== 'alta')
  return { res: { costo_usd: 0, artefacto: { ...v, imagenes: efectivas, reglas_de_imagen: ci.validas, reglas_rechazadas: ci.rechazadas, refs_generadas: gen, hay_generadas: gen.length > 0, requiere_mirar: requiere }, ...(fichas.length ? { fichas } : {}) } }
}

function mirar(v: Record<string, unknown>, b: BaseL, e: Estado, pl: Plantilla): ProcesoL {
  const mostradas = imagenesAMirarL(e)
  const validos = new Set(mostradas.map((i) => i.indice))
  const filtradas = arr<ObservacionDeImagen>(v.imagenes).filter((o) => validos.has(o.indice))
  const ver = veredictoDeImagenes(filtradas, reglasVisuales(e, b.brief), b.F.propios, false)
  const aceptadas: Record<string, number[]> = { ...((datos(e, 'observacion_imagen')?.aceptadas ?? {}) as Record<string, number[]>) }
  for (const i of ver.pasan) { const ref = refDeIndice(e, i); if (ref) aceptadas[ref] = [...new Set([...(aceptadas[ref] ?? []), i])] }
  const gen = refsGeneradas(e)
  const refsSin = gen.filter((r) => !(aceptadas[r]?.length))
  const max = Number(pl.pasos.find((p) => p.clave === 'mirar')?.vuelve_a?.max ?? 0)
  const puede = (e.vueltas['mirar'] ?? 0) < max
  const regenerar = puede && refsSin.length > 0
  const fichas: Ficha[] = []
  // una foto REAL que no cumple el brief se declara (no se regenera)
  for (const x of ver.porImagen) {
    if (x.pasa || x.indice < BASE_INDICE_REAL) continue
    fichas.push(fichaNueva(`mirar-real-${x.indice}`, 'chequeo', 'imagen', 'bloquea', `la foto real elegida para «${refDeIndice(e, x.indice) ?? '?'}» no cumple el brief: ${x.fallas.map((f) => f.detalle).slice(0, 3).join(' · ')}`, 'reglas de imagen del brief', 'elegir otra foto o generar la imagen'))
  }
  if (!regenerar) for (const r of refsSin) fichas.push(fichaNueva(`mirar-${r}-${e.pasos_ejecutados}`, 'chequeo', 'imagen', 'bloquea', `ninguna imagen generada para «${r}» cumple el brief: esa lámina sale sin imagen`, 'reglas de imagen del brief', 'declarar la lámina sin imagen o elegir una foto'))
  return { res: { costo_usd: 0, artefacto: { observaciones: filtradas, aceptadas, preferencia: v.preferencia, veredicto: { pasan: ver.pasan, porImagen: ver.porImagen, regenerar, refs_sin_imagen: refsSin } }, fichas, reemplazar_fichas: { origen: 'chequeo', donde: 'imagen' } } }
}

function resolver(paso: Paso, v: Record<string, unknown>, b: BaseL, e: Estado, pl: Plantilla, retry: (p: string[]) => ProcesoL | null): ProcesoL {
  const mias = fichasQueTocanL(e, paso)
  const respuestas = arr<{ id: string; estado: 'tomada' | 'no_tomada'; razon: string }>(v.respuestas)
  const validas = respuestas.filter((x) => mias.some((f) => f.id === x.id))
  const huerfanas = mias.filter((f) => !validas.some((x) => x.id === f.id))
  const resoluciones = [...validas.map((x) => ({ id: x.id, estado: x.estado, razon: x.razon })), ...huerfanas.map((f) => ({ id: f.id, estado: 'no_tomada' as const, razon: 'el empleado no respondió este hallazgo' }))]
  let artefacto: Record<string, unknown> | undefined
  switch (paso.clave) {
    case 'corrige_texto': case 'decide_texto': {
      if (b.familia === 'carrusel') {
        if (v.copia) artefacto = { ...(datos(e, 'copy_carrusel') ?? {}), ...(v.copia as object) }
      } else if (v.elementos) {
        const actuales = arr<ElementoDeCopyKit>(datos(e, 'copy_kit')?.elementos)
        const nuevos = arr<ElementoDeCopyKit>(v.elementos)
        const merged = actuales.map((a) => ({ ...a, ...(nuevos.find((n) => n.ref === a.ref) ?? {}) }))
        const r = retry([...problemasDeHistoria(merged, { headline_historia: Number(pl.limites.headline_historia ?? 60), body_historia: Number(pl.limites.body_historia ?? 140) }), ...refsInvalidos(nuevos.map((x) => x.ref), actuales.map((x) => x.ref)).map((x) => `el elemento «${x}» no existe en el kit`)])
        if (r) return r
        artefacto = { elementos: merged }
      }
      break
    }
    case 'ajusta_laminas': case 'ajusta_laminas_2': case 'corrige_laminas': case 'decide_laminas': {
      const lam = v.laminas ? arr<Lamina>(v.laminas).map((l, i) => ({ ...l, orden: i + 1 })) : arr<Lamina>(datos(e, 'laminas')?.laminas)
      const r = retry(problemasDeLaminas(lam, e, pl))
      if (r) return r
      // «ajusta» (el autor cambió el texto) SIEMPRE deja una versión nueva de las láminas, aunque no cambien: así el kit se vuelve a armar, dibujar y chequear contra el texto vigente
      if (v.laminas || paso.clave.startsWith('ajusta')) artefacto = { laminas: lam }
      break
    }
    case 'corrige_estructura': case 'decide_estructura': {
      if (v.elementos) {
        const actuales = arr<ElementoDeEstructura>(datos(e, 'estructura')?.elementos)
        const nuevos = arr<ElementoDeEstructura>(v.elementos)
        const r = retry(refsInvalidos(nuevos.map((x) => x.ref), actuales.map((x) => x.ref)).map((x) => `el elemento «${x}» no existe en el kit`))
        if (r) return r
        artefacto = { elementos: actuales.map((a) => ({ ...a, ...(nuevos.find((n) => n.ref === a.ref) ?? {}) })) }
      }
      break
    }
  }
  return { res: { costo_usd: 0, ...(artefacto ? { artefacto } : {}), resoluciones } }
}

// ───────────────────────── revisor externo (ciego) de una pieza de láminas
export function pedidoCiegoL(pl: Plantilla, e: Estado): { fuentes: Record<string, unknown>; instruccion: string; imagenes: string[] } {
  const c = contextoL(pl, e)
  const fuentes = fuentesDelCiegoLaminas(c)
  const imagenes = arr<{ url: string }>(fuentes.imagenes).map((x) => x.url)
  return { fuentes, instruccion: INSTRUCCION_DEL_CIEGO_LAMINAS, imagenes }
}

// ───────────────────────── cierre: lo que va a la salida (`draft`) y a la bandeja
export function resumenDeCierreL(enc: Encargo, e: Estado, pl: Plantilla): { titulo: string; tituloBandeja: string; contenido: Record<string, unknown>; vista_previa: string; expires_at: string | null; generada: boolean; red: string; version: number } | null {
  const fam = familiaDeLaminas(pl)
  if (!fam) return null
  const b = baseL(e)
  if (!b) return null
  const ent = datos(e, 'entrega')
  const render = datos(e, 'render')
  const generada = Object.values((datos(e, 'imagenes_elegidas')?.por_ref ?? {}) as Record<string, ImagenDeRef>).some((x) => x.origen === 'generada')
  const entrega = ent ? { urls: ent.urls, expires_at: ent.expires_at } : null
  if (fam === 'carrusel') {
    const cp = datos(e, 'copy_carrusel')
    if (!cp) return null
    const n = arr(render?.urls).length
    return {
      titulo: `Carrusel ${enc.brief_id} · ${b.brief.red}`, tituloBandeja: `Aprobación · Carrusel ${enc.brief_id} · ${b.brief.red} · ${n} láminas · versión ${e.artefactos['copy_carrusel']?.version ?? 1} · ${b.F.cliente_nombre}`,
      contenido: { texto_base: cp.texto_base, pie_de_foto: cp.pie_de_foto, hashtags: cp.hashtags, llamado: cp.llamado ?? null, laminas: datos(e, 'laminas')?.laminas ?? [], imagenes: render?.urls ?? [], entrega },
      vista_previa: txt(cp.pie_de_foto).slice(0, 280), expires_at: (ent?.expires_at as string | null | undefined) ?? null, generada, red: b.brief.red, version: e.artefactos['copy_carrusel']?.version ?? 1,
    }
  }
  const ck = arr<ElementoDeCopyKit>(datos(e, 'copy_kit')?.elementos)
  if (!ck.length) return null
  return {
    titulo: `Kit ${enc.brief_id} · ${b.brief.red}`, tituloBandeja: `Aprobación · Kit ${enc.brief_id} · ${b.brief.red} · ${ck.length} láminas · versión ${e.artefactos['copy_kit']?.version ?? 1} · ${b.F.cliente_nombre}`,
    contenido: { elementos: ck, calendario: b.elementos, laminas: render?.urls ?? [], entrega },
    vista_previa: `${ck[0].headline} — ${txt(ck[0].acompanamiento)}`.slice(0, 280), expires_at: (ent?.expires_at as string | null | undefined) ?? null, generada, red: b.brief.red, version: e.artefactos['copy_kit']?.version ?? 1,
  }
}
