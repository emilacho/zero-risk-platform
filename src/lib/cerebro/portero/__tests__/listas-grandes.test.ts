/**
 * PASO 6 · LISTAS GRANDES POR NIVELES (diseño v3 §3), con el modelo SIMULADO. Ninguna llamada real.
 * El modelo escoge qué grupos abrir (estante → clase → familia); lo abierto se lee ENTERO (en trozos si aún no cabe); la coincidencia por palabras NO existe
 * y una prueba permanente impide que vuelva. Las listas chicas se comportan EXACTAMENTE como antes (se compara contra el resultado guardado del código anterior).
 * Los casos W3 del dorado NO se usan aquí para afinar nada: todo está inventado para esta prueba.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { A, AHORA, crearBaseFalsa, tablasDeLaBase } from '../../__tests__/casos'
import type { Ficha } from '../../tipos'
import { agruparLineas, indiceDeGrupos, trocear } from '../estantes'
import { INSTRUCCION_DE_CLASES, INSTRUCCION_DE_ESTANTES, INSTRUCCION_DE_FAMILIAS, INSTRUCCION_DEL_PORTERO } from '../instruccion'
import { numerarLista } from '../lista-numerada'
import { estimarTokens, TOPE_DE_ENTRADA_EN_TOKENS } from '../medida'
import { costoDeLaLlamada, razonar, TOPE_DE_GASTO_POR_PEDIDO_USD, type DepsDeRazonar, type PeticionAlModelo, type RespuestaDelModelo } from '../razonar'
import { correrEscenario, escenariosDeListaChica } from './escenarios-de-lista'
import { sinLaExcepcion } from './excepcion-normalizar-nombre'

// ───────────────────────── herramientas
const QUE_ES = 'ficha de un producto del catálogo con su presentación, su medida y su precio de lista vigente'
const ficha = (i: number, estante: Ficha['estante'], clase: string, titulo: string, familia?: string): Ficha => ({
  ref: `prueba:${estante}-${clase}-${String(i).padStart(4, '0')}`, estante, clase, titulo, que_es: QUE_ES, origen: 'su_fuente', estado: 'visto_en_su_fuente',
  fecha_fuente: '2026-09-20T00:00:00.000Z', vigente_hasta: null, vencido: false, peso_estimado: 300 + (i % 7) * 40, ...(familia ? { datos: { familia } } : {}),
})
const familiaDe = (i: number) => `Familia ${String(i % 20).padStart(2, '0')}`
/** estantes chicos + un E2 grande con dos clases y 20 familias: 536 líneas */
function listaTresNiveles(): Ficha[] {
  const f: Ficha[] = []
  for (let i = 0; i < 5; i++) f.push(ficha(i, 'E1', 'plan', `Plan de comunicación ${i}`))
  for (let i = 0; i < 480; i++) f.push(ficha(i, 'E2', 'catalogo_item', `Producto ${String(i).padStart(4, '0')} de la línea ${i % 20}`, familiaDe(i)))
  for (let i = 0; i < 30; i++) f.push(ficha(i, 'E2', 'catalogo_familia', `Resumen ${i}`, familiaDe(i)))
  for (let i = 0; i < 13; i++) f.push(ficha(i, 'E3', 'sede', `Sede ${i}`))
  for (let i = 0; i < 7; i++) f.push(ficha(i, 'E5', 'foto', `Foto ${i}`))
  f.push(ficha(0, 'E6', 'sitio', 'Página principal'))
  return f
}
/** un E2 grande de UNA clase y sin familias, más estantes chicos: ya no se puede subdividir */
function listaPlana(n = 545): Ficha[] {
  const f: Ficha[] = []
  for (let i = 0; i < 5; i++) f.push(ficha(i, 'E1', 'plan', `Plan de comunicación ${i}`))
  for (let i = 0; i < n; i++) f.push(ficha(i, 'E2', 'catalogo_item', `Producto ${String(i).padStart(4, '0')} · referencia ${(i * 7919) % 10007}`))
  for (let i = 0; i < 13; i++) f.push(ficha(i, 'E3', 'sede', `Sede ${i}`))
  return f
}

