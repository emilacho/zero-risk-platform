/** más bordes que las mutaciones dejaron vivos: frases propias, lugares y firmes */
import { describe, expect, it } from 'vitest'
import { camposFirmes, evaluarHechos, frasesPropias, leerRuta, lugaresMencionados, metaDeCampos, respaldoDeOrigen, restituirPendientes } from '..'
import { F } from './apoyo'

describe('bordes · R1', () => {
  const p = (id: string, canal: 'sitio' | 'instagram', rol: 'titulo' | 'meta' | 'biografia' | 'cuerpo', t: string) => F(id, 'primaria_propia', t, canal, rol)
  it('una frase de EXACTAMENTE 4 palabras compartida entre dos canales se halla', () => {
    const r = frasesPropias([p('a', 'instagram', 'biografia', 'Come rico, vive mejor!'), p('b', 'sitio', 'titulo', 'Sitio · Come rico vive mejor')])
    expect(r.eslogan?.literal).toBe('Come rico, vive mejor!')
  })
  it('lo que vive en la DESCRIPCIÓN del sitio (rol meta) también es posición privilegiada', () => {
    const r = frasesPropias([p('a', 'instagram', 'biografia', 'Siempre cerca de ti, siempre'), p('b', 'sitio', 'meta', 'Siempre cerca de ti siempre contigo')])
    expect(r.estado_eslogan).toBe('hallado')
    expect(r.eslogan!.fuentes.some((f) => f.rol === 'meta')).toBe(true)
  })
  it('lo de la alta (datos del trato) y lo que no es propio no cuenta como canal; un texto vacío no rompe nada', () => {
    const a = F('a', 'primaria_propia', 'Trabajamos con pasión y respeto siempre', 'alta', 'dato')
    const b = p('b', 'sitio', 'titulo', 'Trabajamos con pasión y respeto siempre')
    // ni la alta, ni lo humano, ni un texto vacío suman un segundo canal: el título solo se acepta como UNA sola fuente (D2 de CC#3)
    for (const otro of [a, F('h', 'humana', 'Trabajamos con pasión y respeto siempre', 'sitio', 'titulo'), p('v', 'instagram', 'biografia', '   ')]) {
      const r = frasesPropias([otro, b])
      expect(r.eslogan).toMatchObject({ una_sola_fuente: true, fuentes: [{ fuente_id: 'b' }] })
    }
  })
})

describe('bordes · R5', () => {
  it('«¿Playa Azul viene de Cerro Alto?»: la primera palabra de la frase (aunque lleve signos delante) no cuenta como lugar', () => {
    expect(lugaresMencionados('¿Playa Azul viene de Cerro Alto?')).toEqual(['Cerro Alto'])
    expect(lugaresMencionados('«Playa Azul» queda lejos de Cerro Alto')).toEqual(['Cerro Alto'])
  })
  it('con el mismo papel en dos fuentes, se queda con la primera', () => {
    const r = respaldoDeOrigen(['Playa Azul'], [F('a', 'primaria_propia', 'Traemos de Playa Azul a diario.'), F('b', 'primaria_propia', 'Compramos en Playa Azul a diario.')])
    expect(r!.fuente.id).toBe('a')
  })
})

describe('bordes · R6', () => {
  it('leerRuta tolera nulos y primitivos en el camino', () => {
    expect(leerRuta({ a: null }, 'a.b')).toBeUndefined(); expect(leerRuta({ a: 'x' }, 'a.b')).toBeUndefined(); expect(leerRuta({ a: [{ b: 7 }] }, 'a[0].b')).toBe(7)
  })
  it('un campo con una afirmación del cliente entre hechos verificados queda «afirmación del cliente»', () => {
    const fuentes = [F('s', 'primaria_propia', 'Atendemos desde 2012 en el centro. Hola. Somos los mejores del barrio. Ven.')]
    const manual = { positioning: 'Atendemos desde 2012, somos los mejores del barrio' }
    const inf = evaluarHechos({ manual, fuentes })
    expect(inf.hechos.map((h) => h.estado).sort()).toEqual(['afirmacion_del_cliente', 'verificado'])
    expect(metaDeCampos(manual, inf).positioning.estado).toBe('afirmacion_del_cliente')
  })
  it('un campo con meta que no dice ni estado ni provisional sigue «sin revisar»', () => {
    expect(camposFirmes({ a: 'texto', _field_meta: { a: { fuente: 'Discovery' } } })).toEqual({ firmes: [], provisionales: [], sin_revisar: ['a'] })
  })
  it('si el pendiente sigue donde estaba, no se restituye nada; movido a otra parte del mismo campo tampoco se duplica', () => {
    const m = { a: 'Algo. PENDIENTE: dato sin fuente (45)', b: 'otro' }
    expect(restituirPendientes(m, m)).toEqual({ manual: m, restituidos: [] })
    expect(restituirPendientes({ a: ['uno. PENDIENTE: dato sin fuente (45)', 'dos'] }, { a: ['uno', 'dos PENDIENTE: dato sin fuente (45)'] }).restituidos).toEqual([])
  })
})
