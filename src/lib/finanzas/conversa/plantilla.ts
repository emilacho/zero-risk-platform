/**
 * F8 · la plantilla `financiera.v1` (DATO) sobre el motor puro de la oficina (`src/lib/oficina/motor.ts`, sin tocarlo). Diseño v2 rev. 9 §6b.3 y §6b.4.
 * Turnos: apertura (código) → planteo (el plan) → los 4 especialistas «en paralelo» (en fila: cada uno lee SOLO el planteo y el expediente) → ajuste (el plan) → cálculo (código) → cierre (el jefe)
 *        → [ronda 2, UNA sola vuelta: solo los especialistas aludidos → ajuste → cálculo → cierre si la huella cambió] → firma (código).
 * Tope de rondas = 2 · tope del encargo US$ 1,50 · un solo turno por agente por ronda (cada paso corre una vez; la ronda 2 usa pasos propios).
 */
import type { Paso, Plantilla } from '../../oficina/tipos'

const siempre = { tipo: 'siempre' } as const
const si = (artefacto: string, campo: string): Paso['condicion'] => ({ tipo: 'si_artefacto', artefacto, campo, igual: true })

export const AGENTES = {
  proponente: 'campaign-brief-agent',
  fpa: 'finance-fpa-analyst',
  redes: 'paid_media_paid_social_strategist',
  busqueda: 'paid_media_ppc_strategist',
  medicion: 'tracking-specialist',
  jefe: 'chief-financial-officer',
} as const

const agente = (clave: string, quien: string, entrada: string[], salida: string, tope: number, condicion: Paso['condicion'] = siempre, ronda: 1 | 2 = 1, esquema = 'consulta_financiera.v1'): Paso =>
  ({ clave, tipo: 'agente', quien, condicion, entrada, salida_artefacto: salida, tope_usd: tope, ronda, salida: { esquema, reintento_formato: 1 } })
const codigo = (clave: string, funcion: string, entrada: string[], salida: string, condicion: Paso['condicion'] = siempre, ronda: 1 | 2 = 1): Paso =>
  ({ clave, tipo: 'codigo', quien: 'sala', funcion, condicion, entrada, salida_artefacto: salida, tope_usd: 0, ronda })

// RESERVA DEL CIERRE (16-oct): el jefe de finanzas cobró 0,19–0,25 por cierre en lo medido (libro); reservar 0,40 fijo cortó la ronda 2 por 0,003. La reserva es lo MEDIDO + margen
// (0,25 × 1,3 ≈ 0,33) y el cierre de la ronda 2 usa el costo REAL del cierre de la ronda 1 de ese mismo encargo × 1,3 (piso 0,25, techo 0,40). La defensa no baja:
// el motor sigue exigiendo gasto + reserva ≤ tope del encargo, y la reserva es también el máximo que esa llamada puede cobrar.
export const MAXIMO_OBSERVADO_DEL_CIERRE_USD = 0.25
export const FACTOR_DE_RESERVA_DEL_CIERRE = 1.3
export const TECHO_DE_RESERVA_DEL_CIERRE_USD = 0.4
const redondeaArriba = (x: number) => Math.ceil(x * 100 - 1e-9) / 100
export const RESERVA_DEL_CIERRE_USD = redondeaArriba(MAXIMO_OBSERVADO_DEL_CIERRE_USD * FACTOR_DE_RESERVA_DEL_CIERRE)
// el piso es la reserva general: el cierre de la ronda 2 trae más entradas (acuerdo + bloque_2 + planteo fijado 2) y la reserva es también el máximo que esa llamada puede cobrar
export const PISO_DE_RESERVA_DEL_CIERRE_USD = RESERVA_DEL_CIERRE_USD
// RE-CIERRE (19-oct): el cierre de la ronda 2 llega con hallazgos resueltos y el jefe los desglosa: medido, la MISMA entrada (~38-40 mil tokens) dio 5.293 tokens de salida en la v1 y 11.528 en la v2
// (US$ 0,2287 → 0,3142, a 0,016 de la reserva de 0,33). La reserva del re-cierre baja la defensa a un piso de 0,40 (0,3142 × 1,3 ≈ 0,41) y el techo sube a 0,50.
export const PISO_DE_RESERVA_DEL_RECIERRE_USD = 0.4
export const TECHO_DE_RESERVA_DEL_RECIERRE_USD = 0.5
/** la reserva del cierre de la ronda 2 (el RE-CIERRE) a partir de lo que COSTÓ el cierre de la ronda 1 de este encargo (no se achica del piso 0,40 ni pasa del techo 0,50); sin medida, el piso */
export function reservaDelCierre2(costoDelCierre1?: number | null): number {
  if (typeof costoDelCierre1 !== 'number' || !Number.isFinite(costoDelCierre1) || costoDelCierre1 <= 0) return PISO_DE_RESERVA_DEL_RECIERRE_USD
  return Math.min(TECHO_DE_RESERVA_DEL_RECIERRE_USD, Math.max(PISO_DE_RESERVA_DEL_RECIERRE_USD, redondeaArriba(costoDelCierre1 * FACTOR_DE_RESERVA_DEL_CIERRE)))
}

