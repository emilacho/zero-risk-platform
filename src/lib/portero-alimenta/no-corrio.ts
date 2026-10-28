/**
 * LA ALARMA DE «NO CORRIÓ» (15-oct · firma de Emilio: «si llegase a fallar es cuando tenemos que saber»). El vigilante vive DENTRO del flujo: si el flujo no dispara, no hay
 * quien avise. Este chequeo es independiente del flujo (lo llama un cron de Vercel ~14:00 UTC, después de la corrida diaria ≈12:30 UTC) y mira UNA cosa por cliente activo:
 * ¿existe la corrida de HOY en `cerebro_portero_corridas` y está `hecha`?
 *  · existe y está `hecha`                      → silencio;
 *  · existe y NO está `hecha`                    → si el vigilante ya apagó y avisó (`resumen.vigilante.ok === false`) → silencio (ya se avisó); si no, UNA línea;
 *  · no existe                                   → si el flujo sigue inactivo porque el vigilante lo apagó (el último rastro trae `vigilante.ok === false`) → silencio
 *                                                  (UN aviso por apagado: el del vigilante); si no, UNA línea con el estado del flujo.
 * Dos comprobaciones más (27-oct · la corrida del 22 salió «hecha» CIEGA: Apify devolvió 500 con la llave vieja y no quedó ni una fila de raspado real; del 23 al 26 el flujo murió en su primera llamada y nadie avisó):
 *  · «hecha» sin raspado real: la corrida de hoy está `hecha` pero el cliente no tiene NINGUNA fila de raspado real de hoy (`apify_raw`, ensayo=false) y sí las tuvo en los 7 días anteriores ⇒ UNA línea (un cliente que nunca raspa no dispara esto);
 *  · n8n no responde: si el propio n8n no contesta (`/healthz`) ⇒ UNA línea, aunque todos los clientes tengan su corrida de hoy (si cae n8n, nadie más avisa).
 * Sin repetir cada día: la racha se mide por la distancia entre hoy y el último rastro (sin escribir nada: una fila marcadora bloquearía la corrida del día con `ya_corrio_hoy`).
 * Se avisa el PRIMER día sin corrida (distancia 1) y UN recordatorio al 4.º día (distancia 4); entre medias, silencio. US$ 0 · no llama a Apify ni a modelo · solo lee.
 */
import { CANAL_DE_ALERTAS } from './vigilante'
import { FLUJO_DEL_PORTERO } from './gasto'
import { clientesActivos } from './clientes'
import type { DepsDeRutas, Respuesta } from './rutas'

export const FLUJO_DEL_PORTERO_POR_OMISION = FLUJO_DEL_PORTERO
/** días sin corrida en que se avisa: el primero y un solo recordatorio */
export const DIAS_EN_QUE_SE_AVISA = [1, 4] as const

type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const esObjeto = (v: unknown): v is Fila => typeof v === 'object' && v !== null && !Array.isArray(v)
const diasEntre = (a: string, b: string) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000)

export type EstadoDelFlujo = { ok: true; activo: boolean } | { ok: false; detalle: string }

export interface DepsDeNoCorrio extends DepsDeRutas {
  workflowId?: string
  /** lee si el flujo está activo en n8n; en pruebas es un molde */
  estadoDelFlujo?: (workflowId: string) => Promise<EstadoDelFlujo>
  /** manda UNA línea a #alertas; ok solo si el canal confirmó */
  avisar?: (texto: string, clave?: string) => Promise<{ ok: boolean; detalle: string }>
  /** cuántas filas de raspado REAL tuvo el cliente hoy y en los 7 días anteriores; sin esto no se revisa el raspado */
  raspadoDelCliente?: (clientId: string, dia: string) => Promise<{ ok: true; hoy: number; previos: number } | { ok: false; detalle: string }>
  /** ¿contesta el propio n8n? sin esto no se revisa */
  n8nResponde?: () => Promise<{ ok: boolean; detalle: string }>
  /** la corrida del modo que se revisa ahora (hora programada, UTC). Con ella, «hecha hoy» exige que la corrida haya dejado rastro DESPUÉS de esa hora (`resumen.ultima_corrida_en`). Sin ella: la revisión de siempre (una por día) */
  corridaEsperada?: Date | null
}

/** el raspado real de un cliente: filas de `apify_raw` (ensayo=false) de hoy y de los 7 días anteriores, leídas de la base */
export function raspadoRealDelCliente(db: DepsDeRutas['db']) {
  return async (clientId: string, dia: string): Promise<{ ok: true; hoy: number; previos: number } | { ok: false; detalle: string }> => {
    const desde = new Date(Date.parse(`${dia}T00:00:00Z`) - 7 * 86_400_000).toISOString()
    const q = await db.from('apify_raw').select('created_at').eq('client_id', clientId).eq('ensayo', false).gte('created_at', desde).limit(2000)
    if (q.error) return { ok: false, detalle: String(q.error.message).slice(0, 100) }
    const filas = lista(q.data)
    const hoy = filas.filter((f) => String(f.created_at).slice(0, 10) === dia).length
    return { ok: true, hoy, previos: filas.length - hoy }
  }
}

