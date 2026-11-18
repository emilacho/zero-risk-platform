/**
 * 18-nov · LA DEVOLUCIÓN POR CITAS PIDE SOLO LAS CITAS QUE FALTAN (Emilio 14:00 «corregir sin rehacer ni frenar»; Lenovo 13:08Z opción 1; reparto con CC1 20:58Z).
 * Antes, si a la integración le faltaba una cita, la mesa le devolvía la pieza ENTERA al director y la reescritura perdía el banco y las líneas «Crítica:»
 * (T7d, A31 `0aa14d17`). Ahora el código dice exactamente qué falta, el director escribe solo esas líneas y el código las pega dentro de «## Citas» de su
 * integración. Se anota un `integra` NUEVO con el texto completo (la cadena toma el último `integra` como la pieza: CC1); el viejo queda como registro.
 */
import { describe, expect, it } from 'vitest'
import { faltanCitasDe, pegarCitas, textoDeLoQueFalta, verificarCitas } from '../mesa/libro'
import { estadoDeLaMesa } from '../mesa/orquestador'
import { armarTarea, type ContextoDeTurno } from '../mesa/pedidos'
import type { Aporte, EstadoMesa } from '../mesa/tipos'
import { LAMINAS_OK, jugar, montar, pieza } from './mesa-arnes'

const A = (n: number, de: string, tipo: Aporte['tipo'], texto: string): Aporte => ({ id: `a${n}`, encargo_id: 'e1', n, de, para: null, tipo, texto, responde_a: null, profundidad: 0, costo_usd: 0, workflow_execution_id: null, creado: '2026-11-18T00:00:00Z' } as unknown as Aporte)

const BANCO = '## Banco de ideas\n- C1-I01 · el plato visto desde arriba\n- C2-I01 · la mano del cocinero'
const INTEGRACION = `## Lámina 1 · gancho\nTítulo: Hoy\n${BANCO}\n## Citas\nA2 usé: los titulares del gancho\nA3 usé: ok\nA9 usé: un aporte que no existe\nCrítica: tomé A6, cambié la lámina 1\n## Pie\nEl plato del día.`

describe('el código dice exactamente qué falta', () => {
  const libro = [A(1, 'creative-director-mesa', 'dirige', 'idea'), A(2, 'content-creator', 'aporta', 'x'), A(3, 'carousel-designer', 'aporta', 'y'), A(4, 'marketing_instagram_curator', 'aporta', 'z'), A(5, 'marketing_instagram_curator', 'responde', 'w')]
  const v = verificarCitas(INTEGRACION, libro, ['content-creator', 'carousel-designer', 'marketing_instagram_curator'])
  const f = faltanCitasDe(v, libro)
  it('quién no está citado, con las referencias de sus aportes; las citas sin motivo; las que apuntan a nada', () => {
    expect(f).toEqual({ sin_cita: [{ agente: 'carousel-designer', aportes: ['A3'] }, { agente: 'marketing_instagram_curator', aportes: ['A4', 'A5'] }], sin_motivo: [3], inexistentes: [9] })
  })
  it('el texto para el director nombra a cada uno con sus aportes', () => {
    const t = textoDeLoQueFalta(f)
    expect(t).toContain('**marketing_instagram_curator** no está citado. Sus aportes: A4, A5.')
    expect(t).toContain('Estas citas no dicen por qué: A3.')
    expect(t).toContain('no existen en el tablero: A9. El código las quita')
  })
})