const R1 = ['expediente']
export const PLANTILLA_FINANCIERA: Plantilla = {
  tipo: 'financiera.v1',
  familia: 'financiera',
  pasos: [
    codigo('abrir', 'abrir_financiera', [], 'expediente'),
    agente('planteo', AGENTES.proponente, R1, 'planteo', 0.15, siempre, 1, 'planteo.v1'),
    agente('fpa', AGENTES.fpa, ['expediente', 'planteo'], 'consulta_fpa', 0.25, si('planteo', 'habla.fpa')),
    agente('redes', AGENTES.redes, ['expediente', 'planteo'], 'consulta_redes', 0.25, si('planteo', 'habla.redes')),
    agente('busqueda', AGENTES.busqueda, ['expediente', 'planteo'], 'consulta_busqueda', 0.18, si('planteo', 'habla.busqueda')),
    agente('medicion', AGENTES.medicion, ['expediente', 'planteo'], 'consulta_medicion', 0.15, si('planteo', 'habla.medicion')),
    agente('ajuste', AGENTES.proponente, ['expediente', 'planteo', 'consulta_fpa', 'consulta_redes', 'consulta_busqueda', 'consulta_medicion'], 'planteo_fijado', 0.2, siempre, 1, 'planteo.v1'),
    codigo('calculo', 'calcular_bloque', ['expediente', 'planteo_fijado', 'consulta_fpa', 'consulta_redes'], 'bloque'),
    agente('cierre', AGENTES.jefe, ['expediente', 'planteo_fijado', 'bloque', 'consulta_fpa', 'consulta_redes', 'consulta_busqueda', 'consulta_medicion'], 'acuerdo', RESERVA_DEL_CIERRE_USD, si('bloque', 'hay_bloque'), 1, 'acuerdo.v1'),
    // ── ronda 2: una sola vuelta, solo los aludidos
    agente('fpa_2', AGENTES.fpa, ['expediente', 'planteo_fijado', 'acuerdo'], 'consulta_fpa_2', 0.25, si('acuerdo', 'alude.fpa'), 2),
    agente('redes_2', AGENTES.redes, ['expediente', 'planteo_fijado', 'acuerdo'], 'consulta_redes_2', 0.25, si('acuerdo', 'alude.redes'), 2),
    agente('busqueda_2', AGENTES.busqueda, ['expediente', 'planteo_fijado', 'acuerdo'], 'consulta_busqueda_2', 0.18, si('acuerdo', 'alude.busqueda'), 2),
    agente('medicion_2', AGENTES.medicion, ['expediente', 'planteo_fijado', 'acuerdo'], 'consulta_medicion_2', 0.15, si('acuerdo', 'alude.medicion'), 2),
    agente('ajuste_2', AGENTES.proponente, ['expediente', 'planteo_fijado', 'acuerdo', 'consulta_fpa_2', 'consulta_redes_2', 'consulta_busqueda_2', 'consulta_medicion_2'], 'planteo_fijado_2', 0.15, si('acuerdo', 'requiere_ronda_2'), 2, 'planteo.v1'),
    codigo('calculo_2', 'calcular_bloque_2', ['expediente', 'planteo_fijado_2', 'consulta_fpa', 'consulta_redes', 'consulta_fpa_2', 'consulta_redes_2'], 'bloque_2', si('acuerdo', 'requiere_ronda_2'), 2),
    // si la huella no cambió entre las dos rondas, NO hay segundo cierre (cierra en el acto)
    agente('cierre_2', AGENTES.jefe, ['expediente', 'planteo_fijado_2', 'bloque_2', 'acuerdo'], 'acuerdo_2', PISO_DE_RESERVA_DEL_RECIERRE_USD, si('bloque_2', 'cambio'), 2, 'acuerdo.v1'),
    codigo('firma', 'cierre_financiero', ['expediente', 'bloque', 'acuerdo', 'bloque_2', 'acuerdo_2'], 'cierre'),
  ],
  limites: { margen: 3, tope_encargo_usd: 1.5, max_rondas: 2 },
  indicaciones: {},
}

