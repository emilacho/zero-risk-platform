/**
 * OFICINA FINANCIERA · F2 · reparos de CC#3 (R2, R3, R7): la llave equivocada DEL MISMO LARGO no entra, guardar un tablero se compensa si falla a medias
 * (el cliente conserva su tablero vigente), y lo que se guarda tiene tamaño máximo. Con una base simulada: US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { almacenDeFinanzas } from '../src/lib/finanzas/almacen-supabase'
import { checkLlaveInterna, igualesEnTiempoConstante, manejarBloque, MAX_BYTES_DE_ENTRADA, MAX_LARGO_DE_EJECUCION, type ConfigDeFinanzas, type PuertosDeFinanzas } from '../src/lib/finanzas/ruta'
import type { Entrada } from '../src/lib/finanzas/tipos'

const ENTRADA: Entrada = { meta_por_semana: 15, pasos: [{ tasa: 0.3 }], ticket: 10, margen: 0.55, costo_entrega: 2, referencia: { min: 0.4, max: 1.2, tipo: 'supuesto', fuente: 'prueba' }, dias_activos_por_semana: 5 }
const cfg = (): ConfigDeFinanzas => ({ estado: 'encendida', clientes_ensayo: [], preguntas_slack: 'apagado', conversa: 'apagado' })

describe('la llave: una equivocada DEL MISMO LARGO tampoco entra (R2 de CC#3)', () => {
  const req = (h: Record<string, string>) => new Request('http://x', { headers: h })
  it('mismo largo y distinta: 401; más larga o más corta: 401; la correcta: ok', () => {
    expect(checkLlaveInterna(req({ 'x-api-key': 'secretX' }), { INTERNAL_API_KEY: 'secreto' })).toMatchObject({ ok: false, status: 401 })
    expect(checkLlaveInterna(req({ 'x-api-key': 'secreto-largo' }), { INTERNAL_API_KEY: 'secreto' })).toMatchObject({ ok: false, status: 401 })
    expect(checkLlaveInterna(req({ 'x-api-key': 'secre' }), { INTERNAL_API_KEY: 'secreto' })).toMatchObject({ ok: false, status: 401 })
    expect(checkLlaveInterna(req({ 'x-api-key': 'secreto' }), { INTERNAL_API_KEY: 'secreto' })).toEqual({ ok: true })
  })
  it('la comparación en tiempo constante distingue en cada posición', () => {
    expect(igualesEnTiempoConstante('abc', 'abd')).toBe(false)
    expect(igualesEnTiempoConstante('xbc', 'abc')).toBe(false)
    expect(igualesEnTiempoConstante('abc', 'abc')).toBe(true)
    expect(igualesEnTiempoConstante('', 'abc')).toBe(false)
    expect(igualesEnTiempoConstante('abc', '')).toBe(false)
  })
})

describe('tamaños: lo que se guarda no crece sin límite (R7 de CC#3)', () => {
  const P = (guardado: unknown[]): PuertosDeFinanzas => ({ async leerConfig() { return cfg() }, async guardarTablero(t) { guardado.push(t); return { id: 'x', version: 1 } } })
  it('más de 20.000 caracteres: 413 y NO se guarda; un workflow_execution_id largo o no texto: 400; en el límite: 200', async () => {
    const g: unknown[] = []
    const r = await manejarBloque({ client_id: 'c', dry_run: false, entrada: { ...ENTRADA, notas: 'x'.repeat(MAX_BYTES_DE_ENTRADA + 1) } }, P(g))
    expect(r.status).toBe(413)
    expect(g).toEqual([])
    expect((await manejarBloque({ client_id: 'c', dry_run: false, entrada: ENTRADA, workflow_execution_id: 'x'.repeat(MAX_LARGO_DE_EJECUCION + 1) }, P(g))).status).toBe(400)
    expect((await manejarBloque({ client_id: 'c', dry_run: false, entrada: ENTRADA, workflow_execution_id: 12345 }, P(g))).status).toBe(400)
    expect((await manejarBloque({ client_id: 'c', dry_run: false, entrada: ENTRADA, workflow_execution_id: 'x'.repeat(MAX_LARGO_DE_EJECUCION) }, P(g))).status).toBe(200)
  })
})

describe('el almacén real (con una base simulada)', () => {
  type Fallas = (op: 'insert' | 'update' | 'delete', tabla: string, n: number) => string | null
  type Fila = Record<string, unknown>
  function baseSimulada(filas: Record<string, Fila[]>, falla?: Fallas) {
    const log: string[] = []
    const cuenta: Record<string, number> = {}
    const db = {
      from(tabla: string) {
        const f = (filas[tabla] ??= [])
        const filtro: Array<[string, unknown]> = []
        let error: string | null = null
        let pendiente: (() => void) | null = null
        let ultima: Fila | null = null
        const coincide = (r: Fila) => filtro.every(([k, v]) => r[k] === v)
        const op = (kind: 'insert' | 'update' | 'delete') => {
          const clave = `${kind} ${tabla}`
          cuenta[clave] = (cuenta[clave] ?? 0) + 1
          log.push(clave)
          error = falla ? falla(kind, tabla, cuenta[clave]) : null
          return !error
        }
        const salida = (data: unknown) => Promise.resolve(error ? { data: null, error: { message: error } } : { data, error: null })
        const correr = () => { if (pendiente) { const p = pendiente; pendiente = null; p() } }
        const cadena: any = {
          select() { return cadena },
          eq(k: string, v: unknown) { filtro.push([k, v]); return cadena },
          order() { return cadena },
          limit() { return cadena },
          maybeSingle() { const x = f.find(coincide); return salida(x ? { ...x } : null) },
          single() { correr(); return salida(ultima) },
          update(p: Fila) { pendiente = () => { if (op('update')) for (const r of f) if (coincide(r)) Object.assign(r, p) }; return cadena },
          delete() { pendiente = () => { if (op('delete')) for (let i = f.length - 1; i >= 0; i--) if (coincide(f[i])) f.splice(i, 1) }; return cadena },
          insert(x: Fila | Fila[]) { pendiente = () => { if (op('insert')) for (const r of Array.isArray(x) ? x : [x]) { ultima = { id: `${tabla}-${f.length + 1}`, ...r }; f.push(ultima) } }; return cadena },
          then(res: (v: unknown) => unknown, rej?: (e: unknown) => unknown) {
            if (pendiente) { correr(); return salida(null).then(res, rej) }
            return salida(f.filter(coincide).map((r) => ({ ...r })).sort((a, b) => Number(b.version ?? 0) - Number(a.version ?? 0))).then(res, rej)
          },
        }
        return cadena
      },
    }
    return { db, log, filas }
  }
  const NUM = { clave: 'k', valor: 1, minimo: null, maximo: null, unidad: null, tipo: 'supuesto' as const, fuente: 'f', fecha: null, formula: null, motivo: null }
  const T0 = { client_id: 'c', entrada: ENTRADA, bloque: {}, huella: 'h', numeros: [NUM], workflow_execution_id: null }
  const VIGENTE = { id: 'v1', client_id: 'c', version: 1, vigente: true, estado: 'firmado' }

  it('leerConfig: sin fila o con un valor raro → APAGADA (la dirección segura)', async () => {
    expect((await almacenDeFinanzas(baseSimulada({}).db).leerConfig()).estado).toBe('apagada')
    const raro = baseSimulada({ finanzas_config: [{ id: 1, estado: 'encendidísima', preguntas_slack: 'x', conversa: 'y' }] })
    expect(await almacenDeFinanzas(raro.db).leerConfig()).toMatchObject({ estado: 'apagada', preguntas_slack: 'apagado', conversa: 'apagado' })
    const buena = baseSimulada({ finanzas_config: [{ id: 1, estado: 'ensayo', clientes_ensayo: ['a'], preguntas_slack: 'borrador', conversa: 'ensayo' }] })
    expect(await almacenDeFinanzas(buena.db).leerConfig()).toEqual({ estado: 'ensayo', clientes_ensayo: ['a'], preguntas_slack: 'borrador', conversa: 'ensayo' })
  })
  it('guardarTablero: versión +1, el anterior queda «reemplazado», y se guardan los números del nuevo', async () => {
    const s = baseSimulada({ finanzas_tableros: [{ ...VIGENTE }] })
    const r = await almacenDeFinanzas(s.db).guardarTablero(T0)
    expect(r.version).toBe(2)
    expect(s.filas.finanzas_tableros[0]).toMatchObject({ vigente: false, estado: 'reemplazado' })
    expect(s.filas.finanzas_tableros[1]).toMatchObject({ version: 2, vigente: true, estado: 'borrador' })
    expect(s.filas.finanzas_numeros).toHaveLength(1)
    expect(s.log.indexOf('update finanzas_tableros')).toBeLessThan(s.log.indexOf('insert finanzas_tableros'))
  })
  it('primer tablero de un cliente: versión 1 y sin «reemplazar» a nadie', async () => {
    const s = baseSimulada({})
    const r = await almacenDeFinanzas(s.db).guardarTablero({ ...T0, numeros: [] })
    expect(r.version).toBe(1)
    expect(s.log).not.toContain('update finanzas_tableros')
  })
  it('R3 · si la inserción del tablero FALLA, el cliente conserva su tablero vigente FIRMADO (compensación)', async () => {
    const s = baseSimulada({ finanzas_tableros: [{ ...VIGENTE }] }, (op, tabla) => (op === 'insert' && tabla === 'finanzas_tableros' ? 'la base se cayó' : null))
    await expect(almacenDeFinanzas(s.db).guardarTablero(T0)).rejects.toThrow(/la base se cayó.*compensado/)
    expect(s.filas.finanzas_tableros).toHaveLength(1)
    expect(s.filas.finanzas_tableros[0]).toMatchObject({ id: 'v1', vigente: true, estado: 'firmado' })
  })
  it('R3 · si fallan los NÚMEROS, se borra el tablero parcial y el anterior vuelve a ser el vigente', async () => {
    const s = baseSimulada({ finanzas_tableros: [{ ...VIGENTE }] }, (op, tabla) => (op === 'insert' && tabla === 'finanzas_numeros' ? 'sin permiso' : null))
    await expect(almacenDeFinanzas(s.db).guardarTablero(T0)).rejects.toThrow(/sin permiso.*compensado/)
    expect(s.filas.finanzas_tableros.map((x) => x.id)).toEqual(['v1'])
    expect(s.filas.finanzas_tableros[0]).toMatchObject({ vigente: true, estado: 'firmado' })
    expect(s.filas.finanzas_numeros ?? []).toHaveLength(0)
  })
  it('R3 · si hasta la compensación falla, el error lo DICE (no se esconde)', async () => {
    const s = baseSimulada({ finanzas_tableros: [{ ...VIGENTE }] }, (op, tabla, n) => (op === 'insert' && tabla === 'finanzas_tableros' ? 'caída' : op === 'update' && n === 2 ? 'caída otra vez' : null))
    await expect(almacenDeFinanzas(s.db).guardarTablero(T0)).rejects.toThrow(/COMPENSACIÓN INCOMPLETA/)
  })
  it('R3 · si el primer paso (marcar el anterior) falla, no se inserta nada', async () => {
    const s = baseSimulada({ finanzas_tableros: [{ ...VIGENTE }] }, (op) => (op === 'update' ? 'no se pudo' : null))
    await expect(almacenDeFinanzas(s.db).guardarTablero(T0)).rejects.toThrow(/no se pudo/)
    expect(s.filas.finanzas_tableros).toHaveLength(1)
    expect(s.log).not.toContain('insert finanzas_tableros')
  })
})
