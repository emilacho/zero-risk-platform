/**
 * ENTRADA DE LA OFICINA · el sobre `brief/parte-listo · producir` que YA EXISTE (lo usa la pieza simple) + el campo opcional `familia`, y la decisión de la PUERTA.
 * Diseño: sala 1 §2. Puro. La puerta NO está cableada (el mapa de viajes no se toca en esta etapa): esto solo prueba la decisión.
 *  · `dry_run` ausente o no booleano ⇒ se rechaza ANTES de gastar (lección E67/28-sep);
 *  · `client_id`/`tenant_id` DENTRO del payload se ignoran siempre: el cliente lo pone la sala;
 *  · `familia` ausente, o no listada en las activas, o la oficina apagada ⇒ PASARELA a la pieza simple, cuerpo intacto (el comportamiento de hoy).
 */
import { erroresDeCambios, type CambiosDelDueno } from './cambios-del-dueno'
import { esFechaReal, esHoraReal } from './texto'
export const TARGET_STEP_PRODUCIR = 'router.dispatch.brief/parte-listo.producir'

/** r79 · D5 · `fila_id`, `fecha` y `hora` son del calendario (la fila que originó el brief): la entrega los usa para nombrar, fechar y vencer la pieza */
export interface Sobre { /** 29-oct · el dueño devolvió una pieza cerrada con cambios: abre la versión siguiente SIN gastar el tope de 3 versiones (límite propio de 5 rondas) */ cambios_del_dueno?: CambiosDelDueno; /** la causa de un fallo que ya se corrigió: permite reabrir un encargo que ya gastó (tope de versiones intacto) */ reabrir_causa_corregida?: string; parte_id: string; brief_id: string; dry_run: boolean; tope_usd?: number; familia?: string; fila_id?: string; fecha?: string; hora?: string }
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const RE_BRIEF = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/
const RE_FAMILIA = /^[a-z][a-z0-9_]{0,39}$/
const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/
const RE_HORA = /^\d{2}:\d{2}(:\d{2})?$/

export function validarSobre(cuerpo: unknown): { ok: true; sobre: Sobre; ignorados: string[] } | { ok: false; codigo: 'dry_run_ausente' | 'entrada_invalida'; errores: string[] } {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return { ok: false, codigo: 'entrada_invalida', errores: ['el cuerpo debe ser un objeto'] }
  const b = cuerpo as Record<string, unknown>
  if (typeof b.dry_run !== 'boolean') return { ok: false, codigo: 'dry_run_ausente', errores: ['`dry_run` es obligatorio y debe ser verdadero o falso (ausente = no se gasta nada)'] }
  const errores: string[] = []
  if (typeof b.parte_id !== 'string' || !RE_UUID.test(b.parte_id)) errores.push('`parte_id` debe ser un uuid')
  if (typeof b.brief_id !== 'string' || !RE_BRIEF.test(b.brief_id)) errores.push('`brief_id` inválido')
  if (b.tope_usd !== undefined && !(typeof b.tope_usd === 'number' && b.tope_usd > 0 && b.tope_usd <= 10)) errores.push('`tope_usd` debe ser un número mayor que 0 y no más de 10')
  if (b.familia !== undefined && !(typeof b.familia === 'string' && RE_FAMILIA.test(b.familia))) errores.push('`familia` inválida')
  if (b.reabrir_causa_corregida !== undefined && !(typeof b.reabrir_causa_corregida === 'string' && b.reabrir_causa_corregida.trim().length >= 10 && b.reabrir_causa_corregida.trim().length <= 300)) errores.push('`reabrir_causa_corregida` debe ser una frase de 10 a 300 caracteres')
  if (b.cambios_del_dueno !== undefined) errores.push(...erroresDeCambios(b.cambios_del_dueno))
  if (b.fila_id !== undefined && !(typeof b.fila_id === 'string' && RE_BRIEF.test(b.fila_id))) errores.push('`fila_id` inválido')
  if (b.fecha !== undefined && !(typeof b.fecha === 'string' && RE_FECHA.test(b.fecha) && esFechaReal(b.fecha))) errores.push('`fecha` debe ser una fecha real aaaa-mm-dd')
  if (b.hora !== undefined && !(typeof b.hora === 'string' && RE_HORA.test(b.hora) && esHoraReal(b.hora.slice(0, 5)))) errores.push('`hora` debe ser una hora real hh:mm')
  if (errores.length) return { ok: false, codigo: 'entrada_invalida', errores }
  const ignorados = ['client_id', 'tenant_id'].filter((k) => k in b)
  return {
    ok: true, ignorados,
    sobre: { parte_id: b.parte_id as string, brief_id: b.brief_id as string, dry_run: b.dry_run, ...(b.tope_usd !== undefined ? { tope_usd: b.tope_usd as number } : {}), ...(b.familia !== undefined ? { familia: b.familia as string } : {}), ...(b.reabrir_causa_corregida !== undefined ? { reabrir_causa_corregida: (b.reabrir_causa_corregida as string).trim() } : {}), ...(b.cambios_del_dueno !== undefined ? { cambios_del_dueno: b.cambios_del_dueno as CambiosDelDueno } : {}), ...(b.fila_id !== undefined ? { fila_id: b.fila_id as string } : {}), ...(b.fecha !== undefined ? { fecha: b.fecha as string } : {}), ...(b.hora !== undefined ? { hora: (b.hora as string).slice(0, 5) } : {}) },
  }
}

