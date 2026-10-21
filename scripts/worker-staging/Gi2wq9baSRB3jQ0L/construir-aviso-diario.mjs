// COST WATCHDOG · aviso diario de plataforma a US$ 10 · CC#1 · 2026-10-21 (encargo Lenovo «piezas ya + reintento + topes», punto 5)
// Hallazgo: el vigilante solo comparaba Anthropic de hoy contra 2× el promedio y mostraba Apify como cifra del CICLO. El 20-oct la plataforma gastó US$ 15,7 (agentes + Apify, varias fichas)
// y nadie recibió aviso. Arreglo: suma del día = Anthropic de hoy (rollup de TODAS las fichas) + Apify de hoy (su propia cuenta, por día); avisa en #alertas al pasar US$ 10 y otra vez
// en cada múltiplo nuevo (20, 30…), una vez por nivel y día. Si Apify no responde, el total es parcial y lo dice (nunca un cero disfrazado).
// Uso:  node construir-aviso-diario.mjs   (lee watchdog-ANTES.json y escribe watchdog-ARREGLADO.json junto a este archivo)
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const UMBRAL_DIA_USD = 10
export const NODO_NUEVO = 'Fetch Apify diario'

const ANCLA_AGG = 'return [{ json: { anthropic_hoy_usd: anthropicHoy,'
const BLOQUE_AGG = [
  "// Apify HOY: su propia cuenta, día por día (dailyServiceUsages). Si la respuesta no trae la lista, es null («sin datos»), no 0.",
  "const hoyUtc = new Date().toISOString().slice(0, 10);",
  "const diarios = filas('Fetch Apify diario')[0] || {};",
  "const lista = diarios.data && Array.isArray(diarios.data.dailyServiceUsages) ? diarios.data.dailyServiceUsages : null;",
  "const delDia = lista ? lista.find((d) => d && typeof d.date === 'string' && d.date.slice(0, 10) === hoyUtc) : null;",
  "const apifyHoyRaw = delDia ? parseFloat(delDia.totalUsageCreditsUsd) : (lista ? 0 : null);",
  "const apifyHoy = apifyHoyRaw === null || isNaN(apifyHoyRaw) ? null : apifyHoyRaw;",
  "if (apifyHoy === null) sinDatos.push('Apify (día)');",
  "const totalDia = anthropicHoy + (apifyHoy === null ? 0 : apifyHoy);",
  '',
].join('\n')
const CAMPOS_AGG = 'return [{ json: { apify_hoy_usd: apifyHoy, total_dia_usd: totalDia, total_dia_parcial: apifyHoy === null, anthropic_hoy_usd: anthropicHoy,'

const ANCLA_DET = 'return [{ json: { fecha: hoy, anthropic_hoy_usd: actual,'
const BLOQUE_DET = [
  "// aviso diario de plataforma · suma de TODO el día (agentes de todas las fichas + Apify) contra el umbral; un aviso por nivel (10, 20, 30…) y día",
  "const UMBRAL_DIA = " + UMBRAL_DIA_USD + ";",
  "const totalDia = typeof ag.total_dia_usd === 'number' ? ag.total_dia_usd : actual;",
  "const nivel = Math.floor(totalDia / UMBRAL_DIA);",
  "let avisaTope = false;",
  "if (nivel >= 1) { if (!(sd.tope_dia === hoy && sd.tope_nivel >= nivel)) { avisaTope = true; sd.tope_dia = hoy; sd.tope_nivel = nivel; } }",
  "const mensajeTope = '🚨 *Gasto del día de la plataforma* · hoy (UTC) ya van ' + f(totalDia) + ' (más de US$ ' + (nivel * UMBRAL_DIA) + '): agentes de todas las fichas ' + f(actual) + ' + Apify ' + f(ag.apify_hoy_usd) + (ag.total_dia_parcial ? ' (total PARCIAL: Apify no respondió)' : '') + '. Fuente: rollup diario de la base' + (horasDesdeRefresco !== null ? ' (refrescado hace ' + horasDesdeRefresco + ' h)' : '') + ' y la cuenta de Apify. OpenAI (ciclo): ' + f(ag.openai_ciclo_usd) + '.';",
  '',
].join('\n')
const CAMPOS_DET = "return [{ json: { total_dia_usd: totalDia, total_dia_parcial: !!ag.total_dia_parcial, apify_hoy_usd: ag.apify_hoy_usd, umbral_dia_usd: UMBRAL_DIA, nivel_tope: nivel, aviso_tope: avisaTope, fecha: hoy, anthropic_hoy_usd: actual,"

