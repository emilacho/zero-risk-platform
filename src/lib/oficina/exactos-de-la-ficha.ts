/**
 * CAMBIO 4 · LAS REGLAS DURAS contra la ficha de la oferta, por código (FIRMADAS por Emilio 17-nov 20:37 · DECISION-EMILIO-reglas-duras-de-la-jefatura) · puro.
 *  D1 · vende una oferta cerrada o que aún no existe en su fecha (el campo que escribe la hoja con `ofertaCerradaOInexistenteEn`) ⇒ calendario.
 *       Un cierre que el cerebro registra DESPUÉS de armar la hoja también frena: `fichaConCierreVivo` (los hechos vivos, solo lectura · puerto `hechosPorOferta`).
 *  D2 · usa un dato vencido o aún no vigente en su fecha ⇒ hoja si la hoja lo trae, si no pieza.
 *  D3 · precio que no está en la ficha vigente ⇒ hoja si la hoja lo trae, si no pieza (la regla 3 de texto · se une a la de `chequeos.ts`).
 * Una regla dura se toma SÍ O SÍ: el creador no puede dejar de tomarla.
 * Regla de Emilio: «juzgar = agente; verificar exacto = código». Ante la duda NO dispara y lo declara (CC7).
 */
import { fichasConHechos, ofertaCerradaOInexistenteEn, type HechoDelNegocioPorOferta } from '../cadena/ficha-de-oferta'
import { CAMPO_CIERRE_DE_LA_HOJA, leerDato, normal, type DatoLeido, type FichaDeLaHoja, type Hallazgo } from './sentido-contra-la-ficha'

const limpio = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

// ───────────────────────── el precio (exacto, por código)
/**
 * un número de precio a centavos: `12,50` = `12.5` = 1250 · `1.200` = `1200` = 120000 · `1,2` = 120. La ÚLTIMA separación con 1 o 2 cifras detrás es la de decimales;
 * con 3 cifras detrás es de miles. Lo que no se lee = null (no se compara).
 */
export function centavos(num: string): number | null {
  const s = num.replace(/\s/g, '')
  if (!/^\d[\d.,]*$/.test(s)) return null
  const m = /^(.*?)([.,])(\d+)$/.exec(s)
  let entero = s
  let dec = ''
  if (m && m[3].length <= 2) { entero = m[1]; dec = m[3] }
  const e = entero.replace(/[.,]/g, '')
  if (!/^\d+$/.test(e)) return null
  return Number(e) * 100 + (dec ? Number(dec.padEnd(2, '0')) : 0)
}

// CC7 🟡 4 · la moneda de letras necesita borde de palabra delante: «IQ 100» no es «Q 100» (ante la duda, no dispara)
const MONEDA_ANTES = String.raw`(?<![\p{L}\p{N}])(?:US\$|USD|U\$S|\$|€|£|S\/\.?|R\$|Q|₡|₲|Bs\.?)`
const MONEDA_DESPUES = String.raw`(?:dólares|dolares|usd|eur|euros|soles|pesos|€|\$)`
const RE_PRECIO = new RegExp(String.raw`${MONEDA_ANTES}\s?(\d[\d.,]*\d|\d)|(\d[\d.,]*\d|\d)\s?${MONEDA_DESPUES}(?![\p{L}])`, 'giu')
/**
 * los precios del texto: SOLO cifras con moneda (antes o después). Fechas «21/11», horas, «20 %», teléfonos y «2x1» no tienen moneda: no cuentan (CC7 · ante la duda, no disparar).
 * Devuelve los centavos y el texto tal cual se vio.
 */
