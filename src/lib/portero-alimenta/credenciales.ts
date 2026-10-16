/**
 * LLAVES POR CLIENTE, CIFRADAS EN LA BASE (P1) · agnóstico. Antes cada llave de un cliente era una variable en Vercel (`CLIENTE_<SLUG>_LOYVERSE_TOKEN`…): 50 clientes = 150+ variables,
 * un redespliegue por cada una y un cambio de nombre las rompía en silencio. Ahora viven en `cerebro_credenciales` (una fila por cliente, proveedor y campo), CIFRADAS (AES-256-GCM) con una
 * clave maestra que solo existe en el servidor (`PORTERO_CLAVE_DE_CREDENCIALES`); la base solo guarda texto cifrado y solo el servidor (service_role) la toca.
 *  · Se lee POR `client_id` (un cliente nunca ve la llave de otro).
 *  · COMPATIBILIDAD: si el cliente no tiene la llave en la base se usa su variable `CLIENTE_<SLUG>_*` de siempre (y se dice de dónde salió).
 *  · NUNCA se imprime, registra ni devuelve un valor: las respuestas dicen qué campos hay, su largo y una huella corta; los errores no llevan la llave (se limpian).
 *  · Cambiar una llave NO borra la vieja: queda retirada con su fecha (`retirada_en`).
 */
import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto'
import type { Db } from './alimentar'
import { credencialesDe, type CredencialesDelCliente } from './brazos/propios'
import { validar, type Respuesta } from './rutas'

type Fila = Record<string, unknown>
const lista = (x: unknown): Fila[] => (Array.isArray(x) ? (x as Fila[]) : [])
const txt = (x: unknown): string => (typeof x === 'string' ? x.trim() : '')
const err = (status: number, error: string, detalle: string): Respuesta => ({ status, body: { error, detalle } })

export const PROVEEDORES = ['loyverse', 'meta'] as const
export type Proveedor = (typeof PROVEEDORES)[number]
/** los campos que acepta cada proveedor (dato): lo que no esté aquí se rechaza */
export const CAMPOS_POR_PROVEEDOR: Readonly<Record<Proveedor, readonly string[]>> = { loyverse: ['token', 'store_id'], meta: ['token', 'ad_account_id', 'ig_user_id'] }
export const VARIABLE_DE_LA_CLAVE = 'PORTERO_CLAVE_DE_CREDENCIALES'
const PREFIJO = 'v1'

/** la clave maestra (32 bytes) desde una variable en base64 o 64 letras hex; `null` si falta o no sirve */
export function claveMaestra(env: Record<string, string | undefined> = process.env): Buffer | null {
  const v = String(env[VARIABLE_DE_LA_CLAVE] ?? '').trim()
  if (!v) return null
  const b = /^[0-9a-f]{64}$/i.test(v) ? Buffer.from(v, 'hex') : Buffer.from(v, 'base64')
  return b.length === 32 ? b : null
}
export function cifrar(valor: string, clave: Buffer): string {
  const iv = randomBytes(12)
  const c = createCipheriv('aes-256-gcm', clave, iv)
  const ct = Buffer.concat([c.update(valor, 'utf8'), c.final()])
  return [PREFIJO, iv.toString('base64'), c.getAuthTag().toString('base64'), ct.toString('base64')].join(':')
}
/** descifra; si la clave no es la de este texto o el texto se tocó, devuelve `null` (nunca lanza con el valor) */
export function descifrar(texto: string, clave: Buffer): string | null {
  const [v, iv, tag, ct] = String(texto).split(':')
  if (v !== PREFIJO || !iv || !tag || !ct) return null
  try {
    const d = createDecipheriv('aes-256-gcm', clave, Buffer.from(iv, 'base64'))
    d.setAuthTag(Buffer.from(tag, 'base64'))
    return Buffer.concat([d.update(Buffer.from(ct, 'base64')), d.final()]).toString('utf8')
  } catch { return null }
}
/** una huella corta (6 letras) para reconocer una llave sin mostrarla */
export const huellaDeLaClave = (valor: string): string => createHash('sha256').update(valor).digest('hex').slice(0, 6)
/** quita cualquier rastro de una llave de un texto (para los errores) */
export const sinLaLlave = (t: string, llaves: string[]): string => llaves.filter((l) => l.length >= 6).reduce((s, l) => s.split(l).join('***'), String(t))

