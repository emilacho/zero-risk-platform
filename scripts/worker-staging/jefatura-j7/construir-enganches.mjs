// LOS ENGANCHES DE LA `jefatura` EN LOS FLUJOS PRODUCTORES (J7 · CC#1 · 2026-10-14) · diseño v4 §13.1 · orden: pieza → brief → calendario → estrategia → plan.
// Cada enganche sale del flujo VIVO respaldado (ANTES-<id>-2026-10-14.json) y produce el ARREGLADO: si el texto de un nodo cambió debajo, el constructor se detiene.
//   node construir-enganches.mjs [--salida=<carpeta>]    → escribe los ARREGLADO · NO toca n8n (aplicar es otro paso, con respaldo y con la `jefatura` apagada)
// 🔴 Apagado = idéntico a hoy (prueba de igualdad en __tests__/jefatura-j7-enganches.test.ts). Reversa de cada uno: `n8n-flujo.mjs restaurar <id> ANTES-… --ejecutar`, o apagar el tipo en `jefatura_config.tipos_activos`.
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { engancharPuerta, leerJs } from './gate.mjs'
import { cadenaDeVersiones } from './plan-versiones.mjs'
const aqui = dirname(fileURLToPath(import.meta.url))
const lf = (s) => String(s).split('\r\n').join('\n')

export const FLUJOS = {
  brief: { id: 'BNXqlaX1oHSfZIpF', nombre: 'Zero Risk — Cadena · parte por filas (copia de Brief · CC#1)' },
  calendario: { id: 'cR22ztH1p2ihTIwD', nombre: 'Zero Risk — Cadena · calendario (sub-flujo · CC#1)' },
  estrategia: { id: 'ZnoFdGfACA36c3qE', nombre: 'Zero Risk — Cadena · estrategia (sub-flujo · CC#1)' },
  plan: { id: 'X9F0zp6LQ2xGEYVS', nombre: 'Zero Risk — planeacion (esqueleto B0 · piezas se pegan en C2)' },
}
export const antesDe = (id) => JSON.parse(lf(fs.readFileSync(join(aqui, `ANTES-${id}-2026-10-14.json`), 'utf8')))

/** nodo → exige que exista exactamente uno */
const uno = (flujo, nombre) => { const x = flujo.nodes.filter((n) => n.name === nombre); if (x.length !== 1) throw new Error(`${x.length} nodos «${nombre}»`); return x[0] }

// ───────────────────────────────────────────────────────── BRIEF · entre «④ Chequeos» y «⑤ ¿Modo seco?»
export function enganchaBrief(antes) {
  uno(antes, '④ Chequeos'); uno(antes, '⑤ ¿Modo seco?')
  const salidas = antes.connections['④ Chequeos']?.main?.[0] ?? []
  if (salidas.length !== 1 || salidas[0].node !== '⑤ ¿Modo seco?') throw new Error('«④ Chequeos» ya no va directo a «⑤ ¿Modo seco?»: el flujo cambió, se revisa el enganche')
  return engancharPuerta(antes, { desde: '④ Chequeos', salida: 0, armar: leerJs('armar-brief.js'), aplicar: leerJs('aplicar-brief.js'), cfg: { tipo: 'brief', plazo_s: 1200, cada_s: 90 } })
}

