/**
 * /api/cadena/campanas · abrir · avanzar · cierre (diseño v2 §3.4, §3.7, condición 6 de CC#3).
 */
import type { Almacen, Campana, EstadoCampana } from './almacen'
import { autorizarLlamada, cadena, compuerta, err, leerSeco, type Respuesta } from './autorizar'
import { arrancarAlActivar, type ResultadoDelArranque } from './arranque'
import { DIAS_DE_CAMPANA, DIAS_MAXIMOS_DE_CAMPANA, medidaDeCampana, SEMANAS_DE_TANDA } from './constantes'
import { esFechaIso, fechaInicioPorRegla, sumarDias } from './fechas'
import { ventanaDelPlan } from './fechas-en-texto'
import { nuevoOrdenEncendido } from './mesas'
import { abrirEsperaDe, cancelarEsperasDeCampana, ponerNecesitaHumano, resolverEsperas } from './nucleo'

// r75 · 'cadena_apagada': con la cadena apagada la puerta ya NO reenvía al brief viejo (un solo camino de briefs): deja el plan guardado, anota que no se generan briefs y cierra el viaje con este resultado
export const RESULTADOS_DE_CABLE = ['cadena_abierta', 'lote_briefeado', 'necesita_humano', 'plan_no_coincide', 'pasarela_ok', 'cadena_apagada'] as const

const TRANSICIONES: Record<EstadoCampana, EstadoCampana[]> = {
  abierta: ['estrategia', 'necesita_humano', 'cerrada'],
  estrategia: ['calendario', 'necesita_humano', 'cerrada'],
  calendario: ['activa', 'necesita_humano', 'cerrada'],
  activa: ['necesita_humano', 'pausada', 'cerrada'],
  necesita_humano: ['estrategia', 'calendario', 'activa', 'pausada', 'cerrada'],
  pausada: ['activa', 'necesita_humano', 'cerrada'],
  cerrada: [],
  reemplazada: [],
}
export const transicionValida = (de: EstadoCampana, a: EstadoCampana): boolean => TRANSICIONES[de]?.includes(a) ?? false

