-- 10-nov · «subela a 20» (dale de Emilio, por Lenovo): el tope por encargo de la oficina pasa de US$ 10 a US$ 20 como MÁXIMO permitido.
-- No cambia ningún tope vigente: cada plantilla conserva el suyo (la mesa de la gran idea sigue en 5; se sube a 20 solo para una vuelta, con escritura condicional, y vuelve a 5).
-- Solo se ensancha el límite de las dos reglas; nada se borra ni se reescribe. Idempotente.
ALTER TABLE public.oficina_tipos_de_grupo DROP CONSTRAINT IF EXISTS oficina_tipos_tope_valido;
ALTER TABLE public.oficina_tipos_de_grupo ADD CONSTRAINT oficina_tipos_tope_valido CHECK (tope_encargo_usd > 0 AND tope_encargo_usd <= 20);

ALTER TABLE public.oficina_encargos DROP CONSTRAINT IF EXISTS oficina_encargos_tope_valido;
ALTER TABLE public.oficina_encargos ADD CONSTRAINT oficina_encargos_tope_valido CHECK (tope_usd > 0 AND tope_usd <= 20);
