/**
 * LOS TRES PRODUCTORES · P2 · el contrato de entrada de `clients/upsert`
 *
 * Diseño · `raw/tasks/2026-08-23-ARQ-DISENO-los-4-productores-con-forma-vieja.md` v2 §4.
 *
 * ⚠️ LA TRAMPA, textual del diseño: *"no tiró error" NO es la prueba.* Un contrato que
 * descarta el campo EN SILENCIO pasa esa afirmación y deja el bug vivo.
 * **La afirmación es sobre LA PRESENCIA DEL VALOR después de validar.**
 *
 * ⚠️ CENTINELAS DISTINTOS · si `positioning` y `elevator_pitch` llevaran el mismo texto,
 * el bug del campo prestado produciría el mismo resultado que el arreglo y el verde no
 * probaría nada. Por eso son dos textos reconocibles y diferentes.
 *
 * $0 · sin red · sin base · sólo el validador.
 */
import { describe, it, expect } from 'vitest'
import { validateObject } from '../src/lib/input-validator'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const CENTINELA_P = 'CENTINELA-P-2026-08-23'
const CENTINELA_E = 'CENTINELA-E-2026-08-23'

const payload = () => ({
  name: 'Cliente Descartable Prueba',
  brand_book: {
    positioning: CENTINELA_P,
    elevator_pitch: CENTINELA_E,
    voice_description: 'tono de prueba',
  },
})

interface Entrada {
  brand_book?: Record<string, unknown> | null
}

describe('P2 · el contrato acepta `positioning` y NO se lo come', () => {
  it('el valor SIGUE AHÍ después de validar · no alcanza con que no tire error', () => {
    const v = validateObject<Entrada>(payload(), 'clients-upsert')

    // (1) que valide es condición necesaria...
    expect(v.ok, 'el contrato rechazó el payload').toBe(true)

    // (2) ...pero la prueba REAL es que el valor sobrevivió
    const bb = v.ok ? v.data.brand_book : null
    expect(bb, 'brand_book desapareció del payload validado').toBeTruthy()
    expect(bb?.positioning, 'el contrato se comió positioning EN SILENCIO').toBe(CENTINELA_P)
  })

  it('los dos centinelas sobreviven y siguen siendo DISTINTOS', () => {
    const v = validateObject<Entrada>(payload(), 'clients-upsert')
    const bb = v.ok ? v.data.brand_book : null

    expect(bb?.positioning).toBe(CENTINELA_P)
    expect(bb?.elevator_pitch).toBe(CENTINELA_E)
    // si el campo viajara prestado, los dos leerían igual · esto lo caza
    expect(bb?.positioning).not.toBe(bb?.elevator_pitch)
  })

  it('el contrato DECLARA `positioning` · no depende de que additionalProperties lo tolere', () => {
    // Por qué esta prueba existe aparte: hoy `additionalProperties: true` y el validador
    // corre con `removeAdditional: false`, así que un campo NO declarado igual pasa.
    // Eso hace que el campo sobreviva POR ACCIDENTE, no por contrato: el día que alguien
    // cierre additionalProperties o active removeAdditional, se cae en silencio.
    // Declararlo es lo que lo vuelve intencional.
    const esquema = JSON.parse(
      readFileSync(join(__dirname, '..', 'src/lib/contracts/inputs/clients-upsert.json'), 'utf8'),
    )
    const campos = esquema.properties?.brand_book?.properties ?? {}

    expect(Object.keys(campos)).toContain('positioning')
    expect(Object.keys(campos), 'elevator_pitch no se saca · es un campo legítimo').toContain('elevator_pitch')
    expect(campos.positioning?.type).toEqual(['string', 'null'])
  })
})
