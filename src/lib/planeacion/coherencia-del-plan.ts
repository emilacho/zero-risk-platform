/**
 * CONTROLES DE COHERENCIA DEL PLAN, POR CÓDIGO (01-nov · firma de Emilio · puntos 4 y 5 del encargo «errores del plan»). Puro, sin modelo. Agnóstico.
 *   Fechas: ninguna semana antes de la fecha en que el plan puede arrancar; duración declarada frente al rango; fin del rango frente a la última semana.
 *   Presupuesto: pauta semanal frente a lo declarado; columnas de pauta frente a su total; la producción incluida no es un renglón de la pauta.
 * Lee tablas escritas por un modelo, así que no adivina: lo que no pudo leer lo dice con `no_pude_comprobar`, nunca como que está bien.
 */
export type EstadoDelControl = 'no_cuadra' | 'no_pude_comprobar'
export interface HallazgoDeCoherencia { control: 'fechas' | 'presupuesto'; estado: EstadoDelControl; que: string; donde: string }

/** diferencia aceptada al comparar importes, declarada: 1 % */
export const TOLERANCIA_DE_IMPORTES = 0.01

const MESES: Record<string, number> = { ene: 0, jan: 0, feb: 1, mar: 2, abr: 3, apr: 3, may: 4, jun: 5, jul: 6, ago: 7, aug: 7, sep: 8, set: 8, oct: 9, nov: 10, dic: 11, dec: 11 }
const MES = '(ene|feb|mar|abr|may|jun|jul|ago|sep|set|oct|nov|dic|jan|apr|aug|dec)[a-záéíóú]*'
const DIA_MS = 86_400_000
const utc = (a: number, m: number, d: number) => Date.UTC(a, m, d)
const fechaCorta = (ms: number) => new Date(ms).toISOString().slice(0, 10)
const mesDe = (s: string) => MESES[s.slice(0, 3).toLowerCase()]

/** el rango de un plan: «2 de noviembre de 2026 – 24 de enero de 2027» */
export function rangoDelPlan(texto: string): { desde: number; hasta: number } | null {
  const re = new RegExp(`(\\d{1,2})\\s*(?:de\\s+)?${MES}\\s*(?:de\\s+)?(\\d{4})\\s*(?:[-–—]|\\ba\\b|\\bal\\b|\\bto\\b)\\s*(\\d{1,2})\\s*(?:de\\s+)?${MES}\\s*(?:de\\s+)?(\\d{4})`, 'i')
  const m = re.exec(texto)
  if (!m) return null
  return { desde: utc(Number(m[3]), mesDe(m[2]), Number(m[1])), hasta: utc(Number(m[6]), mesDe(m[5]), Number(m[4])) }
}

/** las semanas fechadas: «Semana 3 · 16-22 nov», «| 3 | 28 oct - 3 nov |». El año sale del rango del plan o de la referencia */
export function semanasDelPlan(texto: string, referencia: number): Array<{ n: number; desde: number; hasta: number; linea: string }> {
  const out = new Map<number, { n: number; desde: number; hasta: number; linea: string }>()
  const rePeriodo = new RegExp(`(\\d{1,2})(?:\\s*(?:de\\s+)?${MES})?\\s*(?:[-–—]|\\bal\\b|\\ba\\b)\\s*(\\d{1,2})\\s*(?:de\\s+)?${MES}`, 'i')
  const anioBase = new Date(referencia).getUTCFullYear()
  const mesBase = new Date(referencia).getUTCMonth()
  const anioDe = (m: number) => (mesBase - m > 6 ? anioBase + 1 : anioBase)
  for (const linea of texto.split('\n')) {
    const n = /(?:semana|week)\s*(\d{1,2})\b/i.exec(linea) ?? /^\s*\|\s*(\d{1,2})\s*\|/.exec(linea)
    if (!n) continue
    const p = rePeriodo.exec(linea)
    if (!p) continue
    const mesFin = mesDe(p[4]); const mesIni = p[2] ? mesDe(p[2]) : mesFin
    const fin = utc(anioDe(mesFin), mesFin, Number(p[3]))
    const ini = utc(anioDe(mesIni), mesIni, Number(p[1]))
    const num = Number(n[1])
    if (!out.has(num)) out.set(num, { n: num, desde: ini, hasta: fin, linea: linea.trim().slice(0, 80) })
  }
  return [...out.values()].sort((a, b) => a.n - b.n)
}

