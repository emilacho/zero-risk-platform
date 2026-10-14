/**
 * OFICINA FINANCIERA · F7 · el canal de preguntas a Emilio y la lectura del hilo (R6) · CC#1 · 14-oct.
 * Todo con Slack SIMULADO: ningún envío real, ninguna llamada de red. Se prueba el filtro de «realmente necesaria» (7 condiciones), el mensaje (tuteo, sin jerga, ≤ 600 caracteres,
 * un solo mensaje por cliente), los topes, el vencimiento a las 72 h, la lectura de la respuesta, y `leerHilo` (solo Emilio, solo lo nuevo, y degrada sin lanzar).
 */
import { describe, expect, it } from 'vitest'
import { leerHilo } from '../src/lib/finanzas/hilo-slack'
import {
  armarMensaje, cambiaElResultado, erroresDePregunta, esPreguntaNecesaria, estadoTrasElTiempo, leerRespuesta, transicionValida,
  type ContextoDeFiltro, type Pregunta,
} from '../src/lib/finanzas/preguntas'

const Q: Pregunta = { clave: 'produccion', texto: 'El renglón de producción de contenido, ¿va dentro de lo que invierte el cliente o lo cobra la agencia?', recomendacion: 'que lo cobre la agencia, aparte de la pauta, porque así la pauta mide solo anuncios.', supuesto_si_no_responde: 'el plan sale con la producción aparte y lo marco como estimación.' }
const CTX: ContextoDeFiltro = {
  extremos: { veredicto_min: 'sigo', veredicto_max: 'paro', reparto_min: 100, reparto_max: 100 },
  resuelta_por_firma: false, es_de_afinar_despues: false, ya_respondida: false, resuelta_en_el_hilo: false, cliente_real: true, modo: 'envia', enviados_cliente_24h: 0, enviados_hoy_total: 0,
}

describe('el filtro «realmente necesaria»: las 7 condiciones, todas', () => {
  it('con todo en regla, sube', () => { expect(esPreguntaNecesaria(CTX)).toEqual({ si: true }) })
  const casos: Array<[string, Partial<ContextoDeFiltro>, string]> = [
    ['canal apagado', { modo: 'apagado' }, 'apagado'],
    ['no cambia el resultado (mismo veredicto y reparto)', { extremos: { veredicto_min: 'sigo', veredicto_max: 'sigo', reparto_min: 100, reparto_max: 100.2 } }, 'no cambia el resultado'],
    ['sin extremos calculados', { extremos: null }, 'no cambia el resultado'],
    ['la resuelve una firma', { resuelta_por_firma: true }, 'firma'],
    ['es de afinar después', { es_de_afinar_despues: true }, 'afinar'],
    ['ya se respondió', { ya_respondida: true }, 'ya se respondió'],
    ['el hilo ya la resolvió (condición 7)', { resuelta_en_el_hilo: true }, 'hilo'],
    ['cliente de práctica o en seco', { cliente_real: false }, 'borrador'],
    ['tope por cliente en 24 h', { enviados_cliente_24h: 1 }, '24 h'],
    ['tope diario total', { enviados_hoy_total: 3 }, '3 mensajes'],
  ]
  for (const [n, o, frag] of casos) {
    it(`no sube: ${n}`, () => {
      const r = esPreguntaNecesaria({ ...CTX, ...o })
      expect(r.si).toBe(false)
      expect(r.motivo).toContain(frag)
    })
  }
  it('cambia el resultado por veredicto, por reparto (>0,5 %) o por quién paga', () => {
    expect(cambiaElResultado({ veredicto_min: 'sigo', veredicto_max: 'ajusto', reparto_min: 10, reparto_max: 10 })).toBe(true)
    expect(cambiaElResultado({ veredicto_min: 'sigo', veredicto_max: 'sigo', reparto_min: 100, reparto_max: 120 })).toBe(true)
    expect(cambiaElResultado({ veredicto_min: 'sigo', veredicto_max: 'sigo', reparto_min: 100, reparto_max: 100.4 })).toBe(false)
    expect(cambiaElResultado({ veredicto_min: 'sigo', veredicto_max: 'sigo', reparto_min: 100, reparto_max: 100, quien_paga_cambia: true })).toBe(true)
  })
})

