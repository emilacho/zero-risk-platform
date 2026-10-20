/**
 * Dependencias entre filas del calendario que el CÓDIGO resuelve solo (encargo «arreglar la segunda mitad» · parte 2 · CC#3 · 20-oct).
 *
 * Causa medida (repetición de la prueba real, campaña 417878df): las réplicas de Facebook («s1-d1-lun_fb_cumplimiento») dependen de la pieza de Instagram del MISMO día
 * («s1-d1-lun_cumplimiento») y salen a la MISMA hora (09:00:00). V11 comparaba solo la FECHA («la antecesora va antes») y bloqueaba las 12 réplicas; la única corrección no lo arregló
 * (el agente no cambia horas que el patrón fija) y la campaña quedó en `necesita_humano`, con la cadena esperando a una persona que nadie había puesto ahí.
 *
 * Regla: una dependencia es válida si la antecesora sale ANTES (otra fecha anterior, o el mismo día con hora anterior). Si no lo es, el código la arregla y lo ANOTA en `avisos` de la fila:
 *   · mismo día y la antecesora tiene hora → la dependiente pasa a 60 min después de ella (si cabe en el día y el corrimiento es de 3 h o menos); si no, se suelta la dependencia;
 *   · mismo día y sin hora que ordene, antecesora que sale DESPUÉS, antecesora que no existe, que es consigo misma o que es un video que espera → se suelta la dependencia.
 * Nunca borra una fila, nunca cambia una fecha, nunca toca nada fuera de `hora` y `depende_de` de la fila dependiente. Sin modelo, sin red: función pura.
 */
import type { Fila } from './tipos'

export interface ResultadoDeDependencias {
  filas: Fila[]
  /** una línea por cambio (también viaja en `avisos` de la fila afectada) */
  notas: string[]
}

const DESPLAZAMIENTO_MIN = 60
/** tope del corrimiento de una hora (certificación de CC#1): mover una fila más de esto cambia el sentido de su horario ⇒ se suelta la dependencia en vez de mover */
export const CORRIMIENTO_MAX_MIN = 180
/** prefijo de cada nota: así el paso que guarda las filas distingue lo que ordenó el código de los avisos del validador */
export const PREFIJO_DE_DEPENDENCIAS = 'dependencias · '
export const esNotaDeDependencias = (a: string): boolean => a.startsWith(PREFIJO_DE_DEPENDENCIAS)

/** "09:00:00" | "09:00" → minutos desde la medianoche; null si no se puede leer */
function minutosDe(h: string | null | undefined): number | null {
  const m = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(String(h ?? '').trim())
  if (!m) return null
  const hh = Number(m[1]), mm = Number(m[2])
  return hh <= 23 && mm <= 59 ? hh * 60 + mm : null
}

/** minutos → texto con el MISMO formato que traía la hora de la antecesora */
function textoDe(min: number, igualA: string): string {
  const hh = String(Math.floor(min / 60)).padStart(2, '0'), mm = String(min % 60).padStart(2, '0')
  return /^\d{1,2}:\d{2}:\d{2}$/.test(igualA.trim()) ? `${hh}:${mm}:00` : `${hh}:${mm}`
}

/** ¿la antecesora `a` sale estrictamente antes que `f`? (con hora solo cuando las dos la tienen) */
export function saleAntes(a: Pick<Fila, 'fecha' | 'hora'>, f: Pick<Fila, 'fecha' | 'hora'>): boolean {
  if (a.fecha < f.fecha) return true
  if (a.fecha > f.fecha) return false
  const ma = minutosDe(a.hora), mf = minutosDe(f.hora)
  return ma !== null && mf !== null && ma < mf
}

export function resolverDependencias(filas: Fila[], previas: Fila[] = []): ResultadoDeDependencias {
  const notas: string[] = []
  const trabajo = filas.map((f) => ({ ...f, depende_de: [...f.depende_de], avisos: [...f.avisos] }))
  const porId = new Map<string, Fila>()
  for (const f of previas) porId.set(f.id, f)
  for (const f of trabajo) porId.set(f.id, f)
  const anota = (f: Fila, texto: string) => { if (!f.avisos.includes(PREFIJO_DE_DEPENDENCIAS + texto)) f.avisos.push(PREFIJO_DE_DEPENDENCIAS + texto); notas.push(`${f.id}: ${texto}`) }

  // varias pasadas: mover la hora de una fila puede ordenar (o desordenar) a otra que dependa de ella
  for (let pasada = 0; pasada < 6; pasada++) {
    let cambio = false
    for (const f of trabajo) {
      if (!f.depende_de.length) continue
      const quedan: string[] = []
      for (const dep of f.depende_de) {
        const a = dep === f.id ? undefined : porId.get(dep)
        if (dep === f.id) { anota(f, `se soltó la dependencia de «${dep}»: una fila no puede depender de sí misma`); cambio = true; continue }
        if (!a) { anota(f, `se soltó la dependencia de «${dep}»: esa fila no existe`); cambio = true; continue }
        if (a.estado === 'espera_video') { anota(f, `se soltó la dependencia de «${dep}»: es una pieza de video que espera al brazo`); cambio = true; continue }
        if (saleAntes(a, f)) { quedan.push(dep); continue }
        if (a.fecha > f.fecha) { anota(f, `se soltó la dependencia de «${dep}»: sale después (${a.fecha}) que esta fila (${f.fecha})`); cambio = true; continue }
        // mismo día y no sale antes: se intenta ordenar con la hora
        const ma = minutosDe(a.hora)
        if (ma === null || minutosDe(f.hora) === null) { anota(f, `se soltó la dependencia de «${dep}»: salen el mismo día (${f.fecha}) y no hay hora que las ordene`); cambio = true; continue }
        const nueva = ma + DESPLAZAMIENTO_MIN
        if (nueva > 23 * 60 + 59) { anota(f, `se soltó la dependencia de «${dep}»: salen el mismo día y no cabe una hora posterior`); cambio = true; continue }
        const corrimiento = nueva - (minutosDe(f.hora) as number)
        if (corrimiento > CORRIMIENTO_MAX_MIN) { anota(f, `se soltó la dependencia de «${dep}»: ordenarla movería esta fila ${Math.round(corrimiento / 60 * 10) / 10} h (más de ${CORRIMIENTO_MAX_MIN / 60} h) y cambiaría el sentido de su horario`); cambio = true; continue }
        const antes = f.hora
        f.hora = textoDe(nueva, a.hora as string)
        anota(f, `la hora pasó de ${antes ?? 'sin hora'} a ${f.hora} para salir después de «${dep}» (mismo día ${f.fecha})`)
        quedan.push(dep)
        cambio = true
      }
      f.depende_de = quedan
    }
    if (!cambio) break
  }
  // lo que sigue sin salir antes tras las pasadas (ciclos) se suelta: nunca se deja una dependencia imposible
  for (const f of trabajo) {
    const validas = f.depende_de.filter((d) => { const a = porId.get(d); return !!a && saleAntes(a, f) })
    if (validas.length !== f.depende_de.length) {
      for (const d of f.depende_de.filter((x) => !validas.includes(x))) anota(f, `se soltó la dependencia de «${d}»: no se pudo ordenar (dependencias en círculo)`)
      f.depende_de = validas
    }
  }
  return { filas: trabajo, notas }
}
