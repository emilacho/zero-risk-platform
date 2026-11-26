/**
 * 26-nov · GO Lenovo 11:57Z (diseño de Emilio) · «Archivar» en un clic en CUALQUIER estado y «Eliminar» en dos clics. Base falsa y memoria. US$ 0.
 *  ① archivar una campaña ACTIVA detiene sus encargos en curso sin lanzar turnos (y no toca lo ajeno);
 *  ② el turno que ya había salido vuelve, se anota su costo y NO abre el siguiente;
 *  ③ eliminar sin `dry_run:false` no borra (solo cuenta); con él, una sola llamada a la función de la base;
 *  ④ la función de la base borra TODAS las tablas con llave a la campaña y a sus encargos (si nace otra, esta prueba avisa).
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { abrirEncargo, avanzar, recibirResultado } from '../orquestador'
import { CARRUSEL_IG_V1 } from '../plantillas/carrusel-ig-v1'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { archivarCampana, eliminarCampana, MOTIVO_DEL_TABLERO, TABLAS_DE_LA_CAMPANA, type Db, type DbConFuncion } from '../archivo-de-campana'
import { DbFalsa } from './dbfalsa'
import { CLIENTE, PARTE, crearMemoria } from './memoria'

const K = '8168f32b-47d9-466a-9350-3dff31700a58'
const OTRA = '9168f32b-47d9-466a-9350-3dff31700a59'
const C = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const AHORA = new Date('2026-11-26T12:00:00Z')
const d = (x: DbFalsa) => x as unknown as Db
const filas = (x: DbFalsa, t: string) => x.tablas[t] ?? []
/** lo escrito en la base (la base falsa crea una tabla vacía al leerla: eso no es escribir) */
const foto = (x: DbFalsa) => JSON.stringify(Object.entries(x.tablas).filter(([, v]) => v.length))

const activa = () => new DbFalsa()
  .semilla('cadena_campanas', [{ id: K, client_id: C, estado: 'activa', estado_motivo: null, creada_en: '2026-11-20T00:00:00Z', seco: false }])
  .semilla('cadena_esperas', [{ id: 1, campana_id: K, estado: 'viva' }])
  .semilla('oficina_encargos', [
    { id: 'e-paso', client_id: C, campana_id: K, estado: 'en_paso' },
    { id: 'e-abierto', client_id: C, campana_id: K, estado: 'abierto' },
    { id: 'e-hecho', client_id: C, campana_id: K, estado: 'aprobada' },
    { id: 'e-ajeno', client_id: C, campana_id: OTRA, estado: 'en_paso' },
  ])

