/**
 * El manual de marca, en LIMPIO · lo que ve el cliente.
 *
 * ── POR QUÉ EXISTE ────────────────────────────────────────────────────────
 * El manual va a ir solo a Drive, en PDF. Y lo que viaja tiene que ser la
 * versión **limpia**: sin puntajes, sin nombres de columna, sin costo de la
 * corrida, sin advertencias internas del empleado.
 *
 * 🔴 **No es una precaución teórica.** Los cuatro manuales que ya están en
 * Drive (Náufrago · Zero Risk · Peniche · Almai) llevan la maquinaria adentro,
 * y **dos de ellos publican el costo de la corrida** — el de Náufrago dice,
 * textual, *"Costo de la corrida: $1,4430 · exec 85272"*. Se corrigió una vez
 * el texto que se guardaba (#330) y no puede volver a viajar el sucio.
 *
 * ── QUÉ SE SACA ───────────────────────────────────────────────────────────
 * · las advertencias del empleado sobre su propio trabajo (ya se extraen a
 *   `_caveats` al guardar · acá simplemente no se imprimen)
 * · los identificadores internos que se hayan colado en la prosa
 * · las secciones vacías · un título con "(vacío)" debajo es ruido
 * · TODO lo de proceso: puntajes, umbral, ciclos, lentes, provisionalidad,
 *   costo, identificadores de fila y de ejecución
 *
 * ── QUÉ SE CONSERVA ───────────────────────────────────────────────────────
 * El documento de marca y nada más, en el orden en que se lee: quién es,
 * a quién le habla, cómo suena, qué promete, qué palabras usa y cuáles no.
 *
 * Función PURA · sin IO · se prueba sin base y sin red.
 */
import { extractTrailingCaveat, detectInternalTerms } from './brand-book-caveat-extractor'

/** Ancho de línea del texto plano · el PDF lo respeta. */
const ANCHO = 76

export interface ManualLimpioEntrada {
  /** Fila de `client_brand_books` (o su `brand_book_draft`). */
  readonly brand_book: Record<string, unknown>
  /** Nombre del cliente · lo pone el encabezado. */
  readonly client_name: string
  readonly industry?: string | null
  readonly country?: string | null
  readonly city?: string | null
  readonly website?: string | null
  /** Fecha del manual · ISO. */
  readonly created_at?: string | null
  /** Ronda 75 · «en qué se basó»: líneas ya redactadas (reseñas leídas, videos mirados…) · vacío o ausente = el manual no cambia. */
  readonly fuentes_consultadas?: readonly string[]
}

export interface ManualLimpio {
  readonly texto: string
  /** Nombre del archivo, sin extensión · `Manual de Marca · <Cliente>`. */
  readonly nombre: string
  /** Secciones que salieron · para el recibo. */
  readonly secciones: string[]
  /** Secciones omitidas por estar vacías · declarado, no escondido. */
  readonly omitidas: string[]
  /** Identificadores internos que sobrevivieron · debería ser SIEMPRE vacío. */
  readonly fugas: string[]
}

/** Nombre canónico · el mismo patrón que los 4 que ya están en Drive. */
export function nombreDelManual(clientName: string): string {
  return `Manual de Marca · ${String(clientName || '').trim() || 'Cliente'}`
}

/**
 * Un párrafo = UNA línea. Antes se cortaba a 76 columnas con saltos duros: al convertir a documento de Drive cada salto era un párrafo nuevo y el PDF salía con frases cortadas
 * («… valora» / «consistencia pedido a pedido»). Es el documento el que acomoda el ancho.
 */
function ajustar(texto: string): string {
  return String(texto)
    .split('\n')
    .map((par) => par.trim().split(/\s+/).filter(Boolean).join(' '))
    .join('\n')
}

function titulo(t: string): string {
  return `\n${t}\n${'─'.repeat(Math.min(ANCHO, t.length + 4))}\n`
}

// ───────────────────────── presentación para un lector (ronda 71)
/** los asteriscos de markdown no se imprimen: lo en negrita queda como texto, los encabezados como líneas */
export function sinMarkdown(t: string): string {
  return String(t)
    .replace(/\*\*([\s\S]+?)\*\*/g, '$1')
    .replace(/__([\s\S]+?)__/g, '$1')
    .replace(/(^|[\s(«"])\*(?=\S)([^*\n]+?)\*(?=$|[\s.,;:!?)»"])/gm, '$1$2')
    .replace(/\*\*|__/g, '')
    .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
    // el escape de markdown (\! \* \_ \# \( …) no se imprime: queda el carácter
    .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~\\])/g, '$1')
}

