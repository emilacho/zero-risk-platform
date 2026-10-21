/**
 * EL REGISTRO VISIBLE · «qué notas tiene este cliente, cuántas veces la auto-revisión corrigió algo y si los rechazos del dueño bajan». Puro: recibe las filas y devuelve las cuentas.
 * La tasa de rechazo semanal = rechazadas / (aprobadas + rechazadas) de las piezas decididas esa semana (semana ISO, lunes). Una semana sin decisiones no tiene tasa (null): no se inventa.
 */
import type { Nota } from './tipos'

export interface Autorevision { choco: boolean; costo_usd: number; paso: string; creada_en: string }
export interface SemanaDeDecisiones { semana: string; aprobadas: number; rechazadas: number; tasa_de_rechazo: number | null }
export interface Registro {
  client_id: string
  notas: { total: number; con_comentario: number; generales: number; aprobadas: number; rechazadas: number; comentarios: number; primera: string | null; ultima: string | null }
  autorevisiones: { total: number; con_cambios: number; sin_cambios: number; costo_usd: number; por_paso: Record<string, { total: number; con_cambios: number }> }
  semanas: SemanaDeDecisiones[]
  /** la tasa de rechazo de la primera mitad de las semanas con decisiones frente a la segunda; null si hay menos de dos semanas con decisiones */
  tendencia: { antes: number; despues: number; baja: boolean } | null
}

/** el lunes (UTC) de la semana de una fecha, como YYYY-MM-DD */
export function lunesDe(iso: string): string {
  const d = new Date(iso)
  const dia = (d.getUTCDay() + 6) % 7
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() - dia)).toISOString().slice(0, 10)
}
const tasa = (a: number, r: number): number | null => (a + r > 0 ? +(r / (a + r)).toFixed(4) : null)

export function registroDelCliente(client_id: string, notas: Nota[], autorevisiones: Autorevision[]): Registro {
  const propias = notas.filter((n) => n.client_id === client_id)
  const orden = propias.map((n) => n.creada_en).sort()
  const porSemana = new Map<string, { a: number; r: number }>()
  for (const n of propias) {
    if (n.tipo !== 'aprobada' && n.tipo !== 'rechazada') continue
    const k = lunesDe(n.creada_en)
    const s = porSemana.get(k) ?? { a: 0, r: 0 }
    if (n.tipo === 'aprobada') s.a++; else s.r++
    porSemana.set(k, s)
  }
  const semanas: SemanaDeDecisiones[] = [...porSemana.entries()].sort(([x], [y]) => (x < y ? -1 : 1)).map(([semana, s]) => ({ semana, aprobadas: s.a, rechazadas: s.r, tasa_de_rechazo: tasa(s.a, s.r) }))
  let tendencia: Registro['tendencia'] = null
  if (semanas.length >= 2) {
    const mitad = Math.floor(semanas.length / 2)
    const suma = (xs: SemanaDeDecisiones[]) => xs.reduce((t, s) => ({ a: t.a + s.aprobadas, r: t.r + s.rechazadas }), { a: 0, r: 0 })
    const A = suma(semanas.slice(0, mitad)), D = suma(semanas.slice(mitad))
    const antes = tasa(A.a, A.r), despues = tasa(D.a, D.r)
    if (antes !== null && despues !== null) tendencia = { antes, despues, baja: despues < antes }
  }
  const por_paso: Registro['autorevisiones']['por_paso'] = {}
  for (const a of autorevisiones) { const p = (por_paso[a.paso] ??= { total: 0, con_cambios: 0 }); p.total++; if (a.choco) p.con_cambios++ }
  const conCambios = autorevisiones.filter((a) => a.choco).length
  return {
    client_id,
    notas: {
      total: propias.length, con_comentario: propias.filter((n) => n.comentario).length, generales: propias.filter((n) => n.alcance === 'general').length,
      aprobadas: propias.filter((n) => n.tipo === 'aprobada').length, rechazadas: propias.filter((n) => n.tipo === 'rechazada').length, comentarios: propias.filter((n) => n.tipo === 'comentario').length,
      primera: orden[0] ?? null, ultima: orden[orden.length - 1] ?? null,
    },
    autorevisiones: { total: autorevisiones.length, con_cambios: conCambios, sin_cambios: autorevisiones.length - conCambios, costo_usd: +autorevisiones.reduce((t, a) => t + a.costo_usd, 0).toFixed(6), por_paso },
    semanas, tendencia,
  }
}
