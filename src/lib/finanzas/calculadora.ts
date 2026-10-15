/**
 * LA CALCULADORA DE LA OFICINA FINANCIERA (F2 · CC#1 · 2026-10-14) · código puro, CERO llamadas al modelo, determinista. Diseño v2 rev. 8 §4.
 *
 * UNA sola convención de tiempo: la meta es SEMANAL; el mes solo se muestra (semana × 52 ÷ 12).
 * UNA sola fórmula del techo por resultado: T = (ticket × margen × períodos − costo_entrega) × h × q ; sin ticket o margen, T = la referencia de mercado SIN arranque.
 * Umbrales: sigo ≤ 1×T · ajusto ≤ 2×T (pasado 1,4×T por 7 días se recorta el diario 20 %) · paro > 2×T.
 * AGNÓSTICA: ninguna rama por tipo de cliente; el cliente entra como parámetros opcionales (`Entrada`).
 */
import { repartirPresupuesto } from './repartir'
import type { Bloque, Cifra, Confianza, Entrada, Equilibrio, FilaDeReparto, Resultado, Veredicto } from './tipos'

export const SEMANAS_POR_MES = 52 / 12
export const DIAS_DEL_MES = 30
export const EVENTOS_PARA_APRENDER = 50
export const H_POR_OMISION = 0.7
export const ARRANQUE_POR_OMISION = { min: 0.2, base: 0.3, max: 0.4 } as const
export const MARCA_POR_OMISION = 0.2
export const META_IG_MINIMA = 0.6
export const TOPE_PRODUCCION = 0.4
export const UMBRAL_RECORTE = 1.4
export const UMBRAL_PARO = 2
export const SENSIBILIDAD = 0.3
export const TOLERANCIA = 1e-9
export const CALENDARIO_POR_OMISION: readonly number[] = [0, 0, 1, 1, 1, 1, 1, 1, 1.25, 1.5625, 1.5625, 1]

const finito = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const r2 = (x: number) => Math.round(x * 100) / 100

export function veredictoDe(costo: number, techo: number): Veredicto {
  if (!(techo > 0)) return 'paro'
  // tolerancia de coma flotante: 4,2 = 1,4 × 3 debe quedar en «ajusto»
  const EPS = 1e-9 * Math.max(1, techo)
  if (costo <= techo + EPS) return 'sigo'
  if (costo <= UMBRAL_RECORTE * techo + EPS) return 'ajusto'
  if (costo <= UMBRAL_PARO * techo + EPS) return 'ajusto_recorte'
  return 'paro'
}

/** primera lectura: el MAYOR entre 14 días (o el 25 % del horizonte si es menor de 28 días, mínimo 3) y el ciclo de venta */
export function primeraLecturaDia(horizonte_dias?: number | null, ciclo_dias?: number | null): number {
  const base = finito(horizonte_dias) && horizonte_dias > 0 && horizonte_dias < 28 ? Math.max(3, Math.ceil(horizonte_dias * 0.25)) : 14
  return Math.max(base, finito(ciclo_dias) && ciclo_dias > 0 ? Math.ceil(ciclo_dias) : 0)
}

/** chequeo de primera venta: ¿la oferta de entrada paga su costo por venta? Si no, el valor mínimo de esa primera venta. */
export function chequeoDePrimeraVenta(p: { valor_oferta: number; margen: number; costo_entrega?: number | null; costo_por_venta: number; h?: number }) {
  const h = p.h ?? H_POR_OMISION
  const env = p.costo_entrega ?? 0
  const deja = Math.max(0, p.valor_oferta * p.margen - env) * h
  const minimo = p.margen > 0 && h > 0 ? (p.costo_por_venta / h + env) / p.margen : null
  return { paga: deja >= p.costo_por_venta, deja_por_venta: r2(deja), valor_minimo: minimo == null ? null : r2(minimo) }
}

