/**
 * ESQUEMAS DE APIFY COMO DATO (19-oct · cambió `streamers~youtube-scraper`: `downloadSubtitles` ya no existe) · sin Apify de verdad: los nodos de código del Servicio y del relector se corren con un mundo falso.
 *   · el flujo se reconstruye igual desde su respaldo y SOLO cambian los nodos previstos (+2 nodos de aviso); el relector igual;
 *   · un campo VIEJO con renombre en el mapa se manda con el nombre nuevo (y valor traducido); sin mapa el brazo dice «sin dato por cambio del raspador», NO llama al raspador y avisa UNA vez;
 *   · los diez clientes de prueba pasan por el validador nuevo con el cuerpo que arma el Servicio, sin que nada cambie;
 *   · el relector lee TODAS las funciones del validador (antes miraba 16 de 30), distingue lo resuelto por mapa de lo grave y no repite el aviso cada lunes.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { codigoDelValidador, leerEsquemas, reconciliar, relectorConEsquemasVivos, servicioConEsquemasVivos } from '../scripts/worker-staging/construir-esquemas-vivos.mjs'
import { planDeFuentesPublicas } from '@/lib/fuentes-publicas'
import { DIEZ_CLIENTES } from '@/lib/portero-alimenta/__tests__/diez-clientes.fixtures'

type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, any>; active?: boolean }
const WS = join(process.cwd(), 'scripts/worker-staging')
const leer = (p: string) => JSON.parse(readFileSync(join(WS, p), 'utf8')) as Flujo
const SERV_ANTES = leer('3lyknrP3PoS2KzUf/servicio-apify-ANTES-esquemas-vivos-2026-10-19.json')
const SERV_HOY = leer('3lyknrP3PoS2KzUf/servicio-apify-ARREGLADO-esquemas-vivos-2026-10-19.json')
const REL_ANTES = leer('Smu6A18qr1XJ2uzB/relector-esquemas-ANTES-esquemas-vivos-2026-10-19.json')
const REL_HOY = leer('Smu6A18qr1XJ2uzB/relector-esquemas-ARREGLADO-esquemas-vivos-2026-10-19.json')
const DATOS = leerEsquemas()
const nodo = (f: Flujo, n: string) => f.nodes.find((x) => x.name === n)!
const lf = (s: string) => s.split('\r\n').join('\n')
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>

/** corre un nodo de código con un mundo falso; `estatico` es el `$getWorkflowStaticData('global')` que se conserva entre ejecuciones */
async function correr(f: Flujo, nombre: string, entrada: any, o: { estatico?: Record<string, any>; nodos?: Record<string, any> } = {}) {
  const fn = new AsyncFunction('$', '$input', '$env', '$getWorkflowStaticData', 'Date', lf(String(nodo(f, nombre).parameters.jsCode)))
  const $ = (n: string) => { if (o.nodos?.[n]) return o.nodos[n]; throw new Error('nodo ' + n) }
  const items = Array.isArray(entrada) ? entrada : [entrada]
  const $input = { first: () => ({ json: items[0] }), all: () => items.map((json: any) => ({ json })) }
  return (await (fn as any)($, $input, { APIFY_API_TOKEN: 'x' }, () => o.estatico ?? {}, Date)) as Array<{ json: any }>
}
const validar = async (fn: string, cuerpo: Record<string, unknown>, estatico: Record<string, any> = {}) => (await correr(SERV_HOY, 'Validar el cuerpo contra el esquema', { client_id: 'c', apify_function: fn, cuerpo }, { estatico }))[0].json

