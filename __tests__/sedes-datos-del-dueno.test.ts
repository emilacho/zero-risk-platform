/** Los datos de sede dichos por el dueño (fuente «dueno», campo «tipo_de_atencion») no rompen ni cambian la resolución de dirección, horario y canal de pedido. */
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const L = createRequire(import.meta.url)(join(process.cwd(), 'src', 'lib', 'sedes', 'sedes-logica.js'))
const base = [
  { sede: 'costa', ciudad: null, campo: 'direccion', valor_texto: 'Calle 1', valor_norm: 'calle-1', fuente: 'sitio', fuente_ref: 'x', observado_en: '2026-10-11T10:00:00Z', alcance: 'sede' },
  { sede: 'costa', ciudad: null, campo: 'horario', valor_texto: 'lunes a viernes 08:00–16:00', valor_norm: { 1: '08:00-16:00' }, fuente: 'mapas', fuente_ref: 'm', observado_en: '2026-10-11T10:00:00Z', alcance: 'sede' },
]
const dueno = { sede: 'costa', ciudad: null, campo: 'tipo_de_atencion', valor_texto: 'restaurante (local) y domicilio', valor_norm: { local: true, domicilio: true }, fuente: 'dueno', fuente_ref: 'dueño', observado_en: '2026-10-12T10:00:00Z', alcance: 'sede' }

describe('observaciones del dueño en el resolvedor de sedes', () => {
  it('no cambian lo resuelto de dirección, horario y canal de pedido, y no lanzan', () => {
    const sin = L.resolverSedes([{ clave: 'costa', ciudad: 'Costa' }], base)
    const con = L.resolverSedes([{ clave: 'costa', ciudad: 'Costa' }], [...base, dueno])
    for (const k of ['direccion', 'horario', 'canal_pedido']) expect(JSON.stringify(con[0][k]), k).toBe(JSON.stringify(sin[0][k]))
  })
})
