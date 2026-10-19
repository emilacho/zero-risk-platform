/**
 * VIDEOS SIN SUBTÍTULOS (19-oct) · el Servicio de Apify lee la transcripción que Apify deja en su almacén (`transcriptionUrl`). Sin Apify de verdad: los nodos de código se corren con un mundo falso.
 *   · el flujo se reconstruye igual desde su respaldo y SOLO cambian lo previsto (1 nodo nuevo entre «Merge» y sus dos lectores + el rótulo del redactor);
 *   · la transcripción se pide solo a api.apify.com y solo si no hay subtítulos; una falla se rotula y no tumba nada;
 *   · el redactor distingue «lo que se dice», «SIN voz» (Apify transcribió y no hubo voz) y «SIN transcripción» (no se pudo leer / no había);
 *   · los diez clientes de prueba pasan por las dos piezas sin cambiar lo que ya salía.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CODIGO_DE_LEER_TRANSCRIPCIONES, MAXIMO_DE_LECTURAS, NODO_NUEVO, servicioConTranscripciones } from '../scripts/worker-staging/construir-transcripciones.mjs'
import { planDeFuentesPublicas } from '@/lib/fuentes-publicas'
import { DIEZ_CLIENTES } from '@/lib/portero-alimenta/__tests__/diez-clientes.fixtures'

type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, any>; active?: boolean }
const WS = join(process.cwd(), 'scripts/worker-staging/3lyknrP3PoS2KzUf')
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8')) as Flujo
const ANTES = leer('servicio-apify-ANTES-transcripciones-2026-10-19.json')
const HOY = leer('servicio-apify-ARREGLADO-transcripciones-2026-10-19.json')
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const lf = (s: string) => s.split('\r\n').join('\n')
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>

type Pedido = { url: string; headers: Record<string, string> }
/** corre «Leer transcripciones» con una `this.helpers.httpRequest` falsa: `respuestas[url]` es el texto, o un Error */
async function leerTranscripciones(items: any[], respuestas: Record<string, string | Error>, pedidos: Pedido[] = []) {
  const fn = new AsyncFunction('$input', '$env', lf(String(nodo(HOY, NODO_NUEVO).parameters.jsCode)))
  const aqui = { helpers: { httpRequest: async (o: Pedido) => { pedidos.push(o); const r = respuestas[o.url]; if (r instanceof Error) throw r; if (r === undefined) throw new Error('404'); return r } } }
  const $input = { all: () => items.map((json) => ({ json })) }
  return ((await (fn as any).call(aqui, $input, { APIFY_API_TOKEN: 'tok-de-prueba' })) as Array<{ json: any }>).map((x) => x.json)
}
/** corre el redactor de secciones («transform-sections») para videos_youtube con estos elementos */
function redactar(f: Flujo, items: any[], fn = 'videos_youtube') {
  const cod = new Function('$', '$input', '$env', 'Date', lf(String(nodo(f, 'transform-sections').parameters.jsCode)))
  const $ = (n: string) => { if (n === 'Validate Body') return { first: () => ({ json: { body: { apify_function: fn, client_id: 'c1', destination: 'brain_rag' }, dry_run: false } }) }; throw new Error('nodo ' + n) }
  const $input = { first: () => ({ json: items[0] }), all: () => items.map((json) => ({ json })) }
  return (cod as any)($, $input, {}, Date)[0].json
}
const KV = 'https://api.apify.com/v2/key-value-stores/abc/records/transcription-v1'
const VIDEO = { url: 'https://www.youtube.com/watch?v=v1', title: 'Spot', description: 'Spot publicitario de la marca', date: '2021-01-15', subtitles: null, transcriptionUrl: KV }
const VOZ = 'hola somos una marisquería familiar y hoy te mostramos cómo preparamos nuestro ceviche de camarón fresco del día'

