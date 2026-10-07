/**
 * PASO 7 · traducir lo que contesta el modelo (NÚMEROS de segmento) a fichas con el texto COPIADO del original.
 * Lo esencial: el texto de una ficha sale SOLO de los segmentos (0 caracteres inventados), las firmas son las de esos segmentos,
 * y TODO segmento queda en una ficha, un descarte con motivo o una ficha «sin clasificar» (nada se pierde).
 */
import { describe, expect, it } from 'vitest'
import { cortarEnSegmentos, firmaDe } from '../segmentos'
import { type ContextoDeTraduccion, traducir } from '../traducir'
import type { FichaViva } from '../tipos'

const MATERIAL = ['Cadena Taurus 9v', 'Precio: 40 USD', 'Garantía: 12 meses', 'Pedal Kora', 'Precio: 25 USD', 'Menú de navegación: inicio | contacto'].join('\n\n')
const SEGS = cortarEnSegmentos(MATERIAL)
let contador = 0
const ctx = (extra: Partial<ContextoDeTraduccion> = {}): ContextoDeTraduccion => ({
  cliente: 'c1', ingresoId: 'ing-1', origen: 'su_fuente', fechaFuente: '2026-10-01T00:00:00.000Z', ahora: new Date('2026-10-07T12:00:00.000Z'), prueba: false,
  paraModelo: SEGS, afectadas: [], nuevoId: () => `id-${++contador}`, ...extra,
})
const ok = (j: unknown, c = ctx()) => {
  const r = traducir([{ texto: JSON.stringify(j) }], c)
  if (!r.ok) throw new Error(`no ok: ${r.caida}`)
  return r
}
const ficha = (segmentos: number[], extra: Record<string, unknown> = {}) => ({ clase: 'producto', titulo: 'T', que_es: 'E', segmentos, producto: ['Cadena'], sede: null, propiedad: 'propia', porque: 'es suyo', reemplaza: null, plazo: 'precio_oferta_horario', ...extra })
const TODAS = [ficha([1, 2, 3]), ficha([4, 5], { titulo: 'Pedal' })]

describe('el texto sale SOLO de los segmentos', () => {
  it('contenido = los segmentos pedidos, tal cual, en su orden; firmas = las de esos segmentos (no números)', () => {
    const r = ok({ fichas: TODAS, descartes: [{ segmentos: [6], motivo: 'menú de navegación' }] })
    const f = r.fichas.find((x) => x.titulo === 'T')!
    expect(f.contenido).toBe('Cadena Taurus 9v\n\nPrecio: 40 USD\n\nGarantía: 12 meses')
    expect(f.firmas).toEqual(['Cadena Taurus 9v', 'Precio: 40 USD', 'Garantía: 12 meses'].map(firmaDe))
    for (const x of r.fichas) for (const parte of (x.contenido ?? '').split('\n\n')) expect(MATERIAL).toContain(parte)
  })
  it('lo que el modelo escriba como `contenido` o `texto` se IGNORA (no puede inventar caracteres)', () => {
    const r = ok({ fichas: [{ ...ficha([1, 2, 3]), contenido: 'INVENTADO por el modelo', texto: 'INVENTADO también' }, ficha([4, 5])], descartes: [{ segmentos: [6], motivo: 'm' }] })
    for (const f of r.fichas) { expect(f.contenido).not.toMatch(/INVENTADO/); expect(JSON.stringify(f)).not.toMatch(/INVENTADO/) }
  })
  it('segmentos desordenados o repetidos en la misma ficha se copian en el orden del original, una vez', () => {
    const r = ok({ fichas: [ficha([3, 1, 1, 2]), ficha([4, 5])], descartes: [{ segmentos: [6], motivo: 'm' }] })
    expect(r.fichas[0].contenido).toBe('Cadena Taurus 9v\n\nPrecio: 40 USD\n\nGarantía: 12 meses')
  })
  it('un número que no existe se descarta y se anota; una ficha sin ningún número válido desaparece (anotado)', () => {
    const r = ok({ fichas: [ficha([1, 2, 3, 99]), ficha([77, 88])], descartes: [] })
    expect(r.notas.join(' ')).toMatch(/99/)
    expect(r.notas.join(' ')).toMatch(/sin segmentos/)
    expect(r.fichas.filter((f) => !f.residual)).toHaveLength(1)
  })
  it('un número no entero o texto («2», 2.5, null) no cuenta', () => {
    const r = ok({ fichas: [ficha(['2' as unknown as number, 2.5, null as unknown as number, 1])], descartes: [] })
    expect(r.fichas.find((f) => !f.residual)!.firmas).toEqual([firmaDe('Cadena Taurus 9v')])
  })
  it('un segmento pedido por DOS fichas queda con la primera (nunca duplicado) y se anota', () => {
    const r = ok({ fichas: [ficha([1, 2]), ficha([2, 3])], descartes: [] })
    const usados = r.fichas.flatMap((f) => f.firmas)
    expect(new Set(usados).size).toBe(usados.length)
    expect(r.notas.join(' ')).toMatch(/dos fichas|repetido/)
  })
})

