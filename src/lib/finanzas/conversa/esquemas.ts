/**
 * F8 · LOS CONTRATOS DE LA CONVERSACIÓN (CC#1 · 14-oct) · diseño v2 rev. 9 §6b. Puro. Sin red, sin modelo.
 * Cada agente contesta JSON; el CÓDIGO lo valida ANTES de usarlo (un formato roto no entra: reintento de formato una vez; si sigue roto, el turno queda «sin supuestos del agente» y la conversación sigue).
 *  · planteo.v1            → el proponente del plan (meta, zonas, días, evento, canales, producción) y su versión fijada
 *  · consulta_financiera.v1 → un especialista (supuestos con rango, mínimo, preguntas a otros, alertas)
 *  · acuerdo.v1            → el jefe (salida + hallazgos + a quién alude)
 *  · procedencia.v1        → de dónde sale cada dato del expediente (medido · de ensayo · supuesto)
 * AGNÓSTICO: ningún rubro, ciudad ni producto; los nombres de los canales son claves de catálogo (datos).
 */
export type Resultado<T> = { ok: true; valor: T } | { ok: false; errores: string[] }

export const ESPECIALISTAS = ['fpa', 'redes', 'busqueda', 'medicion'] as const
export type Especialista = (typeof ESPECIALISTAS)[number]
export const SALIDAS_DEL_JEFE = ['sale', 'sale_ajustada', 'sale_con_alerta'] as const
export type Salida = (typeof SALIDAS_DEL_JEFE)[number]
export const SEVERIDADES = ['critico', 'alto', 'medio', 'bajo'] as const

const finito = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const objeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const texto = (v: unknown, max = 2000): v is string => typeof v === 'string' && v.trim().length > 0 && v.length <= max

export interface Rango { min: number; max: number; base?: number }
const rangoDe = (v: unknown, nombre: string, e: string[], opciones: { positivo?: boolean; fraccion?: boolean } = {}): Rango | undefined => {
  if (v === undefined || v === null) return undefined
  if (!objeto(v) || !finito(v.min) || !finito(v.max) || v.max < v.min || (v.base !== undefined && (!finito(v.base) || v.base < v.min || v.base > v.max))) { e.push(`${nombre}: debe ser { min, max, base? } con min ≤ base ≤ max`); return undefined }
  if (opciones.positivo && v.min <= 0) e.push(`${nombre}: min debe ser > 0`)
  if (opciones.fraccion && (v.min < 0 || v.max > 1)) e.push(`${nombre}: debe estar entre 0 y 1`)
  return { min: v.min as number, max: v.max as number, ...(v.base !== undefined ? { base: v.base as number } : {}) }
}

