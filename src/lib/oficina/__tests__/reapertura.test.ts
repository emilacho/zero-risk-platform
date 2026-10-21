/**
 * Reabrir un encargo `fallido` recuperable como la VERSIÓN SIGUIENTE (21-oct · orden de Lenovo, punto 2): sin tocar la fila vieja, con tope de 3 versiones por brief y un aviso único al agotarlas.
 * Se prueba en los DOS almacenes (el real sobre la base falsa y el de memoria), en la puerta (`abrirEncargo`), en el cierre (`fallar`) y en lo que lee el reintento (#682).
 */
import { describe, it, expect } from 'vitest'
import { almacenDeSupabase } from '../almacen-supabase'
import { abrirEncargo, fallar } from '../orquestador'
import { MAX_VERSIONES_POR_BRIEF, agotaLasVersiones, bloqueaElReintento, decidirReapertura, esFallidoRecuperable } from '../reapertura'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { NuevoEncargo } from '../puertos'
import { estadoInicial } from '../tipos'
import { DbFalsa } from './dbfalsa'
import { CLIENTE, PARTE, crearMemoria } from './memoria'

const nuevo = (brief_id = 'BRF-0001', extra: Partial<NuevoEncargo> = {}): NuevoEncargo => ({ client_id: CLIENTE, parte_id: PARTE, brief_id, tipo_de_grupo: 'carrusel_ig_v1', familia: 'carrusel_ig_v1', tope_usd: 1.5, dry_run: false, prueba: false, sala_ref: null, estado_del_motor: estadoInicial(), ...extra })
const fila = (brief_id: string, o: Record<string, unknown> = {}) => ({ id: `e-${brief_id}-${o.version_encargo ?? 1}`, client_id: CLIENTE, parte_id: PARTE, brief_id, tipo_de_grupo: 'carrusel_ig_v1', familia: 'carrusel_ig_v1', version_encargo: 1, estado: 'fallido', gasto_usd: 0, tope_usd: 1.5, dry_run: false, estado_del_motor: estadoInicial(), ...o })
const rastro = (estado: string, gasto_usd = 0, version_encargo = 1, pasos_ejecutados = 0) => ({ estado, gasto_usd, version_encargo, pasos_ejecutados })

describe('la decisión (pura)', () => {
  it('solo un fallido SIN gasto y del PRIMER paso es recuperable (un freno de gasto corta una llamada de un paso posterior: no se reabre solo)', () => {
    expect(esFallidoRecuperable(rastro('fallido'))).toBe(true)
    expect(esFallidoRecuperable(rastro('fallido', 0.01))).toBe(false)
    expect(esFallidoRecuperable(rastro('fallido', 0, 1, 1))).toBe(false)
    expect(decidirReapertura(rastro('fallido', 0, 1, 2))).toEqual({ accion: 'devolver' })
    for (const e of ['abierto', 'en_paso', 'cerrado', 'cerrado_por_tope']) expect(esFallidoRecuperable(rastro(e))).toBe(false)
  })
  it('reabre con la versión siguiente; en la última permitida, no', () => {
    expect(decidirReapertura(rastro('fallido', 0, 1))).toEqual({ accion: 'reabrir', version: 2 })
    expect(decidirReapertura(rastro('fallido', 0, 2))).toEqual({ accion: 'reabrir', version: 3 })
    expect(decidirReapertura(rastro('fallido', 0, MAX_VERSIONES_POR_BRIEF))).toEqual({ accion: 'devolver' })
  })
  it('lo que gastó, lo cerrado por tope, lo vivo y lo terminado bien se devuelve, no se reabre', () => {
    for (const e of [rastro('fallido', 0.2), rastro('cerrado_por_tope'), rastro('abierto'), rastro('en_paso'), rastro('cerrado')]) expect(decidirReapertura(e)).toEqual({ accion: 'devolver' })
  })
  it('el reintento solo da por «llegado» lo que no se puede reabrir', () => {
    expect(bloqueaElReintento(rastro('fallido'))).toBe(false)
    expect(bloqueaElReintento(rastro('fallido', 0, MAX_VERSIONES_POR_BRIEF))).toBe(true)
    expect(bloqueaElReintento(rastro('fallido', 0.2))).toBe(true)
    for (const e of ['abierto', 'en_paso', 'cerrado', 'cerrado_por_tope']) expect(bloqueaElReintento(rastro(e))).toBe(true)
  })
  it('el aviso único es de la última versión', () => {
    expect(agotaLasVersiones({ version_encargo: 2 })).toBe(false)
    expect(agotaLasVersiones({ version_encargo: 3 })).toBe(true)
  })
})

