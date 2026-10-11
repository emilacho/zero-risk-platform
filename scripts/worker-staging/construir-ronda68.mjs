// ronda 68 · construye los 3 flujos corregidos desde sus respaldos ANTES-ronda68 (NO toca n8n):
//  · Servicio de Apify 3lyknrP3PoS2KzUf: «Guardar lo crudo» UNA vez por corrida · importe real en la libreta de cada llamada · búsqueda de Google con `queries` como TEXTO
//  · «Apify · anotar el gasto real (diario)» jrnP5qTvEh0ACGkM: el resto del día = lo que NO quedó anotado en su llamada (sin contar dos veces)
//  · planeación X9F0zp6LQ2xGEYVS: el redactor entrega la vuelta desde el corredor (`callback_mode: 'runner'`), igual que el Brief y la Pieza
import fs from 'node:fs'
import { fileURLToPath } from 'node:url'

const RAIZ = fileURLToPath(new URL('../../', import.meta.url)).replace(/\\/g, '/')
const leer = (p) => fs.readFileSync(RAIZ + p, 'utf8')
const MODULO = leer('scripts/worker-staging/3lyknrP3PoS2KzUf/importe-real-de-la-corrida-r68.js').split('\r\n').join('\n').trim()

export function cambiar(codigo, antes, despues, que) {
  const n = codigo.split(antes).length - 1
  if (n !== 1) throw new Error(`${que}: esperaba 1 ocurrencia y hay ${n}`)
  return codigo.replace(antes, () => despues)
}
const conFinDeLinea = (codigo, fn) => {
  const crlf = codigo.includes('\r\n')
  const r = fn(crlf ? codigo.split('\r\n').join('\n') : codigo)
  return crlf ? r.split('\n').join('\r\n') : r
}

// ───────────── Servicio de Apify
export const SERP_VIEJO = "google_serp_scraper: ($json) => ({ queries: $json.params.queries || $json.params.searchTerms || '', maxPagesPerQuery: $json.params.maxPagesPerQuery || 1 }),"
// el actor de Google pide `queries` como TEXTO (una búsqueda por línea) · planeación manda una lista ⇒ «Field input.queries must be string» (ejecución 173262)
export const SERP_NUEVO = "google_serp_scraper: ($json) => ({ queries: [].concat($json.params.queries || $json.params.searchTerms || []).map((q) => String(q == null ? '' : q).trim()).filter((q) => q.length > 0).join('\\n'), maxPagesPerQuery: $json.params.maxPagesPerQuery || 1 }),"

export function armarCuerpo(codigo) {
  return conFinDeLinea(codigo, (c) => cambiar(c, SERP_VIEJO, SERP_NUEVO, 'serp'))
}

export const LIBRETA_NUEVA = `// 🔴 LA LLAMADA ANOTA LO QUE COSTÓ, SOLO CUANDO PUEDE PROBARLO (ronda 68 · 2026-10-11)
//
// Antes (11-sep · firma de Emilio · opción B): la fila de la llamada iba SIN importe porque «preguntar la última corrida del actor» no tiene respuesta correcta con
// llamadas a la vez (cuatro filas con el mismo identificador). Eso sigue siendo cierto. Lo que cambia: la corrida se identifica por LO QUE SE LE MANDÓ (su entrada
// queda guardada en su almacén de la cuenta de Apify), no por «la última». Una corrida con esa entrada, dentro de esta llamada ⇒ su importe real (lo da Apify).
// Cero o varias ⇒ SIN importe y con el motivo escrito (no se adivina) y la reconciliación del día la cubre.
//
// 🔴 Y el doble conteo: la fila del día (service='apify') ya NO suma las corridas que quedaron anotadas aquí (lleva su identificador): el total del día = estas filas + el resto.
const ctx = $('final-response-ok').first().json;
const ensayo = ctx.dry_run === true;
const helpers = this.helpers;

${MODULO}

let cuerpo = null;
try { cuerpo = $('Armar el cuerpo del raspador').first().json.cuerpo || null; } catch (e) { cuerpo = null; }
let medido = null;
if (!ensayo) {
  const http = (u) => helpers.httpRequest({ url: u, method: 'GET', json: true, timeout: 15000 });
  // el Servicio no guarda cuándo empezó la llamada: se mira la ventana más larga posible (el raspador más lento corta a los 250 s)
  medido = await buscarImporteReal(http, $env.APIFY_API_TOKEN, cuerpo, Date.now() - 300000, Date.now());
}
const conocido = ensayo || (medido && medido.estado === 'medido');
const exacto = ensayo ? 0 : (conocido ? Number(medido.usd.toFixed(6)) : null);
const redondeado = ensayo ? 0 : (conocido ? Number(medido.usd.toFixed(2)) : null);

return [{ json: {
  category: 'api_call',
  service: 'apify:' + ctx.apify_function,
  amount_usd: redondeado,
  amount_usd_exact: exacto,
  date: new Date().toISOString().slice(0, 10),
  description: JSON.stringify({
    tipo: 'llamada',
    es: 'detalle_de_llamada',
    no_sumar_con: "la fila del día (service='apify') solo cuando esta fila NO trae run_id · la del día ya descuenta las que sí lo traen",
    client_id: ctx.client_id,
    funcion: ctx.apify_function,
    filas: ctx.chunks_count,
    ensayo: ensayo,
    costo_conocido: conocido,
    ...(medido && medido.estado === 'medido' ? { run_id: medido.run_id, actor: medido.actor, importe_exacto_usd: exacto, fuente: 'cuenta de Apify · la corrida identificada por la entrada que se le mandó', candidatas: medido.candidatas } : {}),
    motivo: ensayo
      ? 'fue un ensayo · no se llamó al proveedor · el 0 es un cero de verdad'
      : (conocido
        ? 'importe real leído de la cuenta de Apify'
        : ((medido && medido.motivo) || 'sin importe') + ' · NO se adivina · lo cubre la reconciliación diaria'),
    momento: new Date().toISOString(),
  }),
} }];
`

