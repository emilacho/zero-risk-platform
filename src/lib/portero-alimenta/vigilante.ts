/**
 * EL VIGILANTE DENTRO DEL SISTEMA (14-oct · firma de Emilio: «no puede permanecer siempre abierto el CC»). Al cierre de cada corrida del flujo del portero, UNA llamada a esta
 * ruta revisa las condiciones de salud; si alguna falla, el horario SE APAGA SOLO (se desactiva el flujo; reversible: se vuelve a activar) y se AVISA a #alertas con el motivo en
 * una línea. Si todo va bien: SILENCIO (solo queda el rastro en `cerebro_portero_corridas.resumen.vigilante`). Sin mensajes de rutina de ningún tipo (15-oct: el resumen semanal se quitó).
 * Reintento (15-oct): si la ÚNICA causa es «no pude comprobar» (una lectura que falló), espera y repite UNA vez; si la segunda pasa → silencio; si vuelve a fallar → apaga y avisa («falló 2 veces»).
 * Los problemas reales (1-5) apagan al primer fallo, sin reintento.
 *
 * Condiciones (las mismas del vigilante de la primera corrida, ahora sin nombres propios de ningún cliente):
 *  1. la corrida no terminó `hecho` / algún cliente trae errores, plan fallido o el puente falló;
 *  2. el rastro de hoy no existe o no está `hecha`;
 *  3. gasto real del día > el umbral de apagado (dato · por omisión US$ 10; firma 15-oct). Entre el umbral de aviso (por omisión US$ 3) y el de apagado: UN aviso por día y cliente SIN apagar;
 *  4. nació una ficha VIVA de una unidad que el filtro no confirmó (ajena / sin confirmar / ruido);
 *  5. el puente deja `quedan > 0`, hay fichas vivas repetidas o fichas vivas sin trozo en el índice;
 *  6. el propio vigilante no pudo comprobar algo (falla de lectura) ⇒ se trata como problema: ante la duda, apagado (el gasto recurrente no puede quedar sin ojos);
 *  7. auditoría de calidad (15-oct): una muestra de las fichas de HOY no verifica contra su fuente cruda (tasa de error sobre el umbral de `auditoria.ts`) y las citas del resumen vivo existen. Silenciosa si todo está bien.
 * No llama a Apify ni a ningún modelo.
 */
import { clientesActivos } from './clientes'
import { leerTodas } from './paginar'
import { auditarCliente, auditarCitasDelResumen, type ResultadoDeAuditoria } from './auditoria'
import { UMBRALES_DE_GASTO_POR_OMISION, type UmbralesDeGasto } from './datos'
import { gastoDeHoy, reconciliarYEnviar, type DepsDeRutas, type Respuesta } from './rutas'

/** el umbral de APAGADO por omisión (el real es dato: `deps.umbrales`) */
export const LIMITE_DEL_VIGILANTE_USD = UMBRALES_DE_GASTO_POR_OMISION.apagar_usd
export const CANAL_DE_ALERTAS = 'C0B7XUUEBHA'
/** veredictos de una unidad que NO debe haber dado una ficha viva */
/** («repetida» NO está: una unidad vista otra vez queda `repetida` y apunta a la ficha viva que la representa; es lo normal) */
export const VEREDICTOS_QUE_NO_ENTREGAN = ['ajeno', 'sin_confirmar', 'ruido'] as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const esObjeto = (v: unknown): v is Fila => typeof v === 'object' && v !== null && !Array.isArray(v)
const err = (status: number, error: string, detalle: string): Respuesta => ({ status, body: { error, detalle } })
const redondeo = (n: number) => Math.round(n * 10000) / 10000

