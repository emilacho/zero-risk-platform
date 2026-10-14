-- REVERSA de 202610141100_jefatura_pasos_secuencia_solo_servicio.sql · devuelve a la secuencia el valor por omisión de la plataforma (escritura para anon y authenticated), tal como la midió CC#3 tras aplicar J1.
-- Solo se corre con la orden de CC#3. No toca tablas ni datos.
GRANT USAGE, SELECT, UPDATE ON SEQUENCE public.jefatura_pasos_id_seq TO anon, authenticated;
NOTIFY pgrst, 'reload schema';
