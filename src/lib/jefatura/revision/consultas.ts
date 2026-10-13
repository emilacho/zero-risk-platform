/**
 * LAS CONSULTAS §148 de la jefatura (oficina propia), ESCRITAS DE ANTEMANO (diseño v4 §6 · lección M1: ningún módulo nuevo sin instrumentación definida antes del primer smoke).
 * Son SOLO LECTURA (SELECT) sobre las tablas `jefatura_*` y `hitl_pending_approvals`; nadie las corre desde aquí. Se guardan como texto para que cualquier vigilante o quien audite las use tal cual.
 * Ninguna escribe: una prueba lo vigila.
 */
export const CONSULTAS_148 = {
  /** revisiones por tipo, cliente y día (seco y real aparte) */
  revisiones_por_tipo_cliente_dia: `SELECT artifact_type, client_id, date_trunc('day', creado_en) AS dia, dry_run, count(*) AS revisiones, round(sum(gasto_usd)::numeric, 4) AS gasto_usd
FROM public.jefatura_revisiones GROUP BY 1, 2, 3, 4 ORDER BY dia DESC, artifact_type;`,
  /** % de revisiones cerradas «sin segunda mirada» (GPT no respondió) */
  porcentaje_sin_segunda_mirada: `SELECT artifact_type, round(100.0 * count(*) FILTER (WHERE (marcas->>'sin_segunda_mirada')::boolean) / NULLIF(count(*), 0), 1) AS pct_sin_segunda_mirada, count(*) AS cerradas
FROM public.jefatura_revisiones WHERE estado IN ('cerrada', 'cerrada_por_tope', 'fallida') AND dry_run = false GROUP BY artifact_type;`,
  /** % de revisiones cerradas «con desacuerdo» */
  porcentaje_con_desacuerdo: `SELECT artifact_type, round(100.0 * count(*) FILTER (WHERE (marcas->>'con_desacuerdo')::boolean) / NULLIF(count(*), 0), 1) AS pct_con_desacuerdo, count(*) AS cerradas
FROM public.jefatura_revisiones WHERE estado IN ('cerrada', 'cerrada_por_tope', 'fallida') AND dry_run = false GROUP BY artifact_type;`,
  /** fichas tomadas vs no tomadas, por origen (jefe | externa | chequeo) */
  fichas_tomadas_vs_no_tomadas: `SELECT origen, estado, count(*) AS fichas FROM public.jefatura_fichas GROUP BY origen, estado ORDER BY origen, estado;`,
  /** costo por revisión contra su tope */
  costo_por_revision_contra_tope: `SELECT id, artifact_type, artifact_id, gasto_usd, tope_usd, round((gasto_usd / NULLIF(tope_usd, 0))::numeric, 3) AS fraccion_del_tope, estado, resultado
FROM public.jefatura_revisiones ORDER BY fraccion_del_tope DESC NULLS LAST LIMIT 100;`,
  /** gasto de GPT (vive en el libro propio, fuera de agent_invocations) */
  gasto_de_gpt: `SELECT date_trunc('day', inicio) AS dia, count(*) AS llamadas, round(sum(cost_usd)::numeric, 4) AS gasto_usd
FROM public.jefatura_pasos WHERE concepto = 'revisor_externo' GROUP BY 1 ORDER BY 1 DESC;`,
  /** pasos y minutos por revisión */
  pasos_y_minutos_por_revision: `SELECT r.id, r.artifact_type, count(p.*) AS pasos, round(extract(epoch FROM (coalesce(r.cerrado_en, now()) - r.creado_en)) / 60.0, 1) AS minutos
FROM public.jefatura_revisiones r LEFT JOIN public.jefatura_pasos p ON p.revision_id = r.id GROUP BY r.id ORDER BY minutos DESC LIMIT 100;`,
  /** revisiones abiertas hace más de 60 minutos (algo se colgó) */
  abiertas_hace_mas_de_60_min: `SELECT id, artifact_type, artifact_id, estado, creado_en FROM public.jefatura_revisiones WHERE estado IN ('abierta', 'en_paso') AND creado_en < now() - interval '60 minutes' ORDER BY creado_en;`,
  /** 🔴 ALARMA: cualquier fila `editor_escalation` NUEVA significa que alguien resucitó el editor de `run-sdk` sobre un paso que cubre la jefatura (diseño §9) */
  alarma_editor_escalation_nueva: `SELECT id, created_at, status FROM public.hitl_pending_approvals WHERE approval_type = 'editor_escalation' AND created_at > $1 ORDER BY created_at DESC;`,
} as const

export type ClaveDeConsulta = keyof typeof CONSULTAS_148
