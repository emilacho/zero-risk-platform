#!/usr/bin/env node
/**
 * SECO DEL PLAN v3 (V11) · guion ejecutable · CC#1 · 15-oct. SIN `--aplicar` nada escribe; las órdenes de lectura leen. US$ 0: no llama a un modelo, ni a Apify, ni manda Slack.
 *
 *   node scripts/ops/plan-v3-seco.mjs plan                                   la matriz (negocios × casos), las condiciones y los contadores · sin red
 *   node scripts/ops/plan-v3-seco.mjs estado                                 lee: ¿existen las tablas de V1/V13?, ¿está activo el flujo de planeación?, n8n en vuelo
 *   node scripts/ops/plan-v3-seco.mjs condiciones [--cliente <id>]           lee: qué condiciones de CC#3 se cumplen y cuáles NO se pueden comprobar por lectura
 *   node scripts/ops/plan-v3-seco.mjs contadores --clientes a,b --guardar f  foto ANTES · después: --comparar f (debe decir «sin cambios» salvo lo declarado)
 *   node scripts/ops/plan-v3-seco.mjs marcas-v2 --plan <plan-v2-texto.txt> [--datos <dato-v1.json>]   P10 en seco sobre el plan v2 real (conteo por código, criterio de ruido)
 *   node scripts/ops/plan-v3-seco.mjs encender|correr|apagar|limpiar         SE NIEGAN hasta que existan V8/V9 y las migraciones estén aplicadas (lo dice y sale con 3)
 *
 * El seco LOCAL (el camino de datos completo con las piezas reales, reloj y redactor simulados) corre en las pruebas: `npx vitest run __tests__/plan-v3-v11-seco.test.ts`.
 * Variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, N8N_API_KEY, INTERNAL_API_KEY (opcionales N8N_BASE_URL, APP_URL). NUNCA imprime una llave ni lee `SALA_DISPATCH_KEY`.
 */
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { CASOS, CONDICIONES, CONTADORES, NEGOCIOS, celdas, resumenDeLaMatriz } from './plan-v3-seco/matriz.mjs'

const AQUI = path.dirname(fileURLToPath(import.meta.url))
const RAIZ = path.join(AQUI, '..', '..')
const A = process.argv.slice(2)
const orden = A[0]
const flag = (n) => { const i = A.indexOf('--' + n); return i >= 0 ? A[i + 1] : null }