/** punto 5 · `referencia`: la primera fecha en que el plan puede aprobarse y arrancar */
export function controlarFechas(texto: string, referencia: Date): HallazgoDeCoherencia[] {
  const hoy = utc(referencia.getUTCFullYear(), referencia.getUTCMonth(), referencia.getUTCDate())
  const f: HallazgoDeCoherencia[] = []
  const rango = rangoDelPlan(texto)
  const semanas = semanasDelPlan(texto, hoy)
  if (!rango && !semanas.length) return [{ control: 'fechas', estado: 'no_pude_comprobar', que: 'no pude leer ninguna fecha del plan: ni su rango ni sus semanas. Fechas sin comprobar', donde: 'calendario' }]
  for (const s of semanas) if (s.desde < hoy) f.push({ control: 'fechas', estado: 'no_cuadra', que: `la semana ${s.n} empieza el ${fechaCorta(s.desde)}, antes de la fecha en que el plan puede arrancar (${fechaCorta(hoy)})`, donde: `Semana ${s.n}` })
  if (rango) {
    if (rango.desde < hoy) f.push({ control: 'fechas', estado: 'no_cuadra', que: `el plan dice arrancar el ${fechaCorta(rango.desde)}, antes de la fecha en que puede aprobarse (${fechaCorta(hoy)})`, donde: 'encabezado del plan' })
    const dias = Math.round((rango.hasta - rango.desde) / DIA_MS) + 1
    const declarada = /\b(\d{2,3})\s*(?:días|dias|days)\b/i.exec(texto)
    if (declarada && Math.abs(Number(declarada[1]) - dias) > 1) f.push({ control: 'fechas', estado: 'no_cuadra', que: `el plan dice ${declarada[1]} días, y su rango (${fechaCorta(rango.desde)} a ${fechaCorta(rango.hasta)}) tiene ${dias}`, donde: 'encabezado del plan' })
    const ultima = semanas[semanas.length - 1]
    if (ultima && Math.abs(ultima.hasta - rango.hasta) > DIA_MS) f.push({ control: 'fechas', estado: 'no_cuadra', que: `el rango termina el ${fechaCorta(rango.hasta)}, y la semana ${ultima.n} termina el ${fechaCorta(ultima.hasta)}`, donde: `Semana ${ultima.n}` })
  } else f.push({ control: 'fechas', estado: 'no_pude_comprobar', que: 'no pude leer el rango total del plan: duración sin comprobar', donde: 'encabezado del plan' })
  if (!semanas.length) f.push({ control: 'fechas', estado: 'no_pude_comprobar', que: 'no pude leer las semanas fechadas: fechas de las acciones sin comprobar', donde: 'calendario' })
  return f
}

