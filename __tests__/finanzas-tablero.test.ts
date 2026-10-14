/**
 * OFICINA FINANCIERA · F2/F4 · leer y firmar un tablero (CC#1 · 14-oct): apagada = 409; el cliente es OBLIGATORIO y un tablero de otro no se entrega; las filas deben ser las del
 * bloque; la firma es de código (huella íntegra, la SALIDA del jefe obligatoria y su invocación guardada, tope si una cifra que manda está «sin base»); en seco no escribe;
 * el resumen sale en lenguaje llano, sin jerga, con la confianza del tablero y las reglas de «cuándo juzgar» completas.
 */
import { describe, expect, it } from 'vitest'
import { calcular, confianzaDe } from '../src/lib/finanzas/calculadora'
import { huellaDe, numerosDelBloque, type FilaDeNumero } from '../src/lib/finanzas/firma'
import { manejarTablero, numerosCoinciden, type ConfigDeFinanzas, type FilaDeTablero, type PuertosDeTablero } from '../src/lib/finanzas/ruta'
import { resumenDelBloque } from '../src/lib/finanzas/resumen'
import type { Bloque, Cifra, Entrada } from '../src/lib/finanzas/tipos'

const ENTRADA: Entrada = { meta_por_semana: 15, pasos: [{ tasa: 0.3 }], ticket: 10, margen: 0.55, costo_entrega: 2, referencia: { min: 0.4, max: 1.2, tipo: 'supuesto', fuente: 'prueba' }, dias_activos_por_semana: 5, produccion: { fraccion: 0.25, origen: 'plan' }, canales: [{ canal: 'busqueda_pagada', peso: 0.1, piso_diario: 30 }] }
const BLOQUE = calcular(ENTRADA) as Bloque
const ID = '3f2b8c1e-9d4a-4b7e-8a61-0c5d2e7f9a10'
const cfg = (o: Partial<ConfigDeFinanzas> = {}): ConfigDeFinanzas => ({ estado: 'encendida', clientes_ensayo: [], preguntas_slack: 'apagado', conversa: 'apagado', ...o })

function puertos(o: { cfg?: ConfigDeFinanzas; tablero?: Partial<FilaDeTablero> | null; numeros?: FilaDeNumero[]; invocacion?: boolean | 'cae' } = {}) {
  const log = { actualizaciones: [] as Array<Record<string, unknown>> }
  const t: FilaDeTablero | null = o.tablero === null ? null : { id: ID, client_id: 'c1', version: 1, vigente: true, estado: 'borrador', entrada: ENTRADA, bloque: BLOQUE, huella: huellaDe(BLOQUE), ...(o.tablero ?? {}) }
  const P: PuertosDeTablero = {
    async leerConfig() { return o.cfg ?? cfg() },
    async guardarTablero() { throw new Error('no debe llamarse') },
    async leerTablero(id) { return t && t.id === id ? t : null },
    async leerNumeros() { return o.numeros ?? numerosDelBloque((t?.bloque ?? BLOQUE) as Bloque) },
    async actualizarTablero(_id, patch) { log.actualizaciones.push(patch) },
    async invocacionDelJefe() { if (o.invocacion === 'cae') throw new Error('libro caído'); return o.invocacion !== false },
  }
  return { P, log }
}
const leer = (o: Record<string, unknown>, p = puertos()) => manejarTablero({ accion: 'leer', finanzas_id: ID, client_id: 'c1', ...o }, p.P)