export interface DepsDelVigilante extends DepsDeRutas {
  /** desactiva el flujo (reversible); en pruebas es un registro */
  apagar?: (workflowId: string) => Promise<{ ok: boolean; detalle: string }>
  /** manda UNA línea a #alertas; ok solo si el canal confirmó; en pruebas es un registro */
  avisar?: (texto: string) => Promise<{ ok: boolean; detalle: string }>
  /** espera antes del reintento de «no pude comprobar»; en pruebas es un registro sin espera */
  esperar?: (ms: number) => Promise<void>
  /** umbrales de gasto (aviso / apagado); por omisión `UMBRALES_DE_GASTO_POR_OMISION` */
  umbrales?: UmbralesDeGasto
}

/** cuánto se espera antes de repetir la comprobación fallida (dentro de la misma ejecución) */
export const ESPERA_DEL_REINTENTO_MS = 100_000
const PREFIJO_NO_PUDE = 'no pude comprobar'
/** problemas que son solo «no pude comprobar» (condición 6): los únicos que se reintentan */
export const esSoloNoPudeComprobar = (res: ResultadoDeCliente[]) => {
  const todos = res.flatMap((r) => r.problemas)
  return todos.length > 0 && todos.every((p) => p.startsWith(PREFIJO_NO_PUDE))
}

export interface ResultadoDeCliente { client_id: string; nombre: string | null; problemas: string[]; gasto_usd: number | null; auditoria?: ResultadoDeAuditoria | null; /** avisos que NO apagan (gasto entre el umbral de aviso y el de apagado) */ avisos?: string[] }

/** las condiciones que salen del CIERRE del flujo (sin leer la base) */
export function problemasDelCierre(cierre: unknown, clientId: string): string[] {
  if (!esObjeto(cierre)) return ['el flujo no entregó la salida del cierre']
  const out: string[] = []
  const cl = lista(cierre.clientes).find((x) => x.cliente === clientId)
  if (cierre.fin !== 'hecho') out.push(`el cierre de la corrida dice «${String(cierre.fin ?? 'sin dato')}»`)
  if (!cl) { out.push('el cierre no trae a este cliente'); return out }
  const errores = Array.isArray(cl.errores) ? cl.errores : []
  if (errores.length) out.push(`errores en la corrida: ${String(errores[0]).slice(0, 120)}${errores.length > 1 ? ` (+${errores.length - 1})` : ''}`)
  if (cl.plan_fallo) out.push(`el plan del día falló: ${String(cl.plan_fallo).slice(0, 120)}`)
  const pu = esObjeto(cl.puente) ? cl.puente : {}
  if (pu.falla) out.push(`el puente falló: ${String(pu.falla).slice(0, 120)}`)
  if (typeof pu.quedan === 'number' && pu.quedan > 0) out.push(`el puente dejó ${pu.quedan} pendiente(s)`)
  if (['con_errores', 'lectura_fallida', 'sin_respuesta'].includes(String(cl.alimentar))) out.push(`alimentar terminó «${String(cl.alimentar)}»`)
  return out
}

