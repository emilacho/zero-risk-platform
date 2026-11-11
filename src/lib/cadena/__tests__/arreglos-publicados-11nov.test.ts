/**
 * 11-nov · fallidos que se rehacen solos · LA FUENTE de los arreglos publicados (`arreglosPublicadosReal`): las publicaciones de producción listas, con el texto del cambio.
 * Contra una red simulada: US$ 0. Se fija: sin credencial no se llama a nadie; solo READY, de producción y posteriores a «desde»; un error vuelve como `ok: false` (nunca «ninguno»).
 */
import { describe, expect, it } from 'vitest'
import { arreglosPublicadosReal, CREDENCIAL_DE_PUBLICACIONES, PROYECTO_DE_LA_PLATAFORMA } from '../almacen-supabase'

const DESDE = '2026-11-11T02:44:44.000Z'
const ms = (iso: string) => Date.parse(iso)
const dpl = (uid: string, iso: string, mensaje: string | null, state = 'READY') => ({ uid, created: ms(iso), state, meta: mensaje === null ? {} : { githubCommitMessage: mensaje } })
function red(paginas: Array<{ deployments: unknown[]; next?: number | null }>, status = 200) {
  const urls: string[] = []
  const headers: Array<Record<string, string>> = []
  let i = 0
  const f = (async (url: string, init?: { headers?: Record<string, string> }) => {
    urls.push(url); headers.push(init?.headers ?? {})
    const p = paginas[Math.min(i++, paginas.length - 1)]!
    return { ok: status === 200, status, json: async () => ({ deployments: p.deployments, pagination: { next: p.next ?? null } }) } as unknown as Response
  }) as unknown as typeof fetch
  return { f, urls, headers }
}
const ENV = { [CREDENCIAL_DE_PUBLICACIONES]: 'tok-de-prueba' }

describe('la fuente de los arreglos publicados', () => {
  it('🔴 sin la credencial no se llama a nadie y lo dice', async () => {
    const r = red([{ deployments: [] }])
    expect(await arreglosPublicadosReal(DESDE, r.f, {})).toEqual({ ok: false, motivo: `falta la credencial ${CREDENCIAL_DE_PUBLICACIONES} en el entorno` })
    expect(r.urls).toEqual([])
  })
  it('🔴 pide producción del proyecto desde la fecha, con la credencial; devuelve solo lo listo y posterior, en orden y sin repetir el mismo cambio', async () => {
    const r = red([{ deployments: [
      dpl('d3', '2026-11-11T14:41:49Z', 'fix(cadena): la mesa propone la hora (#1044)'),
      dpl('d2', '2026-11-11T05:04:00Z', 'fix(video): el lector de tarifas sin frases fijas (#1026)'),
      dpl('d2b', '2026-11-11T05:10:00Z', 'fix(video): el lector de tarifas sin frases fijas (#1026)'),
      dpl('d-error', '2026-11-11T06:00:00Z', 'feat: no llegó a publicarse', 'ERROR'),
      dpl('d-sin-texto', '2026-11-11T07:00:00Z', null),
      dpl('d-antes', '2026-11-11T01:00:00Z', 'fix: anterior al fallo'),
    ] }])
    const x = await arreglosPublicadosReal(DESDE, r.f, ENV)
    expect(x).toEqual({ ok: true, arreglos: [
      { id: 'd2', publicado_en: '2026-11-11T05:04:00.000Z', mensaje: 'fix(video): el lector de tarifas sin frases fijas (#1026)' },
      { id: 'd3', publicado_en: '2026-11-11T14:41:49.000Z', mensaje: 'fix(cadena): la mesa propone la hora (#1044)' },
    ] })
    const u = new URL(r.urls[0]!)
    expect(u.origin + u.pathname).toBe('https://api.vercel.com/v6/deployments')
    expect(Object.fromEntries(u.searchParams)).toEqual({ projectId: PROYECTO_DE_LA_PLATAFORMA, target: 'production', limit: '100', since: String(ms(DESDE)) })
    expect(r.headers[0]).toEqual({ Authorization: 'Bearer tok-de-prueba' })
  })
  it('pagina hacia atrás mientras haya más y se detiene en 5 páginas', async () => {
    const r = red([{ deployments: [dpl('a', '2026-11-11T10:00:00Z', 'fix: a')], next: ms('2026-11-11T09:00:00Z') }, { deployments: [dpl('b', '2026-11-11T08:00:00Z', 'fix: b')], next: null }])
    const x = await arreglosPublicadosReal(DESDE, r.f, ENV)
    expect(x.ok && x.arreglos.map((a) => a.id)).toEqual(['b', 'a'])
    expect(new URL(r.urls[1]!).searchParams.get('until')).toBe(String(ms('2026-11-11T09:00:00Z')))
    const sinFin = red([{ deployments: [], next: ms('2026-11-11T09:00:00Z') }])
    await arreglosPublicadosReal(DESDE, sinFin.f, ENV)
    expect(sinFin.urls).toHaveLength(5)
  })
  it('🔴 un error de la fuente vuelve como ok:false (nunca «no hay arreglos»)', async () => {
    expect(await arreglosPublicadosReal(DESDE, red([{ deployments: [] }], 503).f, ENV)).toEqual({ ok: false, motivo: 'la lista de publicaciones contestó 503' })
    const rota = (async () => ({ ok: true, status: 200, json: async () => ({}) })) as unknown as typeof fetch
    expect(await arreglosPublicadosReal(DESDE, rota, ENV)).toEqual({ ok: false, motivo: 'la lista de publicaciones no trae `deployments`' })
    const cae = (async () => { throw new Error('sin red') }) as unknown as typeof fetch
    expect(await arreglosPublicadosReal(DESDE, cae, ENV)).toEqual({ ok: false, motivo: 'sin red' })
    expect(await arreglosPublicadosReal('ayer', red([{ deployments: [] }]).f, ENV)).toMatchObject({ ok: false })
  })
})
