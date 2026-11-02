-- 02-nov · LOS DATOS DE LA ORGANIZACIÓN SEGÚN EL MAPA FIRMADO · CC#1 · US$ 0 · firma de Emilio («dale»), encargo datos-de-la-organizacion.
--   Fuente: MAPA 01-nov «ESTRUCTURA FINAL: 6 EQUIPOS» + LISTO de CC5 con las desalineaciones. Solo ordena datos: nadie cambia de trabajo.
--   · Tarjetas nuevas en `oficina_directorio` con `activo = false` y `pertinente_en` vacío: el directorio ACTIVO entra en el pedido de cada turno de cada mesa (`seccionDelDirectorio`),
--     así que encenderlas encarecería todos los turnos y le daría al director gente que hoy no convoca. Apagadas ordenan el organigrama y no se sientan en ninguna mesa. `sabe_hacer` queda vacío: no se inventa.
--   · `departments`: Ventas queda una sola vez («sales», que tiene la gente) y «paid_media» pasa a Marketing. `revisor-externo-gpt` es proveedor externo: tarjeta sí, fila en `agents` no.
--   · Sales Enablement pasa a Ventas y deja de reportar al jefe de marketing. Ventas no tiene jefe hoy: no se inventa.
--   Idempotente. `oficina_*` es de CC2: migración aditiva avisada en el papel.
--   Reversa: supabase/reversas/202611020100_organizacion_segun_el_mapa_firmado_REVERSA.sql
BEGIN;

INSERT INTO public.oficina_directorio (agente, rol, especialidad, pertinente_en, activo, equipo) VALUES
  ('jefe-marketing', 'miembro', 'dirige el departamento y escribe el plan de 90 días', '{}', false, 'direccion'),
  ('spell-check-corrector', 'miembro', 'ortografía y gramática antes de la revisión final', '{}', false, 'direccion'),
  ('revisor-externo-gpt', 'miembro', 'proveedor externo: da una segunda opinión, sin voto', '{}', false, 'direccion'),
  ('editor_en_jefe', 'miembro', 'control de calidad de lo que sale: marca, exactitud y estrategia; revisa la voz', '{}', false, 'direccion'),
  ('social-media-strategist', 'miembro', 'estrategia de redes sociales y calendario', '{}', false, 'estrategia'),
  ('brand_strategist', 'miembro', 'estrategia de marca, posicionamiento y coherencia del manual', '{}', false, 'estrategia'),
  ('web_designer', 'miembro', 'diseño de landings y sitios de marketing', '{}', false, 'web'),
  ('creative-director', 'miembro', 'dirección creativa de las landings', '{}', false, 'web'),
  ('style-consistency-reviewer', 'miembro', 'coherencia de estilo entre todas las entregas de un cliente', '{}', false, 'web'),
  ('delivery-coordinator', 'miembro', 'última revisión antes de entregar una landing', '{}', false, 'web'),
  ('cro-specialist', 'miembro', 'conversión de las landings; su identidad está por arreglar', '{}', false, 'web'),
  ('seo-specialist', 'miembro', 'estrategia de posicionamiento en buscadores', '{}', false, 'web'),
  ('seo-content-strategist', 'miembro', 'autoridad temática y grupos de contenido para buscadores', '{}', false, 'web'),
  ('seo-backlink-strategist', 'miembro', 'enlaces entrantes: prensa digital y alianzas', '{}', false, 'web'),
  ('seo-technical', 'miembro', 'SEO técnico: rastreo, velocidad y datos estructurados', '{}', false, 'web'),
  ('seo-orchestrator', 'miembro', 'une el trabajo de SEO en un plan de 90 días', '{}', false, 'web'),
  ('seo-geo-optimization', 'miembro', 'visibilidad en las respuestas de ChatGPT, Claude, Gemini y Perplexity', '{}', false, 'web'),
  ('marketing_ai_citation_strategist', 'miembro', 'por qué una marca aparece o no citada en las respuestas de las IA', '{}', false, 'web'),
  ('media-buyer', 'miembro', 'compra y estructura de campañas pagadas', '{}', false, 'medios'),
  ('paid_media_auditor', 'miembro', 'auditoría de cuentas de anuncios', '{}', false, 'medios'),
  ('paid_media_creative_strategist', 'miembro', 'textos y creativos de anuncios', '{}', false, 'medios'),
  ('paid_media_paid_social_strategist', 'miembro', 'anuncios pagados en redes sociales', '{}', false, 'medios'),
  ('paid_media_ppc_strategist', 'miembro', 'campañas de búsqueda y compras', '{}', false, 'medios'),
  ('paid_media_programmatic_buyer', 'miembro', 'compra programática y display', '{}', false, 'medios'),
  ('paid_media_search_query_analyst', 'miembro', 'términos de búsqueda y palabras negativas', '{}', false, 'medios'),
  ('email-marketer', 'miembro', 'correos a la base propia', '{}', false, 'medios'),
  ('optimization-agent', 'miembro', 'optimización de campañas según sus resultados', '{}', false, 'medios'),
  ('reporting_agent', 'miembro', 'análisis de datos e informes de resultados', '{}', false, 'medios'),
  ('tracking-specialist', 'miembro', 'medición de conversiones y atribución', '{}', false, 'medios'),
  ('community_manager', 'miembro', 'comunidad y reputación en redes', '{}', false, 'relaciones'),
  ('review-responder', 'miembro', 'clasifica reseñas públicas y redacta respuestas', '{}', false, 'relaciones'),
  ('marketing_twitter_engager', 'miembro', 'conversación y presencia en X', '{}', false, 'relaciones'),
  ('pr-earned-media-manager', 'miembro', 'prensa ganada y relación con medios', '{}', false, 'relaciones'),
  ('influencer-manager', 'miembro', 'alianzas con creadores e influencers', '{}', false, 'relaciones')
ON CONFLICT (agente) DO NOTHING;

UPDATE public.agents SET department_id = '9e45ceeb-063f-44e8-9033-9897b6aa8428' WHERE department_id = 'fabeb80c-a5c7-48ff-9725-33c52ba0a322';
DELETE FROM public.departments WHERE id = 'fabeb80c-a5c7-48ff-9725-33c52ba0a322' AND name = 'paid_media';

UPDATE public.agents SET department_id = 'df6c193c-2584-40af-a869-7cea79c7059a', reports_to = NULL WHERE name = 'sales-enablement';
DELETE FROM public.departments WHERE id = '3dbba4e0-e325-4dd4-8115-f899c386c4e4' AND name = 'ventas';
UPDATE public.departments SET display_name = 'Ventas', updated_at = now() WHERE id = 'df6c193c-2584-40af-a869-7cea79c7059a' AND display_name <> 'Ventas';

-- Respuesta de Lenovo 02-nov: editor_en_jefe pasa a Marketing y reporta a jefe-marketing (Servicios compartidos queda sin jefe, no se inventa); reporting_agent pasa a Marketing.
UPDATE public.agents SET department_id = '9e45ceeb-063f-44e8-9033-9897b6aa8428', reports_to = '62ca50de-d9da-4b98-8861-3ae30ebe5377', role = 'empleado' WHERE name = 'editor_en_jefe';
UPDATE public.agents SET department_id = '9e45ceeb-063f-44e8-9033-9897b6aa8428' WHERE name = 'reporting_agent';

COMMIT;
