-- ADENDA 7 (regla de Emilio: «se trabaja con lo que hay») sobre N3 (202610301400). Cambia SOLO la función de decisión y el trigger; ninguna fila existente se toca.
--  1. Sin con qué comparar NO se re-rotula: si el cliente no tiene un sitio propio utilizable (vacío o una red social) Y no tiene cuentas propias, se conserva el rótulo que traía la fila.
--  2. Si el «sitio» es una red social o no existe, las cuentas propias del cliente siguen contando como propio (ya era así; ahora es la ÚNICA base y la prueba lo cubre).
--  3. Una fila que ya existe como «propio» NO se baja a «referencia» al re-escribirla (upsert del raspador): quitar un rótulo viejo es una decisión aparte, no un efecto de una re-lectura.
-- REVERSA: supabase/reversas/202610301600_client_web_pages_propio_con_lo_que_hay_REVERSA.sql (vuelve a la función de 202610301400).
BEGIN;

CREATE OR REPLACE FUNCTION public.client_web_pages_es_del_cliente(p_client uuid, p_url text) RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
DECLARE
  c record;
  host text;
  sitio text;
  h text;
  hay_base boolean := false;
  redes text[] := ARRAY['instagram.com','facebook.com','fb.com','tiktok.com','linkedin.com','youtube.com','youtu.be','x.com','twitter.com','linktr.ee','wa.me','api.whatsapp.com','threads.net'];
BEGIN
  SELECT website_url, config INTO c FROM public.clients WHERE id = p_client;
  IF NOT FOUND THEN RETURN true; END IF; -- sin ficha no hay con qué comparar: no se re-rotula
  host  := lower(regexp_replace(split_part(split_part(coalesce(p_url, ''), '//', 2), '/', 1), '^www\.', ''));
  sitio := lower(regexp_replace(split_part(split_part(coalesce(c.website_url, ''), '//', 2), '/', 1), '^www\.', ''));
  IF sitio <> '' AND NOT (sitio = ANY (redes)) THEN
    hay_base := true;
    IF host <> '' AND (host = sitio OR host LIKE '%.' || sitio) THEN RETURN true; END IF;
  END IF;
  FOR h IN
    SELECT lower(regexp_replace(trim(v), '^@', ''))
    FROM (
      SELECT jsonb_each_text.value AS v FROM jsonb_each_text(CASE WHEN jsonb_typeof(c.config -> 'own_social_handles') = 'object' THEN c.config -> 'own_social_handles' ELSE '{}'::jsonb END)
      UNION ALL
      SELECT jsonb_each_text.value FROM jsonb_each_text(CASE WHEN jsonb_typeof(c.config #> '{apify,own_handles}') = 'object' THEN c.config #> '{apify,own_handles}' ELSE '{}'::jsonb END)
    ) t
  LOOP
    IF length(h) >= 3 THEN
      hay_base := true;
      IF position(h IN lower(coalesce(p_url, ''))) > 0 THEN RETURN true; END IF;
    END IF;
  END LOOP;
  RETURN NOT hay_base; -- con base y sin coincidencia → no es suyo; sin base → se conserva el rótulo
END $$;

CREATE OR REPLACE FUNCTION public.client_web_pages_rotular_propio() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.owner_role = 'propio' AND NOT public.client_web_pages_es_del_cliente(NEW.client_id, NEW.url)
     AND NOT EXISTS (SELECT 1 FROM public.client_web_pages w WHERE w.client_id = NEW.client_id AND w.url = NEW.url AND w.owner_role = 'propio') THEN
    NEW.owner_role := 'referencia';
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object('rotulo_original', 'propio', 'rotulado_por', 'regla-propio-en-el-origen');
  END IF;
  RETURN NEW;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