/** `sinGasto`: el despertar con el raspado del alta no gasta (US$ 0): el gasto del día es del alta, no suyo, y no debe apagar nada */
export async function evaluarCliente(deps: DepsDelVigilante, c: { client_id: string; nombre: string | null }, cierre: unknown, ahora: Date, dia: string, opciones: { sinGasto?: boolean } = {}): Promise<{ r: ResultadoDeCliente; rastro: Fila | null }> {
  const r: ResultadoDeCliente = { client_id: c.client_id, nombre: c.nombre, problemas: problemasDelCierre(cierre, c.client_id), gasto_usd: null }
  const falla = (que: string, m: string) => r.problemas.push(`${PREFIJO_NO_PUDE} ${que}: ${m}`.slice(0, 200))

  const ras = await deps.db.from('cerebro_portero_corridas').select('id, estado, resumen').eq('client_id', c.client_id).eq('dia', dia).limit(1)
  let rastro: Fila | null = null
  if (ras.error) falla('el rastro del día', ras.error.message)
  else {
    rastro = lista(ras.data)[0] ?? null
    if (!rastro) r.problemas.push('no hay rastro de la corrida de hoy')
    else if (rastro.estado !== 'hecha') r.problemas.push(`el rastro de hoy dice «${String(rastro.estado)}»`)
  }

  const g = opciones.sinGasto ? null : await gastoDeHoy(deps.db, c.client_id, ahora)
  if (g === null) { /* sin condición de gasto */ }
  else if (!g.ok) falla('el gasto del día', g.detalle)
  else {
    r.gasto_usd = redondeo(g.gasto.total_usd)
    const u = deps.umbrales ?? UMBRALES_DE_GASTO_POR_OMISION
    if (g.gasto.total_usd > u.apagar_usd) r.problemas.push(`gasto del día US$ ${r.gasto_usd.toFixed(2)} > ${u.apagar_usd.toFixed(2)}`)
    else if (g.gasto.total_usd > u.aviso_usd) r.avisos = [`el gasto del día va en US$ ${r.gasto_usd.toFixed(2)} (aviso desde ${u.aviso_usd.toFixed(2)}; el portero se apaga solo pasando de ${u.apagar_usd.toFixed(2)})`]
  }

  const dia0 = new Date(ahora); dia0.setUTCHours(0, 0, 0, 0)
  const nuevas = await leerTodas(() => deps.db.from('cerebro_fichas').select('id, descartada, retirada_en').eq('client_id', c.client_id).gte('creado_en', dia0.toISOString()).order('id', { ascending: true }))
  if (nuevas.error) falla('las fichas nuevas', nuevas.error.message)
  else {
    const ids = lista(nuevas.data).filter((x) => !x.descartada && !x.retirada_en).map((x) => String(x.id))
    let malas = 0
    for (let i = 0; i < ids.length; i += 100) {
      const v = await deps.db.from('cerebro_unidades_vistas').select('ficha_id, veredicto').eq('client_id', c.client_id).in('ficha_id', ids.slice(i, i + 100)).in('veredicto', [...VEREDICTOS_QUE_NO_ENTREGAN]).limit(1000)
      if (v.error) { falla('el veredicto de las fichas nuevas', v.error.message); break }
      malas += new Set(lista(v.data).map((x) => String(x.ficha_id))).size
    }
    if (malas > 0) r.problemas.push(`${malas} ficha(s) viva(s) nacieron de una unidad que el filtro no confirmó como propia`)
  }

  // 7 · auditoría diaria de calidad (solo código, US$ 0): una lectura que falla se DICE, nunca se lee como «todo bien»
  const au = await auditarCliente(deps.db, c.client_id, ahora)
  if (!au.ok) falla('la auditoría de calidad', au.detalle)
  else { r.auditoria = au.resultado; if (au.resultado.problema) r.problemas.push(au.resultado.problema) }
  const ci = await auditarCitasDelResumen(deps.db, c.client_id)
  if (!ci.ok) falla('las citas del resumen vivo', ci.detalle)
  else if (ci.problema) r.problemas.push(ci.problema)

  const p = await reconciliarYEnviar(deps, c.client_id, true)
  if (p.errores.length || p.puente.lectura_fallida === true) falla('el puente', p.errores[0] ?? 'lectura fallida')
  else {
    if (typeof p.puente.quedan === 'number' && p.puente.quedan > 0) r.problemas.push(`el índice tiene ${p.puente.quedan} trozo(s) por escribir o sacar (fichas vivas sin trozo o trozos de fichas retiradas)`)
    if (typeof p.puente.repetidas === 'number' && p.puente.repetidas > 0) r.problemas.push(`hay ${p.puente.repetidas} ficha(s) viva(s) repetida(s)`)
  }
  return { r, rastro }
}

