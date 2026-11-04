/**
 * 02-nov · ENCARGO-LENOVO métricas de redes (prioridad 2, firmado por Emilio: «preparar todo para cuando solo sea de conectar») · parte de n8n de CC2.
 * RECOLECTOR DE INSTAGRAM (lo público que YA está raspado): flujo NUEVO que NACE APAGADO y en ENSAYO (`dry_run:true` en su nodo de parámetros: encenderlo exige las dos cosas).
 *   node scripts/ops/oficina-marketing/construir-metricas-instagram.mjs · escribe nuevo/metricas-instagram.json (el id lo da n8n al crearlo)
 * Contrato: `2026-11-02-CONTRATO-CC1-metricas-de-redes.md` → `POST /api/metricas/registrar` (llave interna; idempotente por día; `autor` SIEMPRE; lo que no se midió se OMITE, nunca 0; `es_propia` lo calcula la plataforma).
 * Qué hace: lee lo ya guardado en `apify_raw` (función `instagram_scraper`, no ensayo) de cada cliente con Instagram propio en su ficha, toma la lectura más reciente de cada día, y manda la cuenta
 * (seguidores, siguiendo, publicaciones) y los posts (me gusta, comentarios, vistas, con su AUTOR: Instagram mezcla posts de otras cuentas que etiquetan al cliente; la plataforma los marca `es_propia=false`).
 * COSTO: US$ 0 (no llama a Apify ni a ningún modelo; solo lee la base y escribe en la plataforma). No toca el cerebro ni el portero. Nunca lee lecturas de competidores como propias.
 * Si algo falla el flujo termina en ERROR (visible), no en silencio.
 */
import fs from 'node:fs'
import path from 'node:path'
import { AQUI, codigo, conectar, idDeNodo, si } from './lib.mjs'

export const NOMBRE = 'Zero Risk — Métricas · Instagram (público, ya raspado) · CC#2'
export const PENDIENTE_ID = 'PENDIENTE-METRICAS-INSTAGRAM'
export const N = { reloj: 'Cada día · 06:30 Ecuador', parametros: 'Parámetros (ensayo por defecto)', leer: 'Leer lo raspado y mapear', hay: '¿hay algo que enviar?', registrar: 'Registrar en la plataforma', resumen: 'Resumen (falla en ERROR si algo falló)' }

const PARAMETROS = String.raw`// Nace en ENSAYO: dry_run:true valida y responde sin escribir. Para registrar de verdad hay que poner dry_run:false AQUÍ y encender el flujo (dos pasos, los dos con «dale» de Emilio).
// dias_atras: 1 = la lectura de hoy; para rellenar historia se sube (máx 60); es idempotente (repetir un día actualiza, no duplica).
return [{ json: { dry_run: true, dias_atras: 1 } }];`

