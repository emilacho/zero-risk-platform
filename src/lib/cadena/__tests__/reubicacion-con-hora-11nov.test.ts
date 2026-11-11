/**
 * 11-nov · GO de Lenovo 15:26 Zúrich · DECISIÓN DE EMILIO (opción A): al reubicar, la mesa propone también la HORA (mirando el calendario y el orden de la historia de la campaña).
 * «Ninguna pieza reubicada se pierde ni se pisa con otra.» Reparto: juzgar la hora = agente; el código solo verifica exacto que caiga en el horario de la sede (dato que ya existía).
 * NO hay verificación nueva: dos piezas a la misma hora no las frena el código; lo evita el agente, que ahora ve las horas.
 * DOS clientes de práctica de rubros distintos: A · cafetería (abre 07:00–15:00) · B · clínica veterinaria (abre 08:00–18:00). US$ 0: sin modelo, sin red, sin base.
 */
import { describe, expect, it } from 'vitest'
import { clienteA, clienteB, type ClienteFixture } from '../__fixtures__/clientes'
import { diaSemanaIso, sumarDias } from '../fechas'
import { filasPasadas, leerDecisiones, marcoDeReubicacion, verificarDecisiones, type ContextoDeReubicacion } from '../reubicacion'
import type { Fila, FormatosPorRed } from '../tipos'

interface Caso { nombre: string; c: ClienteFixture; hoy: string; abierto: string; formato: string; red: string; hora: string; dentro: string; fuera: string }
const CASOS: Caso[] = [
  { nombre: 'A · cafetería', c: clienteA(), hoy: '2026-11-12', abierto: '2026-11-19', formato: 'reel', red: 'instagram', hora: '09:00', dentro: '11:30', fuera: '19:00' },
  { nombre: 'B · clínica veterinaria', c: clienteB(), hoy: '2026-11-17', abierto: '2026-11-23', formato: 'carrusel', red: 'facebook', hora: '10:00', dentro: '16:45', fuera: '20:30' },
]
const FORMATOS = (k: Caso): FormatosPorRed => ({ [k.red]: [{ formato: k.formato, produccion: 'opera', lead_dias: 3, max_por_dia: 2 }] })
function fila(k: Caso, id: string, fecha: string, extra: Partial<Fila> = {}): Fila {
  return { id, tanda: 1, semana: 1, dia_semana: diaSemanaIso(fecha), fecha, hora: k.hora, red: k.red, formato: k.formato, pilar: 'p', tema: 't', sede: k.c.sedes[0].clave, requiere_abierto: true, depende_de: [], datos: [], pendientes: [], pieza_fija: null, origen: 'agente', estado: 'validada', avisos: [], ...extra }
}
const ctx = (k: Caso, filas: Fila[]): ContextoDeReubicacion => ({ hoy: k.hoy, campana: { fecha_inicio: k.c.campana.fecha_inicio, fecha_fin: k.c.campana.fecha_fin }, filas, formatos: FORMATOS(k), sedes: k.c.sedes })

