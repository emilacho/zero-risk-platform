/**
 * EL CICLO DE VIDA DE LOS INCIDENTES (01-nov · ENCARGO Lenovo firmado por Emilio): lo que ya no es un problema se cierra solo, por regla, para cualquier cliente. Nada se borra: cada cierre deja su motivo.
 * Un reloj de n8n llama a `POST /api/incidentes/ciclo-de-vida`. Sin `ejecutar: true` solo informa qué cerraría.
 *   1 · despachos: «en curso» sin cierre más de 24 h → `sin_cierre` (más de 7 días: además, vencido). El reconciliador ve el estado nuevo y da por resuelto su hallazgo: no se toca aquí.
 *   2 · alertas: un aviso sin repetirse 24 h caduca (el mismo plazo con que `alertas.ts` ya abre uno nuevo). Una alerta de pausa solo se cierra si esa pausa ya se levantó, sea cual sea su edad.
 *   3 · pedidos de cambios al plan: tomados por el flujo y sin versión nueva tras 2 h → `fallido`. Uno que nunca despertó al flujo no se toca: el dueño lo puede reintentar.
 * Cada actualización va condicionada al estado que se leyó: una vuelta tardía o una decisión simultánea no se pisan.
 */
import { esObjeto, estaCompleto, leer, sinSecretos, texto, type Contexto, type Fila, type Fuente } from '../direccion/comun'
import { vidaDelPaso, type DespachoLeido } from '../plazo-de-vida'

const HORA = 3_600_000
export const HORAS_DESPACHO_SIN_CIERRE = 24
export const DIAS_DESPACHO_VENCIDO = 7
export const HORAS_ALERTA_CADUCA = 24
export const HORAS_PEDIDO_ATASCADO = 2
const TOPE = 200
const EN_CURSO = ['running', 'accepted']
const UUID_EN_TEXTO = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

export interface Cierre { tipo: 'despacho' | 'alerta' | 'pedido_de_cambios'; id: string; motivo: string; aplicado?: boolean; detalle?: string }

const horas = (desde: unknown, ahora: Date): number => (ahora.getTime() - Date.parse(String(desde))) / HORA

/** PURO · qué despacho cerrar y por qué */
export function cierreDeDespacho(d: Fila, ahora: Date): string | null {
  // 11-nov · #21 · la regla única: un despacho que sigue latiendo no se cierra aunque pase las 24 h (las 24 h son su piso, por `created_at` como hoy)
  if (vidaDelPaso({ inicio: texto(d.created_at), pisoMs: HORAS_DESPACHO_SIN_CIERRE * HORA, duraciones: null, despacho: { ok: true, valor: d as unknown as DespachoLeido } }, ahora).estado !== 'muerto') return null
  const edad = horas(d.created_at, ahora)
  return edad >= DIAS_DESPACHO_VENCIDO * 24 ? `vencido: lleva ${Math.floor(edad / 24)} días sin cierre registrado` : `sin cierre registrado tras ${Math.floor(edad)} h`
}

/** PURO · qué alerta cerrar y por qué. Una de pausa manda por la pausa, no por la edad */
export function cierreDeAlerta(a: Fila, ahora: Date, clientesEnPausa: Set<string>): string | null {
  const clave = String(a.clave ?? '')
  if (clave.startsWith('pausa:')) {
    const cliente = clave.match(UUID_EN_TEXTO)?.[0]
    return cliente && !clientesEnPausa.has(cliente) ? 'la pausa ya se levantó' : null
  }
  const edad = horas(a.ultima_en ?? a.abierto_en, ahora)
  return Number.isFinite(edad) && edad >= HORAS_ALERTA_CADUCA ? `caducó: sin repetirse en ${Math.floor(edad)} h` : null
}

/** PURO · qué pedido de cambios dar por fallido. El que nunca despertó al flujo se puede reintentar: no se cierra */
export function cierreDePedido(p: Fila, ahora: Date): string | null {
  if (p.despertado === false) return null
  const edad = horas(p.actualizado_en, ahora)
  return Number.isFinite(edad) && edad >= HORAS_PEDIDO_ATASCADO ? `sin versión nueva tras ${Math.floor(edad)} h: la corrida no terminó` : null
}

