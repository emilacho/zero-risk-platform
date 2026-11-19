/**
 * 19-nov · LA DURACIÓN LA DEFINE LA GRAN IDEA (GO Lenovo 15:05 Zúrich · firma de Emilio 15:01-15:03 · ADENDA 1 15:07 · CC1).
 * Lo de CC1: que el director (y la mesa que escribe el banco) PIDA la duración con su porqué en cada idea de video, y que `conceptos.ts` la LEA para que la hoja la copie.
 * Nada de validación propia (ADENDA 1): si una idea de video llega sin duración, eso lo ve la revisión de la gran idea, no un chequeo de código; y no hay avisos nuevos.
 */
import { describe, expect, it } from 'vitest'
import { parsearBrief } from '@/lib/oficina/brief'
import { duracionDeLaPieza } from '@/lib/oficina/video/duracion-de-la-pieza'
import { CONVENCION_DE_LA_PIEZA, tareaDelRelleno } from '@/lib/oficina/mesa/pedidos'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import { leerBriefCreativo } from '../brief-creativo'
import { hallazgosDelConcepto, ideaDelBanco, leerConcepto, leerIdea, lineasDeIdeaNoReconocidas, type InsumosDelConcepto } from '../conceptos'
import { escribirHoja, type FilaDeHoja, type InsumosDeLaHoja } from '../hoja'
import { marcoDelConcepto } from '../mesas'
import type { FormatosPorRed } from '../tipos'

const INS_C: InsumosDelConcepto = { fases: [{ clave: 'F1', semanas: 1 }], redes: [{ red: 'ig', huecos_por_semana: 2 }], prohibidas: [], fotos: [] }
const REEL = (dur?: string) => `- C1-I01 · ig · reel · la historia del local en tres momentos · mensaje: ya llegó · gancho: ya llegó. · protagonista: el local · serie: ninguna${dur === undefined ? '' : ` · duración: ${dur}`} · foto:ninguna`
const CARRUSEL = '- C1-I02 · ig · carrusel · el menú · mensaje: todo el menú a domicilio · gancho: el menú. · protagonista: el plato · serie: ninguna · foto:ninguna'
const TEXTO = (dur?: string) => [
  '## Gran idea  Ya llegó · El norte también come de Olón', '## Cómo se ve  Púrpura, turquesa.',
  '## Capítulo F1 · Llegar', 'Qué cuenta: llegamos · Objetivo de la fase (cita): «que el norte sepa» · Cómo se ve en este capítulo: tipografía',
  '## Banco de ideas', REEL(dur), CARRUSEL,
].join('\n')

describe('duración · la idea la trae y se lee tal cual', () => {
  it('🔴 `duración: 20 s · porque…` se lee entera (también con « · » en el porqué y con o sin tilde) y no toca los demás campos', () => {
    const i = leerIdea('- C1-I03 · ig · reel · el bowl entra · mensaje: m · gancho: g · serie: S1 · cuadros: 1 · duración: 20 s · porque son tres momentos · llegada, mesa y cierre · foto:ninguna')
    expect(i).toMatchObject({ id: 'C1-I03', formato: 'reel', serie: 'S1', cuadros: 1, duracion: '20 s · porque son tres momentos · llegada, mesa y cierre', foto: null, mensaje: 'm', gancho: 'g' })
    expect(leerIdea('- C1-I03 · ig · reel · x · mensaje: m · gancho: g · duracion: 1 min 30 s · porque cuenta el día')!.duracion).toBe('1 min 30 s · porque cuenta el día')
    expect(leerIdea('- C1-I03 · ig · reel · x · mensaje: m · gancho: g · Duración: 45 segundos')!.duracion).toBe('45 segundos')
  })
  it('🔴 antes, `duración:` después de `cuadros:` se pegaba a cuadros y lo rompía; ahora cuadros se lee', () => {
    expect(leerIdea('- C1-I03 · ig · reel · x · mensaje: m · gancho: g · cuadros: 2 · duración: 20 s · foto:ninguna')).toMatchObject({ cuadros: 2, duracion: '20 s', foto: null })
  })
  it('🔴 sin validación propia (ADENDA 1): lo que escribió el creador se guarda TAL CUAL, aunque no traiga un largo; vacío = sin clave', () => {
    expect(leerIdea(REEL('lo que pida el guion'))!.duracion).toBe('lo que pida el guion')
    expect('duracion' in leerIdea(REEL(''))!).toBe(false)
    expect('duracion' in leerIdea(REEL())!).toBe(false)
    expect('duracion' in leerIdea(CARRUSEL)!).toBe(false)
  })
  it('🔴 una idea vieja (sin el campo) se lee EXACTA como antes', () => {
    const vieja = leerIdea(CARRUSEL)!
    expect(Object.keys(vieja).sort()).toEqual(['capitulo', 'foto', 'formato', 'gancho', 'id', 'idea', 'linea', 'mensaje', 'protagonista', 'red', 'serie'].sort())
  })
})