describe('nada se pierde: cada segmento acaba en una ficha, un descarte o «sin clasificar»', () => {
  const firmasDelModelo = (r: ReturnType<typeof ok>) => r.fichas.flatMap((f) => f.firmas).sort()
  const todas = SEGS.map((s) => s.firma).sort()
  it('si el modelo cubre todo, no hay residuales', () => {
    const r = ok({ fichas: TODAS, descartes: [{ segmentos: [6], motivo: 'menú' }] })
    expect(firmasDelModelo(r)).toEqual(todas)
    expect(r.fichas.filter((f) => f.residual)).toEqual([])
    expect(r.segmentosResiduales).toBe(0)
  })
  it('lo que el modelo olvida se archiva TAL CUAL como ficha residual del sistema (propiedad incierta), una por tramo seguido', () => {
    const r = ok({ fichas: [ficha([1]), ficha([5])], descartes: [] })
    const res = r.fichas.filter((f) => f.residual)
    expect(res.map((f) => f.contenido)).toEqual(['Precio: 40 USD\n\nGarantía: 12 meses\n\nPedal Kora', 'Menú de navegación: inicio | contacto'])
    for (const f of res) expect(f).toMatchObject({ juzgado_por: 'sistema', propiedad: 'incierta', descartada: false, plazo: 'sin_plazo', clase: 'sin_clasificar' })
    expect(firmasDelModelo(r)).toEqual(todas)
    expect(r.segmentosResiduales).toBe(4)
  })
  it('un descarte SIN motivo no descarta: esos segmentos quedan como residuales (jamás se descarta callando)', () => {
    const r = ok({ fichas: [ficha([1, 2, 3]), ficha([4, 5])], descartes: [{ segmentos: [6] }, { segmentos: [6], motivo: '   ' }] })
    expect(r.fichas.filter((f) => f.descartada)).toEqual([])
    expect(r.fichas.filter((f) => f.residual).map((f) => f.contenido)).toEqual(['Menú de navegación: inicio | contacto'])
  })
  it('un descarte con motivo es una fila descartada con el texto, el motivo y juzgado_por «modelo»', () => {
    const r = ok({ fichas: TODAS, descartes: [{ segmentos: [6], motivo: 'menú de navegación' }] })
    const d = r.fichas.find((f) => f.descartada)!
    expect(d).toMatchObject({ contenido: 'Menú de navegación: inicio | contacto', motivo_descarte: 'menú de navegación', juzgado_por: 'modelo', residual: false, firmas: [firmaDe('Menú de navegación: inicio | contacto')] })
  })
  it('PROPIEDAD: con cualquier respuesta rara del modelo, la unión de firmas de todas las filas = las de todos los segmentos', () => {
    const rarezas: unknown[] = [
      { fichas: [], descartes: [] }, { fichas: [ficha([])], descartes: [{ segmentos: [], motivo: 'x' }] }, { fichas: [ficha([1, 2, 3, 4, 5, 6])], descartes: [{ segmentos: [1], motivo: 'x' }] },
      { fichas: [ficha([2]), ficha([2]), ficha([2])], descartes: [{ segmentos: [2, 3, 4], motivo: 'x' }] }, { fichas: [{ segmentos: [1, 2] }], descartes: [{ motivo: 'x' }] },
    ]
    for (const j of rarezas) expect(firmasDelModelo(ok(j))).toEqual(todas)
  })
})

