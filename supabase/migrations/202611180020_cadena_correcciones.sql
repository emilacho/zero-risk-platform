-- CADENA · cambio 4 · entrega 2 · EL RECEPTOR DE LAS CORRECCIONES (firma de Emilio 17-nov: la jefatura devuelve la corrección al creador; él la toma, en parte o no, con motivo) · CC3 · 17-nov
-- Una fila por corrección. La llave es la de la oficina (#1148 `llaveDeDevolucion` = «fila_id:destino»): una sola por fila y destino, repetirla no duplica.
--   estado    recibida → en_manos_del_creador → respondida
--   respuesta tomada | tomada_en_parte | no_tomada | no_dicha (la explicación es obligatoria en en_parte y no_tomada)
--   dura      la corrección cita una regla dura firmada por Emilio (se toma sí o sí: un «no_tomada» a una dura no cierra)
-- La cadena lee la tabla aunque no exista (leer = sin correcciones): esta migración puede aplicarse después de publicar el código.
BEGIN;

CREATE TABLE IF NOT EXISTS public.cadena_correcciones (
  id                bigserial   PRIMARY KEY,
  llave             text        NOT NULL,
  campana_id        uuid        REFERENCES public.cadena_campanas(id),
  fila_id           text        NOT NULL,
  destino           text        NOT NULL,
  destino_pedido    text        NOT NULL,
  campo_de_la_hoja  text,
  idea_id           text,
  idea_sello        text,
  regla             text,
  motivo            text        NOT NULL,
  linea_de_la_ficha text,
  dura              boolean     NOT NULL DEFAULT false,
  origen            text,
  encargo_id        text        NOT NULL,
  estado            text        NOT NULL DEFAULT 'recibida',
  respuesta         text,
  explicacion       text,
  version_nueva     jsonb,
  intentos          integer     NOT NULL DEFAULT 0,
  recibida_en       timestamptz NOT NULL DEFAULT now(),
  entregada_en      timestamptz,
  respondida_en     timestamptz,
  alarma_en         timestamptz,
  -- se guarda al cerrar: ¿la pieza quedó frenada? la fila de alarmas por reintentar lee solo éstas (🟡 CC6 · las tomadas no la tapan)
  frena             boolean     NOT NULL DEFAULT false,
  CONSTRAINT cadena_correcciones_frena_cerrada CHECK (NOT frena OR estado = 'respondida'),
  CONSTRAINT cadena_correcciones_llave UNIQUE (llave),
  -- la hoja se reparte al recibir (al insumo de donde salió la línea · Lenovo 17-nov): lo guardado va a calendario o banco; la llave conserva el destino pedido
  CONSTRAINT cadena_correcciones_destino_valido CHECK (destino IN ('calendario', 'banco')),
  CONSTRAINT cadena_correcciones_destino_pedido_valido CHECK (destino_pedido IN ('hoja', 'calendario', 'banco')),
  CONSTRAINT cadena_correcciones_banco_con_idea CHECK (destino <> 'banco' OR (idea_id IS NOT NULL AND idea_sello IS NOT NULL)),
  CONSTRAINT cadena_correcciones_regla_valida CHECK (regla IS NULL OR regla ~ '^D[0-9]{1,2}$'),
  CONSTRAINT cadena_correcciones_regla_es_dura CHECK (regla IS NULL OR dura),
  CONSTRAINT cadena_correcciones_estado_valido CHECK (estado IN ('recibida', 'en_manos_del_creador', 'respondida')),
  CONSTRAINT cadena_correcciones_respuesta_valida CHECK (respuesta IS NULL OR respuesta IN ('tomada', 'tomada_en_parte', 'no_tomada', 'no_dicha')),
  CONSTRAINT cadena_correcciones_respondida_con_respuesta CHECK ((estado = 'respondida') = (respuesta IS NOT NULL)),
  CONSTRAINT cadena_correcciones_explicacion CHECK (respuesta IS NULL OR respuesta NOT IN ('tomada_en_parte', 'no_tomada') OR length(btrim(coalesce(explicacion, ''))) > 0),
  CONSTRAINT cadena_correcciones_intentos CHECK (intentos >= 0)
);
CREATE INDEX IF NOT EXISTS cadena_correcciones_pendientes ON public.cadena_correcciones (estado) WHERE estado <> 'respondida';
CREATE INDEX IF NOT EXISTS cadena_correcciones_encargo ON public.cadena_correcciones (encargo_id);
CREATE INDEX IF NOT EXISTS cadena_correcciones_alarmas ON public.cadena_correcciones (respondida_en) WHERE frena AND alarma_en IS NULL;

-- permisos y seguridad por fila (CREATE TABLE no alcanza) · igual que las demás tablas de la cadena
ALTER TABLE public.cadena_correcciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cadena_correcciones FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cadena_correcciones TO service_role;
DO $correcciones$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.cadena_correcciones'::regclass AND polname = 'cadena_correcciones_service') THEN
    CREATE POLICY cadena_correcciones_service ON public.cadena_correcciones FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$correcciones$;
REVOKE ALL ON SEQUENCE public.cadena_correcciones_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.cadena_correcciones_id_seq TO service_role;

COMMENT ON TABLE public.cadena_correcciones IS 'CADENA · cambio 4 · las correcciones de la jefatura a un paso de la cadena (hoja · calendario · banco) y la respuesta de su creador. Una por fila y destino.';

COMMIT;
