/**
 * OFICINA FINANCIERA · F7 · reparos de CC#3 (R5 bloqueo, R6, R7, R8, R9 y la nota del envío) · CC#1 · 14-oct.
 * El lector de respuestas NO PUEDE deformar una cifra de Emilio: «12» es 12, «10» es 10, «1.5» y «1,5» son 1,5, «0,5» es 0,5, «1 1.5» es la pregunta 1 con 1,5.
 */
import { describe, expect, it } from 'vitest'
import { leerHilo } from '../src/lib/finanzas/hilo-slack'
import { erroresDePregunta, jergaEn, leerCifra, leerRespuesta, puedeEnviarAhora, voseoEn, esPreguntaNecesaria, type ContextoDeFiltro } from '../src/lib/finanzas/preguntas'

describe('R5 · el lector de cifras no deforma lo que Emilio escribe', () => {
  const una = ['k']
  const tres = ['a', 'b', 'c']
  const valor = (t: string, claves = una) => { const r = leerRespuesta(t, claves)[0]; return r.tipo === 'respuesta' ? r.valor : r.tipo }
  it('con UNA pregunta, la cifra sola es la cifra: 12, 10, 25, 300, 1.5, 1,5, 0,5, 0.5, 2.000 (ambigua), US$ 25', () => {
    expect(valor('12')).toEqual({ cifra: 12 })
    expect(valor('10')).toEqual({ cifra: 10 })
    expect(valor('25')).toEqual({ cifra: 25 })
    expect(valor('300')).toEqual({ cifra: 300 })
    expect(valor('1.5')).toEqual({ cifra: 1.5 })
    expect(valor('1,5')).toEqual({ cifra: 1.5 })
    expect(valor('0,5')).toEqual({ cifra: 0.5 })
    expect(valor('0.5')).toEqual({ cifra: 0.5 })
    expect(valor('US$ 25')).toEqual({ cifra: 25 })
    expect(valor('$25,50')).toEqual({ cifra: 25.5 })
    expect(valor('25 USD')).toEqual({ cifra: 25 })
    expect(valor('1.500')).toBe('no_entendida')
    expect(valor('2,000')).toBe('no_entendida')
  })
  it('con el número de la pregunta: «1 12» → pregunta 1, 12; «1 1.5» → 1,5; «1 1,5» → 1,5; «1 0.5» → 0,5; «1: 25»; «1) 10»', () => {
    for (const [t, v] of [['1 12', 12], ['1 1.5', 1.5], ['1 1,5', 1.5], ['1 0.5', 0.5], ['1: 25', 25], ['1) 10', 10], ['1 - 7', 7], ['1. 3', 3]] as Array<[string, number]>) {
      const r = leerRespuesta(t, una)[0]
      expect(r, t).toMatchObject({ tipo: 'respuesta', clave: 'k', valor: { cifra: v } })
    }
  })
  it('con VARIAS preguntas: el número de pregunta solo cuenta con separador; «12» y «10» solos NO se parten ni se adivinan', () => {
    expect(leerRespuesta('2 12', tres)[0]).toMatchObject({ tipo: 'respuesta', clave: 'b', valor: { cifra: 12 } })
    expect(leerRespuesta('3 1.5', tres)[0]).toMatchObject({ tipo: 'respuesta', clave: 'c', valor: { cifra: 1.5 } })
    expect(leerRespuesta('1 0,5', tres)[0]).toMatchObject({ tipo: 'respuesta', clave: 'a', valor: { cifra: 0.5 } })
    for (const sola of ['12', '10', '1.5', '25']) expect(leerRespuesta(sola, tres)[0].tipo, sola).toBe('no_entendida')
    // nunca «12» → pregunta 1 con valor 2, ni «10» → pregunta 1 con 0
    for (const sola of ['12', '10']) expect(leerRespuesta(sola, tres).some((r) => r.tipo === 'respuesta')).toBe(false)
  })
  it('un número de pregunta que no existe NO se inventa: «9 sí» es no entendida', () => {
    expect(leerRespuesta('9 sí', tres)[0]).toMatchObject({ tipo: 'no_entendida' })
  })
  it('los formatos con miles: 1.234,50 y 1,234.50 valen 1234,5; 1.234.567 vale 1234567; los mal puestos se rechazan', () => {
    expect(leerCifra('1.234,50')).toEqual({ ok: true, cifra: 1234.5 })
    expect(leerCifra('1,234.50')).toEqual({ ok: true, cifra: 1234.5 })
    expect(leerCifra('1.234.567')).toEqual({ ok: true, cifra: 1234567 })
    expect(leerCifra('1,234,567')).toEqual({ ok: true, cifra: 1234567 })
    expect(leerCifra('12.34.5')).toMatchObject({ ok: false })
    expect(leerCifra('1,2,3')).toMatchObject({ ok: false })
    expect(leerCifra('abc')).toMatchObject({ ok: false })
    expect(leerCifra('')).toMatchObject({ ok: false })
  })
  it('texto mezclado: «1 sí\\nuna nota\\n2 25,5» → dos respuestas y una NOTA (nunca dato)', () => {
    const r = leerRespuesta('1 sí\nme parece bien así, pero revisa el caso\n2 25,5', tres)
    expect(r.map((x) => x.tipo)).toEqual(['respuesta', 'nota', 'respuesta'])
    expect(r[2]).toMatchObject({ clave: 'b', valor: { cifra: 25.5 } })
  })
  it('sí y no sin número: con una pregunta valen; con varias no se adivina', () => {
    expect(leerRespuesta('sí', una)[0]).toMatchObject({ tipo: 'respuesta', valor: 'si' })
    expect(leerRespuesta('No', una)[0]).toMatchObject({ tipo: 'respuesta', valor: 'no' })
    expect(leerRespuesta('dale', una)[0]).toMatchObject({ tipo: 'respuesta', valor: 'si' })
    expect(leerRespuesta('sí', tres)[0].tipo).toBe('no_entendida')
  })
  it('la frase literal de Emilio se conserva tal cual, con su cifra', () => {
    expect(leerRespuesta('  1 1,5  ', una)[0]).toMatchObject({ literal: '1 1,5' })
  })
})

