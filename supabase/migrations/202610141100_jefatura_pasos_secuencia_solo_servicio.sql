-- JEFATURA · higiene de permisos (CC#1 · 14-oct · reparo menor de CC#3, certificación J1 §8 nota 1) · NO APLICADA: va en su propia ventana, con la jefatura apagada y 0 corridas.
-- La migración de J1 (202610131000) revoca las TABLAS a anon/authenticated pero no la SECUENCIA `jefatura_pasos_id_seq`, que quedó con el valor por omisión de la plataforma (escritura para anon y authenticated).
-- No era alcanzable por la API y no afectaba a nada; esto la deja igual que las tablas: SOLO el servicio. Idempotente (se puede correr dos veces) y no toca ninguna tabla ni ningún dato.
-- Reversa: supabase/reversas/202610141100_jefatura_pasos_secuencia_solo_servicio_REVERSA.sql (devuelve el valor por omisión de la plataforma).
REVOKE ALL ON SEQUENCE public.jefatura_pasos_id_seq FROM PUBLIC, anon, authenticated;
GRANT USAGE, SELECT ON SEQUENCE public.jefatura_pasos_id_seq TO service_role;
NOTIFY pgrst, 'reload schema';