export function armarLibreta(_codigoViejo) {
  return LIBRETA_NUEVA
}

export function servicioApify(flujo) {
  const f = JSON.parse(JSON.stringify(flujo))
  const por = (n) => { const x = f.nodes.filter((m) => m.name === n); if (x.length !== 1) throw new Error(`${x.length} nodos «${n}»`); return x[0] }
  por('Armar el cuerpo del raspador').parameters.jsCode = armarCuerpo(por('Armar el cuerpo del raspador').parameters.jsCode)
  por('Armar la fila de la libreta').parameters.jsCode = armarLibreta(por('Armar la fila de la libreta').parameters.jsCode)
  // «Guardar lo crudo» usa $items() (TODAS las filas) pero el nodo corre una vez por fila ⇒ N copias idénticas · una sola vez por corrida
  por('Guardar lo crudo').executeOnce = true
  return f
}

// ───────────── reconciliación diaria
export const AGRUPAR_ENCABEZADO_VIEJO = `const corridas = $('Una fila por corrida').all().map((i) => i.json);
const conteos = $input.all().map((i) => i.json);
const porDia = {};`
export const AGRUPAR_ENCABEZADO_NUEVO = `const corridas = $('Una fila por corrida').all().map((i) => i.json);
const conteos = $input.all().map((i) => i.json);
// RONDA 68 · las corridas que YA quedaron anotadas en la fila de su llamada (service='apify:<función>' con run_id) no se suman otra vez aquí:
// el total del día = esas filas + este resto. Si no se puede leer la libreta, NO se descuenta nada (mejor contar de más que perder gasto) y se dice.
const SB_COSTS = 'https://ordaeyxvvvdqsznsecjx.supabase.co/rest/v1/costs';
const anotadas = new Set();
let anotadas_lectura = 'ok';
try {
  const desde = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10);
  const filasLlamada = await this.helpers.httpRequest({
    url: SB_COSTS + '?select=description&service=like.apify:*&date=gte.' + desde,
    method: 'GET', json: true, timeout: 15000,
    headers: { apikey: $env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY },
  });
  for (const f of (Array.isArray(filasLlamada) ? filasLlamada : [])) {
    try { const d = JSON.parse(f.description || '{}'); if (d && d.run_id && d.costo_conocido === true) anotadas.add(String(d.run_id)); } catch (e) { /* una descripción que no es JSON no anota nada */ }
  }
} catch (e) { anotadas_lectura = 'fallo: no se descontó nada · ' + String(e && e.message ? e.message : e).slice(0, 100); }
const porDia = {};`

export const AGRUPAR_ACUM_VIEJO = `  porDia[d] = porDia[d] || { dia: d, corridas: 0, exacto_usd: 0, cobro_sin_datos: 0, sin_conteo: 0, detalle: [] };
  porDia[d].corridas += 1;
  porDia[d].exacto_usd += c.usd;`
export const AGRUPAR_ACUM_NUEVO = `  porDia[d] = porDia[d] || { dia: d, corridas: 0, exacto_usd: 0, anotadas: 0, anotadas_usd: 0, cobro_sin_datos: 0, sin_conteo: 0, detalle: [] };
  porDia[d].corridas += 1;
  if (anotadas.has(String(c.run_id))) { porDia[d].anotadas += 1; porDia[d].anotadas_usd += c.usd; } else { porDia[d].exacto_usd += c.usd; }`

