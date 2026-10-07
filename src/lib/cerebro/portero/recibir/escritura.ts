/**
 * PASO 7 · el escritor del almacén: el ÚNICO lugar de `recibir` que escribe en la base, y solo en `cerebro_ingresos` y `cerebro_fichas`
 * (las dos tablas del paso 2) por la API REST con la llave de servicio. Tres verbos: POST (crear), PATCH (renovar, retirar, cerrar) y DELETE (solo para COMPENSAR).
 *
 * «Todo o nada» por ingreso: las fichas nuevas entran en UNA petición (una sola instrucción en la base: o entran todas o ninguna). Los pasos que siguen
 * (renovar las heredadas, marcar las retiradas, cerrar el ingreso) son PATCH; si uno falla se COMPENSA (se borran las fichas recién escritas de ESE ingreso
 * y se deshacen las retiradas) y se dice si la compensación también falló. Renovar `reconfirmado_en` no se deshace: es una marca de «visto hoy» inocua.
 * Una transacción de verdad en la base (una función) queda como endurecimiento opcional que pide una migración (no incluida en este paso).
 * Todo id va validado como uuid y el cliente va codificado ANTES de armar una dirección.
 */
import type { Almacen, Cambios, FilaDeFicha, FilaDeIngreso, ResultadoDeAlmacen } from './tipos'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const TIEMPO_MAXIMO_DE_PETICION_MS = 20_000

export interface OpcionesDeAlmacen {
  urlDeLaBase: string
  llave: string
  fetchImpl?: (url: string, init?: RequestInit) => Promise<Response>
}

export function crearAlmacen(opciones: OpcionesDeAlmacen): Almacen {
  const base = opciones.urlDeLaBase.replace(/\/$/, '')
  const traer = opciones.fetchImpl ?? ((u: string, i?: RequestInit) => fetch(u, i))
  const cabeceras = { apikey: opciones.llave, Authorization: `Bearer ${opciones.llave}`, 'content-type': 'application/json', Prefer: 'return=minimal' }

  const pedir = async (metodo: 'POST' | 'PATCH' | 'DELETE', direccion: string, cuerpo?: unknown): Promise<{ ok: boolean; detalle?: string }> => {
    const control = new AbortController()
    const reloj = setTimeout(() => control.abort(), TIEMPO_MAXIMO_DE_PETICION_MS)
    try {
      const r = await traer(`${base}/rest/v1/${direccion}`, { method: metodo, headers: cabeceras, ...(cuerpo === undefined ? {} : { body: JSON.stringify(cuerpo) }), signal: control.signal })
      if (!r.ok) return { ok: false, detalle: `la base respondió ${r.status} en ${direccion.split('?')[0]}: ${(await r.text()).slice(0, 200)}` }
      return { ok: true }
    } catch (e) {
      return { ok: false, detalle: `error de red en ${direccion.split('?')[0]}: ${e instanceof Error ? e.message : String(e)}` }
    } finally {
      clearTimeout(reloj)
    }
  }
  const idsValidos = (ids: string[]): boolean => ids.every((i) => typeof i === 'string' && UUID.test(i))
  const lista = (ids: string[]): string => `in.(${ids.join(',')})`
  const cliente = (c: string): string => `client_id=eq.${encodeURIComponent(c)}`

  const crearIngreso = async (fila: FilaDeIngreso): Promise<ResultadoDeAlmacen> => {
    if (!idsValidos([fila.id])) return { ok: false, detalle: 'el id del ingreso no es un uuid' }
    const r = await pedir('POST', 'cerebro_ingresos', fila)
    return r.ok ? { ok: true, id: fila.id } : { ok: false, detalle: r.detalle }
  }

  const cerrarIngreso: Almacen['cerrarIngreso'] = async (id, final) => {
    if (!idsValidos([id])) return { ok: false, detalle: 'el id del ingreso no es un uuid' }
    const r = await pedir('PATCH', `cerebro_ingresos?id=eq.${id}`, final)
    return r.ok ? { ok: true } : { ok: false, detalle: r.detalle }
  }

  const aplicar = async (c: Cambios): Promise<ResultadoDeAlmacen> => {
    const ids = [c.ingreso_id, ...c.fichas.flatMap((f: FilaDeFicha) => [f.id, f.ingreso_id, ...(f.version_de ? [f.version_de] : [])]), ...c.heredadas, ...c.retiradas.map((r) => r.id)]
    if (!idsValidos(ids)) return { ok: false, detalle: 'algún id no es un uuid: no se escribió nada', compensado: true }
    const donde = cliente(c.client_id)
    let fichasEscritas = false
    const retiradasHechas: string[][] = []

    const compensar = async (): Promise<boolean> => {
      let bien = true
      for (const grupo of retiradasHechas.reverse()) {
        const r = await pedir('PATCH', `cerebro_fichas?id=${lista(grupo)}&${donde}`, { retirada_en: null, motivo_retirada: null })
        if (!r.ok) bien = false
      }
      if (fichasEscritas) {
        const r = await pedir('DELETE', `cerebro_fichas?ingreso_id=eq.${c.ingreso_id}&${donde}`)
        if (!r.ok) bien = false
      }
      return bien
    }
    const fallar = async (detalle: string | undefined): Promise<ResultadoDeAlmacen> => ({ ok: false, detalle, compensado: await compensar() })

    if (c.fichas.length > 0) {
      const r = await pedir('POST', 'cerebro_fichas', c.fichas)
      if (!r.ok) return { ok: false, detalle: r.detalle, compensado: true } // nada se escribió: no hay nada que deshacer
      fichasEscritas = true
    }
    if (c.heredadas.length > 0) {
      const r = await pedir('PATCH', `cerebro_fichas?id=${lista(c.heredadas)}&${donde}`, { reconfirmado_en: c.reconfirmado_en })
      if (!r.ok) return fallar(r.detalle)
    }
    const porMotivo = new Map<string, string[]>()
    for (const x of c.retiradas) porMotivo.set(x.motivo, [...(porMotivo.get(x.motivo) ?? []), x.id])
    for (const [motivo, grupo] of porMotivo) {
      const r = await pedir('PATCH', `cerebro_fichas?id=${lista(grupo)}&${donde}`, { retirada_en: c.retirada_en, motivo_retirada: motivo })
      if (!r.ok) return fallar(r.detalle)
      retiradasHechas.push(grupo)
    }
    const cierre = await pedir('PATCH', `cerebro_ingresos?id=eq.${c.ingreso_id}&${donde}`, c.final)
    if (!cierre.ok) return fallar(cierre.detalle)
    return { ok: true }
  }

  return { crearIngreso, aplicar, cerrarIngreso }
}