describe('los campos de la ficha se limpian con la lista cerrada y topes', () => {
  it('un plazo fuera de la lista cerrada → sin_plazo y se anota; los de la lista (incluidos archivo_propio y sin_plazo) pasan', () => {
    const r = ok({ fichas: [ficha([1], { plazo: 'para_siempre' }), ficha([2], { plazo: 'archivo_propio' }), ficha([3], { plazo: 'plan' })], descartes: [] })
    expect(r.fichas.map((f) => f.plazo).slice(0, 3)).toEqual(['sin_plazo', 'archivo_propio', 'plan'])
    expect(r.notas.join(' ')).toMatch(/para_siempre/)
  })
  it('«vigente_hasta»: se acepta una fecha del material; una inválida o a más de 400 días se ignora (anotado); una pasada vale', () => {
    const r = ok({ fichas: [ficha([1], { vigente_hasta: '2026-11-15' }), ficha([2], { vigente_hasta: 'pronto' }), ficha([3], { vigente_hasta: '2030-01-01' }), ficha([4], { vigente_hasta: '2026-09-01' })], descartes: [] })
    const por = (n: number) => r.fichas.find((f) => f.firmas.includes(SEGS[n - 1].firma))!
    expect(por(1).vigente_hasta).toBe('2026-11-15T00:00:00.000Z')
    expect(por(2).vigente_hasta).toBeNull()
    expect(por(3).vigente_hasta).toBeNull()
    expect(por(4).vigente_hasta).toBe('2026-09-01T00:00:00.000Z')
  })
  it('propiedad fuera de propia/ajena/incierta → incierta; «ajena» se ARCHIVA marcada (no se descarta)', () => {
    const r = ok({ fichas: [ficha([1], { propiedad: 'quizá' }), ficha([2], { propiedad: 'ajena', porque: 'otra ciudad' })], descartes: [] })
    const [a, b] = r.fichas
    expect(a.propiedad).toBe('incierta')
    expect(b).toMatchObject({ propiedad: 'ajena', porque: 'otra ciudad', descartada: false })
  })
  it('clase, título, que_es, producto y sede salen acotados; sin título se usa la clase', () => {
    const r = ok({ fichas: [ficha([1], { clase: 'c'.repeat(100), titulo: 't'.repeat(500), que_es: 'q'.repeat(900), producto: Array.from({ length: 40 }, (_, i) => `p${i}`), sede: 's'.repeat(400) }), ficha([2], { titulo: '' })], descartes: [] })
    const [a, b] = r.fichas
    expect(a.clase.length).toBeLessThanOrEqual(40); expect(a.titulo.length).toBeLessThanOrEqual(200); expect(a.que_es.length).toBeLessThanOrEqual(400)
    expect(a.producto.length).toBeLessThanOrEqual(20); expect((a.sede ?? '').length).toBeLessThanOrEqual(200)
    expect(b.titulo).toBe('producto')
  })
  it('cada fila lleva cliente, ingreso, origen, fecha de la fuente, huella, etiqueta de procedencia y la marca de prueba del contexto', () => {
    const r = ok({ fichas: TODAS, descartes: [{ segmentos: [6], motivo: 'm' }] }, ctx({ prueba: true, cliente: 'prueba-portero', origen: 'tercero' }))
    for (const f of r.fichas) {
      expect(f).toMatchObject({ client_id: 'prueba-portero', ingreso_id: 'ing-1', origen: 'tercero', fecha_fuente: '2026-10-01T00:00:00.000Z', prueba: true, reconfirmado_en: '2026-10-07T12:00:00.000Z' })
      expect(f.huella).toMatch(/^[0-9a-f]{24}$/)
      expect(f.provenance_tag).toMatchObject({ trust_level: 'untrusted', ingress_route: 'cerebro/portero/recibir' })
    }
    expect(new Set(r.fichas.map((f) => f.id)).size).toBe(r.fichas.length)
  })
})

