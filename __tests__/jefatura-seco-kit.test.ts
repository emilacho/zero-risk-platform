/**
 * KIT DEL SECO J5 (CC#2): la matriz de §13.3 corre COMPLETA contra las rutas reales de J3 con la base falsa (US$ 0). Si una celda no da lo que el diseño espera, esta prueba la nombra:
 * o el diseño/la expectativa está mal, o la ruta no hace lo firmado. Es el mismo conductor (`nucleo.mjs`) que J5 usa contra Vercel y n8n.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { baseDelSeco, LLAVE_LOCAL, transporteLocal } from './_helpers/transporte-local-jefatura'
import { CLIENTES } from '../scripts/ops/jefatura-seco/fixtures.mjs'
import { CASOS_DE_PUERTA, celdas, resumenDeLaMatriz } from '../scripts/ops/jefatura-seco/matriz.mjs'
import { correrPorRuta, puerta, resumirMedidas } from '../scripts/ops/jefatura-seco/nucleo.mjs'

const h = vi.hoisted(() => ({ db: null as unknown }))
vi.mock('@/lib/supabase', () => ({ getSupabaseAdmin: () => h.db }))

import { POST as REVISIONES } from '../src/app/api/jefatura/revisiones/route'
import { POST as TURNOS } from '../src/app/api/jefatura/turnos/route'
import { POST as VIGIA } from '../src/app/api/jefatura/vigia/route'

const db = () => h.db as ReturnType<typeof baseDelSeco>
const IDS = CLIENTES.map((c: { id: string }) => c.id)
beforeEach(() => { h.db = baseDelSeco(IDS); process.env.SALA_DISPATCH_KEY = LLAVE_LOCAL })
const T = () => transporteLocal({ revisiones: REVISIONES, turnos: TURNOS, vigia: VIGIA }, db)

describe('el kit: clientes de práctica', () => {
  it('son 3 rubros distintos, marcados de prueba, ninguno es naufrago.ec, uno declara voseo y dos tuteo', () => {
    expect(CLIENTES.map((c: { rubro: string }) => c.rubro)).toEqual(['restaurante', 'servicios profesionales', 'retail'])
    expect(CLIENTES.every((c: { id: string; nombre: string }) => c.id.startsWith('prueba-jefatura-seco-') && c.nombre.includes('(PRUEBA)'))).toBe(true)
    expect(JSON.stringify(CLIENTES)).not.toMatch(/naufrago|náufrago/i)
    expect(CLIENTES.map((c: { registro: string }) => c.registro).sort()).toEqual(['tuteo', 'tuteo', 'voseo'])
  })
  it('la matriz tiene celdas de los 5 tipos × 3 rubros × 2 registros', () => {
    const r = resumenDeLaMatriz()
    expect(Object.keys(r.por_tipo).sort()).toEqual(['brief', 'calendario', 'estrategia', 'pieza', 'plan'])
    for (const t of ['pieza', 'brief', 'calendario', 'estrategia', 'plan']) expect(r.por_tipo[t] % 6, t).toBe(0)
  })
})

describe('la matriz de §13.3 completa, por la ruta, contra las rutas reales de J3', () => {
  it('cada celda da lo que el diseño espera (las que no, se nombran)', async () => {
    const todas = celdas({ corrida: 'k1' })
    const malas: string[] = []
    const resultados = []
    for (const esc of todas) {
      const r = await correrPorRuta(esc, T())
      resultados.push(r)
      if (!r.ok) malas.push(`${esc.id}\n     ${r.fallos.join('\n     ')}`)
    }
    // eslint-disable-next-line no-console
    console.log("MEDIDAS", JSON.stringify(resumirMedidas(resultados)))
    expect(malas, `\n${malas.join('\n')}`).toEqual([])
  }, 300000)
})

describe('la puerta: lo que la ruta debe negarse a abrir', () => {
  it.each(CASOS_DE_PUERTA.map((c: { caso: string }) => [c.caso]))('%s', async (nombre) => {
    const caso = CASOS_DE_PUERTA.find((c: { caso: string }) => c.caso === nombre)
    const base = celdas({ tipos: ['pieza'], clientes: [IDS[0]], registros: ['tuteo'], casos: ['sin-fichas-gpt-vacio'], corrida: 'p1' })[0].sobre
    const r = await puerta(caso, base, T())
    expect(r.fallos, JSON.stringify(r.observado)).toEqual([])
  })
})
