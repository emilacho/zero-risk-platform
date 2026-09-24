/**
 * E126 · CC#1 · 2026-09-24 · «El descubridor no pide revisión» · prueba a costo cero con datos GRABADOS de E121.
 *
 * Firma CC#3 (E126-FIRMA-CC3-lista-de-lo-que-se-anula.md) · condición 4: «con los datos grabados del descubridor de
 * E121: misma entrada → misma respuesta del alta, mismo discovery_output, misma fila en agent_invocations. Lo único que
 * debe desaparecer es la fila de aprobación».
 *
 * Qué prueba (sin corrida · US$ 0):
 *  1. `onboarding-specialist` ya no está en EDITOR_WHITELIST ⇒ run-sdk salta el revisor
 *     (route.ts:1353-1356 · `!requiresEditorReview(canonicalSlug)`) ⇒ no llama 3 veces a /api/agents/run ⇒ no inserta
 *     en hitl_pending_approvals (editor-middleware.ts:450, la única tabla que el revisor toca).
 *  2. Los otros cinco agentes del journey nunca estuvieron en la lista (nada cambia para ellos) y los 14 agentes que
 *     quedan siguen en la lista (alcance = sólo el descubridor · condición 1).
 *  3. Lo que el alta RECIBE del descubridor, grabado en la ejecución 150440 (E121), no contiene los dos campos que el
 *     cambio quita de la respuesta de run-sdk (`editor_review` · `escalated_to_hitl`): ni el acuse del despacho
 *     fire+forget ni la respuesta del sondeo a /api/onboarding/discovery-status. ⇒ misma entrada, misma salida del alta.
 *  4. El sondeo se arma desde agent_invocations (output_summary · metadata.response_length · discovery_output), fila que
 *     escribe el corredor (services/agent-runner/src/lib/agent-invocations-log.ts:43) ANTES de que Vercel corra el
 *     revisor, y run-sdk no la actualiza después ⇒ misma fila.
 * Lo que NO prueba: una invocación real por run-sdk (la puerta canónica de ensayo y6H7nG3FGrmCGccP llama al corredor
 * directo y no pasa por el revisor). La primera corrida real posterior debe mostrar 0 filas nuevas (certifica CC#3).
 */
import { describe, it, expect } from "vitest"
import { EDITOR_WHITELIST, requiresEditorReview, getEditorConfig, PRIMARY_REVIEWER, SECOND_REVIEWER, THIRD_REVIEWER } from "@/lib/editor-routing"

const AGENTES_DEL_JOURNEY = ["onboarding-specialist", "competitive-intelligence-agent", "brand-strategist", "editor-en-jefe", "jefe-client-success", "campaign-brief-agent"]
const LOS_14_QUE_QUEDAN = ["creative-director","content-creator","video-editor","web-designer","seo-specialist","cro-specialist","email-marketer","social-media-strategist","community-manager","review-responder","influencer-manager","pr-earned-media-manager","sales-enablement","reporting-agent"]

// Grabado en raw/evidencia/2026-09-24-E121/ejecucion-150440-alta.json (copias en raw/evidencia/2026-09-24-E126/).
const ACUSE_DEL_DESPACHO_150440 = {"accepted":true,"will_callback":true,"callback_url":"[TACHADO · resumeUrl de n8n]","ack_timestamp":"2026-09-24T15:48:51.077Z","dispatch_key":"dispatch:75e14761-3e02-5b05-8871-c45a00a0efb4:onboarding-specialist:150440"}
const RESPUESTA_DEL_SONDEO_150440 = {"ok":true,"ready":true,"client_id":"058d06c4-7d83-4616-9ebc-290ca8752018","status":"completed","response":"Voy a cargar los schemas necesarios y lanzar búsquedas paralelas de competidores en Guayaquil mientras sintetizo la info…[recortado en la prueba · largo real 2001]","response_complete":false,"response_truncated":true,"response_length_stored":2001,"response_length_real":2392,"response_note":"RESPUESTA RECORTADA · guardados 2000 de 2392 caracteres (84 %) · NO leer como entera · la parte perdida no se recupera de esta fila","discovery_output":{"own_handles":{"instagram":"@naufrago.ec"},"competitors":[{"name":"Pez Azul","handles":{"facebook":"PezAzulECUADOR","instagram":"@pezazulecuador"},"website":"https://www.pezazul.com.ec","competitor_type":"direct"},{"name":"El Pez Volador","competitor_type":"direct"},{"name":"La Casa del Encebollado","handles":{"facebook":"La-Casa-Del-Encebollado-100032190915998","instagram":"@lacasadelencebollado"},"website":"https://lacasadelencebollado.ec","competitor_type":"direct"},{"name":"Encebollado Cuarto de Libra","handles":{"instagram":"@encebolladocdl"},"website":"https://www.cuartodelibraplazadanin.com","competitor_type":"direct"},{"name":"Don Rabioso Ceviches y Encebollados","competitor_type":"direct"},{"name":"ROCOTO Cevichería","handles":{"tiktok":"@rocotocevicheria","instagram":"@rocotocevicheria"},"competitor_type":"indirect"},{"name":"Marrecife Marisquería","competitor_type":"direct"},{"name":"Operadores delivery-native encebollado/ceviche (Uber Eats / Rappi Guayaquil)","competitor_type":"alternative"}]},"cost_usd":0.357456}

