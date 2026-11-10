/**
 * 10-nov · el «Pedir cambios» real de Emilio (costa → playa) dio un brief v3 bien escrito pero DEVUELTO por código: el v2 se validó antes de #968, que volvió
 * obligatorias «## Público» y «## Cómo sabremos que funcionó», y la mesa lo conservó «tal cual». Dos devoluciones → la campaña a revisión humana.
 * Arreglo: el bloque del brief anterior nombra las secciones obligatorias que le faltan (con el MISMO criterio que el lector) y ordena agregarlas desde el plan.
 * Datos: los briefs v2 y v3 REALES de Náufrago (campaña 28de888e), leídos de la base el 10-nov.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import { leerBriefCreativo, seccionesObligatoriasQueFaltan } from '../brief-creativo'
import { briefAnteriorParaElMarco, ordenDeAnalisisDeImpacto, TITULO_DE_LO_QUE_CAMBIO } from '../cambios-pedidos'
import { marcoDelBrief, marcoDelConcepto } from '../mesas'

const fx = (n: string) => readFileSync(join(__dirname, '..', '__fixtures__', n), 'utf8')
const V2 = fx('brief-naufrago-v2-real.md')
const V3 = fx('brief-naufrago-v3-real.md')
const FALTAN = ['Público', 'Cómo sabremos que funcionó']
const COMPLETO = [
  '## De qué parte del plan sale', 'Fase 1: «Se publican 3 posts por semana».',
  '## Insight', 'La gente del barrio desayuna de pie.',
  '## Mensaje', 'Hay mesa desde las siete.',
  '## Público', 'Vecinos del barrio que desayunan fuera.',
  '## Objetivo', 'Que entren 30 desayunos nuevos por semana.',
  '## Cómo sabremos que funcionó', 'Pedidos por semana contra la meta del plan.',
  '## Tono', 'Cercano y directo.',
  '## Obligatorios', '- vocabulario: pan de masa madre',
].join('\n')

describe('qué secciones obligatorias le faltan a un brief (mismo criterio que el lector)', () => {
  it('🔴 el v2 real de Náufrago: le faltan «Público» y «Cómo sabremos que funcionó»', () => {
    expect(seccionesObligatoriasQueFaltan(V2)).toEqual(FALTAN)
  })
  it('🔴 coincide con lo que bloqueó el lector en el v3 real (la devolución de hoy)', () => {
    const bloqueos = leerBriefCreativo(V3, { planTexto: '', prohibidas: [] }).bloqueos.filter((b) => b.startsWith('falta la sección'))
    expect(bloqueos).toEqual(FALTAN.map((k) => `falta la sección «## ${k}»`))
    expect(seccionesObligatoriasQueFaltan(V3)).toEqual(FALTAN)
  })
  it('un brief completo no le falta nada; una sección con título pero vacía cuenta como faltante', () => {
    expect(seccionesObligatoriasQueFaltan(COMPLETO)).toEqual([])
    expect(seccionesObligatoriasQueFaltan(COMPLETO.replace('Vecinos del barrio que desayunan fuera.', ''))).toEqual(['Público'])
  })
})

describe('el bloque del brief anterior pide agregar lo que falta', () => {
  it('🔴 con el v2 real: nombra las dos secciones, manda escribirlas desde el PLAN y desactiva «conservar tal cual» para ellas', () => {
    const b = briefAnteriorParaElMarco({ version: 2, texto_md: V2 })
    expect(b).toContain('# LO QUE LE FALTA AL BRIEF ANTERIOR')
    expect(b).toContain('«## Público», «## Cómo sabremos que funcionó»')
    expect(b).toContain('PLAN')
    expect(b).toContain('«Conservar tal cual» no vale para una sección que falta')
    expect(b).toContain(`«## ${TITULO_DE_LO_QUE_CAMBIO}»`)
    // el aviso va DESPUÉS del texto anterior (la mesa lo lee al final, junto a lo que va a escribir)
    expect(b.indexOf('# LO QUE LE FALTA')).toBeGreaterThan(b.indexOf('## Citas'))
  })
  it('🔴 con un anterior completo no hay aviso (el pedido sigue siendo solo el cambio)', () => {
    expect(briefAnteriorParaElMarco({ version: 2, texto_md: COMPLETO })).not.toContain('LO QUE LE FALTA')
  })
  it('🔴 en el marco real del brief: con nota y el v2 real, el aviso llega a la mesa', () => {
    const m = marcoDelBrief({ ctx: contextoDe(clienteA()), estrategia: clienteA().estrategia, version: 3, devolucion: null, nota: 'costa → playa', anterior: briefAnteriorParaElMarco({ version: 2, texto_md: V2 }) })
    expect(m).toContain('# LO QUE LE FALTA AL BRIEF ANTERIOR')
    expect(m).toContain('«## Público», «## Cómo sabremos que funcionó»')
  })
  it('genérico: el aviso no nombra cliente ni rubro', () => {
    const b = briefAnteriorParaElMarco({ version: 2, texto_md: COMPLETO.replace(/## Público\n.*\n/, '') })
    const aviso = b.slice(b.indexOf('# LO QUE LE FALTA'))
    expect(aviso).toContain('«## Público»')
    expect(aviso).not.toMatch(/Náufrago|encebollado|costa|playa|desayun/i)
  })
})

describe('genérico (GO de Lenovo 10-nov): en cualquier documento con «Pedir cambios», el formato de HOY manda sobre el de la versión anterior', () => {
  for (const doc of ['el brief', 'la gran idea'] as const) {
    it(`🔴 la orden para ${doc} dice que lo que falta del formato vigente se agrega desde el Plan de Marketing y que «conservar tal cual» no vale para eso`, () => {
      const o = ordenDeAnalisisDeImpacto(doc)
      expect(o).toContain('El formato que vale es el de HOY')
      expect(o).toContain('Plan de Marketing')
      expect(o).toContain('«Conservar tal cual» nunca vale para lo que el formato de hoy exige')
    })
  }
  it('🔴 llega al marco de la gran idea con nota (y no sin nota)', () => {
    const base = { ctx: contextoDe(clienteA()), estrategia: clienteA().estrategia, briefTexto: COMPLETO, version: 4 }
    expect(marcoDelConcepto({ ...base, nota: 'costa → playa' })).toContain('El formato que vale es el de HOY')
    expect(marcoDelConcepto({ ...base, nota: null })).not.toContain('El formato que vale es el de HOY')
  })
})
