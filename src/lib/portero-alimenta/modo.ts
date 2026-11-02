/**
 * EL MODO DEL PORTERO (28-oct · firma de Emilio): las 3 corridas al día son SOLO para la etapa de construcción (ver más rápido si cada mejora funciona); en campaña basta UNA raspada completa.
 * `PORTERO_MODO` = `construccion` | `campana` es DATO (variable en Vercel): cambiar de modo no exige construir nada. Arranca en `construccion`.
 *  · construccion: 3 corridas COMPLETAS al día (12:30, 18:30 y 00:30 UTC) y el tope del raspado diario por cliente en US$ 3,00;
 *  · campana: 1 corrida completa (12:30 UTC) y el tope del raspado diario vuelve a US$ 1,00 (D-4).
 * La FRECUENCIA se separó del modo el 2-nov (`PORTERO_CORRIDAS_POR_DIA`, ver `corridasPorDiaDelEntorno`): el modo sigue decidiendo el dinero y los topes.
 * Los umbrales firmados del gasto total (aviso > 3 / apaga > 10) NO dependen del modo. PURO.
 */
export type ModoDelPortero = 'construccion' | 'campana'
export const MODO_POR_OMISION: ModoDelPortero = 'construccion'

/** hora UTC de cada corrida completa, por modo (minutos desde las 00:00 UTC) · dato: se amplía sin tocar la lógica */
export const CORRIDAS_POR_MODO: Record<ModoDelPortero, ReadonlyArray<{ hhmm: string; minutos: number }>> = {
  construccion: [{ hhmm: '12:30', minutos: 12 * 60 + 30 }, { hhmm: '18:30', minutos: 18 * 60 + 30 }, { hhmm: '00:30', minutos: 30 }],
  campana: [{ hhmm: '12:30', minutos: 12 * 60 + 30 }],
}
/** tope del raspado diario por cliente (diario: mañana + ampliación) según el modo */
export const TOPE_DIARIO_POR_MODO_USD: Record<ModoDelPortero, number> = { construccion: 3.0, campana: 1.0 }

export interface ModoLeido { modo: ModoDelPortero; origen: 'variable' | 'por_omision' | 'valor_roto'; aviso: string | null }

/** ausente → `construccion` (arranque firmado); un valor roto cae a `campana` (la forma barata) y lo DICE */
export function modoDelEntorno(env: Record<string, string | undefined> = process.env): ModoLeido {
  const t = String(env.PORTERO_MODO ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, '')
  if (t === '') return { modo: MODO_POR_OMISION, origen: 'por_omision', aviso: null }
  if (t === 'construccion' || t === 'campana') return { modo: t, origen: 'variable', aviso: null }
  return { modo: 'campana', origen: 'valor_roto', aviso: `PORTERO_MODO tiene un valor que no se entiende («${String(env.PORTERO_MODO).slice(0, 30)}»): se usa campana (1 corrida al día). Valores válidos: construccion | campana` }
}

/**
 * CUÁNTAS corridas completas al día (2-nov · firma de Emilio, opción B): la frecuencia es DATO aparte del modo.
 * `PORTERO_CORRIDAS_POR_DIA` = 1..3: toma las primeras N horas de la lista del modo (1 → solo 12:30 UTC). Ausente → las del modo (construcción: 3).
 * Un valor roto cae a 1 (la forma barata). El dinero, el freno por anomalía y los avisos NO dependen de esto.
 */
