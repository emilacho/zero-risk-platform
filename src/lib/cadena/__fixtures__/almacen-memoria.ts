/**
 * Almacén EN MEMORIA de la cadena · para las pruebas de los manejadores (sin base, sin red, US$ 0).
 * Imita las garantías de la base que importan: únicos, idempotencia de corridas/esperas, una campaña viva por cliente.
 */
import type { Almacen, BriefCreativoGuardado, Campana, ConceptoGuardado, ContextoDelCliente, Corrida, EntradaDeRegistro, EsperaFila, EstrategiaGuardada, FechaCobertura, ObjetoDeValidacion, ParteSecoAGuardar, PreguntaAlDueno, ResultadoDeAbrirRegistro } from '../almacen'
import type { LlaveDeFecha } from '../indicaciones'
import { claveDeFecha, ordenarLlaves } from '../fechas-del-cliente'
import type { PlazoCfg } from '../esperas'
import type { Fila, FormatosPorRed, Hallazgo } from '../tipos'
import type { FechaEspecialVerificada } from '../validador-calendario'
import { formatosDeLaMigracion } from './clientes'
import { InMemoryIngressTables, orchestrateIngress, type IngressEnvelope } from '../../sala-ingress'
import { InMemoryEventLogStorage } from '../../sala-event-log'
import type { ParteGuardada, ResultadoDeEmision, SobreDeProducir } from '../autoproducir'
import type { SobreDeLote } from '../arranque'
import type { SobreDePlan } from '../campanas'
import type { SobreDeTanda } from '../mesas'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(__dirname, '..', '..', '..', '..')