export interface ConfigDeOficina { estado: 'apagada' | 'ensayo' | 'encendida'; familias_activas: string[]; clientes_ensayo: string[] }
/** semilla: apagada, sin familias */
export const CONFIG_APAGADA: ConfigDeOficina = { estado: 'apagada', familias_activas: [], clientes_ensayo: [] }

export type DecisionDePuerta =
  | { accion: 'pasarela'; motivo: 'sin_familia' | 'oficina_apagada' | 'familia_no_activa' | 'cliente_fuera_del_ensayo' }
  | { accion: 'abrir'; familia: string }
  | { accion: 'rechazar'; motivo: 'origen_no_aceptado' }
  /** T8 · una familia SIN pieza simple detrás (el video): si la oficina no la abre, el sobre NO sigue por la pasarela; espera (409 visible), nunca se convierte en una imagen */
  | { accion: 'sin_sala'; familia: string; motivo: 'oficina_apagada' | 'familia_no_activa' | 'cliente_fuera_del_ensayo' }

/** las familias que no tienen pasarela: un reel no se puede hacer como publicación con imagen */
export const FAMILIAS_SIN_PASARELA: readonly string[] = ['video_mesa']

/** `targetStepId` y `clientId` los pone la SALA (nunca vienen del payload) */
export function decidirPuerta(sobre: Sobre, config: ConfigDeOficina, targetStepId: string, clientId: string): DecisionDePuerta {
  if (targetStepId !== TARGET_STEP_PRODUCIR) return { accion: 'rechazar', motivo: 'origen_no_aceptado' }
  if (!sobre.familia) return { accion: 'pasarela', motivo: 'sin_familia' }
  const noAbre = (motivo: 'oficina_apagada' | 'familia_no_activa' | 'cliente_fuera_del_ensayo'): DecisionDePuerta =>
    FAMILIAS_SIN_PASARELA.includes(sobre.familia as string) ? { accion: 'sin_sala', familia: sobre.familia as string, motivo } : { accion: 'pasarela', motivo }
  if (config.estado === 'apagada') return noAbre('oficina_apagada')
  if (!config.familias_activas.includes(sobre.familia)) return noAbre('familia_no_activa')
  if (config.estado === 'ensayo' && !config.clientes_ensayo.includes(clientId)) return noAbre('cliente_fuera_del_ensayo')
  return { accion: 'abrir', familia: sobre.familia }
}

/** distinto por encargo: «<parte>:<brief>:<familia|pieza>:<n>» */
export const claveDeIdempotencia = (s: Pick<Sobre, 'parte_id' | 'brief_id' | 'familia'>, n = 1): string => `${s.parte_id}:${s.brief_id}:${s.familia ?? 'pieza'}:${n}`
