/**
 * 02-nov · limpieza fase 2 · la lista de competidores NO es decisión del dueño. US$ 0, sin red.
 * Fija: los dos nodos del alta ya no escriben en la bandeja; mantienen nombre y conexiones; no cambia ningún otro nodo; la otra escritura a la bandeja (revisión del onboarding) queda intacta;
 * y los lectores por nombre de «Confirm barato» siguen leyendo lo mismo que antes (la clave `discovery_package`, que ni antes ni ahora trae).
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { recorrer } from './_emulador-n8n'
// @ts-expect-error módulo .mjs sin tipos
import { construirAltaSinFirmaCompetidores, CONFIRMAR, ESCALAR } from '../scripts/ops/oficina-marketing/construir-alta-sin-firma-competidores.mjs'

const leer = (r: string) => JSON.parse(fs.readFileSync(r, 'utf8'))
const vivo = leer('scripts/ops/oficina-marketing/vivo/LyVoKcrypS5uLyuu.json')
const nuevo = construirAltaSinFirmaCompetidores(leer('scripts/ops/oficina-marketing/vivo/LyVoKcrypS5uLyuu.json'))
const nom = (f: any, n: string) => f.nodes.find((x: any) => x.name === n)
const CANON = '[APIFY-WIRE] POST /api/hitl/queue (canon)'

describe('los dos nodos dejan de escribir en la bandeja', () => {
  it.each([CONFIRMAR, ESCALAR])('«%s» era un HTTP a /api/hitl/queue y ahora es un Code sin red', (n) => {
    expect(nom(vivo, n).type).toBe('n8n-nodes-base.httpRequest')
    expect(String(nom(vivo, n).parameters.url)).toContain('/api/hitl/queue')
    expect(nom(nuevo, n).type).toBe('n8n-nodes-base.code')
    expect(JSON.stringify(nom(nuevo, n))).not.toMatch(/hitl\/queue|httpRequest|x-api-key|INTERNAL_API_KEY|confirm_competitor_list/)
  })
  it('en el flujo nuevo ya no queda ningún pedido confirm_competitor_list hacia la bandeja', () => {
    const quedan = nuevo.nodes.filter((n: any) => /confirm_competitor_list/.test(JSON.stringify(n.parameters)))
    expect(quedan.map((n: any) => n.name)).toEqual([])
  })
  it.each([CONFIRMAR, ESCALAR])('«%s» se ejecuta sin llamar a ninguna red y deja una salida declarada', async (n) => {
    const http = async () => { throw new Error('NO debe llamar a la red') }
    const r = await recorrer(nuevo, n, { client_id: 'c1' }, { http, hasta: [nuevo.connections[n].main[0][0].node] })
    expect(r.historial[n][0]).toEqual({ sin_bandeja: true, motivo: 'lista_de_competidores_no_es_decision_del_dueno' })
  })
})

describe('no se rompe nada más', () => {
  it('cambian EXACTAMENTE esos dos nodos; nombres, conexiones y ajustes iguales', () => {
    const distintos = nuevo.nodes.filter((n: any) => JSON.stringify(n) !== JSON.stringify(nom(vivo, n.name))).map((n: any) => n.name).sort()
    expect(distintos).toEqual([CONFIRMAR, ESCALAR].sort())
    expect(nuevo.nodes.map((n: any) => n.name)).toEqual(vivo.nodes.map((n: any) => n.name))
    expect(nuevo.connections).toEqual(vivo.connections)
    expect(nuevo.settings).toEqual(vivo.settings)
  })
  it('la revisión del onboarding (la otra escritura a la bandeja, con espera) queda como estaba', () => {
    expect(nom(nuevo, CANON)).toEqual(nom(vivo, CANON))
    expect(nuevo.connections[CANON].main[0][0].node).toBe('Wait · Camino III decision')
  })
  it('el camino sigue: «Confirm barato» → veredicto del agente de competencia; «Escalate» → el Split por objetivo', () => {
    expect(nuevo.connections[CONFIRMAR].main[0][0].node).toBe('Competitor Verdict · run-sdk (INLINE)')
    expect(nuevo.connections[ESCALAR].main[0][0].node).toBe('[APIFY-WIRE] Split per scrape target (lazo)')
  })
  it('los lectores por nombre de «Confirm barato» solo piden `discovery_package` y `.item.json`, como antes', () => {
    const lee = (n: string) => String(nom(nuevo, n).parameters.jsCode)
    expect(lee('Synthesis Staging · build package')).toContain("$('Confirm barato · competitor list').first().json")
    expect(lee('Synthesis Staging · build package')).toContain('discoveryItem.discovery_package || {}')
    expect(lee('Parse veredicto')).toContain("competitor_list: $('Confirm barato · competitor list').item.json")
  })
  it('el veredicto del agente de competencia y el Split no dependen de la salida de esos nodos', () => {
    expect(String(nom(nuevo, '[APIFY-WIRE] Split per scrape target (lazo)').parameters.jsCode)).toContain('$("[APIFY-WIRE] Discovery Parser · dynamic targets (lazo)")')
    expect(JSON.stringify(nom(nuevo, 'Competitor Verdict · run-sdk (INLINE)').parameters)).not.toContain('Confirm barato')
  })
  it('el constructor se detiene si el nodo ya no es un HTTP a la bandeja (no se aplica dos veces)', () => {
    expect(() => construirAltaSinFirmaCompetidores(JSON.parse(JSON.stringify(nuevo)))).toThrow(/ya no es un HTTP/)
  })
})

describe('el archivo que se aplica ES la salida del constructor (reserva 1 de CC3)', () => {
  it('nuevo/LyVoKcrypS5uLyuu.json es exactamente lo que el constructor produce desde vivo/', () => {
    const archivo = leer('scripts/ops/oficina-marketing/nuevo/LyVoKcrypS5uLyuu.json')
    expect(archivo).toEqual(nuevo)
  })
  it('los nodos reemplazados no arrastran credenciales, reintentos ni parámetros del HTTP', () => {
    for (const n of [CONFIRMAR, ESCALAR]) {
      const x = nom(nuevo, n)
      for (const k of ['credentials', 'retryOnFail', 'maxTries', 'waitBetweenTries']) expect(x[k]).toBeUndefined()
      expect(Object.keys(x.parameters)).toEqual(['jsCode'])
    }
  })
})

describe('las guardas del constructor (A07 y A09 de CC3)', () => {
  it('si el HTTP ya no apunta a la bandeja, se detiene en vez de reemplazarlo', () => {
    const f = leer('scripts/ops/oficina-marketing/vivo/LyVoKcrypS5uLyuu.json')
    nom(f, CONFIRMAR).parameters.url = 'https://otra.test/api/otra'
    expect(() => construirAltaSinFirmaCompetidores(f)).toThrow(/no escribe en \/api\/hitl\/queue/)
  })
  it('credenciales y reintentos que traiga el HTTP no pasan al nodo nuevo', () => {
    const f = leer('scripts/ops/oficina-marketing/vivo/LyVoKcrypS5uLyuu.json')
    for (const n of [CONFIRMAR, ESCALAR]) Object.assign(nom(f, n), { credentials: { httpHeaderAuth: { id: '1', name: 'x' } }, retryOnFail: true, maxTries: 3, waitBetweenTries: 1000 })
    const g = construirAltaSinFirmaCompetidores(f)
    for (const n of [CONFIRMAR, ESCALAR]) for (const k of ['credentials', 'retryOnFail', 'maxTries', 'waitBetweenTries']) expect(nom(g, n)[k]).toBeUndefined()
  })
})
