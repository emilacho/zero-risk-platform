/**
 * Qué cuenta como «dato con fuente» (V14) y qué cuenta como «afirmación sin respaldo» (CC#3 condición 3).
 *
 * El chequeo original validaba lo que el agente DECLARA en `datos[]`. Las invenciones que se midieron en la prueba real no eran cifras:
 * «el marisco llega el mismo día», «camarón y pescado de <lugar>», «dos mixtos alcanzan para cuatro», «él es quien pesca lo que comes».
 * Un agente que no las declara las colaba. Este módulo mira el TEXTO, no solo lo declarado: toda cifra y toda afirmación de
 * origen / frescura / porción / trazabilidad / garantía que aparezca en un `tema` sin respaldo bloquea igual.
 *
 * El léxico es DATO, no código (relevo 41 · D1/D3): lo de aquí es la base del idioma (español) y de la ESTRUCTURA del texto, nunca de un
 * rubro ni de un cliente; `cadena_config.lexico_afirmaciones` (jsonb) lo amplía o lo reemplaza sin publicar (ver `lexicoDesdeConfig`).
 */
import { normalizar } from './texto'
import type { Clase } from './tipos'

export interface Hallado { tipo: 'cifra' | 'afirmacion'; subtipo: string; texto: string; clase: Clase }

export interface LexicoAfirmaciones {
  /** patrones extra de afirmación (se miden contra el texto SIN acentos y en minúsculas) */
  patrones?: { subtipo: string; re: string }[]
  /** unidades que vuelven «cantidad» a un número («30 años», «500 clientes») */
  cantidad_unidades?: string[]
  /** palabras de AMBIENTE: «fresco» a su lado no es una afirmación de frescura del producto */
  ambiente?: string[]
  /** cabezas de frase que NO anuncian un origen: «reseña de Ana», «guía de Montañita», «equipo de …» */
  no_origen?: string[]
  /** palabras que ubican un lugar PROPIO: «la sede de Olón» no es un origen de producto; «pescado de Olón» sí */
  locativos?: string[]
  /** palabras del FORMATO del plan («5 láminas», «3 pasos»): un número con ellas no es un dato del negocio */
  no_cantidad?: string[]
}

type LexicoBase = Required<Omit<LexicoAfirmaciones, 'patrones'>>
export const LEXICO_BASE: LexicoBase = {
  // solo unidades de cualquier negocio; las propias de un rubro («mesas», «habitaciones», «canchas») las cubre la estructura «con N <cosa>» o el léxico del cliente
  cantidad_unidades: ['años', 'anos', 'clientes', 'usuarios', 'pacientes', 'alumnos', 'socios', 'miembros', 'suscriptores', 'empleados', 'sedes', 'sucursales', 'locales', 'personas', 'visitas', 'seguidores', 'productos', 'proyectos', 'casos', 'ventas', 'descargas', 'unidades', 'paises', 'ciudades'],
  no_cantidad: ['posts', 'post', 'publicaciones', 'publicacion', 'laminas', 'lamina', 'slides', 'slide', 'pasos', 'paso', 'fases', 'fase', 'dias', 'dia', 'semanas', 'semana', 'meses', 'mes', 'imagenes', 'imagen', 'fotos', 'foto', 'videos', 'video', 'historias', 'historia', 'reels', 'reel', 'piezas', 'pieza', 'ideas', 'idea', 'ejemplos', 'ejemplo', 'opciones', 'opcion', 'versiones', 'version', 'puntos', 'punto', 'bloques', 'secciones', 'seccion', 'correos', 'mensajes', 'campanas', 'campana', 'preguntas', 'pregunta', 'consejos', 'consejo', 'tips', 'tip', 'razones', 'formas', 'maneras', 'claves', 'palabras', 'lineas', 'veces', 'vez', 'carruseles', 'carrusel', 'redes', 'posteos', 'textos', 'frases', 'titulos', 'hashtags'],
  ambiente: ['ambiente', 'brisa', 'aire', 'clima', 'temperatura', 'espacio', 'lugar', 'sitio', 'rincon', 'terraza', 'atmosfera', 'salon', 'local'],
  no_origen: ['resena', 'resenas', 'guia', 'historia', 'opinion', 'foto', 'fotos', 'video', 'videos', 'cuenta', 'perfil', 'equipo', 'gracias', 'parte', 'mensaje', 'publicacion', 'pagina', 'familia', 'carta', 'menu', 'saludos', 'bienvenido', 'bienvenida', 'comentario'],
  locativos: ['sede', 'sedes', 'local', 'locales', 'sucursal', 'sucursales', 'oficina', 'ciudad', 'zona', 'barrio', 'visitanos', 'estamos', 'abrimos'],
}

