-- 31-oct · T6 · EL DIRECTORIO DE LA OFICINA PARA LA GRAN IDEA (FIRMA 2 · E2 y E1) · plan de construcción v3 T6 (CC#2).
--   1) `oficina_directorio.indicacion text[]`: la indicación obligatoria de cada agente es DATO de su fila (va con el pedido de cada turno, NUNCA dentro de la identidad).
--   2) seis tarjetas nuevas: whimsy-injector (siempre en el concepto) · tiktok-strategist (`concepto:si_video`) · inclusive-visuals-specialist (`carrusel:si_personas`, `kit:si_personas`)
--      (las tres son de CC#1 T7: texto idéntico a `src/lib/oficina/instalaciones-e1.ts`, una prueba lo cruza) · market_research_analyst (siempre en el concepto: 3 señales con fuente y fecha)
--      · video-editor (`concepto:si_video`) · marketing_video_optimization_specialist (fila `video`: solo gancho y ritmo; INERTE hasta que T8 cree la mesa de video).
--   3) design-visual-storyteller: director visual también en `carrusel` y `video` (ya estaba en `kit` y `concepto`).
--   Fuera del equipo (E2): el coach de video. Pendiente de CC#1: la condición de growth-hacker (no está definida en la firma) y el cálculo de `si_personas` / `si_tiktok_o_reels`.
--   Datos puros: NO toca tablas de la cadena. Compatible con el código viejo (la columna nueva se lee como lista vacía si falta).
--   ORDEN: DESPUÉS de 202610312000 (oficina) y 202610312007 (los tres agentes de T7 deben existir en `agents`). NO APLICADA: se aplica en la publicación única (T9).
--   Reversa: supabase/reversas/202610312008_oficina_directorio_equipo_gran_idea_REVERSA.sql
BEGIN;

ALTER TABLE public.oficina_directorio ADD COLUMN IF NOT EXISTS indicacion text[] NOT NULL DEFAULT '{}';

