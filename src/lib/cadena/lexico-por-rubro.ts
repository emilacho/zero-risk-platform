/**
 * PAQUETES DE LÉXICO POR RUBRO · r75 · H3 · la base del idioma (`afirmaciones.ts`) solo trae lo ESTRUCTURAL (cifras, dinero, medidas, porcentajes, certificación, garantía, superlativos).
 * Frescura, origen, porción, composición, trazabilidad e historia de receta son afirmaciones de ciertos rubros (los que venden alimentos o bienes): viven aquí como DATO, se cargan según la INDUSTRIA de la ficha
 * y se pueden reemplazar o ampliar sin publicar en `cadena_config.lexico_afirmaciones.paquetes` (misma forma). Un rubro sin paquete (servicios, software, salud…) no recibe ninguna alerta de frescura u origen.
 * Agnóstico: ningún cliente, ciudad ni nombre propio; las palabras de industria son las de un tipo de negocio, no las de una marca.
 */
import { LEXICO_BASE, lexicoDesdeConfig, type LexicoAfirmaciones } from './afirmaciones'
import { coincideAlguna } from '../texto/clave-de-rubro'

export interface PaqueteDeRubro { industria: string[]; lexico: LexicoAfirmaciones }

// regex en minúsculas y SIN acentos (se miden contra el texto normalizado)
const FRESCURA = { subtipo: 'frescura', re: '\\b(?:mismo dia|de hoy|hoy mismo|esta (?:manana|tarde|noche)|ayer|recien (?:\\w+[ai]d[oa]s?|hech[oa]s?|salid[oa]s?)|(?:capturad|recolectad|cosechad)[oa]s?|fresc[oa]s?|frescura)\\b' }
const ORIGEN = { subtipo: 'origen', re: '\\b(?:de la zona|de la costa|del campo|de origen|traid[oa]s? (?:de|desde|ayer|hoy)|llega(?:n)? (?:de|desde)|importad[oa]s?|directo (?:del|de la|de los|de las|desde)\\s+\\w+)\\b' }
const PORCION = { subtipo: 'porcion', re: '\\b(?:alcanza(?:n)? para|rinde(?:n)? para|para \\d+ personas?|porcion(?:es)? (?:generosa|abundante|grande)s?)\\b' }
const TRAZABILIDAD = { subtipo: 'trazabilidad', re: '\\b(?:el mismo (?:que|quien)|el es quien|ella es quien|es quien \\w+|directo (?:del|de la) \\w+|sin intermediarios|de nuestr[oa]s? propi[oa]s? \\w+)\\b' }
const COMPOSICION = { subtipo: 'composicion', re: '\\b(?:sin (?:conservantes|aditivos|quimicos|preservantes|colorantes)|organic[oa]s?|artesanal(?:es)?|hecho a mano)\\b' }
const NOVEDAD = { subtipo: 'frescura', re: '\\brecien (?:\\w+[ai]d[oa]s?|hech[oa]s?|salid[oa]s?)\\b' }
const RECETA = { subtipo: 'historia', re: '\\b(?:receta (?:familiar|de la abuela|secreta|tradicional)|tradicion (?:familiar|de))\\b' }

/** los paquetes que el sistema trae de fábrica (se reemplazan por los de `cadena_config` si existen con la misma clave) */
export const PAQUETES_DE_FABRICA: Record<string, PaqueteDeRubro> = {
  alimentos: {
    industria: ['aliment*', 'comida', 'gastronom*', 'restaur*', 'cafeter*', 'cafe', 'panader*', 'pasteler*', 'bebida', 'cocina', 'bar', 'heladeri*', 'food', 'catering', 'delivery', 'marisc*', 'carne', 'fruta', 'verdura', 'agricol*', 'pesca', 'lacteo*', 'chocolat*'],
    lexico: { patrones: [FRESCURA, ORIGEN, PORCION, TRAZABILIDAD, COMPOSICION, RECETA], origen_lugar: true, ambiente: ['brisa', 'terraza', 'salon'], no_origen: ['carta', 'menu'] },
  },
  bienes: {
    industria: ['tienda', 'moda', 'ropa', 'calzado', 'joyer*', 'cosmetic*', 'artesan*', 'mueble', 'decoraci*', 'juguet*', 'ferreter*', 'comercio electronico', 'comercio minorista', 'e-commerce', 'ecommerce', 'retail', 'manufactur*', 'fabrica', 'producto'],
    lexico: { patrones: [ORIGEN, COMPOSICION, TRAZABILIDAD, NOVEDAD], origen_lugar: true },
  },
}

