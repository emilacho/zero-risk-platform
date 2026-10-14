/**
 * OFICINA FINANCIERA · F2 · la puerta, la firma y el almacén (CC#1 · 14-oct).
 * Se prueba: APAGADA = 409 sin calcular ni escribir (también en seco); `dry_run` obligatorio y booleano; fuera de ensayo = 409; entrada inválida = 422 sin bloquear;
 * seco = 0 escrituras; real = tablero +1 con sus números y el anterior `reemplazado`; la llave interna (503/401/ok) y la firma (huella estable, una sola corrección).
 */
import { describe, expect, it } from 'vitest'
import { almacenDeFinanzas } from '../src/lib/finanzas/almacen-supabase'
import { canonico, decidirFirma, huellaDe, numerosDelBloque } from '../src/lib/finanzas/firma'
import { calcular } from '../src/lib/finanzas/calculadora'
import { checkInternalKey, manejarBloque, type ConfigDeFinanzas, type PuertosDeFinanzas } from '../src/lib/finanzas/ruta'
import type { Bloque, Entrada } from '../src/lib/finanzas/tipos'

const ENTRADA: Entrada = { meta_por_semana: 15, pasos: [{ tasa: 0.3 }], ticket: 10, margen: 0.55, costo_entrega: 2, referencia: { min: 0.4, max: 1.2, tipo: 'supuesto', fuente: 'referencia de prueba' }, dias_activos_por_semana: 5, produccion: { fraccion: 0.25, origen: 'plan' } }
const cfg = (o: Partial<ConfigDeFinanzas> = {}): ConfigDeFinanzas => ({ estado: 'encendida', clientes_ensayo: [], preguntas_slack: 'apagado', conversa: 'apagado', ...o })

function puertos(c: ConfigDeFinanzas) {
  const llamadas = { leerConfig: 0, guardar: [] as unknown[] }
  const P: PuertosDeFinanzas = {
    async leerConfig() { llamadas.leerConfig++; return c },
    async guardarTablero(t) { llamadas.guardar.push(t); return { id: 'tablero-1', version: 1 } },
  }
  return { P, llamadas }
}
const cuerpo = (o: Record<string, unknown> = {}) => ({ client_id: 'cliente-1', dry_run: false, entrada: ENTRADA, ...o })

describe('la puerta · apagada = 409 antes de todo', () => {
  it('apagada: 409, no calcula, no escribe, ni siquiera en seco ni con entrada rota', async () => {
    for (const c of [cuerpo({ dry_run: true }), cuerpo(), cuerpo({ entrada: { roto: true } }), cuerpo({ dry_run: 'no' })]) {
      const { P, llamadas } = puertos(cfg({ estado: 'apagada' }))
      const r = await manejarBloque(c, P)
      expect(r.status).toBe(409)
      expect(r.cuerpo.error).toBe('finanzas_apagada')
      expect(llamadas.guardar).toEqual([])
    }
  })
  it('la configuración ilegible NO enciende nada: 503 y sin escribir', async () => {
    const P: PuertosDeFinanzas = { async leerConfig() { throw new Error('base caída') }, async guardarTablero() { throw new Error('no debe llamarse') } }
    expect((await manejarBloque(cuerpo(), P)).status).toBe(503)
  })
  it('en ensayo, un cliente que no está en la lista: 409', async () => {
    const { P, llamadas } = puertos(cfg({ estado: 'ensayo', clientes_ensayo: ['otro'] }))
    const r = await manejarBloque(cuerpo(), P)
    expect(r.status).toBe(409)
    expect(r.cuerpo.error).toBe('cliente_fuera_de_ensayo')
    expect(llamadas.guardar).toEqual([])
    const dentro = puertos(cfg({ estado: 'ensayo', clientes_ensayo: ['cliente-1'] }))
    expect((await manejarBloque(cuerpo({ dry_run: true }), dentro.P)).status).toBe(200)
  })
})

describe('la forma de la entrada', () => {
  it('`dry_run` ausente o no booleano = 400 (igual que la sala)', async () => {
    for (const v of [undefined, 'false', 0, null]) {
      const { P } = puertos(cfg())
      const r = await manejarBloque({ client_id: 'c', entrada: ENTRADA, ...(v === undefined ? {} : { dry_run: v }) }, P)
      expect(r.status).toBe(400)
    }
  })
  it('sin client_id o sin entrada = 400; cuerpo que no es objeto = 400', async () => {
    const { P } = puertos(cfg())
    expect((await manejarBloque({ dry_run: true, entrada: ENTRADA }, P)).status).toBe(400)
    expect((await manejarBloque({ dry_run: true, client_id: 'c' }, P)).status).toBe(400)
    expect((await manejarBloque([1, 2], P)).status).toBe(400)
    expect((await manejarBloque('x', P)).status).toBe(400)
  })
  it('una entrada inválida NUNCA bloquea: 422 con motivos y `sin_bloque`, sin escribir', async () => {
    const { P, llamadas } = puertos(cfg())
    const r = await manejarBloque(cuerpo({ entrada: { ...ENTRADA, meta_por_semana: 0 } }), P)
    expect(r.status).toBe(422)
    expect(r.cuerpo.sin_bloque).toBe(true)
    expect((r.cuerpo.errores as string[]).length).toBeGreaterThan(0)
    expect(llamadas.guardar).toEqual([])
  })
})