export function validarEntrada(e: Entrada): string[] {
  const m: string[] = []
  const rango01 = (x: unknown, n: string, abierto = false) => { if (!finito(x) || x < 0 || x > 1 || (abierto && x === 0)) m.push(`${n} debe estar entre ${abierto ? '(0' : '0'} y 1]`) }
  if (!finito(e.meta_por_semana) || e.meta_por_semana <= 0) m.push('meta_por_semana debe ser un número > 0')
  if (!finito(e.dias_activos_por_semana) || e.dias_activos_por_semana < 1 || e.dias_activos_por_semana > 7) m.push('dias_activos_por_semana debe estar entre 1 y 7')
  ;(e.pasos ?? []).forEach((p, i) => rango01(p?.tasa, `pasos[${i}].tasa`, true))
  if (e.ticket != null && (!finito(e.ticket) || e.ticket < 0)) m.push('ticket debe ser ≥ 0')
  if (e.margen != null) rango01(e.margen, 'margen')
  if (e.periodos != null && (!finito(e.periodos) || e.periodos < 1)) m.push('periodos debe ser ≥ 1')
  if (e.costo_entrega != null && (!finito(e.costo_entrega) || e.costo_entrega < 0)) m.push('costo_entrega debe ser ≥ 0')
  if (e.marca != null) rango01(e.marca, 'marca')
  if (e.marca != null && e.marca >= 1) m.push('marca debe ser < 1')
  if (e.h != null) rango01(e.h, 'h', true)
  if (e.piso_plataforma != null && (!finito(e.piso_plataforma) || e.piso_plataforma < 0)) m.push('piso_plataforma debe ser ≥ 0')
  if (e.horizonte_dias != null && (!finito(e.horizonte_dias) || e.horizonte_dias <= 0)) m.push('horizonte_dias debe ser > 0')
  if (e.ciclo_dias != null && (!finito(e.ciclo_dias) || e.ciclo_dias < 0)) m.push('ciclo_dias debe ser ≥ 0')
  const r = e.referencia
  if (!r) m.push('falta la referencia de costo por resultado (sin base): el bloque no inventa un número')
  else {
    if (!finito(r.min) || !finito(r.max) || r.min <= 0 || r.max < r.min) m.push('referencia: min y max deben ser > 0 y max ≥ min')
    else if (r.base != null && (!finito(r.base) || r.base < r.min || r.base > r.max)) m.push('referencia.base debe estar dentro del rango')
    if (!r.fuente) m.push('referencia: falta la fuente')
  }
  if (e.arranque) {
    const a = e.arranque
    if (![a.min, a.base, a.max].every((x) => finito(x) && x >= 0) || !(a.min <= a.base && a.base <= a.max)) m.push('arranque: min ≤ base ≤ max y todos ≥ 0')
  }
  if (e.produccion) {
    const p = e.produccion
    if (p.fraccion != null) rango01(p.fraccion, 'produccion.fraccion')
    if (p.monto != null && (!finito(p.monto) || p.monto < 0)) m.push('produccion.monto debe ser ≥ 0')
  }
  for (const c of e.canales ?? []) {
    if (!c.canal) m.push('canal sin nombre')
    if (!finito(c.peso) || c.peso < 0 || c.peso > 1) m.push(`canal «${c.canal}»: peso entre 0 y 1`)
    if (!finito(c.piso_diario) || c.piso_diario < 0) m.push(`canal «${c.canal}»: piso_diario ≥ 0`)
  }
  if (e.calendario && (!e.calendario.length || e.calendario.some((f) => !finito(f) || f < 0))) m.push('calendario: factores ≥ 0')
  return m
}

/**
 * Reparto inverso: el total mensual más chico para que Meta+IG cubra `metaIgNecesario`, con
 *  · producción = renglón visible dentro del total (fracción del mes normal o monto FIJO), topada al 40 %,
 *  · otros canales por peso, escalados si producción + otros pasan del 40 %, y solo si alcanzan su piso diario (30 días);
 *    lo que un canal no alcanza se SUMA a Meta+IG (firma 14-oct 2.2 A) y Meta+IG nunca baja del 60 %.
 * Bisección determinista sobre el total (MetaIG(total) es creciente).
 */