export function corridasPorDiaDelEntorno(modo: ModoDelPortero, env: Record<string, string | undefined> = process.env): { n: number; origen: 'variable' | 'por_modo' | 'valor_roto'; aviso: string | null } {
  const todas = CORRIDAS_POR_MODO[modo].length
  const t = String(env.PORTERO_CORRIDAS_POR_DIA ?? '').trim()
  if (t === '') return { n: todas, origen: 'por_modo', aviso: null }
  const n = Number(t)
  if (Number.isInteger(n) && n >= 1) return { n: Math.min(n, todas), origen: 'variable', aviso: null }
  return { n: 1, origen: 'valor_roto', aviso: `PORTERO_CORRIDAS_POR_DIA tiene un valor que no se entiende («${t.slice(0, 30)}»): se usa 1 corrida al día. Valores válidos: 1, 2 o 3` }
}
/** las horas de corrida vigentes: las del modo recortadas a las que pide `PORTERO_CORRIDAS_POR_DIA` */
export const horasDeCorrida = (modo: ModoDelPortero, env: Record<string, string | undefined> = process.env): ReadonlyArray<{ hhmm: string; minutos: number }> => CORRIDAS_POR_MODO[modo].slice(0, corridasPorDiaDelEntorno(modo, env).n)

/**
 * CADA CUÁNTOS DÍAS corre la corrida completa (2-nov · firma de Emilio: llegar al cierre del ciclo de Apify, 24-nov, con el plan actual).
 * `PORTERO_CORRIDAS_CADA_DIAS` = 2..7 Y `PORTERO_CORRIDAS_CADA_DIAS_HASTA` = AAAA-MM-DD (el primer día que vuelve a ser DIARIA, p. ej. 2026-11-25 = el ciclo nuevo).
 * Antes de esa fecha corre un día de cada N, contando hacia atrás desde el último día antes de `HASTA`; desde `HASTA` vuelve SOLA a diaria sin tocar nada.
 * Sin la fecha, con un número roto o menor de 2: diaria (y lo dice). Las dos variables son dato; no cambian el dinero, el freno ni los avisos.
 */
export interface CadaDiasLeido { cada: number; hasta: string | null; activo: boolean; aviso: string | null }
export function corridasCadaDiasDelEntorno(env: Record<string, string | undefined> = process.env): CadaDiasLeido {
  const t = String(env.PORTERO_CORRIDAS_CADA_DIAS ?? '').trim()
  if (t === '') return { cada: 1, hasta: null, activo: false, aviso: null }
  const cada = Number(t)
  if (!Number.isInteger(cada) || cada < 1 || cada > 7) return { cada: 1, hasta: null, activo: false, aviso: `PORTERO_CORRIDAS_CADA_DIAS tiene un valor que no se entiende («${t.slice(0, 30)}»): corre todos los días. Valores válidos: 1 a 7` }
  if (cada === 1) return { cada: 1, hasta: null, activo: false, aviso: null }
  const h = String(env.PORTERO_CORRIDAS_CADA_DIAS_HASTA ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(h) || !Number.isFinite(Date.parse(`${h}T00:00:00Z`))) return { cada: 1, hasta: null, activo: false, aviso: `PORTERO_CORRIDAS_CADA_DIAS=${cada} necesita PORTERO_CORRIDAS_CADA_DIAS_HASTA (AAAA-MM-DD, el día en que vuelve a ser diaria): sin ella corre todos los días` }
  return { cada, hasta: h, activo: true, aviso: null }
}
const DIA_MS = 86_400_000
/** ¿este día (UTC) toca corrida completa? Con `CADA_DIAS` activo y antes de `HASTA`: uno de cada N, contando hacia atrás desde el último día antes de `HASTA` */
export function diaConCorrida(dia: Date, env: Record<string, string | undefined> = process.env): boolean {
  const c = corridasCadaDiasDelEntorno(env)
  if (!c.activo || c.hasta === null) return true
  const hasta = Date.parse(`${c.hasta}T00:00:00Z`)
  const hoy = Date.UTC(dia.getUTCFullYear(), dia.getUTCMonth(), dia.getUTCDate())
  if (hoy >= hasta) return true
  return Math.round((hasta - DIA_MS - hoy) / DIA_MS) % c.cada === 0
}

export const topeDiarioPorClienteUsd = (modo: ModoDelPortero): number => TOPE_DIARIO_POR_MODO_USD[modo]