describe('pegarCitas: la pieza no se reescribe', () => {
  const resp = 'Claro, aquí van:\nA3 usé: el ritmo de cinco láminas que propuso\nA4 descarté: el tono no le habla al turista de Olón\n## Lámina 1 · gancho\nTítulo: OTRO TÍTULO'
  const out = pegarCitas(INTEGRACION, resp, [9])
  it('pega las líneas nuevas dentro de «## Citas», reemplaza la vieja de A3 y quita A9', () => {
    const citas = out.slice(out.indexOf('## Citas'), out.indexOf('## Pie'))
    expect(citas).toContain('A2 usé: los titulares del gancho')
    expect(citas).toContain('A3 usé: el ritmo de cinco láminas que propuso')
    expect(citas).not.toContain('A3 usé: ok')
    expect(citas).toContain('A4 descarté: el tono no le habla al turista de Olón')
    expect(citas).not.toContain('A9')
  })
  it('el banco, la línea «Crítica:», las láminas y lo que viene después quedan tal cual', () => {
    expect(out).toContain(BANCO)
    expect(out).toContain('Crítica: tomé A6, cambié la lámina 1')
    expect(out).toContain('Título: Hoy')
    expect(out).not.toContain('OTRO TÍTULO')
    expect(out).not.toContain('Claro, aquí van')
    expect(out.endsWith('## Pie\nEl plato del día.')).toBe(true)
  })
  it('sin sección de citas, la crea al final; sin líneas de cita, la integración no cambia', () => {
    expect(pegarCitas('## Lámina 1\nTítulo: Hoy', 'A2 usé: el titular del día')).toBe('## Lámina 1\nTítulo: Hoy\n\n## Citas\nA2 usé: el titular del día')
    expect(pegarCitas(INTEGRACION, 'no tengo nada que agregar')).toBe(INTEGRACION)
  })
  it('lo pegado pasa la verificación que antes fallaba', () => {
    const libro = [A(2, 'content-creator', 'aporta', 'x'), A(3, 'carousel-designer', 'aporta', 'y'), A(4, 'marketing_instagram_curator', 'aporta', 'z')]
    expect(verificarCitas(out, libro, ['content-creator', 'carousel-designer', 'marketing_instagram_curator']).ok).toBe(true)
  })
})

describe('el turno de devolución', () => {
  const est = { tipo: 'carrusel', directorio_congelado: [], direccion: 'creative-director-mesa', turnos: 0, integraciones: 1, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, turno_abierto: null } as unknown as EstadoMesa
  const c = { cliente_nombre: 'Cliente', tipo: 'carrusel', brief_id: 'BRF-1', brief_texto: 'brief', manual_texto: 'manual', plan_texto: null, fotos: [], tope_usd: 10, gasto_usd: 0 } as unknown as ContextoDeTurno
  const t = armarTarea({ tipo: 'devolver_citas', agente: 'creative-director-mesa', tarjeta: undefined, est, libro: [], c, faltanCitas: '- **carousel-designer** no está citado. Sus aportes: A3.' })
  it('lleva lo que falta y pide SOLO las líneas de cita, sin la pieza', () => {
    expect(t).toContain('- **carousel-designer** no está citado. Sus aportes: A3.')
    expect(t).toContain('**no se reescribe**')
    expect(t).toContain('Escribe SOLO las líneas de cita que faltan')
    expect(t).not.toMatch(/Entrega la pieza completa otra vez/)
    expect(t).not.toContain('## Lámina 1')
  })
})

describe('punta a punta en la mesa (ensayo)', () => {
  it('el planificador manda lo que falta al turno; la respuesta corta se pega; la pieza traducida es la integración original con las citas', async () => {
    const { M, MS, a, id } = await montar()
    const original = pieza(LAMINAS_OK, '## Citas\nA2 usé: los titulares')
    let tareaDev = ''
    const { turnos, ultima } = await jugar(M, id, a, (t) => {
      if (t.tipo === 'integrar') return { texto: original }
      if (t.tipo === 'devolver_citas') {
        tareaDev = t.task
        const faltan = MS.filas.filter((f) => f.tipo === 'aporta' && f.n !== 2).map((f) => `A${f.n} usé: lo que propuso ${f.de} para el carrusel`)
        // el director, además, reescribe la pieza por su cuenta: eso NO entra
        return { texto: `${faltan.join('\n')}\n${pieza([['gancho', 'TÍTULO REESCRITO', 'otro', 'x']] as never, '')}` }
      }
      return undefined
    })
    expect(turnos.filter((t) => t.tipo === 'devolver_citas')).toHaveLength(1)
    const sinCitar = MS.filas.filter((f) => f.tipo === 'aporta' && f.n !== 2).map((f) => f.de)
    for (const ag of sinCitar) expect(tareaDev).toContain(`**${ag}** no está citado`)
    const integras = MS.filas.filter((f) => f.tipo === 'integra')
    expect(integras).toHaveLength(2)
    expect(integras[0].texto).toBe(original)
    expect(integras[1].texto.startsWith(original)).toBe(true)
    expect(integras[1].texto).not.toContain('TÍTULO REESCRITO')
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(estadoDeLaMesa(M.encargos.get(id)!.estado_del_motor)!.pieza_texto).toBe(integras[1].texto)
  })

})
