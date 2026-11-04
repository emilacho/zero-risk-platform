/**
 * SERVIDOR LOCAL DE LA PLATAFORMA para el doble chequeo en seco (orden de Lenovo, 4-nov). US$ 0, sin llaves y sin red hacia afuera.
 * Monta las rutas REALES con la base en memoria. El modelo es el corredor que se indique, siempre en esta máquina: el de CC2, o uno propio que contesta «sin guion».
 *
 *   npx tsx scripts/ops/seco-plataforma/servidor.ts --semilla base.json --traza traza.jsonl [--puerto 4101] [--corredor http://localhost:4102]
 *
 * Solo aquí la mesa y la pausa quedan encendidas: están en la semilla, no en producción.
 * Devuelve además `GET /__seco/estado` (rutas, llamadas bloqueadas, tablas escritas y tablas que faltaron en la semilla) y `GET /__seco/tabla/<nombre>` (lo que hay en la base en memoria).
 * `POST /__seco/reloj {"adelantar_min": 101}` adelanta el reloj de las rutas, para provocar plazos sin esperarlos.
 */
import fs from 'node:fs'
import http from 'node:http'
import { crearBase } from './base-en-memoria.mjs'

const A = process.argv.slice(2)
const opcion = (n: string, omision: string | null = null) => { const i = A.indexOf('--' + n); return i >= 0 ? A[i + 1] : omision }
const PUERTO = Number(opcion('puerto', '4101'))
const SEMILLA = opcion('semilla')
const TRAZA = opcion('traza')
const YO = `http://localhost:${PUERTO}`
const LLAVE = 'llave-del-seco-no-es-de-produccion'
const CORREDOR = opcion('corredor', YO) as string

const esLocal = (url: string) => { try { return ['localhost', '127.0.0.1', '[::1]'].includes(new URL(url).hostname) } catch { return false } }
if (!esLocal(CORREDOR)) { console.error('el corredor tiene que estar en esta máquina'); process.exit(2) }
if (!SEMILLA || !TRAZA) { console.error('faltan --semilla y --traza'); process.exit(2) }

// 1 · sin llaves: se vacía todo lo que pudiera llevar a producción ANTES de cargar una sola ruta
const CONSERVAR = /^(PATH|PATHEXT|SYSTEMROOT|SYSTEMDRIVE|WINDIR|TEMP|TMP|HOME|USERPROFILE|APPDATA|LOCALAPPDATA|COMSPEC|OS|PROCESSOR_.*|NUMBER_OF_PROCESSORS|NODE_.*|TSX_.*)$/i
for (const k of Object.keys(process.env)) if (!CONSERVAR.test(k)) delete process.env[k]
Object.assign(process.env, {
  NODE_ENV: 'development',
  NEXT_PUBLIC_SUPABASE_URL: YO,
  NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-del-seco',
  SUPABASE_SERVICE_ROLE_KEY: 'service-del-seco',
  INTERNAL_API_KEY: LLAVE,
  FINANZAS_RUN_SDK_BASE: CORREDOR,
  ZERO_RISK_API_URL: YO,
  N8N_BASE_URL: opcion('n8n', YO) as string,
})

// 2 · sin red: cualquier salida fuera de esta máquina se rechaza y queda en la traza
const bloqueadas: { url: string; hora: string }[] = []
const fetchReal = globalThis.fetch
globalThis.fetch = (async (entrada: Parameters<typeof fetch>[0], init?: Parameters<typeof fetch>[1]) => {
  const url = typeof entrada === 'string' ? entrada : entrada instanceof URL ? entrada.href : entrada.url
  if (!esLocal(url)) {
    const r = { url: url.split('?')[0], hora: new Date().toISOString() }
    bloqueadas.push(r)
    anotar({ tipo: 'salida_bloqueada', ...r })
    throw new Error('seco: salida a la red bloqueada · ' + r.url)
  }
  return fetchReal(entrada, init)
}) as typeof fetch

