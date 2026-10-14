/**
 * EL VIGILANTE DENTRO DEL SISTEMA (14-oct · firma de Emilio: «no puede permanecer siempre abierto el CC»). Al cierre de cada corrida del flujo del portero, UNA llamada a esta
 * ruta revisa las condiciones de salud; si alguna falla, el horario SE APAGA SOLO (se desactiva el flujo; reversible: se vuelve a activar) y se AVISA a #alertas con el motivo en
 * una línea. Si todo va bien: SILENCIO (solo queda el rastro en `cerebro_portero_corridas.resumen.vigilante`). Los lunes, UN resumen de la semana (US$ 0).
 *
 * Condiciones (las mismas del vigilante de la primera corrida, ahora sin nombres propios de ningún cliente):
 *  1. la corrida no terminó `hecho` / algún cliente trae errores, plan fallido o el puente falló;
 *  2. el rastro de hoy no existe o no está `hecha`;
 *  3. gasto real del día > US$ 1,00 (el tope del código es 1,50: esto avisa ANTES);
 *  4. nació una ficha VIVA de una unidad que el filtro no confirmó (ajena / sin confirmar / ruido / repetida);
 *  5. el puente deja `quedan > 0`, hay fichas vivas repetidas o fichas vivas sin trozo en el índice;
 *  6. el propio vigilante no pudo comprobar algo (falla de lectura) ⇒ se trata como problema: ante la duda, apagado (el gasto recurrente no puede quedar sin ojos).
 * No llama a Apify ni a ningún modelo.
 */
import { clientesActivos } from './clientes'
import { gastoDeHoy, reconciliarYEnviar, type DepsDeRutas, type Respuesta } from './rutas'

export const LIMITE_DEL_VIGILANTE_USD = 1.0
export const CANAL_DE_ALERTAS = 'C0B7XUUEBHA'
/** veredictos de una unidad que NO debe haber dado una ficha viva */
export const VEREDICTOS_QUE_NO_ENTREGAN = ['ajeno', 'sin_confirmar', 'ruido', 'repetida'] as const

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
}

export interface ResultadoDeCliente { client_id: string; nombre: string | null; problemas: string[]; gasto_usd: number | null }

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

async function evaluarCliente(deps: DepsDelVigilante, c: { client_id: string; nombre: string | null }, cierre: unknown, ahora: Date, dia: string): Promise<{ r: ResultadoDeCliente; rastro: Fila | null }> {
  const r: ResultadoDeCliente = { client_id: c.client_id, nombre: c.nombre, problemas: problemasDelCierre(cierre, c.client_id), gasto_usd: null }
  const falla = (que: string, m: string) => r.problemas.push(`no pude comprobar ${que}: ${m}`.slice(0, 200))

  const ras = await deps.db.from('cerebro_portero_corridas').select('id, estado, resumen').eq('client_id', c.client_id).eq('dia', dia).limit(1)
  let rastro: Fila | null = null
  if (ras.error) falla('el rastro del día', ras.error.message)
  else {
    rastro = lista(ras.data)[0] ?? null
    if (!rastro) r.problemas.push('no hay rastro de la corrida de hoy')
    else if (rastro.estado !== 'hecha') r.problemas.push(`el rastro de hoy dice «${String(rastro.estado)}»`)
  }

  const g = await gastoDeHoy(deps.db, c.client_id, ahora)
  if (!g.ok) falla('el gasto del día', g.detalle)
  else {
    r.gasto_usd = redondeo(g.gasto.total_usd)
    if (g.gasto.total_usd > LIMITE_DEL_VIGILANTE_USD) r.problemas.push(`gasto del día US$ ${r.gasto_usd.toFixed(2)} > ${LIMITE_DEL_VIGILANTE_USD.toFixed(2)}`)
  }

  const dia0 = new Date(ahora); dia0.setUTCHours(0, 0, 0, 0)
  const nuevas = await deps.db.from('cerebro_fichas').select('id, descartada, retirada_en').eq('client_id', c.client_id).gte('creado_en', dia0.toISOString()).limit(2000)
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

  const p = await reconciliarYEnviar(deps, c.client_id, true)
  if (p.errores.length || p.puente.lectura_fallida === true) falla('el puente', p.errores[0] ?? 'lectura fallida')
  else {
    if (typeof p.puente.quedan === 'number' && p.puente.quedan > 0) r.problemas.push(`el índice tiene ${p.puente.quedan} trozo(s) por escribir o sacar (fichas vivas sin trozo o trozos de fichas retiradas)`)
    if (typeof p.puente.repetidas === 'number' && p.puente.repetidas > 0) r.problemas.push(`hay ${p.puente.repetidas} ficha(s) viva(s) repetida(s)`)
  }
  return { r, rastro }
}

/** el texto de UNA línea para #alertas */
export function lineaDeAlerta(res: ResultadoDeCliente[], apagado: boolean, workflowId: string): string {
  const todos = res.flatMap((x) => x.problemas.map((p) => `${x.nombre ?? x.client_id.slice(0, 8)}: ${p}`))
  const primero = todos[0] ?? 'sin detalle'
  const mas = todos.length > 1 ? ` (+${todos.length - 1} más)` : ''
  return `🔴 Portero del cerebro ${apagado ? 'APAGADO' : 'CON PROBLEMAS (no se pudo apagar: apágalo a mano)'} · ${primero}${mas} · revisar y volver a activar el flujo ${workflowId} en n8n`
}