const U = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''), SK = process.env.SUPABASE_SERVICE_ROLE_KEY
const N8N = (process.env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app').replace(/\/$/, ''), NK = process.env.N8N_API_KEY
const APP = (process.env.APP_URL || 'https://zero-risk-platform.vercel.app').replace(/\/$/, '')
const LLAVE = process.env.INTERNAL_API_KEY
const ID_PLANEACION = 'X9F0zp6LQ2xGEYVS'
const necesita = (...ks) => { const f = ks.filter((k) => !process.env[k]); if (f.length) { console.error('faltan variables: ' + f.join(', ')); process.exit(2) } }
const HS = () => ({ apikey: SK, authorization: 'Bearer ' + SK })
const HN = () => ({ 'X-N8N-API-KEY': NK })

async function cuenta(tabla, q = '') {
  const r = await fetch(`${U}/rest/v1/${tabla}?${q}&select=*`, { headers: { ...HS(), prefer: 'count=exact', range: '0-0' } })
  if (r.status === 404) return 'no_existe'
  if (!r.ok) return `error_${r.status}`
  return Number((r.headers.get('content-range') || '').split('/')[1])
}
const existe = (n) => typeof n === 'number'

function textoDeLaMatriz() {
  const r = resumenDeLaMatriz()
  const L = [`MATRIZ · ${r.negocios} negocios × ${r.casos} casos = ${r.celdas} celdas · ${r.corren_hoy} corren hoy (seco local) · ${r.pendientes} pendientes`, '']
  L.push('NEGOCIOS (ficticios, de práctica):')
  for (const n of NEGOCIOS) L.push(`  ${n.id} · ${n.nombre} · ${n.rubro} · ${n.ciudad}, ${n.pais} · ${Object.entries(n.capacidades).filter(([, v]) => v).map(([k]) => k).join(', ')}`)
  L.push('', 'CASOS:')
  for (const c of CASOS) L.push(`  ${c.id.padEnd(4)} ${c.requiere.length ? '⏳ espera ' + c.requiere.join(' + ') + ' · ' : ''}${c.que}`)
  L.push('', 'CONDICIONES antes del primer encendido real:')
  for (const c of CONDICIONES) L.push(`  ${c.id} [${c.sonda}] ${c.texto}`)
  L.push('', 'CONTADORES (antes/después):')
  for (const c of CONTADORES) L.push(`  ${c.tabla} por ${c.por} · ${c.nota}`)
  return L.join('\n')
}

// ───────────────────────────────────────────────────────── P10 en seco sobre el plan v2 (conteo por código)
const ORO_RECONSTRUIDO = [
  // los hechos de la corrida real 175127 que verificó CC#3 (§1 del diseño): NO es la tabla que armará V3/V9 en vivo, es una reconstrucción para contar marcas
  { id: 'D1', tipo_id: 'puntaje_resenas', valor: { numero: 4.8 }, origen: 'medido', estado: 'trajo', alcance: 'cliente' },
  { id: 'D2', tipo_id: 'resenas_total', valor: { numero: 26 }, origen: 'medido', estado: 'trajo', alcance: 'cliente' },
  { id: 'D3', tipo_id: 'visitas_periodo', valor: { numero: 544 }, origen: 'medido', estado: 'trajo', alcance: 'dominio', periodo: { tipo: 'ventana' } },
  { id: 'D4', tipo_id: 'personas_periodo', valor: { numero: 318 }, origen: 'medido', estado: 'trajo', alcance: 'dominio', periodo: { tipo: 'ventana' } },
  { id: 'D5', tipo_id: 'pedidos_enviados', valor: { numero: 3 }, origen: 'medido', estado: 'trajo', alcance: 'dominio', periodo: { tipo: 'ventana' } },
  { id: 'D6', tipo_id: 'anuncios_activos', valor: {}, origen: 'hueco', estado: 'registro_sin_campos', alcance: 'cliente' },
]
function marcasDelPlan(textoPlan, datos) {
  const js = fs.readFileSync(path.join(RAIZ, 'scripts', 'worker-staging', 'planeacion-v3', 'chequeos-p10.js'), 'utf8').split('\r\n').join('\n')
  const { p10Calibrar } = new Function(`${js}\nreturn { p10Calibrar: p10Calibrar }`)()
  const sem = JSON.parse(fs.readFileSync(path.join(RAIZ, 'src', 'lib', 'planeacion', 'catalogo', 'semilla.json'), 'utf8'))
  const lexico = Object.fromEntries(['verificacion', 'ausencia', 'ausencia_excluye', 'supuesto', 'dominio', 'periodo'].map((g) => [g, sem.lexico.filter((l) => l.grupo === g).flatMap((l) => l.terminos)]))
  const base = { identidad: { estado: 'coincide' }, frescura: { estado: 'fresco' }, periodo: { tipo: 'instante' }, derivado: { si: false, de: [] }, contradice: null, marcas: [], medido_en: '2026-10-12' }
  const ds = datos.map((d) => ({ ...base, ...d }))
  return p10Calibrar([{ id: 'plan', texto: textoPlan, datos: ds, op: { lexico, cifras_de_slots: [], tolerancias: { puntaje_resenas: 0.05 } } }])
}

async function main() {
  switch (orden) {
    case 'plan': console.log(textoDeLaMatriz()); return
    case 'estado': {
      necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY')
      const tablas = ['plan_catalogo_fuentes', 'plan_catalogo_tipos', 'plan_catalogo_reglas', 'plan_catalogo_lexico', 'plan_catalogo_topes', 'plan_corridas']
      for (const t of tablas) { const n = await cuenta(t); console.log(`${t.padEnd(24)} ${existe(n) ? n + ' fila(s)' : n}`) }
      if (NK) {
        const f = await fetch(`${N8N}/api/v1/workflows/${ID_PLANEACION}`, { headers: HN() }).then((r) => (r.ok ? r.json() : null)).catch(() => null)
        console.log(`flujo de planeación ${ID_PLANEACION}: ${f ? (f.active ? 'ACTIVO' : 'inactivo') : 'no se pudo leer'}`)
        let n = 0
        for (const st of ['running', 'waiting']) n += ((await fetch(`${N8N}/api/v1/executions?status=${st}&limit=50`, { headers: HN() }).then((r) => r.json()).catch(() => ({}))).data || []).length
        console.log(`ejecuciones en vuelo: ${n}`)
      } else console.log('N8N_API_KEY ausente: no se lee n8n')
      return
    }
    case 'condiciones': {
      necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY')
      const res = []
      const t = await Promise.all(['plan_catalogo_fuentes', 'plan_catalogo_tipos', 'plan_catalogo_reglas', 'plan_catalogo_lexico', 'plan_catalogo_topes'].map((x) => cuenta(x, 'vigente=eq.true')))
      res.push({ id: 'P1', ok: t.every(existe) && t.every((n) => n > 0), detalle: t.join(' / ') })
      const pc = await cuenta('plan_corridas')
      res.push({ id: 'P2', ok: existe(pc), detalle: String(pc) })
      if (LLAVE) {
        const c = await fetch(`${APP}/api/planeacion/catalogo`, { headers: { 'x-api-key': LLAVE } }).catch(() => null)
        const j = c ? await c.json().catch(() => ({})) : {}
        res.push({ id: 'P3', ok: !!c && c.status === 200 && !!j.catalogo_huella, detalle: c ? `HTTP ${c.status}${j.error ? ' ' + j.error : ''}` : 'sin respuesta' })
        const cli = flag('cliente')
        if (cli) {
          const l = await fetch(`${APP}/api/brain/alimentar/listo?client_id=${encodeURIComponent(cli)}`, { headers: { 'x-api-key': LLAVE } }).catch(() => null)
          const lj = l ? await l.json().catch(() => ({})) : {}
          res.push({ id: 'P4', ok: !!l && l.status === 200 && 'completando' in lj && Array.isArray(lj.huecos), detalle: l ? `HTTP ${l.status} · claves: ${Object.keys(lj).join(',')}` : 'sin respuesta' })
          const cfg = await fetch(`${U}/rest/v1/clients?id=eq.${encodeURIComponent(cli)}&select=config`, { headers: HS() }).then((r) => r.json()).catch(() => [])
          const cap = cfg?.[0]?.config?.spend_cap_usd
          res.push({ id: 'P9', ok: typeof cap === 'number' && cap >= 4, detalle: `spend_cap_usd=${cap ?? 'no declarado'} (se sube solo para la corrida real y se devuelve)` })
        } else res.push({ id: 'P4', ok: null, detalle: 'pasa --cliente <id> para probar la señal' }, { id: 'P9', ok: null, detalle: 'pasa --cliente <id>' })
      } else res.push({ id: 'P3', ok: null, detalle: 'INTERNAL_API_KEY ausente' }, { id: 'P4', ok: null, detalle: 'INTERNAL_API_KEY ausente' })
      for (const c of CONDICIONES) {
        const r = res.find((x) => x.id === c.id)
        const marca = r ? (r.ok === true ? '✅' : r.ok === false ? '❌' : '❔') : '🔒'
        console.log(`${marca} ${c.id} ${c.texto}${r ? ' · ' + r.detalle : ' · NO se puede comprobar por lectura externa: lo certifica CC#3'}`)
      }
      return
    }
    case 'contadores': {
      necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY')
      const ids = (flag('clientes') || '').split(',').map((s) => s.trim()).filter(Boolean)
      if (!ids.length) { console.error('pasa --clientes id1,id2'); process.exit(2) }
      const foto = {}
      for (const t of CONTADORES) for (const id of ids) foto[`${t.tabla}|${id}`] = await cuenta(t.tabla, `client_id=eq.${encodeURIComponent(id)}`)
      const cmp = flag('comparar'), gua = flag('guardar')
      if (gua) { fs.writeFileSync(gua, JSON.stringify({ en: new Date().toISOString(), foto }, null, 2)); console.log(`foto guardada en ${gua} (${Object.keys(foto).length} contadores)`) }
      if (cmp) {
        const antes = JSON.parse(fs.readFileSync(cmp, 'utf8')).foto
        const cambios = Object.keys(foto).filter((k) => antes[k] !== foto[k])
        console.log(cambios.length ? 'CAMBIARON:\n' + cambios.map((k) => `  ${k}: ${antes[k]} → ${foto[k]}`).join('\n') : 'sin cambios en ningún contador')
        process.exitCode = cambios.length ? 1 : 0
      }
      if (!gua && !cmp) console.log(JSON.stringify(foto, null, 2))
      return
    }
    case 'marcas-v2': {
      const p = flag('plan')
      if (!p) { console.error('pasa --plan <archivo.txt>'); process.exit(2) }
      const texto = fs.readFileSync(p, 'utf8')
      const datos = flag('datos') ? JSON.parse(fs.readFileSync(flag('datos'), 'utf8')) : ORO_RECONSTRUIDO
      const r = marcasDelPlan(texto, datos)
      const c = r.casos[0]
      const tipos = c.codigos_altos.length
      console.log(JSON.stringify({
        plan: path.basename(p), caracteres: texto.length, datos: datos.length,
        tabla: flag('datos') ? 'la del archivo' : 'oro RECONSTRUIDO de los hechos del §1 (no la tabla de V3/V9)',
        por_codigo: c.por_codigo, tipos_de_marca_altas: c.codigos_altos, n_tipos: tipos, ejemplos_altos: c.altas, leves: c.leves,
        criterio_v2_2_a_6_tipos: tipos >= 2 && tipos <= 6,
        lectura: 'el plan v2 NO cita nada: cada «(Fuente: …)», cada «verificada» y cada cifra sin [D#] es una marca real por regla; el diseño cuenta TIPOS (2–6). El criterio de ruido (≥ 15 altas) se mide sobre un plan que CITA (v3 ≤ 3), no sobre v2.',
      }, null, 2))
      return
    }
    case 'encender': case 'correr': case 'apagar': case 'limpiar': {
      console.error(`«${orden}» se NIEGA: el plan v3 no puede correrse de punta a punta todavía.`)
      console.error('Falta: V8 (pre-vuelo con cupo y espera reanudable) y V9 (nodos de n8n) construidos y certificados, V1 y V13 aplicadas con respaldo,')
      console.error('       `solo_portero` en `gastoDeHoy` fusionado, el contrato `cerebro_listo` con `completando` y `huecos[]`, y el «dale» de Emilio para la corrida real.')
      console.error('El seco LOCAL ya corre en las pruebas: npx vitest run __tests__/plan-v3-v11-seco.test.ts')
      process.exit(3)
    }
    default:
      console.error('órdenes: plan · estado · condiciones · contadores · marcas-v2 · encender|correr|apagar|limpiar (se niegan)')
      process.exit(2)
  }
}
main().catch((e) => { console.error('error:', e instanceof Error ? e.message : String(e)); process.exit(1) })
