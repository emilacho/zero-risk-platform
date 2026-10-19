#!/usr/bin/env node
/**
 * VIGÍA DE LA PRUEBA DE PUNTA A PUNTA (CC#2 · noche del 19-oct). Mide cuánto lleva gastado UN cliente de práctica y corta cuando llega al tope.
 *
 *   node scripts/ops/vigia-prueba.mjs --cliente <uuid> --desde <ISO> --tope 10 [--aviso 8] [--intervalo 30] [--una-vez] [--apagar] [--env <ruta .env.local>]
 *
 *  · el gasto = libro de agentes del cliente (`agent_invocations`, desde `--desde`) + el detalle de llamadas de Apify de ESE cliente (`costs`, `service` `apify:…`, `description.tipo = "llamada"`);
 *    lo que gaste el portero u otros clientes NO cuenta;
 *  · `--aviso` (por omisión 80 % del tope) y `--tope`: al pasar el aviso lo dice; al llegar al tope sale con código 20;
 *  · SIN `--apagar` solo mira y muestra qué apagaría (no escribe nada). CON `--apagar`, al llegar al tope cierra el candado del alta y deja apagados finanzas, oficina, revisión y cadena,
 *    lee de vuelta cada interruptor y lista las ejecuciones de n8n en vuelo;
 *  · el libro se escribe al TERMINAR cada llamada: el vigía no puede frenar la que ya está en curso (por eso el aviso va antes del tope).
 *  Códigos de salida: 0 bajo el aviso · 10 sobre el aviso · 20 en el tope (con --apagar: apagado y leído de vuelta) · 4 el apagado no se pudo leer de vuelta · 2 uso/entorno.
 *  Nunca imprime una llave.
 */
import fs from 'node:fs'
import { pathToFileURL } from 'node:url'

/** lo que `--apagar` deja escrito: es el estado «apagado» de cada interruptor (el mismo que usan las herramientas de cada oficina) */
export const INTERRUPTORES_APAGADOS = Object.freeze([
  { nombre: 'finanzas', tabla: 'finanzas_config', filtro: 'id=eq.1', valores: { estado: 'apagada', conversa: 'apagado', preguntas_slack: 'apagado', clientes_ensayo: [] } },
  { nombre: 'oficina', tabla: 'oficina_config', filtro: 'id=eq.1', valores: { estado: 'apagada', familias_activas: [], clientes_ensayo: [] } },
  { nombre: 'revision (jefatura)', tabla: 'jefatura_config', filtro: 'id=eq.1', valores: { estado: 'apagada', tipos_activos: [], clientes_ensayo: [] } },
  { nombre: 'cadena · estado', tabla: 'cadena_config', filtro: 'clave=eq.estado_cadena', valores: { valor: 'apagada' } },
  { nombre: 'cadena · clientes en ensayo', tabla: 'cadena_config', filtro: 'clave=eq.clientes_ensayo', valores: { valor: [] } },
])
export const CLAVE_DEL_CANDADO = 'alta.abierta'
export const valorDelCandadoCerrado = (ahora) => JSON.stringify({ abierta: false, nota: 'CANDADO del alta completa: cerrado por el vigía de la prueba (tope de gasto)', cambiado_en: ahora.toISOString() })

const num = (x) => { const n = Number(x); return Number.isFinite(n) ? n : 0 }
const redondea = (x) => Math.round(x * 1e6) / 1e6

/** suma el libro de agentes (las filas ya vienen filtradas por cliente y fecha) */
export const sumaDeAgentes = (filas) => redondea((filas ?? []).reduce((s, f) => s + num(f?.cost_usd), 0))

/** suma el detalle de llamadas de Apify de UN cliente: solo filas con `description` JSON, `tipo:"llamada"` y ese `client_id` (la fila «del día» no se suma: repite lo que ya cuentan las llamadas) */
export function sumaDeApify(filas, cliente) {
  let total = 0
  for (const f of filas ?? []) {
    let d
    try { d = JSON.parse(String(f?.description ?? '')) } catch { continue }
    if (!d || d.tipo !== 'llamada' || d.client_id !== cliente) continue
    total += num(f.amount_usd_exact ?? f.amount_usd)
  }
  return redondea(total)
}

