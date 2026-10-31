-- REGLA ÚNICA «¿ES DEL CLIENTE?» (31-oct · CC#3 · encargo «limpieza de páginas ajenas» · aprobado por Emilio · opinión de Cerebro: cuenta EXACTA).
-- Había tres copias que no coincidían (la función de la base «cuenta contenida en la dirección», `esPaginaDelCliente` de sedes «cuenta exacta de Instagram», `propiosDeFicha` del manual). Ahora:
--   · la decisión vive en funciones PURAS de la base (`client_web_pages_es_propia`), con una copia en TS (`src/lib/propio/regla-propio.ts`) que corre LOS MISMOS casos (`__tests__/fixtures/regla-propio-casos.json`);
--   · `client_web_pages_es_del_cliente(cliente, url)` pasa a ser un envoltorio (lee la ficha y llama a la pura), con la misma firma: el gatillo `client_web_pages_rotular_propio` no cambia.
-- Regla: una página es del cliente si (a) su dirección es del dominio del sitio del cliente (o un subdominio; si el «sitio» es una red social no sirve) o (b) es la página de SU cuenta EN SU PROPIA RED
--   (instagram.com/<cuenta>, facebook.com/<cuenta>, …; el usuario es el primer tramo de la ruta, EXACTO; un espejo ajeno como pixnoy.com/…/naufrago.ec/ ya no cuenta).
-- Cuentas: `config.own_social_handles` + `config.apify.own_handles` + la propia página de red que sea el «sitio» (≥ 3 letras, sin @). Sin con qué comparar (sin sitio utilizable y sin cuentas) → `sin_base` y el rótulo se conserva (regla de «se trabaja con lo que hay»).
-- NO toca filas existentes (el relleno es un paso aparte: scripts/ops/relleno-paginas-propias.mjs, en seco por omisión).
-- REVERSA: supabase/reversas/202610311300_client_web_pages_regla_unica_propio_REVERSA.sql (vuelve a la función de 202610301600 y borra las auxiliares).
BEGIN;

-- la red a la que pertenece un anfitrión (sin www): null si no es una red social conocida
CREATE OR REPLACE FUNCTION public.client_web_pages_red_de(p_host text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    WHEN p_host ~ '(^|\.)instagram\.com$' THEN 'instagram'
    WHEN p_host ~ '(^|\.)(facebook\.com|fb\.com|fb\.me)$' THEN 'facebook'
    WHEN p_host ~ '(^|\.)tiktok\.com$' THEN 'tiktok'
    WHEN p_host ~ '(^|\.)linkedin\.com$' THEN 'linkedin'
    WHEN p_host ~ '(^|\.)(youtube\.com|youtu\.be)$' THEN 'youtube'
    WHEN p_host ~ '(^|\.)(x\.com|twitter\.com)$' THEN 'x'
    WHEN p_host ~ '(^|\.)threads\.net$' THEN 'threads'
    WHEN p_host ~ '(^|\.)(linktr\.ee|wa\.me|api\.whatsapp\.com)$' THEN 'otra'
    ELSE NULL END
$$;

-- el anfitrión de una dirección (minúsculas, sin usuario, sin puerto, sin www); '' si no hay «//»
CREATE OR REPLACE FUNCTION public.client_web_pages_host_de(p_url text) RETURNS text
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE WHEN position('//' in coalesce(p_url, '')) = 0 THEN ''
    ELSE regexp_replace(regexp_replace(regexp_replace(lower(split_part(split_part(split_part(p_url, '//', 2), '/', 1), '?', 1)), '^[^@]*@', ''), ':[0-9]+$', ''), '^www\.', '') END
$$;

-- el usuario de una página de red social (primer tramo útil de la ruta, sin @, minúsculas); null si no hay
CREATE OR REPLACE FUNCTION public.client_web_pages_usuario_de(p_url text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  h text := public.client_web_pages_host_de(p_url);
  red text := public.client_web_pages_red_de(h);
  resto text;
  ruta text;
  s1 text;
  s2 text;
  u text;
BEGIN
  IF red IS NULL OR h = '' THEN RETURN NULL; END IF;
  resto := split_part(p_url, '//', 2);
  ruta := CASE WHEN position('/' in resto) > 0 THEN substr(resto, position('/' in resto) + 1) ELSE '' END;
  ruta := lower(split_part(split_part(ruta, '#', 1), '?', 1));
  s1 := coalesce(nullif(split_part(ruta, '/', 1), ''), '');
  s2 := coalesce(nullif(split_part(ruta, '/', 2), ''), '');
  IF red = 'linkedin' THEN
    u := CASE WHEN s1 IN ('company', 'in', 'school') THEN s2 ELSE '' END;
  ELSIF red = 'youtube' THEN
    u := CASE WHEN s1 IN ('c', 'user', 'channel') THEN s2 ELSE s1 END;
  ELSE
    u := s1;
  END IF;
  u := regexp_replace(u, '^@', '');
  RETURN nullif(u, '');
END $$;

-- LA REGLA: 'si' | 'no' | 'sin_base'. p_cuentas = arreglo jsonb de textos «red:usuario» (red vacía = cualquier red).
CREATE OR REPLACE FUNCTION public.client_web_pages_es_propia(p_sitio text, p_cuentas jsonb, p_url text) RETURNS text
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  host text := public.client_web_pages_host_de(p_url);
  red_url text := public.client_web_pages_red_de(host);
  usuario_url text := public.client_web_pages_usuario_de(p_url);
  sitio text := public.client_web_pages_host_de(p_sitio);
  hay_base boolean := false;
  c text;
  c_red text;
  c_usuario text;
BEGIN
  IF sitio <> '' AND public.client_web_pages_red_de(sitio) IS NULL THEN
    hay_base := true;
    IF host <> '' AND (host = sitio OR host LIKE '%.' || sitio) THEN RETURN 'si'; END IF;
  END IF;
  FOR c IN SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(p_cuentas) = 'array' THEN p_cuentas ELSE '[]'::jsonb END) LOOP
    c_red := split_part(c, ':', 1);
    c_usuario := lower(regexp_replace(trim(substr(c, position(':' in c) + 1)), '^@', ''));
    IF length(c_usuario) >= 3 THEN
      hay_base := true;
      IF red_url IS NOT NULL AND usuario_url IS NOT NULL AND usuario_url = c_usuario
         AND (c_red = '' OR c_red NOT IN ('instagram', 'facebook', 'tiktok', 'linkedin', 'youtube', 'x', 'threads') OR c_red = red_url) THEN
        RETURN 'si';
      END IF;
    END IF;
  END LOOP;
  RETURN CASE WHEN hay_base THEN 'no' ELSE 'sin_base' END;
END $$;

-- las cuentas propias de una ficha como arreglo «red:usuario» (own_social_handles + apify.own_handles + la página de red que sea su «sitio»)
CREATE OR REPLACE FUNCTION public.client_web_pages_cuentas_de(p_website text, p_config jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  out jsonb := '[]'::jsonb;
  par record;
  v text;
  red text;
  u text;
  web_u text := public.client_web_pages_usuario_de(p_website);
BEGIN
  FOR par IN
    SELECT key, value FROM jsonb_each_text(CASE WHEN jsonb_typeof(p_config -> 'own_social_handles') = 'object' THEN p_config -> 'own_social_handles' ELSE '{}'::jsonb END)
    UNION ALL
    SELECT key, value FROM jsonb_each_text(CASE WHEN jsonb_typeof(p_config #> '{apify,own_handles}') = 'object' THEN p_config #> '{apify,own_handles}' ELSE '{}'::jsonb END)
  LOOP
    v := lower(trim(par.value));
    IF v ~ '^https?://' THEN
      u := public.client_web_pages_usuario_de(v);
    ELSE
      u := regexp_replace(split_part(split_part(v, '?', 1), '/', 1), '^@', '');
    END IF;
    red := CASE lower(par.key) WHEN 'twitter' THEN 'x' ELSE lower(par.key) END;
    IF u IS NOT NULL AND u <> '' THEN out := out || to_jsonb(red || ':' || u); END IF;
  END LOOP;
  IF web_u IS NOT NULL THEN out := out || to_jsonb(coalesce(public.client_web_pages_red_de(public.client_web_pages_host_de(p_website)), '') || ':' || web_u); END IF;
  RETURN out;
END $$;

-- el envoltorio con la firma de siempre: sin ficha, se conserva (true); sin base, se conserva (true); con base, solo lo que prueba ser del cliente
CREATE OR REPLACE FUNCTION public.client_web_pages_es_del_cliente(p_client uuid, p_url text) RETURNS boolean
LANGUAGE plpgsql STABLE AS $$
DECLARE
  c record;
BEGIN
  SELECT website_url, config INTO c FROM public.clients WHERE id = p_client;
  IF NOT FOUND THEN RETURN true; END IF;
  RETURN public.client_web_pages_es_propia(c.website_url, public.client_web_pages_cuentas_de(c.website_url, c.config), p_url) <> 'no';
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
