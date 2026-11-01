-- 01-nov · ENCARGO Lenovo firmado por Emilio · sin topes de tamaño arbitrarios · CC1
-- Lo que escribe el dueño tenía 4.000 caracteres en el pedido de cambios del plan y 2.000 en sus notas. Solo amplía: ninguna fila cambia.
BEGIN;
ALTER TABLE public.plan_cambios DROP CONSTRAINT IF EXISTS plan_cambios_texto_check;
ALTER TABLE public.plan_cambios ADD CONSTRAINT plan_cambios_texto_check CHECK (char_length(texto) BETWEEN 5 AND 100000);
ALTER TABLE public.notas_del_dueno DROP CONSTRAINT IF EXISTS notas_del_dueno_comentario_check;
ALTER TABLE public.notas_del_dueno ADD CONSTRAINT notas_del_dueno_comentario_check CHECK (comentario IS NULL OR char_length(comentario) BETWEEN 1 AND 100000);
COMMIT;
NOTIFY pgrst, 'reload schema';
