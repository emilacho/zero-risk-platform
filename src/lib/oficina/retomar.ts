/**
 * RETOMAR UNA PIEZA DESDE DONDE QUEDÓ · GO Lenovo 27-nov 18:25Z (decisión de Emilio: «no quiere pagar todo de nuevo: hay que RETOMAR, reusando lo ya pagado»).
 * Dos caminos, los dos por la ruta de turnos (`/api/oficina/turnos`, con la llave de la sala) y con sus guardas. Nada de SQL a mano. Ninguno decide por el dueño.
 *
 *  · REDIBUJAR (`redibujarPropuestas`) · la mesa ya escribió las propuestas de imagen y solo falló el DIBUJO (p. ej. el id de foto acortado, arreglado en #1287):
 *    el motor vuelve al paso del borrador sobre las MISMAS propuestas guardadas, sin otra ronda de mesa. Re-resuelve las fotos de cada propuesta con la regla de toda la
 *    oficina (`id-de-foto.ts`) para que la tarjeta muestre su origen. El borrador nuevo va a OTRA carpeta (`-d<n>`): la salida nueva nunca es la vieja.
 *    La segunda mirada ya opinó (una sola vez, `segunda-mirada.ts`): no vuelve a gastar. La pieza llega OTRA VEZ a la parada del dueño, que decide como siempre.
 *    Vale para una pieza que espera al dueño (su turno se cierra como reemplazado) o para una que cerró sin entregar (su tarjeta «SIN DIBUJAR» se cierra como reemplazada).
 *  · RETOMAR MESA CORTADA (`retomarMesaCortada`) · la mesa cerró porque sus últimos turnos se CORTARON sin vuelta (el vigía los dio por muertos), con una causa que ya se
 *    corrigió y que quien retoma DECLARA (`causa_corregida`): vuelve a `en_paso` con el MISMO libro. Una nota `turno_retomado` deja escrita la causa y desde ella los intentos
 *    de cada agente cuentan de cero (`planificador.ts`): lo pagado no se repite y el turno cortado se vuelve a pedir (fresco: el flujo de la oficina manda `force_restart`).
 *    Solo las mesas de la oficina: la de la gran idea de la cadena se reabre con `reanudar` (la cadena decide).
 * Las dos devuelven lo mismo que `avanzar` (la ruta despierta al flujo si hay un turno de empleado que esperar).
 */
import { datos } from './ayudas'
import { avanzar, plantillaDe, type Respuesta } from './orquestador'
import { fotoPorId } from './id-de-foto'
import { baseDeLaminas } from './orquestador-laminas'
import { ARTEFACTO_PROPUESTAS_IMAGEN, type PropuestaDeImagen, type PropuestasDeImagen } from './mesa/propuestas-imagen'
import { FUNCION_BORRADOR_IMAGEN } from './mesa/borrador-imagen'
import { estadoDeLaMesa, laminasConLaFotoResuelta } from './mesa/orquestador'
import { esNotaDeCorteSinVuelta, PREFIJO_TURNO_RETOMADO } from './mesa/causa-externa'
import { propuestaDeImagenAprobada, TURNO_DEL_DUENO } from './video/aprobacion'
import type { Encargo, Puertos } from './puertos'
import type { Estado } from './tipos'
import type { EstadoMesa } from './mesa/tipos'

const r = (status: number, cuerpo: Record<string, unknown>): Respuesta => ({ status, cuerpo })
/** las acciones de la ruta de turnos que RETOMAN una pieza: tras ellas, si hay un turno de empleado que esperar, la ruta despierta al flujo (aviso de CC2 26-nov 18:15Z) */
export const ACCIONES_QUE_RETOMAN = ['reanudar', 'redibujar', 'retomar'] as const
/** el motivo o la causa corregida se escriben: sin texto (o con uno de relleno) no se retoma */
export const MINIMO_DEL_MOTIVO = 10
const motivoValido = (m: unknown): string | null => (typeof m === 'string' && m.trim().length >= MINIMO_DEL_MOTIVO && m.trim().length <= 2000 ? m.trim() : null)

