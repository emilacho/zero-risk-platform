/**
 * P1 · LLAVES POR CLIENTE CIFRADAS EN LA BASE. US$ 0 · base falsa · llaves FALSAS. Con los diez clientes: cada uno su llave, ninguno ve la de otro, la base solo ve texto cifrado,
 * nada devuelve ni imprime un valor, y mientras la llave no esté en la base sigue valiendo su variable de siempre.
 */
import { describe, expect, it } from 'vitest'
import { BRAZOS_APAGADOS, correrBrazos } from '../brazos'
import { brazoDePropios, type Fetch } from '../brazos/propios'
import { VARIABLE_DE_LA_CLAVE, cifrar, claveMaestra, credencialesDelCliente, descifrar, huellaDeLaClave, rutaGuardarCredencial, rutaLeerCredenciales, sinLaLlave } from '../credenciales'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA } from './fixtures-despertar'

const CLAVE = 'a'.repeat(64) // 32 bytes en hex (falsa)
const OTRA = 'b'.repeat(64)
const ENV = { [VARIABLE_DE_LA_CLAVE]: CLAVE }
const WF = { workflow_id: 'wf', workflow_execution_id: 'ex' }
const llaveDe = (i: number) => `LLAVE-FALSA-${i}-${'x'.repeat(20)}`
const juntos = (): T => {
  const out: T = {}
  for (const c of DIEZ_CLIENTES) for (const [k, v] of Object.entries(tablasDe(c))) (out[k] ??= []).push(...v)
  out.cerebro_credenciales = []
  return out
}

describe('cifrado', () => {
  it('ida y vuelta; cada cifrado es distinto; con otra clave o tocado no se abre; la clave maestra debe ser de 32 bytes', () => {
    const k = claveMaestra(ENV)!
    const c1 = cifrar('secreto-123', k), c2 = cifrar('secreto-123', k)
    expect(c1).not.toBe(c2)
    expect(c1).not.toContain('secreto-123')
    expect(descifrar(c1, k)).toBe('secreto-123')
    expect(descifrar(c1, claveMaestra({ [VARIABLE_DE_LA_CLAVE]: OTRA })!)).toBeNull()
    const partes = c1.split(':'); partes[3] = Buffer.from('otro texto').toString('base64')
    expect(descifrar(partes.join(':'), k)).toBeNull()
    expect(descifrar('basura', k)).toBeNull()
    expect(claveMaestra({})).toBeNull()
    expect(claveMaestra({ [VARIABLE_DE_LA_CLAVE]: 'corta' })).toBeNull()
    expect(claveMaestra({ [VARIABLE_DE_LA_CLAVE]: Buffer.alloc(32, 7).toString('base64') })).not.toBeNull()
  })
  it('sinLaLlave limpia cualquier rastro de una llave en un texto', () => {
    expect(sinLaLlave('error con LLAVE-FALSA-1-xxxxxxxxxxxxxxxxxxxx dentro', [llaveDe(1)])).toBe('error con *** dentro')
  })
})

