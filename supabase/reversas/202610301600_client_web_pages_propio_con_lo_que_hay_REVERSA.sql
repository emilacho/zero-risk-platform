-- Reversa de 202610301600: vuelve a la regla de 202610301400 (sin la excepción «sin base» ni la protección de filas propias existentes).
BEGIN;
CREATE OR REPLACE FUNCTION public.client_web_pages_es_del_cliente(p_client uuid, p_url text) RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
DECLARE
  c record;
  host text;
  sitio text;
  h text;
  redes text[] := ARRAY['instagram.com','facebook.com','fb.com','tiktok.com','linkedin.com','youtube.com','youtu.be','x.com','twitter.com','linktr.ee','wa.me','api.whatsapp.com','threads.net'];
BEGIN
  SELECT website_url, config INTO c FROM public.clients WHERE id = p_client;
  IF NOT FOUND THEN RETURN true; END IF; -- sin ficha no hay con qué comparar: no se reetiqueta
  host  := lower(regexp_replace(split_part(split_part(coalesce(p_url, ''), '//', 2), '/', 1), '^www\.', ''));
  sitio := lower(regexp_replace(split_part(split_part(coalesce(c.website_url, ''), '//', 2), '/', 1), '^www\.', ''));
  IF sitio <> '' AND NOT (sitio = ANY (redes)) AND host <> '' AND (host = sitio OR host LIKE '%.' || sitio) THEN RETURN true; END IF;
  FOR h IN
    SELECT lower(regexp_replace(trim(v), '^@', ''))
    FROM (
      SELECT jsonb_each_text.value AS v FROM jsonb_each_text(CASE WHEN jsonb_typeof(c.config -> 'own_social_handles') = 'object' THEN c.config -> 'own_social_handles' ELSE '{}'::jsonb END)
      UNION ALL
      SELECT jsonb_each_text.value FROM jsonb_each_text(CASE WHEN jsonb_typeof(c.config #> '{apify,own_handles}') = 'object' THEN c.config #> '{apify,own_handles}' ELSE '{}'::jsonb END)
    ) t
  LOOP
    IF length(h) >= 3 AND position(h IN lower(coalesce(p_url, ''))) > 0 THEN RETURN true; END IF;
  END LOOP;
  RETURN false;
END $$;

CREATE OR REPLACE FUNCTION public.client_web_pages_rotular_propio() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.owner_role = 'propio' AND NOT public.client_web_pages_es_del_cliente(NEW.client_id, NEW.url) THEN
    NEW.owner_role := 'referencia';
    NEW.metadata := coalesce(NEW.metadata, '{}'::jsonb) || jsonb_build_object('rotulo_original', 'propio', 'rotulado_por', 'regla-propio-en-el-origen');
  END IF;
  RETURN NEW;
END $$;
COMMIT;
