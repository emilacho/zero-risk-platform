-- 10-nov · LAS FILAS QUE QUEDARON ATRÁS SIN PRODUCIR · la mesa de REUBICACIÓN de la oficina (GO de Lenovo 18:14Z · camino A aceptado 18:24Z).
--   1) la plantilla `reubicacion_mesa`: un solo paso mesa, tope US$ 3,00 por decisión (límites al máximo; el gasto real queda en el libro de costos), una ronda, plazo de la mesa 30 min.
--   2) el directorio: `jefe-marketing` (la fila ya existe, inactiva, como miembro sin mesas) pasa a DIRIGIR la reubicación (`reubicacion:dirige`). Ninguna otra mesa lo toma: la pertinencia es por tipo
--      y una dirección con `:dirige` no es el respaldo de las mesas de piezas.
--   NACE INACTIVA: la plantilla y la tarjeta se siembran con activo=false. Encender (plantilla + tarjeta + `cadena_config.reubicar_filas_pasadas`) es otro GO.
--   Datos puros de la oficina: no crea tablas. Compatible con el código viejo. NO APLICADA. Reversa: supabase/reversas/202611110000_oficina_mesa_de_reubicacion_REVERSA.sql
BEGIN;

UPDATE public.oficina_directorio
   SET rol = 'direccion',
       especialidad = 'decide qué hacer con las filas del calendario que quedaron atrás sin producir: reubicarlas, fusionarlas con una que viene o descartarlas, cada una con su razón',
       pertinente_en = ARRAY['reubicacion:dirige'],
       activo = false,
       actualizado_en = now()
 WHERE agente = 'jefe-marketing';

INSERT INTO public.oficina_tipos_de_grupo (tipo, familia, pasos, indicaciones, modelos, limites, max_rondas, tope_encargo_usd, activo) VALUES (
  'reubicacion_mesa', 'reubicacion_mesa',
  $pasos$[{"clave":"mesa","tipo":"codigo","quien":"sala","funcion":"mesa","condicion":{"tipo":"siempre"},"entrada":[],"salida_artefacto":"mesa","tope_usd":0}]$pasos$::jsonb,
  $ind${}$ind$::jsonb,
  '{}'::jsonb,
  $lim${"margen":60,"tope_encargo_usd":3,"max_rondas":1,"mesa":true,"plazo_mesa_min":30}$lim$::jsonb,
  1, 3.00, false
) ON CONFLICT (tipo) DO NOTHING;

DO $$
DECLARE p int; d int;
BEGIN
  SELECT count(*) INTO p FROM public.oficina_tipos_de_grupo WHERE tipo = 'reubicacion_mesa';
  SELECT count(*) INTO d FROM public.oficina_directorio WHERE agente = 'jefe-marketing' AND rol = 'direccion' AND pertinente_en = ARRAY['reubicacion:dirige'];
  IF p <> 1 THEN RAISE EXCEPTION 'falta la plantilla reubicacion_mesa'; END IF;
  IF d <> 1 THEN RAISE EXCEPTION 'jefe-marketing no quedó como dirección de la reubicación (¿no existe su fila en el directorio?)'; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
