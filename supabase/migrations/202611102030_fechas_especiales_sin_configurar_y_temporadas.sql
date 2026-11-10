-- 10-nov · GO Lenovo «fechas especiales sin fuente» (A + B + C + D) · CC3 construye, CC7 certifica · US$ 0
-- B · la cobertura sin fuentes cargadas queda `sin_configurar` (no es final ni cuenta intento) y avisa UNA vez por país y tipo.
-- C · una temporada del negocio es de UN cliente: `cadena_fechas_especiales` suma `client_id` (vacío = fecha pública, de todos), `hasta` (el tramo) y `origen`.
--     La llave única incluye al cliente (`client_key` = '' para una fecha pública): la temporada de un cliente nunca pisa una fecha pública ni la de otro.
-- No reescribe ninguna fila: las 8 coberturas de Náufrago quedan como están (el código lee «sin fuente con 0 intentos» como sin configurar).
-- Reversa: supabase/reversas/202611102030_fechas_especiales_sin_configurar_y_temporadas_REVERSA.sql

BEGIN;

-- B · el estado nuevo de la cobertura
ALTER TABLE public.cadena_fechas_cobertura DROP CONSTRAINT cadena_cobertura_estado_valido;
ALTER TABLE public.cadena_fechas_cobertura ADD CONSTRAINT cadena_cobertura_estado_valido CHECK (estado IN ('verificada','sin_fuente','en_curso','sin_configurar'));

-- B · una sola alarma por país y tipo: solo avisa quien logra insertar la fila ABIERTA (índice único parcial: dos corridas a la vez → una alarma).
--     Cuando aparecen las fuentes, la marca se CIERRA con su fecha (punto 4 de CC7): queda el historial y el servidor no necesita permiso de borrar.
CREATE TABLE public.cadena_fechas_alarmas (
  id         bigserial   PRIMARY KEY,
  pais       text        NOT NULL,
  tipo       text        NOT NULL,
  avisada_en timestamptz NOT NULL DEFAULT now(),
  cerrada_en timestamptz,
  CONSTRAINT cadena_fechas_alarmas_cierre_valido CHECK (cerrada_en IS NULL OR cerrada_en >= avisada_en)
);
CREATE UNIQUE INDEX cadena_fechas_alarmas_una_abierta ON public.cadena_fechas_alarmas (pais, tipo) WHERE cerrada_en IS NULL;
ALTER TABLE public.cadena_fechas_alarmas ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cadena_fechas_alarmas FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.cadena_fechas_alarmas TO service_role;
REVOKE ALL ON SEQUENCE public.cadena_fechas_alarmas_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.cadena_fechas_alarmas_id_seq TO service_role;
CREATE POLICY cadena_fechas_alarmas_service ON public.cadena_fechas_alarmas FOR ALL TO service_role USING (true) WITH CHECK (true);

-- C · la temporada del cliente
ALTER TABLE public.cadena_fechas_especiales ADD COLUMN client_id text;
ALTER TABLE public.cadena_fechas_especiales ADD COLUMN hasta date;
ALTER TABLE public.cadena_fechas_especiales ADD COLUMN origen text NOT NULL DEFAULT 'fuente_oficial';
ALTER TABLE public.cadena_fechas_especiales ADD COLUMN client_key text GENERATED ALWAYS AS (coalesce(client_id, '')) STORED;
ALTER TABLE public.cadena_fechas_especiales ADD CONSTRAINT cadena_fechas_origen_valido CHECK (origen IN ('fuente_oficial','cliente'));
-- una temporada tiene cliente y una fecha pública no; el tramo nunca va al revés
ALTER TABLE public.cadena_fechas_especiales ADD CONSTRAINT cadena_fechas_cliente_segun_origen CHECK ((origen = 'cliente') = (client_id IS NOT NULL));
ALTER TABLE public.cadena_fechas_especiales ADD CONSTRAINT cadena_fechas_tramo_valido CHECK (hasta IS NULL OR hasta >= fecha);
-- punto 1 de CC7: la llave va sobre `client_key` (= '' sin cliente), NO sobre `client_id`: dos filas con cliente vacío SÍ chocan, así el mismo feriado público no se guarda dos veces
DROP INDEX public.cadena_fechas_unica;
CREATE UNIQUE INDEX cadena_fechas_unica ON public.cadena_fechas_especiales (pais, tipo, ambito, fecha, client_key);

COMMIT;
