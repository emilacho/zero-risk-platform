-- 202610312002 · clients.idioma · 31-oct (oficina de marketing · T3 · CC#1 · plan v3 «idioma agnóstico»)
-- El idioma del cliente es un DATO de su ficha, no una regla fija del proyecto: la cadena y la oficina escriben en el idioma y el trato que fija el manual del cliente;
-- cuando el manual no lo dice, esta columna; cuando tampoco, el idioma oficial del país. Nunca se inventa. Texto libre («español», «english», «português»).
-- Sin valor por omisión y admite NULL: las fichas de hoy no cambian (ausente = como siempre). Reversa: supabase/reversas/202610312002_clients_idioma_REVERSA.sql
ALTER TABLE public.clients ADD COLUMN IF NOT EXISTS idioma text NULL;
COMMENT ON COLUMN public.clients.idioma IS 'idioma de la ficha (texto libre: español · english · português…); NULL = el del manual o el oficial del país. 31-oct T3.';