export interface DepsDeCredenciales { db: Db; ahora?: Date; env?: Record<string, string | undefined> }

/**
 * POST { migrar_desde_variables: true, client_id, … } · pasa a la base cifrada las llaves de UN cliente que hoy son variables del servidor (`CLIENTE_<SLUG>_*`).
 * Se hace DENTRO del servidor porque esas variables son «sensibles» (ni la API de Vercel las devuelve): los valores nunca salen de memoria; la respuesta solo dice qué campos y su huella.
 * El cliente se busca por `client_id`; su slug sale de la ficha (`slug` o el nombre). Idempotente: una llave igual a la vigente no se reescribe.
 */
async function migrarDesdeVariables(deps: DepsDeCredenciales, v: { cuerpo: Record<string, unknown>; client_id: string; dry_run: boolean; workflow_id: string; workflow_execution_id: string }): Promise<Respuesta> {
  const cl = await deps.db.from('clients').select('id, name, slug').eq('id', v.client_id).limit(1)
  if (cl.error) return err(502, 'lectura_fallida', `clients: ${cl.error.message}`)
  const ficha = lista(cl.data)[0]
  if (!ficha) return err(404, 'cliente_inexistente', 'no existe la ficha del cliente')
  const env = deps.env ?? process.env
  const slug = txt(ficha.slug) || txt(ficha.name)
  const c = credencialesDe(slug, env)
  const e = (k: string) => { const x = txt(env[c.prefijo + k]); return x || null }
  const porProveedor: Record<Proveedor, Record<string, string>> = {
    loyverse: Object.fromEntries(Object.entries({ token: c.loyverse_token, store_id: e('LOYVERSE_STORE_ID') }).filter(([, x]) => !!x) as Array<[string, string]>),
    meta: Object.fromEntries(Object.entries({ token: c.meta_token, ad_account_id: c.meta_ad_account_id, ig_user_id: c.meta_ig_user_id }).filter(([, x]) => !!x) as Array<[string, string]>),
  }
  const resultado: Array<{ proveedor: string; campos: string[]; estado: string }> = []
  for (const prov of PROVEEDORES) {
    const campos = porProveedor[prov]
    if (!Object.keys(campos).length) { resultado.push({ proveedor: prov, campos: [], estado: 'sin_variables' }); continue }
    const r = await rutaGuardarCredencial(deps, { client_id: v.client_id, proveedor: prov, campos, dry_run: v.dry_run, workflow_id: v.workflow_id, workflow_execution_id: v.workflow_execution_id })
    resultado.push({ proveedor: prov, campos: Object.keys(campos), estado: r.status === 200 ? (v.dry_run ? 'migraría' : 'migrada') : `falló: ${String((r.body as { error?: unknown }).error ?? r.status)}` })
    if (r.status !== 200) return { status: r.status, body: { ok: false, client_id: v.client_id, prefijo: c.prefijo, resultado, error: (r.body as { error?: unknown }).error } }
  }
  return { status: 200, body: { ok: true, dry_run: v.dry_run, client_id: v.client_id, prefijo: c.prefijo, resultado, nota: 'los valores no se devuelven nunca; las variables NO se borran' } }
}

