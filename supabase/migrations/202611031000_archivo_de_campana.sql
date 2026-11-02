-- 03-nov · ENCARGO Lenovo pedido por Emilio · archivo de una campaña anterior · CC1
-- Se marca sin borrar y sin tocar el estado de filas ni piezas: volver atrás es quitar la marca. Las esperas sí se cancelan, porque el reloj las ejecuta sin mirar la campaña.
BEGIN;

ALTER TABLE public.cadena_campanas ADD COLUMN IF NOT EXISTS archivada_en timestamptz;
ALTER TABLE public.cadena_campanas ADD COLUMN IF NOT EXISTS archivo_motivo text;
ALTER TABLE public.cadena_campanas ADD COLUMN IF NOT EXISTS estado_antes_de_archivar text;
ALTER TABLE public.cadena_campanas ADD COLUMN IF NOT EXISTS motivo_antes_de_archivar text;

ALTER TABLE public.cadena_calendario_filas ADD COLUMN IF NOT EXISTS archivada_en timestamptz;
ALTER TABLE public.cadena_calendario_filas ADD COLUMN IF NOT EXISTS archivo_motivo text;

ALTER TABLE public.cadena_esperas ADD COLUMN IF NOT EXISTS archivada_en timestamptz;

ALTER TABLE public.oficina_encargos ADD COLUMN IF NOT EXISTS archivada_en timestamptz;
ALTER TABLE public.oficina_encargos ADD COLUMN IF NOT EXISTS archivo_motivo text;

ALTER TABLE public.hitl_queue ADD COLUMN IF NOT EXISTS archivada_en timestamptz;
ALTER TABLE public.hitl_queue ADD COLUMN IF NOT EXISTS archivo_motivo text;

CREATE INDEX IF NOT EXISTS cadena_calendario_filas_archivadas ON public.cadena_calendario_filas (campana_id) WHERE archivada_en IS NOT NULL;
CREATE INDEX IF NOT EXISTS hitl_queue_archivadas ON public.hitl_queue (client_id) WHERE archivada_en IS NOT NULL;

COMMIT;
NOTIFY pgrst, 'reload schema';
