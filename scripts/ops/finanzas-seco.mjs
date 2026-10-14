#!/usr/bin/env node
/**
 * SECO DE LA OFICINA FINANCIERA (de punta a punta) · guion ejecutable · CC#2 · 14-oct. SIN `--aplicar` cada orden solo IMPRIME lo que haría (y las de lectura leen). US$ 0: todo es `dry_run: true`,
 * los agentes son SIMULADOS (el guion de cada celda), ningún mensaje sale a Slack y ningún proveedor de modelos se llama. Entra por la ruta con la llave INTERNAL; NUNCA lee ni pide `SALA_DISPATCH_KEY`.
 *
 *   node scripts/ops/finanzas-seco.mjs plan                              la matriz (negocios × registros × casos), los interruptores y las condiciones · sin red
 *   node scripts/ops/finanzas-seco.mjs estado                            lee: finanzas_config, el flujo `finanzas · conversa`, n8n en vuelo y los contadores
 *   node scripts/ops/finanzas-seco.mjs condiciones                       lee: las 3 condiciones de CC#3 antes del primer encendido (F8) y qué falta de cada una
 *   node scripts/ops/finanzas-seco.mjs contadores --guardar <archivo>    foto ANTES · después: --comparar <archivo> (debe decir lo esperado)
 *   node scripts/ops/finanzas-seco.mjs encender [--aplicar]              guarda la foto previa y pone la oficina y la conversación en `ensayo` SOLO con los clientes de práctica (preguntas: apagado)
 *   node scripts/ops/finanzas-seco.mjs puerta [--aplicar]                lo que la ruta debe negarse a hacer · `puerta --apagada` (DESPUÉS de apagar): 409 en todo
 *   node scripts/ops/finanzas-seco.mjs correr [--negocio S] [--registro tuteo|voseo] [--caso C] [--limite N] [--aplicar]
 *   node scripts/ops/finanzas-seco.mjs enganche-f4                       lee el flujo vivo de planeación y dice si F4 está puesto y si es idéntico al respaldo/ARREGLADO (no corre planeación: costaría)
 *   node scripts/ops/finanzas-seco.mjs preguntas                         el canal de preguntas (F7): nada se envía; comprueba 0 filas y el interruptor apagado
 *   node scripts/ops/finanzas-seco.mjs apagar [--aplicar]                restaura la foto previa (apagada), lee de vuelta
 *   node scripts/ops/finanzas-seco.mjs limpiar [--aplicar]               AL FINAL y solo cuando CC#3 ya midió: respalda y borra los encargos/turnos/artefactos de los 7 clientes de práctica (ninguno más)
 *
 * Variables: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, N8N_API_KEY, INTERNAL_API_KEY (y, opcionales, N8N_BASE_URL, APP_URL). NUNCA imprime una llave. Nada de naufrago.ec.
 * Requisito: migraciones `202610141800` y `202610141900` aplicadas (con respaldo) y la ruta publicada. Hasta entonces `estado` lo dice y `encender` se niega.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { CLIENTES, ID_PREFIJO, NEGOCIOS } from './finanzas-seco/fixtures.mjs'
import { celdas, resumenDeLaMatriz, REGISTROS } from './finanzas-seco/matriz.mjs'
import { correrCelda, resumenDeCelda } from './finanzas-seco/nucleo.mjs'

const A = process.argv.slice(2)
const orden = A[0]
const flag = (n) => { const i = A.indexOf('--' + n); return i >= 0 ? A[i + 1] : null }
const aplicar = A.includes('--aplicar')
const IDS = CLIENTES.map((c) => c.id)
const SALIDA = flag('salida') || process.env.SALIDA || `_finanzas-seco-${new Date().toISOString().slice(0, 10)}`
const NOMBRE_FLUJO_CONVERSA = 'Zero Risk — finanzas · conversa (oficina financiera · F8 · INACTIVO)'
const ID_PLANEACION = 'X9F0zp6LQ2xGEYVS'

const U = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, ''), SK = process.env.SUPABASE_SERVICE_ROLE_KEY
const N8N = (process.env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app').replace(/\/$/, ''), NK = process.env.N8N_API_KEY
const APP = (process.env.APP_URL || 'https://zero-risk-platform.vercel.app').replace(/\/$/, '')
const LLAVE = process.env.INTERNAL_API_KEY
const necesita = (...ks) => { const f = ks.filter((k) => !process.env[k]); if (f.length) { console.error('faltan variables: ' + f.join(', ')); process.exit(2) } }
const HS = () => ({ apikey: SK, authorization: 'Bearer ' + SK, 'content-type': 'application/json' })
const HN = () => ({ 'X-N8N-API-KEY': NK, 'content-type': 'application/json' })
const paso = (t) => console.log((aplicar ? '▶ ' : '· (solo se imprime) ') + t)
const guardar = (nombre, obj) => { fs.mkdirSync(SALIDA, { recursive: true }); fs.writeFileSync(path.join(SALIDA, nombre), JSON.stringify(obj, null, 2)); return path.join(SALIDA, nombre) }

const rest = async (tabla, q = '') => { const r = await fetch(`${U}/rest/v1/${tabla}?${q}`, { headers: HS() }); const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
const cuenta = async (tabla, q = '') => {
  const r = await fetch(`${U}/rest/v1/${tabla}?${q}&select=*`, { headers: { ...HS(), prefer: 'count=exact', range: '0-0' } })
  if (!r.ok) return `error ${r.status}`
  return Number((r.headers.get('content-range') || '').split('/')[1])
}
const patchCfg = async (cuerpo) => {
  const r = await fetch(`${U}/rest/v1/finanzas_config?id=eq.1`, { method: 'PATCH', headers: { ...HS(), prefer: 'return=representation' }, body: JSON.stringify({ ...cuerpo, actualizado_en: new Date().toISOString() }) })
  const t = await r.text(); if (!r.ok) throw new Error(`finanzas_config: ${r.status} ${t.slice(0, 160)}`)
  return JSON.parse(t)[0]
}
async function n8nLista() { return (await (await fetch(`${N8N}/api/v1/workflows?limit=250`, { headers: HN() })).json()).data || [] }
async function enVuelo() {
  let n = 0
  for (const st of ['running', 'waiting']) n += ((await (await fetch(`${N8N}/api/v1/executions?status=${st}&limit=50`, { headers: HN() })).json()).data || []).length
  return n
}
async function leerFlujo(id) { const r = await fetch(`${N8N}/api/v1/workflows/${id}`, { headers: HN() }); return r.ok ? r.json() : null }

/** el transporte real: POST a la ruta con la llave INTERNA (la de despacho no existe aquí) */
const transporteReal = (llave = LLAVE) => async (cuerpo) => {
  const r = await fetch(`${APP}/api/finanzas/conversa`, { method: 'POST', headers: { 'content-type': 'application/json', ...(llave ? { 'x-api-key': llave } : {}) }, body: JSON.stringify(cuerpo), signal: AbortSignal.timeout(60_000) })
  const t = await r.text(); let json = null; try { json = JSON.parse(t) } catch { json = { _texto: t.slice(0, 200) } }
  return { status: r.status, json }
}

