/**
 * ENCARGO manual visual con todas las fuentes · T1 · el rol «propio» de las fotos lo decide la llamada.
 * Caso real (df7e47cc, 20-oct): el alta raspó el Instagram propio 19 s después de crear la ficha, antes de que existiera `own_handles`; las 11 fotos se guardaron «competidor» y el piso visual
 * (que pide «propio») no las vio. Pruebas a costo cero con el CÓDIGO REAL del nodo «Fotos · lista» (sin red).
 */
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const W = join(process.cwd(), 'scripts', 'worker-staging', '3lyknrP3PoS2KzUf')
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const F: any = require(join(process.cwd(), 'src', 'lib', 'fotos', 'fotos-contexto-logica.js'))
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const servicio: any = await import(pathToFileURL(join(W, 'construir-contexto-fotos.mjs')).href)
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const rolPropio: any = await import(pathToFileURL(join(W, 'construir-rol-propio.mjs')).href)
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor
const CID = 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5'
const ANTES = JSON.parse(readFileSync(join(W, 'servicio-apify-ANTES-rol-propio-2026-10-21.json'), 'utf8'))

type Roles = Record<string, string>
/** corre el código real del nodo con una ficha (own_handles o nada), una llamada (metadata + cuerpo) y los perfiles que devolvió Apify */
async function lista(o: { own?: string | null; metadata?: Record<string, unknown>; cuerpo?: Record<string, unknown>; perfiles: string[]; codigo?: string }) {
  const refs: Record<string, unknown> = { 'Validar el cuerpo contra el esquema': { apify_function: 'instagram_scraper', dry_run: false, client_id: CID, metadata: o.metadata ?? {}, cuerpo: o.cuerpo ?? {}, params: o.cuerpo ?? {} } }
  const items = o.perfiles.map((username) => ({ json: { username, profilePicUrlHD: 'https://example.invalid/' + username + '.jpg', latestPosts: [] } }))
  const $ = (n: string) => {
    if (n === 'Merge · apify data ready') return { all: () => items, first: () => items[0] }
    if (!(n in refs)) throw new Error('nodo no ejecutado: ' + n)
    return { first: () => ({ json: refs[n] }), all: () => [{ json: refs[n] }] }
  }
  const ficha = o.own ? [{ config: { apify: { own_handles: { instagram: o.own } } } }] : [{ config: {} }]
  const out = await new AsyncFunction('$input', '$', '$env', '$json', '$workflow', '$execution', o.codigo ?? servicio.codigoDeNodo('lista'))
    .call({ helpers: { httpRequest: async () => ficha } }, { first: () => items[0], all: () => items }, $, { SUPABASE_SERVICE_ROLE_KEY: 'k' }, {}, { id: 'WF' }, { id: '1' })
  const roles: Roles = {}
  for (const x of out as Array<{ json: { handle: string; owner_role: string } }>) roles[x.json.handle] = x.json.owner_role
  return roles
}

describe('rolDeLaCuenta (lógica pura)', () => {
  const obj = (u: string[]) => F.objetivosDeLaLlamada({ usernames: u })
  it.each([
    ['la ficha dice cuál es la propia y coincide → propio', { handle: 'zeroriskgye', own: 'zeroriskgye', declaradoPropio: false, objetivos: [] }, 'propio'],
    ['la ficha la dice con @ y mayúsculas → propio', { handle: 'zeroriskgye', own: '@ZeroRiskGye', declaradoPropio: false, objetivos: [] }, 'propio'],
    ['la ficha la dice como enlace → propio', { handle: 'zeroriskgye', own: 'https://www.instagram.com/zeroriskgye/', declaradoPropio: false, objetivos: [] }, 'propio'],
    ['sin ficha y la llamada declara «own» con un solo perfil → propio (el caso df7e47cc)', { handle: 'zeroriskgye', own: '', declaradoPropio: true, objetivos: obj(['zeroriskgye']) }, 'propio'],
    ['sin ficha y «own» pero el perfil devuelto no es el pedido → competidor', { handle: 'otro', own: '', declaradoPropio: true, objetivos: obj(['zeroriskgye']) }, 'competidor'],
    ['sin ficha y «own» con VARIOS perfiles pedidos (ambiguo) → competidor', { handle: 'zeroriskgye', own: '', declaradoPropio: true, objetivos: obj(['zeroriskgye', 'otro']) }, 'competidor'],
    ['sin ficha y llamada de tercero → competidor', { handle: 'zeroriskgye', own: '', declaradoPropio: false, objetivos: obj(['zeroriskgye']) }, 'competidor'],
    ['la ficha dice otra cuenta y la llamada es de tercero → competidor', { handle: 'rival', own: 'zeroriskgye', declaradoPropio: false, objetivos: obj(['rival']) }, 'competidor'],
    ['«own» declarado pero la ficha dice OTRA cuenta → manda la ficha (la llamada no la contradice)', { handle: 'zeroriskgye', own: 'otra', declaradoPropio: true, objetivos: obj(['zeroriskgye']) }, 'competidor'],
    ['sin handle → competidor', { handle: '', own: 'x', declaradoPropio: true, objetivos: obj(['x']) }, 'competidor'],
    ['declaradoPropio no booleano exacto («true» texto) → competidor', { handle: 'zeroriskgye', own: '', declaradoPropio: 'true', objetivos: obj(['zeroriskgye']) }, 'competidor'],
  ])('%s', (_n, o, esperado) => { expect(F.rolDeLaCuenta(o)).toBe(esperado) })
  it('objetivosDeLaLlamada entiende directUrls, usernames y startUrls (texto u objeto)', () => {
    expect(F.objetivosDeLaLlamada({ directUrls: ['https://www.instagram.com/A_b/'], usernames: ['@C'], startUrls: ['https://instagram.com/d', { url: 'https://instagram.com/e/' }] })).toEqual(['a_b', 'c', 'd', 'e'])
    expect(F.objetivosDeLaLlamada(undefined)).toEqual([])
  })
})

