/**
 * 01-nov · Náufrago estuvo ~16 h pausado por «1 ficha viva repetida»: dos comentarios de Instagram con el MISMO texto (ids distintos) entraron en una misma corrida y nacieron dos fichas con la misma
 * referencia. Aquí: (1) el escritor no puede dejar dos vivas, (2) lo que escapa (dos corridas a la vez) se retira al escribir, (3) el vigilante retira la sobrante que se resuelve sin dudas y SIGUE;
 * solo pausa lo que no puede resolver. Con los diez clientes de prueba. US$ 0 · base falsa.
 */
import { describe, expect, it } from 'vitest'
import { planDeArchivo } from '../archivar'
import { evaluarCliente } from '../vigilante'
import { retirarSobrantesDeLasRefs } from '../repetidas'
import { reconciliarPuente, sobrantesResolubles } from '../puente'
import type { Unidad } from '../unidades'
import type { ItemParaJuzgar } from '../juez'
import { crearBaseFalsa } from './base-falsa'
import { DIEZ_CLIENTES } from './diez-clientes.fixtures'
import { tablasDe, type T } from './diez-clientes.tablas'
import { AHORA, montar } from './fixtures-despertar'

const unidad = (o: Partial<Unidad>): Unidad => ({ fuente: 'comentarios', ref: 'https://www.instagram.com/p/x/', unidad_ref: 'c1', texto: 'qué rico se ve todo, me encanta', clase_dato: 'acumula', atributo: null, autoria: 'tercero', huella: '27d51b923716fd526d0e61da', fecha_fuente: null, apify_raw_id: 'raw1', observado_en: '2026-11-01T00:32:34.379Z', ...o })
const item = (o: Partial<ItemParaJuzgar> = {}): ItemParaJuzgar => ({ n: 1, unidad_clave: 'comentarios|c1', fuente: 'comentarios', autoria: 'tercero', clase_dato: 'acumula', atributo: null, texto: 'qué rico se ve todo, me encanta', fecha: '2026-11-01', vigente: null, ...o })
const suma = (n: number) => ({ n, decision: 'suma' as const, reemplaza_ficha: null, razon: '', cita: null, decidido_por: 'sistema' as const })
let k = 0
const nuevoId = () => `nueva-${++k}`
const ahora = new Date('2026-11-01T01:00:00Z')