export async function abrirCampana(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const clientId = cadena(cuerpo.client_id)
  if (!clientId) return err(400, 'E-CLIENT-ID', 'falta client_id')
  const s = leerSeco(cuerpo)
  if (!s.ok) return s.r
  // 01-nov · firma de Emilio: la campaña puede pedir su propia medida; sin pedirla, la de siempre
  const dias = cuerpo.dias_de_campana ?? DIAS_DE_CAMPANA, semanasDeTanda = cuerpo.semanas_de_tanda ?? SEMANAS_DE_TANDA
  if (!Number.isInteger(dias) || (dias as number) < 1 || (dias as number) > DIAS_MAXIMOS_DE_CAMPANA) return err(400, 'E-DIAS-DE-CAMPANA', `dias_de_campana debe ser un entero entre 1 y ${DIAS_MAXIMOS_DE_CAMPANA}`)
  if (!Number.isInteger(semanasDeTanda) || (semanasDeTanda as number) < 1) return err(400, 'E-SEMANAS-DE-TANDA', 'semanas_de_tanda debe ser un entero mayor que 0')
  const noAut = await autorizarLlamada(al, cuerpo, clientId)
  if (noAut) return noAut
  const cerrada = await compuerta(al, clientId, s.seco)
  if (cerrada) return cerrada

  // el plan debe existir y ser de ESTE cliente; si no coincide se cierra sin escribir nada
  const plan = await al.resolverPlan(clientId, cadena(cuerpo.plan_id))
  if (!plan) return { status: 409, cuerpo: { error: 'plan_no_coincide', resultado: 'plan_no_coincide', code: 'E-PLAN-NO-COINCIDE', detalle: 'el plan no existe, no es un plan de 90 días o es de otro cliente: no se escribió nada' } }

  // idempotencia: el mismo sobre dos veces no abre dos campañas
  const ya = await al.campanaPorPlan(clientId, plan.plan_id, s.seco)
  // 🔴 #464 C5a (CC#3): reenviar el sobre de un plan YA REEMPLAZADO no «tiene éxito»: lo dice, y no abre ni revive nada
  if (ya && ya.estado === 'reemplazada') return err(409, 'E-PLAN-REEMPLAZADO', 'este plan ya fue reemplazado por uno más nuevo: no se abre nada', { campana: ya })
  if (ya) {
    // 09-nov · E: una campaña que SIGUE ARMANDO y llega por un viaje NUEVO de la sala (la reapertura deja un sobre nuevo) contesta a ESE viaje: el cable de vuelta sale de `sala_ref`
    const nuevoRef = typeof cuerpo.sala_ref === 'object' && cuerpo.sala_ref ? (cuerpo.sala_ref as Record<string, unknown>) : null
    const armando = ya.estado === 'abierta' || ya.estado === 'estrategia' || ya.estado === 'calendario'
    if (armando && nuevoRef && cadena(nuevoRef._journey_id) && nuevoRef._journey_id !== ya.sala_ref?._journey_id) {
      return { status: 200, cuerpo: { ya_abierta: true, campana: await al.actualizarCampana(ya.id, { sala_ref: nuevoRef }) } }
    }
    return { status: 200, cuerpo: { ya_abierta: true, campana: ya } }
  }

  // r74 · F4 · antes de armar el contexto, las sedes y su horario se llenan SOLAS con lo que el sistema ya guardó del cliente (con su fuente); si el negocio no tiene sede, no pasa nada y su calendario no se frena
  // 🔴 r75 (nota A.4-1 de CC#3): la recolección ESCRIBE en `client_sedes` y `client_sede_datos` → en SECO no se recolecta (un ensayo no cambia datos reales del cliente); se usa lo que ya haya guardado
  const sedesRec = s.seco
    ? { ok: true, sedes: 0, error: undefined as string | undefined, omitida: true }
    : await al.recolectarSedes(clientId).catch((e: unknown) => ({ ok: false, sedes: 0, error: e instanceof Error ? e.message : String(e), omitida: false }))
  const ctx = await al.cargarContexto(clientId, plan.plan_id)
  if (!ctx) return err(409, 'E-CONTEXTO', 'no se pudo armar el contexto del cliente (plan o manual ilegibles)')

  // 🔴 condición 6 (CC#3): un plan NUEVO del mismo cliente reemplaza a la campaña anterior; el sobre nuevo no cae como «duplicado»
  const viva = await al.campanaViva(clientId, s.seco)
  let reemplaza: string | null = null
  if (viva) {
    await al.actualizarCampana(viva.id, { estado: 'reemplazada', estado_motivo: `reemplazada por el plan ${plan.plan_id}` })
    reemplaza = viva.id
  }
  // 🔴 #464 C5b/C5c (CC#3): reemplazar y luego insertar no es atómico. Si la inserción falla se DEVUELVE la campaña anterior a como estaba (el cliente nunca se queda sin campaña viva
  //    por un error nuestro); si falló porque OTRO sobre igual ganó la carrera (único del plan), se contesta «ya abierta», no un 500.
  const devolverLaViva = async () => { if (viva) await al.actualizarCampana(viva.id, { estado: viva.estado, estado_motivo: viva.estado_motivo }) }

  // fecha de inicio por regla: días hábiles solo si hay feriados nacionales VERIFICADOS (porque algún cliente los declaró); si no, corridos con aviso
  const nacionales = ctx.pais ? (await al.fechasEspeciales(ctx.pais, [], plan.fecha, sumarDias(plan.fecha, 30))).filter((f) => f.estado === 'verificada' && f.alcance === 'nacional') : []
  const ini = fechaInicioPorRegla(plan.fecha, nacionales.length ? new Set(nacionales.map((f) => f.fecha)) : null)
  // 09-nov · D (firma de Emilio, regla de sistema): la campaña HEREDA la ventana que declara el plan aprobado (día 1 y duración). Sin ventana legible en el plan,
  // o si quien abre pide su propia medida (`dias_de_campana`), la regla de siempre (primer lunes + la medida).
  const ventana = ventanaDeLaCampana(ctx.planTexto, ini.fecha, dias as number, cuerpo.dias_de_campana !== undefined)
  let nueva: Campana
  try { nueva = await al.insertarCampana({
    client_id: clientId, plan_id: plan.plan_id, fecha_inicio: ventana.fecha_inicio, fecha_inicio_origen: ventana.origen, fecha_fin: ventana.fecha_fin, ...(semanasDeTanda === SEMANAS_DE_TANDA ? {} : { semanas_de_tanda: semanasDeTanda as number }),
    zona_horaria: ctx.zonaHoraria, pais: ctx.pais, sedes: ctx.sedes.map((x) => x.clave), estado: 'abierta', estado_motivo: [ventana.origen === 'plan' ? null : ini.aviso,ctx.sedes.length === 0 ? 'sin sede declarada: no se comprueba si el local está abierto' : null, ctx.zonaHorariaOrigen === 'sin_dato' ? 'zona horaria sin dato: hay que preguntarla' : null, sedesRec.ok ? null : 'no se pudieron leer las sedes: ' + String(sedesRec.error ?? 'sin detalle').slice(0, 80)].filter((x): x is string => !!x).join(' · ') || null,
    presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: (await al.leerConfig('autoproducir_por_omision')) === true,
    sala_ref: typeof cuerpo.sala_ref === 'object' && cuerpo.sala_ref ? (cuerpo.sala_ref as Record<string, unknown>) : {}, reemplaza_a: reemplaza, seco: s.seco,
  }) } catch (e) {
    const duplicado = (e as { code?: string })?.code === '23505' || /23505|duplicate key|un_plan/i.test(String((e as Error)?.message ?? ''))
    const ganadora = duplicado ? await al.campanaPorPlan(clientId, plan.plan_id, s.seco) : null
    // si OTRO sobre igual ganó la carrera, ÉL ya reemplazó a la anterior: no se la devuelve a la vida (habría dos vivas)
    if (ganadora) return { status: 200, cuerpo: { ya_abierta: true, campana: ganadora } }
    await devolverLaViva()
    throw e
  }
  // la campaña reemplazada ya no existe para el vigía: sus esperas (la fecha de inicio, la bandeja, lo que investigaba…) se cancelan TODAS
  if (viva) await cancelarEsperasDeCampana(al, viva.id)
  // la fecha del PLAN ya la aprobó Emilio con el plan: no es una propuesta que tenga que quedar firme (solo la de la regla lo es)
  if (ventana.origen === 'regla') await abrirEsperaDe(al, nueva, 'fecha_inicio_propuesta', nueva.id, 'la fecha de inicio calculada por regla queda firme el día anterior', ahora, { fechaInicio: nueva.fecha_inicio })
  return { status: 201, cuerpo: { campana: nueva, aviso_fecha_inicio: ventana.origen === 'regla' ? ini.aviso : null, ventana_origen: ventana.origen, reemplaza_a: reemplaza } }
}

