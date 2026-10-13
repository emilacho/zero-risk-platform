/**
 * LA CALCULADORA FINANCIERA · por código, determinista, SIN modelo (ronda 79 · módulo financiero). AGNÓSTICA: no sabe de rubros, países ni clientes; la moneda es una etiqueta (no convierte).
 * Entra: ticket, margen (o costo variable), tasa de recompra, costo de pauta por cliente nuevo y la meta (clientes nuevos). Cada entrada es un `Dato`:
 *   · origen 'dato'     → sale de algo del propio negocio, con su FUENTE (precio publicado, ficha, manual…)
 *   · origen 'supuesto' → lo puso el agente financiero con su FUENTE o RANGO de mercado (min/max); nunca una celda vacía
 * Sale: costo máximo por cliente nuevo, retorno necesario, presupuesto para la meta, punto de equilibrio y ≥ 2 escenarios. CADA número dice si es dato o supuesto, de qué depende y su rango.
 * Las reglas propias de la calculadora (utilidad objetivo, factores de los escenarios) también van declaradas como supuestos de la calculadora, no escondidas.
 */
export type OrigenDelDato = 'dato' | 'supuesto'
export interface Dato { valor: number; min?: number; max?: number; origen: OrigenDelDato; fuente: string }

export interface EntradaFinanciera {
  moneda: string
  ticket: Dato
  /** margen como fracción de 0 a 1 (0,35 = 35 %) · si no se tiene, `costo_variable` por venta */
  margen?: Dato
  costo_variable?: Dato
  /** compras ADICIONALES que hace en promedio un cliente nuevo dentro del horizonte (0 = compra una sola vez) */
  recompra: Dato
  /** lo que cuesta por pauta conseguir UN cliente nuevo */
  costo_pauta_por_cliente: Dato
  /** la meta: clientes nuevos en el horizonte */
  meta_clientes_nuevos: Dato
  horizonte_dias?: number
  /** fracción del valor por cliente que se quiere dejar como utilidad (la calculadora usa 0,3 si no se da) */
  utilidad_objetivo?: Dato
}

export interface Cifra { valor: number; min: number; max: number; unidad: string; origen: OrigenDelDato; /** todas las entradas de las que sale */ depende_de: string[]; /** de ellas, las que son SUPUESTO (por eso la cifra lo es) */ supuestos_de: string[]; formula: string }
export interface Escenario {
  nombre: 'prudente' | 'objetivo' | 'ambicioso'
  clientes: Cifra; costo_por_cliente: Cifra; inversion: Cifra; ventas: Cifra; ingreso: Cifra; utilidad: Cifra
  retorno_primera_compra: Cifra; punto_de_equilibrio_clientes: Cifra
  rentable: boolean
  rentable_en_el_peor_caso: boolean
}
export interface SalidaFinanciera {
  ok: true
  moneda: string
  horizonte_dias: number
  margen_por_venta: Cifra; compras_por_cliente: Cifra; valor_por_cliente: Cifra
  costo_maximo_por_cliente: Cifra
  retorno_necesario: Cifra
  presupuesto_para_la_meta: Cifra
  punto_de_equilibrio_ventas: Cifra
  escenarios: Escenario[]
  supuestos_de_la_calculadora: Array<{ nombre: string; valor: number; porque: string }>
  entradas: Record<string, Dato & { unidad: string }>
}
export type ResultadoFinanciero = SalidaFinanciera | { ok: false; faltan: Array<{ campo: string; motivo: string }> }

const UTILIDAD_OBJETIVO_POR_OMISION = 0.3
const FACTORES = { prudente: { meta: 0.7, cpa: 1.25 }, objetivo: { meta: 1, cpa: 1 }, ambicioso: { meta: 1.4, cpa: 1.15 } } as const

const finito = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n)

