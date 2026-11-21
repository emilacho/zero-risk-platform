// Doble chequeo: se carga con NODE_OPTIONS=--require en el n8n local y en la plataforma local. Corta cualquier conexión que no sea a esta máquina y la anota: así el «US$ 0» no depende de que nadie se acuerde.
const fs = require('node:fs')
const net = require('node:net')
const LOG = process.env.SECO_RED_LOG
const local = (h) => !h || h === 'localhost' || h === '127.0.0.1' || h === '::1' || h === '0.0.0.0' || h === '::'
const orig = net.Socket.prototype.connect
net.Socket.prototype.connect = function (...a) {
  const o = typeof a[0] === 'object' && a[0] !== null && !Array.isArray(a[0]) ? a[0] : Array.isArray(a[0]) ? a[0][0] : { host: a[1], port: a[0] }
  if (o && !o.path && !local(o.host)) {
    if (LOG) { try { fs.appendFileSync(LOG, `${new Date().toISOString()} BLOQUEADO ${o.host}:${o.port}\n`) } catch { /* sigue */ } }
    const e = new Error(`SECO: red bloqueada hacia ${o.host}:${o.port}`)
    e.code = 'ECONNREFUSED'
    process.nextTick(() => this.destroy(e))
    return this
  }
  return orig.apply(this, a)
}

// GPT y Slack no se cortan: se desvían al arnés, para ejercer el camino real (con sus tiempos y su forma) a US$ 0. Queda anotado en la traza como «simulado».
const ARNES = process.env.SECO_ARNES_URL || 'http://localhost:4100'
const DESVIOS = [[/^https:\/\/api\.openai\.com/, ARNES + '/openai'], [/^https:\/\/slack\.com\/api/, ARNES + '/slack']]
const fetchOriginal = globalThis.fetch
if (fetchOriginal) globalThis.fetch = function (u, i) {
  const t = typeof u === 'string' ? u : u instanceof URL ? u.href : u && u.url
  for (const [de, a] of DESVIOS) if (t && de.test(t)) return fetchOriginal(t.replace(de, a), i ?? (typeof u === 'object' && !(u instanceof URL) ? { method: u.method, headers: u.headers, body: u.body, duplex: 'half' } : undefined))
  return fetchOriginal(u, i)
}
