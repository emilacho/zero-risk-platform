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
 *  6. hay aportes nuevos desde la última integración → la dirección integra
 *  7. la integración no cita lo que usó/descartó → se le devuelve (máx. 1 vez)
 *  8. todo listo → traducir y dibujar
 */
import { especialistasPertinentes, direccionDe } from './directorio'
import { idasYVueltas, participacion, pedidosSinContestar, verificarCitas } from './libro'
import { COTAS, type Accion, type Aporte, type EstadoMesa } from './tipos'

export interface ContextoDeLaMesa { gasto_usd: number; tope_usd: number; hayImagenGenerada: boolean; /** lo que queda por gastar DESPUÉS de la mesa; el calendario no dibuja ni pasa por la jefatura de la pieza: 0 */ reserva_posterior_usd?: number }

export const techoDe = (tope: number): number => +(tope * COTAS.TECHO_SOBRE_TOPE).toFixed(6)
const fallosDe = (libro: Aporte[], agente: string): number => libro.filter((a) => a.tipo === 'nota' && a.de === agente && a.texto.startsWith('turno_fallido')).length
const ultimaIntegracion = (libro: Aporte[]): Aporte | null => [...libro].reverse().find((a) => a.tipo === 'integra') ?? null

/** lo que la pieza todavía gastará después de la mesa (imagen + observador + jefatura): la mesa no puede gastárselo conversando */
export const reservaDeLoQueSigue = (hayImagenGenerada: boolean, posterior?: number): number => (posterior !== undefined ? posterior : hayImagenGenerada ? COTAS.RESERVA_DE_LO_QUE_SIGUE_CON_IMAGEN_USD : COTAS.RESERVA_DE_LO_QUE_SIGUE_SIN_IMAGEN_USD)

/** ¿se agotó alguna cota que obliga a «cerrar con lo que hay»? devuelve la razón o null */
export function cotaAgotada(est: EstadoMesa, ctx: ContextoDeLaMesa): string | null {
  if (est.turnos >= COTAS.MAX_TURNOS) return `se usaron los ${COTAS.MAX_TURNOS} turnos de la mesa`
  const siguiente = reservaDeLoQueSigue(ctx.hayImagenGenerada, ctx.reserva_posterior_usd)
  if (ctx.gasto_usd + COTAS.RESERVA_POR_TURNO_USD + siguiente > ctx.tope_usd) return `el gasto (${ctx.gasto_usd.toFixed(2)}) más la reserva de un turno (${COTAS.RESERVA_POR_TURNO_USD}) y de lo que sigue (${siguiente}) pasa el tope de la pieza (${ctx.tope_usd})`
  return null
}

/** los pedidos que SÍ pueden atenderse: dentro de la profundidad y de las idas y vueltas por pareja, a un agente activo que no esté agotado */
export function pedidosAtendibles(est: EstadoMesa, libro: Aporte[]): Aporte[] {
  const activos = new Set(est.directorio_congelado.filter((t) => t.activo).map((t) => t.agente))
  return pedidosSinContestar(libro).filter((p) => {
    if (!p.para || p.profundidad > COTAS.MAX_PROFUNDIDAD) return false
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

  // 2 · la dirección abre
  if (!libro.some((a) => a.tipo === 'dirige')) {
    if (fallosDe(libro, dir.agente) >= COTAS.REINTENTOS_DE_TURNO) return { accion: 'seguir_a_dibujar', motivo: 'la dirección creativa no pudo abrir tras los reintentos' }
    return { accion: 'turno', agente: dir.agente, tipo: 'dirigir', responde_a: null, motivo: 'abrir la pieza' }
  }

  // 3 · cotas agotadas → una sola integración final y a dibujar
  const agotada = est.cierre_forzado ?? cotaAgotada(est, ctx)
  if (agotada) {
    const ult = ultimaIntegracion(libro)
    const hayAportesNuevos = libro.some((a) => ['aporta', 'responde', 'material'].includes(a.tipo) && (!ult || a.n > ult.n))
    // la integración final puede pasar del tope (hasta el techo ×1,2), pero NUNCA se come lo que viene después: imagen, observador y jefatura también caben bajo el techo
    const puedeGastar = ctx.gasto_usd + COTAS.RESERVA_POR_TURNO_USD + reservaDeLoQueSigue(ctx.hayImagenGenerada, ctx.reserva_posterior_usd) <= techoDe(ctx.tope_usd)
    if ((!ult || hayAportesNuevos) && puedeGastar && fallosDe(libro, dir.agente) < COTAS.REINTENTOS_DE_TURNO && est.marcas.integracion_forzada !== true) {
      return { accion: 'turno', agente: dir.agente, tipo: 'integrar', responde_a: null, motivo: `cierra con lo que hay: ${agotada}` }
    }
    return { accion: 'seguir_a_dibujar', motivo: agotada }
  }

  // 4 · pedidos sin contestar
  const pend = pedidosAtendibles(est, libro)
  const alPortero = porteroNombre ? pend.find((p) => p.para === porteroNombre) : undefined
  if (alPortero) return { accion: 'material', pedido_id: alPortero.id, que: alPortero.texto, para_que: alPortero.texto, de: alPortero.de }
  const aUnCompanero = pend.find((p) => p.para !== porteroNombre)
  if (aUnCompanero) return { accion: 'turno', agente: aUnCompanero.para as string, tipo: 'responder', responde_a: aUnCompanero.id, motivo: `pedido de ${aUnCompanero.de}` }

  // 5 · especialidades pertinentes sin aporte
  const hizo = participacion(libro)
  const faltan = especialistasPertinentes(est.directorio_congelado, est.tipo, ctx.hayImagenGenerada).filter((a) => !hizo[a] && fallosDe(libro, a) < COTAS.REINTENTOS_DE_TURNO)
  if (faltan.length) return { accion: 'turno', agente: faltan[0], tipo: 'aportar', responde_a: null, motivo: 'su especialidad es obligatoria en esta pieza' }

  // 6 · aportes nuevos desde la última integración → integra la dirección
  const ult = ultimaIntegracion(libro)
  const hayNuevos = libro.some((a) => ['aporta', 'responde', 'material'].includes(a.tipo) && (!ult || a.n > ult.n))
  if (!ult || hayNuevos) {
    if (fallosDe(libro, dir.agente) >= COTAS.REINTENTOS_DE_TURNO) return { accion: 'seguir_a_dibujar', motivo: 'la dirección creativa no pudo integrar tras los reintentos' }
    return { accion: 'turno', agente: dir.agente, tipo: 'integrar', responde_a: null, motivo: ult ? 'hay aportes nuevos' : 'primera integración' }
  }

  // 7 · las citas de la integración (usó/descartó): la existencia y la cobertura las comprueba el código; la calidad, la jefatura
  const pertinentes = especialistasPertinentes(est.directorio_congelado, est.tipo, ctx.hayImagenGenerada)
  const v = verificarCitas(ult.texto, libro, pertinentes)
  if (!v.ok && est.devoluciones_por_citas < COTAS.MAX_DEVOLUCIONES_POR_CITAS && fallosDe(libro, dir.agente) < COTAS.REINTENTOS_DE_TURNO) {
    return { accion: 'turno', agente: dir.agente, tipo: 'devolver_citas', responde_a: ult.id, motivo: 'faltan citas de aportes usados o descartados' }
  }

  return { accion: 'traducir' }
}
