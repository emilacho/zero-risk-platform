-- Reversa de 202611031800_hitl_documento_de_la_revision. Solo quita la clasificación: ningún dato de las filas cambia. Antes de correrla, el tablero debe dejar de leer `documento`.
drop index if exists public.hitl_queue_documento_pendiente;
alter table public.hitl_queue drop column if exists documento;
drop function if exists public.documento_de_la_revision(text, text, text);
