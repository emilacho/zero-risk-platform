/**
 * F8 · el almacén real de la conversación (con una base falsa que devuelve COPIAS) y la migración + su reversa. US$ 0, sin red.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { almacenDeConversa } from '../src/lib/finanzas/conversa/almacen-supabase'

const RAIZ = path.resolve(__dirname, '..')
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), 'utf8')

/** base falsa mínima: tablas en memoria; select/eq/in/order/limit/maybeSingle/single/insert/update/upsert; devuelve copias */
function baseFalsa(opciones: { choqueAlInsertar?: boolean } = {}) {
  const t: Record<string, any[]> = { finanzas_encargos: [], finanzas_turnos: [], finanzas_artefactos: [] }
  let id = 0
  const log: string[] = []
  const from = (tabla: string) => {
    const q: any = { op: 'select', filtros: [] as Array<(f: any) => boolean>, orden: null as null | [string, boolean], lim: Infinity, fila: null as any, conflicto: null as any }
    const ejecutar = () => {
      const filas = t[tabla]
      const sel = filas.filter((f) => q.filtros.every((fn: any) => fn(f)))
      if (q.op === 'insert') {
        if (opciones.choqueAlInsertar && tabla === 'finanzas_encargos') {
          // simula que otro ganó la carrera: ya hay uno abierto del mismo cliente
          filas.push({ id: `otro-${++id}`, client_id: q.fila.client_id, estado: 'abierto', estado_del_motor: {}, gasto_usd: 0, dry_run: false, semilla: {} })
          log.push('23505')
          return { data: null, error: { message: 'duplicate key', code: '23505' } }
        }
        const nueva = { id: `f-${++id}`, ...structuredClone(q.fila) }
        filas.push(nueva)
        return { data: structuredClone(nueva), error: null }
      }
      if (q.op === 'upsert') {
        const claves = String(q.conflicto).split(',')
        const ya = filas.find((f) => claves.every((k) => f[k] === q.fila[k]))
        if (ya) Object.assign(ya, structuredClone(q.fila))
        else filas.push({ id: `f-${++id}`, ...structuredClone(q.fila) })
        log.push(`upsert:${tabla}`)
        return { data: null, error: null }
      }
      if (q.op === 'update') { sel.forEach((f) => Object.assign(f, structuredClone(q.fila))); return { data: null, error: null } }
      let r = sel.map((f) => structuredClone(f))
      if (q.orden) r = r.sort((a, b) => (a[q.orden[0]] > b[q.orden[0]] ? 1 : -1) * (q.orden[1] ? 1 : -1))
      return { data: r.slice(0, q.lim), error: null }
    }
    const api: any = {
      select: () => api,
      insert: (f: any) => { q.op = 'insert'; q.fila = f; return api },
      update: (f: any) => { q.op = 'update'; q.fila = f; return api },
      upsert: (f: any, o: any) => { q.op = 'upsert'; q.fila = f; q.conflicto = o?.onConflict; return api },
      eq: (k: string, v: unknown) => { q.filtros.push((f: any) => f[k] === v); return api },
      in: (k: string, v: unknown[]) => { q.filtros.push((f: any) => v.includes(f[k])); return api },
      order: (k: string, o: any) => { q.orden = [k, o?.ascending !== false]; return api },
      limit: (n: number) => { q.lim = n; return api },
      maybeSingle: async () => { const r = ejecutar(); return { data: (r.data as any[] | null)?.[0] ?? null, error: r.error } },
      single: async () => { const r = ejecutar(); return { data: Array.isArray(r.data) ? r.data[0] : r.data, error: r.error } },
      then: (res: any, rej: any) => Promise.resolve(ejecutar()).then(res, rej),
    }
    return api
  }
  return { db: { from } as any, t, log }
}

