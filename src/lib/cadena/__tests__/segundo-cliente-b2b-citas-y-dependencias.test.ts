/**
 * 10-nov · prueba de SEGUNDO CLIENTE para lo ya publicado (pedido de CC7 · GO Lenovo 13:28Z punto 2 · sin cambiar código · CC4).
 * #984 (todas las citas del brief son literales) y #983 (lista de dependencias) se probaron solo con textos de Náufrago.
 * Aquí: el plan y el manual REALES de un cliente de otro rubro (B2B · seguridad industrial), tal como los guarda la base
 * (`client_historical_outputs.content_text` del plan a58df0c4 y `client_brand_books.content_text` v5, leídos el 10-nov, sin tocar).
 * Los dos están guardados como JSON, no como prosa: es lo que el lector recibe de verdad como `planTexto` / `manualTexto`.
 * El brief es de práctica (ese cliente no tiene todavía un brief en la cadena) y cita esos documentos.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { citasQueNoAparecen, leerBriefCreativo } from '../brief-creativo'
import { afectados, LEE } from '../dependencias-de-documentos'
import { marcoDelBrief, marcoDelConcepto } from '../mesas'
import { clienteA, clienteB, contextoDe } from '../__fixtures__/clientes'

const fx = (n: string) => readFileSync(join(__dirname, '..', '__fixtures__', n), 'utf8')
const PLAN = fx('plan-b2b-industrial-real.json.txt')
const MANUAL = fx('manual-b2b-industrial-real.json.txt')
const FUENTES = { plan: PLAN, manual: MANUAL }
const deCitas = (bloqueos: string[]) => bloqueos.filter((b) => b.includes('una cita nunca se corrige'))

/** el mismo manual leído como texto (los valores del JSON uno tras otro): sirve de control de la causa del hallazgo */
const prosa = (o: unknown): string => (typeof o === 'string' ? o : Array.isArray(o) ? o.map(prosa).join('\n') : o && typeof o === 'object' ? Object.values(o).map(prosa).join('\n') : String(o ?? ''))
const MANUAL_EN_PROSA = prosa(JSON.parse(MANUAL))

const brief = (publico: string[]) => [
  '## De qué parte del plan sale', '> «activar cuando exista perfil LinkedIn de empresa creado y validado»',
  '## Insight', 'La inspección llega y el responsable tiene que resolver todo en pocos días.',
  '## Público', ...publico,
  '## Mensaje', 'Todo lo de seguridad contra incendios, con un solo proveedor.',
  '## Objetivo', 'Consultas entrantes por WhatsApp cada semana.',
  '## Cómo sabremos que funcionó', 'Consultas por semana.',
  '## Tono', 'Directo, en tuteo.',
  '## Obligatorios', '- vocabulario: extintores',
].join('\n')

const BIEN = {
  bloque: '> «Voz directa, sin rodeos y precio-primero.»',
  enLinea: 'El manual dice: «Compran volumen y buscan contratos integrales.»',
  elision: 'El manual dice: «Voz directa, sin rodeos (…) Las publicaciones abren con el nombre del servicio en mayúsculas»',
  planEnLinea: 'El plan dice: «si atiende consultas por WhatsApp o solo por llamada y email»',
  anidadas: '> Objeciones frecuentes: «¿Tienen experiencia en empresas de nuestro tamaño?», «¿Pueden cubrir toda la planta y emitir informes técnicos?».',
}

