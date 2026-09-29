/**
 * BRIEF libreto · DRAFT · el séptimo tipo de viaje (§144 Emilio · 29-sep).
 *
 * La cadena: planeación termina → sobre a la sala (`planeacion/plan-listo` · `briefear`) → la sala despacha BRIEF.
 * Produce UNA cosa: el parte de trabajo · la lista cerrada de entregables del plan, cada uno con su brief
 * (`00-meta/REFERENCIA-el-brief-de-un-entregable.md`).
 *
 * Un solo agente (`campaign-brief-agent`) y, por criterio de Emilio, SIN juez: los chequeos que importan son
 * contables y corren gratis en código dentro del propio flujo (`brief-chequeos.js`, nodo ④). Por eso el libreto es
 * mínimo: un paso de acción y el cierre. Lo que falle se DECLARA en el parte, no se corrige solo.
 *
 * El flujo n8n que lo ejecuta es `PQdIgbuFexuBsoh8` (webhook `zero-risk/brief`).
 */
import type { Libreto } from '../types'

export const briefLibreto: Libreto = {
  journey_type: 'BRIEF',
  version: 1,
  description:
    'Parte de trabajo · un agente baja el plan de 90 días a entregables con su brief · chequeos contables en código (sin juez) · lo que falle se declara',
  entry_step_id: 'redactar_parte',
  steps: [
    {
      step_id: 'redactar_parte',
      step_type: 'action',
      agent_id: 'campaign-brief-agent',
      description: 'Redactar el parte · lista de entregables + un brief por cada uno · declara huecos y contradicciones plan↔manual',
      retry_budget: {
        max_attempts: 1,
        initial_backoff_ms: 2000,
        max_backoff_ms: 60_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'parte_listo' },
    },
    {
      step_id: 'parte_listo',
      step_type: 'terminal_success',
      description: 'Parte de trabajo guardado (client_historical_outputs · campaign_brief_pack) y enviado a Drive',
    },
  ],
  metadata: {
    source_workflow: 'PQdIgbuFexuBsoh8',
    status: 'draft',
    notes:
      'Libreto mínimo del séptimo tipo · el flujo n8n hace los chequeos y el guardado. Sin juez por criterio de Emilio. Una sola corrida paga (~US$ 0,50 esperados).',
  },
}
