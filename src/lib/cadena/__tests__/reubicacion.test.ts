/**
 * 10-nov · LAS FILAS QUE QUEDARON ATRÁS SIN PRODUCIR (GO de Lenovo 18:14Z · camino A 18:24Z) · el núcleo puro: detectar (código), leer la propuesta del agente (formato)
 * y verificarla (código). DOS clientes de práctica de rubros distintos en cada criterio:
 *   · A · cafetería de barrio · abre de jueves a lunes 07:00–15:00 (cierra martes y miércoles);
 *   · B · clínica veterinaria · abre de lunes a sábado 08:00–18:00 (cierra domingo).
 * Sabotaje del GO: una fila futura sana NUNCA se toca. Nada aquí nombra a un cliente real.
 */
import { describe, expect, it } from 'vitest'
import { clienteA, clienteB, type ClienteFixture } from '../__fixtures__/clientes'
import { diaSemanaIso, sumarDias } from '../fechas'
import { filasPasadas, huellaDeReubicacion, leerDecisiones, marcoDeReubicacion, verificarDecisiones, type ContextoDeReubicacion } from '../reubicacion'
import type { Fila, FormatosPorRed } from '../tipos'

interface Caso { nombre: string; c: ClienteFixture; hoy: string; cerrado: string; abierto: string; formato: string; red: string; hora: string }
const CASOS: Caso[] = [
  // A: hoy jueves 12-nov; el martes 17-nov está cerrado; el jueves 19-nov abre
  { nombre: 'A · cafetería', c: clienteA(), hoy: '2026-11-12', cerrado: '2026-11-17', abierto: '2026-11-19', formato: 'reel', red: 'instagram', hora: '09:00' },
  // B: hoy martes 17-nov; el domingo 22-nov está cerrado; el lunes 23-nov abre
  { nombre: 'B · clínica veterinaria', c: clienteB(), hoy: '2026-11-17', cerrado: '2026-11-22', abierto: '2026-11-23', formato: 'carrusel', red: 'facebook', hora: '10:00' },
]
const FORMATOS = (k: Caso): FormatosPorRed => ({ [k.red]: [{ formato: k.formato, produccion: 'opera', lead_dias: 3, max_por_dia: 1 }] })

function fila(k: Caso, id: string, fecha: string, extra: Partial<Fila> = {}): Fila {
  return { id, tanda: 1, semana: 1, dia_semana: diaSemanaIso(fecha), fecha, hora: k.hora, red: k.red, formato: k.formato, pilar: 'p', tema: 't', sede: k.c.sedes[0].clave, requiere_abierto: true, depende_de: [], datos: [], pendientes: [], pieza_fija: null, origen: 'agente', estado: 'validada', avisos: [], ...extra }
}
function ctx(k: Caso, filas: Fila[]): ContextoDeReubicacion {
  return { hoy: k.hoy, campana: { fecha_inicio: k.c.campana.fecha_inicio, fecha_fin: k.c.campana.fecha_fin }, filas, formatos: FORMATOS(k), sedes: k.c.sedes }
}

