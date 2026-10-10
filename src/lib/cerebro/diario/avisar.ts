/**
 * AVISAR (paso 4) · SOLO LA LIBRERÍA PURA DE CRUCE. NO hay ruta ni nodo todavía: D-5 (Lenovo) manda construir PRIMERO `output_id` en la cola de revisión; sin ese vínculo no hay aviso
 * exacto y NO se hace aviso genérico. Marca, nunca cambia la pieza. PURO.
 * Una pieza sin `output_id` NO se cruza (se cuenta en `sin_vinculo`): no se adivina a qué pieza pertenece.
 * Los importes se comparan por VALOR («$12.50» de la pieza = «$12 50» de una línea normalizada).
 */
import type { Diferencia } from './comparar'

export interface PiezaEnCurso { output_id: string | null; tipo: string; texto: string }
export interface Aviso { output_id: string; dato: string; clase: 'precio' | 'horario'; motivo: string }
export interface ResultadoDeCruce { avisos: Aviso[]; sin_vinculo: number }

/** importe en texto escrito («$12.50», «$ 3») o ya normalizado («$12 50»: la coma/punto decimal quedó como espacio, siempre con 2 cifras) */
const RE_IMPORTE = /\$\s?(\d+)(?:[.,](\d{1,2})|\s(\d{2})(?!\d))?/g
export function importesDe(texto: string): string[] {
  const out: string[] = []
  for (const m of texto.matchAll(RE_IMPORTE)) out.push(`$${Number(`${m[1]}.${m[2] ?? m[3] ?? '0'}`).toFixed(2)}`)
  return out
}

/** importes que estaban en lo quitado y ya no están en lo nuevo, y que la pieza todavía menciona */
export function avisosDePiezas(d: Diferencia, piezas: PiezaEnCurso[]): ResultadoDeCruce {
  const enNuevas = new Set(d.nuevas.flatMap((l) => importesDe(l.linea)))
  const perdidos = [...new Set(d.quitadas.filter((l) => l.clase === 'precio').flatMap((l) => importesDe(l.linea)))].filter((i) => !enNuevas.has(i))
  const out: ResultadoDeCruce = { avisos: [], sin_vinculo: 0 }
  for (const p of piezas) {
    if (!p.output_id) { out.sin_vinculo++; continue }
    const enLaPieza = new Set(importesDe(p.texto))
    for (const imp of perdidos) if (enLaPieza.has(imp)) out.avisos.push({ output_id: p.output_id, dato: imp, clase: 'precio', motivo: `la pieza menciona ${imp}, que ya no aparece en lo vigente del cliente` })
  }
  return out
}