describe('leer', () => {
  it('apagada: 409 sin leer nada', async () => {
    expect((await leer({}, puertos({ cfg: cfg({ estado: 'apagada' }) }))).status).toBe(409)
  })
  it('entrega el bloque, sus números, su confianza y un resumen en texto llano', async () => {
    const r = await leer({})
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ finanzas_id: ID, client_id: 'c1', estado: 'borrador', semanas: 12 })
    expect((r.cuerpo.numeros as unknown[]).length).toBe(Object.keys(BLOQUE.cifras).length)
    expect(r.cuerpo.confianza).toMatchObject({ nivel: expect.any(String) })
    const lineas = (r.cuerpo.resumen as { lineas: string[] }).lineas
    expect(lineas.join(' ')).toContain('Meta: 15 ventas por semana')
    expect(lineas.join(' ')).toContain('Confianza del tablero')
  })
  it('R5 · el cliente es OBLIGATORIO: sin client_id, 400; de otro cliente o inexistente, 404', async () => {
    const p = puertos()
    expect((await manejarTablero({ accion: 'leer', finanzas_id: ID }, p.P)).status).toBe(400)
    expect((await manejarTablero({ accion: 'leer', finanzas_id: ID, client_id: '  ' }, p.P)).status).toBe(400)
    expect((await leer({ client_id: 'otro' })).status).toBe(404)
    expect((await leer({}, puertos({ tablero: null }))).status).toBe(404)
  })
  it('R4 · si las filas guardadas ya no son las del bloque (edición a mano), 409 «numeros_alterados» y no se entrega', async () => {
    const alteradas = numerosDelBloque(BLOQUE).map((n) => (n.clave === 'total_mes' ? { ...n, valor: (n.valor ?? 0) * 10 } : n))
    const r = await leer({}, puertos({ numeros: alteradas }))
    expect(r.status).toBe(409)
    expect(r.cuerpo.error).toBe('numeros_alterados')
    expect(numerosCoinciden(numerosDelBloque(BLOQUE), BLOQUE)).toBe(true)
    expect(numerosCoinciden(alteradas, BLOQUE)).toBe(false)
    expect(numerosCoinciden(numerosDelBloque(BLOQUE).slice(1), BLOQUE)).toBe(false)
    expect(numerosCoinciden(numerosDelBloque(BLOQUE).map((n) => (n.clave === 'meta_por_semana' ? { ...n, tipo: 'supuesto' as const } : n)), BLOQUE)).toBe(false)
  })
  it('en ensayo, un cliente fuera de la lista: 409', async () => {
    expect((await leer({}, puertos({ cfg: cfg({ estado: 'ensayo', clientes_ensayo: ['otro'] }) }))).status).toBe(409)
  })
  it('entrada mal formada: 400', async () => {
    const { P } = puertos()
    for (const c of [{ accion: 'leer' }, { accion: 'leer', finanzas_id: 'no-uuid', client_id: 'c1' }, { accion: 'borrar', finanzas_id: ID, client_id: 'c1' }, 'x', [1]]) expect((await manejarTablero(c, P)).status).toBe(400)
  })
})