describe('el almacén REAL (base falsa)', () => {
  const tres = () => new DbFalsa().semilla('oficina_encargos', [fila('BRF-0001'), fila('BRF-0002'), fila('BRF-0004', { tipo_de_grupo: 'kit_historias', familia: 'kit_historias' })])
  it('CASO OBLIGATORIO · los 3 fallidos reales de la tercera prueba se reabren como versión 2 SIN tocar sus filas', async () => {
    const db = tres()
    const antes = JSON.parse(JSON.stringify(db.tablas['oficina_encargos']))
    const A = almacenDeSupabase(db as never)
    for (const [b, t] of [['BRF-0001', 'carrusel_ig_v1'], ['BRF-0002', 'carrusel_ig_v1'], ['BRF-0004', 'kit_historias']]) {
      const r = await A.crearEncargo(nuevo(b, { tipo_de_grupo: t, familia: t }))
      expect(r).toMatchObject({ ok: true, nuevo: true })
      if (r.ok) { expect(r.encargo.version_encargo).toBe(2); expect(r.encargo.estado).toBe('abierto') }
    }
    expect(db.tablas['oficina_encargos']).toHaveLength(6)
    expect(db.tablas['oficina_encargos'].slice(0, 3)).toEqual(antes)
  })
  it('con la versión 2 viva, otra llamada devuelve ESA (no abre una tercera)', async () => {
    const db = tres()
    const A = almacenDeSupabase(db as never)
    const a = await A.crearEncargo(nuevo('BRF-0001'))
    const b = await A.crearEncargo(nuevo('BRF-0001'))
    expect(a.ok && b.ok && a.encargo.id === b.encargo.id && b.nuevo === false && b.encargo.version_encargo === 2).toBe(true)
    expect(db.tablas['oficina_encargos']).toHaveLength(4)
  })
  it('tope de 3: v1 fallida → v2 → v3; la v3 fallida ya no se reabre y no se crea otra fila', async () => {
    const db = new DbFalsa().semilla('oficina_encargos', [fila('BRF-0001')])
    const A = almacenDeSupabase(db as never)
    const v2 = await A.crearEncargo(nuevo())
    expect(v2.ok && v2.nuevo && v2.encargo.version_encargo === 2).toBe(true)
    db.tablas['oficina_encargos'].find((f) => f.version_encargo === 2)!.estado = 'fallido'
    const v3 = await A.crearEncargo(nuevo())
    expect(v3.ok && v3.nuevo && v3.encargo.version_encargo === 3).toBe(true)
    db.tablas['oficina_encargos'].find((f) => f.version_encargo === 3)!.estado = 'fallido'
    const v4 = await A.crearEncargo(nuevo())
    expect(v4.ok && !v4.nuevo && v4.encargo.version_encargo === 3).toBe(true)
    expect(db.tablas['oficina_encargos']).toHaveLength(3)
  })
  it('un fallido que GASTÓ, uno de un paso POSTERIOR (como un freno de gasto, gasto 0), uno cerrado por tope y uno cerrado bien no se reabren solos', async () => {
    const db = new DbFalsa().semilla('oficina_encargos', [fila('BRF-0001', { gasto_usd: 0.4 }), fila('BRF-0002', { estado: 'cerrado_por_tope' }), fila('BRF-0003', { estado: 'cerrado' }), fila('BRF-0005', { estado_del_motor: { ...estadoInicial(), pasos_ejecutados: 2 } })])
    const A = almacenDeSupabase(db as never)
    for (const b of ['BRF-0001', 'BRF-0002', 'BRF-0003', 'BRF-0005']) {
      const r = await A.crearEncargo(nuevo(b))
      expect(r.ok && !r.nuevo && r.encargo.version_encargo === 1).toBe(true)
    }
    expect(db.tablas['oficina_encargos']).toHaveLength(4)
  })
  it('dos sobres a la vez: el segundo pierde la carrera por el índice único y devuelve la v2 que ganó, sin abrir otra', async () => {
    const real = new DbFalsa().semilla('oficina_encargos', [fila('BRF-0001'), fila('BRF-0001', { version_encargo: 2, estado: 'abierto', id: 'ganadora' })])
    let primera = true
    const db = { from: (t: string) => { const c = real.from(t); return { select: (cols?: string) => { if (primera && t === 'oficina_encargos') { primera = false; const l = real.tablas['oficina_encargos'].filter((f) => f.version_encargo === 1); return { eq() { return this }, order() { return this }, limit() { return Promise.resolve({ data: l, error: null }) } } } return c.select(cols) }, insert: (f: Record<string, unknown>) => c.insert(f) } } }
    const r = await almacenDeSupabase(db as never).crearEncargo(nuevo())
    expect(r.ok && !r.nuevo && r.encargo.id === 'ganadora' && r.encargo.version_encargo === 2).toBe(true)
    expect(real.tablas['oficina_encargos']).toHaveLength(2)
  })
  it('sin encargos previos nace la versión 1; un error de la base al mirar los previos se devuelve (no se abre a ciegas)', async () => {
    const A = almacenDeSupabase(new DbFalsa().semilla('oficina_encargos', []) as never)
    const r = await A.crearEncargo(nuevo())
    expect(r.ok && r.nuevo && r.encargo.version_encargo === 1).toBe(true)
    const caida = new DbFalsa()
    caida.fallar['oficina_encargos'] = 'caída'
    expect(await almacenDeSupabase(caida as never).crearEncargo(nuevo())).toMatchObject({ ok: false })
  })
  it('si SOLO falla la lectura de los previos, no se abre a ciegas (ni una fila nueva)', async () => {
    const real = new DbFalsa().semilla('oficina_encargos', [fila('BRF-0001')])
    const cadena = (): unknown => new Proxy(() => undefined, { get: (_t, k) => (k === 'then' ? (ok: (v: unknown) => void) => ok({ data: null, error: { message: 'lectura caída' } }) : cadena), apply: () => cadena() })
    const db = { from: (t: string) => { const c = real.from(t); return { select: () => cadena(), insert: (f: Record<string, unknown>) => c.insert(f) } } }
    const r = await almacenDeSupabase(db as never).crearEncargo(nuevo())
    expect(r).toMatchObject({ ok: false, error: 'lectura caída' })
    expect(real.tablas['oficina_encargos']).toHaveLength(1)
  })
  it('otro tipo de grupo no se mezcla', async () => {
    const db = new DbFalsa().semilla('oficina_encargos', [fila('BRF-0001', { gasto_usd: 0.4 })])
    const A = almacenDeSupabase(db as never)
    const r = await A.crearEncargo(nuevo('BRF-0001', { tipo_de_grupo: 'post_img', familia: 'post_img' }))
    expect(r.ok && r.nuevo && r.encargo.version_encargo === 1).toBe(true)
  })
})

