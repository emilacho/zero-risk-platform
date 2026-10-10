-- OFICINA DE CREATIVOS v1.1 · SALA 1 «post con foto» · PR 2 · CC#2 · 2026-10-09 · PROPUESTA · NO APLICADA · se aplica primero en copia, certificada por CC#3, y solo después en producción
-- Diseño: docs/DISENO-2026-10-09-oficina-v1-1-sala-1-post-con-foto.md §3.3 + §16 y docs/DISENO-2026-10-09-oficina-salas-2-3-4.md §4.3 y §5.3. Orden de Lenovo: raw/tasks/2026-10-09-ENCARGO-LENOVO-construir-sala-1.md (todo APAGADO).
-- 🔴 SOLO ADITIVA: 9 tablas NUEVAS. No toca ni borra nada de lo que ya existe (ni `hitl_queue`, ni las tablas de la cadena, ni el mapa de viajes). Sin disparadores ni funciones.
-- 🔴 NADIE las usa todavía: ninguna ruta ni flujo las nombra (una prueba permanente lo vigila). La oficina nace APAGADA (`oficina_config.estado = 'apagada'`, sin familias activas) y la plantilla `post_img` nace INACTIVA.
-- 🔴 IDEMPOTENTE (repetible): IF NOT EXISTS, ON CONFLICT DO NOTHING y bloques DO para lo que no admite IF NOT EXISTS. `client_id` es TEXTO sin llave hacia tablas viejas (igual que las del cerebro y los recados).
-- 🔴 `oficina_artefactos` es de SOLO AGREGAR: el permiso de UPDATE/DELETE no se concede (la historia es la prueba).
-- ORDEN AL PUBLICAR: (1) respaldo confirmado y CERO corridas → (2) esta migración → (3) lectura de permisos y RLS → (4) NOTIFY (ya incluido al final).
-- REVERSA: `supabase/reversas/202610090100_oficina_sala_1_REVERSA.sql` (se niega a borrar si hay encargos o filas añadidas).

BEGIN;

-- ───────────────────────── 1 · la plantilla de cada sala es una fila (los pasos son DATO)
CREATE TABLE IF NOT EXISTS public.oficina_tipos_de_grupo (
  tipo               text         PRIMARY KEY,
  familia            text         NOT NULL,
  pasos              jsonb        NOT NULL,
  indicaciones       jsonb        NOT NULL DEFAULT '{}'::jsonb,
  modelos            jsonb        NOT NULL DEFAULT '{}'::jsonb,
  limites            jsonb        NOT NULL,
  max_rondas         smallint     NOT NULL DEFAULT 2,
  tope_encargo_usd   numeric(10,2) NOT NULL DEFAULT 10,
  activo             boolean      NOT NULL DEFAULT false,
  version            integer      NOT NULL DEFAULT 1,
  creado_en          timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT oficina_tipos_rondas_validas CHECK (max_rondas IN (1, 2)),
  CONSTRAINT oficina_tipos_tope_valido    CHECK (tope_encargo_usd > 0 AND tope_encargo_usd <= 10)
);

-- ───────────────────────── 2 · la llave de la oficina: UNA fila, apagada
CREATE TABLE IF NOT EXISTS public.oficina_config (
  id                smallint     PRIMARY KEY DEFAULT 1,
  estado            text         NOT NULL DEFAULT 'apagada',
  familias_activas  text[]       NOT NULL DEFAULT '{}',
  clientes_ensayo   text[]       NOT NULL DEFAULT '{}',
  actualizado_en    timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT oficina_config_una_sola_fila CHECK (id = 1),
  CONSTRAINT oficina_config_estado_valido CHECK (estado IN ('apagada', 'ensayo', 'encendida'))
);