async function contadores() {
  const enIds = `client_id=in.(${IDS.join(',')})`
  const costos = await rest('agent_invocations', `${enIds}&select=cost_usd`)
  return {
    tomado_en: new Date().toISOString(),
    agent_invocations_total: await cuenta('agent_invocations'),
    agent_invocations_de_los_clientes_de_practica: Array.isArray(costos) ? costos.length : costos,
    agent_invocations_costo_usd_de_los_clientes_de_practica: Array.isArray(costos) ? +costos.reduce((a, r) => a + Number(r.cost_usd || 0), 0).toFixed(6) : costos,
    agent_invocations_workflow_id_nulo: await cuenta('agent_invocations', 'workflow_id=is.null'),
    hitl_queue_total: await cuenta('hitl_queue'),
    hitl_pending_approvals_editor_escalation: await cuenta('hitl_pending_approvals', 'approval_type=eq.editor_escalation'),
    client_historical_outputs_total: await cuenta('client_historical_outputs'),
    finanzas_tableros: await cuenta('finanzas_tableros'),
    finanzas_numeros: await cuenta('finanzas_numeros'),
    finanzas_preguntas: await cuenta('finanzas_preguntas'),
    finanzas_encargos: await cuenta('finanzas_encargos'),
    finanzas_turnos: await cuenta('finanzas_turnos'),
    finanzas_artefactos: await cuenta('finanzas_artefactos'),
    n8n_en_vuelo: await enVuelo(),
    // los mensajes de #alertas y de #oficina-financiera NO se cuentan desde aquí (en seco la oficina no llama a Slack): se anota el `ts` del último mensaje de #alertas ANTES de encender y DESPUÉS (ver el LISTO)
  }
}
/** lo que DEBE seguir igual en un seco (diferencias = alarma); encargos/turnos/artefactos sí crecen (son de ensayo) */
const DEBE_SEGUIR_IGUAL = ['agent_invocations_total', 'agent_invocations_de_los_clientes_de_practica', 'agent_invocations_costo_usd_de_los_clientes_de_practica', 'agent_invocations_workflow_id_nulo', 'hitl_queue_total', 'hitl_pending_approvals_editor_escalation', 'client_historical_outputs_total', 'finanzas_tableros', 'finanzas_numeros', 'finanzas_preguntas']

