/**
 * LA HERRAMIENTA DE LÍNEA DE ÓRDENES DEL SECO (`scripts/ops/jefatura-seco.mjs`), probada contra un servidor FALSO (base + n8n) en tu máquina: sin red, US$ 0.
 * Comprueba lo que J5 hará de verdad: sin `--aplicar` no cambia nada; `encender` guarda la foto previa, deja `ensayo` con los 3 clientes y SOLO el flujo turno activo y lee de vuelta; `apagar` restaura y lee de vuelta;
 * los contadores comparan antes/después y marcan lo que cambió; con ejecuciones en vuelo no se enciende; la llave nunca se imprime.
 */
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import type { AddressInfo } from 'node:net'
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { construirTurno, construirVigia } from '../scripts/worker-staging/jefatura/construir-jefatura.mjs'
import { CLIENTES } from '../scripts/ops/jefatura-seco/fixtures.mjs'

const SCRIPT = path.resolve(__dirname, '..', 'scripts', 'ops', 'jefatura-seco.mjs')
const LLAVE_SECRETA = 'llave-de-despacho-que-no-debe-salir-impresa'
const estado = {
  config: { id: 1, estado: 'apagada', tipos_activos: [] as string[], clientes_ensayo: [] as string[] },
  flujos: [] as Array<{ id: string; name: string; active: boolean }>,
  enVuelo: 0,
  noSeApaga: [] as string[],
  cuentas: {} as Record<string, number>,
  peticiones: [] as string[],
  consultas: [] as string[],
  filas: { jefatura_revisiones: [] as Array<Record<string, unknown>>, jefatura_pasos: [] as Array<Record<string, unknown>>, jefatura_fichas: [] as Array<Record<string, unknown>> },
  borrados: [] as string[],
}
let server: http.Server, base = '', carpeta = ''

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', 'http://x')
    let cuerpo = ''
    req.on('data', (d) => (cuerpo += d))
    req.on('end', () => {
      estado.peticiones.push(`${req.method} ${url.pathname}`); estado.consultas.push(decodeURIComponent(url.search))
      const json = (o: unknown, h: Record<string, string> = {}) => { res.writeHead(200, { 'content-type': 'application/json', ...h }); res.end(JSON.stringify(o)) }
      if (url.pathname === '/api/v1/workflows' && req.method === 'GET') return json({ data: estado.flujos })
      const m = /^\/api\/v1\/workflows\/([^/]+)\/(activate|deactivate)$/.exec(url.pathname)
      if (m && req.method === 'POST') { const f = estado.flujos.find((x) => x.id === m[1]); if (f && !(m[2] === 'deactivate' && estado.noSeApaga.includes(f.id))) f.active = m[2] === 'activate'; return json({ ok: true }) }
      if (url.pathname === '/api/v1/executions') return json({ data: url.searchParams.get('status') === 'running' ? Array.from({ length: estado.enVuelo }, (_, i) => ({ id: i })) : [] })
      if (url.pathname === '/rest/v1/jefatura_config') {
        if (req.method === 'PATCH') { Object.assign(estado.config, JSON.parse(cuerpo)); return json([estado.config]) }
        return json([estado.config])
      }
      if (url.pathname.startsWith('/rest/v1/')) {
        const tabla = url.pathname.slice('/rest/v1/'.length)
        if (req.method === 'DELETE') { estado.borrados.push(`${tabla}?${decodeURIComponent(url.search.slice(1))}`); if (tabla in estado.filas) (estado.filas as Record<string, unknown[]>)[tabla] = []; res.writeHead(204); return res.end() }
        if (tabla in estado.filas) { const f = (estado.filas as Record<string, unknown[]>)[tabla]; return req.headers.prefer === 'count=exact' ? json([], { 'content-range': `0-0/${f.length}` }) : json(f) }
        if (tabla === 'clients') return json([{ id: 'nau-1' }])
        if (tabla === 'client_historical_outputs' && !req.headers.prefer) return json([{ content_text: 'x'.repeat(100) }, { content_text: 'y'.repeat(300) }, { content_text: 'z'.repeat(200) }])
        if (tabla === 'cadena_campanas') return json([{ id: 'c1' }])
        if (tabla === 'cadena_estrategias') return json([{ texto_md: 'e'.repeat(50) }, { contenido: { a: 1 } }])
        if (req.headers.prefer === 'count=exact') return json([], { 'content-range': `0-0/${estado.cuentas[tabla + (/type=eq.editor_escalation/.test(req.url ?? '') ? '_editor_escalation' : '')] ?? 0}` })
        return json([])
      }
      res.writeHead(404); res.end('{}')
    })
  })
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r))
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
  carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'jefatura-seco-cli-'))
})
afterAll(() => { server.close(); fs.rmSync(carpeta, { recursive: true, force: true }) })
beforeEach(() => {
  Object.assign(estado.config, { estado: 'apagada', tipos_activos: [], clientes_ensayo: [] })
  estado.flujos = [{ id: 'wf-turno', name: construirTurno().name, active: false }, { id: 'wf-vigia', name: construirVigia().name, active: false }]
  estado.enVuelo = 0; estado.noSeApaga = []; estado.cuentas = { agent_invocations: 100, hitl_queue: 7, hitl_queue_editor_escalation: 0, client_historical_outputs: 12, jefatura_revisiones: 0 }; estado.peticiones = []; estado.consultas = []; estado.borrados = []
  estado.filas = { jefatura_revisiones: [{ id: 'rev-1', client_id: 'prueba-jefatura-seco-restaurante' }, { id: 'rev-2', client_id: 'prueba-jefatura-seco-retail' }], jefatura_pasos: [{ id: 1, revision_id: 'rev-1' }], jefatura_fichas: [{ id: 1, revision_id: 'rev-1' }] }
  fs.rmSync(path.join(carpeta, 'previo'), { recursive: true, force: true })
})

