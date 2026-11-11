/**
 * EL VIGÍA de la oficina (lo llama un reloj de n8n cada 10 min; la ruta es `POST /api/oficina/vigia`). Dos trabajos, ambos idempotentes:
 *  ① VENCER LA BANDEJA: una pieza de la oficina que Emilio no aprobó antes de su fecha (`expires_at`) deja de esperar: queda ANOTADA y NUNCA se publica sola.
 *     `hitl_queue.status` solo admite pending · approved · rejected · edited (comprobado en el catálogo el 09-oct): se marca `rejected` con `resolved_by = oficina-vigia`,
 *     la nota «no aprobada antes de su fecha; no se publica» y `decision.vencida = true`, para que ningún consumidor la confunda con un rechazo de calidad.
 *  ② PASOS MUERTOS: un paso en «corriendo» más de 12 min no volverá (el callback vive en un waitUntil de 800 s). Se marca `muerto` y se reintenta UNA vez (mismo número, misma
 *     dispatch_key); si vuelve a morir, el encargo cierra `fallido` y avisa. La ruta devuelve los encargos a re-armar; el flujo los reanuda con `siguiente`.
 * Solo toca filas de la OFICINA (metadata.origen = 'oficina'); una fila ajena `pending` jamás se toca.
 */
import type { Db } from './almacen-supabase'
import { filasQueVencen, NOTA_DE_VENCIMIENTO } from './entrega'
import type { Puertos } from './puertos'
import { fallar, jefaturaSinRespuesta, plantillaDe } from './orquestador'
import { resolverMaterialVencido } from './material-orquestador'
import { entregarPorTopeDeLaMesa, esTurnoDeLaMesa, recibirResultadoMesa } from './mesa/orquestador'
import { FAMILIAS_MESA, esDeLaCadena } from './mesa/tipos'
import { entregarALaCadena } from './mesa/de-la-cadena'
import { AGENTE_DEL_BRAZO, MINUTOS_PARA_ESPERAR_AL_BRAZO, sondearVideos } from './orquestador-video'
import { CORRIDAS_QUE_SE_MIRAN, lecturasDeVida, lectorDeVidaDeSupabase, techoMedidoMs, vidaDelPaso, type LectorDeVida } from '../plazo-de-vida'

/**
 * 11-nov · #21 · el lector de vida de la OFICINA: el de siempre, más el brazo de video, que no es un agente y se mide por sus turnos terminados
 * (fin − inicio). Vive aquí porque solo la oficina nombra sus tablas. Si la base falla, LANZA (quien llama lo vuelve `sin_dato`).
 */
export function lectorDeVidaDeLaOficina(db: Db): LectorDeVida {
  const base = lectorDeVidaDeSupabase(db)
  return {
    despacho: (e, a) => base.despacho(e, a),
    async duraciones(a) {
      if (a !== AGENTE_DEL_BRAZO) return base.duraciones(a)
      const b = (await db.from('oficina_turnos').select('inicio, fin').eq('tipo', 'brazo').eq('estado', 'hecho').order('inicio', { ascending: false }).limit(CORRIDAS_QUE_SE_MIRAN)) as { data: Array<{ inicio: string | null; fin: string | null }> | null; error: { message: string } | null }
      if (b.error) throw new Error(`leer los turnos del brazo: ${b.error.message}`)
      const t = (x: string | null) => (x ? Date.parse(x) : NaN)
      return (b.data ?? []).map((f) => t(f.fin) - t(f.inicio))
    },
  }
}

type Fila = Record<string, unknown>
/** 11-nov · #21 · el PISO de la oficina: el plazo de cada paso sale de `plazo-de-vida.ts` (techo medido del agente + latido), nunca más corto que esto */
export const MINUTOS_PARA_DAR_POR_MUERTO = 12
/** 28-oct · un turno LANZADO que ningún flujo acusó en este tiempo se perdió en el traspaso: se vuelve a entregar (no se da por muerto) */
export const MINUTOS_PARA_REANUDAR_LO_LANZADO = 3
/** cuántas veces se vuelve a entregar un turno sin acuse antes de dejarlo a la regla de los 12 min */
export const MAX_REENTREGAS_SIN_ACUSE = 3
/** J8a · el paso `jefatura` espera a una revisión que corre en n8n (≈ 5–15 min por salto, hasta ≈ 50 min en el peor caso): no es un paso muerto a los 12 min. Pasado este tiempo la pieza sigue «sin revisar» */
export const MINUTOS_PARA_ESPERAR_A_LA_JEFATURA = 90

