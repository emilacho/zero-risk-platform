/**
 * REVALIDAR LO YA ESCRITO (09-nov · GO de Lenovo, opción B firmada por Emilio 19:11Z · regla de sistema, no solo Náufrago)
 *
 * Cuando el verificador se arregla, una pieza que devolvió EN FALSO no se rehace: se le vuelve a pasar el verificador publicado HOY sobre el texto ya guardado.
 * v1 cubre el brief creativo (el mismo molde sirve después para la gran idea y la estrategia). Sin modelo, sin mesa nueva, sin versión nueva: US$ 0.
 *
 *  · Solo se revalida lo que devolvió EL VERIFICADOR: la última versión `devuelta` cuyo `leido` guardado tiene bloqueos. Una devolución por cambios de Emilio
 *    o por la mesa de la gran idea (el brief estaba validado: su `leido` no tiene bloqueos) NO se toca.
 *  · Solo si la campaña está en `necesita_humano` POR ESE BRIEF (su motivo lo dice): si se detuvo por otra cosa, revalidar el brief no la saca de ahí.
 *  · Si ahora pasa: la versión queda `validada`, la campaña vuelve a su estado de trabajo (tanda 1 → `calendario`; si no → `activa`, la misma regla que
 *    `retomarSiSoloFaltanCantidades`) y se resuelven sus esperas de `necesita_humano`. La respuesta trae `siguiente` (el mismo sobre que da una entrega);
 *    si nadie lo despacha, el reloj de la cadena (cada 30 min) vuelve a entrar por `calendario/siguiente`.
 *  · Si sigue sin pasar: queda `devuelta` con los bloqueos de hoy y la campaña sigue en `necesita_humano` con el motivo nuevo. La espera viva NO se rehace
 *    (su plazo no se corre). Si los bloqueos son los mismos, no se escribe nada.
 *  · Idempotente (otra vez sobre una versión ya validada → `ya_revalidada`, sin escribir) y vuelve atrás si algo falla a medias. `ensayo: true` no escribe.
 *  · No aprueba nada que espere a Emilio: la gran idea sigue yendo a su tarjeta.
 */
import type { Almacen, BriefCreativoGuardado, Campana, EsperaFila } from './almacen'
import { autorizarLlamada, cadena, compuerta, err, type Respuesta } from './autorizar'
import { hallazgosDelBrief, leerBriefCreativo } from './brief-creativo'
import { MOTIVO_CAMBIOS_DE_EMILIO, siguienteDespuesDe, tandaQueEspera } from './mesas'

/** los dos motivos con los que la cadena detiene una campaña por un brief que el VERIFICADOR devolvió (mesas.ts: `recibirBrief` y `briefAbrir`) */
export const MOTIVO_DE_BRIEF_DEVUELTO = /^el brief creativo (se devolvió por código|ya se devolvió)/

const bloqueosDe = (leido: Record<string, unknown> | null): string[] => {
  const b = (leido as { bloqueos?: unknown } | null)?.bloqueos
  return Array.isArray(b) ? b.map(String) : []
}