describe('el escritor no deja dos vivas', () => {
  it('dos comentarios con el mismo texto (ids distintos) en la misma corrida: UNA ficha, la otra queda como repetida apuntando a ella', () => {
    const a = unidad({ unidad_ref: 'c-17914388996965767' }), b = unidad({ unidad_ref: 'c-17994186386606540' })
    const p = planDeArchivo({ client_id: 'C1', items: [{ unidad: a, item: item() }, { unidad: b, item: item({ n: 2 }) }], decisiones: [suma(1), suma(2)], descartadas: [], sin_confirmar: [], ahora, puente_al_indice: true, nuevoId })
    expect(p.fichas).toHaveLength(1)
    expect(p.puente).toHaveLength(1)
    expect(p.resumen.repetidas).toBe(1)
    expect(p.vistas).toHaveLength(2)
    expect(p.vistas[1]).toMatchObject({ unidad_ref: 'c-17994186386606540', veredicto: 'repetida', ficha_id: p.fichas[0].id })
  })
  it('la referencia ya estaba viva de antes: no se crea otra y la vista apunta a la que ya existía', () => {
    const a = unidad({ unidad_ref: 'c-nuevo' })
    const ref = `portero:comentarios:${a.huella.slice(0, 16)}`
    const p = planDeArchivo({ client_id: 'C1', items: [{ unidad: a, item: item() }], decisiones: [suma(1)], descartadas: [], sin_confirmar: [], ahora, puente_al_indice: true, nuevoId, refsVivas: new Map([[ref, 'F-VIVA']]) })
    expect(p.fichas).toHaveLength(0)
    expect(p.vistas[0]).toMatchObject({ veredicto: 'repetida', ficha_id: 'F-VIVA' })
  })
  it('una referencia VIVA que este mismo plan retira (reemplaza) no bloquea a su reemplazo', () => {
    const a = unidad({ unidad_ref: 'c-r', atributo: 'precio:x', clase_dato: 'atributo' })
    const ref = `portero:comentarios:${a.huella.slice(0, 16)}`
    const d = [{ n: 1, decision: 'reemplaza' as const, reemplaza_ficha: 'F-VIEJA', razon: 'subió', cita: 'x', decidido_por: 'modelo' as const }]
    const p = planDeArchivo({ client_id: 'C1', items: [{ unidad: a, item: item({ atributo: 'precio:x', clase_dato: 'atributo' }) }], decisiones: d, descartadas: [], sin_confirmar: [], ahora, puente_al_indice: true, nuevoId, refsVivas: new Map([[ref, 'F-VIEJA']]) })
    expect(p.fichas).toHaveLength(1)
    expect(p.retiros).toHaveLength(1)
  })
  it('lo que es DUDA (no se entrega) no cuenta como viva ni bloquea a una confirmada', () => {
    const a = unidad({ unidad_ref: 'c-d1' }), b = unidad({ unidad_ref: 'c-d2' })
    const duda = { n: 1, decision: 'duda' as const, reemplaza_ficha: null, razon: 'x', cita: null, decidido_por: 'modelo' as const }
    const p = planDeArchivo({ client_id: 'C1', items: [{ unidad: a, item: item() }, { unidad: b, item: item({ n: 2 }) }], decisiones: [duda, suma(2)], descartadas: [], sin_confirmar: [], ahora, puente_al_indice: true, nuevoId })
    expect(p.fichas.map((f) => f.entregable)).toEqual([false, true])
  })
  it('dos fuentes de sede distinta con el mismo texto SIGUEN siendo dos fichas (cada sede la suya)', () => {
    const a = unidad({ unidad_ref: 'l1', fuente: 'sitio', autoria: 'propia', sedes: ['quito'] } as Partial<Unidad>), b = unidad({ unidad_ref: 'l2', fuente: 'sitio', autoria: 'propia', sedes: ['cuenca'] } as Partial<Unidad>)
    const p = planDeArchivo({ client_id: 'C1', items: [{ unidad: a, item: item() }, { unidad: b, item: item({ n: 2 }) }], decisiones: [suma(1), suma(2)], descartadas: [], sin_confirmar: [], ahora, puente_al_indice: true, nuevoId })
    expect(p.fichas).toHaveLength(2)
    expect(new Set(p.fichas.map((f) => f.ref)).size).toBe(2)
  })
})

const ficha = (cid: string, id: string, o: Record<string, unknown> = {}) => ({ id, client_id: cid, ref: 'portero:comentarios:27d51b923716fd52', clase: 'comentarios', titulo: `comentarios · ${id}`, contenido: 'qué rico se ve todo, me encanta', fecha_fuente: null, observado_en: '2026-11-01T00:32:34.379Z', creado_en: '2026-11-01T00:37:37.800Z', propiedad: 'ajena', origen: 'tercero', descartada: false, retirada_en: null, prueba: false, huella: '27d51b923716fd526d0e61da', atributo: null, ...o })

