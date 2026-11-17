/**
 * El anuncio fijo en PNG (S2-5 · CC2): la misma secuencia que `renderAnuncioHtml` (#1068) — tamaño, documento, esperar las fuentes
 * empaquetadas, foto — con UN navegador que se abre al primer pedido y se cierra solo cuando el servicio queda quieto
 * (así el servidor puede dormir). La página se cierra siempre; toda salida a la red se corta (además de la CSP).
 */
import puppeteer, { type Browser } from 'puppeteer-core'
import { conCsp, CSP_PNG, type PedidoPng } from './logica'

let navegador: Promise<Browser> | null = null
let reloj: NodeJS.Timeout | null = null
let abiertas = 0
const QUIETO_MS = 60_000

function abrirNavegador(): Promise<Browser> {
  if (!navegador) {
    navegador = puppeteer.launch({
      executablePath: process.env.CHROME_PATH || '/usr/bin/chromium',
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--font-render-hinting=none', '--no-first-run', '--no-default-browser-check'],
    }).catch((e) => { navegador = null; throw e })
  }
  return navegador
}

function cerrarSiQuieto(): void {
  if (reloj) clearTimeout(reloj)
  reloj = setTimeout(() => {
    if (abiertas > 0 || !navegador) return
    const n = navegador
    navegador = null
    void n.then((b) => b.close()).catch(() => undefined)
  }, QUIETO_MS)
}

export async function renderPng(p: PedidoPng): Promise<{ png: Buffer; ms: number }> {
  const t0 = Date.now()
  abiertas++
  try {
    const b = await abrirNavegador()
    const pagina = await b.newPage()
    try {
      await pagina.setRequestInterception(true)
      pagina.on('request', (r) => { if (r.url().startsWith('data:')) void r.continue(); else void r.abort('blockedbyclient') })
      await pagina.setViewport({ width: p.ancho, height: p.alto, deviceScaleFactor: 1 })
      await pagina.setContent(conCsp(p.html, CSP_PNG), { waitUntil: 'load', timeout: 60_000 })
      await pagina.evaluate('document.fonts.ready.then(() => true)')
      const png = await pagina.screenshot({ type: 'png', clip: { x: 0, y: 0, width: p.ancho, height: p.alto } })
      return { png: Buffer.from(png), ms: Date.now() - t0 }
    } finally {
      await pagina.close().catch(() => undefined)
    }
  } finally {
    abiertas--
    cerrarSiQuieto()
  }
}

export async function cerrarNavegador(): Promise<void> {
  if (reloj) clearTimeout(reloj)
  const n = navegador
  navegador = null
  if (n) await n.then((b) => b.close()).catch(() => undefined)
}
