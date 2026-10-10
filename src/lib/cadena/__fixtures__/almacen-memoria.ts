/**
 * Almacén EN MEMORIA de la cadena · para las pruebas de los manejadores (sin base, sin red, US$ 0).
 * Imita las garantías de la base que importan: únicos, idempotencia de corridas/esperas, una campaña viva por cliente.
 */
import type { Almacen, Campana, ContextoDelCliente, Corrida, EsperaFila, EstrategiaGuardada, FechaCobertura } from '../almacen'
import type { PlazoCfg } from '../esperas'
import type { Fila, FormatosPorRed, Hallazgo } from '../tipos'
import type { FechaEspecialVerificada } from '../validador-calendario'
import { formatosDeLaMigracion } from './clientes'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const RAIZ = join(__dirname, '..', '..', '..', '..')

/** los plazos salen de la SIEMBRA REAL de la migración */
export function plazosDeLaMigracion(): PlazoCfg[] {
  const sql = readFileSync(join(RAIZ, 'supabase', 'migrations', '202610090200_cadena_tablas.sql'), 'utf8')
  const bloque = sql.slice(sql.indexOf('INSERT INTO public.cadena_plazos'), sql.indexOf('ON CONFLICT (tipo)'))
  const out: PlazoCfg[] = []
  for (const m of bloque.matchAll(/\('([a-z_]+)',\s*(NULL|\d+),\s*(NULL|\d+),\s*(NULL|\d+),\s*(NULL|'[a-z_0-9]+'),\s*'([a-z_]+)'/g)) {
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
}

export class AlmacenMemoria implements Almacen {
  config = new Map<string, unknown>([
    ['estado_cadena', 'apagada'], ['clientes_ensayo', []], ['dominios_fechas', {}], ['alertas_en_ensayo', 'registrar'], ['ultimo_latido', null], ['latido_max_horas', 18], ['plazo_llamada_agente_minutos', 6],
  ])
  campanas: Campana[] = []
  estrategias: EstrategiaGuardada[] = []
  filasGuardadas: (Fila & { campana_id: string; calendario_version: number })[] = []
  validaciones: { campana_id: string; objeto: string; version: number; tanda: number | null; intento: number; hallazgos: Hallazgo[] }[] = []
  corridas: Corrida[] = []
  esperas: EsperaFila[] = []
  coberturas: FechaCobertura[] = []
  fechas: (FechaEspecialVerificada & { pais: string })[] = []
  private seq = { campana: 0, corrida: 0, espera: 0 }
  constructor(private semilla: SemillaMemoria = {}) {
    for (const [k, v] of Object.entries(semilla.config ?? {})) this.config.set(k, v)
    this.fechas = (semilla.fechasEspeciales ?? []).map((f) => ({ ...f, pais: 'x' }))
  }
  async leerConfig(k: string) { return this.config.get(k) }
  async escribirConfig(k: string, v: unknown) { this.config.set(k, v) }
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
  async campanasEnEspera() { return structuredClone(this.campanas.filter((c) => c.estado === 'necesita_humano' || c.estado === 'pausada')) }
  async campanasActivas() { return structuredClone(this.campanas.filter((c) => c.estado === 'activa')) }
  async ultimaEstrategia(campanaId: string) { return this.estrategias.filter((e) => e.campana_id === campanaId).sort((a, b) => b.version - a.version)[0] ?? null }
  async insertarEstrategia(e: EstrategiaGuardada) { this.estrategias.push(e) }
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
  async guardarValidaciones(campanaId: string, objeto: 'estrategia' | 'calendario' | 'brief', version: number, tanda: number | null, intento: 1 | 2, hallazgos: Hallazgo[]) {
    this.validaciones.push({ campana_id: campanaId, objeto, version, tanda, intento, hallazgos })
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
  async esperasVivas() { return structuredClone(this.esperas.filter((e) => e.estado === 'viva')) }
  async actualizarEspera(id: number, patch: Partial<EsperaFila>) {
    const e = this.esperas.find((x) => x.id === id)
    if (e) Object.assign(e, patch)
  }
  async estadoDelBrazo() { return this.semilla.brazoVideo ?? 'por_configurar' }
  async coberturaDe(pais: string, tipo: string, ambito: string, anio: number) { return this.coberturas.find((c) => c.pais === pais && c.tipo === tipo && c.ambito_clave === ambito && c.anio === anio) ?? null }
  async guardarCobertura(c: FechaCobertura) {
    const i = this.coberturas.findIndex((x) => x.pais === c.pais && x.tipo === c.tipo && x.ambito_clave === c.ambito_clave && x.anio === c.anio)
    if (i >= 0) this.coberturas[i] = c
    else this.coberturas.push(c)
  }
  async fechasEspeciales(_pais: string, tipos: string[]) { return this.fechas.filter((f) => !tipos.length || tipos.includes(f.tipo)) }
  async guardarFechaEspecial(f: { pais: string; tipo: string; ambito: string; anio: number; fecha: string; nombre: string; alcance: string; estado: 'verificada' | 'pendiente' }) {
    this.fechas.push({ id: `fe-${this.fechas.length + 1}`, fecha: f.fecha, nombre: f.nombre, tipo: f.tipo, ambito: f.ambito, alcance: f.alcance === 'nacional' ? 'nacional' : 'local', estado: f.estado, pais: f.pais })
  }
}
