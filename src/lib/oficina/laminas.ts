/**
 * LÁMINAS · salas 2 (carrusel) y 3 (historia/estado de WhatsApp) · lo PURO: el contrato de una lámina, «el texto de las láminas es un recorte literal del texto del autor»,
 * armar las láminas que dibuja el brazo, y los chequeos duros (sin modelo). Diseño: docs/DISENO-2026-10-09-oficina-salas-2-3-4.md §2.5, §3.2, §3.5.
 * Agnóstico: ningún texto nombra a un cliente. Las cifras y los límites finos llegan como DATO (plantilla / fuentes del cliente).
 */
import { LIMITES_DE_LAMINA, ROLES_DE_LAMINA } from './salida'
import { chequeosDePost, type FuentesDelCliente } from './chequeos'
import { normalizar } from './texto'
import type { Ficha } from './tipos'

export interface Lamina { orden?: number; rol: string; eyebrow?: string; headline: string; body?: string; cta?: string }
export interface CopiaCarrusel { texto_base: string; pie_de_foto: string; hashtags: string[]; llamado?: string; nota_para_quien_publica?: string }
export interface ElementoDeCopyKit { ref: string; eyebrow?: string; headline: string; body?: string; cta?: string; acompanamiento?: string; hashtags?: string[] }
export interface ElementoDeEstructura { ref: string; rol: string; beat: string; foto_slot?: string; mood: string; sugerencia_interactiva?: string }
/** lo que el brazo dibuja (subconjunto de `SlideContent` del motor de carruseles + los dos campos opcionales que agrega el PR del brazo) */
export interface LaminaParaDibujar { headline: string; body?: string; cta?: string; eyebrow?: string; background_image_url?: string | null; pie?: string | null; ocultar_indicador?: boolean }
export interface ImagenDeRef { origen: 'real' | 'generada'; url: string; foto_id?: string; generation_id?: string }