describe('① archivar una campaña en marcha', () => {
  it.each(['activa', 'abierta', 'estrategia', 'calendario', 'pausada', 'necesita_humano'])('🔴 una campaña %s se archiva en un clic', async (estado) => {
    const x = new DbFalsa().semilla('cadena_campanas', [{ id: K, client_id: C, estado, creada_en: '2026-11-20T00:00:00Z', seco: false }])
    const r = await archivarCampana(d(x), { campana_id: K, dry_run: false, motivo: MOTIVO_DEL_TABLERO }, AHORA)
    expect(r.status).toBe(200)
    expect(filas(x, 'cadena_campanas')[0]).toMatchObject({ estado: 'reemplazada', estado_antes_de_archivar: estado, archivo_motivo: MOTIVO_DEL_TABLERO, archivada_en: AHORA.toISOString() })
  })

  it('🔴 sin dry_run:false dice qué encargos detendría y no escribe', async () => {
    const x = activa()
    const antes = foto(x)
    const r = await archivarCampana(d(x), { campana_id: K }, AHORA)
    expect(r.body).toMatchObject({ dry_run: true, estado_actual: 'activa', encargos_detenidos: ['e-paso', 'e-abierto'] })
    expect(foto(x)).toBe(antes)
  })

  it('🔴 los encargos EN CURSO quedan cerrados y marcados; lo terminado y lo de otra campaña no se toca', async () => {
    const x = activa()
    await archivarCampana(d(x), { campana_id: K, dry_run: false, motivo: MOTIVO_DEL_TABLERO }, AHORA)
    const e = (id: string) => filas(x, 'oficina_encargos').find((f) => f.id === id)
    for (const id of ['e-paso', 'e-abierto']) expect(e(id)).toMatchObject({ estado: 'cerrado', archivada_en: AHORA.toISOString(), archivo_motivo: `${MOTIVO_DEL_TABLERO} · detenido en curso` })
    expect(e('e-hecho')).toMatchObject({ estado: 'aprobada' })
    expect(e('e-hecho')).not.toHaveProperty('archivada_en')
    expect(e('e-ajeno')).toMatchObject({ estado: 'en_paso' })
    expect(e('e-ajeno')).not.toHaveProperty('archivada_en')
    expect(filas(x, 'cadena_esperas')[0]).toMatchObject({ estado: 'cancelada' })
    expect(filas(x, 'oficina_encargos')).toHaveLength(4)
  })

  it('🔴 si falla la lectura de los encargos en curso, lo dice y no archiva', async () => {
    const x = activa()
    x.fallar.oficina_encargos = 'caída'
    const r = await archivarCampana(d(x), { campana_id: K, dry_run: false }, AHORA)
    expect(r.status).toBe(500)
    expect(filas(x, 'cadena_campanas')[0]).toMatchObject({ estado: 'activa' })
  })
})