describe('el flujo del Servicio se reconstruye igual desde su respaldo', () => {
  it('reproducible', () => { expect(JSON.stringify(servicioConEsquemasVivos(SERV_ANTES, DATOS))).toBe(JSON.stringify(SERV_HOY)) })
  it('cambian el validador y la salida de rechazo, entran 2 nodos de aviso y el estado activo y el resto quedan IDÉNTICOS', () => {
    const dif = SERV_ANTES.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(nodo(SERV_HOY, n.name))).map((n) => n.name).sort()
    expect(dif).toEqual(['Validar el cuerpo contra el esquema', 'skipped-response'].sort())
    expect(SERV_HOY.nodes.map((n) => n.name).filter((n) => !SERV_ANTES.nodes.some((a) => a.name === n)).sort()).toEqual(['Avisar cambio del raspador', 'IF avisar cambio?'])
    expect(SERV_HOY.active).toBe(SERV_ANTES.active)
    for (const [k, v] of Object.entries(SERV_ANTES.connections)) if (k !== 'IF cuerpo_ok?') expect(SERV_HOY.connections[k]).toEqual(v)
    // la salida «no» del IF sigue yendo a la respuesta de rechazo, y ADEMÁS a la rama lateral del aviso
    const antes = SERV_ANTES.connections['IF cuerpo_ok?'].main, hoy = SERV_HOY.connections['IF cuerpo_ok?'].main
    expect(hoy[0]).toEqual(antes[0])
    expect(hoy[1]).toEqual([...antes[1], { node: 'IF avisar cambio?', type: 'main', index: 0 }])
    expect(SERV_HOY.connections['IF avisar cambio?'].main[0]).toEqual([{ node: 'Avisar cambio del raspador', type: 'main', index: 0 }])
  })
  it('el aviso entra por la ruta del portero con la llave interna, nunca con la llave pegada', () => {
    const n = nodo(SERV_HOY, 'Avisar cambio del raspador').parameters
    expect(n.url).toBe('https://zero-risk-platform.vercel.app/api/brain/alimentar/aviso-de-raspador')
    expect(JSON.stringify(n.headerParameters)).toContain('$env.INTERNAL_API_KEY')
    expect(JSON.stringify(SERV_HOY.nodes)).not.toMatch(/[0-9a-f]{64}/)
  })
  it('el código del validador no nombra ningún actor ni campo suelto: todo viene del dato', () => {
    const c = codigoDelValidador(DATOS).replace(/const (ESQUEMAS|RENOMBRES|RETIRADOS) = .*;\n/g, '')
    expect(c).not.toMatch(/downloadSubtitles|transcriptionAndSubtitle|streamers|youtube/i)
  })
})

