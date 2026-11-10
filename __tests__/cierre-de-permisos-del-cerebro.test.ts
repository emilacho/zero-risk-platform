/**
 * CIERRE DE PERMISOS DEL CEREBRO (encargo firmado por Emilio 10-nov · raw/tasks/2026-11-10-ENCARGO-CEREBRO-CC-CEREBRO-cerrar-permisos-del-cerebro.md).
 * Regla: las tablas del cerebro no se escriben, borran ni vacían con la llave pública ni con sesión (anon/authenticated); solo escribe el servidor.
 * Tres migraciones, cada una con su reversa. La lista sale de lo MEDIDO el 10-nov (aclexplode + pg_policies + pg_proc), guardada en
 * __tests__/fixtures/permisos-del-cerebro-medidos-2026-11-10.json. Antes de aplicar se vuelve a medir y se compara: si cambió, no se aplica.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const leer = (rel: string) => fs.readFileSync(path.join(process.cwd(), rel), 'utf8').replace(/\r/g, '')
const sentencias = (s: string) => s.replace(/--.*$/gm, '').split('\n').map((l) => l.trim()).filter(Boolean)
const N1 = '202611102100_cerebro_permisos_1_sin_escritura_publica'
const N2 = '202611102110_cerebro_permisos_2_reglas_solo_lectura_admin'
const N3 = '202611102120_cerebro_permisos_3_funciones_cerradas'
const mig = (n: string) => sentencias(leer(`supabase/migrations/${n}.sql`))
const rev = (n: string) => sentencias(leer(`supabase/reversas/${n}_REVERSA.sql`))

interface Permiso { tabla: string; rol: 'anon' | 'authenticated'; permiso: string }
interface Regla { tabla: string; regla: string; permissive: string; roles: string; cmd: string; qual: string; with_check: string | null }
const FX = JSON.parse(leer('__tests__/fixtures/permisos-del-cerebro-medidos-2026-11-10.json')) as { tablas: string[]; permisos_que_se_quitan: Permiso[]; reglas_que_cambian: Regla[] }
const ESCRIBIR = ['INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER', 'MAINTAIN']
const DEL_CEREBRO = /^(cerebro_[a-z0-9_]+|client_brain_chunks|client_brain_snapshots|client_voc_library|brain_embed_costs|client_web_pages|client_videos|client_sede_datos|client_social_images|apify_raw|ingress_quarantine)$/
const REVOCAR = (t: string) => `revoke insert, update, delete, truncate, references, trigger, maintain on public.${t} from anon, authenticated;`

describe('la foto medida', () => {
  it('cubre las 30 tablas del cerebro y solo trae permisos de escribir de anónimo y con sesión (nunca leer, nunca el servidor)', () => {
    expect(FX.tablas).toHaveLength(30)
    for (const t of FX.tablas) expect(t, t).toMatch(DEL_CEREBRO)
    expect(FX.tablas.filter((t) => t.startsWith('cerebro_'))).toHaveLength(20)
    expect(FX.permisos_que_se_quitan).toHaveLength(116)
    for (const p of FX.permisos_que_se_quitan) {
      expect(['anon', 'authenticated']).toContain(p.rol)
      expect(ESCRIBIR, `${p.tabla} ${p.permiso}`).toContain(p.permiso)
      expect(FX.tablas).toContain(p.tabla)
    }
  })
  it('las dos reglas abiertas «a cualquiera con sesión» están en la foto, con su texto exacto', () => {
    const voc = FX.reglas_que_cambian.find((r) => r.regla === 'auth_full_client_voc_library')!
    expect(voc).toMatchObject({ tabla: 'client_voc_library', cmd: 'ALL', roles: '{authenticated}', qual: 'true', with_check: 'true' })
    expect(FX.reglas_que_cambian.find((r) => r.regla === 'authenticated_read')).toMatchObject({ tabla: 'client_brain_snapshots', cmd: 'SELECT', qual: 'true' })
    expect(FX.reglas_que_cambian.map((r) => `${r.tabla}.${r.regla}`).sort()).toEqual(['apify_raw.apify_raw_auth_full', 'client_brain_chunks.chunks_admin_full', 'client_brain_snapshots.authenticated_read', 'client_voc_library.auth_full_client_voc_library', 'client_web_pages.web_pages_auth_full'])
  })
})

describe('paso 1 · permisos', () => {
  it('una transacción con un revoke por cada tabla del cerebro, sin tocar leer, el servidor ni ninguna tabla de fuera', () => {
    expect(mig(N1)).toEqual(['begin;', "set local lock_timeout = '5s';", ...FX.tablas.map(REVOCAR), 'commit;'])
    for (const s of mig(N1)) { expect(s).not.toMatch(/\bselect\b|service_role|\bgrant\b|\bpublic\s*,|from public\b|policy|function/i) }
  })
  it('la reversa devuelve EXACTAMENTE lo medido, tabla por tabla y rol por rol', () => {
    const esperado = new Map<string, Set<string>>()
    for (const p of FX.permisos_que_se_quitan) { const k = `${p.tabla}|${p.rol}`; if (!esperado.has(k)) esperado.set(k, new Set()); esperado.get(k)!.add(p.permiso.toLowerCase()) }
    const R = rev(N1)
    expect(R[0]).toBe('begin;'); expect(R.at(-1)).toBe('commit;')
    const dado = new Map<string, Set<string>>()
    for (const s of R.slice(1, -1)) {
      const m = s.match(/^grant ([a-z, ]+) on public\.([a-z0-9_]+) to (anon|authenticated);$/)
      expect(m, s).toBeTruthy()
      dado.set(`${m![2]}|${m![3]}`, new Set(m![1].split(', ')))
    }
    expect([...dado.keys()].sort()).toEqual([...esperado.keys()].sort())
    for (const [k, v] of esperado) expect([...dado.get(k)!].sort(), k).toEqual([...v].sort())
  })
})

describe('paso 2 · reglas', () => {
  const M = mig(N2)
  it('con sesión ya no queda ninguna regla que deje escribir en el cerebro: las nuevas son SOLO lectura y SOLO admin', () => {
    expect(M[0]).toBe('begin;'); expect(M.at(-1)).toBe('commit;')
    const crea = M.filter((s) => s.startsWith('create policy'))
    expect(crea).toHaveLength(4)
    for (const s of crea) expect(s, s).toMatch(/^create policy [a-z_]+ on public\.[a-z_]+ for select to authenticated using \(public\.is_admin\(\)\);$/)
    expect(M).toContain('alter policy authenticated_read on public.client_brain_snapshots using (public.is_admin());')
    expect(M.filter((s) => s.startsWith('drop policy')).sort()).toEqual([
      'drop policy apify_raw_auth_full on public.apify_raw;', 'drop policy auth_full_client_voc_library on public.client_voc_library;',
      'drop policy chunks_admin_full on public.client_brain_chunks;', 'drop policy web_pages_auth_full on public.client_web_pages;'].sort())
    expect(M.join('\n')).not.toMatch(/service_role|with check|for all|\btrue\b|\banon\b/i)
  })
  it('la reversa recrea cada regla con su texto exacto medido y quita las nuevas', () => {
    const R = rev(N2).join('\n')
    for (const r of FX.reglas_que_cambian) {
      if (r.regla === 'authenticated_read') { expect(R).toContain(`alter policy authenticated_read on public.client_brain_snapshots using (${r.qual});`); continue }
      const plano = (x: string) => x.replace(/\s+/g, ' ').replace(/\( /g, '(').replace(/ \)/g, ')')
      expect(plano(R), r.regla).toContain(plano(`create policy ${r.regla} on public.${r.tabla} as permissive for all to authenticated using (${r.qual}) with check (${r.with_check});`))
    }
    for (const n of ['client_voc_library_admin_lee', 'apify_raw_admin_lee', 'web_pages_admin_lee', 'chunks_admin_lee']) expect(R).toMatch(new RegExp(`drop policy ${n} on public\\.`))
  })
})

describe('paso 3 · funciones', () => {
  it('la del re-índice (corre como dueño) y la que escribe en la biblioteca de voces ya no las llama la web; el servidor las conserva', () => {
    expect(mig(N3)).toEqual([
      'begin;',
      'revoke execute on function public.brain_reembed_source_row() from public, anon, authenticated;',
      'alter function public.brain_reembed_source_row() set search_path = pg_catalog, pg_temp;',
      'revoke execute on function public.prepare_voc_content(uuid) from public, anon, authenticated;',
      'commit;',
    ])
  })
  it('la reversa devuelve EXECUTE y quita el search_path, como estaba', () => {
    expect(rev(N3)).toEqual([
      'begin;',
      'grant execute on function public.brain_reembed_source_row() to public, anon, authenticated;',
      'alter function public.brain_reembed_source_row() reset search_path;',
      'grant execute on function public.prepare_voc_content(uuid) to public, anon, authenticated;',
      'commit;',
    ])
  })
})

describe('para que no vuelva a abrirse', () => {
  // medido 10-nov: una tabla nueva de public ya nace sin permisos para anon/authenticated, pero una FUNCIÓN nueva nace con EXECUTE para todos
  // (el valor por omisión global de Postgres; cambiarlo tocaría también las funciones de la web de Náufrago). Por eso: guarda en el repositorio.
  const nuevas = fs.readdirSync(path.join(process.cwd(), 'supabase/migrations')).filter((f) => f >= '202611102100' && f.endsWith('.sql'))
  it('toda migración nueva que cree una función SECURITY DEFINER le quita EXECUTE a public, anon y authenticated', () => {
    for (const f of nuevas) {
      const s = leer(`supabase/migrations/${f}`).replace(/--.*$/gm, '')
      const fns = [...s.matchAll(/create\s+(?:or\s+replace\s+)?function\s+(public\.[a-z0-9_]+)\s*\(([^)]*)\)[\s\S]*?(?=create\s+(?:or\s+replace\s+)?function|$)/gi)].filter((m) => /security\s+definer/i.test(m[0]))
      for (const m of fns) expect(s, `${f}: ${m[1]}`).toMatch(new RegExp(`revoke\\s+(all|execute)[^;]*on\\s+function\\s+${m[1].replace('.', '\\.')}\\s*\\([^;]*from\\s+public\\s*,\\s*anon\\s*,\\s*authenticated`, 'i'))
    }
  })
  it('toda migración nueva que cree una tabla del cerebro no le da escribir a anon ni a authenticated', () => {
    for (const f of nuevas) {
      const s = leer(`supabase/migrations/${f}`).replace(/--.*$/gm, '')
      for (const m of s.matchAll(/\bgrant\s+([^;]+?)\s+on\s+(?:table\s+)?public\.([a-z0-9_]+)\s+to\s+([^;]+);/gi)) {
        if (!DEL_CEREBRO.test(m[2])) continue
        if (/\b(anon|authenticated|public)\b/i.test(m[3])) expect(m[1], `${f}: ${m[0]}`).toMatch(/^select$/i)
      }
    }
  })
})