describe('lo que escapa se resuelve: la regla pura y el escritor', () => {
  it('misma referencia + huella + atributo: queda la que el puente elige (la más antigua; empate, id menor) y la otra sobra', () => {
    const r = sobrantesResolubles([ficha('C', 'b4620f2c'), ficha('C', '41294896')] as never)
    expect(r).toEqual([{ id: 'b4620f2c', queda: '41294896' }])
  })
  it('otra referencia (otra sede) o otro atributo: NO es resoluble sin dudas', () => {
    expect(sobrantesResolubles([ficha('C', 'a'), ficha('C', 'b', { ref: 'portero:comentarios:27d51b923716fd52:quito' })] as never)).toEqual([])
    expect(sobrantesResolubles([ficha('C', 'a'), ficha('C', 'b', { atributo: 'precio:x' })] as never)).toEqual([])
  })
  it('el puente sigue contando la repetida y ahora dice cuál se resuelve', () => {
    const r = reconciliarPuente([ficha('C', 'a'), ficha('C', 'b')] as never, ['a'])
    expect(r.duplicadas).toBe(1)
    expect(r.resolubles).toEqual([{ id: 'b', queda: 'a' }])
  })
  it('dos corridas a la vez dejaron dos vivas: al escribir se vuelve a mirar y se retira la sobrante con fecha y motivo (nada se borra)', async () => {
    const t = { cerebro_fichas: [ficha('C', 'a'), ficha('C', 'b'), ficha('C', 'otra', { ref: 'portero:sitio:zz', huella: 'zz' })] } as never as T
    const base = crearBaseFalsa(t as never)
    const x = await retirarSobrantesDeLasRefs(base.db as never, 'C', ['portero:comentarios:27d51b923716fd52'], ahora, 'el portero al escribir')
    expect(x).toEqual({ retiradas: 1, errores: [] })
    const vivas = t.cerebro_fichas.filter((f) => !f.retirada_en).map((f) => f.id)
    expect(vivas).toEqual(['a', 'otra'])
    const b = t.cerebro_fichas.find((f) => f.id === 'b')!
    expect(b.retirada_en).toBe(ahora.toISOString())
    expect(b.motivo_retirada).toMatch(/repetida de a .*retiró la sobrante el 2026-11-01/)
    expect(b.reemplazada_por).toBe('a')
    expect(base.escrituras.every((e) => e.op === 'update')).toBe(true) // nunca un delete
  })
  it('una falla de lectura se DICE (no se lee como «no había nada»)', async () => {
    const base = crearBaseFalsa({ cerebro_fichas: [ficha('C', 'a'), ficha('C', 'b')] } as never, { fallaEn: 'cerebro_fichas' })
    const x = await retirarSobrantesDeLasRefs(base.db as never, 'C', ['portero:comentarios:27d51b923716fd52'], ahora, 'q')
    expect(x.retiradas).toBe(0)
    expect(x.errores[0]).toMatch(/repetidas: falla simulada/)
  })
})

describe('el vigilante retira la sobrante que se resuelve sin dudas y el cliente SIGUE (diez clientes)', () => {
  const dia = AHORA.toISOString().slice(0, 10)
  const evaluar = (t: T, c: (typeof DIEZ_CLIENTES)[number], retirarRepetidas: boolean) =>
    evaluarCliente({ ...montar(t).deps, db: crearBaseFalsa(t as never).db } as never, { client_id: c.id, nombre: c.nombre }, { alimentar: { ok: true } }, AHORA, dia, { sinGasto: true, retirarRepetidas })
  for (const c of DIEZ_CLIENTES) {
    it(`${c.nombre} (${c.pais})`, async () => {
      // a) misma referencia, huella y atributo: se retira la sobrante y no queda problema de repetidas
      const t = tablasDe(c)
      t.cerebro_fichas.push(ficha(c.id, 'a'), ficha(c.id, 'b'))
      t.client_brain_chunks.push({ client_id: c.id, source_table: 'cerebro_fichas', source_id: 'a' })
      const r1 = await evaluar(t, c, true)
      expect(r1.r.problemas.filter((p) => /repetida/.test(p)), JSON.stringify(r1.r.problemas)).toEqual([])
      expect(r1.r.repetidas_retiradas).toBe(1)
      expect(t.cerebro_fichas.filter((f) => f.client_id === c.id && !f.retirada_en).map((f) => f.id)).toEqual(['a'])
      expect(t.cerebro_fichas.find((f) => f.id === 'b')).toMatchObject({ reemplazada_por: 'a' })
      expect(String(t.cerebro_fichas.find((f) => f.id === 'b')!.motivo_retirada)).toMatch(/el vigilante retiró la sobrante/)
      // b) sin la opción (despertar, dry_run) NO escribe y el problema sigue diciéndose
      const t2 = tablasDe(c)
      t2.cerebro_fichas.push(ficha(c.id, 'a'), ficha(c.id, 'b'))
      const r2 = await evaluar(t2, c, false)
      expect(r2.r.problemas.join(' ')).toMatch(/1 ficha\(s\) viva\(s\) repetida\(s\)/)
      expect(t2.cerebro_fichas.filter((f) => !f.retirada_en)).toHaveLength(2)
      // c) NO resoluble (misma huella pero otra referencia): se deja y SÍ pausa
      const t3 = tablasDe(c)
      t3.cerebro_fichas.push(ficha(c.id, 'a'), ficha(c.id, 'b', { ref: 'portero:comentarios:27d51b923716fd52:otra' }))
      const r3 = await evaluar(t3, c, true)
      expect(r3.r.problemas.join(' ')).toMatch(/repetida/)
      expect(r3.r.repetidas_retiradas).toBeUndefined()
      expect(t3.cerebro_fichas.filter((f) => !f.retirada_en)).toHaveLength(2)
      // d) mismo texto pero OTRO atributo: tampoco es resoluble sin dudas
      const t4 = tablasDe(c)
      t4.cerebro_fichas.push(ficha(c.id, 'a'), ficha(c.id, 'b', { atributo: 'precio:x' }))
      const r4 = await evaluar(t4, c, true)
      expect(r4.r.problemas.join(' ')).toMatch(/repetida/)
      expect(t4.cerebro_fichas.filter((f) => !f.retirada_en)).toHaveLength(2)
    })
  }
  it('solo toca al cliente evaluado: la ficha repetida de OTRO cliente no se retira', async () => {
    const [c, otro] = DIEZ_CLIENTES
    const t = tablasDe(c)
    t.cerebro_fichas.push(ficha(c.id, 'a'), ficha(c.id, 'b'), ficha(otro.id, 'x'), ficha(otro.id, 'y'))
    await evaluar(t, c, true)
    expect(t.cerebro_fichas.filter((f) => f.client_id === otro.id && !f.retirada_en)).toHaveLength(2)
  })
})