describe('la puerta y el cierre (almacén de memoria)', () => {
  const sobre = { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: 'post_img' }
  const abrir = (M: ReturnType<typeof crearMemoria>) => abrirEncargo(M.P, { cuerpo: sobre, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  it('abrirEncargo: un fallido sin gasto se reabre como v2 y la vieja queda intacta; uno que gastó devuelve «ya_existia»', async () => {
    const M = crearMemoria()
    const a = await abrir(M)
    const id1 = String(a.cuerpo.encargo_id)
    const viejo = M.encargos.get(id1)!
    viejo.estado = 'fallido'; viejo.gasto_usd = 0; viejo.estado_del_motor = estadoInicial() // murió en el pre-vuelo del primer paso
    const copia = JSON.parse(JSON.stringify(viejo))
    const b = await abrir(M)
    const id2 = String(b.cuerpo.encargo_id)
    expect(id2).not.toBe(id1)
    expect(M.encargos.get(id2)!.version_encargo).toBe(2)
    expect(b.cuerpo.accion).not.toBe('ya_existia')
    expect(M.encargos.get(id1)).toEqual(copia)
    const M2 = crearMemoria()
    const x = await abrir(M2)
    const e = M2.encargos.get(String(x.cuerpo.encargo_id))!
    e.estado = 'fallido'; e.gasto_usd = 0.3
    const y = await abrir(M2)
    expect(y.cuerpo.accion).toBe('ya_existia')
    expect(M2.encargos.size).toBe(1)
  })
  it('fallar: el aviso del hilo sale SOLO cuando el encargo es la última versión permitida', async () => {
    const M = crearMemoria()
    const a = await abrir(M)
    const enc = M.encargos.get(String(a.cuerpo.encargo_id))!
    const hilos = () => M.llamadas.avisos.filter((x) => x.canal === 'hilo').length
    await fallar(M.P, { ...enc, version_encargo: MAX_VERSIONES_POR_BRIEF - 1 }, 'x')
    expect(hilos()).toBe(0)
    await fallar(M.P, { ...enc, version_encargo: MAX_VERSIONES_POR_BRIEF }, 'x')
    expect(hilos()).toBe(1)
    expect(M.llamadas.avisos.find((x) => x.canal === 'hilo')!.texto).toContain(enc.brief_id)
  })
})