INSERT INTO public.oficina_directorio (agente, rol, especialidad, sabe_hacer, necesita, entrega, pertinente_en, indicacion) VALUES
  ($d$whimsy-injector$d$, $d$miembro$d$, $d$encanto de marca: los momentos inesperados y compartibles que hacen memorable una pieza$d$,
    ARRAY[$d$proponer momentos de encanto$d$, $d$dar personalidad a un mensaje sin perder la voz del manual$d$, $d$detectar dónde una pieza queda genérica$d$],
    ARRAY[$d$manual de marca$d$, $d$brief$d$, $d$la idea o la pieza en curso$d$],
    ARRAY[$d$momentos de encanto propuestos, con su por qué$d$],
    ARRAY[$d$concepto$d$],
    ARRAY[$d$Aportas ideas de personalidad y momentos de encanto (lo inesperado, lo que se comparte) para el contenido de redes de un negocio: la gran idea, un carrusel o un kit de historias. Nada de código, interfaces, animaciones, micro-interacciones ni gamificación: aquí no hay producto digital, hay piezas de contenido.$d$, $d$Dos o tres momentos de encanto por capítulo o por pieza, cada uno en una frase, con el por qué encaja con la voz del manual. Si la marca pide sobriedad, lo dices y propones poco.$d$, $d$Respondes en el idioma y con el trato (tú, vos, usted u otro) que fija el manual del cliente; si el manual no lo dice, en el idioma y el trato del país del cliente. Tu identidad está escrita en otro idioma: eso no cambia el idioma de tu respuesta.$d$]),
  ($d$tiktok-strategist$d$, $d$miembro$d$, $d$formato corto vertical: gancho, ritmo y lenguaje nativo de TikTok, Reels y Shorts$d$,
    ARRAY[$d$gancho en 3 segundos$d$, $d$ritmo y estructura de un video corto$d$, $d$adaptar una idea a TikTok, Reels y Shorts$d$],
    ARRAY[$d$brief$d$, $d$la idea o el guion en curso$d$, $d$qué redes están en la estrategia$d$],
    ARRAY[$d$aporte de formato y gancho para el video$d$],
    ARRAY[$d$concepto:si_video$d$, $d$video:si_tiktok_o_reels$d$],
    ARRAY[$d$Solo cultura de formato corto y gancho: cómo se abre en 3 segundos, qué ritmo, qué formato nativo, cómo se adapta a Reels y Shorts. Nada de anuncios, Spark Ads, TopView, partnerships con creadores ni métricas objetivo: eso no se decide en la mesa.$d$, $d$Las tendencias que cites son supuestos para que el equipo los verifique; no afirmes que un audio o un formato está de moda hoy.$d$, $d$Respondes en el idioma y con el trato (tú, vos, usted u otro) que fija el manual del cliente; si el manual no lo dice, en el idioma y el trato del país del cliente. Tu identidad está escrita en otro idioma: eso no cambia el idioma de tu respuesta.$d$]),
  ($d$inclusive-visuals-specialist$d$, $d$miembro$d$, $d$representación real y digna de las personas en las imágenes que se generan$d$,
    ARRAY[$d$corregir un pedido de imagen para que las personas sean reales y diversas$d$, $d$negativos contra rostros clonados, texto y símbolos inventados$d$, $d$anclar la escena en el entorno del cliente$d$],
    ARRAY[$d$el pedido de imagen redactado$d$, $d$identidad visual$d$, $d$país y público del cliente$d$],
    ARRAY[$d$correcciones al pedido de imagen$d$],
    ARRAY[$d$carrusel:si_personas$d$, $d$kit:si_personas$d$],
    ARRAY[$d$Revisas el pedido de imagen DESPUÉS de quien lo redacta y ANTES de generar: solo cuando la imagen lleva personas. Aportas lo que falta para que las personas se vean reales y dignas (rasgos distintos, edades, cuerpos, ropa y entorno del país del cliente) y los negativos que bloquean rostros clonados, texto o símbolos inventados y estereotipos.$d$, $d$No redactas el pedido de nuevo ni decides la dirección visual: propones correcciones concretas al pedido existente. Si no conoces el contexto local, lo dices en vez de suponerlo.$d$, $d$Respondes en el idioma y con el trato (tú, vos, usted u otro) que fija el manual del cliente; si el manual no lo dice, en el idioma y el trato del país del cliente. Tu identidad está escrita en otro idioma: eso no cambia el idioma de tu respuesta.$d$]),
  ($d$market_research_analyst$d$, $d$miembro$d$, $d$señales de mercado: tres señales de la categoría y la plaza del cliente, cada una con su fuente y su fecha$d$,
    ARRAY[$d$reconocer qué señales de la categoría importan a esta gran idea$d$, $d$citar la fuente y la fecha de cada señal$d$, $d$decir «sin dato» cuando no hay fuente$d$],
    ARRAY[$d$el brief de la campaña$d$, $d$el rubro y la plaza del cliente$d$, $d$el informe de mercado del plan, si existe$d$],
    ARRAY[$d$tres señales de mercado, cada una con fuente y fecha$d$],
    ARRAY[$d$concepto$d$],
    ARRAY[$d$Aportas TRES señales de mercado (tendencia, oportunidad o cambio de hábito) de la categoría y la plaza del cliente que le sirvan a la gran idea. Cada señal en una línea: qué dice, fuente (nombre y dónde se publica) y fecha.$d$, $d$Si no tienes una fuente para una señal, no la estimes: escribe «sin dato» y qué habría que mirar. No analices competidores y no escribas cifras del cliente.$d$, $d$Respondes en el idioma y con el trato (tú, vos, usted u otro) que fija el manual del cliente; si el manual no lo dice, en el idioma y el trato del país del cliente. Tu identidad está escrita en otro idioma: eso no cambia el idioma de tu respuesta.$d$]),
  ($d$video-editor$d$, $d$miembro$d$, $d$video corto: cómo se cuenta la idea en movimiento (guion, ritmo, planos) y qué pide al generador de video$d$,
    ARRAY[$d$bajar una idea a un guion de video corto$d$, $d$ritmo y estructura de planos$d$, $d$redactar el pedido al generador de video$d$],
    ARRAY[$d$la gran idea en curso$d$, $d$el brief$d$, $d$qué redes con video hay en la estrategia$d$],
    ARRAY[$d$aporte de formato de video para la gran idea$d$],
    ARRAY[$d$concepto:si_video$d$],
    ARRAY[$d$Aportas cómo se contaría esta idea en video corto: estructura, ritmo y qué mostrarías, sin escribir todavía el guion final. Un solo gancho por video: el gancho lo propone quien mide la retención; tú lo integras, nunca propones uno aparte.$d$, $d$Respondes en el idioma y con el trato (tú, vos, usted u otro) que fija el manual del cliente; si el manual no lo dice, en el idioma y el trato del país del cliente. Tu identidad está escrita en otro idioma: eso no cambia el idioma de tu respuesta.$d$]),
  ($d$marketing_video_optimization_specialist$d$, $d$miembro$d$, $d$retención del video corto: el gancho de los primeros segundos y el ritmo que mantiene a la gente mirando$d$,
    ARRAY[$d$proponer el gancho de los primeros 3 segundos$d$, $d$ritmo y cortes que sostienen la retención$d$],
    ARRAY[$d$el guion o la idea de video en curso$d$, $d$la red donde se publica$d$],
    ARRAY[$d$el gancho y el ritmo del video$d$],
    ARRAY[$d$video$d$],
    ARRAY[$d$Solo gancho y ritmo: lo que pasa en los primeros segundos y cómo se sostiene. No escribes el guion, no eliges la dirección visual y no tocas el pedido al generador de video: eso es de quien edita el video.$d$, $d$Respondes en el idioma y con el trato (tú, vos, usted u otro) que fija el manual del cliente; si el manual no lo dice, en el idioma y el trato del país del cliente. Tu identidad está escrita en otro idioma: eso no cambia el idioma de tu respuesta.$d$])
ON CONFLICT (agente) DO NOTHING;

UPDATE public.oficina_directorio SET pertinente_en = array_append(pertinente_en, 'carrusel'), actualizado_en = now()
  WHERE agente = 'design-visual-storyteller' AND NOT ('carrusel' = ANY(pertinente_en));
UPDATE public.oficina_directorio SET pertinente_en = array_append(pertinente_en, 'video'), actualizado_en = now()
  WHERE agente = 'design-visual-storyteller' AND NOT ('video' = ANY(pertinente_en));

DO $$
DECLARE n int; c int;
BEGIN
  SELECT count(*) INTO n FROM public.oficina_directorio WHERE activo AND agente IN ('whimsy-injector', 'tiktok-strategist', 'inclusive-visuals-specialist', 'market_research_analyst', 'video-editor', 'marketing_video_optimization_specialist');
  SELECT count(*) INTO c FROM public.oficina_directorio WHERE activo AND rol = 'miembro' AND EXISTS (SELECT 1 FROM unnest(pertinente_en) p WHERE split_part(p, ':', 1) = 'concepto');
  IF n <> 6 THEN RAISE EXCEPTION 'se esperaban 6 tarjetas nuevas y hay %', n; END IF;
  IF c <> 7 THEN RAISE EXCEPTION 'se esperaban 7 miembros del concepto (content-creator, design-visual-storyteller, instagram curator, whimsy, mercado, tiktok, video-editor) y hay %', c; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
