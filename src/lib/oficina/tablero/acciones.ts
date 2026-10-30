/**
 * Las acciones del tablero, TRAMO 1 (30-oct): rehacer una pieza que falló, el cliente (editar · nuevo · baja) y la oficina (encender/apagar · tope de gasto).
 * Pendientes de los tramos siguientes (responden 404 = «todavía no disponible»): pieza-nueva, plan-*, firmar-tablero, revision-resolver, manual-*.
 */
import { abrirEncargo } from '../orquestador'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { confirmarGasto, esObjeto, rechazo, textoEntre, UUID, type Fila, type Manejador } from './comun'

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)

// ───────────────────────── rehacer-pieza (GASTA)
/** Reabre un encargo que FALLÓ con la causa declarada. Respeta el tope de 3 versiones por brief: si ya se agotó, lo dice (la salida es «Pieza nueva»). */
export const rehacerPieza: Manejador = async ({ db, puertos }, { cuerpo }) => {
  if (typeof cuerpo.encargo_id !== 'string' || !UUID.test(cuerpo.encargo_id)) return rechazo(400, 'entrada_invalida', '`encargo_id` debe ser un uuid')
  const comentario = cuerpo.comentario === undefined || cuerpo.comentario === null || cuerpo.comentario === '' ? null : textoEntre(cuerpo.comentario, 1, 300)
  if (cuerpo.comentario && !comentario) return rechazo(400, 'entrada_invalida', '`comentario` debe tener hasta 300 caracteres')
  const toca = { encargo_id: cuerpo.encargo_id, comentario }
  const g = confirmarGasto(cuerpo, 5)
  if (!g.ok) return { ...g.salida, toca }
  const r = await db.from('oficina_encargos').select('*').eq('id', cuerpo.encargo_id).limit(1)
  if (r.error) return rechazo(500, 'oficina_error', r.error.message, toca)
  const enc = ((r.data as Fila[] | null) ?? [])[0]
  if (!enc) return rechazo(404, 'encargo_inexistente', 'no existe ese encargo', toca)
  const t = { ...toca, client_id: String(enc.client_id) }
  if (enc.dry_run === true) return rechazo(409, 'es_un_ensayo', 'un ensayo no se rehace desde el tablero', t)
  if (enc.estado !== 'fallido') return rechazo(409, 'no_fallo', `solo se rehace una pieza que falló (esta está «${String(enc.estado)}»)`, t)
  const hermanos = await db.from('oficina_encargos').select('id, version_encargo, dry_run').eq('parte_id', enc.parte_id).eq('brief_id', enc.brief_id).eq('tipo_de_grupo', enc.tipo_de_grupo)
  if (hermanos.error) return rechazo(500, 'oficina_error', hermanos.error.message, t)
  const mayor = ((hermanos.data as Fila[] | null) ?? []).filter((x) => x.dry_run !== true).reduce((m, x) => Math.max(m, Number(x.version_encargo)), 0)
  if (Number(enc.version_encargo) < mayor) return rechazo(409, 'hay_una_version_mas_nueva', 'esa pieza ya tiene una versión más nueva: rehaz la última', t)
  const causa = comentario && comentario.length >= 10 ? comentario : 'Rehacer pedido por Emilio desde el dashboard tras corregir la causa del fallo'
  const sala = esObjeto(enc.sala_ref) ? enc.sala_ref : {}
  const cal = esObjeto(sala.fila) ? { fila_id: sala.fila.id, fecha: sala.fila.fecha, hora: sala.fila.hora } : {}
  const a = await abrirEncargo(puertos(), {
    cuerpo: { parte_id: enc.parte_id, brief_id: enc.brief_id, dry_run: false, familia: enc.familia, tope_usd: g.tope, reabrir_causa_corregida: causa, ...Object.fromEntries(Object.entries(cal).filter(([, v]) => typeof v === 'string')) },
    client_id: String(enc.client_id), target_step_id: TARGET_STEP_PRODUCIR, sala_ref: { _journey_id: sala._journey_id ?? null, _sala_correlation_id: sala._sala_correlation_id ?? null },
  })
  if (a.status !== 200 || a.cuerpo.accion === 'cerrado') return { status: a.status, cuerpo: { ok: false, error: 'no_se_pudo_rehacer', detalle: a.cuerpo }, toca: t }
  if (a.cuerpo.accion === 'ya_existia') return { status: 409, cuerpo: { ok: false, error: 'no_se_reabre', detalle: 'el sistema no reabre esta pieza (ya se agotaron sus 3 intentos o gastó sin causa nueva): usa «Pedir pieza nueva»' }, toca: t }
  const turno = esObjeto(a.cuerpo.turno) ? a.cuerpo.turno : null
  return { status: 200, cuerpo: { ok: true, ...a.cuerpo, tope_usd: g.tope }, toca: { ...t, encargo_id: String(a.cuerpo.encargo_id ?? cuerpo.encargo_id) }, ...(a.cuerpo.accion === 'esperar' && turno ? { despertar: { encargo_id: String(a.cuerpo.encargo_id), turno } } : {}) }
}

