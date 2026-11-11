/**
 * 11-nov · fallidos que se rehacen solos · LA FUENTE de los arreglos (`arreglosPublicadosReal`): las entregas FUSIONADAS a main del repositorio, con su título y su descripción
 * (decisión Lenovo 17:15: GitHub con una llave fina de solo lectura, NO la llave de Vercel). Contra una red simulada: US$ 0. Se fija: sin credencial no se llama a nadie; solo lo
 * fusionado, posterior a «desde» y con título; un error vuelve como `ok: false` (nunca «ninguno»); la credencial no sale en ningún motivo.
 */
import { describe, expect, it } from 'vitest'
import { arreglosPublicadosReal, CREDENCIAL_DE_ENTREGAS, MAX_TEXTO_DE_LA_ENTREGA, REPOSITORIO_DE_LA_PLATAFORMA } from '../almacen-supabase'

const DESDE = '2026-11-11T02:44:44.000Z'
const TOKEN = 'tok-de-prueba-SECRETO'
/** una entrega como la devuelve GitHub (`GET /repos/{repo}/pulls`) */
const pr = (number: number, merged: string | null, title: string, o: { body?: string | null; updated?: string } = {}) => ({ number, title, body: o.body ?? null, merged_at: merged, updated_at: o.updated ?? merged ?? '2026-11-11T12:00:00Z', state: 'closed' })
function red(paginas: unknown[][], status = 200) {
  const urls: string[] = []
  const headers: Array<Record<string, string>> = []
  let i = 0
  const f = (async (url: string, init?: { headers?: Record<string, string> }) => {
    urls.push(url); headers.push(init?.headers ?? {})
    const p = paginas[Math.min(i++, paginas.length - 1)]!
    return { ok: status === 200, status, json: async () => p } as unknown as Response
  }) as unknown as typeof fetch
  return { f, urls, headers }
}
const ENV = { [CREDENCIAL_DE_ENTREGAS]: TOKEN }
const relleno = (n: number, desde: number) => Array.from({ length: n }, (_, k) => pr(desde + k, '2026-11-11T10:00:00Z', `fix: relleno ${desde + k}`))

