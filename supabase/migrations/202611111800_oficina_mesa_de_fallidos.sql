-- 11-nov · UN ENCARGO FALLIDO QUE YA GASTÓ SE REHACE SOLO CUANDO SU CAUSA YA ESTÁ ARREGLADA · la mesa de REVISIÓN DE FALLIDOS de la oficina (GO de Lenovo 16:46 Zúrich · decisión de Emilio 16:43).
--   1) la plantilla `fallidos_mesa`: un solo paso mesa, clase interna, tope US$ 2,00 por revisión, una ronda, plazo de la mesa 30 min.
--   2) el directorio: `jefe-marketing` (ya dirige la reubicación) también DIRIGE la revisión de fallidos (`fallidos:dirige`); su especialidad pasa a nombrar las dos cosas.
--      Su estado (activo) NO se toca: hoy dirige la reubicación encendida.
--   NACE INACTIVA: la plantilla se siembra con activo=false. Encender (plantilla + `cadena_config.rehacer_fallidos_corregidos`) es otro GO.
--   Datos puros de la oficina: no crea tablas. Compatible con el código viejo (una familia que el código no conoce no abre). Reversa: supabase/reversas/202611111800_oficina_mesa_de_fallidos_REVERSA.sql
BEGIN;

UPDATE public.oficina_directorio
   SET especialidad = 'decide qué hacer con lo que la campaña dejó atrás: las filas del calendario que pasaron sin producirse (reubicarlas, fusionarlas con una que viene o descartarlas) y las piezas que fallaron después de gastar (rehacerlas si un cambio publicado ya corrigió su causa, o dejarlas), cada una con su razón',
       pertinente_en = ARRAY['reubicacion:dirige', 'fallidos:dirige'],
       actualizado_en = now()
 WHERE agente = 'jefe-marketing' AND rol = 'direccion' AND pertinente_en = ARRAY['reubicacion:dirige'];

INSERT INTO public.oficina_tipos_de_grupo (tipo, familia, pasos, indicaciones, modelos, limites, max_rondas, tope_encargo_usd, activo, clase) VALUES (
  'fallidos_mesa', 'fallidos_mesa',
  $pasos$[{"clave":"mesa","tipo":"codigo","quien":"sala","funcion":"mesa","condicion":{"tipo":"siempre"},"entrada":[],"salida_artefacto":"mesa","tope_usd":0}]$pasos$::jsonb,
  $ind${}$ind$::jsonb,
  '{}'::jsonb,
  $lim${"margen":60,"tope_encargo_usd":2,"max_rondas":1,"mesa":true,"plazo_mesa_min":30}$lim$::jsonb,
  1, 2.00, false, 'interna'
) ON CONFLICT (tipo) DO NOTHING;

DO $$
DECLARE p int; d int;
BEGIN
  SELECT count(*) INTO p FROM public.oficina_tipos_de_grupo WHERE tipo = 'fallidos_mesa' AND clase = 'interna';
  SELECT count(*) INTO d FROM public.oficina_directorio WHERE agente = 'jefe-marketing' AND rol = 'direccion' AND pertinente_en = ARRAY['reubicacion:dirige', 'fallidos:dirige'];
  IF p <> 1 THEN RAISE EXCEPTION 'falta la plantilla fallidos_mesa'; END IF;
  IF d <> 1 THEN RAISE EXCEPTION 'jefe-marketing no quedó como dirección de la revisión de fallidos (¿cambió su tarjeta?)'; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
