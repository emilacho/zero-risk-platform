/** Firma de Emilio 02-nov 20:29Z: ninguna palabra bloquea, ni la declarada por una norma ni la prohibida por el dueño. Se avisa a la vista, sigue llegando como contexto y el texto del agente no se toca. */
import { describe, expect, it } from 'vitest'
import { reglasParaPrompts } from '../src/lib/oficina/ayudas'
import { chequeosDePost, palabrasDeclaradas, type ContextoDeChequeo } from '../src/lib/oficina/chequeos'
import { chequearPrompts } from '../src/lib/oficina/reglas-de-imagen'
import { MOTIVO_DE_PALABRA_DECLARADA, recomprobar } from '../src/lib/manual/firmes'
import { limpiarManual } from '../src/lib/manual/limpieza'
import { formatGuardrailsForPrompt } from '../src/lib/client-brain'
import { REGLA_DE_LAS_PALABRAS_DEL_MANUAL } from '../src/lib/jefatura/revision/pedidos'

const LEGAL = { texto: 'premium', intencion: 'legal', fuente: { cita: 'la norma' } }

describe('en la pieza', () => {
  const ctx = (o: Partial<{ pie: string; tags: string[]; delBrief: string[] }>) => ({
    pieza: { pie_de_foto: o.pie ?? 'Un plato rico', hashtags: o.tags ?? ['#mar'] },
    fuentes: { palabras_prohibidas: ['premium'], palabras_duras: ['premium'], telefonos: [], handles: [], precios: [], competidores: [], registro: 'tuteo' },
    limites: { pie_de_foto_max: 2200, hashtags_max: 30, limites_verificados: false },
    prohibidas_del_brief: o.delBrief ?? [],
  }) as unknown as ContextoDeChequeo
  it('🔴 una palabra declarada en el texto sale como aviso visible, no como bloqueo', () => {
    const f = chequeosDePost(ctx({ pie: 'Un plato premium' }))
    expect(f.filter((x) => /premium/.test(x.que ?? '')).map((x) => [x.donde, x.gravedad])).toEqual([['texto', 'sugerencia']])
    expect(f.some((x) => x.gravedad === 'bloquea')).toBe(false)
  })
  it('🔴 en un hashtag, igual', () => {
    expect(chequeosDePost(ctx({ tags: ['#Premium'] })).filter((x) => /premium/.test(x.que ?? '')).map((x) => [x.donde, x.gravedad])).toEqual([['hashtags', 'sugerencia']])
  })
  it('🔴 lo que el brief prohíbe por su cuenta, igual', () => {
    expect(chequeosDePost(ctx({ pie: 'Algo super', delBrief: ['super'] })).filter((x) => /super/.test(x.que ?? '')).map((x) => x.gravedad)).toEqual(['sugerencia'])
  })
  it('🔴 el aviso no dice que hay que reescribir', () => {
    expect(chequeosDePost(ctx({ pie: 'Un plato premium' }))[0].propuesta).toBe('revisar si corresponde')
  })
  it('separa lo declarado del contexto', () => {
    expect(palabrasDeclaradas({ palabras_prohibidas: ['premium', 'barato'], palabras_duras: ['barato'] }, ['premium', 'otra'])).toEqual({ declaradas: ['barato', 'otra'], contexto: ['premium'] })
  })
})

describe('en los prompts de imagen', () => {
  const reglas = reglasParaPrompts({ artefactos: {}, fichas: [] } as never, { prohibido: [], visual_obligatorio: [], visual_prohibido: [] } as never, { fuentes: { palabras_prohibidas: ['premium'], palabras_duras: ['premium'] } } as never)
  const propios = { marcas_ajenas: ['OtraMarca'] }
  it('🔴 un prompt que nombra la palabra NO se descarta, y queda el aviso', () => {
    const r = chequearPrompts(['Un plato premium sobre la mesa'], reglas, propios)
    expect(r.pasan).toEqual([0])
    expect(r.fallan).toEqual([])
    expect(r.avisos).toEqual(['un prompt nombra palabra prohibida «premium»: revisa si corresponde'])
  })
  it('🔴 la palabra sigue llegando como contexto en las reglas', () => {
    expect(reglas.prohibido.flatMap((x) => x.claves ?? [])).toContain('premium')
  })
  it('🔴 dos prompts con la misma palabra dan un solo aviso', () => {
    expect(chequearPrompts(['premium uno', 'premium dos'], reglas, propios).avisos).toHaveLength(1)
  })
  it('🔴 sin la palabra no hay aviso', () => {
    expect(chequearPrompts(['Un plato'], reglas, propios).avisos).toEqual([])
  })
  it('🔴 una regla visual de verdad sigue descartando: esto solo afecta a las palabras', () => {
    const r = chequearPrompts(['Una persona sonriendo'], { obligatorio: [], prohibido: [{ id: 'v1', texto: 'persona' }] }, propios)
    expect(r.pasan).toEqual([])
    expect(r.fallan[0].motivos[0]).toMatch(/nombra el prohibido/)
  })
  it('🔴 una marca ajena sigue descartando', () => {
    expect(chequearPrompts(['Logo de OtraMarca'], reglas, propios).pasan).toEqual([])
  })
})

