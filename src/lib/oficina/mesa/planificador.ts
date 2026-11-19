/**
 * EL PLANIFICADOR DE LA MESA · puro. Lee el estado y el libro y dice qué sigue. NO define campos, largos ni orden de conversación: solo reparte turnos,
 * hace cumplir las cotas y exige que cada especialidad pertinente aporte (la única reja de Emilio: la PARTICIPACIÓN, no el formulario).
 *
 * Orden de decisión (la primera que se cumple):
 *  1. techo absoluto de gasto  → cierre por tope (nada gasta más)
 *  2. la dirección aún no abrió → turno de la dirección (leer manual → brief → plan, idea rectora, convocar)
 *  3. cotas agotadas (turnos o tope de la pieza) → «cierra con lo que hay»: una sola integración y a dibujar
 *  4. pedidos sin contestar (dentro de las cotas) → al portero: material; a un compañero: su turno
 *  5. especialistas pertinentes sin aporte → se les convoca
 *  5b. Sprint 4 · E · hay crítico y aportes nuevos sin criticar → turno de la crítica (una vez por ronda; nunca frena: si falla o no cabe, se integra igual)
 *  6. hay aportes nuevos desde la última integración → la dirección integra
 *  7. la integración no cita lo que usó/descartó → se le devuelve (máx. 1 vez)
 *  8. la pieza integrada pide imágenes generadas y hay ingeniero de prompts → su turno (Sprint 1 · mejora 4; también al «cerrar con lo que hay» si cabe bajo el techo)
 *  9. todo listo → traducir y dibujar
 */
import { especialistasPertinentes, direccionDe, ingenieroDePrompts } from './directorio'
import { aporteDePrompts, esAporteDePrompts } from './prompts'
import { criticaPendiente } from './critica'
import { esRellenoDelBanco, type RellenoPendiente } from './de-la-cadena'
import { idasYVueltas, participacion, pedidosSinContestar, verificarCitas } from './libro'
import { COTAS, profundidadMaximaDe, turnosMaximosDe, type Accion, type Aporte, type EstadoMesa, type TipoDePieza } from './tipos'

export interface ContextoDeLaMesa { gasto_usd: number; tope_usd: number; hayImagenGenerada: boolean; /** 18-nov · relleno del banco (CC1): el capítulo de la gran idea que no llega a su cuota (null/ausente = nada que rellenar) */ relleno_del_banco?: RellenoPendiente | null; /** 17-nov · GO Lenovo · la cota de la mesa (dato de la plantilla): lo gastado por sus turnos y lo permitido (cota × pasadas) */ cota_de_la_mesa?: { gastado: number; permitido: number }; /** 17-nov · T7b · lo que sigue es EXACTO (sale de los pasos de la plantilla, como en el video): la integración final tampoco pasa del TOPE (el motor frena en el tope, no en el techo; pasarlo cortaría el encargo después) */ techo_es_el_tope?: boolean; /** lo que queda por gastar DESPUÉS de la mesa; el calendario no dibuja ni pasa por la jefatura de la pieza: 0 */ reserva_posterior_usd?: number; /** 31-oct · la mesa de concepto: cuántas integraciones mínimas (rondas) antes de dar por buena la pieza; por omisión 1 (las demás mesas) */ rondas_minimas?: number; /** T8 · el tipo de pieza (el video reserva lo del brazo); sin él, carrusel/kit */ tipo?: TipoDePieza; /** 17-nov · «creativos en cada paso» · cuántas RONDAS de aportes tiene la mesa (dato `limites.rondas_de_la_mesa`): hechas esas integraciones, los especialistas ya no aportan ni contestan pedidos; la dirección sí cierra (citas, prompts, pregunta del traductor). Sin él, sin límite de rondas (lo de siempre) */ rondas_max?: number }

export const techoDe = (tope: number): number => +(tope * COTAS.TECHO_SOBRE_TOPE).toFixed(6)
const fallosDe = (libro: Aporte[], agente: string): number => libro.filter((a) => a.tipo === 'nota' && a.de === agente && a.texto.startsWith('turno_fallido')).length
const ultimaIntegracion = (libro: Aporte[]): Aporte | null => [...libro].reverse().find((a) => a.tipo === 'integra') ?? null

