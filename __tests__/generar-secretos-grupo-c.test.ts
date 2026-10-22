/**
 * El guion que genera las llaves propias (grupo C) y las escribe en Doppler: lo importante es lo que NO hace.
 * Nunca imprime un valor, nunca lo pone en la línea de comandos, no pisa lo que ya existe, y cada entorno recibe valores distintos.
 * Doppler se simula con un `run` falso que anota cada llamada (argumentos y entrada estándar).
 */
import { describe, expect, it } from 'vitest'
import { SECRETOS_GRUPO_C, ejecutar, generarValor, planear } from '../scripts/ops/generar-secretos-grupo-c.mjs'

type Llamada = { args: string[]; input?: string }
function dopplerFalso(existentes: string[], o: { fallaEn?: string; largoMal?: string; sinCli?: boolean } = {}) {
  const llamadas: Llamada[] = []
  const guardado: Record<string, string> = {}
  const run = (_cmd: string, args: string[], opts: { input?: string }) => {
    llamadas.push({ args, input: opts.input })
    if (args[0] === '--version') return o.sinCli ? { status: 1, stdout: '', stderr: '' } : { status: 0, stdout: 'v3.0.0\n', stderr: '' }
    if (args[0] === 'secrets' && args[1] === '--only-names') return { status: 0, stdout: JSON.stringify(Object.fromEntries(existentes.map((n) => [n, {}]))), stderr: '' }
    if (args[0] === 'secrets' && args[1] === 'set') {
      if (args[2] === o.fallaEn) return { status: 1, stdout: '', stderr: 'permiso denegado' }
      guardado[args[2]] = opts.input ?? ''
      return { status: 0, stdout: '', stderr: '' }
    }
    if (args[0] === 'secrets' && args[1] === 'get') return { status: 0, stdout: (args[2] === o.largoMal ? 'x' : guardado[args[2]] ?? '') + '\n', stderr: '' }
    return { status: 1, stdout: '', stderr: 'comando desconocido' }
  }
  return { run, llamadas, guardado }
}

describe('generarValor', () => {
  it('largo esperado, solo caracteres seguros, y distinto cada vez', () => {
    const a = generarValor(32), b = generarValor(32)
    expect(a).toHaveLength(43); expect(a).toMatch(/^[A-Za-z0-9_-]+$/); expect(a).not.toBe(b)
    expect(generarValor(48)).toHaveLength(64)
  })
  it('usa la fuente criptográfica que se le da (no Math.random)', () => {
    let llamado = 0
    generarValor(8, (n: number) => { llamado = n; return Buffer.alloc(n, 7) })
    expect(llamado).toBe(8)
  })
})

describe('planear', () => {
  it('crea las que faltan y conserva las que existen; --rotar fuerza solo esas', () => {
    const p = planear(['INTERNAL_API_KEY', 'CRON_SECRET'], ['CRON_SECRET'])
    const por = Object.fromEntries(p.acciones.map((a: { nombre: string; accion: string }) => [a.nombre, a.accion]))
    expect(por.INTERNAL_API_KEY).toBe('conservar'); expect(por.CRON_SECRET).toBe('rotar'); expect(por.MC_API_TOKEN).toBe('crear')
    expect(p.acciones).toHaveLength(SECRETOS_GRUPO_C.length)
  })
  it('rotar una variable que no es del grupo C se rechaza', () => {
    expect(planear([], ['SUPABASE_SERVICE_ROLE_KEY']).desconocidas).toEqual(['SUPABASE_SERVICE_ROLE_KEY'])
  })
  it('el grupo C trae todas las que pidió la ruta (y ninguna repetida)', () => {
    const nombres = SECRETOS_GRUPO_C.map((s: { nombre: string }) => s.nombre)
    for (const n of ['INTERNAL_API_KEY', 'SALA_DISPATCH_KEY', 'SALA_CALLBACK_API_KEY', 'SALA_INGRESS_API_KEY', 'DEAL_WON_WEBHOOK_KEY', 'MC_API_TOKEN', 'MC_MASTER_PASSWORD', 'ADMIN_SECRET', 'N8N_WEBHOOK_SECRET', 'PIPELINE_CALLBACK_SECRET', 'CRON_SECRET', 'CALCOM_WEBHOOK_SECRET', 'TALLY_SIGNING_SECRET', 'PORTERO_WEBHOOK_KEY']) expect(nombres).toContain(n)
    expect(new Set(nombres).size).toBe(nombres.length)
  })
})

