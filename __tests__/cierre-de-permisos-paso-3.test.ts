/**
 * CIERRE DE PERMISOS · PASO 3 + 3b (GO de Lenovo, «dale» de Emilio 10-nov 14:20Z).
 * La lista de reglas sale de lo MEDIDO el 10-nov (pg_policies), guardada en __tests__/fixtures/permisos-paso-3-reglas-medidas-2026-11-10.json.
 * Antes de aplicar se vuelve a medir y se compara con esa lista: si cambió, no se aplica.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r/g, '').replace(/--.*$/gm, '')
const sentencias = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)
const TOCA_FILAS = /\b(insert\s+into|update\s+[a-z_."]+\s+set|delete\s+from|truncate\s+(table\s+)?[a-z_."]+|drop\s+(table|view|function|schema|column|index|trigger|policy))\b/i
const MIG = 'supabase/migrations/202611101600_permisos_paso_3_reglas_a_solo_admin.sql'
const REV = 'supabase/reversas/202611101600_permisos_paso_3_reglas_a_solo_admin_REVERSA.sql'
interface Regla { tablename: string; policyname: string; cmd: string; qual: string | null; with_check: string | null }
const MEDIDAS: Regla[] = JSON.parse(fs.readFileSync(path.join(process.cwd(), '__tests__/fixtures/permisos-paso-3-reglas-medidas-2026-11-10.json'), 'utf8'))
const FUNCIONES = [
  'public.agent_stats_mini_batch(timestamp with time zone, timestamp with time zone)',
  'public.agent_stats_timeline(text, timestamp with time zone, timestamp with time zone, text, text)',
  'public.agent_stats_totals(text, timestamp with time zone, timestamp with time zone, text, text)',
  'public.costs_breakdown(timestamp with time zone, timestamp with time zone, text, text, text, text, integer)',
  'public.costs_timeline(timestamp with time zone, timestamp with time zone, text, text, text)',
  'public.refresh_agent_invocations_daily_rollup()',
]
const VISTA = 'public.agent_invocations_daily_rollup'
/** lo que NUNCA entra en este paso: el cerebro (decide su dueño), el ingreso, el formulario anónimo, el paso 1 y la web de Náufrago */
const INTOCABLES = /\b(client_voc_library|client_brain_snapshots|cerebro_[a-z_]+|app_roles|auth_clients|landings|pipeline_executions|pipeline_steps|is_admin\(\)\s+from|client_ids_for_user)\b|\bnaufrago\./i
/** la cláusula que corresponde al comando: SELECT/DELETE solo using; INSERT solo with check; ALL/UPDATE using y, si la tenía, with check */
function clausula(r: Regla, valor: string) {
  if (r.cmd === 'SELECT' || r.cmd === 'DELETE') return `using (${valor})`
  if (r.cmd === 'INSERT') return `with check (${valor})`
  return r.with_check === null ? `using (${valor})` : `using (${valor}) with check (${valor})`
}
const alterDe = (r: Regla, valor: string) => `alter policy "${r.policyname.replace(/"/g, '""')}" on public.${r.tablename} ${clausula(r, valor)};`