// ───────────────────────────────────────────────────────── planteo.v1
export interface CanalPlanteado { canal: string; peso: number; piso_diario?: number; activo?: boolean; condicion?: string }
export interface PlanteoV1 {
  meta_por_semana: number
  meta_ambiciosa_por_semana?: number
  zonas: string[]
  dias_y_horarios: { dias_activos_por_semana: number; horario?: string }
  evento: string
  canales: CanalPlanteado[]
  produccion?: { fraccion?: number; monto?: number }
  marca?: number
  horizonte_dias?: number
  ciclo_dias?: number
  /** lo que el proponente dice que NO sabe, y lo que dio por verificado */
  no_se: string[]
  dado_por_verificado?: string[]
  /** plan v3 · V7: la respuesta del proponente cuando la meta NO cubre el equilibrio (obligatoria en el ajuste en ese caso) */
  equilibrio_respuesta?: { decision: (typeof DECISIONES_DE_EQUILIBRIO)[number]; motivo: string }
}
export const DECISIONES_DE_EQUILIBRIO = ['subo_la_meta', 'mantengo_la_meta', 'no_aplica'] as const
/** ¿trae una respuesta válida al equilibrio? (la exige el paso `ajuste` solo cuando la meta no lo cubre) */
export function respuestaDeEquilibrioValida(v: unknown): boolean {
  if (!objeto(v) || !objeto(v.equilibrio_respuesta)) return false
  const r = v.equilibrio_respuesta
  return (DECISIONES_DE_EQUILIBRIO as readonly string[]).includes(String(r.decision)) && texto(r.motivo, 400)
}
export function validarPlanteo(v: unknown): Resultado<PlanteoV1> {
  const e: string[] = []
  if (!objeto(v)) return { ok: false, errores: ['planteo: debe ser un objeto'] }
  if (!finito(v.meta_por_semana) || v.meta_por_semana <= 0) e.push('meta_por_semana debe ser un número > 0')
  if (v.meta_ambiciosa_por_semana !== undefined && (!finito(v.meta_ambiciosa_por_semana) || v.meta_ambiciosa_por_semana <= 0)) e.push('meta_ambiciosa_por_semana debe ser > 0')
  if (!Array.isArray(v.zonas) || !v.zonas.every((z) => texto(z, 80))) e.push('zonas debe ser una lista de textos')
  const d = v.dias_y_horarios
  if (!objeto(d) || !finito(d.dias_activos_por_semana) || d.dias_activos_por_semana < 1 || d.dias_activos_por_semana > 7) e.push('dias_y_horarios.dias_activos_por_semana debe estar entre 1 y 7')
  if (!texto(v.evento, 60)) e.push('evento es obligatorio')
  if (!Array.isArray(v.canales)) e.push('canales debe ser una lista')
  else v.canales.forEach((c, i) => {
    if (!objeto(c) || !texto(c.canal, 60)) { e.push(`canales[${i}].canal es obligatorio`); return }
    if (!finito(c.peso) || c.peso < 0 || c.peso > 1) e.push(`canales[${i}].peso entre 0 y 1`)
    if (c.piso_diario !== undefined && (!finito(c.piso_diario) || c.piso_diario < 0)) e.push(`canales[${i}].piso_diario ≥ 0`)
  })
  if (v.produccion !== undefined) {
    const p = v.produccion
    if (!objeto(p) || (p.fraccion === undefined && p.monto === undefined)) e.push('produccion debe traer fraccion o monto')
    else {
      if (p.fraccion !== undefined && (!finito(p.fraccion) || p.fraccion < 0 || p.fraccion > 1)) e.push('produccion.fraccion entre 0 y 1')
      if (p.monto !== undefined && (!finito(p.monto) || p.monto < 0)) e.push('produccion.monto ≥ 0')
    }
  }
  if (v.marca !== undefined && (!finito(v.marca) || v.marca < 0 || v.marca >= 1)) e.push('marca debe estar entre 0 y 1 (sin incluir 1)')
  if (v.horizonte_dias !== undefined && (!finito(v.horizonte_dias) || v.horizonte_dias <= 0)) e.push('horizonte_dias > 0')
  if (v.ciclo_dias !== undefined && (!finito(v.ciclo_dias) || v.ciclo_dias < 0)) e.push('ciclo_dias ≥ 0')
  if (!Array.isArray(v.no_se) || !v.no_se.every((x) => typeof x === 'string')) e.push('no_se debe ser una lista de textos (puede ir vacía)')
  if (v.equilibrio_respuesta !== undefined && !respuestaDeEquilibrioValida(v)) e.push(`equilibrio_respuesta debe ser { decision: ${DECISIONES_DE_EQUILIBRIO.join(' | ')}, motivo }`)
  // el proponente no pone costos ni montos de pauta: eso lo ponen finanzas (y «nunca fijar presupuestos sin aprobación humana»)
  for (const prohibido of ['costo_por_resultado', 'presupuesto', 'pauta_mensual', 'techo']) if (prohibido in v) e.push(`el planteo no lleva «${prohibido}»: lo calcula finanzas`)
  if (e.length) return { ok: false, errores: e }
  return { ok: true, valor: v as unknown as PlanteoV1 }
}