describe('duración · de la idea a la hoja, sin avisos', () => {
  const BRIEF = leerBriefCreativo([
    '## De qué parte del plan sale', 'Fase 1: «que el norte sepa».', '## Insight', 'Nadie sabía.', '## Mensaje', 'Ya llegó.',
    '## Público', 'Vecinos del norte que piden comida a domicilio entre semana.', '## Cómo sabremos que funcionó', 'Pedidos por semana contra la meta del plan, cada lunes.', '## Objetivo', '30 pedidos nuevos por semana.',
    '## Tono', 'Cercano.', '## Obligatorios', '- vocabulario: encebollado', '## Faltantes', '- ninguno', '## Contradicciones plan vs manual', '- ninguna',
  ].join('\n'), { planTexto: '## Fase 1\nObjetivo: que el norte sepa.', prohibidas: [] })
  const FORMATOS: FormatosPorRed = { ig: [
    { formato: 'reel', produccion: 'espera_brazo', lead_dias: 5, max_por_dia: 2, familia: 'video_mesa' },
    { formato: 'carrusel', produccion: 'opera', lead_dias: 2, max_por_dia: 2, familia: 'carrusel_ig' },
  ] }
  const FILAS: FilaDeHoja[] = [
    { id: 'F1-reel', fecha: '2026-11-20', hora: '10:00', red: 'ig', formato: 'reel', pilar: 'conveniencia', tema: 'ya llegó', datos: [], fase: 'F1', idea_ref: 'C1-I01' },
    { id: 'F1-carrusel', fecha: '2026-11-21', hora: '10:00', red: 'ig', formato: 'carrusel', pilar: 'conveniencia', tema: 'el menú', datos: [], fase: 'F1', idea_ref: 'C1-I02' },
  ]
  const hoja = (dur?: string) => escribirHoja({
    client_name: 'Cliente de prueba', plan_id: '11111111-2222-3333-4444-555555555555', manual_version: 1, manual_id: 'man-1', hoy: '2026-11-17', lote_key: '2026-W47',
    brief: BRIEF, brief_id: 'brf-v1', concepto: leerConcepto(TEXTO(dur), INS_C), concepto_id: 'con-v1', filas: FILAS, formatos: FORMATOS,
  } as InsumosDeLaHoja).texto_md

  it('🔴 la línea del banco con su duración llega al brief del reel tal cual (ya sin ponerla a mano) y la oficina la lee', () => {
    const c = leerConcepto(TEXTO('45 s · tres momentos de la historia'), INS_C)
    expect(ideaDelBanco(c, 'C1-I01')!.duracion).toBe('45 s · tres momentos de la historia')
    expect(parsearBrief(hoja('45 s · tres momentos de la historia'), 'F1-reel')?.duracion).toBe('45 s · tres momentos de la historia')
    expect(parsearBrief(hoja('45 s · tres momentos de la historia'), 'F1-carrusel')?.duracion).toBeUndefined()
  })
  // 19-nov · CC5 · el último tramo: de la hoja a la duración con que abre el encargo (la de la idea; sin ella, la de por omisión EN SILENCIO)
  it('🔴 de punta a punta: la idea dice 45 s y el encargo abre con 45 s; sin duración abre con la de por omisión, sin aviso', () => {
    const pl = { limites: { video: { segundos_max: 120, duracion_por_omision_s: 15 } } } as never
    expect(duracionDeLaPieza(parsearBrief(hoja('45 s · tres momentos de la historia'), 'F1-reel'), pl)).toEqual({ segundos: 45, porque: 'tres momentos de la historia', por_omision: false })
    expect(duracionDeLaPieza(parsearBrief(hoja(), 'F1-reel'), pl)).toEqual({ segundos: 15, porque: '', por_omision: true })
    expect(duracionDeLaPieza(parsearBrief(hoja('lo que pida el guion'), 'F1-reel'), pl)).toEqual({ segundos: 15, porque: '', por_omision: true })
    expect(duracionDeLaPieza(parsearBrief(hoja('3 min · el día entero'), 'F1-reel'), pl).aviso).toBe('la idea pide 180 s y la cadena aguanta hasta 120 s (el render de la composición): se abre con 120 s')
  })
  it('🔴 sin el campo la hoja queda EXACTA como antes (ni una línea de duración)', () => {
    expect(hoja()).not.toMatch(/DURACIÓN/)
  })
  it('🔴 sin alertas innecesarias (firma de Emilio): con o sin duración, el concepto da los MISMOS hallazgos; la línea con duración no se declara mal escrita', () => {
    const sin = leerConcepto(TEXTO(), INS_C)
    const con = leerConcepto(TEXTO('20 s · porque sí'), INS_C)
    expect(hallazgosDelConcepto(con)).toEqual(hallazgosDelConcepto(sin))
    expect(con.ideas_descartadas).toEqual([])
    expect(lineasDeIdeaNoReconocidas(TEXTO('20 s · porque sí'))).toEqual([])
    expect(JSON.stringify(sin.avisos)).not.toMatch(/duraci/i)
  })
})

describe('duración · se la pide al creador', () => {
  it('🔴 el marco de la mesa de la gran idea pide `duración` en el formato del banco, con su porqué, en cada idea de video', () => {
    const A = clienteA()
    const m = marcoDelConcepto({ ctx: contextoDe(A), estrategia: A.estrategia, briefTexto: 'brief', version: 1, nota: null })
    expect(m).toContain('· cuadros: <n> · duración: <solo si es video: N s · porqué> · foto:<id>|ninguna`')
    expect(m).toMatch(/`duración` = en cada idea de VIDEO .* cuánto dura y por qué/)
    expect(m).toMatch(/Siempre la trae/)
  })
  it('🔴 la convención del banco (miembros y dirección) y el relleno de la dirección también la piden', () => {
    const conv = CONVENCION_DE_LA_PIEZA('concepto')
    expect(conv).toMatch(/· cuadros: <[^>]+> · duración: <SOLO si la idea es video[^>]*> · foto:<id>\|ninguna/)
    expect(conv).toMatch(/Cada idea de video trae SIEMPRE su duración estimada con su porqué/)
    expect(conv).toMatch(/el brief no la decide/)
    const r = tareaDelRelleno({ capitulo: 'F1', prefijo: '1', desde: 3, redes: [{ red: 'ig', faltan: 1, esperadas: 2 }], ya_estan: [] })
    expect(r).toContain('· gancho: <gancho> · duración: <solo si es video: «N s · porqué»>')
  })
})
