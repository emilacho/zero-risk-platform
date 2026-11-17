-- 17-nov · LA MESA «CORRECCIÓN DEL BANCO» de la oficina (GO de Lenovo · cambio 4 · RESPUESTA-LENOVO-a-CC1-CC3-CC4-puerto-banco-y-regla-dura-no-tomada).
--   La jefatura devuelve una corrección sobre UNA idea del banco a su creador: la dirección de la gran idea la toma entera, en parte o no la toma.
--   1) la plantilla `banco_mesa`: un solo paso mesa, clase interna, tope US$ 1,50 por corrección, una ronda, plazo de la mesa 30 min.
--   2) el directorio: `creative-director-mesa` (dirige la gran idea) también DIRIGE la corrección del banco (`banco:dirige`). Su estado (activo) NO se toca.
--   NACE INACTIVA: la plantilla se siembra con activo=false. Encender (plantilla + `cadena_config.corregir_el_banco`) es otro GO, para la prueba final.
--   Datos puros de la oficina: no crea tablas. Compatible con el código viejo (una familia que el código no conoce no abre). Reversa: supabase/reversas/202611180030_oficina_mesa_de_correccion_del_banco_REVERSA.sql
BEGIN;

UPDATE public.oficina_directorio
   SET pertinente_en = ARRAY['carrusel', 'kit', 'concepto:dirige', 'video:dirige', 'post', 'banco:dirige'],
       actualizado_en = now()
 WHERE agente = 'creative-director-mesa' AND rol = 'direccion' AND pertinente_en = ARRAY['carrusel', 'kit', 'concepto:dirige', 'video:dirige', 'post'];

INSERT INTO public.oficina_tipos_de_grupo (tipo, familia, pasos, indicaciones, modelos, limites, max_rondas, tope_encargo_usd, activo, clase) VALUES (
  'banco_mesa', 'banco_mesa',
  $pasos$[{"clave":"mesa","tipo":"codigo","quien":"sala","funcion":"mesa","condicion":{"tipo":"siempre"},"entrada":[],"salida_artefacto":"mesa","tope_usd":0}]$pasos$::jsonb,
  $ind${}$ind$::jsonb,
  '{}'::jsonb,
  $lim${"margen":60,"tope_encargo_usd":1.5,"max_rondas":1,"mesa":true,"plazo_mesa_min":30}$lim$::jsonb,
  1, 1.50, false, 'interna'
) ON CONFLICT (tipo) DO NOTHING;

DO $$
DECLARE p int; d int;
BEGIN
  SELECT count(*) INTO p FROM public.oficina_tipos_de_grupo WHERE tipo = 'banco_mesa' AND clase = 'interna';
  SELECT count(*) INTO d FROM public.oficina_directorio WHERE agente = 'creative-director-mesa' AND rol = 'direccion' AND pertinente_en = ARRAY['carrusel', 'kit', 'concepto:dirige', 'video:dirige', 'post', 'banco:dirige'];
  IF p <> 1 THEN RAISE EXCEPTION 'falta la plantilla banco_mesa'; END IF;
  IF d <> 1 THEN RAISE EXCEPTION 'creative-director-mesa no quedó como dirección de la corrección del banco (¿cambió su tarjeta?)'; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