describe('② el turno que ya había salido', () => {
  const BRIEF = `### BRF-0100 · Instagram · carrusel\n- QUÉ ES: Carrusel de 5 láminas\n- PROTAGONISTA: El producto.\n- MENSAJE (uno): Pídelo hoy.\n- LÍMITES: 4:5.\n- LLAMADO A LA ACCIÓN: Escríbenos\n- APRUEBA Y PARA CUÁNDO: Antes del 14 de octubre de 2026.\n`
  const parte = `# PARTE DE TRABAJO\nPlan de origen: 29d6daeb-a95a-4328-9c10-cf3cddc236f7 · Manual: versión 1\n\n## Entregables\n\n${BRIEF}`

  it('🔴 vuelve sobre un encargo cerrado por el archivo: anota lo que costó, no registra ni abre otro turno', async () => {
    const M = crearMemoria({ parte, plantilla: CARRUSEL_IG_V1, fuentes: { fotos: [] } })
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_ig_v1' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(a.cuerpo.encargo_id)
    const r0 = await avanzar(M.P, id)
    const n = (r0.cuerpo.turno as { n: number }).n
    // lo que hace el archivo: el encargo pasa a «cerrado» con el turno todavía afuera
    M.encargos.get(id)!.estado = 'cerrado'
    const motor = JSON.stringify(M.encargos.get(id)!.estado_del_motor.vueltas)
    const avanzarEspia = vi.fn()
    const r = await recibirResultado({ ...M.P, avisar: async (...args) => { avanzarEspia(...args); return M.P.avisar(...args) } }, id, n, { texto: 'material', costo_usd: 0.4, workflow_execution_id: 'ex-afuera' })
    expect(r.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', turno_ignorado: n })
    expect(r.cuerpo).not.toHaveProperty('turno')
    expect(M.gastos.filter((g) => g.ref_id === 'ex-afuera')).toEqual([{ concepto: 'modelo', ref_tabla: 'agent_invocations', ref_id: 'ex-afuera', cost_usd: 0.4, base: 'usage' }])
    expect(JSON.stringify(M.encargos.get(id)!.estado_del_motor.vueltas)).toBe(motor)
    expect(M.encargos.get(id)!.estado).toBe('cerrado')
    // y un «siguiente» después tampoco abre nada
    const r2 = await avanzar(M.P, id)
    expect(r2.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(r2.cuerpo).not.toHaveProperty('turno')
  })
})

describe('③ eliminar', () => {
  type Rpc = (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string } | null }>
  const conFuncion = (x: DbFalsa, rpc = vi.fn<Rpc>(async () => ({ data: { ok: true, borradas: { cadena_campanas: 1 } }, error: null }))) => {
    const db = Object.assign(x, { rpc }) as unknown as DbConFuncion
    return { db, rpc }
  }
  const semilla = () => new DbFalsa()
    .semilla('cadena_campanas', [{ id: K, client_id: C, estado: 'pausada', seco: false }])
    .semilla('cadena_calendario_filas', [{ id: 'f1', campana_id: K }, { id: 'f2', campana_id: K }, { id: 'f3', campana_id: OTRA }])
    .semilla('oficina_encargos', [{ id: 'e1', campana_id: K, estado: 'cerrado' }])

  it('🔴 sin dry_run:false NO borra: solo cuenta, y no llama a la función', async () => {
    const x = semilla()
    const { db, rpc } = conFuncion(x)
    const antes = foto(x)
    const r = await eliminarCampana(db, { campana_id: K })
    expect(r.body).toMatchObject({ ok: true, dry_run: true, borraria: { cadena_calendario_filas: 2, oficina_encargos: 1, cadena_esperas: 0 } })
    expect(rpc).not.toHaveBeenCalled()
    expect(foto(x)).toBe(antes)
  })

  it('🔴 con dry_run:false borra con UNA llamada a la función de la base, con el id de la campaña', async () => {
    const { db, rpc } = conFuncion(semilla())
    const r = await eliminarCampana(db, { campana_id: K, dry_run: false })
    expect(rpc).toHaveBeenCalledTimes(1)
    expect(rpc).toHaveBeenCalledWith('cadena_eliminar_campana', { p_campana: K })
    expect(r).toMatchObject({ status: 200, body: { ok: true, dry_run: false, campana_id: K, borradas: { cadena_campanas: 1 } } })
  })

  it('🔴 si la base falla, lo dice (500), no responde ok', async () => {
    const { db } = conFuncion(semilla(), vi.fn<Rpc>(async () => ({ data: null, error: { message: 'violación de llave' } })))
    expect(await eliminarCampana(db, { campana_id: K, dry_run: false })).toMatchObject({ status: 500, body: { error: 'archivo_error' } })
  })

  it('sin campaña, id inválido o la base dice que no existe', async () => {
    const { db, rpc } = conFuncion(new DbFalsa())
    expect((await eliminarCampana(db, { campana_id: K, dry_run: false })).status).toBe(404)
    expect((await eliminarCampana(db, { campana_id: 'x', dry_run: false })).status).toBe(400)
    expect(rpc).not.toHaveBeenCalled()
    const { db: db2 } = conFuncion(semilla(), vi.fn<Rpc>(async () => ({ data: { ok: false, error: 'sin_campana' }, error: null })))
    expect((await eliminarCampana(db2, { campana_id: K, dry_run: false })).status).toBe(404)
  })
})

describe('④ la función de la base borra todo lo que tiene llave a la campaña', () => {
  const DIR = path.resolve(__dirname, '../../../../supabase/migrations')
  const sql = readFileSync(path.join(DIR, '202611261300_cadena_eliminar_campana.sql'), 'utf8')
  const todas = readdirSync(DIR).filter((f) => f.endsWith('.sql') && f !== '202611261300_cadena_eliminar_campana.sql').map((f) => readFileSync(path.join(DIR, f), 'utf8')).join('\n')
  /** las tablas que tienen una llave foránea hacia `destino` (por CREATE TABLE … REFERENCES o ALTER TABLE … ADD … REFERENCES) */
  const conLlaveA = (destino: string) => {
    const out = new Set<string>()
    for (const bloque of todas.split(/;\s*\n/)) {
      if (!new RegExp(`REFERENCES\\s+public\\.${destino}\\b`).test(bloque)) continue
      const t = /(?:CREATE TABLE(?: IF NOT EXISTS)?|ALTER TABLE(?: IF EXISTS)?)\s+public\.([a-z_]+)/.exec(bloque)
      if (t && t[1] !== destino) out.add(t[1])
    }
    return [...out].sort()
  }
  const borra = (t: string) => new RegExp(`DELETE FROM public\\.${t}\\b`).test(sql)
  /** TODAS las llaves foráneas de las migraciones: hija → padre, y si el padre borra en cascada o pone null (entonces el orden no importa) */
  const llaves = () => {
    const out: Array<{ hija: string; padre: string; suave: boolean }> = []
    let tabla: string | null = null
    for (const linea of todas.split('\n')) {
      const t = /(?:CREATE TABLE(?: IF NOT EXISTS)?|ALTER TABLE(?: IF EXISTS)?(?: ONLY)?)\s+public\.([a-z_]+)/.exec(linea)
      if (t) tabla = t[1]
      const r = /REFERENCES\s+public\.([a-z_]+)/.exec(linea)
      if (r && tabla) out.push({ hija: tabla, padre: r[1], suave: /ON DELETE (CASCADE|SET NULL)/.test(linea) })
    }
    return out
  }
  /** 🔴 de CC6 (26-nov 12:23Z): `oficina_turnos` iba antes que artefactos, fichas y gastos, que lo apuntan sin cascada → la transacción entera se caía */
  it('🔴 entre las tablas que se borran, cada hija va ANTES que su padre (salvo cascada o null)', () => {
    const pos = (t: string) => sql.indexOf(`DELETE FROM public.${t} `)
    const entreBorradas = llaves().filter((k) => k.hija !== k.padre && !k.suave && borra(k.hija) && borra(k.padre))
    expect(entreBorradas.map((k) => `${k.hija}→${k.padre}`)).toEqual(expect.arrayContaining(['oficina_artefactos→oficina_turnos', 'oficina_fichas→oficina_turnos', 'oficina_gastos→oficina_turnos']))
    for (const k of entreBorradas) expect(pos(k.hija), `${k.hija} antes que ${k.padre}`).toBeLessThan(pos(k.padre))
  })

  it('🔴 cada tabla con llave a la campaña se borra (y la lista del código es la misma)', () => {
    const hijas = conLlaveA('cadena_campanas')
    expect(hijas).toEqual([...TABLAS_DE_LA_CAMPANA, 'oficina_encargos'].sort())
    for (const t of hijas) expect(borra(t), t).toBe(true)
  })
  it('🔴 cada tabla con llave a los encargos se borra antes que los encargos', () => {
    const hijas = conLlaveA('oficina_encargos')
    expect(hijas.length).toBeGreaterThan(0)
    const pos = (t: string) => sql.indexOf(`DELETE FROM public.${t} `)
    for (const t of hijas) { expect(borra(t), t).toBe(true); expect(pos(t)).toBeLessThan(pos('oficina_encargos')) }
  })
  it('🔴 la campaña se borra al final, en una sola transacción, y solo la llama service_role', () => {
    expect(sql.indexOf('DELETE FROM public.cadena_campanas ')).toBeGreaterThan(sql.indexOf('DELETE FROM public.cadena_pedidos_de_campana '))
    expect(sql).toMatch(/^BEGIN;/m)
    expect(sql).toMatch(/^COMMIT;/m)
    expect(sql).toMatch(/REVOKE ALL ON FUNCTION public\.cadena_eliminar_campana\(uuid\) FROM PUBLIC, anon, authenticated/)
    expect(sql).toMatch(/GRANT EXECUTE ON FUNCTION public\.cadena_eliminar_campana\(uuid\) TO service_role/)
  })
  it('🔴 no toca el plan, las partes, el cerebro ni las llamadas a los agentes', () => {
    for (const t of ['client_historical_outputs', 'agent_invocations', 'cerebro_', 'client_brain', 'storage.']) expect(sql).not.toMatch(new RegExp(`DELETE FROM (public\\.)?${t.replace('.', '\\.')}`))
  })
})
