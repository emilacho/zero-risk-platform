/**
 * manual-cambios (GASTA) · 02-nov · pedido por Emilio: pedir cambios al manual funciona como en el plan. El pedido queda en `plan_cambios` con `documento='manual'` y se despierta
 * la reescritura, que trabaja sobre la versión vigente. Si el flujo no se pudo despertar, nada se gastó y la misma puerta se repite.
 * Sin tope de vueltas: las versiones del manual también suben con cada edición; cada pedido es un clic del dueño y lleva su tope.
 */
import { TOPE_DEL_TEXTO_DEL_DUENO } from '../../limites-de-tamano'
import { CAMPOS } from '../../manual/campos-del-manual'
import { camposDelDueno, camposQueLibera } from '../../manual/pedido-de-cambios'
import { confirmarGasto, esObjeto, rechazo, textoEntre, UUID, type Fila, type Manejador } from './comun'

/** provisional: por encima de lo estimado (US$ 1,5 a 3). Se revisa con la primera corrida real */
export const TOPE_PEDIDO_AL_MANUAL_USD = 5
export const CAMINO_MANUAL_CAMBIOS = 'zero-risk/manual-cambios'
const ABIERTOS = ['pendiente', 'en_reescritura']

const borradorDe = (contenido: unknown): Fila => {
  try {
    const c = typeof contenido === 'string' ? (JSON.parse(contenido) as unknown) : contenido
    return esObjeto(c) && esObjeto(c.brand_book_draft) ? c.brand_book_draft : {}
  } catch { return {} }
}

export const manualCambios: Manejador = async ({ db, ahora }, { cuerpo, reviewer }) => {
  if (typeof cuerpo.client_id !== 'string' || !UUID.test(cuerpo.client_id)) return rechazo(400, 'entrada_invalida', '`client_id` debe ser un uuid')
  const client_id = cuerpo.client_id
  const texto = textoEntre(cuerpo.texto, 5, TOPE_DEL_TEXTO_DEL_DUENO)
  const toca = { client_id, comentario: texto }
  if (!texto) return rechazo(400, 'entrada_invalida', `\`texto\` (qué debe cambiar) debe tener de 5 a ${TOPE_DEL_TEXTO_DEL_DUENO} caracteres`, toca)
  const seccion = cuerpo.seccion === undefined || cuerpo.seccion === null || cuerpo.seccion === '' ? null : textoEntre(cuerpo.seccion, 1, 80)
  if (cuerpo.seccion && !seccion) return rechazo(400, 'entrada_invalida', '`seccion` debe tener hasta 80 caracteres', toca)
  // el panel nombra los campos por su clave corta o por la del borrador, como en editar y validar
  const pedidos = cuerpo.campos === undefined || cuerpo.campos === null ? [] : cuerpo.campos
  const campos = Array.isArray(pedidos) ? pedidos.map((c) => CAMPOS.find((x) => x.clave === c || x.clave_del_tablero === c)?.clave) : null
  if (!campos || campos.includes(undefined)) return rechazo(400, 'entrada_invalida', '`campos` debe ser una lista de campos del manual', toca)
  const g = confirmarGasto(cuerpo, TOPE_PEDIDO_AL_MANUAL_USD)
  if (!g.ok) return { ...g.salida, toca }

  const v = await db.from('client_brand_books').select('id, content_text').eq('client_id', client_id).order('version', { ascending: false }).limit(1)
  if (v.error) return rechazo(500, 'manual_error', v.error.message, toca)
  const vigente = ((v.data as Fila[] | null) ?? [])[0]
  if (!vigente) return rechazo(404, 'sin_manual', 'el cliente todavía no tiene manual', toca)
  const manual_id = String(vigente.id)
  const t = { ...toca, output_id: manual_id }

  const a = await db.from('plan_cambios').select('id, estado, despertado').eq('client_id', client_id).eq('documento', 'manual').in('estado', ABIERTOS).limit(1)
  if (a.error) return rechazo(500, 'manual_error', a.error.message, t)
  const abierto = ((a.data as Fila[] | null) ?? [])[0]
  const colgado = abierto?.estado === 'pendiente' && abierto.despertado === false
  if (abierto && !colgado) return rechazo(409, 'reescritura_en_curso', 'ya hay un pedido de cambios sobre este manual: espera la versión nueva', t)

  const validados = camposDelDueno(borradorDe(vigente.content_text)._field_meta)
  const liberados = camposQueLibera({ delDueno: validados, texto, campos: campos as string[] })
  const hora = ahora().toISOString()
  const datos = { manual_id, texto, seccion, campos_liberados: liberados, pedido_por: reviewer, tope_usd: g.tope, actualizado_en: hora }
  let cambioId: string
  if (colgado) {
    const u = await db.from('plan_cambios').update({ ...datos, despertado: null, despertar_detalle: null, creado_en: hora }).eq('id', abierto.id).eq('estado', 'pendiente').eq('despertado', false).select('id')
    if (u.error) return rechazo(500, 'manual_error', u.error.message, t)
    if (((u.data as Fila[] | null) ?? []).length === 0) return rechazo(409, 'reescritura_en_curso', 'otra decisión se tomó mientras tanto', t)
    cambioId = String(abierto.id)
  } else {
    const ins = await db.from('plan_cambios').insert({ ...datos, client_id, documento: 'manual', estado: 'pendiente', creado_en: hora }).select('id').single()
    if (ins.error?.code === '23505') return rechazo(409, 'reescritura_en_curso', 'otro pedido de cambios entró mientras tanto: espera la versión nueva', t)
    if (ins.error || !ins.data) return rechazo(500, 'manual_error', ins.error?.message ?? 'no se guardó el pedido de cambios', t)
    cambioId = String((ins.data as Fila).id)
  }
  return {
    status: 200,
    cuerpo: { ok: true, manual_cambio_id: cambioId, manual_id, tope_usd: g.tope, estado: 'pendiente', seccion, campos_validados: validados, campos_liberados: liberados, ...(colgado ? { reintento: true } : {}) },
    toca: t,
    despertar_flujo: {
      camino: CAMINO_MANUAL_CAMBIOS,
      cuerpo: { client_id, manual_base_id: manual_id, cambios_del_dueno: texto, manual_cambio_id: cambioId, seccion, campos_validados: validados, campos_liberados: liberados, tope_reescritura_usd: g.tope, force_restart: true, origen: 'tablero/manual-cambios', pedido_por: reviewer },
      registrar: { tabla: 'plan_cambios', id: cambioId },
    },
  }
}