/** ¿contesta n8n? GET /healthz con tope de 10 s; lo que no sea 200 es «no responde» */
export function n8nContesta(o: { base?: string; fetchImpl?: (u: string, i?: RequestInit) => Promise<Response> } = {}) {
  return async (): Promise<{ ok: boolean; detalle: string }> => {
    const base = (o.base ?? process.env.N8N_BASE_URL ?? '').replace(/\/$/, '')
    if (!base) return { ok: false, detalle: 'sin N8N_BASE_URL' }
    try {
      const r = await (o.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i)))(`${base}/healthz`, { signal: AbortSignal.timeout(10_000) })
      return r.ok ? { ok: true, detalle: 'responde' } : { ok: false, detalle: `n8n respondió ${r.status}` }
    } catch (e) { return { ok: false, detalle: e instanceof Error ? e.message : String(e) } }
  }
}

export interface VeredictoDeNoCorrio { client_id: string; nombre: string | null; veredicto: 'corrio' | 'corrida_sin_rastro' | 'hecha_sin_raspado' | 'n8n_no_responde' | 'ya_avisado' | 'no_corrio' | 'sin_corrida_en_racha' | 'no_pude_comprobar'; linea?: string; dias_sin_corrida?: number }

const yaLoAvisoElVigilante = (f: Fila | undefined) => !!f && esObjeto(f.resumen) && esObjeto(f.resumen.vigilante) && (f.resumen.vigilante as Fila).ok === false

export function lineaDeNoCorrio(nombre: string | null, motivo: string, workflowId: string): string {
  return `🟠 Portero del cerebro · ${nombre ?? 'cliente'}: ${motivo} · revisar el flujo ${workflowId} en n8n (el vigilante no pudo hablar: no corrió o corrió a medias)`
}

