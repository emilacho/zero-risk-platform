/**
 * 04-nov · CADA LLAMADA GUARDA DE QUÉ TRABAJO ES (firma de Emilio 11:14Z, opción b).
 *
 * El llamador manda, en el cuerpo, en `context` o en encabezados: el trabajo raíz (`trabajo_tipo` + `trabajo_id`),
 * el `paso` y la `llamada_padre`. Lee esto antes de mandar:
 * - NUNCA frena una llamada: quien no los manda deja «sin dato» (NULL) y lo mal escrito se descarta y queda
 *   anotado en `metadata.trabajo_invalido`. Saber de qué trabajo es una llamada no vale más que la llamada.
 * - `paso` NO cambia la clave de lo ya guardado ni lo que lee el empleado; `step_name` sí. Sin `paso`, se usa `step_name`.
 * - Nada se deduce: ni por la hora ni por otra fila.
 *
 * Copia exacta de `src/lib/trabajo-de-la-llamada.ts` (el corredor no importa de la plataforma):
 * una prueba las ata, y también ata la lista a la restricción de la base.
 */
export const TIPOS_DE_TRABAJO = ['pedido', 'alta', 'plan', 'pieza'] as const

export const ENCABEZADOS_DEL_TRABAJO = {
  trabajo_tipo: 'x-zr-trabajo-tipo',
  trabajo_id: 'x-zr-trabajo-id',
  paso: 'x-zr-paso',
  llamada_padre: 'x-zr-llamada-padre',
} as const

const TOPE_DE_CARACTERES = 200

export interface ColumnasDeLaLlamada {
  trabajo_tipo?: string
  trabajo_id?: string
  paso?: string
  llamada_padre?: string
}

export type CrudoDeLaLlamada = ColumnasDeLaLlamada

export interface TrabajoDeLaLlamada {
  columnas: ColumnasDeLaLlamada
  /** por qué se descartó algo · vacío si todo entró */
  invalido: string[]
}

/** texto usable o nada · una expresión de n8n sin valor llega como vacío, «undefined» o «null», y eso no es un dato */
function texto(v: unknown): string | undefined {
  const s = typeof v === 'string' ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : ''
  if (!s || s === 'undefined' || s === 'null') return undefined
  return s
}

function primero(...candidatos: unknown[]): string | undefined {
  for (const c of candidatos) {
    const t = texto(c)
    if (t !== undefined) return t
  }
  return undefined
}

/** lee los cuatro datos tal como llegaron · manda el cuerpo, luego `context`, luego los encabezados */
export function crudoDeLaLlamada(cuerpo: unknown, leerEncabezado?: (nombre: string) => unknown): CrudoDeLaLlamada {
  const b = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>
  const c = (b.context && typeof b.context === 'object' ? b.context : {}) as Record<string, unknown>
  const h = (nombre: string) => (leerEncabezado ? leerEncabezado(nombre) : undefined)
  const leido: Record<keyof CrudoDeLaLlamada, string | undefined> = {
    trabajo_tipo: primero(b.trabajo_tipo, c.trabajo_tipo, h(ENCABEZADOS_DEL_TRABAJO.trabajo_tipo)),
    trabajo_id: primero(b.trabajo_id, c.trabajo_id, h(ENCABEZADOS_DEL_TRABAJO.trabajo_id)),
    paso: primero(b.paso, c.paso, h(ENCABEZADOS_DEL_TRABAJO.paso), b.step_name, b.stepName, c.step_name),
    llamada_padre: primero(b.llamada_padre, c.llamada_padre, h(ENCABEZADOS_DEL_TRABAJO.llamada_padre)),
  }
  const crudo: CrudoDeLaLlamada = {}
  for (const k of Object.keys(leido) as (keyof CrudoDeLaLlamada)[]) {
    const v = leido[k]
    if (v !== undefined) crudo[k] = v
  }
  return crudo
}

/** lo que se puede guardar sin que la base lo rechace · tipo e id van siempre juntos */
export function validarLaLlamada(crudo: CrudoDeLaLlamada): TrabajoDeLaLlamada {
  const columnas: ColumnasDeLaLlamada = {}
  const invalido: string[] = []
  const tipo = crudo.trabajo_tipo?.toLowerCase()
  const id = crudo.trabajo_id
  if (tipo && !(TIPOS_DE_TRABAJO as readonly string[]).includes(tipo)) invalido.push('trabajo_tipo_desconocido')
  else if (tipo && !id) invalido.push('falta_trabajo_id')
  else if (id && !tipo) invalido.push('falta_trabajo_tipo')
  else if (id && id.length > TOPE_DE_CARACTERES) invalido.push('trabajo_id_demasiado_largo')
  else if (tipo && id) {
    columnas.trabajo_tipo = tipo
    columnas.trabajo_id = id
  }
  if (crudo.paso) columnas.paso = crudo.paso.slice(0, TOPE_DE_CARACTERES)
  if (crudo.llamada_padre) {
    if (crudo.llamada_padre.length > TOPE_DE_CARACTERES) invalido.push('llamada_padre_demasiado_larga')
    else columnas.llamada_padre = crudo.llamada_padre
  }
  return { columnas, invalido }
}

/** lee y valida · sin datos, `columnas` no trae llaves: la fila queda como siempre */
export function trabajoDeLaLlamada(cuerpo: unknown, leerEncabezado?: (nombre: string) => unknown): TrabajoDeLaLlamada {
  return validarLaLlamada(crudoDeLaLlamada(cuerpo, leerEncabezado))
}

/** lo que se agrega a `metadata` de la fila · solo está si algo se descartó */
export function metadataDelTrabajo(t: TrabajoDeLaLlamada): { trabajo_invalido?: string[] } {
  return t.invalido.length > 0 ? { trabajo_invalido: t.invalido } : {}
}
