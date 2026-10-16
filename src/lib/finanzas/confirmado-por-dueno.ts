/**
 * LO QUE EL DUEÑO CONFIRMÓ NO ES «DADO POR VERIFICADO» (CC#1 · 16-oct). Código puro, sin red.
 * El plan lista como «dado por verificado» todo lo que da por cierto; el código no puede comprobarlo y por eso el cierre sale «con alerta» y la confianza no sube.
 * Pero lo que viene de una respuesta del dueño (`semilla.respuestas_del_dueno`, que llega de su mensaje directo, del cerebro o de quien abre la conversación) SÍ está comprobado: es su palabra, con su cita.
 *
 * Una línea del plan cuenta como «confirmada por el dueño» solo si CUMPLE LAS DOS: (a) dice que lo confirmó el dueño y (b) coincide con una respuesta REAL del dueño
 * (≥ 2 términos de su pregunta o de su cita, contando las cifras; o todos los términos de su cita). Decir «confirmado por el dueño» sin una respuesta que lo respalde NO cuenta (el agente no se comprueba a sí mismo),
 * y una cifra derivada («margen ≈ 40 %») no es lo que el dueño dijo aunque use su dato.
 */
export interface RespuestaDelDueno { clave: string; valor?: unknown; literal: string }

const MARCA = /confirmad[oa]s?\s+por\s+(?:el\s+)?(?:due[ñn]o|propietari[oa]|cliente)/i
// conectores que no distinguen una respuesta de otra
const VACIAS = new Set(['para', 'como', 'esta', 'este', 'esto', 'tiene', 'tienen', 'unos', 'unas', 'sobre', 'desde', 'entre', 'porque', 'cuando', 'donde', 'pero', 'solo', 'cada', 'todo', 'toda', 'dato', 'dueno', 'ficha'])

const sinAcentos = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
/** «2,10», «2.10» y «$2.10» son la misma cifra (210); «1.500» y «1,500» también */
const normaliza = (s: string) => sinAcentos(s).replace(/(\d)[.,](\d)/g, '$1$2')
const palabras = (s: string) => normaliza(s).split(/[^a-z0-9]+/).filter((t) => t.length >= 4 && !VACIAS.has(t) && !/^\d+$/.test(t))
const cifras = (s: string) => normaliza(s).match(/\d+/g) ?? []

export function terminosDe(r: RespuestaDelDueno): { palabras: Set<string>; cifras: Set<string>; literal: Set<string> } {
  const clave = palabras(String(r.clave ?? '').replace(/_/g, ' '))
  const lit = palabras(String(r.literal ?? ''))
  return { palabras: new Set([...clave, ...lit]), cifras: new Set([...cifras(String(r.literal ?? '')), ...cifras(typeof r.valor === 'string' || typeof r.valor === 'number' ? String(r.valor) : '')]), literal: new Set(lit) }
}

/** ¿esta línea del plan es una respuesta del dueño, ya confirmada por él? */
export function esConfirmadoPorElDueno(linea: string, respuestas: RespuestaDelDueno[]): boolean {
  if (!MARCA.test(linea)) return false
  const pal = new Set(palabras(linea)), num = new Set(cifras(linea))
  for (const r of respuestas) {
    if (!r || typeof r.literal !== 'string' || !r.literal.trim()) continue
    const t = terminosDe(r)
    const aciertos = [...t.palabras].filter((p) => pal.has(p)).length + [...t.cifras].filter((c) => num.has(c)).length
    const todaSuCita = t.literal.size > 0 && [...t.literal].every((p) => pal.has(p))
    if (aciertos >= 2 || todaSuCita) return true
  }
  return false
}

/** separa lo que el dueño ya confirmó de lo que sigue sin comprobar */
export function separarDadoPorVerificado(lineas: string[], respuestas: RespuestaDelDueno[]): { confirmado_por_el_dueno: string[]; sin_comprobar: string[] } {
  const confirmado_por_el_dueno: string[] = [], sin_comprobar: string[] = []
  for (const l of lineas) (esConfirmadoPorElDueno(l, respuestas) ? confirmado_por_el_dueno : sin_comprobar).push(l)
  return { confirmado_por_el_dueno, sin_comprobar }
}