export const MAX_TURNOS_DE_MODELO = 13

/** valida la plantilla contra el vocabulario de F8 (no registra nada en el validador de la oficina creativa: no se toca) */
export function validarPlantillaFinanciera(p: Plantilla = PLANTILLA_FINANCIERA): string[] {
  const e: string[] = []
  const claves = p.pasos.map((x) => x.clave)
  if (new Set(claves).size !== claves.length) e.push('claves de paso repetidas')
  if (p.limites.max_rondas !== 2) e.push('max_rondas debe ser 2')
  if (p.limites.tope_encargo_usd > 1.5) e.push('el tope del encargo no puede pasar de US$ 1,50')
  const permitidos = new Set<string>(Object.values(AGENTES))
  const salidas = new Set<string>()
  for (const x of p.pasos) {
    if (x.tipo === 'agente' && !permitidos.has(x.quien)) e.push(`${x.clave}: agente «${x.quien}» fuera de la oficina`)
    if (x.tipo !== 'agente' && x.tipo !== 'codigo') e.push(`${x.clave}: tipo «${x.tipo}» no admitido`)
    if (x.tipo === 'codigo' && x.tope_usd !== 0) e.push(`${x.clave}: un paso de código no gasta`)
    if (x.tipo === 'agente' && !(x.tope_usd > 0)) e.push(`${x.clave}: un agente necesita su tope`)
    if (x.ronda !== 1 && x.ronda !== 2) e.push(`${x.clave}: ronda fuera de rango`)
    if (x.vuelve_a) e.push(`${x.clave}: sin vueltas del motor (la ronda 2 son pasos propios)`)
    if (salidas.has(x.salida_artefacto)) e.push(`${x.clave}: salida repetida`)
    salidas.add(x.salida_artefacto)
  }
  const agentes = p.pasos.filter((x) => x.tipo === 'agente')
  if (agentes.length > MAX_TURNOS_DE_MODELO) e.push(`más de ${MAX_TURNOS_DE_MODELO} turnos de modelo`)
  // un solo turno por agente por ronda
  for (const r of [1, 2] as const) {
    const del = agentes.filter((x) => x.ronda === r).map((x) => x.quien)
    const repetidos = del.filter((q, i) => del.indexOf(q) !== i)
    // el proponente habla dos veces en la ronda 1 (planteo y ajuste): es la única excepción del diseño (propone y luego ajusta)
    for (const q of new Set(repetidos)) if (q !== AGENTES.proponente) e.push(`ronda ${r}: «${q}» habla más de una vez`)
    if (r === 1 && del.filter((q) => q === AGENTES.proponente).length > 2) e.push('ronda 1: el proponente habla más de dos veces')
  }
  return e
}
