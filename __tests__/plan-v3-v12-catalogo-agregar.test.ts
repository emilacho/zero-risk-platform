/**
 * Plan v3 · V12 · `catalogo-agregar` · alta válida / inválida (núcleo puro) y el guion de punta a punta con un PostgREST falso en memoria.
 */
import { describe, expect, it, beforeAll, afterAll } from 'vitest'
import { spawn } from 'node:child_process'
import { createServer, type Server } from 'node:http'
import { mkdtempSync, readFileSync, writeFileSync, readdirSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as nucleo from '../scripts/ops/catalogo-agregar/nucleo.mjs'

// el núcleo es JS puro: se tipa a mano lo que las pruebas usan
type Existe = (tabla: string, columna: string, valor: string) => boolean
const validarAlta = nucleo.validarAlta as unknown as (t: string, f: unknown, e?: Existe) => { ok: boolean; errores: string[]; fila?: Record<string, unknown> }
const filaNueva = nucleo.filaNueva as unknown as (f: Record<string, unknown>, v: number[], o?: { pais?: string | null; ahora?: Date }) => Record<string, unknown> & { version: number }
const OPERADORES = nucleo.OPERADORES as string[]
const TABLAS = nucleo.TABLAS as unknown as Record<string, { tabla: string }>

const tipoOk = { tipo_id: 'resenas_total', unidad: 'conteo', frescura_limite_h: 720, critico: false, n_minimo: 1, via_preferida: 'crudo' }
const fuenteOk = { fuente_id: 'google_maps_propia', proveedor: 'apify', funcion: 'own_google_maps_profile', criticidad: 'critica', plazo_s: 120, tope_usd: 0.15, reintentos: 0 }

describe('validarAlta · válidas', () => {
  it('un tipo, una fuente, una regla con operador del catálogo y un léxico', () => {
    expect(validarAlta('tipos', tipoOk).ok).toBe(true)
    expect(validarAlta('fuentes', fuenteOk).ok).toBe(true)
    expect(validarAlta('reglas', { regla_id: 'tel', clase: 'identidad', operador: 'delegada_en_portero', parametros: { modulo: 'portero-alimenta' }, aplica_a: { fuente: 'google_maps_propia' }, severidad: 'bloquea' }, () => true).ok).toBe(true)
    expect(validarAlta('lexico', { lexico_id: 'ausencia_es', idioma: 'es', grupo: 'ausencia', terminos: ['sin pauta', 'no cuenta con'] }).ok).toBe(true)
    expect(validarAlta('topes', { tope_id: 'recoleccion', tramo: 'recoleccion', usd: 0.5, contador: 'plan' }).ok).toBe(true)
  })
  it('devuelve solo las columnas de negocio', () => {
    const r = validarAlta('tipos', tipoOk)
    expect(r.ok && Object.keys(r.fila ?? {}).sort()).toEqual(Object.keys(tipoOk).sort())
  })
})

describe('validarAlta · inválidas (cada una con su motivo)', () => {
  const malo = (t: string, f: unknown, existe?: Existe) => { const r = validarAlta(t, f, existe); expect(r.ok).toBe(false); return r.errores.join(' | ') }
  it('tabla desconocida, fila que no es objeto', () => {
    expect(malo('nada', {})).toMatch(/desconocida/)
    expect(malo('tipos', [])).toMatch(/objeto/)
  })
  it('falta una obligatoria / columna inexistente / tipo equivocado', () => {
    expect(malo('tipos', { tipo_id: 'x', unidad: 'u' })).toMatch(/falta «frescura_limite_h»[\s\S]*falta «critico»|falta «critico»/)
    expect(malo('tipos', { ...tipoOk, color_favorito: 'azul' })).toMatch(/no existe en plan_catalogo_tipos/)
    expect(malo('fuentes', { ...fuenteOk, tope_usd: '0.15' })).toMatch(/«tope_usd»: número/)
    expect(malo('fuentes', { ...fuenteOk, tope_usd: 99 })).toMatch(/«tope_usd»/)
    expect(malo('fuentes', { ...fuenteOk, criticidad: 'urgente' })).toMatch(/critica \| normal \| baja/)
  })
  it('version / vigente / desde / pais los pone el guion', () => {
    for (const c of ['version', 'vigente', 'desde', 'pais']) expect(malo('tipos', { ...tipoOk, [c]: 1 })).toContain(`«${c}» lo pone el guion`)
  })
  it('un OPERADOR nuevo es código, no fila: se rechaza con la lista cerrada', () => {
    const m = malo('reglas', { regla_id: 'r', clase: 'identidad', operador: 'coincide_fonetico', parametros: {}, aplica_a: { fuente: 'f' }, severidad: 'bloquea' })
    expect(m).toMatch(/«operador»/)
    for (const o of OPERADORES) expect(m).toContain(o)
  })
  it('referencias: la fuente o el tipo nombrado debe existir', () => {
    const regla = { regla_id: 'r', clase: 'contradiccion', operador: 'difiere_mas_de', parametros: { rel: 0.1 }, aplica_a: { tipo: 'no_existe' }, severidad: 'avisa' }
    expect(malo('reglas', regla, () => false)).toMatch(/el tipo «no_existe» no existe/)
    expect(malo('reglas', { ...regla, aplica_a: {} })).toMatch(/debe nombrar una `fuente` o un `tipo`/)
    expect(malo('topes', { tope_id: 't', tramo: 'x', usd: 1, contador: 'c', fuente_id: 'nadie' }, () => false)).toMatch(/la fuente «nadie» no existe/)
    expect(malo('tipos', { ...tipoOk, comparable_con: ['otro'] }, () => false)).toMatch(/«comparable_con»/)
  })
  it('léxico: grupo fuera de la lista y términos vacíos', () => {
    expect(malo('lexico', { lexico_id: 'l', idioma: 'es', grupo: 'otro', terminos: ['a'] })).toMatch(/verificacion/)
    expect(malo('lexico', { lexico_id: 'l', idioma: 'es', grupo: 'ausencia', terminos: [] })).toMatch(/lista de 1 a/)
  })
  it('hay una definición por cada tabla del diseño §4.1', () => {
    expect(Object.values(TABLAS).map((t) => t.tabla).sort()).toEqual(['plan_catalogo_fuentes', 'plan_catalogo_lexico', 'plan_catalogo_reglas', 'plan_catalogo_tipos', 'plan_catalogo_topes'])
  })
})

describe('filaNueva · versión + 1, nunca en sitio', () => {
  it('max + 1, entra no vigente, con pais', () => {
    const f = filaNueva({ tipo_id: 'x' }, [1, 3, 2], { pais: 'EC', ahora: new Date('2026-10-15T12:00:00Z') })
    expect(f).toMatchObject({ tipo_id: 'x', version: 4, vigente: false, pais: 'EC', desde: '2026-10-15T12:00:00.000Z' })
  })
  it('sin previas: versión 1', () => { expect(filaNueva({}, []).version).toBe(1) })
})

/* ───────── el guion de punta a punta contra un PostgREST falso ───────── */
let srv: Server, puerto = 0
let tabla: Array<Record<string, any>> = []
let hayTabla = true
beforeAll(async () => {
  srv = createServer((req, res) => {
    const u = new URL(req.url!, 'http://x')
    const chunks: Buffer[] = []
    req.on('data', (c) => chunks.push(c))
    req.on('end', () => {
      const cuerpo = chunks.length ? JSON.parse(Buffer.concat(chunks).toString()) : null
      res.setHeader('content-type', 'application/json')
      if (!u.pathname.endsWith('/plan_catalogo_tipos')) { res.statusCode = 404; return res.end('{"code":"PGRST205"}') }
      if (!hayTabla) { res.statusCode = 404; return res.end('{"code":"PGRST205"}') }
      const filtro = (f: Record<string, any>) => [...u.searchParams.entries()].every(([k, v]) => {
        if (['select', 'order', 'limit'].includes(k)) return true
        const [op, val] = [v.split('.')[0], v.split('.').slice(1).join('.')]
        const x = String(f[k])
        return op === 'eq' ? x === val : op === 'neq' ? x !== val : true
      })
      if (req.method === 'GET') return res.end(JSON.stringify(tabla.filter(filtro)))
      if (req.method === 'POST') { tabla.push({ ...cuerpo }); return res.end(JSON.stringify([cuerpo])) }
      if (req.method === 'PATCH') { const hit = tabla.filter(filtro); hit.forEach((f) => Object.assign(f, cuerpo)); return res.end(JSON.stringify(hit)) }
      res.statusCode = 405; res.end('{}')
    })
  })
  await new Promise<void>((r) => srv.listen(0, '127.0.0.1', () => r()))
  puerto = (srv.address() as { port: number }).port
})
afterAll(() => { srv.close() })

const GUION = join(process.cwd(), 'scripts/ops/catalogo-agregar.mjs')
/** asíncrono a propósito: el servidor falso vive en ESTE proceso y un spawnSync lo bloquearía */
const correr = (args: string[], conRed = true) => new Promise<{ status: number | null; stdout: string; stderr: string }>((resolver) => {
  const env = { PATH: process.env.PATH ?? '' } as unknown as NodeJS.ProcessEnv
  if (conRed) { env.NEXT_PUBLIC_SUPABASE_URL = `http://127.0.0.1:${puerto}`; env.SUPABASE_SERVICE_ROLE_KEY = 'llave-de-prueba' }
  const h = spawn(process.execPath, [GUION, ...args], { env })
  let stdout = '', stderr = ''
  h.stdout.on('data', (d: Buffer) => { stdout += d }); h.stderr.on('data', (d: Buffer) => { stderr += d })
  h.on('close', (status) => resolver({ status, stdout, stderr }))
})

describe('guion · plan / agregar / revertir', () => {
  const dir = mkdtempSync(join(tmpdir(), 'catalogo-'))
  const arch = join(dir, 'fila.json')
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('plan sin red valida y avisa que no comprobó referencias; inválida ⇒ exit 1 con motivos', async () => {
    writeFileSync(arch, JSON.stringify(tipoOk))
    const ok = await correr(['plan', '--tabla', 'tipos', '--archivo', arch, '--sin-red'], false)
    expect(ok.status).toBe(0)
    expect(ok.stdout).toMatch(/SIN RED/)
    writeFileSync(arch, JSON.stringify({ ...tipoOk, version: 9 }))
    const mal = await correr(['plan', '--tabla', 'tipos', '--archivo', arch, '--sin-red'], false)
    expect(mal.status).toBe(1)
    expect(mal.stderr).toMatch(/ALTA INVÁLIDA[\s\S]*«version» lo pone el guion/)
  })
  it('agregar sin --aplicar no escribe nada', async () => {
    tabla = []
    writeFileSync(arch, JSON.stringify(tipoOk))
    const r = await correr(['agregar', '--tabla', 'tipos', '--archivo', arch])
    expect(r.status).toBe(0)
    expect(r.stdout).toMatch(/se insertará v1/)
    expect(tabla).toHaveLength(0)
  })
  it('agregar --aplicar: respaldo, v1 vigente; una segunda alta crea v2 vigente y deja v1 no vigente SIN editarla en contenido', async () => {
    tabla = []
    const salida = join(dir, 'resp1')
    writeFileSync(arch, JSON.stringify(tipoOk))
    expect((await correr(['agregar', '--tabla', 'tipos', '--archivo', arch, '--salida', salida, '--aplicar'])).status).toBe(0)
    expect(tabla.map((f) => [f.version, f.vigente])).toEqual([[1, true]])
    const v1 = { ...tabla[0] }
    writeFileSync(arch, JSON.stringify({ ...tipoOk, frescura_limite_h: 168 }))
    const salida2 = join(dir, 'resp2')
    expect((await correr(['agregar', '--tabla', 'tipos', '--archivo', arch, '--salida', salida2, '--aplicar'])).status).toBe(0)
    expect(tabla.map((f) => [f.version, f.vigente, f.frescura_limite_h])).toEqual([[1, false, 720], [2, true, 168]])
    expect({ ...tabla[0], vigente: true }).toEqual(v1) // v1 solo cambió `vigente`
    const resp = JSON.parse(readFileSync(join(salida2, readdirSync(salida2).find((n) => n.startsWith('respaldo-'))!), 'utf8'))
    expect(resp).toHaveLength(1)
    expect(resp[0].version).toBe(1)
  })
  it('revertir vuelve a marcar vigente la v1 (con respaldo)', async () => {
    const salida = join(dir, 'resp3')
    const r = await correr(['revertir', '--tabla', 'tipos', '--clave', 'resenas_total', '--version', '1', '--salida', salida, '--aplicar'])
    expect(r.status).toBe(0)
    expect(tabla.map((f) => [f.version, f.vigente])).toEqual([[1, true], [2, false]])
    expect(readdirSync(salida).some((n) => n.startsWith('respaldo-'))).toBe(true)
  })
  it('tabla inexistente (V1 sin aplicar) ⇒ exit 3 y no escribe', async () => {
    hayTabla = false
    writeFileSync(arch, JSON.stringify(tipoOk))
    const r = await correr(['agregar', '--tabla', 'tipos', '--archivo', arch, '--aplicar'])
    expect(r.status).toBe(3)
    expect(r.stderr).toMatch(/V1 sin aplicar/)
    hayTabla = true
  })
  it('sin llaves y sin --sin-red en agregar ⇒ exit 2 (no inventa)', async () => {
    writeFileSync(arch, JSON.stringify(tipoOk))
    expect((await correr(['agregar', '--tabla', 'tipos', '--archivo', arch], false)).status).toBe(2)
  })
})
