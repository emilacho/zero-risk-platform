/**
 * Migra las llaves de un cliente de sus variables de Vercel (`CLIENTE_<SLUG>_*`) a la base cifrada (`cerebro_credenciales`), SIN mostrar ni escribir ningún valor (todo viaja en memoria; solo se imprime
 * qué campos y su huella de 6 letras). Las variables NO se borran (compatibilidad mientras tanto). Agnóstico: el cliente y su slug van por argumento.
 *
 *   --cliente=<uuid> --slug=<slug>      (obligatorios)
 *   --crear-clave                       crea la clave maestra del servidor (`PORTERO_CLAVE_DE_CREDENCIALES`, 32 bytes al azar) en Vercel si no existe; el valor nunca se imprime. Luego hace falta publicar.
 *   --escribir                          sin esto es EN SECO (dice qué migraría)
 * La clave maestra se lee de Vercel (la misma que usará el servidor). US$ 0.
 */
import fs from 'node:fs'
import { randomBytes } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { CAMPOS_POR_PROVEEDOR, PROVEEDORES, VARIABLE_DE_LA_CLAVE, claveMaestra, huellaDeLaClave, rutaGuardarCredencial } from '../../src/lib/portero-alimenta/credenciales'
import { slugDe } from '../../src/lib/portero-alimenta/brazos/tipos'

const envTxt = fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8')
const g = (k: string) => (envTxt.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const arg = (n: string): string | undefined => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
const H = { Authorization: 'Bearer ' + g('VERCEL_TOKEN'), 'Content-Type': 'application/json' }
const api = async (m: string, p: string, body?: unknown) => { const r = await fetch('https://api.vercel.com' + p, { method: m, headers: H, body: body ? JSON.stringify(body) : undefined }); return { s: r.status, j: (await r.json().catch(() => ({}))) as any } } // eslint-disable-line @typescript-eslint/no-explicit-any

async function main() {
  const cliente = arg('cliente') ?? '', slug = arg('slug') ?? ''
  if (!/^[0-9a-f-]{36}$/.test(cliente) || !slug) throw new Error('faltan --cliente=<uuid> y --slug=<slug>')
  const escribir = process.argv.includes('--escribir')
  const P = (await api('GET', '/v9/projects?limit=100')).j.projects.find((p: { name: string }) => p.name === 'zero-risk-platform')
  const q = '?teamId=' + P.accountId
  const lista = (await api('GET', `/v9/projects/${P.id}/env${q}`)).j.envs as Array<{ id: string; key: string }>
  const valor = async (clave: string): Promise<string | null> => { const e = lista.find((x) => x.key === clave); if (!e) return null; const v = (await api('GET', `/v1/projects/${P.id}/env/${e.id}${q}`)).j.value; return typeof v === 'string' && v ? v : null }

  if (process.argv.includes('--crear-clave') && !lista.find((x) => x.key === VARIABLE_DE_LA_CLAVE)) {
    if (!escribir) console.log(`seco: crearía ${VARIABLE_DE_LA_CLAVE} (32 bytes al azar, tipo encrypted, producción)`)
    else { const r = await api('POST', `/v10/projects/${P.id}/env${q}`, { key: VARIABLE_DE_LA_CLAVE, value: randomBytes(32).toString('hex'), type: 'encrypted', target: ['production'] }); console.log(`${VARIABLE_DE_LA_CLAVE} creada: HTTP ${r.s} (hace falta publicar para que el servidor la vea)`); if (r.s >= 300) throw new Error('no pude crear la clave maestra') }
    lista.push(...((await api('GET', `/v9/projects/${P.id}/env${q}`)).j.envs as Array<{ id: string; key: string }>).filter((x) => x.key === VARIABLE_DE_LA_CLAVE && !lista.find((y) => y.id === x.id)))
  }
  const maestra = await valor(VARIABLE_DE_LA_CLAVE)
  const prefijo = `CLIENTE_${slugDe(slug).toUpperCase().replace(/-/g, '_')}_`
  const plan: Array<{ proveedor: string; campo: string; huella: string; variable: string }> = []
  const campos: Record<string, Record<string, string>> = {}
  for (const prov of PROVEEDORES) for (const campo of CAMPOS_POR_PROVEEDOR[prov]) {
    const variable = `${prefijo}${prov.toUpperCase()}_${campo.toUpperCase()}`
    const v = await valor(variable)
    if (!v) continue
    ;(campos[prov] ??= {})[campo] = v
    plan.push({ proveedor: prov, campo, huella: huellaDeLaClave(v), variable })
  }
  console.log(JSON.stringify({ modo: escribir ? 'ESCRIBE' : 'seco', cliente, clave_maestra_en_vercel: !!maestra, variables_encontradas: plan }, null, 1))
  if (!escribir) return
  if (!maestra || !claveMaestra({ [VARIABLE_DE_LA_CLAVE]: maestra })) throw new Error(`falta ${VARIABLE_DE_LA_CLAVE} en Vercel (usa --crear-clave)`)
  const db = createClient(g('NEXT_PUBLIC_SUPABASE_URL')!, g('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const hechos: unknown[] = []
  for (const [proveedor, cs] of Object.entries(campos)) {
    const r = await rutaGuardarCredencial({ db: db as never, env: { [VARIABLE_DE_LA_CLAVE]: maestra } }, { client_id: cliente, dry_run: false, workflow_id: 'cc-cerebro-migrar-credenciales', workflow_execution_id: new Date().toISOString(), proveedor, campos: cs })
    hechos.push({ proveedor, status: r.status, guardados: r.status === 200 ? (r.body.guardados as unknown[]) : r.body.error })
    if (r.status !== 200) process.exitCode = 1
  }
  console.log(JSON.stringify({ migrado: hechos, nota: 'los valores no se imprimieron; las variables CLIENTE_* siguen en Vercel (compatibilidad)' }, null, 1))
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 200)); process.exit(1) })