describe('en el manual', () => {
  const manual = { forbidden_words: ['premium'], palabras_con_intencion: [LEGAL], voice_description: 'Somos premium en todo. Nada más.', valores: ['Lo premium', 'Cercanía'] }
  it('🔴 la limpieza no quita ni una letra', () => {
    const r = limpiarManual(manual)
    expect(r.manual.voice_description).toBe(manual.voice_description)
    expect(r.manual.valores).toEqual(manual.valores)
    expect(r.quitados).toEqual([])
  })
  it('🔴 y anota dónde está, también en las listas', () => {
    expect(limpiarManual(manual).anotadas).toEqual([
      { ruta: 'voice_description', palabra: 'premium', texto: 'Somos premium en todo.' },
      { ruta: 'valores[0]', palabra: 'premium', texto: 'Lo premium' },
    ])
  })
  it('🔴 mencionarla para evitarla no se anota', () => {
    expect(limpiarManual({ ...manual, voice_description: 'Nunca digas premium.', valores: [] }).anotadas).toEqual([])
  })
  it('🔴 una palabra de estilo no se anota', () => {
    expect(limpiarManual({ forbidden_words: ['premium'], voice_description: 'Somos premium.' }).anotadas).toEqual([])
  })
  it('🔴 lo demás de la limpieza sigue igual', () => {
    expect(limpiarManual({ voice_description: 'Somos cercanos (discovery_summary).' }).quitados.map((q) => q.motivo)).toEqual(['nombre_interno_citado'])
  })
  const entrada = { fuentes: [] } as never
  type Meta = Record<string, { notas_del_juez?: Array<{ dato: string; motivo: string }> }>
  it('🔴 al pasar la puerta queda la nota visible en su campo, y el texto se queda', () => {
    const r = recomprobar({}, manual, entrada)
    expect(r.manual.voice_description).toBe(manual.voice_description)
    const m = r.manual._field_meta as Meta
    expect(m.voice_description.notas_del_juez).toEqual([{ dato: 'premium', motivo: MOTIVO_DE_PALABRA_DECLARADA }])
    expect(m.valores.notas_del_juez).toEqual([{ dato: 'premium', motivo: MOTIVO_DE_PALABRA_DECLARADA }])
  })
  it('🔴 no entra al registro de lo retirado', () => {
    const r = recomprobar({}, manual, entrada)
    expect(r.retirados.filter((x) => /premium/.test(x.clausula))).toEqual([])
    expect(r.cambios.filter((x) => /premium/.test(x.de))).toEqual([])
  })
  it('🔴 repetir no duplica la nota y conserva la del juez', () => {
    const previa = { ...manual, _field_meta: { voice_description: { notas_del_juez: [{ dato: '2015', motivo: 'sin fuente' }, { dato: 'premium', motivo: MOTIVO_DE_PALABRA_DECLARADA }] } } }
    const notas = (recomprobar({}, previa, entrada).manual._field_meta as Meta).voice_description.notas_del_juez!
    expect(notas.map((n) => n.dato)).toEqual(['2015', 'premium'])
  })
  it('🔴 dos palabras en el mismo campo: dos notas', () => {
    const r = recomprobar({}, { forbidden_words: ['premium', 'barato'], palabras_con_intencion: [LEGAL, { ...LEGAL, texto: 'barato' }], voice_description: 'Somos premium. Todo muy barato hoy.' }, entrada)
    expect((r.manual._field_meta as Meta).voice_description.notas_del_juez!.map((n) => n.dato).sort()).toEqual(['barato', 'premium'])
  })
})

describe('sigue llegando a los agentes', () => {
  it('🔴 la lista declarada se les sigue diciendo', () => {
    expect(formatGuardrailsForPrompt({ forbidden_words: [], required_terminology: [], voice_description: null, competitor_mentions_policy: null, compliance_notes: null, hard_forbidden_words: ['gratis'] } as never)).toMatch(/FORBIDDEN WORDS[^\n]*gratis/)
  })
  it('🔴 a los jefes se les dice que no frena', () => {
    expect(REGLA_DE_LAS_PALABRAS_DEL_MANUAL).toMatch(/no frena/)
    expect(REGLA_DE_LAS_PALABRAS_DEL_MANUAL).not.toMatch(/se respeta tal cual/)
  })
})
