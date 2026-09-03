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

function ajustar(texto: string, ancho = ANCHO): string {
  return String(texto)
    .split('\n')
    .map((par) => {
      if (!par.trim()) return ''
      const out: string[] = []
      let linea = ''
      for (const w of par.trim().split(/\s+/)) {
        if ((linea ? linea.length + 1 : 0) + w.length > ancho) {
          if (linea) out.push(linea)
          linea = w
        } else linea += (linea ? ' ' : '') + w
      }
      if (linea) out.push(linea)
      return out.join('\n')
    })
    .join('\n')
}

function titulo(t: string): string {
  return `\n${t}\n${'─'.repeat(Math.min(ANCHO, t.length + 4))}\n`
}

function vinetas(a: unknown): string {
  const arr = Array.isArray(a) ? a : []
  return arr
    .map((x) => ajustar('• ' + String(x), ANCHO - 2).replace(/\n/g, '\n  '))
    .join('\n')
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
    return clean
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
      o += titulo(tit) + vinetas(a) + '\n'
    }
  }

  const pol = draft.competitor_mentions_policy ?? bb.competitor_mentions_policy
  if (lleno(pol)) {
    secciones.push('competitor_mentions_policy')
    o += titulo('SOBRE MENCIONAR COMPETIDORES')
    o +=
      ajustar(
        pol === 'never_mention'
          ? 'No se menciona a la competencia por nombre en ninguna pieza de comunicación.'
          : String(pol),
      ) + '\n'
  }

  return {
    texto: o,
    nombre: nombreDelManual(entrada.client_name),
    secciones,
    omitidas,
    fugas,
  }
}
