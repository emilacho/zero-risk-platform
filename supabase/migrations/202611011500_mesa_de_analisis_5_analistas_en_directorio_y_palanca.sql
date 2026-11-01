-- 01-nov · FIRMA de Emilio 08:42Z «sí a todo» punto 1 · LA MESA DE ANÁLISIS (equipo Estrategia) · CC#1 · US$ 0 · TODO APAGADO.
--   DISEÑO-CC1-mesa-de-analisis-dentro-de-estrategia + ADENDA 1 (+ RESPUESTA-CC2). Solo DATO: (a) las 5 tarjetas de los analistas en el directorio de la
--   oficina (`oficina_directorio`, dueño CC#2: migración ADITIVA avisada en el papel) · equipo `estrategia` · rol `miembro` · `pertinente_en = ['analisis']`
--   (la mesa de análisis es una SESIÓN del equipo Estrategia: no hay plantilla en `oficina_tipos_de_grupo`, los analistas no conversan entre sí);
--   (b) la PALANCA de la mesa en `cadena_config.mesa_de_analisis` = {"encendida": false, "clientes": []} · APAGADA POR OMISIÓN: la puerta
--   `/api/planeacion/mesa-de-analisis` solo gasta para el cliente listado con `encendida: true` (encenderla = GO reservado a Emilio).
--   FIRMA 5 punto 2 (31-oct): `market_research_analyst` SOLO en la mesa de análisis; aquí entra por primera vez al directorio, sin marcas de creativos.
--   `feedback-synthesizer` y `x-twitter-intelligence-analyst` NO existen aún en `agents` (los instala CC2 por el protocolo identity_content): la tarjeta
--   se siembra igual (es DATO de la mesa) y la puerta declara «no instalado» hasta que existan: no llama, no gasta.
--   Idempotente (ON CONFLICT DO NOTHING · solo llena lo vacío). ORDEN: después de 202611011400 (la columna `equipo` y la tabla `oficina_equipos` existen).
--   Reversa: supabase/reversas/202611011500_mesa_de_analisis_5_analistas_en_directorio_y_palanca_REVERSA.sql
BEGIN;

INSERT INTO public.oficina_directorio (agente, rol, especialidad, sabe_hacer, necesita, entrega, pertinente_en, indicacion, equipo) VALUES
  ($d$market_research_analyst$d$, $d$miembro$d$, $d$mercado: tendencia y oportunidad de la categoría y de la plaza del cliente$d$,
    ARRAY[$d$señales de la categoría con fuente y fecha$d$, $d$oportunidad y riesgo de la plaza$d$, $d$decir «sin dato» cuando no hay fuente$d$],
    ARRAY[$d$ficha del cliente (rubro, plaza, país)$d$, $d$resumen vivo del cerebro$d$, $d$fichas de mercado del portero$d$],
    ARRAY[$d$informe corto de mercado (propuesta, no dato del cliente)$d$],
    ARRAY[$d$analisis$d$],
    ARRAY[$d$Escribes un informe corto de tendencia y oportunidad de la categoría y la plaza, antes del plan. Solo tendencia y oportunidad: no analizas competidores ni al público. Cada señal trae fuente y fecha; sin fuente, «sin dato». No nombras a personas.$d$, $d$Respondes en el idioma y con el trato (tú, vos, usted u otro) que fija el manual del cliente; si el manual no lo fija, usa el idioma oficial del país de la ficha y no inventes el trato.$d$],
    $d$estrategia$d$),
  ($d$competitive-intelligence-agent$d$, $d$miembro$d$, $d$competencia: qué hacen hoy los competidores vigilados y qué hueco dejan$d$,
    ARRAY[$d$leer anuncios, cuentas y mapas de los competidores$d$, $d$detectar el hueco de oferta, precio, mensaje o canal$d$],
    ARRAY[$d$fichas de competidores del portero$d$, $d$resumen vivo del cerebro$d$, $d$ficha del cliente$d$],
    ARRAY[$d$informe corto de competencia (propuesta, no dato del cliente)$d$],
    ARRAY[$d$analisis$d$],
    ARRAY[$d$Escribes un informe corto de competencia antes del plan, solo con lo que las fichas muestran: oferta, precio, mensaje, canales, ritmo, y el hueco que dejan. Cada hallazgo cita la ficha en que se apoya. No inventas competidores ni cifras. No nombras a personas.$d$, $d$Respondes en el idioma y con el trato (tú, vos, usted u otro) que fija el manual del cliente; si el manual no lo fija, usa el idioma oficial del país de la ficha y no inventes el trato.$d$],
    $d$estrategia$d$),
  ($d$feedback-synthesizer$d$, $d$miembro$d$, $d$voz del público: qué dicen las reseñas, los comentarios y las menciones$d$,
    ARRAY[$d$agrupar lo que el público repite$d$, $d$contar elogios, quejas y preguntas sin responder$d$],
    ARRAY[$d$fichas de reseñas, comentarios y menciones del portero$d$, $d$resumen vivo del cerebro$d$],
    ARRAY[$d$informe corto de voz del público (propuesta, no dato del cliente)$d$],
    ARRAY[$d$analisis$d$],
    ARRAY[$d$Escribes un informe corto de voz del público antes del plan, solo con lo que el público dijo en las fichas: temas que se repiten, elogios, quejas, preguntas sin responder, y cuántas veces aparece cada uno. Cada hallazgo cita la ficha en que se apoya. No citas a ninguna persona por su nombre.$d$, $d$Respondes en el idioma y con el trato (tú, vos, usted u otro) que fija el manual del cliente; si el manual no lo fija, usa el idioma oficial del país de la ficha y no inventes el trato.$d$],
    $d$estrategia$d$),
  ($d$x-twitter-intelligence-analyst$d$, $d$miembro$d$, $d$escucha en X: la conversación sobre la categoría y el negocio$d$,
    ARRAY[$d$leer la conversación de X que el cerebro tiene$d$, $d$decir «sin dato» cuando no hay material de X$d$],
    ARRAY[$d$fichas de X del portero$d$, $d$resumen vivo del cerebro$d$],
    ARRAY[$d$informe corto de escucha en X (propuesta, no dato del cliente)$d$],
    ARRAY[$d$analisis$d$],
    ARRAY[$d$Escribes un informe corto de escucha en X antes del plan, solo con la conversación de X que las fichas traen. Si el cerebro no tiene material de X, respondes «sin dato» y qué habría que mirar: no lo reemplazas con otra red. Cada hallazgo cita la ficha en que se apoya. No nombras a personas.$d$, $d$Respondes en el idioma y con el trato (tú, vos, usted u otro) que fija el manual del cliente; si el manual no lo fija, usa el idioma oficial del país de la ficha y no inventes el trato.$d$],
    $d$estrategia$d$),
  ($d$growth-hacker$d$, $d$miembro$d$, $d$retención y recompra: qué hace volver a la gente y dónde se pierde$d$,
    ARRAY[$d$leer métricas y reseñas en clave de volver o no volver$d$, $d$señalar dónde se pierde la recompra$d$],
    ARRAY[$d$fichas de métricas y reseñas del portero$d$, $d$resumen vivo del cerebro$d$],
    ARRAY[$d$informe corto de retención (propuesta, no dato del cliente)$d$],
    ARRAY[$d$analisis$d$],
    ARRAY[$d$Escribes un informe corto de retención y recompra antes del plan, solo con lo que las métricas y las reseñas de las fichas muestran sobre volver o no volver. No propones pauta ni presupuesto: eso es del plan. Cada hallazgo cita la ficha en que se apoya. No nombras a personas.$d$, $d$Respondes en el idioma y con el trato (tú, vos, usted u otro) que fija el manual del cliente; si el manual no lo fija, usa el idioma oficial del país de la ficha y no inventes el trato.$d$],
    $d$estrategia$d$)
ON CONFLICT (agente) DO NOTHING;

-- la palanca de la mesa · APAGADA por omisión · solo se crea si no existe (una decisión posterior a mano no se pisa)
INSERT INTO public.cadena_config (clave, valor) VALUES ('mesa_de_analisis', '{"encendida": false, "clientes": []}'::jsonb)
ON CONFLICT (clave) DO NOTHING;

DO $$
DECLARE n int; a int; p int; e int;
BEGIN
  SELECT count(*) INTO n FROM public.oficina_directorio WHERE activo AND equipo = 'estrategia' AND rol = 'miembro' AND 'analisis' = ANY(pertinente_en)
    AND agente IN ('market_research_analyst', 'competitive-intelligence-agent', 'feedback-synthesizer', 'x-twitter-intelligence-analyst', 'growth-hacker');
  IF n <> 5 THEN RAISE EXCEPTION 'se esperaban 5 analistas en la mesa de análisis (estrategia · miembro · analisis) y hay %', n; END IF;
  SELECT count(*) INTO a FROM public.oficina_directorio WHERE agente = 'market_research_analyst' AND EXISTS (SELECT 1 FROM unnest(pertinente_en) q WHERE split_part(q, ':', 1) IN ('concepto', 'carrusel', 'kit', 'video'));
  IF a <> 0 THEN RAISE EXCEPTION 'market_research_analyst no puede tener marcas de la mesa de creativos (FIRMA 5 punto 2)'; END IF;
  SELECT count(*) INTO p FROM public.cadena_config WHERE clave = 'mesa_de_analisis';
  IF p <> 1 THEN RAISE EXCEPTION 'falta la palanca cadena_config.mesa_de_analisis'; END IF;
  SELECT count(*) INTO e FROM public.oficina_directorio WHERE equipo = 'estrategia';
  IF e <> 6 THEN RAISE EXCEPTION 'estrategia debía quedar con 6 tarjetas (brief + 5 analistas) y tiene %', e; END IF;
END $$;

COMMIT;
NOTIFY pgrst, 'reload schema';