const escapar = (u: string) => u.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** Cifras que son DATOS (no «3 posts» ni «4 pasos»): dinero, medida, porcentaje, hora, reseñas, puntaje, cantidad con unidad. */
const cifrasDe = (unidades: readonly string[]): { subtipo: string; re: RegExp; clase: Clase }[] => [
  { subtipo: 'dinero', re: /(?:US\$|\$)\s?\d+(?:[.,]\d+)?|\d+(?:[.,]\d+)?\s?(?:dolares|dólares|usd)\b/gi, clase: 'alto' },
  { subtipo: 'medida', re: /\b\d+(?:[.,]\d+)?\s?(?:g|gr|kg|mg|ml|l|lt|litros?|gramos?|onzas?|oz|cm|mm)(?![a-záéíóúñ0-9])/gi, clase: 'alto' },
  { subtipo: 'porcentaje', re: /\b\d+(?:[.,]\d+)?\s?%/g, clase: 'alto' },
  { subtipo: 'hora', re: /\b(?:[01]?\d|2[0-3]):[0-5]\d\b/g, clase: 'alto' },
  { subtipo: 'resenas', re: /\b\d+(?:[.,]\d+)?\s?(?:rese[ñn]as?|opiniones|calificaciones|estrellas?)\b/gi, clase: 'alto' },
  { subtipo: 'puntaje', re: /\b[0-5][.,]\d\b(?!\s?(?:g|gr|kg|ml|l|%))/g, clase: 'alto' },
  { subtipo: 'duracion', re: /\b\d+\s?(?:min|minutos|horas?|hrs?)(?![a-záéíóúñ0-9])/gi, clase: 'medio' },
  { subtipo: 'cantidad', re: new RegExp('\\b\\d+(?:[.,]\\d+)?\\+?\\s?(?:' + unidades.map(escapar).join('|') + ')(?![a-záéíóúñ])', 'gi'), clase: 'alto' },
]

/**
 * Afirmaciones de origen / frescura / porción / trazabilidad / garantía / composición / superlativo / servicio / historia (español).
 * Se miden contra el texto normalizado (minúsculas, sin acentos). Todas son «alto». Es la BASE del idioma: se amplía en `cadena_config`.
 */
export const PATRONES_AFIRMACION: { subtipo: string; re: RegExp }[] = [
  { subtipo: 'frescura', re: /\b(?:mismo dia|de hoy|hoy mismo|esta (?:manana|tarde|noche)|ayer|recien (?:\w+[ai]d[oa]s?|hech[oa]s?|salid[oa]s?)|(?:capturad|recolectad|cosechad)[oa]s?|fresc[oa]s?|frescura)\b/g },
  { subtipo: 'origen', re: /\b(?:de la zona|de la costa|del campo|de origen|traid[oa]s? (?:de|desde|ayer|hoy)|llega(?:n)? (?:de|desde)|importad[oa]s?|directo (?:del|de la|de los|de las|desde)\s+\w+)\b/g },
  { subtipo: 'porcion', re: /\b(?:alcanza(?:n)? para|rinde(?:n)? para|para \d+ personas?|porcion(?:es)? (?:generosa|abundante|grande)s?)\b/g },
  { subtipo: 'trazabilidad', re: /\b(?:el mismo (?:que|quien)|el es quien|ella es quien|es quien \w+|directo (?:del|de la) \w+|sin intermediarios|de nuestr[oa]s? propi[oa]s? \w+)\b/g },
  { subtipo: 'certificacion', re: /\b(?:certificad[oa]s?|certificacion(?:es)?|acreditad[oa]s?|acreditacion(?:es)?|avalad[oa]s?|homologad[oa]s?|licenciad[oa]s?|patentad[oa]s?|premiad[oa]s?|galardonad[oa]s?|iso ?\d{3,5})\b/g },
  { subtipo: 'ausencia', re: /\bsin (?:\w+ )?(?:ocult[oa]s?|costos?|cargos?|comisiones|cuotas?|letra chica|compromisos?|permanencia|riesgos?|intermediarios|esperas?|filas?|papeleos?|trampas?|sorpresas?|demoras?|limites?|contratos?)\b/g },
  { subtipo: 'garantia', re: /(?:\bgarantizad[oa]s?\b|\b100 ?%|\bcien por ciento\b|\bnunca falla\b|\bsin falta\b)/g },
  { subtipo: 'composicion', re: /\b(?:sin (?:conservantes|aditivos|quimicos|preservantes|colorantes)|organic[oa]s?|artesanal(?:es)?|hecho a mano)\b/g },
  { subtipo: 'superlativo', re: /\b(?:(?:el|la|los|las) mejor(?:es)?|numero (?:uno|1)|el unico|la unica|lider(?:es)? (?:en|del|de la)|mas \w+ (?:del|de la|de) (?:mercado|pais|ciudad|zona|region|rubro|sector|industria|mundo|categoria|segmento|provincia|canton|barrio)|mas \w+ que (?:cualquier|la competencia|el resto|los demas|otros|nadie|la mayoria)|mejor(?:es)? que (?:cualquier|la competencia|el resto|los demas|otros|nadie)|mejor(?:es)? (?:precio|calidad|servicio|opcion|atencion|garantia))\b/g },
  { subtipo: 'servicio', re: /\b(?:(?:entrega|envio|delivery) gratis|24 ?\/ ?7|abierto 24|las 24 horas)\b/g },
  { subtipo: 'historia', re: /\b(?:receta (?:familiar|de la abuela|secreta|tradicional)|tradicion (?:familiar|de)|desde (?:19|20)\d{2}|\d+ anos de)\b/g },
]