const importe = (s: string): number | null => {
  const m = /\$\s*(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?/.exec(s)
  if (!m) return null
  return Number(m[1].replace(/[.,]/g, '')) + (m[2] ? Number(`0.${m[2]}`) : 0)
}
const celdas = (l: string): string[] | null => (/^\s*\|.*\|\s*$/.test(l) ? l.trim().slice(1, -1).split('|').map((c) => c.trim()) : null)
const esSeparador = (c: string[]) => c.every((x) => /^:?-{2,}:?$/.test(x))

/** lo que el negocio declaró como pauta por semana: «Presupuesto de pauta: 200 por semana» */
export function pautaDeclarada(contexto: string): number | null {
  const m = /presupuesto\s+de\s+pauta[^\n\d$]{0,30}\$?\s*(\d+(?:[.,]\d+)?)[^\n]{0,20}(?:semana|week)/i.exec(contexto)
  return m ? Number(m[1].replace(',', '.')) : null
}

/** punto 4 · `declarada`: la pauta semanal que declaró el negocio; null si no hay */
export function controlarPresupuesto(texto: string, declarada: number | null): HallazgoDeCoherencia[] {
  const f: HallazgoDeCoherencia[] = []
  const lineas = texto.split('\n')
  let leido = false
  // ── la pauta por semana frente a lo declarado
  lineas.forEach((l, k) => {
    const m = /\$\s*(\d+(?:[.,]\d+)?)\s*(?:\/|por\s+|a\s+la\s+|per\s+)(?:semana|week)/i.exec(l)
    // el renglón o lo que lo presenta justo antes: las cifras de pauta suelen venir bajo su título
    if (!m || !/pauta|ads?\b|publicidad/i.test(lineas.slice(Math.max(0, k - 2), k + 1).join(' '))) return
    leido = true
    const v = Number(m[1].replace(',', '.'))
    // lo declarado es un techo: gastar menos no lo contradice
    if (declarada !== null && v > declarada * (1 + TOLERANCIA_DE_IMPORTES)) f.push({ control: 'presupuesto', estado: 'no_cuadra', que: `el plan usa $${v} por semana de pauta, por encima de los $${declarada} por semana que declaró el negocio: «${l.trim().slice(0, 90)}»`, donde: 'presupuesto' })
  })
  // ── cada tabla con columna de pauta: la suma de sus filas frente a su fila de total; la producción no va como renglón
  for (let i = 0; i < lineas.length - 1; i++) {
    const cab = celdas(lineas[i]); const sep = celdas(lineas[i + 1])
    if (!cab || !sep || !esSeparador(sep)) continue
    const col = cab.findIndex((c) => /pauta|ads?\b|publicidad/i.test(c))
    if (col < 0) continue
    let suma = 0; let total: number | null = null; let filas = 0
    for (let j = i + 2; j < lineas.length; j++) {
      const c = celdas(lineas[j])
      if (!c) break
      const v = importe(c[col] ?? '')
      if (/^\**\s*total/i.test(c[0] ?? '')) { total = v; continue }
      if (v === null) continue
      filas++; suma += v; leido = true
      if (/producci[oó]n/i.test(c[0] ?? '')) f.push({ control: 'presupuesto', estado: 'no_cuadra', que: `«${(c[0] ?? '').slice(0, 50)}» aparece como renglón de la pauta con $${v}: la producción no es pauta`, donde: 'presupuesto' })
    }
    if (total !== null && filas && Math.abs(suma - total) > total * TOLERANCIA_DE_IMPORTES) f.push({ control: 'presupuesto', estado: 'no_cuadra', que: `las filas de la tabla «${cab[col]}» suman $${suma}, y su total dice $${total}`, donde: 'presupuesto' })
  }
  if (!leido) f.push({ control: 'presupuesto', estado: 'no_pude_comprobar', que: 'no pude leer cifras de pauta en el plan: presupuesto sin comprobar', donde: 'presupuesto' })
  else if (declarada === null) f.push({ control: 'presupuesto', estado: 'no_pude_comprobar', que: 'no encontré la pauta semanal declarada por el negocio: no pude compararla con el plan', donde: 'presupuesto' })
  return f
}

const plegar = (t: string) => t.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ')
/** punto 3 · una frase que el dueño negó, usada en el plan. Citarla para negarla («no viene de…») no cuenta. Literal: lo demás lo mira el revisor */
export function controlarFrasesNegadas(texto: string, hechos: Array<{ tema: string; frases_negadas: string[] }>): Array<Omit<HallazgoDeCoherencia, 'control'> & { control: 'dueno' }> {
  const t = plegar(texto)
  const f: Array<Omit<HallazgoDeCoherencia, 'control'> & { control: 'dueno' }> = []
  for (const h of hechos) for (const frase of h.frases_negadas) {
    const p = plegar(frase).trim()
    let i = t.indexOf(p); let usada = false
    while (i >= 0 && !usada) {
      if (!/\b(no|sin|nunca|jamas|ni|not|never)\b[^.]{0,30}$/.test(t.slice(Math.max(0, i - 40), i))) usada = true
      i = t.indexOf(p, i + p.length)
    }
    if (usada) f.push({ control: 'dueno', estado: 'no_cuadra', que: `el plan usa «${frase}», y el dueño lo negó (${h.tema})`, donde: 'todo el plan' })
  }
  return f
}

/** punto 2 · el dueño declara un activo que la agencia no toca con un hecho de tema «solo lectura · <nombres separados por comas>»: un plan puede llamarlo de varias formas («sitio web, sitio, mi-negocio.com») */
export const activoDeSoloLectura = (tema: string): string | null => /^\s*solo lectura\s*[·:\-–]\s*(.+)$/i.exec(tema)?.[1]?.trim() || null
const EDITAR = /\b(editar|edita|edito|cambiar|cambia|actualizar|actualiza|modificar|modifica|corregir|corrige|agregar|agrega|anadir|anade|instalar|instala|quitar|quita|rediseñar|redisenar|optimizar|optimiza|edit|update|change|modify|install)\b/
const PEDIDO_AL_DUENO = /\b(pedir|pedirle|pide|solicitar|solicitarle|sugerir|sugerirle|proponer|proponerle|recomendar|recomendarle|ask|request)\b[^.]{0,40}\b(dueno|duena|cliente|negocio|owner)\b|\b(dueno|duena|owner)\b[^.]{0,30}\b(debe|decide|puede|tendria|must|may)\b|\bno\s+(se\s+)?(edita|toca|cambia|modifica)/
/** el plan propone editar lo que el dueño dijo que no se toca. Una propuesta como pedido al dueño no cuenta. Es por frase: mira verbos cerca del activo, y puede equivocarse: la corrección es reformularla */
export function controlarActivosDeSoloLectura(texto: string, hechos: Array<{ tema: string }>): Array<Omit<HallazgoDeCoherencia, 'control'> & { control: 'dueno' }> {
  const f: Array<Omit<HallazgoDeCoherencia, 'control'> & { control: 'dueno' }> = []
  const frases = plegar(texto).split(/(?<=[.!?])\s+|\s*\|\s*/)
  for (const h of hechos) {
    const activo = activoDeSoloLectura(h.tema)
    if (!activo) continue
    // basta uno de sus nombres, completo y como palabra entera
    const nombres = activo.split(',').map((n) => plegar(n).trim()).filter((n) => n.length >= 3)
    if (!nombres.length) continue
    const nombra = (x: string) => nombres.some((n) => new RegExp(`(?:^|[^\\p{L}\\p{N}])${n.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:[^\\p{L}\\p{N}]|$)`, 'u').test(x))
    // cada frase cuenta: el redactor tiene que corregirlas todas. Las tres primeras, para no llenar la ficha
    const halladas = frases.filter((x) => nombra(x) && EDITAR.test(x) && !PEDIDO_AL_DUENO.test(x))
    for (const hallada of halladas.slice(0, 3)) f.push({ control: 'dueno', estado: 'no_cuadra', que: `el plan propone tocar «${activo}», que el dueño declaró de solo lectura: «${hallada.slice(0, 110)}». Debe ir como pedido al dueño`, donde: 'todo el plan' })
  }
  return f
}

/** los dos controles juntos */
export function controlarCoherenciaDelPlan(a: { texto: string; contexto: string; referencia: Date }): HallazgoDeCoherencia[] {
  return [...controlarFechas(a.texto, a.referencia), ...controlarPresupuesto(a.texto, pautaDeclarada(a.contexto))]
}
