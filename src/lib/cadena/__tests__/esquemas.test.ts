/**
 * Los esquemas de salida estructurada son JSON Schema REAL (condición 7 de CC#3: el diseño los tenía en forma abreviada) · prueba con un validador de verdad (ajv, modo estricto).
 */
import { describe, it, expect } from 'vitest'
import Ajv from 'ajv'
import { ESQUEMAS, ESQUEMA_CALENDARIO_TANDA, ESQUEMA_ESTRATEGIA, ESQUEMA_BRIEF_FILA, ESQUEMA_FECHAS_ESPECIALES } from '../esquemas'
import { validarEsquemaDeSalida, ESQUEMA_MAX_BYTES } from '@/lib/salida-estructurada'
import { clienteA, clienteB, tandaBuena } from '../__fixtures__/clientes'

const ajv = new Ajv({ strict: true, allErrors: true })

describe('los 4 esquemas', () => {
  for (const [nombre, esquema] of Object.entries(ESQUEMAS)) {
    it(`${nombre}: JSON Schema válido en modo estricto Y aceptado por el validador del corredor (subconjunto, ≤ ${ESQUEMA_MAX_BYTES} bytes)`, () => {
      expect(() => ajv.compile(esquema)).not.toThrow()
      const r = validarEsquemaDeSalida(esquema)
      expect(r.ok).toBe(true)
      expect(JSON.stringify(esquema).length).toBeLessThan(ESQUEMA_MAX_BYTES)
    })
    it(`${nombre}: todo campo es obligatorio y todo objeto cierra la puerta a campos extra`, () => {
      const recorrer = (n: unknown): void => {
        if (!n || typeof n !== 'object') return
        const o = n as Record<string, unknown>
        if (o.type === 'object') {
          expect(o.additionalProperties).toBe(false)
          expect([...(o.required as string[])].sort()).toEqual(Object.keys(o.properties as object).sort())
        }
        for (const v of Object.values(o)) if (v && typeof v === 'object') recorrer(v)
      }
      recorrer(esquema)
    })
  }
})

describe('lo que el esquema impide por formato (no solo por indicación)', () => {
  const props = (ESQUEMA_CALENDARIO_TANDA.properties.piezas as { items: { properties: Record<string, unknown> } }).items.properties
  it('🔴 el calendario NO tiene campo de fecha, de total ni de porcentaje: el modelo no puede escribirlos', () => {
    for (const k of Object.keys(props)) expect(k).not.toMatch(/fecha|total|pct|porcentaje/i)
    expect(Object.keys(ESQUEMA_CALENDARIO_TANDA.properties)).toEqual(['piezas', 'ajustes_al_patron'])
  })
  it('🔴 ningún esquema admite «dueño» como origen o destino (cero contacto con el cliente)', () => {
    expect(JSON.stringify(ESQUEMAS)).not.toMatch(/due[nñ]o/i)
    const origen = (ESQUEMA_ESTRATEGIA.properties.fechas_que_importan as { items: { properties: { origen: { enum: string[] } } } }).items.properties.origen.enum
    expect(origen).toEqual(['plan', 'estrategia', 'alta'])
    const pedir = (ESQUEMA_ESTRATEGIA.properties.pendientes as { items: { properties: { pedir_a: { enum: string[] } } } }).items.properties.pedir_a.enum
    expect(pedir).toEqual(['portero', 'sistema'])
  })
  it('el esquema de fechas especiales no fija categorías de ningún rubro (tipo, ámbito y alcance son texto libre)', () => {
    const p = ESQUEMA_FECHAS_ESPECIALES.properties as Record<string, unknown>
    expect(p.tipo).toEqual({ type: 'string' })
    expect(p.ambito).toEqual({ type: 'string' })
  })
  it('el brief lleva los 16 campos del documento de referencia', () => {
    const b = (ESQUEMA_BRIEF_FILA.properties.briefs as { items: { required: string[] } }).items.required
    expect(b).toHaveLength(18) // 16 campos + «segmento» y «variantes» cuentan como grupos de dos (ver REFERENCIA §2)
    for (const k of ['identificador', 'que_es', 'de_que_parte_del_plan_sale', 'hipotesis', 'negativos', 'declarado_pendiente', 'muestra_visual']) expect(b).toContain(k)
  })
})

describe('un objeto real cumple su esquema y uno roto no', () => {
  it('la estrategia buena de los dos clientes sintéticos cumple el esquema; con un campo extra o un enum roto, no', () => {
    const v = ajv.compile(ESQUEMA_ESTRATEGIA)
    // el tipo permite `cita_plan` ausente; el esquema lo exige (el texto vacío significa «ninguna»): el modelo siempre lo escribe
    const completa = (e: ReturnType<typeof clienteA>['estrategia']) => ({ ...e, fechas_que_importan: e.fechas_que_importan.map((f) => ({ cita_plan: '', ...f })) })
    for (const c of [clienteA(), clienteB()]) expect(v(completa(c.estrategia)) || JSON.stringify(v.errors)).toBe(true)
    const a = clienteA().estrategia
    expect(v({ ...a, extra: 1 })).toBe(false)
    expect(v({ ...a, canales: [{ ...a.canales[0], rol: 'jefe' }] })).toBe(false)
    expect(v({ ...a, fechas_que_importan: [{ tipo: 'x', ambito: 'y', origen: 'dueno', cita_plan: '', motivo: 'm' }] })).toBe(false)
  })
  it('la tanda buena cumple el esquema (rellenando lo que el fixture omite); una pieza con fecha ISO o un total, no', () => {
    const v = ajv.compile(ESQUEMA_CALENDARIO_TANDA)
    const t = tandaBuena(clienteA())
    expect(v(t) || JSON.stringify(v.errors)).toBe(true)
    expect(v({ ...t, piezas: [{ ...t.piezas[0], fecha: '2026-10-12' }] })).toBe(false)
    expect(v({ ...t, total: 16 })).toBe(false)
  })
})
