/**
 * manual-cambios (GASTA si hay observaciones) · 02-nov · pedido por Emilio: pedir cambios al manual funciona como en el plan. El pedido queda en `plan_cambios` con `documento='manual'` y se despierta
 * la reescritura, que trabaja sobre la versión vigente. Si el flujo no se pudo despertar, nada se gastó y la misma puerta se repite.
 * Sin tope de vueltas: las versiones del manual también suben con cada edición; cada pedido es un clic del dueño y lleva su tope.
 * 03-nov · UN SOLO PEDIDO (opción B de Lenovo): `campos` como objeto { campo: valor } y `retirar[]` se aplican primero, sin modelo; `observaciones_por_campo[]` y `texto` se reescriben sobre esa versión, con una sola fila en `plan_cambios`.
 * Solo lo directo: no se reescribe ni se gasta. Todo se valida antes de escribir. `campos` como lista sigue siendo lo de siempre: los campos que el pedido libera.
 * No es una transacción: si lo directo quedó y el pedido falla, la respuesta lo dice con `directo` y repetir la misma puerta es seguro.
 */
import { TOPE_DEL_TEXTO_DEL_DUENO } from '../../limites-de-tamano'
import { empujarManualAlCerebro } from '../../brain/push-al-terminar'
import { CAMPOS } from '../../manual/campos-del-manual'
import { EDITABLES_DEL_TABLERO } from '../../manual/edicion-del-dueno'
import { rutaEditarManual, type SalidaDeEdicion } from '../../manual/edicion-rutas'
import { camposDelDueno, camposQueLibera } from '../../manual/pedido-de-cambios'
import { confirmarGasto, esObjeto, rechazo, textoEntre, UUID, type Contexto, type Entrada, type Fila, type Salida } from './comun'

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

// el panel nombra los campos por su clave corta o por la del borrador, como en editar y validar
const campoDel = (c: unknown) => CAMPOS.find((x) => x.clave === c || x.clave_del_tablero === c)

interface Directos { campos: Record<string, string | null>; claves: Set<string>; retirados: Set<string> }
/** lo directo del pedido, validado sin escribir: { campo: valor } + retirar[]. Un valor vacío o null retira, igual que en la edición */
function leerDirectos(camposDelCuerpo: unknown, retirar: unknown): Directos | string {
  const campos: Record<string, string | null> = {}
  const claves = new Set<string>(), retirados = new Set<string>()
  const agregar = (k: string, v: unknown): string | null => {
    const c = EDITABLES_DEL_TABLERO[k]
    if (!c) return `«${k}» no es un campo que se pueda editar`
    if (claves.has(c.clave)) return `«${k}» viene dos veces`
    if (v !== null && typeof v !== 'string') return `«${k}» debe ser un texto`
    if (v !== null && v.trim().length > TOPE_DEL_TEXTO_DEL_DUENO) return `«${k}» debe tener hasta ${TOPE_DEL_TEXTO_DEL_DUENO} caracteres`
    claves.add(c.clave)
    if (v === null || !v.trim()) retirados.add(c.clave)
    campos[k] = v
    return null
  }
  if (esObjeto(camposDelCuerpo)) for (const [k, v] of Object.entries(camposDelCuerpo)) { const e = agregar(k, v); if (e) return e }
  if (retirar !== undefined && retirar !== null) {
    if (!Array.isArray(retirar)) return '`retirar` debe ser una lista de campos del manual'
    for (const k of retirar) { const e = typeof k === 'string' ? agregar(k, '') : '`retirar` debe ser una lista de campos del manual'; if (e) return e }
  }
  return { campos, claves, retirados }
}

interface Observacion { clave: string; etiqueta: string; texto: string }
function leerObservaciones(x: unknown): Observacion[] | string {
  if (x === undefined || x === null) return []
  if (!Array.isArray(x)) return '`observaciones_por_campo` debe ser una lista de { campo, texto }'
  const salida: Observacion[] = []
  for (const o of x) {
    const c = esObjeto(o) ? campoDel(o.campo) : undefined
    const texto = esObjeto(o) ? textoEntre(o.texto, 1, TOPE_DEL_TEXTO_DEL_DUENO) : null
    if (!c || !texto) return 'cada observación debe traer un campo del manual y su texto'
    salida.push({ clave: c.clave, etiqueta: c.etiqueta, texto })
  }
  return salida
}

