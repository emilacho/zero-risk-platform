-- 06-nov · GO de Lenovo (Emilio 00:49 local, «sí a las dos»): se enciende la pausa de la oficina financiera. Espera la respuesta del dueño en Tu oficina › Decisiones antes de seguir.
-- Si el dueño descarta todas las preguntas que faltan, la pausa se levanta y el plan sigue con sus supuestos (pausa.ts · temasDescartados · pruebas en __tests__/finanzas-pausa-al-dueno.test.ts).
-- Se aplica DESPUÉS de la corrida 7caa29ed, con certificación de CC7 y n8n 0/0. REVERSA: `supabase/reversas/202611060100_finanzas_pausa_al_dueno_encendida_REVERSA.sql`.
-- Guardas (se niega, no pisa): la columna debe existir (202611041600) y las preguntas deben ir por Tu oficina (`preguntas_slack = 'registra'`), que es el modo probado.
do $$
declare v record;
begin
  select pausa_al_dueno, preguntas_slack into v from public.finanzas_config where id = 1;
  if not found then raise exception 'finanzas_config sin fila 1: no se enciende'; end if;
  if v.preguntas_slack is distinct from 'registra' then raise exception 'las preguntas no van por Tu oficina (preguntas_slack = %): no se enciende', v.preguntas_slack; end if;
  if v.pausa_al_dueno then raise notice 'la pausa ya estaba encendida: nada que hacer'; return; end if;
  update public.finanzas_config set pausa_al_dueno = true, actualizado_en = now() where id = 1;
end $$;