// ───── más cobertura: lo que cada defensa NO debe hacer, y la corrida entera (alimentar) con comentarios repetidos
import { alimentarCliente } from '../alimentar'
import { retirarSobrantes } from '../repetidas'
import { ON } from './fixtures-despertar'

describe('cada defensa hace solo lo suyo', () => {
  it('una DUDA con la referencia ya viva se archiva igual (incierta): no cuenta como repetida', () => {
    const a = unidad({ unidad_ref: 'c-duda' })
    const ref = `portero:comentarios:${a.huella.slice(0, 16)}`
    const duda = { n: 1, decision: 'duda' as const, reemplaza_ficha: null, razon: 'x', cita: null, decidido_por: 'modelo' as const }
    const p = planDeArchivo({ client_id: 'C1', items: [{ unidad: a, item: item() }], decisiones: [duda], descartadas: [], sin_confirmar: [], ahora, puente_al_indice: true, nuevoId, refsVivas: new Map([[ref, 'F-VIVA']]) })
    expect(p.fichas).toHaveLength(1)
    expect(p.resumen.repetidas).toBe(0)
  })
  it('sin huella no hay forma de decir «es lo mismo»: no se retira nada', () => {
    expect(sobrantesResolubles([ficha('C', 'a', { huella: null }), ficha('C', 'b', { huella: null })] as never)).toEqual([])
  })
  it('una ficha ya retirada no se vuelve a retirar (conserva su fecha y motivo), y la de otro cliente no se toca', async () => {
    const t = { cerebro_fichas: [ficha('C', 'a', { retirada_en: '2026-10-20T00:00:00Z', motivo_retirada: 'antes' }), ficha('OTRO', 'z')] } as never as T
    const base = crearBaseFalsa(t as never)
    await retirarSobrantes(base.db as never, 'C', [{ id: 'a', queda: 'q' }, { id: 'z', queda: 'q' }], ahora, 'el vigilante')
    expect(t.cerebro_fichas.find((f) => f.id === 'a')).toMatchObject({ retirada_en: '2026-10-20T00:00:00Z', motivo_retirada: 'antes' })
    expect(t.cerebro_fichas.find((f) => f.id === 'z')!.retirada_en).toBeNull()
  })
  it('si la base rechaza la retirada, se DICE y no se cuenta como retirada', async () => {
    const t = { cerebro_fichas: [ficha('C', 'a'), ficha('C', 'b')] } as never as T
    const base = crearBaseFalsa(t as never, { fallaEn: 'cerebro_fichas' })
    const x = await retirarSobrantes(base.db as never, 'C', [{ id: 'b', queda: 'a' }], ahora, 'el vigilante')
    expect(x.retiradas).toBe(0)
    expect(x.errores[0]).toMatch(/retirar b: falla simulada/)
  })
  it('lo que no se entrega (descartada, incierta, de prueba) no cuenta como viva repetida', async () => {
    const t = { cerebro_fichas: [ficha('C', 'a'), ficha('C', 'b', { descartada: true }), ficha('C', 'c', { propiedad: 'incierta' }), ficha('C', 'd', { prueba: true })] } as never as T
    const x = await retirarSobrantesDeLasRefs(crearBaseFalsa(t as never).db as never, 'C', ['portero:comentarios:27d51b923716fd52'], ahora, 'q')
    expect(x.retiradas).toBe(0)
    expect(t.cerebro_fichas.filter((f) => !f.retirada_en)).toHaveLength(4)
  })
})

