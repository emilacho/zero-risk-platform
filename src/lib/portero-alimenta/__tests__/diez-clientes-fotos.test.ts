/**
 * LAS FOTOS EN LOS DIEZ CLIENTES DE PRUEBA (27-oct · guarda permanente · encargo recuperacion-y-vigia-independiente, punto 7) · US$ 0 · base falsa, sin modelo ni red.
 * Cada cliente de la muestra (uno sin sitio, uno sin Instagram, otros de rubros y países distintos) tiene fotos propias y de competencia/referencias con su origen;
 * por todos pasan la lectura, el etiquetado automático y el pedido «más fotos». Si algo se vuelve a hacer «a la medida» de un cliente, aquí se rompe.
 */
import { describe, expect, it } from 'vitest'
import type { Consulta, Fila } from '../../cerebro/consulta'
import { etiquetarPendientes, listarFotos, TOPE_DE_ETIQUETAS_POR_CLIENTE_Y_DIA } from '../../cerebro/portero/fotos-pendientes'
import { FOTOS_PARA_DAR_POR_RESUELTO, rutaPedido, type DepsDePedido } from '../pedidos'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES, type ClienteSintetico } from './diez-clientes.fixtures'
import { tablasDe } from './diez-clientes.tablas'
import { AHORA, ON } from './fixtures-despertar'

const WF = { workflow_id: 'wf', workflow_execution_id: 'ex' }

/** fotos del cliente según lo que SÍ tiene: sin Instagram, las propias salen del sitio; sin sitio, solo de Instagram; la competencia y las referencias vienen del raspado */
function fotosDe(c: ClienteSintetico): Fila[] {
  const propias = c.ig ? 6 : c.web ? 3 : 0
  const fila = (n: number, rol: string, k: number): Fila => ({ id: `${c.id}-${rol}-${k}`, client_id: c.id, owner_role: rol, estado: 'ok', handle: rol === 'propio' ? c.ig ?? 'sitio' : 'otra', tipo: 'post_image', url: `https://x/${c.id}/${rol}${k}.jpg`, created_at: `2026-10-2${n}T12:00:00Z`, etiquetada_en: null, duplicado_de: null, hash_archivo: `${c.id}-${rol}-${k}` })
  return [
    ...Array.from({ length: propias }, (_, k) => fila(0, 'propio', k)),
    ...Array.from({ length: 4 }, (_, k) => fila(1, 'competidor', k)),
    ...Array.from({ length: 2 }, (_, k) => fila(2, 'referencia', k)),
  ]
}
const consultaDe = (filas: Fila[]): Consulta => async (p) => ({ filas: filas.filter((x) => Object.entries(p.donde).every(([k, v]) => (v === null ? x[k] == null : x[k] === v))), error: null })

describe('los diez clientes de prueba tienen fotos (propias, competencia y referencias) y todas pasan por lo mismo', () => {
  it('la muestra incluye uno sin sitio y uno sin Instagram', () => {
    expect(DIEZ_CLIENTES.some((c) => !c.web)).toBe(true)
    expect(DIEZ_CLIENTES.some((c) => !c.ig)).toBe(true)
  })

  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre} (${c.pais}): lectura con origen, etiquetado automático y pedido «más fotos»`, async () => {
      const filas = fotosDe(c)
      const etiquetadas = new Set<string>()
      const consulta: Consulta = async (p) => {
        const r = await consultaDe(filas.map((f) => (etiquetadas.has(String(f.id)) ? { ...f, etiquetada_en: '2026-10-27T14:30:00Z', que_muestra: `foto ${f.id}` } : f)))(p)
        return r
      }
      // lectura: el origen sale de la fila y no de ningún dato del cliente
      const antes = await listarFotos(consulta, { cliente: c.id })
      expect(antes.ok).toBe(true)
      if (!antes.ok) return
      expect(antes.por_origen.competencia.total).toBe(4)
      expect(antes.por_origen.referencia.total).toBe(2)
      expect(antes.por_origen.propia.total).toBe(filas.filter((f) => f.owner_role === 'propio').length)
      expect(antes.sin_etiquetar).toBe(antes.total)

      // etiquetado automático: propias primero, todas las del cliente, sin salirse del tope
      const orden: string[] = []
      const r = await etiquetarPendientes({ consulta, ahora: () => new Date('2026-10-27T14:30:00Z'), etiquetarFoto: async (a) => { orden.push(a.foto_id); etiquetadas.add(a.foto_id); return { llamo_al_modelo: true, escribio: true, costo_usd: 0.008 } } }, { clientes: [c.id], dry_run: false })
      const hoy = Math.min(antes.total, TOPE_DE_ETIQUETAS_POR_CLIENTE_Y_DIA) // el tope es por cliente y día: lo que sobra se etiqueta mañana
      expect(r.etiquetadas).toBe(hoy)
      expect(r.informes[0].omitidas_por_tope).toBe(antes.total - hoy)
      expect(r.informes[0].fallidas).toEqual([])
      const rolDe = (id: string) => String(filas.find((f) => f.id === id)?.owner_role)
      const ultimaPropia = orden.map(rolDe).lastIndexOf('propio')
      const primeraAjena = orden.map(rolDe).findIndex((x) => x !== 'propio')
      if (ultimaPropia >= 0) expect(ultimaPropia).toBeLessThan(primeraAjena)

      // el pedido libre «más fotos» responde SOLO con foto_id ya etiquetados y su origen; con pocas, pide más a la cadena
      const cadena: string[] = []
      const d: DepsDePedido = {
        db: crearBaseFalsa(tablasDe(c) as never).db, interruptores: { ...ON, resumen_vivo: false, resumen_pulido: false }, activo: true, ahora: AHORA, nuevoId: () => '11111111-2222-4333-8444-555555555555', esperar: async () => {},
        fotos: { listar: (id) => listarFotos(consulta, { cliente: id }) },
        dispararCadena: async (id) => { cadena.push(id); return { ok: true, detalle: 'disparada' } },
      }
      const res = await rutaPedido(d, { client_id: c.id, dry_run: true, ...WF, pedido_por: { oficina: 'oficina-creativa', agente: 'creative-director' }, para: 'crear la pieza', huecos: [{ objetivo: 'más fotos de este cliente (propias + competencia/referencias)' }] })
      expect(res.status).toBe(200)
      const h = (res.body.huecos as Array<{ estado: string; foto_ids?: string[]; fotos?: Array<{ origen: string }> }>)[0]
      expect(h.foto_ids?.length).toBe(hoy)
      expect(new Set(h.fotos?.map((f) => f.origen)).has('competencia')).toBe(true)
      // en seco, con pocas el resultado es «seco»; con las suficientes, «ya_esta»; jamás un error ni una lista vacía
      expect(h.estado).toBe(hoy >= FOTOS_PARA_DAR_POR_RESUELTO ? 'ya_esta' : 'seco')
    })
  }
})