describe('el mensaje: tuteo, sin jerga, un solo mensaje por cliente', () => {
  it('arma UN mensaje con la pregunta, su recomendación y el «si no respondes»', () => {
    const r = armarMensaje({ cliente: 'Cliente de práctica', preguntas: [Q], enlace_al_hilo: 'https://ejemplo.invalid/hilo' })
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.texto).toContain('Hola Emilio. Para el plan de Cliente de práctica necesito tu decisión en una cosa:')
      expect(r.texto).toContain('1) El renglón de producción')
      expect(r.texto).toContain('Lo que recomiendo:')
      expect(r.texto).toContain('Si no respondes:')
      expect(r.texto).toContain('Responde en este hilo: https://ejemplo.invalid/hilo')
      expect(r.claves).toEqual(['produccion'])
    }
  })
  it('agrupa hasta 3 preguntas en el mismo mensaje, numeradas; más de 3 se rechaza', () => {
    const tres = ['a', 'b', 'c'].map((k) => ({ ...Q, clave: k }))
    const r = armarMensaje({ cliente: 'X', preguntas: tres })
    expect(r.ok && r.texto).toContain('en 3 cosas')
    expect(r.ok && r.texto).toContain('3) ')
    expect(armarMensaje({ cliente: 'X', preguntas: [...tres, { ...Q, clave: 'd' }] }).ok).toBe(false)
    expect(armarMensaje({ cliente: 'X', preguntas: [{ ...Q, clave: 'a' }, { ...Q, clave: 'a' }] }).ok).toBe(false)
    expect(armarMensaje({ cliente: 'X', preguntas: [] }).ok).toBe(false)
    expect(armarMensaje({ cliente: ' ', preguntas: [Q] }).ok).toBe(false)
  })
  it('rechaza la jerga (nombres de campos, tablas, flujos, herramientas) y el voseo', () => {
    for (const mala of ['revisa el dry_run del flujo', 'está en finanzas_tableros', 'el workflow de n8n', 'tenés que decidir', 'decime qué hacés', 'el tablero firmado', 'la huella del bloque']) {
      const e = erroresDePregunta({ ...Q, texto: mala })
      expect(e.length, mala).toBeGreaterThan(0)
    }
    expect(erroresDePregunta(Q)).toEqual([])
  })
  it('rechaza una pregunta que pasa de 600 caracteres o con campos vacíos', () => {
    expect(erroresDePregunta({ ...Q, texto: 'x'.repeat(700) }).join(' ')).toContain('600')
    expect(erroresDePregunta({ ...Q, recomendacion: '  ' }).join(' ')).toContain('recomendacion')
    expect(erroresDePregunta({ ...Q, clave: '' }).join(' ')).toContain('clave')
  })
})