describe('ejecutar · lo que NO se filtra', () => {
  it('escribe cada valor por la ENTRADA ESTÁNDAR, con --silent, y NUNCA en los argumentos', () => {
    const d = dopplerFalso([]); const salida: string[] = []
    const r = ejecutar({ proyecto: 'zero-risk', config: 'prd', run: d.run as never, log: (s: string) => salida.push(s) })
    expect(r.ok).toBe(true); expect(r.escritos).toHaveLength(SECRETOS_GRUPO_C.length)
    const sets = d.llamadas.filter((l) => l.args[1] === 'set')
    expect(sets).toHaveLength(SECRETOS_GRUPO_C.length)
    for (const s of sets) {
      expect(s.args).toContain('--silent'); expect(s.args).toEqual(expect.arrayContaining(['-p', 'zero-risk', '-c', 'prd']))
      expect(s.input).toBeTruthy()
      expect(s.args.join(' ')).not.toContain(s.input!)          // el valor no va en la línea de comandos
      expect(s.args.some((a) => a.includes('='))).toBe(false)    // ni como NOMBRE=valor
    }
  })
  it('ningún valor aparece en lo que el guion imprime', () => {
    const d = dopplerFalso([]); const salida: string[] = []
    ejecutar({ proyecto: 'zero-risk', config: 'prd', run: d.run as never, log: (s: string) => salida.push(s) })
    const todo = salida.join('\n')
    for (const v of Object.values(d.guardado)) expect(todo).not.toContain(v)
    expect(todo).toMatch(/INTERNAL_API_KEY: creada en zero-risk\/prd \(64 caracteres\)/)
  })
  it('la lectura de comprobación es --plain y su texto no se imprime ni se conserva', () => {
    const d = dopplerFalso([]); const salida: string[] = []
    ejecutar({ proyecto: 'zero-risk', config: 'prd', run: d.run as never, log: (s: string) => salida.push(s) })
    expect(d.llamadas.filter((l) => l.args[1] === 'get').every((l) => l.args.includes('--plain'))).toBe(true)
    for (const v of Object.values(d.guardado)) expect(salida.join('')).not.toContain(v)
  })
  it('dev y prd reciben valores DISTINTOS', () => {
    const a = dopplerFalso([]), b = dopplerFalso([])
    ejecutar({ proyecto: 'zero-risk', config: 'dev', run: a.run as never, log: () => {} }); ejecutar({ proyecto: 'zero-risk', config: 'prd', run: b.run as never, log: () => {} })
    expect(a.guardado.INTERNAL_API_KEY).not.toBe(b.guardado.INTERNAL_API_KEY)
    expect(Object.keys(a.guardado)).toEqual(Object.keys(b.guardado))
  })
})

describe('ejecutar · no rompe lo que ya existe', () => {
  it('conserva las existentes (no las toca) y solo escribe las que faltan', () => {
    const d = dopplerFalso(['INTERNAL_API_KEY', 'CRON_SECRET'])
    const r = ejecutar({ proyecto: 'zero-risk', config: 'prd', run: d.run as never, log: () => {} })
    expect(Object.keys(d.guardado)).not.toContain('INTERNAL_API_KEY'); expect(Object.keys(d.guardado)).not.toContain('CRON_SECRET')
    expect(r.escritos).toHaveLength(SECRETOS_GRUPO_C.length - 2)
  })
  it('--rotar reemplaza solo la pedida', () => {
    const d = dopplerFalso(SECRETOS_GRUPO_C.map((s: { nombre: string }) => s.nombre))
    const r = ejecutar({ proyecto: 'zero-risk', config: 'prd', rotar: ['INTERNAL_API_KEY'] as never, run: d.run as never, log: () => {} })
    expect(r.escritos).toEqual(['INTERNAL_API_KEY']); expect(Object.keys(d.guardado)).toEqual(['INTERNAL_API_KEY'])
  })
})

describe('ejecutar · fallos', () => {
  it('sin la CLI de Doppler, no escribe nada', () => {
    const d = dopplerFalso([], { sinCli: true })
    expect(ejecutar({ proyecto: 'p', config: 'prd', run: d.run as never, log: () => {} }).ok).toBe(false)
    expect(d.llamadas.some((l) => l.args[1] === 'set')).toBe(false)
  })
  it('un fallo de escritura se reporta y sigue con las demás', () => {
    const d = dopplerFalso([], { fallaEn: 'CRON_SECRET' })
    const r = ejecutar({ proyecto: 'p', config: 'prd', run: d.run as never, log: () => {} })
    expect(r.ok).toBe(false); expect(r.fallidos).toEqual(['CRON_SECRET']); expect(r.escritos).toHaveLength(SECRETOS_GRUPO_C.length - 1)
  })
  it('si la comprobación de largo no coincide, se marca como fallida', () => {
    const d = dopplerFalso([], { largoMal: 'ADMIN_SECRET' })
    expect(ejecutar({ proyecto: 'p', config: 'prd', run: d.run as never, log: () => {} }).fallidos).toEqual(['ADMIN_SECRET'])
  })
  it('--rotar con una variable ajena al grupo C no escribe nada', () => {
    const d = dopplerFalso([])
    const r = ejecutar({ proyecto: 'p', config: 'prd', rotar: ['OPENAI_API_KEY'] as never, run: d.run as never, log: () => {} })
    expect(r.ok).toBe(false); expect(d.llamadas.some((l) => l.args[1] === 'set')).toBe(false)
  })
})
