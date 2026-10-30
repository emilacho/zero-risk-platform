-- N3 · RÓTULO «PROPIO» EN EL ORIGEN (30-oct · CC#2 · encargo «el manual sale solo»): una página de `client_web_pages` solo queda como «propio» si de verdad es del cliente.
-- Hasta hoy el escritor del Servicio (nodo «Guardar la página») rotulaba «propio» TODO lo que no fuera del raspador de competidores: páginas de homónimos, periódicos, repositorios
-- y buscadores que solo mencionan el nombre entraban como si fueran el sitio del cliente (Náufrago: 46 de 49 «propias» no eran suyas).
-- Regla (para TODOS los clientes, sin nombres propios), aplicada al INSERTAR (también cuando el Servicio re-escribe con on_conflict):
--   «propio» se conserva SOLO si (a) el dominio de la página es el del sitio del cliente (`clients.website_url`; si ese «sitio» es una red social, el dominio no vale), o
--   (b) la dirección contiene una de las cuentas propias del cliente (config.own_social_handles / config.apify.own_handles; ≥ 3 letras, sin @, sin mayúsculas).
-- Si no cumple ninguna → `referencia` (el mismo rótulo de tercero que ya usa client_social_images; los lectores la leen como «de tercero») y la fila guarda `metadata.rotulo_original`.
-- NO toca filas existentes (append-only; nada de Náufrago fuera de lectura): el relleno de lo viejo queda como decisión aparte.
-- REVERSA: supabase/reversas/202610301400_client_web_pages_rotulo_propio_REVERSA.sql (se niega si ya hay filas `referencia`).
BEGIN;

ALTER TABLE public.client_web_pages DROP CONSTRAINT IF EXISTS client_web_pages_owner_role_chk;
ALTER TABLE public.client_web_pages ADD CONSTRAINT client_web_pages_owner_role_chk CHECK (owner_role = ANY (ARRAY['propio'::text, 'competidor'::text, 'referencia'::text]));

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

DROP TRIGGER IF EXISTS client_web_pages_rotular_propio ON public.client_web_pages;
CREATE TRIGGER client_web_pages_rotular_propio BEFORE INSERT ON public.client_web_pages FOR EACH ROW EXECUTE FUNCTION public.client_web_pages_rotular_propio();

COMMENT ON FUNCTION public.client_web_pages_es_del_cliente(uuid, text) IS 'N3 · ¿esta dirección es del cliente? dominio de su sitio (si no es una red social) o contiene una de sus cuentas propias.';
COMMIT;
NOTIFY pgrst, 'reload schema';
