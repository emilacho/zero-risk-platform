-- 16-nov · SPRINT 2 · S2-2 · LA BIBLIOTECA DE PLANOS Y LOS RITMOS DEL VIDEO (GO Lenovo, firma de Emilio 21:55) · CC4 · US$ 0.
--   Dos tablas de referencia, DATO (no código): `oficina_fichas_de_plano` (una ficha por técnica de plano: qué hace, para qué rol de la historia, ejes de
--   material / forma / cámara / intensidad, duración, efecto y trampas) y `oficina_ritmos_de_video` (guía por duración: planos, gancho y producto en cuadro).
--   La mesa de video las recibe como CONTEXTO para elegir, no como lista cerrada (`src/lib/oficina/video/biblioteca.ts`). Los ritmos solo AVISAN.
--   Agnóstica: `rubros` vacío = sirve a todo cliente; con rubros, solo a esas familias (claves de `familiasDelRubro`: comida, alojamiento, comercio…).
--   Contenido propio de la oficina: del estudio de repos (CC5) se toma solo el FORMATO de ficha y los ejes, nada de su texto.
--   Solo lectura para el servidor (las filas se cambian por migración). Aditiva e idempotente. NO APLICADA: después del 🟢 de CC7 y de publicar el código.
--   Después de aplicar: leer `role_table_grants` de las dos tablas (la memoria del 10-nov: el esquema puede dar privilegios por omisión de más).
--   Reversa: supabase/reversas/202611162230_oficina_biblioteca_de_planos_y_ritmos_de_video_REVERSA.sql
BEGIN;

CREATE TABLE IF NOT EXISTS public.oficina_fichas_de_plano (
  id             text PRIMARY KEY,
  nombre         text NOT NULL,
  que_hace       text NOT NULL,
  roles          text[] NOT NULL DEFAULT '{}',
  material       text NOT NULL DEFAULT '',
  forma          text NOT NULL DEFAULT '',
  camara         text NOT NULL DEFAULT '',
  intensidad     text NOT NULL DEFAULT '' CHECK (intensidad IN ('', 'baja', 'media', 'alta')),
  segundos_min   numeric NOT NULL CHECK (segundos_min > 0),
  segundos_max   numeric NOT NULL,
  efecto         text NOT NULL DEFAULT '',
  trampas        text[] NOT NULL DEFAULT '{}',
  rubros         text[] NOT NULL DEFAULT '{}',
  orden          smallint NOT NULL DEFAULT 0,
  activo         boolean NOT NULL DEFAULT true,
  version        integer NOT NULL DEFAULT 1,
  actualizado_en timestamptz NOT NULL DEFAULT now(),
  CHECK (segundos_max >= segundos_min)
);
COMMENT ON TABLE public.oficina_fichas_de_plano IS 'Sprint 2 · S2-2 · biblioteca de técnicas de plano para la mesa de video (contexto, no lista cerrada). rubros vacío = general.';

CREATE TABLE IF NOT EXISTS public.oficina_ritmos_de_video (
  id                  text PRIMARY KEY,
  nombre              text NOT NULL,
  segundos_min        numeric NOT NULL CHECK (segundos_min > 0),
  segundos_max        numeric NOT NULL,
  red                 text,
  planos_min          smallint NOT NULL CHECK (planos_min >= 1),
  planos_max          smallint NOT NULL,
  gancho_hasta_s      numeric,
  producto_antes_de_s numeric,
  notas               text[] NOT NULL DEFAULT '{}',
  rubros              text[] NOT NULL DEFAULT '{}',
  activo              boolean NOT NULL DEFAULT true,
  version             integer NOT NULL DEFAULT 1,
  actualizado_en      timestamptz NOT NULL DEFAULT now(),
  CHECK (segundos_max >= segundos_min),
  CHECK (planos_max >= planos_min)
);
COMMENT ON TABLE public.oficina_ritmos_de_video IS 'Sprint 2 · S2-2 · guía de ritmo por duración (y red) del video: AVISA, nunca rechaza. red NULL = cualquier red con video.';