describe('estados, vencimiento y respuesta', () => {
  it('a las 72 h una enviada y sin respuesta pasa a `vencida`; antes, no; las demás no cambian', () => {
    const t0 = '2026-10-14T10:00:00Z'
    expect(estadoTrasElTiempo({ estado: 'enviada', enviada_en: t0 }, new Date('2026-10-17T09:59:59Z'))).toBe('enviada')
    expect(estadoTrasElTiempo({ estado: 'enviada', enviada_en: t0 }, new Date('2026-10-17T10:00:00Z'))).toBe('vencida')
    expect(estadoTrasElTiempo({ estado: 'respondida', enviada_en: t0 }, new Date('2026-12-01T00:00:00Z'))).toBe('respondida')
    expect(estadoTrasElTiempo({ estado: 'borrador', enviada_en: null }, new Date('2026-12-01T00:00:00Z'))).toBe('borrador')
    expect(estadoTrasElTiempo({ estado: 'enviada', enviada_en: 'no es fecha' }, new Date())).toBe('enviada')
  })
  it('transiciones: no se reenvía una vencida ni se responde una borrador; los estados finales no salen', () => {
    expect(transicionValida('borrador', 'enviada')).toBe(true)
    expect(transicionValida('enviada', 'respondida')).toBe(true)
    expect(transicionValida('enviada', 'vencida')).toBe(true)
    expect(transicionValida('vencida', 'enviada')).toBe(false)
    expect(transicionValida('borrador', 'respondida')).toBe(false)
    expect(transicionValida('respondida', 'enviada')).toBe(false)
  })
  it('leerRespuesta: «1 sí», «2 no», «3: 25», «sí» con una sola pregunta; lo ambiguo NO cambia nada; la nota suelta es nota, no dato', () => {
    const c = ['a', 'b', 'c']
    expect(leerRespuesta('1 sí\n2 no\n3: 25,5', c)).toEqual([
      { tipo: 'respuesta', clave: 'a', valor: 'si', literal: '1 sí' },
      { tipo: 'respuesta', clave: 'b', valor: 'no', literal: '2 no' },
      { tipo: 'respuesta', clave: 'c', valor: { cifra: 25.5 }, literal: '3: 25,5' },
    ])
    expect(leerRespuesta('sí', ['a'])).toEqual([{ tipo: 'respuesta', clave: 'a', valor: 'si', literal: 'sí' }])
    expect(leerRespuesta('sí', c)[0].tipo).toBe('no_entendida')
    expect(leerRespuesta('1 quizás', c)[0].tipo).toBe('no_entendida')
    expect(leerRespuesta('9 sí', c)[0].tipo).toBe('no_entendida')
    expect(leerRespuesta('', c)).toEqual([])
    expect(leerRespuesta('1 sí; 2 no', c)).toHaveLength(2)
  })
})