describe('firmar · un acto de código', () => {
  const firmar = (o: Record<string, unknown>, p = puertos()) =>
    manejarTablero({ accion: 'firmar', finanzas_id: ID, client_id: 'c1', dry_run: false, salida: 'sale_ajustada', invocacion_id: 'inv-123', ...o }, p.P, () => new Date('2026-10-14T12:00:00Z')).then((r) => ({ r, ...p }))
  it('sin críticos: firma y guarda QUIÉN (la invocación del jefe y su salida), cuándo y escribe UNA vez', async () => {
    const { r, log } = await firmar({ hallazgos: [{ severidad: 'alto', que: 'x' }] })
    expect(r.cuerpo).toMatchObject({ decision: 'firmado', escribio: true, salida: 'sale_ajustada' })
    expect(log.actualizaciones).toEqual([{ estado: 'firmado', firmado_por: 'chief-financial-officer:inv-123:sale_ajustada', firmado_en: '2026-10-14T12:00:00.000Z' }])
  })
  it('R5 · sin la salida del jefe (o con una inventada) o sin su invocación: 400 y NO firma, aunque la lista de hallazgos esté vacía', async () => {
    for (const o of [{ salida: undefined }, { salida: 'aprobado' }, { salida: 42 }, { invocacion_id: undefined }, { invocacion_id: '  ' }, { invocacion_id: 'x'.repeat(101) }]) {
      const { r, log } = await firmar(o)
      expect(r.status, JSON.stringify(o)).toBe(400)
      expect(log.actualizaciones).toEqual([])
    }
  })
  it('con críticos y ninguna corrección hecha: pide la corrección y NO escribe', async () => {
    const { r, log } = await firmar({ hallazgos: [{ severidad: 'critico', que: 'x' }], correcciones_hechas: 0 })
    expect(r.cuerpo).toMatchObject({ decision: 'requiere_correccion', escribio: false })
    expect(log.actualizaciones).toEqual([])
  })
  it('con críticos tras la ÚNICA corrección: sin_firma (y el plan sigue)', async () => {
    const { r, log } = await firmar({ hallazgos: [{ severidad: 'critico', que: 'x' }], correcciones_hechas: 1 })
    expect(r.cuerpo).toMatchObject({ decision: 'sin_firma', escribio: true })
    expect(log.actualizaciones[0]).toMatchObject({ estado: 'sin_firma' })
  })
  it('en seco no escribe; sin `dry_run` booleano, 400', async () => {
    const { r, log } = await firmar({ dry_run: true })
    expect(r.cuerpo).toMatchObject({ decision: 'firmado', escribio: false })
    expect(log.actualizaciones).toEqual([])
    expect((await firmar({ dry_run: 'no' })).r.status).toBe(400)
  })
  it('la huella debe ser íntegra: si el bloque guardado no coincide con su huella, 409 y no firma', async () => {
    const { r, log } = await firmar({}, puertos({ tablero: { huella: 'otra-huella' } }))
    expect(r.status).toBe(409)
    expect(r.cuerpo.error).toBe('huella_no_coincide')
    expect(log.actualizaciones).toEqual([])
  })
  it('solo se firma un borrador: uno ya firmado, sin firma o reemplazado: 409', async () => {
    for (const estado of ['firmado', 'sin_firma', 'reemplazado'] as const) {
      const { r, log } = await firmar({}, puertos({ tablero: { estado } }))
      expect(r.status, estado).toBe(409)
      expect(log.actualizaciones).toEqual([])
    }
  })
  it('los hallazgos mal formados se ignoran (no cuentan como críticos)', async () => {
    const { r } = await firmar({ hallazgos: [{ severidad: 'catastrofico', que: 'x' }, null, { severidad: 'critico' }] })
    expect(r.cuerpo).toMatchObject({ decision: 'firmado' })
  })
  it('R14 · si una cifra que manda está «sin base», el jefe SOLO puede emitir «sale con alerta»', async () => {
    const cifras = { ...BLOQUE.cifras, techo_por_resultado: { valor: null, tipo: 'sin_base', fuente: 'x', motivo: 'sin base' } as Cifra }
    const b: Bloque = { ...BLOQUE, cifras, confianza: confianzaDe(cifras) }
    const p = () => puertos({ tablero: { bloque: b, huella: huellaDe(b) }, numeros: numerosDelBloque(b) })
    for (const salida of ['sale', 'sale_ajustada']) {
      const { r, log } = await firmar({ salida }, p())
      expect(r.status, salida).toBe(409)
      expect(r.cuerpo.error).toBe('salida_no_permitida')
      expect(log.actualizaciones).toEqual([])
    }
    const { r } = await firmar({ salida: 'sale_con_alerta' }, p())
    expect(r.cuerpo).toMatchObject({ decision: 'firmado', salida: 'sale_con_alerta', confianza: 'sin_base' })
  })
})

describe('R14 · la confianza del tablero', () => {
  const c = (tipo: Cifra['tipo']): Cifra => ({ valor: tipo === 'sin_base' ? null : 1, tipo, fuente: 'x', motivo: tipo === 'sin_base' ? 'sin base' : undefined })
  it('casi todo supuesto → «casi_todo_supuesto» (nunca confirmado); mayoría de dato → «confirmado»; algo intermedio → «parcial»', () => {
    expect(confianzaDe({ a: c('supuesto'), b: c('supuesto'), c: c('supuesto'), d: c('supuesto'), e: c('dato') }).nivel).toBe('casi_todo_supuesto')
    expect(confianzaDe({ a: c('dato'), b: c('dato'), c: c('dato'), d: c('supuesto') }).nivel).toBe('confirmado')
    expect(confianzaDe({ a: c('dato'), b: c('supuesto') }).nivel).toBe('parcial')
  })
  it('una cifra que manda «sin base» → «sin_base» y lo dice el texto', () => {
    const r = confianzaDe({ techo_por_resultado: c('sin_base'), a: c('dato'), b: c('dato'), c: c('dato') })
    expect(r.nivel).toBe('sin_base')
    expect(r.manda_sin_base).toBe(true)
    expect(r.texto).toContain('solo puede salir «con alerta»')
  })
  it('el bloque real de la calculadora (casi todo supuesto) sale con esa marca y el resumen lo dice', () => {
    expect(BLOQUE.confianza.nivel).toBe('casi_todo_supuesto')
    expect(resumenDelBloque(BLOQUE).lineas.join(' ')).toContain('casi todo es supuesto: no es un tablero confirmado')
  })
})