describe('#984 con un segundo cliente (B2B, plan y manual guardados como JSON)', () => {
  it('las citas bien copiadas del plan y del manual no se marcan (bloque, en línea, con «(…)», del plan, varias en un bloque)', () => {
    const md = brief(Object.values(BIEN))
    expect(citasQueNoAparecen(md, FUENTES)).toEqual([])
    expect(deCitas(leerBriefCreativo(md, { planTexto: PLAN, manualTexto: MANUAL, prohibidas: [] }).bloqueos)).toEqual([])
  })
  it('una cita del manual alterada se marca contra el manual, y una del plan contra el plan', () => {
    const r = citasQueNoAparecen(brief([
      'El manual dice: «Criterio decisor principal: precio justo.»',
      'El plan dice: «activar cuando exista perfil LinkedIn de empresa creado y aprobado»',
    ]), FUENTES)
    expect(r.map((x) => [x.fuente, x.cita])).toEqual([
      ['manual', 'Criterio decisor principal: precio justo.'],
      ['plan', 'activar cuando exista perfil LinkedIn de empresa creado y aprobado'],
    ])
    expect(r.every((x) => x.seccion === 'Público')).toBe(true)
  })

  // HALLAZGO (reportado, sin cambiar código): con documentos guardados como JSON, dos citas BIEN copiadas salen como alteradas.
  // Con Náufrago no aparece porque su plan y su manual son prosa. Cuando se arregle, estas dos pasan a verde y `it.fails` avisa.
  const COMILLAS_DENTRO = 'El manual dice: «cierran con una CTA única ("Contáctanos para más información")»'
  const DOS_PARRAFOS = '> «Segmento 1 — Fábricas y empresas medianas con área de Seguridad Industrial activa\n> Perfil: empresas medianas con departamento o responsable de seguridad industrial dedicado.»'
  it.fails('hallazgo 1 · una cita con comillas dentro: el JSON las guarda como \\" y la cita no se reconoce', () => {
    expect(citasQueNoAparecen(brief([COMILLAS_DENTRO]), FUENTES)).toEqual([])
  })
  it.fails('hallazgo 2 · un bloque `>` que cruza dos párrafos: el JSON guarda el salto como \\n literal y la cita no se reconoce', () => {
    expect(citasQueNoAparecen(brief([DOS_PARRAFOS]), FUENTES)).toEqual([])
  })
  it('control de la causa: las MISMAS dos citas pasan con el mismo manual leído como texto, y una alterada sigue marcándose', () => {
    const prosaFuentes = { plan: PLAN, manual: MANUAL_EN_PROSA }
    expect(citasQueNoAparecen(brief([COMILLAS_DENTRO, DOS_PARRAFOS]), prosaFuentes)).toEqual([])
    expect(citasQueNoAparecen(brief(['El manual dice: «Criterio decisor principal: precio justo.»']), prosaFuentes)).toHaveLength(1)
    // y con el JSON tal cual, las dos salen marcadas (lo que hoy haría el lector con este cliente)
    expect(citasQueNoAparecen(brief([COMILLAS_DENTRO, DOS_PARRAFOS]), FUENTES)).toHaveLength(2)
  })
})

describe('#983 con un segundo cliente: lo que la lista dice que se lee llega igual para los tres clientes', () => {
  const b2bEstrategia = JSON.parse(JSON.parse(readFileSync(join(__dirname, '..', '..', 'colaterales', '__tests__', '__fixtures__', 'b2b-industrial-2026-11-10.json'), 'utf8')).estrategia)
  const casos = [
    { nombre: 'cafetería', ctx: contextoDe(clienteA()), estrategia: clienteA().estrategia },
    { nombre: 'veterinaria', ctx: contextoDe(clienteB()), estrategia: clienteB().estrategia },
    {
      nombre: 'B2B industrial (real)',
      ctx: { ...contextoDe(clienteB()), clientId: 'b2b-practica', planTexto: PLAN, manualTexto: MANUAL, sedes: [], forbiddenWords: ['garantizado'], registro: 'tu' as const },
      estrategia: b2bEstrategia,
    },
  ]
  for (const c of casos) {
    it(`${c.nombre}: el brief recibe plan, estrategia y lo del manual; la gran idea recibe brief, estrategia y lo del manual`, () => {
      const prohibida = c.ctx.forbiddenWords[0]
      const objetivo = c.estrategia.fases[0].objetivo as string
      const b = marcoDelBrief({ ctx: c.ctx, estrategia: c.estrategia, version: 1, devolucion: null, nota: null })
      const g = marcoDelConcepto({ ctx: c.ctx, estrategia: c.estrategia, briefTexto: '## Mensaje\nMARCA-DEL-BRIEF', version: 1, nota: null })
      expect(b).toContain(c.ctx.planTexto.slice(0, 40))
      expect(b).toContain(objetivo)
      expect(b).toContain(prohibida)
      expect(g).toContain('MARCA-DEL-BRIEF')
      expect(g).toContain(objetivo)
      expect(g).toContain(prohibida)
    })
  }
  it('la lista no depende del cliente: un cambio del manual alcanza a todo lo de abajo, igual para cualquiera', () => {
    expect(LEE.brief).toEqual(expect.arrayContaining(['plan', 'manual', 'estrategia']))
    expect(LEE.gran_idea).toEqual(expect.arrayContaining(['brief', 'estrategia', 'manual']))
    expect(afectados('manual')).toEqual(['plan', 'estrategia', 'brief', 'gran_idea', 'calendario', 'pieza'])
  })
})