export function preciosDelTexto(texto: string): Array<{ centavos: number; visto: string }> {
  const out: Array<{ centavos: number; visto: string }> = []
  for (const m of String(texto ?? '').matchAll(RE_PRECIO)) {
    const c = centavos(m[1] ?? m[2] ?? '')
    if (c !== null) out.push({ centavos: c, visto: limpio(m[0]) })
  }
  return out
}
/** los precios de un dato de la ficha: con moneda si la trae; si el dato de precio no trae moneda, sus cifras sueltas (el dato YA es un precio) */
function preciosDelDato(valor: string): number[] {
  const conMoneda = preciosDelTexto(valor).map((p) => p.centavos)
  if (conMoneda.length) return conMoneda
  return [...valor.matchAll(/\d[\d.,]*\d|\d/g)].map((m) => centavos(m[0])).filter((c): c is number => c !== null)
}

export interface ResultadoExacto { hallazgos: Hallazgo[]; declarado: string[] }

/**
 * el rótulo de la hoja (`- LLAMADO A LA ACCIÓN:`, `- DATOS DEL CALENDARIO:`…) en cuya línea (o lista) aparece el dato: así el receptor sabe a qué insumo vuelve
 * (RESPUESTA-CC4-a-CC3 · (b) corregida). Tal como lo escribe `hoja.ts`; sin rótulo conocido ⇒ null (el receptor lo manda a la pieza).
 */
export function campoDeLaHoja(resto: string, aparece: (linea: string) => boolean): string | null {
  let campo: string | null = null
  for (const l of String(resto ?? '').split('\n')) {
    const c = /^-\s+([^:]+):/.exec(l)
    if (c) campo = c[1].replace(/\s+/g, ' ').trim()
    else if (!/^\s{2,}-\s+/.test(l)) campo = null
    if (aparece(l)) return campo
  }
  return null
}

/**
 * ¿el texto usa el dato? Con 4 o más letras basta que aparezca; uno CORTO (p. ej. «2x1») se mide como palabra entera (CC7 🟡 3: antes no se medía y nadie lo sabía).
 * «12x1» no es «2x1». Un dato vacío no se mide.
 */
const contieneNormal = (texto: string, valor: string): boolean => {
  const v = normal(valor)
  if (!v) return false
  const t = normal(texto)
  if (v.length >= 4) return t.includes(v)
  const esc = v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`(?:^|[^\\p{L}\\p{N}])${esc}(?:$|[^\\p{L}\\p{N}])`, 'u').test(t)
}

/**
 * LO EXACTO · solo con ficha. Sin ficha: nada (y lo declara).
 *  1. precio con moneda en la pieza que NO está entre los precios VIGENTES de «oferta y precio» ⇒ `hoja` si la hoja (fuera de la ficha) trae ese mismo precio, si no `pieza`.
 *     Sin precios vigentes en la ficha ⇒ no se compara y se declara.
 *  2. dato VENCIDO o AÚN NO VIGENTE en la fecha de la fila cuyo valor aparece tal cual (limpio) en la hoja fuera de la ficha ⇒ `hoja`; si no, en la pieza ⇒ `pieza`.
 */
