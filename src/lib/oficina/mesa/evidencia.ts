/**
 * EL OBSERVADOR DE IMAGEN Y EL COTEJO MÍNIMO · puro. Condiciones 4 y 5 de CC#3:
 *  · el observador (un modelo de OTRO proveedor) mira cada imagen generada FUERA de la mesa: no aporta ni opina sobre la pieza, solo dice qué texto se ve y qué marcas aparecen;
 *  · el cotejo mínimo lo hace el CÓDIGO: todo texto visible que la pieza no pidió es un hallazgo que BLOQUEA esa imagen (no se elige) — sin listas de palabras.
 * 11-nov · #13 y #14 del barrido de reglas rígidas (GO Lenovo 18:50): el observador recibe el texto de la pieza y JUZGA dos cosas, que el código solo lee (sí o no):
 *  · TEXTO_AJENO: ¿se lee en la imagen un texto que no es de la pieza? (reemplaza el cotejo palabra por palabra);
 *  · DATO_SIN_VERIFICAR: ¿muestra un dato que nadie verificó (precio, cifra, sello, certificación, etiqueta, lectura)?
 *  Sin respuesta, ilegible o sin alguna de las dos: la imagen NO se acepta y una persona decide (nunca aprobada por omisión).
 */
import type { ObservacionDeImagen } from '../reglas-de-imagen'

export const PEDIDO_DEL_OBSERVADOR = (descripcion: string, textoDeLaPieza = ''): string => [
  'Mira la imagen. NO la evalúes ni opines: describe lo que se VE y contesta dos preguntas, en este formato exacto:',
  'TEXTO_VISIBLE: <cada texto legible en la imagen entre comillas, separados por " | "; si no hay ninguno, escribe: ninguno>',
  'MARCAS: <logotipos o marcas reconocibles, separados por " | "; si no hay, escribe: ninguna>',
  'PERSONAS: <número de personas visibles>',
  'TEXTO_AJENO: <sí o no · ¿algún texto que se lee en la imagen NO es del texto de la pieza (abajo)? Un texto de la pieza con otras mayúsculas o sin acentos no es ajeno; sin texto visible, escribe: no>',
  'DATO_SIN_VERIFICAR: <sí o no · ¿la imagen muestra un precio, una cifra, un sello, una certificación, una etiqueta, una norma o la lectura de un instrumento que el texto de la pieza no dice?>',
  `La imagen se pidió así: ${descripcion.slice(0, 600)}`,
  `Texto de la pieza: ${textoDeLaPieza.replace(/\s+/g, ' ').trim().slice(0, 1500) || '(sin texto)'}`,
].join('\n')

/** `texto_ajeno` y `dato_sin_verificar`: null = el observador no contestó esa pregunta (o no se pudo leer) */
export interface LecturaDelObservador { texto_leido: string[]; marcas: string[]; personas: number; leido: boolean; texto_ajeno: boolean | null; dato_sin_verificar: boolean | null }