/** POST · guarda (o cambia) campos de un proveedor para UN cliente. La respuesta nunca trae el valor. */
export async function rutaGuardarCredencial(deps: DepsDeCredenciales, cuerpo: unknown): Promise<Respuesta> {
  const v = validar(cuerpo)
  if ('status' in v) return v
  if (v.cuerpo.migrar_desde_variables === true) return migrarDesdeVariables(deps, v)
  const proveedor = txt(v.cuerpo.proveedor).toLowerCase() as Proveedor
  if (!PROVEEDORES.includes(proveedor)) return err(400, 'entrada_invalida', `\`proveedor\` debe ser uno de: ${PROVEEDORES.join(', ')}`)
  const campos = (v.cuerpo.campos && typeof v.cuerpo.campos === 'object' && !Array.isArray(v.cuerpo.campos) ? v.cuerpo.campos : null) as Record<string, unknown> | null
  const nombres = campos ? Object.keys(campos) : []
  if (!campos || !nombres.length) return err(400, 'entrada_invalida', '`campos` es obligatorio: { campo: valor }')
  const malos = nombres.filter((k) => !CAMPOS_POR_PROVEEDOR[proveedor].includes(k) || typeof campos[k] !== 'string' || !String(campos[k]).trim() || String(campos[k]).length > 2000)
  if (malos.length) return err(400, 'entrada_invalida', `campos no válidos para ${proveedor}: ${malos.join(', ')} (válidos: ${CAMPOS_POR_PROVEEDOR[proveedor].join(', ')})`)
  const clave = claveMaestra(deps.env)
  if (!clave) return err(503, 'sin_clave_maestra', `falta la variable del servidor ${VARIABLE_DE_LA_CLAVE} (o no es de 32 bytes): no se guarda ninguna llave`)
  const cl = await deps.db.from('clients').select('id').eq('id', v.client_id).limit(1)
  if (cl.error) return err(502, 'lectura_fallida', `clients: ${cl.error.message}`)
  if (!lista(cl.data).length) return err(404, 'cliente_inexistente', 'no existe la ficha del cliente')
  const ahora = (deps.ahora ?? new Date()).toISOString()
  const valores = nombres.map((k) => String(campos[k]).trim())
  const hecho: Array<{ campo: string; largo: number; huella: string; reemplaza: boolean }> = []
  if (v.dry_run) return { status: 200, body: { ok: true, dry_run: true, client_id: v.client_id, proveedor, campos: nombres, nota: 'dry_run: no se guardó nada' } }
  for (const k of nombres) {
    const valor = String(campos[k]).trim()
    const previa = await deps.db.from('cerebro_credenciales').select('id').eq('client_id', v.client_id).eq('proveedor', proveedor).eq('campo', k).is('retirada_en', null).limit(5)
    if (previa.error) return err(502, 'lectura_fallida', sinLaLlave(`cerebro_credenciales: ${previa.error.message}`, valores))
    const w = await deps.db.from('cerebro_credenciales').insert({ client_id: v.client_id, proveedor, campo: k, valor_cifrado: cifrar(valor, clave), huella: huellaDeLaClave(valor), creado_en: ahora, workflow_id: v.workflow_id || null, workflow_execution_id: v.workflow_execution_id || null })
    if (w.error) return err(502, 'registro_fallido', sinLaLlave(`cerebro_credenciales: ${w.error.message}`, valores))
    for (const p of lista(previa.data)) {
      const u = await deps.db.from('cerebro_credenciales').update({ retirada_en: ahora }).eq('id', String(p.id))
      if (u.error) return err(502, 'retiro_fallido', sinLaLlave(`cerebro_credenciales: ${u.error.message}`, valores))
    }
    hecho.push({ campo: k, largo: valor.length, huella: huellaDeLaClave(valor), reemplaza: lista(previa.data).length > 0 })
  }
  return { status: 200, body: { ok: true, client_id: v.client_id, proveedor, guardados: hecho, nota: 'los valores no se devuelven nunca; la huella reconoce la llave sin mostrarla' } }
}