export async function correrCicloDeIncidentes({ db, ahora }: Contexto, opciones: { ejecutar?: boolean } = {}) {
  const now = ahora()
  const hora = now.toISOString()
  const ejecutar = opciones.ejecutar === true
  const fuentes: Fuente[] = []
  const corteDespacho = new Date(now.getTime() - HORAS_DESPACHO_SIN_CIERRE * HORA).toISOString()
  const [despachos, alertas, pausas, pedidos] = await Promise.all([
    leer(fuentes, 'agent_dispatches', db.from('agent_dispatches').select('id, dispatch_key, status, created_at, running_at, updated_at, metadata').in('status', EN_CURSO).lt('created_at', corteDespacho).limit(TOPE), TOPE),
    leer(fuentes, 'cerebro_alertas', db.from('cerebro_alertas').select('clave, ultimo_detalle, abierto_en, ultima_en').is('cerrado_en', null).limit(TOPE), TOPE),
    leer(fuentes, 'cerebro_portero_pausas', db.from('cerebro_portero_pausas').select('client_id').is('levantada_en', null).limit(TOPE), TOPE),
    leer(fuentes, 'plan_cambios', db.from('plan_cambios').select('id, estado, despertado, despertar_detalle, actualizado_en').in('estado', ['pendiente', 'en_reescritura']).limit(TOPE), TOPE),
  ])
  // 🔴 sin saber qué pausas siguen abiertas no se cierra ninguna alerta de pausa: un fallo de lectura no puede parecer «ya se levantó»
  const pausasLeidas = fuentes.find((f) => f.fuente === 'cerebro_portero_pausas')?.estado === 'ok'
  const enPausa = new Set(pausas.map((p) => String(p.client_id)))
  const cierres: Cierre[] = []
  const aplicar = async (c: Cierre, escribir: () => PromiseLike<{ data: unknown; error: { message?: string } | null }>) => {
    if (!ejecutar) { cierres.push(c); return }
    try {
      const r = await escribir()
      const filas = Array.isArray(r.data) ? r.data.length : 0
      cierres.push({ ...c, aplicado: !r.error && filas > 0, ...(r.error ? { detalle: sinSecretos(r.error.message) ?? 'error' } : filas === 0 ? { detalle: 'cambió mientras tanto: no se tocó' } : {}) })
    } catch (e) { cierres.push({ ...c, aplicado: false, detalle: sinSecretos(e instanceof Error ? e.message : String(e)) ?? 'error' }) }
  }
  for (const d of despachos) {
    const motivo = cierreDeDespacho(d, now)
    if (!motivo) continue
    const metadata = { ...(esObjeto(d.metadata) ? d.metadata : {}), cierre: { regla: 'ciclo-de-incidentes', motivo, en: hora, estado_anterior: String(d.status) } }
    await aplicar({ tipo: 'despacho', id: String(d.dispatch_key ?? d.id), motivo }, () => db.from('agent_dispatches').update({ status: 'sin_cierre', updated_at: hora, metadata }).eq('id', d.id).eq('status', d.status).select('id'))
  }
  for (const a of alertas) {
    if (String(a.clave).startsWith('pausa:') && !pausasLeidas) continue
    const motivo = cierreDeAlerta(a, now, enPausa)
    if (!motivo) continue
    const detalle = `${texto(a.ultimo_detalle) ?? ''} · cerrada por regla: ${motivo}`.trim().slice(0, 1000)
    await aplicar({ tipo: 'alerta', id: String(a.clave), motivo }, () => db.from('cerebro_alertas').update({ cerrado_en: hora, ultimo_detalle: detalle }).eq('clave', a.clave).is('cerrado_en', null).select('clave'))
  }
  for (const p of pedidos) {
    const motivo = cierreDePedido(p, now)
    if (!motivo) continue
    await aplicar({ tipo: 'pedido_de_cambios', id: String(p.id), motivo }, () => db.from('plan_cambios').update({ estado: 'fallido', despertar_detalle: motivo, actualizado_en: hora }).eq('id', p.id).eq('estado', p.estado).select('id'))
  }
  return { ok: true, generado_en: hora, ejecutado: ejecutar, completo: estaCompleto(fuentes), total: cierres.length, cierres, fuentes }
}
