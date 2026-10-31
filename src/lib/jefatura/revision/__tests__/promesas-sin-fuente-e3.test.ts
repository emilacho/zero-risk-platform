/**
 * E3 (firmada) · promesas sin fuente en la pieza: la regla es DATO de la política `pieza` (migración 202610312009) y llega al revisor de fondo por la indicación; no frena. US$ 0.
 * Se lee la migración real y se ejerce `tareaDeRevisionDeFondo` real con esa indicación.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { tareaDeRevisionDeFondo } from '../pedidos'
import type { PayloadDeRevision } from '../contrato'

const RAIZ = path.join(__dirname, '..', '..', '..', '..', '..', 'supabase')
const SQL = fs.readFileSync(path.join(RAIZ, 'migrations', '202610312009_jefatura_pieza_promesas_sin_fuente.sql'), 'utf8')
const REV = fs.readFileSync(path.join(RAIZ, 'reversas', '202610312009_jefatura_pieza_promesas_sin_fuente_REVERSA.sql'), 'utf8')
const BASE = fs.readFileSync(path.join(RAIZ, 'migrations', '202610131000_jefatura_revision_oficina_propia.sql'), 'utf8')
const REGLA = /\$e3\$([\s\S]*?)\$e3\$/.exec(SQL)![1]
const INDICACION_PIEZA = /\$ind\$(No repartes trabajo[\s\S]*?)\$ind\$/.exec(BASE.slice(BASE.indexOf("('pieza', 'revision'")))![1]

describe('promesas sin fuente · política pieza', () => {
  it('la migración solo toca la política pieza, es aditiva e idempotente, y la regla no frena ni fija idioma', () => {
    expect(SQL).toMatch(/WHERE artifact_type = 'pieza'/)
    expect(SQL).toContain("NOT LIKE '%Promesas sin fuente:%'")
    expect(SQL).not.toMatch(/DELETE|DROP|INSERT/i)
    for (const p of ['precio', 'el más', 'gratis', 'salud', 'origen']) expect(REGLA).toContain(p)
    expect(REGLA).toContain('"sugerencia"')
    expect(REGLA).toContain('no frena')
    expect(REGLA).not.toMatch(/bloquea|Ecuador|tuteo|voseo|español/i)
  })
  it('la reversa devuelve la indicación a la de antes', () => {
    expect(REV).toContain("split_part(indicacion_fondo, ' Promesas sin fuente:', 1)")
    const despues = INDICACION_PIEZA + ' ' + REGLA
    expect(despues.split(' Promesas sin fuente:')[0].trim()).toBe(INDICACION_PIEZA.trim())
  })
  it('el revisor de fondo recibe la regla (con la indicación de la política) y el formato de fichas sigue igual', () => {
    const politica = { indicacion_fondo: INDICACION_PIEZA + ' ' + REGLA, contra_que: [{ clave: 'manual', titulo: 'Manual de marca vigente', funcion: '' }] }
    const t = tareaDeRevisionDeFondo({ politica: politica as never, payload: { contexto: [] } as unknown as PayloadDeRevision, tipo: 'pieza' as never, texto: 'Gratis el primer plato', duenos: [] })
    expect(t.task).toContain('Promesas sin fuente:')
    expect(t.task).toContain('"gravedad":"bloquea|sugerencia"')
    expect(t.indicacion).toContain('Promesas sin fuente:')
  })
})
