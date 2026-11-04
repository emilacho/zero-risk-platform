/**
 * EL ORQUESTADOR DE LA MESA DE ESTRATEGIA. Ejecuta UN paso por llamada y lo guarda; el lazo vive en el flujo, como en la oficina financiera (`finanzas/conversa/orquestador.ts`). Mismo motor, mismas tablas en forma.
 *  · Nace apagada: `finanzas_config.mesa_de_estrategia` en false → 409 antes de leer, llamar al modelo o escribir.
 *  · Una mesa por corrida: abrir dos veces devuelve la misma, también si ya cerró. Sin segunda mesa ni segundo cobro al volver de una pausa.
 *  · Si un aporte falla se declara y la reunión sigue con los demás. Si no hay acta válida, la mesa termina `sin_acuerdo` y el flujo para: no se escribe un plan a ciegas.
 */
import { extraerJson } from '../../finanzas/conversa/esquemas'
import { registrarPaso, siguientePaso, type ResultadoDePaso } from '../../oficina/motor'
import type { Paso } from '../../oficina/tipos'
import type { AlmacenDeConversa, EncargoDeConversa, ModeloPuerto, Semilla, TurnoDeConversa } from '../../finanzas/conversa/puertos'
import { sha256 } from '../../finanzas/conversa/util'
import { TOPE_REAL_DEL_PEDIDO } from '../../limites-de-tamano'
import { validarActa, validarAporte, type ActaV1, type AporteV1 } from './acta'
import { INSTRUCCION_POR_PASO, MAX_DEVOLUCIONES, PASO_CONSOLIDA, PLANTILLA_MESA, quienHablaEnLaMesa } from './plantilla'

export interface Respuesta { status: number; cuerpo: Record<string, unknown> }
export interface PuertosDeMesa {
  almacen: AlmacenDeConversa & { encargoDeLaCorrida?(client_id: string, corrida: string): Promise<EncargoDeConversa | null> }
  modelo: ModeloPuerto
  /** el interruptor de la mesa; si no se puede leer, lanza */
  encendida(): Promise<boolean>
  ahora(): Date
}

type Arts = Record<string, Record<string, unknown>>
const TERMINALES = ['cerrado', 'sin_acuerdo', 'cierre_por_tope', 'fallido']
export const TTL_DEL_CANDADO_S = 900
export const LIMITE_PARA_REINTENTAR_MS = 150_000
const objeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)

/** lo que aportó cada especialista, y el costo por resultado de redes: de ahí lo toma el cálculo de finanzas. Sin él, finanzas lo declara: no se inventa */
function resumenDeLaMesa(arts: Arts): { acta: ActaV1 | null; aportes: Record<string, AporteV1>; faltan: string[] } {
  const aportes: Record<string, AporteV1> = {}, faltan: string[] = []
  for (const [k, v] of Object.entries(arts)) {
    if (!k.startsWith('aporte_')) continue
    if (v.sin_aporte) faltan.push(k.slice('aporte_'.length))
    else aportes[k.slice('aporte_'.length)] = v as unknown as AporteV1
  }
  const a = validarActa(arts.acta)
  return { acta: a.ok ? a.valor : null, aportes, faltan }
}
const salidaDe = (e: EncargoDeConversa, arts: Arts) => ({ encargo_id: e.id, estado: e.estado, gasto_usd: e.gasto_usd, ...resumenDeLaMesa(arts) })

async function apagada(P: PuertosDeMesa): Promise<Respuesta | null> {
  try { return (await P.encendida()) ? null : { status: 409, cuerpo: { error: 'mesa_apagada' } } } catch (x) { return { status: 503, cuerpo: { error: 'config_ilegible', detalle: x instanceof Error ? x.message : String(x) } } }
}