const INTERRUPTORES = [
  'Antes: migraciones 202610141800 y 202610141900 aplicadas con respaldo · n8n 0 corriendo y 0 esperando · lectura de #alertas (el `ts` del último mensaje) · `contadores --guardar`.',
  '1. `finanzas_config` → estado `ensayo`, conversa `ensayo`, preguntas_slack `apagado`, clientes_ensayo = los 7 clientes de práctica.',
  '2. NADA más se enciende: ni el flujo `finanzas · conversa`, ni el de bloque, ni F4 en el plan, ni Slack, ni variables de entorno. Los agentes son el guion de cada celda (`simulacion`), solo con encargos `dry_run=true`.',
  'Al terminar: `apagar` (foto previa), `puerta --apagada` (409 en todo), `contadores --comparar` (todo igual salvo encargos/turnos/artefactos), lectura de #alertas, `limpiar` solo cuando CC#3 diga.',
]

async function main() {
  if (!orden || orden === 'plan') {
    const r = resumenDeLaMatriz()
    console.log('MATRIZ DEL SECO · oficina financiera · negocios × registros × casos')
    console.log('  negocios (de práctica):', NEGOCIOS.map((n) => `${n.nombre} [${n.rubro} · ${n.pais} · evento ${n.evento}]`).join(' | '))
    console.log('  registros             :', REGISTROS.join(', '))
    console.log('  casos                 :'); for (const [k, v] of Object.entries(r.casos)) console.log(`     ${k.padEnd(22)} ${v}`)
    console.log('  celdas                :', r.total)
    console.log('  puerta                : 10 casos (dry_run ausente / no booleano, cliente fuera del ensayo, sin semilla, semilla enorme, simulación sobre un encargo real, simulación mal formada, sin llave, llave equivocada, encargo inexistente, acción inválida)')
    console.log('\nINTERRUPTORES'); INTERRUPTORES.forEach((l) => console.log('  ' + l))
    console.log('\nLAS 3 CONDICIONES DE CC#3 antes del primer encendido (F8): `condiciones` las lee y dice qué falta; la 3.ª solo se prueba en la primera corrida REAL (regla Q1).')
    console.log('\nAhora no se ha tocado nada.')
    return
  }
  if (orden === 'estado') {
    necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'N8N_API_KEY')
    console.log('finanzas_config :', JSON.stringify(await rest('finanzas_config', 'select=*&id=eq.1')))
    const f = (await n8nLista()).filter((w) => w.name === NOMBRE_FLUJO_CONVERSA)
    console.log('flujo conversa  :', f.map((w) => `${w.id} active=${w.active}`).join(', ') || '(no existe: aún no se importó)')
    console.log('contadores      :', JSON.stringify(await contadores(), null, 1))
    return
  }
  if (orden === 'condiciones') {
    necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'N8N_API_KEY')
    const filas = []
    const f = (tabla) => cuenta(tabla)
    const tablasF1 = ['finanzas_config', 'finanzas_tableros', 'finanzas_numeros', 'finanzas_preguntas']
    const tablasF8 = ['finanzas_encargos', 'finanzas_turnos', 'finanzas_artefactos']
    const ya = async (ts) => { const out = []; for (const t of ts) out.push(typeof (await f(t)) === 'number'); return out.every(Boolean) }
    filas.push(['1 · CI completo sobre `main`', 'la ruta está publicada (Vercel)', await (async () => { try { const r = await fetch(`${APP}/api/finanzas/conversa`, { method: 'POST', body: '{}' }); return r.status === 401 ? '✔ responde 401 sin llave (publicada)' : `🔴 responde ${r.status}` } catch (e) { return '🔴 sin respuesta: ' + e.message } })()])
    const flujo = (await n8nLista()).find((w) => w.name === NOMBRE_FLUJO_CONVERSA)
    let c2 = '🔴 el flujo `finanzas · conversa` no existe en n8n (PR propia sin importar)'
    if (flujo) {
      const completo = await leerFlujo(flujo.id)
      const usaSuId = JSON.stringify(completo?.nodes ?? []).includes('$workflow.id')
      c2 = `${usaSuId ? '✔' : '🔴'} existe (${flujo.id}), ${flujo.active ? '🔴 ACTIVO' : 'inactivo'}, ${usaSuId ? 'pasa su workflow_id real ($workflow.id)' : 'NO pasa su workflow_id real'}`
    }
    filas.push(['2 · quién llama: flujo propio con su `workflow_id`', 'flujo en n8n', c2])
    filas.push(['3a · migraciones F1 y F8 aplicadas', 'las 7 tablas responden', (await ya(tablasF1)) && (await ya(tablasF8)) ? '✔ responden' : '🔴 faltan (sin aplicar)'])
    const ident = await rest('agents', `select=name,status&name=in.(chief-financial-officer,finance-fpa-analyst,paid_media_paid_social_strategist,paid_media_ppc_strategist,tracking-specialist,campaign-brief-agent)`)
    filas.push(['3b · las 6 identidades en `agents`', 'filas presentes', Array.isArray(ident) ? `${ident.length}/6: ${ident.map((x) => `${x.name}${x.status ? ':' + x.status : ''}`).join(', ')}` : '🔴 no se pudo leer'])
    filas.push(['3c · `workflow_execution_id` = `<encargo>:<paso>` en `agent_invocations`', 'NO verificable en seco (los agentes son simulados)', '⏳ se mide en la primera corrida REAL (regla Q1): si no coincide, la firma cae a «sin firma», nunca a «firmado»'])
    filas.push(['3d · `FINANZAS_RUN_SDK_BASE` y `INTERNAL_API_KEY` en el entorno de la ruta y en n8n', 'NO verificable desde aquí (variables de Vercel/n8n; no se leen)', '⏳ lo comprueba quien las aplique'])
    filas.push(['3e · decisión de Emilio: canal privado y adaptador de Slack', 'no existe en el código', '⏳ pendiente de Emilio (`FINANZAS_CANAL_HILO`, `FINANZAS_EMILIO_ID`); el seco no publica ni lee'])
    for (const [c, q, v] of filas) console.log(`${c}\n    ${q}\n    ${v}`)
    return
  }
  if (orden === 'contadores') {
    necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'N8N_API_KEY')
    const ahora = await contadores()
    if (flag('guardar')) { fs.writeFileSync(flag('guardar'), JSON.stringify(ahora, null, 2)); console.log('foto guardada en', flag('guardar')); return }
    if (flag('comparar')) {
      const antes = JSON.parse(fs.readFileSync(flag('comparar'), 'utf8'))
      let mal = 0
      for (const k of Object.keys(ahora)) {
        if (k === 'tomado_en') continue
        const igual = antes[k] === ahora[k]
        const debe = DEBE_SEGUIR_IGUAL.includes(k)
        if (debe && !igual) mal++
        console.log(`${debe ? (igual ? '✔' : '🔴') : '·'} ${k.padEnd(60)} ${antes[k]} → ${ahora[k]}`)
      }
      console.log(mal ? `🔴 ${mal} contador(es) que debían seguir iguales cambiaron` : '✔ todo lo que debía seguir igual sigue igual')
      process.exitCode = mal ? 1 : 0; return
    }
    console.log(JSON.stringify(ahora, null, 2)); return
  }
  if (orden === 'encender') {
    necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'N8N_API_KEY')
    const cfg = (await rest('finanzas_config', 'select=*&id=eq.1'))[0]
    const vivas = await enVuelo()
    console.log('estado previo   :', JSON.stringify({ config: cfg, n8n_en_vuelo: vivas }))
    if (!cfg || typeof cfg !== 'object') { console.error('🔴 no hay finanzas_config (¿migraciones sin aplicar?)'); process.exitCode = 1; return }
    if (vivas) { console.error('🔴 hay ejecuciones de n8n en vuelo: no se enciende nada'); process.exitCode = 1; return }
    if (cfg.estado !== 'apagada' || cfg.conversa !== 'apagado' || cfg.preguntas_slack !== 'apagado') { console.error('🔴 se esperaba todo apagado de partida'); process.exitCode = 1; return }
    paso(`guardar la foto previa en ${SALIDA}/estado-previo.json`)
    paso(`finanzas_config → estado=ensayo · conversa=ensayo · preguntas_slack=apagado · clientes_ensayo=${IDS.join(',')}`)
    if (!aplicar) return
    guardar('estado-previo.json', { config: cfg })
    await patchCfg({ estado: 'ensayo', conversa: 'ensayo', preguntas_slack: 'apagado', clientes_ensayo: IDS })
    const l = (await rest('finanzas_config', 'select=*&id=eq.1'))[0]
    console.log('leído de vuelta :', JSON.stringify({ estado: l.estado, conversa: l.conversa, preguntas: l.preguntas_slack, clientes: l.clientes_ensayo }))
    const bien = l.estado === 'ensayo' && l.conversa === 'ensayo' && l.preguntas_slack === 'apagado' && JSON.stringify([...l.clientes_ensayo].sort()) === JSON.stringify([...IDS].sort())
    if (!bien) { console.error('🔴 la lectura de vuelta no coincide'); process.exitCode = 1 }
    return
  }
  if (orden === 'puerta') {
    if (aplicar) necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'INTERNAL_API_KEY')
    const T = transporteReal()
    const SEM = { evento: 'mensaje', dias_activos_por_semana: 5 }
    if (A.includes('--apagada')) {
      paso('con la oficina APAGADA: abrir → 409, avanzar → 409 (también con simulación), leer → 409 (corre DESPUÉS de «apagar»; los contadores no deben moverse)')
      if (!aplicar) return
      const casos = [
        ['abrir', { accion: 'abrir', client_id: IDS[0], dry_run: true, semilla: SEM }],
        ['avanzar', { accion: 'avanzar', encargo_id: crypto.randomUUID() }],
        ['avanzar con simulación', { accion: 'avanzar', encargo_id: crypto.randomUUID(), simulacion: { guion: {} } }],
        ['leer', { accion: 'leer', encargo_id: crypto.randomUUID() }],
      ]
      let bien = true
      for (const [n, c] of casos) { const r = await T(c); const ok = r.status === 409; bien = bien && ok; console.log(`${ok ? '✔' : '🔴'} ${n} → ${r.status} ${r.json?.error ?? ''}`) }
      process.exitCode = bien ? 0 : 1; return
    }
    // los casos de la puerta: [nombre, cuerpo, status esperado, error esperado | null, llave (undefined = la interna, null = ninguna)]
    const real = { accion: 'abrir', client_id: IDS[1], dry_run: false, semilla: SEM }
    const casos = [
      ['dry_run ausente', { accion: 'abrir', client_id: IDS[0], semilla: SEM }, 400],
      ['dry_run no booleano', { accion: 'abrir', client_id: IDS[0], dry_run: 'true', semilla: SEM }, 400],
      ['cliente fuera del ensayo', { accion: 'abrir', client_id: `${ID_PREFIJO}fuera-de-la-lista`, dry_run: true, semilla: SEM }, 409, 'cliente_fuera_de_ensayo'],
      ['sin semilla', { accion: 'abrir', client_id: IDS[0], dry_run: true }, 400],
      ['semilla enorme', { accion: 'abrir', client_id: IDS[0], dry_run: true, semilla: { ficha_resumen: 'x'.repeat(41_000) } }, 413],
      ['sin llave', { accion: 'leer', encargo_id: crypto.randomUUID() }, 401, 'unauthorized', null],
      ['llave equivocada', { accion: 'leer', encargo_id: crypto.randomUUID() }, 401, 'unauthorized', 'llave-que-no-es'],
      ['encargo inexistente', { accion: 'avanzar', encargo_id: crypto.randomUUID() }, 404, 'encargo_inexistente'],
      ['acción inválida', { accion: 'otra' }, 400],
      ['simulación mal formada', { accion: 'avanzar', encargo_id: crypto.randomUUID(), simulacion: 'texto' }, 'segun', 'simulacion_invalida'],
    ]
    paso(`${casos.length + 1} casos de la puerta contra ${APP} (+ la simulación sobre un encargo REAL: 409 y 0 turnos)`)
    if (!aplicar) return
    let bien = true
    const rs = []
    for (const [n, c, st, err, llave] of casos) {
      const r = await transporteReal(llave === undefined ? LLAVE : llave)(c)
      // «simulación mal formada» antes valida el encargo: con uno inexistente da 400 (forma) y con la forma bien 404; se acepta 400
      const esperado = st === 'segun' ? 400 : st
      const ok = r.status === esperado && (!err || r.json?.error === err || st === 'segun')
      bien = bien && ok; rs.push({ n, status: r.status, error: r.json?.error ?? null, ok })
      console.log(`${ok ? '✔' : '🔴'} ${n} → ${r.status} ${r.json?.error ?? ''}`)
    }
    // la simulación sobre un encargo real: abrir uno real (dry_run=false), pedir un avance simulado → 409 y ningún turno
    const a = await T(real)
    if (a.status === 200) {
      const r = await T({ accion: 'avanzar', encargo_id: a.json.encargo_id, simulacion: { guion: { planteo: {} } } })
      const l = await T({ accion: 'leer', encargo_id: a.json.encargo_id })
      const ok = r.status === 409 && r.json?.error === 'simulacion_solo_en_seco' && Array.isArray(l.json?.turnos) && l.json.turnos.length === 0
      bien = bien && ok; rs.push({ n: 'simulación sobre un encargo real', status: r.status, ok, encargo_id: a.json.encargo_id })
      console.log(`${ok ? '✔' : '🔴'} simulación sobre un encargo real → ${r.status} ${r.json?.error ?? ''} · turnos ${l.json?.turnos?.length}`)
      console.log(`   (queda un encargo REAL abierto de ${IDS[1]} sin turnos: \`limpiar\` lo borra; un encargo abierto bloquea otro del mismo cliente)`)
    } else { bien = false; console.log(`🔴 no se pudo abrir el encargo real de la prueba: ${a.status} ${a.json?.error ?? ''}`) }
    guardar(`puerta-${Date.now()}.json`, rs)
    process.exitCode = bien ? 0 : 1; return
  }
  if (orden === 'correr') {
    if (aplicar) necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'INTERNAL_API_KEY')
    const lim = flag('limite') ? Number(flag('limite')) : Infinity
    const todas = celdas({ negocio: flag('negocio'), registro: flag('registro'), caso: flag('caso') }).slice(0, lim)
    paso(`${todas.length} celdas por la ruta (${[...new Set(todas.map((c) => c.caso))].join(', ')}) contra ${APP} · agentes simulados`)
    if (!aplicar) { for (const c of todas.slice(0, 40)) console.log('   ' + c.id); if (todas.length > 40) console.log(`   … y ${todas.length - 40} más`); return }
    const T = transporteReal()
    const rs = []
    for (const celda of todas) {
      const r = await correrCelda(T, celda)
      const s = resumenDeCelda(r); rs.push(s)
      console.log(`${s.ok ? '✔' : '🔴'} ${celda.id}  [${s.estado} · US$ ${s.gasto_usd.toFixed(2)} · ${s.pasos.length} pasos]${s.ok ? '' : '\n     ' + s.fallas.join('\n     ')}`)
    }
    const f = guardar(`correr-${new Date().toISOString().replace(/[-:T.Z]/g, '').slice(0, 14)}.json`, { resultados: rs })
    console.log(`\n${rs.filter((r) => r.ok).length}/${rs.length} celdas como el diseño · detalle en ${f}`)
    process.exitCode = rs.every((r) => r.ok) ? 0 : 1; return
  }
  if (orden === 'enganche-f4') {
    necesita('N8N_API_KEY')
    const vivo = await leerFlujo(ID_PLANEACION)
    if (!vivo) { console.error('🔴 no se pudo leer el flujo de planeación'); process.exitCode = 1; return }
    const nombres = new Set((vivo.nodes ?? []).map((n) => n.name))
    const f4 = ['FIN · ¿trae finanzas_id?', 'FIN · leer el bloque']
    const puesto = f4.every((n) => nombres.has(n))
    console.log(`flujo de planeación ${ID_PLANEACION}: ${vivo.nodes?.length ?? 0} nodos · activo=${vivo.active} · F4 ${puesto ? 'PUESTO' : 'NO puesto'}`)
    const carpeta = path.join('scripts', 'worker-staging')
    const candidatos = [
      ['ARREGLADO de F4', path.join(carpeta, 'finanzas-f4', 'plan-F4-finanzas-ARREGLADO-2026-10-14.json')],
      ['respaldo previo a F4 (r81)', path.join(carpeta, ID_PLANEACION, 'planeacion-ARREGLADO-r81-2026-10-13.json')],
    ]
    for (const [etiqueta, ruta] of candidatos) {
      if (!fs.existsSync(ruta)) { console.log(`  · ${etiqueta}: (no está en ${ruta})`); continue }
      const j = JSON.parse(fs.readFileSync(ruta, 'utf8'))
      const huella = (nodos) => crypto.createHash('sha256').update(JSON.stringify([...nodos].map((n) => [n.name, n.type, n.parameters]).sort((a, b) => (a[0] < b[0] ? -1 : 1)))).digest('hex').slice(0, 16)
      const igual = huella(j.nodes ?? []) === huella(vivo.nodes ?? [])
      console.log(`  ${igual ? '✔ idéntico' : '· distinto'} a: ${etiqueta} (${j.nodes?.length ?? 0} nodos)`)
    }
    console.log('Este paso NO corre planeación (costaría): la igualdad «apagado = idéntico a hoy» de F4 la ejerce `__tests__/finanzas-f4-plan.test.ts` con el flujo en miniatura; aquí solo se mide qué hay VIVO.')
    return
  }
  if (orden === 'preguntas') {
    necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY')
    const cfg = (await rest('finanzas_config', 'select=*&id=eq.1'))[0]
    const n = await cuenta('finanzas_preguntas')
    console.log(`preguntas_slack: ${cfg?.preguntas_slack} · filas en finanzas_preguntas: ${n}`)
    console.log('El canal de preguntas (F7) no tiene ruta ni adaptador que envíe: se ejerce por código (`__tests__/finanzas-preguntas.test.ts`, `finanzas-f7-reparos.test.ts` y el seco en memoria). En vivo solo se comprueba que NADA se envía: interruptor apagado y 0 filas.')
    process.exitCode = cfg?.preguntas_slack === 'apagado' && n === 0 ? 0 : 1
    return
  }
  if (orden === 'apagar') {
    necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'N8N_API_KEY')
    const previo = fs.existsSync(path.join(SALIDA, 'estado-previo.json')) ? JSON.parse(fs.readFileSync(path.join(SALIDA, 'estado-previo.json'), 'utf8')) : null
    const objetivo = previo?.config ?? { estado: 'apagada', conversa: 'apagado', preguntas_slack: 'apagado', clientes_ensayo: [] }
    paso(`finanzas_config → ${JSON.stringify({ estado: objetivo.estado, conversa: objetivo.conversa, preguntas_slack: objetivo.preguntas_slack, clientes_ensayo: objetivo.clientes_ensayo })} (${previo ? 'la foto previa' : 'valores de partida por omisión: no hay foto'})`)
    if (!aplicar) return
    await patchCfg({ estado: objetivo.estado, conversa: objetivo.conversa, preguntas_slack: objetivo.preguntas_slack, clientes_ensayo: objetivo.clientes_ensayo })
    const l = (await rest('finanzas_config', 'select=*&id=eq.1'))[0]
    console.log('leído de vuelta :', JSON.stringify({ estado: l.estado, conversa: l.conversa, preguntas: l.preguntas_slack, clientes: l.clientes_ensayo, n8n_en_vuelo: await enVuelo() }))
    const bien = l.estado === objetivo.estado && l.conversa === objetivo.conversa && l.preguntas_slack === objetivo.preguntas_slack && JSON.stringify(l.clientes_ensayo) === JSON.stringify(objetivo.clientes_ensayo)
    console.log(bien ? '✔ todo apagado y leído de vuelta' : '🔴 la lectura de vuelta NO coincide'); process.exitCode = bien ? 0 : 1; return
  }
  if (orden === 'limpiar') {
    // Al final, y SOLO cuando CC#3 ya midió: respalda y borra las filas de los 7 clientes de práctica (si quedan encargos, la REVERSA de F8 se niega). Nada de otros clientes: el filtro es por `client_id`.
    necesita('NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY')
    const enc = await rest('finanzas_encargos', `select=*&client_id=in.(${IDS.join(',')})`)
    if (!Array.isArray(enc)) throw new Error('no se pudieron leer los encargos: ' + JSON.stringify(enc).slice(0, 120))
    const lotes = (xs, n) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))
    const ids = enc.map((e) => e.id)
    const leerPor = async (tabla) => { const out = []; for (const l of lotes(ids, 40)) { const f = await rest(tabla, `select=*&encargo_id=in.(${l.join(',')})`); if (!Array.isArray(f)) throw new Error('no se pudo leer ' + tabla); out.push(...f) } return out }
    const turnos = await leerPor('finanzas_turnos'), arts = await leerPor('finanzas_artefactos')
    paso(`respaldar y borrar ${arts.length} artefactos, ${turnos.length} turnos y ${enc.length} encargos de los clientes de práctica (${IDS.length}); ninguno más (los tableros no se tocan: el seco no escribe tableros)`)
    if (!aplicar) return
    const archivo = guardar('finanzas-filas-del-seco.json', { respaldado_en: new Date().toISOString(), clientes: IDS, encargos: enc, turnos, artefactos: arts })
    const huella = crypto.createHash('sha256').update(fs.readFileSync(archivo)).digest('hex')
    console.log(`respaldo ${archivo} sha256 ${huella.slice(0, 16)}…`)
    const borrar = async (tabla, filtro) => { const r = await fetch(`${U}/rest/v1/${tabla}?${filtro}`, { method: 'DELETE', headers: { ...HS(), prefer: 'return=minimal' } }); if (!r.ok) throw new Error(`borrar ${tabla}: ${r.status}`) }
    for (const l of lotes(ids, 40)) await borrar('finanzas_artefactos', `encargo_id=in.(${l.join(',')})`)
    for (const l of lotes(ids, 40)) await borrar('finanzas_turnos', `encargo_id=in.(${l.join(',')})`)
    await borrar('finanzas_encargos', `client_id=in.(${IDS.join(',')})`)
    const quedan = await cuenta('finanzas_encargos', `client_id=in.(${IDS.join(',')})`)
    console.log('leído de vuelta: encargos que quedan de los clientes de práctica =', quedan)
    process.exitCode = quedan === 0 ? 0 : 1; return
  }
  console.error('orden desconocida. Usa: plan | estado | condiciones | contadores | encender | puerta | correr | enganche-f4 | preguntas | apagar | limpiar'); process.exit(2)
}
main().catch((e) => { console.error('🔴', e.message); process.exitCode = 1 })
