/**
 * La ÚNICA forma en que el cerebro lee la base · solo lectura por construcción.
 *
 * `Consulta` no tiene ninguna operación de escritura: una lectura se describe con tabla, columnas y filtros de igualdad.
 * El adaptador real traduce eso a UN `GET` de la API REST de la base (nunca otro verbo) y SE NIEGA a leer sin filtro.
 * Un fallo de red o un estado de error vuelve como `error`: jamás como una lista vacía (la trampa «error leído como vacío»).
 */
export type Fila = Record<string, unknown>

export interface PeticionDeLectura {
  tabla: string
  columnas?: string[]
  /** filtros de igualdad · obligatorio y no vacío · el filtro del cliente va SIEMPRE acá */
  donde: Record<string, string | number | boolean | null>
  orden?: { columna: string; descendente?: boolean }
  limite?: number
}

export interface ResultadoDeLectura { filas: Fila[]; error: string | null }
export type Consulta = (peticion: PeticionDeLectura) => Promise<ResultadoDeLectura>

export interface OpcionesRest {
  url: string
  llave: string
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>
}

const valorDeFiltro = (v: string | number | boolean | null): string => (v === null ? 'is.null' : `eq.${encodeURIComponent(String(v))}`)

export function crearConsultaRest(opciones: OpcionesRest): Consulta {
  const base = opciones.url.replace(/\/$/, '')
  const traer = opciones.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i))
  return async (p) => {
    const filtros = Object.entries(p.donde ?? {})
    if (filtros.length === 0) return { filas: [], error: `lectura rechazada: sin filtro en ${p.tabla}` }
    const partes = [`select=${(p.columnas && p.columnas.length ? p.columnas : ['*']).join(',')}`]
    for (const [k, v] of filtros) partes.push(`${k}=${valorDeFiltro(v)}`)
    if (p.orden) partes.push(`order=${p.orden.columna}.${p.orden.descendente ? 'desc' : 'asc'}`)
    if (typeof p.limite === 'number') partes.push(`limit=${p.limite}`)
    const direccion = `${base}/rest/v1/${p.tabla}?${partes.join('&')}`
    try {
      const r = await traer(direccion, { method: 'GET', headers: { apikey: opciones.llave, Authorization: `Bearer ${opciones.llave}` } })
      if (!r.ok) return { filas: [], error: `lectura falló (${r.status}) en ${p.tabla}: ${(await r.text()).slice(0, 200)}` }
      const cuerpo: unknown = await r.json()
      if (!Array.isArray(cuerpo)) return { filas: [], error: `respuesta inesperada en ${p.tabla}: no es una lista` }
      return { filas: cuerpo as Fila[], error: null }
    } catch (e) {
      return { filas: [], error: `error de red en ${p.tabla}: ${e instanceof Error ? e.message : String(e)}` }
    }
  }
}
