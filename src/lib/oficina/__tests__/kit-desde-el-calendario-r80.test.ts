/**
 * r80 · D4 · el kit de historias sale del calendario POR CÓDIGO: las filas de familia `kit_historias` de un lote se agrupan en UN brief de kit (cada fila = un elemento con SU fecha y hora);
 * el redactor solo entrega lo macro; el chequeo cuenta esas filas como briefeadas; la sala 3 lo abre sin cambios. Agnóstico: 4 rubros, tuteo y voseo. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { abrirEncargo } from '../orquestador'
import { elementosDelKit, esKitDeHistorias, parsearBrief } from '../brief'
import { KIT_HISTORIAS } from '../plantillas/kit-historias'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { CLIENTE, PARTE, crearMemoria } from './memoria'

const raiz = process.cwd()
const req = createRequire(import.meta.url)
const K = req(path.join(raiz, 'scripts/worker-staging/cadena/kit-de-historias.js')) as {
  agruparKit: (p: unknown, f: unknown) => { parte: { entregables: Array<Record<string, any>> }; kit: null | { brief_id: string; fila_ids: string[]; elementos: string[]; absorbidos: Array<string | null> } }
  lineaDeElemento: (f: unknown) => string
  filasDelKit: (f: unknown) => Array<{ id: string }>
}
const leerJson = (f: string) => JSON.parse(fs.readFileSync(path.join(raiz, f), 'utf8').replace(/^﻿/, ''))

type Fila = { id: string; fecha: string; hora: string | null; red: string; formato: string; pilar: string; tema: string; datos: unknown[]; familia: string | null }
const fila = (id: string, fecha: string, hora: string | null, red: string, formato: string, tema: string, pilar: string, familia: string | null, datos: unknown[] = []): Fila => ({ id, fecha, hora, red, formato, pilar, tema, datos, familia })
const ent = (id: string, filaId: string | null, extra: Record<string, unknown> = {}) => ({ id, fila_id: filaId, plataforma: 'Instagram', tipo_de_pieza: 'imagen', que_es: `Entregable ${id}`, mensaje: `Mensaje de ${id}`, objetivo: 'objetivo', ...extra })

// cuatro rubros distintos, con trato tú y trato vos en lo macro del redactor
const RUBROS = [
  { rubro: 'restaurante', trato: 'tú', macro: 'Cuenta qué hay hoy en la cocina; pídelo por mensaje.', historias: ['el plato del día', 'horario de la semana', 'cómo se prepara'] },
  { rubro: 'gimnasio', trato: 'vos', macro: 'Mostrá la sala vacía de la tarde; escribinos por mensaje.', historias: ['clase de la mañana', 'sala vacía', 'cambio de horario'] },
  { rubro: 'clínica dental', trato: 'tú', macro: 'Explica un cuidado sencillo; agenda tu cita por mensaje.', historias: ['cuidado de la semana', 'turnos libres'] },
  { rubro: 'tienda de ropa', trato: 'vos', macro: 'Mostrá la prenda nueva; consultá por mensaje.', historias: ['llegó lo nuevo', 'talles disponibles', 'promo del finde', 'cierre de semana'] },
]
const loteDe = (r: (typeof RUBROS)[number]): Fila[] => [
  fila('s1-d1-a', '2026-10-19', '11:00', 'instagram', 'foto', 'foto principal', 'producto', 'post_img'),
  ...r.historias.map((t, i) => fila(`s1-d${i + 2}-h`, `2026-10-${20 + i}`, i % 2 ? '09:30' : '18:00', i === 1 ? 'whatsapp' : 'instagram', i === 1 ? 'estado' : 'historia', t, 'servicio', 'kit_historias', i === 0 ? [{ dato: 'dirección', valor: 'Calle 1', clase: 'x', ref: 'r', nivel: 'a', opcional: false }] : [])),
  fila('s1-d6-a', '2026-10-24', '12:00', 'instagram', 'carrusel', 'carrusel educativo', 'educación', 'carrusel_ig_v1'),
]

describe('agruparKit · agnóstico (4 rubros, tuteo y voseo)', () => {
  for (const r of RUBROS) {
    it(`${r.rubro} (${r.trato}): las historias y estados del lote salen en UN kit, con la fecha y la hora de cada fila; lo demás no se toca`, () => {
      const lote = loteDe(r)
      const parte = { entregables: [ent('BRF-0001', 's1-d1-a'), ent('BRF-0002', lote[1].id, { mensaje: r.macro, objetivo: 'historias de la semana' }), ent('BRF-0003', 's1-d6-a', { tipo_de_pieza: 'carrusel' })], huecos: [] }
      const out = K.agruparKit(parte, lote)
      expect(out.kit).not.toBeNull()
      const ents = out.parte.entregables
      expect(ents.filter((e) => e.es_kit)).toHaveLength(1) // un lote no produce dos kits
      const kit = ents.find((e) => e.es_kit)!
      expect(kit.id).toBe('BRF-0004'); expect(kit.tipo_de_pieza).toBe('kit'); expect(kit.fila_ids).toEqual(r.historias.map((_, i) => `s1-d${i + 2}-h`))
      expect(kit.mensaje).toBe(r.macro) // lo macro lo puso el redactor; el código no inventa mensaje
      expect(kit.elementos).toHaveLength(r.historias.length)
      lote.filter((f) => f.familia === 'kit_historias').forEach((f, i) => {
        expect(kit.elementos[i].startsWith(`${f.fecha} ${f.hora} | ${f.formato === 'estado' ? 'estado' : 'historia'} | ${f.tema} | ${f.pilar}`)).toBe(true)
      })
      // las otras piezas quedan igual y en su sitio; la fila del redactor sobre la historia ya no sale suelta
      expect(ents.filter((e) => !e.es_kit).map((e) => e.id)).toEqual(['BRF-0001', 'BRF-0003'])
      expect(ents.map((e) => e.id)).toEqual(['BRF-0001', 'BRF-0004', 'BRF-0003'])
      // y la sala 3 entiende todos los elementos
      expect(elementosDelKit({ elementos: kit.elementos }).ilegibles).toEqual([])
      // no modifica lo que recibe
      expect(parte.entregables).toHaveLength(3)
    })
  }

  it('lote con 0 historias: no hay kit y el parte queda EXACTAMENTE como lo entregó el redactor', () => {
    const lote = [fila('a', '2026-10-19', '11:00', 'instagram', 'foto', 't', 'p', 'post_img')]
    const parte = { entregables: [ent('BRF-0001', 'a')] }
    const out = K.agruparKit(parte, lote)
    expect(out.kit).toBeNull(); expect(out.parte).toBe(parte)
  })
  it('lote con 1 historia: kit de 1 elemento', () => {
    const lote = [fila('h1', '2026-10-21', '19:15', 'instagram', 'historia', 'recordatorio', 'marca', 'kit_historias')]
    const out = K.agruparKit({ entregables: [] }, lote)
    expect(out.kit!.elementos).toEqual(['2026-10-21 19:15 | historia | recordatorio | marca'])
    expect(out.parte.entregables.map((e) => e.id)).toEqual(['BRF-0001'])
  })
  it('el redactor puede entregar lo macro en UN entregable con `fila_ids` o uno por fila: en los dos casos sale UN kit y nada queda suelto', () => {
    const lote = loteDe(RUBROS[0])
    const ids = lote.filter((f) => f.familia === 'kit_historias').map((f) => f.id)
    const macro = K.agruparKit({ entregables: [ent('BRF-0001', 's1-d1-a'), ent('BRF-0002', null, { fila_ids: ids, mensaje: 'macro' })] }, lote)
    const porFila = K.agruparKit({ entregables: [ent('BRF-0001', 's1-d1-a'), ...ids.map((x, i) => ent(`BRF-000${i + 2}`, x))] }, lote)
    for (const o of [macro, porFila]) {
      expect(o.parte.entregables.filter((e) => e.es_kit)).toHaveLength(1)
      expect(o.parte.entregables.filter((e) => e.fila_id && ids.includes(e.fila_id))).toHaveLength(0)
    }
    expect(macro.kit!.absorbidos).toEqual(['BRF-0002']); expect(porFila.kit!.absorbidos).toHaveLength(ids.length)
  })
  it('si el redactor no dijo nada de las historias, el kit sale igual (las filas las cubre el código) y va al final', () => {
    const lote = loteDe(RUBROS[2])
    const out = K.agruparKit({ entregables: [ent('BRF-0001', 's1-d1-a')] }, lote)
    expect(out.parte.entregables.map((e) => e.id)).toEqual(['BRF-0001', 'BRF-0002'])
    expect(out.parte.entregables[1].es_kit).toBe(true)
  })
  it('fecha u hora ilegibles NO se corrigen: entran tal cual y la sala 3 las rechaza', () => {
    const mala = fila('h1', '2026-02-31', '10:00', 'instagram', 'historia', 'tema', 'marca', 'kit_historias')
    const horaMala = fila('h2', '2026-10-21', '25:99', 'instagram', 'historia', 'tema', 'marca', 'kit_historias')
    const sinFecha = fila('h3', '', null, 'instagram', 'historia', 'tema', 'marca', 'kit_historias')
    const lineas = [mala, horaMala, sinFecha].map((f) => K.lineaDeElemento(f))
    expect(lineas[0].startsWith('2026-02-31 10:00 |')).toBe(true); expect(lineas[1].startsWith('2026-10-21 25:99 |')).toBe(true); expect(lineas[2].startsWith('(fecha vacía) |')).toBe(true)
    expect(elementosDelKit({ elementos: lineas }).ilegibles).toHaveLength(3)
  })
  it('un tema con «|» o saltos de línea no rompe las columnas', () => {
    const l = K.lineaDeElemento(fila('h', '2026-10-21', '10:00', 'instagram', 'historia', 'a | b\nc', 'pilar', 'kit_historias'))
    expect(l.split('|').map((x) => x.trim())).toHaveLength(4)
    expect(elementosDelKit({ elementos: [l] }).ilegibles).toEqual([])
  })
})

// ───────────────────────── el nodo «④ Chequeos» de la copia por filas, ejecutado de verdad
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...a: unknown[]) => Promise<Array<{ json: Record<string, any> }>>
const codigoDe = (f: string) => (leerJson(f).nodes as Array<{ name: string; parameters: { jsCode?: string } }>).find((n) => n.name === '④ Chequeos')!.parameters.jsCode!
const ENTRADA = leerJson('__tests__/fixtures/copia-parte-entrada-r78.json') as Record<string, any>
async function nodo4(codigo: string, lote: Fila[], entregables: Array<Record<string, unknown>>) {
  const e = JSON.parse(JSON.stringify(ENTRADA)) as Record<string, any>
  const base = JSON.parse(String(e.simulacro_respuesta).replace(/^```json\s*/, '').replace(/```\s*$/, '')) as { parte: { entregables: Array<Record<string, any>> } }
  const plantilla = base.parte.entregables[0]
  e.filas_lote = lote; e.fila_ids = lote.map((f) => f.id)
  const completos = entregables.map((x) => ({ ...JSON.parse(JSON.stringify(plantilla)), ...x }))
  e.texto = '```json\n' + JSON.stringify({ parte: { ...base.parte, entregables: completos } }) + '\n```'
  const f = new AsyncFunction('$input', '$', '$json', '$workflow', '$execution', codigo)
  const sal = await f({ first: () => ({ json: e }) }, () => ({ first: () => ({ json: e }), all: () => [{ json: e }] }), e, { id: 'wf' }, { id: 'ex' })
  return sal[0].json
}

describe('copia por filas · «④ Chequeos» con el kit (r80)', () => {
  const despues = codigoDe('scripts/worker-staging/cadena/copia-r80-ARREGLADO.json')
  for (const r of RUBROS) {
    it(`${r.rubro}: el parte trae el kit con sus ELEMENTOS, cuenta las filas del kit como briefeadas y la sala 3 lo abre`, async () => {
      const lote = loteDe(r)
      const kitIds = lote.filter((f) => f.familia === 'kit_historias').map((f) => f.id)
      const out = await nodo4(despues, lote, [{ id: 'BRF-0001', fila_id: 's1-d1-a' }, { id: 'BRF-0002', fila_id: null, fila_ids: kitIds, mensaje: r.macro }, { id: 'BRF-0003', fila_id: 's1-d6-a', tipo_de_pieza: 'carrusel' }])
      const marcas = (out.hallazgos as Array<{ chequeo: string }>).map((h) => h.chequeo)
      for (const fatal of ['fila_sin_brief', 'fila_repetida', 'fila_ajena', 'tipo_desconocido']) expect(marcas, fatal).not.toContain(fatal)
      expect(out.parte_valido).toBe(true)
      const fam = out.fila_parte.provenance_tag.familias_por_brief as Array<Record<string, unknown>>
      const kit = fam.find((x) => x.familia === 'kit_historias')!
      expect(fam.filter((x) => x.familia === 'kit_historias')).toHaveLength(1)
      expect(kit.fila_ids).toEqual(kitIds)
      expect(out.fila_parte.provenance_tag.kit).toMatchObject({ filas: kitIds.length })
      // el parte, tal como lo lee la oficina
      const md = String(out.parte_md)
      const brief = parsearBrief(md, String(kit.brief_id))!
      expect(brief.formato).toBe('kit de historias'); expect(esKitDeHistorias(brief)).toBe(true)
      const k = elementosDelKit(brief)
      expect(k.ilegibles).toEqual([]); expect(k.elementos).toHaveLength(kitIds.length)
      expect(k.elementos.map((x) => x.fecha)).toEqual(lote.filter((f) => f.familia === 'kit_historias').map((f) => f.fecha))
      expect(k.elementos.some((x) => x.destino === 'estado')).toBe(true)
      // sala 3: el encargo abre (no falla en la lectura del kit)
      const M = crearMemoria({ parte: md, plantilla: KIT_HISTORIAS })
      const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: String(kit.brief_id), dry_run: true, familia: 'kit_historias' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
      expect(a.status).toBe(200); expect(a.cuerpo.estado).not.toBe('fallido')
    })
  }
  it('el redactor omite las historias: el chequeo NO marca `fila_sin_brief` (las filas las cubre el kit)', async () => {
    const lote = loteDe(RUBROS[0])
    const out = await nodo4(despues, lote, [{ id: 'BRF-0001', fila_id: 's1-d1-a' }, { id: 'BRF-0002', fila_id: 's1-d6-a', tipo_de_pieza: 'carrusel' }])
    expect((out.hallazgos as Array<{ chequeo: string }>).map((h) => h.chequeo)).not.toContain('fila_sin_brief')
  })
  it('sigue marcando lo que debe: una fila que NO es de kit y no salió briefeada se marca; una fila ajena también', async () => {
    const lote = loteDe(RUBROS[1])
    const sinFoto = await nodo4(despues, lote, [{ id: 'BRF-0001', fila_id: 's1-d6-a', tipo_de_pieza: 'carrusel' }])
    expect((sinFoto.hallazgos as Array<{ chequeo: string; entregable: string }>).filter((h) => h.chequeo === 'fila_sin_brief').map((h) => h.entregable)).toEqual(['s1-d1-a'])
    const ajena = await nodo4(despues, lote, [{ id: 'BRF-0001', fila_id: 's1-d1-a' }, { id: 'BRF-0002', fila_id: 's9-d9-z' }, { id: 'BRF-0003', fila_id: 's1-d6-a' }])
    expect((ajena.hallazgos as Array<{ chequeo: string }>).map((h) => h.chequeo)).toContain('fila_ajena')
  })
  it('sin filas de kit en el lote el parte sale como antes (sin kit, sin ELEMENTOS)', async () => {
    const lote = loteDe(RUBROS[0]).filter((f) => f.familia !== 'kit_historias')
    const antes = await nodo4(codigoDe('scripts/worker-staging/cadena/copia-r80-ANTES.json'), lote, [{ id: 'BRF-0001', fila_id: 's1-d1-a' }, { id: 'BRF-0002', fila_id: 's1-d6-a', tipo_de_pieza: 'carrusel' }])
    const ahora = await nodo4(despues, lote, [{ id: 'BRF-0001', fila_id: 's1-d1-a' }, { id: 'BRF-0002', fila_id: 's1-d6-a', tipo_de_pieza: 'carrusel' }])
    expect(String(ahora.parte_md)).not.toMatch(/ELEMENTOS|kit de historias/)
    expect(ahora.parte_md.replace(/\d{4}-\d{2}-\d{2}/g, 'F')).toBe(antes.parte_md.replace(/\d{4}-\d{2}-\d{2}/g, 'F'))
    expect(ahora.fila_parte.provenance_tag.kit).toBeNull()
  })
  it('una fila de historia con fecha ilegible: el parte sale, pero la sala 3 falla visible (no se corrige solo)', async () => {
    const lote = loteDe(RUBROS[0]).map((f) => (f.id === 's1-d2-h' ? { ...f, fecha: '2026-13-45' } : f))
    const kitIds = lote.filter((f) => f.familia === 'kit_historias').map((f) => f.id)
    const out = await nodo4(despues, lote, [{ id: 'BRF-0001', fila_id: 's1-d1-a' }, { id: 'BRF-0002', fila_ids: kitIds, fila_id: null }, { id: 'BRF-0003', fila_id: 's1-d6-a' }])
    const kit = (out.fila_parte.provenance_tag.familias_por_brief as Array<Record<string, string>>).find((x) => x.familia === 'kit_historias')!
    const M = crearMemoria({ parte: String(out.parte_md), plantilla: KIT_HISTORIAS })
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: kit.brief_id, dry_run: true, familia: 'kit_historias' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    expect(a.cuerpo).toMatchObject({ estado: 'fallido' }); expect(String(a.cuerpo.motivo)).toMatch(/no se entienden/)
  })
})

describe('el constructor de la r80', () => {
  const nodos = (f: string) => leerJson(f).nodes as Array<{ name: string; parameters: Record<string, any> }>
  it('cambia SOLO los nodos ③ y ④; el pedido nombra la familia y la excepción del kit', () => {
    const a = nodos('scripts/worker-staging/cadena/copia-r80-ANTES.json'), d = nodos('scripts/worker-staging/cadena/copia-r80-ARREGLADO.json')
    expect(d.length).toBe(a.length)
    const distintos = d.filter((n) => JSON.stringify(n.parameters) !== JSON.stringify(a.find((x) => x.name === n.name)!.parameters)).map((n) => n.name)
    expect(distintos.sort()).toEqual(['③ Armar el cuerpo del redactor', '④ Chequeos'])
    const pedido = d.find((n) => n.name === '③ Armar el cuerpo del redactor')!.parameters.jsCode as string
    expect(pedido).toContain('familia: f.familia || null'); expect(pedido).toMatch(/«kit_historias»[^']*UN solo entregable MACRO/)
    expect(a.find((n) => n.name === '③ Armar el cuerpo del redactor')!.parameters.jsCode).not.toContain('kit_historias')
  })
  it('el pedido queda en tuteo y sin dinero: la regla nueva no trae voseo ni cifras', () => {
    const d = nodos('scripts/worker-staging/cadena/copia-r80-ARREGLADO.json').find((n) => n.name === '③ Armar el cuerpo del redactor')!.parameters.jsCode as string
    const regla = /EXCEPCIÓN: las filas[^']*/.exec(d)![0]
    expect(regla).not.toMatch(/\b(vos|tenés|sabés|hacé|decí|pedí|mirá)\b/i); expect(regla).not.toMatch(/[$]|US\$|precio|presupuesto/i)
  })
})