describe('guardar y leer', () => {
  const c = DIEZ_CLIENTES[4]
  it('sin clave maestra en el servidor no se guarda nada', async () => {
    const t = juntos()
    const r = await rutaGuardarCredencial({ db: crearBaseFalsa(t as never).db as never, env: {} }, { client_id: c.id, dry_run: false, ...WF, proveedor: 'loyverse', campos: { token: llaveDe(1) } })
    expect(r.status).toBe(503)
    expect(t.cerebro_credenciales).toHaveLength(0)
    expect(JSON.stringify(r.body)).not.toContain(llaveDe(1))
  })
  it('guarda CIFRADO: la base no tiene la llave en claro; la respuesta no la devuelve; trae largo y huella', async () => {
    const t = juntos()
    const r = await rutaGuardarCredencial({ db: crearBaseFalsa(t as never).db as never, env: ENV, ahora: AHORA }, { client_id: c.id, dry_run: false, ...WF, proveedor: 'loyverse', campos: { token: llaveDe(1), store_id: 'tienda-1' } })
    expect(r.status).toBe(200)
    expect(JSON.stringify(r.body)).not.toContain(llaveDe(1))
    expect(JSON.stringify(r.body)).not.toContain('tienda-1')
    expect((r.body.guardados as Array<Record<string, unknown>>).map((g) => g.campo).sort()).toEqual(['store_id', 'token'])
    expect(JSON.stringify(t.cerebro_credenciales)).not.toContain(llaveDe(1))
    expect(t.cerebro_credenciales).toHaveLength(2)
    expect(t.cerebro_credenciales[0]).toMatchObject({ client_id: c.id, proveedor: 'loyverse' })
    const lee = await rutaLeerCredenciales({ db: crearBaseFalsa(t as never).db as never, env: ENV }, c.id)
    expect(JSON.stringify(lee.body)).not.toContain(llaveDe(1))
    expect(lee.body.credenciales).toEqual(expect.arrayContaining([expect.objectContaining({ proveedor: 'loyverse', campo: 'token', huella: huellaDeLaClave(llaveDe(1)) })]))
  })
  it('validaciones: proveedor, campos no válidos, vacíos, dry_run no guarda, cliente inexistente', async () => {
    const t = juntos()
    const d = { db: crearBaseFalsa(t as never).db as never, env: ENV }
    expect((await rutaGuardarCredencial(d, { client_id: c.id, dry_run: false, ...WF, proveedor: 'otro', campos: { token: 'x' } })).status).toBe(400)
    expect((await rutaGuardarCredencial(d, { client_id: c.id, dry_run: false, ...WF, proveedor: 'meta', campos: { store_id: 'x' } })).status).toBe(400)
    expect((await rutaGuardarCredencial(d, { client_id: c.id, dry_run: false, ...WF, proveedor: 'meta', campos: { token: '   ' } })).status).toBe(400)
    expect((await rutaGuardarCredencial(d, { client_id: c.id, dry_run: false, ...WF, proveedor: 'meta', campos: {} })).status).toBe(400)
    expect((await rutaGuardarCredencial(d, { client_id: c.id, ...WF, dry_run: true, proveedor: 'meta', campos: { token: 'x' } })).body).toMatchObject({ dry_run: true })
    expect((await rutaGuardarCredencial(d, { client_id: 'ffffffff-ffff-4fff-8fff-ffffffffffff', dry_run: false, ...WF, proveedor: 'meta', campos: { token: 'x' } })).status).toBe(404)
    expect((await rutaGuardarCredencial(d, { client_id: c.id, dry_run: false, proveedor: 'meta', campos: { token: 'x' } })).status).toBe(403)
    expect(t.cerebro_credenciales).toHaveLength(0)
  })
  it('cambiar una llave NO borra la vieja: queda retirada con su fecha; solo la nueva está vigente', async () => {
    const t = juntos()
    const d = { db: crearBaseFalsa(t as never).db as never, env: ENV, ahora: AHORA }
    await rutaGuardarCredencial(d, { client_id: c.id, dry_run: false, ...WF, proveedor: 'meta', campos: { token: llaveDe(1) } })
    const r = await rutaGuardarCredencial(d, { client_id: c.id, dry_run: false, ...WF, proveedor: 'meta', campos: { token: llaveDe(2) } })
    expect((r.body.guardados as Array<Record<string, unknown>>)[0]).toMatchObject({ reemplaza: true })
    expect(t.cerebro_credenciales).toHaveLength(2)
    expect(t.cerebro_credenciales.filter((f) => !f.retirada_en)).toHaveLength(1)
    expect(t.cerebro_credenciales.find((f) => f.retirada_en)!.retirada_en).toBe(AHORA.toISOString())
    const k = claveMaestra(ENV)!
    const vigente = t.cerebro_credenciales.find((f) => !f.retirada_en)!
    expect(descifrar(String(vigente.valor_cifrado), k)).toBe(llaveDe(2))
  })
  it('si no se puede retirar la llave vieja se DICE (no queda una vigente doble)', async () => {
    const t = juntos()
    const ok = { db: crearBaseFalsa(t as never).db as never, env: ENV, ahora: AHORA }
    await rutaGuardarCredencial(ok, { client_id: c.id, dry_run: false, ...WF, proveedor: 'meta', campos: { token: llaveDe(1) } })
    const db = { from: (n: string) => { const q = crearBaseFalsa(t as never).db.from(n) as Record<string, unknown>; if (n === 'cerebro_credenciales') q.update = () => ({ eq: () => ({ then: (r: (x: unknown) => unknown) => Promise.resolve({ data: null, error: { message: 'no pude actualizar' } }).then(r) }) }); return q } }
    const r = await rutaGuardarCredencial({ db: db as never, env: ENV, ahora: AHORA }, { client_id: c.id, dry_run: false, ...WF, proveedor: 'meta', campos: { token: llaveDe(2) } })
    expect(r.status).toBe(502)
    expect(r.body.error).toBe('retiro_fallido')
  })
  it('un error de la base nunca arrastra la llave', async () => {
    const t = juntos()
    const db = { from: (n: string) => { const q = crearBaseFalsa(t as never).db.from(n) as Record<string, unknown>; if (n === 'cerebro_credenciales') q.insert = () => ({ then: (r: (x: unknown) => unknown) => Promise.resolve({ data: null, error: { message: `falló al guardar ${llaveDe(3)}` } }).then(r) }); return q } }
    const r = await rutaGuardarCredencial({ db: db as never, env: ENV }, { client_id: c.id, dry_run: false, ...WF, proveedor: 'loyverse', campos: { token: llaveDe(3) } })
    expect(r.status).toBe(502)
    expect(JSON.stringify(r.body)).not.toContain(llaveDe(3))
  })
})

