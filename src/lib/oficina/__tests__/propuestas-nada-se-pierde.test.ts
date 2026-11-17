/**
 * 17-nov · REAPERTURA «nada se pierde sin aviso» (reel `2ed549cc` · arreglos (b) y (c) de CC6 · RESPUESTAS Lenovo 13:00Z): la mesa escribió 3 propuestas y Emilio vio 2, porque
 * «# Propuesta 1» venía pegado a una frase del agente y el lector de propuestas lo tiró en silencio. Ahora el lector usa el MISMO molde que el traductor del kit (CC3 · #1120)
 * y avisa con nombre lo que no puede presentar. US$ 0. La prueba principal usa el `pieza_texto` REAL del reel (fixture leída de producción).
 */
import { describe, expect, it } from 'vitest'
import { traducirPropuestas } from '../video/propuestas'
import { PROPUESTA } from './sprint2-hoja-de-planos-y-propuestas.test'
import REEL from './reel-2ed549cc.pieza-texto.json'

const leer = (md: string, objetivo = 3) => {
  const r = traducirPropuestas(md, { objetivo, segundosMin: 6, segundosMax: 15 })
  if (!r.ok) throw new Error(r.motivo)
  return r.resultado
}

describe('el lector de propuestas no pierde nada sin aviso', () => {
  it('🔴 el pieza_texto REAL del reel 2ed549cc: las 3 propuestas de la mesa, en orden, y sin el aviso «quedan 2»', () => {
    expect(REEL.pieza_texto.startsWith('Voy a cargar las herramientas de mesa antes de integrar y entregar las tres propuestas completas con sus citas.# Propuesta 1')).toBe(true)
    expect(REEL.avisos_en_produccion).toContain('se pidieron 3 propuestas y quedan 2: se presentan las que hay')
    const r = leer(REEL.pieza_texto)
    expect(r.propuestas.map((p) => [p.id, p.nombre])).toEqual([
      ['P1', 'La puerta que lo cambia todo'],
      ['P2', 'El pergamino llega primero'],
      ['P3', 'De la cocina al barrio'],
    ])
    expect(r.avisos.filter((a) => /quedan/.test(a))).toEqual([])
    // la narración del agente («Voy a cargar…») no es estructura de la pieza: no avisa
    expect(r.avisos.filter((a) => /antes de la primera propuesta/.test(a))).toEqual([])
    // la primera propuesta trae su guion entero (4 planos), no queda vacía
    expect(r.propuestas[0].guion.planos.length).toBeGreaterThan(0)
  })
  it('🔴 un título pegado tras «**» también se corta (mismo molde que el kit)', () => {
    const md = ['Listo, aquí van.**# Propuesta 1 · El vapor**', ...PROPUESTA(1, 'El vapor', 12).split('\n').slice(1), PROPUESTA(2, 'La mesa larga', 15), PROPUESTA(3, 'La puerta', 10)].join('\n')
    expect(leer(md).propuestas).toHaveLength(3)
  })
  it('🔴 lo que hay antes de la primera propuesta con estructura (un plano sin título de propuesta) se AVISA con cuántas líneas; la narración sola no', () => {
    const conPlano = ['## Plano 0 · 0–2 s', 'Se ve: la puerta cerrada', '', PROPUESTA(1, 'El vapor', 12), PROPUESTA(2, 'La mesa larga', 15), PROPUESTA(3, 'La puerta', 10)].join('\n')
    const a = leer(conPlano).avisos.filter((x) => /antes de la primera propuesta/.test(x))
    expect(a).toHaveLength(1)
    expect(a[0]).toMatch(/^texto antes de la primera propuesta: 2 línea\(s\)/)
    const soloNarracion = ['Voy a leer los aportes antes de integrar.', '', PROPUESTA(1, 'El vapor', 12), PROPUESTA(2, 'La mesa larga', 15), PROPUESTA(3, 'La puerta', 10)].join('\n')
    expect(leer(soloNarracion).avisos.filter((x) => /antes de la primera propuesta/.test(x))).toEqual([])
  })
  it('🔴 (z3 de CC6) texto previo SOLO con campos de la pieza y sin «#» (Título:, Imagen:): también se AVISA; la narración sola sigue sin avisar', () => {
    const conCampos = ['Título: La puerta de Olón', 'Imagen: la fachada al atardecer', '', PROPUESTA(1, 'El vapor', 12), PROPUESTA(2, 'La mesa larga', 15), PROPUESTA(3, 'La puerta', 10)].join('\n')
    const a = leer(conCampos).avisos.filter((x) => /antes de la primera propuesta/.test(x))
    expect(a).toHaveLength(1)
    expect(a[0]).toMatch(/^texto antes de la primera propuesta: 2 línea\(s\)/)
    const narracion = ['Voy a cargar las herramientas de mesa antes de integrar.', 'Reviso los aportes y escribo.', '', PROPUESTA(1, 'El vapor', 12), PROPUESTA(2, 'La mesa larga', 15), PROPUESTA(3, 'La puerta', 10)].join('\n')
    expect(leer(narracion).avisos.filter((x) => /antes de la primera propuesta/.test(x))).toEqual([])
  })
  it('🔴 «quedan N» dice CUÁLES y por qué: la descartada por su guion, con su título', () => {
    const md = [PROPUESTA(1, 'El vapor', 12), '# Propuesta 2 · Sin guion', 'Concepto: nada que filmar', PROPUESTA(3, 'La puerta', 10)].join('\n')
    const r = leer(md)
    expect(r.propuestas.map((p) => p.nombre)).toEqual(['El vapor', 'La puerta'])
    const q = r.avisos.find((x) => /quedan/.test(x))
    expect(q).toMatch(/^se pidieron 3 propuestas y quedan 2 \(se descartó «Propuesta 2 · Sin guion» por su guion\): se presentan las que hay$/)
  })
  it('🔴 «quedan N» cuando la mesa escribió menos títulos: lo dice', () => {
    const md = [PROPUESTA(1, 'El vapor', 12), PROPUESTA(2, 'La mesa larga', 15)].join('\n')
    expect(leer(md).avisos.find((x) => /quedan/.test(x))).toBe('se pidieron 3 propuestas y quedan 2 (la mesa escribió 2 título(s) de propuesta): se presentan las que hay')
  })
  it('las 3 bien escritas: 3 propuestas y ningún aviso nuevo (lo de siempre no cambia)', () => {
    const r = leer([PROPUESTA(1, 'El vapor', 12), PROPUESTA(2, 'La mesa larga', 15), PROPUESTA(3, 'La puerta', 10)].join('\n'))
    expect(r.propuestas).toHaveLength(3)
    expect(r.avisos.filter((x) => /quedan|antes de la primera/.test(x))).toEqual([])
  })
})
