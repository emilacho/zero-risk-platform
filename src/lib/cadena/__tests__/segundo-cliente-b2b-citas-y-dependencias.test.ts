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
import { citasQueNoAparecen, leerBriefCreativo, textoDelDocumento } from '../brief-creativo'
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

  // El hallazgo de #1003 (GO Lenovo 18:01Z, arreglado): con documentos guardados como JSON, dos citas BIEN copiadas salían como alteradas.
  const COMILLAS_DENTRO = 'El manual dice: «cierran con una CTA única ("Contáctanos para más información")»'
  const DOS_PARRAFOS = '> «Segmento 1 — Fábricas y empresas medianas con área de Seguridad Industrial activa\n> Perfil: empresas medianas con departamento o responsable de seguridad industrial dedicado.»'
  it('una cita con comillas dentro: el JSON las guarda como \\" y ahora se reconoce', () => {
    expect(citasQueNoAparecen(brief([COMILLAS_DENTRO]), FUENTES)).toEqual([])
  })
  it('un bloque `>` que cruza dos párrafos: el JSON guarda el salto como \\n escrito y ahora se reconoce', () => {
    expect(citasQueNoAparecen(brief([DOS_PARRAFOS]), FUENTES)).toEqual([])
  })
  it('el JSON se lee igual que el mismo manual en texto: las dos pasan, y una alterada o inventada se sigue marcando', () => {
    for (const manual of [MANUAL, MANUAL_EN_PROSA]) {
      const f = { plan: PLAN, manual }
      expect(citasQueNoAparecen(brief([COMILLAS_DENTRO, DOS_PARRAFOS]), f)).toEqual([])
      expect(citasQueNoAparecen(brief(['El manual dice: «Criterio decisor principal: precio justo.»']), f)).toHaveLength(1)
      expect(citasQueNoAparecen(brief(['El manual dice: «Entregamos en todo el país en menos de 24 horas.»']), f)).toHaveLength(1)
      expect(citasQueNoAparecen(brief(['> «Somos los únicos con laboratorio propio de recarga.»']), f)).toHaveLength(1)
    }
  })
  it('las claves del JSON no cuentan como texto citable: solo sus valores', () => {
    expect(citasQueNoAparecen(brief(['El manual dice: «brand_book_draft positioning icp_summary»']), FUENTES)).toHaveLength(1)
  })
  it('la cita de «De qué parte del plan sale» también se compara contra los valores del plan en JSON', () => {
    // el plan real de este cliente no tiene párrafos dentro de sus valores: aquí, uno en JSON (como lo guarda la base) que sí los tiene
    const planJson = JSON.stringify({ secuencia: 'Primero se reactiva el feed con constancia.\n\nDespués se encienden los anuncios de búsqueda.', canales: [{ canal: 'busqueda_local', peso: 0.45 }] })
    const sinPlan = (md: string) => leerBriefCreativo(md, { planTexto: planJson, manualTexto: MANUAL, prohibidas: [] }).bloqueos.filter((b) => b.includes('no se encuentra literal en el plan'))
    const md = brief(Object.values(BIEN).filter((x) => !x.startsWith('El plan dice'))).replace('> «activar cuando exista perfil LinkedIn de empresa creado y validado»', '> «Primero se reactiva el feed con constancia. Después se encienden los anuncios de búsqueda.»')
    expect(sinPlan(md)).toEqual([])
    expect(sinPlan(md.replace('anuncios de búsqueda.»', 'anuncios de video.»'))).toHaveLength(1)
    // y la misma cita en el cuerpo del brief («el plan dice»), contra el plan en JSON
    const enCuerpo = brief(['El plan dice: «Primero se reactiva el feed con constancia. Después se encienden los anuncios de búsqueda.»'])
    expect(citasQueNoAparecen(enCuerpo, { plan: planJson, manual: MANUAL })).toEqual([])
    expect(citasQueNoAparecen(enCuerpo.replace('de búsqueda.»', 'de video.»'), { plan: planJson, manual: MANUAL })).toHaveLength(1)
  })
})

describe('cómo se lee un documento para comprobar citas', () => {
  it('un texto que no es JSON queda tal cual (Náufrago y cualquier plan en prosa)', () => {
    for (const t of ['Plan de 90 días. «costa»', '', '{ esto no es JSON', '[nota] al margen']) expect(textoDelDocumento(t)).toBe(t)
  })
  it('un JSON se lee como TODOS sus valores (textos, números, sí/no), uno por línea, en cualquier profundidad', () => {
    expect(textoDelDocumento('{"a":"uno \\"dos\\"","b":{"c":["tres\\n\\ncuatro",5,true]},"d":null}')).toBe('uno "dos"\ntres\n\ncuatro\n5\ntrue')
    expect(textoDelDocumento(' ["x", {"y": "z"}] ')).toBe('x\nz')
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