/** el texto de UNA línea para #alertas */
export function lineaDeAlerta(res: ResultadoDeCliente[], apagado: boolean, workflowId: string, intentos = 1, etapa?: string): string {
  const todos = res.flatMap((x) => x.problemas.map((p) => `${x.nombre ?? x.client_id.slice(0, 8)}: ${p}`))
  const primero = todos[0] ?? 'sin detalle'
  const mas = (todos.length > 1 ? ` (+${todos.length - 1} más)` : '') + (intentos > 1 ? ` · falló ${intentos} veces` : '')
  return `🔴 Portero del cerebro${etapa ? ` (${etapa})` : ''} ${apagado ? 'APAGADO' : 'CON PROBLEMAS (no se pudo apagar: apágalo a mano)'} · ${primero}${mas} · revisar y volver a activar el flujo ${workflowId} en n8n`
}

/** cuántas pausas por la MISMA causa en una hora vuelven el problema «del sistema» y no «del cliente»: ahí sí se apaga el flujo entero */
export const PAUSAS_COMUNES_PARA_APAGAR = 3
/** la línea de UN aviso cuando se pausa a uno o más clientes (el flujo sigue para los demás) */
export function lineaDePausa(res: ResultadoDeCliente[], workflowId: string, intentos = 1): string {
  const nombres = res.map((x) => x.nombre ?? x.client_id.slice(0, 8)).join(', ')
  const primero = res[0]?.problemas[0] ?? 'sin detalle'
  return `🟠 Portero del cerebro · PAUSADO solo para ${nombres}: ${primero}${res.length > 1 ? ` (+${res.length - 1} cliente(s) más)` : ''}${intentos > 1 ? ` · falló ${intentos} veces` : ''} · los demás clientes siguen (flujo ${workflowId} encendido) · se reanuda con POST /api/brain/alimentar/reanudar cuando se arregle`
}

/** la línea de UN aviso que no apaga (🟡: informativo; el flujo sigue encendido) */
export function lineaDeAvisoDeGasto(res: ResultadoDeCliente[]): string {
  const todos = res.flatMap((x) => (x.avisos ?? []).map((a) => `${x.nombre ?? x.client_id.slice(0, 8)}: ${a}`))
  return `🟡 Portero del cerebro · ${todos[0] ?? 'sin detalle'}${todos.length > 1 ? ` (+${todos.length - 1} más)` : ''} · el flujo sigue encendido`
}