/** «[frase propia del cliente, verbatim, …]» → nota discreta; «[propuesta del agente — …]» → «propuesta»; cualquier otra anotación entre corchetes se quita */
export function presentarEtiquetas(t: string): string {
  return String(t)
    .replace(/\s*\[\s*frase propia del cliente[^\]]*\]/gi, ' — frase del cliente')
    .replace(/\s*\[\s*propuesta del agente[^\]]*\]/gi, ' — propuesta')
    .replace(/\s*\[[^\]\n]*\]/g, '')
    .replace(/[ \t]{2,}/g, ' ')
}

/** «Segmento 1 — Residente local o visitante…» (encabezados del resumen de a quién le hablamos) → { 1: 'Residente local o visitante…' } */
export function nombresDeSegmentos(icpSummary: unknown): Record<number, string> {
  const out: Record<number, string> = {}
  for (const m of String(icpSummary ?? '').matchAll(/^[ \t]*\**[ \t]*Segmento[ \t]+(\d+)[ \t]*[—–-][ \t]*(.+?)[ \t]*\**[ \t]*$/gm)) {
    const nombre = m[2].replace(/\*+/g, '').replace(/[.\s]+$/, '').trim()
    if (nombre) out[Number(m[1])] = nombre
  }
  return out
}

/** el nombre del segmento para el CORRER del texto: sin la cola de lugar («… en Olón») ni el paréntesis; el subtítulo conserva el nombre completo */
export function nombreCorto(nombre: string): string {
  const sinParentesis = nombre.replace(/\s*\([^)]*\)/g, '').trim()
  const corto = sinParentesis.replace(/\s+en\s+[A-ZÁÉÍÓÚÑ][\wáéíóúñ]*(?:\s+y\s+[\wáéíóúñ ]+)?$/, '').trim()
  return corto.split(/\s+/).length >= 2 ? corto : sinParentesis
}

const CLAVES = String.raw`S[1-9](?:\s*(?:,|\/|–|-|y|e)\s*S[1-9])*`
/** «S1», «S1 y S3», «S2, S4», «S1/S3», «S1-S4» → los números; null si algún número no tiene nombre conocido */
function numerosDe(m: string, nombres: Record<number, string>): number[] | null {
  const rango = /^S([1-9])\s*[–-]\s*S([1-9])$/.exec(m)
  const lista = rango
    ? Array.from({ length: Math.max(0, Number(rango[2]) - Number(rango[1]) + 1) }, (_, k) => Number(rango[1]) + k)
    : [...m.matchAll(/S([1-9])/g)].map((x) => Number(x[1]))
  return lista.length && lista.every((n) => nombres[n]) ? lista : null
}
const unidos = (xs: string[]): string => (xs.length === 1 ? xs[0] : `${xs.slice(0, -1).join(', ')} y ${xs[xs.length - 1]}`)
const SIN_ADJETIVO = new Set(['de', 'del', 'la', 'el', 'en', 'y', 'e', 'que', 'para', 'con', 'por', 'a', 'al', 'su', 'sus', 'es', 'son', 'mas'])

/**
 * Las claves internas de los segmentos («S1», «S1 y S3», «S2, S4», «S1/S3», «S1-S4») → el NOMBRE del segmento, y que la frase lea como escrita por una persona:
 *  · «(S2, S4)» entre paréntesis se quita (ya se acaba de describir lo mismo con palabras)
 *  · «el segmento local S1» ⇒ «el segmento «Nombre»» (sin el calificativo, que repetiría el nombre) y «S3 (veraneantes de temporada)» no repite lo que el nombre ya dice
 *  · «la objeción latente S3 «posible variación…»» / «el objetivo S2 'disfrutar…'» ⇒ «la objeción latente del segmento «Nombre»: «posible variación…»» (una sola cita, sin comillas encadenadas)
 * Si algún número no tiene nombre conocido, esa mención se deja como está.
 */
