/**
 * Lo común de las rutas `/api/finanzas/*` (F2 · CC#1 · 14-oct) · la puerta y la lógica de `POST /api/finanzas/bloque` y `/tablero`, SIN red (los puertos entran por parámetro).
 *  · llave: `x-api-key` = `INTERNAL_API_KEY` (nunca `SALA_DISPATCH_KEY`); sin la variable, 503.
 *  · APAGADA = 409 antes de calcular, de escribir o de gastar (también en `dry_run`).
 *  · `dry_run` OBLIGATORIO y booleano (ausente o no booleano = 400): igual que la sala.
 *  · NUNCA bloquea el plan: una entrada inválida devuelve 422 con motivos y `sin_bloque`; el plan sale con «supuesto» (12-sep).
 * Nace apagada; nadie la llama todavía.
 */
import crypto from 'node:crypto'
import { calcular } from './calculadora'
import { decidirFirma, huellaDe, numerosDelBloque, type FilaDeNumero, type Hallazgo } from './firma'
import { resumenDelBloque } from './resumen'
import type { Bloque, Entrada } from './tipos'

export type EstadoDeLaOficina = 'apagada' | 'ensayo' | 'encendida'
export interface ConfigDeFinanzas { estado: EstadoDeLaOficina; clientes_ensayo: string[]; preguntas_slack: 'apagado' | 'borrador' | 'envia'; conversa: 'apagado' | 'ensayo' | 'enciende' }

export const MAX_BYTES_DE_ENTRADA = 20_000
export const MAX_LARGO_DE_EJECUCION = 100
export const SALIDAS_DEL_JEFE = ['sale', 'sale_ajustada', 'sale_con_alerta'] as const
export type SalidaDelJefe = (typeof SALIDAS_DEL_JEFE)[number]

export interface PuertosDeFinanzas {
  leerConfig(): Promise<ConfigDeFinanzas>
  /**
   * guarda un tablero NUEVO (versión +1, el anterior pasa a `reemplazado`) con sus números. Solo se llama con dry_run === false.
   * ATÓMICO en el sentido que importa: si falla a medias, el cliente se queda con el tablero vigente que tenía (el adaptador compensa).
   */
  guardarTablero(t: { client_id: string; entrada: Entrada; bloque: unknown; huella: string; numeros: FilaDeNumero[]; workflow_execution_id: string | null }): Promise<{ id: string; version: number }>
}

/** comparación en tiempo constante, SIEMPRE: aunque los largos difieran se compara contra la verdadera y se rechaza (nunca solo «igual de largo») */
export function igualesEnTiempoConstante(a: string, b: string): boolean {
  const x = Buffer.from(a), y = Buffer.from(b)
  const mismoLargo = x.length === y.length
  const comparado = crypto.timingSafeEqual(mismoLargo ? x : y, y)
  return mismoLargo && comparado
}

export function checkInternalKey(request: Request, env: Record<string, string | undefined> = process.env): { ok: true } | { ok: false; status: 401 | 503; error: string } {
  const interna = (env.INTERNAL_API_KEY ?? '').trim()
  if (!interna) return { ok: false, status: 503, error: 'internal_api_key_not_configured' }
  if (!igualesEnTiempoConstante((request.headers.get('x-api-key') ?? '').trim(), interna)) return { ok: false, status: 401, error: 'unauthorized' }
  return { ok: true }
}

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

export interface RespuestaDeRuta { status: number; cuerpo: Record<string, unknown> }

export async function manejarBloque(cuerpo: unknown, P: PuertosDeFinanzas): Promise<RespuestaDeRuta> {
  if (!esObjeto(cuerpo)) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['el cuerpo debe ser un objeto'] } }
  // 1 · APAGADA = 409 antes de todo (ni siquiera se valida la entrada)
  let cfg: ConfigDeFinanzas
  try { cfg = await P.leerConfig() } catch (e) { return { status: 503, cuerpo: { error: 'config_ilegible', detalle: e instanceof Error ? e.message : String(e) } } }
  if (cfg.estado === 'apagada') return { status: 409, cuerpo: { error: 'finanzas_apagada' } }
  // 2 · forma de la puerta
  if (typeof cuerpo.dry_run !== 'boolean') return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`dry_run` es obligatorio y debe ser booleano'] } }
  if (typeof cuerpo.client_id !== 'string' || !cuerpo.client_id.trim()) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`client_id` es obligatorio'] } }
  if (cfg.estado === 'ensayo' && !cfg.clientes_ensayo.includes(cuerpo.client_id)) return { status: 409, cuerpo: { error: 'cliente_fuera_de_ensayo' } }
  if (!esObjeto(cuerpo.entrada)) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`entrada` es obligatoria y debe ser un objeto'] } }
  // tamaños: lo que se guarda no puede crecer sin límite
  if (JSON.stringify(cuerpo.entrada).length > MAX_BYTES_DE_ENTRADA) return { status: 413, cuerpo: { error: 'entrada_demasiado_grande', maximo: MAX_BYTES_DE_ENTRADA, sin_bloque: true } }
  if (cuerpo.workflow_execution_id !== undefined && (typeof cuerpo.workflow_execution_id !== 'string' || cuerpo.workflow_execution_id.length > MAX_LARGO_DE_EJECUCION)) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: [`\`workflow_execution_id\` debe ser texto de hasta ${MAX_LARGO_DE_EJECUCION} caracteres`] } }
  // 3 · cálculo (puro) · nunca bloquea al plan
  const r = calcular(cuerpo.entrada as unknown as Entrada)
  if (!r.ok) return { status: 422, cuerpo: { error: 'entrada_invalida', sin_bloque: true, errores: r.errores } }
  const huella = huellaDe(r)
  if (cuerpo.dry_run) return { status: 200, cuerpo: { dry_run: true, huella, bloque: r, escribio: false } }
  // 4 · escritura (solo en real)
  try {
    const g = await P.guardarTablero({ client_id: cuerpo.client_id, entrada: cuerpo.entrada as unknown as Entrada, bloque: r, huella, numeros: numerosDelBloque(r), workflow_execution_id: typeof cuerpo.workflow_execution_id === 'string' ? cuerpo.workflow_execution_id : null })
    return { status: 200, cuerpo: { dry_run: false, finanzas_id: g.id, version: g.version, huella, bloque: r, escribio: true } }
  } catch (e) {
    return { status: 500, cuerpo: { error: 'no_se_pudo_guardar', sin_bloque: true, detalle: e instanceof Error ? e.message : String(e) } }
  }
}