-- ───────────────────────── 3 · los encargos: uno por (parte, brief, tipo, versión); el estado del motor vive aquí (n8n no guarda estado)
CREATE TABLE IF NOT EXISTS public.oficina_encargos (
  id                uuid         PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id         text         NOT NULL,
  parte_id          uuid         NOT NULL,
  brief_id          text         NOT NULL,
  tipo_de_grupo     text         NOT NULL REFERENCES public.oficina_tipos_de_grupo(tipo),
  familia           text         NOT NULL,
  version_encargo   integer      NOT NULL DEFAULT 1,
  estado            text         NOT NULL DEFAULT 'abierto',
  estado_del_motor  jsonb        NOT NULL DEFAULT '{}'::jsonb,
  con_desacuerdo    boolean      NOT NULL DEFAULT false,
  imagen_generada   boolean      NOT NULL DEFAULT false,
  slack_canal       text,
  slack_ts          text,
  tope_usd          numeric(10,6) NOT NULL DEFAULT 10,
  gasto_usd         numeric(10,6) NOT NULL DEFAULT 0,
  salida_output_id  uuid,
  hitl_queue_id     uuid,
  sala_ref          jsonb,
  dry_run           boolean      NOT NULL,
  prueba            boolean      NOT NULL DEFAULT false,
  creado_en         timestamptz  NOT NULL DEFAULT now(),
  cerrado_en        timestamptz,
  CONSTRAINT oficina_encargos_estado_valido CHECK (estado IN ('abierto', 'en_paso', 'cerrado', 'cerrado_por_tope', 'fallido')),
  CONSTRAINT oficina_encargos_tope_valido   CHECK (tope_usd > 0 AND tope_usd <= 10),
  CONSTRAINT oficina_encargos_gasto_valido  CHECK (gasto_usd >= 0)
);
-- 🔴 la idempotencia la da la base: el mismo pedido no abre dos encargos
CREATE UNIQUE INDEX IF NOT EXISTS oficina_encargos_uno_por_pedido ON public.oficina_encargos (parte_id, brief_id, tipo_de_grupo, version_encargo);
CREATE INDEX IF NOT EXISTS oficina_encargos_por_cliente ON public.oficina_encargos (client_id, estado, creado_en DESC);

-- ───────────────────────── 4 · los pasos ejecutados (un paso = una ejecución corta con workflow_id)
CREATE TABLE IF NOT EXISTS public.oficina_turnos (
  id                    bigserial    PRIMARY KEY,
  encargo_id            uuid         NOT NULL REFERENCES public.oficina_encargos(id),
  n                     smallint     NOT NULL,
  paso                  text         NOT NULL,
  tipo                  text         NOT NULL,
  agente                text,
  estado                text         NOT NULL DEFAULT 'pendiente',
  workflow_id           text,
  workflow_execution_id text,
  dispatch_key          text,
  entrada_refs          jsonb        NOT NULL DEFAULT '[]'::jsonb,
  cost_usd              numeric(10,6) NOT NULL DEFAULT 0,
  tokens_in             integer,
  tokens_out            integer,
  inicio                timestamptz,
  fin                   timestamptz,
  error                 text,
  slack_error           text,
  CONSTRAINT oficina_turnos_estado_valido CHECK (estado IN ('pendiente', 'corriendo', 'hecho', 'fallo', 'muerto')),
  CONSTRAINT oficina_turnos_tipo_valido   CHECK (tipo IN ('portero', 'agente', 'codigo', 'externo', 'brazo')),
  CONSTRAINT oficina_turnos_costo_valido  CHECK (cost_usd >= 0)
);
CREATE UNIQUE INDEX IF NOT EXISTS oficina_turnos_uno_por_n ON public.oficina_turnos (encargo_id, n);
CREATE UNIQUE INDEX IF NOT EXISTS oficina_turnos_una_llave ON public.oficina_turnos (dispatch_key) WHERE dispatch_key IS NOT NULL;
CREATE INDEX IF NOT EXISTS oficina_turnos_vivos ON public.oficina_turnos (estado, inicio) WHERE estado IN ('pendiente', 'corriendo');