export async function rutaNoCorrio(deps: DepsDeNoCorrio, cuerpo: { dry_run?: boolean } = {}): Promise<Respuesta> {
  const dry = cuerpo.dry_run !== false
  if (!deps.interruptores.alimentar) return { status: 200, body: { apagado: true, detalle: 'PORTERO_ALIMENTAR está apagado a propósito: no se revisó nada', modelos_llamados: 0 } }
  const ahora = deps.ahora ?? new Date()
  const dia = ahora.toISOString().slice(0, 10)
  const wf = deps.workflowId || FLUJO_DEL_PORTERO_POR_OMISION

  const act = await clientesActivos(deps.db)
  const veredictos: VeredictoDeNoCorrio[] = []
  const lineas: string[] = []
  if (deps.n8nResponde) {
    const n = await deps.n8nResponde()
    if (!n.ok) {
      const l = `🟠 Portero del cerebro · n8n no responde (${n.detalle.slice(0, 100)}) · si n8n está caído nadie más avisa: revisar el servicio de n8n en Railway`
      veredictos.push({ client_id: 'n8n', nombre: null, veredicto: 'n8n_no_responde', linea: l }); lineas.push(l)
    }
  }
  if (!act.ok) {
    const l = `🟠 Portero del cerebro · no pude comprobar si corrió hoy (${act.detalle.slice(0, 120)}) · revisar el flujo ${wf} en n8n`
    veredictos.push({ client_id: 'general', nombre: null, veredicto: 'no_pude_comprobar', linea: l })
    lineas.push(l)
  } else {
    let flujo: EstadoDelFlujo | null = null // se lee una sola vez y solo si hace falta
    const estadoFlujo = async () => (flujo ??= deps.estadoDelFlujo ? await deps.estadoDelFlujo(wf).catch((e: unknown) => ({ ok: false as const, detalle: e instanceof Error ? e.message : String(e) })) : { ok: false as const, detalle: 'sin forma de leer el flujo' })
    for (const c of act.datos.clientes) {
      const q = await deps.db.from('cerebro_portero_corridas').select('id, dia, estado, resumen, creado_en').eq('client_id', c.client_id).order('dia', { ascending: false }).limit(10)
      if (q.error) {
        const l = lineaDeNoCorrio(c.nombre, `no pude comprobar el rastro (${String(q.error.message).slice(0, 100)})`, wf)
        veredictos.push({ client_id: c.client_id, nombre: c.nombre, veredicto: 'no_pude_comprobar', linea: l }); lineas.push(l); continue
      }
      const filas = lista(q.data)
      const hoy = filas.find((f) => String(f.dia).slice(0, 10) === dia)
      if (hoy) {
        // construcción (28-oct): hay una fila POR DÍA, pero tres corridas; la fila de hoy puede ser la de las 12:30 y la de las 18:30 no haber dejado rastro
        const ultima = esObjeto(hoy.resumen) && hoy.resumen.tipo === 'despertar' ? NaN : esObjeto(hoy.resumen) && typeof hoy.resumen.ultima_corrida_en === 'string' ? Date.parse(hoy.resumen.ultima_corrida_en) : (typeof hoy.creado_en === 'string' ? Date.parse(hoy.creado_en) : NaN)
        if (deps.corridaEsperada && !(ultima >= deps.corridaEsperada.getTime() - 60_000) && !yaLoAvisoElVigilante(hoy)) {
          const hh = deps.corridaEsperada.toISOString().slice(11, 16)
          const l = lineaDeNoCorrio(c.nombre, `la corrida de las ${hh} UTC no dejó rastro (el último es de ${Number.isFinite(ultima) ? new Date(ultima).toISOString().slice(11, 16) + ' UTC' : 'hora desconocida'})`, wf)
          veredictos.push({ client_id: c.client_id, nombre: c.nombre, veredicto: 'corrida_sin_rastro', linea: l }); lineas.push(l); continue
        }
        if (hoy.estado === 'hecha') {
          const rs = deps.raspadoDelCliente ? await deps.raspadoDelCliente(c.client_id, dia).catch((e: unknown) => ({ ok: false as const, detalle: e instanceof Error ? e.message : String(e) })) : null
          if (rs && rs.ok && rs.hoy === 0 && rs.previos > 0) {
            const l = lineaDeNoCorrio(c.nombre, `la corrida de hoy salió «hecha» pero sin ninguna fila de raspado real (los 7 días anteriores sí tuvieron ${rs.previos}): corrió ciega`, wf)
            veredictos.push({ client_id: c.client_id, nombre: c.nombre, veredicto: 'hecha_sin_raspado', linea: l }); lineas.push(l); continue
          }
          veredictos.push({ client_id: c.client_id, nombre: c.nombre, veredicto: 'corrio' }); continue
        }
        if (yaLoAvisoElVigilante(hoy)) { veredictos.push({ client_id: c.client_id, nombre: c.nombre, veredicto: 'ya_avisado' }); continue }
        const l = lineaDeNoCorrio(c.nombre, `la corrida de hoy quedó «${String(hoy.estado)}» y nadie avisó`, wf)
        veredictos.push({ client_id: c.client_id, nombre: c.nombre, veredicto: 'no_corrio', linea: l }); lineas.push(l); continue
      }
      // no hay corrida de hoy
      const ultimo = filas[0]
      // apagado por el vigilante (ya avisó) y el flujo sigue inactivo ⇒ UN aviso por apagado, ya dado; si alguien lo reactivó y aun así no corre, se sigue por la racha
      if (yaLoAvisoElVigilante(ultimo)) {
        const f0 = await estadoFlujo()
        if (!f0.ok || !f0.activo) { veredictos.push({ client_id: c.client_id, nombre: c.nombre, veredicto: 'ya_avisado' }); continue }
      }
      const sin = ultimo ? diasEntre(dia, String(ultimo.dia).slice(0, 10)) : null
      if (sin !== null && !(DIAS_EN_QUE_SE_AVISA as readonly number[]).includes(sin)) { veredictos.push({ client_id: c.client_id, nombre: c.nombre, veredicto: 'sin_corrida_en_racha', dias_sin_corrida: sin }); continue }
      const f = await estadoFlujo()
      const estado = f.ok ? (f.activo ? 'el flujo está activo pero no dejó rastro: no disparó o murió a medias' : 'el flujo está INACTIVO') : `no pude leer el estado del flujo (${f.detalle.slice(0, 80)})`
      const racha = sin === null ? 'nunca ha corrido' : `${sin} día(s) sin corrida`
      const l = lineaDeNoCorrio(c.nombre, `hoy no hay corrida (${racha}; ${estado})`, wf)
      veredictos.push({ client_id: c.client_id, nombre: c.nombre, veredicto: 'no_corrio', linea: l, dias_sin_corrida: sin ?? undefined }); lineas.push(l)
    }
  }

  const body: Record<string, unknown> = { ok: lineas.length === 0, dry_run: dry, dia, clientes: veredictos, canal: CANAL_DE_ALERTAS, modelos_llamados: 0 }
  if (!lineas.length) return { status: 200, body }
  if (dry) return { status: 200, body: { ...body, nota: 'dry_run: no se avisó' } }
  // UNA línea por revisión (si hay varios clientes, se juntan en un solo mensaje)
  const texto = lineas.length === 1 ? lineas[0] : `${lineas[0]} (+${lineas.length - 1} más)`
  const av = deps.avisar ? await deps.avisar(texto, `no-corrio:${dia}${deps.corridaEsperada ? ':' + deps.corridaEsperada.toISOString().slice(11, 16) : ''}`).catch((e: unknown) => ({ ok: false, detalle: e instanceof Error ? e.message : String(e) })) : { ok: false, detalle: 'sin canal de aviso' }
  body.aviso = { ...av, texto }
  return { status: av.ok ? 200 : 502, body }
}
