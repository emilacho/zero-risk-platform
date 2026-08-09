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
// ── FASE 1 (CC#1 2026-08-09) · los 6 campos NUEVOS + el estampado ──────────
//
// POR QUÉ DECLARARLOS · el esquema es ABIERTO (`additionalProperties` sin
// declarar · medido con el propio SDK), así que una clave no declarada NO se
// rechaza — pero el modelo tampoco la ve en el contrato del tool, así que su
// emisión dependía SOLO del prompt: no medida, no confiable. Declararlas la
// vuelve parte del contrato.
//
// POR QUÉ SON UNIÓN Y NO TIPO PLANO · el lector del Consolidador (`tomar()`,
// plan Fase 1 de CC#2) es TOLERANTE a propósito: acepta el valor plano O el
// objeto `{valor, fuente, confianza}` y normaliza la procedencia a
// `_field_meta`. Declarar `mision: z.string()` a secas ROMPERÍA justo eso:
// verificado en vivo · un objeto donde el esquema pide cadena NO se descarta,
// se rechaza la entrega COMPLETA con `MCP -32602` (mismo modo de falla que
// tumbó el descubrimiento el 08-ago). La unión admite las DOS formas.
//
// NOTA · el transporte lleva el `input` VERBATIM (el runner captura el bloque
// `tool_use` sin validar · `agent-sdk-runner.ts`), así que este esquema NO
// decide qué dato llega: decide QUÉ SE RECHAZA y qué ve el modelo. De ahí que
// sea deliberadamente permisivo — su trabajo es no rechazar nada razonable.
const PROV = (valor) =>
  z.union([
    valor,
    z.object({
      valor: z.union([valor, z.null()]).optional(),
      fuente: z.string().optional(),
      confianza: z.union([z.number(), z.string(), z.null()]).optional(),
    }),
  ])
/** Lista de textos · admite también un texto suelto (el modelo a veces manda uno). */
const LISTA = z.union([z.array(z.string()), z.string()])

const BRAND_SECTION_INPUT_SCHEMA = {
  lens: z
    .enum(['brand-strategist', 'editor-en-jefe', 'jefe-client-success'])
    .describe('Qué lente sos · determina qué campos llenás'),
  // ── GATEADOS · NO SE TOCAN (Consejero §77 · el gate se queda en 2) ────────
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

  // ── FASE 1 · PROVISIONALES · 2 por lente · NO entran al gate ─────────────
  // Cada uno admite el valor plano O `{valor, fuente, confianza}`.
  // brand-strategist
  mision: PROV(z.string())
    .optional()
    .describe('Misión · qué hace la marca y para quién · PROVISIONAL (no gateado)'),
  propuestas_de_valor: PROV(LISTA)
    .optional()
    .describe('Propuestas de valor · lista · PROVISIONAL (no gateado)'),
  // editor-en-jefe
  personalidad: PROV(LISTA)
    .optional()
    .describe('Personalidad de marca · rasgos · PROVISIONAL (no gateado)'),
  tagline_opciones: PROV(LISTA)
    .optional()
    .describe('2-3 OPCIONES de tagline · es una ELECCIÓN humana, no un hecho · PROVISIONAL'),
  // jefe-client-success
  mensajes_clave: PROV(LISTA)
    .optional()
    .describe('Mensajes clave · lista · PROVISIONAL (no gateado)'),
  proposito: PROV(z.string())
    .optional()
    .describe('Propósito · por qué existe la marca más allá de vender · PROVISIONAL (no gateado)'),

  // Estampado por campo · alternativa a la forma-objeto: en vez de envolver
  // cada valor, se manda la procedencia junta acá. El Consolidador la fusiona
  // con la que derive de los `{valor,fuente,confianza}`. Permisivo a propósito.
  _field_meta: z
    .record(z.string(), z.unknown())
    .optional()
    .describe('Procedencia por campo · { <campo>: { fuente, confianza } } · opcional'),
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

// ── Fidelity scores · el JUDGE (editor-en-jefe) emite sus scores estructurados
// vía tool en vez de narrar (fix exec 41641 · el judge narraba → scores 0).
const FIDELITY_SCORES_INPUT_SCHEMA = {
  scores: z
    .object({
      positioning: z.number().min(0).max(1).optional(),
      icp_summary: z.number().min(0).max(1).optional(),
      voice_description: z.number().min(0).max(1).optional(),
      customer_angle: z.number().min(0).max(1).optional(),
      retention_notes: z.number().min(0).max(1).optional(),
    })
    .describe('Score 0..1 de groundedness por campo · 1 = soportado por la evidencia · 0 = inventado'),
}

server.registerTool(
  'emit_fidelity_scores',
  {
    title: 'Emit Fidelity Scores',
    description:
      'Emití tus scores de FIDELIDAD (groundedness) por campo del brand book. Cada score ' +
      '0..1 mide qué tan soportado por la EVIDENCIA real del cliente está el campo. ' +
      'Llamá esto UNA VEZ al final. NO narres · usá el tool · es la única forma en que tus ' +
      'scores llegan al decisor de canon.',
    inputSchema: FIDELITY_SCORES_INPUT_SCHEMA,
  },
  async (args) => {
    const n = Object.keys(args.scores ?? {}).length
    process.stderr.write(
      `[brand-section-server] emit_fidelity_scores · campos=${n} · client=${CLIENT_ID || '(none)'}\n`,
    )
    return { content: [{ type: 'text', text: `OK · ${n} scores de fidelidad recibidos. Podés parar.` }] }
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