describe('«Fotos · lista» con el código real', () => {
  it('🔴 df7e47cc: ficha SIN own_handles + llamada del alta (target_kind own, usernames) → las fotos salen «propio»', async () => {
    const r = await lista({ own: null, metadata: { target_kind: 'own' }, cuerpo: { usernames: ['zeroriskgye'], resultsLimit: 12 }, perfiles: ['zeroriskgye'] })
    expect(r).toEqual({ zeroriskgye: 'propio' })
  })
  it('lo mismo con directUrls (el segundo raspado del 20-oct)', async () => {
    const r = await lista({ own: null, metadata: { target_kind: 'own' }, cuerpo: { directUrls: ['https://www.instagram.com/zeroriskgye'] }, perfiles: ['zeroriskgye'] })
    expect(r).toEqual({ zeroriskgye: 'propio' })
  })
  it('no-regresión (Náufrago): ficha con own_handles y llamada SIN metadata → propio el propio, competidor los demás', async () => {
    const r = await lista({ own: 'naufrago.ec', metadata: {}, cuerpo: { usernames: ['naufrago.ec', 'lacasadelencebollado'] }, perfiles: ['naufrago.ec', 'lacasadelencebollado'] })
    expect(r).toEqual({ 'naufrago.ec': 'propio', lacasadelencebollado: 'competidor' })
  })
  it('un competidor sigue siendo competidor aunque la ficha esté vacía (llamada de tercero)', async () => {
    const r = await lista({ own: null, metadata: { target_kind: 'third_party' }, cuerpo: { usernames: ['lacasadelencebollado'] }, perfiles: ['lacasadelencebollado'] })
    expect(r).toEqual({ lacasadelencebollado: 'competidor' })
  })
  it('una llamada «own» que pide dos perfiles no rotula a ninguno «propio» por inferencia', async () => {
    const r = await lista({ own: null, metadata: { target_kind: 'own' }, cuerpo: { usernames: ['zeroriskgye', 'rival'] }, perfiles: ['zeroriskgye', 'rival'] })
    expect(r).toEqual({ zeroriskgye: 'competidor', rival: 'competidor' })
  })
  it('y el estado de ANTES (el nodo vivo) rotulaba «competidor» el caso df7e47cc: la prueba está roja sin el arreglo', async () => {
    const codigoVivo = ANTES.nodes.find((n: { name: string }) => n.name === 'Fotos · lista').parameters.jsCode as string
    const r = await lista({ own: null, metadata: { target_kind: 'own' }, cuerpo: { usernames: ['zeroriskgye'] }, perfiles: ['zeroriskgye'], codigo: codigoVivo })
    expect(r).toEqual({ zeroriskgye: 'competidor' })
  })
})

describe('el constructor del flujo', () => {
  it('cambia SOLO el código de «Fotos · lista» y lo deja igual al código del repositorio', () => {
    const nuevo = rolPropio.aplicarRolPropio(ANTES)
    const cambiados = ANTES.nodes.filter((n: { name: string; parameters: { jsCode?: string } }, i: number) => JSON.stringify(n) !== JSON.stringify(nuevo.nodes[i])).map((n: { name: string }) => n.name)
    expect(cambiados).toEqual(['Fotos · lista'])
    expect(nuevo.nodes.length).toBe(ANTES.nodes.length)
    expect(JSON.stringify(nuevo.connections)).toBe(JSON.stringify(ANTES.connections))
    const codigo = nuevo.nodes.find((n: { name: string }) => n.name === 'Fotos · lista').parameters.jsCode as string
    expect(codigo.replace(/\r\n/g, '\n')).toBe(servicio.codigoDeNodo('lista').replace(/\r\n/g, '\n'))
    expect(codigo).toContain('rolDeLaCuenta({')
  })
  it('se niega a aplicarse dos veces', () => {
    expect(() => rolPropio.aplicarRolPropio(rolPropio.aplicarRolPropio(ANTES))).toThrow(/ya tiene/)
  })
})
