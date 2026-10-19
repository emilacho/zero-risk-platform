/**
 * EL PULIDO DEL RESUMEN VIVO, EN SU PROPIO PASO (16-oct · firma de Emilio «calidad sobre precio») · POST /api/brain/alimentar/pulir
 * El pulido es una llamada a un agente (~100 s, hasta US$ 0,30): NO puede ir dentro de ④ (el 16-oct lo llevó a 152 s y lo cortó la plataforma). Corre DESPUÉS del cierre, como un paso aparte del flujo:
 *   · rearma el resumen vivo del cliente con el mismo código de siempre (fichas vivas del cliente + zona), lo pule con el agente (mismas guardas: no agrega hechos, cita obligatoria),
 *     y SOLO si el pulido sirve archiva la versión pulida (la anterior queda retirada con su motivo, nada se borra); si falla, se pasa del tope o del plazo, queda el resumen por código;
 *   · una vez por día y cliente (`ya_pulido_hoy`): una repetición o un reintento no paga dos veces; `forzar: true` lo repite;
 *   · no corre si el gasto de hoy + su tope pasaría el tope del portero; cuenta en el gasto del portero (el libro de invocaciones lo suma);
 *   · APAGADO por `PORTERO_RESUMEN_VIVO` + `PORTERO_RESUMEN_PULIDO`; `dry_run` obligatorio; real exige workflow_id + workflow_execution_id.
 */
import { cargarEntradaDelResumen, fichasDeResumen } from './resumen-vivo'
import { pulirResumen, AGENTE_DEL_PULIDO } from './resumen-pulido'
import { archivarFichasDeBrazos } from './brazos/archivo'
import { TOPE_DEL_PORTERO_USD, TOPE_DEL_PULIDO_APARTE_USD, type Interruptores } from './datos'
import { gastoDeHoy, validar, type Respuesta } from './rutas'
import { idDeZona, paisIsoDe } from '../cerebro/zona'

type Db = { from(tabla: string): any }
type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const esObjeto = (v: unknown): v is Fila => typeof v === 'object' && v !== null && !Array.isArray(v)
const err = (status: number, error: string, detalle: string): Respuesta => ({ status, body: { error, detalle } })

export interface DepsDePulir {
  db: Db
  interruptores: Interruptores
  /** el agente del roster por run-sdk (en pruebas, un molde); ausente en seco */
  pulirResumen?: (tarea: string, opciones?: { topeUsd?: number }) => Promise<{ texto: string; costo_usd: number }>
  ahora?: Date
  nuevoId?: () => string
}