export async function rutaVigilar(deps: DepsDelVigilante, cuerpo: unknown): Promise<Respuesta> {
  if (!esObjeto(cuerpo)) return err(400, 'entrada_invalida', 'el cuerpo debe ser un objeto')
  if (typeof cuerpo.dry_run !== 'boolean') return err(400, 'dry_run_obligatorio', '`dry_run` es obligatorio y debe ser true o false')
  const wf = typeof cuerpo.workflow_id === 'string' ? cuerpo.workflow_id.trim() : ''
  const ex = typeof cuerpo.workflow_execution_id === 'string' ? cuerpo.workflow_execution_id.trim() : ''
  if (!cuerpo.dry_run && (!wf || !ex)) return err(403, 'workflow_requerido', 'con dry_run=false hacen falta `workflow_id` y `workflow_execution_id`: el vigilante solo corre desde el flujo')
  if (!deps.interruptores.alimentar) return { status: 200, body: { apagado: true, detalle: 'PORTERO_ALIMENTAR está apagado: no se revisó nada', modelos_llamados: 0 } }
  const ahora = deps.ahora ?? new Date()
  const dia = ahora.toISOString().slice(0, 10)

  const solo = typeof cuerpo.client_id === 'string' && UUID.test(cuerpo.client_id) ? cuerpo.client_id : null
  const pasada = async () => {
    let objetivos: Array<{ client_id: string; nombre: string | null }>
    const act = await clientesActivos(deps.db)
    const globales: string[] = []
    if (!act.ok) { objetivos = solo ? [{ client_id: solo, nombre: null }] : []; globales.push(`${PREFIJO_NO_PUDE} la lista de clientes: ${act.detalle}`.slice(0, 200)) }
    else objetivos = solo ? act.datos.clientes.filter((c) => c.client_id === solo) : act.datos.clientes
    if (act.ok && !objetivos.length) globales.push('no hay clientes activos que revisar')
    const resultados: ResultadoDeCliente[] = []
    const rastros = new Map<string, Fila | null>()
    for (const o of objetivos) {
      const { r, rastro } = await evaluarCliente(deps, o, cuerpo.cierre, ahora, dia)
      resultados.push(r); rastros.set(o.client_id, rastro)
    }
    if (globales.length) resultados.push({ client_id: solo ?? 'general', nombre: null, problemas: globales, gasto_usd: null })
    return { resultados, rastros }
  }

  let { resultados, rastros } = await pasada()
  let intentos = 1
  // reintento SOLO si la única causa es una lectura que falló (condición 6); los problemas reales no se reintentan
  if (!cuerpo.dry_run && esSoloNoPudeComprobar(resultados)) {
    await (deps.esperar ?? ((ms: number) => new Promise<void>((ok) => setTimeout(ok, ms))))(ESPERA_DEL_REINTENTO_MS)
    ;({ resultados, rastros } = await pasada())
    intentos = 2
  }
  const hayProblemas = resultados.some((r) => r.problemas.length > 0)
  const body: Record<string, unknown> = { ok: !hayProblemas, dry_run: cuerpo.dry_run, dia, clientes: resultados, intentos, modelos_llamados: 0 }
  if (cuerpo.dry_run) return { status: 200, body: { ...body, nota: 'dry_run: no se escribió, no se apagó nada y no se avisó' } }

  // avisos que no apagan: UNO por día y cliente (la marca vive en el rastro de hoy); solo si nada apaga (si apaga, ese aviso ya lo cubre)
  const yaAvisado = (id: string) => { const f = rastros.get(id); const v = f && esObjeto(f.resumen) && esObjeto(f.resumen.vigilante) ? f.resumen.vigilante : null; return !!v && v.aviso_de_gasto_dia === dia }
  const porAvisar = hayProblemas ? [] : resultados.filter((r) => (r.avisos ?? []).length > 0 && !yaAvisado(r.client_id))
  const avisadosHoy = new Set<string>()
  if (porAvisar.length) {
    const texto = lineaDeAvisoDeGasto(porAvisar)
    const av = deps.avisar ? await deps.avisar(texto).catch((e: unknown) => ({ ok: false, detalle: e instanceof Error ? e.message : String(e) })) : { ok: false, detalle: 'sin canal de aviso' }
    body.aviso_de_gasto = { ...av, texto, clientes: porAvisar.map((r) => r.client_id) }
    if (av.ok) for (const r of porAvisar) avisadosHoy.add(r.client_id)
  }

  // el rastro: una nota por cliente en la fila de hoy (nunca pisa lo demás de `resumen`)
  const erroresDeRastro: string[] = []
  for (const r of resultados) {
    const fila = rastros.get(r.client_id)
    if (!fila) continue
    const resumen = esObjeto(fila.resumen) ? fila.resumen : {}
    const marcaDeAviso = avisadosHoy.has(r.client_id) || yaAvisado(r.client_id) ? { aviso_de_gasto_dia: dia } : {}
    const u = await deps.db.from('cerebro_portero_corridas').update({ resumen: { ...resumen, vigilante: { ok: r.problemas.length === 0, problemas: r.problemas, gasto_usd: r.gasto_usd, auditoria: r.auditoria ? { elegidas: r.auditoria.elegidas, verificables: r.auditoria.verificables, errores: r.auditoria.errores, sin_verificar: r.auditoria.sin_verificar, tasa_de_error: r.auditoria.tasa_de_error } : null, ...(r.avisos?.length ? { avisos: r.avisos } : {}), ...marcaDeAviso, revisado_en: ahora.toISOString(), workflow_execution_id: ex, intentos } } }).eq('id', String(fila.id))
    if (u.error) erroresDeRastro.push(`rastro ${r.client_id.slice(0, 8)}: ${u.error.message}`)
  }
  if (erroresDeRastro.length) body.errores_de_rastro = erroresDeRastro

  if (hayProblemas) {
    // P2 (16-oct): UN cliente con un problema PROPIO se PAUSA y el flujo sigue para los demás; el flujo entero solo se apaga si el problema no es de un cliente
    // (la lista de clientes, ninguno activo, no se pudo registrar la pausa) o si es COMÚN a varios (algo del sistema, no de ese cliente).
    const globales = resultados.filter((r) => r.problemas.length > 0 && !UUID.test(r.client_id))
    const delCliente = resultados.filter((r) => r.problemas.length > 0 && UUID.test(r.client_id))
    const pausados: Array<{ client_id: string; nombre: string | null; ya_estaba: boolean }> = []
    for (const r of delCliente) {
      const falla = (m: string) => { const e = { ...r, client_id: 'general', problemas: [`${PREFIJO_NO_PUDE} registrar la pausa de ${r.nombre ?? r.client_id.slice(0, 8)}: ${m}`.slice(0, 200)] }; globales.push(e); resultados.push(e) }
      const abierta = await deps.db.from('cerebro_portero_pausas').select('id').eq('client_id', r.client_id).is('levantada_en', null).limit(1)
      if (abierta.error) { falla(abierta.error.message); continue }
      if (lista(abierta.data).length) { pausados.push({ client_id: r.client_id, nombre: r.nombre, ya_estaba: true }); continue }
      const w = await deps.db.from('cerebro_portero_pausas').insert({ client_id: r.client_id, motivo: r.problemas[0].slice(0, 300), problemas: r.problemas, workflow_id: wf || null, workflow_execution_id: ex || null, desde: ahora.toISOString() })
      if (w.error) { falla(w.error.message); continue }
      pausados.push({ client_id: r.client_id, nombre: r.nombre, ya_estaba: false })
    }
    let sistemico = false
    if (pausados.some((p) => !p.ya_estaba)) {
      const rec = await deps.db.from('cerebro_portero_pausas').select('client_id, motivo').gte('desde', new Date(ahora.getTime() - 3_600_000).toISOString()).limit(200)
      const causa = (t: string) => t.replace(/[\d.,]+/g, '#').slice(0, 80)
      const mias = delCliente.map((r) => causa(r.problemas[0]))
      if (!rec.error) sistemico = mias.some((c) => lista(rec.data).filter((x) => causa(String(x.motivo ?? '')) === c).length >= PAUSAS_COMUNES_PARA_APAGAR)
    }
    const apagarTodo = globales.length > 0 || sistemico
    if (!apagarTodo && pausados.every((p) => p.ya_estaba)) return { status: 200, body: { ...body, ok: false, pausados } }
    if (!apagarTodo) {
      const texto = lineaDePausa(delCliente.filter((r) => pausados.some((p) => p.client_id === r.client_id && !p.ya_estaba)), wf, intentos)
      const av = deps.avisar ? await deps.avisar(texto).catch((e: unknown) => ({ ok: false, detalle: e instanceof Error ? e.message : String(e) })) : { ok: false, detalle: 'sin canal de aviso' }
      body.pausados = pausados; body.aviso = { ...av, texto }
      return { status: av.ok ? 200 : 502, body: { ...body, ok: false } }
    }
    const ap = deps.apagar ? await deps.apagar(wf).catch((e: unknown) => ({ ok: false, detalle: e instanceof Error ? e.message : String(e) })) : { ok: false, detalle: 'sin forma de apagar el flujo' }
    const texto = lineaDeAlerta(resultados, ap.ok, wf, intentos)
    const av = deps.avisar ? await deps.avisar(texto).catch((e: unknown) => ({ ok: false, detalle: e instanceof Error ? e.message : String(e) })) : { ok: false, detalle: 'sin canal de aviso' }
    body.apagado = ap; body.aviso = { ...av, texto }; if (pausados.length) body.pausados = pausados
    return { status: ap.ok && av.ok ? 200 : 502, body: { ...body, ok: false } }
  }
  // todo bien = silencio (sin resumen de rutina de ningún tipo)
  return { status: 200, body }
}
