-- La pieza APROBADA por el dueño queda marcada en su encargo · CC#2 · 2026-10-29 · GO-LENOVO-construir-dashboard-y-pieza-mesa.
-- Antes un encargo terminaba en cerrado / cerrado_por_tope / fallido y la aprobación solo se veía en la bandeja. SOLO AMPLÍA la lista (un estado más); ninguna fila cambia.
BEGIN;
ALTER TABLE public.oficina_encargos DROP CONSTRAINT IF EXISTS oficina_encargos_estado_valido;
ALTER TABLE public.oficina_encargos ADD CONSTRAINT oficina_encargos_estado_valido
  CHECK (estado IN ('abierto', 'en_paso', 'cerrado', 'cerrado_por_tope', 'fallido', 'aprobada'));
COMMIT;
