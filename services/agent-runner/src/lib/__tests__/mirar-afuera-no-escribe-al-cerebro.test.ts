/**
 * «MIRAR AFUERA» NO ESCRIBE AL CEREBRO DEL CLIENTE · pruebas a costo cero · CC#1 · 2026-10-02 (encargo Lenovo «sedes, mapas, cerebro y voz» punto 4 · firma de Emilio 02-oct).
 *
 * 🔴 EL ROJO (la primera pieza real, 01-oct 23:45Z): la herramienta mandaba `destination:'brain_rag'` FIJO. El Servicio de Apify, con ese destino, ESCRIBE lo raspado en el cerebro del cliente
 * (`client_competitive_landscape`). Un pedido de «ficha_en_mapas» de «Náufrago» en «Ecuador» trajo la ficha de OTRO negocio (Gualaceo) y quedó guardada como evidencia competitiva de Náufrago
 * (trozo 343bed5c) aunque el agente la descartó para la pieza. Además el pedido de Instagram SOBRESCRIBIÓ el trozo `instagram_competitive` que había dejado el alta.
 * Después: la herramienta pide el destino `respuesta` (el mismo que usa planeación desde el 10-sep): el Servicio devuelve lo encontrado a quien lo pidió y NO escribe en el cerebro.
 * Lo que el agente decida citar lo declara en su pieza; el cerebro lo alimenta el meta-agente con sello, no un raspado suelto.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'
import { readFileSync } from 'node:fs'

const require = createRequire(import.meta.url)
const { CATALOGO } = require('../mcp/apify-catalogo.js') as { CATALOGO: Record<string, unknown> }

describe('«mirar afuera» pide el destino `respuesta` (nada se escribe en el cerebro)', () => {
  let falso: Server | null = null
  afterEach(() => { falso?.close(); falso = null })
  async function conServidor(respuestaDelServicio: Record<string, unknown>) {
    const cuerpos: Record<string, unknown>[] = []
    falso = createServer((req, res) => {
      let b = ''
      req.on('data', (d) => (b += d))
      req.on('end', () => { cuerpos.push(JSON.parse(b)); res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(respuestaDelServicio)) })
    })
    await new Promise<void>((r) => falso!.listen(0, '127.0.0.1', () => r()))
    const puerto = (falso!.address() as { port: number }).port
    const { Client } = require('@modelcontextprotocol/sdk/client/index.js')
    const { StdioClientTransport } = require('@modelcontextprotocol/sdk/client/stdio.js')
    const transport = new StdioClientTransport({
      command: process.execPath,
      args: [resolve(__dirname, '..', 'mcp', 'apify-service-server.js')],
      env: { ...process.env, CLIENT_ID: 'cli-1', AGENT_SLUG: 'campaign-brief-agent', APIFY_SERVICE_URL: `http://127.0.0.1:${puerto}/` } as Record<string, string>,
    })
    const client = new Client({ name: 'prueba', version: '1.0.0' }, { capabilities: {} })
    await client.connect(transport)
    return { client, cuerpos, cerrar: () => client.close() }
  }
  const pedir = async (client: any, que_mirar: string) => JSON.parse((await client.callTool({ name: 'mirar_afuera', arguments: { que_mirar, de_quien: 'negocio', donde: 'Guayaquil' } })).content[0].text)

  it('🔴 LOS NUEVE `que_mirar`: ninguno manda `brain_rag` ni `both` · todos mandan `respuesta` (el cuerpo REAL que llega al Servicio)', async () => {
    const s = await conServidor({ ok: true, chunks_count: 1, datos: 'x', guardado_en: 'sólo la respuesta' })
    try {
      for (const q of Object.keys(CATALOGO)) await pedir(s.client, q)
      expect(s.cuerpos).toHaveLength(Object.keys(CATALOGO).length)
      for (const c of s.cuerpos) {
        expect(c.destination).toBe('respuesta')
        expect(c.destination).not.toBe('brain_rag')
        expect(c.destination).not.toBe('both')
        expect(c.dry_run).toBe(false) // es una mirada real: el ensayo no se activa solo
      }
    } finally { await s.cerrar() }
  }, 40000)

  it('lo que se encontró SIGUE llegando al agente (datos y registros) y la nota NO dice que quedó en el cerebro', async () => {
    const s = await conServidor({ ok: true, chunks_count: 3, datos: 'seguidores 1232 · bio …', guardado_en: 'sólo la respuesta', materia_prima: false })
    try {
      const r = await pedir(s.client, 'instagram')
      expect(r.se_pudo).toBe(true)
      expect(r.registros).toBe(3)
      expect(r.datos).toContain('1232')
      expect(r.guardado_en).toBe('sólo la respuesta')
      expect(r.nota).not.toMatch(/qued[oó] (tambi[eé]n )?en el cerebro/i)
      expect(r.nota).toMatch(/NO entró al cerebro|no quedó en el cerebro/i)
    } finally { await s.cerrar() }
  }, 30000)

  it('el contrato del Servicio vivo: `respuesta` es un destino válido que no activa el cerebro (`should_brain` sólo con brain_rag/both) y sigue devolviendo `datos`', () => {
    const vivo = JSON.parse(readFileSync(resolve(__dirname, '..', '..', '..', '..', '..', 'scripts', 'worker-staging', 'pieza-el-productor', 'fixtures', 'servicio-apify-vivo-destinos.json'), 'utf8'))
    expect(vivo.destinos_validos).toContain('respuesta')
    expect(vivo.should_brain_expresion).toMatch(/destination === 'brain_rag' \|\| ctx\.destination === 'both'/)
    expect(vivo.respuesta_trae_datos).toBe(true)
  })

  it('el código de la herramienta ya no menciona `brain_rag` como destino (el control sobre el texto; un destino nuevo exigiría tocar esta prueba)', () => {
    const js = readFileSync(resolve(__dirname, '..', 'mcp', 'apify-service-server.js'), 'utf8')
    expect(js).not.toMatch(/destination:\s*'brain_rag'/)
    expect(js).toMatch(/destination:\s*'respuesta'/)
  })
})