describe('el flujo del Servicio se reconstruye igual desde su respaldo', () => {
  it('reproducible y idempotente', () => {
    expect(JSON.stringify(servicioConTranscripciones(ANTES))).toBe(JSON.stringify(HOY))
    expect(JSON.stringify(servicioConTranscripciones(HOY))).toBe(JSON.stringify(HOY))
  })
  it('entra UN nodo, cambia SOLO el redactor, y «Merge» alimenta al nodo nuevo, que alimenta a los mismos dos lectores de antes', () => {
    const nuevos = HOY.nodes.map((n) => n.name).filter((n) => !ANTES.nodes.some((a) => a.name === n))
    expect(nuevos).toEqual([NODO_NUEVO])
    const dif = ANTES.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(nodo(HOY, n.name))).map((n) => n.name)
    expect(dif).toEqual(['transform-sections'])
    expect(HOY.active).toBe(ANTES.active)
    const m = 'Merge · apify data ready'
    expect(HOY.connections[m].main[0]).toEqual([{ node: NODO_NUEVO, type: 'main', index: 0 }])
    expect(HOY.connections[NODO_NUEVO].main[0]).toEqual(ANTES.connections[m].main[0])
    for (const [k, v] of Object.entries(ANTES.connections)) if (k !== m) expect(HOY.connections[k]).toEqual(v)
  })
  it('la llave sale del entorno, no está pegada, y solo se pide a api.apify.com', () => {
    const c = String(nodo(HOY, NODO_NUEVO).parameters.jsCode)
    expect(c).toContain('$env.APIFY_API_TOKEN')
    expect(c).toContain("'https://api.apify.com/'")
    expect(JSON.stringify(HOY.nodes)).not.toMatch(/apify_api_[A-Za-z0-9]{10,}/)
  })
})

describe('«Leer transcripciones»', () => {
  it('un video sin subtítulos con transcripción: la lee con la llave y la deja en `transcription`', async () => {
    const pedidos: Pedido[] = []
    const [v] = await leerTranscripciones([VIDEO], { [KV]: `  ${VOZ}  ` }, pedidos)
    expect(v.transcription).toBe(VOZ)
    expect(v.transcripcion_leida).toBe(true)
    expect(pedidos).toHaveLength(1)
    expect(pedidos[0].headers.Authorization).toBe('Bearer tok-de-prueba')
  })
  it('con subtítulos, sin dirección o con una dirección que no es de Apify: no pide nada y deja el elemento igual', async () => {
    const pedidos: Pedido[] = []
    const items = [{ ...VIDEO, subtitles: [{ srt: '1\n00:00:01 --> 00:00:02\nhola' }] }, { id: 'sin-url' }, { ...VIDEO, transcriptionUrl: 'https://otro.example/x' }, { ...VIDEO, transcriptionUrl: 'http://api.apify.com/v2/x' }, { ...VIDEO, transcriptionUrl: null }]
    const sal = await leerTranscripciones(items, {}, pedidos)
    expect(sal).toEqual(items)
    expect(pedidos).toEqual([])
  })
  it('una lectura que falla se rotula y NO tumba el resto; vacío es «leída» (sin voz), no error', async () => {
    const otro = 'https://api.apify.com/v2/key-value-stores/abc/records/transcription-v2'
    const sal = await leerTranscripciones([VIDEO, { ...VIDEO, transcriptionUrl: otro }], { [KV]: '', [otro]: new Error('Request failed with status code 404') })
    expect(sal[0]).toMatchObject({ transcription: '', transcripcion_leida: true })
    expect(sal[1].transcripcion_error).toMatch(/404/)
    expect(sal[1].transcripcion_leida).toBeUndefined()
  })
  it(`lee como mucho ${MAXIMO_DE_LECTURAS} por ejecución (el resto pasa sin leer)`, async () => {
    const items = Array.from({ length: MAXIMO_DE_LECTURAS + 3 }, (_, i) => ({ ...VIDEO, transcriptionUrl: `https://api.apify.com/v2/key-value-stores/abc/records/t-${i}` }))
    const respuestas = Object.fromEntries(items.map((x) => [x.transcriptionUrl, VOZ]))
    const pedidos: Pedido[] = []
    const sal = await leerTranscripciones(items, respuestas, pedidos)
    expect(pedidos).toHaveLength(MAXIMO_DE_LECTURAS)
    expect(sal.filter((x) => x.transcripcion_leida)).toHaveLength(MAXIMO_DE_LECTURAS)
    expect(sal).toHaveLength(items.length)
  })
  it('el código del nodo en el flujo es el del constructor', () => { expect(String(nodo(HOY, NODO_NUEVO).parameters.jsCode)).toBe(CODIGO_DE_LEER_TRANSCRIPCIONES) })
})