type Contesta = (p: PeticionAlModelo, n: number) => string | Error | (Partial<RespuestaDelModelo> & { texto: string })
function armar(contesta: Contesta, over: Partial<DepsDeRazonar> = {}) {
  const espia = { peticiones: [] as PeticionAlModelo[], registros: [] as Array<Record<string, unknown>> }
  const base = crearBaseFalsa(tablasDeLaBase())
  const deps: DepsDeRazonar = {
    consulta: base.consulta,
    llamarModelo: async (p) => {
      espia.peticiones.push(p)
      const r = contesta(p, espia.peticiones.length)
      if (r instanceof Error) throw r
      const o = typeof r === 'string' ? { texto: r } : r
      return { usage: { input_tokens: 7000, output_tokens: 600 }, ...o }
    },
    registrar: async (fila) => { espia.registros.push(fila); return { ok: true } },
    ahora: () => AHORA,
    ...over,
  }
  return { deps, espia }
}
const cuerpo = (extra: Record<string, unknown> = {}) => ({
  cliente: A, workflow_id: 'wf-prueba', workflow_execution_id: 'ex-1', prueba: true,
  voy_a_producir: { output: 'carrusel de reels', material: 'video', canal: 'red social', objetivo: 'vender el servicio uno' },
  necesito: 'tengo que hacer un carrusel de reels', ronda: 1, ...extra,
})
const conLista = (fichas: Ficha[], extra: Record<string, unknown> = {}) => cuerpo({ lista_de_prueba: fichas, ...extra })
const salida = (r: { cuerpo: Record<string, unknown> }) => r.cuerpo as Record<string, any>
const numerosDe = (texto: string) => [...texto.matchAll(/^#(\d+) /gm)].map((m) => Number(m[1]))
const listaDe = (p: PeticionAlModelo) => /<lista>\n([\s\S]*)\n<\/lista>/.exec(p.messages[0].content)![1]
const bloque = (p: PeticionAlModelo, etiqueta: string) => new RegExp(`<${etiqueta}>\\n([\\s\\S]*)\\n</${etiqueta}>`).exec(p.messages[0].content)![1]
const decision = (n: number[], extra: Record<string, unknown> = {}) => JSON.stringify({ entregar: n, pixeles: [], por_que: [{ numeros: n.slice(0, 1), linea: 'sirve' }], faltantes: [], duda: [], ...extra })
const completa = (f: Ficha[]) => numerarLista({ cliente_id: 'x', generada_en: 'x', estado: 'ok', fuentes: {} as never, lineas: f })

/** el modelo simulado de la navegación: cada nivel devuelve lo que se le diga; la decisión final, los primeros números */
const navega = (estantes: string[], clases?: string[], familias?: string[], final: (n: number[]) => string = (n) => decision(n.slice(0, 3))): Contesta => (p) => {
  if (p.system === INSTRUCCION_DE_ESTANTES) return JSON.stringify({ estantes, por_que: 'x' })
  if (p.system === INSTRUCCION_DE_CLASES) return JSON.stringify({ clases: clases ?? [], por_que: 'x' })
  if (p.system === INSTRUCCION_DE_FAMILIAS) return JSON.stringify({ familias: familias ?? [], por_que: 'x' })
  return final(numerosDe(listaDe(p)))
}

// ───────────────────────── 1 · la coincidencia por palabras NO vuelve
describe('la coincidencia por palabras no existe y una prueba permanente impide que vuelva', () => {
  const CARPETA = path.resolve(__dirname, '..')
  const sinComentarios = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  const codigo = () => fs.readdirSync(CARPETA).filter((f) => f.endsWith('.ts')).map((f) => ({ f, t: sinComentarios(fs.readFileSync(path.join(CARPETA, f), 'utf8')) }))

  it('ningún archivo del portero nombra la búsqueda por palabras: ni palabrasDelPedido, ni puntaje, ni el tope de 100, ni recortada_por_coincidencia', () => {
    expect(codigo().length).toBeGreaterThan(8)
    for (const { f, t } of codigo()) {
      expect(t, f).not.toMatch(/palabrasDelPedido|\bpuntaje\b|recortada_por_coincidencia|MAXIMO_DE_LINEAS_POR_ESTANTE|SIN_VALOR|coincidencia|coincid/i)
    }
  })
  it('ni siquiera una versión disfrazada: nada del portero parte el pedido en palabras para compararlas con las líneas', () => {
    for (const { f, t } of codigo()) {
      const revisado = sinLaExcepcion(`src/lib/cerebro/portero/${f}`, t) // la ÚNICA excepción, con nombre: ver excepcion-normalizar-nombre.ts
      expect(revisado, f).not.toMatch(/split\(\s*\/\[\^a-z0-9\]/)
      expect(revisado, f).not.toMatch(/normalize\('NFD'\)/)
    }
  })
  it('una línea SIN ninguna palabra en común con el pedido sigue alcanzable, esté donde esté en el estante grande', async () => {
    for (const posicion of [0, 1, 272, 543, 544]) {
      const f = listaPlana()
      const rara = f.find((x) => x.ref === `prueba:E2-catalogo_item-${String(posicion).padStart(4, '0')}`)!
      rara.titulo = 'Xqzv wjkp'; rara.que_es = 'zzzz qqqq'
      const { deps, espia } = armar(navega(['E2']))
      const r = salida(await razonar(deps, conLista(f, { necesito: 'carrusel de reels para vender el servicio uno' })))
      const numeroRaro = completa(f).lineas.find((l) => l.ficha.ref === rara.ref)!.numero
      const enCuantas = espia.peticiones.slice(1).filter((p) => numerosDe(listaDe(p)).includes(numeroRaro)).length
      expect(enCuantas, `posición ${posicion}`).toBe(1)
      expect(r.modo).toBe('conversado')
    }
  })
  it('y el modelo puede entregarla: sale en la decisión con su referencia', async () => {
    const f = listaPlana()
    const rara = f.find((x) => x.ref === 'prueba:E2-catalogo_item-0400')!
    rara.titulo = 'Xqzv wjkp'; rara.que_es = 'zzzz qqqq'
    const numeroRaro = completa(f).lineas.find((l) => l.ficha.ref === rara.ref)!.numero
    const { deps } = armar(navega(['E2'], undefined, undefined, (n) => (n.includes(numeroRaro) ? decision([numeroRaro]) : decision([]))))
    const r = salida(await razonar(deps, conLista(f)))
    expect(r.decision.entregar).toEqual([rara.ref])
  })
  it('el orden de los grupos y su índice NO dependen de las palabras del pedido (dos pedidos opuestos ven el mismo índice)', async () => {
    const indices: string[][] = []
    for (const necesito of ['carrusel de reels para vender el servicio uno', 'xqzv wjkp zzzz qqqq nada que ver con el catálogo']) {
      const { deps, espia } = armar(navega(['E2'], ['E2 catalogo_item'], ['Familia 07']))
      await razonar(deps, conLista(listaTresNiveles(), { necesito }))
      indices.push([bloque(espia.peticiones[0], 'estantes'), bloque(espia.peticiones[1], 'clases'), bloque(espia.peticiones[2], 'familias')])
    }
    expect(indices[0]).toEqual(indices[1])
  })
})

// ───────────────────────── 2 · los niveles
describe('tres niveles: estante → clase → familia, el modelo escoge y el sistema abre', () => {
  it('recorre los tres niveles en orden y lee SOLO la familia elegida, con los números de la lista completa', async () => {
    const f = listaTresNiveles()
    const { deps, espia } = armar(navega(['E2'], ['E2 catalogo_item'], ['Familia 07']))
    const r = salida(await razonar(deps, conLista(f)))
    expect(espia.peticiones.map((p) => p.system)).toEqual([INSTRUCCION_DE_ESTANTES, INSTRUCCION_DE_CLASES, INSTRUCCION_DE_FAMILIAS, INSTRUCCION_DEL_PORTERO])
    const full = completa(f)
    const esperados = full.lineas.filter((l) => l.ficha.clase === 'catalogo_item' && l.ficha.datos?.familia === 'Familia 07').map((l) => l.numero)
    expect(esperados).toHaveLength(24)
    expect(numerosDe(listaDe(espia.peticiones[3]))).toEqual(esperados)
    expect(r).toMatchObject({ modo: 'conversado', pasadas: 4, llamo_al_modelo: true })
    expect(r.niveles.map((n: any) => n.nivel)).toEqual(['estante', 'clase', 'familia'])
    expect(r.niveles[1]).toMatchObject({ grupos_ofrecidos: 2, grupos_elegidos: ['E2 catalogo_item'] })
    expect(r.niveles[2]).toMatchObject({ grupos_ofrecidos: 20, grupos_elegidos: ['Familia 07'] })
    expect(r.lectura_final).toEqual({ lineas_mostradas: 24, lineas_completas: 0, lineas_no_mostradas: f.length - 24, trozos: 1 })
    expect(r.pasada_1).toMatchObject({ estantes_elegidos: ['E2'], estantes_invalidos: [] })
  })
  it('cada nivel ofrece lo que hay: una línea por grupo con su conteo, y las familias salen del campo de la propia ficha', async () => {
    const { deps, espia } = armar(navega(['E2'], ['E2 catalogo_item'], ['Familia 07']))
    await razonar(deps, conLista(listaTresNiveles()))
    expect(bloque(espia.peticiones[0], 'estantes').split('\n')).toHaveLength(5)
    expect(bloque(espia.peticiones[1], 'clases').split('\n').map((l) => l.split(' · ').slice(0, 2).join(' · '))).toEqual(['E2 catalogo_familia · 30 cosas', 'E2 catalogo_item · 480 cosas'])
    const fam = bloque(espia.peticiones[2], 'familias').split('\n')
    expect(fam).toHaveLength(20)
    expect(fam[0]).toMatch(/^Familia 00 · 24 cosas/)
    for (const p of espia.peticiones.slice(0, 3)) expect(p.max_tokens).toBeLessThanOrEqual(1000)
  })
  it('puede elegir varios grupos y de un nivel pasa al siguiente solo con lo elegido', async () => {
    const { deps, espia } = armar(navega(['E2', 'E3'], ['E2 catalogo_familia'], undefined))
    const r = salida(await razonar(deps, conLista(listaTresNiveles())))
    // E2 (510) + E3 (13) no caben → clases de E2+E3: se elige solo una clase de E2 → 30 líneas caben y NO hay nivel de familia
    expect(espia.peticiones.map((p) => p.system)).toEqual([INSTRUCCION_DE_ESTANTES, INSTRUCCION_DE_CLASES, INSTRUCCION_DEL_PORTERO])
    expect(r.lectura_final.lineas_mostradas).toBe(30)
  })
  it('los grupos con un solo miembro no se preguntan: una clase única salta el nivel de clase', async () => {
    const f = listaTresNiveles().filter((x) => x.clase !== 'catalogo_familia')
    const { deps, espia } = armar(navega(['E2'], undefined, ['Familia 03']))
    await razonar(deps, conLista(f))
    expect(espia.peticiones.map((p) => p.system)).toEqual([INSTRUCCION_DE_ESTANTES, INSTRUCCION_DE_FAMILIAS, INSTRUCCION_DEL_PORTERO])
  })
  it('sin familias y con una sola clase no hay más que subdividir: se lee entero en trozos, sin preguntar nada más', async () => {
    const { deps, espia } = armar(navega(['E2']))
    const r = salida(await razonar(deps, conLista(listaPlana())))
    expect(espia.peticiones[0].system).toBe(INSTRUCCION_DE_ESTANTES)
    expect(espia.peticiones.slice(1).every((p) => p.system === INSTRUCCION_DEL_PORTERO)).toBe(true)
    expect(r.lectura_final.trozos).toBe(espia.peticiones.length - 1)
    expect(r.lectura_final.trozos).toBeGreaterThanOrEqual(2)
  })
  it('un solo estante enorme y nada que elegir arriba: va directo a leerse en trozos (cero llamadas de navegación)', async () => {
    const f = listaPlana().filter((x) => x.estante === 'E2')
    const { deps, espia } = armar(navega([]))
    const r = salida(await razonar(deps, conLista(f)))
    expect(espia.peticiones.every((p) => p.system === INSTRUCCION_DEL_PORTERO)).toBe(true)
    expect(r.niveles).toEqual([])
    expect(new Set(espia.peticiones.flatMap((p) => numerosDe(listaDe(p)))).size).toBe(545)
  })
  it('cada llamada se registra con su nivel y su número de pasada, con workflow_id y el cliente de prueba', async () => {
    const { deps, espia } = armar(navega(['E2'], ['E2 catalogo_item'], ['Familia 07']))
    await razonar(deps, conLista(listaTresNiveles()))
    expect(espia.registros.map((x) => (x.metadata as any).pasada)).toEqual([1, 2, 3, 4])
    expect(espia.registros.slice(0, 3).map((x) => (x.metadata as any).nivel)).toEqual(['estante', 'clase', 'familia'])
    expect(espia.registros.every((x) => x.workflow_id === 'wf-prueba' && x.client_id === 'prueba-portero')).toBe(true)
  })
  it('los nombres de grupo se aceptan sin importar mayúsculas ni espacios de más', async () => {
    const { deps, espia } = armar(navega(['e2 '], ['  e2  CATALOGO_ITEM'], ['familia 07']))
    const r = salida(await razonar(deps, conLista(listaTresNiveles())))
    expect(espia.peticiones).toHaveLength(4)
    expect(r.modo).toBe('conversado')
  })
})

// ───────────────────────── 3 · lo abierto que no cabe: trozos
describe('lo abierto que aún no cabe se lee ENTERO, en trozos consecutivos', () => {
  it('cada línea sale en exactamente un trozo, en el orden de la lista, y cada trozo respeta el tope de entrada', async () => {
    const { deps, espia } = armar(navega(['E2']))
    await razonar(deps, conLista(listaPlana()))
    const trozos = espia.peticiones.slice(1)
    const todos = trozos.flatMap((p) => numerosDe(listaDe(p)))
    expect(todos).toHaveLength(545)
    expect(todos).toEqual([...todos].sort((a, b) => a - b))
    for (const p of trozos) expect(estimarTokens(p.system.length + p.messages[0].content.length)).toBeLessThanOrEqual(TOPE_DE_ENTRADA_EN_TOKENS)
  })
  it('cada trozo dice «parte i de n» y avisa que lo que no ve puede estar en otra parte', async () => {
    const { deps, espia } = armar(navega(['E2']))
    await razonar(deps, conLista(listaPlana()))
    const trozos = espia.peticiones.slice(1)
    trozos.forEach((p, i) => {
      expect(p.messages[0].content).toContain(`parte ${i + 1} de ${trozos.length}`)
      expect(p.messages[0].content).toMatch(/NO lo declares faltante/)
    })
    expect(espia.peticiones[0].messages[0].content).not.toMatch(/<parte>/)
  })
  it('las decisiones de los trozos se juntan: números sin repetir, en su orden, con las referencias de la lista completa', async () => {
    const f = listaPlana()
    const full = completa(f)
    const { deps, espia } = armar(navega(['E2'], undefined, undefined, (n) => decision([n[0], n[5]])))
    const r = salida(await razonar(deps, conLista(f)))
    const esperado = espia.peticiones.slice(1).flatMap((p) => { const n = numerosDe(listaDe(p)); return [n[0], n[5]] })
    expect(r.decision.entregar_numeros).toEqual(esperado)
    expect(r.decision.entregar).toEqual(esperado.map((n) => full.lineas.find((l) => l.numero === n)!.ficha.ref))
    expect(r.modo).toBe('conversado')
  })
  it('un trozo donde nada sirve (entregar vacío) es legítimo; solo si TODOS salen vacíos es sospechoso y cae al respaldo declarado', async () => {
    const f = listaPlana()
    const objetivo = completa(f).lineas.find((l) => l.ficha.ref === 'prueba:E2-catalogo_item-0300')!.numero
    const a = armar(navega(['E2'], undefined, undefined, (n) => (n.includes(objetivo) ? decision([objetivo]) : decision([]))))
    const ra = salida(await razonar(a.deps, conLista(f)))
    expect(ra).toMatchObject({ modo: 'conversado', decision: { entregar_numeros: [objetivo] } })
    expect(ra.lectura_final.trozos_vacios).toBe(ra.lectura_final.trozos - 1)
    const b = armar(navega(['E2'], undefined, undefined, () => decision([])))
    const rb = salida(await razonar(b.deps, conLista(f)))
    expect(rb).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'entregar_vacio_sospechoso' })
  })
  it('lo que un trozo da por «faltante» NO se declara faltante (puede estar en otro trozo): queda como no concluyente', async () => {
    const { deps } = armar(navega(['E2'], undefined, undefined, (n) => decision([n[0]], { faltantes: ['el precio del servicio uno'] })))
    const r = salida(await razonar(deps, conLista(listaPlana())))
    expect(r.decision.faltantes).toEqual([])
    expect(r.decision.faltantes_no_concluyentes).toEqual(['el precio del servicio uno'])
  })
  it('las fotos a ver de todos los trozos se juntan sin pasar de 6', async () => {
    const f: Ficha[] = [...Array.from({ length: 545 }, (_, i) => ficha(i, 'E5', 'foto', `Foto ${i}`)), ficha(0, 'E1', 'plan', 'Plan')]
    const { deps } = armar((p) => (p.system === INSTRUCCION_DE_ESTANTES ? JSON.stringify({ estantes: ['E5'] }) : (() => { const n = numerosDe(listaDe(p)); return decision([n[0]], { pixeles: [n[0], n[1], n[2]] }) })()))
    const r = salida(await razonar(deps, conLista(f)))
    expect(r.decision.pixeles.length).toBe(6)
    expect(new Set(r.decision.pixeles).size).toBe(6)
  })
  it('trocear nunca descarta una línea, ni siquiera una que sola pasa el presupuesto', () => {
    const lineas = completa(listaPlana(40)).lineas
    for (const presupuesto of [1, 50, 700, 5000, 1e9]) {
      const t = trocear(lineas, presupuesto)
      expect(t.flat().map((l) => l.numero)).toEqual(lineas.map((l) => l.numero))
      expect(t.every((x) => x.length > 0)).toBe(true)
    }
    expect(trocear([], 100)).toEqual([])
  })
  it('agruparLineas junta por la etiqueta de la ficha sin importar mayúsculas y deja «(sin familia)» a las que no la traen', () => {
    const f = [ficha(1, 'E2', 'catalogo_item', 'a', 'Cuidado Facial'), ficha(2, 'E2', 'catalogo_item', 'b', ' cuidado  facial '), ficha(3, 'E2', 'catalogo_item', 'c')]
    const g = agruparLineas(completa(f).lineas, 'familia')
    expect(g.map((x) => [x.nombre, x.lineas.length])).toEqual([['(sin familia)', 1], ['Cuidado Facial', 2]])
    expect(indiceDeGrupos(g, 'familia')).toMatch(/^\(sin familia\) · 1 cosas/)
  })
})

// ───────────────────────── 4 · costo, tope y respaldo declarado
describe('el costo se calcula antes de gastar y pasado el tope hay respaldo declarado', () => {
  /** gasto realista: la entrada que dice la petición (≈ 1,9 caracteres por «token», lo medido) y 800 de salida en las lecturas */
  const realista: (c: Contesta) => Contesta = (c) => (p, n) => {
    const r = c(p, n)
    const texto = typeof r === 'string' ? r : r instanceof Error ? '' : r.texto
    if (r instanceof Error) return r
    const esLectura = p.system === INSTRUCCION_DEL_PORTERO
    return { texto, usage: { input_tokens: Math.round((p.system.length + p.messages[0].content.length) / 1.9), output_tokens: esLectura ? 800 : 120 } }
  }
  it('el tope por pedido es US$ 0,30 y leer TODO un estante de ≈ 545 líneas cuesta mucho menos', async () => {
    expect(TOPE_DE_GASTO_POR_PEDIDO_USD).toBe(0.3)
    const { deps, espia } = armar(realista(navega(['E2'])))
    const r = salida(await razonar(deps, conLista(listaPlana())))
    expect(r.modo).toBe('conversado')
    expect(r.costo_usd).toBeLessThanOrEqual(0.3)
    expect(r.costo_usd).toBeGreaterThan(0.05)
    expect(r.costo_usd).toBeCloseTo(espia.registros.reduce((a, x) => a + (x.cost_usd as number), 0), 8)
    expect(espia.registros).toHaveLength(espia.peticiones.length) // todo registrado
  })
  it('una familia sola cuesta lo de un pedido normal (≈ US$ 0,01–0,04)', async () => {
    const { deps } = armar(realista(navega(['E2'], ['E2 catalogo_item'], ['Familia 07'])))
    const r = salida(await razonar(deps, conLista(listaTresNiveles())))
    expect(r.costo_usd).toBeLessThan(0.05)
  })
  it('si leer todos los trozos pasaría el tope por pedido, NO se empieza: respaldo tope_de_gasto, con el costo máximo calculado, y lo ya pagado queda registrado', async () => {
    const { deps, espia } = armar(navega(['E2']), { topeDeGastoPorPedidoUsd: 0.1 })
    const r = salida(await razonar(deps, conLista(listaPlana())))
    expect(r).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'tope_de_gasto', llamo_al_modelo: true, pasadas: 1 })
    expect(r.costo_maximo_calculado_usd).toBeGreaterThan(0.1)
    expect(r.lectura_final.trozos_leidos).toBe(0)
    expect(espia.peticiones).toHaveLength(1)
    expect(espia.registros).toHaveLength(1)
    expect(r.costo_usd).toBeGreaterThan(0)
  })
  it('sin gasto previo (nada que elegir arriba) y sin presupuesto: respaldo sin llamar al modelo', async () => {
    const f = listaPlana().filter((x) => x.estante === 'E2')
    const { deps, espia } = armar(navega([]), { topeDeGastoPorPedidoUsd: 0.01 })
    const r = salida(await razonar(deps, conLista(f)))
    expect(r).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'tope_de_gasto', llamo_al_modelo: false, costo_usd: 0, pasadas: 0 })
    expect(espia.peticiones).toHaveLength(0)
  })
  it('un trozo cuyo peor caso pasa el tope por llamada tampoco se hace', async () => {
    const { deps, espia } = armar(navega(['E2']), { topeDeGastoUsd: 0.02 })
    const r = salida(await razonar(deps, conLista(listaPlana())))
    expect(r).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'tope_de_gasto' })
    expect(espia.peticiones.length).toBeLessThanOrEqual(1)
  })
  it('el peor caso calculado de una lectura completa de ≈ 545 líneas cabe en el tope', () => {
    const peor = costoDeLaLlamada({ input_tokens: TOPE_DE_ENTRADA_EN_TOKENS, output_tokens: 1500 })
    expect(peor * 4).toBeLessThan(TOPE_DE_GASTO_POR_PEDIDO_USD)
  })
})

