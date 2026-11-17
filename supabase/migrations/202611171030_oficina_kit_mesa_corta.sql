-- 202611171030 · LA MESA CORTA DE LAS HISTORIAS · CC3 · «creativos en cada paso» (GO Lenovo 17-nov · firma de Emilio 07:18 · punto 1)
-- Solo DATO, y la plantilla sigue APAGADA (activo=false): esto no enciende nada.
--   1) `oficina_tipos_de_grupo` kit_mesa · `limites` suma `asientos` (los 3 especialistas que se sientan: dirección visual, prompts, texto) y `rondas_de_la_mesa` = 1.
--      Es el dato EXACTO de src/lib/oficina/plantillas/mesa.ts (KIT_MESA); una prueba lo mantiene igual. Pasos, indicaciones, tope (5) y activo NO cambian.
--   2) `cadena_config.creativos_con_mesa` = {"clientes": []} · la palanca por cliente, APAGADA para todos (ausente o vacía = la ruta de siempre). Si ya existe, no se toca.
-- Encender = otro GO (aviso a Emilio): activo=true de kit_mesa, kit_mesa en `oficina_config.familias_activas` y el cliente en la palanca.
-- ORDEN: cualquiera después de 202610281500. Se niega con encargos vivos. Reversa: reversas/202611171030_oficina_kit_mesa_corta_REVERSA.sql
BEGIN;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION '202611171030: hay encargos de la oficina vivos; esperar a que cierren';
  END IF;
  IF (SELECT limites FROM public.oficina_tipos_de_grupo WHERE tipo = 'kit_mesa') IS DISTINCT FROM $lim_antes${"margen":50,"tope_encargo_usd":5,"max_rondas":2,"imagenes_generadas_max":8,"versiones_por_ref":2,"reuso_dias":14,"plataforma":"instagram-reel","headline_historia":60,"body_historia":140,"acompanamiento_max":700,"pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"9:16","mesa":true}$lim_antes$::jsonb THEN
    RAISE EXCEPTION '202611171030: los límites de kit_mesa no son los esperados; no se pisan';
  END IF;
  IF (SELECT activo FROM public.oficina_tipos_de_grupo WHERE tipo = 'kit_mesa') IS DISTINCT FROM false THEN
    RAISE EXCEPTION '202611171030: kit_mesa no está apagada; esta migración no la toca encendida';
  END IF;
END $$;

UPDATE public.oficina_tipos_de_grupo SET limites = $lim${"margen":50,"tope_encargo_usd":5,"max_rondas":2,"imagenes_generadas_max":8,"versiones_por_ref":2,"reuso_dias":14,"plataforma":"instagram-reel","headline_historia":60,"body_historia":140,"acompanamiento_max":700,"pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"9:16","mesa":true,"asientos":["marketing_instagram_curator","design-image-prompt-engineer","content-creator"],"rondas_de_la_mesa":1}$lim$::jsonb WHERE tipo = 'kit_mesa';

INSERT INTO public.cadena_config (clave, valor) VALUES ('creativos_con_mesa', '{"clientes": []}'::jsonb) ON CONFLICT (clave) DO NOTHING;

DO $$
BEGIN
  IF (SELECT limites->'rondas_de_la_mesa' FROM public.oficina_tipos_de_grupo WHERE tipo = 'kit_mesa') IS DISTINCT FROM '1'::jsonb
     OR (SELECT jsonb_array_length(limites->'asientos') FROM public.oficina_tipos_de_grupo WHERE tipo = 'kit_mesa') IS DISTINCT FROM 3
     OR (SELECT activo FROM public.oficina_tipos_de_grupo WHERE tipo = 'kit_mesa') IS DISTINCT FROM false THEN
    RAISE EXCEPTION '202611171030: kit_mesa no quedó como mesa corta apagada';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cadena_config WHERE clave = 'creativos_con_mesa') THEN
    RAISE EXCEPTION '202611171030: falta la palanca creativos_con_mesa';
  END IF;
END $$;

COMMIT;