// 3 · reloj adelantable: los plazos se provocan sin esperarlos
let adelanto_ms = 0
const DateReal = Date
class DateDelSeco extends DateReal {
  constructor(...a: unknown[]) {
    if (a.length) super(...(a as [number])); else super(DateReal.now() + adelanto_ms)
  }
  static now() { return DateReal.now() + adelanto_ms }
}
globalThis.Date = DateDelSeco as DateConstructor

const faltaron = new Set<string>()

function anotar(fila: Record<string, unknown>) { fs.appendFileSync(TRAZA as string, JSON.stringify(fila) + '\n') }

const claves = (x: unknown): string[] | null => (x && typeof x === 'object' && !Array.isArray(x) ? Object.keys(x as object) : null)
const medir = (s: string) => ({ caracteres: s.length, tokens_aprox: Math.ceil(s.length / 4) })

const base = crearBase(JSON.parse(fs.readFileSync(SEMILLA, 'utf8')))

type Manejador = (r: Request) => Promise<Response> | Response
const RUTAS: Record<string, string> = {
  '/api/planeacion/mesa': '../../../src/app/api/planeacion/mesa/route',
  '/api/planeacion/prevuelo': '../../../src/app/api/planeacion/prevuelo/route',
  '/api/planeacion/corrida': '../../../src/app/api/planeacion/corrida/route',
  '/api/planeacion/corrida/barrer': '../../../src/app/api/planeacion/corrida/barrer/route',
  '/api/planeacion/validar-plan': '../../../src/app/api/planeacion/validar-plan/route',
  '/api/finanzas/conversa': '../../../src/app/api/finanzas/conversa/route',
  '/api/finanzas/pausar': '../../../src/app/api/finanzas/pausar/route',
  '/api/finanzas/tablero': '../../../src/app/api/finanzas/tablero/route',
  '/api/finanzas/responder': '../../../src/app/api/finanzas/responder/route',
  '/api/jefatura/revisiones': '../../../src/app/api/jefatura/revisiones/route',
}
const montadas: Record<string, Manejador> = {}
const sinMontar: Record<string, string> = {}