describe('R6 · el detector de voseo ve las formas con tilde final', () => {
  it('mirá, andá, hacé, poné, respondé, elegí, confirmá, necesitás, cobrás, decime, tenés, podés se detectan', () => {
    for (const v of ['Mirá el plan', 'andá a revisar', 'hacé la prueba', 'poné la cifra', 'respondé aquí', 'elegí una', 'confirmá el monto', 'necesitás decidir', 'cobrás aparte', 'decime qué hacés', 'tenés que decidir', 'podés responder', 'vos decidís', 'si querés']) {
      expect(voseoEn(v).length, v).toBeGreaterThan(0)
    }
  })
  it('la regla general -ás / -ís (verbos que NO están en la lista) también se detecta: hablás, trabajás, llegás, enviás, quedás, compartís, aprendés no, pero sí escribís', () => {
    for (const v of ['hablás', 'trabajás', 'llegás', 'enviás', 'quedás', 'compartís', 'recibís', 'seguís']) expect(voseoEn(v), v).toEqual([v])
    for (const t of ['hablarás', 'trabajarás', 'llegarás', 'enviarás', 'pondrás', 'saldrás', 'dirás', 'tú hablas', 'país', 'quizás', 'además']) expect(voseoEn(t), t).toEqual([])
  })
  it('el tuteo y las palabras normales NO se marcan: más, además, también, país, estás, serás, pagarás, tendrás, café, está, será, aquí', () => {
    for (const t of ['más barato', 'además de eso', 'también', 'el país', 'tú estás bien', 'serás el primero', 'pagarás menos', 'tendrás el informe', 'un café', 'está listo', 'será mañana', 'aquí', 'Mira el plan', 'elige una', 'haz la prueba', 'confirma el monto', 'necesitas decidir', 'cobras aparte', 'dime qué haces', 'tienes que decidir', 'puedes responder', 'quizás mañana', 'detrás del plan']) {
      expect(voseoEn(t), t).toEqual([])
    }
  })
  it('erroresDePregunta usa el detector nuevo (una pregunta con «mirá» se rechaza con la forma hallada)', () => {
    const q = { clave: 'k', texto: 'Mirá si el renglón va dentro del presupuesto', recomendacion: 'que lo cobre la agencia.', supuesto_si_no_responde: 'sale con la producción aparte.' }
    expect(erroresDePregunta(q).join(' ')).toContain('voseo')
    expect(erroresDePregunta(q).join(' ')).toContain('mirá')
  })
})

describe('R7 · la jerga se busca por PALABRA completa', () => {
  it('«apicultura», «apio», «rápido», «jsonista»… no se rechazan; «api», «la api», «el JSON», «dry_run», «finanzas_tableros» sí', () => {
    for (const ok of ['la apicultura crece', 'un apio fresco', 'rápido', 'merger de empresas es otra cosa', 'comité', 'el rlsx']) expect(jergaEn(ok), ok).toEqual([])
    for (const mal of ['la api', 'el JSON del plan', 'revisa el dry_run', 'la tabla finanzas_tableros', 'el workflow']) expect(jergaEn(mal).length, mal).toBeGreaterThan(0)
  })
})

describe('R8 y R9 · el hilo', () => {
  const EMILIO = 'U_EMILIO', BOT = 'U_BOT', RAIZ = '1760000000.000100'
  const base = { canal: 'C_PRIVADO', thread_ts: RAIZ, emilio_id: EMILIO, token: 'xoxb-de-prueba' }
  const hilo = (messages: unknown[]) => (async () => new Response(JSON.stringify({ ok: true, messages }), { status: 200 })) as unknown as typeof fetch
  it('R8 · una respuesta con «Enviar también al canal» (subtipo thread_broadcast) SÍ cuenta; los demás subtipos, no', async () => {
    const r = await leerHilo({ ...base, fetch: hilo([
      { ts: '1760000000.000200', user: EMILIO, subtype: 'thread_broadcast', text: '1 sí' },
      { ts: '1760000000.000300', user: EMILIO, subtype: 'message_changed', text: 'editado' },
      { ts: '1760000000.000400', user: EMILIO, subtype: 'channel_join', text: 'se unió' },
    ]) })
    expect(r.mensajes).toEqual([{ ts: '1760000000.000200', texto: '1 sí' }])
  })
  it('R9 · la RAÍZ del hilo no cuenta aunque la hubiera escrito Emilio', async () => {
    const r = await leerHilo({ ...base, fetch: hilo([{ ts: RAIZ, user: EMILIO, text: 'esta es la raíz' }, { ts: '1760000000.000200', user: EMILIO, text: '1 sí' }]) })
    expect(r.mensajes).toEqual([{ ts: '1760000000.000200', texto: '1 sí' }])
    expect(r.leido_hasta).toBe('1760000000.000200')
  })
})

