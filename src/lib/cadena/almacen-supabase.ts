/**
 * ALMACÉN DE LA CADENA sobre Supabase · el ÚNICO archivo, con las rutas, que nombra las tablas `cadena_*` (lo vigila una prueba).
 * La migración NO está aplicada: hasta entonces nada llega aquí. `client_id` es TEXTO en todas las tablas de la cadena.
 */
import { getSupabaseAdmin } from '@/lib/supabase'
import { almacenDeSupabase as almacenDeRecados } from '@/lib/sala-recados/almacen-supabase'
import type { Almacen, Campana, ContextoDelCliente, Corrida, EsperaFila, EstrategiaGuardada, FechaCobertura } from './almacen'
import { horarioDeNorm } from './horario'
import { normalizar } from './texto'
import type { ConfianzaTrozo, Fila, FormatosPorRed, Hallazgo, Referencia, SedeInfo } from './tipos'
import type { PlazoCfg } from './esperas'
import type { FechaEspecialVerificada } from './validador-calendario'

const fallo = (e: { message?: string; code?: string } | null): never => { throw Object.assign(new Error(e?.message ?? 'error de la base'), { code: e?.code }) }
const clave = (x: string) => normalizar(x).replace(/\s+/g, '_')
const FUENTE_FUERTE: Record<string, number> = { sitio: 3, instagram: 2, mapas: 1 }