function cli(args: string[], extra: Record<string, string> = {}): Promise<{ code: number; out: string }> {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, [SCRIPT, ...args], {
      env: { PATH: process.env.PATH ?? '', NEXT_PUBLIC_SUPABASE_URL: base, SUPABASE_SERVICE_ROLE_KEY: 'sk-falsa', N8N_API_KEY: 'nk-falsa', N8N_BASE_URL: base, INTERNAL_API_KEY: LLAVE_SECRETA, ...extra } as unknown as NodeJS.ProcessEnv,
    })
    let out = ''
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (out += d))
    p.on('close', (code) => resolve({ code: code ?? -1, out }))
  })
}
const previo = () => path.join(carpeta, 'previo')

describe('encender / apagar', () => {
  it('SIN --aplicar no escribe nada: ni la configuración ni los flujos', async () => {
    const r = await cli(['encender', '--salida', previo()])
    expect(r.code).toBe(0)
    expect(r.out).toMatch(/solo se imprime/)
    expect(estado.config.estado).toBe('apagada')
    expect(estado.flujos.every((f) => !f.active)).toBe(true)
    expect(estado.peticiones.some((p) => /^(PATCH|POST) /.test(p))).toBe(false)
  })
  it('--aplicar: foto previa, `ensayo` con los 3 clientes de práctica, SOLO el turno activo, leído de vuelta', async () => {
    const r = await cli(['encender', '--aplicar', '--salida', previo()])
    expect(r.code, r.out).toBe(0)
    expect(estado.config.estado).toBe('ensayo')
    expect(estado.config.clientes_ensayo).toEqual(CLIENTES.map((c: { id: string }) => c.id))
    expect(estado.config.tipos_activos).toHaveLength(5)
    expect(estado.flujos.find((f) => f.id === 'wf-turno')?.active).toBe(true)
    expect(estado.flujos.find((f) => f.id === 'wf-vigia')?.active).toBe(false)
    expect(JSON.parse(fs.readFileSync(path.join(previo(), 'estado-previo.json'), 'utf8')).config.estado).toBe('apagada')
  })
  it('--con-vigia activa también el vigía (prueba de reloj) y apagar lo deja todo como estaba', async () => {
    expect((await cli(['encender', '--aplicar', '--con-vigia', '--salida', previo()])).code).toBe(0)
    expect(estado.flujos.every((f) => f.active)).toBe(true)
    const r = await cli(['apagar', '--aplicar', '--salida', previo()])
    expect(r.code, r.out).toBe(0)
    expect(r.out).toMatch(/todo apagado y leído de vuelta/)
    expect(estado.flujos.every((f) => !f.active)).toBe(true)
    expect(estado.config).toMatchObject({ estado: 'apagada', tipos_activos: [], clientes_ensayo: [] })
  })
  it('con ejecuciones de n8n en vuelo NO enciende nada', async () => {
    estado.enVuelo = 2
    const r = await cli(['encender', '--aplicar', '--salida', previo()])
    expect(r.code).toBe(1)
    expect(estado.config.estado).toBe('apagada')
    expect(estado.flujos.every((f) => !f.active)).toBe(true)
  })
  it('si algo ya está encendido de partida, se niega (no pisa el estado de otro)', async () => {
    estado.flujos[0].active = true
    expect((await cli(['encender', '--aplicar', '--salida', previo()])).code).toBe(1)
    estado.flujos[0].active = false; estado.config.estado = 'ensayo'
    expect((await cli(['encender', '--aplicar', '--salida', previo()])).code).toBe(1)
  })
  it('un flujo que no existe (o está repetido) detiene la orden con el motivo', async () => {
    estado.flujos = estado.flujos.slice(0, 1)
    const r = await cli(['encender', '--aplicar', '--salida', previo()])
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/se esperaba UN flujo/)
  })
  it('apagar detecta una lectura de vuelta que no coincide (el vigía sigue activo)', async () => {
    await cli(['encender', '--aplicar', '--con-vigia', '--salida', previo()])
    estado.noSeApaga = ['wf-vigia'] // el servidor "olvida" desactivar el vigía
    const r = await cli(['apagar', '--aplicar', '--salida', previo()])
    expect(r.code).toBe(1)
    expect(r.out).toMatch(/la lectura de vuelta NO coincide/)
  })
})

