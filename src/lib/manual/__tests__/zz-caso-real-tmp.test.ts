import { it } from 'vitest'
import fs from 'node:fs'
import { createClient } from '@supabase/supabase-js'
import { leerInsumos } from '../revision'
import { recomprobar } from '../firmes'
import { evaluarHechos } from '../hechos'
const env = fs.readFileSync('C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local', 'utf8')
const g = (k: string) => (env.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
it('caso real', async () => {
  const db = createClient(g('NEXT_PUBLIC_SUPABASE_URL')!, g('SUPABASE_SERVICE_ROLE_KEY')!)
  const r = await leerInsumos(db as never, '96864e88-79bc-47ff-8f8e-5bf88610ec7d')
  if (!r.ok) throw new Error(JSON.stringify(r))
  const ins = r.insumos
  const inf = evaluarHechos({ manual: ins.manual, fuentes: ins.fuentes, dudas: ins.dudas })
  const rc = recomprobar(ins.manual, ins.manual, { fuentes: ins.fuentes, dudas: ins.dudas })
  const out = { filas: ins.filas_leidas, fuentes: ins.fuentes.length, resumen: inf.resumen, sin_respaldo: inf.sin_respaldo.map((h) => ({ ruta: h.ruta, estado: h.estado, clausula: h.clausula })), retirados: rc.retirados, cambios: rc.cambios.length, limpio: rc.limpio,
    antes_pos: String(ins.manual.positioning ?? '').slice(0, 600), despues_pos: String(rc.manual.positioning ?? '').slice(0, 600),
    olon_antes: JSON.stringify(ins.manual).match(/Olón/g)?.length, olon_despues: JSON.stringify(rc.manual).match(/Olón/g)?.length,
    origen_antes: JSON.stringify(ins.manual).match(/origen/gi)?.length, origen_despues: JSON.stringify(rc.manual).match(/origen/gi)?.length }
  fs.writeFileSync('C:/Users/emili/OneDrive/Documents/zr-vault/raw/evidencia/2026-10-10-CC1-prueba-tramo-1/arranque/r62-caso-real-antes.json', JSON.stringify({ ...out, manual_despues: rc.manual }, null, 1))
  console.log(JSON.stringify(out, null, 1))
}, 60000)
