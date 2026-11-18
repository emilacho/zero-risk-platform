/**
 * PERFIL DEL PÚBLICO · el BORRADO de la tabla de voces propia (GO de Lenovo por firma de Emilio, 18-nov 02:14 Zúrich · certifica CC7).
 * Va DESPUÉS de #1157 (el perfil ya no la lee ni la escribe). Ensayada además en un Postgres en memoria (pglite) fuera del repo:
 * con una fila se niega, vacía se borra, dos veces no falla, y la reversa la deja igual que 1300 + 1400 (columnas, restricciones, índice,
 * seguridad por fila, política y privilegios, con los privilegios por omisión de Supabase simulados).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const TABLA = 'perfil_publico_voces'
const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r/g, '')
const sinComentarios = (s: string) => s.replace(/--.*$/gm, '')
const sentencias = (s: string) => sinComentarios(s).split('\n').map((l) => l.trim()).filter(Boolean)
const BORRAR = 'supabase/migrations/202611180300_borrar_perfil_publico_voces.sql'
const REVERSA = 'supabase/reversas/202611180300_borrar_perfil_publico_voces_REVERSA.sql'

describe('el borrado de la tabla de voces del perfil', () => {
  it('se niega si la tabla tiene filas, con IF anidados (un AND haría fallar el EXISTS si la tabla ya no existe)', () => {
    const sql = sinComentarios(leer(BORRAR))
    expect(sql).toMatch(new RegExp(`if to_regclass\\('public\\.${TABLA}'\\) is not null then\\s+if exists \\(select 1 from public\\.${TABLA}\\) then\\s+raise exception`))
    expect(sql).not.toMatch(/is not null and exists/)
  })
  it('borra solo esa tabla, sin cascada, dentro de una transacción', () => {
    const s = sentencias(leer(BORRAR))
    expect(s.filter((l) => /\bdrop\b/i.test(l))).toEqual([`drop table if exists public.${TABLA};`])
    expect(s.join('\n')).not.toMatch(/cascade|truncate|delete from/i)
    expect(s[0]).toBe('begin;')
    expect(s).toContain('commit;')
  })
  it('la reversa la recrea vacía con lo mismo que dejaron 1300 + 1400 (la tabla, el índice, la política y los privilegios)', () => {
    const r = sinComentarios(leer(REVERSA))
    const crear = sinComentarios(leer('supabase/migrations/202611101300_perfil_publico_voces.sql'))
    const cerrar = sinComentarios(leer('supabase/migrations/202611101400_perfil_publico_voces_sin_vaciar.sql'))
    const bloque = (s: string, desde: string, hasta: string) => s.slice(s.indexOf(desde), s.indexOf(hasta, s.indexOf(desde)) + hasta.length)
    expect(bloque(r, `create table if not exists public.${TABLA}`, ');')).toBe(bloque(crear, `create table if not exists public.${TABLA}`, ');'))
    for (const l of [`create index if not exists ${TABLA}_cliente`, `alter table public.${TABLA} enable row level security;`, `create policy ${TABLA}_service`]) {
      expect(r, l).toContain(sentencias(crear).find((x) => x.startsWith(l)))
    }
    for (const l of sentencias(cerrar).filter((x) => /^(revoke|grant)\b/.test(x))) expect(r, l).toContain(l)
    expect(r).not.toMatch(/\binsert\s+into\b|\bdrop\b/i)
  })
  it('después de #1157 nadie en el código de la plataforma la nombra (solo migraciones, reversas y pruebas)', () => {
    const fuera: string[] = []
    const recorrer = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name)
        if (e.isDirectory()) { if (!['node_modules', '__tests__', '.next'].includes(e.name)) recorrer(p) } else if (/\.(ts|tsx|mjs|js|sql|json)$/.test(e.name) && fs.readFileSync(p, 'utf8').includes(TABLA)) fuera.push(path.relative(process.cwd(), p))
      }
    }
    for (const d of ['src', 'scripts', 'n8n-workflows']) if (fs.existsSync(d)) recorrer(d)
    expect(fuera).toEqual([])
  })
})