/** ¿la industria de la ficha corresponde a este paquete? (palabras de industria; coincidencia por PALABRA ENTERA, raíz solo con asterisco: `texto/clave-de-rubro.ts`) */
export const industriaCoincide = (industria: string | null | undefined, palabras: readonly string[]): boolean => {
  return coincideAlguna(industria, palabras)
}

/** une léxicos: listas por unión, patrones por suma, banderas por OR (lo posterior no quita lo anterior) */
export function combinarLexicos(...ls: Array<LexicoAfirmaciones | undefined | null>): LexicoAfirmaciones {
  const out: LexicoAfirmaciones = {}
  for (const l of ls) {
    if (!l) continue
    for (const k of ['cantidad_unidades', 'ambiente', 'no_origen', 'locativos', 'no_cantidad', 'figurado', 'personas'] as const) if (l[k]) out[k] = [...new Set([...(out[k] ?? []), ...l[k]!])]
    if (l.patrones) out.patrones = [...(out.patrones ?? []), ...l.patrones.filter((p) => !(out.patrones ?? []).some((q) => q.subtipo === p.subtipo && q.re === p.re))]
    if (l.origen_lugar) out.origen_lugar = true
  }
  return out
}

/** valida `cadena_config.lexico_afirmaciones.paquetes` ({ clave: { industria: [...], lexico: {...} } }): lo inválido se ignora, nunca rompe el chequeo */
export function paquetesDesdeConfig(valor: unknown): Record<string, PaqueteDeRubro> {
  if (!valor || typeof valor !== 'object' || Array.isArray(valor)) return {}
  const p = (valor as Record<string, unknown>).paquetes
  if (!p || typeof p !== 'object' || Array.isArray(p)) return {}
  const out: Record<string, PaqueteDeRubro> = {}
  for (const [k, v] of Object.entries(p as Record<string, unknown>)) {
    const q = v as { industria?: unknown; lexico?: unknown } | null
    if (!q || !Array.isArray(q.industria)) continue
    const industria = q.industria.filter((x): x is string => typeof x === 'string' && x.trim() !== '' && x.length <= 40)
    if (industria.length) out[k] = { industria, lexico: lexicoDesdeConfig(q.lexico) }
  }
  return out
}

/** el léxico de un cliente a partir de su industria y de `cadena_config.lexico_afirmaciones` tal como está guardado */
export const lexicoDelCliente = (industria: string | null | undefined, config: unknown): LexicoAfirmaciones => lexicoDeLaIndustria(industria, lexicoDesdeConfig(config), paquetesDesdeConfig(config))

/**
 * El léxico de ESTE cliente: lo plano de la configuración + los paquetes cuya industria coincide con la de su ficha.
 * `paquetesDeConfig` (de `cadena_config.lexico_afirmaciones.paquetes`) manda sobre los de fábrica con la misma clave. Sin industria o sin coincidencia: solo la base.
 */
export function lexicoDeLaIndustria(industria: string | null | undefined, lexicoPlano?: LexicoAfirmaciones, paquetesDeConfig?: Record<string, PaqueteDeRubro>): LexicoAfirmaciones {
  const todos = { ...PAQUETES_DE_FABRICA, ...(paquetesDeConfig ?? {}) }
  const elegidos = Object.values(todos).filter((p) => industriaCoincide(industria, p.industria)).map((p) => p.lexico)
  const deLosPaquetes = combinarLexicos(...elegidos)
  const total = combinarLexicos(lexicoPlano, deLosPaquetes)
  // una lista que un paquete aporta SUMA a la de la base (o a la del plano, si la configuración la reemplazó): el paquete nunca borra lo estructural
  for (const k of ['ambiente', 'no_origen', 'locativos', 'cantidad_unidades', 'no_cantidad', 'figurado', 'personas'] as const) {
    if (deLosPaquetes[k]) total[k] = [...new Set([...(lexicoPlano?.[k] ?? LEXICO_BASE[k]), ...deLosPaquetes[k]!])]
  }
  return total
}
