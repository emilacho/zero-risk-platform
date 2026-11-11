/**
 * ¿ESTE BRIEF ES DE ESTA SALA? · GO Lenovo 11-nov «la mesa confía en la familia» · puro (sin base ni red).
 *
 * La familia de un encargo YA la decidió la cadena (la tabla de formatos por red → `familias_por_brief` del parte → el sobre → la plantilla).
 * La oficina NO la vuelve a adivinar por el texto del brief (antes: /imagen/, /carrusel/, /kit/, /reel/… · una «foto» caía como «no es un post de imagen»).
 *
 * Red de seguridad, con la MISMA fuente que usó la cadena (su tabla `cadena_formatos_por_red`, leída por el almacén de la cadena):
 *   · si la tabla conoce (red, formato) del brief y lo pone en OTRA clase de pieza, o en ninguna sala → la sala no lo hace y lo dice con su razón;
 *   · si la tabla no conoce ese formato (p. ej. el brief de kit «kit», que agrupa filas) o no se pudo leer → manda la familia del encargo, que es la decisión de la cadena.
 * Las variantes de una misma pieza (dos carruseles, dos kits) son la misma CLASE; la clase la declara cada plantilla (fila #19 · `clase.ts`), nunca el nombre.
 * Si la clase de alguna de las dos familias no se puede leer, NO se las da por iguales: otra familia es otra sala (como antes de las variantes).
 */
import type { FormatosPorRed } from '../cadena/tipos'
import type { BriefLeido } from './brief'
import { claseDe, type ClaseDePieza } from './clase'
import type { Puertos } from './puertos'
import { normalizar } from './texto'

export type VeredictoDeFamilia = { ok: true } | { ok: false; motivo: string }

/** la clase de una familia leída de SU plantilla (dato); `null` si no hay plantilla, no declara clase o la lectura falla */
export type LeerClase = (familia: string) => Promise<ClaseDePieza | null>
export const claseDeLaFamilia = (P: Pick<Puertos, 'almacen'>): LeerClase => async (familia) => { try { return claseDe((await P.almacen.leerPlantilla(familia))?.plantilla) } catch { return null } }

export function briefEsDeLaFamilia(brief: Pick<BriefLeido, 'id' | 'red' | 'formato'>, familiaDelEncargo: string, formatos: FormatosPorRed | null, clases?: Record<string, ClaseDePieza | null>): VeredictoDeFamilia {
  if (!formatos) return { ok: true }
  const red = normalizar(brief.red)
  const formato = normalizar(brief.formato)
  const delaRed = Object.entries(formatos).find(([r]) => normalizar(r) === red)?.[1] ?? []
  const fila = delaRed.find((f) => normalizar(f.formato) === formato)
  if (!fila) return { ok: true }
  const familiaDeLaCadena = typeof fila.familia === 'string' && fila.familia.trim() ? fila.familia.trim() : null
  if (!familiaDeLaCadena) {
    return { ok: false, motivo: `el brief ${brief.id} es «${brief.red} · ${brief.formato}» y la tabla de formatos de la cadena no le da ninguna sala: esta sala (${familiaDelEncargo}) no lo produce` }
  }
  if (familiaDeLaCadena === familiaDelEncargo) return { ok: true }
  // otra familia es otra sala, salvo que las DOS plantillas declaren la misma clase (dato); una clase que no se puede leer no rescata nada
  const deLaCadena = clases?.[familiaDeLaCadena] ?? null
  if (deLaCadena && deLaCadena === (clases?.[familiaDelEncargo] ?? null)) return { ok: true }
  return { ok: false, motivo: `el brief ${brief.id} es «${brief.red} · ${brief.formato}», que la tabla de formatos de la cadena manda a la familia ${familiaDeLaCadena}; esta sala es ${familiaDelEncargo} y no lo produce` }
}

/** lo mismo, leyendo la tabla por el puerto (opcional); si el puerto falta o falla, manda la familia del encargo (la decisión de la cadena) */
export async function briefEsDelEncargo(brief: Pick<BriefLeido, 'id' | 'red' | 'formato'>, familiaDelEncargo: string, leerFormatos?: () => Promise<FormatosPorRed>, leerClase?: LeerClase): Promise<VeredictoDeFamilia> {
  let formatos: FormatosPorRed | null = null
  if (leerFormatos) { try { formatos = await leerFormatos() } catch { formatos = null } }
  const previo = briefEsDeLaFamilia(brief, familiaDelEncargo, formatos)
  if (previo.ok || !leerClase || !formatos) return previo
  // la tabla manda el brief a OTRA familia: ¿es la misma clase de pieza? (lo dice la plantilla de cada una)
  const red = normalizar(brief.red)
  const fila = (Object.entries(formatos).find(([r]) => normalizar(r) === red)?.[1] ?? []).find((f) => normalizar(f.formato) === normalizar(brief.formato))
  const otra = typeof fila?.familia === 'string' ? fila.familia.trim() : ''
  if (!otra) return previo
  const [a, b] = await Promise.all([leerClase(otra), leerClase(familiaDelEncargo)])
  return briefEsDeLaFamilia(brief, familiaDelEncargo, formatos, { [otra]: a, [familiaDelEncargo]: b })
}
