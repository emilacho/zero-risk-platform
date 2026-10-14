/**
 * JEFATURA · J7(pieza) (CC#1 · 14-oct) · el flujo de PRUEBA que revisa una pieza YA PRODUCIDA con la puerta de la jefatura (la `oficina` no se toca; el paso `jefatura` de sus plantillas es J8a).
 * Es un flujo NUEVO e INACTIVO (no hay ANTES): se prueba su entrada (llave, `dry_run` booleano, pieza mínima), que lo que manda es una entrada VÁLIDA de la ruta, y su resumen. US$ 0.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validarEntrada } from '@/lib/jefatura/revision/contrato'
import { N, NOMBRES_DE_LA_PUERTA } from '../scripts/worker-staging/jefatura-j7/gate.mjs'
import { construirPruebaDePieza, PRUEBA_DE_PIEZA } from '../scripts/worker-staging/jefatura-j7/construir-enganches.mjs'
import { construirTurno, construirVigia } from '../scripts/worker-staging/jefatura/construir-jefatura.mjs'
import { ejecutar, ENV, resp, UUID, type Json } from './_helpers/j7-flujos'

const flujo = construirPruebaDePieza() as Json
const entrada = (cuerpo: Json, llave = ENV.SALA_DISPATCH_KEY) => ({ headers: { 'x-sala-dispatch-key': llave }, body: cuerpo })
const pieza = (o: Json = {}): Json => ({ dry_run: false, client_id: 'prueba-jefatura-real-restaurante', artifact_id: 'prueba-pieza-1', texto: 'Cazuela de mariscos: cuéntanos qué necesitas y te respondemos hoy.\n\n#fogon', ...o })
const correr = (cuerpo: Json, http: Json = {}, llave?: string) => ejecutar(flujo, { inicio: 'Webhook · prueba de pieza', items: [entrada(cuerpo, llave)], http, reales: ['⓪ Entrada · llave', 'Fin · prueba de pieza'] })
const noAbre = { [N.abrir]: () => resp(409, { error: 'jefatura_no_abre', motivo: 'apagada' }) }

describe('J7(pieza) · el flujo de prueba (nuevo, inactivo)', () => {
  it('es un flujo completo: webhook → entrada → puerta → fin, con nombres únicos y enlaces que apuntan a nodos que existen', () => {
    const nombres = (flujo.nodes as Json[]).map((n) => n.name)
    expect(new Set(nombres).size).toBe(nombres.length)
    for (const n of NOMBRES_DE_LA_PUERTA) expect(nombres).toContain(n)
    for (const c of Object.values(flujo.connections as Json)) for (const s of (c as Json).main) for (const d of s) expect(nombres).toContain(d.node)
    expect(flujo.connections['⓪ Entrada · llave'].main[0]).toEqual([{ node: N.armar, type: 'main', index: 0 }])
    expect(flujo.connections[N.aplicar].main[0]).toEqual([{ node: 'Fin · prueba de pieza', type: 'main', index: 0 }])
    expect(flujo.name).toBe(PRUEBA_DE_PIEZA.nombre)
  })
  it('su dirección de webhook y su identificador no chocan con los flujos de la jefatura ni con el de la oficina', () => {
    const w = (f: Json) => (f.nodes as Json[]).filter((n) => n.type === 'n8n-nodes-base.webhook').map((n) => `${n.parameters.path}|${n.webhookId}`)
    const mios = w(flujo)
    expect(mios).toEqual([`${PRUEBA_DE_PIEZA.path}|${PRUEBA_DE_PIEZA.webhookId}`])
    for (const otro of [construirTurno(), construirVigia(), { nodes: [{ type: 'n8n-nodes-base.webhook', parameters: { path: 'zero-risk/oficina-turno' }, webhookId: 'oficina-turno-0001' }] }]) for (const x of w(otro as Json)) { expect(mios).not.toContain(x); expect(x.split('|')[0]).not.toBe(PRUEBA_DE_PIEZA.path) }
  })
  it('ningún nodo se reintenta, los HTTP entregan siempre salida, ninguna llave pegada y la llave de despacho sale del entorno', () => {
    const s = JSON.stringify(flujo)
    expect(s).not.toMatch(/[0-9a-f]{64}/); expect(s).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/); expect(s).not.toMatch(/(?<![A-Za-z-])sk-[A-Za-z0-9_-]{20,}/)
    for (const n of flujo.nodes as Json[]) { expect(n.retryOnFail ?? false).toBe(false); if (n.type === 'n8n-nodes-base.httpRequest') { expect(n.onError).toBe('continueRegularOutput'); expect(n.parameters.options.response.response.neverError).toBe(true) } }
    expect(s).toContain('$env.SALA_DISPATCH_KEY')
  })
  it('el archivo NUEVO del repositorio es exactamente lo que construye el código', () => {
    const f = JSON.parse(fs.readFileSync('scripts/worker-staging/jefatura-j7/NUEVO-jefatura-prueba-de-pieza-j7-2026-10-14.json', 'utf8').split('\r\n').join('\n'))
    expect(f).toEqual(flujo)
  })

  describe('la entrada se cierra antes de abrir nada', () => {
    for (const [caso, cuerpo, llave, re] of [
      ['llave de despacho incorrecta', pieza(), 'otra-llave', /PROCEDENCIA_INVALIDA/],
      ['sin llave', pieza(), '', /PROCEDENCIA_INVALIDA/],
      ['dry_run ausente', (() => { const p = pieza(); delete p.dry_run; return p })(), undefined, /SIN_DRY_RUN/],
      ['dry_run como texto', pieza({ dry_run: 'false' }), undefined, /SIN_DRY_RUN/],
      ['client_id con caracteres raros', pieza({ client_id: "x'; drop" }), undefined, /CLIENTE_INVALIDO/],
      ['sin texto', pieza({ texto: '  ' }), undefined, /SIN_TEXTO/],
      ['artefacto con espacios', pieza({ artifact_id: 'dos palabras' }), undefined, /ARTEFACTO_INVALIDO/],
    ] as Array<[string, Json, string | undefined, RegExp]>) {
      it(`${caso}: se detiene y no llama a la ruta`, async () => {
        let llamadas = 0
        await expect(correr(cuerpo, { [N.abrir]: () => { llamadas += 1; return resp(409, {}) } }, llave)).rejects.toThrow(re)
        expect(llamadas).toBe(0)
      })
    }
  })

  describe('lo que manda y lo que devuelve', () => {
    it('manda una entrada VÁLIDA de la ruta: pieza, el artefacto de quien llama, dry_run tal cual, devolver_a ninguno, con su contexto, imágenes y dueños si los trae', async () => {
      const cuerpo = pieza({ imagenes: ['https://fotos.test/a.jpg'], contexto: [{ titulo: 'Manual de marca vigente', texto: 'MANUAL' }, { titulo: 3 }], productores: [{ donde: 'texto', agente: 'content-creator' }, { donde: 1 }], marcas_heredadas: ['m1', 2], tope_restante_usd: 0.4, journey_id: 'j-1' })
      const d = await correr(cuerpo, noAbre)
      const c = d.llamadasHttp.find((l: Json) => l.nodo === N.abrir).cuerpo
      expect(validarEntrada(c).ok).toBe(true)
      expect(c).toMatchObject({ artifact_type: 'pieza', artifact_id: 'prueba-pieza-1', client_id: 'prueba-jefatura-real-restaurante', journey_id: 'j-1' })
      expect(c.payload).toMatchObject({ dry_run: false, devolver_a: { tipo: 'ninguno', destino: '' }, familia: 'post_img', imagenes: ['https://fotos.test/a.jpg'], tope_restante_usd: 0.4, marcas_heredadas: ['m1'] })
      expect(c.payload.contexto).toEqual([{ titulo: 'Manual de marca vigente', texto: 'MANUAL' }])
      expect(c.payload.productores).toEqual([{ donde: 'texto', agente: 'content-creator' }])
      expect(c.payload.simulacion).toBeUndefined()
    })
    it('`simulacion` solo viaja si es un ensayo (dry_run=true); en real se ignora aunque llegue', async () => {
      const real = await correr(pieza({ simulacion: { fichas: 'bloquea' } }), noAbre)
      expect(real.llamadasHttp.find((l: Json) => l.nodo === N.abrir).cuerpo.payload.simulacion).toBeUndefined()
      const seco = await correr(pieza({ dry_run: true, simulacion: { fichas: 'bloquea' } }), noAbre)
      const c = seco.llamadasHttp.find((l: Json) => l.nodo === N.abrir).cuerpo
      expect(c.payload.simulacion).toEqual({ fichas: 'bloquea' }); expect(validarEntrada(c).ok).toBe(true)
    })
    it('apagada (409): el resumen lo dice y no se escribe nada', async () => {
      const d = await correr(pieza(), noAbre)
      expect(d.visitas.find((v: Json) => v.nodo === 'Fin · prueba de pieza').salida[0]).toMatchObject({ fase: 'no_abre', resultado: null, revision_id: null })
      expect(d.llamadasHttp).toHaveLength(1)
    })
    it('con la revisión cerrada: el resumen trae el resultado, las marcas, los desacuerdos y el costo', async () => {
      let k = 0
      const d = await correr(pieza(), {
        [N.abrir]: () => resp(200, { accion: 'esperar', revision_id: UUID, turno: { n: 1, tipo: 'agente', paso: 'revision_fondo', pedido: {} } }),
        [N.despertar]: () => resp(200, {}),
        [N.leer]: () => { k += 1; return k < 2 ? resp(200, { revision_id: UUID, estado: 'en_paso' }) : resp(200, { revision_id: UUID, estado: 'cerrada', salida: { resultado: 'con_desacuerdo', marcas: { con_desacuerdo: true, sin_segunda_mirada: false }, desacuerdos: ['el pie no menciona el canal'], costo_usd: 0.22, simulado: false } }) },
      })
      expect(d.visitas.find((v: Json) => v.nodo === 'Fin · prueba de pieza').salida[0]).toEqual({ fase: 'cerrada', motivo: null, revision_id: UUID, resultado: 'con_desacuerdo', marcas: { con_desacuerdo: true, sin_segunda_mirada: false }, desacuerdos: ['el pie no menciona el canal'], costo_usd: 0.22, simulado: false })
    })
    it('el flujo no escribe en ninguna tabla ni llama a ninguna ruta que no sea la de la jefatura y su flujo de turno', () => {
      const urls = (flujo.nodes as Json[]).filter((n) => n.parameters.url).map((n) => String(n.parameters.url))
      for (const u of urls) expect(u).toMatch(/\/api\/jefatura\/revisiones|\/zero-risk\/jefatura-turno/)
      expect(JSON.stringify(flujo)).not.toMatch(/\/rest\/v1\//)
    })
  })
})
