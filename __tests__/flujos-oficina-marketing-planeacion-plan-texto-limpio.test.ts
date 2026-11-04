/**
 * 03-nov · el redactor del plan recibe el bloque de «texto limpio» (solo indicación, sin control). US$ 0, sin red.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { FRASE_PLAN_LIMPIO } from '../scripts/ops/oficina-marketing/plan-texto-limpio.mjs'

const f = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing', 'nuevo', 'X9F0zp6LQ2xGEYVS.json'), 'utf8'))
const codigo = f.nodes.find((n: any) => n.name === 'Redactor (B4)').parameters.jsCode as string

describe('el redactor del plan recibe el bloque de texto limpio', () => {
  it('lo lleva una sola vez en el pedido', () => {
    expect(codigo.split(FRASE_PLAN_LIMPIO).length - 1).toBe(1)
  })
  it('pide lo que hoy falta: supuestos dichos como supuestos, sin prefijos del sistema y el presupuesto completo', () => {
    expect(FRASE_PLAN_LIMPIO).toMatch(/supuesto/)
    expect(FRASE_PLAN_LIMPIO).toMatch(/sin nombres internos/)
    expect(FRASE_PLAN_LIMPIO).toMatch(/PROPUESTA \(no es dato del cliente\)/)
    expect(FRASE_PLAN_LIMPIO).toMatch(/ventas necesarias/)
    expect(FRASE_PLAN_LIMPIO).toMatch(/dos escenarios/)
  })
  it('es indicación, no control: no menciona rechazar, bloquear ni validar', () => {
    expect(FRASE_PLAN_LIMPIO).not.toMatch(/rechaz|bloque|valid|prohib/i)
  })
})
