#!/usr/bin/env node
/**
 * PRIMER LOTE REAL · interruptores en orden (ronda 82 · CC#2). NO ejecuta nada por sí solo: sin `--aplicar` cada orden solo IMPRIME lo que haría.
 *
 *   node scripts/ops/primer-lote.mjs estado   --cliente <uuid>             lee todo (solo lectura) y dice si es seguro empezar
 *   node scripts/ops/primer-lote.mjs tope     --cliente <uuid> 10|6 [--aplicar]   sube/baja el tope diario de la ficha (fusiona, no pisa el resto de la config)
 *   node scripts/ops/primer-lote.mjs encender --cliente <uuid> [--aplicar]        cadena y oficina en `ensayo` SOLO con ese cliente + plantillas + flujos (sin el vigía de la cadena: el lote se dispara a mano)
 *   node scripts/ops/primer-lote.mjs autoproducir --campana <uuid> on|off [--aplicar]
 *   node scripts/ops/primer-lote.mjs apagar   --cliente <uuid> [--aplicar]        todo al revés, tope de vuelta a 6, y lee de vuelta
 *
 * Variables (las mismas del resto de scripts de operación): NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, N8N_API_KEY, N8N_BASE_URL (opcional).
 * Nunca imprime una llave. Rechaza cualquier cliente que no sea un uuid.
 */
const A = process.argv.slice(2)
const orden = A[0]
const flag = (n) => { const i = A.indexOf('--' + n); return i >= 0 ? A[i + 1] : null }
const aplicar = A.includes('--aplicar')
const U = process.env.NEXT_PUBLIC_SUPABASE_URL, SK = process.env.SUPABASE_SERVICE_ROLE_KEY
const N8N = process.env.N8N_BASE_URL || 'https://n8n-production-72be.up.railway.app', NK = process.env.N8N_API_KEY
if (!U || !SK || !NK) { console.error('faltan NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY o N8N_API_KEY'); process.exit(2) }
const RE_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const FAMILIAS = ['post_img', 'carrusel_ig_v1', 'kit_historias']
/** flujos que se prenden para el lote: la copia por filas, el turno y el vigía de la oficina. NO el vigía de la cadena (lanzaría lotes solo: «un solo lote por día»). Las dos puertas ya viven activas. */
const FLUJOS = { 'copia por filas': 'BNXqlaX1oHSfZIpF', 'turno de la oficina': 'bTbWL9lUvQCfStAz', 'vigía de la oficina': 'YCjbIgE1xz7f0Uzb' }
const VIGIA_CADENA = 'ioD3posdLqNkTLpP'
const TOPE_NORMAL = 6, TOPE_DEL_LOTE = 10

const HS = { apikey: SK, authorization: 'Bearer ' + SK, 'content-type': 'application/json' }
const rest = async (tabla, q = '') => { const r = await fetch(`${U}/rest/v1/${tabla}?${q}`, { headers: HS }); const t = await r.text(); try { return JSON.parse(t) } catch { return t } }
const patch = async (tabla, q, cuerpo) => { const r = await fetch(`${U}/rest/v1/${tabla}?${q}`, { method: 'PATCH', headers: { ...HS, prefer: 'return=representation' }, body: JSON.stringify(cuerpo) }); if (!r.ok) throw new Error(`${tabla} ${r.status} ${(await r.text()).slice(0, 200)}`); return r.json() }
const upsertCfg = async (clave, valor) => { const r = await fetch(`${U}/rest/v1/cadena_config?on_conflict=clave`, { method: 'POST', headers: { ...HS, prefer: 'return=minimal,resolution=merge-duplicates' }, body: JSON.stringify({ clave, valor, actualizado_en: new Date().toISOString() }) }); if (!r.ok) throw new Error('cadena_config ' + clave + ' ' + r.status) }
const HN = { 'X-N8N-API-KEY': NK, 'content-type': 'application/json' }
const flujo = async (id) => (await fetch(`${N8N}/api/v1/workflows/${id}`, { headers: HN })).json()
const vivas = async () => { let n = 0; for (const st of ['running', 'waiting']) n += ((await (await fetch(`${N8N}/api/v1/executions?status=${st}&limit=50`, { headers: HN })).json()).data || []).length; return n }
const activar = async (id, on) => { const r = await fetch(`${N8N}/api/v1/workflows/${id}/${on ? 'activate' : 'deactivate'}`, { method: 'POST', headers: HN }); if (!r.ok) throw new Error(`flujo ${id} ${r.status}`) }
const paso = (t) => console.log((aplicar ? '▶ ' : '· (solo se imprime) ') + t)

const cliente = flag('cliente')
if (['estado', 'tope', 'encender', 'apagar'].includes(orden) && !(cliente && RE_UUID.test(cliente))) { console.error('falta --cliente <uuid>'); process.exit(2) }