describe('el resumen para el redactor', () => {
  it('lenguaje llano: marca los supuestos, dice el techo, los umbrales, el reparto y qué suma a Meta+Instagram', () => {
    const t = resumenDelBloque(BLOQUE, { dias_activos_por_semana: 5, moneda: 'USD' }).lineas.join('\n')
    for (const frag of ['(supuesto)', 'Techo por resultado', 'Meta+Instagram', 'siempre al menos 60 %', 'se suman a Meta+Instagram', 'Revisión interna cada 7 días e informe al dueño cada 14']) expect(t).toContain(frag)
  })
  it('R6 · las reglas de «cuándo juzgar» COMPLETAS: «15 resultados», el ciclo, y la pausa técnica (3× el techo, 30 minutos)', () => {
    const t = resumenDelBloque(BLOQUE).lineas.join('\n')
    expect(t).toContain('15 resultados medidos')
    expect(t).toContain('la última de estas condiciones')
    expect(t).toContain('Pausa técnica')
    expect(t).toContain('3 veces el techo por resultado')
    expect(t).toContain('30 minutos')
    expect(t).toContain('solo queda escrito: no se ejecuta')
  })
  it('sin jerga interna: ni nombres de campos ni de tablas ni de flujos', () => {
    const t = resumenDelBloque(BLOQUE, { dias_activos_por_semana: 5 }).lineas.join('\n').toLowerCase()
    for (const j of ['finanzas_', 'dry_run', 'huella', 'workflow', 'json', 'supabase', 'cifras.', 'minimo_por_conjunto', 'meta_ig', 'p8', 'p9']) expect(t, j).not.toContain(j)
  })
  it('sin valor monetario: dice que el techo es la referencia de mercado', () => {
    const b = calcular({ ...ENTRADA, ticket: null, margen: null }) as Bloque
    expect(resumenDelBloque(b).lineas.join(' ')).toContain('referencia de mercado')
  })
})

describe('ronda 2 de CC#3 · leer comprueba la huella y las filas completas; firmar exige una invocación REAL del jefe', () => {
  const firmar = (o: Record<string, unknown>, p = puertos()) => manejarTablero({ accion: 'firmar', finanzas_id: ID, client_id: 'c1', dry_run: false, salida: 'sale', invocacion_id: 'inv-real', hallazgos: [], correcciones_hechas: 0, ...o }, p.P)
  it('editar el bloque Y sus filas a la vez (la huella ya no coincide) NO se entrega: 409', async () => {
    const editado = { ...BLOQUE, cifras: { ...BLOQUE.cifras } } as Bloque
    const k = Object.keys(editado.cifras)[0] as keyof typeof editado.cifras
    editado.cifras[k] = { ...(editado.cifras[k] as object), valor: 999999 } as never
    const r = await leer({}, puertos({ tablero: { bloque: editado } }))
    expect(r.status).toBe(409)
    expect(r.cuerpo.error).toBe('huella_no_coincide')
  })
  it('editar la fuente, la fórmula o la fecha de una fila (sin tocar el valor) NO pasa', async () => {
    for (const campo of ['fuente', 'formula', 'fecha'] as const) {
      const filas = numerosDelBloque(BLOQUE).map((n, i) => (i === 0 ? { ...n, [campo]: 'editada a mano' } : n))
      const r = await leer({}, puertos({ numeros: filas }))
      expect(r.status, campo).toBe(409)
      expect(r.cuerpo.error, campo).toBe('numeros_alterados')
    }
  })
  it('una invocación que NO existe en el libro (o es de otro agente o cliente) no firma y no escribe', async () => {
    const p = puertos({ invocacion: false })
    const r = await firmar({ invocacion_id: 'esto-no-existe' }, p)
    expect(r.status).toBe(409)
    expect(r.cuerpo.error).toBe('invocacion_no_encontrada')
    expect(p.log.actualizaciones).toHaveLength(0)
  })
  it('si el libro no se puede leer, 503 y no firma', async () => {
    const p = puertos({ invocacion: 'cae' })
    const r = await firmar({}, p)
    expect(r.status).toBe(503)
    expect(p.log.actualizaciones).toHaveLength(0)
  })
  it('con la invocación real firma y deja quién firmó', async () => {
    const p = puertos()
    const r = await firmar({}, p)
    expect(r.status).toBe(200)
    expect(p.log.actualizaciones[0].firmado_por).toBe('chief-financial-officer:inv-real:sale')
  })
})
