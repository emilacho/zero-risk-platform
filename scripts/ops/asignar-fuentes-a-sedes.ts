/**
 * Asigna las fuentes de un cliente a sus sedes y fija el canal de cada sede (dato por cliente, en `clients.config.apify`), y reasigna a su sede las fichas ya guardadas
 * (versiona y retira con motivo: nada se borra). Agnóstico: lo que va a la config sale de un archivo que se pasa por argumento; nada de un cliente va en el código.
 *
 *   --cliente=<uuid>          (obligatorio)
 *   --datos=<archivo.json>    { "canal_por_sede": { "<clave>": "local|solo_entrega|ambos|sin_local" }, "fuentes_por_sede": { "sitio_web": "<clave>", "punto_de_venta": { "<tienda>": "<clave>" }, … } }
 *   --motivo="…"              el motivo que queda en cada ficha retirada
 *   --escribir                sin esto es EN SECO (imprime lo que haría y no escribe nada)
 *   --respaldo=<carpeta>      dónde dejar la copia de la config y la lista de fichas reasignadas (por omisión, la carpeta actual)
 * US$ 0. Solo escribe `clients.config.apify.{canal_por_sede,fuentes_por_sede}` y versiones en `cerebro_fichas`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { createClient } from '@supabase/supabase-js'
import { reasignarFichasASusSedes } from '../../src/lib/portero-alimenta/reasignar-sedes'
import { CANALES, TIPOS_DE_FUENTE } from '../../src/lib/portero-alimenta/sedes-fuentes'

const envTxt = fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8')
const g = (k: string) => (envTxt.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const arg = (n: string): string | undefined => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)
type Obj = Record<string, unknown>
const obj = (x: unknown): Obj => (x && typeof x === 'object' && !Array.isArray(x) ? (x as Obj) : {})

async function main() {
  const cliente = arg('cliente') ?? ''
  if (!/^[0-9a-f-]{36}$/.test(cliente)) throw new Error('falta --cliente=<uuid>')
  const archivo = arg('datos')
  if (!archivo) throw new Error('falta --datos=<archivo.json>')
  const escribir = process.argv.includes('--escribir')
  const motivo = arg('motivo') ?? 'la fuente de la ficha está asignada a esa sede'
  const carpeta = arg('respaldo') ?? process.cwd()
  const datos = obj(JSON.parse(fs.readFileSync(archivo, 'utf8')))

  const db = createClient(g('NEXT_PUBLIC_SUPABASE_URL')!, g('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const c = await db.from('clients').select('id, name, config').eq('id', cliente).limit(1)
  const ficha = (c.data ?? [])[0] as { id: string; name: string; config: Obj | null } | undefined
  if (!ficha) throw new Error('no encuentro la ficha del cliente')
  const sq = await db.from('client_sedes').select('clave').eq('client_id', cliente)
  if (sq.error) throw new Error(`client_sedes: ${sq.error.message}`)
  const claves = ((sq.data ?? []) as Array<{ clave: string }>).map((s) => s.clave)

  // validación: lo que se escribe solo habla de sedes que existen, de canales de la lista y de tipos de fuente conocidos
  const errores: string[] = []
  const canal = obj(datos.canal_por_sede)
  for (const [k, v] of Object.entries(canal)) {
    if (!claves.includes(k)) errores.push(`canal_por_sede: «${k}» no es una sede del cliente (${claves.join(', ')})`)
    if (!(CANALES as readonly string[]).includes(String(v))) errores.push(`canal_por_sede.${k}: «${String(v)}» no es un canal (${CANALES.join(', ')})`)
  }
  const fuentes = obj(datos.fuentes_por_sede)
  const claveDe = (v: unknown): string[] => (typeof v === 'string' ? [v] : Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])
  for (const [tipo, asign] of Object.entries(fuentes)) {
    if (!(TIPOS_DE_FUENTE as readonly string[]).includes(tipo)) errores.push(`fuentes_por_sede: «${tipo}» no es un tipo de fuente (${TIPOS_DE_FUENTE.join(', ')})`)
    const destinos = asign && typeof asign === 'object' && !Array.isArray(asign) ? Object.values(obj(asign)).flatMap(claveDe) : claveDe(asign)
    for (const d of destinos) if (d !== '*' && d.toLowerCase() !== 'todas' && !claves.includes(d)) errores.push(`fuentes_por_sede.${tipo}: «${d}» no es una sede del cliente`)
  }
  if (errores.length) throw new Error(errores.join(' · '))

  const antes = obj(obj(ficha.config).apify)
  const apify = { ...antes, ...(Object.keys(canal).length ? { canal_por_sede: { ...obj(antes.canal_por_sede), ...canal } } : {}), ...(Object.keys(fuentes).length ? { fuentes_por_sede: { ...obj(antes.fuentes_por_sede), ...fuentes } } : {}) }
  const config = { ...obj(ficha.config), apify }
  const ahora = new Date()

  const seco = await reasignarFichasASusSedes({ db: db as never, client_id: cliente, config, clavesDeSedes: claves, ahora, dry_run: true, motivo })
  const porTipo: Record<string, number> = {}
  for (const x of seco.plan.reasignar) { const k = `${x.tipo}${x.detalle ? ` (${x.detalle})` : ''} → ${x.a.join(',')}`; porTipo[k] = (porTipo[k] ?? 0) + 1 }
  console.log(JSON.stringify({ modo: escribir ? 'ESCRIBE' : 'seco', cliente: ficha.name, sedes: claves, config_nueva: { canal_por_sede: apify.canal_por_sede ?? null, fuentes_por_sede: apify.fuentes_por_sede ?? null }, fichas: { a_reasignar: seco.plan.reasignar.length, por_destino: porTipo, ya_en_su_sede: seco.plan.ya_en_su_sede, sin_asignacion: seco.plan.sin_asignacion, no_aplica: seco.plan.no_aplica }, declarado: seco.plan.declarado, errores: seco.errores }, null, 1))
  if (!escribir || seco.errores.length) return

  fs.mkdirSync(carpeta, { recursive: true })
  const dia = ahora.toISOString().slice(0, 19).replace(/[:T]/g, '-')
  fs.writeFileSync(path.join(carpeta, `respaldo-config-${cliente.slice(0, 8)}-antes-de-sedes-${dia}.json`), JSON.stringify(ficha.config, null, 1))
  fs.writeFileSync(path.join(carpeta, `fichas-reasignadas-${cliente.slice(0, 8)}-${dia}.json`), JSON.stringify(seco.plan.reasignar, null, 1))
  const u = await db.from('clients').update({ config }).eq('id', cliente).select('id')
  if (u.error) throw new Error(`no pude guardar la config: ${u.error.message}`)
  console.log('config guardada (canal_por_sede y fuentes_por_sede)')
  const real = await reasignarFichasASusSedes({ db: db as never, client_id: cliente, config, clavesDeSedes: claves, ahora, dry_run: false, motivo })
  console.log(JSON.stringify({ escritas: real.escritas, retiradas: real.retiradas, errores: real.errores }))
  if (real.errores.length) process.exitCode = 1
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 400)); process.exit(1) })