export function repartoInverso(p: { metaIgNecesario: number; produccion: Entrada['produccion']; canales: NonNullable<Entrada['canales']> }) {
  const canales = p.canales.map((c) => ({ ...c, activo: c.activo !== false, diferido: c.activo === false }))
  const prod = p.produccion ?? null
  const montoDeProduccion = (total: number) => (prod == null ? 0 : prod.monto != null ? Math.min(prod.monto, TOPE_PRODUCCION * total) : Math.min(prod.fraccion ?? 0, TOPE_PRODUCCION) * total)
  const parteDeOtros = (total: number) => {
    const ws = canales.filter((c) => c.activo).reduce((s, c) => s + c.peso, 0)
    const cupo = Math.max(0, (1 - META_IG_MINIMA) * total - montoDeProduccion(total))
    const k = ws * total > cupo && ws > 0 ? cupo / (ws * total) : 1
    return { k, ws }
  }
  const metaIgDe = (total: number) => { const { k, ws } = parteDeOtros(total); return total - montoDeProduccion(total) - ws * k * total }
  const resolver = () => {
    let lo = p.metaIgNecesario
    let hi = p.metaIgNecesario / META_IG_MINIMA
    if (!(hi > lo)) return lo
    for (let i = 0; i < 80; i++) { const mid = (lo + hi) / 2; if (metaIgDe(mid) >= p.metaIgNecesario) hi = mid; else lo = mid }
    return hi
  }
  let total = resolver()
  for (let ronda = 0; ronda <= canales.length; ronda++) {
    const { k } = parteDeOtros(total)
    let cambio = false
    for (const c of canales) if (c.activo && (c.peso * k * total) / DIAS_DEL_MES < c.piso_diario) { c.activo = false; cambio = true }
    if (!cambio) break
    total = resolver()
  }
  const { k } = parteDeOtros(total)
  const montoProd = montoDeProduccion(total)
  const otros: FilaDeReparto[] = canales.map((c) => ({
    canal: c.canal, monto: c.activo ? c.peso * k * total : 0, activo: c.activo,
    ...(c.activo ? {} : c.diferido ? { motivo: `diferido por el plan${c.condicion ? ' (cuando se active: ' + c.condicion + ')' : ''}` } : { motivo: c.condicion ? `no alcanza su piso (${c.condicion}): su parte se suma a Meta+IG` : 'no alcanza su piso: su parte se suma a Meta+IG' }),
  }))
  const sumado = canales.filter((c) => !c.activo && !c.diferido).reduce((s, c) => s + c.peso, 0) * total
  const metaIg = total - montoProd - otros.reduce((s, o) => s + o.monto, 0)
  return { totalMes: total, montoProd, otros, sumado, metaIg }
}

/** las cifras que mandan: si alguna es «sin base», el tablero no puede salir «sale» (solo «sale con alerta») */
export const CIFRAS_QUE_MANDAN = ['costo_por_resultado_ref', 'costo_por_resultado_arranque', 'techo_por_resultado'] as const

/**
 * R14 · la CONFIANZA del tablero: cuántas cifras son dato, cuántas supuesto y cuántas «sin base». «Firmado» significa coherente y sin contradicciones, NO verdadero:
 * un tablero con casi todo «supuesto» sale con esa marca y nunca como confirmado.
 */
export function confianzaDe(cifras: Record<string, Cifra>): Confianza {
  const v = Object.values(cifras)
  const datos = v.filter((c) => c.tipo === 'dato').length
  const supuestos = v.filter((c) => c.tipo === 'supuesto').length
  const sin_base = v.filter((c) => c.tipo === 'sin_base').length
  const total = v.length
  const manda_sin_base = CIFRAS_QUE_MANDAN.some((k) => cifras[k] && cifras[k].tipo === 'sin_base')
  const parte = total ? datos / total : 0
  const nivel: Confianza['nivel'] = manda_sin_base ? 'sin_base' : parte >= 0.75 && sin_base === 0 ? 'confirmado' : parte >= 0.25 ? 'parcial' : 'casi_todo_supuesto'
  const frase = { sin_base: 'una cifra que manda no tiene base: el tablero solo puede salir «con alerta»', confirmado: 'casi todo es dato confirmado', parcial: 'una parte es dato y el resto supuesto', casi_todo_supuesto: 'casi todo es supuesto: no es un tablero confirmado' }[nivel]
  return { datos, supuestos, sin_base, total, nivel, manda_sin_base, texto: `Confianza del tablero: ${datos} dato(s), ${supuestos} supuesto(s), ${sin_base} sin base de ${total}; ${frase}.` }
}