export const AGRUPAR_DETALLE_VIEJO = `detalle.push({ run_id: c.run_id, actor: c.actor, usd: Number(c.usd.toFixed(6)), filas: filas, estado: c.estado, segundos: c.segundos });`
export const AGRUPAR_DETALLE_NUEVO = `detalle.push({ run_id: c.run_id, actor: c.actor, usd: Number(c.usd.toFixed(6)), filas: filas, estado: c.estado, segundos: c.segundos, anotada_en_su_llamada: anotadas.has(String(c.run_id)) });`

export const AGRUPAR_FILA_VIEJA = `    unica_con_plata: true,
    no_sumar_con: "las filas de llamada (service='apify:<funcion>') · ésas van sin importe a propósito",`
export const AGRUPAR_FILA_NUEVA = `    resto_sin_atribuir_a_una_llamada: true,
    no_sumar_con: "las filas de llamada (service='apify:<funcion>') CON run_id · ésas ya traen su importe real y esta fila NO las cuenta otra vez",
    anotadas_en_su_llamada: d.anotadas,
    anotadas_usd: Number(d.anotadas_usd.toFixed(6)),
    total_del_dia_usd: Number((d.exacto_usd + d.anotadas_usd).toFixed(6)),
    lectura_de_las_anotadas: anotadas_lectura,`

export function agruparPorDia(codigo) {
  return conFinDeLinea(codigo, (c) => {
    c = cambiar(c, AGRUPAR_ENCABEZADO_VIEJO, AGRUPAR_ENCABEZADO_NUEVO, 'agrupar.encabezado')
    c = cambiar(c, AGRUPAR_ACUM_VIEJO, AGRUPAR_ACUM_NUEVO, 'agrupar.acumulado')
    c = cambiar(c, AGRUPAR_DETALLE_VIEJO, AGRUPAR_DETALLE_NUEVO, 'agrupar.detalle')
    return cambiar(c, AGRUPAR_FILA_VIEJA, AGRUPAR_FILA_NUEVA, 'agrupar.fila')
  })
}
export function reconciliacion(flujo) {
  const f = JSON.parse(JSON.stringify(flujo))
  const n = f.nodes.filter((m) => m.name === 'Agrupar por día')
  if (n.length !== 1) throw new Error('nodos «Agrupar por día»: ' + n.length)
  n[0].parameters.jsCode = agruparPorDia(n[0].parameters.jsCode)
  return f
}

// ───────────── planeación
export const PLAN_VIEJO = 'callback_url: $execution.resumeUrl, force_restart:'
export const PLAN_NUEVO = "callback_url: $execution.resumeUrl, callback_mode: 'runner', force_restart:"
export function planeacion(flujo) {
  const f = JSON.parse(JSON.stringify(flujo))
  const n = f.nodes.filter((m) => m.name === 'Pedir el plan al redactor')
  if (n.length !== 1) throw new Error('nodos «Pedir el plan al redactor»: ' + n.length)
  n[0].parameters.jsonBody = conFinDeLinea(n[0].parameters.jsonBody, (c) => cambiar(c, PLAN_VIEJO, PLAN_NUEVO, 'planeacion.callback_mode'))
  return f
}

export const CASOS = [
  ['scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ANTES-ronda68-2026-10-11.json', 'scripts/worker-staging/3lyknrP3PoS2KzUf/servicio-apify-ARREGLADO-ronda68-2026-10-11.json', servicioApify],
  ['scripts/worker-staging/jrnP5qTvEh0ACGkM/anotar-gasto-ANTES-ronda68-2026-10-11.json', 'scripts/worker-staging/jrnP5qTvEh0ACGkM/anotar-gasto-ARREGLADO-ronda68-2026-10-11.json', reconciliacion],
  ['scripts/worker-staging/X9F0zp6LQ2xGEYVS/planeacion-ANTES-ronda68-2026-10-11.json', 'scripts/worker-staging/X9F0zp6LQ2xGEYVS/planeacion-ARREGLADA-ronda68-2026-10-11.json', planeacion],
]

if (process.argv[1] && process.argv[1].endsWith('construir-ronda68.mjs')) {
  for (const [antes, despues, fn] of CASOS) {
    fs.writeFileSync(RAIZ + despues, JSON.stringify(fn(JSON.parse(leer(antes))), null, 2))
    console.log('ok', despues.split('/').pop())
  }
}