export interface DepsDelPedido extends Contexto {
  /** aplica lo directo igual que «Editar el manual»: versión nueva y después el cerebro */
  editarDirecto: (client_id: string, campos: Record<string, string | null>, reviewer: string) => Promise<SalidaDeEdicion>
}

export async function pedirCambiosAlManual({ db, ahora, editarDirecto }: DepsDelPedido, { cuerpo, reviewer }: Entrada): Promise<Salida> {
  if (typeof cuerpo.client_id !== 'string' || !UUID.test(cuerpo.client_id)) return rechazo(400, 'entrada_invalida', '`client_id` debe ser un uuid')
  const client_id = cuerpo.client_id

  const directos = leerDirectos(cuerpo.campos, cuerpo.retirar)
  if (typeof directos === 'string') return rechazo(400, 'entrada_invalida', directos, { client_id })
  const observaciones = leerObservaciones(cuerpo.observaciones_por_campo)
  if (typeof observaciones === 'string') return rechazo(400, 'entrada_invalida', observaciones, { client_id })
  const contradice = observaciones.find((o) => directos.retirados.has(o.clave))
  if (contradice) return rechazo(400, 'entrada_invalida', `«${contradice.etiqueta}» viene para retirar y con una observación: deja una de las dos`, { client_id })

  const hayDirectos = directos.claves.size > 0
  const libre = typeof cuerpo.texto === 'string' ? cuerpo.texto.trim() : ''
  const soloDirectos = hayDirectos && !observaciones.length && !libre
  const armado = [...observaciones.map((o) => `Campo «${o.etiqueta}»: ${o.texto}`), ...(libre ? [libre] : [])].join('\n\n')
  const texto = soloDirectos ? null : textoEntre(armado, 5, TOPE_DEL_TEXTO_DEL_DUENO)
  const toca = { client_id, comentario: texto }
  if (!soloDirectos && !texto) return rechazo(400, 'entrada_invalida', `\`texto\` (qué debe cambiar) debe tener de 5 a ${TOPE_DEL_TEXTO_DEL_DUENO} caracteres, contando las observaciones`, toca)
  const seccion = cuerpo.seccion === undefined || cuerpo.seccion === null || cuerpo.seccion === '' ? null : textoEntre(cuerpo.seccion, 1, 80)
  if (cuerpo.seccion && !seccion) return rechazo(400, 'entrada_invalida', '`seccion` debe tener hasta 80 caracteres', toca)
  const pedidos = cuerpo.campos === undefined || cuerpo.campos === null || esObjeto(cuerpo.campos) ? [] : cuerpo.campos
  const campos = Array.isArray(pedidos) ? pedidos.map((c) => campoDel(c)?.clave) : null
  if (!campos || campos.includes(undefined)) return rechazo(400, 'entrada_invalida', '`campos` debe ser una lista de campos del manual, o un objeto con los valores que cambian', toca)
  const g = soloDirectos ? null : confirmarGasto(cuerpo, TOPE_PEDIDO_AL_MANUAL_USD)
  if (g && !g.ok) return { ...g.salida, toca }

  const a = await db.from('plan_cambios').select('id, estado, despertado').eq('client_id', client_id).eq('documento', 'manual').in('estado', ABIERTOS).limit(1)
  if (a.error) return rechazo(500, 'manual_error', a.error.message, toca)
  const abierto = ((a.data as Fila[] | null) ?? [])[0]
  const colgado = abierto?.estado === 'pendiente' && abierto.despertado === false
  if (abierto && !colgado) return rechazo(409, 'reescritura_en_curso', 'ya hay un pedido de cambios sobre este manual: espera la versión nueva', toca)

  // lo directo, primero: la reescritura trabaja sobre esa versión
  let directo: Fila | null = null
  if (hayDirectos) {
    const e = await editarDirecto(client_id, directos.campos, reviewer)
    if (e.status !== 200) return { status: e.status, cuerpo: e.body, toca }
    directo = e.body
    if (soloDirectos) return { status: 200, cuerpo: { ok: true, reescribe: false, directo }, toca }
  }
  const conDirecto = directo ? { directo } : {}
  const mal = (status: number, error: string, detalle: string, t: Salida['toca'] = toca): Salida => ({ status, cuerpo: { ok: false, error, detalle, ...conDirecto }, toca: t })

  const v = await db.from('client_brand_books').select('id, content_text').eq('client_id', client_id).order('version', { ascending: false }).limit(1)
  if (v.error) return mal(500, 'manual_error', v.error.message)
  const vigente = ((v.data as Fila[] | null) ?? [])[0]
  if (!vigente) return mal(404, 'sin_manual', 'el cliente todavía no tiene manual')
  const manual_id = String(vigente.id)
  const t = { ...toca, output_id: manual_id }

  const validados = camposDelDueno(borradorDe(vigente.content_text)._field_meta)
  // lo que escribió o retiró en este mismo pedido se queda: solo lo libera una observación puesta en ese campo, no que el texto lo nombre de paso
  const conObservacion = observaciones.map((o) => o.clave)
  const nombrados = camposQueLibera({ delDueno: validados, texto: texto as string, campos: [...(campos as string[]), ...conObservacion] })
  const liberados = nombrados.filter((k) => !directos.claves.has(k) || conObservacion.includes(k))
  const hora = ahora().toISOString()
  const tope = g && g.ok ? g.tope : TOPE_PEDIDO_AL_MANUAL_USD
  const datos = { manual_id, texto, seccion, campos_liberados: liberados, pedido_por: reviewer, tope_usd: tope, actualizado_en: hora }
  let cambioId: string
  if (colgado) {
    const u = await db.from('plan_cambios').update({ ...datos, despertado: null, despertar_detalle: null, creado_en: hora }).eq('id', abierto.id).eq('estado', 'pendiente').eq('despertado', false).select('id')
    if (u.error) return mal(500, 'manual_error', u.error.message, t)
    if (((u.data as Fila[] | null) ?? []).length === 0) return mal(409, 'reescritura_en_curso', 'otra decisión se tomó mientras tanto', t)
    cambioId = String(abierto.id)
  } else {
    const ins = await db.from('plan_cambios').insert({ ...datos, client_id, documento: 'manual', estado: 'pendiente', creado_en: hora }).select('id').single()
    if (ins.error?.code === '23505') return mal(409, 'reescritura_en_curso', 'otro pedido de cambios entró mientras tanto: espera la versión nueva', t)
    if (ins.error || !ins.data) return mal(500, 'manual_error', ins.error?.message ?? 'no se guardó el pedido de cambios', t)
    cambioId = String((ins.data as Fila).id)
  }
  return {
    status: 200,
    cuerpo: { ok: true, reescribe: true, manual_cambio_id: cambioId, manual_id, tope_usd: tope, estado: 'pendiente', seccion, campos_validados: validados, campos_liberados: liberados, ...conDirecto, ...(colgado ? { reintento: true } : {}) },
    toca: t,
    despertar_flujo: {
      camino: CAMINO_MANUAL_CAMBIOS,
      cuerpo: { client_id, manual_base_id: manual_id, cambios_del_dueno: texto, manual_cambio_id: cambioId, seccion, campos_validados: validados, campos_liberados: liberados, tope_reescritura_usd: tope, force_restart: true, origen: 'tablero/manual-cambios', pedido_por: reviewer },
      registrar: { tabla: 'plan_cambios', id: cambioId },
    },
  }
}

export const manualCambios = async (c: Contexto, e: Entrada): Promise<Salida> => pedirCambiosAlManual({
  ...c,
  editarDirecto: (client_id, campos, reviewer) => rutaEditarManual({
    db: c.db,
    cerebro: { env: { baseUrl: process.env.ZERO_RISK_API_URL ?? c.origen ?? 'https://zero-risk-platform.vercel.app', internalKey: process.env.INTERNAL_API_KEY ?? '' } },
    empujarManual: (x) => empujarManualAlCerebro(x),
    ahora: c.ahora,
  }, client_id, { campos, reviewer }, reviewer),
}, e)
