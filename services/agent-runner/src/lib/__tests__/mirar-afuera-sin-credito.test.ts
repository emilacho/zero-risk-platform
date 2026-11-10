/**
 * 10-nov · «sin crédito de Apify» (Lenovo por Emilio): cuando la puerta del Servicio contesta `skip_reason: 'sin_credito_apify'`, la herramienta del empleado lo dice
 * con la línea que el empleado DECLARA en su aporte («datos sin actualizar: crédito de Apify agotado hasta el …») y le pide no reintentar. Las otras respuestas no cambian.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { createServer, type Server } from 'node:http'
import { createRequire } from 'node:module'
import { resolve } from 'node:path'

const require = createRequire(import.meta.url)
const { CATALOGO } = require('../mcp/apify-catalogo.js') as { CATALOGO: Record<string, unknown> }

describe('«mirar afuera» sin crédito de Apify', () => {
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

  it('🔴 sin crédito: se_pudo false, sin_credito true y `declara` con la fecha; no pide reintentar', async () => {
    const s = await conServidor({ ok: true, skipped: true, skip_reason: 'sin_credito_apify', motivo: 'datos sin actualizar: crédito de Apify agotado hasta el 2026-11-25. No se llamó a Apify (US$ 0).', sin_credito: { hasta: '2026-11-25' } })
    try {
      const r = await pedir(s.client, Object.keys(CATALOGO)[0])
      expect(r).toMatchObject({ se_pudo: false, sin_credito: true, declara: 'datos sin actualizar: crédito de Apify agotado hasta el 2026-11-25' })
      expect(r.motivo).toContain('No se llamó a Apify')
      expect(r.nota).toContain('No reintentes')
    } finally { await s.cerrar() }
  }, 40000)
  it('sin la fecha, la línea igual se declara; otro salto sigue como siempre (sin `sin_credito`)', async () => {
    const s = await conServidor({ ok: true, skipped: true, skip_reason: 'sin_credito_apify' })
    try {
      expect(await pedir(s.client, Object.keys(CATALOGO)[0])).toMatchObject({ se_pudo: false, sin_credito: true, declara: 'datos sin actualizar: crédito de Apify agotado' })
    } finally { await s.cerrar() }
    const t = await conServidor({ ok: true, skipped: true, skip_reason: 'apify_disabled_for_client', motivo: 'el cliente no tiene Apify habilitado' })
    try {
      const r = await pedir(t.client, Object.keys(CATALOGO)[0])
      expect(r).toEqual({ se_pudo: false, motivo: 'el cliente no tiene Apify habilitado' })
    } finally { await t.cerrar() }
  }, 40000)
})
