/**
 * 01-nov · ADENDA 1 del equipo del manual · PARTE 4 · el eslogan real del cliente llega al Brief (`PQdIgbuFexuBsoh8`), a la parte por filas (`BNXqlaX1oHSfZIpF`) y a la Pieza (`lVCLzxQCKNkd3uS0`). US$ 0, sin red.
 * Se ejecuta el CÓDIGO REAL de los nodos (guarda del manual y armado del pedido). Fija: el GET trae `tagline`; la guarda lo pasa como `manual_tagline`; el pedido lleva el bloque con la regla;
 * sin `tagline` el pedido es IDÉNTICO al del flujo sin esta parte (palabras del manual ya aplicadas).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { NODOS_BRIEF, NODOS_PIEZA } from '../scripts/ops/oficina-marketing/construir-palabras.mjs'
import { construirPalabrasDelManual } from '../scripts/ops/oficina-marketing/palabras-del-manual.mjs'
import { construirJerarquiaDeFuentes, construirPlanAprobado } from '../scripts/ops/oficina-marketing/plan-aprobado.mjs'
import { recorrer } from './_emulador-n8n'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (d: string, id: string) => JSON.parse(fs.readFileSync(path.join(RAIZ, d, `${id}.json`), 'utf8'))
const BRIEF = 'PQdIgbuFexuBsoh8', PIEZA = 'lVCLzxQCKNkd3uS0', CADENA = 'BNXqlaX1oHSfZIpF'
const FRASE = 'Cuando tengas esa hambre de... Náufrago te espera!'
const cambiados = (a: any, b: any) => b.nodes.filter((n: any) => { const o = a.nodes.find((x: any) => x.name === n.name); return !o || JSON.stringify(o.parameters) !== JSON.stringify(n.parameters) }).map((n: any) => n.name).sort()
const sig = (f: any, nodo: string): string => f.connections[nodo].main[0][0].node
const codigoDe = (f: any, nombre: string): string => f.nodes.find((n: any) => n.name === nombre).parameters.jsCode

// el flujo SIN la parte 4 = el respaldo con las palabras del manual (lo que ya estaba certificado)
// (más el plan aprobado y la jerarquía de fuentes, que se prueban aparte en flujos-oficina-marketing-plan-aprobado.test.ts)
const sinParte4 = (id: string) => { const f = leer('vivo', id); construirPalabrasDelManual(f); if (id === BRIEF) { construirPlanAprobado(f); construirJerarquiaDeFuentes(f) } if (id === CADENA) construirJerarquiaDeFuentes(f); return f }

const MANUAL = (extra: Record<string, unknown> = {}) => ({ id: 'm-1', version: 2, created_at: '2026-11-01T00:00:00Z', gate_outcome: 'paso_la_vara', forbidden_words: [], required_terminology: [], content_text: 'TEXTO DEL MANUAL', voice_description: 'Tutea siempre (tú/sabes/pides — nunca vos).', writing_style: null, tone_guidelines: {}, ...extra })

describe('alcance · solo se toca lo previsto', () => {
  it.each([[BRIEF, NODOS_BRIEF], [CADENA, NODOS_BRIEF], [PIEZA, NODOS_PIEZA]])('%s: cambian el GET del manual, su guarda y el armado del pedido, nada más', (id, nodos) => {
    const a = sinParte4(id), b = leer('nuevo', id)
    expect(cambiados(a, b).filter((n: string) => !n.startsWith('③ Hoja')).filter((n: string) => ![nodos.cargar, nodos.guarda, nodos.armar].includes(n) && n !== '④ Chequeos' && n !== '⑦ Chequeos')).toEqual([])
    for (const n of [nodos.cargar, nodos.guarda, nodos.armar]) expect(cambiados(a, b)).toContain(n)
    expect(b.connections).toEqual(id === CADENA ? b.connections : a.connections)
  })
  it.each([BRIEF, CADENA, PIEZA])('%s: el GET pide la columna `tagline` una sola vez', (id) => {
    const f = leer('nuevo', id)
    const n = f.nodes.find((x: any) => x.type.endsWith('httpRequest') && /client_brand_books\?select=/.test(x.parameters.url))
    expect(n.parameters.url.match(/[?&,]tagline[,&]/g)?.length).toBe(1)
    expect(sinParte4(id).nodes.find((x: any) => x.name === n.name).parameters.url).not.toMatch(/tagline/)
  })
})

describe('la guarda del manual pasa el eslogan', () => {
  it.each([[BRIEF, NODOS_BRIEF.guarda, '⓪ Sobre · llave · modo seco'], [CADENA, NODOS_BRIEF.guarda, '⓪ GUARDA · el lote']])('%s: `manual_tagline` es el texto limpio y acotado', async (id, guarda, previo) => {
    const f = leer('nuevo', id)
    const correr = async (m: any) => (await recorrer(f, guarda, m, { previos: { [previo]: [{ client_id: 'c-1' }] }, hasta: [sig(f, guarda)] })).historial[guarda][0]
    expect((await correr(MANUAL({ tagline: FRASE }))).manual_tagline).toBe(FRASE)
    expect((await correr(MANUAL({ tagline: '  a \n  b  ' }))).manual_tagline).toBe('a b')
    expect((await correr(MANUAL({ tagline: 'x'.repeat(900) }))).manual_tagline.length).toBe(300)
    for (const t of [null, undefined, 42, ['x'], { texto: 'x' }, '   ']) expect((await correr(MANUAL({ tagline: t }))).manual_tagline).toBe('')
  })
  it('pieza: igual', async () => {
    const f = leer('nuevo', PIEZA)
    const correr = async (m: any) => (await recorrer(f, NODOS_PIEZA.guarda, m, { previos: { '① GUARDA · el parte y el brief': [{ client_id: 'c-1' }] }, hasta: [sig(f, NODOS_PIEZA.guarda)] })).historial[NODOS_PIEZA.guarda][0]
    expect((await correr(MANUAL({ tagline: FRASE }))).manual_tagline).toBe(FRASE)
    expect((await correr(MANUAL({ tagline: 'x'.repeat(900) }))).manual_tagline.length).toBe(300)
    for (const t of [null, undefined, 42, '   ']) expect((await correr(MANUAL({ tagline: t }))).manual_tagline).toBe('')
  })
})

// el armado del pedido: el código real, con la salida de la guarda que lo alimenta
const armado = async (f: any, nodo: string, prevNombre: string, prev: Record<string, unknown>, entrada: Record<string, unknown>, extraPrevios: Record<string, unknown[]> = {}) => {
  const r = await recorrer(f, nodo, entrada, { previos: { [prevNombre]: [prev], ...extraPrevios }, hasta: [sig(f, nodo)] }).catch((e) => { throw e })
  return r.historial[nodo][0].cuerpo.task as string
}
const BASE_BRIEF = { client_id: 'c-1', dry_run: false, manual_id: 'm-1', manual_version: 2, manual_texto: 'TEXTO DEL MANUAL', manual_voz: { voice_description: 'Tutea siempre (tú/sabes/pides — nunca vos).', writing_style: null, tone_guidelines: {} }, forbidden_words: [], required_terminology: [], plan_id: 'p-1', plan_texto: 'TEXTO DEL PLAN', plan_version: 1 }

describe('el pedido del brief y de la cadena por filas', () => {
  it.each([BRIEF, CADENA])('%s: con eslogan lleva el bloque con la frase y la regla, tras el texto del manual y antes del plan', async (id) => {
    const f = leer('nuevo', id)
    const t = await armado(f, NODOS_BRIEF.armar, '② ¿Ya hay parte de este plan? · guarda', { ...BASE_BRIEF, manual_tagline: FRASE }, { name: 'Náufrago', country: 'Ecuador', config: {} })
    expect(t).toContain('ESLOGAN QUE EL CLIENTE YA USA (activo de marca EXISTENTE)')
    expect(t).toContain('«' + FRASE + '»')
    expect(t).toMatch(/es un HECHO de la marca, no una opción/)
    expect(t).toContain('en «contradicciones_plan_vs_manual» y rotúlalo PROPUESTA') // la regla del bloque, no la mención suelta del resto del pedido
    expect(t).toMatch(/PROPUESTA/)
    expect(t.split('ESLOGAN QUE EL CLIENTE YA USA').length).toBe(2)
    expect(t.indexOf('TEXTO DEL MANUAL')).toBeLessThan(t.indexOf('ESLOGAN QUE EL CLIENTE YA USA'))
    expect(t.indexOf('ESLOGAN QUE EL CLIENTE YA USA')).toBeLessThan(t.indexOf('TEXTO DEL PLAN'))
  })
  it.each([BRIEF, CADENA])('%s: sin eslogan (ausente, vacío, no texto) el pedido es EXACTAMENTE el del flujo sin esta parte', async (id) => {
    const nuevo = leer('nuevo', id), antes = sinParte4(id)
    for (const tag of [undefined, '', '   ', 42, null]) {
      const prev = { ...BASE_BRIEF, ...(tag === undefined ? {} : { manual_tagline: tag }) }
      const ficha = { name: 'Náufrago', country: 'Ecuador', config: {} }
      expect(await armado(nuevo, NODOS_BRIEF.armar, '② ¿Ya hay parte de este plan? · guarda', prev, ficha)).toBe(await armado(antes, NODOS_BRIEF.armar, '② ¿Ya hay parte de este plan? · guarda', prev, ficha))
    }
  })
})

describe('el pedido de la pieza', () => {
  it('el armado de la pieza lleva el bloque antes del brief, una sola vez, con su regla', () => {
    const c = codigoDe(leer('nuevo', PIEZA), NODOS_PIEZA.armar)
    expect(c).toContain('ESLOGAN QUE EL CLIENTE YA USA (activo de marca EXISTENTE)')
    expect(c).toContain("const pedido = [REGLAS, '', ...bloqueEslogan, '════════ EL BRIEF ════════', prev.brief_texto]")
    expect(c).toContain('declara la diferencia en «no_pude_cumplir» y rotula cualquier otro como PROPUESTA')
    expect(codigoDe(sinParte4(PIEZA), NODOS_PIEZA.armar)).not.toContain('bloqueEslogan')
  })
})