/** ok (< aviso) · aviso (≥ aviso y < tope) · tope (≥ tope) */
export function evaluar(total, { tope, aviso }) {
  const nivel = total >= tope ? 'tope' : total >= aviso ? 'aviso' : 'ok'
  return { nivel, total, tope, aviso, falta_para_el_tope: redondea(Math.max(0, tope - total)) }
}

export function validarParametros(a) {
  const e = []
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(String(a.cliente ?? ''))) e.push('--cliente debe ser el uuid del cliente')
  if (!a.desde || Number.isNaN(Date.parse(a.desde))) e.push('--desde debe ser una fecha ISO (cuándo empieza la prueba)')
  if (!(Number(a.tope) > 0)) e.push('--tope debe ser un número mayor que 0')
  const aviso = a.aviso === undefined ? Number(a.tope) * 0.8 : Number(a.aviso)
  if (!(aviso > 0) || aviso > Number(a.tope)) e.push('--aviso debe ser mayor que 0 y no pasar del tope')
  return e.length ? { ok: false, errores: e } : { ok: true, cliente: a.cliente, desde: new Date(Date.parse(a.desde)).toISOString(), tope: Number(a.tope), aviso, intervalo: Math.max(5, Number(a.intervalo ?? 30)) }
}

/** una medición: `consultar` trae las filas ya filtradas; devuelve el desglose */
export async function medir(consultar, p) {
  const { agentes, apify } = await consultar(p)
  const a = sumaDeAgentes(agentes), x = sumaDeApify(apify, p.cliente)
  return { agentes: a, apify: x, total: redondea(a + x) }
}

/**
 * Apaga: cierra el candado del alta y deja apagados los interruptores; lee de vuelta cada uno.
 * `rest(metodo, ruta, cuerpo?)` → { status, json }. Devuelve el resumen y si TODO se leyó de vuelta como debe.
 */
export async function ejecutarApagado(rest, ahora = new Date()) {
  const pasos = []
  const candado = await rest('POST', 'settings?on_conflict=key', [{ key: CLAVE_DEL_CANDADO, value: valorDelCandadoCerrado(ahora), category: 'general' }], { Prefer: 'resolution=merge-duplicates,return=minimal' })
  const vuelta = await rest('GET', `settings?select=value&key=eq.${CLAVE_DEL_CANDADO}`)
  let cerrado = false
  try { cerrado = JSON.parse(String((vuelta.json?.[0] ?? {}).value ?? '{}')).abierta === false } catch { cerrado = false }
  pasos.push({ nombre: 'candado del alta', escrito: candado.status < 300, leido_de_vuelta: cerrado })
  for (const i of INTERRUPTORES_APAGADOS) {
    const w = await rest('PATCH', `${i.tabla}?${i.filtro}`, i.valores, { Prefer: 'return=minimal' })
    const r = await rest('GET', `${i.tabla}?select=${Object.keys(i.valores).join(',')}&${i.filtro}`)
    const fila = r.json?.[0]
    const igual = !!fila && Object.entries(i.valores).every(([k, v]) => JSON.stringify(fila[k]) === JSON.stringify(v))
    pasos.push({ nombre: i.nombre, escrito: w.status < 300, leido_de_vuelta: igual })
  }
  return { pasos, todo_apagado: pasos.every((p) => p.escrito && p.leido_de_vuelta) }
}

/** una vuelta del vigía: mide, evalúa y, en el tope, apaga solo si se pidió */
export async function vigilarUnaVez({ consultar, rest, apagar, ahora = () => new Date() }, p) {
  const m = await medir(consultar, p)
  const e = evaluar(m.total, p)
  let apagado = null
  if (e.nivel === 'tope' && apagar) apagado = await ejecutarApagado(rest, ahora())
  const codigo = e.nivel === 'ok' ? 0 : e.nivel === 'aviso' ? 10 : apagado && !apagado.todo_apagado ? 4 : 20
  return { ...m, ...e, apagado, codigo }
}

