/**
 * EL MENSAJE AL DUEÑO (CC#2 · 20-oct · lo que dejó ver la tercera prueba): salió con «Para el plan de df7e47cc-bec4-…» (el id del cliente en vez de su nombre) y con «Separalo en dos» (voseo con
 * pronombre pegado que el detector no conocía). US$ 0 · Slack, cerebro y base SIMULADOS.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { estadoInicial } from '../src/lib/oficina/tipos'
import { preguntarAlDueno, tutearPregunta, type PuertosDelBuzon } from '../src/lib/finanzas/conversa/buzon'
import { NOMBRE_SIN_FICHA, nombreDelClienteDe, pareceUnId } from '../src/lib/finanzas/conversa/nombre'
import { voseoEn } from '../src/lib/finanzas/preguntas'
import { slackMdPuerto } from '../src/lib/buzon-dueno/slack-md'
import type { CerebroDelDueno } from '../src/lib/buzon-dueno/cerebro-dueno'
import type { AlmacenDeConversa, EncargoDeConversa } from '../src/lib/finanzas/conversa/puertos'
import { barrerTexto, FORMAS_CON_PRONOMBRE } from '../scripts/ops/barrer-voseo.mjs'

const UUID = 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5'

describe('VOSEO CON PRONOMBRE PEGADO · el detector y la conversión comparten diccionario', () => {
  const VOSEO = ['Separalo', 'separala', 'Dejame', 'dejalo', 'Revisalo', 'confirmalo', 'pasame', 'contalo', 'Preguntale', 'quitale', 'leelo', 'mostralo', 'probalo', 'escribime', 'ejecutalas', 'comparalos', 'llamanos', 'fijate', 'asegurate']
  it('🔴 el detector marca el voseo con pronombre (lo de la tercera prueba: «Separalo en dos»)', () => {
    for (const w of VOSEO) expect(voseoEn(`${w} en dos`), w).toContain(w.toLowerCase())
    expect(voseoEn('Separalo en dos: venta de equipo nuevo versus recarga')).toEqual(['separalo'])
  })
  it('no marca el tuteo con tilde ni palabras reales que terminan igual (ni inglés en el texto)', () => {
    for (const ok of ['Sepáralo', 'Déjalo', 'Revísalo', 'Cuéntalo', 'Pásame', 'Pregúntale', 'léelo', 'muéstralo', 'escríbeme']) expect(voseoEn(ok), ok).toEqual([])
    for (const real of ['terminales', 'generales', 'informales', 'tomate', 'mandala', 'palo', 'regalo', 'malo', 'hola', 'sala', 'lote', 'calo', 'señalo', 'validate', 'generate', 'separate', 'estimate', 'calculate', 'mandate', 'terminate'])
      expect(voseoEn(`El ${real} del cliente`), real).toEqual([])
  })
  it('la barredora convierte con la tilde en la sílaba tónica y conserva la mayúscula', () => {
    const pares: Array<[string, string]> = [['Separalo en dos.', 'Sepáralo en dos.'], ['Dejame ver.', 'Déjame ver.'], ['Revisalo.', 'Revísalo.'], ['Confirmalo con el cliente.', 'Confírmalo con el cliente.'], ['Mejoralo.', 'Mejóralo.'],
      ['Pasame el dato.', 'Pásame el dato.'], ['Contalo bien.', 'Cuéntalo bien.'], ['Mostrala.', 'Muéstrala.'], ['Probalo hoy.', 'Pruébalo hoy.'], ['Leelo despacio.', 'Léelo despacio.'], ['Preguntale al contador.', 'Pregúntale al contador.'], ['SEPARALO.', 'SEPÁRALO.']]
    for (const [vos, tu] of pares) expect(barrerTexto(vos, { soloInicio: true, conPronombre: true }).texto, vos).toBe(tu)
    for (const intacto of ['Tomate un café.', 'Los terminales y los generales.', 'Son temas informales.', 'Dibuja un mandala.']) expect(barrerTexto(intacto, { soloInicio: true, conPronombre: true }).texto, intacto).toBe(intacto)
  })
  it('🔴 el barrido de papeles e instrucciones NO la usa: sin `conPronombre` la barredora deja esas formas como están (hay papeles del vault que las traen)', () => {
    for (const w of ['Separalo en dos.', 'Confirmalo con el cliente.', 'Contalo bien.']) expect(barrerTexto(w, { soloInicio: true }).texto, w).toBe(w)
    expect(barrerTexto('Usalo y llamá al cliente.', { soloInicio: true }).texto).toBe('Úsalo y llama al cliente.') // lo que ya barría, igual
  })
  it('🔴 lo que la barredora produce NUNCA es voseo para el detector (toda forma generada: su sustituto queda limpio)', () => {
    expect(FORMAS_CON_PRONOMBRE.length).toBeGreaterThan(400)
    for (const vos of FORMAS_CON_PRONOMBRE) {
      const tu = barrerTexto(vos, { soloInicio: true, conPronombre: true }).texto
      expect(tu, vos).not.toBe(vos)
      expect(voseoEn(tu), `${vos} → ${tu}`).toEqual([])
    }
  })
  it('🔴 y todas las generadas SON marcadas por el detector (mismo diccionario)', () => { for (const vos of FORMAS_CON_PRONOMBRE) expect(voseoEn(vos), vos).toContain(vos) })
  it('la pregunta REAL de la tercera prueba queda en tuteo', () => {
    const q = { clave: 'ticket', texto: '¿Cuál es el monto promedio real de lo que te paga un cliente B2B típico? Separalo en dos: venta de equipo nuevo (¿cuántos extintores en promedio y a qué precio?) versus recarga o mantenimiento.', recomendacion: 'Con ese número se recalcula el CPV máximo admisible.', supuesto_si_no_responde: 'Ticket $280, margen 38%.' }
    const r = tutearPregunta(q)
    expect(r.cambiada).toBe(true); expect(r.q.texto).toContain('Sepáralo en dos'); expect(voseoEn(r.q.texto)).toEqual([])
  })
})

describe('EL NOMBRE DEL CLIENTE en el mensaje (nunca el id)', () => {
  const ficha = (data: unknown, error: unknown = null) => ({ from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ data, error }) }) }) }) }) as never
  it('lee clients.name; sin ficha, con error, vacío, con un id como nombre o si la base lanza ⇒ null', async () => {
    expect(await nombreDelClienteDe(ficha([{ name: '  Zero Risk Seguridad Industrial ' }]))(UUID)).toBe('Zero Risk Seguridad Industrial')
    for (const malo of [ficha([]), ficha(null), ficha([{ name: '' }]), ficha([{ name: UUID }]), ficha([{ name: '12345' }]), ficha([{ name: 7 }])]) expect(await nombreDelClienteDe(malo)(UUID)).toBeNull()
    expect(await nombreDelClienteDe(ficha(null, { message: 'x' }))(UUID)).toBeNull()
    expect(await nombreDelClienteDe(ficha([{ name: 'Con Error' }], { message: 'x' }))(UUID)).toBeNull() // un error de la base manda aunque venga un dato
    expect(await nombreDelClienteDe({ from() { throw new Error('caída') } } as never)(UUID)).toBeNull()
    expect((await nombreDelClienteDe(ficha([{ name: 'N'.repeat(200) }]))(UUID))!.length).toBe(80)
  })
  it('pareceUnId: uuid o sin letras', () => { expect(pareceUnId(UUID)).toBe(true); expect(pareceUnId('0123')).toBe(true); expect(pareceUnId('Náufrago')).toBe(false) })

  function mundo() {
    const e: EncargoDeConversa = { id: 'enc-1', client_id: UUID, estado: 'cerrado', estado_del_motor: estadoInicial(), gasto_usd: 1.2, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: false, semilla: {} }
    const arts: Record<string, Record<string, unknown>> = { acuerdo: { preguntas_a_emilio: [{ clave: 'ticket', texto: '¿Cuál es el monto promedio? Separalo en dos: equipo nuevo versus recarga.', recomendacion: 'Responde la cifra real', supuesto_si_no_responde: 'Ticket $280' }] } }
    const almacen: AlmacenDeConversa = {
      async crearEncargo() { return { ok: true, encargo: e, nuevo: false } }, async leerEncargo() { return structuredClone(e) }, async guardar() { throw new Error('no') },
      async artefactos() { return structuredClone(arts) }, async turnos() { return [] },
      async guardarBuzon(c) { if (c.slack_ts !== undefined) e.slack_ts = c.slack_ts; if (c.slack_canal !== undefined) e.slack_canal = c.slack_canal },
    }
    return almacen
  }
  const enviar = async (nombre?: (id: string) => Promise<string | null>) => {
    const llamadas: Array<{ metodo: string; cuerpo?: any }> = []
    const f = (async (url: string, init?: any) => {
      const metodo = new URL(url).pathname.replace('/api/', ''); llamadas.push({ metodo, cuerpo: init?.body ? JSON.parse(init.body) : undefined })
      return { status: 200, json: async () => (metodo === 'chat.postMessage' ? { ok: true, ts: '1700000000.000100', channel: 'D123ABC' } : { ok: true, messages: [] }) }
    }) as unknown as typeof fetch
    const cerebro: CerebroDelDueno = { async registrarPregunta() { return { ok: true, estado: 'registrada', pregunta_id: 'p' } }, async registrarRespuesta() { return { ok: true } } }
    const P: PuertosDelBuzon = { almacen: mundo(), slack: slackMdPuerto({ token: 'xoxb-falso', dueno_id: 'U_DUENO', fetch: f }), cerebro, modo: 'envia', ahora: () => new Date(1_700_000_000_000), ...(nombre ? { nombreDelCliente: nombre } : {}) }
    const r = await preguntarAlDueno(P, 'enc-1')
    return { r, texto: String(llamadas.find((l) => l.metodo === 'chat.postMessage')?.cuerpo?.text ?? '') }
  }
  it('🔴 con la ficha: «Para el plan de <nombre>» y el voseo convertido; jamás el id', async () => {
    const { r, texto } = await enviar(async () => 'Zero Risk Seguridad Industrial')
    expect(r.cuerpo.enviado).toBe(true)
    expect(texto).toContain('Para el plan de Zero Risk Seguridad Industrial'); expect(texto).toContain('Sepáralo en dos'); expect(texto).not.toContain(UUID); expect(voseoEn(texto)).toEqual([])
  })
  it('🔴 sin puerto, sin nombre, con error o con un id como nombre: «tu negocio», nunca el id', async () => {
    for (const n of [undefined, async () => null, async () => '', async () => UUID, async () => { throw new Error('x') }] as Array<((id: string) => Promise<string | null>) | undefined>) {
      const { texto } = await enviar(n)
      expect(texto).toContain(`Para el plan de ${NOMBRE_SIN_FICHA}`); expect(texto).not.toContain(UUID)
    }
  })
  it('la ruta pasa el puerto con la base real (si no, volvería a salir el id)', () => {
    const ruta = fs.readFileSync('src/app/api/finanzas/conversa/route.ts', 'utf8').split('\r\n').join('\n')
    expect(ruta).toContain("import { nombreDelClienteDe } from '@/lib/finanzas/conversa/nombre'")
    expect(ruta).toContain('nombreDelCliente: nombreDelClienteDe(db),')
  })
})