describe('los diez clientes: cada uno su llave, ninguno ve la de otro', () => {
  it('cada cliente recibe SU llave de la base; los que no tienen, la variable de siempre; ninguna mezcla', async () => {
    const t = juntos()
    const d = { db: crearBaseFalsa(t as never).db as never, env: ENV, ahora: AHORA }
    for (let i = 0; i < 5; i++) await rutaGuardarCredencial(d, { client_id: DIEZ_CLIENTES[i].id, dry_run: false, ...WF, proveedor: 'loyverse', campos: { token: llaveDe(i) } })
    const env = { ...ENV, CLIENTE_SIN_BASE_LOYVERSE_TOKEN: 'LLAVE-DE-VARIABLE' }
    for (let i = 0; i < 5; i++) {
      const r = await credencialesDelCliente(crearBaseFalsa(t as never).db as never, DIEZ_CLIENTES[i].id, 'cualquiera', env)
      expect(r.loyverse_token).toBe(llaveDe(i))
      expect(r.origen.loyverse).toBe('base')
    }
    // si el cliente tiene la llave en la base Y en su variable, manda la de la base
    const ambas = await credencialesDelCliente(crearBaseFalsa(t as never).db as never, DIEZ_CLIENTES[0].id, 'x', { ...env, CLIENTE_X_LOYVERSE_TOKEN: 'LLAVE-DE-VARIABLE' })
    expect(ambas.loyverse_token).toBe(llaveDe(0))
    const sin = await credencialesDelCliente(crearBaseFalsa(t as never).db as never, DIEZ_CLIENTES[7].id, 'sin-base', env)
    expect(sin.loyverse_token).toBe('LLAVE-DE-VARIABLE')
    expect(sin.origen.loyverse).toBe('variable')
    const nada = await credencialesDelCliente(crearBaseFalsa(t as never).db as never, DIEZ_CLIENTES[8].id, 'nada-de-nada', env)
    expect(nada.loyverse_token).toBeNull()
    expect(nada.origen.loyverse).toBe('ninguna')
    expect(nada.faltan.join(' ')).toMatch(/CLIENTE_NADA_DE_NADA_LOYVERSE_TOKEN/)
  })
  it('compatibilidad: sin la tabla (migración sin aplicar) o sin clave maestra o con un texto que no abre, se usa la variable y se DICE', async () => {
    const t = juntos()
    const env = { CLIENTE_X_LOYVERSE_TOKEN: 'LLAVE-DE-VARIABLE' }
    const sinTabla = { from: (n: string) => (n === 'cerebro_credenciales' ? { select: () => ({ eq: () => ({ is: () => ({ limit: async () => ({ data: null, error: { message: "Could not find the table 'public.cerebro_credenciales' in the schema cache" } }) }) }) }) } : crearBaseFalsa(t as never).db.from(n)) }
    const a = await credencialesDelCliente(sinTabla as never, DIEZ_CLIENTES[0].id, 'x', env)
    expect(a.loyverse_token).toBe('LLAVE-DE-VARIABLE'); expect(a.avisos).toEqual([])
    t.cerebro_credenciales.push({ id: 'z', client_id: DIEZ_CLIENTES[0].id, proveedor: 'loyverse', campo: 'token', valor_cifrado: cifrar('de-la-base', claveMaestra(ENV)!), retirada_en: null })
    const sinClave = await credencialesDelCliente(crearBaseFalsa(t as never).db as never, DIEZ_CLIENTES[0].id, 'x', env)
    expect(sinClave.loyverse_token).toBe('LLAVE-DE-VARIABLE'); expect(sinClave.avisos.join(' ')).toMatch(new RegExp(VARIABLE_DE_LA_CLAVE))
    const otraClave = await credencialesDelCliente(crearBaseFalsa(t as never).db as never, DIEZ_CLIENTES[0].id, 'x', { ...env, [VARIABLE_DE_LA_CLAVE]: OTRA })
    expect(otraClave.loyverse_token).toBe('LLAVE-DE-VARIABLE'); expect(otraClave.avisos.join(' ')).toMatch(/no se pudo descifrar/)
    expect(JSON.stringify(otraClave.avisos)).not.toContain('de-la-base')
  })
  it('de punta a punta por los brazos: el portero lee las ventas con la llave de la BASE (sin ninguna variable del cliente) y nada la deja escrita en las fichas ni en lo declarado', async () => {
    const t = juntos()
    const c = DIEZ_CLIENTES.find((x) => x.pos === 'loyverse' && x.iso === 'co')!
    await rutaGuardarCredencial({ db: crearBaseFalsa(t as never).db as never, env: ENV, ahora: AHORA }, { client_id: c.id, dry_run: false, ...WF, proveedor: 'loyverse', campos: { token: 'LLAVE-DE-LA-BASE-SOLO-AQUI' } })
    const vistas: string[] = []
    const fetch: Fetch = async (url, init) => { vistas.push(String(init?.headers?.Authorization)); return { ok: true, status: 200, json: async () => (url.includes('/stores') ? { stores: [] } : { receipts: [{ receipt_type: 'SALE', total_money: 10, created_at: '2026-10-10T02:30:00Z', line_items: [{ item_name: 'X', quantity: 1, total_money: 10 }] }] }) } }
    const cliente = t.clients.find((x) => x.id === c.id)!
    ;(cliente.config as { apify: Record<string, unknown> }).apify.punto_de_venta = 'loyverse'
    const r = await correrBrazos({ db: crearBaseFalsa(t as never).db, brazos: { ...BRAZOS_APAGADOS, propios: true }, cliente, client_id: c.id, filas: [], ahora: AHORA, dry_run: false, env: ENV, fetch })
    expect(r.errores).toEqual([])
    expect(vistas.length).toBeGreaterThan(0)
    expect(vistas.every((v) => v === 'Bearer LLAVE-DE-LA-BASE-SOLO-AQUI')).toBe(true)
    expect(t.cerebro_fichas.some((f) => String(f.atributo).startsWith('metrica:loyverse:ingreso'))).toBe(true)
    expect(JSON.stringify(t.cerebro_fichas)).not.toContain('LLAVE-DE-LA-BASE-SOLO-AQUI')
    expect(JSON.stringify(r)).not.toContain('LLAVE-DE-LA-BASE-SOLO-AQUI')
    expect(brazoDePropios).toBeDefined()
  })
})