const CAMPOS_QUE_DESAPARECEN = ["editor_review", "escalated_to_hitl"]

describe("E126 · el descubridor ya no pide revisión editorial (anulado con firma de CC#3)", () => {
  it("1 · onboarding-specialist fuera de la lista ⇒ run-sdk salta el revisor ⇒ sin fila en hitl_pending_approvals", () => {
    expect(EDITOR_WHITELIST).not.toHaveProperty("onboarding-specialist")
    expect(requiresEditorReview("onboarding-specialist")).toBe(false)
    expect(requiresEditorReview("onboarding_specialist")).toBe(false)
    expect(getEditorConfig("onboarding-specialist")).toBeNull()
  })

  it("2 · alcance: sólo el descubridor · los otros 5 del journey nunca estuvieron · los 14 restantes siguen", () => {
    for (const slug of AGENTES_DEL_JOURNEY) expect(requiresEditorReview(slug), slug).toBe(false)
    expect(Object.keys(EDITOR_WHITELIST).sort()).toEqual([...LOS_14_QUE_QUEDAN].sort())
    for (const slug of LOS_14_QUE_QUEDAN) expect(getEditorConfig(slug), slug).not.toBeNull()
    expect([PRIMARY_REVIEWER, SECOND_REVIEWER, THIRD_REVIEWER]).toEqual(["editor-en-jefe", "brand-strategist", "jefe-client-success"])
  })

  it("3 · lo que el alta recibió del descubridor en 150440 no lleva los campos que el cambio quita ⇒ misma entrada, misma salida", () => {
    for (const campo of CAMPOS_QUE_DESAPARECEN) {
      expect(ACUSE_DEL_DESPACHO_150440, "acuse del despacho fire+forget").not.toHaveProperty(campo)
      expect(RESPUESTA_DEL_SONDEO_150440, "respuesta de discovery-status").not.toHaveProperty(campo)
    }
    // el acuse es un 202 puro: lo que run-sdk devuelve ANTES de correr al agente y al revisor
    expect(Object.keys(ACUSE_DEL_DESPACHO_150440).sort()).toEqual(["accepted", "ack_timestamp", "callback_url", "dispatch_key", "will_callback"])
    expect(ACUSE_DEL_DESPACHO_150440.accepted).toBe(true)
    // el sondeo trae exactamente lo que el alta consume aguas abajo · nada del revisor
    expect(RESPUESTA_DEL_SONDEO_150440.ready).toBe(true)
    expect(RESPUESTA_DEL_SONDEO_150440.status).toBe("completed")
    expect(RESPUESTA_DEL_SONDEO_150440.discovery_output.competitors).toHaveLength(8)
    expect(RESPUESTA_DEL_SONDEO_150440.cost_usd).toBeCloseTo(0.357456, 6)
    expect(Object.keys(RESPUESTA_DEL_SONDEO_150440).sort()).toEqual(["client_id","cost_usd","discovery_output","ok","ready","response","response_complete","response_length_real","response_length_stored","response_note","response_truncated","status"])
  })
})