/**
 * D · la ventana de una campaña: la del plan si la declara (y nadie pidió otra medida), si no la de la regla. Pura: la usan abrir y reabrir.
 */
export function ventanaDeLaCampana(planTexto: string, inicioPorRegla: string, diasPorRegla: number, medidaPedida: boolean): { fecha_inicio: string; fecha_fin: string; origen: 'plan' | 'regla'; dias: number } {
  const delPlan = medidaPedida ? null : ventanaDelPlan(planTexto)
  if (delPlan) return { fecha_inicio: delPlan.desde, fecha_fin: delPlan.hasta, origen: 'plan', dias: delPlan.dias }
  return { fecha_inicio: inicioPorRegla, fecha_fin: sumarDias(inicioPorRegla, diasPorRegla - 1), origen: 'regla', dias: diasPorRegla }
}

/** el día de hoy en la zona de la campaña (`YYYY-MM-DD`): «el día en que se reabre» es el del cliente, no el de UTC */
export function hoyEnZona(ahora: string, zona: string | null | undefined): string {
  try { return new Intl.DateTimeFormat('en-CA', { timeZone: zona || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ahora)) } catch { return ahora.slice(0, 10) }
}

/** E · desde dónde se puede reabrir: una campaña detenida (`necesita_humano`) o en pausa. Las demás, no. */
export const ESTADOS_QUE_SE_REABREN: readonly EstadoCampana[] = ['necesita_humano', 'pausada']
/** el sobre que deja la reapertura: el MISMO que deja planeación al terminar el plan (la sala lo despacha a la puerta en modo «abrir», que retoma la campaña que sigue armando) */
export interface SobreDePlan {
  source: 'planeacion/plan-listo'; intent: 'briefear'
  payload: { client_id: string; plan_id: string; dry_run: boolean; desde_worker: 'cadena/reabrir'; campana_id: string }
  idempotency_key: string; logical_period: string; tenant_id: string; client_id: string
}
export const llaveDeReapertura = (campanaId: string, fechaInicio: string): string => `${campanaId}:reabrir:${fechaInicio}`

