/**
 * 09-nov · FALSO ROJO de la v2 del brief de Náufrago (`28de888e`): la cita estaba palabra por palabra en el plan, pero el plan la tiene en negrita
 * («**Primero, … antes de pautar.** La ghost kitchen …») y `citaAparece` no quitaba las marcas de formato. Arreglo: solo `citaAparece` quita `*` `_` `` ` ``
 * en LOS DOS lados. Las 5 pruebas que pidió CC7 (ALTO-CC7 + RESPUESTA-CC7 alcance): la v2 real pasa · una inventada bloquea · la v1 con «[…]» sigue
 * bloqueando · una cita de estrategia que hoy pasa sigue pasando · (el sabotaje se corre aparte, quitando el arreglo).
 * Los textos salen de los registros reales: plan `4996c6c2` (client_historical_outputs.content) y `cadena_brief_creativo` v1/v2 de `28de888e`.
 */
import { describe, expect, it } from 'vitest'
import { citaAparece, normalizar } from '../texto'
import { leerBriefCreativo } from '../brief-creativo'

// tramo literal del plan real (Resumen ejecutivo + Hoja de ruta), con sus negritas tal cual
const PLAN = [
  '## Resumen ejecutivo',
  '',
  'Tres movimientos en este período.',
  '',
  '**Primero, dar a conocer el delivery de Guayaquil antes de abrir y desbloquear la operación antes de pautar.** La ghost kitchen abre el lunes 9 de noviembre. Este fin de semana @naufrago.ec publica el anuncio: quienes viven en zona norte de Guayaquil pueden pedir encebollado y ceviche desde el lunes por naufrago.ec. El anuncio va orgánico — sin pauta — porque el píxel y la Fan Page se configuran en paralelo.',
  '',
  '## Hoja de ruta · 12 semanas',
  '',
  '### Fase 1 · Desbloquear — Semanas 1-2 (Nov 6-19)',
  '',
  '**Semana 1 (Nov 6-12) — Sin pauta. Setup + pre-apertura Guayaquil.**',
].join('\n')

// la sección «De qué parte del plan sale» de cada versión, copiada de la base
const CITA_V2 = '> «Primero, dar a conocer el delivery de Guayaquil antes de abrir y desbloquear la operación antes de pautar. La ghost kitchen abre el lunes 9 de noviembre. Este fin de semana @naufrago.ec publica el anuncio: quienes viven en zona norte de Guayaquil pueden pedir encebollado y ceviche desde el lunes por naufrago.ec.»'
const CITA_V1 = '> «La ghost kitchen abre el lunes 9 de noviembre. Este fin de semana @naufrago.ec publica el anuncio: quienes viven en zona norte de Guayaquil pueden pedir encebollado y ceviche desde el lunes por naufrago.ec. […] La idea de marca que une todo el plan: "Encebollados y ceviches con producto del día — sin esperar mesa, sin salir de casa."»'
const CITA_INVENTADA = '> «Primero, regalar un encebollado a cada vecino de Guayaquil antes de abrir la cocina.»'

const brief = (cita: string) => ['## De qué parte del plan sale', '', cita, '', '## Insight', 'algo', '## Mensaje', 'algo'].join('\n')
const bloqueoDeCita = (cita: string) => leerBriefCreativo(brief(cita), { planTexto: PLAN, prohibidas: [] }).bloqueos.filter((b) => /no se encuentra literal en el plan/.test(b))

describe('citaAparece · las marcas de formato no son parte de lo que se cita (falso rojo de la v2 de Náufrago)', () => {
  it('1 · la cita REAL de la v2 pasa (cruza la negrita del plan) · antes daba «no se encuentra literal»', () => {
    expect(bloqueoDeCita(CITA_V2)).toEqual([])
  })
  it('2 · una cita inventada sigue bloqueando', () => {
    expect(bloqueoDeCita(CITA_INVENTADA)).toHaveLength(1)
  })
  it('3 · la v1 (dos partes pegadas con «[…]» y comillas adentro) sigue bloqueando', () => {
    expect(bloqueoDeCita(CITA_V1)).toHaveLength(1)
  })
  it('4 · las citas de la estrategia validada que hoy pasan siguen pasando (incluida la que cruza «**Semana 1 …**»)', () => {
    for (const c of ['Fase 1 · Desbloquear — Semanas 1-2 (Nov 6-19)', 'La ghost kitchen abre el lunes 9 de noviembre.', 'Semana 1 (Nov 6-12) — Sin pauta.']) expect(citaAparece(PLAN, c), c).toBe(true)
  })
  it('el formato se quita en los DOS lados: una cita con negrita sobre un texto sin negrita también aparece; una vacía o de 3 letras nunca', () => {
    expect(citaAparece('dar a conocer el delivery de Guayaquil', '**dar a conocer** el delivery')).toBe(true)
    expect(citaAparece(PLAN, '**')).toBe(false)
    expect(citaAparece(PLAN, '_a_b')).toBe(false)
    expect(citaAparece(PLAN, null)).toBe(false)
  })
  it('normalizar NO cambia (la usan otros 9 archivos): sigue dejando los asteriscos', () => {
    expect(normalizar('**Hola** _mundo_')).toBe('**hola** _mundo_')
  })
})