describe('F8 · almacén de la conversación', () => {
  it('abre un encargo, y una segunda vez devuelve el mismo (una abierta por cliente)', async () => {
    const b = baseFalsa()
    const a = almacenDeConversa(b.db)
    const x = await a.crearEncargo({ client_id: 'c1', dry_run: true, semilla: { evento: 'mensaje' } })
    const y = await a.crearEncargo({ client_id: 'c1', dry_run: true, semilla: {} })
    expect(x.ok && y.ok && x.encargo.id === y.encargo.id).toBe(true)
    expect(x.ok && x.nuevo).toBe(true)
    expect(y.ok && y.nuevo).toBe(false)
    expect(b.t.finanzas_encargos).toHaveLength(1)
    expect(b.t.finanzas_encargos[0].estado_del_motor.pasos_ejecutados).toBe(0)
  })
  it('la carrera (23505) devuelve la conversación que ganó, no un error', async () => {
    const b = baseFalsa({ choqueAlInsertar: true })
    const r = await almacenDeConversa(b.db).crearEncargo({ client_id: 'c1', dry_run: false, semilla: {} })
    expect(r.ok && r.nuevo === false).toBe(true)
    expect(b.log).toContain('23505')
  })
  it('guardar un turno es idempotente (misma clave encargo+n) y el artefacto vigente es el de mayor versión', async () => {
    const b = baseFalsa()
    const a = almacenDeConversa(b.db)
    const x = await a.crearEncargo({ client_id: 'c1', dry_run: false, semilla: {} })
    if (!x.ok) throw new Error('no abrió')
    const base = { encargo_id: x.encargo.id, estado_del_motor: x.encargo.estado_del_motor, gasto_usd: 0.1 }
    const turno = { n: 1, paso: 'planteo', agente: 'campaign-brief-agent', ronda: 1, estado: 'hecho' as const, costo_usd: 0.1, salida: { ok: 1 } }
    await a.guardar({ ...base, turno, artefacto: { tipo: 'planteo', version: 1, contenido: { v: 1 }, sha256: 'a' } })
    await a.guardar({ ...base, turno, artefacto: { tipo: 'planteo', version: 1, contenido: { v: 1 }, sha256: 'a' } })
    await a.guardar({ ...base, artefacto: { tipo: 'planteo', version: 2, contenido: { v: 2 }, sha256: 'b' } })
    expect(b.t.finanzas_turnos).toHaveLength(1)
    expect(b.t.finanzas_artefactos).toHaveLength(2)
    expect((await a.artefactos(x.encargo.id)).planteo).toEqual({ v: 2 })
    expect(await a.turnos(x.encargo.id)).toHaveLength(1)
  })
  it('guardar el estado: solo cambia lo que viene definido', async () => {
    const b = baseFalsa()
    const a = almacenDeConversa(b.db)
    const x = await a.crearEncargo({ client_id: 'c1', dry_run: false, semilla: {} })
    if (!x.ok) throw new Error('no abrió')
    await a.guardar({ encargo_id: x.encargo.id, estado_del_motor: x.encargo.estado_del_motor, gasto_usd: 0.3, estado: 'en_curso', slack_ts: '1.2' })
    await a.guardar({ encargo_id: x.encargo.id, estado_del_motor: x.encargo.estado_del_motor, gasto_usd: 0.4 })
    const e = (await a.leerEncargo(x.encargo.id))!
    expect(e.estado).toBe('en_curso')
    expect(e.slack_ts).toBe('1.2')
    expect(e.gasto_usd).toBe(0.4)
    expect(await a.leerEncargo('nada')).toBeNull()
  })
})

