-- PLAN v3 · V1 · los 5 catálogos del plan + semilla · CC#1 · 2026-10-15 · PROPUESTA · NO APLICADA · se aplica con respaldo y SIN corridas en vuelo (quien tenga escritura; CC#3 mide)
-- Diseño: raw/tasks/2026-10-14-DISENO-CC1-plan-v3.md §4 (cinco tablas), §14.7 (via, atributo_cerebro), §17.3 (via_preferida de tres valores), §13.3 bis (G3/G4/G5/G7).
-- GENERADO por scripts/ops/plan-v3-catalogo/generar-migracion.mjs desde src/lib/planeacion/catalogo/semilla.json: NO se edita a mano (la prueba exige que coincidan).
-- 🔴 SOLO tablas NUEVAS (CREATE IF NOT EXISTS) y filas de semilla (ON CONFLICT DO NOTHING). No toca `portero`, alta, Servicio de Apify ni ninguna tabla vieja. IDEMPOTENTE.
-- 🔴 Una fila = una versión: nunca se edita en sitio (V12 inserta version+1 y voltea `vigente`). Índice único parcial: UNA vigente por clave.
-- 🔴 `anon` y `authenticated`: SIN permiso ni política; solo `service_role` (la ruta interna). AGNÓSTICA: ningún rubro, ciudad ni cliente en el esquema.
-- REVERSA: supabase/reversas/202610151300_plan_catalogos_apagada_REVERSA.sql (se niega a borrar si hay filas propias, es decir, más que la semilla).
BEGIN;

