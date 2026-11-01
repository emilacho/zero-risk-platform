/**
 * La migración 202611011900 (plan_aprobaciones + plan_cambios · ciclo del plan, tramo 2) y su reversa, leídas del repositorio. Nada se aplica.
 * Fija el CONTRATO: las dos tablas con permisos (RLS + revoke + grant + policy), los estados y topes iguales a los del código, cero DDL sobre
 * client_historical_outputs, y una reversa que se niega con reescrituras abiertas.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { TOPE_DE_VUELTAS } from '../tablero/plan'

const RAIZ = join(__dirname, '..', '..', '..', '..')
const NOMBRE = '202611011900_plan_cambios_y_aprobaciones'
const crudo = (p: string) => readFileSync(p, 'utf8')
const MIG = crudo(join(RAIZ, 'supabase', 'migrations', `${NOMBRE}.sql`))
const REV = crudo(join(RAIZ, 'supabase', 'reversas', `${NOMBRE}_REVERSA.sql`))
const ATTR = crudo(join(RAIZ, '.gitattributes'))

describe('migración 202611011900 · plan_aprobaciones + plan_cambios (NO se aplica aquí)', () => {
  it('crea las dos tablas con sus permisos (RLS, revoke, grant a service_role, policy) y comentario', () => {
    for (const t of ['plan_aprobaciones', 'plan_cambios']) {
      expect(MIG).toContain(`create table if not exists public.${t} (`)
      expect(MIG).toContain(`alter table public.${t} enable row level security;`)
      expect(MIG).toContain(`revoke all on public.${t} from public, anon, authenticated;`)
      expect(MIG).toContain(`grant select, insert, update on public.${t} to service_role;`)
      expect(MIG).toContain(`create policy ${t}_service on public.${t} for all to service_role using (true) with check (true);`)
      expect(MIG).toContain(`comment on table public.${t} is`)
      expect(MIG).toContain(`plan_id uuid not null references public.client_historical_outputs (id)`)
    }
  })
  it('los estados y topes son los del código: vuelta 1..TOPE_DE_VUELTAS, texto 5..4000, una compuerta por plan, un solo pedido abierto por plan', () => {
    expect(MIG).toContain(`vuelta int not null check (vuelta between 1 and ${TOPE_DE_VUELTAS})`)
    expect(MIG).toContain(`check (char_length(texto) between 5 and 4000)`)
    expect(MIG).toContain(`check (estado in ('pendiente', 'en_reescritura', 'aplicado', 'fallido', 'cancelado'))`)
    expect(MIG).toContain(`check (estado in ('pendiente', 'aprobado', 'cambios_pedidos', 'reemplazado'))`)
    expect(MIG).toMatch(/plan_aprobaciones \([\s\S]*?unique \(plan_id\)\s*\);/)
    expect(MIG).toContain(`create unique index if not exists plan_cambios_un_abierto_por_plan on public.plan_cambios (plan_id) where estado in ('pendiente', 'en_reescritura');`)
    for (const c of ['despertado boolean', 'despertar_detalle text', 'sobre_de_reanudacion jsonb not null default', 'plan_nuevo_id uuid references public.client_historical_outputs (id)', 'tope_usd numeric(8, 2) not null check (tope_usd > 0)']) expect(MIG).toContain(c)
  })
  it('cero DDL sobre client_historical_outputs (la versión vive en provenance_tag) y ninguna otra tabla se toca', () => {
    for (const sql of [MIG, REV]) {
      expect(sql).not.toMatch(/alter table public\.client_historical_outputs/i)
      expect(sql).not.toMatch(/\b(insert|delete|update|truncate)\b\s+(into\s+|from\s+)?public\./i)
      for (const m of sql.matchAll(/(?:create table if not exists|alter table|drop table if exists|revoke all on|grant [a-z, ]+ on) public\.(\w+)/gi)) expect(['plan_aprobaciones', 'plan_cambios']).toContain(m[1])
    }
  })
  it('la reversa borra las dos tablas, se niega con pedidos abiertos y no toca las versiones del plan', () => {
    expect(REV).toMatch(/SELECT count\(\*\) INTO abiertos FROM public\.plan_cambios WHERE estado IN \('pendiente', 'en_reescritura'\);\s+IF abiertos > 0 THEN RAISE EXCEPTION/)
    expect(REV).toContain('DROP TABLE IF EXISTS public.plan_cambios;')
    expect(REV).toContain('DROP TABLE IF EXISTS public.plan_aprobaciones;')
    expect(REV.indexOf('DROP TABLE IF EXISTS public.plan_cambios;')).toBeLessThan(REV.indexOf('DROP TABLE IF EXISTS public.plan_aprobaciones;'))
    expect(REV).not.toMatch(/(alter|drop|update|delete|insert)[^;]*client_historical_outputs/i)
  })
  it('los dos archivos van con fin de línea LF y están registrados en .gitattributes', () => {
    expect(MIG).not.toContain('\r'); expect(REV).not.toContain('\r')
    expect(ATTR).toContain('supabase/migrations/202611011900_*.sql text eol=lf')
    expect(ATTR).toContain('supabase/reversas/202611011900_*.sql text eol=lf')
  })
})