/**
 * PLAN v3 · V7 · LA META DE EQUILIBRIO SEMANAL: el menor número de resultados finales por semana para que lo que deja cada venta
 * (ticket × margen × períodos − costo de entrega) pague el TOTAL mensual del plan que esa meta exige.
 *   total_mes(W) ÷ (W × 52 ÷ 12)  =  contribución por venta
 * `total_mes` NO es lineal en W (la producción es un monto fijo con tope del 40 %): el costo por venta baja al crecer la meta, por eso existe un umbral.
 * Siempre es un SUPUESTO (usa el costo por resultado de arranque y la tasa de resultado a venta); nunca un dato. Sin ticket/margen o sin contribución positiva: `null` con su motivo.
 * `totalPara(W)` es la MISMA cadena de `calcular` (pauta → Meta+IG necesario → reparto inverso): una sola verdad.
 */
export function metaDeEquilibrio(p: { contribucion: number | null; meta: number; totalPara: (meta: number) => number }): Equilibrio {
  const base: Equilibrio = { meta_de_equilibrio_semana: null, meta_actual: p.meta, cubre: null, meta_sugerida_semana: null, contribucion_por_venta: p.contribucion == null ? null : r2(p.contribucion), motivo: null }
  if (p.contribucion == null) return { ...base, motivo: 'sin ticket o margen: no hay con qué medir si una venta paga su costo' }
  if (!(p.contribucion > 0)) return { ...base, motivo: 'la venta no deja contribución positiva: ninguna meta cubre el equilibrio' }
  const g = (w: number) => p.totalPara(w) / (w * SEMANAS_POR_MES) - p.contribucion!
  const LO = 0.01, HI = 100000
  if (g(HI) > TOLERANCIA) return { ...base, motivo: 'ni con una meta enorme la venta paga lo que cuesta venderla: el equilibrio no existe con estos supuestos' }
  if (g(LO) <= TOLERANCIA) return { ...base, meta_de_equilibrio_semana: 0, cubre: true, motivo: 'cualquier meta cubre el equilibrio con estos supuestos' }
  let lo = LO, hi = HI
  for (let i = 0; i < 100; i++) { const mid = (lo + hi) / 2; if (g(mid) > 0) lo = mid; else hi = mid }
  const w = r2(hi)
  const cubre = p.meta + TOLERANCIA >= hi
  return { ...base, meta_de_equilibrio_semana: w, cubre, meta_sugerida_semana: cubre ? null : Math.ceil(hi) }
}

