-- REVERSA de 202611162230_oficina_biblioteca_de_planos_y_ritmos_de_video.sql · borra las dos tablas de referencia (solo las sembró esa migración).
-- El código no se rompe sin ellas: la mesa de video sigue sin la sección de la biblioteca (`bibliotecaDelTurno` toma el error como «sin biblioteca»).
BEGIN;
DROP TABLE IF EXISTS public.oficina_fichas_de_plano;
DROP TABLE IF EXISTS public.oficina_ritmos_de_video;
COMMIT;
NOTIFY pgrst, 'reload schema';
