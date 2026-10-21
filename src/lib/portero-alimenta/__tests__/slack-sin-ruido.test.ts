/**
 * SLACK SIN RUIDO (21-oct · firma de Emilio 16:56 Berlín): solo `#alertas`, UN mensaje por incidente, repeticiones como respuesta en el hilo, cierre en el hilo, nada a `#equipo`. US$ 0 · Slack simulado · base falsa.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { avisarPorIncidente, claveDeIncidente, resolverIncidente, HORAS_PARA_CERRAR_UN_INCIDENTE } from '../alertas'
import { avisarAAlertas } from '../avisos'
import { rutaReanudar } from '../pausas'
import { CANAL_DE_ALERTAS } from '../vigilante'
import { crearBaseFalsa } from './base-falsa'

const T0 = new Date('2026-10-21T12:00:00Z')
const horas = (h: number) => new Date(T0.getTime() + h * 3_600_000)
function slack(o: { falla?: boolean } = {}) {
  const posts: Array<{ channel: string; text: string; thread_ts?: string }> = []
  let n = 0
  const fetchImpl = async (_u: string, i?: RequestInit) => {
    const b = JSON.parse(String(i?.body)); posts.push(b)
    return new Response(JSON.stringify(o.falla ? { ok: false, error: 'channel_not_found' } : { ok: true, ts: `1792000000.00${++n}` }), { status: 200 })
  }
  return { posts, fetchImpl }
}
const mundo = () => ({ cerebro_alertas: [] as Array<Record<string, unknown>>, cerebro_portero_pausas: [] as Array<Record<string, unknown>> })

describe('un incidente = un mensaje en #alertas; lo demás, en su hilo', () => {
  it('la clave sale del texto sin cifras ni emojis: la misma alarma con otros números es el mismo incidente', () => {
    expect(claveDeIncidente('🟡 gasto del día va en US$ 3.20 (aviso desde 3.00)')).toBe(claveDeIncidente('🟡 gasto del día va en US$ 4.75 (aviso desde 3.00)'))
    expect(claveDeIncidente('🔴 el portero APAGADO')).not.toBe(claveDeIncidente('🟡 gasto del día'))
  })
  it('1.ª vez: mensaje nuevo en #alertas y el incidente queda anotado; lo mismo otra vez: NO se publica; un detalle distinto: respuesta en el hilo', async () => {
    const t = mundo(); const s = slack()
    const db = crearBaseFalsa(t as never).db as never
    const av = (texto: string, cuando = T0, clave?: string) => avisarPorIncidente({ db, token: 't', fetchImpl: s.fetchImpl, ahora: () => cuando })(texto, clave)
    const a = await av('🟡 gasto del día US$ 3.20', T0, 'gasto:x')
    expect(a).toMatchObject({ ok: true, accion: 'abrio' })
    expect(s.posts).toHaveLength(1); expect(s.posts[0]).toMatchObject({ channel: CANAL_DE_ALERTAS, text: '🟡 gasto del día US$ 3.20' }); expect(s.posts[0].thread_ts).toBeUndefined()
    expect(t.cerebro_alertas[0]).toMatchObject({ clave: 'gasto:x', thread_ts: '1792000000.001', repeticiones: 0 })
    const b = await av('🟡 gasto del día US$ 3.20', horas(1), 'gasto:x')
    expect(b).toMatchObject({ ok: true, accion: 'repetida' }); expect(s.posts).toHaveLength(1)
    expect(t.cerebro_alertas[0].repeticiones).toBe(1)
    const c = await av('🟡 gasto del día US$ 4.10', horas(2), 'gasto:x')
    expect(c).toMatchObject({ ok: true, accion: 'hilo' })
    expect(s.posts).toHaveLength(2); expect(s.posts[1]).toMatchObject({ channel: CANAL_DE_ALERTAS, thread_ts: '1792000000.001', text: '🟡 gasto del día US$ 4.10' })
  })
  it('sin clave explícita, el mismo incidente con otras cifras cae en el mismo hilo', async () => {
    const t = mundo(); const s = slack()
    const av = avisarPorIncidente({ db: crearBaseFalsa(t as never).db as never, token: 't', fetchImpl: s.fetchImpl, ahora: () => T0 })
    await av('🔴 Portero PAUSADO para Cliente Uno: gasto del día US$ 11.20')
    await av('🔴 Portero PAUSADO para Cliente Uno: gasto del día US$ 12.90')
    expect(s.posts).toHaveLength(2); expect(s.posts[1].thread_ts).toBe('1792000000.001')
    await av('🔴 Portero PAUSADO para Cliente Dos: gasto del día US$ 11.20') // otro incidente: otro mensaje
    expect(s.posts).toHaveLength(3); expect(s.posts[2].thread_ts).toBeUndefined()
  })
  it('pasadas 24 h sin actividad, o con el incidente cerrado, el aviso siguiente abre un mensaje nuevo', async () => {
    const t = mundo(); const s = slack()
    const av = (cuando: Date) => avisarPorIncidente({ db: crearBaseFalsa(t as never).db as never, token: 't', fetchImpl: s.fetchImpl, ahora: () => cuando })('algo pasó', 'k')
    await av(T0)
    expect((await av(horas(HORAS_PARA_CERRAR_UN_INCIDENTE - 1))).accion).toBe('repetida')
    expect((await av(horas(HORAS_PARA_CERRAR_UN_INCIDENTE * 2 + 1))).accion).toBe('abrio')
    expect(s.posts).toHaveLength(2)
    await resolverIncidente({ db: crearBaseFalsa(t as never).db as never, token: 't', fetchImpl: s.fetchImpl, ahora: () => horas(60) })('k', 'arreglado')
    expect((await av(horas(61))).accion).toBe('abrio')
  })
  it('resolver cierra con una respuesta en el hilo (no un mensaje nuevo en el canal); sin incidente abierto no publica nada', async () => {
    const t = mundo(); const s = slack(); const db = crearBaseFalsa(t as never).db as never
    await avisarPorIncidente({ db, token: 't', fetchImpl: s.fetchImpl, ahora: () => T0 })('🔴 pausa', 'pausa:c1')
    const r = await resolverIncidente({ db, token: 't', fetchImpl: s.fetchImpl, ahora: () => horas(2) })('pausa:c1', 'reanudado por Lenovo')
    expect(r).toMatchObject({ ok: true, accion: 'cerro' })
    expect(s.posts[1]).toMatchObject({ thread_ts: '1792000000.001', text: expect.stringMatching(/Resuelto · reanudado por Lenovo/) })
    expect(t.cerebro_alertas[0].cerrado_en).toBeTruthy()
    expect((await resolverIncidente({ db, token: 't', fetchImpl: s.fetchImpl })('pausa:c1')).accion).toBe('sin_incidente')
    expect((await resolverIncidente({ db, token: 't', fetchImpl: s.fetchImpl })('nunca-hubo')).accion).toBe('sin_incidente')
    expect(s.posts).toHaveLength(2)
  })
  it('un aviso que Slack no confirma NO deja incidente abierto (el siguiente vuelve a intentar como alarma nueva)', async () => {
    const t = mundo(); const malo = slack({ falla: true }); const bueno = slack(); const db = crearBaseFalsa(t as never).db as never
    const r = await avisarPorIncidente({ db, token: 't', fetchImpl: malo.fetchImpl, ahora: () => T0 })('🔴 algo', 'k')
    expect(r).toMatchObject({ ok: false, accion: 'fallo', detalle: expect.stringMatching(/channel_not_found/) })
    expect(t.cerebro_alertas).toHaveLength(0)
    expect((await avisarPorIncidente({ db, token: 't', fetchImpl: bueno.fetchImpl, ahora: () => horas(1) })('🔴 algo', 'k')).accion).toBe('abrio')
  })
  it('si la base no se puede leer, el aviso NO se calla: se publica como alarma nueva y se dice', async () => {
    const s = slack()
    const db = { from: () => ({ select: () => ({ eq: () => ({ limit: async () => ({ error: { message: 'tabla ausente' }, data: null }) }) }), insert: async () => ({ error: { message: 'tabla ausente' } }) }) } as never
    const r = await avisarPorIncidente({ db, token: 't', fetchImpl: s.fetchImpl })('🔴 algo', 'k')
    expect(r).toMatchObject({ ok: true, accion: 'abrio', detalle: expect.stringMatching(/la base no dejó leer/) })
    expect(s.posts).toHaveLength(1)
  })
  it('sin token no se entrega (y se dice); `avisarAAlertas` sigue dando {ok, detalle} a quien lo llama', async () => {
    expect(await avisarPorIncidente({ db: crearBaseFalsa(mundo() as never).db as never, token: '' })('x', 'k')).toMatchObject({ ok: false })
    const s = slack()
    const r = await avisarAAlertas({ db: crearBaseFalsa(mundo() as never).db as never, token: 't', fetchImpl: s.fetchImpl })('🔴 hola', 'k2')
    expect(r).toEqual({ ok: true, detalle: 'entregado' })
    const sinBase = await avisarAAlertas({ token: 't', fetchImpl: s.fetchImpl })('🔴 hola')
    expect(sinBase.ok).toBe(true)
  })
  it('reanudar un cliente cierra el incidente de su pausa en el hilo', async () => {
    const t = { ...mundo(), cerebro_portero_pausas: [{ id: 'p1', client_id: '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', desde: '2026-10-21T10:00:00Z', motivo: 'gasto', levantada_en: null }] }
    const s = slack(); const db = crearBaseFalsa(t as never).db as never
    await avisarPorIncidente({ db, token: 't', fetchImpl: s.fetchImpl, ahora: () => T0 })('🟠 PAUSADO', 'pausa:0a2ffbd4-957c-4315-a37f-b9e4fbbbb312')
    const r = await rutaReanudar({ db, ahora: horas(1), resolver: resolverIncidente({ db, token: 't', fetchImpl: s.fetchImpl, ahora: () => horas(1) }) }, { client_id: '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', dry_run: false, workflow_id: 'w', workflow_execution_id: 'e', motivo: 'se arregló el gasto', por: 'Lenovo' })
    expect(r.body).toMatchObject({ ok: true, reanudado: true, incidente_de_slack: { accion: 'cerro' } })
    expect(s.posts[1]).toMatchObject({ thread_ts: '1792000000.001' })
  })
})

describe('todo lo que el cerebro/portero publica en Slack pasa por UNA puerta y va solo a #alertas', () => {
  const raiz = process.cwd()
  const leerTodos = (dir: string): string[] => fs.readdirSync(path.join(raiz, dir), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? (e.name === '__tests__' ? [] : leerTodos(path.join(dir, e.name))) : /\.ts$/.test(e.name) ? [path.join(dir, e.name)] : [])
  const fuentes = [...leerTodos('src/lib/portero-alimenta'), ...leerTodos('src/lib/cerebro'), ...leerTodos('src/app/api/brain')]
  const sinComentarios = (t: string) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  it('el único `chat.postMessage` del portero es alertas.ts (incidente por mensaje); ninguno apunta a #equipo', () => {
    const postea = fuentes.filter((f) => /chat\.postMessage/.test(sinComentarios(fs.readFileSync(path.join(raiz, f), 'utf8'))))
    expect(postea.map((f) => f.replace(/\\/g, '/'))).toEqual(['src/lib/portero-alimenta/alertas.ts'])
    for (const f of fuentes) expect(sinComentarios(fs.readFileSync(path.join(raiz, f), 'utf8')), f).not.toMatch(/C0B2QCDMV7Y|#equipo/)
  })
  it('las rutas que avisan lo hacen con la base (un incidente = un mensaje)', () => {
    for (const r of ['vigilar', 'no-corrio', 'despertar', 'pulir', 'aviso-de-raspador']) expect(fs.readFileSync(path.join(raiz, `src/app/api/brain/alimentar/${r}/route.ts`), 'utf8'), r).toMatch(/avisarAAlertas\(\{ db/)
    expect(fs.readFileSync(path.join(raiz, 'src/app/api/brain/alimentar/alarma/route.ts'), 'utf8')).toMatch(/avisarPorIncidente\(\{ db \}\)/)
  })
})
