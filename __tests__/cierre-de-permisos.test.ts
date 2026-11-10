/**
 * CIERRE DE PERMISOS (GO de Lenovo, «dale» de Emilio 10-nov 14:20Z) · una migración por paso, cada una con su reversa EXACTA.
 * Estas pruebas leen el SQL: lo vivo se mide aparte, antes y después de aplicar, con has_table_privilege y un control en true.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r/g, '').replace(/--.*$/gm, '')
const sentencias = (s: string) => s.split('\n').map((l) => l.trim()).filter(Boolean)
/** sentencias que tocan FILAS o borran objetos (una regla se quita con drop policy: eso no cuenta) */
const TOCA_FILAS = /\b(insert\s+into|update\s+[a-z_."]+\s+set|delete\s+from|truncate\s+(table\s+)?[a-z_."]+|drop\s+(table|view|function|schema|column|index|trigger))\b/i
/** dentro de una transacción: begin; primero, commit; al final, y todo lo demás en medio */
function enTransaccion(sql: string) {
  const s = sentencias(sql)
  expect(s[0]).toBe('begin;')
  expect(s[s.length - 1]).toBe('commit;')
  expect(s.filter((l) => l === 'begin;' || l === 'commit;')).toHaveLength(2)
}

describe('control: la expresión «toca filas» ve lo que debe', () => {
  it('ve borrados, vaciados, cambios, inserciones y objetos borrados; no confunde quitar una regla ni los permisos', () => {
    for (const t of ['delete from public.pipeline_steps;', 'truncate public.pipeline_steps;', 'truncate table public.x;', 'drop table public.x;', 'drop view public.v;', 'update public.x set a = 1;', 'insert into public.x values (1);']) expect(t, t).toMatch(TOCA_FILAS)
    for (const t of ['drop policy "Admin full access pipeline_steps" on public.pipeline_steps;', 'revoke all on public.pipeline_steps from public, anon, authenticated;', 'grant all on public.pipeline_steps to anon, authenticated;']) expect(t, t).not.toMatch(TOCA_FILAS)
  })
})

describe('paso 1 · pipeline_executions y pipeline_steps cerradas a anónimos y a cuentas', () => {
  const MIG = 'supabase/migrations/202611101500_permisos_paso_1_pipeline_cerrado_a_anonimos.sql'
  const REV = 'supabase/reversas/202611101500_permisos_paso_1_pipeline_cerrado_a_anonimos_REVERSA.sql'
  it('quita EXACTAMENTE las 2 reglas abiertas y todos los permisos de public, anon y authenticated; nada más', () => {
    const sql = leer(MIG)
    enTransaccion(sql)
    expect(sentencias(sql).slice(1, -1)).toEqual([
      'drop policy "Admin full access pipeline_executions" on public.pipeline_executions;',
      'drop policy "Admin full access pipeline_steps" on public.pipeline_steps;',
      'revoke all on public.pipeline_executions from public, anon, authenticated;',
      'revoke all on public.pipeline_steps from public, anon, authenticated;',
    ])
  })
  it('no concede nada, no crea reglas, no toca filas ni al servidor', () => {
    const sql = leer(MIG)
    expect(sql).not.toMatch(/\bgrant\b/i)
    expect(sql).not.toMatch(/\bcreate\s+policy\b/i)
    expect(sql).not.toMatch(TOCA_FILAS)
    expect(sql).not.toMatch(/service_role/i)
  })
  it('la reversa devuelve EXACTO lo medido el 10-nov (las 2 reglas con su texto y los permisos a anon y authenticated) y vive fuera de migrations', () => {
    const r = leer(REV)
    enTransaccion(r)
    expect(sentencias(r).slice(1, -1)).toEqual([
      'create policy "Admin full access pipeline_executions" on public.pipeline_executions as permissive for all to public using (true) with check (true);',
      'create policy "Admin full access pipeline_steps" on public.pipeline_steps as permissive for all to public using (true) with check (true);',
      'grant all on public.pipeline_executions to anon, authenticated;',
      'grant all on public.pipeline_steps to anon, authenticated;',
    ])
    expect(r).not.toMatch(TOCA_FILAS)
    expect(fs.existsSync(path.join(process.cwd(), REV.replace('supabase/reversas/', 'supabase/migrations/')))).toBe(false)
  })
})