export async function vencerBandeja(db: Db, ahora: Date): Promise<{ vencidas: string[] }> {
  const r = (await db.from('hitl_queue').select('id,status,expires_at,metadata').eq('status', 'pending').lt('expires_at', ahora.toISOString())) as { data: Fila[] | null; error: { message: string } | null }
  if (r.error) throw new Error(`vigía · leer la bandeja: ${r.error.message}`)
  const candidatas = filasQueVencen((r.data ?? []).map((x) => ({ id: String(x.id), status: String(x.status), expires_at: (x.expires_at as string | null) ?? null, metadata: (x.metadata as Record<string, unknown> | null) ?? null })), ahora)
  const vencidas: string[] = []
  for (const f of candidatas) {
    // condicional en la base: solo si SIGUE pendiente (una aprobación que llegó justo antes no se pisa)
    const u = (await db.from('hitl_queue').update({ status: 'rejected', resolved_by: 'oficina-vigia', reviewer: 'oficina-vigia', resolution_notes: NOTA_DE_VENCIMIENTO, resolved_at: ahora.toISOString(), decided_at: ahora.toISOString(), decision: { vencida: true, motivo: NOTA_DE_VENCIMIENTO, expires_at: f.expires_at } }).eq('id', f.id).eq('status', 'pending').select('id')) as { data: Fila[] | null; error: { message: string } | null }
    if (u.error) throw new Error(`vigía · vencer ${f.id}: ${u.error.message}`)
    if (u.data?.length) vencidas.push(f.id)
  }
  return { vencidas }
}

/**
 * El PLAZO de la mesa entera (brief 30 min, concepto 90): pasado el plazo desde que se abrió el encargo, la mesa cierra con lo que hay y se lo entrega a la cadena con motivo «plazo» (cerrado_por_tope).
 * Es el freno de una mesa que sigue viva sin llegar a integrar (turnos que vuelven, pero sin fin). Solo las mesas de la cadena; nunca la bandeja. Un encargo ya cerrado no se toca.
 */
export async function vencerMesasPorPlazo(P: Puertos, db: Db, ahora: Date): Promise<{ vencidas: string[] }> {
  const familias = Object.entries(FAMILIAS_MESA).filter(([, t]) => esDeLaCadena(t)).map(([f]) => f)
  const r = (await db.from('oficina_encargos').select('id,creado_en').in('familia', familias).in('estado', ['abierto', 'en_paso'])) as { data: Fila[] | null; error: { message: string } | null }
  if (r.error) throw new Error(`vigía · leer las mesas de la cadena: ${r.error.message}`)
  const vencidas: string[] = []
  for (const f of r.data ?? []) {
    const enc = await P.almacen.leerEncargo(String(f.id))
    if (!enc || ['cerrado', 'cerrado_por_tope', 'fallido', 'aprobada'].includes(enc.estado)) continue
    const pl = await plantillaDe(P, enc)
    const plazo = Number(pl.limites?.plazo_mesa_min ?? 0)
    if (!(plazo > 0) || !f.creado_en) continue
    if (new Date(String(f.creado_en)).getTime() > ahora.getTime() - plazo * 60_000) continue
    const motivo = `plazo de la mesa agotado (${plazo} min)`
    const entregado = await entregarPorTopeDeLaMesa(P, enc, motivo)
    if (!entregado) await entregarALaCadena(P, enc, { texto: null, motivo, estado: 'cerrado_por_tope' })
    vencidas.push(enc.id)
  }
  return { vencidas }
}