// ───────────────────────────────────────────────────────── /api/finanzas/tablero · leer y firmar

export interface FilaDeTablero {
  id: string; client_id: string; version: number; vigente: boolean
  estado: 'borrador' | 'firmado' | 'sin_firma' | 'reemplazado'
  entrada: Entrada; bloque: Bloque; huella: string | null
}
export interface PuertosDeTablero extends PuertosDeFinanzas {
  leerTablero(id: string): Promise<FilaDeTablero | null>
  leerNumeros(tablero_id: string): Promise<FilaDeNumero[]>
  actualizarTablero(id: string, patch: { estado: 'firmado' | 'sin_firma'; firmado_por: string; firmado_en: string }): Promise<void>
  /** ¿existe en el libro (agent_invocations) una invocación del jefe de finanzas, de ESTE cliente, con ese identificador? El código exige que sea cierta, no solo que venga el campo */
  invocacionDelJefe(p: { invocacion_id: string; client_id: string }): Promise<boolean>
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** las filas guardadas deben ser LAS DEL BLOQUE (la huella cubre el bloque; las filas se recomputan y se comparan: una edición a mano no pasa) */
export function numerosCoinciden(guardados: FilaDeNumero[], bloque: Bloque): boolean {
  const esperados = numerosDelBloque(bloque)
  if (guardados.length !== esperados.length) return false
  const por = new Map(guardados.map((g) => [g.clave, g]))
  const igual = (a: number | null, b: number | null) => (a === null || b === null ? a === b : Math.abs(a - b) < 1e-4)
  return esperados.every((e) => {
    const g = por.get(e.clave)
    const mismo = (a: string | null | undefined, b: string | null | undefined) => (a ?? null) === (b ?? null)
    return !!g && igual(g.valor, e.valor) && igual(g.minimo, e.minimo) && igual(g.maximo, e.maximo) && g.tipo === e.tipo && mismo(g.fuente, e.fuente) && mismo(g.formula, e.formula) && mismo(g.fecha, e.fecha) && mismo(g.unidad, e.unidad) && mismo(g.motivo, e.motivo)
  })
}

/**
 * `leer` entrega el bloque y su resumen en texto llano (lo que usa el plan); exige `client_id` y comprueba que las filas sean las del bloque.
 * `firmar` es un acto de CÓDIGO: huella íntegra, solo desde borrador, la SALIDA del jefe (y su invocación) obligatoria, y tope de la salida si una cifra que manda no tiene base.
 */
export async function manejarTablero(cuerpo: unknown, P: PuertosDeTablero, ahora: () => Date = () => new Date()): Promise<RespuestaDeRuta> {
  if (!esObjeto(cuerpo)) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['el cuerpo debe ser un objeto'] } }
  let cfg: ConfigDeFinanzas
  try { cfg = await P.leerConfig() } catch (e) { return { status: 503, cuerpo: { error: 'config_ilegible', detalle: e instanceof Error ? e.message : String(e) } } }
  if (cfg.estado === 'apagada') return { status: 409, cuerpo: { error: 'finanzas_apagada' } }
  const accion = cuerpo.accion
  if (accion !== 'leer' && accion !== 'firmar') return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`accion` debe ser leer o firmar'] } }
  if (typeof cuerpo.finanzas_id !== 'string' || !UUID.test(cuerpo.finanzas_id)) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`finanzas_id` debe ser un uuid'] } }
  // el cliente es OBLIGATORIO: un tablero no se entrega «por id» sin decir de quién es
  if (typeof cuerpo.client_id !== 'string' || !cuerpo.client_id.trim()) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`client_id` es obligatorio'] } }
  let t: FilaDeTablero | null
  try { t = await P.leerTablero(cuerpo.finanzas_id) } catch (e) { return { status: 500, cuerpo: { error: 'no_se_pudo_leer', detalle: e instanceof Error ? e.message : String(e) } } }
  if (!t || cuerpo.client_id !== t.client_id) return { status: 404, cuerpo: { error: 'tablero_inexistente' } }
  if (cfg.estado === 'ensayo' && !cfg.clientes_ensayo.includes(t.client_id)) return { status: 409, cuerpo: { error: 'cliente_fuera_de_ensayo' } }
  if (accion === 'leer') {
    let guardados: FilaDeNumero[]
    try { guardados = await P.leerNumeros(t.id) } catch (e) { return { status: 500, cuerpo: { error: 'no_se_pudo_leer', detalle: e instanceof Error ? e.message : String(e) } } }
    // la huella cubre el bloque y las filas se recomputan: editar el bloque Y sus filas a la vez cambia la huella y no pasa
    if (huellaDe(t.bloque) !== t.huella) return { status: 409, cuerpo: { error: 'huella_no_coincide', sin_bloque: true } }
    if (!numerosCoinciden(guardados, t.bloque)) return { status: 409, cuerpo: { error: 'numeros_alterados', sin_bloque: true } }
    const numeros = numerosDelBloque(t.bloque)
    const r = resumenDelBloque(t.bloque, { dias_activos_por_semana: t.entrada?.dias_activos_por_semana })
    return { status: 200, cuerpo: { finanzas_id: t.id, client_id: t.client_id, version: t.version, vigente: t.vigente, estado: t.estado, huella: t.huella, numeros: numeros.map((x) => ({ clave: x.clave, valor: x.valor, minimo: x.minimo, maximo: x.maximo, tipo: x.tipo })), semanas: t.bloque.calendario.por_semana.length, confianza: t.bloque.confianza ?? null, resumen: r } }
  }
  // firmar
  if (typeof cuerpo.dry_run !== 'boolean') return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`dry_run` es obligatorio y debe ser booleano'] } }
  if (t.estado !== 'borrador') return { status: 409, cuerpo: { error: 'tablero_no_es_borrador', estado: t.estado } }
  if (huellaDe(t.bloque) !== t.huella) return { status: 409, cuerpo: { error: 'huella_no_coincide' } }
  // la SALIDA del jefe es obligatoria (una lista de hallazgos vacía no prueba que alguien revisó) y su invocación queda como quien firma
  if (typeof cuerpo.salida !== 'string' || !(SALIDAS_DEL_JEFE as readonly string[]).includes(cuerpo.salida)) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`salida` debe ser sale, sale_ajustada o sale_con_alerta (la emite el jefe)'] } }
  if (typeof cuerpo.invocacion_id !== 'string' || !cuerpo.invocacion_id.trim() || cuerpo.invocacion_id.length > MAX_LARGO_DE_EJECUCION) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`invocacion_id` (la invocación del jefe) es obligatoria'] } }
  // la invocación debe EXISTIR en el libro, ser del jefe y ser de este cliente (una `invocacion_id` inventada no firma)
  let existe = false
  try { existe = await P.invocacionDelJefe({ invocacion_id: cuerpo.invocacion_id.trim(), client_id: t.client_id }) } catch (e) { return { status: 503, cuerpo: { error: 'libro_ilegible', detalle: e instanceof Error ? e.message : String(e) } } }
  if (!existe) return { status: 409, cuerpo: { error: 'invocacion_no_encontrada' } }
  // si una cifra que manda no tiene base, el jefe solo puede emitir «sale con alerta»
  if (t.bloque.confianza?.manda_sin_base && cuerpo.salida !== 'sale_con_alerta') return { status: 409, cuerpo: { error: 'salida_no_permitida', detalle: 'una cifra que manda está «sin base»: solo se admite «sale_con_alerta»' } }
  const hallazgos = Array.isArray(cuerpo.hallazgos) ? (cuerpo.hallazgos as Hallazgo[]).filter((h) => h && typeof h.que === 'string' && ['critico', 'alto', 'medio', 'bajo'].includes(h.severidad)) : []
  const hechas = typeof cuerpo.correcciones_hechas === 'number' && cuerpo.correcciones_hechas >= 0 ? Math.floor(cuerpo.correcciones_hechas) : 0
  const d = decidirFirma({ hallazgos, correcciones_hechas: hechas })
  if (d.estado === 'requiere_correccion' || cuerpo.dry_run) return { status: 200, cuerpo: { finanzas_id: t.id, decision: d.estado, criticos: d.criticos, escribio: false } }
  await P.actualizarTablero(t.id, { estado: d.estado, firmado_por: `chief-financial-officer:${cuerpo.invocacion_id.trim()}:${cuerpo.salida}`, firmado_en: ahora().toISOString() })
  return { status: 200, cuerpo: { finanzas_id: t.id, decision: d.estado, criticos: d.criticos, salida: cuerpo.salida, confianza: t.bloque.confianza?.nivel ?? null, escribio: true } }
}