// ───────────────────────── 5 · cuando el modelo falla o contesta mal
describe('fallos: respaldo declarado con su motivo, sin reintentos y nada colgado', () => {
  it('el modelo falla en el nivel de clase → respaldo con error_del_modelo, 2 llamadas, ambas registradas', async () => {
    const { deps, espia } = armar((p) => (p.system === INSTRUCCION_DE_ESTANTES ? JSON.stringify({ estantes: ['E2'] }) : new Error('boom')))
    const r = salida(await razonar(deps, conLista(listaTresNiveles())))
    expect(r).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'error_del_modelo', llamo_al_modelo: true })
    expect(espia.peticiones).toHaveLength(2)
    expect(espia.registros).toHaveLength(2)
  })
  it('clases o familias inventadas → su motivo y se detiene', async () => {
    const a = armar(navega(['E2'], ['E2 inventada']))
    expect(salida(await razonar(a.deps, conLista(listaTresNiveles())))).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'clases_invalidas' })
    expect(a.espia.peticiones).toHaveLength(2)
    const b = armar(navega(['E2'], ['E2 catalogo_item'], ['Familia 99']))
    const rb = salida(await razonar(b.deps, conLista(listaTresNiveles())))
    expect(rb).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'familias_invalidas' })
    expect(rb.niveles[2].grupos_invalidos).toEqual(['Familia 99'])
    expect(b.espia.peticiones).toHaveLength(3)
  })
  it('un grupo inventado mezclado con uno bueno: se usa el bueno y se anota el otro', async () => {
    const { deps } = armar(navega(['E2'], ['E2 catalogo_item', 'E2 fantasma'], ['Familia 07']))
    const r = salida(await razonar(deps, conLista(listaTresNiveles())))
    expect(r.modo).toBe('conversado')
    expect(r.niveles[1]).toMatchObject({ grupos_elegidos: ['E2 catalogo_item'], grupos_invalidos: ['E2 fantasma'] })
  })
  it('la respuesta de un nivel se lee aunque venga con texto alrededor, y si se corta lo dice', async () => {
    const a = armar((p) => (p.system === INSTRUCCION_DE_CLASES ? 'Miro las clases.\n{"clases":["E2 catalogo_familia"]}' : navega(['E2'])(p, 0)))
    expect(salida(await razonar(a.deps, conLista(listaTresNiveles())))).toMatchObject({ modo: 'conversado', pasadas: 3 })
    const b = armar((p) => (p.system === INSTRUCCION_DE_CLASES ? { texto: '{"clases":["E2 cat', stop_reason: 'max_tokens' } : navega(['E2'])(p, 0)))
    expect(salida(await razonar(b.deps, conLista(listaTresNiveles())))).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'salida_cortada' })
  })
  it('si un trozo del medio falla, se detiene ahí: respaldo declarado, sin más llamadas, con cuántos trozos se leyeron', async () => {
    const { deps, espia } = armar((p, n) => (n === 3 ? new Error('boom') : navega(['E2'])(p, n)))
    const r = salida(await razonar(deps, conLista(listaPlana())))
    expect(r).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'error_del_modelo' })
    expect(espia.peticiones).toHaveLength(3)
    expect(espia.registros).toHaveLength(3)
    expect(r.lectura_final.trozos_leidos).toBe(1)
  })
  it('un trozo con respuesta rota o tiempo agotado también cae al respaldo con su motivo', async () => {
    const rota = armar((p, n) => (n === 2 ? 'no es json' : navega(['E2'])(p, n)))
    expect(salida(await razonar(rota.deps, conLista(listaPlana())))).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'json_roto' })
    const lenta = armar((p, n) => (n === 2 ? Object.assign(new Error('t'), { name: 'AbortError' }) : navega(['E2'])(p, n)))
    const rl = salida(await razonar(lenta.deps, conLista(listaPlana())))
    expect(rl).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'tiempo' })
    expect(lenta.espia.registros[1]).toMatchObject({ status: 'timeout' })
  })
  it('números fuera del trozo que se mostró son inválidos (el modelo no puede elegir lo que no vio)', async () => {
    const { deps } = armar(navega(['E2'], undefined, undefined, () => decision([1, 2, 3])))
    const r = salida(await razonar(deps, conLista(listaPlana())))
    expect(r).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'todos_los_numeros_invalidos' })
  })
  it('si el registro falla, la respuesta sigue y lo grita', async () => {
    const { deps } = armar(navega(['E2'], ['E2 catalogo_item'], ['Familia 07']), { registrar: async () => ({ ok: false, detalle: 'x' }) })
    const r = salida(await razonar(deps, conLista(listaTresNiveles())))
    expect(r).toMatchObject({ modo: 'conversado', alerta: 'llamada_sin_registro', registro_fallido: true })
    expect(r.gasto_sin_registrar_usd).toBeCloseTo(r.costo_usd, 10)
  })
})