// ───────────────────────────────────────────────────────── el programa
async function main() {
  const args = process.argv.slice(2)
  const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : undefined }
  const tiene = (n) => args.includes(n)
  const v = validarParametros({ cliente: flag('--cliente'), desde: flag('--desde'), tope: flag('--tope'), aviso: flag('--aviso'), intervalo: flag('--intervalo') })
  if (!v.ok) { console.error('uso: vigia-prueba.mjs --cliente <uuid> --desde <ISO> --tope <US$> [--aviso <US$>] [--intervalo <s>] [--una-vez] [--apagar]\n  - ' + v.errores.join('\n  - ')); process.exit(2) }
  const envPath = flag('--env') ?? 'C:/Users/emili/Documents/Claude/Projects/Agentic Business Agency/zero-risk-platform/.env.local'
  const texto = fs.existsSync(envPath) ? fs.readFileSync(envPath, 'utf8') : ''
  const g = (k) => process.env[k] ?? (texto.match(new RegExp('^' + k + '=(.*)$', 'm')) || [])[1]?.trim().replace(/^["']|["']$/g, '')
  const URL_BASE = g('NEXT_PUBLIC_SUPABASE_URL')?.replace(/\/$/, ''), LLAVE = g('SUPABASE_SERVICE_ROLE_KEY'), N8N = g('N8N_BASE_URL')?.replace(/\/$/, ''), N8N_KEY = g('N8N_API_KEY')
  if (!URL_BASE || !LLAVE) { console.error('faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY'); process.exit(2) }
  const cab = { apikey: LLAVE, Authorization: 'Bearer ' + LLAVE, 'content-type': 'application/json' }
  const rest = async (metodo, ruta, cuerpo, extra = {}) => {
    const r = await fetch(`${URL_BASE}/rest/v1/${ruta}`, { method: metodo, headers: { ...cab, ...extra }, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo) })
    const t = await r.text(); let json = null; try { json = t ? JSON.parse(t) : null } catch { json = null }
    return { status: r.status, json }
  }
  const leer = async (ruta) => { const r = await rest('GET', ruta); if (r.status >= 300 || !Array.isArray(r.json)) throw new Error(`no pude leer ${ruta.split('?')[0]} (${r.status})`); return r.json }
  const consultar = async (p) => ({
    agentes: await leer(`agent_invocations?select=cost_usd&client_id=eq.${p.cliente}&created_at=gte.${encodeURIComponent(p.desde)}&limit=5000`),
    apify: await leer(`costs?select=amount_usd,amount_usd_exact,description&service=like.apify*&created_at=gte.${encodeURIComponent(p.desde)}&limit=5000`),
  })
  const enVuelo = async () => {
    if (!N8N || !N8N_KEY) return null
    const out = []
    for (const s of ['running', 'waiting']) { const r = await fetch(`${N8N}/api/v1/executions?status=${s}&limit=50`, { headers: { 'X-N8N-API-KEY': N8N_KEY } }); const j = await r.json().catch(() => ({})); for (const x of j.data ?? []) out.push(`${s}:${x.workflowId}#${x.id}`) }
    return out
  }
  const hora = () => new Date().toISOString().slice(11, 19)
  let parar = false
  process.on('SIGINT', () => { parar = true })
  for (;;) {
    let res
    try { res = await vigilarUnaVez({ consultar, rest, apagar: tiene('--apagar') }, v) } catch (e) { console.error(hora(), 'ERROR de lectura:', e instanceof Error ? e.message : e); if (tiene('--una-vez')) process.exit(1); await new Promise((r) => setTimeout(r, v.intervalo * 1000)); continue }
    console.log(`${hora()} gasto agentes ${res.agentes.toFixed(4)} + apify ${res.apify.toFixed(4)} = US$ ${res.total.toFixed(4)} · aviso ${v.aviso} · tope ${v.tope} · ${res.nivel.toUpperCase()}`)
    if (res.nivel === 'tope') {
      if (res.apagado) { for (const p of res.apagado.pasos) console.log(`  ${p.escrito && p.leido_de_vuelta ? '✔' : '✗'} ${p.nombre}`); console.log(`  en vuelo en n8n: ${((await enVuelo()) ?? ['(sin acceso a n8n)']).join(', ') || 'ninguna'}`) }
      else console.log('  (sin --apagar: no se escribió nada; con --apagar cerraría el candado del alta y apagaría finanzas, oficina, revisión y cadena)')
      process.exit(res.codigo)
    }
    if (tiene('--una-vez') || parar) process.exit(res.codigo)
    await new Promise((r) => setTimeout(r, v.intervalo * 1000))
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) main().catch((e) => { console.error(String(e)); process.exit(2) })
