// «¿Queda crédito de Apify este mes?» en la puerta del Servicio de Apify (3lyknrP3PoS2KzUf) · CC2 · 2026-11-10 · Lenovo por Emilio: «sí, construye el arreglo».
// Hallazgo (09-nov, 15 fallas en Riesgos): con el crédito del mes agotado, Apify rechaza toda corrida (403) y cada pedido quedaba como ejecución FALLIDA.
// Arreglo:
//   · un nodo NUEVO «¿Queda crédito de Apify?» (GET /api/apify/credito, llave interna) entre «HTTP · Supabase clients lookup» y «Gate Decision»;
//   · «Gate Decision» lee el cliente del nodo de búsqueda (por nombre) y el crédito de su entrada: sin crédito (y no en ensayo) → `skipped` con `skip_reason: 'sin_credito_apify'`;
//   · «skipped-response» lo explica (`motivo` = el mensaje) y pasa `sin_credito` a quien llamó. La ejecución termina BIEN: ya no es una falla.
//   · si la pregunta no se puede contestar (la plataforma no responde, la cuenta no se lee) la puerta deja pasar, como hasta hoy.
//
//   node construir-sin-credito.mjs ANTES.json   → escribe servicio-apify-ARREGLADO-sin-credito-2026-11-10.json junto a este archivo (no toca n8n)
import fs from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

export const NODO_CREDITO = '¿Queda crédito de Apify?'
export const BUSQUEDA = 'HTTP · Supabase clients lookup'
export const PUERTA = 'Gate Decision'
export const SALTO = 'skipped-response'

const VIEJO_LECTURA = `const supabaseResponse = $input.first().json;`
const NUEVO_LECTURA = `// 10-nov · el cliente sale del nodo de búsqueda (por nombre) y el crédito de Apify de la entrada (nodo «${NODO_CREDITO}»)
const supabaseResponse = $('${BUSQUEDA}').first().json;
const credito = $input.first().json || {};`

const VIEJO_CLIENTE = `const client = clients[0];`
const NUEVO_CLIENTE = `const client = clients[0];

// 10-nov (Lenovo por Emilio) · SIN CRÉDITO DE APIFY ESTE MES: no se llama a Apify (rechazaría con 403 y la ejecución quedaría como falla).
// Se contesta enseguida «sin crédito» y quien llamó lo declara. Solo cuando la plataforma lo DICE (hay_credito === false); una lectura caída deja pasar. El ensayo no llama a Apify: pasa.
if (credito.hay_credito === false && ctx.dry_run !== true) {
  return [{
    json: {
      proceed: false,
      skipped: true,
      skip_reason: 'sin_credito_apify',
      sin_credito: { hasta: credito.hasta || null, usado_usd: credito.usado_usd ?? null, credito_usd: credito.credito_usd ?? null, mensaje: credito.mensaje || null },
      client_id: body.client_id,
      apify_function: body.apify_function,
      dry_run: ctx.dry_run,
    },
  }];
}`

const VIEJO_MOTIVO = `      : (ctx.skip_reason === 'apify_disabled_for_client'`
const NUEVO_MOTIVO = `      : ctx.skip_reason === 'sin_credito_apify'
        ? ((ctx.sin_credito && ctx.sin_credito.mensaje) || 'datos sin actualizar: crédito de Apify agotado')
      : (ctx.skip_reason === 'apify_disabled_for_client'`

const VIEJO_DRY = `    dry_run: ctx.dry_run === true,
  },
}];`
const NUEVO_DRY = `    dry_run: ctx.dry_run === true,
    // 10-nov · sin crédito de Apify: la fecha y el mensaje para que quien llamó lo declare
    sin_credito: ctx.sin_credito || null,
  },
}];`

function reemplazar(codigo, viejo, nuevo, donde) {
  const crlf = codigo.includes('\r\n')
  const c = codigo.replace(/\r\n/g, '\n')
  if (c.split(viejo).length !== 2) throw new Error(`«${donde}»: el ancla no aparece exactamente una vez`)
  const r = c.replace(viejo, nuevo)
  return crlf ? r.replace(/\n/g, '\r\n') : r
}

/** devuelve una COPIA del flujo con el nodo nuevo, la conexión cambiada y los dos nodos de código ajustados */
export function aplicarSinCredito(flujo) {
  const w = JSON.parse(JSON.stringify(flujo))
  if (w.nodes.some((n) => n.name === NODO_CREDITO)) throw new Error('el flujo ya tiene la pregunta de crédito')
  const busqueda = w.nodes.find((n) => n.name === BUSQUEDA)
  const puerta = w.nodes.find((n) => n.name === PUERTA)
  const salto = w.nodes.find((n) => n.name === SALTO)
  if (!busqueda || !puerta || !salto) throw new Error('faltan nodos del flujo')
  const conBusqueda = w.connections[BUSQUEDA]?.main
  if (JSON.stringify(conBusqueda) !== JSON.stringify([[{ node: PUERTA, type: 'main', index: 0 }]])) throw new Error('la búsqueda ya no va directo a la puerta')
  w.nodes.push({
    parameters: {
      method: 'GET',
      url: "={{ $env.ZERO_RISK_API_URL || 'https://zero-risk-platform.vercel.app' }}/api/apify/credito",
      sendHeaders: true,
      headerParameters: { parameters: [{ name: 'x-api-key', value: '={{ $env.INTERNAL_API_KEY }}' }] },
      options: { timeout: 20000, response: { response: { neverError: true } } },
    },
    name: NODO_CREDITO,
    type: 'n8n-nodes-base.httpRequest',
    typeVersion: 4.2,
    position: [busqueda.position[0] + 75, busqueda.position[1] + 160],
    id: 'c2e0a1b0-0c8e-4d1a-9a10-cc2c4ed10010',
    onError: 'continueRegularOutput',
    alwaysOutputData: true,
  })
  w.connections[BUSQUEDA] = { main: [[{ node: NODO_CREDITO, type: 'main', index: 0 }]] }
  w.connections[NODO_CREDITO] = { main: [[{ node: PUERTA, type: 'main', index: 0 }]] }
  let g = reemplazar(puerta.parameters.jsCode, VIEJO_LECTURA, NUEVO_LECTURA, PUERTA)
  g = reemplazar(g, VIEJO_CLIENTE, NUEVO_CLIENTE, PUERTA)
  puerta.parameters = { ...puerta.parameters, jsCode: g }
  let s = reemplazar(salto.parameters.jsCode, VIEJO_MOTIVO, NUEVO_MOTIVO, SALTO)
  s = reemplazar(s, VIEJO_DRY, NUEVO_DRY, SALTO)
  salto.parameters = { ...salto.parameters, jsCode: s }
  return w
}

if (process.argv[1] && process.argv[1].endsWith('construir-sin-credito.mjs')) {
  const aqui = dirname(fileURLToPath(import.meta.url))
  const entrada = process.argv[2]
  if (!entrada) { console.error('uso: node construir-sin-credito.mjs <ANTES.json>'); process.exit(2) }
  const antes = JSON.parse(fs.readFileSync(entrada, 'utf8'))
  fs.writeFileSync(join(aqui, 'servicio-apify-ARREGLADO-sin-credito-2026-11-10.json'), JSON.stringify(aplicarSinCredito(antes), null, 2))
  console.log('escrito servicio-apify-ARREGLADO-sin-credito-2026-11-10.json')
}