function unaVez(codigo, ancla, nombre) {
  const n = codigo.split(ancla).length - 1
  if (n !== 1) throw new Error(nombre + ': el ancla aparece ' + n + ' veces (debe ser 1)')
}

export function cambiarAgregado(codigo) {
  if (codigo.includes('total_dia_usd')) throw new Error('Aggregate Costs ya tiene el total del día')
  unaVez(codigo, ANCLA_AGG, 'Aggregate Costs')
  return codigo.replace(ANCLA_AGG, () => BLOQUE_AGG + CAMPOS_AGG)
}

export function cambiarDeteccion(codigo) {
  if (codigo.includes('aviso_tope')) throw new Error('Detect Anomalies ya tiene el aviso diario')
  unaVez(codigo, ANCLA_DET, 'Detect Anomalies')
  unaVez(codigo, 'is_anomaly: esAnomalia,', 'Detect Anomalies · is_anomaly')
  unaVez(codigo, ' mensaje, timestamp: ag.timestamp } }];', 'Detect Anomalies · mensaje')
  return codigo
    .replace(ANCLA_DET, () => BLOQUE_DET + CAMPOS_DET)
    .replace('is_anomaly: esAnomalia,', () => 'is_anomaly: esAnomalia || avisaTope,')
    .replace(' mensaje, timestamp: ag.timestamp } }];', () => ' mensaje: avisaTope ? mensajeTope : mensaje, timestamp: ag.timestamp } }];')
}

export function construirFlujo(flujo) {
  const copia = JSON.parse(JSON.stringify(flujo))
  const por = (nombre) => { const n = copia.nodes.find((x) => x.name === nombre); if (!n) throw new Error('no está el nodo ' + nombre); return n }
  if (copia.nodes.some((x) => x.name === NODO_NUEVO)) throw new Error('el flujo ya tiene ' + NODO_NUEVO)
  const apify = por('Fetch Apify')
  const nuevo = JSON.parse(JSON.stringify(apify))
  nuevo.id = 'fetch-apify-diario'
  nuevo.name = NODO_NUEVO
  nuevo.position = [600, 380]
  nuevo.parameters.url = '=https://api.apify.com/v2/users/me/usage/monthly'
  copia.nodes.push(nuevo)
  por('Aggregate Costs').parameters.jsCode = cambiarAgregado(por('Aggregate Costs').parameters.jsCode)
  por('Detect Anomalies').parameters.jsCode = cambiarDeteccion(por('Detect Anomalies').parameters.jsCode)
  const sig = copia.connections['Fetch Apify']?.main?.[0]
  if (!sig || sig.length !== 1 || sig[0].node !== 'Aggregate Costs') throw new Error('«Fetch Apify» ya no apunta solo a «Aggregate Costs»')
  copia.connections['Fetch Apify'] = { main: [[{ node: NODO_NUEVO, type: 'main', index: 0 }]] }
  copia.connections[NODO_NUEVO] = { main: [[{ node: 'Aggregate Costs', type: 'main', index: 0 }]] }
  return copia
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const dir = path.dirname(fileURLToPath(import.meta.url))
  const base = fs.readFileSync(path.join(dir, 'watchdog-ANTES.json'), 'utf8')
  fs.writeFileSync(path.join(dir, 'watchdog-ARREGLADO.json'), JSON.stringify(construirFlujo(JSON.parse(base)), null, 2))
  console.log('escrito watchdog-ARREGLADO.json')
}