/** los estados de una pieza que terminó SIN entregar y se puede retomar */
const CERRADOS_RETOMABLES: readonly string[] = ['cerrado', 'cerrado_por_tope', 'fallido']

type FotoDelEncargo = { id: string; url?: string | null; tipo?: string | null }
/** las fotos propias del encargo: la MISMA fuente con que la mesa resolvió las propuestas al cerrar (`idsDeLasFotos(baseDeLaminas(...))` en `mesa/orquestador.ts`) */
const fotosDelEncargo = (e: Estado): FotoDelEncargo[] => {
  const fotos = (baseDeLaminas(e) as { F?: { fotos?: unknown } } | undefined)?.F?.fotos
  return Array.isArray(fotos) ? (fotos as FotoDelEncargo[]) : []
}

/** una propuesta con sus fotos re-resueltas (el id entero, regla de `id-de-foto.ts`) y el origen de la foto en cada lámina · pura */
export function propuestaConFotosResueltas(p: PropuestaDeImagen, fotos: ReadonlyArray<FotoDelEncargo>): PropuestaDeImagen {
  const art = (p.artefactos ?? {}) as Record<string, Record<string, unknown>>
  const vd = art.visual_direction
  const imagenes = Array.isArray(vd?.imagenes) ? (vd!.imagenes as Array<{ ref: string; modo: string; foto_id?: string }>) : null
  if (!imagenes) return p
  const resueltas = imagenes.map((i) => (i.modo === 'real' && i.foto_id ? { ...i, foto_id: fotoPorId(fotos, i.foto_id)?.id ?? i.foto_id } : i))
  const otros = { ...art, visual_direction: { ...vd, imagenes: resueltas } }
  return { ...p, artefactos: otros as PropuestaDeImagen['artefactos'], laminas: laminasConLaFotoResuelta(p.laminas, otros, fotos) }
}

/**
 * la tarjeta vieja de la pieza se cierra como reemplazada; sin puerto (y con tarjeta) no se retoma: quedarían dos tarjetas de la misma pieza.
 * GANA EL DUEÑO (🟡 CC6 a #1290): si la tarjeta ya no estaba pendiente (el dueño decidió en ese instante), no se retoma y no se toca nada · 409 `el_dueno_decidio`
 */
async function cerrarLaTarjetaVieja(P: Puertos, enc: Encargo, motivo: string): Promise<Respuesta | null> {
  if (!enc.hitl_queue_id) return null
  if (!P.cerrarTarjetaReemplazada) return r(409, { error: 'sin_puerto_de_la_bandeja', detalle: 'la pieza tiene una tarjeta y en este entorno no se puede cerrar como reemplazada: no se retoma' })
  const c = await P.cerrarTarjetaReemplazada({ hitl_id: enc.hitl_queue_id, motivo })
  if (!c.ok) return r(500, { error: 'bandeja', detalle: c.error })
  return c.cerrada ? null : r(409, { error: 'el_dueno_decidio', detalle: 'la tarjeta de la pieza ya no está pendiente (el dueño la decidió): no se retoma' })
}

/**
 * REDIBUJAR · `{ accion: 'redibujar', encargo_id, motivo }`. Guardas (409 con el porqué, sin tocar nada): hay propuestas de imagen (no de video), ninguna aprobada,
 * la plantilla tiene borrador, y la pieza o espera al dueño (ningún otro turno corriendo) o cerró sin entregar.
 */