/** lo que la pieza todavía gastará después de la mesa (imagen + observador + jefatura; en el video, el brazo + la jefatura; en las mesas de la cadena, lo que diga `posterior`, 0): la mesa no puede gastárselo conversando */
export const reservaDeLoQueSigue = (hayImagenGenerada: boolean, posterior?: number, tipo?: TipoDePieza): number =>
  posterior !== undefined ? posterior : tipo === 'video' ? COTAS.RESERVA_DE_LO_QUE_SIGUE_VIDEO_USD : hayImagenGenerada ? COTAS.RESERVA_DE_LO_QUE_SIGUE_CON_IMAGEN_USD : COTAS.RESERVA_DE_LO_QUE_SIGUE_SIN_IMAGEN_USD

/** Sprint 1 · mejora 4 · ¿le toca al ingeniero de prompts? Solo con una integración hecha, una pieza que pide imágenes generadas, un ingeniero en el directorio congelado,
 * sin su texto posterior a esa integración y sin agotar sus reintentos. Devuelve su nombre o null */
export function ingenieroPendiente(est: EstadoMesa, libro: Aporte[], hayImagenGenerada: boolean): string | null {
  const ing = ingenieroDePrompts(est.directorio_congelado, est.tipo)
  if (!ing || !hayImagenGenerada || !ultimaIntegracion(libro)) return null
  if (aporteDePrompts(libro, ing.agente) || fallosDe(libro, ing.agente) >= COTAS.REINTENTOS_DE_TURNO) return null
  return ing.agente
}
const turnoDelIngeniero = (agente: string, motivo: string): Accion => ({ accion: 'turno', agente, tipo: 'redactar_prompts', responde_a: null, motivo })

/** ¿se agotó alguna cota que obliga a «cerrar con lo que hay»? devuelve la razón o null */
export function cotaAgotada(est: EstadoMesa, ctx: ContextoDeLaMesa): string | null {
  const maxTurnos = turnosMaximosDe(est.tipo)
  if (est.turnos >= maxTurnos) return `se usaron los ${maxTurnos} turnos de la mesa`
  // 17-nov · GO Lenovo · la cota de la mesa: un turno más (lo que se reserva por turno) no cabe en lo permitido → cierra con lo que hay (la integración usa esa reserva)
  const c = ctx.cota_de_la_mesa
  if (c && c.gastado + COTAS.RESERVA_POR_TURNO_USD > c.permitido + 1e-9) return `los turnos de la mesa llevan ${c.gastado.toFixed(2)} y uno más (${COTAS.RESERVA_POR_TURNO_USD}) pasa su cota (${c.permitido})`
  const siguiente = reservaDeLoQueSigue(ctx.hayImagenGenerada, ctx.reserva_posterior_usd, ctx.tipo ?? est.tipo)
  if (ctx.gasto_usd + COTAS.RESERVA_POR_TURNO_USD + siguiente > ctx.tope_usd) return `el gasto (${ctx.gasto_usd.toFixed(2)}) más la reserva de un turno (${COTAS.RESERVA_POR_TURNO_USD}) y de lo que sigue (${siguiente}) pasa el tope de la pieza (${ctx.tope_usd})`
  return null
}

/** los pedidos que SÍ pueden atenderse: dentro de la profundidad y de las idas y vueltas por pareja, a un agente activo que no esté agotado */
export function pedidosAtendibles(est: EstadoMesa, libro: Aporte[]): Aporte[] {
  const activos = new Set(est.directorio_congelado.filter((t) => t.activo).map((t) => t.agente))
  return pedidosSinContestar(libro).filter((p) => {
    if (!p.para || p.profundidad > profundidadMaximaDe(est.tipo)) return false
    if (!activos.has(p.para)) return false
    if (fallosDe(libro, p.para) >= COTAS.REINTENTOS_DE_TURNO) return false
    return idasYVueltas(libro, p.de, p.para) <= COTAS.MAX_IDAS_VUELTAS_POR_PAREJA
  })
}