describe('contadores antes / después', () => {
  it('sin cambios: todo igual y código 0; cambian solo las filas de la jefatura', async () => {
    const f = path.join(carpeta, 'antes.json')
    expect((await cli(['contadores', '--guardar', f])).code).toBe(0)
    for (let i = 0; i < 268; i++) estado.filas.jefatura_revisiones.push({ id: `x${i}`, client_id: "c" })
    const r = await cli(['contadores', '--comparar', f])
    expect(r.code, r.out).toBe(0)
    expect(r.out).toMatch(/todo lo que debía seguir igual sigue igual/)
    expect(r.out).toMatch(/jefatura_revisiones\s+2 → 270/)
  })
  it('un seco que gasta o escribe de más se marca en rojo y devuelve 1', async () => {
    const f = path.join(carpeta, 'antes2.json')
    await cli(['contadores', '--guardar', f])
    for (const [tabla, valor] of [['agent_invocations', 101], ['hitl_queue', 8], ['client_historical_outputs', 13]] as const) {
      const guardado = estado.cuentas[tabla]
      estado.cuentas[tabla] = valor
      const r = await cli(['contadores', '--comparar', f])
      expect(r.code, tabla).toBe(1)
      expect(r.out).toMatch(/🔴/)
      estado.cuentas[tabla] = guardado
    }
    estado.cuentas.hitl_queue_editor_escalation = 1 // una fila `editor_escalation` nueva: el editor viejo resucitó
    expect((await cli(['contadores', '--comparar', f])).code).toBe(1)
  })
})

describe('tamaños reales (solo lectura)', () => {
  it('excluye a naufrago.ec ANTES de leer nada suyo y guarda las medianas', async () => {
    const r = await cli(['tamanos-reales', '--salida', previo()])
    expect(r.code, r.out).toBe(0)
    // toda lectura de artefactos lleva el filtro que deja fuera al cliente excluido
    const lecturas = estado.consultas.filter((q) => /output_type=eq\./.test(q))
    expect(lecturas.length).toBeGreaterThanOrEqual(2)
    expect(lecturas.every((q) => q.includes('client_id=not.in.(nau-1)')), JSON.stringify(lecturas)).toBe(true)
    expect(estado.peticiones.every((p) => p.startsWith('GET '))).toBe(true) // solo lectura
    const g = JSON.parse(fs.readFileSync(path.join(previo(), 'tamanos-reales.json'), 'utf8'))
    expect(g.plan).toBe(200) // mediana de 100, 200, 300
    expect(g.briefs).toBe(200)
  })
  it('usarTamanos cambia el tamaño de los clientes de práctica (y lo demás no)', async () => {
    const { usarTamanos, TAMANOS, planDe, manualEn, CLIENTES: CS } = await import('../scripts/ops/jefatura-seco/fixtures.mjs')
    const antes = { ...TAMANOS }
    try {
      usarTamanos({ plan: 40000, manual: 9000, otra_cosa: 5 })
      expect(planDe(CS[0]).length).toBeGreaterThanOrEqual(40000); expect(planDe(CS[0]).length).toBeLessThan(41500)
      expect(manualEn(CS[0]).length).toBeGreaterThanOrEqual(9000); expect(manualEn(CS[0]).length).toBeLessThan(10500)
      expect('otra_cosa' in TAMANOS).toBe(false)
    } finally { usarTamanos(antes) }
  })
})

