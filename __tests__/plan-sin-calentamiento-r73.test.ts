/**
 * Ronda 73 · la frase de calentamiento del modelo fuera del documento, por código y en general (cualquier agente que entregue un documento).
 * El caso real es el plan `52529141…` de Náufrago (paso 2 de CC#1): empezaba con «Voy a escribir el plan de 90 días… » + `---`.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirCodigo, construirFlujo, FUNCION, NODO } from '../scripts/worker-staging/X9F0zp6LQ2xGEYVS/construir-r73.mjs'

const W = join(process.cwd(), 'scripts/worker-staging/X9F0zp6LQ2xGEYVS')
const quitar = new Function(FUNCION + '\nreturn quitarCalentamiento')() as (t: unknown) => { texto: string; quitado: string }
const PLAN = readFileSync(join(process.cwd(), '__tests__/fixtures/ronda73/plan-52529141.md'), 'utf8')
const ANTES = JSON.parse(readFileSync(join(W, 'planeacion-r73-ANTES.json'), 'utf8'))
const HOY = JSON.parse(readFileSync(join(W, 'planeacion-r73-ARREGLADO.json'), 'utf8'))

describe('el plan REAL guardado', () => {
  it('rojo: empieza con la frase de calentamiento y la raya', () => {
    expect(PLAN.startsWith('Voy a escribir el plan de 90 días para Náufrago con toda la evidencia disponible.\n\n---\n\n# PLAN')).toBe(true)
  })
  it('verde: empieza en el título; el resto es idéntico, byte por byte', () => {
    const r = quitar(PLAN)
    expect(r.texto.startsWith('# PLAN DE CAMPAÑA 90 DÍAS · NÁUFRAGO\n')).toBe(true)
    expect(r.quitado).toBe('Voy a escribir el plan de 90 días para Náufrago con toda la evidencia disponible.')
    expect(PLAN.endsWith(r.texto)).toBe(true)
    expect(PLAN.length - r.texto.length).toBe(PLAN.indexOf('# PLAN'))
  })
  it('idempotente: lo ya limpio no cambia', () => { const a = quitar(PLAN).texto; expect(quitar(a)).toEqual({ texto: a, quitado: '' }) })
})

describe('general: cualquier documento, cualquier cliente', () => {
  it.each([
    ['Aquí tienes el informe:\n\n# Informe\ncuerpo', '# Informe\ncuerpo'],
    ['Claro, aquí va el manual.\n\n---\n\n## Manual\ntexto', '## Manual\ntexto'],
    ['Perfecto. Ahora redacto el plan con la evidencia.\n---\n# Plan\n', '# Plan\n'],
    ['A continuación te entrego el calendario.\n\n***\n\n# Calendario', '# Calendario'],
    ['Voy a armar el parte.\n\nCon toda la evidencia disponible.\n\n---\n\n# Parte', '# Parte'],
    ['Sure, here is the report:\n\n# Report', '# Report'],
    ['Here\'s the plan.\n\n---\n\n## Plan', '## Plan'],
    ['﻿\n  Voy a escribir el plan.\n\n# Plan', '# Plan'],
  ])('%j', (entrada, esperado) => { expect(quitar(entrada).texto).toBe(esperado) })
})

describe('ante la duda NO se toca', () => {
  it.each([
    ['ya empieza en un título', '# Plan\nVoy a escribir esto.'],
    ['sin documento detrás (no hay título)', 'Voy a escribir el plan. Todo el texto es una sola cosa sin títulos.'],
    ['el bloque inicial es contenido, no acompañamiento', 'Náufrago abre de jueves a lunes.\n\n# Plan'],
    ['el bloque inicial tiene viñetas', 'Voy a escribir:\n- punto uno\n- punto dos\n\n# Plan'],
    ['el bloque inicial tiene una tabla', 'Aquí tienes:\n| a | b |\n\n# Plan'],
    ['más de tres párrafos', 'Voy a uno.\n\nDos.\n\nTres.\n\nCuatro.\n\n# Plan'],
    ['un párrafo demasiado largo para ser una frase de acompañamiento', 'Voy a escribir ' + 'palabra '.repeat(60) + '\n\n# Plan'],
  ])('%s', (_n, entrada) => { expect(quitar(entrada)).toEqual({ texto: entrada, quitado: '' }) })
  it('vacío, nulo y no-texto', () => {
    expect(quitar('')).toEqual({ texto: '', quitado: '' }); expect(quitar(null).texto).toBe(''); expect(quitar(undefined).texto).toBe('')
  })
  it('el título «#» sin espacio (hashtag) no es un título de markdown', () => {
    const t = 'Voy a escribir el plan.\n\n#hashtag al inicio de una línea\n\nmás texto'
    expect(quitar(t)).toEqual({ texto: t, quitado: '' })
  })
  it('una raya en medio del documento no se toca (solo la inmediata al título)', () => {
    const t = '# Plan\n\ntexto\n\n---\n\n## Otra sección'
    expect(quitar(t).texto).toBe(t)
  })
})

describe('el nodo «¿Llegó la vuelta?» del flujo de planeación', () => {
  const nodo = (f: any) => f.nodes.find((n: any) => n.name === NODO).parameters.jsCode as string
  it('SOLO cambia ese nodo; conexiones y ajustes idénticos', () => {
    const cambian = ANTES.nodes.filter((n: any) => JSON.stringify(n) !== JSON.stringify(HOY.nodes.find((x: any) => x.name === n.name))).map((n: any) => n.name)
    expect(cambian).toEqual([NODO]); expect(JSON.stringify(HOY.connections)).toBe(JSON.stringify(ANTES.connections))
  })
  it('se reconstruye igual desde el respaldo', () => { expect(JSON.stringify(construirFlujo({ name: 'x', nodes: ANTES.nodes, connections: ANTES.connections, settings: {} }).nodes)).toBe(JSON.stringify(HOY.nodes)) })
  it('no se aplica a ciegas si el texto cambió, ni dos veces', () => {
    expect(() => construirCodigo('const x = 1')).toThrow(/aparece 0 veces/)
    expect(() => construirCodigo(nodo(HOY))).toThrow(/ya tiene quitarCalentamiento/)
  })

  const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>
  async function correr(f: any, respuesta: string, registro = 'tuteo') {
    const fn = new AsyncFunction('$input', '$', nodo(f))
    const $ = (n: string) => {
      if (n === 'elegir brazos') return { first: () => ({ json: { descartados: [] } }) }
      if (n === 'Redactor (B4)') return { first: () => ({ json: { registro_usado: { registro }, cliente_id: 'c1' } }) }
      if (n === 'Ficha del cliente') return { first: () => ({ json: { name: 'Cliente X' } }) }
      throw new Error('nodo ' + n)
    }
    const salida = await fn({ first: () => ({ json: { body: { response: respuesta } } }) }, $)
    return salida[0].json as Record<string, any>
  }
  it('rojo (antes): el texto guardado y el que va al PDF empiezan con la frase', async () => {
    const j = await correr(ANTES, PLAN)
    expect(j.texto.startsWith('Voy a escribir el plan')).toBe(true)
  })
  it('verde: el texto que sale del nodo (guardado + PDF + brief) empieza en el título y dice cuánto se quitó', async () => {
    const j = await correr(HOY, PLAN)
    expect(j.texto.startsWith('# PLAN DE CAMPAÑA 90 DÍAS · NÁUFRAGO')).toBe(true)
    expect(j.texto).toContain('## Lo que NO se buscó y por qué'); expect(j.texto).not.toContain('Voy a escribir el plan')
    expect(j.calentamiento_quitado).toBe('Voy a escribir el plan de 90 días para Náufrago con toda la evidencia disponible.')
    expect(j.llego_la_vuelta).toBe(true)
  })
  it('el voseo del plan se sigue corrigiendo después de quitar la frase', async () => {
    const j = await correr(HOY, 'Voy a escribir el plan.\n\n---\n\n# Plan\nPedí el menú en el sitio.')
    expect(j.texto).toContain('# Plan\nPide el menú en el sitio.'); expect(j.registro_revisado.corregidas).toBe(1)
  })
  it('sin frase de calentamiento: el texto sale igual que antes (más el bloque del sistema) y calentamiento_quitado es null', async () => {
    const limpio = quitar(PLAN).texto
    const [a, b] = [await correr(ANTES, limpio), await correr(HOY, limpio)]
    expect(b.texto).toBe(a.texto); expect(b.calentamiento_quitado).toBeNull()
  })
  it('una respuesta que es SOLO la frase (sin documento) no se vacía: se conserva tal cual', async () => {
    const j = await correr(HOY, 'Voy a escribir el plan.')
    expect(j.llego_la_vuelta).toBe(true); expect(j.texto).toContain('Voy a escribir el plan.')
  })
  it('la vuelta que no llegó sigue sin llegar', async () => {
    const j = await correr(HOY, '')
    expect(j.llego_la_vuelta).toBe(false); expect(j.calentamiento_quitado).toBeNull()
  })
})
