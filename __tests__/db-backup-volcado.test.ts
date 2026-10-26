/** Volcado en streaming del respaldo de la base: por lotes, una transacción por tabla, errores declarados en el archivo, sin acumular. */
import { describe, expect, it } from 'vitest'
import { FILAS_POR_LOTE, sqlQuote, volcarTabla, volcarTodo, type Consulta } from '../src/lib/db-backup/volcado'

type Fila = Record<string, unknown>

/** base falsa: columnas por tabla, filas por tabla, y un registro de cada consulta */
function baseFalsa(tablas: Record<string, { cols: string[]; filas: Fila[]; romperEn?: number }>) {
  const log: string[] = []
  let cursor: { filas: Fila[]; pos: number; romperEn?: number; lotes: number } | null = null
  const pg: Consulta = {
    async query(texto: string, valores?: unknown[]) {
      log.push(texto.split('\n')[0].trim().slice(0, 60))
      if (texto === 'COMMIT' || texto === 'ROLLBACK') return { rows: [] }
      const decl = texto.match(/DECLARE zr_backup_cur .* FROM "([^"]+)"\."([^"]+)"/)
      if (decl) { const t = tablas[`${decl[1]}.${decl[2]}`]; cursor = { filas: t.filas, pos: 0, romperEn: t.romperEn, lotes: 0 }; return { rows: [] } }
      const fetch = texto.match(/FETCH (\d+) FROM zr_backup_cur/)
      if (fetch && cursor) {
        cursor.lotes++
        if (cursor.romperEn !== undefined && cursor.lotes >= cursor.romperEn) throw new Error('canceling statement due to statement timeout')
        const n = Number(fetch[1]); const rows = cursor.filas.slice(cursor.pos, cursor.pos + n); cursor.pos += n; return { rows }
      }
      throw new Error('consulta inesperada: ' + texto)
    },
  }
  return { pg, log }
}
const recolector = () => { const trozos: string[] = []; return { escribir: async (t: string) => { trozos.push(t) }, trozos, todo: () => trozos.join('') } }

describe('sqlQuote', () => {
  it('escapa comillas, null, booleanos, fechas, json y bytes', () => {
    expect(sqlQuote("it's")).toBe("'it''s'")
    expect(sqlQuote(null)).toBe('NULL')
    expect(sqlQuote(undefined)).toBe('NULL')
    expect(sqlQuote(true)).toBe('TRUE')
    expect(sqlQuote(Number.NaN)).toBe('NULL')
    expect(sqlQuote(new Date('2026-10-26T00:00:00Z'))).toBe("'2026-10-26T00:00:00.000Z'")
    expect(sqlQuote({ a: "x'y" })).toBe(`'{"a":"x''y"}'::jsonb`)
    expect(sqlQuote(Buffer.from([1, 255]))).toBe("'\\x01ff'")
  })
})

describe('volcarTabla · por lotes', () => {
  it('lee con CURSOR en una transacción y escribe un trozo por lote (nunca la tabla entera de una vez)', async () => {
    const filas = Array.from({ length: 1250 }, (_, i) => ({ id: i, v: `fila ${i}` }))
    const { pg, log } = baseFalsa({ 'public.t': { cols: ['id', 'v'], filas } })
    const r = recolector()
    const res = await volcarTabla(pg, { schema: 'public', name: 't' }, r.escribir)
    expect(res).toEqual({ filas: 1250 })
    // 1250 filas con lotes de FILAS_POR_LOTE → 2 trozos de INSERT (1000 + 250), más cabecera y pie
    const trozosDeInsert = r.trozos.filter((t) => t.startsWith('INSERT'))
    expect(trozosDeInsert.length).toBe(2)
    expect(trozosDeInsert.map((t) => t.split('\n').filter(Boolean).length)).toEqual([FILAS_POR_LOTE, 250])
    expect(r.todo()).toContain('-- "public"."t" · 1250 rows')
    expect(log.filter((l) => l.startsWith('BEGIN; DECLARE zr_backup_cur NO SCROLL CURSOR')).length).toBe(1)
    // UNA sola ida para abrir la transacción y el cursor, y ninguna consulta de columnas
    expect(log.some((l) => /information_schema/.test(l))).toBe(false)
    expect(log.filter((l) => l === 'COMMIT').length).toBe(1)
  })

  it('una tabla vacía deja su marca de 0 filas y cierra la transacción', async () => {
    const { pg, log } = baseFalsa({ 'public.vacia': { cols: ['id'], filas: [] } })
    const r = recolector()
    expect(await volcarTabla(pg, { schema: 'public', name: 'vacia' }, r.escribir)).toEqual({ filas: 0 })
    expect(r.todo()).toContain('-- "public"."vacia" · 0 rows')
    expect(log).toContain('COMMIT')
  })

  it('si falla a mitad: ROLLBACK, línea "-- ERROR dumping" con las filas ya escritas, y el error sube en el resultado', async () => {
    const filas = Array.from({ length: 2200 }, (_, i) => ({ id: i }))
    const { pg, log } = baseFalsa({ 'public.rota': { cols: ['id'], filas, romperEn: 2 } })
    const r = recolector()
    const res = await volcarTabla(pg, { schema: 'public', name: 'rota' }, r.escribir)
    expect(res.error).toMatch(/statement timeout/)
    expect(res.filas).toBe(FILAS_POR_LOTE)
    expect(log).toContain('ROLLBACK')
    expect(log).not.toContain('COMMIT')
    expect(r.todo()).toMatch(/-- ERROR dumping "public"\."rota" \((after 1000 rows)\): canceling statement/)
  })

  it('el texto del error no puede romper el archivo con saltos de línea', async () => {
    const { pg } = baseFalsa({ 'public.r': { cols: ['id'], filas: [{ id: 1 }], romperEn: 1 } })
    const r = recolector()
    await volcarTabla({ query: async (t, v) => { try { return await pg.query(t, v) } catch { throw new Error('linea1\nlinea2') } } }, { schema: 'public', name: 'r' }, r.escribir)
    expect(r.todo().split('\n').filter((l) => l.startsWith('-- ERROR')).length).toBe(1)
    expect(r.todo()).not.toMatch(/linea1\nlinea2/)
  })
})

describe('volcarTodo', () => {
  it('cabecera + todas las tablas; una tabla rota no impide las demás y queda listada', async () => {
    const { pg } = baseFalsa({
      'public.a': { cols: ['id'], filas: [{ id: 1 }, { id: 2 }] },
      'public.b': { cols: ['id'], filas: [{ id: 1 }], romperEn: 1 },
      'public.c': { cols: ['id'], filas: [{ id: 9 }] },
    })
    const r = recolector()
    const res = await volcarTodo(pg, [{ schema: 'public', name: 'a' }, { schema: 'public', name: 'b' }, { schema: 'public', name: 'c' }], r.escribir, () => new Date('2026-10-26T12:00:00Z'))
    expect(res.tablas).toBe(3)
    expect(res.filas).toBe(3)
    expect(res.tablas_con_error.map((t) => t.tabla)).toEqual(['public.b'])
    const t = r.todo()
    expect(t.startsWith('-- Zero Risk · weekly DB backup')).toBe(true)
    expect(t).toContain('-- Generated: 2026-10-26T12:00:00.000Z')
    expect(t).toContain('SET statement_timeout = 0;')
    expect(t).toContain('INSERT INTO "public"."c" ("id") VALUES (9);')
    expect(t).toContain('-- ERROR dumping "public"."b"')
  })
})
