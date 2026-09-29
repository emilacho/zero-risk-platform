-- Fotos de redes guardadas en nuestro bucket PÚBLICO `client-social-images` (CC#1 · 2026-09-29).
-- Mínima: qué foto es de quién y su URL. Retención (política, sin columna): competidor = 90 días
-- desde created_at y se borra; cliente = mientras esté activo.
CREATE TABLE IF NOT EXISTS public.client_social_images (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id    uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  owner_role   text NOT NULL CHECK (owner_role IN ('propio','competidor')),
  handle       text NOT NULL,
  post_id      text NOT NULL,
  tipo         text NOT NULL,
  url          text,
  estado       text NOT NULL CHECK (estado IN ('ok','no_bajo')),
  causa        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT csi_url_si_ok CHECK (estado <> 'ok' OR url IS NOT NULL),
  CONSTRAINT csi_causa_si_no_bajo CHECK (estado = 'ok' OR causa IS NOT NULL)
);
CREATE UNIQUE INDEX IF NOT EXISTS csi_uq ON public.client_social_images (client_id, owner_role, handle, post_id);
ALTER TABLE public.client_social_images ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_social_images TO service_role;
CREATE POLICY csi_service ON public.client_social_images FOR ALL TO service_role USING (true) WITH CHECK (true);