async function leer() {
  const cfg = Object.fromEntries((await rest('cadena_config', 'select=clave,valor&clave=in.(estado_cadena,clientes_ensayo)')).map((r) => [r.clave, r.valor]))
  const ofi = (await rest('oficina_config', 'select=estado,familias_activas,clientes_ensayo&id=eq.1'))[0]
  const pl = await rest('oficina_tipos_de_grupo', 'select=tipo,activo')
  const ficha = (await rest('clients', `select=config&id=eq.${cliente}`))[0]
  const campanas = await rest('cadena_campanas', `select=id,estado,seco,autoproducir,plan_id&client_id=eq.${cliente}&order=creada_en.desc&limit=5`)
  const fl = {}; for (const [n, id] of [...Object.entries(FLUJOS), ['vigía de la cadena', VIGIA_CADENA]]) fl[n] = (await flujo(id)).active
  return { cfg, ofi, pl, tope: ficha?.config?.spend_cap_usd ?? null, campanas: Array.isArray(campanas) ? campanas : [], fl, vivas: await vivas() }
}
const imprimir = (e) => {
  console.log('cadena        :', e.cfg.estado_cadena, JSON.stringify(e.cfg.clientes_ensayo))
  console.log('oficina       :', e.ofi.estado, JSON.stringify(e.ofi.familias_activas), JSON.stringify(e.ofi.clientes_ensayo))
  console.log('plantillas    :', e.pl.map((p) => `${p.tipo}=${p.activo}`).join(' '))
  console.log('tope diario   :', e.tope, '(ficha)')
  console.log('campañas      :', e.campanas.map((c) => `${c.id.slice(0, 8)}:${c.estado}${c.seco ? ':seca' : ':REAL'}:autoproducir=${c.autoproducir}`).join(' ') || '(ninguna)')
  console.log('flujos activos:', Object.entries(e.fl).map(([n, a]) => `${n}=${a}`).join(' · '))
  console.log('n8n en vuelo  :', e.vivas)
}

