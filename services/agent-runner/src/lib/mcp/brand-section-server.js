#!/usr/bin/env node
// =============================================================
// Brand Section MCP Server (Railway · stdio · CJS)
//
// Spec · SPEC-brand-book-build-colaborativo-cero-humano-2026-06-29.
// Causa raíz (CC#4 2026-06-30) · las lentes (brand-strategist · editor-en-jefe
// · jefe-client-success) NARRABAN en vez de emitir JSON estructurado → el
// consolidador no podía extraer la sección → fidelidad 0 → no brand book.
//
// Fix · mismo patrón que emit_discovery_output: un tool `emit_brand_section`
// que cada lente invoca con SU sección estructurada · el SDK valida los args
// contra el zod schema ANTES de llamar al tool · el runner captura el tool_use
// y lo surface en response.body.brand_section. Cero parsing de texto narrativo.
//
// Launched by agent-sdk-runner.ts solo para las lentes en BRAND_SECTION_ALLOW
// (ver agent-mcp-registry.ts) · gated por SALA_DISCOVERY_BRAIN_PUSH_ENABLED
// (mismo flag que discovery · reusa el toggle de la capa de síntesis).
// =============================================================

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const z = require('zod')

const CLIENT_ID = process.env.CLIENT_ID || ''

// ── zod schema · campos del brand book draft (todos opcionales · cada lente
// llena SU sección · el consolidador funde las 3). Mirror del shape que lee
// el nodo consolidador del worker.
const BRAND_SECTION_INPUT_SCHEMA = {
  lens: z
    .enum(['brand-strategist', 'editor-en-jefe', 'jefe-client-success'])
    .describe('Qué lente sos · determina qué campos llenás'),
  // brand-strategist
  positioning: z.string().optional().describe('Posicionamiento · 1-2 frases grounded en la evidencia'),
  icp_summary: z.string().optional().describe('Resumen del ICP · audience_segment + pains + goals'),
  // editor-en-jefe
  voice_description: z.string().optional().describe('Principios de voz/tono concretos y testeables'),
  forbidden_words: z.array(z.string()).optional().describe('Palabras/frases que NUNCA usar'),
  required_terminology: z.array(z.string()).optional().describe('Términos que usar cuando aplique'),
  // jefe-client-success
  customer_angle: z.string().optional().describe('Ángulo cliente · qué valora / por qué se queda'),
  retention_notes: z.string().optional().describe('Notas de retención'),
}

const server = new McpServer({ name: 'brand-section', version: '1.0.0' })

server.registerTool(
  'emit_brand_section',
  {
    title: 'Emit Brand Book Section',
    description:
      'Emití TU sección estructurada del brand book. Llamá esto UNA VEZ al final, ' +
      'cuando tengas tu sección lista, grounded en la evidencia real del cliente. ' +
      'Llená SOLO los campos de tu lente (los demás dejalos vacíos). Los args se ' +
      'validan contra un schema estricto. NO narres · usá el tool · es la ÚNICA forma ' +
      'en que tu sección llega al consolidador.',
    inputSchema: BRAND_SECTION_INPUT_SCHEMA,
  },
  async (args) => {
    const filled = Object.keys(args).filter((k) => k !== 'lens' && args[k] != null).length
    process.stderr.write(
      `[brand-section-server] emit_brand_section · lens=${args.lens} · campos=${filled} · client=${CLIENT_ID || '(none)'}\n`,
    )
    return {
      content: [
        {
          type: 'text',
          text:
            `OK · sección de ${args.lens} recibida (${filled} campos). ` +
            'Podés parar · el consolidador fusiona las 3 lentes.',
        },
      ],
    }
  },
)

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write(`[brand-section-server] Started for client=${CLIENT_ID || '(none)'}\n`)
}

main().catch((err) => {
  process.stderr.write(`[brand-section-server] Fatal: ${err.message}\n`)
  process.exit(1)
})