describe('el validador con el mapa de renombres', () => {
  it('downloadSubtitles: true → transcriptionAndSubtitle ALWAYS_SUBTITLES (el campo viejo no se manda) y queda anotado', async () => {
    const r = await validar('youtube_video_scraper', { startUrls: [{ url: 'https://www.youtube.com/watch?v=x' }], maxResults: 1, downloadSubtitles: true, subtitlesLanguage: 'es' })
    expect(r.cuerpo_ok).toBe(true)
    expect(r.cuerpo).toEqual({ startUrls: [{ url: 'https://www.youtube.com/watch?v=x' }], maxResults: 1, subtitlesLanguage: 'es', transcriptionAndSubtitle: 'ALWAYS_SUBTITLES' })
    expect(r.cuerpo.downloadSubtitles).toBeUndefined()
    expect(r.avisos.join(' ')).toMatch(/renombró «downloadSubtitles» a «transcriptionAndSubtitle»/)
  })
  it('downloadSubtitles: false → NONE; un valor sin traducción NO se inventa: se rechaza como «sin dato»', async () => {
    expect((await validar('youtube_video_scraper', { startUrls: [], downloadSubtitles: false })).cuerpo.transcriptionAndSubtitle).toBe('NONE')
    const r = await validar('youtube_video_scraper', { startUrls: [], downloadSubtitles: 'quizá' })
    expect(r).toMatchObject({ cuerpo_ok: false, sin_dato_por_cambio: true })
    expect(r.errors[0]).toMatch(/sin dato por cambio del raspador/)
  })
  it('si el que llama YA usa el campo nuevo, no se toca ni se anota nada', async () => {
    const r = await validar('youtube_video_scraper', { startUrls: [], transcriptionAndSubtitle: 'ALWAYS_TRANSCRIBE' })
    expect(r.cuerpo.transcriptionAndSubtitle).toBe('ALWAYS_TRANSCRIBE')
    expect(r.avisos).toEqual([])
  })
  it('un campo que se fue SIN mapa (dato `retirados`): rechazo «sin dato por cambio del raspador», no llama al raspador y avisa UNA sola vez', async () => {
    const datos = JSON.parse(JSON.stringify(DATOS)); datos.retirados = { google_serp_scraper: ['campoQueSeFue'] }
    const flujo = servicioConEsquemasVivos(SERV_ANTES, datos)
    const estatico: Record<string, any> = {}
    const una = async () => (await correr(flujo, 'Validar el cuerpo contra el esquema', { client_id: 'c', apify_function: 'google_serp_scraper', cuerpo: { queries: 'x', campoQueSeFue: 1 } }, { estatico }))[0].json
    const a = await una(), b = await una()
    for (const r of [a, b]) { expect(r).toMatchObject({ cuerpo_ok: false, validation_error: true, sin_dato_por_cambio: true }); expect(r.errors[0]).toMatch(/sin dato por cambio del raspador.*campoQueSeFue.*NO se llamó al raspador/) }
    expect(a.aviso_cambio).toMatchObject({ funcion: 'google_serp_scraper', motivo: 'campo_desaparecido' })
    expect(b.aviso_cambio).toBeNull() // la segunda vez no avisa: la sordina vive en los datos estáticos del flujo
    // otro cuerpo de la MISMA función sin el campo retirado pasa sin problema
    const ok = (await correr(flujo, 'Validar el cuerpo contra el esquema', { client_id: 'c', apify_function: 'google_serp_scraper', cuerpo: { queries: 'x' } }, { estatico }))[0].json
    expect(ok.cuerpo_ok).toBe(true)
  })
  it('la respuesta de rechazo lo DICE: ok:false, rechazado y sin_dato_por_cambio', async () => {
    const datos = JSON.parse(JSON.stringify(DATOS)); datos.retirados = { google_serp_scraper: ['x'] }
    const flujo = servicioConEsquemasVivos(SERV_ANTES, datos)
    const r = (await correr(flujo, 'Validar el cuerpo contra el esquema', { client_id: 'c', apify_function: 'google_serp_scraper', cuerpo: { x: 1 } }, { estatico: {} }))[0].json
    const sal = (await correr(flujo, 'skipped-response', r))[0].json
    expect(sal).toMatchObject({ ok: false, rechazado: true, sin_dato_por_cambio: true })
    expect(sal.motivo).toMatch(/sin dato por cambio del raspador/)
  })
  it('lo de siempre no cambia: falta un obligatorio ⇒ rechazo; un campo desconocido ⇒ aviso y se manda igual; función sin esquema ⇒ pasa declarándolo', async () => {
    expect(await validar('facebook_page_scraper', {})).toMatchObject({ cuerpo_ok: false, validation_error: true })
    const r = await validar('google_serp_scraper', { queries: 'x', algoNuevoQueNadieDeclaro: 1 })
    expect(r.cuerpo_ok).toBe(true); expect(r.avisos.join(' ')).toMatch(/el raspador no declara · algoNuevoQueNadieDeclaro/); expect(r.cuerpo.algoNuevoQueNadieDeclaro).toBe(1)
    expect(await validar('funcion_que_no_existe', { a: 1 })).toMatchObject({ cuerpo_ok: true, esquema_desconocido: true })
  })
})

describe('los diez clientes de prueba pasan por el validador nuevo sin que nada cambie', () => {
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre} (${c.pais}): cada llamada que arma el Servicio sale del validador igual y sin rechazo`, async () => {
      const plan = planDeFuentesPublicas({ rubro: c.rubro, nombre: c.nombre, pais: c.iso, ...(c.ig ? { redes: { instagram: `https://www.instagram.com/${c.ig}/`, youtube: 'https://www.youtube.com/@x', tiktok: 'https://www.tiktok.com/@x' } } : { redes: { youtube: 'https://www.youtube.com/@x' } }) } as never)
      expect(plan.llamadas.length).toBeGreaterThan(0)
      for (const l of plan.llamadas) {
        const armado = (await correr(SERV_HOY, 'Armar el cuerpo del raspador', { client_id: c.id, apify_function: l.funcion, params: l.params }))[0].json
        const r = (await correr(SERV_HOY, 'Validar el cuerpo contra el esquema', armado))[0].json
        expect(r.cuerpo_ok, `${c.nombre} · ${l.funcion}`).toBe(true)
        expect(r.sin_dato_por_cambio).toBeUndefined()
        expect(r.cuerpo, `${c.nombre} · ${l.funcion}`).toEqual(armado.cuerpo)
      }
    })
  }
  it('lo mismo con el validador de ANTES: la nueva versión no cambia ni un cuerpo de las funciones ya conocidas', async () => {
    for (const [fn, e] of Object.entries(DATOS.funciones as Record<string, { acepta: string[]; obligatorios: string[] }>)) {
      const cuerpo = Object.fromEntries([...new Set([...e.obligatorios, ...e.acepta.slice(0, 2)])].map((k) => [k, 'x']))
      const antes = (await correr(SERV_ANTES, 'Validar el cuerpo contra el esquema', { client_id: 'c', apify_function: fn, cuerpo }))[0].json
      const hoy = (await correr(SERV_HOY, 'Validar el cuerpo contra el esquema', { client_id: 'c', apify_function: fn, cuerpo }, { estatico: {} }))[0].json
      expect(hoy.cuerpo_ok, fn).toBe(antes.cuerpo_ok)
    }
  })
})