-- solo lectura para el servidor; nada para anon ni authenticated (mismo patrón que oficina_equipos + la limpieza del 10-nov)
ALTER TABLE public.oficina_fichas_de_plano ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.oficina_ritmos_de_video ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.oficina_fichas_de_plano FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON public.oficina_ritmos_de_video FROM PUBLIC, anon, authenticated, service_role;
GRANT SELECT ON public.oficina_fichas_de_plano TO service_role;
GRANT SELECT ON public.oficina_ritmos_de_video TO service_role;
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'oficina_fichas_de_plano' AND policyname = 'oficina_fichas_de_plano_lectura') THEN
    CREATE POLICY oficina_fichas_de_plano_lectura ON public.oficina_fichas_de_plano FOR SELECT TO service_role USING (true);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'oficina_ritmos_de_video' AND policyname = 'oficina_ritmos_de_video_lectura') THEN
    CREATE POLICY oficina_ritmos_de_video_lectura ON public.oficina_ritmos_de_video FOR SELECT TO service_role USING (true);
  END IF;
END $$;

-- LAS FICHAS GENERALES (sirven a todo cliente)
INSERT INTO public.oficina_fichas_de_plano (id, nombre, que_hace, roles, material, forma, camara, intensidad, segundos_min, segundos_max, efecto, trampas, rubros, orden) VALUES
  ('golpe-de-detalle', $d$Golpe de detalle$d$, $d$abre con un detalle del producto en primerísimo plano (textura, gota, brillo)$d$, ARRAY['captar'], 'producto', 'detalle', $d$macro fija o empuje lento$d$, 'alta', 1, 2, $d$detiene el scroll por la textura antes de que se entienda qué es$d$, ARRAY[$d$si a los 2 s no se reconoce qué es, confunde$d$, $d$el detalle tiene que volver a verse entero más adelante$d$], '{}', 10),
  ('resultado-primero', $d$Resultado primero$d$, $d$muestra el resultado final antes que el proceso$d$, ARRAY['captar'], 'producto', 'antes_despues', $d$plano medio fijo, el resultado centrado$d$, 'alta', 1, 3, $d$la promesa queda clara en el primer segundo$d$, ARRAY[$d$el resultado tiene que ser el real del cliente, no uno ideal$d$], '{}', 20),
  ('entrada-en-accion', $d$Entrada en acción$d$, $d$el sujeto entra al cuadro haciendo algo (una mano que sirve, una puerta que se abre)$d$, ARRAY['captar', 'situar'], 'real', 'demostracion', $d$cámara fija; el movimiento lo hace el sujeto$d$, 'media', 1.5, 3, $d$el ojo sigue el movimiento y se queda$d$, ARRAY[$d$una acción lenta en el primer segundo pierde al espectador$d$], '{}', 30),
  ('punto-de-vista', $d$Punto de vista$d$, $d$la cámara es los ojos del cliente: lo que ve al llegar o al usar$d$, ARRAY['captar', 'situar'], 'real', 'recorrido', $d$subjetiva a la altura de los ojos, avance suave$d$, 'media', 2, 3, $d$el espectador se pone en el lugar$d$, ARRAY[$d$un movimiento brusco marea$d$], '{}', 40),
  ('plano-de-situacion', $d$Plano de situación$d$, $d$establece dónde ocurre: el lugar real del cliente$d$, ARRAY['situar'], 'ambiente', 'recorrido', $d$plano general o travelling lateral lento$d$, 'baja', 2, 3, $d$da contexto y verdad al lugar$d$, ARRAY[$d$un lugar genérico que podría ser cualquiera$d$, $d$si dura de más, frena el ritmo$d$], '{}', 50),
  ('recorrido-de-camara', $d$Recorrido de cámara$d$, $d$la cámara avanza por el espacio hasta llegar al protagonista$d$, ARRAY['situar', 'ambiente'], 'ambiente', 'recorrido', $d$avance continuo hacia adelante$d$, 'media', 2, 4, $d$lleva de la mano hasta lo importante$d$, ARRAY[$d$un recorrido sin destino termina en nada$d$], '{}', 60),
  ('demostracion-en-mano', $d$Demostración en mano$d$, $d$el producto en uso, en manos de alguien$d$, ARRAY['informar', 'prueba'], 'producto', 'demostracion', $d$plano medio corto a la altura de las manos, fijo$d$, 'media', 2, 4, $d$se entiende cómo es y cómo se usa$d$, ARRAY[$d$manos que tapan el producto$d$], '{}', 70),
  ('paso-a-paso', $d$Paso a paso$d$, $d$dos o tres pasos del proceso, cortados sobre la acción$d$, ARRAY['informar'], 'real', 'montaje', $d$cortes sobre la acción, mismo lado de la escena$d$, 'media', 3, 5, $d$muestra el oficio detrás del producto$d$, ARRAY[$d$más de tres pasos y se pierde el ritmo$d$], '{}', 80),
  ('cenital-de-mesa', $d$Cenital$d$, $d$plano desde arriba que muestra la composición completa$d$, ARRAY['informar'], 'producto', 'detalle', $d$cenital fijo o empuje mínimo$d$, 'media', 2, 3, $d$ordena la vista: se ve todo lo que hay$d$, ARRAY[$d$sin una mano o una acción se vuelve foto$d$], '{}', 90),
  ('secuencia-de-variedad', $d$Secuencia de variedad$d$, $d$montaje rápido de opciones (sabores, modelos, servicios)$d$, ARRAY['informar'], 'producto', 'montaje', $d$mismo encuadre en cada opción, cortes al ritmo de la música$d$, 'alta', 2, 4, $d$muestra amplitud sin explicar$d$, ARRAY[$d$más de cinco opciones y nadie recuerda ninguna$d$], '{}', 100),
  ('orbita-de-producto', $d$Órbita de producto$d$, $d$la cámara gira alrededor del producto$d$, ARRAY['informar', 'conclusion'], 'producto', 'detalle', $d$órbita lenta de 90 a 180 grados$d$, 'media', 2, 4, $d$el producto queda como protagonista$d$, ARRAY[$d$un fondo cargado distrae$d$], '{}', 110),
  ('antes-y-despues', $d$Antes y después$d$, $d$el mismo encuadre antes y después, unidos por un corte o un barrido$d$, ARRAY['prueba', 'giro'], 'prueba', 'antes_despues', $d$mismo encuadre y misma luz en los dos planos$d$, 'alta', 2, 4, $d$la diferencia se ve sin explicarla$d$, ARRAY[$d$encuadres distintos rompen la comparación$d$, $d$exagerar el antes es engañar$d$], '{}', 120),
  ('reaccion', $d$Reacción$d$, $d$una persona reacciona al probar o recibir$d$, ARRAY['prueba'], 'real', 'reaccion', $d$primer plano o plano medio corto$d$, 'media', 1.5, 3, $d$prueba emocional: alguien como tú lo disfrutó$d$, ARRAY[$d$nunca la cara de una persona real identificable sin su permiso (los rostros generados sí)$d$, $d$una reacción sobreactuada resta$d$], '{}', 130),
  ('prueba-visible', $d$Prueba visible$d$, $d$evidencia concreta en cuadro (una reseña, un sello, una cifra real)$d$, ARRAY['prueba'], 'prueba', 'detalle', $d$inserto fijo, fondo simple$d$, 'baja', 2, 3, $d$da confianza con un hecho$d$, ARRAY[$d$solo datos reales del cliente$d$, $d$el texto va por composición, no lo dibuja el modelo$d$], '{}', 140),
  ('persona-en-contexto', $d$Persona en contexto$d$, $d$alguien usa o disfruta en el lugar real$d$, ARRAY['situar', 'prueba'], 'real', 'demostracion', $d$plano medio; de perfil, de espaldas o con rostro generado$d$, 'media', 2, 4, $d$el espectador se imagina ahí$d$, ARRAY[$d$modelos de catálogo genéricos que no son del país del cliente$d$], '{}', 150),
  ('revelacion', $d$Revelación$d$, $d$el protagonista se descubre (de desenfocado a foco, una apertura, un giro)$d$, ARRAY['giro'], 'producto', 'detalle', $d$cambio de foco u órbita corta$d$, 'alta', 1.5, 3, $d$reengancha a mitad del video$d$, ARRAY[$d$revelar algo que ya se vio no sorprende$d$], '{}', 160),
  ('contraste-de-ritmo', $d$Contraste de ritmo$d$, $d$cambio brusco de velocidad o de escala$d$, ARRAY['giro'], '', 'montaje', $d$cámara lenta que acelera o salto de plano general a detalle$d$, 'alta', 1, 2, $d$despierta la atención cuando baja$d$, ARRAY[$d$más de una vez por video cansa$d$], '{}', 170),
  ('ambiente-sensorial', $d$Ambiente sensorial$d$, $d$el clima del lugar: vapor, agua, luz, viento$d$, ARRAY['ambiente'], 'ambiente', 'detalle', $d$macro o plano medio, movimiento lento$d$, 'baja', 1.5, 3, $d$se siente el lugar$d$, ARRAY[$d$atmósfera sin relación con el mensaje es relleno$d$], '{}', 180),
  ('plano-heroe', $d$Plano héroe$d$, $d$el producto quieto, en su mejor luz: el momento más bello$d$, ARRAY['conclusion'], 'producto', 'detalle', $d$fijo o empuje mínimo, luz lateral suave$d$, 'media', 2, 3, $d$fija la imagen que se recuerda$d$, ARRAY[$d$si llega tarde, ya nadie lo ve$d$, $d$deja aire para el texto y el logo si el plano los lleva$d$], '{}', 190),
  ('cierre-con-aire', $d$Cierre con aire$d$, $d$plano final limpio con espacio libre para el llamado y el logo$d$, ARRAY['llamado', 'conclusion'], 'ambiente', 'detalle', $d$fijo, fondo simple, sujeto a un lado$d$, 'baja', 2, 3, $d$deja lugar a la composición de marca$d$, ARRAY[$d$cortar al sujeto justo donde irá el texto$d$], '{}', 200),
  ('llamado-en-accion', $d$Llamado en acción$d$, $d$se muestra la acción que se pide (escribir, reservar, llegar)$d$, ARRAY['llamado'], 'real', 'demostracion', $d$inserto corto$d$, 'media', 1.5, 3, $d$el paso siguiente se ve fácil$d$, ARRAY[$d$no mostrar pantallas o interfaces inventadas$d$], '{}', 210),
  ('cierre-en-bucle', $d$Cierre en bucle$d$, $d$el último plano empalma con el primero para que el video se repita sin corte$d$, ARRAY['conclusion'], '', 'montaje', $d$mismo encuadre que el plano 1$d$, 'media', 1, 2, $d$se vuelve a ver sin darse cuenta$d$, ARRAY[$d$forzarlo cuando la historia no vuelve al inicio$d$], '{}', 220),
  ('testimonio-sin-voz', $d$Testimonio sin voz$d$, $d$una cita real puesta por composición sobre un plano tranquilo de la persona o el lugar$d$, ARRAY['prueba'], 'prueba', 'reaccion', $d$plano medio tranquilo, aire para el texto$d$, 'baja', 3, 4, $d$prueba social con calma$d$, ARRAY[$d$nunca inventar la cita$d$], '{}', 230)