describe('migrar las variables del servidor a la base (las variables son «sensibles»: solo el servidor las ve)', () => {
  const slugDe = (nombre: string) => nombre.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').toUpperCase()
  it('cada uno de los diez migra SOLO sus variables; la base queda cifrada; la respuesta no trae ningún valor; la segunda vez no duplica vigentes', async () => {
    const t = juntos()
    const env: Record<string, string> = { ...ENV }
    DIEZ_CLIENTES.forEach((c, i) => { const slug = String((t.clients.find((x) => x.id === c.id) as { slug?: string }).slug).toUpperCase().replace(/-/g, '_'); env[`CLIENTE_${slug}_LOYVERSE_TOKEN`] = llaveDe(i); env[`CLIENTE_${slug}_META_TOKEN`] = llaveDe(100 + i); env[`CLIENTE_${slug}_META_AD_ACCOUNT_ID`] = `act_${i}${'9'.repeat(8)}` })
    void slugDe
    const deps = { db: crearBaseFalsa(t as never).db, env, ahora: AHORA }
    for (const [i, c] of DIEZ_CLIENTES.entries()) {
      const r = await rutaGuardarCredencial(deps, { client_id: c.id, migrar_desde_variables: true, dry_run: false, ...WF })
      expect(r.status).toBe(200)
      expect(JSON.stringify(r.body)).not.toContain(llaveDe(i)); expect(JSON.stringify(r.body)).not.toContain(llaveDe(100 + i))
      expect(r.body).toMatchObject({ ok: true, resultado: [{ proveedor: 'loyverse', estado: 'migrada' }, { proveedor: 'meta', estado: 'migrada' }] })
    }
    const k = claveMaestra(ENV)!
    for (const [i, c] of DIEZ_CLIENTES.entries()) {
      const filas = t.cerebro_credenciales.filter((f) => f.client_id === c.id && !f.retirada_en)
      expect(filas.length).toBe(3) // loyverse token + meta token + ad account
      expect(JSON.stringify(filas)).not.toContain('LLAVE-FALSA')
      expect(descifrar(String(filas.find((f) => f.proveedor === 'loyverse' && f.campo === 'token')!.valor_cifrado), k)).toBe(llaveDe(i))
    }
    // una segunda pasada no deja dos vigentes del mismo campo (la anterior queda retirada)
    await rutaGuardarCredencial(deps, { client_id: DIEZ_CLIENTES[0].id, migrar_desde_variables: true, dry_run: false, ...WF })
    expect(t.cerebro_credenciales.filter((f) => f.client_id === DIEZ_CLIENTES[0].id && !f.retirada_en)).toHaveLength(3)
  })
  it('en seco no escribe; sin variables no inventa; sin clave maestra no guarda nada; cliente inexistente 404', async () => {
    const t = juntos()
    const c = DIEZ_CLIENTES[0]
    const slug = String((t.clients.find((x) => x.id === c.id) as { slug?: string }).slug).toUpperCase().replace(/-/g, '_')
    const env = { ...ENV, [`CLIENTE_${slug}_LOYVERSE_TOKEN`]: llaveDe(1) }
    const deps = { db: crearBaseFalsa(t as never).db, env, ahora: AHORA }
    const seco = await rutaGuardarCredencial(deps, { client_id: c.id, migrar_desde_variables: true, dry_run: true })
    expect(seco.body).toMatchObject({ ok: true, dry_run: true, resultado: [{ proveedor: 'loyverse', estado: 'migraría' }, { proveedor: 'meta', estado: 'sin_variables' }] })
    expect(t.cerebro_credenciales).toHaveLength(0)
    const sinClave = await rutaGuardarCredencial({ ...deps, env: { [`CLIENTE_${slug}_LOYVERSE_TOKEN`]: llaveDe(1) } }, { client_id: c.id, migrar_desde_variables: true, dry_run: false, ...WF })
    expect(sinClave.status).toBe(503); expect(t.cerebro_credenciales).toHaveLength(0)
    expect((await rutaGuardarCredencial(deps, { client_id: 'deadbeef-dead-4ead-8ead-deadbeefdead', migrar_desde_variables: true, dry_run: false, ...WF })).status).toBe(404)
    const otro = DIEZ_CLIENTES[1]
    const vacio = await rutaGuardarCredencial(deps, { client_id: otro.id, migrar_desde_variables: true, dry_run: false, ...WF })
    expect(vacio.body).toMatchObject({ resultado: [{ estado: 'sin_variables' }, { estado: 'sin_variables' }] }) // la variable del primero no se le da al segundo
    expect(t.cerebro_credenciales).toHaveLength(0)
  })
})
