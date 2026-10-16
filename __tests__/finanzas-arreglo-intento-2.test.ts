/**
 * Arreglo del intento 2 de la oficina financiera (CC#3 · relevo · 16-oct). US$ 0, sin red ni modelo.
 * Causas medidas: (A) el pedido del planteo no nombraba las claves de `canal`: el agente escribió `meta_ads` y `redes` no habló → sin costo por resultado → sin bloque;
 * (B) el pedido de medición decía «mismo esquema» sin escribirlo: devolvió sin `supuestos` y con > 3 preguntas → formato roto (0,08 perdidos, turno degradado).
 */
import { describe, expect, it } from 'vitest'
import { validarConsulta, validarPlanteo } from '../src/lib/finanzas/conversa/esquemas'
import { CANALES_VALIDOS, especialistasQueHablan } from '../src/lib/finanzas/conversa/omision'
import { pedidoDelAgente } from '../src/lib/finanzas/conversa/orquestador'
import { PLANTILLA_FINANCIERA } from '../src/lib/finanzas/conversa/plantilla'

const paso = (clave: string) => PLANTILLA_FINANCIERA.pasos.find((p) => p.clave === clave)!
const planteo = (canales: Array<Record<string, unknown>>) => ({ meta_por_semana: 20, zonas: ['z1'], dias_y_horarios: { dias_activos_por_semana: 5 }, evento: 'mensaje', canales, no_se: [] })
const consulta = (extra: Record<string, unknown> = {}) => ({ agente: 'x', resumen: 'ok', supuestos: {}, preguntas_a_otros: [], alertas: [], ...extra })

describe('A · las claves de canal: lista cerrada, en el pedido y en la validación', () => {
  it('la lista cerrada es la unión del mapa canal→especialista y de los canales sin pauta', () => {
    expect([...CANALES_VALIDOS].sort()).toEqual(['base_propia', 'busqueda_local', 'busqueda_pagada', 'influencers', 'meta_ig', 'profesional_b2b', 'video_corto', 'video_largo'])
  })
  it('el pedido del planteo y el del ajuste NOMBRAN todas las claves válidas', () => {
    for (const clave of ['planteo', 'ajuste']) {
      const t = pedidoDelAgente(paso(clave), {})
      for (const c of CANALES_VALIDOS) expect(t, `${clave} debe nombrar ${c}`).toContain(c)
    }
  })
  it('un planteo con `meta_ads` falla el formato y dice cuáles claves valen', () => {
    const r = validarPlanteo(planteo([{ canal: 'meta_ads', peso: 0.5 }, { canal: 'meta_ig', peso: 0.5 }]))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.errores.join(' ')).toMatch(/meta_ads.*no es una clave válida.*meta_ig/)
  })
  it('con `meta_ig` activo la validación pasa y `redes` habla (la contradicción del intento 2 no se repite)', () => {
    const r = validarPlanteo(planteo([{ canal: 'meta_ig', peso: 0.6 }, { canal: 'busqueda_local', peso: 0.1 }, { canal: 'base_propia', peso: 0.3 }]))
    expect(r.ok).toBe(true)
    expect(especialistasQueHablan([{ canal: 'meta_ig', activo: true }]).redes).toBe(true)
    // lo que escribió el agente en el intento 2: ninguna de sus claves despierta a `redes`
    expect(especialistasQueHablan([{ canal: 'meta_ads', activo: true }, { canal: 'instagram', activo: true }]).redes).toBe(false)
  })
})