describe('control', () => {
  it('la expresión «toca filas» ve borrados, vaciados, cambios, inserciones y reglas u objetos borrados', () => {
    for (const t of ['delete from public.costs;', 'truncate public.costs;', 'update public.clients set name = 1;', 'insert into public.x values (1);', 'drop policy "x" on public.y;', 'drop view public.v;']) expect(t, t).toMatch(TOCA_FILAS)
    for (const t of ['alter policy "x" on public.y using (public.is_admin());', 'revoke all on public.v from public, anon, authenticated;']) expect(t, t).not.toMatch(TOCA_FILAS)
  })
  it('la expresión «intocables» ve el cerebro, el ingreso, el formulario, el paso 1, las funciones de las reglas y la web', () => {
    for (const t of ['alter policy "a" on public.client_voc_library using (x);', 'on public.cerebro_tendencias', 'on public.app_roles', 'on public.auth_clients', 'on public.landings', 'on public.pipeline_steps', 'revoke execute on function public.is_admin() from public;', 'public.client_ids_for_user()', 'on naufrago.loyalty_balance']) expect(t, t).toMatch(INTOCABLES)
    expect('alter policy "a" on public.clients using (public.is_admin());').not.toMatch(INTOCABLES)
  })
  it('la lista medida son reglas abiertas de verdad (true) y solo para cuentas: si alguien la edita, se nota', () => {
    expect(MEDIDAS).toHaveLength(76)
    expect(new Set(MEDIDAS.map((r) => r.tablename)).size).toBe(64)
    for (const r of MEDIDAS) {
      const abierta = r.cmd === 'INSERT' ? r.with_check === 'true' : r.qual === 'true' && (r.with_check === null || r.with_check === 'true')
      expect(abierta, `${r.tablename} · ${r.policyname}`).toBe(true)
    }
  })
})

describe('paso 3 · las reglas «sí a cualquier cuenta» pasan a «solo admin»', () => {
  const s = sentencias(leer(MIG))
  it('va en una transacción: begin; primero, commit; al final', () => {
    expect(s[0]).toBe('begin;')
    expect(s[s.length - 1]).toBe('commit;')
    expect(s.filter((l) => l === 'begin;' || l === 'commit;')).toHaveLength(2)
  })
  it('cambia EXACTAMENTE las 76 reglas medidas, cada una con su comando, solo `true` → `public.is_admin()`', () => {
    expect(s.filter((l) => l.startsWith('alter policy'))).toEqual(MEDIDAS.map((r) => alterDe(r, 'public.is_admin()')))
  })
  it('3b · quita EXECUTE a public, anon y authenticated en las 6 funciones (se hereda de PUBLIC) y se lo deja al servidor', () => {
    const fn = s.filter((l) => /\bfunction\b/.test(l))
    expect(fn).toEqual(FUNCIONES.flatMap((f) => [`revoke execute on function ${f} from public, anon, authenticated;`, `grant execute on function ${f} to service_role;`]))
  })
  it('3b · la vista guardada del resumen diario deja de leerse con la llave pública', () => {
    expect(s.filter((l) => l.includes(VISTA))).toEqual([`revoke all on ${VISTA} from public, anon, authenticated;`])
  })
  it('no hay nada más: ni grants a otros, ni reglas nuevas o borradas, ni filas, ni nada intocable', () => {
    expect(s).toHaveLength(2 + MEDIDAS.length + FUNCIONES.length * 2 + 1)
    const texto = s.join('\n')
    expect(texto).not.toMatch(/\bgrant\b[^;]*\bto\b[^;]*\b(anon|authenticated|public)\b/i)
    expect(texto).not.toMatch(/\bcreate\s+policy\b/i)
    expect(texto).not.toMatch(TOCA_FILAS)
    expect(texto).not.toMatch(INTOCABLES)
  })
})

describe('paso 3 · la reversa', () => {
  const r = sentencias(leer(REV))
  it('devuelve EXACTO lo medido: cada regla a `true`, EXECUTE a public/anon/authenticated y la vista a anon/authenticated', () => {
    expect(r).toEqual([
      'begin;',
      ...MEDIDAS.map((x) => alterDe(x, 'true')),
      ...FUNCIONES.map((f) => `grant execute on function ${f} to public, anon, authenticated;`),
      `grant all on ${VISTA} to anon, authenticated;`,
      'commit;',
    ])
  })
  it('no toca filas, no nombra lo intocable y vive fuera de migrations', () => {
    expect(r.join('\n')).not.toMatch(TOCA_FILAS)
    expect(r.join('\n')).not.toMatch(INTOCABLES)
    expect(fs.existsSync(path.join(process.cwd(), REV.replace('supabase/reversas/', 'supabase/migrations/')))).toBe(false)
  })
})
