/**
 * LOS SUPUESTOS · lo que el agente financiero pone (ronda 79 · módulo financiero). PURO, sin base y sin modelo.
 * La calculadora exige cinco entradas. Lo que el negocio ya dio (o lo que sale de SUS precios publicados) entra como DATO con su fuente y el agente NO lo toca;
 * lo que falta lo pone el agente financiero como SUPUESTO con su fuente o su rango de mercado: nunca una celda vacía. El código valida cada uno antes de calcular.
 */
import { calcular, validarDato, type Dato, type EntradaFinanciera, type ResultadoFinanciero } from './calculadora'
import { preciosPublicados, type FilaDeRaspado } from '../manual/materia'

export const CAMPOS_DEL_AGENTE = ['ticket', 'margen', 'recompra', 'costo_pauta_por_cliente', 'meta_clientes_nuevos'] as const
export type CampoDelAgente = (typeof CAMPOS_DEL_AGENTE)[number]
export const AGENTE_FINANCIERO = 'finance-financial-analyst'

export interface DatosDelNegocio {
  moneda: string | null
  moneda_fuente: string
  rubro: string | null
  pais: string | null
  modelo_de_negocio: string | null
  /** lo que el negocio ya dio o salió de sus precios publicados (DATO con fuente): el agente no lo toca */
  fijos: Partial<Record<CampoDelAgente, Dato>>
  precios_publicados: { n: number; min: number; mediana: number; max: number } | null
}

const num = (s: string): number | null => {
  const t = s.replace(/[^\d.,]/g, '')
  if (!t) return null
  const c = t.includes(',') && t.includes('.') ? (t.lastIndexOf(',') > t.lastIndexOf('.') ? t.replace(/\./g, '').replace(',', '.') : t.replace(/,/g, '')) : t.includes(',') ? (/,\d{3}$/.test(t) ? t.replace(/,/g, '') : t.replace(',', '.')) : t
  const n = Number(c)
  return Number.isFinite(n) ? n : null
}

/** los textos que parecen JSON (datos estructurados guardados como cadena) dentro de un ítem raspado, hasta 5 niveles */
function textosJson(x: unknown, d = 0, out: string[] = []): string[] {
  if (d > 5 || out.length > 200) return out
  if (typeof x === 'string') { const t = x.trim(); if ((t.startsWith('{') || t.startsWith('[')) && t.length > 2) out.push(t) } else if (Array.isArray(x)) x.forEach((y) => textosJson(y, d + 1, out)); else if (x && typeof x === 'object') Object.values(x as Record<string, unknown>).forEach((y) => textosJson(y, d + 1, out))
  return out
}

/** estadística de los precios que el propio sitio publica (datos estructurados de su sitio) */
export function preciosDelSitio(filas: Array<Pick<FilaDeRaspado, 'apify_function' | 'respuesta' | 'ensayo'>>): DatosDelNegocio['precios_publicados'] {
  const v: number[] = []
  for (const f of filas) {
    if (f.ensayo || f.apify_function !== 'website_content_scraper') continue
    for (const it of Array.isArray(f.respuesta) ? f.respuesta : [f.respuesta]) for (const l of [...preciosPublicados(it), ...preciosPublicados(textosJson(it))]) { const m = /^precio:\s*([^\s·]+)/.exec(l); const n = m ? num(m[1]) : null; if (n !== null && n > 0) v.push(n) }
  }
  if (!v.length) return null
  const o = [...v].sort((a, b) => a - b)
  const mediana = o.length % 2 ? o[(o.length - 1) / 2] : (o[o.length / 2 - 1] + o[o.length / 2]) / 2
  return { n: o.length, min: o[0], mediana, max: o[o.length - 1] }
}

/** lo que el negocio declaró en su ficha (`config.finanzas`): cada campo, con su valor y su fuente («lo declara el dueño») */
export function fijosDeLaFicha(config: unknown): Partial<Record<CampoDelAgente, Dato>> {
  const f = config && typeof config === 'object' ? ((config as Record<string, unknown>).finanzas as Record<string, unknown> | undefined) : undefined
  const out: Partial<Record<CampoDelAgente, Dato>> = {}
  if (!f || typeof f !== 'object') return out
  for (const c of CAMPOS_DEL_AGENTE) {
    const x = f[c]
    if (typeof x === 'number' && Number.isFinite(x)) out[c] = { valor: x, origen: 'dato', fuente: 'lo declara el negocio en su ficha' }
    else if (x && typeof x === 'object' && typeof (x as Record<string, unknown>).valor === 'number') out[c] = { ...(x as Dato), origen: 'dato', fuente: String((x as Dato).fuente ?? 'lo declara el negocio en su ficha') }
  }
  return out
}

