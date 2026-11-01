/**
 * LA MISMA CARPETA QUE QUIEN ESCRIBE (01-nov · firma de Emilio): «un revisor nunca debe tener menos contexto que quien escribe». En la corrida 210273 el revisor marcó como falsos un precio,
 * una frase del sitio y un horario porque solo tenía la ficha. Esto le da el resumen vivo, los informes de la mesa, lo que dijo el dueño y las páginas propias del sitio.
 * Agnóstico. Nunca lanza: lo que no se pudo leer viaja DICHO, para que el revisor no lo lea como «no existe».
 */
import { datosDelDueno } from '../../manual/propuesta-rutas'
import { adjuntoDelCliente, type ContextoDelCliente } from '../../portero-alimenta/contexto-del-cliente'
import type { ContextoDelRevisor } from '../../revision-comun'

type Db = { from(tabla: string): any }

/** el resumen vivo y los informes, enteros, en texto */
export function textoDeLaCarpeta(c: ContextoDelCliente): string {
  const r = c.resumen_vivo
  const resumen = r.estado === 'vigente' ? [r.texto ?? '', ...(r.sedes ?? []).map((s) => `[sede ${s.clave}] ${s.texto}`)].filter(Boolean).join('\n') : `(resumen vivo: ${r.estado})`
  const informes = c.informes_estado === 'no_se_pudo_leer' ? [`(los informes no se pudieron leer: ${c.informes_detalle ?? 'sin detalle'})`] : c.informes.map((i) => `### Informe «${i.tipo}»\n${i.texto}`)
  return [`## Resumen vivo\n${resumen}`, informes.length ? `## Informes de la mesa de análisis\n${informes.join('\n\n')}` : '## Informes de la mesa de análisis\n(no hay vigentes)'].join('\n\n')
}

const problema = (titulo: string, funcion: string, e: unknown): ContextoDelRevisor => ({ titulo, funcion, texto: `(no se pudo leer: ${e instanceof Error ? e.message : String(e)}. No lo tomes como que no existe.)` })

export async function carpetaParaRevisar(db: Db, clientId: string): Promise<ContextoDelRevisor[]> {
  const out: ContextoDelRevisor[] = []
  const carpeta = 'La carpeta del cliente (la misma que recibe quien escribe)'
  try { out.push({ titulo: carpeta, funcion: 'lo que el negocio sabe y lo que analizó la mesa', texto: textoDeLaCarpeta(await adjuntoDelCliente(db, clientId)) }) } catch (e) { out.push(problema(carpeta, 'lo que el negocio sabe', e)) }
  const dueno = 'Lo que dijo el dueño'
  const fDueno = 'correcciones del dueño; mandan sobre la investigación'
  try {
    const d = await datosDelDueno(db as never, clientId)
    if (d.ok) { if (d.hechos.length) out.push({ titulo: dueno, funcion: fDueno, texto: d.hechos.join('\n') }) } else out.push(problema(dueno, fDueno, 'la lectura falló'))
  } catch (e) { out.push(problema(dueno, fDueno, e)) }
  const sitio = 'Las páginas propias del sitio'
  const fSitio = 'lo que el negocio publica hoy: precios, frases, horarios y canales de pedido'
  try {
    const r = (await db.from('client_web_pages').select('url, content_text').eq('client_id', clientId).is('competitor_id', null).eq('owner_role', 'propio')) as { data: Array<{ url?: string; content_text?: string }> | null; error: { message: string } | null }
    if (r.error) out.push(problema(sitio, fSitio, r.error.message))
    else { const paginas = (r.data ?? []).filter((p) => p.content_text?.trim()); if (paginas.length) out.push({ titulo: sitio, funcion: fSitio, texto: paginas.map((p) => `## ${p.url ?? 'página'}\n${p.content_text}`).join('\n\n') }) }
  } catch (e) { out.push(problema(sitio, fSitio, e)) }
  return out
}