describe('el redactor rotula lo que no hay', () => {
  const linea = (items: any[]) => redactar(HOY, items).sections.map((s: any) => s.text).join('\n')
  it('con voz real: «lo que se dice»', () => { expect(linea([{ ...VIDEO, transcription: VOZ, transcripcion_leida: true }])).toMatch(/lo que se dice: «hola somos una marisquería/) })
  it('leída y vacía (el spot sin voz medido el 19-oct): «SIN voz», no «SIN transcripción»', () => { expect(linea([{ ...VIDEO, transcription: '', transcripcion_leida: true }])).toMatch(/SIN voz \(Apify transcribió el video y no encontró voz\)/) })
  it('leída pero solo música: «SIN voz» con el motivo', () => { expect(linea([{ ...VIDEO, transcription: '[Música]', transcripcion_leida: true }])).toMatch(/SIN voz \(solo etiqueta de música o ruido\)/) })
  it('no se pudo leer: «SIN transcripción» con el motivo', () => { expect(linea([{ ...VIDEO, transcripcion_error: 'Request failed with status code 403' }])).toMatch(/SIN transcripción \(no se pudo leer: Request failed with status code 403\)/) })
  it('sin nada de nada: «SIN transcripción» como siempre', () => { expect(linea([{ ...VIDEO, transcriptionUrl: undefined }])).toMatch(/ · SIN transcripción$/m) })
  it('con subtítulos: igual que antes (el nodo nuevo no los toca)', () => {
    const it = { ...VIDEO, transcriptionUrl: null, subtitles: [{ srt: `1\n00:00:01,000 --> 00:00:04,000\n${VOZ}` }] }
    expect(redactar(HOY, [it])).toEqual(redactar(ANTES, [it]))
    expect(linea([it])).toMatch(/lo que se dice: «hola somos/)
  })
  it('sin ninguna de las marcas nuevas, la sección sale idéntica a la de antes', () => {
    for (const it of [VIDEO, { ...VIDEO, transcriptionUrl: undefined }, { ...VIDEO, subtitles: VOZ, transcriptionUrl: undefined }]) expect(redactar(HOY, [it])).toEqual(redactar(ANTES, [it]))
  })
})

describe('los diez clientes de prueba siguen igual', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre} (${c.pais}): sus videos salen igual que antes y el nodo nuevo no pide nada si ya traen subtítulos`, async () => {
      const plan = planDeFuentesPublicas({ rubro: c.rubro, nombre: c.nombre, pais: c.iso, ...(c.ig ? { redes: { instagram: `https://www.instagram.com/${c.ig}/`, youtube: 'https://www.youtube.com/@x', tiktok: 'https://www.tiktok.com/@x' } } : { redes: { youtube: 'https://www.youtube.com/@x' } }) } as never)
      const videos = plan.llamadas.filter((l) => l.funcion.startsWith('videos_'))
      for (const l of videos) {
        const items = [{ url: 'https://x.test/v', title: c.nombre, subtitles: [{ srt: `1\n00:00:01,000 --> 00:00:04,000\n${VOZ}` }], transcriptionUrl: null }]
        const pedidos: Pedido[] = []
        expect(await leerTranscripciones(items, {}, pedidos)).toEqual(items)
        expect(pedidos).toEqual([])
        expect(redactar(HOY, items, l.funcion)).toEqual(redactar(ANTES, items, l.funcion))
      }
    })
  }
})
