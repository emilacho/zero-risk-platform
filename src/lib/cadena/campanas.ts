/**
 * /api/cadena/campanas · abrir · avanzar · cierre (diseño v2 §3.4, §3.7, condición 6 de CC#3).
 */
import type { Almacen, Campana, EstadoCampana } from './almacen'
import { autorizarLlamada, cadena, compuerta, err, leerSeco, type Respuesta } from './autorizar'
import { DIAS_DE_CAMPANA } from './constantes'
import { fechaInicioPorRegla, sumarDias } from './fechas'
import { abrirEsperaDe, cancelarEsperasDeCampana, ponerNecesitaHumano, resolverEsperas } from './nucleo'

export const RESULTADOS_DE_CABLE = ['cadena_abierta', 'lote_briefeado', 'necesita_humano', 'plan_no_coincide', 'pasarela_ok'] as const

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
  if (ya) return { status: 200, cuerpo: { ya_abierta: true, campana: ya } }

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
  let nueva: Campana
  try { nueva = await al.insertarCampana({
    client_id: clientId, plan_id: plan.plan_id, fecha_inicio: ini.fecha, fecha_inicio_origen: 'regla', fecha_fin: sumarDias(ini.fecha, DIAS_DE_CAMPANA - 1),
    zona_horaria: ctx.zonaHoraria, pais: ctx.pais, sedes: ctx.sedes.map((x) => x.clave), estado: 'abierta', estado_motivo: ini.aviso,
    presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false,
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
  await abrirEsperaDe(al, nueva, 'fecha_inicio_propuesta', nueva.id, 'la fecha de inicio calculada por regla queda firme el día anterior', ahora, { fechaInicio: nueva.fecha_inicio })
  return { status: 201, cuerpo: { campana: nueva, aviso_fecha_inicio: ini.aviso, reemplaza_a: reemplaza } }
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
  return { status: 200, cuerpo: { campana: n } }
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
    cuerpo: { payload_cable: { worker_id: puerta, _journey_id: journey, _sala_correlation_id: correlacion, client_id: clientId, resultado, ...(id ? { campana_id: id } : {}) } },
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
  const todas = await al.campanasActivas()
  const visibles = todas.filter((c) => c.seco || estado === 'encendida' || (estado === 'ensayo' && Array.isArray(lista) && lista.includes(c.client_id)))
  return { status: 200, cuerpo: { campanas: visibles.map((c) => ({ id: c.id, client_id: c.client_id, seco: c.seco, sala_ref: c.sala_ref })) } }
}