/** los plazos salen de la SIEMBRA REAL de la migración */
export function plazosDeLaMigracion(): PlazoCfg[] {
  const sql = readFileSync(join(RAIZ, 'supabase', 'migrations', '202610090200_cadena_tablas.sql'), 'utf8')
  const out: PlazoCfg[] = []
  // la siembra base + la de J7 (`revision_jefatura`), cada una con su propio INSERT
  const bloques = [sql.slice(sql.indexOf('INSERT INTO public.cadena_plazos'), sql.indexOf('ON CONFLICT (tipo)'))]
  try { const j7 = readFileSync(join(RAIZ, 'supabase', 'migrations', '202610151700_cadena_plazo_revision_jefatura.sql'), 'utf8'); bloques.push(j7.slice(j7.indexOf('INSERT INTO public.cadena_plazos'), j7.indexOf('ON CONFLICT (tipo)'))) } catch { /* sin la de J7: la base sola */ }
  // 31-oct (nuevo orden · T1): el plazo de la aprobación del concepto (`aprobacion_concepto` · seguir_esperando)
  try { const t1 = readFileSync(join(RAIZ, 'supabase', 'migrations', '202610312001_cadena_brief_creativo_y_conceptos.sql'), 'utf8'); const i = t1.indexOf('INSERT INTO public.cadena_plazos'); bloques.push(t1.slice(i, t1.indexOf('ON CONFLICT (tipo)', i))) } catch { /* sin la de T1 */ }
  for (const bloque of bloques) for (const m of bloque.matchAll(/\('([a-z_]+)',\s*(NULL|\d+),\s*(NULL|\d+),\s*(NULL|\d+),\s*(NULL|'[a-z_0-9]+'),\s*'([a-z_]+)'/g)) {
    const n = (x: string) => (x === 'NULL' ? null : Number(x))
    out.push({ tipo: m[1], recordatorio_horas: n(m[2]), alerta_horas: n(m[3]), vence_horas: n(m[4]), vence_regla: m[5] === 'NULL' ? null : m[5].replace(/'/g, ''), accion_al_vencer: m[6] })
  }
  return out
}

export interface SemillaMemoria {
  config?: Record<string, unknown>
  contextos?: Record<string, ContextoDelCliente>
  planes?: Record<string, { plan_id: string; fecha: string }[]>
  journeys?: { journeyId: string; clientId: string }[]
  fechasEspeciales?: FechaEspecialVerificada[]
  brazoVideo?: 'opera' | 'por_configurar' | 'no_existe' | null
  /** partes de trabajo guardados (autoproducir) */
  partes?: ParteGuardada[]
  /** el freno de gasto de este cliente (autoproducir) */
  frenoBloqueado?: boolean
  /** la sala (intake) apagada */
  intakeApagado?: boolean
}

export class AlmacenMemoria implements Almacen {
  config = new Map<string, unknown>([
    ['estado_cadena', 'apagada'], ['clientes_ensayo', []], ['dominios_fechas', {}], ['alertas_en_ensayo', 'registrar'], ['ultimo_latido', null], ['latido_max_horas', 18], ['plazo_llamada_agente_minutos', 6],
  ])
  campanas: Campana[] = []
  estrategias: EstrategiaGuardada[] = []
  briefsCreativos: BriefCreativoGuardado[] = []
  conceptos: ConceptoGuardado[] = []
  filasGuardadas: (Fila & { campana_id: string; calendario_version: number })[] = []
  validaciones: { campana_id: string; objeto: string; version: number; tanda: number | null; intento: number; hallazgos: Hallazgo[] }[] = []
  corridas: Corrida[] = []
  esperas: EsperaFila[] = []
  coberturas: FechaCobertura[] = []
  fechas: (FechaEspecialVerificada & { pais: string; client_id?: string | null })[] = []
  /** 10-nov · B: las marcas de «ya se avisó» por país y tipo (en la base, una sola ABIERTA por país y tipo) */
  marcasDeAlarma: { pais: string; tipo: string; cerrada: boolean }[] = []
  /** las abiertas, como `pais|tipo` */
  get alarmasDeFecha(): Set<string> { return new Set(this.marcasDeAlarma.filter((m) => !m.cerrada).map((m) => `${m.pais}|${m.tipo}`)) }
  /** el reloj de la base para `investigado_en` (sube en cada guardado: así se ordenan las llaves por uso) */
  private relojDeCobertura = 0
  /** lo que se mandó a #alertas */
  alarmasEnviadas: string[] = []
  /** para probar un envío que falla (sin llave, red o Slack sin `ok`) */
  falloDeAviso: string | null = null
  /** cuántas veces se intentó mandar (salga o no) */
  intentosDeAviso = 0
  /** 10-nov · C: lo que se le preguntó al dueño (con «repetida» si la misma pregunta sigue pendiente) */
  preguntasAlDueno: PreguntaAlDueno[] = []
  private seq = { campana: 0, corrida: 0, espera: 0 }
  /** la SALA de verdad (el orquestador de intake y su libro) con las filas de producción: la fuente `brief/parte-listo` y la regla `producir` → PIEZAS (puerta de la oficina) */
  sala = new InMemoryEventLogStorage()
  private salaTablas = new InMemoryIngressTables()
    .seedSource({ source: 'brief/parte-listo', tier: 'A', auth_method: 'internal_key', auth_secret_env_var: null, intents_allowed: ['producir'], description: 'prueba', active: true })
    .seedSource({ source: 'cadena/vigia', tier: 'A', auth_method: 'internal_key', auth_secret_env_var: null, intents_allowed: ['briefear'], description: 'prueba', active: true })
    .seedRule({ id: 'r-briefear', source: 'cadena/vigia', intent: 'briefear', journey_type: 'BRIEF', worker_workflow_id: 'pBAp5Cx7R39U585i', active: true, priority: 100, description: null })
    // 09-nov · E: la reapertura deja el MISMO sobre que planeación (las filas de producción: ingress_sources + routing_rules)
    .seedSource({ source: 'planeacion/plan-listo', tier: 'A', auth_method: 'internal_key', auth_secret_env_var: null, intents_allowed: ['briefear'], description: 'prueba', active: true })
    .seedRule({ id: 'r-plan-listo', source: 'planeacion/plan-listo', intent: 'briefear', journey_type: 'BRIEF', worker_workflow_id: 'pBAp5Cx7R39U585i', active: true, priority: 100, description: null })
    .seedRule({ id: 'r-producir', source: 'brief/parte-listo', intent: 'producir', journey_type: 'PIEZAS', worker_workflow_id: 'PzZ3b6cY6DYmIaOQ', active: true, priority: 100, description: null })
  /** cuántas veces se consultó el freno (para probar que lo SECO no lo consulta) */
  consultasDelFreno = 0
  constructor(private semilla: SemillaMemoria = {}) {
    for (const [k, v] of Object.entries(semilla.config ?? {})) this.config.set(k, v)
    this.fechas = (semilla.fechasEspeciales ?? []).map((f) => ({ ...f, pais: 'x' }))
  }
  async leerConfig(k: string) { return this.config.get(k) }
  async escribirConfig(k: string, v: unknown) { this.config.set(k, v) }
  /** J7 · lo que la jefatura decidiría; por omisión NO retiene (= la cadena de siempre). La prueba lo fija. */
  retencion: ((tipo: 'estrategia' | 'calendario' | 'registro', clientId: string) => Promise<{ retener: boolean; motivo: string }>) | null = null
  async retencionDeJefatura(tipo: 'estrategia' | 'calendario' | 'registro', clientId: string) { return this.retencion ? this.retencion(tipo, clientId) : { retener: false, motivo: 'jefatura_apagada' } }
  /** tramo 2 del revisor de registro · la apertura de la revisión; sin ella (null) el almacén no tiene el puerto (= la cadena de siempre). La prueba la fija y ve los sobres. */
  registro: ((entrada: EntradaDeRegistro) => Promise<ResultadoDeAbrirRegistro>) | null = null
  sobresDeRegistro: EntradaDeRegistro[] = []
  get abrirRevisionDeRegistro(): ((entrada: EntradaDeRegistro) => Promise<ResultadoDeAbrirRegistro>) | undefined {
    const f = this.registro
    return f ? async (entrada) => { this.sobresDeRegistro.push(structuredClone(entrada)); return f(entrada) } : undefined
  }
  async plazos() { return plazosDeLaMigracion() }
  async formatos(): Promise<FormatosPorRed> { return formatosDeLaMigracion() }
  async cargarContexto(clientId: string) { return this.semilla.contextos?.[clientId] ?? null }
  async resolverPlan(clientId: string, planId: string | null) {
    const ps = this.semilla.planes?.[clientId] ?? []
    return (planId ? ps.find((p) => p.plan_id === planId) : ps[ps.length - 1]) ?? null
  }
  async journeyExiste(journeyId: string, clientId: string) { return (this.semilla.journeys ?? []).some((j) => j.journeyId === journeyId && j.clientId === clientId) }
  // 🔴 la base devuelve COPIAS: un manejador que lee una campaña y luego la actualiza no ve su propio cambio (con referencias compartidas las pruebas mentirían)
  private copia<T>(x: T | undefined | null): T | null { return x ? structuredClone(x) : null }
  async campana(id: string) { return this.copia(this.campanas.find((c) => c.id === id)) }
  async campanaPorPlan(clientId: string, planId: string, seco: boolean) { return this.copia(this.campanas.find((c) => c.client_id === clientId && c.plan_id === planId && c.seco === seco)) }
  async campanaViva(clientId: string, seco: boolean) { return this.copia(this.campanas.find((c) => c.client_id === clientId && c.seco === seco && c.estado !== 'cerrada' && c.estado !== 'reemplazada')) }
  async insertarCampana(c: Omit<Campana, 'id'>) {
    if (this.campanas.some((x) => x.client_id === c.client_id && x.plan_id === c.plan_id)) throw new Error('23505 un plan, una campaña')
    if (c.estado !== 'cerrada' && c.estado !== 'reemplazada' && this.campanas.some((x) => x.client_id === c.client_id && x.seco === c.seco && x.estado !== 'cerrada' && x.estado !== 'reemplazada')) throw new Error('23505 una campaña viva por cliente')
    const n = { ...c, id: `camp-${++this.seq.campana}` } as Campana
    this.campanas.push(n)
    return structuredClone(n)
  }
  async actualizarCampana(id: string, patch: Partial<Campana>) {
    const c = this.campanas.find((x) => x.id === id)
    if (!c) throw new Error('no existe')
    Object.assign(c, patch)
    return structuredClone(c)
  }
  async actualizarCampanaSi(id: string, estado: Campana['estado'], patch: Partial<Campana>) {
    const c = this.campanas.find((x) => x.id === id)
    if (!c || c.estado !== estado) return null
    Object.assign(c, patch)
    return structuredClone(c)
  }
  async campanasEnEspera() { return structuredClone(this.campanas.filter((c) => c.estado === 'necesita_humano' || c.estado === 'pausada')) }
  async campanasEnArmado() { return structuredClone(this.campanas.filter((c) => c.estado === 'abierta' || c.estado === 'estrategia' || c.estado === 'calendario')) }
  async campanasActivas() { return structuredClone(this.campanas.filter((c) => c.estado === 'activa')) }
  async ultimaEstrategia(campanaId: string) { return this.estrategias.filter((e) => e.campana_id === campanaId).sort((a, b) => b.version - a.version)[0] ?? null }
  async insertarEstrategia(e: EstrategiaGuardada) { this.estrategias.push(e) }
  async estrategiaEnVersion(campanaId: string, version: number) { return this.estrategias.find((e) => e.campana_id === campanaId && e.version === version) ?? null }
  async insertarEstrategiaSiLibre(e: EstrategiaGuardada) { if (this.estrategias.some((x) => x.campana_id === e.campana_id && x.version === e.version)) return false; this.estrategias.push(e); return true }
  // 31-oct (nuevo orden · T1) · imita el UNIQUE (campana_id, version) de la base
  async ultimoBriefCreativo(campanaId: string) { return structuredClone(this.briefsCreativos.filter((b) => b.campana_id === campanaId).sort((a, b) => b.version - a.version)[0] ?? null) }
  async briefsDe(campanaId: string) { return structuredClone(this.briefsCreativos.filter((b) => b.campana_id === campanaId).sort((a, b) => a.version - b.version)) }
  async briefsVencidos(ahora: string) { return structuredClone(this.briefsCreativos.filter((b) => b.estado === 'borrador' && b.plazo_en && Date.parse(b.plazo_en) <= Date.parse(ahora))) }
  async insertarBriefCreativo(b: BriefCreativoGuardado) {
    if (this.briefsCreativos.some((x) => x.campana_id === b.campana_id && x.version === b.version)) throw Object.assign(new Error('duplicate key value violates unique constraint "cadena_brief_creativo_version"'), { code: '23505' })
    this.briefsCreativos.push(structuredClone(b))
  }
  async actualizarBriefCreativo(campanaId: string, version: number, patch: Partial<BriefCreativoGuardado>) {
    const b = this.briefsCreativos.find((x) => x.campana_id === campanaId && x.version === version)
    if (!b) throw new Error('no existe el brief creativo')
    Object.assign(b, patch)
  }
  async actualizarBriefCreativoSi(campanaId: string, version: number, estado: BriefCreativoGuardado['estado'], patch: Partial<BriefCreativoGuardado>) {
    const b = this.briefsCreativos.find((x) => x.campana_id === campanaId && x.version === version)
    if (!b || b.estado !== estado) return false
    Object.assign(b, patch)
    return true
  }
  async ultimoConcepto(campanaId: string) { return structuredClone(this.conceptos.filter((c) => c.campana_id === campanaId).sort((a, b) => b.version - a.version)[0] ?? null) }
  async insertarConcepto(c: ConceptoGuardado) {
    if (this.conceptos.some((x) => x.campana_id === c.campana_id && x.version === c.version)) throw Object.assign(new Error('duplicate key value violates unique constraint "cadena_conceptos_version"'), { code: '23505' })
    this.conceptos.push(structuredClone(c))
  }
  async actualizarConcepto(campanaId: string, version: number, patch: Partial<ConceptoGuardado>) {
    const c = this.conceptos.find((x) => x.campana_id === campanaId && x.version === version)
    if (!c) throw new Error('no existe el concepto')
    Object.assign(c, patch)
  }
  async actualizarConceptoSi(campanaId: string, version: number, estado: ConceptoGuardado['estado'], patch: Partial<ConceptoGuardado>) {
    const c = this.conceptos.find((x) => x.campana_id === campanaId && x.version === version)
    if (!c || c.estado !== estado) return false
    Object.assign(c, patch)
    return true
  }
  /** el libro de las mesas de la oficina, por encargo (09-nov · revalidar la gran idea) */
  libros: Record<string, Array<{ n: number; de: string; tipo: string; texto: string }>> = {}
  async libroDeLaMesa(encargoId: string) { return structuredClone(this.libros[encargoId] ?? []) }
  async conceptosVencidos(ahora: string) { return structuredClone(this.conceptos.filter((c) => c.estado === 'abierta' && c.plazo_en && Date.parse(c.plazo_en) <= Date.parse(ahora))) }
  async filas(campanaId: string, version?: number) { return structuredClone(this.filasGuardadas.filter((f) => f.campana_id === campanaId && (version === undefined || f.calendario_version === version))) }
  async guardarFilas(campanaId: string, version: number, _ev: number, filas: Fila[]) {
    for (const f of filas) {
      const i = this.filasGuardadas.findIndex((x) => x.campana_id === campanaId && x.calendario_version === version && x.id === f.id)
      const nueva = { ...f, campana_id: campanaId, calendario_version: version }
      if (i >= 0) this.filasGuardadas[i] = nueva
      else this.filasGuardadas.push(nueva)
    }
  }
  async cambiarEstadoDeFilas(campanaId: string, version: number, ids: string[], estado: Fila['estado']) {
    for (const f of this.filasGuardadas) if (f.campana_id === campanaId && f.calendario_version === version && ids.includes(f.id)) f.estado = estado
  }
  async ultimaVersionDeCalendario(campanaId: string) { return this.filasGuardadas.filter((f) => f.campana_id === campanaId).reduce((m, f) => Math.max(m, f.calendario_version), 0) }
  async guardarValidaciones(campanaId: string, objeto: ObjetoDeValidacion, version: number, tanda: number | null, intento: 1 | 2, hallazgos: Hallazgo[]) {
    this.validaciones.push({ campana_id: campanaId, objeto, version, tanda, intento, hallazgos })
  }
  async hallazgosQueBloquean(campanaId: string, tanda: number) {
    const v = this.validaciones.filter((x) => x.campana_id === campanaId && x.objeto === 'calendario' && x.tanda === tanda)
    const ultimo = v.reduce((m, x) => Math.max(m, x.intento), 0)
    return v.filter((x) => x.intento === ultimo).flatMap((x) => x.hallazgos).filter((h) => h.severidad === 'bloquea').map((h) => ({ ficha: h.ficha, fila_id: h.fila_id, chequeo: h.chequeo }))
  }
  async corridaPorClave(campanaId: string, paso: string, clave: string, intento: number) { return this.corridas.find((c) => c.campana_id === campanaId && c.paso === paso && c.clave_idempotencia === clave && c.intento === intento) ?? null }
  async abrirCorrida(c: Omit<Corrida, 'id'>) {
    const ya = await this.corridaPorClave(c.campana_id, c.paso, c.clave_idempotencia, c.intento)
    if (ya) return { corrida: ya, creada: false }
    if (c.estado === 'en_curso' && !c.plazo_en) throw new Error('una llamada en curso sin plazo')
    const n = { ...c, id: ++this.seq.corrida } as Corrida
    this.corridas.push(n)
    return { corrida: n, creada: true }
  }
  async cerrarCorrida(id: number, patch: Partial<Corrida>) {
    const c = this.corridas.find((x) => x.id === id)
    if (!c) throw new Error('no existe')
    Object.assign(c, patch)
  }
  async descartarCorrida(id: number) { this.corridas = this.corridas.filter((c) => !(c.id === id && c.estado === 'en_curso')) }
  async corridasDeCampana(campanaId: string) { return structuredClone(this.corridas.filter((c) => c.campana_id === campanaId)) }
  async corridasEnCurso() { return structuredClone(this.corridas.filter((c) => c.estado === 'en_curso')) }
  async abrirEspera(e: Omit<EsperaFila, 'id'>) {
    const ya = this.esperas.find((x) => x.dedup_key === e.dedup_key)
    if (ya) return { espera: ya, creada: false }
    if (!e.vence_en) throw new Error('una espera sin vence_en')
    const n = { ...e, id: ++this.seq.espera } as EsperaFila
    this.esperas.push(n)
    return { espera: n, creada: true }
  }
  // 31-oct (T3) · la bandeja de la gran idea y el libro de decisiones de Emilio, en memoria
  tarjetas: Array<Parameters<Almacen['abrirTarjetaDeConcepto']>[0] & { id: string; status: string; decision: Record<string, unknown> | null }> = []
  eventosDeEmilio: Array<Parameters<Almacen['registrarDecisionDeEmilio']>[0]> = []
  async conceptosDe(campanaId: string) { return structuredClone(this.conceptos.filter((c) => c.campana_id === campanaId).sort((a, b) => a.version - b.version)) }
  async abrirTarjetaDeConcepto(t: Parameters<Almacen['abrirTarjetaDeConcepto']>[0]) { const id = `hitl-${this.tarjetas.length + 1}`; this.tarjetas.push({ ...structuredClone(t), id, status: 'pending', decision: null }); return id }
  async cerrarTarjetaDeConcepto(hitlId: string, d: { status: 'approved' | 'rejected'; decision: Record<string, unknown> }) { const t = this.tarjetas.find((x) => x.id === hitlId); if (t) { t.status = d.status; t.decision = structuredClone(d.decision) } }
  async registrarDecisionDeEmilio(e: Parameters<Almacen['registrarDecisionDeEmilio']>[0]) { this.eventosDeEmilio.push(structuredClone(e)) }
  async esperasVivas() { return structuredClone(this.esperas.filter((e) => e.estado === 'viva')) }
  async actualizarEspera(id: number, patch: Partial<EsperaFila>) {
    const e = this.esperas.find((x) => x.id === id)
    if (e) Object.assign(e, patch)
  }
  async estadoDelBrazo() { return this.semilla.brazoVideo ?? 'por_configurar' }
  async coberturaDe(pais: string, tipo: string, ambito: string, anio: number) { return this.coberturas.find((c) => c.pais === pais && c.tipo === tipo && c.ambito_clave === ambito && c.anio === anio) ?? null }
  async guardarCobertura(c: FechaCobertura) {
    const i = this.coberturas.findIndex((x) => x.pais === c.pais && x.tipo === c.tipo && x.ambito_clave === c.ambito_clave && x.anio === c.anio)
    const conHora = { ...c, investigado_en: new Date(Date.UTC(2026, 0, 1) + ++this.relojDeCobertura * 1000).toISOString() } // como la base: cada guardado sella la hora
    if (i >= 0) this.coberturas[i] = conHora
    else this.coberturas.push(conHora)
  }
  async fechasEspeciales(_pais: string, tipos: string[], _desde?: string, _hasta?: string, clientId?: string) {
    return this.fechas.filter((f) => (!tipos.length || tipos.includes(f.tipo)) && (!f.client_id || f.client_id === clientId)).map(({ client_id: _c, ...f }) => f)
  }
  async llavesDeFechas(paisCrudo: string, clientId: string): Promise<LlaveDeFecha[]> {
    const pais = claveDeFecha(paisCrudo) // como la base: el país se guarda normalizado
    return ordenarLlaves([
      ...this.coberturas.filter((x) => x.pais === pais).map((c) => ({ llave: c.tipo, ambito: c.ambito_clave, cuando: c.investigado_en ?? null })),
      ...this.fechas.filter((x) => x.pais === pais && (!x.client_id || x.client_id === clientId)).map((f) => ({ llave: f.tipo, ambito: f.ambito, clase: f.origen === 'cliente' ? 'temporada_del_negocio' as const : 'feriado_publico' as const, cuando: null })),
    ])
  }
  async marcarAlarmaDeFecha(pais: string, tipo: string) { if (this.marcasDeAlarma.some((m) => !m.cerrada && m.pais === pais && m.tipo === tipo)) return false; this.marcasDeAlarma.push({ pais, tipo, cerrada: false }); return true }
  async cerrarAlarmaDeFecha(pais: string, tipo: string) { for (const m of this.marcasDeAlarma) if (!m.cerrada && m.pais === pais && m.tipo === tipo) m.cerrada = true }
  async avisarAlarma(texto: string) { this.intentosDeAviso++; if (this.falloDeAviso) return { ok: false, detalle: this.falloDeAviso }; this.alarmasEnviadas.push(texto); return { ok: true, detalle: 'entregado' } }
  async preguntarAlDueno(p: PreguntaAlDueno) {
    const ya = this.preguntasAlDueno.some((x) => x.client_id === p.client_id && x.tema === p.tema)
    if (!ya) this.preguntasAlDueno.push(p)
    return { ok: true, detalle: ya ? 'tu misma pregunta sigue pendiente' : 'preguntada' }
  }
  async parteDe(parteId: string): Promise<ParteGuardada | null> {
    const seco = this.partesSecos.find((p) => p.id === parteId)
    if (seco) { const t = seco.fila.provenance_tag; return { id: seco.id, client_id: seco.client_id, valido: t.valido === true, briefs: ((t.familias_por_brief as Array<Record<string, string | null>>) ?? []).map((b) => ({ brief_id: b.brief_id ?? null, fila_id: b.fila_id ?? null, familia: b.familia ?? null })) } }
    return this.semilla.partes?.find((p) => p.id === parteId) ?? null
  }
  /** r79 · D3 · los partes de ensayo guardados (marcados seco, con la llave de lote `seco:`) */
  partesSecos: { id: string; client_id: string; lote_key: string; fila: ParteSecoAGuardar['fila']; vence_en: string }[] = []
  async guardarParteSeco(p: ParteSecoAGuardar): Promise<string> {
    const lote_key = `seco:${p.lote}`
    const previo = this.partesSecos.find((x) => x.client_id === p.client_id && x.lote_key === lote_key)
    const fila = { ...p.fila, provenance_tag: { ...p.fila.provenance_tag, seco: true, prueba_seco: true, lote_key, vence_en: p.vence_en } }
    if (previo) { previo.fila = fila; previo.vence_en = p.vence_en; return previo.id }
    const id = `00000000-0000-4000-8000-${String(this.partesSecos.length + 1).padStart(12, '0')}`
    this.partesSecos.push({ id, client_id: p.client_id, lote_key, fila, vence_en: p.vence_en })
    return id
  }
  async limpiarPartesSecos(ahora: string): Promise<number> {
    const antes = this.partesSecos.length
    this.partesSecos = this.partesSecos.filter((p) => p.vence_en >= ahora)
    return antes - this.partesSecos.length
  }
  recolectadas: string[] = []
  async recolectarSedes(clientId: string) { this.recolectadas.push(clientId); return { ok: true, sedes: this.sedesDeLaFicha } }
  sedesDeLaFicha = 0
  async frenoDeGasto(_clientId: string) { this.consultasDelFreno++; return this.semilla.frenoBloqueado ? { bloqueado: true, motivo: 'over_cap' } : { bloqueado: false, motivo: 'under_cap' } }
  sobresEmitidos: unknown[] = []
  async emitirSobre(sobre: SobreDeProducir | SobreDeLote | SobreDePlan | SobreDeTanda): Promise<ResultadoDeEmision> {
    this.sobresEmitidos.push(sobre)
    if (this.semilla.intakeApagado) return { resultado: 'rechazado', detalle: 'intake_apagado' }
    const r = await orchestrateIngress({ envelope: sobre as unknown as IngressEnvelope, auth_request: { source: sobre.source, internal_key: process.env.INTERNAL_API_KEY, raw_body: JSON.stringify(sobre) }, tables: this.salaTablas, storage: this.sala })
    if (r.kind === 'accepted') return { resultado: 'aceptado', event_id: r.event_id }
    if (r.kind === 'duplicate') return { resultado: 'duplicado', event_id: r.event_id }
    return { resultado: 'rechazado', detalle: `${r.code} · ${r.detail}` }
  }
  /** la llave única de la base: (país, tipo, ámbito, fecha, cliente) · el repetido se reemplaza (upsert) */
  async guardarFechaEspecial(f: Parameters<Almacen['guardarFechaEspecial']>[0]) {
    const fila = { fecha: f.fecha, nombre: f.nombre, tipo: f.tipo, ambito: f.ambito, alcance: f.alcance === 'nacional' ? 'nacional' as const : 'local' as const, estado: f.estado, pais: f.pais, client_id: f.client_id ?? null, ...(f.hasta ? { hasta: f.hasta } : {}), ...(f.origen === 'cliente' ? { origen: 'cliente' as const } : {}) }
    const i = this.fechas.findIndex((x) => x.pais === f.pais && x.tipo === f.tipo && x.ambito === f.ambito && x.fecha === f.fecha && (x.client_id ?? null) === (f.client_id ?? null))
    if (i >= 0) this.fechas[i] = { ...fila, id: this.fechas[i]!.id }
    else this.fechas.push({ ...fila, id: `fe-${this.fechas.length + 1}` })
  }
}