/** ¿el dinero frena el raspado en este modo? (Emilio 28-oct: en construcción el dinero no es un obstáculo; los parámetros económicos se definen con el sistema ya construido) */
export const eldineroFrena = (modo: ModoDelPortero): boolean => modo === 'campana'
/** el tope que CORTA acciones del raspado: el del modo en campaña; en construcción ninguno (el de referencia solo se registra) */
export const topeQueCortaUsd = (modo: ModoDelPortero | undefined, porOmision: number): number => (modo === undefined ? porOmision : eldineroFrena(modo) ? topeDiarioPorClienteUsd(modo) : 1_000_000)

/** etiquetas de fotos por cliente y día (29-oct · firma de Emilio): en construcción SIN tope (se etiquetan todas las pendientes en cada pasada; el freno ante anomalía sigue); en campaña vuelve a 10 */
export const TOPE_DE_ETIQUETAS_POR_MODO: Record<ModoDelPortero, number> = { construccion: 1_000_000, campana: 10 }
export const topeDeEtiquetasPorClienteYDia = (modo: ModoDelPortero): number => TOPE_DE_ETIQUETAS_POR_MODO[modo]

const minutosUtc = (d: Date) => d.getUTCHours() * 60 + d.getUTCMinutes()
const inicioDelDia = (d: Date) => Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())

/** la hora (Date) de cada corrida del modo que cae en el día UTC de `ahora` */
export function corridasDelDia(modo: ModoDelPortero, ahora: Date, env: Record<string, string | undefined> = process.env): Date[] {
  const base = inicioDelDia(ahora)
  return horasDeCorrida(modo, env).map((c) => new Date(base + c.minutos * 60_000)).filter((d) => diaConCorrida(d, env)).sort((a, b) => a.getTime() - b.getTime())
}

/** ¿ahora (con `margenMin` de holgura por el disparador) es una hora de corrida del modo? devuelve la hora programada o null */
export function corridaProgramadaAhora(modo: ModoDelPortero, ahora: Date, margenMin = 20, env: Record<string, string | undefined> = process.env): Date | null {
  const m = minutosUtc(ahora)
  for (const c of horasDeCorrida(modo, env)) {
    const d = Math.min(Math.abs(m - c.minutos), 1440 - Math.abs(m - c.minutos))
    if (d <= margenMin) {
      // la hora programada más cercana (puede ser la de ayer si son las 23:50 y la corrida es a las 00:30)
      const candidatas = [-1, 0, 1].map((k) => new Date(inicioDelDia(ahora) + k * 86_400_000 + c.minutos * 60_000))
      const cercana = candidatas.sort((a, b) => Math.abs(a.getTime() - ahora.getTime()) - Math.abs(b.getTime() - ahora.getTime()))[0]
      // 02-nov · en un día sin corrida (CADA_DIAS) la hora programada no cuenta: la puerta no abre
      return diaConCorrida(cercana, env) ? cercana : null
    }
  }
  return null
}

/**
 * La corrida del modo que un vigía debe revisar AHORA: la más reciente cuya hora programada pasó hace entre `desdeMin` y `hastaMin` minutos.
 * Fuera de esas ventanas (p. ej. a las 20:15 en campaña, que solo tiene la de las 12:30) no hay nada que revisar y el vigía calla.
 */
export function corridaQueSeRevisa(modo: ModoDelPortero, ahora: Date, desdeMin = 60, hastaMin = 180, env: Record<string, string | undefined> = process.env): Date | null {
  const t = ahora.getTime()
  const todas = [-1, 0].flatMap((k) => horasDeCorrida(modo, env).map((c) => new Date(inicioDelDia(ahora) + k * 86_400_000 + c.minutos * 60_000)))
  const dentro = todas.filter((d) => t - d.getTime() >= desdeMin * 60_000 && t - d.getTime() <= hastaMin * 60_000 && diaConCorrida(d, env))
  return dentro.sort((a, b) => b.getTime() - a.getTime())[0] ?? null
}

/** ¿esta ejecución del horario debe pasar `forzar`? En construcción cada corrida repite el día (la guarda «una por día» es de campaña) */
export const corridaForzada = (modo: ModoDelPortero): boolean => modo === 'construccion'