describe.each(CASOS)('$nombre', (k) => {
  const ayer = sumarDias(k.hoy, -1)
  const filas = () => [fila(k, 'pasada', ayer), fila(k, 'futura', k.abierto, { hora: k.hora })]
  const verificar = (d: Parameters<typeof verificarDecisiones>[1], fs = filas()) => verificarDecisiones(filasPasadas(fs, k.hoy), d, ctx(k, fs)).cambios[0]!

  describe('el lector lee la hora (formato, no juicio)', () => {
    it('🔴 `fila · reubicar · fecha · HH:MM · razón` trae la hora; sin hora, la línea de siempre', () => {
      expect(leerDecisiones(`pasada · reubicar · ${k.abierto} · ${k.dentro} · no pisa a la otra · sigue la historia`)).toEqual([{ fila_id: 'pasada', accion: 'reubicar', fecha: k.abierto, hora: k.dentro, razon: 'no pisa a la otra · sigue la historia' }])
      expect(leerDecisiones(`pasada · reubicar · ${k.abierto} · primer día libre`)).toEqual([{ fila_id: 'pasada', accion: 'reubicar', fecha: k.abierto, razon: 'primer día libre' }])
    })
    it('🔴 la hora entre comillas o en negrita se lee igual; una razón que empieza con palabras no es una hora', () => {
      for (const h of [`\`${k.dentro}\``, `**${k.dentro}**`, k.dentro]) expect(leerDecisiones(`pasada · reubicar · ${k.abierto} · ${h} · r`)[0]).toMatchObject({ hora: k.dentro, razon: 'r' })
      expect(leerDecisiones(`pasada · reubicar · ${k.abierto} · a las 9 de la mañana · r`)[0]).not.toHaveProperty('hora')
      // una razón que MENCIONA una hora en medio del texto sigue siendo razón (la hora es la parte entera, no un pedazo)
      expect(leerDecisiones(`pasada · reubicar · ${k.abierto} · sale después del reel de las ${k.hora} · r`)[0]).toEqual({ fila_id: 'pasada', accion: 'reubicar', fecha: k.abierto, razon: `sale después del reel de las ${k.hora} · r` })
    })
    it('🔴 hora sin razón: se lee, y la verificación la descarta por no traer razón (como siempre)', () => {
      const d = leerDecisiones(`pasada · reubicar · ${k.abierto} · ${k.dentro}`)
      expect(d).toEqual([{ fila_id: 'pasada', accion: 'reubicar', fecha: k.abierto, hora: k.dentro, razon: '' }])
      expect(verificar(d)).toMatchObject({ tipo: 'descartar' })
    })
  })

  describe('el código verifica exacto la hora propuesta', () => {
    it('🔴 una hora dentro del horario de la sede se aplica, con el cambio escrito en el aviso', () => {
      const c = verificar([{ fila_id: 'pasada', accion: 'reubicar', fecha: k.abierto, hora: k.dentro, razon: 'no pisa a la otra' }])
      expect(c).toMatchObject({ tipo: 'reubicar', fecha: k.abierto, hora: k.dentro })
      expect(c.aviso).toBe(`reubicación: reubicada del ${ayer} al ${k.abierto} a las ${k.dentro} (antes ${k.hora}) · no pisa a la otra`)
    })
    it('🔴 la hora PROPUESTA fuera del horario se rechaza, aunque la hora vieja de la fila sí cabía', () => {
      const c = verificar([{ fila_id: 'pasada', accion: 'reubicar', fecha: k.abierto, hora: k.fuera, razon: 'x' }])
      expect(c.tipo).toBe('descartar')
      expect((c as { rechazo: string }).rechazo).toBe(`la hora ${k.fuera} cae fuera del horario de la sede ${k.c.sedes[0].clave} el ${k.abierto}`)
    })
    it('🔴 la hora vieja fuera del horario deja de importar si la propuesta cabe', () => {
      const c = verificar([{ fila_id: 'pasada', accion: 'reubicar', fecha: k.abierto, hora: k.dentro, razon: 'x' }], [fila(k, 'pasada', ayer, { hora: k.fuera })])
      expect(c).toMatchObject({ tipo: 'reubicar', hora: k.dentro })
    })
    it('🔴 algo con forma de hora que no es una hora («25:99») se rechaza', () => {
      const c = verificar([{ fila_id: 'pasada', accion: 'reubicar', fecha: k.abierto, hora: '25:99', razon: 'x' }])
      expect((c as { rechazo: string }).rechazo).toBe('«25:99» no es una hora HH:MM')
    })
    it('🔴 una pieza que no exige local abierto: la hora no se compara con el horario (como siempre), pero sí se exige que sea una hora', () => {
      const libre = (h: string) => verificar([{ fila_id: 'pasada', accion: 'reubicar', fecha: k.abierto, hora: h, razon: 'x' }], [fila(k, 'pasada', ayer, { requiere_abierto: false })])
      expect(libre(k.fuera)).toMatchObject({ tipo: 'reubicar', hora: k.fuera })
      expect(libre('25:99').tipo).toBe('descartar')
    })
    it('🔴 sin hora propuesta, la fila conserva la suya y el aviso es el de siempre', () => {
      const c = verificar([{ fila_id: 'pasada', accion: 'reubicar', fecha: k.abierto, razon: 'r' }])
      expect(c).toMatchObject({ tipo: 'reubicar', hora: k.hora })
      expect(c.aviso).toBe(`reubicación: reubicada del ${ayer} al ${k.abierto} · r`)
    })
    it('🔴 la misma hora que ya tenía: se aplica y el aviso no inventa un cambio de hora', () => {
      const c = verificar([{ fila_id: 'pasada', accion: 'reubicar', fecha: k.abierto, hora: k.hora, razon: 'r' }])
      expect(c).toMatchObject({ tipo: 'reubicar', hora: k.hora })
      expect(c.aviso).not.toMatch(/a las/)
    })
    it('🔴 sin verificación nueva: la misma hora que otra pieza ese día NO la frena el código (eso lo decide el agente)', () => {
      const c = verificar([{ fila_id: 'pasada', accion: 'reubicar', fecha: k.abierto, hora: k.hora, razon: 'r' }])
      expect(c.tipo).toBe('reubicar')
    })
  })

  describe('el marco le muestra las horas a la mesa', () => {
    it('🔴 cada fila (pasada y futura) lleva su hora; la forma de responder pide HH:MM y explica por qué', () => {
      const fs = filas()
      const m = marcoDeReubicacion(filasPasadas(fs, k.hoy), ctx(k, fs), 'Cliente de práctica')
      expect(m).toContain(`- pasada · ${ayer} ${k.hora} · ${k.red}`)
      expect(m).toContain(`- futura · ${k.abierto} ${k.hora} · ${k.red}`)
      expect(m).toContain('<fila_id> · reubicar · AAAA-MM-DD · HH:MM · razón')
      expect(m).toMatch(/no debe pisar a otra pieza \(misma red, mismo día, misma hora\)/)
      expect(m).toMatch(/orden de la historia de la campaña/)
    })
    it('una fila sin hora no deja un espacio suelto', () => {
      const fs = [fila(k, 'pasada', ayer, { hora: null })]
      expect(marcoDeReubicacion(filasPasadas(fs, k.hoy), ctx(k, fs), 'x')).toContain(`- pasada · ${ayer} · ${k.red}`)
    })
  })
})