export function ponerNombresDeSegmento(t: string, nombres: Record<number, string>): string {
  if (!Object.keys(nombres).length) return t
  const dicho = (m: string): string[] | null => { const l = numerosDe(m, nombres); return l ? l.map((n) => `«${nombreCorto(nombres[n])}»`) : null }
  let out = String(t)
  // 1 · una mención solo entre paréntesis
  out = out.replace(new RegExp(String.raw`[ \t]*\(\s*(${CLAVES})\s*\)`, 'g'), (m, k: string) => (numerosDe(k, nombres) ? '' : m))
  // 2 · «segmento <calificativo> S1»
  out = out.replace(new RegExp(String.raw`\b(segmentos?)(?:[ \t]+([a-záéíóúñ]+))?[ \t]+(${CLAVES})\b`, 'g'), (m, seg: string, adj: string | undefined, k: string) => {
    const d = dicho(k)
    if (!d) return m
    const calificativo = adj && !SIN_ADJETIVO.has(adj.toLowerCase()) ? '' : adj ? ` ${adj}` : ''
    return `${seg}${calificativo} ${unidos(d)}`
  })
  // 3 · la clave pegada a una cita: «… S3 «x»» o «… S2 'x'» ⇒ «… del segmento «N»: «x»»
  out = out.replace(new RegExp(String.raw`(\bde[ \t]+)?(${CLAVES})(?=[ \t]*(?:«|'))`, 'g'), (m, de: string | undefined, k: string) => {
    const l = numerosDe(k, nombres)
    if (!l) return m
    const d = dicho(k)!
    return `${l.length === 1 ? 'del segmento' : 'de los segmentos'} ${unidos(d)}:`
  })
  out = out.replace(/(»:)[ \t]*'([^'\n]+)'/g, '$1 «$2»')
  // 4 · las demás menciones, con su nombre
  out = out.replace(new RegExp(String.raw`\b${CLAVES}\b`, 'g'), (m) => { const d = dicho(m); return d ? unidos(d) : m })
  // 5 · «Nombre» (descripción que el nombre ya dice) ⇒ sin el paréntesis repetido
  out = out.replace(/(«([^»]+)»)[ \t]*\(([^()]+)\)/g, (m, cita: string, nombre: string, par: string) => {
    const pal = (x: string) => x.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9ñ]+/).filter((w) => w.length > 2)
    const del = pal(nombre)
    const dentro = pal(par)
    return dentro.length && dentro.every((w) => del.some((n) => n.slice(0, 5) === w.slice(0, 5))) ? cita : m
  })
  return out
}

/** palabras de oficina que un lector no tiene por qué conocer → su equivalente llano */
export function palabrasLlanas(t: string): string {
  return String(t)
    .replace(/\bpool de LTV\b/gi, 'grupo de clientes de valor')
    .replace(/\bLTV\b/g, 'valor del cliente en el tiempo')
    .replace(/\bchurn\b/gi, 'abandono')
    .replace(/\bpool\b/gi, 'grupo')
    .replace(/\bICP\b/g, 'perfil de cliente ideal')
    .replace(/\bKPIs?\b/g, 'indicador')
    .replace(/\bROI\b/g, 'retorno de la inversión')
    .replace(/\bCTA\b/g, 'llamado a la acción')
    .replace(/\bfunnel\b/gi, 'embudo')
    .replace(/\bcopys?\b/gi, 'texto')
    .replace(/\bgoals\b/gi, 'objetivos').replace(/\bgoal\b/gi, 'objetivo').replace(/\bpain points\b/gi, 'dolores').replace(/\bpain point\b/gi, 'dolor').replace(/\bpain\b/gi, 'dolor')
}

/** todo lo anterior, en el orden que lee bien */
function paraElLector(t: string, nombres: Record<number, string>): string {
  return palabrasLlanas(ponerNombresDeSegmento(presentarEtiquetas(sinMarkdown(t)), nombres))
}

function vinetas(a: unknown, nombres: Record<number, string> = {}): string {
  const arr = Array.isArray(a) ? a : []
  return arr.map((x) => '• ' + ajustar(paraElLector(String(x), nombres))).join('\n')
}

const lleno = (v: unknown): boolean =>
  v != null && (Array.isArray(v) ? v.length > 0 : String(v).trim() !== '')

/**
 * Arma el manual limpio. Nunca lanza · un manual vacío devuelve el encabezado
 * y la lista de omitidas, no una excepción.
 */