describe('limpiar (al final, con respaldo)', () => {
  it('SIN --aplicar solo cuenta: no borra ni escribe nada', async () => {
    const r = await cli(['limpiar', '--salida', previo()])
    expect(r.code, r.out).toBe(0)
    expect(r.out).toMatch(/1 fichas, 1 pasos y 2 revisiones/)
    expect(estado.borrados).toEqual([])
    expect(fs.existsSync(path.join(previo(), 'jefatura-filas-del-seco.json'))).toBe(false)
  })
  it('--aplicar: respalda con huella, borra fichas → pasos → revisiones SIEMPRE con filtro de los clientes de práctica y lee de vuelta', async () => {
    const r = await cli(['limpiar', '--aplicar', '--salida', previo()])
    expect(r.code, r.out).toBe(0)
    expect(r.out).toMatch(/sha256/)
    const resp = JSON.parse(fs.readFileSync(path.join(previo(), 'jefatura-filas-del-seco.json'), 'utf8'))
    expect(resp.revisiones).toHaveLength(2); expect(resp.pasos).toHaveLength(1); expect(resp.fichas).toHaveLength(1)
    expect(estado.borrados.map((b) => b.split('?')[0])).toEqual(['jefatura_fichas', 'jefatura_pasos', 'jefatura_revisiones'])
    for (const b of estado.borrados) expect(b, 'un borrado sin filtro sería catastrófico').toMatch(/\?(revision_id|client_id)=in\.\(/)
    expect(estado.borrados[2]).toContain('prueba-jefatura-seco-restaurante')
    expect(r.out).toMatch(/que quedan de los clientes de práctica = 0/)
  })
})

describe('seguridad de la herramienta', () => {
  it('el kit entra con la llave INTERNA: no lee ni pide SALA_DISPATCH_KEY, y despierta al flujo por la ruta (acción despertar), no por el webhook', () => {
    const fuente = ['scripts/ops/jefatura-seco.mjs', 'scripts/ops/jefatura-seco/nucleo.mjs', 'scripts/ops/jefatura-seco/matriz.mjs'].map((f) => fs.readFileSync(path.resolve(f), 'utf8').replace(/^\s*\*.*$/gm, '')).join('\n')
    expect(fuente).not.toMatch(/process\.env\.SALA_DISPATCH_KEY|necesita\([^)]*SALA_DISPATCH_KEY/)
    expect(fuente).not.toMatch(/headers:[^}]*x-sala-dispatch-key/)
    expect(fuente).toMatch(/accion: 'despertar'/)
    expect(fuente).not.toMatch(/fetch\(`\$\{HOOKS\}\/zero-risk\/jefatura-turno`/)
  })
  it('la llave de despacho NUNCA aparece en lo que imprime, en ninguna orden', async () => {
    for (const args of [['plan'], ['estado'], ['encender', '--aplicar', '--salida', previo()], ['apagar', '--aplicar', '--salida', previo()], ['contadores']]) {
      const r = await cli(args)
      expect(r.out, args.join(' ')).not.toContain(LLAVE_SECRETA)
      expect(r.out, args.join(' ')).not.toContain('sk-falsa')
      expect(r.out, args.join(' ')).not.toContain('nk-falsa')
    }
  })
  it('`plan` no necesita red ni variables; `correr` sin --aplicar solo lista las celdas', async () => {
    const p = await cli(['plan'], { NEXT_PUBLIC_SUPABASE_URL: '', SUPABASE_SERVICE_ROLE_KEY: '', N8N_API_KEY: '' })
    expect(p.code).toBe(0)
    expect(p.out).toMatch(/MATRIZ DEL SECO/)
    const c = await cli(['correr', '--tipo', 'brief', '--cliente', 'mateando', '--registro', 'voseo'])
    expect(c.code).toBe(0)
    expect(c.out).toMatch(/4 celdas/)
    expect(estado.peticiones).toEqual([])
  })
  it('una orden desconocida sale con código 2 y no toca nada', async () => {
    const r = await cli(['borrar-todo'])
    expect(r.code).toBe(2)
    expect(estado.peticiones).toEqual([])
  })
})
