/**
 * ¿ESTE BRIEF ES DE ESTA SALA? · GO Lenovo 11-nov «la mesa confía en la familia» · puro (sin base ni red).
 *
 * La familia de un encargo YA la decidió la cadena (la tabla de formatos por red → `familias_por_brief` del parte → el sobre → la plantilla).
 * La oficina NO la vuelve a adivinar por el texto del brief (antes: /imagen/, /carrusel/, /kit/, /reel/… · una «foto» caía como «no es un post de imagen»).
 *
 * Red de seguridad, con la MISMA fuente que usó la cadena (su tabla `cadena_formatos_por_red`, leída por el almacén de la cadena):
 *   · si la tabla conoce (red, formato) del brief y lo pone en OTRA clase de pieza, o en ninguna sala → la sala no lo hace y lo dice con su razón;
 *   · si la tabla no conoce ese formato (p. ej. el brief de kit «kit», que agrupa filas) o no se pudo leer → manda la familia del encargo, que es la decisión de la cadena.
 * Las variantes de una misma pieza (`carrusel_ig_v1` / `carrusel_mesa`, `kit_historias` / `kit_mesa`) son la misma clase: `familiaDePieza`.
 */
import type { FormatosPorRed } from '../cadena/tipos'
import type { BriefLeido } from './brief'
import { familiaDePieza } from './paso-jefatura'
import { normalizar } from './texto'

export type VeredictoDeFamilia = { ok: true } | { ok: false; motivo: string }

const clase = (familia: string) => familiaDePieza({ familia })

export function briefEsDeLaFamilia(brief: Pick<BriefLeido, 'id' | 'red' | 'formato'>, familiaDelEncargo: string, formatos: FormatosPorRed | null): VeredictoDeFamilia {
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
  if (familiaDeLaCadena === familiaDelEncargo || clase(familiaDeLaCadena) === clase(familiaDelEncargo)) return { ok: true }
  return { ok: false, motivo: `el brief ${brief.id} es «${brief.red} · ${brief.formato}», que la tabla de formatos de la cadena manda a la familia ${familiaDeLaCadena}; esta sala es ${familiaDelEncargo} y no lo produce` }
}

/** lo mismo, leyendo la tabla por el puerto (opcional); si el puerto falta o falla, manda la familia del encargo (la decisión de la cadena) */
export async function briefEsDelEncargo(brief: Pick<BriefLeido, 'id' | 'red' | 'formato'>, familiaDelEncargo: string, leerFormatos?: () => Promise<FormatosPorRed>): Promise<VeredictoDeFamilia> {
  let formatos: FormatosPorRed | null = null
  if (leerFormatos) { try { formatos = await leerFormatos() } catch { formatos = null } }
  return briefEsDeLaFamilia(brief, familiaDelEncargo, formatos)
}
