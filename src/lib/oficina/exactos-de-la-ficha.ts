/**
 * CAMBIO 4 · punto 2 · LO EXACTO POR CÓDIGO contra la ficha de la oferta (precio y dato vencido o aún no vigente que se usa igual) · puro.
 * Va APARTE del resto del cambio 4: Emilio decide antes de meter cualquier verificación por código (RESPUESTA-LENOVO-a-CC4-cambio-4-espera-a-emilio). En rama, sin publicar, hasta su firma.
 * Regla de Emilio: «juzgar = agente; verificar exacto = código». Ante la duda NO dispara y lo declara (CC7).
 */
import { leerDato, normal, type DatoLeido, type FichaDeLaHoja, type Hallazgo } from './sentido-contra-la-ficha'

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

const MONEDA_ANTES = String.raw`(?:US\$|USD|U\$S|\$|€|£|S\/\.?|R\$|Q|₡|₲|Bs\.?)`
const MONEDA_DESPUES = String.raw`(?:dólares|dolares|usd|eur|euros|soles|pesos|€|\$)`
const RE_PRECIO = new RegExp(String.raw`${MONEDA_ANTES}\s?(\d[\d.,]*\d|\d)|(\d[\d.,]*\d|\d)\s?${MONEDA_DESPUES}(?![a-z])`, 'gi')
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

const contieneNormal = (texto: string, valor: string): boolean => { const v = normal(valor); return v.length >= 4 && normal(texto).includes(v) }

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
      hallazgos.push({ destino: origen, origen: 'codigo', que: `el precio «${p.visto}» no está entre los precios vigentes de la ficha${origen === 'hoja' ? ' y viene de la hoja' : ''}`, linea_de_la_ficha: deprecio.find((d) => !d.marca)?.linea ?? null })
    }
  }
  for (const d of datos) {
    if (!d.marca) continue
    const como = d.marca === 'vencido' ? 'VENCIDO' : 'AÚN NO VIGENTE'
    if (contieneNormal(f.resto, d.valor)) hallazgos.push({ destino: 'hoja', origen: 'codigo', que: `la hoja usa un dato ${como} en la fecha de la pieza: «${d.valor}»`, linea_de_la_ficha: d.linea })
    else if (contieneNormal(textoDeLaPieza, d.valor)) hallazgos.push({ destino: 'pieza', origen: 'codigo', que: `la pieza usa un dato ${como} en su fecha: «${d.valor}»`, linea_de_la_ficha: d.linea })
  }
  return { hallazgos, declarado }
}

