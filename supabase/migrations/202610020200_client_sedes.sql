-- LAS SEDES DE UN CLIENTE · CC#1 · 2026-10-02 (encargo Lenovo «sedes, mapas, cerebro y voz» puntos 1 y 2 · firma de Emilio 02-oct).
-- 🔴 NO APLICADA al escribirse: se aplica en la PUBLICACIÓN, con aviso previo y GO. Es ADITIVA e inerte hasta que alguien llame al recolector (`/api/clients/sedes/recolectar`).
--
-- Un cliente tiene N sedes (agnóstico: nada de aquí nombra a un cliente). Cada DATO de una sede (dirección · horario · canal de pedido) es una OBSERVACIÓN de una fuente (sitio · Instagram · Mapas)
-- con su FECHA: así se ve de dónde salió cada cosa y, si las fuentes chocan, queda declarado. El horario lo ve el sistema; no se le pregunta al dueño.
-- Las observaciones son un historial (no se pisan): para decidir se usa la última de cada fuente.
-- Mapas NUNCA crea una sede (lo garantiza el código del recolector y su prueba): sólo observa sobre sedes que el cliente declaró en sus propias fuentes.
CREATE TABLE IF NOT EXISTS public.client_sedes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id   uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  clave       text NOT NULL,           -- la ciudad sin tildes ni mayúsculas («olon») · identifica la sede dentro del cliente
  ciudad      text NOT NULL,           -- como se escribe («Olón»)
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_sedes_clave_no_vacia CHECK (length(clave) > 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS client_sedes_uq ON public.client_sedes (client_id, clave);

CREATE TABLE IF NOT EXISTS public.client_sede_datos (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id     uuid NOT NULL REFERENCES public.clients(id) ON DELETE CASCADE,
  sede_id       uuid REFERENCES public.client_sedes(id) ON DELETE CASCADE,  -- NULL = lo dice la CUENTA sin decir de qué sede (alcance 'cuenta')
  campo         text NOT NULL CHECK (campo IN ('direccion','horario','canal_pedido')),
  valor_texto   text NOT NULL,         -- lo que dice la fuente, legible
  valor_norm    jsonb,                 -- lo que el sistema entendió (horario: {"1":"07:00-15:00",…} · otros: texto normalizado) · NULL = hay texto pero no se pudo leer sin adivinar
  fuente        text NOT NULL CHECK (fuente IN ('sitio','instagram','mapas')),
  fuente_ref    text,                  -- dirección de la página / perfil / ficha
  alcance       text NOT NULL DEFAULT 'sede' CHECK (alcance IN ('sede','cuenta')),
  observado_en  timestamptz NOT NULL,  -- cuándo se raspó esa fuente (no cuándo se guardó)
  created_at    timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT client_sede_datos_alcance_coherente CHECK ((alcance = 'cuenta') = (sede_id IS NULL))
);
-- la misma observación (misma fuente, mismo valor, mismo raspado) no se guarda dos veces
CREATE UNIQUE INDEX IF NOT EXISTS client_sede_datos_uq
  ON public.client_sede_datos (client_id, COALESCE(sede_id, '00000000-0000-0000-0000-000000000000'::uuid), campo, fuente, md5(COALESCE(valor_norm::text, valor_texto)), observado_en);
CREATE INDEX IF NOT EXISTS client_sede_datos_por_sede ON public.client_sede_datos (client_id, sede_id, campo, observado_en DESC);

-- 🔴 una tabla nueva sin permisos ni política NO la ve PostgREST (y el nodo que la lee falla en silencio): se dan en la misma migración
ALTER TABLE public.client_sedes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_sede_datos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_sedes TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.client_sede_datos TO service_role;
CREATE POLICY client_sedes_service ON public.client_sedes FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY client_sede_datos_service ON public.client_sede_datos FOR ALL TO service_role USING (true) WITH CHECK (true);