describe('reconciliar · el dato nuevo sale de comparar lo congelado con Apify hoy', () => {
  const base = { congelado_en: '2026-01-01', funciones: { f: { actor: 'a~b', acepta: ['viejo', 'otro'], obligatorios: [] }, g: { actor: 'a~c', acepta: ['x'], obligatorios: ['x'] } }, renombres: {}, retirados: {} }
  it('un campo que se fue SIN mapa es grave y pasa a `retirados`; uno con mapa hacia un campo que existe no lo es', () => {
    const r = reconciliar({ ...base, renombres: { f: { viejo: { a: 'nuevo' } } } }, { f: { acepta: ['nuevo', 'otro'], obligatorios: [] }, g: { acepta: [], obligatorios: ['x'] } })
    expect(r.cambios.find((c) => c.funcion === 'f')).toMatchObject({ grave: false, resueltos_por_mapa: [{ de: 'viejo', a: 'nuevo' }], sin_mapa: [] })
    expect(r.cambios.find((c) => c.funcion === 'g')).toMatchObject({ grave: true, sin_mapa: ['x'] })
    expect(r.datos.retirados).toEqual({ g: ['x'] })
    expect(r.datos.funciones.f.acepta).toEqual(['nuevo', 'otro'])
  })
  it('un mapa hacia un campo que tampoco existe hoy sigue siendo grave', () => {
    const r = reconciliar({ ...base, renombres: { f: { viejo: { a: 'fantasma' } } } }, { f: { acepta: ['otro'], obligatorios: [] }, g: { acepta: ['x'], obligatorios: ['x'] } })
    expect(r.cambios[0]).toMatchObject({ funcion: 'f', grave: true, sin_mapa: ['viejo'] })
  })
  it('es idempotente: volver a comparar contra el mismo hoy no encuentra cambios; un campo retirado que vuelve sale de la lista; lo ilegible se dice y no se toca', () => {
    const hoy = { f: { acepta: ['otro'], obligatorios: [] }, g: null }
    const una = reconciliar(base, hoy)
    expect(una.ilegibles).toEqual(['g']); expect(una.datos.funciones.g).toEqual(base.funciones.g)
    expect(reconciliar(una.datos, hoy).hay_cambios).toBe(false)
    const vuelve = reconciliar(una.datos, { f: { acepta: ['otro', 'viejo'], obligatorios: [] }, g: null })
    expect(vuelve.datos.retirados).toEqual({})
  })
  it('un obligatorio nuevo es grave aunque no se haya ido nada', () => {
    const r = reconciliar(base, { f: { acepta: ['viejo', 'otro'], obligatorios: ['otro'] }, g: { acepta: ['x'], obligatorios: ['x'] } })
    expect(r.cambios[0]).toMatchObject({ funcion: 'f', grave: true, obligatorios_nuevos: ['otro'] })
  })
  it('el dato congelado hoy coincide con el que produce el validador vivo (30 funciones, ordenadas, cada una con su actor)', () => {
    expect(Object.keys(DATOS.funciones).length).toBe(30)
    for (const e of Object.values(DATOS.funciones as Record<string, { actor: string }>)) expect(e.actor).toMatch(/^[a-z0-9_-]+~[a-z0-9_.-]+$/i)
    expect(DATOS.funciones.youtube_video_scraper.acepta).toContain('transcriptionAndSubtitle')
    expect(DATOS.funciones.youtube_video_scraper.acepta).not.toContain('downloadSubtitles')
    expect(DATOS.renombres.youtube_video_scraper.downloadSubtitles.a).toBe('transcriptionAndSubtitle')
  })
})

