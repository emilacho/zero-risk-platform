-- 02-nov · LIMPIEZA, FASE 2 · decisiones de Emilio traídas por Lenovo · CC#1 · US$ 0. Nada se borra: se cierra o se rotula. Reversa: supabase/reversas/202611020300_limpieza_fase_2_REVERSA.sql
--   · Cierra 2 decisiones viejas. Van como vencidas: no son un rechazo del dueño y el aprendizaje no las cuenta.
--   · Rotula las 3 fichas viejas de Zero Risk y da de baja la ficha de prueba que seguía en alta. Los procesos usan el id, no el nombre.
--   · Cierra el encargo de prueba de finanzas que quedó en curso el 19-oct.
--   No toca Peniche (ya dado de baja y oculto), GoEurope ni «bodega». No toca el cerebro. Las esperas de la campaña vieja las cancela el código al reemplazarla.
BEGIN;

UPDATE public.hitl_queue SET status = 'rejected', resolved_by = 'sistema · limpieza', reviewer = 'sistema · limpieza', resolved_at = now(), decided_at = now(), resolution_notes = 'La lista de competidores no es una decisión del dueño: la hace el sistema',
  decision = jsonb_build_object('decision', 'rejected', 'por', 'sistema · limpieza', 'cuando', now(), 'vencida', true, 'motivo', 'La lista de competidores no es una decisión del dueño: la hace el sistema')
  WHERE id = 'a27d3ed8-52bc-44a7-9f38-e0f639404573' AND status = 'pending';
UPDATE public.hitl_queue SET status = 'rejected', resolved_by = 'sistema · limpieza', reviewer = 'sistema · limpieza', resolved_at = now(), decided_at = now(), resolution_notes = 'Pieza de una campaña en pausa, cerrada por decisión del dueño en la limpieza',
  decision = jsonb_build_object('decision', 'rejected', 'por', 'sistema · limpieza', 'cuando', now(), 'vencida', true, 'motivo', 'Pieza de una campaña en pausa, cerrada por decisión del dueño en la limpieza')
  WHERE id = '9ccb6924-d876-4c8a-8773-a69b0ecdab76' AND status = 'pending';

UPDATE public.clients SET name = 'ARCHIVADA 2026-11-02 · ficha vieja de Zero Risk (d768a78a)' WHERE id = 'd768a78a-9883-4aec-a6d9-436d23f7ec52' AND name = 'Zero Risk Seguridad Industrial' AND status = 'churned';
UPDATE public.clients SET name = 'ARCHIVADA 2026-11-02 · ficha vieja de Zero Risk (89b5d692)' WHERE id = '89b5d692-cb12-4670-819e-3ea131edd75d' AND name = 'Zero Risk Seguridad Industrial' AND status = 'churned';
UPDATE public.clients SET name = 'ARCHIVADA 2026-11-02 · ficha vieja de Zero Risk (003cef00)' WHERE id = '003cef00-c9e2-49ea-9a6b-a303338b3b5e' AND name = 'Zero Risk Seguridad Industrial' AND status = 'churned';
UPDATE public.clients SET status = 'churned' WHERE id = 'a0000000-0000-4000-8000-0000000000e1' AND status = 'onboarding';

UPDATE public.finanzas_encargos SET estado = 'cerrado', actualizado_en = now() WHERE id = 'd7c7187a-e8ae-47b1-bf81-d05c66778754' AND estado = 'en_curso';

COMMIT;