export async function redibujarPropuestas(P: Puertos, encargoId: string, o: { motivo: unknown }): Promise<Respuesta> {
  const motivo = motivoValido(o.motivo)
  if (!motivo) return r(400, { error: 'entrada_invalida', detalle: `\`motivo\` debe decir por qué se redibuja (al menos ${MINIMO_DEL_MOTIVO} caracteres)` })
  const enc = await P.almacen.leerEncargo(encargoId)
  if (!enc) return r(404, { error: 'encargo_inexistente' })
  const e = enc.estado_del_motor
  const pi = datos(e, ARTEFACTO_PROPUESTAS_IMAGEN) as unknown as PropuestasDeImagen | undefined
  if (datos(e, 'propuestas_video')) return r(409, { error: 'es_video', detalle: 'redibujar es para las propuestas de imagen; un video se retoma desde su mesa' })
  if (!pi?.propuestas?.length) return r(409, { error: 'sin_propuestas', detalle: 'la pieza no tiene propuestas de imagen guardadas: no hay nada que redibujar' })
  if (propuestaDeImagenAprobada(e)) return r(409, { error: 'ya_aprobada', detalle: 'el dueño ya aprobó una propuesta: no se redibuja' })
  const pl = await plantillaDe(P, enc)
  const iBorrador = pl.pasos.findIndex((x) => x.tipo === 'codigo' && x.funcion === FUNCION_BORRADOR_IMAGEN)
  if (iBorrador < 1) return r(409, { error: 'sin_borrador', detalle: `la plantilla ${pl.tipo} no tiene paso de borrador` })
  const abierto = await P.almacen.turnoAbierto(enc.id)
  if (enc.estado === 'en_paso') {
    if (abierto?.tipo !== TURNO_DEL_DUENO) return r(409, { error: 'trabajando', detalle: abierto ? `hay un turno corriendo («${abierto.paso}»): se redibuja solo cuando la pieza espera al dueño` : 'la pieza está trabajando: se redibuja solo cuando espera al dueño o cerró' })
  } else if (CERRADOS_RETOMABLES.includes(enc.estado)) {
    if (abierto) return r(409, { error: 'trabajando', detalle: `hay un turno corriendo («${abierto.paso}»)` })
    if (datos(e, 'entrega')) return r(409, { error: 'ya_entregada', detalle: 'la pieza ya se entregó: se cambia con «Pedir cambios» desde su tarjeta' })
  } else {
    return r(409, { error: 'no_se_redibuja', detalle: `la pieza está «${enc.estado}»` })
  }
  const tarjeta = await cerrarLaTarjetaVieja(P, enc, `se redibuja: ${motivo}`)
  if (tarjeta) return tarjeta
  const fotos = fotosDelEncargo(e)
  const redibujo = Number(pi.redibujo ?? 0) + 1
  const antes = e.artefactos[ARTEFACTO_PROPUESTAS_IMAGEN]
  const nuevasPi: PropuestasDeImagen = { ...pi, propuestas: pi.propuestas.map((p) => propuestaConFotosResueltas(p, fotos)), redibujo, redibujado: { en: P.ahora().toISOString(), motivo } }
  const nuevo: Estado = {
    ...e,
    // el motor sigue desde el paso ANTERIOR al borrador: el próximo es el borrador, sobre las propuestas guardadas
    ultimo: iBorrador - 1,
    // el turno del dueño que se cierra ocupa su número: el borrador toma el siguiente
    pasos_ejecutados: e.pasos_ejecutados + (abierto ? 1 : 0),
    artefactos: { ...e.artefactos, [ARTEFACTO_PROPUESTAS_IMAGEN]: { version: (antes?.version ?? 0) + 1, version_consumida: antes?.version_consumida ?? 0, datos: nuevasPi as unknown as Record<string, unknown> } },
  }
  await P.almacen.guardar({
    encargo_id: enc.id, estado_del_motor: nuevo, gasto_usd: e.gasto_usd, estado: 'en_paso', con_desacuerdo: false, ...(enc.hitl_queue_id ? { hitl_queue_id: null } : {}),
    ...(abierto ? { turno: { ...abierto, estado: 'muerto' as const, error: `reemplazado: se redibuja (${motivo})` } } : {}),
  })
  return avanzar(P, enc.id)
}