describe('la fuente de los arreglos: las entregas fusionadas a main', () => {
  it('🔴 sin la credencial no se llama a nadie y lo dice', async () => {
    const r = red([[]])
    expect(await arreglosPublicadosReal(DESDE, r.f, {})).toEqual({ ok: false, motivo: `falta la credencial ${CREDENCIAL_DE_ENTREGAS} en el entorno` })
    expect(await arreglosPublicadosReal(DESDE, r.f, { [CREDENCIAL_DE_ENTREGAS]: '   ' })).toMatchObject({ ok: false })
    expect(r.urls).toEqual([])
  })
  it('🔴 pide las entregas cerradas a main del repositorio, con la credencial; devuelve solo lo FUSIONADO y posterior, con título y descripción, en orden y sin repetir', async () => {
    const r = red([[
      pr(1044, '2026-11-11T14:41:49Z', 'fix(cadena): la mesa propone la hora', { body: 'Cuando la mesa reubica, propone también la hora.' }),
      pr(1026, '2026-11-11T05:04:00Z', 'fix(video): el lector de tarifas sin frases fijas'),
      pr(1046, null, 'feat: cerrada sin fusionar', { updated: '2026-11-11T15:00:00Z' }),
      pr(1030, '2026-11-11T07:00:00Z', '   '),
      pr(900, '2026-11-11T01:00:00Z', 'fix: anterior al fallo', { updated: '2026-11-11T09:00:00Z' }),
      pr(1026, '2026-11-11T05:04:00Z', 'fix(video): el lector de tarifas sin frases fijas'),
    ]])
    const x = await arreglosPublicadosReal(DESDE, r.f, ENV)
    expect(x).toEqual({ ok: true, arreglos: [
      { id: '#1026', publicado_en: '2026-11-11T05:04:00.000Z', mensaje: 'fix(video): el lector de tarifas sin frases fijas' },
      { id: '#1044', publicado_en: '2026-11-11T14:41:49.000Z', mensaje: 'fix(cadena): la mesa propone la hora\n\nCuando la mesa reubica, propone también la hora.' },
    ] })
    const u = new URL(r.urls[0]!)
    expect(u.origin + u.pathname).toBe(`https://api.github.com/repos/${REPOSITORIO_DE_LA_PLATAFORMA}/pulls`)
    expect(Object.fromEntries(u.searchParams)).toEqual({ state: 'closed', base: 'main', sort: 'updated', direction: 'desc', per_page: '100', page: '1' })
    expect(r.headers[0]).toEqual({ Authorization: `Bearer ${TOKEN}`, Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28' })
    expect(r.urls).toHaveLength(1)
  })
  it('el texto de una entrega larga se corta a lo que llega a la mesa', async () => {
    const x = await arreglosPublicadosReal(DESDE, red([[pr(1, '2026-11-11T05:00:00Z', 'fix: largo', { body: 'b'.repeat(5000) })]]).f, ENV)
    expect(x.ok && x.arreglos[0]!.mensaje.length).toBe(MAX_TEXTO_DE_LA_ENTREGA)
  })
  it('pagina mientras la página esté llena y tenga algo posterior a «desde»; se detiene en la primera página vieja y nunca pasa de 5', async () => {
    const r = red([relleno(100, 1), [pr(500, '2026-11-11T08:00:00Z', 'fix: b'), ...relleno(99, 600)], [pr(9, '2026-11-10T08:00:00Z', 'fix: viejo', { updated: '2026-11-10T08:00:00Z' })]])
    const x = await arreglosPublicadosReal(DESDE, r.f, ENV)
    expect(r.urls.map((u) => new URL(u).searchParams.get('page'))).toEqual(['1', '2', '3'])
    expect(x.ok && x.arreglos.some((a) => a.id === '#500')).toBe(true)
    // una página llena de entregas viejas (actualizadas antes de «desde») corta la lectura
    const vieja = red([Array.from({ length: 100 }, (_, k) => pr(k, '2026-11-10T08:00:00Z', 'fix: viejo', { updated: '2026-11-10T09:00:00Z' }))])
    await arreglosPublicadosReal(DESDE, vieja.f, ENV)
    expect(vieja.urls).toHaveLength(1)
    const sinFin = red([relleno(100, 1)])
    await arreglosPublicadosReal(DESDE, sinFin.f, ENV)
    expect(sinFin.urls).toHaveLength(5)
  })
  it('🔴 un error de la fuente vuelve como ok:false (nunca «no hay arreglos») y el motivo nunca lleva la credencial', async () => {
    const motivos: string[] = []
    const a = await arreglosPublicadosReal(DESDE, red([[]], 401).f, ENV)
    expect(a).toEqual({ ok: false, motivo: 'la lista de entregas contestó 401' })
    const rota = (async () => ({ ok: true, status: 200, json: async () => ({ message: 'Bad credentials' }) })) as unknown as typeof fetch
    const b = await arreglosPublicadosReal(DESDE, rota, ENV)
    expect(b).toEqual({ ok: false, motivo: 'la lista de entregas no es una lista' })
    const cae = (async () => { throw new Error('sin red') }) as unknown as typeof fetch
    const c = await arreglosPublicadosReal(DESDE, cae, ENV)
    expect(c).toEqual({ ok: false, motivo: 'sin red' })
    const d = await arreglosPublicadosReal('ayer', red([[]]).f, ENV)
    expect(d).toMatchObject({ ok: false })
    for (const x of [a, b, c, d]) if (!x.ok) motivos.push(x.motivo)
    expect(motivos.join(' ')).not.toContain(TOKEN)
  })
})