// ───────────────────────── 6 · las listas chicas no cambian
describe('las listas chicas se comportan EXACTAMENTE como antes (comparado con el código anterior al paso 6)', () => {
  const antes = JSON.parse(fs.readFileSync(path.join(__dirname, 'lista-chica-antes.json'), 'utf8')) as Record<string, unknown>
  it('hay escenarios guardados y cubren el piloto de 62 líneas', () => {
    expect(Object.keys(antes).length).toBeGreaterThanOrEqual(7)
    expect(Object.keys(antes).filter((k) => k.startsWith('piloto 62 líneas')).length).toBe(5)
  })
  it.each(escenariosDeListaChica().map((e) => [e.nombre, e] as const))('%s: lo que se le manda al modelo, lo que se registra y la respuesta son idénticos', async (nombre, e) => {
    // lo ÚNICO que cambió desde el código anterior es la regla 8 de la instrucción (vista cortada, relevo 6 · adenda 2): se pone la instrucción vieja en su lugar y TODO lo demás debe ser igual
    const hoy = (await correrEscenario(e)) as { peticiones: Array<{ system: string }> }
    const sistemaViejo = (Object.values(antes)[0] as { peticiones: Array<{ system: string }> }).peticiones[0].system
    for (const p of hoy.peticiones) { expect(p.system).toBe(INSTRUCCION_DEL_PORTERO); p.system = sistemaViejo }
    // lo ÚNICO agregado en la respuesta por los recados (relevo 18): `faltantes_con_forma` (junto a `faltantes`, que no cambia) y el resumen `recados`; sin faltantes no aparece nada
    const sinRecados = (v: unknown): void => { if (Array.isArray(v)) v.forEach(sinRecados); else if (v && typeof v === 'object') { const o = v as Record<string, unknown>; delete o.faltantes_con_forma; delete o.recados; Object.values(o).forEach(sinRecados) } }
    sinRecados(hoy)
    expect(hoy).toEqual(antes[nombre])
  })
  it('la instrucción de hoy es la de antes MÁS las reglas 8 (líneas cortadas), 9 (conjunto completo) y 10 (dato de todos los lugares) y nada más', () => {
    const sistemaViejo = (Object.values(antes)[0] as { peticiones: Array<{ system: string }> }).peticiones[0].system
    // lo ÚNICO que cambia además (relevo 18, recados): la regla 11, la frase final de la regla 4 y la forma de «faltantes» en el JSON (de texto a objeto con forma)
    const aLaDeAntes = (x: string): string => x
      .replace(/\n8\. [^\n]*/, '').replace(/\n9\. [^\n]*/, '').replace(/\n10\. [^\n]*/, '').replace(/\n11\. [^\n]*/, '')
      .replace('dilo en «faltantes»: cada faltante es un objeto con forma (ver abajo).', 'dilo en «faltantes».')
      .replace(/"faltantes":\[\{[^\]]*\}\],"duda"/, '"faltantes":["lo que el trabajo necesitaba y no hay"],"duda"')
    expect(aLaDeAntes(INSTRUCCION_DEL_PORTERO)).toBe(sistemaViejo)
    expect(INSTRUCCION_DEL_PORTERO).toMatch(/8\./)
    expect(INSTRUCCION_DEL_PORTERO).toMatch(/resumen de una línea termina en «…», ese resumen está CORTADO/)
    expect(INSTRUCCION_DEL_PORTERO).toMatch(/nunca declares «faltante» algo solo porque no lo ves/)
  })
  it('una lista que cabe nunca navega: UNA llamada, sin niveles', async () => {
    const { deps, espia } = armar(() => decision([1, 2]))
    const r = salida(await razonar(deps, conLista(listaDePiloto62())))
    expect(espia.peticiones).toHaveLength(1)
    expect(espia.peticiones[0].system).toBe(INSTRUCCION_DEL_PORTERO)
    expect(r.niveles).toBeUndefined()
    expect(r.lectura_final).toBeUndefined()
    expect(r.pasadas).toBe(1)
  })
})
const listaDePiloto62 = (): Ficha[] => Array.from({ length: 62 }, (_, i) => ficha(i, (['E1', 'E2', 'E3', 'E5'] as const)[i % 4], 'plan', `Cosa ${i}`))

