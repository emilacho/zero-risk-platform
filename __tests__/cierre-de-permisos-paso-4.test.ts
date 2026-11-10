/**
 * CIERRE DE PERMISOS · PASO 4 (GO de Lenovo, «dale» de Emilio 10-nov 14:20Z): anónimo y con sesión pierden TRUNCATE, REFERENCES, TRIGGER y MAINTAIN
 * en public, y las tablas nuevas nacen sin ellos. La lista sale de lo MEDIDO el 10-nov (aclexplode sobre pg_class), guardada en
 * __tests__/fixtures/permisos-paso-4-medidos-2026-11-10.json. Antes de aplicar se vuelve a medir y se compara: si cambió, no se aplica.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const N = '202611101900_permisos_paso_4_sin_vaciar_ni_disparadores'
const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r/g, '')
const sinComentarios = (s: string) => s.replace(/--.*$/gm, '')
const sentencias = (s: string) => sinComentarios(s).split('\n').map((l) => l.trim()).filter(Boolean)
const MIG = sentencias(leer(`supabase/migrations/${N}.sql`))
const REV = sentencias(leer(`supabase/reversas/${N}_REVERSA.sql`))
interface Permiso { tabla: string; tipo: string; rol: 'anon' | 'authenticated'; permiso: 'TRUNCATE' | 'REFERENCES' | 'TRIGGER' | 'MAINTAIN' }
const MEDIDOS: Permiso[] = JSON.parse(leer('__tests__/fixtures/permisos-paso-4-medidos-2026-11-10.json'))
const TABLAS = [...new Set(MEDIDOS.map((p) => p.tabla))].sort()
const CEREBRO = /^(cerebro_|client_brain_|client_voc_)/
const REVOCAR = (t: string) => `revoke truncate, references, trigger, maintain on public.${t} from anon, authenticated;`
const POR_OMISION = 'alter default privileges for role postgres in schema public revoke truncate, references, trigger, maintain on tables from anon, authenticated;'
const TOCA_OTRA_COSA = /\b(insert|update|delete|select|all|usage|execute|create|policy|function|naufrago|service_role|public\s*,|from\s+public\b|to\s+public\b|truncate\s+(table\s+)?public\.)/i

describe('la lista medida', () => {
  it('trae solo los 4 permisos de anónimo y con sesión, en public, sin ninguna tabla del cerebro', () => {
    expect(MEDIDOS.length).toBe(1199)
    expect(TABLAS.length).toBe(152)
    for (const p of MEDIDOS) {
      expect(['anon', 'authenticated']).toContain(p.rol)
      expect(['TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']).toContain(p.permiso)
      expect(p.tabla, p.tabla).toMatch(/^[a-z0-9_]+$/)
      expect(p.tabla, p.tabla).not.toMatch(CEREBRO)
    }
  })
})

describe('la migración', () => {
  it('es una transacción con un revoke por tabla medida, en orden, y el cambio de privilegios por omisión del rol que crea las tablas', () => {
    expect(MIG).toEqual(['begin;', ...TABLAS.map(REVOCAR), POR_OMISION, 'commit;'])
  })
  it('no toca filas, reglas, funciones, otros permisos, otros roles ni la web de Náufrago', () => {
    for (const s of MIG.slice(1, -1)) {
      const resto = s.replace(/^revoke truncate, references, trigger, maintain on (tables|public\.[a-z0-9_]+) from anon, authenticated;$/, '').replace(/^alter default privileges for role postgres in schema public /, '')
      expect(resto.replace(/revoke truncate, references, trigger, maintain on tables from anon, authenticated;/, ''), s).toBe('')
      expect(s, s).not.toMatch(TOCA_OTRA_COSA)
    }
  })
  it('deja fuera todas las del cerebro y el formulario anónimo sigue pudiendo escribir (solo pierde vaciar/disparar)', () => {
    expect(MIG.some((s) => /public\.(cerebro_|client_brain_|client_voc_)/.test(s))).toBe(false)
    expect(MIG.filter((s) => s.includes('public.leads '))).toEqual([REVOCAR('leads')])
  })
})

describe('la reversa', () => {
  it('devuelve EXACTAMENTE lo medido: cada (tabla, rol) con sus permisos, y los privilegios por omisión de antes', () => {
    const esperado = new Map<string, Set<string>>()
    for (const p of MEDIDOS) { const k = `${p.tabla}|${p.rol}`; if (!esperado.has(k)) esperado.set(k, new Set()); esperado.get(k)!.add(p.permiso.toLowerCase()) }
    const dado = new Map<string, Set<string>>()
    for (const s of REV.slice(1, -2)) {
      const m = s.match(/^grant ([a-z, ]+) on public\.([a-z0-9_]+) to (anon|authenticated);$/)
      expect(m, s).not.toBeNull()
      dado.set(`${m![2]}|${m![3]}`, new Set(m![1].split(', ')))
    }
    expect(dado.size).toBe(esperado.size)
    for (const [k, v] of esperado) expect([...(dado.get(k) ?? [])].sort(), k).toEqual([...v].sort())
    expect(REV[0]).toBe('begin;')
    expect(REV.at(-2)).toBe('alter default privileges for role postgres in schema public grant truncate, references, trigger, maintain on tables to anon, authenticated;')
    expect(REV.at(-1)).toBe('commit;')
  })
})