describe('el relector del lunes', () => {
  it('se reconstruye igual desde su respaldo; solo cambian los tres nodos previstos', () => {
    expect(JSON.stringify(relectorConEsquemasVivos(REL_ANTES, DATOS))).toBe(JSON.stringify(REL_HOY))
    const dif = REL_ANTES.nodes.filter((n) => JSON.stringify(n) !== JSON.stringify(nodo(REL_HOY, n.name))).map((n) => n.name).sort()
    expect(dif).toEqual(['Comparar contra lo congelado', 'Tocar la campana', 'Uno por raspador'].sort())
    expect(REL_HOY.connections).toEqual(REL_ANTES.connections); expect(REL_HOY.active).toBe(REL_ANTES.active)
  })
  it('lee TODAS las funciones del validador (no solo 16) con su actor y su mapa', async () => {
    const items = (await correr(REL_HOY, 'Uno por raspador', {})).map((x) => x.json)
    expect(items.map((i) => i.funcion).sort()).toEqual(Object.keys(DATOS.funciones).sort())
    expect(items.find((i) => i.funcion === 'youtube_video_scraper')!.renombres.downloadSubtitles.a).toBe('transcriptionAndSubtitle')
  })
  const hoy = (cual: Record<string, string[]>) => Object.keys(DATOS.funciones).map((f) => ({ data: { actorDefinition: { input: { properties: Object.fromEntries((cual[f] ?? DATOS.funciones[f].acepta).map((k: string) => [k, {}])), required: DATOS.funciones[f].obligatorios } } } }))
  const comparar = async (cual: Record<string, string[]>, estatico: Record<string, any>) => {
    const congelados = (await correr(REL_HOY, 'Uno por raspador', {})).map((x) => x.json)
    return (await correr(REL_HOY, 'Comparar contra lo congelado', hoy(cual), { estatico, nodos: { 'Uno por raspador': { all: () => congelados.map((json) => ({ json })) } } })).map((x) => x.json)
  }
  it('sin cambios: un solo elemento «no hay cambios» (la campana no suena)', async () => {
    expect(await comparar({}, {})).toEqual([{ hay_cambios: false, graves: 0, cambios: [] }])
  })
  it('un campo que se fue y SÍ tiene mapa no es grave; uno que se fue sin mapa sí; y el aviso sale UNA vez por cambio (el lunes siguiente no se repite)', async () => {
    const estatico: Record<string, any> = {}
    const cual = { youtube_video_scraper: DATOS.funciones.youtube_video_scraper.acepta.concat(['otroNuevo']).filter((k: string) => k !== 'transcriptionAndSubtitle'), google_serp_scraper: DATOS.funciones.google_serp_scraper.acepta.filter((k: string) => k !== 'queries') }
    const a = await comparar(cual, estatico)
    expect(a.map((x) => x.funcion).sort()).toEqual(['google_serp_scraper', 'youtube_video_scraper'])
    expect(a.find((x) => x.funcion === 'google_serp_scraper')).toMatchObject({ grave: true })
    expect(a.find((x) => x.funcion === 'google_serp_scraper')!.detalle).toMatch(/sin mapa: queries/)
    expect(await comparar(cual, estatico)).toEqual([{ hay_cambios: false, graves: 0, cambios: [] }]) // el lunes siguiente, mismo cambio: silencio
    // un cambio DISTINTO sí vuelve a sonar
    expect((await comparar({ ...cual, instagram_scraper: ['resultsType'] }, estatico)).map((x) => x.funcion)).toEqual(['instagram_scraper'])
  })
  it('un esquema que no se pudo leer se DICE (no se lee como «sin cambios»)', async () => {
    const congelados = (await correr(REL_HOY, 'Uno por raspador', {})).map((x) => x.json)
    const h = hoy({}); h[0] = { data: null } as never
    const r = (await correr(REL_HOY, 'Comparar contra lo congelado', h, { estatico: {}, nodos: { 'Uno por raspador': { all: () => congelados.map((json) => ({ json })) } } })).map((x) => x.json)
    expect(r).toHaveLength(1); expect(r[0]).toMatchObject({ hay_cambios: true, grave: true }); expect(r[0].detalle).toMatch(/no se pudo leer el esquema hoy/)
  })
  it('la campana llama a la ruta del portero (#alertas), una vez por cambio nuevo, con motivo cambio_sin_resolver', () => {
    const n = nodo(REL_HOY, 'Tocar la campana').parameters
    expect(n.url).toBe('https://zero-risk-platform.vercel.app/api/brain/alimentar/aviso-de-raspador')
    expect(String(n.jsonBody)).toMatch(/cambio_sin_resolver/)
    expect(JSON.stringify(REL_HOY.nodes)).not.toMatch(/SLACK_WEBHOOK_URL/)
  })
})
