-- Migration · LEDGER DE DESPACHO · agent_dispatches · 2026-07-19
-- Fix raíz (a) del ejecutor durable · spec convergida consejero+arquitecto 2026-07-19
-- (deliberación #equipo 13:24 → 14:22). Cierra la clase "accepted-sin-invocación":
-- run-sdk (Track-O fast-ack) insertaba `agent_invocations` DENTRO de `waitUntil`
-- (best-effort post-202) → si Vercel reclama la función tras el 202, la fila nunca
-- aterriza (25% en el path [RD] · 1.4% piso general · forense CC#4).
--
-- DECISIÓN A2 (convergida): ledger SEPARADO, NO reusar `agent_invocations`.
--   · intención ≠ ejecución son dos conceptos (orden de trabajo vs trabajo hecho).
--   · `agent_invocations` queda completed-only INTACTA (cero ripple plataforma-wide).
--   · semilla del event-log de despacho de la sala (ADR-018 · "una sola cosa despacha").
--
-- El INSERT de la INTENCIÓN es SÍNCRONO, ANTES del 202 (si no confirma → 5xx, JAMÁS
-- 202-sin-fila). `dispatch_key` idempotente (derivado de `workflow_id` estable) hace
-- que el re-dispatch del rescate reuse la MISMA fila. Estados: accepted → running
-- (prompt · segundos) → completed|error.
--
-- MIGRACIÓN ADITIVA · tabla NUEVA (no toca las 845 filas de `agent_invocations`).
-- `dispatch_key` NULLABLE + índice único PARCIAL (WHERE dispatch_key IS NOT NULL):
-- el contrato nuevo SIEMPRE deriva un key · el nullable es el piso defensivo (una
-- intención jamás falla por falta de key) · el parcial permite múltiples NULL y
-- fuerza unicidad sólo sobre keys reales.
--
-- §148 · MIGRACIÓN NO APLICADA A PROD acá · el apply va en el deploy en ventana
-- quieta bajo las 4 condiciones del consejero (§144 · CC#3 ejecutor del estreno).

BEGIN;

CREATE TABLE IF NOT EXISTS agent_dispatches (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Clave idempotente del despacho lógico · anclada en workflow_id estable.
  -- NULLABLE (piso defensivo · aditiva) · el contrato de app siempre la deriva.
  dispatch_key          TEXT,
  workflow_id           TEXT,
  workflow_execution_id TEXT,
  agent_name            TEXT,
  -- client_id como TEXT (no uuid) a propósito: el ledger es de INTENCIÓN · un
  -- client_id malformado no debe hacer fallar el INSERT síncrono (eso bloquearía
  -- un despacho legítimo con un 5xx). Sin FK · sin cast que pueda reventar.
  client_id             TEXT,
  status                TEXT NOT NULL DEFAULT 'accepted'
    CHECK (status IN ('accepted', 'running', 'completed', 'error')),
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  running_at            TIMESTAMPTZ,
  completed_at          TIMESTAMPTZ,
  metadata              JSONB NOT NULL DEFAULT '{}'::jsonb
);

-- Idempotencia (2 dispatches misma key ⇒ 1 fila) · índice único PARCIAL.
-- Parcial (WHERE ... IS NOT NULL) para que múltiples NULL no colisionen y la
-- unicidad recaiga sólo sobre keys reales.
CREATE UNIQUE INDEX IF NOT EXISTS agent_dispatches_dispatch_key_uq
  ON agent_dispatches (dispatch_key)
  WHERE dispatch_key IS NOT NULL;

-- El poll [RD] lee por workflow_id (accepted/running ⇒ ready:false · cero falso-timeout).
CREATE INDEX IF NOT EXISTS agent_dispatches_workflow_id_idx
  ON agent_dispatches (workflow_id)
  WHERE workflow_id IS NOT NULL;

-- El reconciliador-rescate (candado) busca "atascado en accepted pasado ~90-120s".
CREATE INDEX IF NOT EXISTS agent_dispatches_status_created_idx
  ON agent_dispatches (status, created_at);

COMMENT ON TABLE agent_dispatches IS
  'Ledger de INTENCIÓN de despacho (dispatch != execution). INSERT síncrono antes del 202 · agent_invocations queda completed-only. Semilla del event-log de la sala (ADR-018).';

COMMIT;