ON CONFLICT (id) DO NOTHING;

-- LAS FICHAS POR RUBRO (solo para clientes de esas familias)
INSERT INTO public.oficina_fichas_de_plano (id, nombre, que_hace, roles, material, forma, camara, intensidad, segundos_min, segundos_max, efecto, trampas, rubros, orden) VALUES
  ('vapor-y-servido', $d$Vapor y servido$d$, $d$el plato llega a la mesa con su vapor o su frescura visible$d$, ARRAY['captar', 'conclusion'], 'producto', 'detalle', $d$plano medio corto a la altura de la mesa, empuje lento$d$, 'alta', 1, 2.5, $d$antojo inmediato$d$, ARRAY[$d$el plato tiene que ser el de la carta del cliente$d$], ARRAY['comida'], 300),
  ('primer-bocado', $d$Primer bocado$d$, $d$alguien prueba y se nota que le gusta$d$, ARRAY['prueba'], 'real', 'reaccion', $d$plano medio corto; rostro generado, de perfil o solo la boca y las manos$d$, 'media', 1.5, 3, $d$prueba de que sabe bien$d$, ARRAY[$d$nunca la cara de un cliente real sin permiso$d$], ARRAY['comida'], 310),
  ('de-la-cocina-a-la-mesa', $d$De la cocina a la mesa$d$, $d$el plato sale de la cocina y llega a la mesa$d$, ARRAY['informar', 'situar'], 'real', 'recorrido', $d$seguimiento a la altura del plato$d$, 'media', 3, 4, $d$muestra que se prepara al momento$d$, ARRAY[$d$una cocina que no es la del cliente$d$], ARRAY['comida'], 320),
  ('despertar-en-el-lugar', $d$Despertar en el lugar$d$, $d$la primera vista al despertar: cortina, luz, paisaje$d$, ARRAY['situar', 'ambiente'], 'ambiente', 'recorrido', $d$subjetiva desde la cama hacia la ventana$d$, 'baja', 2, 4, $d$el espectador ya se siente huésped$d$, ARRAY[$d$una vista que no es la del lugar$d$], ARRAY['alojamiento', 'turismo'], 330),
  ('vista-que-se-abre', $d$Vista que se abre$d$, $d$de un espacio cerrado a la vista abierta del lugar$d$, ARRAY['giro', 'conclusion'], 'ambiente', 'detalle', $d$avance hacia la puerta o la ventana hasta abrir el plano$d$, 'alta', 2, 3, $d$asombro: el lugar se revela$d$, ARRAY[$d$exagerar el paisaje con algo que no existe$d$], ARRAY['alojamiento', 'turismo'], 340),
  ('desempaque', $d$Desempaque$d$, $d$el producto sale de su empaque en manos de alguien$d$, ARRAY['captar', 'informar'], 'producto', 'demostracion', $d$cenital o plano medio corto, fijo$d$, 'media', 2, 4, $d$la expectativa de abrir algo nuevo$d$, ARRAY[$d$un empaque que no es el del cliente$d$], ARRAY['comercio'], 350),
  ('el-material-de-cerca', $d$El material de cerca$d$, $d$la calidad del material o la terminación, en detalle$d$, ARRAY['prueba', 'informar'], 'producto', 'detalle', $d$macro con luz rasante$d$, 'baja', 1.5, 3, $d$la calidad se ve, no se dice$d$, ARRAY[$d$una textura que el producto real no tiene$d$], ARRAY['comercio'], 360),
  ('el-problema-en-una-imagen', $d$El problema en una imagen$d$, $d$la situación que el servicio resuelve, mostrada en un solo plano$d$, ARRAY['captar', 'giro'], 'real', 'antes_despues', $d$plano medio, luz más fría que el resto$d$, 'media', 1.5, 3, $d$el espectador se reconoce en el problema$d$, ARRAY[$d$dramatizar de más un problema real$d$], ARRAY['servicios_profesionales', 'software', 'educacion'], 370),
  ('manos-al-trabajo', $d$Manos al trabajo$d$, $d$el oficio en acción: herramientas, pantalla o mesa de trabajo del equipo$d$, ARRAY['informar', 'prueba'], 'real', 'demostracion', $d$plano medio corto de las manos, cortes sobre la acción$d$, 'media', 2, 4, $d$muestra que detrás hay personas que saben$d$, ARRAY[$d$pantallas con datos inventados$d$], ARRAY['servicios_profesionales', 'automotriz', 'belleza_bienestar'], 380)
