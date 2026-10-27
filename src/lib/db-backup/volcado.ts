/**
 * Volcado de filas en STREAMING para /api/admin/db-backup.
 *
 * Antes: cada tabla se leía entera (`SELECT *`), todo se juntaba en un string, luego en un Buffer y luego `gzipSync`:
 * con ~236 MB de filas la función de Vercel se quedaba sin memoria (500 a los 42 s). Ahora cada tabla se lee con un
 * CURSOR en lotes y cada lote se escribe en cuanto está listo; en memoria solo vive un lote.
 */

export interface Consulta {
  query: (texto: string, valores?: unknown[]) => Promise<{ rows: Array<Record<string, unknown>> }>
}

/** destino con contrapresión: `escribir` resuelve cuando el destino puede seguir recibiendo */
export type Escribir = (texto: string) => Promise<void>

export interface Tabla {
  schema: string
  name: string
}

// lotes de 1.000 filas: pocas idas y vueltas (cada una cuesta la latencia hasta la base) y memoria aún pequeña
export const FILAS_POR_LOTE = 1000

export function sqlQuote(value: unknown): string {
  if (value === null || value === undefined) return 'NULL'
  if (typeof value === 'number') return Number.isFinite(value) ? String(value) : 'NULL'
  if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE'
  if (value instanceof Date) return `'${value.toISOString()}'`
  if (Buffer.isBuffer(value)) return `'\\x${value.toString('hex')}'`
  if (typeof value === 'object') {
    return `'${JSON.stringify(value).replace(/'/g, "''")}'::jsonb`
  }
  return `'${String(value).replace(/'/g, "''")}'`
}

export interface ResultadoTabla {
  filas: number
  error?: string
}

/**
 * Vuelca UNA tabla como sentencias INSERT, por lotes. Cada tabla va en su propia transacción (el cursor la necesita);
 * si falla, se hace ROLLBACK y se deja una línea `-- ERROR dumping …` para que el archivo diga qué faltó.
 */
export async function volcarTabla(pg: Consulta, tabla: Tabla, escribir: Escribir, filasPorLote = FILAS_POR_LOTE): Promise<ResultadoTabla> {
  const fq = `"${tabla.schema}"."${tabla.name}"`
  let enTransaccion = false
  let filas = 0
  try {
    // BEGIN + DECLARE en una sola ida (protocolo simple): el cursor necesita la transacción
    await pg.query(`BEGIN; DECLARE zr_backup_cur NO SCROLL CURSOR FOR SELECT * FROM ${fq}`)
    enTransaccion = true
    let cols: string[] = []
    let colList = ''
    let encabezado = false
    for (;;) {
      const lote = await pg.query(`FETCH ${filasPorLote} FROM zr_backup_cur`)
      if (!lote.rows.length) break
      if (!encabezado) {
        // las columnas salen de la primera fila (SELECT * las entrega en el orden de la tabla): una consulta menos por tabla
        cols = Object.keys(lote.rows[0])
        colList = cols.map((c) => `"${c}"`).join(', ')
        await escribir(`-- ${fq}\n`)
        encabezado = true
      }
      let texto = ''
      for (const row of lote.rows) {
        const values = cols.map((c) => sqlQuote(row[c])).join(', ')
        texto += `INSERT INTO ${fq} (${colList}) VALUES (${values});\n`
      }
      filas += lote.rows.length
      await escribir(texto)
    }
    await pg.query('COMMIT')
    enTransaccion = false
    if (!encabezado) await escribir(`-- ${fq} · 0 rows\n\n`)
    else await escribir(`-- ${fq} · ${filas} rows\n\n`)
    return { filas }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    if (enTransaccion) {
      try { await pg.query('ROLLBACK') } catch { /* la conexión puede estar rota; se informa igual */ }
    }
    await escribir(`-- ERROR dumping ${fq} (after ${filas} rows): ${msg.replace(/\r?\n/g, ' ')}\n\n`)
    return { filas, error: msg }
  }
}

export interface ResultadoVolcado {
  tablas: number
  filas: number
  tablas_con_error: Array<{ tabla: string; error: string }>
}

export async function volcarTodo(pg: Consulta, tablas: Tabla[], escribir: Escribir, ahora: () => Date = () => new Date()): Promise<ResultadoVolcado> {
  await escribir(
    [
      `-- Zero Risk · weekly DB backup`,
      `-- Generated: ${ahora().toISOString()}`,
      `-- Tables: ${tablas.length}`,
      `-- Schema DDL (CREATE TABLE / RLS / functions) lives in supabase/migrations/`,
      ``,
      `SET statement_timeout = 0;`,
      `SET client_encoding = 'UTF8';`,
      `SET standard_conforming_strings = on;`,
      `SET search_path = public;`,
      ``,
      ``,
    ].join('\n'),
  )
  let filas = 0
  const tablas_con_error: ResultadoVolcado['tablas_con_error'] = []
  for (const t of tablas) {
    const r = await volcarTabla(pg, t, escribir)
    filas += r.filas
    if (r.error) tablas_con_error.push({ tabla: `${t.schema}.${t.name}`, error: r.error })
  }
  return { tablas: tablas.length, filas, tablas_con_error }
}
