-- REVERSA de 202611020300_limpieza_fase_2: devuelve lo cerrado y lo rotulado tal como estaba el 02-nov.
BEGIN;
UPDATE public.hitl_queue SET status = 'pending', resolved_by = NULL, reviewer = NULL, resolved_at = NULL, decided_at = NULL, resolution_notes = NULL, decision = '{}'::jsonb WHERE id = 'a27d3ed8-52bc-44a7-9f38-e0f639404573' AND resolved_by = 'sistema · limpieza';
UPDATE public.hitl_queue SET status = 'pending', resolved_by = NULL, reviewer = NULL, resolved_at = NULL, decided_at = NULL, resolution_notes = NULL, decision = '{}'::jsonb WHERE id = '9ccb6924-d876-4c8a-8773-a69b0ecdab76' AND resolved_by = 'sistema · limpieza';
UPDATE public.clients SET name = 'Zero Risk Seguridad Industrial' WHERE id = 'd768a78a-9883-4aec-a6d9-436d23f7ec52' AND name LIKE 'ARCHIVADA 2026-11-02%';
UPDATE public.clients SET name = 'Zero Risk Seguridad Industrial' WHERE id = '89b5d692-cb12-4670-819e-3ea131edd75d' AND name LIKE 'ARCHIVADA 2026-11-02%';
UPDATE public.clients SET name = 'Zero Risk Seguridad Industrial' WHERE id = '003cef00-c9e2-49ea-9a6b-a303338b3b5e' AND name LIKE 'ARCHIVADA 2026-11-02%';
UPDATE public.clients SET status = 'onboarding' WHERE id = 'a0000000-0000-4000-8000-0000000000e1' AND status = 'churned';
UPDATE public.finanzas_encargos SET estado = 'en_curso' WHERE id = 'd7c7187a-e8ae-47b1-bf81-d05c66778754' AND estado = 'cerrado';
COMMIT;