describe.each(CASOS)('$nombre', (k) => {
  const ayer = sumarDias(k.hoy, -1)
  const antier = sumarDias(k.hoy, -2)
  describe('detectar (código)', () => {
    it('🔴 sabotaje del GO · solo las filas sin producir con fecha ANTERIOR a hoy; una fila de hoy o futura sana nunca entra', () => {
      const filas = [fila(k, 'pasada', ayer), fila(k, 'lista', antier, { estado: 'lista_para_brief' }), fila(k, 'hoy', k.hoy), fila(k, 'futura', k.abierto), fila(k, 'producida', ayer, { estado: 'en_oficina' }), fila(k, 'cancelada', ayer, { estado: 'cancelada' })]
      expect(filasPasadas(filas, k.hoy).map((f) => f.id).sort()).toEqual(['lista', 'pasada'])
    })
    it('la huella depende de las filas (no del orden) y cambia si cambia el conjunto', () => {
      expect(huellaDeReubicacion('c', 1, ['a', 'b'])).toBe(huellaDeReubicacion('c', 1, ['b', 'a']))
      expect(huellaDeReubicacion('c', 1, ['a', 'b'])).not.toBe(huellaDeReubicacion('c', 1, ['a']))
      expect(huellaDeReubicacion('c', 1, ['a'])).not.toBe(huellaDeReubicacion('c', 2, ['a']))
    })
  })

  describe('leer la propuesta (formato, no juicio)', () => {
    it('lee las tres formas; ignora lo que no es una decisión y la segunda decisión de una misma fila', () => {
      const d = leerDecisiones([
        'Mi análisis:', `- pasada · reubicar · ${k.abierto} · es la pieza de apertura · conviene el primer día abierto`,
        '- lista · fusionar · futura · cuentan lo mismo', '* otra · descartar · ya no tiene sentido', '- pasada · descartar · repetida', '- rota · reubicar', 'texto suelto · descartar · x',
      ].join('\n'))
      expect(d).toEqual([
        { fila_id: 'pasada', accion: 'reubicar', fecha: k.abierto, razon: 'es la pieza de apertura · conviene el primer día abierto' },
        { fila_id: 'lista', accion: 'fusionar', destino: 'futura', razon: 'cuentan lo mismo' },
        { fila_id: 'otra', accion: 'descartar', razon: 'ya no tiene sentido' },
      ])
    })
  })

  describe('verificar (código)', () => {
    const base = () => [fila(k, 'pasada', ayer), fila(k, 'futura', sumarDias(k.abierto, 7))]
    it('🔴 reubicar a un día válido: cambia la fecha, recalcula semana y día, y deja la razón escrita', () => {
      const filas = base()
      const { cambios } = verificarDecisiones(filasPasadas(filas, k.hoy), [{ fila_id: 'pasada', accion: 'reubicar', fecha: k.abierto, razon: 'apertura' }], ctx(k, filas))
      expect(cambios).toHaveLength(1)
      expect(cambios[0]).toMatchObject({ tipo: 'reubicar', fecha: k.abierto, dia_semana: diaSemanaIso(k.abierto) })
      expect(cambios[0].aviso).toBe(`reubicación: reubicada del ${ayer} al ${k.abierto} · apertura`)
      expect((cambios[0] as { semana: number }).semana).toBeGreaterThan(0)
    })
    it('🔴 una fecha en día CERRADO de la sede se rechaza (la pieza exige local abierto) y la fila se descarta con la razón del código', () => {
      const filas = base()
      const { cambios } = verificarDecisiones(filasPasadas(filas, k.hoy), [{ fila_id: 'pasada', accion: 'reubicar', fecha: k.cerrado, razon: 'x' }], ctx(k, filas))
      expect(cambios[0]).toMatchObject({ tipo: 'descartar' })
      expect((cambios[0] as { rechazo: string }).rechazo).toMatch(/cerrada ese día/)
    })
    it('🔴 sin local exigido, el día cerrado sí vale', () => {
      const filas = [fila(k, 'pasada', ayer, { requiere_abierto: false })]
      expect(verificarDecisiones(filasPasadas(filas, k.hoy), [{ fila_id: 'pasada', accion: 'reubicar', fecha: k.cerrado, razon: 'x' }], ctx(k, filas)).cambios[0].tipo).toBe('reubicar')
    })
    it('🔴 una fecha antes de hoy + plazo, una fecha fuera de la campaña y una fecha mal escrita se rechazan', () => {
      const filas = base()
      for (const [fecha, re] of [[sumarDias(k.hoy, 2), /plazo de producción/], [sumarDias(k.c.campana.fecha_fin, 1), /fuera de la campaña/], [sumarDias(k.c.campana.fecha_inicio, -7), /fuera de la campaña/], ['el lunes', /no es una fecha/]] as const) {
        const { cambios } = verificarDecisiones(filasPasadas(filas, k.hoy), [{ fila_id: 'pasada', accion: 'reubicar', fecha, razon: 'x' }], ctx(k, filas))
        expect(cambios[0].tipo, fecha).toBe('descartar')
        expect((cambios[0] as { rechazo: string }).rechazo).toMatch(re)
      }
    })
    it('🔴 el máximo por día: un día que ya tiene su pieza de ese formato no recibe otra (tampoco dos reubicadas al mismo día)', () => {
      const ocupado = [fila(k, 'pasada', ayer), fila(k, 'futura', k.abierto)]
      expect(verificarDecisiones(filasPasadas(ocupado, k.hoy), [{ fila_id: 'pasada', accion: 'reubicar', fecha: k.abierto, razon: 'x' }], ctx(k, ocupado)).cambios[0].tipo).toBe('descartar')
      const dos = [fila(k, 'p1', ayer), fila(k, 'p2', antier)]
      const { cambios } = verificarDecisiones(filasPasadas(dos, k.hoy), [{ fila_id: 'p1', accion: 'reubicar', fecha: k.abierto, razon: 'x' }, { fila_id: 'p2', accion: 'reubicar', fecha: k.abierto, razon: 'y' }], ctx(k, dos))
      expect(cambios.map((c) => c.tipo).sort()).toEqual(['descartar', 'reubicar'])
    })
    it('🔴 dependencias: no sale antes de la fila de la que depende, ni después de la que depende de ella', () => {
      const despues = sumarDias(k.abierto, 7)
      const dep = [fila(k, 'pasada', ayer, { depende_de: ['base'] }), fila(k, 'base', despues)]
      expect((verificarDecisiones(filasPasadas(dep, k.hoy), [{ fila_id: 'pasada', accion: 'reubicar', fecha: k.abierto, razon: 'x' }], ctx(k, dep)).cambios[0] as { rechazo: string }).rechazo).toMatch(/depende de base/)
      const hija = [fila(k, 'pasada', ayer), fila(k, 'hija', k.abierto, { depende_de: ['pasada'], formato: 'otro' })]
      expect((verificarDecisiones(filasPasadas(hija, k.hoy), [{ fila_id: 'pasada', accion: 'reubicar', fecha: despues, razon: 'x' }], ctx(k, hija)).cambios[0] as { rechazo: string }).rechazo).toMatch(/hija depende de esta fila/)
    })
    it('🔴 fusionar: con una fila futura validada vale (las dos quedan con su nota); con una inexistente, pasada o no validada se rechaza', () => {
      const filas = [fila(k, 'pasada', ayer), fila(k, 'otra-pasada', antier), fila(k, 'futura', k.abierto), fila(k, 'en-oficina', k.abierto, { estado: 'en_oficina' })]
      const ok = verificarDecisiones(filasPasadas(filas, k.hoy), [{ fila_id: 'pasada', accion: 'fusionar', destino: 'futura', razon: 'mismo mensaje' }, { fila_id: 'otra-pasada', accion: 'descartar', razon: 'ya no aplica' }], ctx(k, filas)).cambios
      expect(ok.find((c) => c.fila_id === 'pasada')).toMatchObject({ tipo: 'fusionar', destino: 'futura', aviso_destino: `reubicación: absorbe a pasada (era del ${ayer}) · mismo mensaje` })
      for (const [destino, re] of [['nadie', /no existe/], ['otra-pasada', /también quedó atrás/], ['en-oficina', /no está validada/]] as const) {
        const c = verificarDecisiones(filasPasadas(filas, k.hoy), [{ fila_id: 'pasada', accion: 'fusionar', destino, razon: 'x' }], ctx(k, filas)).cambios.find((x) => x.fila_id === 'pasada')!
        expect(c.tipo, destino).toBe('descartar')
        expect((c as { rechazo: string }).rechazo).toMatch(re)
      }
    })
    it('🔴 descartar vale con razón; sin razón o sin decisión, la fila se descarta con la razón del código', () => {
      const filas = [fila(k, 'a', ayer), fila(k, 'b', antier), fila(k, 'c', antier, { formato: 'otro' })]
      const { cambios } = verificarDecisiones(filasPasadas(filas, k.hoy), [{ fila_id: 'a', accion: 'descartar', razon: 'la fecha era el punto' }, { fila_id: 'b', accion: 'reubicar', fecha: k.abierto, razon: '  ' }], ctx(k, filas))
      expect(cambios.find((c) => c.fila_id === 'a')).toMatchObject({ tipo: 'descartar', rechazo: null, aviso: `reubicación: perdió su fecha (${ayer}) · la fecha era el punto` })
      expect((cambios.find((c) => c.fila_id === 'b') as { rechazo: string }).rechazo).toMatch(/no trae su razón/)
      expect((cambios.find((c) => c.fila_id === 'c') as { rechazo: string }).rechazo).toBe('el agente no decidió esta fila')
    })
    it('🔴 sabotaje del GO · una decisión sobre una fila futura sana se IGNORA: no sale ningún cambio para ella', () => {
      const filas = base()
      const { cambios, ignoradas } = verificarDecisiones(filasPasadas(filas, k.hoy), [{ fila_id: 'futura', accion: 'descartar', razon: 'x' }, { fila_id: 'pasada', accion: 'descartar', razon: 'y' }], ctx(k, filas))
      expect(cambios.map((c) => c.fila_id)).toEqual(['pasada'])
      expect(ignoradas).toEqual(['futura: no es una fila pasada sin producir (no se toca)'])
    })
  })

  it('el marco lleva las filas pasadas, las que vienen, los plazos, los horarios y la forma de responder', () => {
    const filas = [fila(k, 'pasada', ayer), fila(k, 'futura', k.abierto)]
    const m = marcoDeReubicacion(filasPasadas(filas, k.hoy), ctx(k, filas), 'Cliente de práctica')
    expect(m).toContain(`- pasada · ${ayer}`)
    expect(m).toContain(`- futura · ${k.abierto}`)
    expect(m).toContain('plazo de producción: 3 días')
    expect(m).toContain('máximo 1 por día')
    expect(m).toContain(k.c.sedes[0].clave)
    expect(m).toContain('<fila_id> · reubicar · AAAA-MM-DD · razón')
  })
})
