-- 31-oct · OFICINA DE MARKETING · FIRMA 2 de Emilio (20:29Z · «métodos para nuestros agentes» · punto 5) · CC#1 · PROPUESTA · NO APLICADA (se aplica en T9, publicación única, DESPUÉS de 202610312001 y 202610312004)
--   `jefe-marketing` + `marketing-plan` (coreyhaines31/marketingskills @ 88c79f6 · MIT) SOLO como LISTA DE CONTROL del plan: es DATO, no texto pegado en un nodo:
--   vive en `cadena_config.planeacion.lista_de_control`, al lado del `redactor` (202610312001) y la `indicacion` (202610312004).
--   El nodo de planeación (CC#2) lee `{redactor, indicacion, lista_de_control}` y pega la lista al pedido del redactor DESPUÉS de la indicación.
--   El texto por omisión es el mismo que `LISTA_DE_CONTROL_DEL_PLAN` en `src/lib/cadena/metodos.ts` (una prueba lo cruza byte a byte).
--   Agnóstica de rubro, cliente e idioma: etapas en lenguaje de cualquier negocio; no fija idioma ni trato. GUÍA, no formato: el plan no agrega secciones por cumplir.
--   Idempotente: jsonb_set sobre la fila existente; si alguien ya puso una lista distinta, NO se pisa.
-- Reversa: supabase/reversas/202610312006_cadena_config_planeacion_lista_de_control_REVERSA.sql
BEGIN;

DO $$
DECLARE v jsonb;
BEGIN
  SELECT valor INTO v FROM public.cadena_config WHERE clave = 'planeacion';
  IF v IS NULL THEN
    RAISE EXCEPTION 'falta la fila planeacion de cadena_config: aplica primero 202610312001';
  END IF;
  IF jsonb_typeof(v) <> 'object' THEN
    RAISE EXCEPTION 'cadena_config.planeacion no es un objeto (%): no se toca', jsonb_typeof(v);
  END IF;
END $$;

UPDATE public.cadena_config
   SET valor = jsonb_set(
                 valor,
                 '{lista_de_control}',
                 to_jsonb($lista$# MÉTODO (capa local · marketing-plan (lista de control) · coreyhaines31/marketingskills @ 88c79f6 · MIT)
Lista de control, no formato: revisa que tu plan cubra cada superficie o diga explícitamente por qué no aplica a este negocio. No agregues secciones por cumplir.
- Resumen ejecutivo que se sostenga solo: las 3 apuestas grandes, las prioridades de 90 días y el resultado esperado, legible en un minuto.
- Marco estratégico: en qué categoría compite el negocio, quién es exactamente el público (no «todos») y las reglas de voz del manual que ninguna sección puede romper.
- Estado actual: equipo real, presupuesto real, lo que ya se hizo (reconocido, no ignorado), lo que está en marcha y lo que está trabado.
- Cómo nos conocen (adquisición): canales actuales, planeados y descartados con motivo; movimientos de 90 días.
- Primera experiencia (activación): qué pasa la primera vez que alguien llega, compra o entra; qué lo convierte.
- Vuelven (retención): qué hace que el cliente repita; qué evita que se vaya; cómo se recupera al que se fue.
- Recomiendan (referidos): qué mecanismo concreto hace que un cliente traiga a otro.
- Ingresos: precios, paquetes, ventas adicionales; el número que el plan persigue y la meta por semana que lo mide.
- Hoja de ruta de 90 días por semanas con fechas: desbloquear (semanas 1–2) · cimientos (3–4) · velocidad (5–8) · acumular (9–12); cada movimiento con un responsable, no solo una acción.
- Más allá de los 90 días: qué cambia después y qué lo desbloquea (presupuesto, temporada, equipo).
- Herramientas y canales que ejecutan cada movimiento (los que el negocio tiene, no los que no tiene).
- Lo que NO se hace y por qué: las ideas descartadas con su motivo valen tanto como las elegidas.
- Medición y decisiones abiertas: el indicador principal, los indicadores adelantados, quién decide qué, y las decisiones incómodas nombradas (no escondidas).
- Señales de plan genérico (evítalas): tácticas sin secuencia · recomendar lo que el equipo no puede ejecutar · presupuesto que no existe · frases vacías («construir comunidad», «mejorar el SEO») sin movimiento concreto · ignorar la voz del manual · relleno con ideas que el negocio no necesita · no reconocer lo que ya se hizo.
- Denso, no inflado: si una sección no tiene nada que decir, dilo en una línea. Nombra la pregunta abierta antes que adivinar.$lista$::text),
                 true),
       actualizado_en = now()
 WHERE clave = 'planeacion'
   AND NOT (valor ? 'lista_de_control');

DO $$
DECLARE v jsonb;
BEGIN
  SELECT valor INTO v FROM public.cadena_config WHERE clave = 'planeacion';
  IF NOT (v ? 'redactor') OR NOT (v ? 'lista_de_control') THEN
    RAISE EXCEPTION 'cadena_config.planeacion debe traer redactor y lista_de_control; tiene %', v;
  END IF;
END $$;

COMMIT;