/** comparable: sin tildes, mayúsculas ni puntuación, espacios colapsados (un recorte literal sobrevive a eso, una paráfrasis no) */
export const comparable = (s: string): string => normalizar(s).replace(/[^a-z0-9ñ$%@#]+/g, ' ').trim()

const ficha = (id: string, donde: string, gravedad: Ficha['gravedad'], que: string, contra_que: string, propuesta: string): Ficha => ({ id, origen: 'chequeo', donde, gravedad, estado: 'abierta', que, contra_que, propuesta })
const CAMPOS = ['eyebrow', 'headline', 'body', 'cta'] as const

// ── el texto de las láminas es del autor ─────────────────────────────────────────────
/** cada campo de texto de cada lámina debe ser un recorte LITERAL del texto del autor (`texto_base` + pie + llamado). Devuelve lo que NO lo es. */
export function textoFueraDelAutor(laminas: Lamina[], copia: Pick<CopiaCarrusel, 'texto_base' | 'pie_de_foto' | 'llamado'>): Array<{ lamina: number; campo: string; texto: string }> {
  const corpus = comparable([copia.texto_base, copia.pie_de_foto, copia.llamado ?? ''].join(' \n '))
  const sale: Array<{ lamina: number; campo: string; texto: string }> = []
  laminas.forEach((l, i) => {
    for (const c of CAMPOS) {
      const t = l[c]
      if (typeof t !== 'string' || !comparable(t)) continue
      if (!` ${corpus} `.includes(` ${comparable(t)} `)) sale.push({ lamina: i + 1, campo: c, texto: t })
    }
  })
  return sale
}

// ── contrato de lámina ───────────────────────────────────────────────────────────────
export interface LimitesDeCantidad { laminas_min: number; laminas_max: number }
/** problemas del contrato (vacío = cumple): cantidad, topes de caracteres, un solo llamado, roles conocidos. Los topes de caracteres también los impone el esquema; aquí es la segunda llave. */
export function problemasDeContrato(laminas: Lamina[], cant: LimitesDeCantidad): string[] {
  const p: string[] = []
  if (laminas.length < cant.laminas_min || laminas.length > cant.laminas_max) p.push(`${laminas.length} láminas; el formato pide de ${cant.laminas_min} a ${cant.laminas_max}`)
  laminas.forEach((l, i) => {
    for (const c of CAMPOS) {
      const t = l[c]
      if (typeof t === 'string' && t.length > LIMITES_DE_LAMINA[c]) p.push(`lámina ${i + 1}: «${c}» tiene ${t.length} caracteres y el tope es ${LIMITES_DE_LAMINA[c]}`)
    }
    if (!(ROLES_DE_LAMINA as readonly string[]).includes(l.rol)) p.push(`lámina ${i + 1}: rol «${l.rol}» desconocido`)
  })
  const conCta = laminas.filter((l) => typeof l.cta === 'string' && l.cta.trim()).length
  if (conCta > 1) p.push(`${conCta} láminas con llamado a la acción; solo una`)
  return p
}

/** problemas de LONGITUD de un elemento de historia/estado (se lee en segundos): topes por dato de la plantilla */
export function problemasDeHistoria(elementos: ElementoDeCopyKit[], lim: { headline_historia: number; body_historia: number }): string[] {
  const p: string[] = []
  elementos.forEach((e) => {
    if (e.headline.length > lim.headline_historia) p.push(`«${e.ref}»: el titular tiene ${e.headline.length} caracteres y una historia admite ${lim.headline_historia}`)
    if ((e.body ?? '').length > lim.body_historia) p.push(`«${e.ref}»: el texto tiene ${(e.body ?? '').length} caracteres y una historia admite ${lim.body_historia}`)
  })
  return p
}

// ── refs (rol de lámina en el carrusel · elemento en el kit) ─────────────────────────
export function refsInvalidos(refs: string[], validos: string[]): string[] {
  const ok = new Set(validos)
  return [...new Set(refs.filter((r) => !ok.has(r)))]
}

// ── armar lo que se dibuja ───────────────────────────────────────────────────────────
/**
 * Carrusel: una lámina por entrada del diseñador. La imagen de un rol va en la PRIMERA lámina que lo tenga (si un rol se repite, manda el orden).
 * `sinLamina` = refs con imagen que ninguna lámina usa (el chequeo lo declara).
 */
export function armarLaminasDeCarrusel(laminas: Lamina[], imagenesPorRol: Record<string, ImagenDeRef>): { slides: LaminaParaDibujar[]; sinLamina: string[] } {
  const usadas = new Set<string>()
  const slides = laminas.map((l) => {
    const img = !usadas.has(l.rol) ? imagenesPorRol[l.rol] : undefined
    if (img) usadas.add(l.rol)
    return limpia({ headline: l.headline, body: l.body, cta: l.cta, eyebrow: l.eyebrow, background_image_url: img?.url ?? null })
  })
  return { slides, sinLamina: Object.keys(imagenesPorRol).filter((r) => !usadas.has(r)) }
}

/** Kit: una lámina por elemento de la ESTRUCTURA, con el texto del autor (por `ref`) y su imagen. Sin pie ni indicador «n · N»: una historia suelta no es un carrusel. */
export function armarLaminasDeKit(estructura: ElementoDeEstructura[], copia: ElementoDeCopyKit[], imagenesPorRef: Record<string, ImagenDeRef>): { slides: LaminaParaDibujar[]; refs: string[]; problemas: string[] } {
  const problemas: string[] = []
  const porRef = new Map(copia.map((c) => [c.ref, c] as const))
  const refsEstructura = estructura.map((e) => e.ref)
  for (const e of estructura) if (!porRef.has(e.ref)) problemas.push(`el elemento «${e.ref}» tiene estructura y no tiene texto del autor`)
  for (const c of copia) if (!refsEstructura.includes(c.ref)) problemas.push(`el texto del autor trae «${c.ref}», que no está en la estructura`)
  const slides: LaminaParaDibujar[] = []
  const refs: string[] = []
  for (const e of estructura) {
    const c = porRef.get(e.ref)
    if (!c) continue
    const img = imagenesPorRef[e.foto_slot || e.ref] ?? imagenesPorRef[e.ref]
    slides.push({ ...limpia({ headline: c.headline, body: c.body, cta: c.cta, eyebrow: c.eyebrow, background_image_url: img?.url ?? null }), pie: null, ocultar_indicador: true })
    refs.push(e.ref)
  }
  return { slides, refs, problemas }
}
function limpia(l: LaminaParaDibujar): LaminaParaDibujar {
  const o: LaminaParaDibujar = { headline: l.headline }
  if (l.body && l.body.trim()) o.body = l.body
  if (l.cta && l.cta.trim()) o.cta = l.cta
  if (l.eyebrow && l.eyebrow.trim()) o.eyebrow = l.eyebrow
  o.background_image_url = l.background_image_url ?? null
  return o
}

// ── cifras que nadie le dio al autor ─────────────────────────────────────────────────
/** porcentajes y cifras sueltas que NO aparecen en ninguna fuente (manual, plan, brief, material, datos verificados). Un porcentaje inventado bloquea; otra cifra avisa.
 *  LÍMITE DECLARADO (CC#3 #469 H3): se valida por PRESENCIA, no por referencia. Un «30» pasa si «30» aparece en CUALQUIER fuente (un precio, una fecha), aunque la afirmación sea otra;
 *  detecta cifras fabricadas, no afirmaciones mal atribuidas. Ignora cifras de un dígito y las de 4 o más (años). Es una primera red: la atribución la revisan los jefes y el humano. */
export function cifrasFueraDeFuentes(textos: string[], fuentes: string[]): Array<{ cifra: string; porcentaje: boolean }> {
  // los precios con «$» los verifica `chequeosDePost` contra la carta; aquí solo porcentajes y cifras sueltas
  const base = ` ${normalizar(fuentes.join(' \n ')).replace(/,/g, '.')} `
  const sale = new Map<string, boolean>()
  for (const t of textos) {
    for (const m of t.matchAll(/(?<![\d/:.,$])(\d{1,3}(?:[.,]\d{1,2})?)\s?(%)?(?![\d/:])/g)) {
      const num = m[1].replace(',', '.')
      const porcentaje = m[2] === '%'
      if (!porcentaje && num.replace('.', '').length < 2) continue
      const esta = new RegExp(`(^|[^0-9])${num.replace(".", "[.]")}(?![0-9])`).test(base)
      if (!esta) sale.set(`${num}${porcentaje ? '%' : ''}`, porcentaje || sale.get(`${num}`) === true)
    }
  }
  return [...sale.entries()].map(([cifra, porcentaje]) => ({ cifra, porcentaje: cifra.endsWith('%') || porcentaje }))
}

// ── chequeos duros ───────────────────────────────────────────────────────────────────
export interface ContextoDeChequeoLaminas {
  familia: 'carrusel' | 'kit'
  fuentes: FuentesDelCliente
  limites: { pie_de_foto_max: number; hashtags_max: number; limites_verificados: boolean }
  prohibidas_del_brief: string[]
  /** textos del autor que se chequean como «texto» (carrusel: texto_base + pie + llamado; kit: titular + texto + llamado de cada elemento) */
  texto_del_autor: { texto: string; hashtags: string[]; llamado?: string; acompanamiento?: string }
  textos_de_laminas: string[]
  /** lo que el autor pudo leer (para las cifras) */
  fuentes_de_cifras: string[]
  imagen_generada: boolean
  fonts_faltantes: string[]
  /** refs con imagen que ninguna lámina usa / roles de imagen sin lámina */
  imagenes_sin_lamina: string[]
  /** fotos reales que la sala ya usó dentro de la ventana de reuso */
  fotos_reusadas: string[]
  problemas_de_contrato: string[]
  texto_fuera_del_autor: Array<{ lamina: number; campo: string; texto: string }>
  problemas_de_armado: string[]
  /** kit: elementos del brief sin lámina o láminas sin fecha */
  problemas_de_kit: string[]
}

/** todos los chequeos duros de una pieza de láminas, como fichas `origen: chequeo` (donde ∈ texto · hashtags · laminas · imagen · estructura · entrega) */
export function chequeosDeLaminas(c: ContextoDeChequeoLaminas): Ficha[] {
  const f: Ficha[] = []
  let n = 0
  const nueva = (donde: string, g: Ficha['gravedad'], que: string, contra: string, prop: string) => f.push(ficha(`lam-${donde}-${n++}`, donde, g, que, contra, prop))
  // 1 · el texto del autor: las mismas reglas firmadas que un post (prohibidas, registro, teléfonos, @, precios, competidores, hashtags, longitud del pie)
  for (const x of chequeosDePost({
    pieza: { pie_de_foto: c.texto_del_autor.acompanamiento ?? c.texto_del_autor.texto, hashtags: c.texto_del_autor.hashtags, llamado: c.texto_del_autor.llamado },
    fuentes: c.fuentes, limites: c.limites, prohibidas_del_brief: c.prohibidas_del_brief,
    imagen: { generada: c.imagen_generada, declarada_en_bandeja: true },
  })) f.push({ ...x, id: `lam-${x.id}-${n++}` })
  if (c.texto_del_autor.acompanamiento !== undefined || c.familia === 'carrusel') {
    // el texto que va EN las láminas se chequea igual (sin contar su longitud como pie de foto)
    for (const x of chequeosDePost({
      pieza: { pie_de_foto: c.texto_del_autor.texto, hashtags: [], llamado: undefined },
      fuentes: c.fuentes, limites: { pie_de_foto_max: 1_000_000, hashtags_max: 1_000, limites_verificados: c.limites.limites_verificados }, prohibidas_del_brief: c.prohibidas_del_brief,
    })) if (!f.some((y) => y.que === x.que && y.donde === x.donde)) f.push({ ...x, id: `lam-${x.id}-${n++}` })
  }
  // 2 · contrato de lámina y recortes literales
  for (const p of c.problemas_de_contrato) nueva('laminas', 'bloquea', p, 'contrato de lámina', 'ajustar las láminas al contrato')
  for (const x of c.texto_fuera_del_autor) nueva('laminas', 'bloquea', `lámina ${x.lamina}: el campo «${x.campo}» («${x.texto.slice(0, 50)}») no es un recorte literal del texto del autor`, 'un solo autor del texto', 'usar solo texto del autor')
  for (const p of c.problemas_de_armado) nueva(c.familia === 'kit' ? 'estructura' : 'laminas', 'bloquea', p, 'estructura y texto del mismo kit', 'alinear estructura y texto')
  for (const p of c.problemas_de_kit) nueva('estructura', 'bloquea', p, 'kit de la semana', 'completar el kit')
  // 3 · cifras que nadie le dio al autor
  for (const x of cifrasFueraDeFuentes([...c.textos_de_laminas, c.texto_del_autor.texto, c.texto_del_autor.acompanamiento ?? ''], c.fuentes_de_cifras)) {
    nueva('texto', x.porcentaje ? 'bloquea' : 'sugerencia', `la cifra «${x.cifra}» no está en ninguna fuente (manual, plan, brief o datos del cliente)`, 'no inventar cifras', 'quitar la cifra o citarla de una fuente')
  }
  // 4 · tipografías e imágenes
  for (const t of c.fonts_faltantes) nueva('laminas', 'sugerencia', `la tipografía del manual «${t}» no está disponible: se dibujó con otra`, 'manual de marca', 'cargar la tipografía')
  for (const r of c.imagenes_sin_lamina) nueva('laminas', 'bloquea', `hay una imagen para «${r}» y ninguna lámina la usa`, 'imágenes por rol', 'usar el rol en una lámina o descartar la imagen')
  for (const id of c.fotos_reusadas) nueva('laminas', 'sugerencia', `la foto «${id}» ya se usó dentro de la ventana de reuso`, 'no repetir fotos', 'elegir otra si existe')
  return f
}

/** kit: lo que le falta al kit respecto del brief (un elemento ↔ una lámina ↔ una fecha) */
export function problemasDeKit(elementosDelBrief: Array<{ ref: string; fecha?: string | null; hora?: string | null; destino?: string }>, refsConLamina: string[]): string[] {
  const p: string[] = []
  const con = new Set(refsConLamina)
  for (const e of elementosDelBrief) if (!con.has(e.ref)) p.push(`el elemento «${e.ref}» del kit no tiene lámina`)
  const vistos = new Map<string, string>()
  for (const e of elementosDelBrief) {
    if (!e.fecha) continue
    const k = `${e.fecha} ${e.hora ?? ''} ${e.destino ?? ''}`
    const otro = vistos.get(k)
    if (otro) p.push(`«${e.ref}» y «${otro}» caen en el mismo día, hora y destino`)
    else vistos.set(k, e.ref)
  }
  return p
}
