-- 17-nov · CAMBIO 4 (GO de Lenovo · firma de Emilio 17:22) · LA JEFATURA DE PIEZAS REVISA EL SENTIDO CONTRA LA FICHA DE HECHOS POR OFERTA · CC4.
--   El revisor de fondo de la política `pieza` compara lo que el público ve con el documento «Ficha de la oferta» que le manda la oficina
--   (`src/lib/oficina/sentido-contra-la-ficha.ts`, leído TAL CUAL de la hoja de la pieza). Sin ese documento no usa el rótulo (la revisión mira solo la forma, como antes).
--   El hallazgo abre su «que» con «sentido · <destino>:» y cita una línea de la ficha; el CÓDIGO verifica la cita y el destino (uno de cuatro) y lo reparte.
--   Es DATO (la indicación de la política), no código: se apaga o se reescribe con un UPDATE. Genérica: oferta, sin nombres de clientes ni de rubros.
--   Aditiva e idempotente: solo agrega la frase si aún no está. ORDEN: después de 202611172000 (misma política). NO APLICADA: se aplica en la publicación.
--   Reversa: supabase/reversas/202611180010_jefatura_pieza_sentido_contra_la_ficha_REVERSA.sql
BEGIN;

UPDATE public.jefatura_grading_policies
   SET indicacion_fondo = indicacion_fondo || ' ' || $s$Sentido contra la ficha: si recibes el documento «Ficha de la oferta», comprueba que lo que el público ve corresponda a esa oferta y que lo que la pieza afirma (fechas, precio, disponibilidad, objetivo) cuadre con la ficha en la fecha de la pieza. Si no cuadra, pon una ficha de gravedad "bloquea" cuyo «que» empiece exactamente por «sentido · <destino>:», donde <destino> es el paso que lo causó: pieza (lo puso la pieza), hoja (la hoja de la pieza trae el dato mal), calendario (la pieza no debía ir en esa fecha o para esa oferta) o banco (la idea misma choca con la ficha). Termina ese «que» con « — ficha: «<la línea de la ficha copiada tal cual>»». Si no recibes ese documento, no uses este rótulo.$s$
 WHERE artifact_type = 'pieza'
   AND indicacion_fondo IS NOT NULL
   AND indicacion_fondo NOT LIKE '%Sentido contra la ficha:%';

-- agnóstico (CC7): la vara de #1122 decía «la sede o la zona»; la unidad es la OFERTA. Solo cambia esas palabras (la reversa las devuelve).
UPDATE public.jefatura_grading_policies
   SET indicacion_fondo = replace(indicacion_fondo, 'y la sede o la zona que importan son las correctas.', 'y la oferta o la zona que importan son las correctas.')
 WHERE artifact_type = 'pieza'
   AND indicacion_fondo LIKE '%y la sede o la zona que importan son las correctas.%';

DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM public.jefatura_grading_policies WHERE artifact_type = 'pieza' AND indicacion_fondo LIKE '%Sentido contra la ficha:%';
  IF n <> 1 THEN RAISE EXCEPTION 'la política pieza debía quedar con la vara del sentido contra la ficha y hay % filas', n; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