const lista = (s: string): string[] => s.split('|').map((x) => x.trim().replace(/^["“”«»']+|["“”«»']+$/g, '').trim()).filter((x) => x && !/^(ninguno|ninguna|n\/a|-)$/i.test(x))

export function leerObservador(texto: string): LecturaDelObservador {
  const t = String(texto ?? '')
  const campo = (k: string) => new RegExp(`${k}\\s*:\\s*(.*)`, 'i').exec(t)?.[1] ?? null
  const tv = campo('TEXTO_VISIBLE'), mc = campo('MARCAS'), ps = campo('PERSONAS')
  if (tv === null) return { texto_leido: [], marcas: [], personas: 0, leido: false, texto_ajeno: null, dato_sin_verificar: null }
  return { texto_leido: lista(tv), marcas: mc ? lista(mc) : [], personas: ps ? Math.max(0, parseInt(ps, 10) || 0) : 0, leido: true, texto_ajeno: siNo(campo('TEXTO_AJENO')), dato_sin_verificar: siNo(campo('DATO_SIN_VERIFICAR')) }
}

/** «sí» / «no» al principio de la respuesta (con o sin acento, mayúsculas o asteriscos) · cualquier otra cosa = null (no contestó) */
export function siNo(v: string | null): boolean | null {
  const t = (v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/^[\s*_"'«»<>-]+/, '')
  if (/^(si|yes)\b/.test(t)) return true
  if (/^no\b/.test(t)) return false
  return null
}

const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9ñ]+/g, ' ').trim()

/**
 * ¿esta marca que el observador vio es del PROPIO cliente? (P3 · 29-oct: el observador rechazó la foto de Zero Risk como «marca ajena: Zero Risk» siendo Zero Risk el cliente).
 * Es propia si coincide con el nombre del cliente o su usuario, o si el nombre del cliente la contiene entera («Zero Risk» ⊂ «Zero Risk Seguridad Industrial») o ella lo contiene a él.
 * Mínimo 3 letras en la marca y 2 palabras en común cuando son varias: una marca de OTRO negocio con una palabra suelta igual NO pasa por propia.
 */
export function esMarcaPropia(marca: string, propias: string[]): boolean {
  const m = norm(marca)
  if (m.length < 3) return false
  const pm = m.split(' ').filter(Boolean)
  return propias.map(norm).filter((p) => p.length >= 3).some((p) => {
    if (p === m) return true
    const pp = p.split(' ').filter(Boolean)
    const contiene = (grande: string[], chico: string[]) => chico.length > 0 && chico.every((w) => grande.includes(w)) && (chico.length >= 2 || grande.length === 1)
    return contiene(pp, pm) || contiene(pm, pp)
  })
}

/** la observación con la forma que ya consume la elección de versiones (`aceptadas` por ref) */
/** `seco`: en un ensayo el observador NO mira (el revisor simulado no contesta): la imagen sigue sin juicio, se acepta y se dice (nada se publica); en real, sin juicio NO pasa */
export function observacionDeLaMesa(o: { items: Array<{ indice: number; ref: string }>; lecturas: Record<number, LecturaDelObservador>; marcasPropias?: string[]; seco?: boolean }): {
  observaciones: ObservacionDeImagen[]; aceptadas: Record<string, number[]>; rechazadas: Array<{ indice: number; ref: string; motivo: string }>; sin_lectura: number[]
} {
  const aceptadas: Record<string, number[]> = {}
  const rechazadas: Array<{ indice: number; ref: string; motivo: string }> = []
  const sin_lectura: number[] = []
  const observaciones: ObservacionDeImagen[] = []
  for (const it of o.items) {
    const l = o.lecturas[it.indice]
    // sin lectura, o sin alguna de las dos respuestas: NO se acepta · una persona decide (nunca aprobada por omisión · línea de CC7)
    if (!l?.leido || l.texto_ajeno === null || l.dato_sin_verificar === null) {
      sin_lectura.push(it.indice)
      if (o.seco === true) { (aceptadas[it.ref] ??= []).push(it.indice); continue }
      rechazadas.push({ indice: it.indice, ref: it.ref, motivo: !l?.leido ? 'el observador no contestó' : `el observador no contestó si ${l.texto_ajeno === null ? 'hay texto ajeno' : 'muestra un dato sin verificar'}` })
      continue
    }
    const ajenas = l.marcas.filter((m) => !esMarcaPropia(m, o.marcasPropias ?? []))
    observaciones.push({ indice: it.indice, reglas: [], texto_en_imagen: l.texto_leido, marcas: l.marcas, personas: l.personas, dato_sin_verificar: l.dato_sin_verificar })
    const motivos = [
      l.texto_ajeno ? `texto que la pieza no pidió${l.texto_leido.length ? `: ${l.texto_leido.slice(0, 3).join(' | ')}` : ''}` : '',
      l.dato_sin_verificar ? 'muestra un dato que nadie verificó' : '',
      ajenas.length ? `marca ajena: ${ajenas.slice(0, 3).join(' | ')}` : '',
    ].filter(Boolean)
    if (motivos.length) rechazadas.push({ indice: it.indice, ref: it.ref, motivo: motivos.join(' · ') })
    else (aceptadas[it.ref] ??= []).push(it.indice)
  }
  return { observaciones, aceptadas, rechazadas, sin_lectura }
}