export function datosDelNegocio(entrada: { ficha: { industry?: unknown; country?: unknown; market?: unknown; config?: unknown } | null; moneda: { codigo: string | null; fuente: string }; filas: Array<Pick<FilaDeRaspado, 'apify_function' | 'respuesta' | 'ensayo'>> }): DatosDelNegocio {
  const fijos = fijosDeLaFicha(entrada.ficha?.config)
  const precios = preciosDelSitio(entrada.filas)
  if (!fijos.ticket && precios && precios.n >= 3) {
    fijos.ticket = { valor: precios.mediana, min: precios.min, max: precios.max, origen: 'dato', fuente: `precios que el propio negocio publica en su sitio (mediana de ${precios.n} precios; van de ${precios.min} a ${precios.max})` }
  }
  const bm = entrada.ficha?.config && typeof entrada.ficha.config === 'object' ? ((entrada.ficha.config as Record<string, unknown>).business_model as Record<string, unknown> | undefined) : undefined
  return {
    moneda: entrada.moneda.codigo, moneda_fuente: entrada.moneda.fuente,
    rubro: typeof entrada.ficha?.industry === 'string' ? entrada.ficha.industry : null,
    pais: typeof entrada.ficha?.country === 'string' ? entrada.ficha.country : (typeof entrada.ficha?.market === 'string' ? entrada.ficha.market : null),
    modelo_de_negocio: bm && typeof bm.text === 'string' ? bm.text.slice(0, 800) : null,
    fijos, precios_publicados: precios,
  }
}

export const faltantesDe = (d: DatosDelNegocio): CampoDelAgente[] => CAMPOS_DEL_AGENTE.filter((c) => !d.fijos[c])

const QUE: Record<CampoDelAgente, string> = {
  ticket: 'lo que gasta un cliente en UNA compra típica (en la moneda del negocio)',
  margen: 'qué fracción del ticket queda como ganancia bruta después del costo directo de producir o entregar (0,35 = 35 %)',
  recompra: 'cuántas compras ADICIONALES hace en promedio un cliente nuevo dentro de 90 días (0 = compra una sola vez)',
  costo_pauta_por_cliente: 'lo que cuesta en pauta pagada conseguir UN cliente nuevo en este rubro y este mercado (en la moneda del negocio)',
  meta_clientes_nuevos: 'cuántos clientes nuevos en 90 días son una meta razonable y ambiciosa para este negocio dada su operación (a confirmar por el dueño)',
}

export function armarPedidoFinanciero(d: DatosDelNegocio): { campos: CampoDelAgente[]; task: string } {
  const campos = faltantesDe(d)
  const fijos = Object.entries(d.fijos).map(([k, v]) => `- ${k}: ${v!.valor}${v!.min !== undefined ? ` (de ${v!.min} a ${v!.max})` : ''} · DATO · ${v!.fuente}`)
  const t = [
    'Eres el analista financiero del negocio de abajo. La CALCULADORA (código) hará todas las cuentas; tu trabajo es poner los SUPUESTOS que faltan, cada uno con su fuente o su rango de mercado. NUNCA dejes un campo vacío.',
    '',
    'EL NEGOCIO:',
    `- rubro: ${d.rubro ?? '(no declarado)'}`, `- país o zona: ${d.pais ?? '(no declarado)'}`, `- moneda: ${d.moneda ?? '(no declarada: usa la del país y dilo)'} (${d.moneda_fuente})`,
    ...(d.modelo_de_negocio ? [`- cómo opera: ${d.modelo_de_negocio}`] : []),
    ...(d.precios_publicados ? [`- precios que publica en su sitio: ${d.precios_publicados.n} precios, de ${d.precios_publicados.min} a ${d.precios_publicados.max} (mediana ${d.precios_publicados.mediana})`] : ['- no publica precios en su sitio']),
    '',
    'YA ESTÁN FIJADOS (son DATOS del negocio: no los cambies ni los repitas):', ...(fijos.length ? fijos : ['- (ninguno)']),
    '',
    `TÚ PONES ESTOS ${campos.length}:`, ...campos.map((c) => `- ${c}: ${QUE[c]}`),
    '',
    'REGLAS: (1) cada campo lleva "valor" (el más probable), "min" y "max" (el rango de mercado razonable) y "fuente": una referencia PÚBLICA del sector o del país con su nombre y el año, o el cálculo que usaste a partir de los datos de arriba. (2) Si no hay una referencia exacta, usa un rango AMPLIO y dilo en la fuente: un rango amplio con su fuente vale más que una celda vacía. (3) No presentes un supuesto como un dato del negocio. (4) Los precios publicados del negocio mandan sobre cualquier cifra de mercado para el ticket. (5) La meta es una propuesta que confirma el dueño: dilo en su fuente.',
    '',
    'Responde SOLO un objeto JSON, sin texto antes ni después: {"supuestos": {"<campo>": {"valor": 0, "min": 0, "max": 0, "fuente": "…"}}, "notas": "una frase con lo más incierto"}',
  ].join('\n')
  return { campos, task: t }
}