describe('la corrida entera (alimentar) con comentarios del mismo texto', () => {
  const c = DIEZ_CLIENTES[0]
  const comentarios = (items: Array<{ id: string; text: string }>) => ({ id: `${c.id}-com-${items[0].id}`, client_id: c.id, apify_function: 'instagram_post_comments_scraper', ensayo: false, created_at: new Date(AHORA.getTime() - 60_000).toISOString(), params: {}, respuesta: items })
  const T0 = 'qué rico se ve todo, me encanta el lugar'
  const correr = (t: T, extra: Record<string, unknown> = {}) => alimentarCliente({ db: crearBaseFalsa(t as never).db as never, client_id: c.id, dry_run: false, interruptores: { ...ON }, ahora: AHORA, workflow_id: 'wf', workflow_execution_id: 'ex', ...extra })
  const vivasDeComentarios = (t: T) => t.cerebro_fichas.filter((f) => f.client_id === c.id && f.clase === 'comentarios' && !f.retirada_en && !f.descartada)

  it('dos comentarios con el mismo texto y ids distintos dejan UNA ficha viva (y ambos quedan vistos)', async () => {
    const t = tablasDe(c); t.apify_raw.push(comentarios([{ id: '1791', text: T0 }, { id: '1799', text: T0 }]))
    const r = await correr(t)
    expect(r.errores).toEqual([])
    expect(vivasDeComentarios(t)).toHaveLength(1)
    expect(t.cerebro_unidades_vistas.filter((v) => v.fuente === 'comentarios')).toHaveLength(2)
    // y al día siguiente, con otro id y el mismo texto, tampoco nace otra
    t.apify_raw.push(comentarios([{ id: '1805', text: T0 }]))
    const r2 = await correr(t, { forzar: true })
    expect(r2.unidades).toBeGreaterThan(0) // la segunda corrida SÍ leyó el comentario nuevo
    expect(vivasDeComentarios(t)).toHaveLength(1)
    // no nació una segunda para retirarla después: el escritor ni la creó
    expect(t.cerebro_fichas.filter((f) => f.client_id === c.id && f.clase === 'comentarios')).toHaveLength(1)
    expect(r2.escrituras.repetidas_retiradas).toBeUndefined()
  })
  it('una ficha incierta o descartada con esa referencia NO impide que nazca la confirmada', async () => {
    const t = tablasDe(c); t.apify_raw.push(comentarios([{ id: '1791', text: T0 }]))
    const r0 = await correr(structuredClone(t) as T)
    const ref = (r0.plan?.fichas ?? []).find((f) => f.clase === 'comentarios')!.ref
    t.cerebro_fichas.push(ficha(c.id, 'vieja-incierta', { ref, propiedad: 'incierta', descartada: true }))
    await correr(t, { forzar: true })
    expect(vivasDeComentarios(t)).toHaveLength(1)
  })
  it('dos corridas a la vez (otra escribió lo mismo entre la lectura y la escritura): al escribir se retira la sobrante', async () => {
    const t = tablasDe(c); t.apify_raw.push(comentarios([{ id: '1791', text: T0 }]))
    const base = crearBaseFalsa(t as never)
    const from = base.db.from.bind(base.db)
    const db = { from: (tabla: string) => {
      const q = from(tabla) as unknown as Record<string, (...a: unknown[]) => unknown>
      if (tabla === 'cerebro_fichas') { const ins = q.insert; q.insert = (f: unknown) => { if ((f as { clase?: string }).clase === 'comentarios') t.cerebro_fichas.push({ ...(f as object), id: 'rival', creado_en: '2026-11-01T00:00:01Z' }); return ins(f) } }
      return q
    } }
    const r = await alimentarCliente({ db: db as never, client_id: c.id, dry_run: false, interruptores: { ...ON }, ahora: AHORA, workflow_id: 'wf', workflow_execution_id: 'ex' })
    expect(vivasDeComentarios(t)).toHaveLength(1)
    expect(r.escrituras.repetidas_retiradas).toBe(1)
    expect(t.cerebro_fichas.find((f) => f.id === 'rival')!.motivo_retirada).toMatch(/el portero al escribir retiró la sobrante/)
  })
})
