/**
 * El resumen vivo contra datos REALES de un cliente (15-oct · encargo «umbral y resumen vivo»). Sin modelo: US$ 0.
 *   npx tsx scripts/ops/resumen-vivo-real.ts <client_id> seco   → arma el resumen con las fichas reales y lo muestra (NO escribe nada)
 *   npx tsx scripts/ops/resumen-vivo-real.ts <client_id> real   → lo escribe como lo haría la corrida diaria (una ficha `resumen_vivo`) y lo lee con `leerResumenVivo`
 * El texto armado sale a pantalla porque solo contiene fichas del propio cliente (cada línea con su cita).
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { archivarFichasDeBrazos } from '../../src/lib/portero-alimenta/brazos/archivo'
import { cargarEntradaDelResumen, fichasDeResumen, leerResumenVivo } from '../../src/lib/portero-alimenta/resumen-vivo'
import { auditarCitasDelResumen } from '../../src/lib/portero-alimenta/auditoria'

const env = fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8')
const g = (k: string) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const db = createClient(g('NEXT_PUBLIC_SUPABASE_URL')!, g('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })

async function main() {
  const cliente = process.argv[2]
  const modo = process.argv[3] === 'real' ? 'real' : 'seco'
  const c = await db.from('clients').select('id, name, industry, country, market').eq('id', cliente).limit(1)
  const fila = (c.data ?? [])[0] as Record<string, unknown> | undefined
  if (!fila) throw new Error('cliente inexistente')
  const sd = await db.from('client_sedes').select('ciudad, clave').eq('client_id', cliente)
  const ahora = new Date()
  const ent = await cargarEntradaDelResumen(db as never, { client_id: cliente, nombre: String(fila.name ?? ''), rubro: (fila.industry as string | null) ?? null, ahora, zonas: [], sedes: ((sd.data ?? []) as Array<Record<string, unknown>>).map((s) => ({ clave: String(s.clave ?? ''), ciudad: (s.ciudad as string | null) ?? null })).filter((s) => s.clave) })
  if (!ent.ok) throw new Error(ent.detalle)
  const sal = fichasDeResumen(ent.entrada)
  console.log('FICHAS_LEIDAS', ent.entrada.fichas.length, 'SEDES', ent.entrada.sedes.length)
  console.log('SECCIONES', JSON.stringify(sal.secciones), 'HUECOS', JSON.stringify(sal.huecos))
  console.log('LARGO_CHARS', sal.cliente.contenido.length, 'TOKENS_APROX', Math.round(sal.cliente.contenido.length / 3.5), 'SEDES_CON_RESUMEN', sal.sedes.length)
  console.log('----- TEXTO -----\n' + sal.cliente.contenido + '\n-----------------')
  if (modo === 'seco') return
  const ar = await archivarFichasDeBrazos({ db: db as never, fichas: [sal.cliente, ...sal.sedes], ahora, dry_run: false, workflow_id: 'ogfq56oIEoHufFPM', workflow_execution_id: `verif-resumen-${ahora.toISOString()}` })
  console.log('ARCHIVO', JSON.stringify({ escritas: ar.escritas, iguales: ar.iguales, retiradas: ar.retiradas, errores: ar.errores }))
  const l = await leerResumenVivo(db as never, cliente)
  console.log('LEIDO', l.ok ? JSON.stringify({ titulo: l.cliente?.titulo, largo: l.cliente?.contenido.length, observado_en: l.cliente?.observado_en, sedes: l.sedes.length, igual_al_armado: l.cliente?.contenido === sal.cliente.contenido }) : l.detalle)
  const a = await auditarCitasDelResumen(db as never, cliente)
  console.log('CITAS', JSON.stringify(a))
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1) })