export async function resumenSemanal(deps: DepsDelVigilante, clientIds: string[], ahora: Date): Promise<{ texto: string; filas: number } | { error: string }> {
  const desde = new Date(ahora); desde.setUTCDate(desde.getUTCDate() - 7)
  const q = await deps.db.from('cerebro_portero_corridas').select('client_id, dia, estado, resumen, gasto_modelo_usd').in('client_id', clientIds).gte('dia', desde.toISOString().slice(0, 10)).limit(500)
  if (q.error) return { error: q.error.message }
  const f = lista(q.data)
  const hechas = f.filter((x) => x.estado === 'hecha').length
  const conErrores = f.filter((x) => x.estado === 'con_errores').length
  let fichas = 0, gasto = 0, problemas = 0
  for (const x of f) {
    const res = esObjeto(x.resumen) ? x.resumen : {}
    const esc = esObjeto(res.escrituras) ? res.escrituras : {}
    fichas += Number(esc.fichas) || 0
    const v = esObjeto(res.vigilante) ? res.vigilante : {}
    gasto += Number(v.gasto_usd) || 0
    problemas += Array.isArray(v.problemas) ? v.problemas.length : 0
  }
  return { filas: f.length, texto: `📊 Portero del cerebro · últimos 7 días · ${f.length} corrida(s) (${hechas} hecha(s), ${conErrores} con errores) · ${fichas} ficha(s) nuevas · gasto medido US$ ${gasto.toFixed(2)} · ${problemas} problema(s)` }
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

  let objetivos: Array<{ client_id: string; nombre: string | null }>
  const solo = typeof cuerpo.client_id === 'string' && UUID.test(cuerpo.client_id) ? cuerpo.client_id : null
  const act = await clientesActivos(deps.db)
  const globales: string[] = []
  if (!act.ok) { objetivos = solo ? [{ client_id: solo, nombre: null }] : []; globales.push(`no pude comprobar la lista de clientes: ${act.detalle}`.slice(0, 200)) }
  else objetivos = solo ? act.datos.clientes.filter((c) => c.client_id === solo) : act.datos.clientes
  if (act.ok && !objetivos.length) globales.push('no hay clientes activos que revisar')

  const resultados: ResultadoDeCliente[] = []
  const rastros = new Map<string, Fila | null>()
  for (const o of objetivos) {
    const { r, rastro } = await evaluarCliente(deps, o, cuerpo.cierre, ahora, dia)
    resultados.push(r); rastros.set(o.client_id, rastro)
  }
  if (globales.length) resultados.push({ client_id: solo ?? 'general', nombre: null, problemas: globales, gasto_usd: null })
  const hayProblemas = resultados.some((r) => r.problemas.length > 0)
  const body: Record<string, unknown> = { ok: !hayProblemas, dry_run: cuerpo.dry_run, dia, clientes: resultados, modelos_llamados: 0 }
  if (cuerpo.dry_run) return { status: 200, body: { ...body, nota: 'dry_run: no se escribió, no se apagó nada y no se avisó' } }

  // el rastro: una nota por cliente en la fila de hoy (nunca pisa lo demás de `resumen`)
  const erroresDeRastro: string[] = []
  for (const r of resultados) {
    const fila = rastros.get(r.client_id)
    if (!fila) continue
    const resumen = esObjeto(fila.resumen) ? fila.resumen : {}
    const u = await deps.db.from('cerebro_portero_corridas').update({ resumen: { ...resumen, vigilante: { ok: r.problemas.length === 0, problemas: r.problemas, gasto_usd: r.gasto_usd, revisado_en: ahora.toISOString(), workflow_execution_id: ex } } }).eq('id', String(fila.id))
    if (u.error) erroresDeRastro.push(`rastro ${r.client_id.slice(0, 8)}: ${u.error.message}`)
  }
  if (erroresDeRastro.length) body.errores_de_rastro = erroresDeRastro

  if (hayProblemas) {
    const ap = deps.apagar ? await deps.apagar(wf).catch((e: unknown) => ({ ok: false, detalle: e instanceof Error ? e.message : String(e) })) : { ok: false, detalle: 'sin forma de apagar el flujo' }
    const texto = lineaDeAlerta(resultados, ap.ok, wf)
    const av = deps.avisar ? await deps.avisar(texto).catch((e: unknown) => ({ ok: false, detalle: e instanceof Error ? e.message : String(e) })) : { ok: false, detalle: 'sin canal de aviso' }
    body.apagado = ap; body.aviso = { ...av, texto }
    return { status: ap.ok && av.ok ? 200 : 502, body: { ...body, ok: false } }
  }

  // todo bien = silencio; el lunes, UN resumen de la semana (una sola vez por día)
  if (ahora.getUTCDay() === 1 && objetivos.length) {
    const ya = [...rastros.values()].some((f) => f && esObjeto(f.resumen) && esObjeto(f.resumen.vigilante) && (f.resumen.vigilante as Fila).semanal_enviado === dia)
    if (!ya) {
      const s = await resumenSemanal(deps, objetivos.map((o) => o.client_id), ahora)
      if ('error' in s) body.semanal = { enviado: false, detalle: s.error }
      else {
        const av = deps.avisar ? await deps.avisar(s.texto).catch((e: unknown) => ({ ok: false, detalle: e instanceof Error ? e.message : String(e) })) : { ok: false, detalle: 'sin canal de aviso' }
        body.semanal = { enviado: av.ok, texto: s.texto, detalle: av.detalle }
        if (av.ok) {
          for (const o of objetivos) {
            const fila = rastros.get(o.client_id); if (!fila) continue
            const resumen = esObjeto(fila.resumen) ? fila.resumen : {}
            const vig = esObjeto(resumen.vigilante) ? resumen.vigilante : {}
            await deps.db.from('cerebro_portero_corridas').update({ resumen: { ...resumen, vigilante: { ...vig, semanal_enviado: dia } } }).eq('id', String(fila.id))
          }
        }
      }
    }
  }
  return { status: 200, body }
}
