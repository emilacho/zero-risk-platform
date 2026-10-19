/**
 * El eco del modo seco (CC#1 · 19-oct): la respuesta de forma conocida que devuelve `/api/dry-run/eco`. Sin base, sin red, sin efectos.
 */

/** los campos de identificador que los nodos siguientes leen de las respuestas reales (Notion, Cal.com, Drive, Apify, brand book); todos valen «dry-run» */
export const CAMPOS_DE_ECO = ['id', 'page_id', 'workspace_id', 'workspace_url', 'url', 'booking_id', 'uid', 'meeting_url', 'file_id', 'doc_id', 'run_id', 'version'] as const

export function respuestaDeEco(cuerpo: unknown): Record<string, unknown> {
  const claves = cuerpo !== null && typeof cuerpo === 'object' && !Array.isArray(cuerpo) ? Object.keys(cuerpo as Record<string, unknown>).slice(0, 40) : []
  return {
    ok: true,
    dry_run: true,
    simulado: true,
    ...Object.fromEntries(CAMPOS_DE_ECO.map((c) => [c, 'dry-run'])),
    competitors: [],
    eco: { claves_recibidas: claves, nota: 'modo seco: este nodo NO tocó nada real' },
  }
}
