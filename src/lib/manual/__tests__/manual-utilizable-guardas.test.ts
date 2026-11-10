/**
 * TRABA DE PIEZAS · arreglo 1 (GO Lenovo 2026-11-10 18:14Z) · una sola regla de «manual utilizable» para las 4 puertas.
 * Dos clientes de rubros distintos con filas REALES (uno pasó la vara, otro lo validó el dueño) + el sabotaje «ni aprobado ni validado → se detiene».
 * Se ejecuta el código de CADA guarda tal como queda en el flujo nuevo, y la copia viva sirve de control: debe reproducir la traba.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { GUARDAS, bloqueDeLaRegla, bloquePegado, construirManualUtilizable } from '../../../../scripts/ops/oficina-marketing/manual-utilizable-en-las-guardas.mjs'
import { manualUtilizable } from '../manual-utilizable'

type Fila = Record<string, unknown>
const FIX = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'manual-utilizable', 'filas-reales.json'), 'utf8')) as Record<string, Fila>
const { pasa_la_vara: VARA, validado_por_el_dueno: DUENO, ni_aprobado_ni_validado: NADA } = FIX
const DIR = path.join(__dirname, '..', '..', '..', '..', 'scripts', 'ops', 'oficina-marketing', 'traba-1')
const flujo = (carpeta: 'vivo' | 'nuevo', id: string) => JSON.parse(fs.readFileSync(path.join(DIR, carpeta, `${id}.json`), 'utf8')) as { id: string; nodes: { name: string; parameters: { jsCode?: string; url?: string } }[] }
const codigoDe = (f: ReturnType<typeof flujo>, nombre: string) => String(f.nodes.find((n) => n.name === nombre)?.parameters.jsCode ?? '')

/** corre el código de una guarda como lo haría n8n: `$('nodo').first().json` y `$input.all()` */
function correr(js: string, manual: Fila, client_id: string): Fila {
  const previo = { client_id, dry_run: false, body: { client_id, dry_run: false }, campana_id: 'c', manual_id_del_parte: null }
  const $ = () => ({ first: () => ({ json: previo }), all: () => [{ json: previo }] })
  const $input = { all: () => [{ json: manual }], first: () => ({ json: manual }) }
  const salida = new Function('$', '$input', js)($, $input) as { json: Fila }[]
  return salida[0].json
}

describe('la regla única', () => {
  it('pasó la vara (seguridad industrial, sin firma del dueño) → utilizable', () => expect(manualUtilizable(VARA)).toMatchObject({ utilizable: true, por: 'vara' }))
  it('validado por el dueño (restaurante, salió al tope) → utilizable', () => expect(manualUtilizable(DUENO)).toMatchObject({ utilizable: true, por: 'dueno' }))
  it('sabotaje · ni pasó la vara ni lo validó el dueño → NO', () => expect(manualUtilizable(NADA).utilizable).toBe(false))
  it('una validación de la jefatura sola no basta (dato construido sobre la fila v4 real)', () => expect(manualUtilizable({ ...NADA, human_validated: true, provenance_tag: { validado_por: 'jefatura' } }).utilizable).toBe(false))
  it('provenance_tag como texto JSON también se lee', () => {
    expect(manualUtilizable({ ...DUENO, provenance_tag: JSON.stringify(DUENO.provenance_tag) }).por).toBe('dueno')
    // la jefatura escrita en TEXTO tampoco basta (dato construido sobre la fila v4 real)
    expect(manualUtilizable({ ...NADA, human_validated: true, provenance_tag: JSON.stringify({ validado_por: 'jefatura' }) }).utilizable).toBe(false)
  })
  it('sin manual, null, o human_validated que no es true exacto → NO', () => {
    for (const m of [null, undefined, 'x', {}, { ...NADA, human_validated: 'true' }, { ...NADA, gate_outcome: 'PASO_LA_VARA' }]) expect(manualUtilizable(m).utilizable).toBe(false)
  })
})

describe.each(Object.entries(GUARDAS))('la guarda del flujo %s', (id, g) => {
  const nuevo = flujo('nuevo', id)
  const js = codigoDe(nuevo, g.guarda)
  it('lleva pegado el MISMO bloque de la regla (ni una letra distinta)', () => {
    expect(bloquePegado(js)).toBe(bloqueDeLaRegla())
    expect(js.split('// ═══ MANUAL UTILIZABLE').length).toBe(2)
  })
  it('la lectura del manual trae las columnas que la regla mira', () => {
    const url = String(nuevo.nodes.find((n) => n.name === g.lectura)?.parameters.url)
    expect(url).toMatch(/[=,]human_validated[,&]/)
    expect(url).toMatch(/[=,]provenance_tag[,&]/)
  })
  it('compila', () => expect(() => new Function('$', '$input', js)).not.toThrow())
  it('pasa con el manual que pasó la vara (seguridad industrial)', () => {
    const r = correr(js, VARA, String(VARA.client_id))
    expect(JSON.stringify(r)).toContain(String(VARA.id).slice(0, 8))
  })
  it('pasa con el manual que validó el dueño (restaurante)', () => {
    const r = correr(js, DUENO, String(DUENO.client_id))
    expect(JSON.stringify(r)).toContain(String(DUENO.id).slice(0, 8))
    if (id !== 'X9F0zp6LQ2xGEYVS') expect(r.manual_aprobado_por).toBe('dueno')
  })
  it('sabotaje · ni aprobado ni validado → se DETIENE con el motivo', () => {
    expect(() => correr(js, NADA, String(NADA.client_id))).toThrow(/MANUAL_NO_APROBADO/)
  })
  it('control · la copia VIVA reproduce la traba con el manual del dueño (salvo planeación, que ya lo aceptaba)', () => {
    const viejo = codigoDe(flujo('vivo', id), g.guarda)
    if (id === 'X9F0zp6LQ2xGEYVS') expect(() => correr(viejo, DUENO, String(DUENO.client_id))).not.toThrow()
    else expect(() => correr(viejo, DUENO, String(DUENO.client_id))).toThrow(/MANUAL_NO_APROBADO/)
  })
  it('el constructor es determinista y no pega dos veces', () => {
    const a = construirManualUtilizable(flujo('vivo', id))
    expect(JSON.stringify(a)).toBe(JSON.stringify(nuevo))
    expect(() => construirManualUtilizable(a)).toThrow(/ya tiene la regla/)
  })
})