describe('«reemplaza» y lo retirado por reemplazo', () => {
  const afectadas: FichaViva[] = [{ id: 'vieja-1', ref: 'ficha:vieja-1', titulo: 'Cadena', que_es: 'cadena', firmas: ['a', 'b', 'c'] }, { id: 'vieja-2', ref: 'ficha:vieja-2', titulo: 'Pedal', que_es: 'pedal', firmas: ['d', 'e'] }]
  it('la ficha nueva que cita [F1] es la versión de la vieja (version_de) y hereda su `ref`; la vieja NO se retira', () => {
    const r = ok({ fichas: [ficha([1, 2, 3], { reemplaza: 1 }), ficha([4, 5], { reemplaza: 2 })], descartes: [{ segmentos: [6], motivo: 'm' }] }, ctx({ afectadas }))
    expect(r.fichas[0]).toMatchObject({ version_de: 'vieja-1', ref: 'ficha:vieja-1' })
    expect(r.fichas[1]).toMatchObject({ version_de: 'vieja-2', ref: 'ficha:vieja-2' })
    expect(r.retiradas).toEqual([])
  })
  it('una afectada que NINGUNA ficha cita queda retirada con su motivo (no queda vigente a medias)', () => {
    const r = ok({ fichas: [ficha([1, 2, 3], { reemplaza: 1 }), ficha([4, 5])], descartes: [{ segmentos: [6], motivo: 'm' }] }, ctx({ afectadas }))
    expect(r.retiradas).toEqual([{ id: 'vieja-2', motivo: 'sus segmentos cambiaron y nada los reemplazó' }])
  })
  it('un `reemplaza` inventado (F9, 0, «x») se ignora y se anota; dos fichas que citan la misma: gana la primera', () => {
    const r = ok({ fichas: [ficha([1], { reemplaza: 9 }), ficha([2], { reemplaza: 'x' }), ficha([3], { reemplaza: 1 }), ficha([4], { reemplaza: 1 })], descartes: [] }, ctx({ afectadas }))
    const vs = r.fichas.filter((f) => !f.residual).map((f) => f.version_de)
    expect(vs).toEqual([null, null, 'vieja-1', null])
    expect(r.notas.join(' ')).toMatch(/reemplaza/)
  })
  it('las residuales y los descartes nunca reemplazan', () => {
    const r = ok({ fichas: [], descartes: [] }, ctx({ afectadas }))
    expect(r.fichas.every((f) => f.version_de === null)).toBe(true)
    expect(r.retiradas.map((x) => x.id).sort()).toEqual(['vieja-1', 'vieja-2'])
  })
})

describe('respuestas inservibles', () => {
  it('JSON roto, salida cortada y respuesta sin «fichas» devuelven una caída con nombre (no se archiva nada)', () => {
    expect(traducir([{ texto: 'esto no es json' }], ctx())).toMatchObject({ ok: false, caida: 'json_roto' })
    expect(traducir([{ texto: '{"fichas":[{"clase":"x"', cortada: true }], ctx())).toMatchObject({ ok: false, caida: 'salida_cortada' })
    expect(traducir([{ texto: '{"hola":1}' }], ctx())).toMatchObject({ ok: false, caida: 'campos_que_faltan' })
    expect(traducir([{ texto: '{"fichas":"no es lista"}' }], ctx())).toMatchObject({ ok: false, caida: 'campos_que_faltan' })
  })
  it('texto antes y después del JSON se tolera', () => {
    const r = traducir([{ texto: `Claro:\n${JSON.stringify({ fichas: TODAS, descartes: [{ segmentos: [6], motivo: 'm' }] })}\nlisto` }], ctx())
    expect(r.ok).toBe(true)
  })
  it('varias pasadas: se juntan las fichas; si UNA pasada es inservible, todo cae', () => {
    const a = JSON.stringify({ fichas: [ficha([1, 2, 3])], descartes: [] })
    const b = JSON.stringify({ fichas: [ficha([4, 5])], descartes: [{ segmentos: [6], motivo: 'm' }] })
    const r = traducir([{ texto: a }, { texto: b }], ctx())
    expect(r.ok && r.fichas.filter((f) => !f.residual && !f.descartada)).toHaveLength(2)
    expect(traducir([{ texto: a }, { texto: 'roto' }], ctx())).toMatchObject({ ok: false })
  })
})
