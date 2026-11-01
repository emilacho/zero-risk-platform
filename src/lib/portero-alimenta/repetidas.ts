/**
 * LAS FICHAS REPETIDAS SE RESUELVEN SOLAS (01-nov · firma de Emilio) · dos fichas vivas con la misma referencia, la misma huella y el mismo atributo son el mismo dato escrito dos veces.
 * El 01-nov 00:37Z dos comentarios de Instagram con el MISMO texto (ids distintos, misma huella) entraron en una misma corrida: la regla de «ya visto» mira huella + id del comentario y nada
 * miraba lo ya escrito en esa corrida, así que nacieron dos fichas con la misma referencia con 0,2 s de diferencia y el vigilante pausó a Náufrago ~16 h.
 * Dos defensas, ambas en el código que escribe (nunca a mano): (1) `planDeArchivo` no crea una ficha cuya referencia ya está viva; (2) después de escribir se vuelve a mirar (por si dos corridas
 * escribieron a la vez) y se retira la sobrante; y el vigilante hace lo mismo antes de pausar. Nada se borra: la sobrante queda con `retirada_en`, motivo y la ficha que se quedó.
 */
import { sobrantesResolubles, type FichaParaPuente } from './puente'

type Fila = Record<string, unknown>
type Base = { from: (t: string) => any } // eslint-disable-line @typescript-eslint/no-explicit-any

/** retira cada sobrante con fecha y motivo; solo toca fichas VIVAS del cliente. Devuelve cuántas retiró y los errores (que se DICEN) */
export async function retirarSobrantes(db: Base, clientId: string, pares: Array<{ id: string; queda: string }>, ahora: Date, quien: string): Promise<{ retiradas: number; errores: string[] }> {
  const errores: string[] = []
  let retiradas = 0
  for (const p of pares) {
    const motivo = `repetida de ${p.queda} (misma referencia, mismo contenido): ${quien} retiró la sobrante el ${ahora.toISOString().slice(0, 10)}`
    const u = await db.from('cerebro_fichas').update({ retirada_en: ahora.toISOString(), motivo_retirada: motivo, reemplazada_por: p.queda }).eq('id', p.id).eq('client_id', clientId).is('retirada_en', null)
    if (u.error) errores.push(`retirar ${p.id.slice(0, 8)}: ${u.error.message}`)
    else retiradas++
  }
  return { retiradas, errores }
}

/** tras escribir: mira las fichas vivas con las referencias recién escritas y retira las sobrantes (dos corridas a la vez) */
export async function retirarSobrantesDeLasRefs(db: Base, clientId: string, refs: string[], ahora: Date, quien: string): Promise<{ retiradas: number; errores: string[] }> {
  const unicas = [...new Set(refs)]
  const vivas: FichaParaPuente[] = []
  for (let i = 0; i < unicas.length; i += 100) {
    const l = await db.from('cerebro_fichas').select('id, client_id, ref, huella, atributo, observado_en, creado_en, propiedad, descartada, retirada_en, prueba, contenido').eq('client_id', clientId).is('retirada_en', null).in('ref', unicas.slice(i, i + 100)).limit(1000)
    if (l.error) return { retiradas: 0, errores: [`repetidas: ${l.error.message}`] }
    vivas.push(...((Array.isArray(l.data) ? l.data : []) as Fila[] as unknown as FichaParaPuente[]).filter((f) => !f.retirada_en && f.descartada !== true && f.propiedad !== 'incierta' && f.prueba !== true))
  }
  return retirarSobrantes(db, clientId, sobrantesResolubles(vivas), ahora, quien)
}
