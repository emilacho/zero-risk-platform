/**
 * 19-nov · VARIAS CAMPAÑAS · parte B (ajuste de Emilio 22:07 Zúrich · GO de Lenovo a CC1): cada encargo sabe de qué campaña es.
 * La campaña del encargo: la del sobre · si no viene, la de la versión anterior del mismo brief · si tampoco, la de su fila del calendario.
 * Un encargo sin forma de saberlo queda sin campaña (como todos los de antes) y se crea igual.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { almacenDeSupabase, campanaDeLaFila } from '../almacen-supabase'
import { validarSobre, TARGET_STEP_PRODUCIR } from '../sobre'
import { abrirEncargo } from '../orquestador'
import { sobresDeProducir } from '../../cadena/autoproducir'
import { DbFalsa } from './dbfalsa'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { POST_IMG } from '../plantillas/post-img'

const CAMP = '3a1d48c0-0000-4000-8000-000000000001'
const OTRA = '3a1d48c0-0000-4000-8000-000000000002'
const FILA = 'fila-0001'
const motor = () => ({ ultimo: -1, pasos_ejecutados: 0, gasto_usd: 0, vueltas: {}, artefactos: {} }) as never
const nuevo = (extra: Record<string, unknown> = {}) => ({ client_id: CLIENTE, parte_id: PARTE, brief_id: 'BRF-0003', tipo_de_grupo: 'post_img', familia: 'post_img', tope_usd: 10, dry_run: false, prueba: false, sala_ref: null, estado_del_motor: motor(), ...extra }) as never

describe('el sobre trae la campaña', () => {
  it('🔴 un uuid pasa al sobre; sin campaña, el sobre queda como siempre', () => {
    const base = { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true }
    const con = validarSobre({ ...base, campana_id: CAMP })
    expect(con.ok && con.sobre.campana_id).toBe(CAMP)
    const sin = validarSobre(base)
    expect(sin.ok && 'campana_id' in sin.sobre).toBe(false)
    const nulo = validarSobre({ ...base, campana_id: null })
    expect(nulo.ok && 'campana_id' in nulo.sobre).toBe(false)
  })
  it('🔴 una campaña que no es uuid NO frena la pieza: se ignora (y se dice) y el sobre sigue sin campaña', () => {
    for (const v of ['camp-1', 7, { id: CAMP }, '']) {
      const r = validarSobre({ parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, campana_id: v })
      expect(r.ok, JSON.stringify(v)).toBe(true)
      expect(r.ok && 'campana_id' in r.sobre, JSON.stringify(v)).toBe(false)
      expect(r.ok && r.ignorados, JSON.stringify(v)).toContain('campana_id')
    }
    const bien = validarSobre({ parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, campana_id: CAMP })
    expect(bien.ok && bien.ignorados).not.toContain('campana_id')
  })
  it('🔴 producir: el sobre de cada brief lleva la campaña del parte; sin pedirla, el sobre es el de siempre', () => {
    const parte = { id: PARTE, client_id: CLIENTE, valido: true, briefs: [{ brief_id: 'BRF-0001', familia: 'post_img' }, { brief_id: 'BRF-0002' }] } as never
    const con = sobresDeProducir(parte, { dry_run: false, campana_id: CAMP }).sobres
    expect(con.map((s) => s.payload.campana_id)).toEqual([CAMP, CAMP])
    const sin = sobresDeProducir(parte, { dry_run: false }).sobres
    expect(sin.every((s) => !('campana_id' in s.payload))).toBe(true)
  })
  it('🔴 las dos rutas que producen le pasan su campaña (la de la cadena y el reintento de piezas)', () => {
    const leer = (rel: string) => fs.readFileSync(path.join(__dirname, '..', '..', rel), 'utf8')
    expect(leer('cadena/autoproducir.ts')).toMatch(/sobresDeProducir\(parte, \{ dry_run: s\.seco, campana_id: campanaId,/)
    expect(leer('cadena/reintento-piezas.ts')).toMatch(/\{ dry_run: false, campana_id: c\.id, correlation_id: corr,/)
  })
})

describe('el almacén real guarda la campaña del encargo', () => {
  it('🔴 la del sobre manda (aunque la fila diga otra)', async () => {
    const db = new DbFalsa(); db.semilla('cadena_calendario_filas', [{ id: FILA, campana_id: OTRA }])
    const r = await almacenDeSupabase(db as never).crearEncargo(nuevo({ campana_id: CAMP, sala_ref: { fila: { id: FILA } } }))
    expect(r.ok && r.encargo.campana_id).toBe(CAMP)
    expect(db.tablas['oficina_encargos'][0].campana_id).toBe(CAMP)
  })
  it('🔴 una campaña que NO existe (la FK da 23503): el encargo nace igual, sin campaña · otro error no se reintenta', async () => {
    const NO_EXISTE = '3a1d48c0-0000-4000-8000-0000000000ff'
    const conFK = (codigo: string) => {
      const db = new DbFalsa(); const from = db.from.bind(db); const intentos: Array<Record<string, unknown>> = []
      ;(db as unknown as { from: (t: string) => unknown }).from = (t: string) => {
        const b = from(t) as unknown as { insert: (p: Record<string, unknown>) => unknown }
        if (t !== 'oficina_encargos') return b
        const insert = b.insert.bind(b)
        b.insert = (p: Record<string, unknown>) => {
          intentos.push(p)
          if (p.campana_id === NO_EXISTE) return { select: () => ({ single: async () => ({ data: null, error: { message: 'violates foreign key constraint', code: codigo } }) }) }
          return insert(p)
        }
        return b
      }
      return { db, intentos }
    }
    const { db, intentos } = conFK('23503')
    const r = await almacenDeSupabase(db as never).crearEncargo(nuevo({ campana_id: NO_EXISTE }))
    expect(r.ok).toBe(true)
    expect(r.ok && r.encargo.campana_id).toBeUndefined()
    expect(db.tablas['oficina_encargos']).toHaveLength(1)
    expect('campana_id' in db.tablas['oficina_encargos'][0]).toBe(false)
    expect(intentos.map((p) => p.campana_id ?? null)).toEqual([NO_EXISTE, null])
    // otro error (no de FK) NO se reintenta sin campaña: se devuelve tal cual
    const otro = conFK('42501')
    const r2 = await almacenDeSupabase(otro.db as never).crearEncargo(nuevo({ campana_id: NO_EXISTE }))
    expect(r2.ok).toBe(false)
    expect(otro.intentos).toHaveLength(1)
  })
  it('🔴 sin campaña en el sobre: la de su fila del calendario', async () => {
    const db = new DbFalsa(); db.semilla('cadena_calendario_filas', [{ id: FILA, campana_id: CAMP }, { id: 'fila-otra', campana_id: OTRA }])
    const r = await almacenDeSupabase(db as never).crearEncargo(nuevo({ sala_ref: { fila: { id: FILA, fecha: '2026-11-20' } } }))
    expect(r.ok && r.encargo.campana_id).toBe(CAMP)
  })
  it('🔴 la versión siguiente del mismo brief hereda la campaña de la anterior (reabrir, cambios del dueño, re-revisión)', async () => {
    const db = new DbFalsa()
    db.semilla('oficina_encargos', [{ id: 'e1', client_id: CLIENTE, campana_id: CAMP, parte_id: PARTE, brief_id: 'BRF-0003', tipo_de_grupo: 'post_img', familia: 'post_img', version_encargo: 1, estado: 'cerrado', dry_run: false, gasto_usd: 0.2, estado_del_motor: {} }])
    const r = await almacenDeSupabase(db as never).crearEncargo(nuevo({ re_revision: { desde_encargo: 'e1', desde_hitl: 'h1', pedido_por: 'emilio' } }))
    expect(r.ok && r.nuevo).toBe(true)
    expect(r.ok && r.encargo.version_encargo).toBe(2)
    expect(r.ok && r.encargo.campana_id).toBe(CAMP)
  })
  it('🔴 sin nada con qué saberlo: el encargo nace igual, sin campaña (y no escribe la columna)', async () => {
    const db = new DbFalsa()
    const r = await almacenDeSupabase(db as never).crearEncargo(nuevo({ sala_ref: { fila: { id: 'fila-que-no-existe' } } }))
    expect(r.ok && r.nuevo).toBe(true)
    expect(r.ok ? r.encargo.campana_id ?? null : 'fallo').toBeNull()
    expect('campana_id' in db.tablas['oficina_encargos'][0]).toBe(false)
  })
  it('🔴 la lectura de la fila: sin fila o si la base falla da null (nunca frena el encargo)', async () => {
    const db = new DbFalsa(); db.semilla('cadena_calendario_filas', [{ id: FILA, campana_id: CAMP }])
    expect(await campanaDeLaFila(db as never, { fila: { id: FILA } })).toBe(CAMP)
    expect(await campanaDeLaFila(db as never, null)).toBeNull()
    expect(await campanaDeLaFila(db as never, { fila: { fecha: '2026-11-20' } })).toBeNull()
    expect(await campanaDeLaFila(db as never, { fila: 'x' })).toBeNull()
    const rota = { from: () => { throw new Error('caída') } }
    expect(await campanaDeLaFila(rota, { fila: { id: FILA } })).toBeNull()
    const conError = { from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { campana_id: CAMP }, error: { message: 'x' } }) }) }) }) }
    expect(await campanaDeLaFila(conError, { fila: { id: FILA } })).toBeNull()
  })
})

describe('la oficina pasa la campaña del sobre al encargo', () => {
  it('🔴 abrirEncargo: el encargo nace con la campaña del sobre; sin ella, sin campaña', async () => {
    const M = crearMemoria()
    const con = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: POST_IMG.familia, campana_id: CAMP }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const idCon = (con.cuerpo as Record<string, unknown>).encargo_id as string
    expect(idCon, JSON.stringify(con.cuerpo)).toBeTruthy()
    expect((await M.P.almacen.leerEncargo(idCon))?.campana_id).toBe(CAMP)
    const sin = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0004', dry_run: true, familia: POST_IMG.familia }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const idSin = (sin.cuerpo as Record<string, unknown>).encargo_id as string
    expect(idSin, JSON.stringify(sin.cuerpo)).toBeTruthy()
    expect((await M.P.almacen.leerEncargo(idSin))?.campana_id ?? null).toBeNull()
  })
  it('🔴 la mesa de la cadena y la re-revisión también la pasan', () => {
    const leer = (rel: string) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8')
    expect(leer('mesa/de-la-cadena.ts')).toMatch(/client_id: s\.client_id, campana_id: s\.campana_id, parte_id: s\.campana_id,/)
    expect(leer('re-revision.ts')).toMatch(/campana_id: typeof enc\.campana_id === 'string' \? enc\.campana_id : null,/)
  })
})

describe('la migración y su reversa', () => {
  const RAIZ = path.join(__dirname, '..', '..', '..', '..')
  const M = fs.readFileSync(path.join(RAIZ, 'supabase/migrations/202611192230_oficina_encargos_campana_id.sql'), 'utf8').replace(/\r\n/g, '\n')
  const R = fs.readFileSync(path.join(RAIZ, 'supabase/reversas/202611192230_oficina_encargos_campana_id_REVERSA.sql'), 'utf8').replace(/\r\n/g, '\n')
  it('🔴 columna uuid que apunta a la campaña, y si la campaña se borra el encargo queda sin campaña (nunca se borra)', () => {
    expect(M).toMatch(/ALTER TABLE public\.oficina_encargos ADD COLUMN IF NOT EXISTS campana_id uuid\s+REFERENCES public\.cadena_campanas \(id\) ON DELETE SET NULL;/)
    expect(M).not.toMatch(/ON DELETE CASCADE/)
    expect(M).toContain('CREATE INDEX IF NOT EXISTS oficina_encargos_por_campana ON public.oficina_encargos (campana_id) WHERE campana_id IS NOT NULL;')
    expect(M).toMatch(/^BEGIN;$/m); expect(M).toMatch(/^COMMIT;$/m)
  })
  it('🔴 la guarda: ningún encargo que ya existía queda con campaña (no hay relleno)', () => {
    expect(M).toMatch(/IF EXISTS \(SELECT 1 FROM public\.oficina_encargos WHERE campana_id IS NOT NULL\) THEN\s+RAISE EXCEPTION/)
    expect(M).not.toMatch(/UPDATE public\.oficina_encargos/)
  })
  it('🔴 la reversa se niega si algún encargo ya tiene campaña, y si no, quita el índice y la columna', () => {
    expect(R).toMatch(/IF EXISTS \(SELECT 1 FROM public\.oficina_encargos WHERE campana_id IS NOT NULL\) THEN\s+RAISE EXCEPTION/)
    expect(R).toContain('DROP INDEX IF EXISTS public.oficina_encargos_por_campana;')
    expect(R).toContain('ALTER TABLE public.oficina_encargos DROP COLUMN IF EXISTS campana_id;')
    expect(R.indexOf('RAISE EXCEPTION')).toBeLessThan(R.indexOf('DROP COLUMN'))
  })
})
