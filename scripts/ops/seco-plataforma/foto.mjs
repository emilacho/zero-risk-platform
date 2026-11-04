/**
 * FOTO PREVIA para el servidor en seco: lee una vez la base real, SOLO con GET, y deja un archivo de semilla. Después el servidor corre sin llaves y sin red.
 * El archivo lleva datos del cliente: se guarda FUERA del repositorio.
 *
 *   doppler run -p zero-risk-plataforma -c prd -- node scripts/ops/seco-plataforma/foto.mjs --cliente naufrago --salida <fuera-del-repo>/semilla.json
 *
 * Mesa y pausa quedan encendidas SOLO en el archivo. Si una tabla no se puede leer, lo dice en `no_leidas` y sale con 1: una foto a medias no se usa sin saberlo.
 */
import fs from 'node:fs'

const A = process.argv.slice(2)
const opcion = (n) => { const i = A.indexOf('--' + n); return i >= 0 ? A[i + 1] : null }
const SLUG = opcion('cliente'), SALIDA = opcion('salida')
const U = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/$/, ''), K = process.env.SUPABASE_SERVICE_ROLE_KEY
if (!SLUG || !SALIDA) { console.error('faltan --cliente y --salida'); process.exit(2) }
if (!U || !K) { console.error('faltan las variables de la base: correr con doppler run'); process.exit(2) }
if (!/^[a-z][a-z0-9_]{0,62}$/.test(SLUG)) { console.error('slug inválido'); process.exit(2) }

const noLeidas = {}
async function leer(tabla, query = 'select=*', area = null) {
  const nombre = area ? area + '.' + tabla : tabla
  const filas = []
  for (let desde = 0; desde < 100000; desde += 1000) {
    const r = await fetch(`${U}/rest/v1/${tabla}?${query}`, { headers: { apikey: K, authorization: 'Bearer ' + K, range: `${desde}-${desde + 999}`, ...(area ? { 'accept-profile': area } : {}) } })
    if (!r.ok) { noLeidas[nombre] = r.status + ' ' + (await r.text()).slice(0, 160); return [] }
    const p = await r.json()
    filas.push(...p)
    if (p.length < 1000) break
  }
  return filas
}

const clientes = await leer('clients', `slug=eq.${SLUG}&select=*`)
const cliente = clientes[0]
if (!cliente) { console.error('no encontré el cliente ' + SLUG, noLeidas); process.exit(1) }
const delCliente = `client_id=eq.${cliente.id}&select=*`

const tablas = {
  clients: clientes,
  plan_catalogo_fuentes: await leer('plan_catalogo_fuentes'),
  plan_catalogo_tipos: await leer('plan_catalogo_tipos'),
  plan_catalogo_reglas: await leer('plan_catalogo_reglas'),
  plan_catalogo_lexico: await leer('plan_catalogo_lexico'),
  plan_catalogo_topes: await leer('plan_catalogo_topes'),
  cadena_config: await leer('cadena_config'),
  jefatura_config: await leer('jefatura_config'),
  jefatura_grading_policies: await leer('jefatura_grading_policies'),
  client_brand_books: await leer('client_brand_books', delCliente),
  client_sedes: await leer('client_sedes', delCliente),
  client_sede_datos: await leer('client_sede_datos', delCliente),
  // la señal de «listo» que mira el pre-vuelo: solo lectura, el portero no se toca
  cerebro_portero_corridas: await leer('cerebro_portero_corridas', delCliente),
  cerebro_fichas: await leer('cerebro_fichas', delCliente),
  // sin la huella semántica: pesa mucho y aquí nadie busca por significado
  client_brain_chunks: await leer('client_brain_chunks', `client_id=eq.${cliente.id}&select=id,client_id,source_table,source_id,provenance_tag,chunk_text`),
  // de los pedidos, solo lo que lee el contador de ventas: sin datos del comprador
  [`${SLUG}.orders`]: await leer('orders', 'select=status,payment_status,payment_method,es_prueba,total_usd,created_at', SLUG),
  // la configuración real, salvo los dos interruptores de esta prueba y el envío a Slack
  finanzas_config: (await leer('finanzas_config')).map((f) => ({ ...f, estado: 'encendida', conversa: 'enciende', preguntas_slack: 'apagado', pausa_al_dueno: true, mesa_de_estrategia: true })),
  // lo que la corrida va a escribir nace vacío
  agent_invocations: [], plan_corridas: [], plan_cambios: [], esperas_del_dueno: [], hitl_queue: [],
  estrategia_encargos: [], estrategia_turnos: [], estrategia_artefactos: [],
  finanzas_encargos: [], finanzas_turnos: [], finanzas_artefactos: [], finanzas_tableros: [], finanzas_numeros: [],
  jefatura_revisiones: [], jefatura_pasos: [], jefatura_fichas: [],
}

const semilla = {
  foto: { cliente: SLUG, client_id: cliente.id, tomada_en: new Date().toISOString(), filas: Object.fromEntries(Object.entries(tablas).map(([t, f]) => [t, f.length])), no_leidas: noLeidas },
  tablas,
  // reproducen índices de la base de los que depende el código
  unicas: [
    { tabla: 'finanzas_encargos', columnas: ['client_id'], donde: { estado: ['abierto', 'en_curso'] } },
    { tabla: 'estrategia_encargos', columnas: ['client_id'], donde: { estado: ['abierto', 'en_curso'] } },
  ],
}
fs.writeFileSync(SALIDA, JSON.stringify(semilla))
console.log(JSON.stringify(semilla.foto, null, 1))
process.exitCode = Object.keys(noLeidas).length ? 1 : 0