/**
 * RETOMAR MESA CORTADA · `{ accion: 'retomar', encargo_id, causa_corregida }`. Guardas (409 con el porqué, sin tocar nada): la pieza cerró sin entregar, tiene mesa, no es
 * de la cadena, y el ÚLTIMO aporte de su libro es un corte sin vuelta («turno_fallido: sin vuelta en N min»). Un cierre normal o una falla del agente no se retoma.
 */
export async function retomarMesaCortada(P: Puertos, encargoId: string, o: { causa_corregida: unknown }): Promise<Respuesta> {
  const causa = motivoValido(o.causa_corregida)
  if (!causa) return r(400, { error: 'entrada_invalida', detalle: `\`causa_corregida\` debe decir qué causa del corte se corrigió (al menos ${MINIMO_DEL_MOTIVO} caracteres)` })
  const enc = await P.almacen.leerEncargo(encargoId)
  if (!enc) return r(404, { error: 'encargo_inexistente' })
  const e = enc.estado_del_motor
  const est = estadoDeLaMesa(e)
  if (!est) return r(409, { error: 'sin_mesa', detalle: 'la pieza no tiene mesa: no hay libro que retomar' })
  if (!P.mesa) return r(500, { error: 'mesa_sin_puerto' })
  if (!CERRADOS_RETOMABLES.includes(enc.estado)) return r(409, { error: 'no_esta_cerrada', detalle: `la pieza está «${enc.estado}»: una mesa en pausa se retoma con «reanudar»` })
  if ((enc.sala_ref as { tipo_de_mesa?: unknown } | null)?.tipo_de_mesa) return r(409, { error: 'de_la_cadena', detalle: 'una mesa de la cadena se reabre con «reanudar» (la cadena decide)' })
  if (datos(e, 'entrega')) return r(409, { error: 'ya_entregada', detalle: 'la pieza ya se entregó: no se retoma su mesa' })
  if (await P.almacen.turnoAbierto(enc.id)) return r(409, { error: 'trabajando', detalle: 'hay un turno corriendo' })
  const libro = await P.mesa.libro(enc.id)
  const ult = libro[libro.length - 1]
  if (!ult || !esNotaDeCorteSinVuelta(ult)) return r(409, { error: 'no_cerro_por_un_corte', detalle: 'el último aporte del libro no es un turno cortado sin vuelta: la mesa cerró por su camino y no se retoma' })
  const tarjeta = await cerrarLaTarjetaVieja(P, enc, `se retoma la mesa: ${causa}`)
  if (tarjeta) return tarjeta
  const nota = await P.mesa.aportar({ encargo_id: enc.id, de: 'oficina-creativa', para: null, tipo: 'nota', texto: `${PREFIJO_TURNO_RETOMADO}: ${causa}`, refs: [], responde_a: null, profundidad: 0, costo_usd: 0, workflow_execution_id: null })
  if (!nota.ok) return r(500, { error: 'libro', detalle: nota.error })
  const marcas: EstadoMesa['marcas'] = { ...est.marcas, retomada_tras_corte: Number(est.marcas.retomada_tras_corte ?? 0) + 1 }
  const est2: EstadoMesa = { ...est, fase: 'trabajando', pausa_externa: null, cierre_forzado: null, turno_abierto: null, reanudada_en: P.ahora().toISOString(), marcas }
  const antes = e.artefactos.mesa
  const nuevo: Estado = { ...e, artefactos: { ...e.artefactos, mesa: { version: (antes?.version ?? 0) + 1, version_consumida: antes?.version_consumida ?? 0, datos: est2 as unknown as Record<string, unknown> } } }
  await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: nuevo, gasto_usd: e.gasto_usd, estado: 'en_paso', con_desacuerdo: false, ...(enc.hitl_queue_id ? { hitl_queue_id: null } : {}) })
  return avanzar(P, enc.id)
}
