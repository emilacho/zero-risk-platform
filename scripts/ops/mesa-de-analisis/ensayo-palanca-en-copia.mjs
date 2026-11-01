// ENSAYO EN COPIA de la migración 202611011700 (palanca de la mesa de análisis ENCENDIDA solo para el cliente de práctica) y su reversa.
// Postgres en memoria (PGlite) · US$ 0 · sin red · NO toca producción. Repetible por cualquier CC (pedido de CC3 · certificación #797).
//
// Cómo correrlo (una sola dependencia, fuera del package.json del proyecto):
//   cd scripts/ops/mesa-de-analisis && npm i --no-save @electric-sql/pglite && node ensayo-palanca-en-copia.mjs
// La tabla cadena_config se crea con su estructura real (clave text PK · valor jsonb · actualizado_en timestamptz default now())
// y clients con el CHECK real de status (onboarding/active/paused/churned). El piloto se siembra en `onboarding`, como está en la base (prevuelo CC3 01-nov).
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const RAIZ = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
const M = '202611011700_mesa_de_analisis_palanca_encendida_cliente_piloto'
const leerMig = (p) => readFileSync(join(RAIZ, p), 'utf8').replace(/\r/g, '').replace(/^NOTIFY .*$/gm, '')
const MIG = leerMig(`supabase/migrations/${M}.sql`)
const REV = leerMig(`supabase/reversas/${M}_REVERSA.sql`)
const PILOTO = MIG.match(/'([0-9a-f-]{36})'/)[1]
const OTRO = '11111111-1111-4111-8111-111111111111'
const db = new PGlite()
const run = async (q) => { try { await db.exec(q) } catch (e) { throw new Error(`${e.message}\n  en: ${q.slice(0, 300)}`) } }
let fallas = 0
const esperar = (cond, msg) => { if (!cond) { fallas++; console.log('❌', msg) } else console.log('  ✔', msg) }
const palanca = async () => (await db.query(`SELECT valor FROM public.cadena_config WHERE clave = 'mesa_de_analisis'`)).rows[0]?.valor ?? null
const aplicar = async (sql) => { try { await db.exec(sql); return null } catch (e) { await db.exec('ROLLBACK;').catch(() => {}); return e.message.split('\n')[0] } }
const APAGADA = { encendida: false, clientes: [] }
const ENCENDIDA = { encendida: true, clientes: [PILOTO] }
// jsonb reordena las claves: se compara campo a campo
const igual = (a, b) => !!a && !!b && a.encendida === b.encendida && JSON.stringify(a.clientes) === JSON.stringify(b.clientes) && Object.keys(a).length === Object.keys(b).length
const sembrar = async (v) => run(`UPDATE public.cadena_config SET valor = '${JSON.stringify(v)}'::jsonb WHERE clave = 'mesa_de_analisis';`)

await run(`CREATE TABLE public.cadena_config (clave text PRIMARY KEY, valor jsonb NOT NULL, actualizado_en timestamptz NOT NULL DEFAULT now());`)
await run(`CREATE TABLE public.clients (id uuid PRIMARY KEY, status text NOT NULL CHECK (status IN ('onboarding','active','paused','churned')));`)
await run(`INSERT INTO public.clients (id, status) VALUES ('${PILOTO}', 'onboarding'), ('${OTRO}', 'active');`)
await run(`INSERT INTO public.cadena_config (clave, valor) VALUES ('planeacion', '{"redactor": "jefe-marketing"}'::jsonb);`)
console.log(`copia lista · piloto ${PILOTO.slice(0, 8)}… en onboarding · sin palanca todavía`)

esperar(/no existe la palanca/.test(await aplicar(MIG) ?? ''), 'sin la fila de 1500: la migración se NIEGA')
await run(`INSERT INTO public.cadena_config (clave, valor) VALUES ('mesa_de_analisis', '${JSON.stringify(APAGADA)}'::jsonb);`)
esperar(igual(await palanca(), APAGADA), 'sembrada la palanca como en producción: APAGADA')
esperar((await aplicar(MIG)) === null && igual(await palanca(), ENCENDIDA), 'aplica: ENCENDIDA solo para el piloto (en onboarding)')
esperar((await db.query(`SELECT valor FROM public.cadena_config WHERE clave = 'planeacion'`)).rows[0].valor.redactor === 'jefe-marketing', 'las otras claves de cadena_config: intactas')
esperar((await aplicar(MIG)) === null && igual(await palanca(), ENCENDIDA), 'segunda pasada: nada cambia (idempotente)')
esperar((await aplicar(REV)) === null && igual(await palanca(), APAGADA), 'reversa: vuelve a APAGADA')
esperar((await aplicar(REV)) === null && igual(await palanca(), APAGADA), 'reversa dos veces: nada cambia')
await sembrar({ encendida: true, clientes: [OTRO] })
esperar(/se decide a mano/.test(await aplicar(MIG) ?? ''), 'encendida para OTRO cliente: la migración se NIEGA')
esperar(/se decide a mano/.test(await aplicar(REV) ?? ''), 'encendida para OTRO cliente: la reversa se NIEGA')
esperar((await palanca()).clientes[0] === OTRO, 'y el valor ajeno sigue intacto')
await sembrar({ encendida: true, clientes: [PILOTO, OTRO] })
esperar(/se decide a mano/.test(await aplicar(REV) ?? ''), 'piloto + otro: la reversa se NIEGA')
await sembrar({ encendida: false, clientes: [PILOTO] })
esperar(/se decide a mano/.test(await aplicar(MIG) ?? ''), 'apagada pero con lista: la migración se NIEGA')
await sembrar(APAGADA)
for (const st of ['paused', 'churned']) {
  await run(`UPDATE public.clients SET status = '${st}' WHERE id = '${PILOTO}';`)
  esperar(/no es onboarding\/active/.test(await aplicar(MIG) ?? '') && igual(await palanca(), APAGADA), `piloto '${st}': la migración se NIEGA y sigue apagada`)
}
for (const st of ['active', 'onboarding']) {
  await run(`UPDATE public.clients SET status = '${st}' WHERE id = '${PILOTO}';`)
  esperar((await aplicar(MIG)) === null && igual(await palanca(), ENCENDIDA), `piloto '${st}': aplica`)
  esperar((await aplicar(REV)) === null && igual(await palanca(), APAGADA), '  y la reversa vuelve a APAGADA')
}
await run(`DELETE FROM public.clients WHERE id = '${PILOTO}';`)
esperar(/no existe o su status/.test(await aplicar(MIG) ?? '') && igual(await palanca(), APAGADA), 'piloto inexistente: la migración se NIEGA y sigue apagada')
console.log(fallas ? `\n❌ ENSAYO ROJO · ${fallas} falla(s)` : '\nENSAYO VERDE · 202611011700 + reversa')
process.exit(fallas ? 1 : 0)
