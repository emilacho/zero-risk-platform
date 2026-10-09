-- LA CADENA (plan → estrategia → calendario → validador → parte) · PR 1 · CC#1 · 2026-10-09 · PROPUESTA · NO APLICADA · pide certificación de CC#3 en copia y la firma de aplicar.
-- Diseño: docs/DISENO-2026-10-09-cadena-calendario-a-brief-v2.md §10.1 (11 tablas) con las 7 condiciones de CC#3 (raw/tasks/2026-10-09-CONTRASTE-CC3-cadena-v2.md) y las correcciones de Emilio del 09-oct.
-- 🔴 SOLO ADITIVA: 11 tablas NUEVAS `cadena_*`. No toca ni borra nada existente. Sin disparadores ni funciones. NADIE las usa todavía (rutas, validador y flujos vienen en los PRs siguientes).
-- 🔴 NACE APAGADA: `cadena_config.estado_cadena = 'apagada'`. Nada se enciende con esta migración.
-- 🔴 CERO CONTACTO CON EL CLIENTE (Emilio, 09-oct): no hay columna ni valor que apunte a una persona del cliente. `verificado_por` solo admite 'codigo'; `origen` de una fecha que importa es plan | estrategia | alta (lo firmado por Emilio). Lo único que espera a una persona es la bandeja de Emilio.
-- 🔴 IDEMPOTENTE (repetible): IF NOT EXISTS, ON CONFLICT DO NOTHING y bloques DO para lo que no admite IF NOT EXISTS. `client_id` es TEXTO sin llave hacia tablas viejas (igual que las del cerebro y la sala). Una sola transacción.
-- 🔴 NO ESPERA SIN RELOJ (V21): `cadena_esperas.vence_en` es NOT NULL; `cadena_corridas.plazo_en` es NOT NULL mientras la llamada está en curso (CC#3 cond. 2); el vigía deja `ultimo_latido` en `cadena_config` (cond. 2).
-- ORDEN AL PUBLICAR: (1) respaldo confirmado y CERO corridas → (2) esta migración → (3) lectura de permisos y RLS → (4) NOTIFY (ya incluido al final).
-- REVERSA: `supabase/reversas/202610090100_cadena_tablas_REVERSA.sql` (se niega a borrar si hay campañas, estrategias, filas o corridas).

BEGIN;

-- ───────────────────────── 1 · el interruptor y los datos de ajuste (sin publicar)
CREATE TABLE IF NOT EXISTS public.cadena_config (
  clave          text        PRIMARY KEY,
  valor          jsonb       NOT NULL,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cadena_config_estado_valido CHECK (clave <> 'estado_cadena' OR (valor #>> '{}') IN ('apagada','ensayo','encendida'))
);

-- ───────────────────────── 2 · plazos de las esperas (datos, no código)
CREATE TABLE IF NOT EXISTS public.cadena_plazos (
  tipo               text        PRIMARY KEY,
  recordatorio_horas integer,
  alerta_horas       integer,
  vence_horas        integer,
  vence_regla        text,
  accion_al_vencer   text        NOT NULL,
  descripcion        text,
  CONSTRAINT cadena_plazos_hay_vencimiento CHECK (vence_horas IS NOT NULL OR vence_regla IS NOT NULL)
);

-- ───────────────────────── 3 · qué se puede en cada red (configuración, sin cliente)
CREATE TABLE IF NOT EXISTS public.cadena_formatos_por_red (
  red            text        NOT NULL,
  formato        text        NOT NULL,
  tipo_salida    integer,
  lead_dias      integer     NOT NULL,
  brief_soportado boolean    NOT NULL DEFAULT true,
  produccion     text        NOT NULL DEFAULT 'opera',
  max_por_dia    integer,
  PRIMARY KEY (red, formato),
  CONSTRAINT cadena_formatos_produccion_valida CHECK (produccion IN ('opera','espera_brazo')),
  CONSTRAINT cadena_formatos_lead_valido CHECK (lead_dias >= 0)
);

-- ───────────────────────── 4 · una campaña por plan
CREATE TABLE IF NOT EXISTS public.cadena_campanas (
  id                          uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id                   text        NOT NULL,
  plan_id                     text        NOT NULL,
  fecha_inicio                date        NOT NULL,
  fecha_inicio_origen         text        NOT NULL DEFAULT 'regla',
  fecha_fin                   date        NOT NULL,
  zona_horaria                text        NOT NULL,
  pais                        text,
  sedes                       text[]      NOT NULL DEFAULT '{}',
  estado                      text        NOT NULL DEFAULT 'abierta',
  estado_motivo               text,
  presupuesto_planificacion_usd numeric(8,2) NOT NULL DEFAULT 6,
  ventana_parte_dias          integer     NOT NULL DEFAULT 10,
  sustituir_video_por         text        NOT NULL DEFAULT 'ninguna',
  autoproducir                boolean     NOT NULL DEFAULT false,
  sala_ref                    jsonb       NOT NULL DEFAULT '{}'::jsonb,
  reemplaza_a                 uuid,
  seco                        boolean     NOT NULL DEFAULT false,
  creada_en                   timestamptz NOT NULL DEFAULT now(),
  actualizada_en              timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cadena_campanas_estado_valido CHECK (estado IN ('abierta','estrategia','calendario','activa','pausada','necesita_humano','cerrada','reemplazada')),
  CONSTRAINT cadena_campanas_inicio_origen_valido CHECK (fecha_inicio_origen IN ('regla','alta','emilio')),
  CONSTRAINT cadena_campanas_sustituir_valido CHECK (sustituir_video_por IN ('ninguna','carrusel','foto')),
  CONSTRAINT cadena_campanas_fechas_coherentes CHECK (fecha_fin >= fecha_inicio),
  CONSTRAINT cadena_campanas_un_plan UNIQUE (client_id, plan_id)
);
-- 🔴 dos planes del mismo cliente (CC#3 cond. 6): el plan nuevo trae otro `plan_id` y por lo tanto otra campaña; la anterior pasa a 'reemplazada' (lo hace la ruta). Esta garantía es de la base: a lo más UNA campaña viva por cliente y prueba.
CREATE UNIQUE INDEX IF NOT EXISTS cadena_campanas_una_viva_por_cliente ON public.cadena_campanas (client_id, seco) WHERE estado NOT IN ('cerrada','reemplazada');
CREATE INDEX IF NOT EXISTS cadena_campanas_por_estado ON public.cadena_campanas (estado, creada_en DESC);

-- ───────────────────────── 5 · la estrategia versionada
CREATE TABLE IF NOT EXISTS public.cadena_estrategias (
  id                    bigserial   PRIMARY KEY,
  campana_id            uuid        NOT NULL REFERENCES public.cadena_campanas(id),
  version               integer     NOT NULL,
  estado                text        NOT NULL DEFAULT 'borrador',
  contenido             jsonb       NOT NULL,
  texto_md              text,
  agente                text,
  modelo                text,
  costo_usd             numeric(10,4),
  workflow_execution_id text,
  seco                  boolean     NOT NULL DEFAULT false,
  creada_en             timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cadena_estrategias_estado_valido CHECK (estado IN ('borrador','validada','aprobada','descartada')),
  CONSTRAINT cadena_estrategias_version UNIQUE (campana_id, version)
);

-- ───────────────────────── 6 · la fila = la unidad de todo lo que sigue
CREATE TABLE IF NOT EXISTS public.cadena_calendario_filas (
  id                 text        NOT NULL,
  campana_id         uuid        NOT NULL REFERENCES public.cadena_campanas(id),
  estrategia_version integer     NOT NULL,
  calendario_version integer     NOT NULL,
  tanda              integer     NOT NULL,
  semana             integer     NOT NULL,
  dia_semana         integer     NOT NULL,
  fecha              date        NOT NULL,
  hora               time,
  zona               text,
  red                text        NOT NULL,
  formato            text        NOT NULL,
  pilar              text,
  tema               text,
  sede               text,
  requiere_abierto   boolean     NOT NULL DEFAULT false,
  depende_de         text[]      NOT NULL DEFAULT '{}',
  datos              jsonb       NOT NULL DEFAULT '[]'::jsonb,
  pendientes         text[]      NOT NULL DEFAULT '{}',
  tipo_salida        integer,
  origen             text        NOT NULL DEFAULT 'agente',
  estado             text        NOT NULL DEFAULT 'propuesta',
  avisos             jsonb       NOT NULL DEFAULT '[]'::jsonb,
  brief_ref          text,
  seco               boolean     NOT NULL DEFAULT false,
  creada_en          timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (campana_id, calendario_version, id),
  CONSTRAINT cadena_filas_dia_valido CHECK (dia_semana BETWEEN 1 AND 7),
  CONSTRAINT cadena_filas_origen_valido CHECK (origen IN ('agente','patron')),
  CONSTRAINT cadena_filas_estado_valido CHECK (estado IN (
    'esquema','propuesta','validada','en_investigacion','lista_para_brief','briefeada','en_oficina','aprobada','cancelada',
    'espera_video','vencida_sin_brazo','perdio_su_fecha','descartada_sin_fuente'))
);
CREATE INDEX IF NOT EXISTS cadena_filas_por_fecha ON public.cadena_calendario_filas (campana_id, fecha) WHERE estado IN ('validada','lista_para_brief');
CREATE INDEX IF NOT EXISTS cadena_filas_por_estado ON public.cadena_calendario_filas (campana_id, estado);

-- ───────────────────────── 7 · auditoría de cada chequeo
CREATE TABLE IF NOT EXISTS public.cadena_validaciones (
  id             bigserial   PRIMARY KEY,
  campana_id     uuid        NOT NULL REFERENCES public.cadena_campanas(id),
  objeto         text        NOT NULL,
  objeto_version integer     NOT NULL,
  tanda          integer,
  intento        integer     NOT NULL DEFAULT 1,
  chequeo        text        NOT NULL,
  severidad      text        NOT NULL,
  fila_id        text,
  ficha          jsonb       NOT NULL DEFAULT '{}'::jsonb,
  resuelta       boolean     NOT NULL DEFAULT false,
  seco           boolean     NOT NULL DEFAULT false,
  creada_en      timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT cadena_validaciones_objeto_valido CHECK (objeto IN ('estrategia','calendario','brief')),
  CONSTRAINT cadena_validaciones_severidad_valida CHECK (severidad IN ('bloquea','aviso')),
  CONSTRAINT cadena_validaciones_intento_valido CHECK (intento IN (1,2))
);
CREATE INDEX IF NOT EXISTS cadena_validaciones_por_campana ON public.cadena_validaciones (campana_id, objeto, objeto_version, intento);

-- ───────────────────────── 8 · fechas especiales con fuente (solo las investiga la cadena si el cliente declaró el tipo)
CREATE TABLE IF NOT EXISTS public.cadena_fechas_especiales (
  id            bigserial   PRIMARY KEY,
  pais          text        NOT NULL,
  tipo          text        NOT NULL,
  ambito        text        NOT NULL,
  anio          integer     NOT NULL,
  fecha         date        NOT NULL,
  nombre        text        NOT NULL,
  alcance       text,
  fuente_url    text,
  cita_literal  text,
  pagina_hash   text,
  doble_fuente  boolean     NOT NULL DEFAULT false,
  estado        text        NOT NULL DEFAULT 'pendiente',
  verificado_en timestamptz,
  verificado_por text,
  CONSTRAINT cadena_fechas_estado_valido CHECK (estado IN ('verificada','pendiente')),
  CONSTRAINT cadena_fechas_verificado_por_valido CHECK (verificado_por IS NULL OR verificado_por = 'codigo'),
  CONSTRAINT cadena_fechas_verificada_con_fuente CHECK (estado <> 'verificada' OR (fuente_url IS NOT NULL AND cita_literal IS NOT NULL AND pagina_hash IS NOT NULL))
);
CREATE UNIQUE INDEX IF NOT EXISTS cadena_fechas_unica ON public.cadena_fechas_especiales (pais, tipo, ambito, fecha);

-- ───────────────────────── 9 · una investigación por tipo, ámbito y año (repetir el sobre no repite el gasto)
CREATE TABLE IF NOT EXISTS public.cadena_fechas_cobertura (
  pais           text        NOT NULL,
  tipo           text        NOT NULL,
  ambito_clave   text        NOT NULL,
  anio           integer     NOT NULL,
  estado         text        NOT NULL,
  intentos       integer     NOT NULL DEFAULT 0,
  investigado_en timestamptz,
  PRIMARY KEY (pais, tipo, ambito_clave, anio),
  CONSTRAINT cadena_cobertura_estado_valido CHECK (estado IN ('verificada','sin_fuente','en_curso')),
  CONSTRAINT cadena_cobertura_intentos_valido CHECK (intentos BETWEEN 0 AND 3)
);

-- ───────────────────────── 10 · todo lo que espera tiene reloj (V21)
CREATE TABLE IF NOT EXISTS public.cadena_esperas (
  id               bigserial   PRIMARY KEY,
  campana_id       uuid        NOT NULL REFERENCES public.cadena_campanas(id),
  objeto_tipo      text        NOT NULL REFERENCES public.cadena_plazos(tipo),
  objeto_id        text        NOT NULL,
  motivo           text,
  desde            timestamptz NOT NULL DEFAULT now(),
  recordatorio_en  timestamptz,
  alerta_en        timestamptz,
  vence_en         timestamptz NOT NULL,
  estado           text        NOT NULL DEFAULT 'viva',
  rung_enviado     integer     NOT NULL DEFAULT 0,
  dedup_key        text        NOT NULL,
  accion_al_vencer text        NOT NULL,
  seco             boolean     NOT NULL DEFAULT false,
  CONSTRAINT cadena_esperas_estado_valido CHECK (estado IN ('viva','resuelta','vencida','cancelada')),
  CONSTRAINT cadena_esperas_rung_valido CHECK (rung_enviado BETWEEN 0 AND 3),
  CONSTRAINT cadena_esperas_dedup UNIQUE (dedup_key)
);
CREATE INDEX IF NOT EXISTS cadena_esperas_vivas ON public.cadena_esperas (vence_en) WHERE estado = 'viva';

-- ───────────────────────── 11 · guardarraíles 1–5 del canon: cadencia, reintentos, idempotencia, auditoría, costo
CREATE TABLE IF NOT EXISTS public.cadena_corridas (
  id                    bigserial   PRIMARY KEY,
  campana_id            uuid        NOT NULL REFERENCES public.cadena_campanas(id),
  paso                  text        NOT NULL,
  clave_idempotencia    text        NOT NULL,
  intento               integer     NOT NULL DEFAULT 1,
  workflow_id           text        NOT NULL,
  workflow_execution_id text        NOT NULL,
  modelo                text,
  costo_usd             numeric(10,4),
  estado                text        NOT NULL DEFAULT 'en_curso',
  plazo_en              timestamptz,
  error                 text,
  revision_editor       text,
  salida_estructurada   boolean     NOT NULL DEFAULT false,
  esquema_hash          text,
  seco                  boolean     NOT NULL DEFAULT false,
  creada_en             timestamptz NOT NULL DEFAULT now(),
  terminada_en          timestamptz,
  CONSTRAINT cadena_corridas_estado_valido CHECK (estado IN ('en_curso','ok','fallida','vencida','cerrada_por_tope')),
  CONSTRAINT cadena_corridas_intento_valido CHECK (intento BETWEEN 1 AND 3),
  CONSTRAINT cadena_corridas_revision_valida CHECK (revision_editor IS NULL OR revision_editor IN ('saltada_por_diseno','conservada')),
  -- 🔴 una llamada en curso sin plazo es una espera sin reloj (CC#3 cond. 2)
  CONSTRAINT cadena_corridas_en_curso_con_plazo CHECK (estado <> 'en_curso' OR plazo_en IS NOT NULL),
  CONSTRAINT cadena_corridas_idempotencia UNIQUE (campana_id, paso, clave_idempotencia, intento)
);
CREATE INDEX IF NOT EXISTS cadena_corridas_en_curso ON public.cadena_corridas (plazo_en) WHERE estado = 'en_curso';

-- ───────────────────────── SEMILLAS (datos, no código: se ajustan sin publicar)
-- el interruptor nace APAGADO; sin clientes de ensayo; sin dominios de fechas; el ensayo REGISTRA las alertas y no las manda
INSERT INTO public.cadena_config (clave, valor) VALUES
  ('estado_cadena',       '"apagada"'::jsonb),
  ('clientes_ensayo',     '[]'::jsonb),
  ('dominios_fechas',     '{}'::jsonb),
  ('alertas_en_ensayo',   '"registrar"'::jsonb),
  ('ultimo_latido',       'null'::jsonb),
  ('latido_max_horas',    '18'::jsonb),
  ('plazo_llamada_agente_minutos', '15'::jsonb)
ON CONFLICT (clave) DO NOTHING;

-- plazos de §7.2 ajustados a las correcciones de Emilio: NADA espera a una persona del cliente; lo humano es la bandeja de Emilio.
-- los números son PROPUESTA (no medidos) y se cambian con un UPDATE.
INSERT INTO public.cadena_plazos (tipo, recordatorio_horas, alerta_horas, vence_horas, vence_regla, accion_al_vencer, descripcion) VALUES
  ('dato_en_investigacion', NULL, 24, 48,   NULL,                          'fila_sale',            'Un dato de una fila que se está investigando con fuente. Al vencer sin fuente la FILA sale o se cambia por una que no lo necesite; nunca se le pregunta al cliente.'),
  ('espera_video',          NULL, NULL, NULL, 'fecha_menos_lead_dias_video', 'vencida_sin_brazo',   'Fila de reel/video que espera al brazo de video. Sin aviso por fila: resumen semanal.'),
  ('aprobacion_bandeja',    24,   72,   NULL, 'fecha_de_la_pieza',          'perdio_su_fecha',      'Brief o pieza en la bandeja de Emilio. Si no se aprueba antes de su fecha vence; nunca se aprueba sola ni se publica sola.'),
  ('necesita_humano',       24,   0,    168,  NULL,                          'pausada',              'La campaña se detuvo y espera a Emilio. Aviso inmediato a #alertas al entrar y a las 48 h.'),
  ('campana_pausada',       NULL, NULL, NULL, 'resumen_semanal',            'resumen_semanal',      'Una campaña pausada se revisa en el resumen semanal (CC#3 cond. 2).'),
  ('fecha_inicio_propuesta',NULL, NULL, NULL, 'fecha_inicio_menos_1_dia',   'regla_firme',          'La fecha de inicio calculada por regla queda firme al llegar el día anterior.'),
  ('llamada_agente',        NULL, NULL, 15,   NULL,                          'corrida_vencida',      'Llamada a un agente en curso. Un agente de más de 13 min nunca vuelve: al vencer se marca vencida y se reintenta con tope.'),
  ('vigia_latido',          NULL, NULL, 18,   NULL,                          'alerta_vigia_parado',  'El vigía deja latido; si pasan más de 18 h sin latido, alarma.')
ON CONFLICT (tipo) DO NOTHING;

-- qué se puede en cada red: configuración; los formatos de video esperan al brazo (sala_destinos_de_recado.video = por_configurar)
INSERT INTO public.cadena_formatos_por_red (red, formato, lead_dias, produccion, max_por_dia) VALUES
  ('instagram','foto',            3,'opera',        3),
  ('instagram','carrusel',        4,'opera',        2),
  ('instagram','historia',        2,'opera',        10),
  ('instagram','reel',            5,'espera_brazo', 2),
  ('instagram','anuncio_imagen',  7,'opera',        3),
  ('instagram','anuncio_carrusel',7,'opera',        2),
  ('facebook', 'foto',            3,'opera',        3),
  ('facebook', 'carrusel',        4,'opera',        2),
  ('facebook', 'historia',        2,'opera',        10),
  ('facebook', 'reel',            5,'espera_brazo', 2),
  ('facebook', 'anuncio_imagen',  7,'opera',        3),
  ('facebook', 'anuncio_carrusel',7,'opera',        2),
  ('tiktok',   'video',           5,'espera_brazo', 3),
  ('linkedin', 'foto',            3,'opera',        2),
  ('linkedin', 'carrusel',        4,'opera',        2),
  ('linkedin', 'texto',           2,'opera',        2),
  ('youtube',  'short',           5,'espera_brazo', 2),
  ('youtube',  'video',           7,'espera_brazo', 1),
  ('whatsapp', 'estado',          2,'opera',        5)
ON CONFLICT (red, formato) DO NOTHING;

-- ───────────────────────── permisos y seguridad por fila (la lección del proyecto: CREATE TABLE no alcanza)
DO $cadena$
DECLARE
  t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'cadena_config','cadena_plazos','cadena_formatos_por_red','cadena_campanas','cadena_estrategias','cadena_calendario_filas',
    'cadena_validaciones','cadena_fechas_especiales','cadena_fechas_cobertura','cadena_esperas','cadena_corridas'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated', t);
    EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON public.%I TO service_role', t);
    IF NOT EXISTS (SELECT 1 FROM pg_policy WHERE polrelid = format('public.%I', t)::regclass AND polname = t || '_service') THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR ALL TO service_role USING (true) WITH CHECK (true)', t || '_service', t);
    END IF;
  END LOOP;
END
$cadena$;
GRANT USAGE, SELECT ON SEQUENCE public.cadena_estrategias_id_seq, public.cadena_validaciones_id_seq, public.cadena_fechas_especiales_id_seq,
  public.cadena_esperas_id_seq, public.cadena_corridas_id_seq TO service_role;

COMMENT ON TABLE public.cadena_config IS 'CADENA · interruptor (estado_cadena: apagada|ensayo|encendida), clientes de ensayo, dominios de fechas, latido del vigía. Nace apagada.';
COMMENT ON TABLE public.cadena_campanas IS 'CADENA · una campaña por plan; a lo más una viva por cliente (índice parcial). El plan nuevo reemplaza a la campaña anterior.';
COMMENT ON TABLE public.cadena_esperas IS 'CADENA · todo lo que espera tiene reloj (vence_en NOT NULL). Lo humano es solo la bandeja de Emilio.';
COMMENT ON TABLE public.cadena_corridas IS 'CADENA · guardarraíles 1–5: cada llamada con workflow_id + workflow_execution_id, plazo mientras está en curso y clave de idempotencia.';

COMMIT;

-- 🔴 una tabla nueva no la ve PostgREST hasta recargar su catálogo (medido 03-oct)
NOTIFY pgrst, 'reload schema';