/** valida un dato: número, rango coherente, fuente escrita, origen declarado */
export function validarDato(d: unknown, campo: string, limites: { min: number; max: number; excluyeMin?: boolean }): string | null {
  if (!d || typeof d !== 'object') return `${campo}: falta`
  const x = d as Record<string, unknown>
  if (!finito(x.valor)) return `${campo}: el valor no es un número`
  if (x.origen !== 'dato' && x.origen !== 'supuesto') return `${campo}: no dice si es dato o supuesto`
  if (typeof x.fuente !== 'string' || x.fuente.trim().length < 8) return `${campo}: no trae su fuente (o rango de mercado de dónde sale)`
  const bajo = (n: number) => (limites.excluyeMin ? n <= limites.min : n < limites.min)
  for (const [k, v] of [['valor', x.valor], ['min', x.min], ['max', x.max]] as Array<[string, unknown]>) {
    if (v === undefined) continue
    if (!finito(v)) return `${campo}: ${k} no es un número`
    if (bajo(v) || v > limites.max) return `${campo}: ${k} (${v}) fuera de lo razonable [${limites.excluyeMin ? '>' : ''}${limites.min}, ${limites.max}]`
  }
  if (x.min !== undefined && x.max !== undefined && (x.min as number) > (x.max as number)) return `${campo}: el mínimo es mayor que el máximo`
  if (x.min !== undefined && (x.valor as number) < (x.min as number)) return `${campo}: el valor está por debajo de su mínimo`
  if (x.max !== undefined && (x.valor as number) > (x.max as number)) return `${campo}: el valor está por encima de su máximo`
  return null
}

const LIMITES: Record<string, { min: number; max: number; excluyeMin?: boolean }> = {
  ticket: { min: 0, max: 1e9, excluyeMin: true },
  margen: { min: 0, max: 1, excluyeMin: true },
  costo_variable: { min: 0, max: 1e9 },
  recompra: { min: 0, max: 50 },
  costo_pauta_por_cliente: { min: 0, max: 1e9, excluyeMin: true },
  meta_clientes_nuevos: { min: 0, max: 1e7, excluyeMin: true },
  utilidad_objetivo: { min: 0, max: 0.95 },
}

const rango = (d: Dato): { lo: number; c: number; hi: number } => ({ lo: finito(d.min) ? d.min : d.valor, c: d.valor, hi: finito(d.max) ? d.max : d.valor })

/** evalúa `f` sobre las esquinas del rango de las entradas (las fórmulas son monótonas por tramo) y devuelve valor central, mínimo y máximo */
function evaluar(entradas: Record<string, Dato | number>, f: (v: Record<string, number>) => number): { valor: number; min: number; max: number } {
  const claves = Object.keys(entradas)
  const centro: Record<string, number> = {}
  const opciones: number[][] = []
  for (const k of claves) {
    const e = entradas[k]
    if (typeof e === 'number') { centro[k] = e; opciones.push([e]) } else { const r = rango(e); centro[k] = r.c; opciones.push(r.lo === r.hi ? [r.c] : [r.lo, r.hi]) }
  }
  let min = Infinity, max = -Infinity
  const rec = (i: number, acum: Record<string, number>): void => {
    if (i === claves.length) { const y = f(acum); if (finito(y)) { min = Math.min(min, y); max = Math.max(max, y) } return }
    for (const o of opciones[i]) rec(i + 1, { ...acum, [claves[i]]: o })
  }
  rec(0, {})
  const valor = f(centro)
  return { valor, min: Math.min(min, valor), max: Math.max(max, valor) }
}

const redondear = (n: number): number => Math.round(n * 100) / 100

function cifra(nombre: string, unidad: string, formula: string, deps: Record<string, Dato | number>, origenes: Record<string, OrigenDelDato>, f: (v: Record<string, number>) => number): Cifra {
  const r = evaluar(deps, f)
  const dependeDe = Object.keys(deps)
  const supuestosDe = dependeDe.filter((k) => origenes[k] === 'supuesto')
  const origen: OrigenDelDato = supuestosDe.length ? 'supuesto' : 'dato'
  void nombre
  return { valor: redondear(r.valor), min: redondear(r.min), max: redondear(r.max), unidad, origen, depende_de: dependeDe, supuestos_de: supuestosDe, formula }
}

