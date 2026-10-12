/** r78 · ensayo del tramo 2 · la copia por filas «④ Chequeos»: el índice del bucle de campos pisaba `c` y el chequeo «cada fila del lote sale briefeada UNA vez» nunca marcaba nada. */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'

const raiz = process.cwd()
const leer = (f: string) => JSON.parse(fs.readFileSync(path.join(raiz, f), 'utf8').replace(/^﻿/, ''))
const codigoDe = (flujo: { nodes: Array<{ name: string; parameters: { jsCode?: string } }> }) => flujo.nodes.find((n) => n.name === '④ Chequeos')!.parameters.jsCode!
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...a: unknown[]) => Promise<Array<{ json: Record<string, unknown> }>>
const ENTRADA = leer('__tests__/fixtures/copia-parte-entrada-r78.json') as Record<string, unknown>

async function correr(codigo: string, ajusta: (e: Record<string, unknown>, parte: Record<string, unknown>) => void) {
  const e = JSON.parse(JSON.stringify(ENTRADA)) as Record<string, unknown>
  const parte = JSON.parse(String(e.texto).replace(/^```json\s*/, '').replace(/```\s*$/, '')) as Record<string, unknown>
  ajusta(e, parte)
  e.texto = '```json\n' + JSON.stringify(parte) + '\n```'
  const f = new AsyncFunction('$input', '$', '$json', '$workflow', '$execution', codigo)
  const sal = await f({ first: () => ({ json: e }) }, () => ({ first: () => ({ json: e }), all: () => [{ json: e }] }), e, { id: 'x' }, { id: 'x' })
  return sal[0].json as { hallazgos: Array<{ chequeo: string; entregable: string | null }>; chequeos_ok: boolean }
}
const marcas = (r: { hallazgos: Array<{ chequeo: string }> }) => r.hallazgos.map((h) => h.chequeo)

describe('copia por filas · cada fila del lote sale briefeada exactamente una vez', () => {
  const antes = codigoDe(leer('scripts/worker-staging/cadena/copia-r78-ANTES.json'))
  const despues = codigoDe(leer('scripts/worker-staging/cadena/copia-r78-ARREGLADO.json'))

  it('el defecto: con el flujo de antes, un parte que NO brieffea la fila del lote pasaba limpio', async () => {
    const r = await correr(antes, (e) => { e.fila_ids = ['s1-d4-a'] })
    expect(marcas(r)).not.toContain('fila_sin_brief')
  })
  it('arreglado: una fila del lote sin brief se marca', async () => {
    const r = await correr(despues, (e) => { e.fila_ids = ['s1-d4-a'] })
    expect(marcas(r)).toContain('fila_sin_brief')
    expect(r.chequeos_ok).toBe(false)
  })
  it('arreglado: la fila briefeada una vez pasa; repetida se marca; una fila ajena se marca', async () => {
    const una = await correr(despues, (e, p) => { e.fila_ids = ['s1-d4-a']; const ents = (p.parte as Record<string, unknown>).entregables as Array<Record<string, unknown>>; ents.length = 1; ents[0].fila_id = 's1-d4-a' })
    expect(marcas(una)).not.toContain('fila_sin_brief'); expect(marcas(una)).not.toContain('fila_repetida'); expect(marcas(una)).not.toContain('fila_ajena')
    const dos = await correr(despues, (e, p) => { e.fila_ids = ['s1-d4-a']; for (const x of (p.parte as Record<string, unknown>).entregables as Array<Record<string, unknown>>) x.fila_id = 's1-d4-a' })
    expect(marcas(dos)).toContain('fila_repetida')
    const ajena = await correr(despues, (e, p) => { e.fila_ids = ['s1-d4-a']; const ents = (p.parte as Record<string, unknown>).entregables as Array<Record<string, unknown>>; ents.length = 1; ents[0].fila_id = 's9-d9-z' })
    expect(marcas(ajena)).toContain('fila_ajena')
  })
  it('el arreglo cambia SOLO el índice del bucle', () => {
    const a = antes.split('\r\n').join('\n'); const d = despues.split('\r\n').join('\n')
    expect(a.replace('for (var c = 0; c < CAMPOS_OBLIGATORIOS.length; c++) {\n      var k = CAMPOS_OBLIGATORIOS[c]', 'for (var ci = 0; ci < CAMPOS_OBLIGATORIOS.length; ci++) {\n      var k = CAMPOS_OBLIGATORIOS[ci]')).toBe(d)
  })
})
