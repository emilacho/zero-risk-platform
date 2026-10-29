-- 202610291600 · EL APRENDIZAJE DEL DUEÑO (29-oct · firma de Emilio «DALE», RAG reutilizando el del cerebro) · ADITIVA.
-- · `cerebro_fichas.alcance` admite también industria · formato · general (las notas destiladas de la clase `aprendizaje_del_dueno`).
-- · `cerebro_aprendizaje_indice`: el índice de huellas semánticas de esas notas. Es hermano de `client_brain_chunks` porque ese índice exige un client_id que sea ficha de cliente
--   (uuid con llave foránea) y las notas de INDUSTRIA y GENERAL no son de un cliente; además así el corredor no las inyecta solo a ningún agente (la jefatura y GPT quedan fuera).
-- · `cerebro_aprendizaje_catalogo`: atributos y destinatarios como DATO ampliable (nada de listas fijas en código).
-- · `cerebro_aprendizaje_medidas`: contadores «aprobada a la primera» y «cambios por pieza» (los llena la oficina).
-- 🔴 IDEMPOTENTE. Una sola transacción. REVERSA: `supabase/reversas/202610291600_cerebro_aprendizaje_del_dueno_REVERSA.sql`.
BEGIN;

DO $alc$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid = 'public.cerebro_fichas'::regclass AND conname = 'cerebro_fichas_alcance_valido') THEN
    ALTER TABLE public.cerebro_fichas DROP CONSTRAINT cerebro_fichas_alcance_valido;
  END IF;
  ALTER TABLE public.cerebro_fichas ADD CONSTRAINT cerebro_fichas_alcance_valido CHECK (alcance IS NULL OR alcance IN ('cliente','competidor','mercado','zona','industria','formato','general'));
END
$alc$;

CREATE TABLE IF NOT EXISTS public.cerebro_aprendizaje_indice (
  ficha_id        uuid        PRIMARY KEY REFERENCES public.cerebro_fichas(id) ON DELETE CASCADE,
  espacio         text        NOT NULL,
  destinatario    text        NOT NULL,
  formato         text,
  texto           text        NOT NULL,
  embedding       vector(1536),
  modelo          text,
  creado_en       timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS cerebro_aprendizaje_indice_por_espacio ON public.cerebro_aprendizaje_indice (espacio, destinatario);

CREATE TABLE IF NOT EXISTS public.cerebro_aprendizaje_catalogo (
  tipo        text NOT NULL,
  valor       text NOT NULL,
  ayuda       text,
  activo      boolean NOT NULL DEFAULT true,
  creado_en   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tipo, valor),
  CONSTRAINT cerebro_aprendizaje_catalogo_tipo_valido CHECK (tipo IN ('destinatario','atributo'))
);
INSERT INTO public.cerebro_aprendizaje_catalogo (tipo, valor, ayuda) VALUES
  ('destinatario','texto','quien escribe la pieza (copy, titulares, llamadas a la acción)'),
  ('destinatario','diseno','quien diseña la pieza (composición, color, tipografía, láminas)'),
  ('destinatario','imagen','quien produce o elige la imagen o foto'),
  ('destinatario','direccion','quien dirige la mesa creativa (criterio general, qué se produce y cuándo)'),
  ('atributo','tono','cómo suena: formal, cercano, humor, urgencia'),
  ('atributo','longitud','cuánto texto: corto, largo, resumido'),
  ('atributo','color','paleta, contraste, colores a evitar'),
  ('atributo','tipografia','letra, tamaño, jerarquía'),
  ('atributo','composicion','orden y espacio: qué va arriba, márgenes, cantidad de láminas'),
  ('atributo','producto','qué producto o plato se muestra y cómo'),
  ('atributo','personas','si salen personas, cuáles y cómo'),
  ('atributo','texto_en_imagen','texto dentro de la imagen: cuánto, dónde'),
  ('atributo','llamada_a_la_accion','qué se pide al lector y cómo'),
  ('atributo','precio_y_oferta','cómo se muestran precios, descuentos, ofertas'),
  ('atributo','marca','logo, nombre, elementos de marca'),
  ('atributo','otro','lo que no encaja en los anteriores (el desmenuzador lo propone como atributo nuevo)')
