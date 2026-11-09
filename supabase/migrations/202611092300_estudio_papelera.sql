-- 09-nov · EL ESTUDIO · la ✕ de la galería con papelera (decisión B de Emilio, GO de Lenovo 22:45Z) · CC3
-- Tocar la ✕ NO borra: la pieza sale de la galería y queda en la papelera 30 días, de donde se recupera.
-- A los 30 días se borra sola (fila y archivos propios) con el cron diario `/api/estudio/papelera/vaciar`. Nunca un borrado inmediato.
-- El libro de costos (`costs`) no se toca: lo cobrado sigue anotado aunque la pieza se borre.
-- REVERSA: `supabase/reversas/202611092300_estudio_papelera_REVERSA.sql`.

alter table public.estudio_piezas add column if not exists en_papelera_desde timestamptz;
create index if not exists estudio_piezas_papelera on public.estudio_piezas (en_papelera_desde) where en_papelera_desde is not null;