/** GET · qué llaves tiene un cliente (campos, largo, huella, desde cuándo): jamás el valor */
export async function rutaLeerCredenciales(deps: DepsDeCredenciales, clientId: string): Promise<Respuesta> {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(clientId)) return err(400, 'entrada_invalida', '`client_id` debe ser un uuid')
  const q = await deps.db.from('cerebro_credenciales').select('proveedor, campo, huella, creado_en').eq('client_id', clientId).is('retirada_en', null).limit(100)
  if (q.error) return err(502, 'lectura_fallida', `cerebro_credenciales: ${q.error.message}`)
  return { status: 200, body: { ok: true, client_id: clientId, credenciales: lista(q.data).map((f) => ({ proveedor: txt(f.proveedor), campo: txt(f.campo), huella: txt(f.huella), desde: txt(f.creado_en) })), con_clave_maestra: !!claveMaestra(deps.env) } }
}

export interface CredencialesResueltas extends CredencialesDelCliente {
  /** de dónde salió cada proveedor: `base` (cifrada), `variable` (la de siempre) o `ninguna` */
  origen: { loyverse: 'base' | 'variable' | 'ninguna'; meta: 'base' | 'variable' | 'ninguna' }
  avisos: string[]
}
/**
 * Las llaves de UN cliente para el portero: primero las de la base (cifradas, por `client_id`); lo que falte, de las variables `CLIENTE_<SLUG>_*` de siempre.
 * Una falla de lectura o un texto que no descifra NO tumba al cliente: se usa la variable y se DICE.
 */
export async function credencialesDelCliente(db: Db, clientId: string, slug: string, env: Record<string, string | undefined> = process.env): Promise<CredencialesResueltas> {
  const variable = credencialesDe(slug, env)
  const salida: CredencialesResueltas = { ...variable, origen: { loyverse: variable.loyverse_token ? 'variable' : 'ninguna', meta: variable.meta_token ? 'variable' : 'ninguna' }, avisos: [] }
  const q = await db.from('cerebro_credenciales').select('proveedor, campo, valor_cifrado').eq('client_id', clientId).is('retirada_en', null).limit(100)
  if (q.error) {
    // la tabla puede no existir todavía (migración sin aplicar): sin tabla, todo sigue como antes
    if (!/cerebro_credenciales/.test(String(q.error.message))) salida.avisos.push(`llaves en la base: no se pudieron leer (${String(q.error.message).slice(0, 80)}): se usan las variables de siempre`)
    return salida
  }
  const filas = lista(q.data)
  if (!filas.length) return salida
  const clave = claveMaestra(env)
  if (!clave) { salida.avisos.push(`llaves en la base: falta ${VARIABLE_DE_LA_CLAVE}: se usan las variables de siempre`); return salida }
  const v = (p: Proveedor, campo: string): string | null => { const f = filas.find((x) => x.proveedor === p && x.campo === campo); if (!f) return null; const d = descifrar(String(f.valor_cifrado ?? ''), clave); if (d === null) salida.avisos.push(`llaves en la base: ${p}.${campo} no se pudo descifrar: se usa la variable de siempre`); return d }
  const lt = v('loyverse', 'token')
  if (lt) { salida.loyverse_token = lt; salida.origen.loyverse = 'base' }
  const mt = v('meta', 'token'), ma = v('meta', 'ad_account_id'), mi = v('meta', 'ig_user_id')
  if (mt) { salida.meta_token = mt; salida.origen.meta = 'base' }
  if (ma) salida.meta_ad_account_id = ma
  if (mi) salida.meta_ig_user_id = mi
  salida.faltan = salida.faltan.filter((f) => !((salida.loyverse_token && /LOYVERSE_TOKEN$/.test(f)) || (salida.meta_token && /META_TOKEN$/.test(f)) || ((salida.meta_ad_account_id || salida.meta_ig_user_id) && /META_AD_ACCOUNT_ID o /.test(f))))
  return salida
}