// ───────────────────────── 7 · instrucciones
describe('las instrucciones de cada nivel son agnósticas y piden lo mismo que la de estantes', () => {
  it.each([['clases', INSTRUCCION_DE_CLASES], ['familias', INSTRUCCION_DE_FAMILIAS]])('la de %s: ÁBRELO ante la duda, lo de afuera es dato, un solo JSON, y no nombra rubro ni cliente ni tipo de trabajo', (n, t) => {
    expect(t).toMatch(/ÁBRELO/)
    expect(t).toMatch(/DATO del cliente o del empleado/)
    expect(t).toMatch(/UN solo JSON/)
    expect(t).toContain(`{"${n}":[`)
    expect(t).not.toMatch(/laboratorio|cl[ií]nica|restaurante|marisquer|cotizador|chequeo|n[aá]ufrago|p[eé]rez|ferreter|inmobiliari|medicament|academia/i)
  })
})

describe('la ruta de razonar aguanta una consulta grande (la medición real la necesita)', () => {
  it('maxDuration cubre el peor caso: 3 llamadas de nivel + 5 de lectura de 25 s (≈ 200 s) y la ruta no corta una consulta a la mitad', () => {
    const t = fs.readFileSync(path.resolve(__dirname, '../../../../app/api/brain/portero/razonar/route.ts'), 'utf8')
    const m = /export const maxDuration = (\d+)/.exec(t)
    expect(m, 'la ruta debe declarar maxDuration').not.toBeNull()
    expect(Number(m![1])).toBeGreaterThanOrEqual(3 * 25 + 5 * 25 + 30)
  })
})