// ───────────────────────── cliente
const slugDe = (n: string): string => n.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60)
const REDES = ['instagram', 'facebook', 'tiktok', 'linkedin', 'youtube'] as const

export const clienteNuevo: Manejador = async ({ db }, { cuerpo }) => {
  const nombre = textoEntre(cuerpo.nombre, 2, 120)
  const rubro = textoEntre(cuerpo.rubro, 2, 200)
  if (!nombre || !rubro) return rechazo(400, 'entrada_invalida', '`nombre` y `rubro` son obligatorios')
  const ciudad = cuerpo.ciudad === undefined || cuerpo.ciudad === '' ? null : textoEntre(cuerpo.ciudad, 2, 200)
  const sitio = cuerpo.sitio === undefined || cuerpo.sitio === '' ? null : (typeof cuerpo.sitio === 'string' && /^https?:\/\/\S+$/i.test(cuerpo.sitio.trim()) ? cuerpo.sitio.trim() : null)
  if (cuerpo.sitio && !sitio) return rechazo(400, 'entrada_invalida', '`sitio` debe ser una dirección http(s)')
  const pres = cuerpo.presupuesto === undefined || cuerpo.presupuesto === null ? null : num(cuerpo.presupuesto)
  if (cuerpo.presupuesto !== undefined && cuerpo.presupuesto !== null && (pres === null || pres < 0 || pres > 1_000_000)) return rechazo(400, 'entrada_invalida', '`presupuesto` debe ser un número entre 0 y 1.000.000')
  const slug = slugDe(nombre)
  if (!slug) return rechazo(400, 'entrada_invalida', 'el nombre no da un identificador válido')
  const ya = await db.from('clients').select('id').eq('slug', slug).limit(1)
  if (ya.error) return rechazo(500, 'clientes_error', ya.error.message)
  if (((ya.data as Fila[] | null) ?? []).length) return rechazo(409, 'cliente_ya_existe', 'ya hay un cliente con un nombre igual', { client_id: String((ya.data as Fila[])[0].id) })
  const ins = await db.from('clients').insert({ name: nombre, slug, industry: rubro, status: 'onboarding', ...(ciudad ? { market: ciudad } : {}), ...(sitio ? { website_url: sitio } : {}), config: { ...(pres !== null ? { spend_cap_usd: pres } : {}), creado_desde: 'dashboard' } }).select('id').single()
  if (ins.error || !ins.data) return rechazo(500, 'clientes_error', ins.error?.message ?? 'no se creó')
  const id = String((ins.data as Fila).id)
  return { status: 200, cuerpo: { ok: true, client_id: id, slug }, toca: { client_id: id } }
}

