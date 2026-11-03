/**
 * 03-nov · decisión de Emilio («quita esas reglas, para eso están mis observaciones»): la puerta del manual no le quita ni le cambia nada al texto.
 * Los casos son las 25 frases que retiró del manual v2 de un cliente real, y los textos que se perdieron enteros por eso. Salen igual que entraron.
 */
import { describe, expect, it } from 'vitest'
import { recomprobar } from '../firmes'

const LAS_25: Array<[string, string]> = [
  [
    "valores[5]",
    "[propuesta del agente — el delivery está confirmado por el dueño (ficha 7e05c87b) pero el valor de «conveniencia» no está explicitado; se propone como extensión directa del servicio activo y de la objeción «prefiero cocinar en casa si no hay delivery» del ICP S1]"
  ],
  [
    "nunca_hace[6]",
    "[propuesta del agente — riesgo identificado en el ICP S4; se propone como guardrail de posicionamiento]"
  ],
  [
    "direccion_de_fotografia[3]",
    "[propuesta del agente — cada elemento visual responde a un mensaje clave del cliente o cierra la objeción «¿el marisco es realmente fresco?» del ICP S3/S5]"
  ],
  [
    "campos_con_propuesta_del_agente[0]",
    "tono_por_canal"
  ],
  [
    "campos_con_propuesta_del_agente[1]",
    "reglas_de_escritura"
  ],
  [
    "campos_con_propuesta_del_agente[3]",
    "nunca_hace"
  ],
  [
    "campos_con_propuesta_del_agente[4]",
    "historia_y_origen"
  ],
  [
    "campos_con_propuesta_del_agente[5]",
    "direccion_de_fotografia"
  ],
  [
    "campos_con_propuesta_del_agente[6]",
    "uso_del_logo"
  ],
  [
    "campos_con_propuesta_del_agente[7]",
    "jerarquia_tipografica"
  ],
  [
    "icp_summary",
    "«vuelve al menos 1 vez a la semana»"
  ],
  [
    "customer_angle",
    "El primer bucle es el residente local y el trabajador del sector turístico"
  ],
  [
    "mensajes_clave[0]",
    "«¿el marisco es realmente fresco o fue congelado?»"
  ],
  [
    "tono_por_canal[1]",
    "ningún competidor directo identificado usa Reels con gancho audiovisual costero"
  ],
  [
    "tono_por_canal[2]",
    "se propone coherente con la voz general y con las mejores prácticas del rubro]"
  ],
  [
    "tono_por_canal[5]",
    "el primer movimiento es siempre escuchar y agradecer la retroalimentación"
  ],
  [
    "nunca_hace[3]",
    "«Guayaquil sin abrir»"
  ],
  [
    "nunca_hace[4]",
    "Nunca usa superlativos propios sin respaldo verificable"
  ],
  [
    "nunca_hace[4]",
    "no «el mejor encebollado del Ecuador»"
  ],
  [
    "nunca_hace[6]",
    "«el precio puede subir si el negocio se enfoca mucho en turistas»"
  ],
  [
    "nunca_hace[7]",
    "certificaciones o cifras de ventas"
  ],
  [
    "uso_del_logo[2]",
    "detrás del logo para garantizar legibilidad [propuesta del agente"
  ],
  [
    "uso_del_logo[6]",
    "garantizan legibilidad del nombre 'Náufrago']"
  ],
  [
    "jerarquia_tipografica[0]",
    "único disponible"
  ],
  [
    "jerarquia_tipografica[1]",
    "único disponible"
  ]
]
const ENTEROS: string[] = [
  "Marisco fresco hoy — responde a la objeción «¿el marisco es realmente fresco o fue congelado?» con el eje que el cliente ya comunica: «encebollados frescos» y #mariscofresco",
  "Instagram Reels / video corto: abrir los primeros 2 segundos con el vapor del encebollado o el sonido del mar antes de cualquier texto superpuesto — el gancho audiovisual decide si el turista (S2/S3/S5) detiene el scroll; el entorno costero de Náufrago es un activo sonoro y visual que el texto solo no puede reemplazar. [propuesta del agente — el ICP de turistas toma decisiones visuales en 1-2 segundos; ningún competidor directo identificado usa Reels con gancho audiovisual costero, lo que abre un diferenciador inmediato]",
  "Atención de reclamos (cualquier canal): sereno y sin defensividad — el primer movimiento es siempre escuchar y agradecer la retroalimentación; jamás contradecir al cliente en público; resolver en privado si el reclamo escala. [propuesta del agente — no existe protocolo documentado; se propone como mínimo necesario para proteger el rating de 4.9★ y la confianza del segmento local habitual]",
  "Nunca usa superlativos propios sin respaldo verificable — no «el mejor encebollado del Ecuador», no «calidad insuperable»."
]
const pasar = (manual: Record<string, unknown>) => recomprobar(manual, manual, { fuentes: [], dudas: [] })
const sinMeta = (m: Record<string, unknown>) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== '_field_meta'))
const meta = (m: Record<string, unknown>) => m._field_meta as Record<string, { estado: string; provisional: boolean; datos_sin_fuente: Array<{ dato: string; marca: string }> }>