-- ───────────────────────── 5 · los artefactos: SOLO se agregan, nunca se editan
CREATE TABLE IF NOT EXISTS public.oficina_artefactos (
  id          bigserial    PRIMARY KEY,
  encargo_id  uuid         NOT NULL REFERENCES public.oficina_encargos(id),
  turno_id    bigint       REFERENCES public.oficina_turnos(id),
  tipo        text         NOT NULL,
  version     integer      NOT NULL,
  contenido   jsonb        NOT NULL DEFAULT '{}'::jsonb,
  texto       text,
  sha256      text         NOT NULL,
  autor       text,
  creado_en   timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT oficina_artefactos_version_valida CHECK (version >= 1)
);
CREATE UNIQUE INDEX IF NOT EXISTS oficina_artefactos_una_version ON public.oficina_artefactos (encargo_id, tipo, version);

-- ───────────────────────── 6 · las fichas (qué · dónde · contra qué · gravedad · propuesta)
CREATE TABLE IF NOT EXISTS public.oficina_fichas (
  encargo_id        uuid         NOT NULL REFERENCES public.oficina_encargos(id),
  ficha_id          text         NOT NULL,
  turno_id          bigint       REFERENCES public.oficina_turnos(id),
  origen            text         NOT NULL,
  donde             text         NOT NULL,
  gravedad          text         NOT NULL,
  que               text,
  contra_que        text,
  propuesta         text,
  estado            text         NOT NULL DEFAULT 'abierta',
  razon             text,
  resuelta_en_turno smallint,
  creado_en         timestamptz  NOT NULL DEFAULT now(),
  PRIMARY KEY (encargo_id, ficha_id),
  CONSTRAINT oficina_fichas_origen_valido   CHECK (origen IN ('chequeo', 'jefe', 'externa')),
  CONSTRAINT oficina_fichas_gravedad_valida CHECK (gravedad IN ('bloquea', 'sugerencia')),
  CONSTRAINT oficina_fichas_estado_valido   CHECK (estado IN ('abierta', 'tomada', 'no_tomada'))
);

-- ───────────────────────── 7 · el gasto (modelo + revisor + imagen + portero) para el freno de US$ 10
CREATE TABLE IF NOT EXISTS public.oficina_gastos (
  id          bigserial    PRIMARY KEY,
  encargo_id  uuid         NOT NULL REFERENCES public.oficina_encargos(id),
  turno_id    bigint       REFERENCES public.oficina_turnos(id),
  concepto    text         NOT NULL,
  ref_tabla   text,
  ref_id      text,
  cost_usd    numeric(10,6) NOT NULL,
  base        text         NOT NULL,
  creado_en   timestamptz  NOT NULL DEFAULT now(),
  CONSTRAINT oficina_gastos_concepto_valido CHECK (concepto IN ('modelo', 'revisor_externo', 'imagen', 'portero')),
  CONSTRAINT oficina_gastos_base_valida     CHECK (base IN ('usage', 'estimado')),
  CONSTRAINT oficina_gastos_costo_valido    CHECK (cost_usd >= 0)
);
-- 🔴 un mismo cobro (una imagen, una invocación) se suma UNA vez
CREATE UNIQUE INDEX IF NOT EXISTS oficina_gastos_una_vez ON public.oficina_gastos (ref_tabla, ref_id) WHERE ref_tabla IS NOT NULL AND ref_id IS NOT NULL;