// ───────────────────────────────────────────────────────── REGLA 3 · lo MEDIDO que viene del cerebro también está comprobado (16-oct)
/**
 * Una línea que el plan da por verificada y que corresponde a un dato MEDIDO del cerebro (`expediente.datos`: ticket promedio, tickets, días y horas pico, producto estrella…) o a la ficha (moneda y país)
 * está comprobada: el código tiene el dato y su procedencia. Lo DERIVADO (un margen calculado con el dato del dueño) y las DECISIONES del plan (una tasa adoptada, una corrección de tamaño) siguen sin comprobar.
 * Una línea cuenta si, para ALGÚN dato medido: (a) TODAS sus cifras (≥ 2 dígitos; las que van con «%» son derivadas y se ignoran) están en ese dato (su valor, su clave) o en la línea base que calcula el código,
 * y (b) comparte con él al menos dos cosas (cifras o palabras distintivas). Una cifra que el dato no contiene la descalifica: es un cálculo del agente, no una medición.
 */
export interface DatoMedido { clave: string; valor?: unknown; procedencia?: string; estado?: string; identidad?: string }
const PROCEDENCIAS_MEDIDAS = new Set(['medido', 'cerebro'])
const cifrasSinPorcentaje = (s: string) => (normaliza(s.replace(/\d+(?:[.,]\d+)?\s*%/g, ' ')).match(/\d+/g) ?? []).filter((c) => c.length >= 2)
const textoDeDato = (d: DatoMedido) => `${String(d.clave ?? '').replace(/[:_]/g, ' ')} ${typeof d.valor === 'string' || typeof d.valor === 'number' ? String(d.valor) : ''}`

export function esMedidoDelCerebro(linea: string, datos: DatoMedido[], ficha: { moneda?: string | null; pais?: string | null } = {}, baseSemana?: number | null): boolean {
  const palLinea = new Set(palabras(linea))
  // la ficha: «moneda <código>, <país>» (solo esas palabras y sin cifras)
  const fichaTxt = [ficha.moneda, ficha.pais].filter((x): x is string => typeof x === 'string' && x.trim() !== '')
  if (fichaTxt.length && cifrasSinPorcentaje(linea).length === 0) {
    const permitidas = new Set(['moneda', 'pais', 'mercado', 'divisa', ...fichaTxt.flatMap((x) => palabras(x))])
    const nl = normaliza(linea)
    if ([...palLinea].every((p) => permitidas.has(p)) && fichaTxt.some((x) => nl.includes(normaliza(x)))) return true
  }
  const base = typeof baseSemana === 'number' && Number.isFinite(baseSemana) && baseSemana > 0 ? [String(Math.round(baseSemana)), normaliza(baseSemana.toFixed(2))] : []
  const numLinea = cifrasSinPorcentaje(linea)
  for (const d of datos) {
    if (!PROCEDENCIAS_MEDIDAS.has(String(d.procedencia))) continue
    if (d.estado !== undefined && d.estado !== 'trajo') continue
    if (d.identidad !== undefined && d.identidad !== 'coincide') continue
    const txt = textoDeDato(d)
    const numDato = new Set([...(normaliza(txt).match(/\d+/g) ?? []), ...base])
    if (numLinea.some((c) => !numDato.has(c))) continue
    const palDato = new Set(palabras(txt))
    const compartidas = numLinea.filter((c) => numDato.has(c)).length + [...palLinea].filter((p) => palDato.has(p)).length
    if (compartidas >= 2) return true
  }
  return false
}

/** separa lo que el dueño confirmó, lo medido del cerebro/ficha y lo que sigue sin comprobar */
export function separarComprobado(lineas: string[], respuestas: RespuestaDelDueno[], datos: DatoMedido[], ficha: { moneda?: string | null; pais?: string | null }, baseSemana?: number | null): { confirmado_por_el_dueno: string[]; medido_del_cerebro: string[]; sin_comprobar: string[] } {
  const dueno = separarDadoPorVerificado(lineas, respuestas)
  const medido_del_cerebro: string[] = [], sin_comprobar: string[] = []
  for (const l of dueno.sin_comprobar) (esMedidoDelCerebro(l, datos, ficha, baseSemana) ? medido_del_cerebro : sin_comprobar).push(l)
  return { confirmado_por_el_dueno: dueno.confirmado_por_el_dueno, medido_del_cerebro, sin_comprobar }
}