export function calcular(e: EntradaFinanciera): ResultadoFinanciero {
  const faltan: Array<{ campo: string; motivo: string }> = []
  const falla = (campo: string, d: unknown) => { const m = validarDato(d, campo, LIMITES[campo]); if (m) faltan.push({ campo, motivo: m.replace(`${campo}: `, '') }) }
  if (typeof e?.moneda !== 'string' || !e.moneda.trim()) faltan.push({ campo: 'moneda', motivo: 'falta la moneda' })
  falla('ticket', e?.ticket); falla('recompra', e?.recompra); falla('costo_pauta_por_cliente', e?.costo_pauta_por_cliente); falla('meta_clientes_nuevos', e?.meta_clientes_nuevos)
  if (e?.margen) falla('margen', e.margen)
  else if (e?.costo_variable) falla('costo_variable', e.costo_variable)
  else faltan.push({ campo: 'margen', motivo: 'falta el margen (o el costo variable por venta)' })
  if (e?.utilidad_objetivo) falla('utilidad_objetivo', e.utilidad_objetivo)
  if (finito(e?.ticket?.valor) && e.costo_variable && finito(e.costo_variable.valor) && e.costo_variable.valor >= e.ticket.valor) faltan.push({ campo: 'costo_variable', motivo: 'el costo variable no puede ser igual o mayor que el ticket (no habría margen)' })
  if (faltan.length) return { ok: false, faltan }

  const horizonte = finito(e.horizonte_dias) && e.horizonte_dias > 0 ? e.horizonte_dias : 90
  // el margen como fracción: si llegó el costo variable, margen = (ticket − costo variable) / ticket (con rangos: el margen más alto va con el costo más bajo y el ticket más alto)
  const margen: Dato = e.margen ?? (() => {
    const t = e.ticket, c = e.costo_variable as Dato
    const m = (tv: number, cv: number) => (tv - cv) / tv
    const origen: OrigenDelDato = t.origen === 'dato' && c.origen === 'dato' ? 'dato' : 'supuesto'
    const tr = rango(t), cr = rango(c)
    return { valor: m(t.valor, c.valor), min: Math.min(m(tr.lo, cr.hi), m(tr.hi, cr.hi)), max: Math.max(m(tr.hi, cr.lo), m(tr.lo, cr.lo)), origen, fuente: `margen sale del ticket (${t.fuente}) y del costo variable (${c.fuente})` }
  })()
  const utilidad: Dato = e.utilidad_objetivo ?? { valor: UTILIDAD_OBJETIVO_POR_OMISION, origen: 'supuesto', fuente: 'regla de la calculadora: el 30 % del valor de un cliente se deja como utilidad' }
  const O: Record<string, OrigenDelDato> = { ticket: e.ticket.origen, margen: margen.origen, recompra: e.recompra.origen, cpa: e.costo_pauta_por_cliente.origen, meta: e.meta_clientes_nuevos.origen, utilidad: utilidad.origen, fm: 'supuesto', fc: 'supuesto' }
  const T = e.ticket, R = e.recompra, CPA = e.costo_pauta_por_cliente, META = e.meta_clientes_nuevos

  const margen_por_venta = cifra('margen_por_venta', e.moneda, 'ticket × margen', { ticket: T, margen }, O, (v) => v.ticket * v.margen)
  const compras_por_cliente = cifra('compras_por_cliente', 'compras', '1 + recompra', { recompra: R }, O, (v) => 1 + v.recompra)
  const valor_por_cliente = cifra('valor_por_cliente', e.moneda, 'ticket × margen × (1 + recompra)', { ticket: T, margen, recompra: R }, O, (v) => v.ticket * v.margen * (1 + v.recompra))
  const costo_maximo_por_cliente = cifra('costo_maximo_por_cliente', e.moneda, 'valor por cliente × (1 − utilidad objetivo)', { ticket: T, margen, recompra: R, utilidad }, O, (v) => v.ticket * v.margen * (1 + v.recompra) * (1 - v.utilidad))
  const retorno_necesario = cifra('retorno_necesario', 'por cada unidad invertida', '1 / margen (ingreso de la primera compra que cubre la pauta)', { margen }, O, (v) => 1 / v.margen)
  const presupuesto_para_la_meta = cifra('presupuesto_para_la_meta', e.moneda, 'meta de clientes × costo de pauta por cliente', { meta: META, cpa: CPA }, O, (v) => v.meta * v.cpa)
  const punto_de_equilibrio_ventas = cifra('punto_de_equilibrio_ventas', 'ventas', 'presupuesto para la meta / margen por venta', { meta: META, cpa: CPA, ticket: T, margen }, O, (v) => (v.meta * v.cpa) / (v.ticket * v.margen))

  const escenarios: Escenario[] = (['prudente', 'objetivo', 'ambicioso'] as const).map((nombre) => {
    const F = FACTORES[nombre]
    const base = { meta: META, cpa: CPA, ticket: T, margen, recompra: R, fm: F.meta, fc: F.cpa }
    const clientes = cifra('clientes', 'clientes', `meta × ${F.meta}`, { meta: META, fm: F.meta }, O, (v) => v.meta * v.fm)
    const costo_por_cliente = cifra('costo_por_cliente', e.moneda, `costo de pauta × ${F.cpa}`, { cpa: CPA, fc: F.cpa }, O, (v) => v.cpa * v.fc)
    const inversion = cifra('inversion', e.moneda, 'clientes × costo por cliente', base, O, (v) => v.meta * v.fm * v.cpa * v.fc)
    const ventas = cifra('ventas', 'ventas', 'clientes × (1 + recompra)', base, O, (v) => v.meta * v.fm * (1 + v.recompra))
    const ingreso = cifra('ingreso', e.moneda, 'ventas × ticket', base, O, (v) => v.meta * v.fm * (1 + v.recompra) * v.ticket)
    const util = cifra('utilidad', e.moneda, 'ventas × margen por venta − inversión', base, O, (v) => v.meta * v.fm * (1 + v.recompra) * v.ticket * v.margen - v.meta * v.fm * v.cpa * v.fc)
    const retorno_primera_compra = cifra('retorno_primera_compra', 'por cada unidad invertida', 'ticket / costo por cliente', { ticket: T, cpa: CPA, fc: F.cpa }, O, (v) => v.ticket / (v.cpa * v.fc))
    const pe = cifra('punto_de_equilibrio_clientes', 'clientes', 'inversión / valor por cliente', base, O, (v) => (v.meta * v.fm * v.cpa * v.fc) / (v.ticket * v.margen * (1 + v.recompra)))
    return { nombre, clientes, costo_por_cliente, inversion, ventas, ingreso, utilidad: util, retorno_primera_compra, punto_de_equilibrio_clientes: pe, rentable: util.valor >= 0, rentable_en_el_peor_caso: util.min >= 0 }
  })

  const aEntrada = (d: Dato, unidad: string) => ({ ...d, unidad })
  return {
    ok: true, moneda: e.moneda.trim().toUpperCase(), horizonte_dias: horizonte,
    margen_por_venta, compras_por_cliente, valor_por_cliente, costo_maximo_por_cliente, retorno_necesario, presupuesto_para_la_meta, punto_de_equilibrio_ventas, escenarios,
    supuestos_de_la_calculadora: [
      ...(e.utilidad_objetivo ? [] : [{ nombre: 'utilidad_objetivo', valor: UTILIDAD_OBJETIVO_POR_OMISION, porque: 'regla de la calculadora: el costo máximo por cliente deja el 30 % de su valor como utilidad' }]),
      ...(['prudente', 'objetivo', 'ambicioso'] as const).flatMap((n) => [
        { nombre: `escenario_${n}_meta`, valor: FACTORES[n].meta, porque: `el escenario ${n} alcanza el ${Math.round(FACTORES[n].meta * 100)} % de la meta` },
        { nombre: `escenario_${n}_costo_de_pauta`, valor: FACTORES[n].cpa, porque: n === 'prudente' ? 'la pauta rinde peor de lo esperado (+25 %)' : n === 'ambicioso' ? 'al subir la inversión la pauta se encarece por saturación (+15 %)' : 'la pauta rinde como se esperaba' },
      ]),
    ],
    entradas: { ticket: aEntrada(T, e.moneda), margen: aEntrada(margen, 'fracción'), recompra: aEntrada(R, 'compras adicionales'), costo_pauta_por_cliente: aEntrada(CPA, e.moneda), meta_clientes_nuevos: aEntrada(META, 'clientes'), utilidad_objetivo: aEntrada(utilidad, 'fracción') },
  }
}

