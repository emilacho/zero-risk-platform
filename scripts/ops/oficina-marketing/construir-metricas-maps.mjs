/**
 * 02-nov · ENCARGO-LENOVO métricas de redes (cola de CC2, punto 3) · RECOLECTOR DE GOOGLE MAPS (lo público que YA está raspado en `own_google_maps_profile`).
 *   node scripts/ops/oficina-marketing/construir-metricas-maps.mjs · escribe nuevo/metricas-maps.json (el id lo da n8n al crearlo)
 * Mismo molde que el de Instagram (`construir-metricas-instagram.mjs`): flujo NUEVO, APAGADO y en ENSAYO (`dry_run:true`), US$ 0 (solo lee la base y escribe en la plataforma), fallo = ERROR visible.
 * LA ELECCIÓN DEL NEGOCIO NO ES MÍA: la lectura trae varios negocios de nombre parecido (en Náufrago: 7 en una sola lectura, entre ellos «Picantería El Náufrago Sebas» y «Naufragos Bar»); sumar reseñas
 * ajenas sería el error de la sede de Guayaquil. Por eso el nodo de parámetros trae `lugares: {}` VACÍO: sin un `{ client_id: placeId }` puesto a propósito (con «dale» de Emilio) NO se registra nada.
 * Candidato que ya está en el sistema: el raspador de reseñas ya usa `ChIJ3asaJgArLJAR4P0azPMVwBc` («Naufrago», Olón, 4,9 · 28 reseñas) para Náufrago. Guayaquil es «solo entrega»: no tiene ficha propia en Maps.
 * Contrato de CC1: `POST /api/metricas/registrar`, `red: 'google_maps'`, `cuenta.cuenta_externa = placeId`, `puntaje` (decimal 0–5) y `resenas` (entero); lo no medido se OMITE (nunca 0).
 */
import fs from 'node:fs'
import path from 'node:path'
import { AQUI, codigo, conectar, idDeNodo, si } from './lib.mjs'
import { N, RESUMEN as RESUMEN_IG } from './construir-metricas-instagram.mjs'

export const NOMBRE = 'Zero Risk — Métricas · Google Maps (público, ya raspado) · CC#2'
export const PENDIENTE_ID = 'PENDIENTE-METRICAS-MAPS'
export { N }

const PARAMETROS = String.raw`// Nace en ENSAYO y SIN negocio elegido. Para registrar de verdad hacen falta tres cosas, todas con «dale» de Emilio: (1) poner en lugares { "<client_id>": "<placeId del negocio de ESE cliente>" } (2) dry_run:false (3) encender el flujo.
// dias_atras: 1 = la lectura de hoy; para rellenar historia se sube (máx 60); es idempotente (repetir un día actualiza, no duplica).
return [{ json: { dry_run: true, dias_atras: 1, lugares: {} } }];`