export const LEER_Y_MAPEAR = String.raw`// RECOLECTOR DE INSTAGRAM · lee lo ya raspado y arma el cuerpo de POST /api/metricas/registrar (contrato de CC1). US$ 0.
const P = $('Parámetros (ensayo por defecto)').first().json || {};
const dryRun = P.dry_run !== false;                 // solo un false explícito registra de verdad
const dias = Math.max(1, Math.min(60, Math.floor(Number(P.dias_atras)) || 1));
const base = 'https://ordaeyxvvvdqsznsecjx.supabase.co';
const authDb = { apikey: $env.SUPABASE_SERVICE_ROLE_KEY, Authorization: 'Bearer ' + $env.SUPABASE_SERVICE_ROLE_KEY };
const omitidos = [];
const normalizar = (h) => String(h == null ? '' : h).trim().replace(/^https?:\/\/(www\.)?instagram\.com\//i, '').replace(/^@/, '').replace(/[\/?#].*$/, '').toLowerCase();
// «sin dato» no es cero: un número solo pasa si es finito y no negativo (Instagram devuelve -1 cuando oculta los me gusta); si no, la clave se OMITE
const num = (v) => (typeof v === 'number' && isFinite(v) && v >= 0 ? Math.round(v) : undefined);
const poner = (o, k, v) => { if (v !== undefined) o[k] = v; return o; };
const texto = (v, n) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, n) : undefined);
const diaEcuador = (iso) => new Date(new Date(iso).getTime() - 5 * 3600 * 1000).toISOString().slice(0, 10);

const clientes = await this.helpers.httpRequest({ url: base + '/rest/v1/clients?select=id,name,config', method: 'GET', json: true, timeout: 20000, headers: authDb });
const conHandle = (Array.isArray(clientes) ? clientes : []).map((c) => ({ id: c.id, nombre: c.name, handle: normalizar(c.config && c.config.apify && c.config.apify.own_handles && c.config.apify.own_handles.instagram) })).filter((c) => c.handle);
if (!conHandle.length) return [{ json: { sin_envio: true, dry_run: dryRun, motivo: 'ningún cliente tiene Instagram propio en su ficha', omitidos } }];

const desde = new Date(Date.now() - dias * 86400000).toISOString();
const salida = [];
for (const c of conHandle) {
  let filas = [];
  try {
    filas = await this.helpers.httpRequest({
      url: base + '/rest/v1/apify_raw?client_id=eq.' + c.id + '&apify_function=eq.instagram_scraper&ensayo=eq.false&created_at=gte.' + encodeURIComponent(desde) + '&order=created_at.desc&limit=200&select=id,params,created_at,respuesta',
      method: 'GET', json: true, timeout: 20000, headers: authDb,
    });
  } catch (e) { omitidos.push({ cliente: c.nombre, motivo: 'no se pudo leer apify_raw: ' + String((e && e.message) || e).slice(0, 120) }); continue; }
  const vistos = {};
  for (const f of (Array.isArray(filas) ? filas : [])) {
    // solo la lectura de ESTA cuenta (la misma función guarda también a los competidores)
    const usuarios = (f.params && Array.isArray(f.params.usernames) ? f.params.usernames : []).map(normalizar);
    if (usuarios.indexOf(c.handle) === -1) continue;
    const dia = diaEcuador(f.created_at);
    if (vistos[dia]) continue;                      // vienen de la más nueva a la más vieja: queda la última del día
    const lista = Array.isArray(f.respuesta) ? f.respuesta : [];
    const perfil = lista.filter((x) => x && typeof x === 'object' && normalizar(x.username) === c.handle)[0];
    if (!perfil) { omitidos.push({ cliente: c.nombre, fila: f.id, dia, motivo: 'la lectura no trae el perfil de ' + c.handle }); continue; }
    if (perfil.error) { omitidos.push({ cliente: c.nombre, fila: f.id, dia, motivo: 'la lectura trae error: ' + String(perfil.error).slice(0, 100) }); continue; }
    vistos[dia] = true;
    const cuenta = poner(poner(poner(poner(poner({ handle: c.handle }, 'cuenta_externa', texto(String(perfil.id == null ? '' : perfil.id), 80) || c.handle), 'url', texto(perfil.url, 300) || 'https://www.instagram.com/' + c.handle + '/'), 'seguidores', num(perfil.followersCount)), 'siguiendo', num(perfil.followsCount)), 'publicaciones', num(perfil.postsCount));
    const posts = [];
    for (const p of (Array.isArray(perfil.latestPosts) ? perfil.latestPosts : []).slice(0, 50)) {
      if (!p || p.id == null) continue;
      let o = { post_externo: String(p.id).slice(0, 80) };
      o = poner(o, 'url', texto(p.url, 300));
      o = poner(o, 'tipo', texto(p.productType || p.type, 40));
      o = poner(o, 'publicado_en', typeof p.timestamp === 'string' && !isNaN(Date.parse(p.timestamp)) ? new Date(p.timestamp).toISOString() : undefined);
      o = poner(o, 'autor', texto(p.ownerUsername, 80));      // SIEMPRE el autor real: la plataforma calcula es_propia
      o = poner(o, 'me_gusta', num(p.likesCount));
      o = poner(o, 'comentarios', num(p.commentsCount));
      o = poner(o, 'vistas', num(p.videoViewCount));
      posts.push(o);
    }
    const cuerpo = { client_id: c.id, red: 'instagram', fuente: 'publico', dia, cuenta, publicaciones: posts };
    if (dryRun) cuerpo.dry_run = true;
    salida.push({ json: { cuerpo, cliente: c.nombre, handle: c.handle, dia, publicaciones_n: posts.length, dry_run: dryRun } });
  }
  if (!Object.keys(vistos).length) omitidos.push({ cliente: c.nombre, motivo: 'sin lecturas de ' + c.handle + ' en los últimos ' + dias + ' día(s)' });
}
if (!salida.length) return [{ json: { sin_envio: true, dry_run: dryRun, motivo: 'no hay lecturas propias que registrar', omitidos } }];
salida.forEach((s) => { s.json.omitidos = omitidos; });
return salida;`

export const RESUMEN = String.raw`// Cierra la corrida: cuenta lo enviado y FALLA EN ERROR si algo no se registró (nunca un silencio disfrazado de éxito).
const previos = $('Leer lo raspado y mapear').all().map((i) => i.json);
const entradas = $input.all().map((i) => i.json);
const fallos = []; let enviados = 0; let posts = 0; let sinEnvio = null;
entradas.forEach((e, i) => {
  if (e && e.sin_envio) { sinEnvio = e; return; }
  const p = previos[i] || {};
  const ok = e && typeof e.statusCode === 'number' && e.statusCode >= 200 && e.statusCode < 300;
  if (ok) { enviados++; posts += Number(p.publicaciones_n) || 0; }
  else fallos.push((p.cliente || '?') + ' ' + (p.dia || '') + ' → ' + (e && e.statusCode) + ' ' + JSON.stringify((e && e.body) || {}).slice(0, 160));
});
const omitidos = (previos[0] && previos[0].omitidos) || (sinEnvio && sinEnvio.omitidos) || [];
if (fallos.length) throw new Error('METRICAS_IG_FALLO · ' + fallos.length + ' envío(s) sin registrar · ' + fallos.join(' | '));
const dry = previos.length ? previos[0].dry_run !== false : (sinEnvio ? sinEnvio.dry_run !== false : true);
return [{ json: { ok: true, ensayo: dry, enviados, publicaciones: posts, omitidos, sin_envio: sinEnvio ? sinEnvio.motivo : null } }];`

export function construir() {
  const f = { name: NOMBRE, id: PENDIENTE_ID, active: false, settings: { executionOrder: 'v1' }, nodes: [], connections: {} }
  const poner = (def, x, y) => { f.nodes.push({ id: idDeNodo(f.id, def.name), position: [x, y], typeVersion: def.typeVersion ?? 2, ...def }); return def }
  poner({ name: N.reloj, type: 'n8n-nodes-base.scheduleTrigger', typeVersion: 1.2, parameters: { rule: { interval: [{ field: 'cronExpression', expression: '30 11 * * *' }] } } }, 0, 0)   // 11:30 UTC = 06:30 Ecuador
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
  const archivo = path.join(dir, 'metricas-instagram.json')
  fs.writeFileSync(archivo, JSON.stringify(f, null, 2) + '\n')
  return archivo
}

if (import.meta.url === new URL(`file://${process.argv[1].replace(/\\/g, '/')}`).href || process.argv[1]?.endsWith('construir-metricas-instagram.mjs')) console.log(escribir(construir()))