/** importe con su moneda, legible (separador de miles y decimales del español; sin convertir nada) */
export function formatearDinero(n: number, moneda: string): string {
  // formato fijo (no depende de la configuración regional del servidor): miles con punto, decimales con coma
  const entero = Math.abs(n - Math.round(n)) < 0.005
  const [ent, dec] = Math.abs(entero ? Math.round(n) : n).toFixed(entero ? 0 : 2).split('.')
  return `${moneda} ${n < 0 ? '-' : ''}${ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.')}${dec ? ',' + dec : ''}`
}

const marca = (c: Cifra): string => (c.origen === 'dato' ? 'dato' : 'supuesto')
const rangoTxt = (c: Cifra, f: (n: number) => string): string => (c.min !== c.max ? ` (rango ${f(c.min)} a ${f(c.max)})` : '')

/** el BLOQUE que lee el redactor: cada número con su etiqueta de dato o supuesto, su fuente o rango, y la orden de usarlo sin recalcular */
export function bloqueFinanciero(s: SalidaFinanciera): string[] {
  const d = (n: number) => formatearDinero(n, s.moneda)
  const n0 = (n: number) => { const [ent, dec] = String(Math.round(n * 100) / 100).split('.'); return ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.') + (dec ? ',' + dec : '') }
  const L: string[] = []
  L.push('══════ BLOQUE FINANCIERO (calculado por código: úsalo TAL CUAL, no recalcules) ══════')
  L.push(`Moneda: ${s.moneda} · horizonte: ${s.horizonte_dias} días. Cada número dice si es un DATO (con su fuente) o un SUPUESTO (con su rango o fuente). En el plan di cuáles son datos y cuáles supuestos; no cambies ni una cifra.`)
  L.push('')
  L.push('ENTRADAS:')
  for (const [k, v] of Object.entries(s.entradas)) {
    const f = v.unidad === s.moneda ? d : n0
    L.push(`- ${k.replace(/_/g, ' ')}: ${f(v.valor)}${v.min !== undefined || v.max !== undefined ? ` (rango ${f(v.min ?? v.valor)} a ${f(v.max ?? v.valor)})` : ''} · ${v.origen} · ${v.fuente}`)
  }
  L.push('')
  L.push('CÁLCULOS:')
  L.push(`- margen por venta: ${d(s.margen_por_venta.valor)}${rangoTxt(s.margen_por_venta, d)} · ${marca(s.margen_por_venta)}`)
  L.push(`- valor de un cliente nuevo en el horizonte: ${d(s.valor_por_cliente.valor)}${rangoTxt(s.valor_por_cliente, d)} · ${marca(s.valor_por_cliente)}`)
  L.push(`- COSTO MÁXIMO por cliente nuevo: ${d(s.costo_maximo_por_cliente.valor)}${rangoTxt(s.costo_maximo_por_cliente, d)} · ${marca(s.costo_maximo_por_cliente)} (por encima de eso cada cliente nuevo pierde dinero)`)
  L.push(`- retorno necesario de la primera compra: ${n0(s.retorno_necesario.valor)} por cada unidad invertida · ${marca(s.retorno_necesario)}`)
  L.push(`- PRESUPUESTO PARA LA META: ${d(s.presupuesto_para_la_meta.valor)}${rangoTxt(s.presupuesto_para_la_meta, d)} · ${marca(s.presupuesto_para_la_meta)}`)
  L.push(`- punto de equilibrio: ${n0(s.punto_de_equilibrio_ventas.valor)} ventas para recuperar la pauta · ${marca(s.punto_de_equilibrio_ventas)}`)
  L.push('')
  L.push('ESCENARIOS (todas las celdas tienen cifra):')
  for (const e of s.escenarios) {
    L.push(`- ${e.nombre.toUpperCase()}: ${n0(e.clientes.valor)} clientes nuevos · costo por cliente ${d(e.costo_por_cliente.valor)} · INVERSIÓN ${d(e.inversion.valor)}${rangoTxt(e.inversion, d)} · ventas ${n0(e.ventas.valor)} · ingreso ${d(e.ingreso.valor)} · utilidad ${d(e.utilidad.valor)} · retorno de la primera compra ${n0(e.retorno_primera_compra.valor)} · equilibrio en ${n0(e.punto_de_equilibrio_clientes.valor)} clientes · ${marca(e.inversion)}`)
  }
  L.push('')
  L.push('REGLAS DE LA CALCULADORA (supuestos propios, decláralos como tales si los usas): ' + s.supuestos_de_la_calculadora.map((x) => `${x.nombre.replace(/_/g, ' ')} = ${x.valor}`).join(' · '))
  L.push('El reparto del presupuesto entre renglones lo propones tú desde estos números, con la razón de cada porcentaje.')
  L.push('')
  return L
}

/** las cifras que el plan DEBE traer tal cual (para que `revisarPlan` compruebe que los números del plan son los de la calculadora) */
export function cifrasObligatorias(s: SalidaFinanciera): Array<{ que: string; valor: number }> {
  return [
    { que: 'costo máximo por cliente nuevo', valor: s.costo_maximo_por_cliente.valor },
    { que: 'presupuesto para la meta', valor: s.presupuesto_para_la_meta.valor },
    ...s.escenarios.map((e) => ({ que: `inversión del escenario ${e.nombre}`, valor: e.inversion.valor })),
  ]
}