ON CONFLICT (tipo, valor) DO NOTHING;

CREATE TABLE IF NOT EXISTS public.cerebro_aprendizaje_medidas (
  id                       uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                text        NOT NULL,
  pieza_ref                text        NOT NULL,
  aprobada_a_la_primera    boolean     NOT NULL,
  cambios_pedidos          integer     NOT NULL DEFAULT 0,
  usado_aprendizaje        boolean     NOT NULL DEFAULT false,
  registrado_por           text,
  registrado_en            timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cerebro_aprendizaje_medidas_cambios_validos CHECK (cambios_pedidos >= 0),
  CONSTRAINT cerebro_aprendizaje_medidas_una_por_pieza UNIQUE (client_id, pieza_ref)
);
CREATE INDEX IF NOT EXISTS cerebro_aprendizaje_medidas_por_cliente ON public.cerebro_aprendizaje_medidas (client_id, registrado_en DESC);

-- búsqueda por parecido entre varios espacios (cliente + industria + general) con filtro de destinatario
CREATE OR REPLACE FUNCTION public.buscar_aprendizaje_del_dueno(p_espacios text[], p_embedding vector(1536), p_destinatario text DEFAULT NULL, p_top_k int DEFAULT 30)
RETURNS TABLE (ficha_id uuid, espacio text, similitud float)
LANGUAGE sql STABLE
AS $$
  SELECT i.ficha_id, i.espacio, 1.0 - (i.embedding <=> p_embedding) AS similitud
  FROM public.cerebro_aprendizaje_indice i
  WHERE i.espacio = ANY (p_espacios) AND i.embedding IS NOT NULL
    AND (p_destinatario IS NULL OR i.destinatario = p_destinatario)
  ORDER BY i.embedding <=> p_embedding
  LIMIT GREATEST(LEAST(p_top_k, 100), 1)
$$;

-- permisos y seguridad por fila (la lección del proyecto: CREATE TABLE no alcanza)
ALTER TABLE public.cerebro_aprendizaje_indice  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cerebro_aprendizaje_catalogo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cerebro_aprendizaje_medidas  ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cerebro_aprendizaje_indice, public.cerebro_aprendizaje_catalogo, public.cerebro_aprendizaje_medidas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cerebro_aprendizaje_indice, public.cerebro_aprendizaje_catalogo, public.cerebro_aprendizaje_medidas TO service_role;
REVOKE ALL ON FUNCTION public.buscar_aprendizaje_del_dueno(text[], vector, text, int) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.buscar_aprendizaje_del_dueno(text[], vector, text, int) TO service_role;
DO $pol$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['cerebro_aprendizaje_indice','cerebro_aprendizaje_catalogo','cerebro_aprendizaje_medidas'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = ('public.' || t)::regclass AND polname = t || '_service') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || '_service', t);
    END IF;
  END LOOP;
END
$pol$;

COMMENT ON TABLE public.cerebro_aprendizaje_indice IS 'CEREBRO · huellas semánticas de las notas destiladas del dueño (clase aprendizaje_del_dueno). Solo el portero del cerebro las escribe; la jefatura y GPT no las leen.';
COMMENT ON TABLE public.cerebro_aprendizaje_catalogo IS 'CEREBRO · atributos y destinatarios del aprendizaje del dueño: DATO ampliable, no lista en código.';
COMMENT ON TABLE public.cerebro_aprendizaje_medidas IS 'CEREBRO · medición del aprendizaje: piezas aprobadas a la primera y cambios pedidos por pieza (los llena la oficina).';
COMMENT ON COLUMN public.cerebro_fichas.alcance IS 'De quién es el dato: cliente · competidor · mercado · zona (client_id = zona:<país>) · industria (client_id = industria:<rubro>) · formato · general (client_id = general). Las notas del dueño viven en espacios aparte: aprendizaje:<cliente> · industria:<rubro> · general.';

COMMIT;

-- 🔴 una tabla o columna nueva no la ve PostgREST hasta recargar su catálogo (medido 03-oct)
NOTIFY pgrst, 'reload schema';
