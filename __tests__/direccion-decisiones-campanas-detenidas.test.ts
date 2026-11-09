// 09-nov · C (GO Lenovo, firma de Emilio · CC#2): la campaña en `necesita_humano` aparece en Decisiones con su motivo, su espera y qué se puede hacer.
// El caso real: Náufrago 28de888e estuvo del 06-nov al 09-nov detenida y Decisiones decía «nada pendiente».
import { describe, expect, it } from 'vitest'
import { leerCampanasDetenidas, TITULO_CAMPANA_DETENIDA } from '@/lib/direccion/decisiones-campanas'
import type { Fuente } from '@/lib/direccion/comun'

type Filtro = [string, string, unknown]
/** base falsa que APLICA los filtros que se le piden (eq · is · in) y deja ver cuáles fueron, para que la prueba no pase con una consulta que no filtra */
function baseFalsa(tablas: Record<string, Record<string, unknown>[]>, error: Record<string, { message: string; code?: string }> = {}) {
  const pedidos: Record<string, Filtro[]> = {}
  return {
    pedidos,
    from(tabla: string) {
      const filtros: Filtro[] = []
      pedidos[tabla] = filtros
      const q = {
        select: () => q,
        eq: (c: string, v: unknown) => (filtros.push(['eq', c, v]), q),
        is: (c: string, v: unknown) => (filtros.push(['is', c, v]), q),
        in: (c: string, v: unknown) => (filtros.push(['in', c, v]), q),
        limit: () => q,
        then: (ok: (r: unknown) => unknown) => {
          if (error[tabla]) return Promise.resolve({ data: null, error: error[tabla] }).then(ok)
          const filas = (tablas[tabla] ?? []).filter((f) => filtros.every(([op, c, v]) => (op === 'eq' ? f[c] === v : op === 'is' ? (f[c] ?? null) === v : (v as unknown[]).includes(f[c]))))
          return Promise.resolve({ data: filas, error: null }).then(ok)
        },
      }
      return q
    },
  }
}

const CAMP = { id: '28de888e', client_id: 'naufrago', estado: 'necesita_humano', estado_motivo: 'la estrategia sigue con 3 bloqueo(s) tras la única corrección: el hito de revisión cae en el día 15…', actualizada_en: '2026-11-06T11:23:13Z', seco: false, archivada_en: null }
const ESPERA = { campana_id: '28de888e', objeto_tipo: 'necesita_humano', estado: 'viva', seco: false, vence_en: '2026-11-13T11:23:08Z', accion_al_vencer: 'pausada', desde: '2026-11-06T11:23:08Z' }

describe('C · Decisiones lee las campañas detenidas', () => {
  it('🔴 la campaña de Náufrago aparece con su motivo, su espera y lo que pasa al vencer', async () => {
    const db = baseFalsa({ cadena_campanas: [CAMP], cadena_esperas: [ESPERA] })
    const fuentes: Fuente[] = []
    const r = await leerCampanasDetenidas(db, fuentes)
    expect(r).toHaveLength(1)
    expect(r[0].campana).toEqual({ id: '28de888e', estado: 'necesita_humano', motivo: CAMP.estado_motivo, espera: { vence_en: '2026-11-13T11:23:08Z', al_vencer: 'pausada', al_vencer_texto: 'si nadie la destraba antes, la campaña queda en pausa sola' } })
    expect(r[0].fila.desde).toBe('2026-11-06T11:23:08Z')
  })
  it('🔴 solo lo real y vivo: un ensayo, una archivada, otra en pausa o una espera ya resuelta no entran', async () => {
    const db = baseFalsa({
      cadena_campanas: [CAMP, { ...CAMP, id: 'ensayo', seco: true }, { ...CAMP, id: 'archivada', archivada_en: '2026-11-03T00:00:00Z' }, { ...CAMP, id: 'pausada', estado: 'pausada' }],
      cadena_esperas: [{ ...ESPERA, estado: 'resuelta', vence_en: '2026-11-07T00:00:00Z' }, ESPERA],
    })
    const r = await leerCampanasDetenidas(db, [])
    expect(r.map((x) => x.campana.id)).toEqual(['28de888e'])
    expect(r[0].campana.espera?.vence_en).toBe('2026-11-13T11:23:08Z')
    expect(db.pedidos.cadena_campanas).toEqual([['eq', 'estado', 'necesita_humano'], ['eq', 'seco', false], ['is', 'archivada_en', null]])
  })
  it('sin espera viva la tarjeta sale igual, sin vencimiento (mejor un aviso de más que uno escondido)', async () => {
    const r = await leerCampanasDetenidas(baseFalsa({ cadena_campanas: [CAMP], cadena_esperas: [] }), [])
    expect(r[0].campana.espera).toBeNull()
  })
  it('🔴 si la tabla no se lee, lo dice en las fuentes (y la lista no se declara completa)', async () => {
    const fuentes: Fuente[] = []
    const r = await leerCampanasDetenidas(baseFalsa({}, { cadena_campanas: { message: 'caída' } }), fuentes)
    expect(r).toEqual([])
    expect(fuentes).toEqual([expect.objectContaining({ fuente: 'cadena_campanas', estado: 'error' })])
  })
  it('el título al dueño es claro y no lleva el motivo interno (hitos, días)', () => {
    expect(TITULO_CAMPANA_DETENIDA).not.toMatch(/hito|día|S04|necesita_humano/)
  })
})
