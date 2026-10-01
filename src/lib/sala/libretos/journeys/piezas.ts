/**
 * PIEZAS libreto · DRAFT · el octavo tipo de viaje (§144 Emilio · 01-oct).
 *
 * La cadena: el parte de trabajo está listo → sobre a la sala (`brief/parte-listo` · `producir`) → la sala despacha PIEZAS.
 * Produce UNA cosa por sobre: la pieza de UN brief del parte (titular · texto principal · prompt de imagen en positivo · lo que no pudo cumplir),
 * guardada con su brief, su prompt y su fuente de imagen declarada (`client_historical_outputs` · `campaign_piece`).
 *
 * Un solo agente (`campaign-brief-agent`) y SIN juez: los chequeos que importan comparan lo PEDIDO contra lo HECHO, son contables y corren gratis en código
 * dentro del propio flujo. Lo que falle se DECLARA (candidatos, no veredictos) y decide quien aprueba. El nombre NO es `PRODUCE` (ese es planeación).
 *
 * El flujo n8n que lo ejecuta es `lVCLzxQCKNkd3uS0` (webhook `zero-risk/pieza`).
 */
import type { Libreto } from '../types'

export const piezasLibreto: Libreto = {
  journey_type: 'PIEZAS',
  version: 1,
  description:
    'La pieza · un agente lee UN brief del parte, mira las fotos reales del cliente y escribe la pieza · chequeos contables en código (sin juez) · lo que falle se declara',
  entry_step_id: 'redactar_pieza',
  steps: [
    {
      step_id: 'redactar_pieza',
      step_type: 'action',
      agent_id: 'campaign-brief-agent',
      description: 'Escribir la pieza · titular + texto + prompt de imagen en positivo · declara lo que miró y lo que no pudo cumplir',
      retry_budget: {
        max_attempts: 1,
        initial_backoff_ms: 2000,
        max_backoff_ms: 60_000,
        on_exhausted: 'gate_hitl',
      },
      next_step: { kind: 'static', step_id: 'pieza_lista' },
    },
    {
      step_id: 'pieza_lista',
      step_type: 'terminal_success',
      description: 'Pieza guardada (client_historical_outputs · campaign_piece) con su brief, su prompt y su fuente de imagen',
    },
  ],
  metadata: {
    source_workflow: 'lVCLzxQCKNkd3uS0',
    status: 'draft',
    notes:
      'Libreto mínimo del octavo tipo · el flujo n8n hace los chequeos y el guardado. Sin juez. Una sola llamada paga por pieza (tope de fábrica US$ 0,60 · cota, no medición) · SIN reintento automático.',
  },
}