/** Lugar propio tras «de/desde» con inicial mayúscula en el texto ORIGINAL (p. ej. «camarón y pescado de Olón»). */
const LUGAR = /\b(?:de|desde)\s+(?:la\s+|el\s+|los\s+|las\s+)?([A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)?)/g
/** Palabras con mayúscula después de «de» que NO son un lugar de origen (días, meses, redes, etc.). */
const NO_LUGAR = new Set(['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'whatsapp', 'google', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado', 'domingo', 'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre', 'dia', 'semana', 'fase'])

/** Cuantificador o verbo de posesión + número + cosa (sobre texto sin acentos). El grupo 1 es la cosa. */
const CUANTIFICADA = /\b(?:con|tenemos|tiene|contamos con|cuenta con|cuentan con|ofrecemos|atendemos a|somos|solo|solamente|apenas|unicamente|hasta|unos|unas|mas de|casi|cerca de|mas que)\s+\d[\d.,]*\+?\s+([a-z]{3,})/g
/** «hecho/fabricado/cultivado en <Lugar>»: un origen de producto aunque el lugar sea una sede. */
const FABRICADO_EN = /\b(?:hech[oa]|fabricad[oa]|elaborad[oa]|producid[oa]|cultivad[oa]|criad[oa]|importad[oa])s?\s+en\s+(?:la\s+|el\s+|los\s+|las\s+)?[A-ZÁÉÍÓÚÑ][a-záéíóúñ]{2,}/g

const palabras = (s: string) => normalizar(s).split(/[^a-z0-9]+/).filter(Boolean)
const MAX_RE = 240
const compila = (re: string): boolean => { try { new RegExp(re, 'g'); return true } catch { return false } }

/** Valida lo que viene de `cadena_config.lexico_afirmaciones` (jsonb): lo inválido se ignora, nunca rompe el chequeo. */
export function lexicoDesdeConfig(valor: unknown): LexicoAfirmaciones {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {}
  const v = valor as Record<string, unknown>
  const lista = (x: unknown) => (Array.isArray(x) ? x.filter((y): y is string => typeof y === 'string' && y.trim() !== '' && y.length <= 60).map((y) => normalizar(y)) : undefined)
  const out: LexicoAfirmaciones = {}
  if (Array.isArray(v.patrones)) {
    out.patrones = (v.patrones as unknown[]).filter((p): p is { subtipo: string; re: string } => {
      const q = p as { subtipo?: unknown; re?: unknown } | null
      return !!q && typeof q.subtipo === 'string' && typeof q.re === 'string' && q.re.length <= MAX_RE && compila(q.re)
    })
  }
  for (const k of ['cantidad_unidades', 'ambiente', 'no_origen', 'locativos', 'no_cantidad'] as const) { const l = lista(v[k]); if (l) out[k] = l }
  return out
}

export interface OpcionesAfirmaciones { lexico?: LexicoAfirmaciones }

/**
 * Todo lo que un `tema` afirma y necesita respaldo. `conocidos` = nombres/claves de las sedes del cliente y el nombre del negocio.
 * «de <sede>» solo NO es un origen de producto cuando lo ubica una palabra de lugar («la sede de Olón»); «camarón y pescado de Olón» SÍ lo es aunque Olón sea sede.
 * Ninguna lista de comida o rubro: lo que ubica un lugar o anuncia un tipo de texto es léxico de la ESTRUCTURA, y es dato en `cadena_config`.
 */
