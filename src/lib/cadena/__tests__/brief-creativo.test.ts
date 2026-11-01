/**
 * EL BRIEF CREATIVO (brief_creativo.v1) · lo lee código y lo chequea código (nodo ④ portado). Sin cliente, sin modelo.
 */
import { describe, expect, it } from 'vitest'
import { CONTRATO_BRIEF_CREATIVO, frasesDe, hallazgosDelBrief, leerBriefCreativo, publicoEsTodos, REFERENCIA_DEL_BRIEF_CREATIVO } from '../brief-creativo'

const PLAN = [
  '# Plan de 90 días',
  '## Fase 1 · Abrir la puerta (días 1-30)',
  'Objetivo: que el barrio sepa que la cocina abre temprano y que el pan sale a las siete.',
  '## Fase 2 · Volver (días 31-60)',
  'Objetivo: que quien vino una vez vuelva con alguien.',
].join('\n')

const BRIEF = [
  '## De qué parte del plan sale',
  'Fase 1: «que el barrio sepa que la cocina abre temprano y que el pan sale a las siete».',
  '## Insight',
  'La gente del barrio desayuna de pie porque cree que no hay dónde sentarse antes de las ocho.',
  '## Mensaje',
  'Hay mesa desde las siete.',
  '## Objetivo',
  'Que entren 30 desayunos nuevos por semana en la fase 1.',
  '- ig: que miren el pan recién salido · «ven a desayunar»',
  '- fb: que guarden el horario · «guarda el horario»',
  '## Tono',
  'Cercano y directo, sin exclamaciones.',
  '## Obligatorios',
  '- vocabulario: pan de masa madre; mesa larga',
  '- prohibido: delicioso; promo',
  '- lo que no se dice: precios',
  '## Faltantes',
  '- público: el manual no dice edades; se asume barrio, sin cifra',
  '## Contradicciones plan vs manual',
  '- ninguna',
  '## Citas',
  'A1 usé: el plan, fase 1.',
].join('\n')

const INS = { planTexto: PLAN, prohibidas: ['delicioso', 'promo'], redes: ['ig', 'fb'] }
const con = (cambios: Record<string, string>) => {
  let md = BRIEF
  for (const [de, a] of Object.entries(cambios)) md = md.replace(de, a)
  return md
}

describe('brief_creativo.v1 · lectura', () => {
  it('lee las secciones, el mensaje, el objetivo por red y los obligatorios', () => {
    const b = leerBriefCreativo(BRIEF, INS)
    expect(b.contrato).toBe(CONTRATO_BRIEF_CREATIVO)
    expect(b.estado).toBe('validada')
    expect(b.bloqueos).toEqual([])
    expect(b.mensaje).toBe('Hay mesa desde las siete.')
    expect(b.objetivo).toBe('Que entren 30 desayunos nuevos por semana en la fase 1.')
    expect(b.por_red).toEqual([
      { red: 'ig', objetivo: 'que miren el pan recién salido', llamado: '«ven a desayunar»' },
      { red: 'fb', objetivo: 'que guarden el horario', llamado: '«guarda el horario»' },
    ])
    expect(b.obligatorios).toEqual({ vocabulario: ['pan de masa madre', 'mesa larga'], prohibido: ['delicioso', 'promo'], no_se_dice: ['precios'] })
    expect(b.faltantes).toEqual([{ campo: 'público', que_falta: 'el manual no dice edades; se asume barrio, sin cifra' }])
    expect(b.contradicciones).toEqual([])
    expect(b.tono).toContain('Cercano')
    expect(b.avisos).toEqual([])
  })
  it('las contradicciones se leen una por línea y «ninguna» no cuenta', () => {
    const b = leerBriefCreativo(con({ '- ninguna': '- horario · plan dice siete · manual dice ocho · se usó el manual' }), INS)
    expect(b.contradicciones).toEqual(['horario · plan dice siete · manual dice ocho · se usó el manual'])
  })
})