describe('leerHilo (R6) · con Slack simulado', () => {
  const EMILIO = 'U_EMILIO', BOT = 'U_BOT', RAIZ = '1760000000.000100'
  const hilo = (messages: unknown[], extra: Record<string, unknown> = {}) => async () => new Response(JSON.stringify({ ok: true, messages, ...extra }), { status: 200 })
  const base = { canal: 'C_PRIVADO', thread_ts: RAIZ, emilio_id: EMILIO, token: 'xoxb-de-prueba' }

  it('devuelve solo los mensajes NUEVOS de Emilio, en orden, sin la raíz ni los del bot ni los de terceros', async () => {
    const r = await leerHilo({ ...base, desde_ts: '1760000000.000200', fetch: hilo([
      { ts: RAIZ, user: BOT, text: 'raíz' },
      { ts: '1760000000.000150', user: EMILIO, text: 'viejo' },
      { ts: '1760000000.000300', user: BOT, bot_id: 'B1', text: 'pregunta' },
      { ts: '1760000000.000500', user: EMILIO, text: ' 1 sí ' },
      { ts: '1760000000.000400', user: 'U_OTRO', text: 'opinión ajena' },
      { ts: '1760000000.000600', user: EMILIO, text: '2 no' },
      { ts: '1760000000.000700', user: EMILIO, subtype: 'message_changed', text: 'editado' },
    ]) as unknown as typeof fetch })
    expect(r.ok).toBe(true)
    expect(r.mensajes).toEqual([{ ts: '1760000000.000500', texto: '1 sí' }, { ts: '1760000000.000600', texto: '2 no' }])
    expect(r.leido_hasta).toBe('1760000000.000700')
  })
  it('compara los `ts` como número (no como texto): 1760000000.9 > 1760000000.10', async () => {
    const r = await leerHilo({ ...base, desde_ts: '1760000000.10', fetch: hilo([{ ts: '1760000000.9', user: EMILIO, text: 'sí' }]) as unknown as typeof fetch })
    expect(r.mensajes).toHaveLength(1)
  })
  it('lee varias páginas con cursor y se detiene en el tope', async () => {
    let n = 0
    const f = (async () => {
      n++
      return new Response(JSON.stringify({ ok: true, messages: [{ ts: `1760000000.00${n}00`, user: EMILIO, text: `m${n}` }], response_metadata: { next_cursor: 'c' + n } }), { status: 200 })
    }) as unknown as typeof fetch
    const r = await leerHilo({ ...base, max_paginas: 3, fetch: f })
    expect(n).toBe(3)
    expect(r.mensajes).toHaveLength(3)
  })
  for (const error of ['not_in_channel', 'channel_not_found', 'thread_not_found', 'missing_scope', 'invalid_auth']) {
    it(`${error}: no lanza, devuelve «sin acceso» y conserva el leído`, async () => {
      const f = (async () => new Response(JSON.stringify({ ok: false, error }), { status: 200 })) as unknown as typeof fetch
      const r = await leerHilo({ ...base, desde_ts: '1760000000.000100', fetch: f })
      expect(r).toMatchObject({ ok: false, mensajes: [], sin_acceso: error, leido_hasta: '1760000000.000100' })
    })
  }
  it('un fallo de red o un 429 no lanzan; sin llave o sin hilo, tampoco', async () => {
    expect((await leerHilo({ ...base, fetch: (async () => { throw new Error('red') }) as unknown as typeof fetch })).sin_acceso).toBe('red')
    expect((await leerHilo({ ...base, fetch: (async () => new Response('', { status: 429 })) as unknown as typeof fetch })).sin_acceso).toBe('limite_de_ritmo')
    expect((await leerHilo({ ...base, token: '', fetch: hilo([]) as unknown as typeof fetch })).sin_acceso).toBe('sin_llave')
    expect((await leerHilo({ ...base, thread_ts: '', fetch: hilo([]) as unknown as typeof fetch })).sin_acceso).toBe('faltan_canal_o_hilo')
  })
  it('un mensaje con el user de Emilio pero enviado por una aplicación (bot_id) NO cuenta', async () => {
    const r = await leerHilo({ ...base, fetch: hilo([{ ts: '1760000000.000500', user: EMILIO, bot_id: 'B_APP', text: '1 sí' }, { ts: '1760000000.000600', user: EMILIO, text: '2 no' }]) as unknown as typeof fetch })
    expect(r.mensajes).toEqual([{ ts: '1760000000.000600', texto: '2 no' }])
  })
  it('el ts se compara como número aunque el texto diga otra cosa (999,5 < 1000,5; 1760000000,5 > 9,9)', async () => {
    const a = await leerHilo({ ...base, desde_ts: '9.9', fetch: hilo([{ ts: '1760000000.5', user: EMILIO, text: 'sí' }]) as unknown as typeof fetch })
    expect(a.mensajes).toHaveLength(1)
    const b = await leerHilo({ ...base, desde_ts: '1000.5', fetch: hilo([{ ts: '999.5', user: EMILIO, text: 'sí' }]) as unknown as typeof fetch })
    expect(b.mensajes).toEqual([])
  })
  it('la misma respuesta no se aplica dos veces: con `desde_ts` = el último leído, no hay nada nuevo', async () => {
    const mensajes = [{ ts: '1760000000.000500', user: EMILIO, text: '1 sí' }]
    const primera = await leerHilo({ ...base, fetch: hilo(mensajes) as unknown as typeof fetch })
    expect(primera.mensajes).toHaveLength(1)
    const segunda = await leerHilo({ ...base, desde_ts: primera.leido_hasta, fetch: hilo(mensajes) as unknown as typeof fetch })
    expect(segunda.mensajes).toEqual([])
  })
  it('la llave viaja solo en la cabecera de autorización (nunca en la dirección)', async () => {
    let url = '', auth = ''
    const f = (async (u: string, init?: RequestInit) => { url = u; auth = String((init?.headers as Record<string, string>)?.authorization); return new Response(JSON.stringify({ ok: true, messages: [] }), { status: 200 }) }) as unknown as typeof fetch
    await leerHilo({ ...base, fetch: f })
    expect(url).not.toContain('xoxb')
    expect(auth).toBe('Bearer xoxb-de-prueba')
    expect(url).toContain('conversations.replies')
  })
})