export function siguienteDeLaMesa(est: EstadoMesa, libro: Aporte[], ctx: ContextoDeLaMesa): Accion {
  if (ctx.gasto_usd >= techoDe(ctx.tope_usd)) return { accion: 'cierre_por_tope', razon: 'techo_de_gasto' }
  const dir = direccionDe(est.directorio_congelado, est.tipo)
  if (!dir) throw new Error('la mesa no tiene dirección creativa en el directorio')
  const porteroNombre = est.directorio_congelado.find((t) => t.rol === 'portero' && t.activo)?.agente ?? null
  // el texto del ingeniero de prompts sobre la pieza integrada no es un «aporte nuevo» que obligue a integrar otra vez
  const ingeniero = ingenieroDePrompts(est.directorio_congelado, est.tipo)?.agente ?? null
  const esNuevo = (a: Aporte, ult: Aporte | null): boolean => ['aporta', 'responde', 'material'].includes(a.tipo) && (!ult || a.n > ult.n) && !esAporteDePrompts(a, ingeniero, ult) && !(a.tipo === 'aporta' && a.de === dir.agente && esRellenoDelBanco(a.texto))

  // 2 · la dirección abre
  if (!libro.some((a) => a.tipo === 'dirige')) {
    if (fallosDe(libro, dir.agente) >= COTAS.REINTENTOS_DE_TURNO) return { accion: 'seguir_a_dibujar', motivo: 'la dirección creativa no pudo abrir tras los reintentos' }
    return { accion: 'turno', agente: dir.agente, tipo: 'dirigir', responde_a: null, motivo: 'abrir la pieza' }
  }

  // 3 · cotas agotadas → una sola integración final y a dibujar
  const agotada = est.cierre_forzado ?? cotaAgotada(est, ctx)
  if (agotada) {
    const ult = ultimaIntegracion(libro)
    const hayAportesNuevos = libro.some((a) => esNuevo(a, ult))
    // la integración final puede pasar del tope (hasta el techo ×1,2), pero NUNCA se come lo que viene después: imagen, observador y jefatura también caben bajo el techo
    const puedeGastar = ctx.gasto_usd + COTAS.RESERVA_POR_TURNO_USD + reservaDeLoQueSigue(ctx.hayImagenGenerada, ctx.reserva_posterior_usd, ctx.tipo ?? est.tipo) <= (ctx.techo_es_el_tope ? ctx.tope_usd : techoDe(ctx.tope_usd))
    if ((!ult || hayAportesNuevos) && puedeGastar && fallosDe(libro, dir.agente) < COTAS.REINTENTOS_DE_TURNO && est.marcas.integracion_forzada !== true) {
      return { accion: 'turno', agente: dir.agente, tipo: 'integrar', responde_a: null, motivo: `cierra con lo que hay: ${agotada}` }
    }
    // la pieza ya está integrada: el ingeniero escribe los prompts si cabe bajo el techo (la imagen se va a generar igual; mejor con su instrucción)
    const ingP = ingenieroPendiente(est, libro, ctx.hayImagenGenerada)
    if (ingP && puedeGastar) return turnoDelIngeniero(ingP, `cierra con lo que hay: ${agotada} · prompts de la pieza integrada`)
    return { accion: 'seguir_a_dibujar', motivo: agotada }
  }

  // 17-nov · la mesa corta: con las rondas hechas, solo la dirección sigue (contesta lo que se le devolvió, integra, se le devuelven citas, el ingeniero escribe los prompts)
  const rondasHechas = typeof ctx.rondas_max === 'number' && ctx.rondas_max > 0 && libro.filter((a) => a.tipo === 'integra').length >= ctx.rondas_max

  // 4 · pedidos sin contestar
  const pend = pedidosAtendibles(est, libro).filter((p) => !rondasHechas || p.para === dir.agente)
  const alPortero = porteroNombre ? pend.find((p) => p.para === porteroNombre) : undefined
  if (alPortero) return { accion: 'material', pedido_id: alPortero.id, que: alPortero.texto, para_que: alPortero.texto, de: alPortero.de }
  const aUnCompanero = pend.find((p) => p.para !== porteroNombre)
  if (aUnCompanero) return { accion: 'turno', agente: aUnCompanero.para as string, tipo: 'responder', responde_a: aUnCompanero.id, motivo: `pedido de ${aUnCompanero.de}` }

  // 5 · especialidades pertinentes sin aporte
  // con rondas mínimas > 1, cada ronda pide el aporte de todos DE NUEVO: se cuenta la participación desde la última integración mientras falten rondas
  const rondasMin = ctx.rondas_minimas ?? 1
  const integrasHechas = libro.filter((a) => a.tipo === 'integra').length
  const ultInt = ultimaIntegracion(libro)
  const hizo = participacion(libro, ultInt && integrasHechas < rondasMin ? ultInt.n : 0)
  const faltan = rondasHechas ? [] : especialistasPertinentes(est.directorio_congelado, est.tipo, ctx.hayImagenGenerada, est.condiciones ?? []).filter((a) => !hizo[a] && fallosDe(libro, a) < COTAS.REINTENTOS_DE_TURNO)
  if (faltan.length) return { accion: 'turno', agente: faltan[0], tipo: 'aportar', responde_a: null, motivo: 'su especialidad es obligatoria en esta pieza' }

  // 5b · Sprint 4 · E · la CRÍTICA: con los aportes de la ronda hechos y antes de integrar, el estratega los confronta con los hechos y el plan (una vez por ronda).
  //   No es una reja: si falla, no cabe o no hay crítico, la mesa sigue igual (la dirección lo declara al integrar)
  const critico = criticaPendiente(est, libro, rondasHechas)
  if (critico) return { accion: 'turno', agente: critico, tipo: 'criticar', responde_a: null, motivo: 'la crítica confronta lo propuesto con los hechos y el plan antes de integrar' }

  // 6 · aportes nuevos desde la última integración → integra la dirección
  const ult = ultimaIntegracion(libro)
  const hayNuevos = libro.some((a) => esNuevo(a, ult))
  if (!ult || hayNuevos) {
    if (fallosDe(libro, dir.agente) >= COTAS.REINTENTOS_DE_TURNO) return { accion: 'seguir_a_dibujar', motivo: 'la dirección creativa no pudo integrar tras los reintentos' }
    return { accion: 'turno', agente: dir.agente, tipo: 'integrar', responde_a: null, motivo: ult ? 'hay aportes nuevos' : 'primera integración' }
  }

  // 7 · las citas de la integración (usó/descartó): la existencia y la cobertura las comprueba el código; la calidad, la jefatura
  const pertinentes = especialistasPertinentes(est.directorio_congelado, est.tipo, ctx.hayImagenGenerada, est.condiciones ?? [])
  const v = verificarCitas(ult.texto, libro, pertinentes)
  if (!v.ok && est.devoluciones_por_citas < COTAS.MAX_DEVOLUCIONES_POR_CITAS && fallosDe(libro, dir.agente) < COTAS.REINTENTOS_DE_TURNO) {
    return { accion: 'turno', agente: dir.agente, tipo: 'devolver_citas', responde_a: ult.id, motivo: 'faltan citas de aportes usados o descartados' }
  }

  // 7b · 18-nov · relleno del banco (CC1 · la (b) de Lenovo): con la gran idea integrada y sus citas al día, la dirección completa UN capítulo que no llega a la cuota del plan.
  //   Un turno por capítulo (de-la-cadena no lo vuelve a pedir) · solo si la cota no se agotó (el paso 3 ya cortó) · si la dirección falla los reintentos, la mesa entrega lo que hay
  const rp = ctx.relleno_del_banco
  if (rp && fallosDe(libro, dir.agente) < COTAS.REINTENTOS_DE_TURNO) return { accion: 'turno', agente: dir.agente, tipo: 'rellenar_banco', responde_a: ult.id, motivo: `el banco del capítulo ${rp.capitulo} no llega a la cuota: faltan ${rp.redes.reduce((n, x) => n + x.faltan, 0)}` }

  // 8 · Sprint 1 · mejora 4 · la pieza integrada pide imágenes generadas: el ingeniero de prompts traduce el concepto de cada una a la instrucción exacta del modelo
  const ingP = ingenieroPendiente(est, libro, ctx.hayImagenGenerada)
  if (ingP) return turnoDelIngeniero(ingP, 'la pieza integrada pide imágenes generadas: instrucción exacta para el modelo de imagen')

  return { accion: 'traducir' }
}