export async function rutaPulir(deps: DepsDePulir, cuerpo: unknown): Promise<Respuesta> {
  const v = validar(cuerpo); if ('status' in v) return v
  if (!deps.interruptores.alimentar || !deps.interruptores.resumen_vivo || !deps.interruptores.resumen_pulido) return { status: 200, body: { apagado: true, detalle: 'el pulido está apagado (PORTERO_RESUMEN_VIVO y PORTERO_RESUMEN_PULIDO): no se leyó ni se escribió nada', modelos_llamados: 0 } }
  const ahora = deps.ahora ?? new Date()
  const forzar = v.cuerpo.forzar === true
  const cl = await deps.db.from('clients').select('*').eq('id', v.client_id).limit(1)
  if (cl.error) return err(502, 'lectura_fallida', `clients: ${cl.error.message}`)
  const cliente = lista(cl.data)[0]
  if (!cliente) return err(404, 'cliente_inexistente', 'no existe la ficha del cliente')

  const hoy = ahora.toISOString().slice(0, 10)

  const g = await gastoDeHoy(deps.db, v.client_id, ahora)
  if (!g.ok) return err(502, 'lectura_fallida', g.detalle)
  if (g.gasto.total_usd + TOPE_DEL_PULIDO_APARTE_USD > TOPE_DEL_PORTERO_USD) return { status: 200, body: { ok: true, pulido: { usado: false, motivo: `el gasto de hoy (US$ ${g.gasto.total_usd.toFixed(2)}) + el tope del pulido pasaría el tope del portero (US$ ${TOPE_DEL_PORTERO_USD}): queda el resumen por código`, costo_usd: 0 }, modelos_llamados: 0 } }

  const sd = await deps.db.from('client_sedes').select('id, ciudad, clave').eq('client_id', v.client_id)
  if (sd.error) return err(502, 'lectura_fallida', `client_sedes: ${sd.error.message}`)
  const iso = paisIsoDe(cliente.country ?? cliente.pais, cliente.market)
  const ent = await cargarEntradaDelResumen(deps.db, { config: cliente.config, client_id: v.client_id, nombre: (cliente.name as string | null) ?? null, rubro: (cliente.industry as string | null) ?? null, ahora, zonas: iso ? [idDeZona(iso)] : [], sedes: lista(sd.data).map((s) => ({ clave: String(s.clave ?? ''), ciudad: (s.ciudad as string | null) ?? null, id: s.id ? String(s.id) : undefined })).filter((s) => s.clave) })
  if (!ent.ok) return err(502, 'lectura_fallida', `resumen vivo: ${ent.detalle}`)
  const sal = fichasDeResumen(ent.entrada)

  // ¿ya pulido hoy? el pulido deja `pulido_por` en los datos de la ficha del resumen vigente
  // una vez por día: el resumen vigente ya pulido hoy no se vuelve a pagar (el pulido deja `pulido_por` en los datos de la ficha vigente)
  const marca = await deps.db.from('cerebro_fichas').select('id, provenance_tag, observado_en').eq('client_id', v.client_id).eq('clase', 'resumen_vivo').eq('atributo', sal.cliente.atributo).is('retirada_en', null).limit(5)
  if (marca.error) return err(502, 'lectura_fallida', `cerebro_fichas: ${marca.error.message}`)
  const pulidoHoy = lista(marca.data).some((f) => {
    const pt = esObjeto(f.provenance_tag) ? f.provenance_tag : {}
    const datos = esObjeto(pt.datos) ? pt.datos : {}
    return typeof datos.pulido_por === 'string' && String(f.observado_en ?? '').slice(0, 10) === hoy
  })
  if (pulidoHoy && !forzar) return { status: 200, body: { ok: true, ya_pulido_hoy: true, pulido: { usado: false, motivo: 'el resumen vigente ya se pulió hoy (forzar lo repite)', costo_usd: 0 }, modelos_llamados: 0 } }
  // ¿ya se INTENTÓ hoy? un pulido descartado (conservó < 80 % de las fichas, pasó el plazo o el tope) no deja marca en la ficha, y el reintento de la misma mañana pagaba otra vez
  // (medido 16-19 oct: 2 llamadas por día, US$ 0,37–0,64, y ninguna se archivó). El libro de invocaciones SÍ guarda todo intento, incluso el que n8n cortó por plazo.
  const intentos = await deps.db.from('agent_invocations').select('id, cost_usd, created_at, workflow_execution_id').eq('client_id', v.client_id).gte('created_at', `${hoy}T00:00:00.000Z`).limit(1000)
  if (intentos.error) return err(502, 'lectura_fallida', `agent_invocations: ${intentos.error.message}`)
  const hechos = lista(intentos.data).filter((f) => String(f.workflow_execution_id ?? '').endsWith(':resumen-pulido'))
  if (hechos.length && !forzar) return { status: 200, body: { ok: true, ya_intentado_hoy: true, pulido: { usado: false, motivo: `el pulido ya se intentó hoy (${hechos.length} vez/veces, US$ ${hechos.reduce((s, f) => s + (Number(f.cost_usd) || 0), 0).toFixed(2)}) y no quedó archivado: no se paga otra vez (forzar lo repite)`, costo_usd: 0 }, modelos_llamados: 0 } }

  if (v.dry_run || !deps.pulirResumen) return { status: 200, body: { ok: true, dry_run: v.dry_run, secciones: sal.secciones, huecos: sal.huecos, pulido: { usado: false, motivo: 'en seco: no se llama al agente ni se escribe', costo_usd: 0, tope_usd: TOPE_DEL_PULIDO_APARTE_USD }, modelos_llamados: 0 } }

  const t0 = Date.now()
  const pr = await pulirResumen(sal.texto_para_el_agente, { llamarAgente: deps.pulirResumen, topeUsd: TOPE_DEL_PULIDO_APARTE_USD }, sal.cliente.contenido)
  const pulido = { usado: pr.usado, motivo: pr.motivo, agente: pr.agente ?? AGENTE_DEL_PULIDO, costo_usd: pr.costo_usd, lineas_originales: pr.lineas_originales, lineas_conservadas: pr.lineas_conservadas, descartadas: pr.descartadas.length, citas_originales: pr.citas_originales, citas_conservadas: pr.citas_conservadas, tope_usd: TOPE_DEL_PULIDO_APARTE_USD, ms: Date.now() - t0 }
  const errores: string[] = []
  let escritas = 0
  if (pr.usado) {
    // otra `ref` (la del resumen por código del día ya existe): así se archiva como versión nueva que REEMPLAZA a la del día y no como «igual»
    sal.cliente.ref = `${sal.cliente.ref}:pulido`
    sal.cliente.contenido = pr.texto
    sal.cliente.datos = { ...(sal.cliente.datos ?? {}), pulido_por: pr.agente }
    const ar = await archivarFichasDeBrazos({ db: deps.db, fichas: [sal.cliente], ahora, dry_run: false, workflow_id: v.workflow_id, workflow_execution_id: v.workflow_execution_id, nuevoId: deps.nuevoId })
    escritas = ar.escritas
    errores.push(...ar.errores.map((m) => `resumen pulido: ${m}`))
  }
  return { status: 200, body: { ok: errores.length === 0, pulido, escritas, errores, modelos_llamados: 1 } }
}