describe('F8 · migración y reversa', () => {
  const mig = leer('supabase/migrations/202610141900_finanzas_conversa_apagada.sql')
  const rev = leer('supabase/reversas/202610141900_finanzas_conversa_apagada_REVERSA.sql')
  it('crea SOLO las 3 tablas propias y no altera ninguna otra', () => {
    expect([...mig.matchAll(/CREATE TABLE IF NOT EXISTS public\.(\w+)/g)].map((m) => m[1]).sort()).toEqual(['finanzas_artefactos', 'finanzas_encargos', 'finanzas_turnos'])
    expect(mig).not.toMatch(/ALTER TABLE public\.(?!finanzas_(encargos|turnos|artefactos))/)
    expect(mig).not.toMatch(/\bDROP\b|\bTRUNCATE\b|DELETE FROM/i)
    expect(mig).not.toMatch(/oficina_|jefatura_|\bagents\b/)
  })
  it('uuid sin secuencias, RLS, sin permisos para anon/authenticated, service_role sí', () => {
    expect(mig).toMatch(/gen_random_uuid\(\)/)
    expect(mig).not.toMatch(/SERIAL|SEQUENCE|IDENTITY/i)
    expect(mig).toMatch(/REVOKE ALL ON .*finanzas_encargos.* FROM anon, authenticated/)
    for (const t of ['finanzas_encargos', 'finanzas_turnos', 'finanzas_artefactos']) {
      expect(mig).toMatch(new RegExp(`ALTER TABLE public\\.${t} ENABLE ROW LEVEL SECURITY`))
      expect(mig).toMatch(new RegExp(`GRANT SELECT, INSERT, UPDATE, DELETE ON public\\.${t} TO service_role`))
    }
    expect(mig).toMatch(/NOTIFY pgrst/)
  })
  it('una sola conversación abierta por cliente y un turno por (encargo, n)', () => {
    expect(mig).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS finanzas_encargos_uno_abierto_por_cliente[\s\S]*WHERE estado IN \('abierto', 'en_curso'\)/)
    expect(mig).toMatch(/UNIQUE \(encargo_id, n\)/)
    expect(mig).toMatch(/UNIQUE \(encargo_id, tipo, version\)/)
  })
  it('es repetible: IF NOT EXISTS y política condicional', () => {
    expect(mig).not.toMatch(/CREATE TABLE (?!IF NOT EXISTS)/)
    expect(mig).toMatch(/IF NOT EXISTS \(SELECT 1 FROM pg_policy/)
  })
  it('agnóstica: ningún nombre concreto', () => {
    expect(mig.toLowerCase()).not.toMatch(/naufrago|náufrago|cuenca|guayaquil|manab/)
  })
  it('la reversa se niega a borrar con datos y solo borra las 3 tablas', () => {
    expect(rev).toMatch(/RAISE EXCEPTION/)
    expect(rev).toMatch(/IF n_encargos > 0 THEN/)
    expect(rev).toMatch(/count\(\*\) FROM public\.finanzas_encargos/)
    expect([...rev.matchAll(/DROP TABLE IF EXISTS public\.(\w+)/g)].map((m) => m[1]).sort()).toEqual(['finanzas_artefactos', 'finanzas_encargos', 'finanzas_turnos'])
    // la guarda va ANTES de los DROP
    expect(rev.indexOf('RAISE EXCEPTION')).toBeLessThan(rev.indexOf('DROP TABLE'))
    expect(rev).toMatch(/ROLLBACK/)
  })
})

describe('F8 · la ruta', () => {
  const ruta = leer('src/app/api/finanzas/conversa/route.ts')
  it('usa la llave interna y nunca la de la sala', () => {
    expect(ruta).toMatch(/checkLlaveInterna\(request\)/)
    expect(ruta).not.toMatch(/SALA_DISPATCH_KEY/)
  })
  it('no trae adaptador real de Slack (no publica ni lee en esta rama)', () => {
    expect(ruta).toMatch(/no_configurado/)
    expect(ruta).not.toMatch(/chat\.postMessage|conversations\.replies|leerHilo\(/)
  })
  it('el modelo solo si hay base configurada y la oficina nace con `conversa` apagado', () => {
    expect(ruta).toMatch(/FINANZAS_RUN_SDK_BASE/)
    expect(leer('supabase/migrations/202610141800_finanzas_oficina_apagada.sql')).toMatch(/conversa\s+text\s+NOT NULL DEFAULT 'apagado'/)
  })
})