/**
 * E (09-nov · firma de Emilio, regla de sistema) · REABRIR una campaña en el mismo lugar: la misma fila, el mismo plan.
 *  · parte de `necesita_humano` o `pausada`;
 *  · día 1 = el día en que se reabre (en la zona del cliente) o la `fecha_inicio` que se pida; origen `emilio`; dura lo que dura el plan (su ventana; sin ventana, lo que ya medía la campaña);
 *  · cierra TODAS sus esperas vivas; queda `abierta` y deja UN sobre nuevo en la sala: la puerta retoma la estrategia (lo ya validado no se repite);
 *  · idempotente (el mismo pedido otra vez contesta `ya_reabierta` y no escribe) y, si algo falla o el sobre no entra, vuelve atrás (campaña y esperas como estaban);
 *  · `ensayo: true` dice qué haría sin escribir nada (el seco).
 * No gasta: lo que sigue gasta con sus topes.
 */
export async function reabrirCampana(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const id = cadena(cuerpo.campana_id)
  if (!id) return err(400, 'E-CAMPOS', 'falta campana_id')
  const pedida = cuerpo.fecha_inicio
  if (pedida !== undefined && !esFechaIso(pedida)) return err(400, 'E-FECHA-INICIO', 'fecha_inicio debe ser YYYY-MM-DD')
  const c = await al.campana(id)
  if (!c) return err(404, 'E-CAMPANA', 'la campaña no existe')
  const noAut = await autorizarLlamada(al, cuerpo, c.client_id)
  if (noAut) return noAut
  const cerrada = await compuerta(al, c.client_id, c.seco)
  if (cerrada) return cerrada
  const fechaInicio = (pedida as string | undefined) ?? hoyEnZona(ahora, c.zona_horaria)
  // idempotencia: ya reabierta con ESE día 1 y sigue armando → no se escribe nada otra vez
  if (c.fecha_inicio_origen === 'emilio' && c.fecha_inicio === fechaInicio && (c.estado === 'abierta' || c.estado === 'estrategia' || c.estado === 'calendario')) {
    return { status: 200, cuerpo: { ya_reabierta: true, campana: c } }
  }
  if (!ESTADOS_QUE_SE_REABREN.includes(c.estado)) return err(409, 'E-NO-SE-REABRE', `una campaña ${c.estado} no se reabre: solo ${ESTADOS_QUE_SE_REABREN.join(' o ')}`)
  if ((c as Campana & { archivada_en?: string | null }).archivada_en) return err(409, 'E-ARCHIVADA', 'la campaña está archivada: no se reabre')
  // 🔴 ADENDA de riesgos (punto 4): mover el día 1 de una campaña que YA armó algo dejaría sus filas, su brief o su gran idea con las fechas viejas. La reapertura
  //    es para la campaña que se detuvo ANTES de tener nada propio: con algo ya hecho, se niega y no se toca nada (ni se duplica, ni se borra, ni se vuelve a publicar).
  const yaTiene = [
    ['validada', 'aprobada'].includes(String((await al.ultimaEstrategia(c.id))?.estado)) ? 'una estrategia validada' : null,
    (await al.filas(c.id)).length ? 'filas de calendario' : null,
    (await al.briefsDe(c.id)).length ? 'un brief creativo' : null,
    (await al.conceptosDe(c.id)).length ? 'una gran idea' : null,
  ].filter((x): x is string => !!x)
  if (yaTiene.length) return err(409, 'E-YA-ARMADA', `la campaña ya tiene ${yaTiene.join(', ')}: reabrirla correría su día 1 debajo de lo hecho; no se reabre`)
  const ctx = await al.cargarContexto(c.client_id, c.plan_id)
  if (!ctx) return err(409, 'E-CONTEXTO', 'no se pudo leer el plan de la campaña')
  const dias = ventanaDelPlan(ctx.planTexto)?.dias ?? medidaDeCampana(c).dias
  if (!Number.isInteger(dias) || dias < 1 || dias > DIAS_MAXIMOS_DE_CAMPANA) return err(409, 'E-DIAS-DE-CAMPANA', `la duración del plan (${dias} días) no es una medida de campaña`)
  const fechaFin = sumarDias(fechaInicio, dias - 1)
  const vivas = (await al.esperasVivas()).filter((e) => e.campana_id === c.id)
  const sobre: SobreDePlan = {
    source: 'planeacion/plan-listo', intent: 'briefear',
    payload: { client_id: c.client_id, plan_id: c.plan_id, dry_run: c.seco === true, desde_worker: 'cadena/reabrir', campana_id: c.id },
    idempotency_key: llaveDeReapertura(c.id, fechaInicio), logical_period: `reabrir:${fechaInicio}`, tenant_id: c.client_id, client_id: c.client_id,
  }
  const motivo = `reabierta por Emilio: día 1 ${fechaInicio}, ${dias} días (hasta ${fechaFin}); antes ${c.estado}${c.estado_motivo ? ` · ${c.estado_motivo.slice(0, 200)}` : ''}`.slice(0, 500)
  const haria = { fecha_inicio: fechaInicio, fecha_fin: fechaFin, dias, origen: 'emilio' as const, esperas_que_se_cierran: vivas.map((e) => ({ id: e.id, tipo: e.objeto_tipo, vence_en: e.vence_en })), sobre }
  if (cuerpo.ensayo === true) return { status: 200, cuerpo: { ensayo: true, escrituras: 0, campana_antes: { estado: c.estado, fecha_inicio: c.fecha_inicio, fecha_fin: c.fecha_fin, origen: c.fecha_inicio_origen }, haria } }

  const antes = { estado: c.estado, estado_motivo: c.estado_motivo, fecha_inicio: c.fecha_inicio, fecha_fin: c.fecha_fin, fecha_inicio_origen: c.fecha_inicio_origen }
  const volverAtras = async () => {
    await al.actualizarCampana(c.id, antes)
    for (const e of vivas) await al.actualizarEspera(e.id, { estado: 'viva' })
  }
  let n: Campana
  let r: Awaited<ReturnType<Almacen['emitirSobre']>>
  try {
    n = await al.actualizarCampana(c.id, { estado: 'abierta', estado_motivo: motivo, fecha_inicio: fechaInicio, fecha_fin: fechaFin, fecha_inicio_origen: 'emilio' })
    for (const e of vivas) await al.actualizarEspera(e.id, { estado: 'cancelada' })
    r = await al.emitirSobre(sobre)
  } catch (e) { await volverAtras(); throw e }
  if (r.resultado === 'rechazado') {
    await volverAtras()
    return err(502, 'E-SOBRE-RECHAZADO', `la sala no aceptó el sobre: se volvió atrás (${String(r.detalle ?? 'sin detalle').slice(0, 200)})`)
  }
  return { status: 200, cuerpo: { reabierta: true, campana: n, esperas_cerradas: vivas.map((e) => e.id), sobre: { resultado: r.resultado, event_id: r.event_id ?? null } } }
}