describe('el envío NO depende de que la pregunta sea «necesaria» (nota de CC#3)', () => {
  const CTX: ContextoDeFiltro = { extremos: { veredicto_min: 'sigo', veredicto_max: 'paro', reparto_min: 1, reparto_max: 1 }, resuelta_por_firma: false, es_de_afinar_despues: false, ya_respondida: false, resuelta_en_el_hilo: false, cliente_real: true, modo: 'borrador', enviados_cliente_24h: 0, enviados_hoy_total: 0 }
  it('en «borrador» la función dice «sí es necesaria» y AUN ASÍ no se envía; solo en «envia» y necesaria', () => {
    const n = esPreguntaNecesaria(CTX)
    expect(n.si).toBe(true)
    expect(puedeEnviarAhora('borrador', n)).toBe(false)
    expect(puedeEnviarAhora('apagado', n)).toBe(false)
    expect(puedeEnviarAhora('envia', n)).toBe(true)
    expect(puedeEnviarAhora('envia', { si: false })).toBe(false)
  })
})

describe('ronda 2 de CC#3 · el espacio no es un separador de cifras', () => {
  const una = ['k']
  const tres = ['a', 'b', 'c']
  const tipo = (t: string, c = una) => leerRespuesta(t, c)[0]
  it('«10 20», «12 1», «2 12», «12 12», «5 5», «1 2 3», «40 50» NO se juntan: no entendida (nunca un dato falso)', () => {
    for (const t of ['10 20', '12 1', '2 12', '12 12', '5 5', '1 2 3', '40 50']) {
      const r = tipo(t)
      expect(r.tipo, t).not.toBe('respuesta')
    }
  })
  it('«12 000» y «1 234,50» son miles con grupos de 3; «1 500» y «1 000» con la pregunta 1 válida son ambiguos (no se adivina)', () => {
    expect(leerCifra('12 000')).toEqual({ ok: true, cifra: 12000 })
    expect(leerCifra('1 234,50')).toEqual({ ok: true, cifra: 1234.5 })
    expect(leerCifra('10 20').ok).toBe(false)
    expect(tipo('12 000').tipo).toBe('respuesta')
    expect(tipo('1 500').tipo).toBe('no_entendida')
    expect(tipo('1 000').tipo).toBe('no_entendida')
    expect(tipo('1 000', tres).tipo).toBe('no_entendida')
  })
  it('la cifra tiene cota (1e20 no es una respuesta) y «USD 25» lee igual que «25 usd»', () => {
    expect(leerCifra('99999999999999999999').ok).toBe(false)
    expect(leerCifra('USD 25')).toEqual({ ok: true, cifra: 25 })
    expect(leerCifra('25 usd')).toEqual({ ok: true, cifra: 25 })
    expect(leerCifra('US$ 25')).toEqual({ ok: true, cifra: 25 })
  })
  it('un `ts` no numérico se ignora y no clava el cursor de lectura', async () => {
    const f = (async () => new Response(JSON.stringify({ ok: true, messages: [{ ts: 'abc', user: 'U_E', text: 'basura' }, { ts: '1760000000.000200', user: 'U_E', text: '1 sí' }] }), { status: 200 })) as unknown as typeof fetch
    const r = await leerHilo({ canal: 'C', thread_ts: '1760000000.000100', emilio_id: 'U_E', token: 't', fetch: f })
    expect(r.mensajes).toEqual([{ ts: '1760000000.000200', texto: '1 sí' }])
    expect(r.leido_hasta).toBe('1760000000.000200')
  })
  it('el voseo que la barredora de la casa conoce, este detector también (y el tuteo no se marca)', async () => {
    for (const v of ['escuchá', 'agregá', 'contestá', 'entendés', 'mandame', 'acordate', 'considerá', 'verificá', 'sentate', 'podes']) expect(voseoEn(`por favor ${v} esto`).length, v).toBeGreaterThan(0)
    for (const t of ['más', 'además', 'estás', 'está', 'allá', 'acá', 'será', 'pagará', 'tendrás', 'país']) expect(voseoEn(`por favor ${t} esto`), t).toEqual([])
    const { TABLA } = await import('../scripts/ops/barrer-voseo.mjs')
    const faltan = Object.keys(TABLA).filter((k) => k !== 'dale' && voseoEn(k).length === 0)
    expect(faltan).toEqual([])
  })
})
