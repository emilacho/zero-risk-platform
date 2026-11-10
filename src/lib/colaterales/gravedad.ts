/**
 * MOTOR DE COLATERALES · tramo 2a · GRAVEDAD de una edición, decidida por el CÓDIGO (nunca por el agente: eso falló en E4 del ensayo 1).
 *
 * Dos formas, una sola puerta (adenda 1 del PLAN tramo 2 · la elige Lenovo):
 *   · 'campo'      (CRITERIOS v2 §2): público, oferta o idea → 🔴 entera.
 *   · 'dato_clave' (propuesta CC7, recomendada): 🔴 solo si lo que CAMBIA entre el antes y el después es un dato clave del campo:
 *        público → zona, sector, segmento, edad · oferta → precio o producto principal · idea → la idea central (siempre).
 *     Se decide comparando las palabras que cambian, NO por el nombre de la sección:
 *     «costa → playa» dentro de una objeción citada de «La audiencia» es 🟡; «zona norte → zona sur» es 🔴.
 * 🔴 = no pasa al agente de retoques: va por «Pedir cambios» (H4: queda pendiente con su confirmación única; ningún productor se llama antes).
 * Un dato repetido (horario, precio fuera de la oferta) NUNCA escala.
 */
import { normalizar } from './red'

export type Campo = 'publico' | 'oferta' | 'idea' | 'dato' | 'texto'
export type FormaDeGravedad = 'campo' | 'dato_clave'
export type Gravedad = 'rojo' | 'normal'
/** la forma que rige (Lenovo 13:12Z · recomendación CC7): «por dato clave del campo», comparando el antes y el después */
export const FORMA_VIGENTE: FormaDeGravedad = 'dato_clave'

export const CAMPOS_DE_FONDO: ReadonlySet<Campo> = new Set(['publico', 'oferta', 'idea'])

/** zonas y sectores (genéricos; los barrios o ciudades del cliente llegan en `lugares`) */
const ZONAS = ['norte', 'sur', 'este', 'oeste', 'centro', 'centrico', 'periferia', 'urbano', 'urbana', 'rural', 'sector', 'zona', 'barrio', 'cobertura', 'ciudad', 'provincia', 'nacional', 'internacional']
/** segmentos de personas */
const SEGMENTOS = ['jovenes', 'adultos', 'mayores', 'familias', 'familia', 'estudiantes', 'universitarios', 'ejecutivos', 'oficinistas', 'turistas', 'locales', 'residentes', 'mujeres', 'hombres', 'ninos', 'empresas', 'hogares', 'parejas', 'solteros', 'padres', 'madres', 'profesionales', 'emprendedores', 'b2b', 'b2c']
const EDAD = /\b\d{1,2}\s*(?:-|a|y)\s*\d{1,2}\s*anos\b|\b\d{1,2}\s*anos\b|\bmayores de \d{1,2}\b|\bmenores de \d{1,2}\b/
const PRECIO = /\$\s*\d+(?:[.,]\d{1,2})?|\b\d+[.,]\d{2}\b/

export interface DatosDelCliente {
  /** ciudades, barrios, sedes del cliente (normalizadas al comparar) */
  lugares?: readonly string[]
  /** productos principales de la oferta */
  productos?: readonly string[]
}

const palabras = (t: string): string[] => normalizar(t).match(/[a-zñ0-9$]+(?:[.,]\d+)?/g) ?? []

/** las palabras que entran o salen entre el antes y el después (multiconjunto simple) */
export function palabrasQueCambian(antes: string, despues: string): string[] {
  const a = palabras(antes)
  const d = palabras(despues)
  const resta = (x: string[], y: string[]): string[] => {
    const quedan = [...y]
    return x.filter((w) => {
      const i = quedan.indexOf(w)
      if (i >= 0) {
        quedan.splice(i, 1)
        return false
      }
      return true
    })
  }
  return [...resta(a, d), ...resta(d, a)]
}

/** ¿el cambio toca un dato clave de su campo? (solo se llama para campos de fondo) */
export function tocaDatoClave(campo: Campo, antes: string, despues: string, datos: DatosDelCliente = {}): boolean {
  if (campo === 'idea') return true
  const cambian = palabrasQueCambian(antes, despues)
  if (!cambian.length) return false
  const n = (xs: readonly string[] = []) => xs.map(normalizar)
  if (campo === 'publico') {
    const lugares = n(datos.lugares).flatMap((l) => l.split(/\s+/))
    if (cambian.some((w) => ZONAS.includes(w) || SEGMENTOS.includes(w) || lugares.includes(w))) return true
    // la edad: se mira el antes y el después enteros (un rango cambia varios números)
    const ea = normalizar(antes).match(EDAD)?.[0] ?? null
    const ed = normalizar(despues).match(EDAD)?.[0] ?? null
    return ea !== ed
  }
  if (campo === 'oferta') {
    const pa = normalizar(antes).match(new RegExp(PRECIO.source, 'g')) ?? []
    const pd = normalizar(despues).match(new RegExp(PRECIO.source, 'g')) ?? []
    if (pa.join('|') !== pd.join('|')) return true
    const productos = n(datos.productos).flatMap((p) => p.split(/\s+/)).filter((w) => w.length >= 4)
    return cambian.some((w) => productos.includes(w))
  }
  return false
}

export function gravedad(campo: Campo, antes: string, despues: string, forma: FormaDeGravedad, datos: DatosDelCliente = {}): Gravedad {
  if (!CAMPOS_DE_FONDO.has(campo)) return 'normal'
  if (forma === 'campo') return 'rojo'
  return tocaDatoClave(campo, antes, despues, datos) ? 'rojo' : 'normal'
}