describe('B · el esquema de las consultas va ESCRITO, y más de 3 preguntas no tira el turno', () => {
  it('redes, búsqueda y medición traen el esquema escrito (no «el mismo de arriba»)', () => {
    for (const clave of ['redes', 'busqueda', 'medicion']) {
      const t = pedidoDelAgente(paso(clave), {})
      expect(t, clave).not.toMatch(/Mismo esquema/)
      expect(t, clave).toContain('"supuestos"')
      expect(t, clave).toMatch(/MÁXIMO 3/)
      expect(t, clave).toContain('"preguntas_a_otros"')
    }
  })
  it('una consulta con 5 preguntas se RECORTA a 3 y queda marcado en `alertas` (antes fallaba el turno entero)', () => {
    const p = [1, 2, 3, 4, 5].map((n) => ({ a: 'fpa', pregunta: `p${n}` }))
    const r = validarConsulta(consulta({ preguntas_a_otros: p }))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.valor.preguntas_a_otros).toHaveLength(3)
      expect(r.valor.preguntas_a_otros.map((x) => x.pregunta)).toEqual(['p1', 'p2', 'p3'])
      expect(r.valor.alertas.join(' ')).toMatch(/recortado de 5 a 3/)
    }
  })
  it('con 3 o menos preguntas no se toca nada (ni se agrega alerta)', () => {
    const r = validarConsulta(consulta({ preguntas_a_otros: [{ a: 'fpa', pregunta: 'uno' }] }))
    expect(r.ok).toBe(true)
    if (r.ok) { expect(r.valor.preguntas_a_otros).toHaveLength(1); expect(r.valor.alertas).toEqual([]) }
  })
  it('lo que sigue siendo formato roto sigue fallando: sin `supuestos` (la forma del intento 2) y rangos inválidos', () => {
    const sinSupuestos = { agente: 'x', resumen: 'ok', preguntas_a_otros: [], alertas: [] }
    expect(validarConsulta(sinSupuestos).ok).toBe(false)
    expect(validarConsulta(consulta({ supuestos: { ticket: { min: 5, max: 1 } } })).ok).toBe(false)
  })
})

describe('mutación: sin los arreglos, las pruebas anteriores morirían', () => {
  it('quitar la lista cerrada dejaría pasar `meta_ads` (lo que la validación de hoy impide)', () => {
    const sinValidacion = (c: Array<Record<string, unknown>>) => c.every((x) => typeof x.canal === 'string')
    expect(sinValidacion([{ canal: 'meta_ads' }])).toBe(true)
    expect(validarPlanteo(planteo([{ canal: 'meta_ads', peso: 1 }])).ok).toBe(false)
  })
})

describe('arreglo del intento 3 (16-oct) · la FORMA del planteo: plano, número, etiqueta corta', () => {
  it('un planteo envuelto en `{ planteo: {...} }` se desenvuelve y valida', () => {
    const interno = planteo([{ canal: 'meta_ig', peso: 1 }])
    expect(validarPlanteo({ planteo: interno }).ok).toBe(true)
    // el envoltorio no esconde un contenido inválido
    expect(validarPlanteo({ planteo: { ...interno, meta_por_semana: { min: 1, max: 2 } } }).ok).toBe(false)
  })
  it('`meta_por_semana` como objeto y `evento` como descripción larga fallan con un mensaje que dice QUÉ se espera', () => {
    const r = validarPlanteo({ ...planteo([{ canal: 'meta_ig', peso: 1 }]), meta_por_semana: { min: 1280, max: 1450, base: 1360 }, evento: 'Fin de semana del encebollado — contenido ancla publicado el viernes tarde para capturar la demanda' })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.errores.join(' | ')).toMatch(/meta_por_semana debe ser UN NÚMERO/)
      expect(r.errores.join(' | ')).toMatch(/evento debe ser un TEXTO corto de hasta 60 caracteres/)
    }
  })
  it('el pedido del planteo y el del ajuste traen la forma obligatoria con un ejemplo literal', () => {
    for (const clave of ['planteo', 'ajuste']) {
      const t = pedidoDelAgente(paso(clave), {})
      expect(t, clave).toContain('FORMA OBLIGATORIA')
      expect(t, clave).toContain('"meta_por_semana": 20')
      expect(t, clave).toContain('UN NÚMERO')
      expect(t, clave).toMatch(/sin envolverlo/)
    }
  })
  it('lo que ya valía sigue valiendo: el ejemplo literal del pedido VALIDA como planteo', () => {
    const ejemplo = { meta_por_semana: 20, zonas: ['zona_a'], dias_y_horarios: { dias_activos_por_semana: 5, horario: '09:00-17:00' }, evento: 'mensaje', canales: [{ canal: 'meta_ig', peso: 0.6, activo: true }, { canal: 'base_propia', peso: 0.4 }], produccion: { fraccion: 0.2 }, marca: 0.1, no_se: ['lo que no sabes'] }
    expect(validarPlanteo(ejemplo).ok).toBe(true)
  })
})