describe('brief_creativo.v1 · chequeos (brief-chequeos.js portado)', () => {
  it('dos mensajes ⇒ devuelta', () => {
    const b = leerBriefCreativo(con({ 'Hay mesa desde las siete.': 'Hay mesa desde las siete.\nY el pan es de masa madre.' }), INS)
    expect(b.estado).toBe('devuelta')
    expect(b.bloqueos.join('\n')).toMatch(/UN mensaje/)
  })
  it('un mensaje de tres frases ⇒ devuelta (sospecha de varios mensajes)', () => {
    const b = leerBriefCreativo(con({ 'Hay mesa desde las siete.': 'Hay mesa. Desde las siete. Para el barrio.' }), INS)
    expect(b.bloqueos.join('\n')).toMatch(/3 frases/)
  })
  it('un mensaje de más de 260 caracteres ⇒ devuelta', () => {
    const b = leerBriefCreativo(con({ 'Hay mesa desde las siete.': 'x'.repeat(270) }), INS)
    expect(b.bloqueos.join('\n')).toMatch(/270 caracteres/)
  })
  it('la cita del plan tiene que estar LITERAL en el plan', () => {
    const ok = leerBriefCreativo(BRIEF, INS)
    expect(ok.bloqueos).toEqual([])
    const inventada = leerBriefCreativo(con({ 'que el barrio sepa que la cocina abre temprano y que el pan sale a las siete': 'que el barrio descubra una cocina que nunca cierra' }), INS)
    expect(inventada.estado).toBe('devuelta')
    expect(inventada.bloqueos.join('\n')).toMatch(/no se encuentra literal en el plan/)
  })
  it('la cita se compara sin tildes ni mayúsculas (literal de verdad, no de forma)', () => {
    const b = leerBriefCreativo(con({ 'que el barrio sepa que la cocina abre temprano y que el pan sale a las siete': 'QUE EL BARRIO SEPA QUE LA COCINA ABRE TEMPRANO Y QUE EL PAN SALE A LAS SIETE' }), INS)
    expect(b.bloqueos).toEqual([])
  })
  it('una cita demasiado corta no se puede verificar ⇒ devuelta', () => {
    const b = leerBriefCreativo(con({ 'Fase 1: «que el barrio sepa que la cocina abre temprano y que el pan sale a las siete».': 'Fase 1.' }), INS)
    expect(b.bloqueos.join('\n')).toMatch(/demasiado corta/)
  })
  it('una cifra «,77» ⇒ devuelta', () => {
    const b = leerBriefCreativo(con({ 'Que entren 30 desayunos': 'Que entren 30,77 desayunos' }), INS)
    expect(b.bloqueos.join('\n')).toMatch(/,77/)
  })
  it('una prohibida fuera de la lista «prohibido» ⇒ devuelta; dentro de la lista no', () => {
    expect(leerBriefCreativo(BRIEF, INS).bloqueos).toEqual([])
    const b = leerBriefCreativo(con({ 'Hay mesa desde las siete.': 'Hay un desayuno delicioso desde las siete.' }), INS)
    expect(b.bloqueos.join('\n')).toMatch(/«delicioso», prohibida por el manual/)
  })
  it('una prohibida citada en «contradicciones» no cuenta (ahí se dice que NO se usa)', () => {
    const b = leerBriefCreativo(con({ '- ninguna': '- el plan dice «promo de apertura» · el manual prohíbe promo · se dice «apertura»' }), INS)
    expect(b.bloqueos).toEqual([])
  })
  it('una prohibida del manual que el brief no lista se declara (aviso, no devolución)', () => {
    const b = leerBriefCreativo(BRIEF, { ...INS, prohibidas: ['delicioso', 'promo', 'barato'] })
    expect(b.estado).toBe('validada')
    expect(b.avisos).toEqual(['la prohibida del manual «barato» no está en la lista «prohibido» del brief'])
  })
  it('el público «todos» ⇒ devuelta (si lo nombra); un público declarado pasa', () => {
    const INSIGHT = 'La gente del barrio desayuna de pie porque cree que no hay dónde sentarse antes de las ocho.'
    const todos = leerBriefCreativo(con({ [INSIGHT]: `${INSIGHT}\n- público: todos` }), INS)
    expect(todos.bloqueos.join('\n')).toMatch(/no es una audiencia declarada/)
    expect(leerBriefCreativo(con({ [INSIGHT]: `${INSIGHT}\n- público: vecinas del barrio que salen a trabajar antes de las ocho y desayunan fuera` }), INS).bloqueos).toEqual([])
    // en «Faltantes», «público: lo que falta» NO es la audiencia: no se juzga
    expect(leerBriefCreativo(con({ '- público: el manual no dice edades; se asume barrio, sin cifra': '- público: todos los datos faltan' }), INS).bloqueos).toEqual([])
  })
  it('falta una sección obligatoria ⇒ devuelta, con el nombre de la sección', () => {
    const b = leerBriefCreativo(BRIEF.replace('## Insight\nLa gente del barrio desayuna de pie porque cree que no hay dónde sentarse antes de las ocho.\n', ''), INS)
    expect(b.bloqueos).toContain('falta la sección «## Insight»')
  })
  it('faltantes y citas NO son obligatorias (se declaran si hay)', () => {
    const b = leerBriefCreativo(BRIEF.replace(/## Faltantes[\s\S]*?(?=## Contradicciones)/, '').replace(/## Citas[\s\S]*$/, ''), INS)
    expect(b.estado).toBe('validada')
    expect(b.faltantes).toEqual([])
    expect(b.citas).toBe('')
  })
  it('una red de la estrategia sin objetivo o sin llamado se declara (aviso)', () => {
    const b = leerBriefCreativo(con({ '- fb: que guarden el horario · «guarda el horario»': '- fb: que guarden el horario' }), { ...INS, redes: ['ig', 'fb', 'tiktok'] })
    expect(b.estado).toBe('validada')
    expect(b.avisos).toEqual(['la red fb no tiene llamado («- fb: objetivo · llamado»)', 'la red tiktok no tiene objetivo ni llamado en el brief'])
  })
})

describe('brief_creativo.v1 · salidas', () => {
  it('hallazgosDelBrief · un hallazgo por bloqueo (bloquea) y por aviso, alcance tanda, objeto brief_creativo', () => {
    const b = leerBriefCreativo(con({ 'Hay mesa desde las siete.': 'Hay mesa desde las siete.\nY pan.' }), { ...INS, prohibidas: ['delicioso', 'promo', 'barato'] })
    const h = hallazgosDelBrief(b)
    expect(h.map((x) => [x.chequeo, x.severidad, x.alcance, x.fila_id])).toEqual([['brief_creativo', 'bloquea', 'tanda', null], ['brief_creativo', 'aviso', 'tanda', null]])
    expect(h[0].ficha.contra_que).toBe('brief_creativo.v1')
    expect(h[0].ficha.propuesta).toMatch(/UNA vez/)
  })
  it('frasesDe y publicoEsTodos', () => {
    expect(frasesDe('Hay mesa desde las siete.')).toBe(1)
    expect(frasesDe('¿Hay mesa? Sí. Desde las siete.')).toBe(3)
    expect(publicoEsTodos('todos')).toBe(true)
    expect(publicoEsTodos('Todo el mundo')).toBe(true)
    expect(publicoEsTodos('público general de la ciudad')).toBe(true)
    expect(publicoEsTodos('')).toBe(false)
    expect(publicoEsTodos('vecinas del barrio que salen a trabajar antes de las ocho')).toBe(false)
  })
  it('la referencia del brief nombra las 9 secciones y no fija país ni idioma', () => {
    for (const s of ['De qué parte del plan sale', 'Insight', 'Mensaje', 'Objetivo', 'Tono', 'Obligatorios', 'Faltantes', 'Contradicciones plan vs manual', 'Citas']) expect(REFERENCIA_DEL_BRIEF_CREATIVO).toContain(`## ${s}`)
    expect(REFERENCIA_DEL_BRIEF_CREATIVO).toMatch(/trato del manual/)
    expect(REFERENCIA_DEL_BRIEF_CREATIVO).not.toMatch(/Ecuador|tuteo|voseo|español/i)
  })
})

describe('reserva 2 de CC3 (lote 2) · reglas que los mutantes vivos dejaron sin prueba', () => {
  it('B07 · «todos» dentro de una frase CORTA es público «todos»; en una frase larga que lo menciona de paso, no', () => {
    expect(publicoEsTodos('para todos los vecinos')).toBe(true)
    expect(publicoEsTodos('mamás y papás que vienen todos los sábados a desayunar con sus hijos pequeños')).toBe(false)
  })
  it('B15 · un título de sección con sufijo («## Insight del barrio») se reconoce como la sección Insight', () => {
    const b = leerBriefCreativo(con({ '## Insight': '## Insight del barrio' }), INS)
    expect(b.bloqueos).not.toContain('falta la sección «## Insight»')
    expect(b.insight).toContain('desayuna de pie')
    // un título parecido pero sin el espacio separador NO es la sección
    const c = leerBriefCreativo(con({ '## Insight': '## Insightful' }), INS)
    expect(c.bloqueos).toContain('falta la sección «## Insight»')
  })
})
