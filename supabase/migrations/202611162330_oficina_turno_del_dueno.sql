-- 202611162330 · EL TURNO DEL DUEÑO · CC1 · Sprint 2 · S2-1 parte B (GO Lenovo 16-nov · decisión de Emilio 21:29 + adendas 21:35/21:42: una sola parada)
-- Amplía el CHECK de los pasos registrados para admitir el tipo «dueno»: el encargo de video espera ahí a que el dueño elija una de las propuestas o pida cambios.
-- Sin esto, el primer encargo con propuestas no podría anotar su espera (la base rechazaría el turno). Ningún dato cambia; ninguna plantilla cambia.
-- ANTES (verificado en solo lectura el 16-nov 21:58Z): el CHECK es el de 202610271900 (portero, agente, codigo, externo, brazo, jefatura, material).
-- Reversa: reversas/202611162330_oficina_turno_del_dueno_REVERSA.sql (se niega si ya hay turnos «dueno»).
BEGIN;

DO $$
BEGIN
  IF (SELECT pg_get_constraintdef(oid) FROM pg_constraint WHERE conrelid = 'public.oficina_turnos'::regclass AND conname = 'oficina_turnos_tipo_valido')
     IS DISTINCT FROM $antes$CHECK ((tipo = ANY (ARRAY['portero'::text, 'agente'::text, 'codigo'::text, 'externo'::text, 'brazo'::text, 'jefatura'::text, 'material'::text])))$antes$ THEN
    RAISE EXCEPTION '202611162330: la regla de tipos de oficina_turnos no es la esperada; no se pisa';
  END IF;
END $$;

ALTER TABLE public.oficina_turnos DROP CONSTRAINT IF EXISTS oficina_turnos_tipo_valido;
ALTER TABLE public.oficina_turnos ADD CONSTRAINT oficina_turnos_tipo_valido CHECK (tipo IN ('portero', 'agente', 'codigo', 'externo', 'brazo', 'jefatura', 'material', 'dueno'));

COMMIT;