/** `{ client_id, dry_run, trabajo_id, semilla: { manual_completo, datos, ... } }` */
export async function abrirMesa(P: PuertosDeMesa, c: Record<string, unknown>): Promise<Respuesta> {
  const no = await apagada(P)
  if (no) return no
  const errores: string[] = []
  if (typeof c.client_id !== 'string' || !c.client_id.trim()) errores.push('`client_id` es obligatorio')
  if (typeof c.dry_run !== 'boolean') errores.push('`dry_run` es obligatorio y debe ser booleano')
  if (typeof c.trabajo_id !== 'string' || !c.trabajo_id.trim()) errores.push('`trabajo_id` es obligatorio: la mesa es de una corrida')
  if (!objeto(c.semilla)) errores.push('`semilla` es obligatoria')
  if (errores.length) return { status: 400, cuerpo: { error: 'entrada_invalida', errores } }
  if (JSON.stringify(c.semilla).length > TOPE_REAL_DEL_PEDIDO) return { status: 413, cuerpo: { error: 'semilla_demasiado_grande', maximo: TOPE_REAL_DEL_PEDIDO } }
  const client_id = (c.client_id as string).trim(), corrida = (c.trabajo_id as string).trim()
  const ya = P.almacen.encargoDeLaCorrida ? await P.almacen.encargoDeLaCorrida(client_id, corrida) : null
  if (ya) return { status: 200, cuerpo: { ...salidaDe(ya, await P.almacen.artefactos(ya.id)), nuevo: false, terminado: TERMINALES.includes(ya.estado) } }
  const r = await P.almacen.crearEncargo({ client_id, dry_run: c.dry_run as boolean, semilla: { ...(c.semilla as Semilla), corrida } })
  if (!r.ok) return { status: 500, cuerpo: { error: 'no_se_pudo_abrir', detalle: r.error } }
  return { status: 200, cuerpo: { encargo_id: r.encargo.id, estado: r.encargo.estado, nuevo: r.nuevo, terminado: false } }
}

export async function leerMesa(P: PuertosDeMesa, encargo_id: string): Promise<Respuesta> {
  const no = await apagada(P)
  if (no) return no
  const e = await P.almacen.leerEncargo(encargo_id)
  if (!e) return { status: 404, cuerpo: { error: 'encargo_inexistente' } }
  return { status: 200, cuerpo: { ...salidaDe(e, await P.almacen.artefactos(e.id)), terminado: TERMINALES.includes(e.estado), turnos: await P.almacen.turnos(e.id) } }
}

/** finanzas la devuelve con su motivo: se vuelve a consolidar, UNA vez. La segunda se rechaza y el flujo sigue con lo que hay */
export async function devolverALaMesa(P: PuertosDeMesa, encargo_id: string, c: { motivo?: unknown; cifra?: unknown }): Promise<Respuesta> {
  const no = await apagada(P)
  if (no) return no
  if (typeof c.motivo !== 'string' || !c.motivo.trim()) return { status: 400, cuerpo: { error: 'entrada_invalida', errores: ['`motivo` es obligatorio'] } }
  const e = await P.almacen.leerEncargo(encargo_id)
  if (!e) return { status: 404, cuerpo: { error: 'encargo_inexistente' } }
  const hechas = e.estado_del_motor.vueltas.devolucion ?? 0
  if (hechas >= MAX_DEVOLUCIONES) return { status: 409, cuerpo: { error: 'ya_se_devolvio', detalle: `solo se devuelve ${MAX_DEVOLUCIONES} vez` } }
  if (e.estado !== 'cerrado') return { status: 409, cuerpo: { error: 'mesa_sin_cerrar', estado: e.estado } }
  const contenido = { motivo: c.motivo.trim(), ...(c.cifra !== undefined ? { cifra: c.cifra } : {}) }
  const indice = PLANTILLA_MESA.pasos.findIndex((p) => p.clave === PASO_CONSOLIDA)
  const estado_del_motor = { ...e.estado_del_motor, ultimo: indice - 1, vueltas: { ...e.estado_del_motor.vueltas, devolucion: hechas + 1 }, artefactos: { ...e.estado_del_motor.artefactos, devolucion: { version: 1, version_consumida: 0, datos: contenido } } }
  await P.almacen.guardar({ encargo_id, estado_del_motor, gasto_usd: e.gasto_usd, estado: 'en_curso', artefacto: { tipo: 'devolucion', version: 1, contenido, sha256: sha256(contenido) } })
  return { status: 200, cuerpo: { encargo_id, estado: 'en_curso', terminado: false, devuelta: true } }
}