if (orden === 'estado') {
  const e = await leer(); imprimir(e)
  const apagado = e.cfg.estado_cadena === 'apagada' && e.ofi.estado === 'apagada' && e.pl.every((p) => !p.activo) && !Object.values(e.fl).some(Boolean) && e.campanas.every((c) => !c.autoproducir)
  console.log(apagado && e.vivas === 0 && e.tope === TOPE_NORMAL ? '✔ todo apagado, tope normal y 0 en vuelo: es seguro empezar' : '✖ NO está todo en reposo (ver arriba)')
} else if (orden === 'tope') {
  const nuevo = [TOPE_NORMAL, TOPE_DEL_LOTE].find((x) => x === Number(A.find((y) => /^(6|10)$/.test(y))))
  if (!nuevo) { console.error('el tope es 6 o 10'); process.exit(2) }
  const f = (await rest('clients', `select=config&id=eq.${cliente}`))[0]
  paso(`ficha.config.spend_cap_usd: ${f?.config?.spend_cap_usd} → ${nuevo} (se fusiona con el resto de config)`)
  console.log('  ojo: el freno de cada llamada a un agente (run-sdk) solo BAJA con la ficha; su techo general es 8 (RUN_SPEND_CAP_USD sin definir). Con 10 el techo efectivo de agentes sigue siendo 8; el despacho de la sala sí usa 10.')
  if (aplicar) { const r = await patch('clients', `id=eq.${cliente}`, { config: { ...(f?.config ?? {}), spend_cap_usd: nuevo } }); console.log('  leído de vuelta:', r[0]?.config?.spend_cap_usd) }
} else if (orden === 'encender') {
  const e = await leer(); imprimir(e)
  if (e.vivas !== 0) { console.error('✖ hay ejecuciones de n8n en vuelo: no se enciende'); process.exit(1) }
  paso(`cadena_config: estado_cadena=ensayo · clientes_ensayo=[${cliente}]`)
  paso(`oficina_config: estado=ensayo · familias_activas=${JSON.stringify(FAMILIAS)} · clientes_ensayo=[${cliente}]`)
  paso(`oficina_tipos_de_grupo.activo=true para ${FAMILIAS.join(', ')}`)
  for (const [n, id] of Object.entries(FLUJOS)) paso(`activar el flujo «${n}» (${id})`)
  console.log('  NO se activa el vigía de la cadena (lanzaría lotes solo) y NO se enciende `autoproducir`: se enciende después de revisar el parte (ver el guion).')
  if (aplicar) {
    await upsertCfg('clientes_ensayo', [cliente]); await upsertCfg('estado_cadena', 'ensayo')
    await patch('oficina_config', 'id=eq.1', { estado: 'ensayo', familias_activas: FAMILIAS, clientes_ensayo: [cliente], actualizado_en: new Date().toISOString() })
    await patch('oficina_tipos_de_grupo', `tipo=in.(${FAMILIAS.join(',')})`, { activo: true })
    for (const id of Object.values(FLUJOS)) await activar(id, true)
    imprimir(await leer())
  }
} else if (orden === 'autoproducir') {
  const camp = flag('campana'), v = A.includes('on') ? true : A.includes('off') ? false : null
  if (!(camp && RE_UUID.test(camp)) || v === null) { console.error('uso: autoproducir --campana <uuid> on|off'); process.exit(2) }
  paso(`cadena_campanas.autoproducir = ${v} en ${camp}`)
  if (aplicar) console.log('  leído de vuelta:', (await patch('cadena_campanas', `id=eq.${camp}`, { autoproducir: v }))[0]?.autoproducir)
} else if (orden === 'revisar') {
  // SOLO LECTURA · «el primer lote no lleva piezas con precios ni ofertas»: busca señales en las filas elegidas y/o en el parte guardado
  const SENAL = /(\$|us\$|usd|\bprecio|\bcuesta|\boferta|\bpromo|\bdescuento|\brebaja|\b2\s?x\s?1|\bcombo|\bgratis\b|\b\d+\s?%|\bdesde\s+\d)/i
  const hallazgos = []
  const camp = flag('campana'), filas = (flag('filas') || '').split(',').filter(Boolean), parte = flag('parte')
  if (camp && RE_UUID.test(camp)) {
    for (const f of await rest('cadena_calendario_filas', `select=id,tema,datos,pilar&campana_id=eq.${camp}`)) {
      if (filas.length && !filas.includes(f.id)) continue
      const t = [f.tema, f.pilar, JSON.stringify(f.datos ?? [])].join(' · ')
      if (SENAL.test(t)) hallazgos.push(`fila ${f.id}: ${t.slice(0, 160)}`)
    }
  }
  if (parte && RE_UUID.test(parte)) {
    const p = (await rest('client_historical_outputs', `select=content&id=eq.${parte}&output_type=eq.campaign_brief_pack`))[0]
    if (!p) hallazgos.push('el parte no existe')
    else for (const [i, l] of String(p.content).split('\n').entries()) if (SENAL.test(l) && !/^- (PROHIBIDO|NEGATIVOS|VOCABULARIO)/.test(l)) hallazgos.push(`parte, línea ${i + 1}: ${l.slice(0, 160)}`)
  }
  if (hallazgos.length) { console.log('✖ señales de precio u oferta (revisar a mano; si son de verdad, NO se enciende autoproducir):'); hallazgos.forEach((h) => console.log('  - ' + h)); process.exit(1) }
  console.log('✔ sin señales de precio ni oferta en lo revisado (es una búsqueda por palabras: no sustituye mirar el parte)')
} else if (orden === 'apagar') {
  paso('autoproducir=false en TODAS las campañas del cliente')
  paso('plantillas inactivas ×3 → oficina apagada (familias [], clientes []) → flujos inactivos (incluido el vigía de la cadena) → cadena apagada con clientes_ensayo []')
  paso(`tope diario de la ficha de vuelta a ${TOPE_NORMAL}`)
  if (aplicar) {
    await patch('cadena_campanas', `client_id=eq.${cliente}`, { autoproducir: false })
    await patch('oficina_tipos_de_grupo', `tipo=in.(${FAMILIAS.join(',')})`, { activo: false })
    await patch('oficina_config', 'id=eq.1', { estado: 'apagada', familias_activas: [], clientes_ensayo: [], actualizado_en: new Date().toISOString() })
    for (const id of [...Object.values(FLUJOS), VIGIA_CADENA]) if ((await flujo(id)).active) await activar(id, false)
    await upsertCfg('estado_cadena', 'apagada'); await upsertCfg('clientes_ensayo', [])
    const f = (await rest('clients', `select=config&id=eq.${cliente}`))[0]
    await patch('clients', `id=eq.${cliente}`, { config: { ...(f?.config ?? {}), spend_cap_usd: TOPE_NORMAL } })
    const e = await leer(); imprimir(e)
    console.log(e.cfg.estado_cadena === 'apagada' && e.ofi.estado === 'apagada' && e.tope === TOPE_NORMAL && e.pl.every((p) => !p.activo) && !Object.values(e.fl).some(Boolean) && e.campanas.every((c) => !c.autoproducir) ? '✔ todo apagado y leído de vuelta' : '✖ revisar: algo no quedó apagado')
  }
} else { console.error('órdenes: estado | tope | encender | autoproducir | apagar'); process.exit(2) }