export async function avanzarCampana(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const id = cadena(cuerpo.campana_id)
  const a = cadena(cuerpo.a) as EstadoCampana | null
  if (!id || !a) return err(400, 'E-CAMPOS', 'faltan campana_id o a')
  const c = await al.campana(id)
  if (!c) return err(404, 'E-CAMPANA', 'la campaña no existe')
  const noAut = await autorizarLlamada(al, cuerpo, c.client_id)
  if (noAut) return noAut
  const cerrada = await compuerta(al, c.client_id, c.seco)
  if (cerrada) return cerrada
  if (!transicionValida(c.estado, a)) return err(409, 'E-TRANSICION', `una campaña ${c.estado} no puede pasar a ${a}`)
  if (a === 'necesita_humano') {
    const r = await ponerNecesitaHumano(al, c, cadena(cuerpo.motivo) ?? 'sin motivo', ahora)
    return { status: 200, cuerpo: { campana: r.campana, alerta: r.alerta } }
  }
  if (c.estado === 'necesita_humano') await resolverEsperas(al, c.id, 'necesita_humano')
  const n = await al.actualizarCampana(id, { estado: a, estado_motivo: cadena(cuerpo.motivo) })
  if (a === 'cerrada') await cancelarEsperasDeCampana(al, c.id) // una campaña cerrada no deja relojes vivos
  if (a === 'pausada') await abrirEsperaDe(al, n, 'campana_pausada', n.id, 'campaña pausada: se revisa en el resumen semanal', ahora, {}, `pausa:${n.id}:${ahora.slice(0, 10)}`)
  if (c.estado === 'pausada') await resolverEsperas(al, c.id, 'campana_pausada')
  // arranque por evento (20-oct · parte 3): al activarse, los lotes vencidos salen ya (apagado por omisión; un fallo se declara y el reloj lo recoge)
  const arranque: ResultadoDelArranque | null = a === 'activa' ? await arrancarAlActivar(al, n, ahora) : null
  return { status: 200, cuerpo: { campana: n, ...(arranque && arranque.arranque !== 'apagado' ? { arranque } : {}) } }
}