CREATE TABLE IF NOT EXISTS public.plan_catalogo_fuentes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fuente_id text NOT NULL,
  proveedor text NOT NULL,
  funcion text NOT NULL,
  via text NOT NULL DEFAULT 'relleno' CHECK (via IN ('cerebro', 'crudo', 'relleno')),
  provee text[] NOT NULL DEFAULT '{}',
  alcance text,
  aplica_si jsonb,
  criticidad text NOT NULL CHECK (criticidad IN ('critica', 'normal', 'baja')),
  reintentos integer NOT NULL DEFAULT 0 CHECK (reintentos BETWEEN 0 AND 3),
  plazo_s integer NOT NULL CHECK (plazo_s BETWEEN 1 AND 900),
  tope_usd numeric(6,2) NOT NULL CHECK (tope_usd BETWEEN 0 AND 5),
  forma text[] NOT NULL DEFAULT '{}',
  moldes_de_ensayo text[] NOT NULL DEFAULT '{}',
  identidad_campos text[] NOT NULL DEFAULT '{}',
  da_ausencia_con text,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  vigente boolean NOT NULL DEFAULT true,
  desde timestamptz NOT NULL DEFAULT now(),
  pais text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (fuente_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS plan_catalogo_fuentes_una_vigente ON public.plan_catalogo_fuentes (fuente_id) WHERE vigente;
REVOKE ALL ON public.plan_catalogo_fuentes FROM anon, authenticated;
ALTER TABLE public.plan_catalogo_fuentes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.plan_catalogo_fuentes TO service_role;
DO $pol_plan_catalogo_fuentes$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.plan_catalogo_fuentes'::regclass AND polname = 'plan_catalogo_fuentes_service') THEN CREATE POLICY plan_catalogo_fuentes_service ON public.plan_catalogo_fuentes FOR ALL TO service_role USING (true) WITH CHECK (true); END IF; END $pol_plan_catalogo_fuentes$;

CREATE TABLE IF NOT EXISTS public.plan_catalogo_tipos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo_id text NOT NULL,
  atributo_cerebro text,
  clase_dato text NOT NULL DEFAULT 'atributo' CHECK (clase_dato IN ('atributo', 'acumula')),
  unidad text NOT NULL,
  moneda_requerida boolean NOT NULL DEFAULT false,
  rango jsonb,
  frescura_limite_h numeric(8,1) NOT NULL CHECK (frescura_limite_h > 0),
  critico boolean NOT NULL DEFAULT false,
  tolerancia_redondeo numeric(6,3) NOT NULL DEFAULT 0 CHECK (tolerancia_redondeo BETWEEN 0 AND 1),
  n_minimo integer NOT NULL DEFAULT 0 CHECK (n_minimo >= 0),
  periodo_requerido boolean NOT NULL DEFAULT false,
  comparable_con text[] NOT NULL DEFAULT '{}',
  via_preferida text NOT NULL DEFAULT 'cerebro' CHECK (via_preferida IN ('cerebro', 'crudo', 'relleno')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  vigente boolean NOT NULL DEFAULT true,
  desde timestamptz NOT NULL DEFAULT now(),
  pais text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tipo_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS plan_catalogo_tipos_una_vigente ON public.plan_catalogo_tipos (tipo_id) WHERE vigente;
REVOKE ALL ON public.plan_catalogo_tipos FROM anon, authenticated;
ALTER TABLE public.plan_catalogo_tipos ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.plan_catalogo_tipos TO service_role;
DO $pol_plan_catalogo_tipos$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.plan_catalogo_tipos'::regclass AND polname = 'plan_catalogo_tipos_service') THEN CREATE POLICY plan_catalogo_tipos_service ON public.plan_catalogo_tipos FOR ALL TO service_role USING (true) WITH CHECK (true); END IF; END $pol_plan_catalogo_tipos$;

CREATE TABLE IF NOT EXISTS public.plan_catalogo_reglas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  regla_id text NOT NULL,
  clase text NOT NULL CHECK (clase IN ('identidad', 'contradiccion', 'precedencia', 'cambio_material', 'moneda_pais', 'parametro')),
  operador text NOT NULL CHECK (operador IN ('delegada_en_portero', 'rango', 'edad_max_h', 'igual_unidad', 'difiere_mas_de', 'precede', 'contiene_termino', 'n_minimo')),
  parametros jsonb NOT NULL,
  aplica_a jsonb NOT NULL,
  severidad text NOT NULL CHECK (severidad IN ('bloquea', 'avisa')),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  vigente boolean NOT NULL DEFAULT true,
  desde timestamptz NOT NULL DEFAULT now(),
  pais text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (regla_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS plan_catalogo_reglas_una_vigente ON public.plan_catalogo_reglas (regla_id) WHERE vigente;
REVOKE ALL ON public.plan_catalogo_reglas FROM anon, authenticated;
ALTER TABLE public.plan_catalogo_reglas ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.plan_catalogo_reglas TO service_role;
DO $pol_plan_catalogo_reglas$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.plan_catalogo_reglas'::regclass AND polname = 'plan_catalogo_reglas_service') THEN CREATE POLICY plan_catalogo_reglas_service ON public.plan_catalogo_reglas FOR ALL TO service_role USING (true) WITH CHECK (true); END IF; END $pol_plan_catalogo_reglas$;

CREATE TABLE IF NOT EXISTS public.plan_catalogo_lexico (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lexico_id text NOT NULL,
  idioma text NOT NULL,
  grupo text NOT NULL CHECK (grupo IN ('verificacion', 'ausencia', 'supuesto', 'dominio', 'periodo')),
  terminos text[] NOT NULL CHECK (cardinality(terminos) >= 1),
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  vigente boolean NOT NULL DEFAULT true,
  desde timestamptz NOT NULL DEFAULT now(),
  pais text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lexico_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS plan_catalogo_lexico_una_vigente ON public.plan_catalogo_lexico (lexico_id) WHERE vigente;
REVOKE ALL ON public.plan_catalogo_lexico FROM anon, authenticated;
ALTER TABLE public.plan_catalogo_lexico ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.plan_catalogo_lexico TO service_role;
DO $pol_plan_catalogo_lexico$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.plan_catalogo_lexico'::regclass AND polname = 'plan_catalogo_lexico_service') THEN CREATE POLICY plan_catalogo_lexico_service ON public.plan_catalogo_lexico FOR ALL TO service_role USING (true) WITH CHECK (true); END IF; END $pol_plan_catalogo_lexico$;

CREATE TABLE IF NOT EXISTS public.plan_catalogo_topes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tope_id text NOT NULL,
  tramo text NOT NULL,
  fuente_id text,
  usd numeric(6,2) NOT NULL CHECK (usd BETWEEN 0 AND 10),
  contador text NOT NULL,
  version integer NOT NULL DEFAULT 1 CHECK (version >= 1),
  vigente boolean NOT NULL DEFAULT true,
  desde timestamptz NOT NULL DEFAULT now(),
  pais text,
  creado_en timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tope_id, version)
);
CREATE UNIQUE INDEX IF NOT EXISTS plan_catalogo_topes_una_vigente ON public.plan_catalogo_topes (tope_id) WHERE vigente;
REVOKE ALL ON public.plan_catalogo_topes FROM anon, authenticated;
ALTER TABLE public.plan_catalogo_topes ENABLE ROW LEVEL SECURITY;
GRANT SELECT, INSERT, UPDATE ON public.plan_catalogo_topes TO service_role;
DO $pol_plan_catalogo_topes$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.plan_catalogo_topes'::regclass AND polname = 'plan_catalogo_topes_service') THEN CREATE POLICY plan_catalogo_topes_service ON public.plan_catalogo_topes FOR ALL TO service_role USING (true) WITH CHECK (true); END IF; END $pol_plan_catalogo_topes$;

-- ── semilla (versión 1, vigente) ──
INSERT INTO public.plan_catalogo_fuentes (fuente_id, proveedor, funcion, via, criticidad, reintentos, plazo_s, tope_usd, forma, identidad_campos, da_ausencia_con, version, vigente) VALUES ('cerebro_vivo', 'cerebro', 'fichas_vivas', 'cerebro', 'normal', 0, 30, 0, ARRAY['clase', 'contenido', 'observado_en']::text[], ARRAY[]::text[], 'lista vacía con lectura ok', 1, true) ON CONFLICT (fuente_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_fuentes (fuente_id, proveedor, funcion, via, provee, alcance, criticidad, reintentos, plazo_s, tope_usd, forma, identidad_campos, da_ausencia_con, version, vigente) VALUES ('mapas_ficha', 'apify', 'own_google_maps_profile', 'crudo', ARRAY['puntaje_resenas', 'resenas_total', 'direccion', 'telefono', 'horario']::text[], 'cliente', 'normal', 0, 120, 0.1, ARRAY['title', 'totalScore', 'reviewsCount']::text[], ARRAY['title', 'address', 'phone', 'website']::text[], 'items_count=0', 1, true) ON CONFLICT (fuente_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_fuentes (fuente_id, proveedor, funcion, via, provee, alcance, criticidad, reintentos, plazo_s, tope_usd, forma, identidad_campos, da_ausencia_con, version, vigente) VALUES ('resenas_mapas', 'apify', 'resenas_google_maps', 'crudo', ARRAY['resenas_texto', 'resenas_total']::text[], 'cliente', 'normal', 0, 180, 0.1, ARRAY['text']::text[], ARRAY['placeId']::text[], 'items_count=0', 1, true) ON CONFLICT (fuente_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_fuentes (fuente_id, proveedor, funcion, via, provee, alcance, criticidad, reintentos, plazo_s, tope_usd, forma, identidad_campos, da_ausencia_con, version, vigente) VALUES ('instagram_perfil', 'apify', 'instagram_scraper', 'crudo', ARRAY['seguidores', 'publicaciones_n', 'bio_red', 'comentarios_n']::text[], 'cliente', 'normal', 0, 120, 0.08, ARRAY['username', 'followersCount']::text[], ARRAY['username', 'biography', 'externalUrl']::text[], 'items_count=0', 1, true) ON CONFLICT (fuente_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_fuentes (fuente_id, proveedor, funcion, via, provee, alcance, criticidad, reintentos, plazo_s, tope_usd, forma, identidad_campos, da_ausencia_con, version, vigente) VALUES ('menciones_redes', 'apify', 'menciones_en_redes', 'crudo', ARRAY['menciones']::text[], 'tercero', 'baja', 0, 180, 0.05, ARRAY['text']::text[], ARRAY[]::text[], 'items_count=0', 1, true) ON CONFLICT (fuente_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_fuentes (fuente_id, proveedor, funcion, via, provee, alcance, criticidad, reintentos, plazo_s, tope_usd, forma, identidad_campos, da_ausencia_con, version, vigente) VALUES ('sitio_web', 'apify', 'website_content_scraper', 'crudo', ARRAY['texto_sitio', 'precio', 'horario_sitio']::text[], 'cliente', 'normal', 0, 180, 0.1, ARRAY['url', 'text']::text[], ARRAY['url']::text[], 'items_count=0', 1, true) ON CONFLICT (fuente_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_fuentes (fuente_id, proveedor, funcion, via, provee, alcance, criticidad, reintentos, plazo_s, tope_usd, forma, identidad_campos, da_ausencia_con, version, vigente) VALUES ('biblioteca_anuncios', 'apify', 'facebook_ads_library_scraper', 'relleno', ARRAY['anuncios_activos']::text[], 'cliente', 'baja', 0, 180, 0.1, ARRAY['adArchiveID']::text[], ARRAY['pageName']::text[], 'items_count=0', 1, true) ON CONFLICT (fuente_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_fuentes (fuente_id, proveedor, funcion, via, alcance, criticidad, reintentos, plazo_s, tope_usd, forma, identidad_campos, da_ausencia_con, version, vigente) VALUES ('competidores_mapas', 'apify', 'google_maps_scraper', 'relleno', 'tercero', 'baja', 0, 240, 0.15, ARRAY['title']::text[], ARRAY['title', 'address', 'phone', 'website']::text[], 'items_count=0', 1, true) ON CONFLICT (fuente_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_fuentes (fuente_id, proveedor, funcion, via, provee, alcance, criticidad, reintentos, plazo_s, tope_usd, forma, identidad_campos, da_ausencia_con, version, vigente) VALUES ('analitica_dominio', 'posthog', 'visitas_por_dominio', 'relleno', ARRAY['visitas_periodo']::text[], 'dominio', 'normal', 0, 60, 0, ARRAY['visitas', 'desde', 'hasta']::text[], ARRAY['dominio']::text[], 'visitas=0 declarado', 1, true) ON CONFLICT (fuente_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_fuentes (fuente_id, proveedor, funcion, via, criticidad, reintentos, plazo_s, tope_usd, forma, identidad_campos, da_ausencia_con, version, vigente) VALUES ('manual_vigente', 'manual', 'manual_vigente', 'cerebro', 'normal', 0, 30, 0, ARRAY['version']::text[], ARRAY[]::text[], 'sin manual vigente', 1, true) ON CONFLICT (fuente_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_tipos (tipo_id, atributo_cerebro, clase_dato, unidad, rango, frescura_limite_h, critico, tolerancia_redondeo, n_minimo, comparable_con, via_preferida, version, vigente) VALUES ('puntaje_resenas', 'metrica:mapas:puntaje', 'atributo', 'puntos', '{"min":0,"max":5}'::jsonb, 168, false, 0.05, 0, ARRAY[]::text[], 'cerebro', 1, true) ON CONFLICT (tipo_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_tipos (tipo_id, atributo_cerebro, clase_dato, unidad, rango, frescura_limite_h, critico, tolerancia_redondeo, n_minimo, comparable_con, via_preferida, version, vigente) VALUES ('resenas_total', 'metrica:mapas:resenas', 'atributo', 'reseñas', '{"min":0}'::jsonb, 720, false, 0, 0, ARRAY[]::text[], 'cerebro', 1, true) ON CONFLICT (tipo_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_tipos (tipo_id, atributo_cerebro, clase_dato, unidad, rango, frescura_limite_h, critico, tolerancia_redondeo, n_minimo, comparable_con, via_preferida, version, vigente) VALUES ('seguidores', 'metrica:instagram:seguidores', 'atributo', 'seguidores', '{"min":0}'::jsonb, 168, false, 0, 0, ARRAY[]::text[], 'cerebro', 1, true) ON CONFLICT (tipo_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_tipos (tipo_id, atributo_cerebro, clase_dato, unidad, rango, frescura_limite_h, critico, tolerancia_redondeo, n_minimo, comparable_con, via_preferida, version, vigente) VALUES ('publicaciones_n', 'metrica:instagram:publicaciones', 'atributo', 'publicaciones', '{"min":0}'::jsonb, 168, false, 0, 0, ARRAY[]::text[], 'cerebro', 1, true) ON CONFLICT (tipo_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_tipos (tipo_id, clase_dato, unidad, rango, frescura_limite_h, critico, tolerancia_redondeo, n_minimo, comparable_con, via_preferida, version, vigente) VALUES ('comentarios_n', 'acumula', 'comentarios', '{"min":0}'::jsonb, 168, false, 0, 1, ARRAY[]::text[], 'crudo', 1, true) ON CONFLICT (tipo_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_tipos (tipo_id, atributo_cerebro, clase_dato, unidad, frescura_limite_h, critico, n_minimo, comparable_con, via_preferida, version, vigente) VALUES ('horario', 'mapas:horario', 'atributo', 'texto', 2160, false, 0, ARRAY['horario_sitio']::text[], 'cerebro', 1, true) ON CONFLICT (tipo_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_tipos (tipo_id, atributo_cerebro, clase_dato, unidad, frescura_limite_h, critico, n_minimo, comparable_con, via_preferida, version, vigente) VALUES ('horario_sitio', 'horario:*', 'atributo', 'texto', 2160, false, 0, ARRAY['horario']::text[], 'cerebro', 1, true) ON CONFLICT (tipo_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_tipos (tipo_id, atributo_cerebro, clase_dato, unidad, frescura_limite_h, critico, n_minimo, comparable_con, via_preferida, version, vigente) VALUES ('direccion', 'mapas:direccion', 'atributo', 'texto', 4320, false, 0, ARRAY[]::text[], 'cerebro', 1, true) ON CONFLICT (tipo_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_tipos (tipo_id, atributo_cerebro, clase_dato, unidad, frescura_limite_h, critico, n_minimo, comparable_con, via_preferida, version, vigente) VALUES ('telefono', 'mapas:telefono', 'atributo', 'texto', 4320, false, 0, ARRAY[]::text[], 'cerebro', 1, true) ON CONFLICT (tipo_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_tipos (tipo_id, atributo_cerebro, clase_dato, unidad, frescura_limite_h, critico, n_minimo, comparable_con, via_preferida, version, vigente) VALUES ('bio_red', 'instagram:bio', 'atributo', 'texto', 720, false, 0, ARRAY[]::text[], 'cerebro', 1, true) ON CONFLICT (tipo_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_tipos (tipo_id, atributo_cerebro, clase_dato, unidad, moneda_requerida, rango, frescura_limite_h, critico, tolerancia_redondeo, n_minimo, comparable_con, via_preferida, version, vigente) VALUES ('precio', 'precio:*', 'atributo', 'dinero', true, '{"min":0}'::jsonb, 2160, true, 0, 0, ARRAY[]::text[], 'cerebro', 1, true) ON CONFLICT (tipo_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_tipos (tipo_id, atributo_cerebro, clase_dato, unidad, frescura_limite_h, critico, n_minimo, comparable_con, via_preferida, version, vigente) VALUES ('texto_sitio', 'clase:sitio', 'acumula', 'texto', 2160, false, 1, ARRAY[]::text[], 'cerebro', 1, true) ON CONFLICT (tipo_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_tipos (tipo_id, atributo_cerebro, clase_dato, unidad, frescura_limite_h, critico, n_minimo, comparable_con, via_preferida, version, vigente) VALUES ('menciones', 'clase:mencion', 'acumula', 'texto', 720, false, 1, ARRAY[]::text[], 'cerebro', 1, true) ON CONFLICT (tipo_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_tipos (tipo_id, atributo_cerebro, clase_dato, unidad, frescura_limite_h, critico, n_minimo, comparable_con, via_preferida, version, vigente) VALUES ('resenas_texto', 'clase:resenas', 'acumula', 'texto', 720, false, 1, ARRAY[]::text[], 'cerebro', 1, true) ON CONFLICT (tipo_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_tipos (tipo_id, clase_dato, unidad, rango, frescura_limite_h, critico, tolerancia_redondeo, n_minimo, periodo_requerido, comparable_con, via_preferida, version, vigente) VALUES ('visitas_periodo', 'atributo', 'visitas', '{"min":0}'::jsonb, 48, false, 0, 0, true, ARRAY[]::text[], 'relleno', 1, true) ON CONFLICT (tipo_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_tipos (tipo_id, clase_dato, unidad, rango, frescura_limite_h, critico, n_minimo, comparable_con, via_preferida, version, vigente) VALUES ('anuncios_activos', 'atributo', 'anuncios', '{"min":0}'::jsonb, 168, false, 0, ARRAY[]::text[], 'relleno', 1, true) ON CONFLICT (tipo_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_reglas (regla_id, clase, operador, parametros, aplica_a, severidad, version, vigente) VALUES ('identidad_mapas_ficha', 'identidad', 'delegada_en_portero', '{"modulo":"portero-alimenta","criterio":["filtro.esSobreElCliente","mapas-propia.fichaPropiaDeMapas","alimentar.contextoDelCliente"]}'::jsonb, '{"fuente":"mapas_ficha"}'::jsonb, 'bloquea', 1, true) ON CONFLICT (regla_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_reglas (regla_id, clase, operador, parametros, aplica_a, severidad, version, vigente) VALUES ('identidad_resenas_mapas', 'identidad', 'delegada_en_portero', '{"modulo":"portero-alimenta","criterio":["filtro.filtrarUnidad"]}'::jsonb, '{"fuente":"resenas_mapas"}'::jsonb, 'bloquea', 1, true) ON CONFLICT (regla_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_reglas (regla_id, clase, operador, parametros, aplica_a, severidad, version, vigente) VALUES ('identidad_instagram_perfil', 'identidad', 'delegada_en_portero', '{"modulo":"portero-alimenta","criterio":["filtro.filtrarUnidad"]}'::jsonb, '{"fuente":"instagram_perfil"}'::jsonb, 'bloquea', 1, true) ON CONFLICT (regla_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_reglas (regla_id, clase, operador, parametros, aplica_a, severidad, version, vigente) VALUES ('identidad_menciones_redes', 'identidad', 'delegada_en_portero', '{"modulo":"portero-alimenta","criterio":["filtro.filtrarUnidad"]}'::jsonb, '{"fuente":"menciones_redes"}'::jsonb, 'bloquea', 1, true) ON CONFLICT (regla_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_reglas (regla_id, clase, operador, parametros, aplica_a, severidad, version, vigente) VALUES ('identidad_sitio_web', 'identidad', 'delegada_en_portero', '{"modulo":"portero-alimenta","criterio":["filtro.filtrarUnidad"]}'::jsonb, '{"fuente":"sitio_web"}'::jsonb, 'bloquea', 1, true) ON CONFLICT (regla_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_reglas (regla_id, clase, operador, parametros, aplica_a, severidad, version, vigente) VALUES ('param_listo_dias_rastro', 'parametro', 'n_minimo', '{"dias":2}'::jsonb, '{"fuente":"cerebro_vivo"}'::jsonb, 'avisa', 1, true) ON CONFLICT (regla_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_reglas (regla_id, clase, operador, parametros, aplica_a, severidad, version, vigente) VALUES ('param_espera_listo_min', 'parametro', 'n_minimo', '{"minutos":45,"cada_s":300}'::jsonb, '{"fuente":"cerebro_vivo"}'::jsonb, 'avisa', 1, true) ON CONFLICT (regla_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_reglas (regla_id, clase, operador, parametros, aplica_a, severidad, version, vigente) VALUES ('param_lee_crudo_del_alta', 'parametro', 'n_minimo', '{"valor":true,"max_filas":400}'::jsonb, '{"fuente":"cerebro_vivo"}'::jsonb, 'avisa', 1, true) ON CONFLICT (regla_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_reglas (regla_id, clase, operador, parametros, aplica_a, severidad, version, vigente) VALUES ('param_limite_entrega_h', 'parametro', 'edad_max_h', '{"horas":6}'::jsonb, '{"fuente":"cerebro_vivo"}'::jsonb, 'avisa', 1, true) ON CONFLICT (regla_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_reglas (regla_id, clase, operador, parametros, aplica_a, severidad, version, vigente) VALUES ('param_ventana_corrida_h', 'parametro', 'edad_max_h', '{"horas":48}'::jsonb, '{"fuente":"cerebro_vivo"}'::jsonb, 'avisa', 1, true) ON CONFLICT (regla_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_reglas (regla_id, clase, operador, parametros, aplica_a, severidad, version, vigente, pais) VALUES ('moneda_pais_ec', 'moneda_pais', 'igual_unidad', '{"moneda":"USD","nombres":["ecuador"],"rotulo":"USD por omisión del país: nadie la declaró"}'::jsonb, '{"tipo":"precio"}'::jsonb, 'avisa', 1, true, 'EC') ON CONFLICT (regla_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_reglas (regla_id, clase, operador, parametros, aplica_a, severidad, version, vigente) VALUES ('precedencia_horario', 'precedencia', 'precede', '{"orden":["dueno","medido_mas_reciente","manual","supuesto"],"empate":"cerebro"}'::jsonb, '{"tipo":"horario"}'::jsonb, 'avisa', 1, true) ON CONFLICT (regla_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_reglas (regla_id, clase, operador, parametros, aplica_a, severidad, version, vigente) VALUES ('precedencia_precio', 'precedencia', 'precede', '{"orden":["dueno","medido_mas_reciente","manual","supuesto"],"empate":"cerebro"}'::jsonb, '{"tipo":"precio"}'::jsonb, 'avisa', 1, true) ON CONFLICT (regla_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_reglas (regla_id, clase, operador, parametros, aplica_a, severidad, version, vigente) VALUES ('contradice_horario', 'contradiccion', 'difiere_mas_de', '{"modo":"igualdad_normalizada"}'::jsonb, '{"tipo":"horario"}'::jsonb, 'bloquea', 1, true) ON CONFLICT (regla_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_reglas (regla_id, clase, operador, parametros, aplica_a, severidad, version, vigente) VALUES ('contradice_puntaje', 'contradiccion', 'difiere_mas_de', '{"abs":0.3}'::jsonb, '{"tipo":"puntaje_resenas"}'::jsonb, 'avisa', 1, true) ON CONFLICT (regla_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_reglas (regla_id, clase, operador, parametros, aplica_a, severidad, version, vigente) VALUES ('cambio_material_seguidores', 'cambio_material', 'difiere_mas_de', '{"rel":0.05}'::jsonb, '{"tipo":"seguidores"}'::jsonb, 'avisa', 1, true) ON CONFLICT (regla_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_reglas (regla_id, clase, operador, parametros, aplica_a, severidad, version, vigente) VALUES ('cambio_material_resenas', 'cambio_material', 'difiere_mas_de', '{"abs":1}'::jsonb, '{"tipo":"resenas_total"}'::jsonb, 'avisa', 1, true) ON CONFLICT (regla_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_reglas (regla_id, clase, operador, parametros, aplica_a, severidad, version, vigente) VALUES ('cambio_material_puntaje', 'cambio_material', 'difiere_mas_de', '{"abs":0.1}'::jsonb, '{"tipo":"puntaje_resenas"}'::jsonb, 'avisa', 1, true) ON CONFLICT (regla_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_lexico (lexico_id, idioma, grupo, terminos, version, vigente, pais) VALUES ('es_verificacion', 'es', 'verificacion', ARRAY['verificad', 'verificamos', 'comprobad', 'comprobamos', 'confirmad', 'confirmamos', 'constatad', 'constatamos', 'medid', 'validad', 'corroborad', 'certificad', '(fuente:']::text[], 1, true, 'EC') ON CONFLICT (lexico_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_lexico (lexico_id, idioma, grupo, terminos, version, vigente, pais) VALUES ('es_ausencia', 'es', 'ausencia', ARRAY['no tiene', 'no cuenta con', 'sin pauta', 'no posee', 'no existe', 'no hay', 'carece de', 'no utiliza', 'no invierte', 'no pauta', 'ninguno', 'ninguna']::text[], 1, true, 'EC') ON CONFLICT (lexico_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_lexico (lexico_id, idioma, grupo, terminos, version, vigente, pais) VALUES ('es_supuesto', 'es', 'supuesto', ARRAY['supuesto', 'asumimos', 'se asume', 'estimamos', 'estimad', 'aproximad', 'por omision', 'tentativ', 'hipotesis', 'no se pudo', 'no pudimos', 'no sabemos', 'no se sabe', 'sin base', 'lo aclara']::text[], 1, true, 'EC') ON CONFLICT (lexico_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_lexico (lexico_id, idioma, grupo, terminos, version, vigente, pais) VALUES ('es_dominio', 'es', 'dominio', ARRAY['en el sitio', 'en el dominio', 'del sitio web', 'en la web', 'en nuestro sitio']::text[], 1, true, 'EC') ON CONFLICT (lexico_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_lexico (lexico_id, idioma, grupo, terminos, version, vigente, pais) VALUES ('es_periodo', 'es', 'periodo', ARRAY['ultimo mes', 'ultimos 30 dias', 'ultimos 7 dias', 'esta semana', 'semana pasada', 'este mes', 'mes pasado', 'hace dias', 'hace semanas', 'ayer', 'hoy']::text[], 1, true, 'EC') ON CONFLICT (lexico_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_topes (tope_id, tramo, usd, contador, version, vigente) VALUES ('tope_recoleccion', 'recoleccion', 0.4, 'plan_recoleccion', 1, true) ON CONFLICT (tope_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_topes (tope_id, tramo, usd, contador, version, vigente) VALUES ('tope_oficina', 'oficina', 1.5, 'plantilla_f8', 1, true) ON CONFLICT (tope_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_topes (tope_id, tramo, usd, contador, version, vigente) VALUES ('tope_redaccion', 'redaccion', 0.8, 'redactor_max_budget', 1, true) ON CONFLICT (tope_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_topes (tope_id, tramo, usd, contador, version, vigente) VALUES ('tope_jefatura', 'jefatura', 0.7, 'jefatura_j7', 1, true) ON CONFLICT (tope_id, version) DO NOTHING;
INSERT INTO public.plan_catalogo_topes (tope_id, tramo, usd, contador, version, vigente) VALUES ('tope_cupo_ficha', 'cupo_ficha', 4, 'spend_cap_usd_ficha', 1, true) ON CONFLICT (tope_id, version) DO NOTHING;

COMMIT;

NOTIFY pgrst, 'reload schema';
