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
import type { Almacen, BriefCreativoGuardado, Campana, ConceptoGuardado, EsperaFila } from './almacen'
import { autorizarLlamada, cadena, compuerta, err, type Respuesta } from './autorizar'
import { hallazgosDelBrief, leerBriefCreativo } from './brief-creativo'
import { abrirAprobacionDelConcepto, insumosDelConcepto, MOTIVO_CAMBIOS_DE_EMILIO, objetoDeEsperaDeConcepto, siguienteDespuesDe, tandaQueEspera, TIPO_DE_ESPERA_DE_CONCEPTO } from './mesas'
import { resolverEsperas } from './nucleo'
import { insumosDesdeEstrategia, leerConcepto } from './conceptos'
import { textoParaLaCadena } from '../oficina/mesa/de-la-cadena'

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
  const leido = leerBriefCreativo(brief.texto_md, { planTexto: ctx.planTexto ?? '', prohibidas: ctx.forbiddenWords ?? [], duras: ctx.palabrasDuras, redes: (estr?.contenido.canales ?? []).filter((x) => x.rol !== 'no').map((x) => x.red), registro: ctx.registro })
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
    if (!(await al.actualizarBriefCreativoSi(c.id, brief.version, 'devuelta', { leido: leido as unknown as Record<string, unknown>, devolucion_texto: bloquea.map((b) => `- ${b}`).join('\n') }))) return { status: 200, cuerpo: { ya_revalidada: true, version: brief.version } }
    // 🟡 de CC7 (20:17Z): la vuelta atrás solo toca la campaña si ESTE pedido le escribió el motivo; si otro la movió, ni el motivo viejo se le pega
    let motivoEscrito = false
    try {
      if (!(await al.actualizarCampanaSi(c.id, 'necesita_humano', { estado_motivo: motivo }))) throw new Error('la campaña cambió de estado mientras se revalidaba')
      motivoEscrito = true
    } catch (e) {
      await al.actualizarBriefCreativo(c.id, brief.version, previo)
      if (motivoEscrito) await al.actualizarCampanaSi(c.id, 'necesita_humano', { estado_motivo: c.estado_motivo })
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

// ───────────────────────────────────────────────────────── la gran idea (09-nov · ALTO de Lenovo 21:56Z · preparado, NO se corre sin el «dale» de Emilio)
/**
 * REVALIDAR LA GRAN IDEA YA PAGADA · una versión del concepto que quedó `sin_mesa` POR EL LECTOR (`sin_concepto: …`) porque la entrega llevaba solo la integración
 * (sin las líneas de idea de los aportes) se rearma desde el LIBRO de su mesa con la entrega de hoy (`textoParaLaCadena` con las ideas de los aportes) y se vuelve a leer.
 * Sin modelo, sin mesa nueva, sin versión nueva: US$ 0.
 *  · Solo una versión `sin_mesa` cuyo motivo empieza con `sin_concepto:` (la dejó así el LECTOR) y que guarda su encargo. Una que venció por plazo o que la mesa cerró sin texto no se toca.
 *  · Las versiones POSTERIORES deben estar todas `sin_mesa` (frenadas o vacías): si alguna está abierta, lista o devolvió el brief, no se revalida. Y ninguna versión puede estar
 *    ya aprobada o esperando a Emilio.
 *  · El brief vigente debe estar `validada` (la gran idea se hizo sobre él).
 *  · La campaña: en `calendario`/`activa` (sigue como está) o en `necesita_humano` POR LA MESA DE CONCEPTO («no entregó concepto dos veces»): entonces vuelve a su estado de trabajo
 *    (la misma regla que el brief: tanda 1 → `calendario`; si no → `activa`) y se resuelven sus esperas de `necesita_humano`.
 *  · Si ahora se lee: la versión queda `lista` con aprobación `pendiente`, con su tarjeta «Gran idea» y su espera para Emilio (las MISMAS que abre una entrega). Revalidar NO aprueba
 *    nada: la decisión sigue siendo de Emilio. `conceptoVigente` hace que la cadena espere esa decisión en vez de abrir otra mesa.
 *  · Si sigue sin leerse: no escribe nada y devuelve los bloqueos de hoy.
 *  · Idempotente (sobre una versión ya `lista` → `ya_revalidada`), condicional (si otro pedido la movió, no escribe) y vuelve atrás si algo falla a medias. `ensayo: true` no escribe.
 */
export const MOTIVO_DE_CONCEPTO_SIN_LEER = /^sin_concepto:/
export const MOTIVO_DE_MESA_DE_CONCEPTO_AGOTADA = /^la mesa de concepto no entregó concepto dos veces/

export async function conceptoRevalidar(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const id = cadena(cuerpo.campana_id)
  if (!id) return err(400, 'E-CAMPOS', 'falta campana_id')
  if (!Number.isInteger(cuerpo.version) || (cuerpo.version as number) < 1) return err(400, 'E-CAMPOS', 'falta version (la versión del concepto que se revalida)')
  const version = cuerpo.version as number
  const c = await al.campana(id)
  if (!c) return err(404, 'E-CAMPANA', 'la campaña no existe')
  const noAut = await autorizarLlamada(al, cuerpo, c.client_id)
  if (noAut) return noAut
  const cerrada = await compuerta(al, c.client_id, c.seco)
  if (cerrada) return cerrada
  const todos = await al.conceptosDe(c.id)
  const fila = todos.find((k) => k.version === version)
  if (!fila) return err(404, 'E-SIN-CONCEPTO', `la campaña no tiene la versión ${version} del concepto`)
  if (fila.estado === 'lista') return { status: 200, cuerpo: { ya_revalidada: true, version, aprobacion: fila.aprobacion, campana: { estado: c.estado } } }
  if ((c as Campana & { archivada_en?: string | null }).archivada_en) return err(409, 'E-ARCHIVADA', 'la campaña está archivada: no se revalida')
  if (fila.estado !== 'sin_mesa') return err(409, 'E-NO-SIN-MESA', `la versión ${version} está ${fila.estado}: solo se revalida una sin_mesa`)
  if (!MOTIVO_DE_CONCEPTO_SIN_LEER.test(fila.motivo ?? '')) return err(409, 'E-NO-LA-DEJO-EL-LECTOR', `la versión ${version} no quedó sin_mesa por el lector (${String(fila.motivo ?? 'sin motivo').slice(0, 120)}): no se revalida`)
  if (!fila.encargo_id) return err(409, 'E-SIN-ENCARGO', 'la versión no guarda el encargo de su mesa: no hay libro que releer')
  const viva = todos.find((k) => k.version > version && k.estado !== 'sin_mesa')
  if (viva) return err(409, 'E-HAY-UNA-VERSION-POSTERIOR', `la versión ${viva.version} está ${viva.estado}: se revalida solo si todas las posteriores quedaron sin_mesa`)
  const decidida = todos.find((k) => k.aprobacion === 'aprobado' || (k.estado === 'lista' && k.aprobacion === 'pendiente'))
  if (decidida) return err(409, 'E-YA-HAY-GRAN-IDEA', `la versión ${decidida.version} ya está ${decidida.aprobacion === 'aprobado' ? 'aprobada' : 'esperando a Emilio'}: no se revalida otra`)
  const brief = await al.ultimoBriefCreativo(c.id)
  if (brief?.estado !== 'validada') return err(409, 'E-SIN-BRIEF', `el brief vigente está ${brief?.estado ?? 'ausente'}: la gran idea solo se revalida sobre un brief validado`)
  const sale = c.estado === 'necesita_humano'
  if (sale ? !MOTIVO_DE_MESA_DE_CONCEPTO_AGOTADA.test(c.estado_motivo ?? '') : c.estado !== 'calendario' && c.estado !== 'activa') {
    return err(409, 'E-NO-SE-REVALIDA', `una campaña ${c.estado} (${String(c.estado_motivo ?? '').slice(0, 120)}) no se revalida: solo calendario/activa o necesita_humano por la mesa de concepto`)
  }

  // el texto: el libro de SU mesa con la entrega de hoy · el MISMO lector y los MISMOS insumos que `recibirConcepto`
  const libro = await al.libroDeLaMesa(fila.encargo_id)
  const texto = textoParaLaCadena(libro, null, true)
  if (!texto.trim()) return err(409, 'E-SIN-LIBRO', `el libro de la mesa (${fila.encargo_id}) está vacío`)
  const ctx = await al.cargarContexto(c.client_id, c.plan_id)
  const leido = leerConcepto(texto, await insumosDelConcepto(al, c))
  const resumen = { ideas_en_el_banco: leido.banco.length, descartadas: leido.ideas_descartadas.length, capitulos: leido.capitulos.length, bloqueos: leido.bloqueos }
  if (leido.estado === 'sin_concepto') return { status: 200, cuerpo: { ...(cuerpo.ensayo === true ? { ensayo: true, escrituras: 0 } : {}), pasa: false, version, ...resumen, campana: { estado: c.estado } } }

  const tanda = await tandaQueEspera(al, c.id)
  const vuelveA = tanda === 1 ? 'calendario' as const : 'activa' as const
  const vivas: EsperaFila[] = sale ? (await al.esperasVivas()).filter((e) => e.campana_id === c.id && e.objeto_tipo === 'necesita_humano') : []
  const constancia = `revalidado por ${String(cuerpo.workflow_id ?? '?')} · ejecución ${String(cuerpo.workflow_execution_id ?? '?')} · ${ahora} · antes: ${String(fila.motivo).slice(0, 160)}`
  if (cuerpo.ensayo === true) {
    return { status: 200, cuerpo: { ensayo: true, escrituras: 0, pasa: true, version, ...resumen, haria: { concepto: 'lista · aprobación pendiente (tarjeta a Emilio)', campana: sale ? vuelveA : c.estado, esperas_que_se_resuelven: vivas.map((e) => ({ id: e.id, vence_en: e.vence_en })) } } }
  }
  const previoConcepto: Partial<ConceptoGuardado> = { estado: fila.estado, aprobacion: fila.aprobacion, texto_md: fila.texto_md, leido: fila.leido, motivo: fila.motivo }
  if (!(await al.actualizarConceptoSi(c.id, version, 'sin_mesa', { estado: 'lista', aprobacion: 'pendiente', texto_md: texto, leido: leido as unknown as Record<string, unknown>, motivo: constancia.slice(0, 500) }))) {
    return { status: 200, cuerpo: { ya_revalidada: true, version } }
  }
  let campanaMovida = false
  let campana: Campana = c
  try {
    if (sale) {
      const motivoNuevo = `gran idea v${version} revalidada con la entrega de hoy: espera a Emilio (${constancia})`.slice(0, 500)
      if (!(await al.actualizarCampanaSi(c.id, 'necesita_humano', { estado: vuelveA, estado_motivo: motivoNuevo }))) throw new Error('la campaña cambió de estado mientras se revalidaba')
      campanaMovida = true
      campana = { ...c, estado: vuelveA, estado_motivo: motivoNuevo }
      for (const e of vivas) await al.actualizarEspera(e.id, { estado: 'resuelta' })
    }
    await abrirAprobacionDelConcepto(al, campana, version, leido, fila.costo_usd ?? null, todos, ahora, ctx?.nombreDelNegocio ?? null)
  } catch (e) {
    await al.actualizarConcepto(c.id, version, previoConcepto)
    // 🟡 de CC7: la espera de aprobación pudo abrirse antes de que fallara la tarjeta; sin tarjeta no hay nada que recordarle a Emilio
    await resolverEsperas(al, c.id, TIPO_DE_ESPERA_DE_CONCEPTO, objetoDeEsperaDeConcepto(version), 'cancelada')
    if (campanaMovida) await al.actualizarCampanaSi(c.id, vuelveA, { estado: c.estado, estado_motivo: c.estado_motivo })
    for (const v of vivas) await al.actualizarEspera(v.id, { estado: 'viva' })
    throw e
  }
  return { status: 200, cuerpo: { pasa: true, version, ...resumen, campana: { estado: campana.estado }, esperas_resueltas: vivas.map((e) => e.id) } }
}