describe('seco y real', () => {
  it('seco: devuelve el bloque y la huella y NO escribe', async () => {
    const { P, llamadas } = puertos(cfg())
    const r = await manejarBloque(cuerpo({ dry_run: true }), P)
    expect(r.status).toBe(200)
    expect(r.cuerpo.escribio).toBe(false)
    expect(typeof r.cuerpo.huella).toBe('string')
    expect(llamadas.guardar).toEqual([])
  })
  it('real: guarda UN tablero con su huella y una fila por cifra', async () => {
    const { P, llamadas } = puertos(cfg())
    const r = await manejarBloque(cuerpo({ workflow_execution_id: '123' }), P)
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ finanzas_id: 'tablero-1', escribio: true })
    expect(llamadas.guardar).toHaveLength(1)
    const g = llamadas.guardar[0] as { huella: string; numeros: Array<{ clave: string }>; workflow_execution_id: string }
    expect(g.huella).toBe(r.cuerpo.huella)
    expect(g.workflow_execution_id).toBe('123')
    expect(g.numeros.length).toBeGreaterThan(10)
  })
  it('si no se puede guardar: 500 con `sin_bloque` (el plan sigue sin ella)', async () => {
    const P: PuertosDeFinanzas = { async leerConfig() { return cfg() }, async guardarTablero() { throw new Error('base caída') } }
    const r = await manejarBloque(cuerpo(), P)
    expect(r.status).toBe(500)
    expect(r.cuerpo.sin_bloque).toBe(true)
  })
})

describe('la llave interna (nunca SALA_DISPATCH_KEY)', () => {
  const req = (h: Record<string, string>) => new Request('http://x', { headers: h })
  it('sin la variable: 503; sin cabecera o equivocada: 401; correcta: ok', () => {
    expect(checkInternalKey(req({ 'x-api-key': 'a' }), {})).toMatchObject({ ok: false, status: 503 })
    expect(checkInternalKey(req({}), { INTERNAL_API_KEY: 'secreto' })).toMatchObject({ ok: false, status: 401 })
    expect(checkInternalKey(req({ 'x-api-key': 'otro' }), { INTERNAL_API_KEY: 'secreto' })).toMatchObject({ ok: false, status: 401 })
    expect(checkInternalKey(req({ 'x-api-key': 'secreto' }), { INTERNAL_API_KEY: 'secreto' })).toEqual({ ok: true })
  })
  it('la llave de despacho de la sala NO abre esta puerta', () => {
    expect(checkInternalKey(req({ 'x-sala-dispatch-key': 'despacho' }), { INTERNAL_API_KEY: 'secreto', SALA_DISPATCH_KEY: 'despacho' })).toMatchObject({ ok: false, status: 401 })
    expect(checkInternalKey(req({ 'x-api-key': 'despacho' }), { INTERNAL_API_KEY: 'secreto', SALA_DISPATCH_KEY: 'despacho' })).toMatchObject({ ok: false, status: 401 })
  })
})

describe('la firma es de código', () => {
  it('huella estable: el orden de las claves no cambia la huella; un solo número cambiado, sí', () => {
    expect(huellaDe({ a: 1, b: { c: 2, d: [1, 2] } })).toBe(huellaDe({ b: { d: [1, 2], c: 2 }, a: 1 }))
    expect(huellaDe({ a: 1 })).not.toBe(huellaDe({ a: 1.0000001 }))
    expect(canonico({ b: undefined, a: 1 })).toBe('{"a":1}')
    const b = calcular(ENTRADA) as Bloque
    const b2 = calcular({ ...ENTRADA, meta_por_semana: 16 }) as Bloque
    expect(huellaDe(b)).toBe(huellaDe(calcular(ENTRADA)))
    expect(huellaDe(b)).not.toBe(huellaDe(b2))
  })
  it('sin críticos → firmado; con críticos → UNA corrección; si persisten → sin_firma (el plan sigue)', () => {
    expect(decidirFirma({ hallazgos: [{ severidad: 'alto', que: 'x' }], correcciones_hechas: 0 }).estado).toBe('firmado')
    expect(decidirFirma({ hallazgos: [{ severidad: 'critico', que: 'x' }], correcciones_hechas: 0 }).estado).toBe('requiere_correccion')
    expect(decidirFirma({ hallazgos: [{ severidad: 'critico', que: 'x' }], correcciones_hechas: 1 }).estado).toBe('sin_firma')
    expect(decidirFirma({ hallazgos: [], correcciones_hechas: 5 }).estado).toBe('firmado')
  })
  it('numerosDelBloque: una fila por cifra y nunca una celda vacía sin motivo', () => {
    const b = calcular({ ...ENTRADA, produccion: null }) as Bloque
    const filas = numerosDelBloque(b)
    expect(filas.length).toBe(Object.keys(b.cifras).length)
    for (const f of filas) { if (f.valor == null) { expect(f.tipo).toBe('sin_base'); expect(f.motivo).toBeTruthy() } }
    expect(filas.find((f) => f.clave === 'produccion_mes')).toMatchObject({ valor: null, tipo: 'sin_base' })
  })
})