// ───────────────────────────────────────────────────────── consulta_financiera.v1
export interface ConsultaV1 {
  agente: string
  resumen: string
  supuestos: {
    ticket?: Rango; margen?: Rango; costo_entrega?: Rango; periodos?: Rango
    tasa_cierre?: Rango; costo_por_resultado?: Rango
    costo_por_resultado_alterno?: Rango
  }
  minimo_diario_por_conjunto?: number
  preguntas_a_otros: Array<{ a: string; pregunta: string }>
  alertas: string[]
}
export function validarConsulta(v: unknown): Resultado<ConsultaV1> {
  const e: string[] = []
  if (!objeto(v)) return { ok: false, errores: ['consulta: debe ser un objeto'] }
  if (!texto(v.agente, 80)) e.push('agente es obligatorio')
  if (!texto(v.resumen, 4000)) e.push('resumen es obligatorio')
  const s = objeto(v.supuestos) ? v.supuestos : null
  if (!s) e.push('supuestos debe ser un objeto (puede ir vacío)')
  else {
    rangoDe(s.ticket, 'supuestos.ticket', e, { positivo: true })
    rangoDe(s.margen, 'supuestos.margen', e, { fraccion: true })
    rangoDe(s.costo_entrega, 'supuestos.costo_entrega', e)
    rangoDe(s.periodos, 'supuestos.periodos', e, { positivo: true })
    rangoDe(s.tasa_cierre, 'supuestos.tasa_cierre', e, { positivo: true, fraccion: true })
    rangoDe(s.costo_por_resultado, 'supuestos.costo_por_resultado', e, { positivo: true })
    rangoDe(s.costo_por_resultado_alterno, 'supuestos.costo_por_resultado_alterno', e, { positivo: true })
  }
  if (v.minimo_diario_por_conjunto !== undefined && (!finito(v.minimo_diario_por_conjunto) || v.minimo_diario_por_conjunto < 0)) e.push('minimo_diario_por_conjunto ≥ 0')
  if (!Array.isArray(v.preguntas_a_otros) || !v.preguntas_a_otros.every((p) => objeto(p) && texto(p.a, 40) && texto(p.pregunta, 600))) e.push('preguntas_a_otros debe ser una lista de { a, pregunta }')
  else if (v.preguntas_a_otros.length > 3) e.push('preguntas_a_otros: máximo 3')
  if (!Array.isArray(v.alertas) || !v.alertas.every((a) => typeof a === 'string')) e.push('alertas debe ser una lista de textos')
  if (e.length) return { ok: false, errores: e }
  return { ok: true, valor: v as unknown as ConsultaV1 }
}

// ───────────────────────────────────────────────────────── acuerdo.v1
export interface HallazgoDelJefe { severidad: (typeof SEVERIDADES)[number]; que: string; alude?: Especialista | 'plan' }
export interface AcuerdoV1 {
  salida: Salida
  hallazgos: HallazgoDelJefe[]
  conflictos_resueltos: string[]
  dato_que_no_bloquea?: string
  preguntas_a_emilio: Array<{ clave: string; texto: string; recomendacion: string; supuesto_si_no_responde: string }>
}
export function validarAcuerdo(v: unknown): Resultado<AcuerdoV1> {
  const e: string[] = []
  if (!objeto(v)) return { ok: false, errores: ['acuerdo: debe ser un objeto'] }
  if (typeof v.salida !== 'string' || !(SALIDAS_DEL_JEFE as readonly string[]).includes(v.salida)) e.push('salida debe ser sale, sale_ajustada o sale_con_alerta (nunca «no sale»: lo financiero no bloquea)')
  if (!Array.isArray(v.hallazgos)) e.push('hallazgos debe ser una lista (puede ir vacía)')
  else v.hallazgos.forEach((h, i) => {
    if (!objeto(h) || !(SEVERIDADES as readonly string[]).includes(String(h.severidad)) || !texto(h.que, 800)) e.push(`hallazgos[${i}] debe traer severidad y que`)
    else if (h.alude !== undefined && ![...ESPECIALISTAS, 'plan'].includes(String(h.alude))) e.push(`hallazgos[${i}].alude no es un especialista`)
  })
  if (!Array.isArray(v.conflictos_resueltos) || !v.conflictos_resueltos.every((c) => typeof c === 'string')) e.push('conflictos_resueltos debe ser una lista de textos')
  if (!Array.isArray(v.preguntas_a_emilio)) e.push('preguntas_a_emilio debe ser una lista (puede ir vacía)')
  else v.preguntas_a_emilio.forEach((p, i) => { if (!objeto(p) || !texto(p.clave, 60) || !texto(p.texto, 600) || !texto(p.recomendacion, 600) || !texto(p.supuesto_si_no_responde, 600)) e.push(`preguntas_a_emilio[${i}] incompleta`) })
  if (e.length) return { ok: false, errores: e }
  return { ok: true, valor: v as unknown as AcuerdoV1 }
}

