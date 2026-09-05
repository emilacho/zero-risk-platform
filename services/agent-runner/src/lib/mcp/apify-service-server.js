#!/usr/bin/env node
// =============================================================
// Zero Risk — La herramienta para MIRAR AFUERA (raspado bajo pedido)
//
// ── POR QUÉ EXISTE ──────────────────────────────────────────
// Emilio, 05-sep: *"tenemos que tener el módulo de Apify preparado para las
// llamadas de los agentes"*. Hasta hoy el Servicio de Apify sólo lo llamaban
// FLUJOS. Un empleado AI que necesitaba un dato de afuera no tenía cómo pedirlo:
// respondía con lo que ya tenía en la cabeza, o no respondía.
//
// ── POR QUÉ ACÁ Y NO EN `packages/` ─────────────────────────
// Medido el 05-sep: el registro de herramientas apunta a
// `packages/apify-mcp-server/dist/index.js`, y **el Dockerfile del corredor no
// copia esa carpeta** ⇒ ese camino NUNCA pudo arrancar en producción. Los que sí
// funcionan (client-brain, discovery-output, brand-section) viven acá, en
// `src/lib/mcp/`, que es lo único que la imagen lleva adentro. Se copia el
// patrón que anda, no el que está escrito.
//
// ── POR QUÉ PEGA AL SERVICIO Y NO A APIFY ───────────────────
// Ir directo a Apify abriría una SEGUNDA puerta sin guardia por cliente, sin
// validación y sin libreta. Esta herramienta entra por la misma puerta que los
// flujos: hereda el permiso, el rechazo honesto, la libreta y la clasificación
// del cero. Una sola puerta.
//
// ── LO QUE EL EMPLEADO NO TIENE QUE SABER ───────────────────
// Ni un nombre interno de función, ni un parámetro de raspador. Dice QUÉ quiere
// mirar y DE QUIÉN. La traducción vive acá.
//
// 🔴 ADVERTENCIA QUE VIENE DE UNA LECCIÓN CARA (ver client-brain-server.js):
// montar la herramienta NO alcanza. Ese servidor quedó sin usarse porque sólo
// 3 de 17 identidades le decían al empleado que la llamara. **Si la identidad
// del empleado del plan no le dice que puede mirar afuera, esto no se va a usar
// nunca.** Eso es trabajo de identidad, no de código, y está declarado aparte.
// =============================================================

const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js')
const { StdioServerTransport } = require('@modelcontextprotocol/sdk/server/stdio.js')
const z = require('zod')

const CLIENT_ID = process.env.CLIENT_ID || ''
const PUERTA =
  process.env.APIFY_SERVICE_URL ||
  'https://n8n-production-72be.up.railway.app/webhook/apify-service-workflow'

const { CATALOGO } = require('./apify-catalogo.js')

const server = new McpServer({ name: 'zero-risk-mirar-afuera', version: '1.0.0' })

server.registerTool(
  'mirar_afuera',
  {
    title: 'Mirar afuera · pedir un dato público de un negocio',
    description:
      'Pide que se MIRE algo público de un negocio y te devuelve lo que se encontró. ' +
      'Sirve para no afirmar de memoria: si necesitás saber si un competidor pauta, ' +
      'cuántos seguidores tiene, qué dice su ficha de Maps o qué aparece al buscarlo, ' +
      'pedilo acá en vez de suponerlo. ' +
      'Decí QUÉ querés mirar y DE QUIÉN; el resto se resuelve solo. ' +
      '🔴 Leé SIEMPRE el campo `cero` de la respuesta: distingue "se miró y NO HAY" de ' +
      '"NO SE PUDO MIRAR". No son lo mismo y no se pueden escribir igual en un plan.',
    inputSchema: {
      que_mirar: z
        .enum(Object.keys(CATALOGO))
        .describe(
          Object.entries(CATALOGO).map(([k, v]) => k + ' = ' + v.para).join(' · '),
        ),
      de_quien: z
        .string()
        .min(2)
        .describe(
          'El negocio: su nombre (para mapas, anuncios de Meta, buscador y opiniones), ' +
            'su usuario sin arroba (para Instagram y TikTok) o su dominio (para anuncios de Google y tráfico).',
        ),
      donde: z
        .string()
        .nullish()
        .describe('País o ciudad · sólo para mapas y anuncios (ej. "Ecuador", "PT", "US").'),
      client_id: z
        .string()
        .nullish()
        .describe('El cliente a cuyo nombre se mira. Si no lo pasás, se usa el de la corrida.'),
    },
  },
  async (args) => {
    const entrada = CATALOGO[args.que_mirar]
    const clientId = args.client_id || CLIENT_ID
    if (!clientId) {
      return respuesta({
        se_pudo: false,
        motivo: 'no hay cliente en contexto · no se puede mirar a nombre de nadie',
      })
    }

    let r, j
    try {
      r = await fetch(PUERTA, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: clientId,
          apify_function: entrada.funcion,
          destination: 'brain_rag',
          dry_run: false,
          params: entrada.params(args),
          metadata: {
            calling_workflow_id: process.env.WORKFLOW_ID || 'agente',
            calling_workflow_execution_id: process.env.WORKFLOW_EXECUTION_ID || '',
            scope: 'agente',
            pedido_por: process.env.AGENT_SLUG || 'agente',
          },
        }),
      })
      j = await r.json()
    } catch (e) {
      return respuesta({
        se_pudo: false,
        motivo: 'no se pudo hablar con el servicio de raspado · ' + String(e.message).slice(0, 140),
      })
    }

    // El Servicio contesta 200 aunque rechace · hay que MIRAR los campos.
    if (j.ok === false || j.rechazado === true) {
      return respuesta({
        se_pudo: false,
        motivo: j.motivo || (j.errors || []).join(' · ') || 'la llamada fue rechazada',
      })
    }
    if (j.skipped === true) {
      return respuesta({
        se_pudo: false,
        motivo: j.motivo || j.skip_reason || 'no se ejecutó',
      })
    }

    return respuesta({
      se_pudo: true,
      que_se_miro: args.que_mirar,
      de_quien: args.de_quien,
      registros: j.chunks_count ?? 0,
      // 🔴 la distinción que el plan necesita · viene clasificada del Servicio
      cero: j.cero || (j.sin_resultados ? { clase: 'sin_clasificar', motivo: j.motivo_cero } : null),
      datos: j.datos || null,
      nota:
        (j.chunks_count ?? 0) > 0
          ? 'Lo encontrado quedó también en el cerebro del cliente.'
          : 'No se encontró nada · mirá el campo `cero` antes de afirmar que no existe.',
    })
  },
)

function respuesta(obj) {
  return { content: [{ type: 'text', text: JSON.stringify(obj, null, 1) }] }
}

async function main() {
  const transport = new StdioServerTransport()
  await server.connect(transport)
  process.stderr.write('[apify-service-server] listo · puerta ' + PUERTA + '\n')
}
// Sólo se enciende cuando lo arranca el corredor · si alguien lo importa (una
// prueba, por ejemplo) NO se queda esperando en la entrada de datos.
if (require.main === module) {
  main().catch((e) => {
    process.stderr.write('[apify-service-server] no arrancó · ' + e.message + '\n')
    process.exit(1)
  })
}

module.exports = { CATALOGO }
