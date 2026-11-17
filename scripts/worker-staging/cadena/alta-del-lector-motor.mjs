/**
 * EL MOTOR del alta del lector de fichas (separado del guion para probarlo con un n8n simulado · 🟡 de CC6 a #1144).
 * No lee el entorno ni la red: recibe `api(método, ruta, cuerpo)` y los flujos ya armados.
 *
 * Guardas (cada una SIN escribir nada si no se cumple):
 *   (a) lo PUBLICADO de la puerta (`activeVersion`) es el respaldo;
 *   (b) el BORRADOR es el respaldo o ya el parche (un alta a medias);
 *   (c) a lo sumo UN sub-flujo previo con ese nombre, y solo se reusa si es idéntico al de `construir.mjs`.
 * Orden: (d) publicar el sub-flujo ANTES de tocar la puerta (n8n no deja publicar una puerta que llama a un sub-flujo sin publicar).
 * (e) Tras el PUT, el borrador Y lo publicado deben ser el parche; si no, o si cualquier paso falla DESPUÉS de tocar la puerta,
 *     el motor RESTAURA la puerta al respaldo (borrador y publicado) y dice si lo logró. Nunca deja un estado a medias sin decirlo.
 * El sub-flujo puede quedar publicado: su único disparador es la llamada de la puerta (no corre solo).
 */
import { createHash } from 'node:crypto'

export const huella = (w) => createHash('sha256').update(JSON.stringify([w.nodes.map((n) => [n.name, n.type, n.parameters, n.onError ?? null]), w.connections])).digest('hex')
const publicadaDe = (w) => (w.activeVersion?.nodes ? w.activeVersion : w)

/**
 * @returns {Promise<{ estado: 'plan' | 'hecho' | 'frenado' | 'fallido', motivo?: string, idFichas?: string, sql?: string, restaurada?: boolean | null, lineas: string[] }>}
 */
export async function altaDelLector({ api, ANTES, sub, conLector, idPuerta, ejecutar }) {
  const lineas = []
  const log = (x) => lineas.push(x)
  const frenado = (motivo) => ({ estado: 'frenado', motivo, lineas })

  const vivo = await api('GET', `/workflows/${idPuerta}`)
  if (huella(publicadaDe(vivo)) !== huella(ANTES)) return frenado('la puerta PUBLICADA no es igual al respaldo (rehacer el respaldo y revisar el parche)')
  log('1 · la puerta publicada es igual al respaldo')

  const existentes = []
  let cursor
  do { const r = await api('GET', `/workflows?limit=100${cursor ? '&cursor=' + cursor : ''}`); existentes.push(...r.data); cursor = r.nextCursor } while (cursor)
  const previos = existentes.filter((w) => w.name === sub.name && !w.isArchived)
  if (previos.length > 1) return frenado(`hay ${previos.length} flujos «${sub.name}»`)
  let idFichas = previos[0]?.id ?? null
  if (idFichas) {
    const previo = await api('GET', `/workflows/${idFichas}`)
    if (huella(previo) !== huella(sub)) return frenado(`ya existe «${sub.name}» (${idFichas}) y NO es igual al que arma construir.mjs`)
    log(`   el sub-flujo ya existe y es igual al de construir.mjs → se reusa ${idFichas} (activo: ${previo.active})`)
  }
  const borradorOk = huella(vivo) === huella(ANTES) || (idFichas && huella(vivo) === huella(conLector(ANTES, idFichas)))
  if (!borradorOk) return frenado('el BORRADOR de la puerta no es ni el respaldo ni el parche')
  const prueba = conLector(ANTES, '@@ID_FICHAS@@')
  log(`2 · plan: ${idFichas ? 'reusar' : 'crear'} «${sub.name}» (${sub.nodes.length} nodos) y PUBLICARLO · la puerta pasa de ${ANTES.nodes.length} a ${prueba.nodes.length} nodos`)
  if (!ejecutar) return { estado: 'plan', lineas }

  // ── antes de tocar la puerta: un fallo aquí deja la puerta como estaba
  try {
    if (!idFichas) {
      const creado = await api('POST', '/workflows', { name: sub.name, nodes: sub.nodes, connections: sub.connections, settings: sub.settings })
      idFichas = creado.id
      log(`   creado fichas → ${idFichas}`)
    }
    await api('POST', `/workflows/${idFichas}/activate`)
    const subVivo = await api('GET', `/workflows/${idFichas}`)
    if (subVivo.active !== true) throw new Error('el sub-flujo no quedó publicado')
    log(`   sub-flujo publicado (activo: ${subVivo.active})`)
  } catch (e) {
    return { estado: 'fallido', motivo: `${e.message} · la puerta NO se tocó`, idFichas: idFichas ?? undefined, restaurada: null, lineas }
  }
  const sql = `UPDATE public.cadena_config SET valor = valor || '${JSON.stringify([idFichas])}'::jsonb, actualizado_en = now() WHERE clave = 'flujos' AND NOT (valor ? '${idFichas}');`

  // ── desde aquí se toca la puerta: cualquier fallo restaura
  const nueva = conLector(ANTES, idFichas)
  try {
    await api('PUT', `/workflows/${idPuerta}`, { name: vivo.name, nodes: nueva.nodes, connections: nueva.connections, settings: vivo.settings })
    let despues = await api('GET', `/workflows/${idPuerta}`)
    if (despues.activeVersionId && despues.activeVersionId !== despues.versionId) { await api('POST', `/workflows/${idPuerta}/activate`); despues = await api('GET', `/workflows/${idPuerta}`) }
    const pub = publicadaDe(despues)
    if (huella(despues) !== huella(nueva) || huella(pub) !== huella(nueva)) throw new Error('la puerta guardada o la PUBLICADA no es igual al parche')
    log(`4 · puerta parchada, publicada y verificada (${pub.nodes.length} nodos · activa: ${despues.active})`)
    return { estado: 'hecho', idFichas, sql, lineas }
  } catch (e) {
    const restaurada = await restaurar({ api, ANTES, vivo, idPuerta })
    return { estado: 'fallido', motivo: `${e.message} · restauración de la puerta al respaldo: ${restaurada ? 'LOGRADA' : 'NO LOGRADA (restaurar a mano)'}`, idFichas, sql, restaurada, lineas }
  }
}

/** vuelve la puerta al respaldo: borrador Y publicado. true solo si los dos quedan iguales al respaldo */
export async function restaurar({ api, ANTES, vivo, idPuerta }) {
  try {
    await api('PUT', `/workflows/${idPuerta}`, { name: vivo.name, nodes: ANTES.nodes, connections: ANTES.connections, settings: vivo.settings })
    let w = await api('GET', `/workflows/${idPuerta}`)
    if (w.activeVersionId && w.activeVersionId !== w.versionId) { await api('POST', `/workflows/${idPuerta}/activate`); w = await api('GET', `/workflows/${idPuerta}`) }
    return huella(w) === huella(ANTES) && huella(publicadaDe(w)) === huella(ANTES)
  } catch {
    return false
  }
}
