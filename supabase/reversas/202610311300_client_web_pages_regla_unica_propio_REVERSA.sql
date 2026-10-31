-- Reversa de 202610311300: vuelve a la función de 202610301600 (cuenta contenida en la dirección) y borra las auxiliares de la regla única.
-- NO deshace el relleno (eso lo hace: node scripts/ops/relleno-paginas-propias.mjs restaurar <respaldo.json> --ejecutar).
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
DROP FUNCTION IF EXISTS public.client_web_pages_es_propia(text, jsonb, text);
DROP FUNCTION IF EXISTS public.client_web_pages_cuentas_de(text, jsonb);
DROP FUNCTION IF EXISTS public.client_web_pages_usuario_de(text);
DROP FUNCTION IF EXISTS public.client_web_pages_host_de(text);
DROP FUNCTION IF EXISTS public.client_web_pages_red_de(text);
COMMIT;
NOTIFY pgrst, 'reload schema';