/**
 * El cable de vuelta a la sala lo arma LA PUERTA con su `worker_id` fijo (no `$workflow.id` de un sub-flujo): así la sala rotula el viaje como BRIEF.
 * Con campaña, el viaje sale de su `sala_ref`; sin campaña (p. ej. `plan_no_coincide`: no se abrió nada) sale del propio pedido (`client_id` + `journey_id`),
 * y el viaje se comprueba contra la sala igual que en cualquier otra llamada.
 */
export async function cierreDeCampana(al: Almacen, cuerpo: Record<string, unknown>): Promise<Respuesta> {
  const id = cadena(cuerpo.campana_id)
  const resultado = cadena(cuerpo.resultado)
  if (!resultado) return err(400, 'E-CAMPOS', 'falta resultado')
  if (!(RESULTADOS_DE_CABLE as readonly string[]).includes(resultado)) return err(400, 'E-RESULTADO', 'resultado debe ser uno de ' + RESULTADOS_DE_CABLE.join(' | '))
  let clientId: string | null, journey: string | null, correlacion: string | null
  if (id) {
    const c = await al.campana(id)
    if (!c) return err(404, 'E-CAMPANA', 'la campaña no existe')
    clientId = c.client_id
    journey = cadena(c.sala_ref._journey_id)
    correlacion = cadena(c.sala_ref._sala_correlation_id)
  } else {
    clientId = cadena(cuerpo.client_id)
    journey = cadena(cuerpo.journey_id)
    correlacion = cadena(cuerpo.sala_correlation_id)
    if (!clientId) return err(400, 'E-CAMPOS', 'sin campana_id hacen falta client_id y journey_id')
  }
  const noAut = await autorizarLlamada(al, cuerpo, clientId)
  if (noAut) return noAut
  const puerta = cadena(await al.leerConfig('puerta_workflow_id'))
  if (!puerta) return err(503, 'E-PUERTA-SIN-ID', 'falta cadena_config.puerta_workflow_id: sin él el cable no puede llevar el worker_id de la puerta')
  if (!journey) return { status: 200, cuerpo: { payload_cable: null, motivo: 'no viene de un viaje de la sala (nada a quien contestar)' } }
  if (!id && !(await al.journeyExiste(journey, clientId))) return err(403, 'E-VIAJE', 'el viaje no existe para este cliente en la sala')
  return {
    status: 200,
    // r73 · el receptor de la sala (`parseCallbackBody`) exige event_type «run_completed», tenant_id (uuid) y ts: sin ellos el cable salía «invalid_event_type» y el flujo moría en CABLE_DE_VUELTA_MUDO
    cuerpo: { payload_cable: { event_type: 'run_completed', worker_id: puerta, worker_name: 'cadena', _journey_id: journey, _sala_correlation_id: correlacion, tenant_id: clientId, client_id: clientId, ts: new Date().toISOString(), resultado, ...(id ? { campana_id: id } : {}) } },
  }
}
export type { Campana }