export async function avanzarMesa(P: PuertosDeMesa, encargo_id: string): Promise<Respuesta> {
  const no = await apagada(P)
  if (no) return no
  const e0 = await P.almacen.leerEncargo(encargo_id)
  if (!e0) return { status: 404, cuerpo: { error: 'encargo_inexistente' } }
  if (TERMINALES.includes(e0.estado)) return { status: 200, cuerpo: { ...salidaDe(e0, await P.almacen.artefactos(e0.id)), terminado: true } }
  const candado = P.almacen.tomarPaso ? await P.almacen.tomarPaso(e0.id, P.ahora(), TTL_DEL_CANDADO_S) : null
  if (candado && candado.ok && !candado.tomado) return { status: 409, cuerpo: { error: 'paso_en_vuelo' } }
  try { return await unPaso(P, e0) } finally { if (candado && candado.ok && candado.tomado) await P.almacen.soltarPaso?.(e0.id).catch(() => undefined) }
}

async function unPaso(P: PuertosDeMesa, e0: EncargoDeConversa): Promise<Respuesta> {
  let e = e0
  // el tope mira lo COBRADO, no solo lo guardado: lo que se cobró y se perdió también cuenta
  const cobrado = P.almacen.cobrado ? await P.almacen.cobrado(e.id).catch(() => null) : null
  if (cobrado !== null && cobrado > e.estado_del_motor.gasto_usd) e = { ...e, gasto_usd: Math.max(e.gasto_usd, cobrado), estado_del_motor: { ...e.estado_del_motor, gasto_usd: cobrado } }
  const arts = await P.almacen.artefactos(e.id)
  const sig = siguientePaso(e.estado_del_motor, PLANTILLA_MESA)
  if (sig.accion === 'fin' || sig.accion === 'cierre_por_tope') {
    const estado = sig.accion === 'cierre_por_tope' ? 'cierre_por_tope' : validarActa(arts.acta).ok ? 'cerrado' : 'sin_acuerdo'
    await P.almacen.guardar({ encargo_id: e.id, estado_del_motor: e.estado_del_motor, gasto_usd: e.gasto_usd, estado })
    return { status: 200, cuerpo: { ...salidaDe({ ...e, estado }, arts), terminado: true, ...(sig.accion === 'cierre_por_tope' ? { razon: sig.razon, detalle: sig.detalle } : {}) } }
  }
  const paso = sig.paso
  const n = e.estado_del_motor.pasos_ejecutados + 1
  const hecho = paso.tipo === 'codigo' ? { resultado: { costo_usd: 0, artefacto: abrirExpediente(e) } as ResultadoDePaso, error: null } : await turnoDeAgente(P, e, paso, arts)
  const estado_del_motor = registrarPaso(e.estado_del_motor, PLANTILLA_MESA, sig.indice, hecho.resultado)
  const art = hecho.resultado.artefacto ?? {}
  const turno: TurnoDeConversa = { n, paso: paso.clave, agente: paso.tipo === 'agente' ? paso.quien : null, ronda: 1, estado: hecho.error ? 'fallo' : 'hecho', costo_usd: hecho.resultado.costo_usd, salida: art, error: hecho.error }
  await P.almacen.guardar({ encargo_id: e.id, estado_del_motor, gasto_usd: estado_del_motor.gasto_usd, estado: 'en_curso', turno, artefacto: { tipo: paso.salida_artefacto, version: estado_del_motor.artefactos[paso.salida_artefacto]?.version ?? 1, contenido: art, sha256: sha256(art) } })
  return { status: 200, cuerpo: { encargo_id: e.id, paso: paso.clave, turno: n, costo_usd: hecho.resultado.costo_usd, gasto_usd: estado_del_motor.gasto_usd, estado: 'en_curso', degradado: !!hecho.error, terminado: false } }
}