export function hallarAfirmaciones(tema: string, conocidos: readonly string[] = [], opciones: OpcionesAfirmaciones = {}): Hallado[] {
  const lx = { ...LEXICO_BASE, ...(opciones.lexico ?? {}) }
  const out: Hallado[] = []
  const t = String(tema ?? '')
  for (const c of cifrasDe(lx.cantidad_unidades)) for (const m of t.matchAll(new RegExp(c.re.source, c.re.flags))) out.push({ tipo: 'cifra', subtipo: c.subtipo, texto: m[0].trim(), clase: c.clase })
  const n = normalizar(t)
  // «con 20 habitaciones», «más de 500 usuarios», «contamos con 120 propiedades»: lo que cuenta es la ESTRUCTURA (un cuantificador o verbo de posesión,
  // un número y una cosa), no la cosa. Se salta lo que es el formato del plan («con 5 láminas»).
  const noCantidad = new Set(lx.no_cantidad.map(normalizar))
  for (const m of n.matchAll(CUANTIFICADA)) {
    if (noCantidad.has(m[1])) continue
    if (out.some((o) => o.tipo === 'cifra' && o.subtipo === 'cantidad' && normalizar(o.texto).includes(m[1]))) continue
    out.push({ tipo: 'cifra', subtipo: 'cantidad', texto: m[0].trim(), clase: 'alto' })
  }
  const ambiente = new Set(lx.ambiente.map(normalizar))
  const extra = (opciones.lexico?.patrones ?? []).map((p) => ({ subtipo: p.subtipo, re: new RegExp(p.re, 'g') }))
  for (const p of [...PATRONES_AFIRMACION, ...extra]) {
    for (const m of n.matchAll(new RegExp(p.re.source, p.re.flags))) {
      const i = m.index ?? 0
      // «ambiente fresco», «brisa fresca»: lo fresco del AMBIENTE no es una afirmación del producto
      if (/^fresc/.test(m[0])) {
        const al = palabras(n.slice(Math.max(0, i - 40), i)).slice(-3)
        const despues = palabras(n.slice(i + m[0].length, i + m[0].length + 30)).slice(0, 2)
        if ([...al, ...despues].some((w) => ambiente.has(w))) continue
      }
      out.push({ tipo: 'afirmacion', subtipo: p.subtipo, texto: m[0].trim(), clase: 'alto' })
    }
  }
  const sedesN = conocidos.map(normalizar).filter(Boolean)
  const locativos = new Set(lx.locativos.map(normalizar))
  const noOrigen = new Set(lx.no_origen.map(normalizar))
  for (const m of t.matchAll(new RegExp(LUGAR.source, LUGAR.flags))) {
    const lugar = normalizar(m[1])
    if (NO_LUGAR.has(lugar)) continue
    const antes = palabras(t.slice(Math.max(0, (m.index ?? 0) - 60), m.index ?? 0))
    const cabeza = antes[antes.length - 1] ?? ''
    if (cabeza && noOrigen.has(cabeza)) continue // «reseña de Ana», «guía de Montañita»
    const esConocido = sedesN.some((s) => lugar.startsWith(s) || s.startsWith(lugar))
    if (esConocido && cabeza && locativos.has(cabeza)) continue // «la sede de Olón»
    out.push({ tipo: 'afirmacion', subtipo: 'origen_lugar', texto: m[0].trim(), clase: 'alto' })
  }
  for (const m of t.matchAll(new RegExp(FABRICADO_EN.source, FABRICADO_EN.flags))) out.push({ tipo: 'afirmacion', subtipo: 'origen_lugar', texto: m[0].trim(), clase: 'alto' })
  return out
}

/** Voseo (el tuteo de Ecuador no lo admite). Lista de formas verbales y pronombres del voseo rioplatense/centroamericano. */
const VOSEO = /\b(?:vos|tenes|queres|podes|sabes que|miras?|proba(?:lo|la|los|las)?|veni|decime|hace(?:lo|la)?|pedi(?:lo|la)?|elegi|anda(?:te)?|fijate|date cuenta|mira(?:lo|la)?|sentate|pasate|vas a poder)\b/g
export function hallarVoseo(tema: string): string[] {
  // el voseo se detecta sobre el texto SIN acentos; se excluyen formas que en tuteo existen igual («hace» 3.ª persona, «mira» 3.ª, «sabes» tú)
  const n = normalizar(tema)
  const out: string[] = []
  for (const m of n.matchAll(new RegExp(VOSEO.source, VOSEO.flags))) {
    const w = m[0]
    if (/^(?:hace|mira|miras|pedi|anda|elegi)$/.test(w)) continue // ambiguas con tuteo/3.ª persona: solo se cuentan con enclítico (lo, la, te)
    out.push(w)
  }
  return out
}

/** Una fecha absoluta o «día N» escrita en un tema (V13). */
export function hallarFechasEnTema(tema: string): { texto: string; diaN: number | null }[] {
  const out: { texto: string; diaN: number | null }[] = []
  const t = normalizar(tema)
  for (const m of t.matchAll(/\b(\d{1,2})\s+de\s+(?:enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)\b/g)) out.push({ texto: m[0], diaN: null })
  for (const m of t.matchAll(/\b\d{4}-\d{2}-\d{2}\b/g)) out.push({ texto: m[0], diaN: null })
  for (const m of t.matchAll(/\bdia\s+(\d{1,3})\b/g)) out.push({ texto: m[0], diaN: Number(m[1]) })
  return out
}
