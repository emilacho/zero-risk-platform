/**
 * LA MISMA CARPETA QUE QUIEN ESCRIBE (01-nov · firma de Emilio): «un revisor nunca debe tener menos contexto que quien escribe». En la corrida 210273 el revisor marcó como falsos un precio,
 * una frase del sitio y un horario porque solo tenía la ficha. Esto le da el resumen vivo, los informes de la mesa, lo que dijo el dueño y las páginas propias del sitio.
 * Agnóstico. Nunca lanza: lo que no se pudo leer viaja DICHO, para que el revisor no lo lea como «no existe».
 */
import { datosDelDueno } from '../../manual/propuesta-rutas'
import { adjuntoDelCliente, type ContextoDelCliente } from '../../portero-alimenta/contexto-del-cliente'
import { TOPE_REAL_DEL_PEDIDO } from '../../limites-de-tamano'
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
  const p = await paginasPropiasDelSitio(db, clientId)
  if (p.estado === 'hay') out.push({ titulo: sitio, funcion: fSitio, texto: p.texto })
  else if (p.estado === 'no_se_pudo') out.push(problema(sitio, fSitio, p.detalle))
  return out
}

/** cuánto del pedido pueden ocupar las páginas: la mitad del tope real, para que el resto del pedido siempre quepa */
export const TOPE_DE_LAS_PAGINAS = TOPE_REAL_DEL_PEDIDO / 2
export type PaginasDelSitio = { estado: 'hay'; texto: string } | { estado: 'no_hay' } | { estado: 'no_se_pudo'; detalle: string }

/** las páginas propias del cliente, enteras. Nunca lanza. Si no cabe alguna, no se corta: queda fuera y se dice cuál */
export async function paginasPropiasDelSitio(db: Db, clientId: string): Promise<PaginasDelSitio> {
  try {
    const r = (await db.from('client_web_pages').select('url, content_text').eq('client_id', clientId).is('competitor_id', null).eq('owner_role', 'propio')) as { data: Array<{ url?: string; content_text?: string }> | null; error: { message: string } | null }
    if (r.error) return { estado: 'no_se_pudo', detalle: r.error.message }
    const paginas = (r.data ?? []).filter((p) => p.content_text?.trim())
    if (!paginas.length) return { estado: 'no_hay' }
    const entran: string[] = []
    const fuera: string[] = []
    let usado = 0
    for (const p of paginas) {
      const t = `## ${p.url ?? 'página'}\n${p.content_text}`
      if (usado + t.length > TOPE_DE_LAS_PAGINAS) { fuera.push(p.url ?? 'página'); continue }
      entran.push(t); usado += t.length
    }
    const aviso = fuera.length ? `\n\n(Por tamaño no entraron estas páginas del sitio: ${fuera.join(', ')}. No las tomes como que no existen.)` : ''
    return { estado: 'hay', texto: entran.join('\n\n') + aviso }
  } catch (e) {
    return { estado: 'no_se_pudo', detalle: e instanceof Error ? e.message : String(e) }
  }
}

/**
 * 01-nov · hallazgo en el primer «Pedir cambios»: ese camino no vuelve a correr los brazos, así que el flujo declara «SIN PÁGINAS DEL SITIO» aunque el cliente las tenga, y el revisor marcó como falsos un precio y una frase reales.
 * Ese bloque se cambia por las páginas de verdad, y su advertencia desaparece. Si el cliente no tiene páginas, la declaración sigue. Puro.
 */
export function conLasPaginasDelSitio(contexto: ContextoDelRevisor[], p: PaginasDelSitio): ContextoDelRevisor[] {
  return contexto.map((c) => {
    if (!/^p[aá]ginas del sitio/i.test(c.titulo.trim()) || !/^SIN P[AÁ]GINAS DEL SITIO/i.test(c.texto.trim())) return c
    if (p.estado === 'hay') return { ...c, texto: p.texto }
    if (p.estado === 'no_se_pudo') return { ...c, texto: `(No se pudieron leer las páginas del sitio: ${p.detalle}. No las tomes como que no existen, ni marques como inventado lo que pudiera venir de ellas.)` }
    return c
  })
}