// ───────────────────────────────────────────────────────── ESTRATEGIA y CALENDARIO · dentro del sub-flujo, entre «④ ¿Termina?» y «⑤ Salida» (condición 4 de CC#3: el sub-flujo no termina hasta que la revisión cierre)
const SALIDA_ANTES = 'return [{ json: { paso: s.paso, campana_id: s.campana_id, tanda: s.tanda ?? null, resultado: s.resultado, alerta: s.alerta || null, fichas: s.fichas || [], fechas_pedidas: d.fechas_pedidas || [], detalle: d } }]'
const SALIDA_DESPUES = 'return [{ json: { paso: s.paso, campana_id: s.campana_id, tanda: s.tanda ?? null, resultado: s.resultado, alerta: s.alerta || null, fichas: s.fichas || [], fechas_pedidas: d.fechas_pedidas || [], detalle: d, ...(s.jefatura ? { jefatura: s.jefatura } : {}) } }]'
/** `correccion_aplicable` = ya existe `guardar_revisada` en la ruta de la cadena para este tipo; mientras sea falso el enganche NO abre revisiones reales (el orden «guardar_revisada antes de activar el tipo» queda impuesto por construcción) */
export function enganchaSubflujo(antes, tipo, { correccion_aplicable = false } = {}) {
  if (tipo !== 'estrategia' && tipo !== 'calendario') throw new Error('tipo ' + tipo)
  for (const n of ['③ Armar guardar', '① ¿Qué dijo?', '④ ¿Termina?', '⑤ Salida']) uno(antes, n)
  const salidas = antes.connections['④ ¿Termina?']?.main?.[0] ?? []
  if (salidas.length !== 1 || salidas[0].node !== '⑤ Salida') throw new Error('«④ ¿Termina?» ya no va directo a «⑤ Salida»: el flujo cambió, se revisa el enganche')
  const plazo_s = tipo === 'estrategia' ? 1200 : 1500
  const nuevo = engancharPuerta(antes, { desde: '④ ¿Termina?', salida: 0, armar: leerJs('armar-subflujo.js'), aplicar: leerJs('aplicar-subflujo.js'), cfg: { tipo, plazo_s, cada_s: 90, correccion_aplicable, titulo_del_pedido: tipo === 'estrategia' ? 'Pedido de la estrategia (trae manual, plan y reglas)' : 'Pedido del calendario (trae manual, plan, estrategia y fechas)' } })
  const sal = uno(nuevo, '⑤ Salida')
  const js = lf(sal.parameters.jsCode)
  if (js.split(SALIDA_ANTES).length !== 2) throw new Error('«⑤ Salida» cambió: el texto a retocar no aparece una sola vez')
  sal.parameters.jsCode = js.replace(SALIDA_ANTES, () => SALIDA_DESPUES)
  return nuevo
}

// ───────────────────────────────────────────────────────── PLAN · después de «Guardar el plan» y ANTES del PDF a Drive y de «BRIEF · sobre» (el ÚLTIMO en engancharse)
/** lo que se retoca en los nodos de después para que lean «Plan vigente»: [nodo, texto a cambiar, cambio, veces que aparece] */
const VUELTA = "$('¿Llegó la vuelta?').first().json"
const VUELTA_O_VIGENTE = "($('Plan vigente').first().json.jef_vigente || $('¿Llegó la vuelta?').first().json)"
const GUARDADO = "$('Guardar el plan')"
const VIGENTE = "$('Plan vigente')"
/** R4 (cerrado por diseño, sin medir): el MÁXIMO que el diseño permite — 3 turnos del redactor de hasta 15 min cada uno + los 200 s de GPT ≈ 48 min, redondeado a 50 min; la espera es una cadena de *Wait* guardados en base (cada reanudación corre segundos) y el plazo vive en un DATO (`plazo_fin`), no en el tope de ejecución de n8n */
export const PLAZO_DEL_PLAN_S = 3000
export const RETOQUES_DEL_PLAN = [
  { nodo: 'Plan → Drive (PDF)', de: VUELTA, a: VUELTA_O_VIGENTE, veces: 4 },
  { nodo: 'Aviso · plan con pendientes', de: VUELTA, a: VUELTA_O_VIGENTE, veces: 1 },
  { nodo: 'Aviso · plan con pendientes', de: GUARDADO, a: VIGENTE, veces: 1 },
  { nodo: '¿Salió el PDF?', de: VUELTA, a: VUELTA_O_VIGENTE, veces: 1 },
  { nodo: '¿Salió el PDF?', de: GUARDADO, a: VIGENTE, veces: 1 },
  { nodo: 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)', de: GUARDADO, a: VIGENTE, veces: 1 },
]
export function enganchaPlan(antes) {
  const guardar = uno(antes, 'Guardar el plan'); const vuelta = uno(antes, '¿Llegó la vuelta?')
  const destinos = (antes.connections['Guardar el plan']?.main?.[0] ?? []).map((d) => d.node).sort()
  if (JSON.stringify(destinos) !== JSON.stringify(['Aviso · plan con pendientes', 'Plan → Drive (PDF)'])) throw new Error('«Guardar el plan» ya no va a «Plan → Drive (PDF)» y «Aviso · plan con pendientes»: el flujo cambió, se revisa el enganche (las 2 ramas se reencauzan)')
  const nuevo = engancharPuerta(antes, {
    desde: 'Guardar el plan', salida: 0, armar: leerJs('armar-plan.js'), aplicar: leerJs('aplicar-plan.js'), cfg: { tipo: 'plan', plazo_s: PLAZO_DEL_PLAN_S, cada_s: 120 },
    continuacion: cadenaDeVersiones({ jsDeLaVuelta: vuelta.parameters.jsCode, origen: [guardar.position[0] + 240, guardar.position[1] + 700] }),
  })
  // reencauzar las 2 ramas: lo que leían de «¿Llegó la vuelta?» y de «Guardar el plan» lo leen del plan vigente (con A vigente es lo mismo de hoy)
  for (const r of RETOQUES_DEL_PLAN) {
    const n = uno(nuevo, r.nodo)
    const campo = n.parameters.jsCode !== undefined ? 'jsCode' : 'jsonBody'
    const js = lf(n.parameters[campo])
    const veces = js.split(r.de).length - 1
    if (veces !== r.veces) throw new Error(`«${r.nodo}»: «${r.de}» aparece ${veces} vez/veces y se esperaban ${r.veces}: el nodo cambió, se revisa el retoque`)
    n.parameters[campo] = js.split(r.de).join(r.a)
  }
  return nuevo
}