export async function briefRevalidar(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const id = cadena(cuerpo.campana_id)
  if (!id) return err(400, 'E-CAMPOS', 'falta campana_id')
  const c = await al.campana(id)
  if (!c) return err(404, 'E-CAMPANA', 'la campaña no existe')
  const noAut = await autorizarLlamada(al, cuerpo, c.client_id)
  if (noAut) return noAut
  const cerrada = await compuerta(al, c.client_id, c.seco)
  if (cerrada) return cerrada
  const brief = await al.ultimoBriefCreativo(c.id)
  if (!brief) return err(409, 'E-SIN-BRIEF', 'la campaña no tiene brief creativo')
  // idempotencia: lo que ya se revalidó (o ya estaba validado) contesta sin escribir
  if (brief.estado === 'validada') return { status: 200, cuerpo: { ya_revalidada: true, version: brief.version, campana: { estado: c.estado } } }
  if ((c as Campana & { archivada_en?: string | null }).archivada_en) return err(409, 'E-ARCHIVADA', 'la campaña está archivada: no se revalida')
  if (c.estado !== 'necesita_humano') return err(409, 'E-NO-SE-REVALIDA', `una campaña ${c.estado} no se revalida: solo necesita_humano`)
  if (!MOTIVO_DE_BRIEF_DEVUELTO.test(c.estado_motivo ?? '')) return err(409, 'E-OTRO-MOTIVO', `la campaña no se detuvo por un brief devuelto por el verificador (${String(c.estado_motivo ?? 'sin motivo').slice(0, 120)}): revalidar el brief no la saca de ahí`)
  if (brief.estado !== 'devuelta') return err(409, 'E-NO-DEVUELTA', `la última versión del brief está ${brief.estado}: solo se revalida una devuelta`)
  if (brief.motivo === MOTIVO_CAMBIOS_DE_EMILIO) return err(409, 'E-CAMBIOS-DE-EMILIO', 'la devolvió Emilio con cambios: no es un falso rojo, no se toca')
  // caso 1 de CC7: la mesa de la gran idea (la DIRECCIÓN) también deja el brief `devuelta` (recibirConcepto · `brief_devuelto`, motivo null); su juicio no se anula
  if ((await al.conceptosDe(c.id)).some((k) => k.estado === 'brief_devuelto' && (k.brief_devuelto ?? '').trim() === (brief.devolucion_texto ?? '').trim())) return err(409, 'E-LA-DEVOLVIO-LA-DIRECCION', 'la devolvió la mesa de la gran idea: es un juicio de la dirección, no un falso rojo del verificador')
  if (!bloqueosDe(brief.leido).length) return err(409, 'E-NO-LA-DEVOLVIO-EL-VERIFICADOR', 'la versión no tiene bloqueos del verificador guardados (la devolvió una persona o una mesa): no se revalida')
  if (!brief.texto_md) return err(409, 'E-SIN-TEXTO', 'la versión devuelta no tiene texto guardado')
  const estr = await al.ultimaEstrategia(c.id)
  if (!['validada', 'aprobada'].includes(String(estr?.estado))) return err(409, 'E-SIN-ESTRATEGIA', 'la campaña no tiene estrategia validada')
  const ctx = await al.cargarContexto(c.client_id, c.plan_id)
  if (!ctx) return err(409, 'E-CONTEXTO', 'no se pudo leer el plan de la campaña')

  // el MISMO verificador y los MISMOS insumos que `recibirBrief`
  const leido = leerBriefCreativo(brief.texto_md, { planTexto: ctx.planTexto ?? '', prohibidas: ctx.forbiddenWords ?? [], duras: ctx.palabrasDuras, redes: (estr?.contenido.canales ?? []).filter((x) => x.rol !== 'no').map((x) => x.red) })
  const bloquea = hallazgosDelBrief(leido).filter((h) => h.severidad === 'bloquea').map((h) => h.ficha.que)
  const antes = { bloqueos: bloqueosDe(brief.leido) }
  // caso 4 de CC7: la campaña no guarda dónde estaba antes de `necesita_humano`; se usa la misma regla con que la cadena retoma sola (pasos.ts · retomar): tanda 1 → calendario
  const tanda = await tandaQueEspera(al, c.id)
  const vuelveA = tanda === 1 ? 'calendario' as const : 'activa' as const
  const vivas: EsperaFila[] = (await al.esperasVivas()).filter((e) => e.campana_id === c.id && e.objeto_tipo === 'necesita_humano')
  // caso 3 de CC7: constancia de quién, cuándo y por qué se había devuelto (en el motivo de la campaña)
  const constancia = `revalidado por ${String(cuerpo.workflow_id ?? '?')} · ejecución ${String(cuerpo.workflow_execution_id ?? '?')} · ${ahora}`

  if (bloquea.length) {
    const igual = bloquea.length === antes.bloqueos.length && bloquea.every((b, i) => b === antes.bloqueos[i])
    const motivo = `el brief creativo se devolvió por código dos veces: ${bloquea.slice(0, 3).join(' · ')} (${constancia})`.slice(0, 500)
    if (cuerpo.ensayo === true || igual) return { status: 200, cuerpo: { ...(cuerpo.ensayo === true ? { ensayo: true, escrituras: 0 } : {}), pasa: false, version: brief.version, bloqueos: bloquea, sin_cambios: igual, campana: { estado: c.estado } } }
    const previo: Partial<BriefCreativoGuardado> = { leido: brief.leido, devolucion_texto: brief.devolucion_texto }
    try {
      if (!(await al.actualizarBriefCreativoSi(c.id, brief.version, 'devuelta', { leido: leido as unknown as Record<string, unknown>, devolucion_texto: bloquea.map((b) => `- ${b}`).join('\n') }))) return { status: 200, cuerpo: { ya_revalidada: true, version: brief.version } }
      if (!(await al.actualizarCampanaSi(c.id, 'necesita_humano', { estado_motivo: motivo }))) throw new Error('la campaña cambió de estado mientras se revalidaba')
    } catch (e) {
      await al.actualizarBriefCreativo(c.id, brief.version, previo)
      await al.actualizarCampana(c.id, { estado_motivo: c.estado_motivo })
      throw e
    }
    return { status: 200, cuerpo: { pasa: false, version: brief.version, bloqueos: bloquea, campana: { estado: 'necesita_humano', estado_motivo: motivo } } }
  }

  const motivoNuevo = `brief v${brief.version} revalidado con el verificador de hoy: ya no bloquea (${constancia}) · se había devuelto por: ${antes.bloqueos.slice(0, 2).join(' · ')}`.slice(0, 500)
  if (cuerpo.ensayo === true) {
    return { status: 200, cuerpo: { ensayo: true, escrituras: 0, pasa: true, version: brief.version, bloqueos_antes: antes.bloqueos, haria: { brief: 'validada', campana: vuelveA, esperas_que_se_resuelven: vivas.map((e) => ({ id: e.id, vence_en: e.vence_en })) } } }
  }
  const previoBrief: Partial<BriefCreativoGuardado> = { estado: brief.estado, leido: brief.leido, devolucion_texto: brief.devolucion_texto }
  const previoCampana = { estado: c.estado, estado_motivo: c.estado_motivo }
  // caso 2 de CC7: escrituras CONDICIONALES · si otro pedido ganó la carrera, este no escribe (un solo cambio de campaña, un solo sobre)
  if (!(await al.actualizarBriefCreativoSi(c.id, brief.version, 'devuelta', { estado: 'validada', leido: leido as unknown as Record<string, unknown>, devolucion_texto: null }))) {
    return { status: 200, cuerpo: { ya_revalidada: true, version: brief.version } }
  }
  let campanaMovida = false
  try {
    if (!(await al.actualizarCampanaSi(c.id, 'necesita_humano', { estado: vuelveA, estado_motivo: motivoNuevo }))) throw new Error('la campaña cambió de estado mientras se revalidaba')
    campanaMovida = true
    for (const e of vivas) await al.actualizarEspera(e.id, { estado: 'resuelta' })
  } catch (e) {
    await al.actualizarBriefCreativo(c.id, brief.version, previoBrief)
    if (campanaMovida) await al.actualizarCampanaSi(c.id, vuelveA, previoCampana)
    for (const v of vivas) await al.actualizarEspera(v.id, { estado: 'viva' })
    throw e
  }
  return { status: 200, cuerpo: { pasa: true, version: brief.version, bloqueos_antes: antes.bloqueos, campana: { estado: vuelveA }, esperas_resueltas: vivas.map((e) => e.id), ...(await siguienteDespuesDe(al, c.id)) } }
}