export const clienteEditar: Manejador = async ({ db }, { cuerpo }) => {
  if (typeof cuerpo.client_id !== 'string' || !UUID.test(cuerpo.client_id)) return rechazo(400, 'entrada_invalida', '`client_id` debe ser un uuid')
  const toca = { client_id: cuerpo.client_id }
  const c = cuerpo.campos
  if (!esObjeto(c) || Object.keys(c).length === 0) return rechazo(400, 'entrada_invalida', '`campos` debe traer al menos un campo', toca)
  const permitidos = new Set(['rubro', 'ciudad', 'sitio', 'presupuesto', 'redes'])
  const raros = Object.keys(c).filter((k) => !permitidos.has(k))
  if (raros.length) return rechazo(400, 'campo_no_editable', `no se pueden editar: ${raros.join(', ')}`, toca)
  const r = await db.from('clients').select('id, config, status').eq('id', cuerpo.client_id).limit(1)
  if (r.error) return rechazo(500, 'clientes_error', r.error.message, toca)
  const cli = ((r.data as Fila[] | null) ?? [])[0]
  if (!cli) return rechazo(404, 'cliente_inexistente', 'no existe ese cliente', toca)
  if (cli.status === 'churned') return rechazo(409, 'cliente_dado_de_baja', 'un cliente dado de baja no se edita', toca)
  const cambio: Fila = {}
  const config: Fila = esObjeto(cli.config) ? { ...cli.config } : {}
  if ('rubro' in c) { const v = textoEntre(c.rubro, 2, 200); if (!v) return rechazo(400, 'entrada_invalida', '`rubro` debe tener de 2 a 200 caracteres', toca); cambio.industry = v }
  if ('ciudad' in c) { const v = textoEntre(c.ciudad, 2, 200); if (!v) return rechazo(400, 'entrada_invalida', '`ciudad` debe tener de 2 a 200 caracteres', toca); cambio.market = v }
  if ('sitio' in c) { const v = typeof c.sitio === 'string' && /^https?:\/\/\S+$/i.test(c.sitio.trim()) ? c.sitio.trim() : null; if (!v) return rechazo(400, 'entrada_invalida', '`sitio` debe ser una dirección http(s)', toca); cambio.website_url = v }
  if ('presupuesto' in c) { const v = num(c.presupuesto); if (v === null || v < 0 || v > 1_000_000) return rechazo(400, 'entrada_invalida', '`presupuesto` debe ser un número entre 0 y 1.000.000', toca); config.spend_cap_usd = v }
  if ('redes' in c) {
    if (!esObjeto(c.redes)) return rechazo(400, 'entrada_invalida', '`redes` debe ser { red: usuario }', toca)
    const previas = esObjeto(config.own_social_handles) ? { ...config.own_social_handles } : {}
    for (const [red, h] of Object.entries(c.redes)) {
      if (!(REDES as readonly string[]).includes(red)) return rechazo(400, 'entrada_invalida', `red desconocida: ${red}`, toca)
      const v = textoEntre(h, 1, 100)
      if (!v) return rechazo(400, 'entrada_invalida', `el usuario de ${red} debe tener de 1 a 100 caracteres`, toca)
      previas[red] = v
    }
    config.own_social_handles = previas
  }
  if ('presupuesto' in c || 'redes' in c) cambio.config = config
  const u = await db.from('clients').update(cambio).eq('id', cuerpo.client_id).select('id')
  if (u.error) return rechazo(500, 'clientes_error', u.error.message, toca)
  return { status: 200, cuerpo: { ok: true, client_id: cuerpo.client_id, cambiados: Object.keys(c) }, toca }
}

export const clienteBaja: Manejador = async ({ db, ahora }, { cuerpo }) => {
  if (typeof cuerpo.client_id !== 'string' || !UUID.test(cuerpo.client_id)) return rechazo(400, 'entrada_invalida', '`client_id` debe ser un uuid')
  const comentario = textoEntre(cuerpo.comentario, 3, 500)
  const toca = { client_id: cuerpo.client_id, comentario }
  if (!comentario) return rechazo(400, 'entrada_invalida', '`comentario` (el motivo de la baja) debe tener de 3 a 500 caracteres', toca)
  const r = await db.from('clients').select('id, status').eq('id', cuerpo.client_id).limit(1)
  if (r.error) return rechazo(500, 'clientes_error', r.error.message, toca)
  const cli = ((r.data as Fila[] | null) ?? [])[0]
  if (!cli) return rechazo(404, 'cliente_inexistente', 'no existe ese cliente', toca)
  if (cli.status === 'churned') return rechazo(409, 'ya_estaba_de_baja', 'ese cliente ya está dado de baja', toca)
  const u = await db.from('clients').update({ status: 'churned', archived_at: ahora().toISOString(), archived_reason: comentario }).eq('id', cuerpo.client_id).select('id')
  if (u.error) return rechazo(500, 'clientes_error', u.error.message, toca)
  return { status: 200, cuerpo: { ok: true, client_id: cuerpo.client_id, estado: 'churned' }, toca }
}

// ───────────────────────── oficinas: interruptor y tope
const OFICINAS = ['creativa', 'financiera', 'jefatura', 'planeacion'] as const
const TABLA_DE_ESTADO: Record<string, string> = { creativa: 'oficina_config', financiera: 'finanzas_config', jefatura: 'jefatura_config' }