describe('la puerta no recorta el manual', () => {
  it('son las 25 del registro, y 4 textos enteros', () => {
    expect(LAS_25).toHaveLength(25)
    expect(ENTEROS).toHaveLength(4)
  })

  it.each(LAS_25)('🔴 %s · %s: sale igual que entró', (_ruta, frase) => {
    const manual = { texto: frase, lista: ['otro', frase] }
    const r = pasar(manual)
    expect(sinMeta(r.manual)).toEqual(manual)
    expect(r.retirados).toEqual([])
    expect(r.cambios).toEqual([])
  })

  it.each(ENTEROS)('🔴 el texto entero se queda: %s', (texto) => {
    expect(pasar({ mensajes_clave: [texto, 'otro'] }).manual.mensajes_clave).toEqual([texto, 'otro'])
  })

  it('🔴 un manual con todas juntas sale igual, con párrafos y orden', () => {
    const manual = { icp_summary: LAS_25.map(([, f]) => f).join('\n\n'), nunca_hace: LAS_25.map(([, f]) => f), mensajes_clave: ENTEROS }
    expect(sinMeta(pasar(manual).manual)).toEqual(manual)
  })

  it('🔴 no escribe «el cliente dice» aunque la frase venga de lo que publica el cliente', () => {
    const texto = 'Somos el mejor encebollado de la playa'
    const r = recomprobar({}, { positioning: texto }, { fuentes: [{ id: 's', tipo: 'primaria_propia', rotulo: 'sitio', canal: 'sitio', texto }], dudas: [] } as never)
    expect(r.manual.positioning).toBe(texto)
  })

  it('🔴 dos pasadas dan lo mismo', () => {
    const manual = { nunca_hace: LAS_25.map(([, f]) => f) }
    const una = pasar(manual).manual
    expect(sinMeta(pasar(una).manual)).toEqual(manual)
  })
})

describe('lo que queda anotado', () => {
  it('🔴 una palabra de certeza, un lugar o una cita sin fuente no dejan el campo provisional ni se leen como verificado', () => {
    for (const texto of ['Nunca usa superlativos propios sin respaldo verificable', 'único disponible', 'El dueño dice «vuelve al menos 1 vez a la semana»', 'Nuestro atún viene de Manta']) {
      const m = meta(pasar({ campo: texto }).manual).campo
      expect(m.provisional).toBe(false)
      expect(m.estado).not.toBe('verificado')
      expect(m.datos_sin_fuente).toEqual([])
    }
  })

  it('🔴 una cifra sin fuente se sigue anotando, aunque la cláusula traiga además una palabra de certeza', () => {
    const texto = 'Siempre vendemos 200 platos'
    const r = pasar({ campo: texto })
    expect(r.manual.campo).toBe(texto)
    expect(meta(r.manual).campo).toMatchObject({ provisional: true, datos_sin_fuente: [expect.objectContaining({ dato: '200', marca: 'cifra' })] })
  })
})
