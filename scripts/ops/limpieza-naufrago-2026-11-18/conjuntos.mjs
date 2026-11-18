// LOS CONJUNTOS DE LA LIMPIEZA DE NÁUFRAGO (18-nov) · las MISMAS condiciones que `supabase/migrations/202611180500_limpieza_naufrago_prueba_final.sql`.
// Los usan el respaldo (leer antes), la vuelta atrás (re-insertar en orden inverso) y el conteo de después.
// `orden`: el del borrado (hojas → raíz). La vuelta atrás va al revés.
export const C = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
export const CAMP = '28de888e-b3f2-4aca-86b3-2c7f7bf6685a'
export const REEL = '2ed549cc-f452-4261-b334-3b35a6dd5a4d'
const ENC = `(select id from public.oficina_encargos where client_id = '${C}' and id <> '${REEL}')`
const REV = `(select id from public.jefatura_revisiones where client_id = '${C}' and artifact_type = 'pieza')`

export const CONJUNTOS = [
  { tabla: 'jefatura_fichas', donde: `revision_id in ${REV}`, esperado: 31 },
  { tabla: 'jefatura_pasos', donde: `revision_id in ${REV}`, esperado: 18 },
  { tabla: 'jefatura_revisiones', donde: `client_id = '${C}' and artifact_type = 'pieza'`, esperado: 4 },
  { tabla: 'oficina_artefactos', donde: `encargo_id in ${ENC}`, esperado: 69 },
  { tabla: 'oficina_fichas', donde: `encargo_id in ${ENC}`, esperado: 25 },
  { tabla: 'oficina_gastos', donde: `encargo_id in ${ENC}`, esperado: 157 },
  { tabla: 'oficina_uso_de_fotos', donde: `encargo_id in ${ENC} or client_id = '${C}'`, esperado: 0 },
  { tabla: 'oficina_mesa_aportes', donde: `encargo_id in ${ENC}`, esperado: 229 },
  { tabla: 'oficina_turnos', donde: `encargo_id in ${ENC}`, esperado: 213 },
  { tabla: 'oficina_encargos', donde: `client_id = '${C}' and id <> '${REEL}'`, esperado: 19 },
  { tabla: 'cadena_filas_elegidas', donde: `campana_id = '${CAMP}'`, esperado: 2 },
  { tabla: 'cadena_validaciones', donde: `campana_id = '${CAMP}'`, esperado: 79 },
  { tabla: 'cadena_esperas', donde: `campana_id = '${CAMP}'`, esperado: 22 },
  { tabla: 'cadena_corridas', donde: `campana_id = '${CAMP}'`, esperado: 5 },
  { tabla: 'cadena_calendario_filas', donde: `campana_id = '${CAMP}'`, esperado: 112 },
  { tabla: 'cadena_brief_creativo', donde: `campana_id = '${CAMP}'`, esperado: 4 },
  { tabla: 'cadena_conceptos', donde: `campana_id = '${CAMP}'`, esperado: 4 },
  { tabla: 'cadena_estrategias', donde: `campana_id = '${CAMP}'`, esperado: 1 },
  { tabla: 'cadena_fichas_de_oferta', donde: `campana_id = '${CAMP}'`, esperado: 0 },
  { tabla: 'cadena_correcciones', donde: `campana_id = '${CAMP}'`, esperado: 0 },
  { tabla: 'hitl_queue', donde: `client_id = '${C}' and type in ('concepto_review', 'content_piece_review')`, esperado: 8 },
  { tabla: 'avisos', donde: `client_id = '${C}' and clave like 'cadena:%${CAMP}%'`, esperado: 4 },
  { tabla: 'client_historical_outputs', donde: `client_id = '${C}' and (output_type = 'campaign_piece' or (output_type = 'campaign_brief_pack' and id in ('27a1febc-244d-40fa-b01a-5d1a234d1737', 'ce085548-56a0-4892-8852-74c1d2d54576')))`, esperado: 7 },
  { tabla: 'estudio_piezas', donde: `client_id = '${C}'`, esperado: 8 },
  { tabla: 'autorevisiones_del_productor', donde: `client_id = '${C}'`, esperado: 2 },
  { tabla: 'workflow_checkpoints', donde: `client_id = '${C}'`, esperado: 65 },
  // la sala por STREAM ENTERO (ADENDA 4 de CC7): BRIEF de la campaña y PIEZAS de las partes borradas; se quedan el alta, el plan y el reel (009abba3)
  { tabla: 'sala_event_log', donde: `stream_id in (select stream_id from public.sala_event_log where client_id = '${C}' group by stream_id having bool_or(journey_type = 'BRIEF') or (bool_or(journey_type = 'PIEZAS') and not bool_or(coalesce(logical_period, '') || coalesce(idempotency_key, '') like '%009abba3%')))`, esperado: 82 },
  // camino (B) de Lenovo: la campaña misma, al final (la vuelta atrás la repone PRIMERO, antes que sus hijas)
  { tabla: 'cadena_campanas', donde: `id = '${CAMP}' and client_id = '${C}'`, esperado: 1 },
]
/** las 3 libretas: se respalda el VALOR ENTERO de la clave; la vuelta atrás lo repone tal cual */
export const LIBRETAS = ['reubicacion_libreta', 'rehacer_fallidos_libreta', 'reintentos_piezas']
/** los archivos que se borran por la API de almacenamiento (el reel y `agent-images` se quedan) */
export const ARCHIVOS = [
  { bucket: 'oficina-creativos', donde: `name like 'oficina/${C}/%' and name not like 'oficina/${C}/${REEL}/%'`, esperado: 19 },
  { bucket: 'oficina-creativos', donde: `name like 'estudio/${C}/%'`, esperado: 8 },
  { bucket: 'oficina-creativos', donde: `name like 'naufrago/carousels/%'`, esperado: 1 },
]

const ref = () => new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname.split('.')[0]
/** una consulta por la API de administración; `soloLectura` la manda con read_only */
export async function sql(query, soloLectura = true, intento = 0) {
  const r = await fetch(`https://api.supabase.com/v1/projects/${ref()}/database/query`, { method: 'POST', headers: { Authorization: `Bearer ${process.env.SUPABASE_ACCESS_TOKEN}`, 'Content-Type': 'application/json' }, body: JSON.stringify(soloLectura ? { query, read_only: true } : { query }) })
  const t = await r.text()
  // la API limita las consultas seguidas (429, medido el 18-nov): espera creciente, máximo 5 intentos; nada más se reintenta
  if (r.status === 429 && intento < 5) { await new Promise((ok) => setTimeout(ok, 2000 * 2 ** intento)); return sql(query, soloLectura, intento + 1) }
  if (!r.ok) throw new Error(`${r.status} ${t.slice(0, 800)}`)
  return JSON.parse(t)
}
