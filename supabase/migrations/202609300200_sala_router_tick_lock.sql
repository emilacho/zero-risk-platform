-- EL CANDADO DEL TIC DEL REPARTIDOR · CC#1 · 2026-09-30 · paquete del repartidor (pieza ①) · GO de Emilio.
-- 🔴 NO APLICADA al escribirse (la base está caída): se aplica en la PUBLICACIÓN, con aviso previo. Es ADITIVA (tabla + 2 funciones nuevas) e INERTE:
-- sólo la ruta /api/sala/router/consume la usa Y sólo con la palanca SALA_ROUTER_PAQUETE_ENABLED=true (nace apagada).
-- Un arrendamiento con vencimiento: `sala_router_try_lock` lo toma si está libre o vencido (atómico: un solo INSERT … ON CONFLICT DO UPDATE … WHERE vencido).
-- Lección de client_web_pages (06-sep): una tabla nueva SIN GRANT + RLS no la ve PostgREST → se dan los dos aquí.
CREATE TABLE IF NOT EXISTS public.sala_router_tick_lock (
  id          text PRIMARY KEY,
  holder      text NOT NULL,
  acquired_at timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);
ALTER TABLE public.sala_router_tick_lock ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.sala_router_tick_lock TO service_role;
CREATE POLICY srtl_service ON public.sala_router_tick_lock FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE OR REPLACE FUNCTION public.sala_router_try_lock(p_holder text, p_ttl_seconds integer)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE tomado integer;
BEGIN
  INSERT INTO public.sala_router_tick_lock (id, holder, acquired_at, expires_at)
  VALUES ('consume', p_holder, now(), now() + make_interval(secs => p_ttl_seconds))
  ON CONFLICT (id) DO UPDATE
    SET holder = EXCLUDED.holder, acquired_at = now(), expires_at = EXCLUDED.expires_at
    WHERE public.sala_router_tick_lock.expires_at < now();
  GET DIAGNOSTICS tomado = ROW_COUNT;
  RETURN tomado = 1;
END $$;

CREATE OR REPLACE FUNCTION public.sala_router_unlock(p_holder text)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path = public AS $$
  DELETE FROM public.sala_router_tick_lock WHERE id = 'consume' AND holder = p_holder;
$$;
REVOKE ALL ON FUNCTION public.sala_router_try_lock(text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sala_router_unlock(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.sala_router_try_lock(text, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.sala_router_unlock(text) TO service_role;