// ─────────────────────────────────────────────────────────────── lo que la puerta y el vigía necesitan saber (solo lecturas)

/** El modo efectivo de la puerta para un cliente: `pasarela` (reenvía a la parte original, neutral) o `cadena`. Depende SOLO del interruptor, no del `seco` del pedido. */
export async function estadoDeLaCadena(al: Almacen, cuerpo: Record<string, unknown>): Promise<Respuesta> {
  const clientId = cadena(cuerpo.client_id)
  if (!clientId) return err(400, 'E-CLIENT-ID', 'falta client_id')
  const noAut = await autorizarLlamada(al, cuerpo, clientId)
  if (noAut) return noAut
  const estado = await al.leerConfig('estado_cadena')
  const lista = await al.leerConfig('clientes_ensayo')
  const admitido = estado === 'encendida' || (estado === 'ensayo' && Array.isArray(lista) && lista.includes(clientId))
  return { status: 200, cuerpo: { estado_cadena: estado ?? 'apagada', admitido, modo: admitido ? 'cadena' : 'pasarela' } }
}

/** El viaje de la sala existe para ESTE cliente (la puerta lo comprueba antes de hacer nada: la sala no firma el cuerpo). */
export async function verificarViaje(al: Almacen, cuerpo: Record<string, unknown>): Promise<Respuesta> {
  const clientId = cadena(cuerpo.client_id), journey = cadena(cuerpo.journey_id)
  if (!clientId || !journey) return err(400, 'E-CAMPOS', 'faltan client_id o journey_id')
  const noAut = await autorizarLlamada(al, cuerpo, clientId)
  if (noAut) return noAut
  return { status: 200, cuerpo: { existe: await al.journeyExiste(journey, clientId) } }
}

/** Las campañas que el vigía recorre: las activas (con su `seco`, para que un ensayo se recorra en seco). */
export async function campanasActivas(al: Almacen, cuerpo: Record<string, unknown>): Promise<Respuesta> {
  const wf = cadena(cuerpo.workflow_id), ex = cadena(cuerpo.workflow_execution_id)
  if (!wf || !ex) return err(400, 'E-WORKFLOW-CTX', 'la llamada necesita workflow_id y workflow_execution_id (los dos, siempre)')
  const flujos = await al.leerConfig('flujos')
  if (!(Array.isArray(flujos) && flujos.includes(wf))) return err(403, 'E-WORKFLOW-DESCONOCIDO', 'solo lo llama un flujo de la cadena')
  const estado = await al.leerConfig('estado_cadena')
  const lista = await al.leerConfig('clientes_ensayo')
  // 31-oct (nuevo orden): el vigía también ve las campañas que esperan la gran idea ANTES de la primera tanda (estado `calendario`), SOLO con la palanca encendida para su cliente
  const enCalendario: Campana[] = []
  for (const c of (await al.campanasEnArmado()).filter((x) => x.estado === 'calendario')) if (await nuevoOrdenEncendido(al, c.client_id)) enCalendario.push(c)
  const todas = [...(await al.campanasActivas()), ...enCalendario]
  const visibles = todas.filter((c) => c.seco || estado === 'encendida' || (estado === 'ensayo' && Array.isArray(lista) && lista.includes(c.client_id)))
  return { status: 200, cuerpo: { campanas: visibles.map((c) => ({ id: c.id, client_id: c.client_id, seco: c.seco, sala_ref: c.sala_ref })) } }
}