// ───────────────────────────────────────────────────────── procedencia.v1.1 (plan v3 · V4 · diseño §6)
// v1 era {medido, de_ensayo, supuesto, dueno}. v1.1 SUMA `cerebro` y `hueco` y campos opcionales del `dato.v1` del plan; un dato v1 sigue siendo válido tal cual.
export const PROCEDENCIAS = ['medido', 'de_ensayo', 'supuesto', 'dueno', 'cerebro', 'hueco'] as const
export type Procedencia = (typeof PROCEDENCIAS)[number]
export const ESTADOS_DE_DATO = ['trajo', 'vacio_declarado', 'registro_sin_campos', 'sin_respuesta', 'error', 'agotado', 'rechazado', 'no_aplica', 'no_declarado', 'omitido', 'viejo_reciclado'] as const
export const IDENTIDADES = ['coincide', 'parcial', 'no_coincide', 'no_comprobable'] as const
export const ALCANCES = ['cliente', 'dominio', 'rubro', 'pais', 'tercero'] as const
export const CONFIANZAS = ['alta', 'media', 'baja'] as const
export const MAX_RESUMEN = 160
export interface DatoConProcedencia {
  clave: string
  valor: unknown
  procedencia: Procedencia
  fuente: string
  fecha?: string
  // ── v1.1 · todos OPCIONALES ──
  id?: string
  tipo_id?: string
  medido_en?: string
  /** una línea (≤ 160): el contenido completo de la ficha NO viaja a la oficina */
  resumen?: string
  estado?: (typeof ESTADOS_DE_DATO)[number]
  identidad?: (typeof IDENTIDADES)[number]
  frescura_h?: number
  periodo?: { tipo?: string; desde?: string; hasta?: string }
  alcance?: (typeof ALCANCES)[number]
  confianza?: (typeof CONFIANZAS)[number]
}
export function validarProcedencia(v: unknown): Resultado<DatoConProcedencia[]> {
  if (!Array.isArray(v)) return { ok: false, errores: ['procedencia: debe ser una lista'] }
  const e: string[] = []
  const enEnum = (x: unknown, lista: readonly string[]) => typeof x === 'string' && lista.includes(x)
  v.forEach((d, i) => {
    if (!objeto(d) || !texto(d.clave, 80) || !texto(d.fuente, 200)) { e.push(`procedencia[${i}]: clave y fuente son obligatorias`); return }
    if (!enEnum(d.procedencia, PROCEDENCIAS)) e.push(`procedencia[${i}]: procedencia inválida (una de ${PROCEDENCIAS.join(', ')})`)
    if (d.estado !== undefined && !enEnum(d.estado, ESTADOS_DE_DATO)) e.push(`procedencia[${i}]: estado inválido`)
    if (d.identidad !== undefined && !enEnum(d.identidad, IDENTIDADES)) e.push(`procedencia[${i}]: identidad inválida`)
    if (d.alcance !== undefined && !enEnum(d.alcance, ALCANCES)) e.push(`procedencia[${i}]: alcance inválido`)
    if (d.confianza !== undefined && !enEnum(d.confianza, CONFIANZAS)) e.push(`procedencia[${i}]: confianza inválida`)
    if (d.resumen !== undefined && (typeof d.resumen !== 'string' || d.resumen.length > MAX_RESUMEN)) e.push(`procedencia[${i}]: resumen de texto, máximo ${MAX_RESUMEN} caracteres`)
    if (d.frescura_h !== undefined && (typeof d.frescura_h !== 'number' || !Number.isFinite(d.frescura_h) || d.frescura_h < 0)) e.push(`procedencia[${i}]: frescura_h debe ser un número ≥ 0`)
    for (const k of ['id', 'tipo_id', 'medido_en', 'fecha'] as const) if (d[k] !== undefined && typeof d[k] !== 'string') e.push(`procedencia[${i}]: ${k} debe ser texto`)
    if (d.periodo !== undefined && !objeto(d.periodo)) e.push(`procedencia[${i}]: periodo debe ser un objeto`)
  })
  return e.length ? { ok: false, errores: e } : { ok: true, valor: v as DatoConProcedencia[] }
}
/**
 * La red de seguridad (queda aunque V4 valide): un dato de ensayo NUNCA entra como medido (se rebaja a «supuesto» y se dice); un dato que dice «medido»
 * o «cerebro» pero es de OTRO negocio o no se pudo comprobar, o cuyo estado no es una lectura, es un `hueco`; un `hueco` no lleva valor (no puede ser base de cálculo).
 */