ON CONFLICT (id) DO NOTHING;

-- LOS RITMOS (red NULL = cualquier red con video vertical; la guía AVISA)
INSERT INTO public.oficina_ritmos_de_video (id, nombre, segundos_min, segundos_max, red, planos_min, planos_max, gancho_hasta_s, producto_antes_de_s, notas) VALUES
  ('corto-6-8', $d$corto de hasta 8 s$d$, 5, 8, NULL, 2, 3, 1.5, 2, ARRAY[$d$una sola idea; sin plano de situación largo$d$]),
  ('reel-9-15', $d$reel de 9 a 15 s$d$, 9, 15, NULL, 4, 6, 2, 3, ARRAY[$d$captar → informar o probar → cerrar con llamado$d$]),
  ('reel-16-30', $d$reel de 16 a 30 s$d$, 16, 30, NULL, 6, 10, 3, 5, ARRAY[$d$un giro a la mitad para reenganchar$d$]),
  ('reel-31-60', $d$video de 31 a 60 s$d$, 31, 60, NULL, 9, 16, 3, 8, ARRAY[$d$reengancha cada 8 a 10 s con un cambio de plano o de escala$d$]),
  ('largo-youtube', $d$video largo de YouTube$d$, 61, 900, 'youtube', 15, 120, 5, 15, ARRAY[$d$abre con la promesa del video; divide en tramos y reengancha al empezar cada uno$d$])
ON CONFLICT (id) DO NOTHING;

DO $$
DECLARE f int; fr int; r int;
BEGIN
  SELECT count(*) INTO f FROM public.oficina_fichas_de_plano WHERE activo AND rubros = '{}';
  SELECT count(*) INTO fr FROM public.oficina_fichas_de_plano WHERE activo AND rubros <> '{}';
  SELECT count(*) INTO r FROM public.oficina_ritmos_de_video WHERE activo;
  IF f < 23 THEN RAISE EXCEPTION 'se esperaban 23 fichas generales y hay %', f; END IF;
  IF fr < 9 THEN RAISE EXCEPTION 'se esperaban 9 fichas por rubro y hay %', fr; END IF;
  IF r < 5 THEN RAISE EXCEPTION 'se esperaban 5 ritmos y hay %', r; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
