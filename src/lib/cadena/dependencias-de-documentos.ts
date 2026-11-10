/**
 * LISTA ÚNICA DE DEPENDENCIAS ENTRE DOCUMENTOS · motor de colaterales · tramo 1 (GO Lenovo 10-nov · CC1 · certifica CC7).
 *
 * Qué LEE cada documento de la cadena al hacerse, sacado del código que lo arma (no de un dibujo):
 *   · plan        ← manual                                   (`manual/pedir-plan.ts` · el pedido del plan viaja con el id del manual)
 *   · estrategia  ← plan, manual                             (`pasos.ts` `cargar` → `cargarContexto(client_id, plan_id)`: plan + manual + datos de sede)
 *   · brief       ← plan, manual, estrategia                 (`mesas.ts` `marcoDelBrief({ ctx, estrategia })` · además cita el plan literal)
 *   · gran_idea   ← brief, estrategia, manual · plan (vía brief) (`mesas.ts` `marcoDelConcepto({ ctx, estrategia, briefTexto })`: el pedido NO lleva el plan;
 *                                                              un cambio del plan le llega en cadena plan → brief → gran idea · GO Lenovo 10-nov 18:01Z, opción A)
 *   · calendario  ← gran_idea, estrategia, manual, plan      (`pasos.ts` `calendarioPreparar` · `conceptoParaElCalendario` + estrategia validada + ctx)
 *   · pieza       ← calendario, gran_idea, brief, manual, plan (`hoja.ts` `InsumosDeLaHoja`: plan_id, manual_id + versión, brief, concepto, filas)
 *
 * Corrección 2 de CC7 (10-nov): NO es una fila. Un cambio del manual va DIRECTO al brief, a la gran idea, al calendario y a las piezas, sin pasar por el plan.
 * Por eso la lista dice TODO lo que lee cada documento, no solo el eslabón anterior.
 *
 * Fuera de esta lista (a propósito): los datos de sede y la ficha de hechos entran por `cargarContexto` a casi todo; cuando la ficha de hechos cambie un dato,
 * entrega su «antes → después» al motor como una edición (nota CC1→CC2 10-nov). El cerebro tampoco está: la cadena solo lo LEE (CC7/CC6 10-nov).
 *
 * Función pura, sin red ni base. La leen el menú de «Pedir cambios», el motor y las pruebas: hay que escribirla UNA vez, aquí.
 */

/** los documentos, en el ORDEN de la cadena (el motor ajusta en este orden) */
export const DOCUMENTOS = ['manual', 'plan', 'estrategia', 'brief', 'gran_idea', 'calendario', 'pieza'] as const
export type Documento = (typeof DOCUMENTOS)[number]

/** qué lee cada documento al hacerse (dependencias DIRECTAS) */
export const LEE: Readonly<Record<Documento, readonly Documento[]>> = {
  manual: [],
  plan: ['manual'],
  estrategia: ['plan', 'manual'],
  brief: ['plan', 'manual', 'estrategia'],
  gran_idea: ['brief', 'estrategia', 'manual'], // el plan, vía brief (no directo)
  calendario: ['gran_idea', 'estrategia', 'manual', 'plan'],
  pieza: ['calendario', 'gran_idea', 'brief', 'manual', 'plan'],
}

const posicion = (d: Documento): number => DOCUMENTOS.indexOf(d)
const enOrden = (s: Set<Documento>): Documento[] => [...s].sort((a, b) => posicion(a) - posicion(b))

export function esDocumento(x: unknown): x is Documento {
  return typeof x === 'string' && (DOCUMENTOS as readonly string[]).includes(x)
}

/** quiénes leen DIRECTAMENTE a `doc` */
export function loLeenDirecto(doc: Documento): Documento[] {
  return DOCUMENTOS.filter((d) => LEE[d].includes(doc))
}

/** todo lo que puede quedar desalineado si cambia `doc` (directo o indirecto), en el orden de la cadena · nunca incluye a `doc` ni a nada de lo que él depende */
export function afectados(doc: Documento): Documento[] {
  const vistos = new Set<Documento>()
  const pendientes = [doc]
  while (pendientes.length) {
    const actual = pendientes.pop()!
    for (const d of loLeenDirecto(actual)) {
      if (!vistos.has(d)) {
        vistos.add(d)
        pendientes.push(d)
      }
    }
  }
  return enOrden(vistos)
}

/** todo aquello de lo que `doc` depende (directo o indirecto), en el orden de la cadena · el motor NUNCA propone cambios aquí (aguas arriba) */
export function aguasArriba(doc: Documento): Documento[] {
  const vistos = new Set<Documento>()
  const pendientes = [...LEE[doc]]
  while (pendientes.length) {
    const actual = pendientes.pop()!
    if (vistos.has(actual)) continue
    vistos.add(actual)
    pendientes.push(...LEE[actual])
  }
  return enOrden(vistos)
}

/** ¿se puede proponer un retoque en `destino` por una edición en `origen`? Solo si `destino` está aguas abajo (regla «nunca» n.º 7 de los criterios). */
export function puedeProponer(origen: Documento, destino: Documento): boolean {
  return afectados(origen).includes(destino)
}