export const LEER_Y_MAPEAR = String.raw`// RECOLECTOR DE GOOGLE MAPS · lee lo ya raspado (own_google_maps_profile) y arma el cuerpo de POST /api/metricas/registrar. US$ 0.
const P = $('Parámetros (ensayo por defecto)').first().json || {};
const dryRun = P.dry_run !== false;                 // solo un false explícito registra de verdad
const dias = Math.max(1, Math.min(60, Math.floor(Number(P.dias_atras)) || 1));
const lugares = (P.lugares && typeof P.lugares === 'object' && !Array.isArray(P.lugares)) ? P.lugares : {};
const base = 'https://ordaeyxvvvdqsznsecjx.supabase.co';
const authDb = { apikey: $env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY };
const omitidos = [];
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const elegidos = Object.keys(lugares).filter((id) => UUID.test(id) && typeof lugares[id] === 'string' && lugares[id].trim());
if (!elegidos.length) return [{ json: { sin_envio: true, dry_run: dryRun, motivo: 'ningún cliente tiene el negocio de Google Maps elegido (parámetro lugares vacío): la elección es del dueño', omitidos } }];
// «sin dato» no es cero: el puntaje pasa si es un número finito de 0 a 5; las reseñas, un entero no negativo; si no, la clave se OMITE
const puntaje = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 && v <= 5 ? Math.round(v * 100) / 100 : undefined);
const entero = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 ? Math.round(v) : undefined);
const poner = (o, k, v) => { if (v !== undefined) o[k] = v; return o; };
const texto = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
const diaEcuador = (iso) => new Date(new Date(iso).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);
const desde = new Date(Date.now() - dias * 86400000).toISOString();
const salida = [];
for (const clienteId of elegidos) {
  const placeId = lugares[clienteId].trim();
  let filas = [];
  try {
    filas = await this.helpers.httpRequest({
      url: base + '/rest/v1/apify_raw?client_id=eq.' + clienteId + '&apify_function=eq.own_google_maps_profile&ensayo=eq.false&created_at=gte.' + encodeURIComponent(desde) + '&order=created_at.desc&limit=200&select=id,created_at,respuesta',
      method: 'GET', json: true, timeout: 20000, headers: authDb,
    });
  } catch (e) { omitidos.push({ cliente: clienteId, motivo: 'no se pudo leer apify_raw: ' + String((e && e.message) || e).slice(0, 120) }); continue; }
  const vistos = {};
  for (const f of (Array.isArray(filas) ? filas : [])) {
    const dia = diaEcuador(f.created_at);
    if (vistos[dia]) continue;                      // de la más nueva a la más vieja: queda la última lectura del día QUE TRAE ese negocio
    const lista = Array.isArray(f.respuesta) ? f.respuesta : [];
    const lugar = lista.filter((x) => x && typeof x === 'object' && x.placeId === placeId)[0];
    if (!lugar) continue;                           // esa lectura no trae el negocio elegido: se mira la anterior del mismo día
    vistos[dia] = true;
    const cuenta = poner(poner(poner(poner({ cuenta_externa: placeId }, 'handle', texto(lugar.title, 120)), 'url', texto(lugar.url, 400)), 'puntaje', puntaje(lugar.totalScore)), 'resenas', entero(lugar.reviewsCount));
    const cuerpo = { client_id: clienteId, red: 'google_maps', fuente: 'publico', dia, cuenta, publicaciones: [] };
    if (dryRun) cuerpo.dry_run = true;
    salida.push({ json: { cuerpo, cliente: clienteId, handle: cuenta.handle || placeId, dia, publicaciones_n: 0, dry_run: dryRun } });
  }
  if (!Object.keys(vistos).length) omitidos.push({ cliente: clienteId, motivo: 'ninguna lectura de los últimos ' + dias + ' día(s) trae el negocio ' + placeId });
}
if (!salida.length) return [{ json: { sin_envio: true, dry_run: dryRun, motivo: 'no hay lecturas del negocio elegido que registrar', omitidos } }];
salida.forEach((s) => { s.json.omitidos = omitidos; });
return salida;`

export const RESUMEN = RESUMEN_IG.replace('METRICAS_IG_FALLO', 'METRICAS_MAPS_FALLO')

export function construir() {
  const f = { name: NOMBRE, id: PENDIENTE_ID, active: false, settings: { executionOrder: 'v1' }, nodes: [], connections: {} }
  const poner = (def, x, y) => { f.nodes.push({ id: idDeNodo(f.id, def.name), position: [x, y], typeVersion: def.typeVersion ?? 2, ...def }); return def }
  poner({ name: N.reloj, type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, parameters: { rule: { interval: [{ field: 'cronExpression', expression: '40 11 * * *' }] } } }, 0, 0)   // 11:40 UTC = 06:40 Ecuador
  poner(codigo(N.parametros, PARAMETROS), 220, 0)
  poner(codigo(N.leer, LEER_Y_MAPEAR), 440, 0)
  poner(si(N.hay, '={{ $json.sin_envio !== true }}'), 660, 0)
  poner({
    name: N.registrar, type: 'n8n-nodes-base.httpRequest', typeVersion: 4.2,
    parameters: {
      method: 'POST', url: "={{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}/api/metricas/registrar",
      sendHeaders: true, headerParameters: { parameters: [{ name: 'Content-Type', value: 'application/json' }, { name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
      sendBody: true, specifyBody: 'json', jsonBody: '={{ JSON.stringify($json.cuerpo) }}',
      options: { timeout: 60000, response: { response: { fullResponse: true, neverError: true } } },
    },
  }, 880, -80)
  poner(codigo(N.resumen, RESUMEN), 1100, 0)
  conectar(f, N.reloj, N.parametros)
  conectar(f, N.parametros, N.leer)
  conectar(f, N.leer, N.hay)
  conectar(f, N.hay, N.registrar, 0)
  conectar(f, N.hay, N.resumen, 1)
  conectar(f, N.registrar, N.resumen)
  return f
}

export function escribir(f) {
  const dir = path.join(AQUI, 'nuevo'); fs.mkdirSync(dir, { recursive: true })
  const archivo = path.join(dir, 'metricas-maps.json')
  fs.writeFileSync(archivo, JSON.stringify(f, null, 2) + '\n')
  return archivo
}

if (process.argv[1]?.endsWith('construir-metricas-maps.mjs')) console.log(escribir(construir()))