export function almacenDeSupabase(): Almacen {
  const db = getSupabaseAdmin()
  const uno = async <T>(q: PromiseLike<{ data: unknown; error: { message?: string } | null }>): Promise<T | null> => { const { data, error } = await q; if (error) fallo(error); return (data as T | null) ?? null }
  const lista = async <T>(q: PromiseLike<{ data: unknown; error: { message?: string } | null }>): Promise<T[]> => { const { data, error } = await q; if (error) fallo(error); return (data as T[] | null) ?? [] }

  const almacen: Almacen = {
    async leerConfig(k) { return (await uno<{ valor: unknown }>(db.from('cadena_config').select('valor').eq('clave', k).maybeSingle()))?.valor },
    async escribirConfig(k, v) { const { error } = await db.from('cadena_config').upsert({ clave: k, valor: v, actualizado_en: new Date().toISOString() }); if (error) fallo(error) },
    async plazos() { return lista<PlazoCfg>(db.from('cadena_plazos').select('*').limit(100)) },
    async formatos() {
      const out: FormatosPorRed = {}
      for (const f of await lista<{ red: string; formato: string; lead_dias: number; produccion: 'opera' | 'espera_brazo'; max_por_dia: number | null }>(db.from('cadena_formatos_por_red').select('*').limit(500))) (out[f.red] ??= []).push({ formato: f.formato, produccion: f.produccion, lead_dias: f.lead_dias, max_por_dia: f.max_por_dia })
      return out
    },

    async resolverPlan(clientId, planId) {
      let q = db.from('client_historical_outputs').select('id, created_at').eq('client_id', clientId).eq('output_type', 'campaign_plan_90d').order('created_at', { ascending: false }).limit(1)
      if (planId) q = db.from('client_historical_outputs').select('id, created_at').eq('client_id', clientId).eq('output_type', 'campaign_plan_90d').eq('id', planId).limit(1)
      const f = (await lista<{ id: string; created_at: string }>(q))[0]
      return f ? { plan_id: f.id, fecha: f.created_at.slice(0, 10) } : null
    },
    async journeyExiste(journeyId, clientId) {
      return (await lista<{ stream_id: string }>(db.from('sala_event_log').select('stream_id').eq('stream_id', journeyId).eq('client_id', clientId).limit(1))).length > 0
    },
    // el estado del brazo lo lee el almacén de la sala (el ÚNICO que nombra esas tablas: lo vigila una prueba permanente)
    async estadoDelBrazo(destino) { return (await almacenDeRecados().leerDestino(destino))?.estado_del_brazo ?? null },

    async cargarContexto(clientId, planId): Promise<ContextoDelCliente | null> {
      const plan = await uno<{ content_text: string | null; content: string | null; created_at: string }>(db.from('client_historical_outputs').select('content_text, content, created_at').eq('id', planId).eq('client_id', clientId).maybeSingle())
      if (!plan) return null
      const planTexto = plan.content_text ?? plan.content ?? ''
      if (!planTexto) return null
      const cli = await uno<{ name: string; country: string | null; config: Record<string, unknown> | null }>(db.from('clients').select('name, country, config').eq('id', clientId).maybeSingle())
      const manual = (await lista<{ id: string; content_text: string | null; forbidden_words: unknown }>(db.from('client_brand_books').select('id, content_text, forbidden_words, version').eq('client_id', clientId).order('version', { ascending: false }).limit(1)))[0]
      const zonaPorDefecto = await almacen.leerConfig('zona_horaria_por_defecto')
      const refs: Referencia[] = [{ id: planId, client_id: clientId, origen: 'plan', texto: planTexto }]
      if (manual?.content_text) refs.push({ id: `manual:${manual.id}`, client_id: clientId, origen: 'manual', texto: manual.content_text })

      // 🔴 las fichas del cerebro NO se leen aquí: solo el portero del cerebro toca esas tablas (prueba permanente `cerebro-paso-2-aislamiento`).
      //    Hasta que el portero tenga una puerta de LECTURA para la cadena, el cliente no aporta fichas firmadas (F0): la jerarquía corre sobre el manual, el plan y las observaciones de sede.
      const sedesDb = await lista<{ id: string; clave: string; ciudad: string }>(db.from('client_sedes').select('id, clave, ciudad').eq('client_id', clientId).limit(50))
      const datos = await lista<{ id: string; sede_id: string | null; campo: string; valor_texto: string; valor_norm: unknown; fuente: 'sitio' | 'instagram' | 'mapas'; observado_en: string }>(
        db.from('client_sede_datos').select('id, sede_id, campo, valor_texto, valor_norm, fuente, observado_en').eq('client_id', clientId).order('observado_en', { ascending: false }).limit(500),
      )
      const claveDe = new Map(sedesDb.map((s) => [s.id, s.clave]))
      const vistos = new Set<string>()
      for (const d of datos) {
        const k = `${d.sede_id}|${d.campo}|${d.fuente}`
        if (vistos.has(k)) continue // solo la última observación de cada fuente
        vistos.add(k)
        refs.push({ id: `sede:${d.id}`, client_id: clientId, origen: 'sede_datos', fuente: d.fuente, sede: d.sede_id ? claveDe.get(d.sede_id) ?? null : null, texto: `${d.campo}: ${d.valor_texto}`, observado_en: d.observado_en })
      }
      const sedes: SedeInfo[] = sedesDb.map((s) => {
        const horarios = datos.filter((d) => d.sede_id === s.id && d.campo === 'horario' && horarioDeNorm(d.valor_norm)).sort((a, b) => (FUENTE_FUERTE[b.fuente] ?? 0) - (FUENTE_FUERTE[a.fuente] ?? 0) || b.observado_en.localeCompare(a.observado_en))
        return { clave: s.clave, nombre: s.ciudad, telefono: null, horario: horarios[0] ? horarioDeNorm(horarios[0].valor_norm) : null }
      })
      for (const t of await lista<{ id: string; chunk_text: string; provenance_tag: { trust_level?: string } | null }>(db.from('client_brain_chunks').select('id, chunk_text, provenance_tag').eq('client_id', clientId).limit(200))) {
        const nivel = t.provenance_tag?.trust_level
        const confianza: ConfianzaTrozo = nivel === 'system_trusted' || nivel === 'tenant_trusted' || nivel === 'untrusted' ? nivel : 'unknown'
        refs.push({ id: `chunk:${t.id}`, client_id: clientId, origen: 'trozo', confianza, texto: t.chunk_text })
      }
      const fw = Array.isArray(manual?.forbidden_words) ? (manual!.forbidden_words as unknown[]).filter((x): x is string => typeof x === 'string') : []
      const zonaCfg = typeof cli?.config?.timezone === 'string' ? (cli.config.timezone as string) : null
      return {
        clientId, nombreDelNegocio: cli?.name ?? '', pais: cli?.country ?? null, zonaHoraria: zonaCfg ?? (typeof zonaPorDefecto === 'string' ? zonaPorDefecto : 'UTC'),
        planTexto, manualTexto: manual?.content_text ?? '', forbiddenWords: fw, sedes, referencias: refs, fechaDelPlan: plan.created_at.slice(0, 10),
      }
    },

    async campana(id) { return uno<Campana>(db.from('cadena_campanas').select('*').eq('id', id).maybeSingle()) },
    async campanaPorPlan(clientId, planId, seco) { return uno<Campana>(db.from('cadena_campanas').select('*').eq('client_id', clientId).eq('plan_id', planId).eq('seco', seco).maybeSingle()) },
    async campanaViva(clientId, seco) { return (await lista<Campana>(db.from('cadena_campanas').select('*').eq('client_id', clientId).eq('seco', seco).not('estado', 'in', '(cerrada,reemplazada)').limit(1)))[0] ?? null },
    async insertarCampana(c) { const { data, error } = await db.from('cadena_campanas').insert(c).select().single(); if (error) fallo(error); return data as Campana },
    async actualizarCampana(id, patch) { const { data, error } = await db.from('cadena_campanas').update({ ...patch, actualizada_en: new Date().toISOString() }).eq('id', id).select().single(); if (error) fallo(error); return data as Campana },
    async campanasEnEspera() { return lista<Campana>(db.from('cadena_campanas').select('*').in('estado', ['necesita_humano', 'pausada']).limit(500)) },
    async campanasEnArmado() { return lista<Campana>(db.from('cadena_campanas').select('*').in('estado', ['abierta', 'estrategia', 'calendario']).limit(500)) },
    async campanasActivas() { return lista<Campana>(db.from('cadena_campanas').select('*').eq('estado', 'activa').limit(500)) },

    async ultimaEstrategia(campanaId) { return (await lista<EstrategiaGuardada>(db.from('cadena_estrategias').select('*').eq('campana_id', campanaId).order('version', { ascending: false }).limit(1)))[0] ?? null },
    async insertarEstrategia(e) { const { error } = await db.from('cadena_estrategias').insert(e); if (error) fallo(error) },

    async filas(campanaId, version) {
      let q = db.from('cadena_calendario_filas').select('*').eq('campana_id', campanaId).limit(5000)
      if (version !== undefined) q = q.eq('calendario_version', version)
      return (await lista<Record<string, unknown>>(q)).map((r) => ({ ...r, hora: typeof r.hora === 'string' ? (r.hora as string).slice(0, 5) : null })) as unknown as Fila[]
    },
    async guardarFilas(campanaId, version, estrategiaVersion, filas, seco) {
      if (!filas.length) return
      const { error } = await db.from('cadena_calendario_filas').upsert(filas.map((f) => ({
        id: f.id, campana_id: campanaId, estrategia_version: estrategiaVersion, calendario_version: version, tanda: f.tanda, semana: f.semana, dia_semana: f.dia_semana, fecha: f.fecha,
        hora: f.hora, red: f.red, formato: f.formato, pilar: f.pilar, tema: f.tema, sede: f.sede, requiere_abierto: f.requiere_abierto, depende_de: f.depende_de, datos: f.datos,
        pendientes: f.pendientes, pieza_fija: f.pieza_fija, origen: f.origen, estado: f.estado, avisos: f.avisos, seco,
      })), { onConflict: 'campana_id,calendario_version,id' })
      if (error) fallo(error)
    },
    async cambiarEstadoDeFilas(campanaId, version, ids, estado) { const { error } = await db.from('cadena_calendario_filas').update({ estado }).eq('campana_id', campanaId).eq('calendario_version', version).in('id', ids); if (error) fallo(error) },
    async ultimaVersionDeCalendario(campanaId) { return (await lista<{ calendario_version: number }>(db.from('cadena_calendario_filas').select('calendario_version').eq('campana_id', campanaId).order('calendario_version', { ascending: false }).limit(1)))[0]?.calendario_version ?? 0 },

    async guardarValidaciones(campanaId, objeto, version, tanda, intento, hallazgos: Hallazgo[], seco) {
      if (!hallazgos.length) return
      const { error } = await db.from('cadena_validaciones').insert(hallazgos.map((h) => ({ campana_id: campanaId, objeto, objeto_version: version, tanda, intento, chequeo: h.chequeo, severidad: h.severidad, fila_id: h.fila_id, ficha: h.ficha, seco })))
      if (error) fallo(error)
    },

    async corridaPorClave(campanaId, paso, k, intento) { return uno<Corrida>(db.from('cadena_corridas').select('*').eq('campana_id', campanaId).eq('paso', paso).eq('clave_idempotencia', k).eq('intento', intento).maybeSingle()) },
    async abrirCorrida(c) {
      const { data, error } = await db.from('cadena_corridas').insert(c).select().single()
      if (error) {
        if ((error as { code?: string }).code === '23505') { const ya = await almacen.corridaPorClave(c.campana_id, c.paso, c.clave_idempotencia, c.intento); if (ya) return { corrida: ya, creada: false } }
        fallo(error)
      }
      return { corrida: data as Corrida, creada: true }
    },
    async cerrarCorrida(id, patch) { const { error } = await db.from('cadena_corridas').update({ ...patch, terminada_en: patch.estado && patch.estado !== 'en_curso' ? new Date().toISOString() : null }).eq('id', id); if (error) fallo(error) },
    async descartarCorrida(id) { const { error } = await db.from('cadena_corridas').delete().eq('id', id).eq('estado', 'en_curso'); if (error) fallo(error) },
    async corridasDeCampana(campanaId) { return lista<Corrida>(db.from('cadena_corridas').select('*').eq('campana_id', campanaId).limit(1000)) },
    async corridasEnCurso() { return lista<Corrida>(db.from('cadena_corridas').select('*').eq('estado', 'en_curso').limit(1000)) },

    async abrirEspera(e) {
      const { data, error } = await db.from('cadena_esperas').insert(e).select().single()
      if (error) {
        if ((error as { code?: string }).code === '23505') { const ya = await uno<EsperaFila>(db.from('cadena_esperas').select('*').eq('dedup_key', e.dedup_key).maybeSingle()); if (ya) return { espera: ya, creada: false } }
        fallo(error)
      }
      return { espera: data as EsperaFila, creada: true }
    },
    async esperasVivas() { return lista<EsperaFila>(db.from('cadena_esperas').select('*').eq('estado', 'viva').limit(5000)) },
    async actualizarEspera(id, patch) { const { error } = await db.from('cadena_esperas').update(patch).eq('id', id); if (error) fallo(error) },

    async coberturaDe(pais, tipo, ambito, anio) { return uno<FechaCobertura>(db.from('cadena_fechas_cobertura').select('*').eq('pais', pais).eq('tipo', tipo).eq('ambito_clave', ambito).eq('anio', anio).maybeSingle()) },
    async guardarCobertura(c) { const { error } = await db.from('cadena_fechas_cobertura').upsert({ ...c, investigado_en: new Date().toISOString() }); if (error) fallo(error) },
    async fechasEspeciales(pais, tipos, desde, hasta) {
      let q = db.from('cadena_fechas_especiales').select('id, fecha, nombre, tipo, ambito, alcance, estado').eq('pais', clave(pais)).gte('fecha', desde).lte('fecha', hasta).limit(2000)
      if (tipos.length) q = q.in('tipo', tipos.map(clave))
      return (await lista<{ id: number; fecha: string; nombre: string; tipo: string; ambito: string; alcance: string | null; estado: 'verificada' | 'pendiente' }>(q)).map((f): FechaEspecialVerificada => ({ id: String(f.id), fecha: f.fecha, nombre: f.nombre, tipo: f.tipo, ambito: f.ambito, alcance: f.alcance === 'nacional' ? 'nacional' : 'local', estado: f.estado }))
    },
    async guardarFechaEspecial(f) { const { error } = await db.from('cadena_fechas_especiales').upsert({ ...f, verificado_en: f.estado === 'verificada' ? new Date().toISOString() : null, verificado_por: f.estado === 'verificada' ? 'codigo' : null }, { onConflict: 'pais,tipo,ambito,fecha' }); if (error) fallo(error) },
  }
  return almacen
}
