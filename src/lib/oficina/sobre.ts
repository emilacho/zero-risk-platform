/**
 * ENTRADA DE LA OFICINA · el sobre `brief/parte-listo · producir` que YA EXISTE (lo usa la pieza simple) + el campo opcional `familia`, y la decisión de la PUERTA.
 * Diseño: sala 1 §2. Puro. La puerta NO está cableada (el mapa de viajes no se toca en esta etapa): esto solo prueba la decisión.
 *  · `dry_run` ausente o no booleano ⇒ se rechaza ANTES de gastar (lección E67/28-sep);
 *  · `client_id`/`tenant_id` DENTRO del payload se ignoran siempre: el cliente lo pone la sala;
 *  · `familia` ausente, o no listada en las activas, o la oficina apagada ⇒ PASARELA a la pieza simple, cuerpo intacto (el comportamiento de hoy).
 */
export const TARGET_STEP_PRODUCIR = 'router.dispatch.brief/parte-listo.producir'

export interface Sobre { parte_id: string; brief_id: string; dry_run: boolean; tope_usd?: number; familia?: string }
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RE_BRIEF = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/
const RE_FAMILIA = /^[a-z][a-z0-9_]{0,39}$/

export function validarSobre(cuerpo: unknown): { ok: true; sobre: Sobre; ignorados: string[] } | { ok: false; codigo: 'dry_run_ausente' | 'entrada_invalida'; errores: string[] } {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return { ok: false, codigo: 'entrada_invalida', errores: ['el cuerpo debe ser un objeto'] }
  const b = cuerpo as Record<string, unknown>
  if (typeof b.dry_run !== 'boolean') return { ok: false, codigo: 'dry_run_ausente', errores: ['`dry_run` es obligatorio y debe ser verdadero o falso (ausente = no se gasta nada)'] }
  const errores: string[] = []
  if (typeof b.parte_id !== 'string' || !RE_UUID.test(b.parte_id)) errores.push('`parte_id` debe ser un uuid')
  if (typeof b.brief_id !== 'string' || !RE_BRIEF.test(b.brief_id)) errores.push('`brief_id` inválido')
  if (b.tope_usd !== undefined && !(typeof b.tope_usd === 'number' && b.tope_usd > 0 && b.tope_usd <= 10)) errores.push('`tope_usd` debe ser un número mayor que 0 y no más de 10')
  if (b.familia !== undefined && !(typeof b.familia === 'string' && RE_FAMILIA.test(b.familia))) errores.push('`familia` inválida')
  if (errores.length) return { ok: false, codigo: 'entrada_invalida', errores }
  const ignorados = ['client_id', 'tenant_id'].filter((k) => k in b)
  return {
    ok: true, ignorados,
    sobre: { parte_id: b.parte_id as string, brief_id: b.brief_id as string, dry_run: b.dry_run, ...(b.tope_usd !== undefined ? { tope_usd: b.tope_usd as number } : {}), ...(b.familia !== undefined ? { familia: b.familia as string } : {}) },
  }
}

export interface ConfigDeOficina { estado: 'apagada' | 'ensayo' | 'encendida'; familias_activas: string[]; clientes_ensayo: string[] }
/** semilla: apagada, sin familias */
export const CONFIG_APAGADA: ConfigDeOficina = { estado: 'apagada', familias_activas: [], clientes_ensayo: [] }

export type DecisionDePuerta =
  | { accion: 'pasarela'; motivo: 'sin_familia' | 'oficina_apagada' | 'familia_no_activa' | 'cliente_fuera_del_ensayo' }
  | { accion: 'abrir'; familia: string }
  | { accion: 'rechazar'; motivo: 'origen_no_aceptado' }

/** `targetStepId` y `clientId` los pone la SALA (nunca vienen del payload) */
export function decidirPuerta(sobre: Sobre, config: ConfigDeOficina, targetStepId: string, clientId: string): DecisionDePuerta {
  if (targetStepId !== TARGET_STEP_PRODUCIR) return { accion: 'rechazar', motivo: 'origen_no_aceptado' }
  if (!sobre.familia) return { accion: 'pasarela', motivo: 'sin_familia' }
  if (config.estado === 'apagada') return { accion: 'pasarela', motivo: 'oficina_apagada' }
  if (!config.familias_activas.includes(sobre.familia)) return { accion: 'pasarela', motivo: 'familia_no_activa' }
  if (config.estado === 'ensayo' && !config.clientes_ensayo.includes(clientId)) return { accion: 'pasarela', motivo: 'cliente_fuera_del_ensayo' }
  return { accion: 'abrir', familia: sobre.familia }
}

/** distinto por encargo: «<parte>:<brief>:<familia|pieza>:<n>» */
export const claveDeIdempotencia = (s: Pick<Sobre, 'parte_id' | 'brief_id' | 'familia'>, n = 1): string => `${s.parte_id}:${s.brief_id}:${s.familia ?? 'pieza'}:${n}`
