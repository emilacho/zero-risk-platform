/**
 * F8 · de lo que se dijo en la conversación a la `Entrada` de la calculadora (pura). El CÓDIGO calcula; los agentes solo ponen supuestos con rango y fuente.
 * Nada se inventa: lo que falta queda ausente y la calculadora lo declara (o rechaza con motivo); un supuesto viaja con su fuente («consulta de <agente>») y su tipo.
 */
import type { Canal, Entrada, Referencia } from '../tipos'
import type { ConsultaV1, DatoConProcedencia, PlanteoV1, Rango } from './esquemas'
import { lineaBaseSemanal } from '../linea-base'

export interface ConsultasDeLaRonda { fpa?: ConsultaV1 | null; redes?: ConsultaV1 | null; busqueda?: ConsultaV1 | null; medicion?: ConsultaV1 | null }
export interface ExpedienteMinimo {
  /** referencias de la tabla finanzas_referencias ya filtradas por rubro, país y evento (si existen) */
  referencias?: Array<{ canal: string; evento: string; min: number; max: number; base?: number; tipo: 'dato' | 'supuesto'; fuente: string; fecha?: string }>
  /** evento → su alterno (catálogo) */
  evento_alterno?: Record<string, string | null>
  /** pisos diarios por canal (catálogo) */
  pisos?: Record<string, number | null | undefined>
  fecha?: string
  /** datos con procedencia del expediente (de ahí sale la línea base medida) */
  datos?: DatoConProcedencia[]
  /** línea base dada al abrir (gana sobre lo medido) */
  linea_base_por_semana?: number | null
}

const medio = (r?: Rango): number | undefined => (r ? (r.base ?? (r.min + r.max) / 2) : undefined)

export function entradaDesdeLaConversa(p: { planteo: PlanteoV1; consultas: ConsultasDeLaRonda; expediente: ExpedienteMinimo }): { ok: true; entrada: Entrada; alertas: string[] } | { ok: false; errores: string[] } {
  const { planteo, consultas, expediente } = p
  const alertas: string[] = []
  const s = { ...(consultas.fpa?.supuestos ?? {}), ...(consultas.redes?.supuestos ?? {}) }
  const de = (clave: keyof typeof s, quien: string) => (s[clave] ? `consulta de ${quien}` : null)

  // referencia de costo por resultado: la del especialista de redes; si no, la de la tabla de referencias para el evento; si no, NO se inventa (rechazo con motivo)
  let referencia: Referencia | null = null
  const c = consultas.redes?.supuestos.costo_por_resultado
  if (c) referencia = { min: c.min, max: c.max, ...(c.base !== undefined ? { base: c.base } : {}), tipo: 'supuesto', fuente: `consulta de ${consultas.redes!.agente} (supuesto con rango)`, fecha: expediente.fecha }
  else {
    const r = (expediente.referencias ?? []).find((x) => x.evento === planteo.evento)
    if (r) referencia = { min: r.min, max: r.max, ...(r.base !== undefined ? { base: r.base } : {}), tipo: r.tipo, fuente: r.fuente, fecha: r.fecha }
  }
  if (!referencia) return { ok: false, errores: ['sin referencia de costo por resultado (sin base): no se inventa un número'] }

  const tasa = medio(s.tasa_cierre)
  if (tasa === undefined) alertas.push('sin tasa de cierre: se asume que el resultado es la venta')
  const alt = consultas.redes?.supuestos.costo_por_resultado_alterno
  const nombreAlterno = expediente.evento_alterno?.[planteo.evento] ?? null
  const canales: Canal[] = planteo.canales.filter((x) => x.canal !== 'meta_ig').map((x) => ({
    canal: x.canal, peso: x.peso, piso_diario: x.piso_diario ?? expediente.pisos?.[x.canal] ?? 0,
    ...(x.activo === false ? { activo: false } : {}), ...(x.condicion ? { condicion: x.condicion } : {}),
  }))
  const base = lineaBaseSemanal({ datos: expediente.datos, dada: expediente.linea_base_por_semana })
  const entrada: Entrada = {
    meta_por_semana: planteo.meta_por_semana,
    ...(base ? { base_por_semana: base.por_semana, base_fuente: base.fuente } : {}),
    ...(tasa !== undefined ? { pasos: [{ tasa, fuente: de('tasa_cierre', consultas.fpa?.agente ?? 'finanzas') ?? undefined }] } : {}),
    ...(s.ticket ? { ticket: medio(s.ticket)! } : {}),
    ...(s.margen ? { margen: medio(s.margen)! } : {}),
    ...(s.periodos ? { periodos: medio(s.periodos)! } : {}),
    ...(s.costo_entrega ? { costo_entrega: medio(s.costo_entrega)! } : {}),
    referencia,
    dias_activos_por_semana: planteo.dias_y_horarios.dias_activos_por_semana,
    ...(planteo.horizonte_dias ? { horizonte_dias: planteo.horizonte_dias } : {}),
    ...(planteo.ciclo_dias ? { ciclo_dias: planteo.ciclo_dias } : {}),
    ...(planteo.marca !== undefined ? { marca: planteo.marca } : {}),
    ...(planteo.produccion ? { produccion: { ...planteo.produccion, origen: 'plan' as const } } : {}),
    canales,
    ...(alt && nombreAlterno ? { evento_alterno: { nombre: nombreAlterno, referencia: { min: alt.min, max: alt.max, ...(alt.base !== undefined ? { base: alt.base } : {}), tipo: 'supuesto' as const, fuente: `consulta de ${consultas.redes!.agente} (supuesto con rango)` } } } : {}),
    ...(consultas.redes?.minimo_diario_por_conjunto ? { piso_plataforma: 0 } : {}),
  }
  if ((planteo.canales.some((x) => x.canal === 'meta_ig')) === false) alertas.push('el plan no nombró Meta+Instagram: se aplica igual el mínimo del 60 % (firma)')
  return { ok: true, entrada, alertas }
}