export interface LecturaDeSupuestos { ok: boolean; supuestos: Partial<Record<CampoDelAgente, Dato>>; rechazados: Array<{ campo: string; motivo: string }>; notas: string | null }

/** lector tolerante de la respuesta del agente + validación de cada supuesto; lo que el negocio ya dio (dato) no se pisa */
export function leerSupuestos(texto: unknown, campos: readonly CampoDelAgente[]): LecturaDeSupuestos {
  const t = typeof texto === 'string' ? texto : ''
  let obj: Record<string, unknown> | null = null
  const ini = t.indexOf('{')
  if (ini >= 0) for (let fin = t.lastIndexOf('}'); fin > ini; fin = t.lastIndexOf('}', fin - 1)) { try { const p = JSON.parse(t.slice(ini, fin + 1)); if (p && typeof p === 'object' && !Array.isArray(p)) { obj = p as Record<string, unknown>; break } } catch { /* probar con un cierre anterior */ } }
  const rechazados: Array<{ campo: string; motivo: string }> = []
  const supuestos: Partial<Record<CampoDelAgente, Dato>> = {}
  if (!obj) return { ok: false, supuestos, rechazados: [{ campo: '(respuesta)', motivo: 'la respuesta no trae un objeto JSON legible' }], notas: null }
  const bloque = (obj.supuestos && typeof obj.supuestos === 'object' ? obj.supuestos : {}) as Record<string, unknown>
  for (const k of Object.keys(bloque)) if (!(CAMPOS_DEL_AGENTE as readonly string[]).includes(k) || !campos.includes(k as CampoDelAgente)) rechazados.push({ campo: k, motivo: 'no se le pidió ese campo (o ya es un dato del negocio): no se toca' })
  for (const c of campos) {
    const x = bloque[c]
    if (!x || typeof x !== 'object') { rechazados.push({ campo: c, motivo: 'el agente no lo puso' }); continue }
    const o = x as Record<string, unknown>
    const d: Dato = { valor: o.valor as number, ...(o.min !== undefined ? { min: o.min as number } : {}), ...(o.max !== undefined ? { max: o.max as number } : {}), origen: 'supuesto', fuente: typeof o.fuente === 'string' ? o.fuente.trim() : '' }
    // los límites de cada campo son los de la calculadora
    const m = validarDato(d, c, LIM[c])
    if (m) rechazados.push({ campo: c, motivo: m.replace(`${c}: `, '') })
    else supuestos[c] = d
  }
  return { ok: rechazados.length === 0, supuestos, rechazados, notas: typeof obj.notas === 'string' ? obj.notas.trim().slice(0, 400) : null }
}
const LIM: Record<CampoDelAgente, { min: number; max: number; excluyeMin?: boolean }> = {
  ticket: { min: 0, max: 1e9, excluyeMin: true }, margen: { min: 0, max: 1, excluyeMin: true }, recompra: { min: 0, max: 50 }, costo_pauta_por_cliente: { min: 0, max: 1e9, excluyeMin: true }, meta_clientes_nuevos: { min: 0, max: 1e7, excluyeMin: true },
}

/** junta datos y supuestos y calcula; sin la moneda no se calcula */
export function calcularDelNegocio(d: DatosDelNegocio, supuestos: Partial<Record<CampoDelAgente, Dato>>): ResultadoFinanciero {
  const todos = { ...supuestos, ...d.fijos } // lo que el negocio dio manda sobre cualquier supuesto
  return calcular({ moneda: d.moneda ?? '', ticket: todos.ticket as Dato, margen: todos.margen, recompra: todos.recompra as Dato, costo_pauta_por_cliente: todos.costo_pauta_por_cliente as Dato, meta_clientes_nuevos: todos.meta_clientes_nuevos as Dato } as EntradaFinanciera)
}