async function main() {
  // las rutas se cargan aquí: después de vaciar las llaves y de cerrar la red
  for (const [camino, archivo] of Object.entries(RUTAS)) {
    try {
      const m = await import(archivo) as { POST?: Manejador }
      if (m.POST) montadas[camino] = m.POST; else sinMontar[camino] = 'la ruta no tiene POST'
    } catch (e) { sinMontar[camino] = e instanceof Error ? e.message : String(e) }
  }

  const leer = (q: http.IncomingMessage) => new Promise<string>((ok, mal) => {
    const b: Buffer[] = []
    q.on('data', (x: Buffer) => b.push(x)); q.on('end', () => ok(Buffer.concat(b).toString('utf8'))); q.on('error', mal)
  })

  const servidor = http.createServer(async (q, s) => {
    const inicio = new Date()
    const url = new URL(q.url ?? '/', YO)
    const cuerpo = await leer(q)
    const responder = (status: number, datos: unknown, cabeceras: Record<string, string> = {}) => {
      const txt = datos === null || datos === undefined ? '' : typeof datos === 'string' ? datos : JSON.stringify(datos)
      s.writeHead(status, { 'content-type': 'application/json', ...cabeceras })
      s.end(status === 204 ? undefined : txt)
      return txt
    }

    if (url.pathname.startsWith('/rest/v1/')) {
      let parseado: unknown = null
      try { parseado = cuerpo ? JSON.parse(cuerpo) : null } catch { /* el cuerpo malo lo verá la base */ }
      const cabeceras = Object.fromEntries(Object.entries(q.headers).map(([k, v]) => [k, String(v)]))
      try {
        const r = base.atender({ metodo: q.method ?? 'GET', ruta: url.pathname, query: url.searchParams, cabeceras, cuerpo: parseado })
        responder(r.status, r.cuerpo, r.cabeceras)
        if ((r.cuerpo as { code?: string } | null)?.code === 'PGRST205') faltaron.add(url.pathname.slice(9))
        anotar({ tipo: q.method === 'GET' || q.method === 'HEAD' ? 'lectura' : 'escritura', tabla: url.pathname.slice(9), metodo: q.method, status: r.status, ...(r.status >= 400 ? { error: (r.cuerpo as { code?: string })?.code } : {}), ...medir(cuerpo), claves: claves(parseado), hora: inicio.toISOString() })
      } catch (e) {
        // el código pidió algo que la base en memoria no sabe: que se vea, no un vacío engañoso
        const detalle = e instanceof Error ? e.message : String(e)
        anotar({ tipo: 'base_no_soporta', tabla: url.pathname.slice(9), detalle, hora: inicio.toISOString() })
        responder(500, { code: 'SECO', message: detalle })
      }
      return
    }

    if (url.pathname === '/__seco/estado') {
      responder(200, { montadas: Object.keys(montadas), sin_montar: sinMontar, salidas_bloqueadas: bloqueadas, tablas_escritas: base.cambios(), tablas_que_faltaron: [...faltaron], reloj_adelantado_min: adelanto_ms / 60000, corredor: CORREDOR })
      return
    }
    if (url.pathname === '/__seco/reloj') {
      const min = Number((JSON.parse(cuerpo || '{}') as { adelantar_min?: unknown }).adelantar_min)
      if (!Number.isFinite(min) || min < 0) { responder(400, { error: 'adelantar_min debe ser un número positivo' }); return }
      adelanto_ms += min * 60000
      anotar({ tipo: 'reloj', adelantar_min: min, total_min: adelanto_ms / 60000, hora: new Date().toISOString() })
      responder(200, { reloj_adelantado_min: adelanto_ms / 60000, ahora: new Date().toISOString() })
      return
    }
    if (url.pathname.startsWith('/__seco/tabla/')) {
      responder(200, base.tablas()[decodeURIComponent(url.pathname.slice(14))] ?? null)
      return
    }

    // el corredor propio no inventa: si no hay uno con guion, el modelo «no contestó» y la traza lo dice
    if (url.pathname === '/api/agents/run-sdk') {
      anotar({ tipo: 'modelo_sin_guion', ...medir(cuerpo), hora: inicio.toISOString() })
      responder(503, { error: 'seco_sin_corredor', detalle: 'este servidor no simula modelos: indica --corredor' })
      return
    }

    const manejador = montadas[url.pathname]
    if (!manejador) {
      anotar({ tipo: 'ruta_no_montada', ruta: url.pathname, hora: inicio.toISOString() })
      responder(404, { error: 'ruta_no_montada_en_el_seco', ruta: url.pathname })
      return
    }
    const cabeceras = new Headers()
    for (const [k, v] of Object.entries(q.headers)) if (typeof v === 'string') cabeceras.set(k, v)
    let status = 500, salida = ''
    try {
      const r = await manejador(new Request(url, { method: q.method, headers: cabeceras, body: q.method === 'GET' || q.method === 'HEAD' ? undefined : cuerpo }))
      status = r.status
      salida = await r.text()
    } catch (e) {
      salida = JSON.stringify({ error: 'seco_la_ruta_revento', detalle: e instanceof Error ? e.message : String(e) })
    }
    responder(status, salida)
    let entrada: unknown = null, devuelta: unknown = null
    try { entrada = JSON.parse(cuerpo) } catch { /* sin cuerpo legible */ }
    try { devuelta = JSON.parse(salida) } catch { /* sin cuerpo legible */ }
    const e = (entrada ?? {}) as Record<string, unknown>
    anotar({
      tipo: 'ruta', ruta: url.pathname, accion: e.accion ?? null, dry_run: e.dry_run ?? null, status,
      entrada: { ...medir(cuerpo), claves: claves(entrada) }, salida: { ...medir(salida), claves: claves(devuelta) },
      inicio: inicio.toISOString(), fin: new Date().toISOString(),
    })
  })
  servidor.listen(PUERTO, '127.0.0.1', () => {
    console.log(JSON.stringify({ escuchando: YO, llave: LLAVE, montadas: Object.keys(montadas), sin_montar: sinMontar }, null, 1))
  })
}

main().catch((e) => { console.error(e); process.exit(1) })