// ───────────────────────────────────────────────────────── PIEZA · J7(pieza): un flujo de PRUEBA nuevo (la oficina NO se toca): revisa una pieza ya producida con la puerta de la jefatura
export const PRUEBA_DE_PIEZA = { nombre: 'Zero Risk — Jefatura · prueba de pieza (J7 · CC#1)', path: 'zero-risk/jefatura-prueba-pieza', webhookId: 'jefatura-prueba-pieza-0001' }
export function construirPruebaDePieza() {
  const base = {
    name: PRUEBA_DE_PIEZA.nombre,
    nodes: [
      { parameters: { httpMethod: 'POST', path: PRUEBA_DE_PIEZA.path, responseMode: 'onReceived', options: {} }, name: 'Webhook · prueba de pieza', type: 'n8n-nodes-base.webhook', typeVersion: 2, position: [0, 0], webhookId: PRUEBA_DE_PIEZA.webhookId },
      { parameters: { jsCode: leerJs('prueba-pieza-entrada.js') }, name: '⓪ Entrada · llave', type: 'n8n-nodes-base.code', typeVersion: 2, position: [240, 0] },
      { parameters: { jsCode: 'return $input.all()' }, name: 'Fin · prueba de pieza', type: 'n8n-nodes-base.code', typeVersion: 2, position: [480, 0] },
    ],
    connections: { 'Webhook · prueba de pieza': { main: [[{ node: '⓪ Entrada · llave', type: 'main', index: 0 }]] }, '⓪ Entrada · llave': { main: [[{ node: 'Fin · prueba de pieza', type: 'main', index: 0 }]] } },
    settings: { executionOrder: 'v1' },
  }
  return engancharPuerta(base, { desde: '⓪ Entrada · llave', salida: 0, armar: leerJs('armar-prueba-pieza.js'), aplicar: leerJs('aplicar-prueba-pieza.js'), cfg: { tipo: 'pieza', plazo_s: 1200, cada_s: 90 } })
}

export const CONSTRUCTORES = {
  plan: (a) => enganchaPlan(a), brief: (a) => enganchaBrief(a), estrategia: (a) => enganchaSubflujo(a, 'estrategia'), calendario: (a) => enganchaSubflujo(a, 'calendario') }

if (process.argv[1] && process.argv[1].endsWith('construir-enganches.mjs')) {
  const arg = process.argv.find((a) => a.startsWith('--salida='))
  const salida = arg ? arg.slice('--salida='.length) : aqui
  fs.mkdirSync(salida, { recursive: true })
  for (const [tipo, f] of Object.entries(FLUJOS)) {
    const nuevo = CONSTRUCTORES[tipo](antesDe(f.id))
    fs.writeFileSync(join(salida, `ARREGLADO-${f.id}-j7-${tipo}-2026-10-14.json`), JSON.stringify(nuevo, null, 2))
    console.log(`${tipo} · ${f.id} · ${nuevo.nodes.length} nodos`)
  }
  const prueba = construirPruebaDePieza()
  fs.writeFileSync(join(salida, 'NUEVO-jefatura-prueba-de-pieza-j7-2026-10-14.json'), JSON.stringify(prueba, null, 2))
  console.log(`pieza (flujo de prueba nuevo) · ${prueba.nodes.length} nodos`)
}