export function sanearProcedencia(datos: DatoConProcedencia[], corridaEsDeEnsayo: boolean): DatoConProcedencia[] {
  return datos.map((d) => {
    if (d.procedencia === 'hueco') return { ...d, valor: null }
    if (d.procedencia === 'de_ensayo') return { ...d, procedencia: 'supuesto', fuente: `${d.fuente} · era de ensayo: no es un dato medido` }
    if ((d.procedencia === 'medido' || d.procedencia === 'cerebro') && (d.identidad === 'no_coincide' || d.identidad === 'no_comprobable')) {
      return { ...d, procedencia: 'hueco', valor: null, fuente: `${d.fuente} · identidad ${d.identidad}: no es de este negocio comprobado` }
    }
    if ((d.procedencia === 'medido' || d.procedencia === 'cerebro') && d.estado !== undefined && d.estado !== 'trajo' && d.estado !== 'vacio_declarado') {
      return { ...d, procedencia: 'hueco', valor: null, fuente: `${d.fuente} · estado ${d.estado}: no es una lectura` }
    }
    if (corridaEsDeEnsayo && (d.procedencia === 'medido' || d.procedencia === 'cerebro')) return { ...d, procedencia: 'supuesto', fuente: `${d.fuente} · la corrida es de ensayo: no es un dato medido` }
    return d
  })
}

// ───────────────────────────────────────────────────────── el JSON que devuelve un agente
/** el agente puede devolver el JSON solo, dentro de un bloque de código o rodeado de texto: se toma el primer objeto JSON balanceado */
export function extraerJson(crudo: unknown): { ok: true; valor: unknown } | { ok: false; error: string } {
  if (objeto(crudo) || Array.isArray(crudo)) return { ok: true, valor: crudo }
  if (typeof crudo !== 'string' || !crudo.trim()) return { ok: false, error: 'respuesta vacía' }
  const t = crudo.trim()
  const intentos = [t]
  const cerca = /```(?:json)?\s*([\s\S]*?)```/i.exec(t)
  if (cerca) intentos.push(cerca[1].trim())
  const i = t.indexOf('{')
  if (i >= 0) {
    let prof = 0, enTexto = false, escapa = false
    for (let k = i; k < t.length; k++) {
      const c = t[k]
      if (enTexto) { if (escapa) escapa = false; else if (c === '\\') escapa = true; else if (c === '"') enTexto = false; continue }
      if (c === '"') enTexto = true
      else if (c === '{') prof++
      else if (c === '}') { prof--; if (prof === 0) { intentos.push(t.slice(i, k + 1)); break } }
    }
  }
  for (const s of intentos) { try { const v = JSON.parse(s); if (objeto(v) || Array.isArray(v)) return { ok: true, valor: v } } catch { /* siguiente */ } }
  return { ok: false, error: 'no se encontró un objeto JSON válido' }
}
