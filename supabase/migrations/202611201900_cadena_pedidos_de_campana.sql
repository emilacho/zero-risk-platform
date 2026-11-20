-- 20-nov · «CREAR CAMPAÑA» · entrega 1, la base (GO de Lenovo a CC1 y CC3, 20:05 Zúrich · mapa de CC4 18:54Z y 18:59Z, con las 5 preguntas) · CC1
-- ADITIVA: una tabla nueva, `cadena_pedidos_de_campana`, con lo que el dueño contesta al pulsar «Crear Campaña». No toca ninguna tabla ni fila existente.
--   · el pedido existe ANTES que la campaña (la campaña nace en n8n, en la puerta, con `llave_de_campana`): por eso es tabla aparte y no columnas de la campaña;
--   · las 5 preguntas en columnas fijas: nombre, cambio, fechas (inicio, fin y fechas clave), tope y brief libre (con la oferta adentro).
--     El público y la estrategia salen del plan y del manual (no se preguntan);
--   · `llave`: la misma `llave_de_campana` con que nace la campaña; única por cliente y seco (la idempotencia del botón);
--   · `campana_id`: vacío al pedir; lo pone la apertura (entrega 2) al ligar el pedido con su campaña. Una campaña, un pedido;
--   · el pedido NO se edita: lo que contestó el dueño queda como lo contestó. Lo único que cambia, una sola vez, es `campana_id` (de vacío a su campaña);
--   · 🟡 CC6 y CC7 (#1255): el pedido solo se liga a SU campaña, con el mismo cliente, el mismo seco y `llave_de_campana` = `llave`. Vale al ligar y en un INSERT que ya traiga la campaña.
-- Lo que no puede vivir en un CHECK (que el inicio no sea antes de hoy; el tope mínimo = planificación + peor caso de una pieza) lo valida la plataforma.
-- Reversa: supabase/reversas/202611201900_cadena_pedidos_de_campana_REVERSA.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.cadena_pedidos_de_campana (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     text        NOT NULL,
  seco          boolean     NOT NULL DEFAULT false,
  llave         text        NOT NULL,
  nombre        text        NOT NULL,
  cambio        text        NOT NULL,
  fecha_inicio  date,
  fecha_fin     date,
  fechas_clave  jsonb       NOT NULL DEFAULT '[]'::jsonb,
  tope_usd      numeric(10,2) NOT NULL,
  brief_libre   text        NOT NULL,
  pedido_por    text        NOT NULL,
  creado_en     timestamptz NOT NULL DEFAULT now(),
  campana_id    uuid        REFERENCES public.cadena_campanas(id),
  CONSTRAINT cadena_pedidos_de_campana_llave_valida CHECK (length(btrim(llave)) BETWEEN 1 AND 200),
  CONSTRAINT cadena_pedidos_de_campana_nombre_valido CHECK (length(btrim(nombre)) BETWEEN 1 AND 120),
  CONSTRAINT cadena_pedidos_de_campana_cambio_valido CHECK (length(btrim(cambio)) BETWEEN 1 AND 4000),
  CONSTRAINT cadena_pedidos_de_campana_brief_valido CHECK (length(btrim(brief_libre)) BETWEEN 1 AND 100000),
  CONSTRAINT cadena_pedidos_de_campana_pedido_por_valido CHECK (length(btrim(pedido_por)) >= 1),
  CONSTRAINT cadena_pedidos_de_campana_tope_positivo CHECK (tope_usd > 0),
  -- las fechas van las dos o ninguna (ninguna = la ventana del plan, como hoy); el fin después del inicio y dentro de DIAS_MAXIMOS_DE_CAMPANA (366)
  CONSTRAINT cadena_pedidos_de_campana_fechas_juntas CHECK ((fecha_inicio IS NULL) = (fecha_fin IS NULL)),
  CONSTRAINT cadena_pedidos_de_campana_fechas_en_orden CHECK (fecha_fin IS NULL OR (fecha_fin > fecha_inicio AND fecha_fin - fecha_inicio <= 366)),
  CONSTRAINT cadena_pedidos_de_campana_fechas_clave_lista CHECK (jsonb_typeof(fechas_clave) = 'array'),
  CONSTRAINT cadena_pedidos_de_campana_una_por_llave UNIQUE (client_id, seco, llave)
);
CREATE UNIQUE INDEX IF NOT EXISTS cadena_pedidos_de_campana_una_campana ON public.cadena_pedidos_de_campana (campana_id) WHERE campana_id IS NOT NULL;

-- el candado del pedido: no se edita (solo `campana_id`, una vez, de vacío a su campaña) y solo se liga a SU campaña
CREATE OR REPLACE FUNCTION public.cadena_pedidos_de_campana_candado() RETURNS trigger
LANGUAGE plpgsql SET search_path = public AS $f$
DECLARE c record;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    IF (to_jsonb(NEW) - 'campana_id') IS DISTINCT FROM (to_jsonb(OLD) - 'campana_id') THEN
      RAISE EXCEPTION 'cadena_pedidos_de_campana: el pedido no se edita (solo se liga a su campaña)';
    END IF;
    IF OLD.campana_id IS NOT NULL AND NEW.campana_id IS DISTINCT FROM OLD.campana_id THEN
      RAISE EXCEPTION 'cadena_pedidos_de_campana: el pedido ya está ligado a su campaña';
    END IF;
  END IF;
  IF NEW.campana_id IS NOT NULL AND (TG_OP = 'INSERT' OR OLD.campana_id IS NULL) THEN
    SELECT client_id, seco, llave_de_campana INTO c FROM public.cadena_campanas WHERE id = NEW.campana_id;
    IF FOUND AND (c.client_id IS DISTINCT FROM NEW.client_id OR c.seco IS DISTINCT FROM NEW.seco OR c.llave_de_campana IS DISTINCT FROM NEW.llave) THEN
      RAISE EXCEPTION 'cadena_pedidos_de_campana: esa campaña no es la de este pedido (cliente, seco o llave distintos)';
    END IF;
  END IF;
  RETURN NEW;
END $f$;
DROP TRIGGER IF EXISTS cadena_pedidos_de_campana_candado ON public.cadena_pedidos_de_campana;
CREATE TRIGGER cadena_pedidos_de_campana_candado BEFORE INSERT OR UPDATE ON public.cadena_pedidos_de_campana
  FOR EACH ROW EXECUTE FUNCTION public.cadena_pedidos_de_campana_candado();
REVOKE ALL ON FUNCTION public.cadena_pedidos_de_campana_candado() FROM PUBLIC, anon, authenticated;

-- permisos iguales a las demás tablas de la cadena: solo service_role
ALTER TABLE public.cadena_pedidos_de_campana ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cadena_pedidos_de_campana FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cadena_pedidos_de_campana TO service_role;
DROP POLICY IF EXISTS cadena_pedidos_de_campana_service ON public.cadena_pedidos_de_campana;
CREATE POLICY cadena_pedidos_de_campana_service ON public.cadena_pedidos_de_campana FOR ALL TO service_role USING (true) WITH CHECK (true);

COMMENT ON TABLE public.cadena_pedidos_de_campana IS
  'CREAR CAMPAÑA (20-nov): lo que el dueño contesta al pulsar «Crear Campaña» (nombre, cambio, fechas, tope y brief libre con la oferta). Nace antes que la campaña; la apertura lo liga por `llave` y pone `campana_id`. No se edita.';
COMMENT ON COLUMN public.cadena_pedidos_de_campana.llave IS 'La `llave_de_campana` con que nace la campaña. Única por cliente y seco.';
COMMENT ON COLUMN public.cadena_pedidos_de_campana.cambio IS 'El «para qué» de la campaña: el cambio que busca el dueño.';
COMMENT ON COLUMN public.cadena_pedidos_de_campana.fechas_clave IS 'Lista de {fecha, que}: las fechas que el dueño declara para esta campaña.';
COMMENT ON COLUMN public.cadena_pedidos_de_campana.tope_usd IS 'El tope de gasto con que nace la campaña (va a cadena_campanas.tope_gasto_usd). El mínimo lo valida la plataforma.';
COMMENT ON COLUMN public.cadena_pedidos_de_campana.campana_id IS 'Vacío al pedir; lo pone la apertura una sola vez.';

-- guarda: la tabla con sus columnas, sus únicos, su candado y sin acceso para anon ni authenticated
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cadena_pedidos_de_campana'
    AND column_name IN ('id','client_id','seco','llave','nombre','cambio','fecha_inicio','fecha_fin','fechas_clave','tope_usd','brief_libre','pedido_por','creado_en','campana_id');
  IF n <> 14 THEN RAISE EXCEPTION 'cadena_pedidos_de_campana: esperaba 14 columnas, hay %', n; END IF;
  IF (SELECT count(*) FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'cadena_pedidos_de_campana') <> 14 THEN
    RAISE EXCEPTION 'cadena_pedidos_de_campana: la tabla ya existía con otras columnas';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cadena_pedidos_de_campana_una_por_llave' AND conrelid = 'public.cadena_pedidos_de_campana'::regclass) THEN
    RAISE EXCEPTION 'cadena_pedidos_de_campana: falta el único por llave';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_indexes WHERE schemaname = 'public' AND indexname = 'cadena_pedidos_de_campana_una_campana'
                 AND indexdef LIKE 'CREATE UNIQUE INDEX %(campana_id) WHERE (campana_id IS NOT NULL)%') THEN
    RAISE EXCEPTION 'cadena_pedidos_de_campana: falta el único por campaña';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'cadena_pedidos_de_campana_candado' AND tgrelid = 'public.cadena_pedidos_de_campana'::regclass
                 AND (tgtype::int & 4) <> 0 AND (tgtype::int & 16) <> 0) THEN
    RAISE EXCEPTION 'cadena_pedidos_de_campana: falta el candado (al insertar y al editar)';
  END IF;
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid = 'public.cadena_pedidos_de_campana'::regclass)
     OR has_table_privilege('anon', 'public.cadena_pedidos_de_campana', 'SELECT')
     OR has_table_privilege('authenticated', 'public.cadena_pedidos_de_campana', 'SELECT') THEN
    RAISE EXCEPTION 'cadena_pedidos_de_campana: sin seguridad por fila o visible para anon/authenticated';
  END IF;
  IF EXISTS (SELECT 1 FROM public.cadena_pedidos_de_campana) THEN
    RAISE EXCEPTION 'cadena_pedidos_de_campana: la tabla nueva ya tiene filas';
  END IF;
END $$;

-- una tabla nueva no la ve PostgREST hasta recargar su catálogo
NOTIFY pgrst, 'reload schema';
COMMIT;