export function chequeosExactos(f: FichaDeLaHoja, textoDeLaPieza: string): ResultadoExacto {
  if (f.estado !== 'con_ficha') return { hallazgos: [], declarado: [`sin ficha para esta oferta (${f.motivo ?? 'sin motivo'}): solo se revisa la forma`] }
  const datos = f.lineas.map(leerDato).filter((d): d is DatoLeido => !!d)
  const hallazgos: Hallazgo[] = []
  // D1 · la cadena ya decidió EXACTO (por el tipo del hecho del cerebro y la fecha de la fila) que la oferta está cerrada o aún no existe: la fila no va en esa fecha
  if (f.cierre) hallazgos.push({ destino: 'calendario', origen: 'codigo', que: `D1 · la oferta está cerrada o aún no existe en la fecha de la pieza: «${f.cierre}»`, linea_de_la_ficha: `${CAMPO_CIERRE_DE_LA_HOJA.toLowerCase()}: ${f.cierre}` })
  const declarado: string[] = []
  const deprecio = datos.filter((d) => normal(d.campo) === 'oferta y precio')
  const vigentes = new Set(deprecio.filter((d) => !d.marca).flatMap((d) => preciosDelDato(d.valor)))
  const enLaPieza = preciosDelTexto(textoDeLaPieza)
  if (enLaPieza.length && !vigentes.size) declarado.push('la ficha no trae un precio vigente: el precio de la pieza no se compara')
  else {
    const enLaHoja = new Set(preciosDelTexto(f.resto).map((p) => p.centavos))
    const vistos = new Set<number>()
    for (const p of enLaPieza) {
      if (vigentes.has(p.centavos) || vistos.has(p.centavos)) continue
      vistos.add(p.centavos)
      const origen = enLaHoja.has(p.centavos) ? 'hoja' : 'pieza'
      const campo = origen === 'hoja' ? campoDeLaHoja(f.resto, (l) => preciosDelTexto(l).some((x) => x.centavos === p.centavos)) : null
      hallazgos.push({ destino: origen, origen: 'codigo', que: `D3 · el precio «${p.visto}» no está entre los precios vigentes de la ficha${origen === 'hoja' ? ' y viene de la hoja' : ''}`, linea_de_la_ficha: deprecio.find((d) => !d.marca)?.linea ?? null, ...(campo ? { campo_de_la_hoja: campo } : {}) })
    }
  }
  for (const d of datos) {
    if (!d.marca) continue
    const como = d.marca === 'vencido' ? 'VENCIDO' : 'AÚN NO VIGENTE'
    if (contieneNormal(f.resto, d.valor)) { const campo = campoDeLaHoja(f.resto, (l) => contieneNormal(l, d.valor)); hallazgos.push({ destino: 'hoja', origen: 'codigo', que: `D2 · la hoja usa un dato ${como} en la fecha de la pieza: «${d.valor}»`, linea_de_la_ficha: d.linea, ...(campo ? { campo_de_la_hoja: campo } : {}) }) }
    else if (contieneNormal(textoDeLaPieza, d.valor)) hallazgos.push({ destino: 'pieza', origen: 'codigo', que: `D2 · la pieza usa un dato ${como} en su fecha: «${d.valor}»`, linea_de_la_ficha: d.linea })
  }
  return { hallazgos, declarado }
}

// ───────────────────────── D1 con los HECHOS VIVOS (CC7 19:44Z · CC6 sobre #1145): un cierre que el cerebro registra DESPUÉS de armar la hoja también frena
/**
 * suma a la ficha de la hoja el cierre que dicen los hechos vivos del cerebro en la fecha de la fila (mismas funciones de la cadena: `fichasConHechos` + `ofertaCerradaOInexistenteEn`).
 * Solo lectura y puro: la lectura la hace el orquestador. Sin ficha, sin oferta, si la hoja ya trae el cierre, sin fecha legible o sin hechos ⇒ la ficha queda igual (y se declara por qué no se midió).
 */
export function fichaConCierreVivo(f: FichaDeLaHoja, hechos: ReadonlyArray<HechoDelNegocioPorOferta> | null, fecha: string | null | 'ilegible'): { ficha: FichaDeLaHoja; declarado: string[] } {
  if (f.estado !== 'con_ficha' || !f.oferta || f.cierre) return { ficha: f, declarado: [] }
  if (!fecha || fecha === 'ilegible') return { ficha: f, declarado: ['D1 con los hechos vivos: sin fecha legible de la fila, no se mide'] }
  if (!hechos) return { ficha: f, declarado: ['D1 con los hechos vivos: los hechos del cerebro no se pudieron leer, vale el cierre que trae la hoja'] }
  const d = ofertaCerradaOInexistenteEn(fichasConHechos([{ clave: f.oferta }], hechos)[0], fecha)
  if (!d) return { ficha: f, declarado: [] }
  const cierre = `${d.valor} (fuente: ${d.fuente})`
  return { ficha: { ...f, cierre, lineas: [...f.lineas, `${CAMPO_CIERRE_DE_LA_HOJA.toLowerCase()}: ${cierre}`] }, declarado: ['D1: el cierre viene de los hechos vivos del cerebro (registrado después de armar la hoja)'] }
}