-- ───────────────────────── 8 · uso de fotos (que no se repita la misma foto dentro de la ventana)
CREATE TABLE IF NOT EXISTS public.oficina_uso_de_fotos (
  id          bigserial    PRIMARY KEY,
  client_id   text         NOT NULL,
  foto_id     text         NOT NULL,
  encargo_id  uuid         NOT NULL REFERENCES public.oficina_encargos(id),
  rol         text,
  usada_en    timestamptz  NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS oficina_uso_de_fotos_una_por_encargo ON public.oficina_uso_de_fotos (encargo_id, foto_id);
CREATE INDEX IF NOT EXISTS oficina_uso_de_fotos_por_cliente ON public.oficina_uso_de_fotos (client_id, foto_id, usada_en DESC);

-- ───────────────────────── 9 · especificaciones técnicas de entrega por red y formato (config sin cliente)
CREATE TABLE IF NOT EXISTS public.oficina_entrega_formatos (
  red                 text         NOT NULL,
  formato             text         NOT NULL,
  ancho               integer      NOT NULL,
  alto                integer      NOT NULL,
  ratio               text         NOT NULL,
  tipos_archivo       text[]       NOT NULL,
  peso_max_mb         numeric(6,1) NOT NULL,
  n_min               smallint     NOT NULL,
  n_max               smallint     NOT NULL,
  texto_max           integer      NOT NULL,
  hashtags_max        integer      NOT NULL,
  pasos_publicacion   text[]       NOT NULL DEFAULT '{}',
  fuente_url          text,
  verificado_en       date,
  verificado          boolean      NOT NULL DEFAULT false,
  PRIMARY KEY (red, formato),
  CONSTRAINT oficina_entrega_medidas_validas CHECK (ancho > 0 AND alto > 0),
  CONSTRAINT oficina_entrega_cantidad_valida CHECK (n_min >= 1 AND n_max >= n_min)
);

-- ───────────────────────── 10 · siembras: la oficina APAGADA, la plantilla post_img INACTIVA, dos formatos SIN verificar
INSERT INTO public.oficina_config (id, estado, familias_activas, clientes_ensayo) VALUES (1, 'apagada', '{}', '{}') ON CONFLICT (id) DO NOTHING;

INSERT INTO public.oficina_tipos_de_grupo (tipo, familia, pasos, indicaciones, modelos, limites, max_rondas, tope_encargo_usd, activo) VALUES (
  'post_img', 'post_img',
  $pasos$[{"clave":"abrir","tipo":"codigo","quien":"sala","funcion":"abrir","condicion":{"tipo":"siempre"},"entrada":[],"salida_artefacto":"encargo","tope_usd":0},{"clave":"paquete","tipo":"portero","quien":"portero","condicion":{"tipo":"siempre"},"entrada":["encargo"],"salida_artefacto":"material_portero","tope_usd":0.06},{"clave":"elegir_foto","tipo":"codigo","quien":"sala","funcion":"elegir_foto","condicion":{"tipo":"siempre"},"entrada":["material_portero"],"salida_artefacto":"candidatas_foto","tope_usd":0},{"clave":"direccion_visual","tipo":"agente","quien":"marketing_instagram_curator","condicion":{"tipo":"siempre"},"entrada":["material_portero","candidatas_foto"],"salida_artefacto":"visual_direction","tope_usd":0.25,"salida":{"esquema":"visual_direction.v1","reintento_formato":1},"valida":["citas_existen"]},{"clave":"prompts","tipo":"agente","quien":"design-image-prompt-engineer","condicion":{"tipo":"si_artefacto","artefacto":"visual_direction","campo":"decision.modo","igual":"generada"},"entrada":["visual_direction"],"salida_artefacto":"prompts","tope_usd":0.2,"salida":{"esquema":"prompts.v1","reintento_formato":1}},{"clave":"chequear_prompts","tipo":"codigo","quien":"sala","funcion":"chequear_prompts","condicion":{"tipo":"si_artefacto","artefacto":"visual_direction","campo":"decision.modo","igual":"generada"},"entrada":["prompts","visual_direction"],"salida_artefacto":"prompts_validos","tope_usd":0,"vuelve_a":{"paso":"prompts","max":1,"si":{"tipo":"si_artefacto","artefacto":"prompts_validos","campo":"ninguno","igual":true}}},{"clave":"imagen","tipo":"codigo","quien":"sala","funcion":"imagen","condicion":{"tipo":"si_artefacto","artefacto":"visual_direction","campo":"decision.modo","igual":"generada"},"entrada":["prompts_validos"],"salida_artefacto":"imagenes","tope_usd":0.1},{"clave":"mirar","tipo":"agente","quien":"marketing_instagram_curator","condicion":{"tipo":"si_artefacto","artefacto":"visual_direction","campo":"decision.requiere_mirar","igual":true},"entrada":["imagenes","visual_direction"],"salida_artefacto":"observacion_imagen","tope_usd":0.2,"salida":{"esquema":"observacion_imagen.v1","reintento_formato":1},"valida":["decide_imagen"],"vuelve_a":{"paso":"imagen","max":2,"si":{"tipo":"si_artefacto","artefacto":"observacion_imagen","campo":"veredicto.regenerar","igual":true}}},{"clave":"elegir_version","tipo":"codigo","quien":"sala","funcion":"elegir_version","condicion":{"tipo":"si_artefacto","artefacto":"visual_direction","campo":"decision.modo","igual":"generada"},"entrada":["imagenes","observacion_imagen"],"salida_artefacto":"imagen_elegida","tope_usd":0},{"clave":"acabado","tipo":"codigo","quien":"sala","funcion":"acabado_imagen","condicion":{"tipo":"siempre"},"entrada":["imagen_elegida","candidatas_foto"],"salida_artefacto":"imagen_final","tope_usd":0},{"clave":"texto","tipo":"agente","quien":"content-creator","condicion":{"tipo":"siempre"},"entrada":["material_portero","visual_direction","observacion_imagen"],"salida_artefacto":"pieza_post","tope_usd":0.2,"salida":{"esquema":"pieza_post.v1","reintento_formato":1}},{"clave":"chequeos","tipo":"codigo","quien":"sala","funcion":"chequeos","condicion":{"tipo":"siempre"},"entrada":["pieza_post","imagen_final","observacion_imagen"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"revision_jefe","tipo":"agente","quien":"jefe-marketing","condicion":{"tipo":"siempre"},"ronda":1,"entrada":["pieza_post","imagen_final","chequeos"],"salida_artefacto":"fichas_jefe","tope_usd":0.2,"salida":{"esquema":"fichas.v1","reintento_formato":1}},{"clave":"corrige","tipo":"agente","quien":"dueno_del_donde","condicion":{"tipo":"si_fichas_abiertas","origen":"jefe","gravedad":"bloquea"},"ronda":1,"entrada":["fichas_jefe","pieza_post"],"salida_artefacto":"pieza_post","tope_usd":0.2,"salida":{"esquema":"resolucion.v1","reintento_formato":1}},{"clave":"chequeos_2","tipo":"codigo","quien":"sala","funcion":"chequeos","condicion":{"tipo":"si_cambio","artefacto":"pieza_post"},"entrada":["pieza_post","imagen_final"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"revisor_externo","tipo":"externo","quien":"GPT","condicion":{"tipo":"siempre"},"ronda":2,"entrada":["pieza_post","imagen_final","visual_direction","material_portero"],"salida_artefacto":"fichas_externas","tope_usd":0.5,"salida":{"esquema":"fichas.v1","reintento_formato":1}},{"clave":"decide","tipo":"agente","quien":"dueno_del_donde","condicion":{"tipo":"si_fichas_abiertas","origen":"externa"},"ronda":2,"entrada":["fichas_externas","pieza_post"],"salida_artefacto":"pieza_post","tope_usd":0.2,"salida":{"esquema":"resolucion.v1","reintento_formato":1}},{"clave":"chequeos_3","tipo":"codigo","quien":"sala","funcion":"chequeos","condicion":{"tipo":"si_cambio","artefacto":"pieza_post"},"entrada":["pieza_post","imagen_final"],"salida_artefacto":"chequeos","tope_usd":0},{"clave":"entrega","tipo":"codigo","quien":"sala","funcion":"empaquetar_entrega","condicion":{"tipo":"siempre"},"entrada":["pieza_post","imagen_final","chequeos"],"salida_artefacto":"entrega","tope_usd":0},{"clave":"cierre","tipo":"codigo","quien":"sala","funcion":"cierre","condicion":{"tipo":"siempre"},"entrada":["entrega"],"salida_artefacto":"cierre","tope_usd":0}]$pasos$::jsonb,
  $ind${"marketing_instagram_curator":[{"regla":"Eres el director visual del encargo. Entregas la dirección visual, la decisión de imagen y las reglas de imagen (obligatorio y prohibido), cada una con la cita literal del brief de la que sale cuando el brief es de texto.","aplica":"codigo:citas_existen"},{"regla":"Partes del manual y de las fotos candidatas que te pasa la sala: si una foto cumple, indica su identificador; si ninguna sirve, pides una generada.","aplica":"codigo:salida"},{"regla":"No inventes marcas, rostros, precios ni lugares; lo que no puedas saber, decláralo como faltante.","aplica":"codigo:chequeos"},{"regla":"Cuando miras una imagen, describes por cada regla si está presente, ausente o no se ve, con la evidencia; no opinas ni la apruebas.","aplica":"codigo:decide_imagen"},{"regla":"El idioma, el registro y el estilo son los del manual y el brief del cliente.","aplica":"guia"}],"content-creator":[{"regla":"Escribes en el idioma y el registro que fija el manual del cliente (si no lo dice, los del país y el idioma del cliente) y no los mezclas.","aplica":"codigo:chequeos"},{"regla":"Lees el manual, el plan y el brief; el brief es guía, no regla; la estructura del texto la dicta el brief.","aplica":"guia"},{"regla":"No inventes precios, horarios, sedes, reseñas ni nombres; si falta un dato, decláralo.","aplica":"codigo:chequeos"},{"regla":"Entregas el pie de foto y los hashtags en campos aparte.","aplica":"codigo:salida"},{"regla":"Ante correcciones, respondes ítem por ítem: tomada o no tomada, con la razón.","aplica":"codigo:salida"}],"jefe-marketing":[{"regla":"No repartes trabajo ni asignas tareas a otros.","aplica":"codigo:motor"},{"regla":"Revisas una sola vez.","aplica":"codigo:motor"},{"regla":"Entregas fichas con qué, dónde, contra qué, gravedad y propuesta.","aplica":"codigo:salida"},{"regla":"No reescribes la pieza: señalas y propones.","aplica":"codigo:salida"},{"regla":"La imagen también es parte de la pieza: revísala contra el manual y el brief.","aplica":"guia"}],"design-image-prompt-engineer":[{"regla":"Propones 2 o 3 prompts de imagen distintos en lenguaje natural (sujeto, entorno, luz, cámara, estilo); el curador elige.","aplica":"codigo:salida"},{"regla":"Personas, texto dentro de la imagen y estilo los deciden el manual de marca y el brief de este cliente; nunca logos ni marcas de otro negocio.","aplica":"codigo:chequear_prompts"},{"regla":"El tamaño lo fija la sala; no escribas relaciones de aspecto ni parámetros.","aplica":"codigo:salida"},{"regla":"No nombres marcas, fotógrafos ni personas reales.","aplica":"codigo:chequear_prompts"},{"regla":"Devuelves solo el JSON del contrato.","aplica":"codigo:salida"}]}$ind$::jsonb,
  '{}'::jsonb,
  $lim${"margen":6,"tope_encargo_usd":10,"max_rondas":2,"imagenes_generadas_max":3,"reuso_dias":14,"pie_de_foto_max":2200,"hashtags_max":30,"limites_verificados":false,"formato_por_omision":"1:1"}$lim$::jsonb,
  2, 10, false
) ON CONFLICT (tipo) DO NOTHING;

-- 🔴 los límites de texto, hashtags y peso son de uso general y NO están verificados contra la documentación vigente de cada red: `verificado = false` ⇒ el chequeo AVISA y no bloquea. Las MEDIDAS sí bloquean (1080×1080 y 1080×1350 son las que pide el diseño de la sala 1).
INSERT INTO public.oficina_entrega_formatos (red, formato, ancho, alto, ratio, tipos_archivo, peso_max_mb, n_min, n_max, texto_max, hashtags_max, pasos_publicacion, fuente_url, verificado_en, verificado) VALUES
  ('instagram', 'foto_1x1', 1080, 1080, '1:1', ARRAY['png','jpeg'], 8, 1, 1, 2200, 30, ARRAY['Descargar la imagen','Crear una publicación nueva y elegir la imagen','Pegar el texto de la hoja de entrega','Programar o publicar a la hora indicada'], NULL, NULL, false),
  ('instagram', 'foto_4x5', 1080, 1350, '4:5', ARRAY['png','jpeg'], 8, 1, 1, 2200, 30, ARRAY['Descargar la imagen','Crear una publicación nueva y elegir la imagen','Pegar el texto de la hoja de entrega','Programar o publicar a la hora indicada'], NULL, NULL, false)
ON CONFLICT (red, formato) DO NOTHING;

-- ───────────────────────── 11 · permisos y seguridad por fila (la lección del proyecto: CREATE TABLE no alcanza)
ALTER TABLE public.oficina_tipos_de_grupo ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oficina_config ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oficina_encargos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oficina_turnos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oficina_artefactos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oficina_fichas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oficina_gastos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oficina_uso_de_fotos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oficina_entrega_formatos ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oficina_tipos_de_grupo FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.oficina_config FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.oficina_encargos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.oficina_turnos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.oficina_artefactos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.oficina_fichas FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.oficina_gastos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.oficina_uso_de_fotos FROM PUBLIC, anon, authenticated;
REVOKE ALL ON public.oficina_entrega_formatos FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oficina_tipos_de_grupo TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oficina_config TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oficina_encargos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oficina_turnos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oficina_fichas TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oficina_gastos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oficina_uso_de_fotos TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oficina_entrega_formatos TO service_role;
-- 🔴 los artefactos solo se agregan: sin UPDATE ni DELETE
GRANT SELECT, INSERT ON public.oficina_artefactos TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.oficina_turnos_id_seq, public.oficina_artefactos_id_seq, public.oficina_gastos_id_seq, public.oficina_uso_de_fotos_id_seq TO service_role;
DO $oficina$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.oficina_tipos_de_grupo'::regclass AND polname = 'oficina_tipos_de_grupo_service') THEN
    CREATE POLICY oficina_tipos_de_grupo_service ON public.oficina_tipos_de_grupo FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.oficina_config'::regclass AND polname = 'oficina_config_service') THEN
    CREATE POLICY oficina_config_service ON public.oficina_config FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.oficina_encargos'::regclass AND polname = 'oficina_encargos_service') THEN
    CREATE POLICY oficina_encargos_service ON public.oficina_encargos FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.oficina_turnos'::regclass AND polname = 'oficina_turnos_service') THEN
    CREATE POLICY oficina_turnos_service ON public.oficina_turnos FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.oficina_artefactos'::regclass AND polname = 'oficina_artefactos_service') THEN
    CREATE POLICY oficina_artefactos_service ON public.oficina_artefactos FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.oficina_fichas'::regclass AND polname = 'oficina_fichas_service') THEN
    CREATE POLICY oficina_fichas_service ON public.oficina_fichas FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.oficina_gastos'::regclass AND polname = 'oficina_gastos_service') THEN
    CREATE POLICY oficina_gastos_service ON public.oficina_gastos FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.oficina_uso_de_fotos'::regclass AND polname = 'oficina_uso_de_fotos_service') THEN
    CREATE POLICY oficina_uso_de_fotos_service ON public.oficina_uso_de_fotos FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = 'public.oficina_entrega_formatos'::regclass AND polname = 'oficina_entrega_formatos_service') THEN
    CREATE POLICY oficina_entrega_formatos_service ON public.oficina_entrega_formatos FOR ALL TO service_role USING (true) WITH CHECK (true);
  END IF;
END
$oficina$;

COMMENT ON TABLE public.oficina_tipos_de_grupo IS 'OFICINA · la plantilla de cada sala (los pasos son dato). Se siembra post_img INACTIVA. Solo la oficina la lee.';
COMMENT ON TABLE public.oficina_config IS 'OFICINA · la llave: apagada · ensayo · encendida. Una sola fila; nace APAGADA.';
COMMENT ON TABLE public.oficina_encargos IS 'OFICINA · un encargo por (parte, brief, tipo, versión); guarda el estado del motor para reanudar.';
COMMENT ON TABLE public.oficina_artefactos IS 'OFICINA · artefactos versionados y con huella; SOLO se agregan (sin UPDATE ni DELETE).';
COMMENT ON TABLE public.oficina_entrega_formatos IS 'OFICINA · especificación técnica de entrega por red y formato; mientras verificado = false los límites de texto/peso avisan y no bloquean.';

COMMIT;

-- 🔴 una tabla nueva no la ve PostgREST hasta recargar su catálogo (medido 03-oct)
NOTIFY pgrst, 'reload schema';