export const oficinaEstado: Manejador = async ({ db, ahora }, { cuerpo }) => {
  const oficina = String(cuerpo.oficina)
  if (!(OFICINAS as readonly string[]).includes(oficina)) return rechazo(400, 'entrada_invalida', `\`oficina\` debe ser ${OFICINAS.join(' · ')}`)
  if (cuerpo.estado !== 'encendida' && cuerpo.estado !== 'apagada') return rechazo(400, 'entrada_invalida', '`estado` debe ser encendida o apagada')
  const estado = cuerpo.estado
  if (oficina === 'planeacion') {
    const u = await db.from('cadena_config').update({ valor: estado, actualizado_en: ahora().toISOString() }).eq('clave', 'estado_cadena').select('clave')
    if (u.error) return rechazo(500, 'oficina_error', u.error.message)
    if (((u.data as Fila[] | null) ?? []).length === 0) return rechazo(409, 'sin_interruptor', 'no hay interruptor de planeación en la base')
    return { status: 200, cuerpo: { ok: true, oficina, estado } }
  }
  const tabla = TABLA_DE_ESTADO[oficina]
  const u = await db.from(tabla).update({ estado, actualizado_en: ahora().toISOString() }).eq('id', 1).select('id')
  if (u.error) return rechazo(500, 'oficina_error', u.error.message)
  if (((u.data as Fila[] | null) ?? []).length === 0) return rechazo(409, 'sin_interruptor', 'no hay fila de configuración para esa oficina')
  return { status: 200, cuerpo: { ok: true, oficina, estado } }
}

/** Qué es «el tope» de cada oficina: creativa = lo máximo que gasta UNA pieza de la mesa (carrusel_mesa y kit_mesa) · jefatura = lo máximo de UNA revisión de pieza. Las otras dos no tienen un tope único configurable. */
export const TOPE_MAXIMO_EDITABLE_USD = 10
export const oficinaTope: Manejador = async ({ db }, { cuerpo }) => {
  const oficina = String(cuerpo.oficina)
  if (!(OFICINAS as readonly string[]).includes(oficina)) return rechazo(400, 'entrada_invalida', `\`oficina\` debe ser ${OFICINAS.join(' · ')}`)
  const t = num(cuerpo.tope_usd)
  if (t === null || t < 0.01 || t > 1000) return rechazo(400, 'entrada_invalida', '`tope_usd` debe estar entre 0,01 y 1000')
  if (oficina === 'financiera' || oficina === 'planeacion') return rechazo(409, 'sin_tope_configurable', `la oficina ${oficina} no tiene un tope único que se pueda ajustar desde aquí`)
  if (t > TOPE_MAXIMO_EDITABLE_USD) return rechazo(400, 'tope_demasiado_alto', `por seguridad el tope de la oficina ${oficina} no pasa de US$ ${TOPE_MAXIMO_EDITABLE_USD} desde el tablero`)
  if (oficina === 'jefatura') {
    const u = await db.from('jefatura_grading_policies').update({ tope_revision_usd: t }).eq('artifact_type', 'pieza').select('artifact_type')
    if (u.error) return rechazo(500, 'oficina_error', u.error.message)
    if (((u.data as Fila[] | null) ?? []).length === 0) return rechazo(409, 'sin_politica', 'no hay política de revisión de pieza')
    return { status: 200, cuerpo: { ok: true, oficina, tope_usd: t, que_es: 'tope de UNA revisión de la jefatura sobre una pieza' } }
  }
  let cambiados = 0
  for (const tipo of ['carrusel_mesa', 'kit_mesa']) {
    const r = await db.from('oficina_tipos_de_grupo').select('tipo, limites').eq('tipo', tipo).limit(1)
    if (r.error) return rechazo(500, 'oficina_error', r.error.message)
    const f = ((r.data as Fila[] | null) ?? [])[0]
    if (!f) continue
    const limites = esObjeto(f.limites) ? { ...f.limites, tope_encargo_usd: t } : { tope_encargo_usd: t }
    const u = await db.from('oficina_tipos_de_grupo').update({ limites }).eq('tipo', tipo).select('tipo')
    if (u.error) return rechazo(500, 'oficina_error', u.error.message)
    cambiados += ((u.data as Fila[] | null) ?? []).length
  }
  if (cambiados === 0) return rechazo(409, 'sin_plantillas', 'no hay plantillas de la mesa que ajustar')
  return { status: 200, cuerpo: { ok: true, oficina, tope_usd: t, que_es: 'lo máximo que gasta UNA pieza de la mesa (carrusel y kit)', plantillas: cambiados } }
}

export const ACCIONES: Record<string, Manejador> = {
  'rehacer-pieza': rehacerPieza,
  'cliente-nuevo': clienteNuevo,
  'cliente-editar': clienteEditar,
  'cliente-baja': clienteBaja,
  'oficina-estado': oficinaEstado,
  'oficina-tope': oficinaTope,
}
