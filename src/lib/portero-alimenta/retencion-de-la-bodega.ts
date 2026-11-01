/**
 * RETENCIÓN DE LA BODEGA DEL MUNDO (01-nov · decisión de Emilio, encargo «fallas pendientes y retención», punto 3).
 * Todo lo del cliente y su competencia se guarda sin borrar. En la BODEGA (videos sin cliente) el ARCHIVO de video se queda 90 días; pasado eso se borra SOLO el archivo
 * y la fila conserva sus capturas, etiquetas, transcripción y datos (`path` queda vacío y `archivo_borrado_en` dice cuándo). Nada más se borra, y NUNCA un archivo de un cliente:
 * toda lectura y toda escritura lleva `client_id is null`.
 */
export const DIAS_DE_UN_VIDEO_EN_LA_BODEGA = 90
export const MAX_BORRADOS_POR_CORRIDA = 200
const BUCKET = 'client-videos'

type Traer = (u: string, i?: RequestInit) => Promise<Response>
export interface InformeDeRetencion { dry_run: boolean; corte: string; vencidos: number; borrados: number; bytes_liberados: number; fallidos: Array<{ id: string; causa: string }> }

export async function retenerLaBodega(a: { urlDeLaBase: string; llave: string; ahora: Date; dry_run: boolean; fetchImpl?: Traer; max?: number; dias?: number }): Promise<InformeDeRetencion> {
  const corte = new Date(a.ahora.getTime() - (a.dias ?? DIAS_DE_UN_VIDEO_EN_LA_BODEGA) * 86_400_000).toISOString()
  const inf: InformeDeRetencion = { dry_run: a.dry_run, corte, vencidos: 0, borrados: 0, bytes_liberados: 0, fallidos: [] }
  if (!a.urlDeLaBase || !a.llave) { inf.fallidos.push({ id: '-', causa: 'la base no está configurada' }); return inf }
  const traer: Traer = a.fetchImpl ?? ((u, i) => fetch(u, i))
  const base = a.urlDeLaBase.replace(/\/$/, '')
  const auth = { apikey: a.llave, Authorization: `Bearer ${a.llave}` }
  const r = await traer(`${base}/rest/v1/client_videos?client_id=is.null&estado=eq.ok&path=not.is.null&archivo_borrado_en=is.null&created_at=lt.${encodeURIComponent(corte)}&select=id,path,bytes&order=created_at.asc&limit=${a.max ?? MAX_BORRADOS_POR_CORRIDA}`, { headers: auth })
  if (!r.ok) { inf.fallidos.push({ id: '-', causa: `la lista de videos respondió ${r.status}` }); return inf }
  const filas = (await r.json()) as Array<{ id: string; path: string; bytes: number | null }>
  inf.vencidos = filas.length
  if (a.dry_run) return inf
  for (const v of filas) {
    // solo rutas de la bodega: un archivo de un cliente (su carpeta lleva el id del cliente) jamás se toca
    if (!v.path.startsWith('bodega/')) { inf.fallidos.push({ id: v.id, causa: 'la ruta no es de la bodega: no se toca' }); continue }
    try {
      const d = await traer(`${base}/storage/v1/object/${BUCKET}/${v.path.split('/').map(encodeURIComponent).join('/')}`, { method: 'DELETE', headers: auth })
      if (!d.ok && d.status !== 404) { inf.fallidos.push({ id: v.id, causa: `el almacén respondió ${d.status} al borrar` }); continue }
      const p = await traer(`${base}/rest/v1/client_videos?id=eq.${v.id}&client_id=is.null`, { method: 'PATCH', headers: { ...auth, 'content-type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ path: null, archivo_borrado_en: a.ahora.toISOString() }) })
      if (!p.ok) { inf.fallidos.push({ id: v.id, causa: `el archivo se borró pero la fila no se actualizó (${p.status})` }); continue }
      inf.borrados++; inf.bytes_liberados += v.bytes ?? 0
    } catch (e) { inf.fallidos.push({ id: v.id, causa: (e instanceof Error ? e.message : String(e)).slice(0, 100) }) }
  }
  return inf
}