export function renderManualLimpio(entrada: ManualLimpioEntrada): ManualLimpio {
  const bb = entrada.brand_book || {}
  // El borrador completo vive en `content_text`; los campos con columna propia
  // están arriba. Se prefiere el borrador (tiene los 6 provisionales).
  let draft: Record<string, unknown> = bb
  const ct = bb.content_text
  if (typeof ct === 'string' && ct.trim()) {
    try {
      const p = JSON.parse(ct) as Record<string, unknown>
      const d = (p.brand_book_draft as Record<string, unknown>) || null
      if (d && typeof d === 'object') draft = { ...d, ...bb }
    } catch {
      /* content_text ilegible · se sigue con las columnas */
    }
  }

  // las claves S1–S4 de los segmentos salen con el nombre que les da el propio resumen de a quién le hablamos
  const nombres = nombresDeSegmentos(draft.icp_summary)
  const secciones: string[] = []
  const omitidas: string[] = []
  const fugas: string[] = []

  /** Texto de prosa, ya sin la advertencia interna. */
  const prosa = (campo: string): string => {
    const raw = draft[campo]
    if (typeof raw !== 'string' || !raw.trim()) return ''
    const { clean } = extractTrailingCaveat(raw)
    const t = detectInternalTerms(clean)
    if (t.length) fugas.push(`${campo}: ${t.join(', ')}`)
    const presentado = paraElLector(clean, nombres)
    return campo === 'icp_summary' ? presentado.replace(/\n(?=Segmento \d+ [—–-] )/g, '\n\n') : presentado
  }

  let o = ''
  o += 'MANUAL DE MARCA\n'
  o += `${String(entrada.client_name || '').trim()}\n\n`
  const ubic = [entrada.industry, [entrada.city, entrada.country].filter(Boolean).join(', ')]
    .filter((x) => x && String(x).trim())
    .join(' · ')
  if (ubic) o += `${ubic}\n`
  if (entrada.website) o += `${entrada.website}\n`
  o += `\nPreparado por Zero Risk`
  o += entrada.created_at ? ` · ${String(entrada.created_at).slice(0, 10)}\n` : '\n'

  const bloques: Array<[string, string, 'prosa' | 'lista']> = [
    ['POSICIONAMIENTO', 'positioning', 'prosa'],
    ['MISIÓN', 'mision', 'prosa'],
    ['PROPÓSITO', 'proposito', 'prosa'],
    ['A QUIÉN LE HABLAMOS', 'icp_summary', 'prosa'],
    ['CÓMO SUENA LA MARCA', 'voice_description', 'prosa'],
    ['PERSONALIDAD', 'personalidad', 'lista'],
    ['LEMAS PROPUESTOS', 'tagline_opciones', 'lista'],
    ['MENSAJES CLAVE', 'mensajes_clave', 'lista'],
    ['PROPUESTAS DE VALOR', 'propuestas_de_valor', 'lista'],
    ['EL RECORRIDO DEL CLIENTE', 'customer_angle', 'prosa'],
    ['CÓMO SE FIDELIZA', 'retention_notes', 'prosa'],
    ['VOCABULARIO OBLIGATORIO', 'required_terminology', 'lista'],
    ['PALABRAS PROHIBIDAS', 'forbidden_words', 'lista'],
  ]

  for (const [tit, campo, tipo] of bloques) {
    if (tipo === 'prosa') {
      const t = prosa(campo)
      if (!t) { omitidas.push(campo); continue }
      secciones.push(campo)
      o += titulo(tit) + ajustar(t) + '\n'
    } else {
      const a = draft[campo]
      if (!lleno(a)) { omitidas.push(campo); continue }
      secciones.push(campo)
      o += titulo(tit) + vinetas(a, nombres) + '\n'
    }
  }

  const pol = draft.competitor_mentions_policy ?? bb.competitor_mentions_policy
  if (lleno(pol)) {
    secciones.push('competitor_mentions_policy')
    o += titulo('SOBRE MENCIONAR COMPETIDORES')
    o +=
      ajustar(
        pol === 'never_mention'
          ? 'En las piezas no se nombra a la competencia.'
          : String(pol),
      ) + '\n'
  }

  const fuentes = (entrada.fuentes_consultadas ?? []).filter((x) => x && x.trim())
  if (fuentes.length) {
    secciones.push('fuentes_consultadas')
    o += titulo('EN QUÉ SE BASÓ ESTE MANUAL') + fuentes.map((x) => ajustar(x)).join('\n') + '\n'
  }

  return {
    texto: o,
    nombre: nombreDelManual(entrada.client_name),
    secciones,
    omitidas,
    fugas,
  }
}
