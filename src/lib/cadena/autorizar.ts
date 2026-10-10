/**
 * Quién puede llamar a la cadena y cuándo (diseño v2 §3.7 + canon «agentes solo vía workflows»).
 *
 *  1. TODA llamada trae `workflow_id` y `workflow_execution_id` (los dos, siempre). Un fallo conocido de la revisión de agentes nació de un `workflow_execution_id` ausente.
 *  2. `workflow_id` es válido si es uno de los flujos de la cadena (`cadena_config.flujos`, lista de ids) o un `_journey_id` de la sala que existe para ESE cliente. No se llama a n8n para comprobarlo (caro y frágil): se comprueba contra la tabla.
 *  3. El interruptor: `seco: true` corre en cualquier estado (así se ensaya con la cadena apagada); lo real exige `encendida`, o `ensayo` con el cliente en `clientes_ensayo`.
 */
import type { Almacen } from './almacen'

export interface Respuesta { status: number; cuerpo: Record<string, unknown> }
export const err = (status: number, code: string, detalle: string, extra: Record<string, unknown> = {}): Respuesta => ({ status, cuerpo: { error: code.toLowerCase().replace(/[^a-z0-9]+/g, '_'), code, detalle, ...extra } })

const texto = (x: unknown): string | null => (typeof x === 'string' && x.trim() !== '' ? x.trim() : null)

export async function autorizarLlamada(al: Almacen, cuerpo: Record<string, unknown>, clientId: string): Promise<Respuesta | null> {
  const wf = texto(cuerpo.workflow_id), ex = texto(cuerpo.workflow_execution_id)
  if (!wf || !ex) return err(400, 'E-WORKFLOW-CTX', 'la llamada necesita workflow_id y workflow_execution_id (los dos, siempre)')
  const flujos = await al.leerConfig('flujos')
  const esFlujo = Array.isArray(flujos) && flujos.includes(wf)
  if (!esFlujo && !(await al.journeyExiste(wf, clientId))) {
    return err(403, 'E-WORKFLOW-DESCONOCIDO', 'workflow_id no es un flujo de la cadena ni un viaje de la sala de este cliente')
  }
  return null
}

export async function compuerta(al: Almacen, clientId: string, seco: boolean): Promise<Respuesta | null> {
  if (seco) return null
  const estado = await al.leerConfig('estado_cadena')
  if (estado === 'encendida') return null
  if (estado === 'ensayo') {
    const lista = await al.leerConfig('clientes_ensayo')
    if (Array.isArray(lista) && lista.includes(clientId)) return null
    return err(409, 'E-CADENA-NO-ADMITIDO', 'la cadena está en ensayo y este cliente no está en clientes_ensayo')
  }
  return err(409, 'E-CADENA-APAGADA', 'la cadena está apagada: solo corre en seco (seco: true)')
}

/** `seco` ausente = false; presente y no booleano = 400 (el `dry_run` explícito y booleano, o se detiene antes de gastar) */
export function leerSeco(cuerpo: Record<string, unknown>): { ok: true; seco: boolean } | { ok: false; r: Respuesta } {
  const v = cuerpo.seco !== undefined ? cuerpo.seco : cuerpo.dry_run
  if (v === undefined) return { ok: true, seco: false }
  if (typeof v !== 'boolean') return { ok: false, r: err(400, 'E-SECO-INVALIDO', 'seco / dry_run debe ser true o false: un valor mal escrito se detiene antes de gastar') }
  return { ok: true, seco: v }
}

export const cadena = (x: unknown): string | null => texto(x)