function abrirExpediente(e: EncargoDeConversa): Record<string, unknown> {
  const { corrida: _corrida, tope_de_prueba: _tope, ...resto } = (e.semilla ?? {}) as Record<string, unknown>
  return { cliente: e.client_id, ...resto }
}

const ESQUEMA_A_INSTRUCCION: Record<string, string> = { 'planteo_mesa.v1': 'planteo_mesa', 'aporte.v1': 'aporte', 'acta.v1': 'acta' }

export function pedidoDelTurno(paso: Paso, arts: Arts): string {
  const contexto: Record<string, unknown> = {}
  for (const nombre of paso.entrada) if (arts[nombre]) contexto[nombre] = arts[nombre]
  const tarea = `${INSTRUCCION_POR_PASO[ESQUEMA_A_INSTRUCCION[String(paso.salida?.esquema)]]}\n\nCONTEXTO (JSON):\n${JSON.stringify(contexto)}`
  return tarea.length > TOPE_REAL_DEL_PEDIDO ? tarea.slice(0, TOPE_REAL_DEL_PEDIDO) : tarea
}

function validarTurno(paso: Paso, v: unknown): { ok: true; artefacto: Record<string, unknown> } | { ok: false; errores: string[] } {
  const esquema = paso.salida?.esquema
  if (esquema === 'acta.v1') { const a = validarActa(v); return a.ok ? { ok: true, artefacto: a.valor as unknown as Record<string, unknown> } : a }
  if (esquema === 'aporte.v1') { const a = validarAporte(v, paso.quien); return a.ok ? { ok: true, artefacto: { ...a.valor, ...(a.avisos.length ? { avisos: a.avisos } : {}) } } : a }
  if (!objeto(v) || !Array.isArray(v.canales) || !v.canales.length) return { ok: false, errores: ['el planteo debe traer `canales`'] }
  return { ok: true, artefacto: { ...v, habla: quienHablaEnLaMesa(v.canales as never, v.negocio_local === true) } }
}

async function turnoDeAgente(P: PuertosDeMesa, e: EncargoDeConversa, paso: Paso, arts: Arts): Promise<{ resultado: ResultadoDePaso; error: string | null }> {
  const tarea = pedidoDelTurno(paso, arts)
  const inicio = P.ahora().getTime()
  let costo = 0, error = 'sin respuesta'
  for (let i = 0; i < 2; i++) {
    // reintentar pasado el margen pierde el turno entero y cobra dos veces
    if (i > 0 && P.ahora().getTime() - inicio > LIMITE_PARA_REINTENTAR_MS) break
    const r = await P.modelo.invocar({ agente: paso.quien, tarea: i === 0 ? tarea : `${tarea}\n\nTu respuesta anterior no cumplió el formato (${error}). Devuelve SOLO el objeto JSON.`, encargo_id: e.id, client_id: e.client_id, paso: paso.clave, tope_usd: paso.tope_usd, dry_run: e.dry_run })
    costo += r.costo_usd
    if (!r.ok) { error = r.error; break }
    const j = extraerJson(r.salida)
    if (!j.ok) { error = j.error; continue }
    const v = validarTurno(paso, j.valor)
    if (v.ok) return { resultado: { costo_usd: costo, artefacto: v.artefacto }, error: null }
    error = v.errores.join('; ')
  }
  // un aporte que falta se declara; la reunión sigue con los demás. El acta o el planteo no tienen reemplazo: sin ellos la mesa termina sin acuerdo
  if (paso.salida?.esquema === 'aporte.v1') return { resultado: { costo_usd: costo, artefacto: { sin_aporte: true, agente: paso.quien, motivo: error } }, error }
  if (paso.salida?.esquema === 'planteo_mesa.v1') return { resultado: { costo_usd: costo, artefacto: { sin_planteo: true, motivo: error, habla: { busqueda: false, seo: false, organico: false } } }, error }
  return { resultado: { costo_usd: costo, artefacto: { sin_acta: true, motivo: error } }, error }
}