export async function revisarPasosMuertos(P: Puertos, db: Db, ahora: Date, lector: LectorDeVida = lectorDeVidaDeLaOficina(db)): Promise<{ reanudar: string[]; fallidos: string[]; cierres: Array<{ encargo_id: string; resultado_para_la_sala: string; sala_ref: Record<string, unknown> | null; client_id: string; brief_id: string }>; sin_dato?: Array<{ encargo_id: string; paso: string; motivo: string }> }> {
  const vida = lecturasDeVida(lector)
  const sin_dato: Array<{ encargo_id: string; paso: string; motivo: string }> = []
  const limite = new Date(ahora.getTime() - MINUTOS_PARA_DAR_POR_MUERTO * 60_000).toISOString()
  const limiteJefatura = new Date(ahora.getTime() - MINUTOS_PARA_ESPERAR_A_LA_JEFATURA * 60_000).toISOString()
  // ① LO LANZADO SIN ACUSE (traspaso perdido): a los 3 min se vuelve a entregar el mismo turno (el acuse atómico impide que dos flujos lo paguen)
  const limiteLanzado = new Date(ahora.getTime() - MINUTOS_PARA_REANUDAR_LO_LANZADO * 60_000).toISOString()
  const reentregar: string[] = []
  const sa = (await db.from('oficina_turnos').select('encargo_id,n,paso,tipo,inicio').eq('estado', 'corriendo').is('workflow_execution_id', null).lt('inicio', limiteLanzado)) as { data: Fila[] | null; error: { message: string } | null }
  if (sa.error) throw new Error(`vigía · leer los turnos sin acuse: ${sa.error.message}`)
  for (const t of sa.data ?? []) {
    if (t.tipo !== 'agente' && t.tipo !== 'portero') continue // material y jefatura tienen su propio plazo
    const enc = await P.almacen.leerEncargo(String(t.encargo_id))
    if (!enc || ['cerrado', 'cerrado_por_tope', 'fallido', 'aprobada'].includes(enc.estado)) continue
    const k = `lanzado:${String(t.paso)}:${String(t.n)}`
    const veces = enc.estado_del_motor.vueltas[k] ?? 0
    if (veces >= MAX_REENTREGAS_SIN_ACUSE) continue // se deja a la regla de los 12 min (muerto → un reintento → fallido)
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: { ...enc.estado_del_motor, vueltas: { ...enc.estado_del_motor.vueltas, [k]: veces + 1 } }, gasto_usd: enc.gasto_usd })
    reentregar.push(enc.id)
    // 10-nov · arreglo 4 del costo de la mesa: un turno que nadie tomó ya no se re-entrega EN SILENCIO (el acuse con la llave vacía dio 401 del 28-oct al 10-nov y nadie lo supo).
    // UNA alarma por encargo (la primera re-entrega de ese encargo); las siguientes no vuelven a sonar. Nunca frena al vigía
    if (!Object.keys(enc.estado_del_motor.vueltas).some((x) => x.startsWith('lanzado:'))) {
      try {
        await P.avisar({ canal: 'alertas', encargo_id: enc.id, texto: `⚠️ La oficina volvió a entregar el turno ${String(t.n)} («${String(t.paso)}») del encargo ${enc.brief_id}: ningún flujo lo tomó en ${MINUTOS_PARA_REANUDAR_LO_LANZADO} min. Si se repite, el acuse del flujo «oficina · turno» no está llegando (revisa que responda 200 y no 401). Lo que una copia gaste ya se anota en el gasto del encargo.`, dry_run: enc.dry_run })
      } catch { /* la alarma nunca frena al vigía */ }
    }
  }
  // ② EL BRAZO DE VIDEO (parte 2 · 31-oct): los turnos `brazo` no son pasos muertos a los 12 min; el vigía SONDEA el estado del video en cada vuelta (≈ 5–8 min por video; plazo 45 min) y registra el paso cuando termina
  const vb = (await db.from('oficina_turnos').select('encargo_id,n,paso,tipo,inicio').eq('estado', 'corriendo').eq('tipo', 'brazo')) as { data: Fila[] | null; error: { message: string } | null }
  if (vb.error) throw new Error(`vigía · leer los turnos del brazo: ${vb.error.message}`)
  // 11-nov · #21 · el plazo del brazo sale de sus propios turnos terminados (nunca menos que los 45 min); si no se pueden leer, esta vuelta no vence ninguno (lo que no se lee no mata)
  const delBrazo = vb.data?.length ? await vida.duraciones(AGENTE_DEL_BRAZO) : null
  if (delBrazo && !delBrazo.ok) for (const t of vb.data ?? []) sin_dato.push({ encargo_id: String(t.encargo_id), paso: String(t.paso), motivo: `no se pudo leer el historial del brazo (${delBrazo.motivo})` })
  const techoDelBrazo = !delBrazo ? MINUTOS_PARA_ESPERAR_AL_BRAZO : delBrazo.ok ? Math.ceil(techoMedidoMs(MINUTOS_PARA_ESPERAR_AL_BRAZO * 60_000, delBrazo.valor) / 60_000) : Infinity
  const videos = await sondearVideos(P, (vb.data ?? []).map((t) => ({ encargo_id: String(t.encargo_id), n: Number(t.n), paso: String(t.paso), inicio: String(t.inicio) })), ahora, techoDelBrazo)
  const r = (await db.from('oficina_turnos').select('encargo_id,n,paso,tipo,agente,dispatch_key,workflow_execution_id,inicio').eq('estado', 'corriendo').lt('inicio', limite)) as { data: Fila[] | null; error: { message: string } | null }
  if (r.error) throw new Error(`vigía · leer los pasos vivos: ${r.error.message}`)
  const reanudar: string[] = [...reentregar, ...videos.reanudar], fallidos: string[] = [...videos.fallidos]
  const cierres: Array<{ encargo_id: string; resultado_para_la_sala: string; sala_ref: Record<string, unknown> | null; client_id: string; brief_id: string }> = [...videos.cierres]
  for (const t of r.data ?? []) {
    if (t.tipo === 'brazo') continue // el brazo tiene su propio plazo (arriba)
    const enc = await P.almacen.leerEncargo(String(t.encargo_id))
    if (!enc || ['cerrado', 'cerrado_por_tope', 'fallido', 'aprobada'].includes(enc.estado)) continue
    if (reentregar.includes(enc.id)) continue // se acaba de volver a entregar: no se da por muerto
    if (t.tipo === 'jefatura') {
      // J8a · la revisión de la jefatura tiene su propio plazo y su propio vigía: aquí solo se da por perdida pasado el plazo largo, y la pieza sigue marcada (nunca se pierde)
      if (String(t.inicio) >= limiteJefatura) continue
      await jefaturaSinRespuesta(P, enc.id, `la revisión de la jefatura no entregó en ${MINUTOS_PARA_ESPERAR_A_LA_JEFATURA} min`)
      reanudar.push(enc.id)
      continue
    }
    if (t.tipo === 'material') {
      // el portero tiene su propio plazo (20 min; techo 30): pasado el plazo se lee su pedido, pasado el techo se sigue SIN dato. Nunca es un «paso muerto» ni cierra el encargo como fallido
      const pl = await plantillaDe(P, enc)
      if (await resolverMaterialVencido(P, enc, pl, String(t.inicio), ahora) === 'cerrado') reanudar.push(enc.id)
      continue
    }
    // 11-nov · #21 · ¿sigue vivo? el techo medido de SU agente y su latido (nunca más corto que los 12 min de hoy). Lo que no se puede leer no mata: se anota y sigue igual
    const v = vidaDelPaso({ inicio: t.inicio as string | null, pisoMs: MINUTOS_PARA_DAR_POR_MUERTO * 60_000, duraciones: await vida.duraciones(t.agente as string | null), despacho: await vida.despacho(t.workflow_execution_id as string | null, t.agente as string | null) }, ahora)
    if (v.estado === 'sin_dato') { sin_dato.push({ encargo_id: enc.id, paso: String(t.paso), motivo: v.motivo }); continue }
    if (v.estado === 'vivo') continue
    const sinVuelta = v.motivo
    if (esTurnoDeLaMesa(String(t.paso))) {
      // LA MESA (bloqueante 6 de CC#3): un turno de especialista que no volvió NO mata la pieza ni se reintenta en círculo: queda anotado en el libro como turno fallido (la mesa lo reintenta hasta 3 veces por agente y luego sigue sin él)
      await recibirResultadoMesa(P, enc.id, Number(t.n), { error: sinVuelta, costo_usd: 0 })
      reanudar.push(enc.id)
      continue
    }
    const clave = `muerto:${String(t.paso)}`
    const veces = enc.estado_del_motor.vueltas[clave] ?? 0
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: enc.estado_del_motor, gasto_usd: enc.gasto_usd, turno: { n: Number(t.n), paso: String(t.paso), tipo: 'agente', agente: null, estado: 'muerto', dispatch_key: null, cost_usd: 0, error: sinVuelta } })
    if (veces >= 1) {
      // 11-nov · regla (b) · el turno que murió dos veces sin vuelta es un corte por causa nuestra (lo detecta el vigía): no cuenta entre las 3
      await fallar(P, enc, `el paso «${String(t.paso)}» murió dos veces (${sinVuelta})`, 'vigia_sin_vuelta')
      fallidos.push(enc.id)
      cierres.push({ encargo_id: enc.id, resultado_para_la_sala: 'fallido', sala_ref: enc.sala_ref, client_id: enc.client_id, brief_id: enc.brief_id })
      continue
    }
    const estado = { ...enc.estado_del_motor, vueltas: { ...enc.estado_del_motor.vueltas, [clave]: veces + 1 } }
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: estado, gasto_usd: enc.gasto_usd })
    reanudar.push(enc.id)
  }
  return sin_dato.length ? { reanudar, fallidos, cierres, sin_dato } : { reanudar, fallidos, cierres }
}
