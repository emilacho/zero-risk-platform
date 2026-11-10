/**
 * 10-nov 18:48Z · GO Lenovo: UN lector común del documento (texto o JSON → texto comparable) para TODAS las comprobaciones exactas de citas:
 * el revisor de la estrategia (S02, bloquea), las temporadas del negocio (#1002) y el brief (#1005). Cambia cómo se lee, nunca qué se juzga.
 * + el límite de las comillas rectas dentro de la cita de «De qué parte del plan sale».
 * Dos clientes de rubros distintos: una cafetería con el plan en TEXTO y el B2B industrial con el plan en JSON (el REAL de la base + un valor de práctica
 * con comillas y dos párrafos, porque el real no los trae).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { citaEnDocumento, citaAparece, textoDelDocumento } from '../texto'
import { citasEntreComillas, citasQueNoAparecen, leerBriefCreativo } from '../brief-creativo'
import { validarEstrategia } from '../validador-estrategia'
import { temporadaRespaldada } from '../fechas-del-cliente'
import { clienteA, formatosDeLaMigracion } from '../__fixtures__/clientes'
import type { Estrategia } from '../tipos'

const fx = (n: string) => readFileSync(join(__dirname, '..', '__fixtures__', n), 'utf8')
const PLAN_B2B_REAL = fx('plan-b2b-industrial-real.json.txt')
const MANUAL_B2B = fx('manual-b2b-industrial-real.json.txt')
const ESTRATEGIA_B2B: Estrategia = JSON.parse(JSON.parse(readFileSync(join(__dirname, '..', '..', 'colaterales', '__tests__', '__fixtures__', 'b2b-industrial-2026-11-10.json'), 'utf8')).estrategia)

const FRASE = 'La temporada alta va de "diciembre a abril", por las inspecciones del Cuerpo de Bomberos.'
const SEGUNDO = 'En mayo baja la demanda y se cotiza con el llamado "Cotiza hoy" en todas las piezas.'
/** el plan real del B2B, guardado como JSON, con un valor de práctica que trae comillas y dos párrafos */
const PLAN_JSON = JSON.stringify({ ...JSON.parse(PLAN_B2B_REAL), temporadas: `${FRASE}\n\n${SEGUNDO}` })
/** la cafetería: el mismo contenido de práctica, en texto (prosa con saltos de verdad) */
const PLAN_TEXTO = `${clienteA().planTexto}\n\n${FRASE}\n\n${SEGUNDO}`
const CLIENTES = [
  { nombre: 'cafetería (plan en texto)', plan: PLAN_TEXTO, estrategia: clienteA().estrategia },
  { nombre: 'B2B industrial (plan en JSON)', plan: PLAN_JSON, estrategia: ESTRATEGIA_B2B },
]
const CRUZA = 'por las inspecciones del Cuerpo de Bomberos. En mayo baja la demanda'
const INVENTADA = 'Toda pieza lleva el sello de calidad certificada desde 1998.'

const s02 = (e: Estrategia, plan: string) => validarEstrategia(e, { planTexto: plan, formatos: formatosDeLaMigracion(), diasCampana: 90, fechaInicio: '2026-11-09' }).filter((x) => x.chequeo === 'S02')
const conCitaEnFase = (e: Estrategia, cita: string): Estrategia => ({ ...e, fases: e.fases.map((f, i) => (i === 0 ? { ...f, cita_plan: cita } : f)) })
const temporada = (cita: string) => ({ desde: '2026-12-01', hasta: '2027-04-30', cita_plan: cita })

describe('el lector común es el mismo para todos', () => {
  it('vive en un solo lugar: la estrategia, las temporadas y el brief usan `citaEnDocumento` / `textoDelDocumento` de texto.ts', () => {
    const fuente = (f: string) => readFileSync(join(__dirname, '..', f), 'utf8')
    expect(fuente('validador-estrategia.ts')).toMatch(/citaEnDocumento\(ins\.planTexto, c\.cita\)/)
    expect(fuente('fechas-del-cliente.ts')).toMatch(/citaEnDocumento\(planTexto, f\.cita_plan\)/)
    expect(fuente('brief-creativo.ts')).toMatch(/from '\.\/texto'/)
    expect(fuente('brief-creativo.ts')).not.toMatch(/export function textoDelDocumento/)
  })
  it('un texto se lee tal cual: `citaEnDocumento` da lo mismo que `citaAparece` sobre un plan en prosa', () => {
    for (const c of [FRASE, CRUZA, INVENTADA, 'Plan de 90 días', 'diciembre']) expect(citaEnDocumento(PLAN_TEXTO, c)).toBe(citaAparece(PLAN_TEXTO, c))
  })
  it('el JSON del B2B se lee como el mismo contenido en texto (sin las claves)', () => {
    for (const c of [FRASE, SEGUNDO, CRUZA]) expect(citaEnDocumento(PLAN_JSON, c)).toBe(true)
    expect(citaEnDocumento(PLAN_JSON, 'meta_por_semana')).toBe(false)
    expect(textoDelDocumento(PLAN_JSON)).toContain(FRASE)
  })
})

