-- REVERSA de 202611171030 · kit_mesa vuelve a sus límites de antes (sin asientos ni rondas) y la palanca se borra SOLO si sigue vacía (nadie la encendió).
-- Se niega con encargos vivos o si kit_mesa está encendida (apagarla primero es otra decisión).
BEGIN;
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.oficina_encargos WHERE estado IN ('abierto', 'en_paso')) THEN
    RAISE EXCEPTION 'reversa 202611171030: hay encargos de la oficina vivos';
  END IF;
  IF (SELECT activo FROM public.oficina_tipos_de_grupo WHERE tipo = 'kit_mesa') IS DISTINCT FROM false THEN
    RAISE EXCEPTION 'reversa 202611171030: kit_mesa está encendida; apágala antes';
  END IF;
END $$;
UPDATE public.oficina_tipos_de_grupo SET limites = $lim${"margen":50,"tope_encargo_usd":5,"max_rondas":2,"imagenes_generadas_max":8,"versiones_por_ref":2,"reuso_dias":14,"plataforma":"instagram-reel","headline_historia":60,"body_historia":140,"acompanamiento_max":700,"pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"9:16","mesa":true}$lim$::jsonb WHERE tipo = 'kit_mesa';
DELETE FROM public.cadena_config WHERE clave = 'creativos_con_mesa' AND valor = '{"clientes": []}'::jsonb;
COMMIT;
