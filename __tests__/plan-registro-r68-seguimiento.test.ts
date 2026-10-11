/**
 * Seguimiento de #499 (CC#3 §A.4): (a) una prueba por cada mutación viva del corregidor del plan · (b) «comparé» es un PASADO, no voseo · (c) un detector que SOLO MARCA lo que la tabla no conoce.
 * Textos reales: el plan de la repetición y el del tramo anterior (respaldo de la ficha de prueba).
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { TABLA } from '../scripts/ops/barrer-voseo.mjs'
import { BIBLIOTECA_PLAN } from '../scripts/worker-staging/X9F0zp6LQ2xGEYVS/construir-r68.mjs'
import { construir as construirSeguimiento } from '../scripts/worker-staging/X9F0zp6LQ2xGEYVS/construir-seguimiento-r68.mjs'

const DIR = 'src/lib/manual/__tests__/fixtures/repeticion-r68'
const PLAN_NUEVO = fs.readFileSync(`${DIR}/plan-90-dias-texto.md`, 'utf8')
const PLAN_ANTERIOR = fs.readFileSync(`${DIR}/plan-tramo-anterior.md`, 'utf8')
type Corr = { texto: string; corregidas: Array<{ antes: string; despues: string }>; restantes: string[] }
const lib = new Function(`${BIBLIOTECA_PLAN}\nreturn { corregirRegistroDelPlan, formasDeVoseo, voseoDesconocido, bloqueDeRevisionDeRegistro, _VOS_A_TU }`)() as {
  corregirRegistroDelPlan: (t: unknown, r: string | null) => Corr
  formasDeVoseo: (t: string) => string[]
  voseoDesconocido: (t: string) => string[]
  bloqueDeRevisionDeRegistro: (r: { restantes: string[] } | null, registro: string | null) => string
  _VOS_A_TU: Record<string, string>
}
const c = (t: string) => lib.corregirRegistroDelPlan(t, 'tuteo')

describe('(b) «comparé» es pasado: la tabla trae el imperativo, no el pretérito', () => {
  it('«los comparé» (yo comparé) se queda; «Compará precios» (vos) se corrige', () => {
    expect(c('Hoy revisé las cifras y los comparé con el mercado.').texto).toBe('Hoy revisé las cifras y los comparé con el mercado.')
    expect(c('Compará precios hoy.').texto).toBe('Compara precios hoy.')
    expect(c('Mirá y comparé.').texto).toBe('Mira y comparé.')
  })
  it('ni la tabla del corregidor ni la del barrido traen «comparé»', () => {
    expect('comparé' in lib._VOS_A_TU).toBe(false); expect('comparé' in TABLA).toBe(false)
    expect(lib._VOS_A_TU['compará']).toBe('compara')
  })
  it('revisión de los acabados -é: solo son imperativos de verbos en -er (nada de pretéritos de verbos en -ar como «compré», «pasé»)', () => {
    const conE = Object.keys(lib._VOS_A_TU).filter((k) => /é$/.test(k)).sort()
    expect(conE).toEqual(['conocé', 'comprendé', 'corré', 'devolvé', 'entendé', 'hacé', 'leé', 'mantené', 'ofrecé', 'perdé', 'poné', 'prometé', 'rehacé', 'resolvé', 'respondé', 'tené', 'vendé', 'volvé'].sort())
  })
  it('los acabados -í que también son pretérito («pedí», «escribí», «sugerí»…) solo se corrigen en posición de imperativo', () => {
    expect(c('Yo escribí el plan y lo sugerí al equipo.').texto).toBe('Yo escribí el plan y lo sugerí al equipo.')
    expect(c('Escribí el plan.').texto).toBe('Escribe el plan.')
  })
})

describe('(c) lo que la tabla NO conoce se MARCA, sin reescribir', () => {
  it('el plan del tramo anterior: «entrá», «controlás», «aparecés» y «preguntale» salen marcados (y el texto no se toca en ellos)', () => {
    const r = c(PLAN_ANTERIOR)
    const m = r.restantes.map((x) => x.toLowerCase())
    for (const f of ['entrá', 'controlás', 'aparecés', 'preguntale']) expect(m.some((x) => x.startsWith(f)), f).toBe(true)
    for (const f of ['Entrá a Google', 'no controlás lo', 'búsquedas aparecés', 'Preguntale']) expect(r.texto, f).toContain(f)
    expect(r.restantes.every((x) => x.endsWith(' (posible)'))).toBe(true)
    expect(r.corregidas).toHaveLength(12) // lo que la tabla sí conocía se sigue corrigiendo igual
  })
  it('sin falsas alarmas en los dos planes reales: solo lo que de verdad es voseo', () => {
    expect(c(PLAN_NUEVO).restantes).toEqual([])
    expect(c(PLAN_ANTERIOR).restantes.length).toBe(4)
  })
  it('acabados -ás/-és/-ís: se marcan los verbos; no las palabras corrientes ni los futuros del tuteo', () => {
    expect(lib.voseoDesconocido('Vos ignorás eso, escogés tarde y reís mucho.').sort()).toEqual(['escogés', 'ignorás', 'reís'].sort())
    for (const ok of ['más además jamás después país atrás detrás quizás', 'los cafés, los bebés y los sofás', 'tú estás, harás, tendrás, podrás, serás y verás', 'el interés inglés y el francés']) expect(lib.voseoDesconocido(ok), ok).toEqual([])
  })
  it('imperativos en -á/-é/-í al arrancar una oración: «Entrá», «Respondé»(conocido), «Reenviá»; no los futuros «Estará», «Hará» ni «Está»', () => {
    expect(lib.voseoDesconocido('Hola. Entrá ya. Reenviá luego y subí')).toEqual(['Entrá', 'Reenviá'])
    for (const ok of ['Está listo. Será mejor. Hará calor. Podrá venir. Allá vamos.', 'Habrá más. Tendrá tiempo. Irá mañana.']) expect(lib.voseoDesconocido(ok), ok).toEqual([])
  })
  it('bordes de largo: -á de 5+ letras que NO son futuro (Entrá) sí; futuros regulares (Pensará, Comerá, Vivirá) no; -é de 5 letras sí; -í de 6 sí y de 5 no (suele ser pasado)', () => {
    expect(lib.voseoDesconocido('Hola. Pensará mañana. Comerá bien. Vivirá allí.')).toEqual([])
    expect(lib.voseoDesconocido('Hola. Rendé cuentas.')).toEqual(['Rendé'])
    expect(lib.voseoDesconocido('Hola. Admití el cambio.')).toEqual(['Admití'])
    expect(lib.voseoDesconocido('Hola. Partí hoy.')).toEqual([])
    expect(lib.voseoDesconocido('Hola. Dalé ya. Sé que sí. Café frío.')).toEqual([])
  })
  it('SOLO en posición de imperativo: a mitad de oración «la entrá» o un sustantivo no se marca', () => {
    expect(lib.voseoDesconocido('la tarea entrá sin avisar')).toEqual([])
  })
  it('imperativos con pronombre pegado (preguntale, avisaselo…): se marcan al arrancar la frase, con excepciones de sustantivos', () => {
    expect(lib.voseoDesconocido('Mirá el plan. Preguntale al cliente y mandaselo.')).toEqual(['Preguntale', 'mandaselo'])
    for (const ok of ['Aguacate fresco. Chocolate caliente. Paralelo al mar. Telenovela nueva. Disparate total.', 'Modelo base. Escuela de surf. Consuelo.']) expect(lib.voseoDesconocido(ok), ok).toEqual([])
  })
  it('lo citado no se marca; sin texto no rompe', () => {
    expect(lib.voseoDesconocido('Dice «Entrá ya» y `controlás`. https://x.test/entrá')).toEqual([])
    expect(lib.voseoDesconocido(undefined as unknown as string)).toEqual([]); expect(lib.voseoDesconocido('')).toEqual([])
  })
  it('el bloque al final del plan dice "voseo (o que lo parecen)" y lista las formas; con registro distinto de tuteo o sin restos, nada', () => {
    const r = c('Hablamos con vos. Entrá ya.')
    expect(r.restantes).toEqual(['vos', 'Entrá (posible)'])
    expect(lib.bloqueDeRevisionDeRegistro(r, 'tuteo')).toMatch(/Revisión del registro \(la hace el sistema\)[\s\S]*o que lo parecen[\s\S]*vos, Entrá \(posible\)/)
  })
})

describe('(a) el camino de MARCAR y los bordes del corregidor del plan', () => {
  it('bloqueDeRevisionDeRegistro: sin restos y tuteo ⇒ nada; con restos y tuteo ⇒ el bloque; con otro registro o sin resultado ⇒ nada', () => {
    expect(lib.bloqueDeRevisionDeRegistro({ restantes: [] }, 'tuteo')).toBe('')
    expect(lib.bloqueDeRevisionDeRegistro({ restantes: ['vos'] }, 'tuteo')).toContain('## Revisión del registro')
    expect(lib.bloqueDeRevisionDeRegistro({ restantes: ['vos'] }, 'voseo')).toBe('')
    expect(lib.bloqueDeRevisionDeRegistro({ restantes: ['vos'] }, null)).toBe('')
    expect(lib.bloqueDeRevisionDeRegistro(null, 'tuteo')).toBe('')
    expect(lib.bloqueDeRevisionDeRegistro({ restantes: [] }, 'voseo')).toBe('')
  })
  it('formasDeVoseo: «vos» y las formas de la tabla cuentan; «SOS» y los -í ambiguos con pasado («pedí») NO; las repetidas llevan ×N; lo citado no cuenta', () => {
    expect(lib.formasDeVoseo('SOS, pedí')).toEqual([])
    expect(lib.formasDeVoseo('vos')).toEqual(['vos'])
    expect(lib.formasDeVoseo('tenés')).toEqual(['tenés'])
    expect(lib.formasDeVoseo('Vos tenés y vos tenés')).toEqual(['vos ×2', 'tenés ×2'])
    expect(lib.formasDeVoseo('«vos tenés» y `sos`')).toEqual([])
    expect(lib.formasDeVoseo('SOS vos pedí')).toEqual(['vos'])
  })
  it('texto nulo o indefinido ⇒ texto vacío, sin romper ni escribir «undefined»', () => {
    expect(lib.corregirRegistroDelPlan(undefined, 'tuteo').texto).toBe('')
    expect(lib.corregirRegistroDelPlan(null, 'tuteo').texto).toBe('')
    expect(lib.corregirRegistroDelPlan(undefined, 'voseo').texto).toBe('')
  })
  it('mayúsculas como el original: «PROBÁ» ⇒ «PRUEBA», «Probá» ⇒ «Prueba», y una sola letra mayúscula no se confunde con una sigla', () => {
    expect(c('PROBÁ YA').texto).toBe('PRUEBA YA'); expect(c('Probá ya').texto).toBe('Prueba ya')
    expect(c('Hay un plan A y un plan B. Vos').texto).toBe('Hay un plan A y un plan B. Tú')
  })
})

describe('el nodo «¿Llegó la vuelta?» vivo con el seguimiento (código REAL del nodo)', () => {
  const DIRW = 'scripts/worker-staging/X9F0zp6LQ2xGEYVS'
  const antes = JSON.parse(fs.readFileSync(`${DIRW}/planeacion-ANTES-seguimiento-r68.json`, 'utf8'))
  const despues = construirSeguimiento(antes)
  const corre = (flujo: any, texto: string) => {
    const code = flujo.nodes.find((n: any) => n.name === '¿Llegó la vuelta?').parameters.jsCode as string
    const nodos: Record<string, any> = { 'elegir brazos': { descartados: [] }, 'Redactor (B4)': { cliente_id: 'c1', registro_usado: { registro: 'tuteo' } }, 'Ficha del cliente': { name: 'Cliente X' } }
    const $ = (n: string) => ({ first: () => ({ json: nodos[n] }) })
    return (new Function('$input', '$', code)({ first: () => ({ json: { body: { response: texto } } }) }, $) as Array<{ json: any }>)[0].json
  }
  it('con el plan del tramo anterior: corrige las 12 de siempre y MARCA las desconocidas en el bloque final y en registro_revisado', () => {
    const j = corre(despues, PLAN_ANTERIOR)
    expect(j.registro_revisado.corregidas).toBe(12)
    expect(j.registro_revisado.restantes.map((x: string) => x.toLowerCase())).toEqual(expect.arrayContaining(['entrá (posible)', 'controlás (posible)', 'aparecés (posible)', 'preguntale (posible)']))
    expect(j.texto).toMatch(/## Revisión del registro \(la hace el sistema\)[\s\S]*o que lo parecen[\s\S]*Entrá \(posible\)/)
    expect(j.texto).toContain('Entrá a Google') // marcar no reescribe
  })
  it('con el plan limpio (la repetición) no agrega ningún bloque', () => {
    const j = corre(despues, PLAN_NUEVO)
    expect(j.texto).not.toContain('Revisión del registro'); expect(j.registro_revisado.restantes).toEqual([])
  })
  it('solo cambia ese nodo, y solo el texto de la biblioteca; el vivo de CC#1 («Pedir el plan al redactor») se conserva', () => {
    const cambiados = despues.nodes.filter((n: any, i: number) => JSON.stringify(n) !== JSON.stringify(antes.nodes[i])).map((n: any) => n.name)
    expect(cambiados).toEqual(['¿Llegó la vuelta?'])
    expect(JSON.stringify(despues.connections)).toBe(JSON.stringify(antes.connections))
    expect(JSON.stringify(despues.nodes.find((n: any) => n.name === 'Pedir el plan al redactor'))).toBe(JSON.stringify(antes.nodes.find((n: any) => n.name === 'Pedir el plan al redactor')))
    expect(() => construirSeguimiento(despues)).toThrow(/ya trae el seguimiento/)
  })
})
