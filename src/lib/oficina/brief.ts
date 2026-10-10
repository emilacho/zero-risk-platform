/**
 * LEER UN BRIEF DE LA PARTE (texto) · puro. La parte de trabajo vigente es markdown: «### BRF-0003 · Instagram · imagen» seguido de campos «- NOMBRE: valor» y listas «- NOMBRE:» con «  - elemento».
 * Aquí se saca UN brief por su identificador, con sus listas (vocabulario obligatorio, prohibido, negativos) como dato. Lo que el brief no trae queda vacío: nada se inventa.
 * Cuando la cadena emita briefs con listas visuales (`visual_obligatorio[]`, `visual_prohibido[]`), esta función las leerá del mismo modo (campos «VISUAL OBLIGATORIO» / «VISUAL PROHIBIDO»).
 */
import { aparicionesDe, normalizar } from './texto'

export interface BriefLeido {
  id: string
  red: string
  formato: string
  que_es: string
  protagonista: string
  mensaje: string
  limites: string
  vocabulario_obligatorio: string[]
  prohibido: string[]
  sintaxis: string
  visual: string
  visual_obligatorio: string[]
  visual_prohibido: string[]
  llamado: string
  variantes: string
  negativos: string[]
  aprueba: string
  /** el texto completo de la sección, tal cual (lo que se cita al extraer reglas) */
  texto: string
}

const CAMPOS_LISTA = new Set(['VOCABULARIO OBLIGATORIO', 'PROHIBIDO', 'NEGATIVOS', 'VISUAL OBLIGATORIO', 'VISUAL PROHIBIDO'])

/** corta la sección de un brief (desde su «### ID ·» hasta el siguiente «### » o «## ») */
export function seccionDelBrief(parte: string, id: string): string | null {
  const lineas = parte.replace(/\r/g, '').split('\n')
  const re = new RegExp(`^###\\s+${id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s+·`)
  const ini = lineas.findIndex((l) => re.test(l))
  if (ini < 0) return null
  let fin = lineas.length
  for (let i = ini + 1; i < lineas.length; i++) if (/^#{2,3}\s/.test(lineas[i])) { fin = i; break }
  return lineas.slice(ini, fin).join('\n').trim()
}

export function parsearBrief(parte: string, id: string): BriefLeido | null {
  const sec = seccionDelBrief(parte, id)
  if (!sec) return null
  const lineas = sec.split('\n')
  const cab = /^###\s+(\S+)\s+·\s+([^·]+?)\s+·\s+(.+)$/.exec(lineas[0])
  const campos: Record<string, string> = {}
  const listas: Record<string, string[]> = {}
  let lista: string | null = null
  for (const l of lineas.slice(1)) {
    const item = /^\s{2,}-\s+(.*\S)\s*$/.exec(l)
    if (item && lista) { listas[lista].push(item[1].trim()); continue }
    const campo = /^-\s+([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑ0-9 /()]*?):\s*(.*)$/.exec(l)
    if (campo) {
      const nombre = campo[1].trim()
      if (CAMPOS_LISTA.has(nombre) && campo[2].trim() === '') { lista = nombre; listas[nombre] = []; continue }
      lista = null
      campos[nombre] = campo[2].trim()
    }
  }
  const g = (k: string) => campos[k] ?? ''
  return {
    id, red: (cab?.[2] ?? '').trim(), formato: (cab?.[3] ?? '').trim(),
    que_es: g('QUÉ ES'), protagonista: g('PROTAGONISTA'), mensaje: g('MENSAJE (uno)'), limites: g('LÍMITES'),
    vocabulario_obligatorio: listas['VOCABULARIO OBLIGATORIO'] ?? [], prohibido: listas['PROHIBIDO'] ?? [],
    sintaxis: g('SINTAXIS'), visual: g('VISUAL'), visual_obligatorio: listas['VISUAL OBLIGATORIO'] ?? [], visual_prohibido: listas['VISUAL PROHIBIDO'] ?? [],
    llamado: g('LLAMADO A LA ACCIÓN'), variantes: g('VARIANTES'), negativos: listas['NEGATIVOS'] ?? [], aprueba: g('APRUEBA Y PARA CUÁNDO'), texto: sec,
  }
}

/** ¿es un post de imagen fija? (el brief dice «Instagram · imagen» / «imagen fija») */
export const esPostDeImagen = (b: BriefLeido): boolean => /imagen/i.test(b.formato) || /imagen fija/i.test(b.que_es)

/** proporción pedida en LÍMITES: «4:5» si lo menciona antes que «1:1» y ambos son opciones, la primera que aparezca; por omisión 1:1 */
export function proporcionDelBrief(b: Pick<BriefLeido, 'limites'>, porOmision = '1:1'): string {
  const m = /\b(\d{1,2}\s?:\s?\d{1,2})\b/.exec(b.limites)
  return m ? m[1].replace(/\s/g, '') : porOmision
}

/** los productos que protagonizan el brief: palabras del vocabulario del cliente (lo que muestran sus fotos) que el PROTAGONISTA nombra SIN negarlas («UNO. No el otro plato…» no cuenta) */
export function protagonistasDelBrief(b: Pick<BriefLeido, 'protagonista'>, vocabulario: string[]): string[] {
  const sale: string[] = []
  for (const v of vocabulario) {
    const palabra = normalizar(v)
    if (!palabra) continue
    const ap = aparicionesDe(b.protagonista, palabra)
    if (ap.some((a) => !a.negada) && !sale.some((s) => normalizar(s) === palabra)) sale.push(v)
  }
  return sale
}

/** ¿el brief (o el manual) prohíbe personas? Basta una mención NEGADA de «personas» en lo visual, los negativos o los prohibidos visuales («No aparecen personas»). */
export function prohibePersonas(b: Pick<BriefLeido, 'visual' | 'negativos' | 'visual_prohibido'>): boolean {
  const textos = [b.visual, ...b.negativos, ...b.visual_prohibido]
  return textos.some((t) => aparicionesDe(t, 'personas').some((a) => a.negada) || aparicionesDe(t, 'persona').some((a) => a.negada))
}

const MESES: Record<string, number> = { enero: 1, febrero: 2, marzo: 3, abril: 4, mayo: 5, junio: 6, julio: 7, agosto: 8, septiembre: 9, setiembre: 9, octubre: 10, noviembre: 11, diciembre: 12 }
/** «antes del 14 de octubre de 2026» ⇒ {fecha:'2026-10-14', hora:'00:00'} (antes de ese día, a su comienzo). Sin fecha explícita completa ⇒ null: la pieza no vence y se declara. HEURÍSTICA sobre texto libre. */
export function fechaLimiteDelBrief(aprueba: string): { fecha: string; hora: string } | null {
  const m = /(\d{1,2})\s+de\s+([a-záéíóú]+)\s+de\s+(\d{4})/i.exec(aprueba)
  if (!m) return null
  const mes = MESES[normalizar(m[2])]
  if (!mes) return null
  const dia = Number(m[1])
  if (dia < 1 || dia > 31) return null
  return { fecha: `${m[3]}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`, hora: '00:00' }
}
