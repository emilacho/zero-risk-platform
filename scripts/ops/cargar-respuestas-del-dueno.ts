/**
 * Carga respuestas del dueño por la MISMA entrada que usarán las oficinas (`rutaDueno`), en proceso y con la llave de servicio. Agnóstico: el cliente y las respuestas salen de un archivo.
 *   --cliente=<uuid>  --datos=<archivo.json>  [--escribir]   (sin --escribir: en seco, no guarda nada)
 * El archivo: { "canal": "...", "respondido_en": "ISO", "preguntado_por": { "oficina": "...", "agente": "..." }, "respuestas": [ { "tema", "pregunta", "respuesta", "sede_clave"?, "mensaje_ref"? } ] }
 * US$ 0, sin modelo. Una respuesta ya cargada (mismo mensaje) no se duplica.
 */
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { rutaDueno } from '../../src/lib/portero-alimenta/dueno'

const t = fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8')
const g = (k: string) => (t.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
const arg = (n: string): string | undefined => process.argv.find((a) => a.startsWith(`--${n}=`))?.slice(n.length + 3)

async function main() {
  const cliente = arg('cliente') ?? '', archivo = arg('datos')
  if (!/^[0-9a-f-]{36}$/.test(cliente) || !archivo) throw new Error('faltan --cliente=<uuid> y --datos=<archivo.json>')
  const d = JSON.parse(fs.readFileSync(archivo, 'utf8')) as { canal: string; respondido_en: string; preguntado_por: { oficina: string; agente: string }; respuestas: Array<Record<string, string>> }
  const real = process.argv.includes('--escribir')
  const db = createClient(g('NEXT_PUBLIC_SUPABASE_URL')!, g('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } })
  const salida: unknown[] = []
  for (const r of d.respuestas) {
    const x = await rutaDueno({ db: db as never, interruptores: { alimentar: true } as never, activo: true }, { client_id: cliente, dry_run: !real, workflow_id: 'cc-cerebro-carga-del-dueno', workflow_execution_id: new Date().toISOString(), canal: d.canal, respondido_en: d.respondido_en, preguntado_por: d.preguntado_por, ...r })
    salida.push({ tema: r.tema, sede: r.sede_clave ?? null, status: x.status, resultado: x.body.guardada ? 'guardada' : x.body.repetida ? 'ya estaba' : x.body.dry_run ? 'seco' : x.body.error, reemplaza: x.body.reemplaza ?? null, ficha_id: x.body.ficha_id ?? null })
    if (x.status !== 200) process.exitCode = 1
  }
  console.log(JSON.stringify({ modo: real ? 'ESCRIBE' : 'seco', canal: d.canal, respuestas: salida }, null, 1))
}
main().catch((e) => { console.error(String(e?.message ?? e).slice(0, 300)); process.exit(1) })
