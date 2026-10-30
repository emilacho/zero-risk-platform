-- TABLERO · 30-oct · CC#2: las acciones del tablero (/api/tablero/{accion}) dejan su rastro en eventos_de_emilio con accion 'tablero'.
-- Aditiva: solo ensancha el CHECK (ninguna fila existente cambia). Aplicar ANTES de fusionar el código.
-- REVERSA: supabase/reversas/202610301100_eventos_de_emilio_accion_tablero_REVERSA.sql (se niega si ya hay filas 'tablero').
BEGIN;
ALTER TABLE public.eventos_de_emilio DROP CONSTRAINT IF EXISTS eventos_de_emilio_accion_check;
ALTER TABLE public.eventos_de_emilio ADD CONSTRAINT eventos_de_emilio_accion_check CHECK (accion IN ('aprobar','rechazar','pedir_cambios','editar','comentar','abrir_rechazo','tablero'));
COMMIT;
NOTIFY pgrst, 'reload schema';
