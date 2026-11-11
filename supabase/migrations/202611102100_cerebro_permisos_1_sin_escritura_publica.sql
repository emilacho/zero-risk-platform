-- Cerebro · paso 1 · anónimo y con sesión pierden escribir, borrar, vaciar, enlazar, disparadores y mantenimiento en las 30 tablas del cerebro
-- Encargo firmado por Emilio 10-nov (raw/tasks/2026-11-10-ENCARGO-CEREBRO-CC-CEREBRO-cerrar-permisos-del-cerebro.md) · CC-CEREBRO
-- Leer (SELECT) no cambia: lo siguen gobernando las reglas por fila. El servidor (service_role) no se toca. Medido: __tests__/fixtures/permisos-del-cerebro-medidos-2026-11-10.json
begin;
set local lock_timeout = '5s';
revoke insert, update, delete, truncate, references, trigger, maintain on public.apify_raw from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.brain_embed_costs from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.cerebro_alertas from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.cerebro_aprendizaje_catalogo from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.cerebro_aprendizaje_indice from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.cerebro_aprendizaje_medidas from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.cerebro_avisos from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.cerebro_comentarios_competencia from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.cerebro_consultas from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.cerebro_credenciales from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.cerebro_diario_corridas from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.cerebro_dueno_preguntas from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.cerebro_fichas from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.cerebro_ingresos from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.cerebro_oportunidades from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.cerebro_pasos_diarios from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.cerebro_pedidos from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.cerebro_portero_corridas from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.cerebro_portero_pausas from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.cerebro_tendencias from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.cerebro_unidades_vistas from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.cerebro_vigilancia from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.client_brain_chunks from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.client_brain_snapshots from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.client_sede_datos from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.client_social_images from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.client_videos from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.client_voc_library from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.client_web_pages from anon, authenticated;
revoke insert, update, delete, truncate, references, trigger, maintain on public.ingress_quarantine from anon, authenticated;
commit;
