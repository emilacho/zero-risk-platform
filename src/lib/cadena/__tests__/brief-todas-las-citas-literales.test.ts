/**
 * 10-nov · el brief v4 REAL de Náufrago (reintento del «Pedir cambios» costa → playa) se validó con una cita del plan ALTERADA:
 * en «## Público» puso «¿será tan bueno como en la playa?» dentro de un bloque `> «…»` del plan, que dice «la costa».
 * El lector solo comprobaba la cita de «De qué parte del plan sale». GO de Lenovo: TODAS las citas son literales (genérico, sin cliente).
 * Datos: los briefs v2, v3 y v4 REALES de la campaña 28de888e y extractos LITERALES del plan y del manual con los párrafos que citan.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { citasQueNoAparecen, leerBriefCreativo, REFERENCIA_DEL_BRIEF_CREATIVO } from '../brief-creativo'
import { ordenDeAnalisisDeImpacto } from '../cambios-pedidos'

const fx = (n: string) => readFileSync(join(__dirname, '..', '__fixtures__', n), 'utf8')
const PLAN = fx('plan-naufrago-extracto-citas.md')
const MANUAL = fx('manual-naufrago-extracto-citas.md')
const V2 = fx('brief-naufrago-v2-real.md')
const V3 = fx('brief-naufrago-v3-real.md')
const V4 = fx('brief-naufrago-v4-real.md')
const FUENTES = { plan: PLAN, manual: MANUAL }
const leer = (md: string, manual: string | null = MANUAL) => leerBriefCreativo(md, { planTexto: PLAN, manualTexto: manual ?? undefined, prohibidas: [] })
const deCitas = (bloqueos: string[]) => bloqueos.filter((b) => b.includes('una cita nunca se corrige'))

const BASE = [
  '## De qué parte del plan sale', '> «Grupo con alto poder de amplificación orgánica.»',
  '## Insight', 'Quieren el sabor de la playa sin viajar.',
  '## Mensaje', 'El encebollado llega a tu barrio.',
  '## Objetivo', 'Primeros 45 pedidos semanales.',
  '## Cómo sabremos que funcionó', 'Pedidos por semana.',
  '## Tono', 'Directo, en tuteo.',
  '## Obligatorios', '- vocabulario: encebollado',
]
const con = (publico: string[], extra: string[] = []) => [...BASE.slice(0, 6), '## Público', ...publico, ...BASE.slice(6), ...extra].join('\n')

describe('el caso real: el brief v4 de Náufrago', () => {
  it('encuentra UNA cita alterada: la de «Público» que dice «playa» donde el plan dice «costa»', () => {
    const r = citasQueNoAparecen(V4, FUENTES)
    expect(r).toHaveLength(1)
    expect(r[0].seccion).toBe('Público')
    expect(r[0].fuente).toBe('plan')
    expect(r[0].cita).toContain('¿será tan bueno como en la playa?')
  })
  it('el lector lo DEVUELVE con ese motivo (antes lo validaba)', () => {
    const l = leer(V4)
    expect(l.estado).toBe('devuelta')
    expect(deCitas(l.bloqueos)).toHaveLength(1)
    expect(deCitas(l.bloqueos)[0]).toContain('«## Público»')
    expect(deCitas(l.bloqueos)[0]).toContain('no está literal en el plan')
  })
  it('con la cita copiada tal cual («costa») las demás citas del v4 están en el plan y en el manual, y el brief se valida', () => {
    const arreglado = V4.replace('¿será tan bueno como en la playa?', '¿será tan bueno como en la costa?')
    expect(arreglado).not.toBe(V4)
    expect(citasQueNoAparecen(arreglado, FUENTES)).toEqual([])
    expect(leer(arreglado).estado).toBe('validada')
  })
  it('los briefs v2 y v3 reales no tienen ninguna cita alterada (sin falsos positivos)', () => {
    expect(citasQueNoAparecen(V2, FUENTES)).toEqual([])
    expect(citasQueNoAparecen(V3, FUENTES)).toEqual([])
    expect(deCitas(leer(V2).bloqueos)).toEqual([])
    expect(deCitas(leer(V3).bloqueos)).toEqual([])
  })
})

describe('qué es una cita y contra qué se comprueba (genérico)', () => {
  it('un bloque `> «…»` en cualquier sección: literal en el plan o en el manual', () => {
    expect(citasQueNoAparecen(con(['> «Etiquetan espontáneamente, comparten contenido»']), FUENTES)).toEqual([])
    expect(citasQueNoAparecen(con(['> «Etiquetan siempre, comparten todo el contenido»']), FUENTES)).toHaveLength(1)
    // una del manual en bloque también vale
    expect(citasQueNoAparecen(con(['> «Tutear en todo imperativo»']), FUENTES)).toEqual([])
  })
  it('un bloque de varias líneas es UNA cita', () => {
    expect(citasQueNoAparecen(con(['> «Etiquetan espontáneamente,', '> comparten contenido»']), FUENTES)).toEqual([])
    expect(citasQueNoAparecen(con(['> «Etiquetan espontáneamente,', '> comparten la playa»']), FUENTES)).toHaveLength(1)
  })
  it('un bloque sin «» se comprueba entero; con «» sueltos dentro, cada uno', () => {
    expect(citasQueNoAparecen(con(['> Etiquetan espontáneamente, comparten contenido']), FUENTES)).toEqual([])
    expect(citasQueNoAparecen(con(['> Etiquetan siempre a la playa y comparten']), FUENTES)).toHaveLength(1)
    expect(citasQueNoAparecen(con(['> Según el plan: «Etiquetan espontáneamente» y «comparten la playa entera»']), FUENTES).map((x) => x.cita)).toEqual(['comparten la playa entera'])
  })
  it('«el plan dice: «…»» se comprueba contra el PLAN y «el manual dice «…»» contra el MANUAL', () => {
    const plan = (c: string) => citasQueNoAparecen(con(['Perfil A.'], ['## Contradicciones plan vs manual', `- canal · plan dice: «${c}» · qué se hizo: nada`]), FUENTES)
    expect(plan('el pedido en Guayaquil entra por el sitio')).toEqual([])
    expect(plan('el pedido en Guayaquil entra por WhatsApp')).toEqual([{ cita: 'el pedido en Guayaquil entra por WhatsApp', seccion: 'Contradicciones plan vs manual', fuente: 'plan' }])
    // una frase del manual atribuida al plan NO vale
    expect(plan('Tutear en todo imperativo')).toHaveLength(1)
    const man = (c: string) => citasQueNoAparecen(con(['Perfil A.'], ['## Contradicciones plan vs manual', `- trato · manual dice «${c}»`]), FUENTES)
    expect(man('Tutear en todo imperativo')).toEqual([])
    expect(man('Tutear solo en los titulares')).toEqual([{ cita: 'Tutear solo en los titulares', seccion: 'Contradicciones plan vs manual', fuente: 'manual' }])
  })
  it('sin manual, una cita atribuida al manual no se comprueba (no hay contra qué)', () => {
    const md = con(['Perfil A.'], ['## Contradicciones plan vs manual', '- trato · manual dice «Tutear solo en los titulares»'])
    expect(citasQueNoAparecen(md, { plan: PLAN })).toEqual([])
    expect(deCitas(leer(md, null).bloqueos)).toEqual([])
  })
  it('lo entre «» sin atribución (palabras, llamados) no es una cita a un documento', () => {
    expect(citasQueNoAparecen(con(['Perfil A, llamado: «Entra a naufrago.ec» y «pide hoy mismo en la playa»']), FUENTES)).toEqual([])
  })
  it('una cita con elisión («…», «...», «[…]») vale si cada tramo está literal', () => {
    expect(citasQueNoAparecen(con(['> «Busca encebollado o ceviche de calidad … Su objeción más probable»']), FUENTES)).toEqual([])
    expect(citasQueNoAparecen(con(['> «Busca encebollado o ceviche de calidad [...] Su objeción más probable»']), FUENTES)).toEqual([])
    expect(citasQueNoAparecen(con(['> «Busca encebollado o ceviche de calidad … Su objeción menos probable»']), FUENTES)).toHaveLength(1)
  })
  it('«(…)» y «(...)» también son elisión: la línea REAL del brief v1 de Náufrago («Encebollado Náufrago (…) producto estrella») no es falso rojo (🟡 CC7)', () => {
    const LINEA_V1 = '- **tiempo de entrega** · plan dice: «ese número no se repite en anuncios ni en contenido hasta que los pedidos piloto lo confirmen» · manual dice: «Encebollado Náufrago (…) producto estrella» — no hay contradicción de fondo, pero el manual no prohíbe mencionar tiempos · qué se hizo: se omite el tiempo de entrega hasta confirmar con pilotos, siguiendo el plan'
    const delManual = (linea: string) => citasQueNoAparecen(con(['Perfil A.'], ['## Contradicciones plan vs manual', linea]), FUENTES).filter((x) => x.fuente === 'manual')
    expect(delManual(LINEA_V1)).toEqual([])
    expect(delManual(LINEA_V1.replace('(…)', '(...)'))).toEqual([])
    expect(delManual(LINEA_V1.replace('(…)', '( … )'))).toEqual([])
    // la elisión no tapa un cambio: un tramo alterado sigue rojo
    expect(delManual(LINEA_V1.replace('(…) producto estrella', '(…) producto barato'))).toHaveLength(1)
    // y un paréntesis que NO es elisión no parte la cita
    expect(delManual(LINEA_V1.replace('(…)', '(con chifle)'))).toHaveLength(1)
  })
  it('un bloque `>` de varias líneas se lee ENTERO: con las dos líneas alteradas sale UNA cita, la del bloque completo', () => {
    const r = citasQueNoAparecen(con(['> «Etiquetan siempre,', '> comparten la playa entera»']), FUENTES)
    expect(r).toEqual([{ cita: 'Etiquetan siempre, comparten la playa entera', seccion: 'Público', fuente: 'plan' }])
    // la cita real de Náufrago partida en dos líneas `>` es literal
    expect(citasQueNoAparecen(con(['> «Busca encebollado o ceviche de calidad sin salir de casa', '> o de la oficina.»']), FUENTES)).toEqual([])
  })
  it('una cita corta (menos de 12 caracteres) no se comprueba', () => {
    expect(citasQueNoAparecen(con(['> «la playa»']), FUENTES)).toEqual([])
  })
  it('la cita de «De qué parte del plan sale» NO se cuenta dos veces (tiene su propio chequeo)', () => {
    const md = con(['Perfil A.']).replace('> «Grupo con alto poder de amplificación orgánica.»', '> «Grupo con poco poder de amplificación orgánica.»')
    expect(citasQueNoAparecen(md, FUENTES)).toEqual([])
    const l = leer(md)
    expect(l.bloqueos.filter((b) => b.includes('Grupo con poco poder'))).toHaveLength(1)
  })
  it('la misma cita alterada repetida se informa una vez', () => {
    expect(citasQueNoAparecen(con(['> «Etiquetan siempre, comparten todo el contenido»'], ['## Citas', '> «Etiquetan siempre, comparten todo el contenido»']), FUENTES)).toHaveLength(1)
  })
})

describe('la orden a la mesa: una cita nunca se corrige', () => {
  it('la orden de cambios (brief y gran idea) lo dice: deja la cita y explica el cambio fuera', () => {
    for (const d of ['el brief', 'la gran idea'] as const) {
      const o = ordenDeAnalisisDeImpacto(d)
      expect(o).toContain('7. Una cita nunca se corrige')
      expect(o).toContain('deja la cita intacta y explica el cambio fuera de ella')
    }
  })
  it('la referencia del brief lo dice para toda cita', () => {
    expect(REFERENCIA_DEL_BRIEF_CREATIVO).toContain('una cita nunca se corrige')
  })
})