export function calcular(e: Entrada): Resultado {
  const errores = validarEntrada(e)
  if (errores.length) return { ok: false, errores }
  const alertas: string[] = []
  const ref = e.referencia!
  const refBase = ref.base ?? (ref.min + ref.max) / 2
  const a = e.arranque ?? ARRANQUE_POR_OMISION
  const h = e.h ?? H_POR_OMISION
  const n = e.dias_activos_por_semana
  const q = (e.pasos ?? []).reduce((acc, p) => acc * p.tasa, 1)
  const costo = { cota_baja: ref.min * (1 + a.min), base: refBase * (1 + a.base), cota_alta: ref.max * (1 + a.max) }

  // ── techo por resultado (una sola fórmula)
  const conValor = e.ticket != null && e.margen != null
  const periodos = e.periodos ?? 1
  const entrega = e.costo_entrega ?? 0
  const bruto = conValor ? e.ticket! * e.margen! * periodos - entrega : 0
  const valorDeVenta = conValor ? Math.max(0, bruto * h) : null
  if (conValor && bruto <= 0) alertas.push('la venta no deja contribución positiva: no hay techo posible (paro)')
  const T = conValor ? (valorDeVenta as number) * q : refBase
  if (!conValor) alertas.push('sin ticket o margen: el techo es la referencia de mercado sin arranque (se compara con el mercado)')
  const veredictos = {
    cota_baja: veredictoDe(costo.cota_baja, T), base: veredictoDe(costo.base, T), cota_alta: veredictoDe(costo.cota_alta, T),
    sens_menos: veredictoDe(costo.base * (1 - SENSIBILIDAD), T), sens_mas: veredictoDe(costo.base * (1 + SENSIBILIDAD), T),
  }

  // ── resultados, pauta y aprendizaje
  const R = e.meta_por_semana / q
  const rendSem = R * costo.base
  const diario = rendSem / n
  const minimo = Math.max(e.piso_plataforma ?? 0, (costo.base * EVENTOS_PARA_APRENDER) / n)
  // tolerancia de coma flotante: 50 resultados «justo» (p. ej. 7 ÷ 0,14) no puede salir 49,999… ni 0 conjuntos
  const conjuntos = Math.floor(diario / minimo + TOLERANCIA)
  const dilucion = conjuntos < 1
  const limitado = R < EVENTOS_PARA_APRENDER - TOLERANCIA
  if (dilucion) alertas.push(`dilución: con ${r2(diario)} diarios no se llega al mínimo de ${r2(minimo)} por conjunto; mínimo diario recomendado ${r2(minimo)}; se deja 1 conjunto con aprendizaje limitado`)
  else if (limitado) alertas.push(`aprendizaje limitado: ${r2(R)} resultados por semana < ${EVENTOS_PARA_APRENDER}`)
  let alterno: Bloque['alterno'] = null
  if (dilucion && e.evento_alterno) {
    const ea = e.evento_alterno.referencia
    const c = (ea.base ?? (ea.min + ea.max) / 2) * (1 + a.base)
    const dm = Math.max(e.piso_plataforma ?? 0, (c * EVENTOS_PARA_APRENDER) / n)
    alterno = { nombre: e.evento_alterno.nombre, costo: c, minimo_por_conjunto: dm, conjuntos: Math.floor(diario / dm + TOLERANCIA) }
    if (alterno.conjuntos >= 1) alertas.push(`el evento alterno «${alterno.nombre}» sí cabe (${alterno.conjuntos} conjunto(s)): se declara`)
  }

  // ── reparto del total
  const marca = e.marca ?? MARCA_POR_OMISION
  const rendMes = rendSem * SEMANAS_POR_MES
  const metaIgNecesario = rendMes / (1 - marca)
  const prod = e.produccion ?? null
  const rp = repartoInverso({ metaIgNecesario, produccion: prod, canales: e.canales ?? [] })
  const { totalMes, montoProd, otros, sumado, metaIg } = rp
  if (prod && prod.fraccion != null && prod.fraccion > TOPE_PRODUCCION) alertas.push(`producción: ${prod.fraccion} excede el tope de ${TOPE_PRODUCCION}; se topa`)
  if (prod && prod.monto != null && prod.monto > TOPE_PRODUCCION * totalMes) alertas.push(`producción: el monto fijo excede el ${TOPE_PRODUCCION * 100} % del total; se topa`)
  if (!prod) alertas.push('producción: el plan no la trajo; el renglón queda en 0 y se declara (sin base)')
  // la suma exacta en centavos (invariante de `repartirPresupuesto`): las partes que se guardan salen de aquí
  const centavos = repartirPresupuesto(totalMes, [{ clave: 'meta_ig', peso: metaIg }, { clave: 'produccion', peso: montoProd }, ...otros.map((o) => ({ clave: 'otros:' + o.canal, peso: o.monto }))])
  const parte = (clave: string) => centavos.partes.find((p) => p.clave === clave)?.monto ?? 0

  // ── calendario (por semana, sobre la pauta de rendimiento) · producción FIJA por mes
  const cal = (e.calendario ?? CALENDARIO_POR_OMISION).map(Number)
  const porSemana = cal.map((f) => f * rendSem)
  const rendTotal = porSemana.reduce((s, x) => s + x, 0)
  const meses = Math.max(1, Math.ceil(cal.length / SEMANAS_POR_MES))
  const metaIgTotal = rendTotal / (1 - marca)
  const produccionTotal = montoProd * meses
  const calendario = {
    por_semana: porSemana.map(r2), rendimiento_total: r2(rendTotal), meta_ig_total: r2(metaIgTotal), produccion_total: r2(produccionTotal), total: r2(metaIgTotal + produccionTotal),
    prueba: { diez: r2(rendTotal * 0.1), quince: r2(rendTotal * 0.15), veinte: r2(rendTotal * 0.2) },
  }

  // ── dato que no bloquea: con marca y producción cada venta cuesta más que lo que deja la primera
  const costoPorVenta = costo.base / q
  if (conValor) {
    const ventasMes = e.meta_por_semana * SEMANAS_POR_MES
    const costoTotalPorVenta = ventasMes > 0 ? totalMes / ventasMes : 0
    const dejaPrimera = Math.max(0, e.ticket! * e.margen! - entrega)
    if (costoTotalPorVenta > dejaPrimera) alertas.push(`dato que no bloquea: con marca y producción cada venta cuesta ${r2(costoTotalPorVenta)} y la primera venta deja ${r2(dejaPrimera)}`)
  }

  const cifra = (valor: number, o: Omit<Cifra, 'valor'>): Cifra => ({ valor: r2(valor), ...o })
  const cifras: Record<string, Cifra> = {
    meta_por_semana: cifra(e.meta_por_semana, { tipo: 'dato', fuente: 'plan / planteo fijado' }),
    costo_por_resultado_ref: cifra(refBase, { min: r2(ref.min), max: r2(ref.max), tipo: ref.tipo, fuente: ref.fuente, fecha: ref.fecha, formula: 'referencia de mercado (punto medio por omisión)' }),
    costo_por_resultado_arranque: cifra(costo.base, { min: r2(costo.cota_baja), max: r2(costo.cota_alta), tipo: 'supuesto', fuente: 'referencia × (1 + arranque)', formula: 'e = ref × (1 + a)' }),
    tasa_resultado_a_venta: cifra(q, { tipo: (e.pasos ?? []).length ? 'supuesto' : 'dato', fuente: (e.pasos ?? []).length ? 'producto de los pasos' : 'el resultado es la meta', formula: 'q = Π tasas' }),
    costo_por_venta: cifra(costoPorVenta, { tipo: 'supuesto', fuente: 'costo por resultado ÷ q', formula: 'p = e ÷ q' }),
    resultados_por_semana: cifra(R, { tipo: 'supuesto', fuente: 'meta ÷ q', formula: 'R = W ÷ q' }),
    pauta_rendimiento_semana: cifra(rendSem, { min: r2(R * costo.cota_baja), max: r2(R * costo.cota_alta), tipo: 'supuesto', fuente: 'R × costo', formula: 'P = R × e' }),
    pauta_rendimiento_mes: cifra(rendMes, { tipo: 'supuesto', fuente: 'semana × 52 ÷ 12', formula: 'P × 52 ÷ 12' }),
    pauta_diaria: cifra(diario, { tipo: 'supuesto', fuente: 'pauta semanal ÷ días activos', formula: 'P ÷ n' }),
    minimo_por_conjunto: cifra(minimo, { tipo: 'supuesto', fuente: 'costo × 50 ÷ días activos', formula: 'máx(piso, e × 50 ÷ n)' }),
    techo_por_resultado: cifra(T, { tipo: 'supuesto', fuente: conValor ? 'ticket × margen × períodos − entrega, × h × q' : 'referencia de mercado sin arranque', formula: conValor ? 'T = (t×m×períodos − env) × h × q' : 'T = ref' }),
    total_mes: cifra(totalMes, { tipo: 'supuesto', fuente: 'reparto inverso', formula: 'Meta+IG necesario ÷ parte de Meta+IG' }),
    meta_ig_mes: cifra(parte('meta_ig'), { tipo: 'supuesto', fuente: 'total − producción − otros', formula: '≥ 60 % del total' }),
    produccion_mes: prod
      ? cifra(parte('produccion'), { tipo: prod.origen === 'plan' ? 'dato' : 'supuesto', fuente: `producción (${prod.origen}), monto fijo` })
      : { valor: null, tipo: 'sin_base', fuente: 'no la trajo el plan', motivo: 'sin base: el plan no declaró producción' },
  }

  const confianza = confianzaDe(cifras)

  // ── plan v3 · V7 · la meta de equilibrio (supuesto; no entra a la confianza ni al techo: es un aviso para el ajuste)
  const contribucion = conValor ? e.ticket! * e.margen! * periodos - entrega : null
  const totalPara = (meta: number) => repartoInverso({ metaIgNecesario: ((meta / q) * costo.base * SEMANAS_POR_MES) / (1 - marca), produccion: prod, canales: e.canales ?? [] }).totalMes
  const equilibrio = metaDeEquilibrio({ contribucion, meta: e.meta_por_semana, totalPara })
  if (equilibrio.meta_de_equilibrio_semana !== null) {
    cifras.meta_de_equilibrio_semana = cifra(equilibrio.meta_de_equilibrio_semana, { tipo: 'supuesto', fuente: 'la contribución por venta paga el total mensual del plan', formula: 'total_mes(W) ÷ (W × 52 ÷ 12) = ticket × margen × períodos − entrega' })
    if (equilibrio.meta_sugerida_semana !== null) cifras.meta_sugerida_semana = cifra(equilibrio.meta_sugerida_semana, { tipo: 'supuesto', fuente: 'primera meta entera que cubre el equilibrio (la decide el dueño)', formula: 'ceil(meta de equilibrio)' })
  }
  if (equilibrio.cubre === false) alertas.push(`esta meta no cubre el equilibrio: con ${r2(e.meta_por_semana)} por semana el plan no se paga; el equilibrio está en ${equilibrio.meta_de_equilibrio_semana} por semana (supuesto; una meta mayor, ${equilibrio.meta_sugerida_semana}, sí lo cubriría)`)

  return {
    ok: true, cifras, veredictos, costos: { cota_baja: r2(costo.cota_baja), base: r2(costo.base), cota_alta: r2(costo.cota_alta) },
    techo: { por_resultado: r2(T), ajusto_hasta: r2(T * UMBRAL_RECORTE), recorte_desde: r2(T * UMBRAL_RECORTE), paro_desde: r2(T * UMBRAL_PARO), sin_valor_monetario: !conValor },
    aprendizaje: { resultados_por_semana: r2(R), diario: r2(diario), minimo_por_conjunto: r2(minimo), conjuntos, dilucion, limitado },
    alterno: alterno && { ...alterno, costo: r2(alterno.costo), minimo_por_conjunto: r2(alterno.minimo_por_conjunto) },
    reparto: {
      total_mes: centavos.total, meta_ig: parte('meta_ig'), marca: r2(parte('meta_ig') * marca), rendimiento: r2(parte('meta_ig') * (1 - marca)),
      produccion: { monto: parte('produccion'), fraccion: totalMes > 0 ? Math.round((parte('produccion') / totalMes) * 1000) / 1000 : 0, origen: prod?.origen ?? 'sin_base' },
      otros: otros.map((o) => ({ ...o, monto: parte('otros:' + o.canal) })), sumado_a_meta_ig: r2(sumado), parte_meta_ig: totalMes > 0 ? Math.round((parte('meta_ig') / totalMes) * 1000) / 1000 : 0,
    },
    calendario, primera_lectura_dia: primeraLecturaDia(e.horizonte_dias, e.ciclo_dias), costo_por_venta: r2(costoPorVenta), alertas,
    equilibrio,
    confianza,
  }
}
