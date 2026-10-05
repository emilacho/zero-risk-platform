/**
 * La versión de lo que se guarda como documentos se DERIVA de las filas (cada versión es una fila nueva): no hay columna que mantener.
 * Cada tipo trae la clave que SÍ tiene; esa elección vive en `lectores.ts`, donde se prueba con filas reales.
 */
export interface EntradaDeVersion {
  id: string
  /** agrupa las versiones de la misma cosa */
  clave: string
  /** ISO · orden de creación */
  creado: string
  aprobada: boolean
  /** una cosa marcada como NO válida se lista pero nunca es la vigente */
  valida: boolean
}

export interface SalidaDeVersion { version: number; vigente: boolean; reemplazada: boolean; versiones_anteriores: number; /** el id de la versión que manda en su grupo (si hay una) */ vigente_id?: string }

/**
 * `ultima_aprobada`: manda la última APROBADA; si no hay ninguna, la última válida (un borrador más nuevo no desplaza a la aprobada).
 * `ultima`: manda la última válida (para lo que no tiene aprobación, como el manual por número de versión).
 */
export function derivarVersiones(entradas: EntradaDeVersion[], regla: 'ultima_aprobada' | 'ultima' = 'ultima_aprobada'): Map<string, SalidaDeVersion> {
  const grupos = new Map<string, EntradaDeVersion[]>()
  for (const e of entradas) grupos.set(e.clave, [...(grupos.get(e.clave) ?? []), e])
  const salida = new Map<string, SalidaDeVersion>()
  for (const grupo of grupos.values()) {
    const orden = [...grupo].sort((a, b) => (a.creado === b.creado ? (a.id < b.id ? -1 : 1) : a.creado < b.creado ? -1 : 1))
    const validas = orden.filter((e) => e.valida)
    const vigente = regla === 'ultima_aprobada' ? [...validas].reverse().find((e) => e.aprobada) ?? validas[validas.length - 1] : validas[validas.length - 1]
    orden.forEach((e, i) => {
      const esVigente = !!vigente && e.id === vigente.id
      salida.set(e.id, { version: i + 1, vigente: esVigente, reemplazada: !!vigente && !esVigente, versiones_anteriores: esVigente ? orden.length - 1 : 0, ...(vigente ? { vigente_id: vigente.id } : {}) })
    })
  }
  return salida
}
