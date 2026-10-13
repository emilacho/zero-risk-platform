/** r81 · las 4 pruebas que pidió CC#3 en la certificación de la r80 (mutaciones vivas del kit de historias). Lógica pura, US$ 0. */
import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { createRequire } from 'node:module'
import { elementosDelKit } from '../brief'

const K = createRequire(import.meta.url)(path.join(process.cwd(), 'scripts/worker-staging/cadena/kit-de-historias.js')) as {
  agruparKit: (p: unknown, f: unknown) => { parte: { entregables: Array<Record<string, any>> }; kit: null | { elementos: string[]; fila_ids: string[]; absorbidos: Array<string | null> } }
}
const f = (id: string, fecha: string, hora: string | null, red: string, formato: string, tema: string, familia: string | null = 'kit_historias') => ({ id, fecha, hora, red, formato, pilar: 'servicio', tema, datos: [], familia })

describe('kit de historias · pruebas pedidas por CC#3 (r80)', () => {
  it('lote DESORDENADO: el kit sale ordenado por fecha y hora, y a igual momento por id', () => {
    const lote = [f('z', '2026-10-22', '09:00', 'instagram', 'historia', 'cuarta'), f('b', '2026-10-20', '18:00', 'instagram', 'historia', 'segunda'), f('a', '2026-10-20', '18:00', 'instagram', 'historia', 'primera'), f('c', '2026-10-20', null, 'instagram', 'historia', 'sin hora'), f('y', '2026-10-21', '07:30', 'instagram', 'historia', 'tercera')]
    const kit = K.agruparKit({ entregables: [] }, lote).kit!
    expect(kit.fila_ids).toEqual(['c', 'a', 'b', 'y', 'z'])
    expect(kit.elementos.map((l) => l.split('|')[2].trim())).toEqual(['sin hora', 'primera', 'segunda', 'tercera', 'cuarta'])
  })
  it('WhatsApp SIN el formato «estado»: por la red es un estado (sea cual sea el formato o la mayúscula)', () => {
    const lote = [f('a', '2026-10-20', '10:00', 'whatsapp', 'historia', 'a'), f('b', '2026-10-21', '10:00', 'WhatsApp', 'story', 'b'), f('c', '2026-10-22', '10:00', 'instagram', 'estado', 'c'), f('d', '2026-10-23', '10:00', 'facebook', 'historia', 'd')]
    const destinos = K.agruparKit({ entregables: [] }, lote).kit!.elementos.map((l) => l.split('|')[1].trim())
    expect(destinos).toEqual(['estado', 'estado', 'estado', 'historia'])
  })
  it('hora 24:00 (o 23:60): pasa TAL CUAL al kit y la sala 3 la rechaza; 23:59 y 00:00 sí valen', () => {
    const mala = K.agruparKit({ entregables: [] }, [f('a', '2026-10-20', '24:00', 'instagram', 'historia', 'x'), f('b', '2026-10-20', '23:60', 'instagram', 'historia', 'y')]).kit!.elementos
    expect(mala.some((l) => l.startsWith('2026-10-20 24:00 |'))).toBe(true); expect(mala.some((l) => l.startsWith('2026-10-20 23:60 |'))).toBe(true)
    expect(elementosDelKit({ elementos: mala }).ilegibles).toHaveLength(2)
    const buena = K.agruparKit({ entregables: [] }, [f('a', '2026-10-20', '23:59', 'instagram', 'historia', 'x'), f('b', '2026-10-21', '00:00', 'instagram', 'historia', 'y')]).kit!.elementos
    expect(elementosDelKit({ elementos: buena }).ilegibles).toEqual([])
  })
  it('`fila_ids`: se absorbe solo si TODAS son del kit; si mezcla una fila de foto, queda suelto (borde declarado)', () => {
    const lote = [f('h1', '2026-10-20', '10:00', 'instagram', 'historia', 'a'), f('h2', '2026-10-21', '10:00', 'instagram', 'historia', 'b'), f('foto', '2026-10-22', '10:00', 'instagram', 'foto', 'c', 'post_img')]
    const todas = K.agruparKit({ entregables: [{ id: 'BRF-0001', fila_id: null, fila_ids: ['h1', 'h2'] }] }, lote)
    expect(todas.kit!.absorbidos).toEqual(['BRF-0001'])
    const mezcla = K.agruparKit({ entregables: [{ id: 'BRF-0001', fila_id: null, fila_ids: ['h1', 'foto'] }, { id: 'BRF-0002', fila_id: 'foto' }] }, lote)
    expect(mezcla.kit!.absorbidos).toEqual([]) // la mezcla no se absorbe
    expect(mezcla.parte.entregables.map((e) => e.id)).toEqual(['BRF-0001', 'BRF-0002', 'BRF-0003']) // queda suelta y el kit va al final
    expect(K.agruparKit({ entregables: [{ id: 'BRF-0001', fila_id: null, fila_ids: [] }] }, lote).kit!.absorbidos).toEqual([]) // lista vacía: nada que absorber
  })
})