for (const cl of CLIENTES) {
  describe(cl.nombre, () => {
    it('S02 · control: la estrategia de hoy sigue sin bloqueos de cita', () => {
      expect(s02(cl.estrategia, cl.plan)).toEqual([])
    })
    it('S02 · una cita bien copiada con comillas dentro, o que cruza dos párrafos, NO bloquea', () => {
      expect(s02(conCitaEnFase(cl.estrategia, FRASE), cl.plan)).toEqual([])
      expect(s02(conCitaEnFase(cl.estrategia, CRUZA), cl.plan)).toEqual([])
    })
    it('S02 · una cita que no existe BLOQUEA, y una alterada también', () => {
      expect(s02(conCitaEnFase(cl.estrategia, INVENTADA), cl.plan)).toHaveLength(1)
      expect(s02(conCitaEnFase(cl.estrategia, FRASE.replace('abril', 'marzo')), cl.plan)).toHaveLength(1)
      expect(s02(conCitaEnFase(cl.estrategia, INVENTADA), cl.plan)[0].severidad).toBe('bloquea')
    })
    it('temporadas · la cita con comillas dentro respalda el tramo; una que no existe o alterada no', () => {
      expect(temporadaRespaldada(temporada(FRASE), cl.plan)).toEqual({ ok: true, motivo: 'respaldada por el plan' })
      expect(temporadaRespaldada(temporada(INVENTADA), cl.plan).motivo).toBe('la cita no aparece literal en el plan')
      expect(temporadaRespaldada(temporada(FRASE.replace('Bomberos', 'Policía')), cl.plan).motivo).toBe('la cita no aparece literal en el plan')
    })
    it('temporadas · lo que se juzga no cambia: la cita tiene que nombrar los meses del tramo', () => {
      expect(temporadaRespaldada({ desde: '2026-06-01', hasta: '2026-08-31', cita_plan: FRASE }, cl.plan).motivo).toBe('la cita no nombra los meses del tramo')
    })
    it('brief · una cita que no existe se marca, y la bien copiada no', () => {
      const md = (linea: string) => `## Público\nEl plan dice: «${linea}»`
      expect(citasQueNoAparecen(md(FRASE), { plan: cl.plan })).toEqual([])
      expect(citasQueNoAparecen(md(INVENTADA), { plan: cl.plan })).toHaveLength(1)
    })
  })
}

describe('comillas rectas dentro de la cita de «De qué parte del plan sale» (límite declarado en #1005)', () => {
  const brief = (cita: string) => [
    '## De qué parte del plan sale', `> «${cita}»`,
    '## Insight', 'x x x x', '## Público', 'Responsables de seguridad.', '## Mensaje', 'Un solo proveedor.',
    '## Objetivo', 'Consultas por semana.', '## Cómo sabremos que funcionó', 'Consultas por semana.', '## Tono', 'Directo.', '## Obligatorios', '- vocabulario: extintores',
  ].join('\n')
  const sinPlan = (md: string, plan: string) => leerBriefCreativo(md, { planTexto: plan, manualTexto: MANUAL_B2B, prohibidas: [] }).bloqueos.filter((b) => b.includes('no se encuentra literal en el plan'))
  for (const cl of CLIENTES) {
    it(`${cl.nombre}: bien copiada pasa; con el final alterado DESPUÉS de las comillas rectas ahora se marca`, () => {
      expect(sinPlan(brief(SEGUNDO), cl.plan)).toEqual([])
      expect(sinPlan(brief(SEGUNDO.replace('en todas las piezas.', 'solo en las historias.')), cl.plan)).toHaveLength(1)
      expect(sinPlan(brief(INVENTADA), cl.plan)).toHaveLength(1)
    })
  }
  it('cada comilla se cierra con su pareja; las rectas de dentro de «…» son parte de la cita', () => {
    expect(citasEntreComillas('> «el llamado "Cotiza hoy" en todas»')).toEqual(['el llamado "Cotiza hoy" en todas'])
    expect(citasEntreComillas('«uno uno» y “dos dos” y "tres tres"')).toEqual(['uno uno', 'dos dos', 'tres tres'])
  })
  it('control: lo que se leía antes se sigue leyendo (una comilla de cada tipo, o una pareja mezclada)', () => {
    expect(citasEntreComillas('> «Grupo con alto poder de amplificación orgánica.»')).toEqual(['Grupo con alto poder de amplificación orgánica.'])
    expect(citasEntreComillas('el plan: "Revisión de resultados los días 21"')).toEqual(['Revisión de resultados los días 21'])
    expect(citasEntreComillas('«pareja mezclada”')).toEqual(['pareja mezclada'])
    expect(citasEntreComillas('sin comillas')).toEqual([])
  })
})
