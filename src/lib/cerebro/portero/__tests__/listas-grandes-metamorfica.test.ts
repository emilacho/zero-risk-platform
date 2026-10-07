/**
 * PASO 6 · CONDICIONES 1 Y 2 DE LA COMPUERTA DE CC#3 (modelo SIMULADO, ninguna llamada real).
 *  1 · «La búsqueda por palabras no vuelve» DE VERDAD: una prueba METAMÓRFICA (dos pedidos con palabras opuestas deben mandar EXACTAMENTE el mismo texto de lista,
 *      en el mismo orden, en cada llamada; solo cambia el bloque del pedido) y una vigilancia que cubre TODO `src/lib/cerebro/` y la ruta del portero,
 *      no solo `portero/`. Cubre las 5 formas que sobrevivían: orden por afinidad con otro nombre, una función con RegExp sobre el pedido (sin usar),
 *      `palabrasDelPedido` en OTRO archivo del cerebro, y el filtro por palabras CABLEADO en la lectura por trozos o en el nivel de familia.
 *  2 · La «bolsa (sin familia)»: lo que no tiene familia no se le pregunta al modelo, se abre siempre.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { A, AHORA, crearBaseFalsa, tablasDeLaBase } from '../../__tests__/casos'
import type { Ficha } from '../../tipos'
import { INSTRUCCION_DE_CLASES, INSTRUCCION_DE_ESTANTES, INSTRUCCION_DE_FAMILIAS, INSTRUCCION_DEL_PORTERO } from '../instruccion'
import { numerarLista } from '../lista-numerada'
import { ARCHIVO_CON_EXCEPCION, LINEA_CON_EXCEPCION, sinLaExcepcion } from './excepcion-normalizar-nombre'
import { razonar, type DepsDeRazonar, type PeticionAlModelo } from '../razonar'

// ───────────────────────── herramientas (inventadas para esta prueba)
const QUE_ES = 'ficha de una cosa del archivo del cliente con su presentación y su detalle'
const ficha = (i: number, estante: Ficha['estante'], clase: string, titulo: string, familia?: string, fecha = '2026-09-20'): Ficha => ({
  ref: `prueba:${estante}-${clase}-${String(i).padStart(4, '0')}`, estante, clase, titulo, que_es: QUE_ES, origen: 'su_fuente', estado: 'visto_en_su_fuente',
  fecha_fuente: `${fecha}T00:00:00.000Z`, vigente_hasta: null, vencido: false, peso_estimado: 300 + (i % 7) * 40, ...(familia ? { datos: { familia } } : {}),
})
const fam = (i: number) => `Familia ${String(i % 20).padStart(2, '0')}`
/** E2 grande con tres clases: 480 productos con familia + 8 páginas y 6 sedes SIN familia; más estantes chicos */
function listaConBolsa(): Ficha[] {
  const f: Ficha[] = []
  for (let i = 0; i < 5; i++) f.push(ficha(i, 'E1', 'plan', `Plan ${i}`))
  for (let i = 0; i < 480; i++) f.push(ficha(i, 'E2', 'catalogo_item', `Producto ${String(i).padStart(4, '0')} de la línea ${i % 20}`, fam(i), `2026-09-${String(1 + (i % 28)).padStart(2, '0')}`))
  for (let i = 0; i < 8; i++) f.push(ficha(i, 'E2', 'sitio', i === 0 ? 'Cómo hacer un pedido' : `Página ${i}`))
  for (let i = 0; i < 6; i++) f.push(ficha(i, 'E2', 'sede', `Oficina ${i} y su horario`))
  for (let i = 0; i < 4; i++) f.push(ficha(i, 'E3', 'foto', `Foto ${i}`))
  return f
}
function listaPlana(): Ficha[] {
  const f: Ficha[] = []
  for (let i = 0; i < 5; i++) f.push(ficha(i, 'E1', 'plan', `Plan ${i}`))
  for (let i = 0; i < 545; i++) f.push(ficha(i, 'E2', 'catalogo_item', `Producto ${String(i).padStart(4, '0')} · referencia ${(i * 7919) % 10007}`))
  return f
}

type Contesta = (p: PeticionAlModelo, n: number) => string
function armar(contesta: Contesta) {
  const peticiones: PeticionAlModelo[] = []
  const deps: DepsDeRazonar = {
    consulta: crearBaseFalsa(tablasDeLaBase()).consulta,
    llamarModelo: async (p) => { peticiones.push(p); return { texto: contesta(p, peticiones.length), usage: { input_tokens: 7000, output_tokens: 600 } } },
    registrar: async () => ({ ok: true }),
    ahora: () => AHORA,
  }
  return { deps, peticiones }
}
const cuerpo = (lista: Ficha[], pedido: { necesito: string; output: string; objetivo: string }) => ({
  cliente: A, workflow_id: 'wf-prueba', workflow_execution_id: 'ex-1', prueba: true, lista_de_prueba: lista,
  voy_a_producir: { output: pedido.output, material: 'video', canal: 'red social', objetivo: pedido.objetivo }, necesito: pedido.necesito, ronda: 1,
})
const salida = (r: { cuerpo: Record<string, unknown> }) => r.cuerpo as Record<string, any>
const numerosDe = (t: string) => [...t.matchAll(/^#(\d+) /gm)].map((m) => Number(m[1]))
const listaDe = (p: PeticionAlModelo) => /<lista>\n([\s\S]*)\n<\/lista>/.exec(p.messages[0].content)![1]
const bloque = (p: PeticionAlModelo, etiqueta: string) => new RegExp(`<${etiqueta}>\\n([\\s\\S]*)\\n</${etiqueta}>`).exec(p.messages[0].content)![1]
const decision = (n: number[]) => JSON.stringify({ entregar: n, pixeles: [], por_que: [], faltantes: [], duda: [] })
/** el modelo simulado: SOLO mira lo que se le manda (la lista), nunca el pedido: así dos pedidos distintos reciben las mismas respuestas si reciben el mismo texto */
const navega = (e: string[], c: string[], f: string[]): Contesta => (p) => {
  if (p.system === INSTRUCCION_DE_ESTANTES) return JSON.stringify({ estantes: e })
  if (p.system === INSTRUCCION_DE_CLASES) return JSON.stringify({ clases: c })
  if (p.system === INSTRUCCION_DE_FAMILIAS) return JSON.stringify({ familias: f })
  const n = numerosDe(listaDe(p))
  return decision([n[0], n[Math.floor(n.length / 2)], n[n.length - 1]])
}
const completa = (f: Ficha[]) => numerarLista({ cliente_id: 'x', generada_en: 'x', estado: 'ok', fuentes: {} as never, lineas: f })

// ───────────────────────── 2 · la bolsa «(sin familia)»
describe('condición 2 · lo que no tiene familia no se pregunta: se abre SIEMPRE', () => {
  const pedidoCualquiera = { necesito: 'tengo que hacer un carrusel', output: 'carrusel', objetivo: 'vender' }
  it('el modelo escoge SOLO una familia y SIN pedir ninguna «bolsa»: las páginas y las sedes llegan igual a la decisión', async () => {
    const f = listaConBolsa()
    const { deps, peticiones } = armar(navega(['E2'], ['E2 catalogo_item', 'E2 sitio', 'E2 sede'], ['Familia 07']))
    const r = salida(await razonar(deps, cuerpo(f, pedidoCualquiera)))
    expect(peticiones.map((p) => p.system)).toEqual([INSTRUCCION_DE_ESTANTES, INSTRUCCION_DE_CLASES, INSTRUCCION_DE_FAMILIAS, INSTRUCCION_DEL_PORTERO])
    const full = completa(f)
    const esperados = full.lineas.filter((l) => (l.ficha.clase === 'catalogo_item' && l.ficha.datos?.familia === 'Familia 07') || l.ficha.clase === 'sitio' || l.ficha.clase === 'sede').map((l) => l.numero)
    expect(esperados).toHaveLength(24 + 8 + 6)
    expect(numerosDe(listaDe(peticiones[3]))).toEqual(esperados)
    expect(r.lectura_final).toMatchObject({ lineas_mostradas: 38 })
    expect(r.modo).toBe('conversado')
  })
  it('el índice de familias NO trae un grupo «(sin familia)»: solo las familias reales, y una nota dice que lo demás se abre siempre y de qué clases', async () => {
    const { deps, peticiones } = armar(navega(['E2'], ['E2 catalogo_item', 'E2 sitio', 'E2 sede'], ['Familia 07']))
    await razonar(deps, cuerpo(listaConBolsa(), pedidoCualquiera))
    const indice = bloque(peticiones[2], 'familias').split('\n')
    const grupos = indice.filter((l) => !l.startsWith('('))
    expect(grupos).toHaveLength(20)
    expect(grupos.every((l) => /^Familia \d\d · 24 cosas/.test(l))).toBe(true)
    expect(indice[indice.length - 1]).toMatch(/^\(además se abren SIEMPRE 14 cosas que no tienen familia — sitio, sede — no hace falta elegirlas\)$/)
  })
  it('si el modelo escribe «(sin familia)» igual, es un nombre inválido (se anota) y NO cambia lo que se abre', async () => {
    const f = listaConBolsa()
    const { deps, peticiones } = armar(navega(['E2'], ['E2 catalogo_item', 'E2 sitio', 'E2 sede'], ['Familia 07', '(sin familia)']))
    const r = salida(await razonar(deps, cuerpo(f, pedidoCualquiera)))
    expect(r.niveles[2]).toMatchObject({ grupos_elegidos: ['Familia 07'], grupos_invalidos: ['(sin familia)'] })
    expect(numerosDe(listaDe(peticiones[3]))).toHaveLength(38)
  })
  it('elegir varias familias suma sus líneas a las de siempre; elegir una inexistente sola cae al respaldo declarado (las de siempre no cuentan como elegidas)', async () => {
    const { deps, peticiones } = armar(navega(['E2'], ['E2 catalogo_item', 'E2 sitio', 'E2 sede'], ['Familia 01', 'Familia 02']))
    await razonar(deps, cuerpo(listaConBolsa(), pedidoCualquiera))
    expect(numerosDe(listaDe(peticiones[3]))).toHaveLength(48 + 14)
    const mala = armar(navega(['E2'], ['E2 catalogo_item', 'E2 sitio', 'E2 sede'], ['Familia 99']))
    expect(salida(await razonar(mala.deps, cuerpo(listaConBolsa(), pedidoCualquiera)))).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'familias_invalidas' })
  })
  it('con una sola familia real y lo demás sin familia no hay nada que elegir: el nivel de familia no se pregunta y lo abierto se lee entero', async () => {
    const f = listaConBolsa().filter((x) => x.clase !== 'catalogo_item' || x.datos?.familia === 'Familia 00')
    const { deps, peticiones } = armar(navega(['E2'], ['E2 catalogo_item', 'E2 sitio', 'E2 sede'], []))
    await razonar(deps, cuerpo(f, pedidoCualquiera))
    expect(peticiones.some((p) => p.system === INSTRUCCION_DE_FAMILIAS)).toBe(false)
  })
  it('un tipo SIN familias en todo su grupo (solo sitio y sede) no baja al nivel de familia: se abre entero al elegir el tipo', async () => {
    const f = [...listaConBolsa().filter((x) => x.clase !== 'catalogo_item'), ...Array.from({ length: 200 }, (_, i) => ficha(i, 'E4', 'competidor', `Competidor ${i}`))]
    const { deps, peticiones } = armar(navega(['E2', 'E4'], ['E2 sitio', 'E2 sede', 'E4 competidor'], []))
    await razonar(deps, cuerpo(f, pedidoCualquiera))
    expect(peticiones.some((p) => p.system === INSTRUCCION_DE_FAMILIAS)).toBe(false)
  })
})

// ───────────────────────── 1 · la prueba metamórfica
const PEDIDO_QUE_COINCIDE = { necesito: 'Cómo hacer un pedido: Producto 0444 de la línea 4 Familia 07 Oficina 3 y su horario', output: 'Producto 0001', objetivo: 'Plan 2 Página 3 Foto 1 Sede' }
/** el opuesto tiene el MISMO largo y la misma forma (cada letra o dígito pasa a «q» o «z»): el tamaño del pedido cambia cuántas líneas caben por trozo, y eso es legítimo; lo que no puede cambiar es QUÉ líneas ni en qué orden */
const opuesto = (t: string) => t.replace(/[\p{L}\p{N}]/gu, (_c, i: number) => (i % 2 ? 'q' : 'z'))
const PEDIDO_OPUESTO = { necesito: opuesto(PEDIDO_QUE_COINCIDE.necesito), output: opuesto(PEDIDO_QUE_COINCIDE.output), objetivo: opuesto(PEDIDO_QUE_COINCIDE.objetivo) }
/** un tercer pedido que SOLO coincide con una o dos líneas (números y nombres únicos), del MISMO largo en cada campo: un filtro por palabras que no se nota con pedidos que coinciden con todo o con nada, aquí corta */
const ajustar = (t: string, largo: number) => (t.length >= largo ? t.slice(0, largo) : t + ' ' + 'q'.repeat(Math.max(0, largo - t.length - 1)))
const PEDIDO_UNICO = { necesito: ajustar('0444 0001 0272 Familia 07 Oficina 3', PEDIDO_QUE_COINCIDE.necesito.length), output: ajustar('0444', PEDIDO_QUE_COINCIDE.output.length), objetivo: ajustar('0272', PEDIDO_QUE_COINCIDE.objetivo.length) }
const sinPedido = (p: PeticionAlModelo) => p.messages[0].content.replace(/<pedido>[\s\S]*?<\/pedido>/, '<pedido/>')

describe('condición 1 · metamórfica: dos pedidos con palabras opuestas mandan EXACTAMENTE el mismo texto en cada llamada (solo cambia el pedido)', () => {
  const casos: Array<[string, () => Ficha[], Contesta]> = [
    ['tres niveles con bolsa (estante → clase → familia)', listaConBolsa, navega(['E2'], ['E2 catalogo_item', 'E2 sitio', 'E2 sede'], ['Familia 07', 'Familia 13'])],
    ['sin familias: lectura entera en trozos', listaPlana, navega(['E2'], [], [])],
    ['estante grande sin nivel de estante (todo en E2)', () => listaPlana().filter((x) => x.estante === 'E2'), navega([], [], [])],
    ['varias clases elegidas a la vez', listaConBolsa, navega(['E1', 'E2', 'E3'], ['E2 catalogo_item', 'E2 sede', 'E1 plan'], ['Familia 00', 'Familia 19'])],
  ]
  it.each(casos)('%s', async (_n, lista, contesta) => {
    const a = armar(contesta), b = armar(contesta), c = armar(contesta)
    const ra = salida(await razonar(a.deps, cuerpo(lista(), PEDIDO_QUE_COINCIDE)))
    const rb = salida(await razonar(b.deps, cuerpo(lista(), PEDIDO_OPUESTO)))
    const rc = salida(await razonar(c.deps, cuerpo(lista(), PEDIDO_UNICO)))
    expect(a.peticiones.length).toBeGreaterThanOrEqual(2)
    for (const [nombre, x] of [['opuesto', b], ['único', c]] as const) {
      expect(x.peticiones.length, nombre).toBe(a.peticiones.length)
      a.peticiones.forEach((p, i) => {
        const q = x.peticiones[i]
        expect(q.system, `${nombre} · llamada ${i + 1}: instrucción`).toBe(p.system)
        expect(q.max_tokens).toBe(p.max_tokens)
        expect(sinPedido(q), `${nombre} · llamada ${i + 1}: todo lo que no es el pedido (lista, índice y su ORDEN)`).toBe(sinPedido(p))
      })
    }
    // y la lista de cada llamada de decisión es la misma, línea por línea y en el mismo orden
    const listas = (r: PeticionAlModelo[]) => r.filter((p) => p.system === INSTRUCCION_DEL_PORTERO).map((p) => numerosDe(listaDe(p)))
    expect(listas(b.peticiones)).toEqual(listas(a.peticiones))
    expect(listas(c.peticiones)).toEqual(listas(a.peticiones))
    expect(rb.decision?.entregar).toEqual(ra.decision?.entregar)
    expect(rb.lectura_final).toEqual(ra.lectura_final)
    expect(rc.lectura_final).toEqual(ra.lectura_final)
    expect(rb.niveles).toEqual(ra.niveles)
    expect(rc.niveles).toEqual(ra.niveles)
  })
  it('los pedidos de la prueba de verdad se distinguen (si no, la prueba no probaría nada) y sus palabras SÍ aparecen en líneas de la lista', async () => {
    const a = armar(navega(['E2'], ['E2 catalogo_item', 'E2 sitio', 'E2 sede'], ['Familia 07']))
    const b = armar(navega(['E2'], ['E2 catalogo_item', 'E2 sitio', 'E2 sede'], ['Familia 07']))
    await razonar(a.deps, cuerpo(listaConBolsa(), PEDIDO_QUE_COINCIDE))
    await razonar(b.deps, cuerpo(listaConBolsa(), PEDIDO_OPUESTO))
    expect(a.peticiones[0].messages[0].content).not.toBe(b.peticiones[0].messages[0].content)
    expect(listaConBolsa().some((x) => x.titulo === 'Cómo hacer un pedido')).toBe(true)
  })
})

// ───────────────────────── 1 · la vigilancia cubre TODO el cerebro y la ruta, no solo `portero/`
describe('condición 1 · vigilancia sobre todo src/lib/cerebro/ y src/app/api/brain/portero/', () => {
  const RAIZ = path.resolve(__dirname, '../../../../..')
  const sinComentarios = (t: string): string => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
  function codigo(dir: string, salida: Array<{ rel: string; t: string }> = []): Array<{ rel: string; t: string }> {
    for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`
      if (e.isDirectory()) { if (e.name !== '__tests__') codigo(rel, salida) } else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) salida.push({ rel, t: sinComentarios(fs.readFileSync(path.join(RAIZ, rel), 'utf8')) })
    }
    return salida
  }
  const TODO = () => [...codigo('src/lib/cerebro'), ...codigo('src/app/api/brain/portero')]
  /** los ÚNICOS archivos que pueden leer el texto del pedido: validarlo y armar el mensaje que se le manda al modelo */
  const PUEDEN_LEER_EL_PEDIDO = [/^src\/lib\/cerebro\/conversacion\.ts$/, /^src\/lib\/cerebro\/portero\/instruccion\.ts$/]
  it('hay archivos que revisar (la vigilancia no está mirando el vacío)', () => { expect(TODO().length).toBeGreaterThan(15) })
  it('ningún archivo del cerebro ni de la ruta nombra una búsqueda por parecido con el pedido (nombres de las formas que ya se intentaron y otros)', () => {
    for (const { rel, t } of TODO()) expect(t, rel).not.toMatch(/palabrasDelPedido|\bpuntaje\b|puntuar|recortada_por_coincidencia|MAXIMO_DE_LINEAS_POR_ESTANTE|SIN_VALOR|coincidencia|afinidad|similitud|parecido|relevancia|\bsimilar\b/i)
  })
  it('ningún archivo parte textos en palabras para compararlos (normalizar tildes, partir por no-letras, regex sobre el pedido)', () => {
    for (const { rel, t: texto } of TODO()) {
      const t = sinLaExcepcion(rel, texto) // la ÚNICA excepción, con nombre y mínima: excepcion-normalizar-nombre.ts
      expect(t, rel).not.toMatch(/normalize\(\s*['"]NFD['"]\s*\)/)
      expect(t, rel).not.toMatch(/split\(\s*\/\[\^a-z/i)
      expect(t, rel).not.toMatch(/split\(\s*\/\\W/)
      expect(t, rel).not.toMatch(/\\p\{M\}|\[̀-ͯ\]/)
    }
  })
  it('SOLO la validación del pedido y el armado del mensaje tocan el texto del pedido (necesito, voy_a_producir, ya_tengo): un filtro, un orden o una función que lo lea, en cualquier otro archivo, falla aquí', () => {
    for (const { rel, t } of TODO()) {
      if (PUEDEN_LEER_EL_PEDIDO.some((r) => r.test(rel))) continue
      expect(t, rel).not.toMatch(/\b(necesito|voy_a_producir|ya_tengo)\b/)
      expect(t, rel).not.toMatch(/JSON\.stringify\(\s*pedido\b/)
      expect(t, rel).not.toMatch(/\bpedido\.(necesito|voy_a_producir|ya_tengo|output|material|canal|formato|objetivo)\b/)
    }
  })
  it('el único código del portero que recibe el pedido es el que mide el tamaño del mensaje y el que lo arma (nadie le pasa el pedido a un orden o un filtro)', () => {
    const usos: Record<string, number> = {}
    for (const { rel, t } of codigo('src/lib/cerebro/portero')) {
      const n = [...t.matchAll(/\b(pedido|p)\s*:\s*Pedido\b/g)].length
      if (n) usos[path.basename(rel)] = n
    }
    expect(usos).toEqual({ 'estantes.ts': 1, 'instruccion.ts': 5 })
  })
  it('la propia vigilancia detecta cada forma que sobrevivía (se prueba contra textos de ejemplo)', () => {
    const nombra = (t: string) => /palabrasDelPedido|\bpuntaje\b|puntuar|recortada_por_coincidencia|coincidencia|afinidad|similitud|parecido|relevancia|\bsimilar\b/i.test(t)
    expect(nombra('const orden = ordenarPorAfinidad(lineas, pedido)')).toBe(true)
    expect(nombra('export function palabrasDelPedido(p) {}')).toBe(true)
    expect(nombra('lineas.sort((a, b) => puntaje(b) - puntaje(a))')).toBe(true)
    const lee = (t: string) => /\b(necesito|voy_a_producir|ya_tengo)\b/.test(t) || /\bpedido\.(output|objetivo|canal)\b/.test(t)
    expect(lee('const re = new RegExp(pedido.necesito.split(" ").join("|"))')).toBe(true)
    expect(lee('trozos.filter((t) => re.test(t.titulo)) // pedido.objetivo')).toBe(true)
    expect(lee('const orden = (a, b) => dist(a, p.voy_a_producir.output)')).toBe(true)
    expect(/normalize\(\s*['"]NFD['"]\s*\)/.test("t.normalize('NFD').toLowerCase()")).toBe(true)
    expect(/split\(\s*\/\[\^a-z/i.test("t.split(/[^a-z0-9]+/)")).toBe(true)
    expect(lee('const grupos = agruparLineas(candidatas, nivel)')).toBe(false)
  })
})

describe('la ÚNICA excepción: comparar un nombre de producto con el catálogo (etiquetar.ts), mínima y con nombre', () => {
  const NFD = /normalize\(\s*['"]NFD['"]\s*\)/
  it('en el archivo permitido, la declaración exacta queda exceptuada (y solo ella)', () => {
    const texto = `import x from 'y'
${LINEA_CON_EXCEPCION}
export const z = 1
`
    expect(NFD.test(texto)).toBe(true)
    expect(NFD.test(sinLaExcepcion(ARCHIVO_CON_EXCEPCION, texto))).toBe(false)
  })
  it('en CUALQUIER otro archivo la misma línea sigue prohibida', () => {
    for (const rel of ['src/lib/cerebro/portero/estantes.ts', 'src/lib/cerebro/portero/razonar.ts', 'src/lib/cerebro/lectores.ts', 'src/app/api/brain/portero/etiquetar/route.ts', 'src/lib/cerebro/portero/otro/etiquetar.ts']) {
      expect(NFD.test(sinLaExcepcion(rel, LINEA_CON_EXCEPCION)), rel).toBe(true)
    }
  })
  it('una declaración DISTINTA en el archivo permitido (otro nombre, otro cuerpo, o la misma con algo de más) no está cubierta', () => {
    const variantes = [
      LINEA_CON_EXCEPCION.replace('normalizar', 'palabras'),
      LINEA_CON_EXCEPCION.replace(".trim()", ".trim().split(' ')"),
      LINEA_CON_EXCEPCION + " // y además filtra",
      "const normalizar = (t: string) => t.normalize('NFD')",
      "const normalizar = (t: string): string => t.normalize('NFD').toLowerCase()",
    ]
    for (const v of variantes) expect(NFD.test(sinLaExcepcion(ARCHIVO_CON_EXCEPCION, v)), v).toBe(true)
  })
  it('solo cubre UNA aparición: una segunda copia de la línea en el mismo archivo sigue prohibida', () => {
    const texto = `${LINEA_CON_EXCEPCION}
function f() {}
${LINEA_CON_EXCEPCION}
`
    expect(NFD.test(sinLaExcepcion(ARCHIVO_CON_EXCEPCION, texto))).toBe(true)
  })
  it('lo demás de ese archivo sigue sujeto a TODO: otro normalize en otro sitio, partir por no-letras o leer el pedido salta igual', () => {
    const otro = `${LINEA_CON_EXCEPCION}
const q = (t: string) => t.normalize('NFD').split(/[^a-z0-9]+/)
`
    const r = sinLaExcepcion(ARCHIVO_CON_EXCEPCION, otro)
    expect(NFD.test(r)).toBe(true)
    expect(/split\(\s*\/\[\^a-z/i.test(r)).toBe(true)
    expect(/\b(necesito|voy_a_producir|ya_tengo)\b/.test(sinLaExcepcion(ARCHIVO_CON_EXCEPCION, `${LINEA_CON_EXCEPCION}
const n = pedido.necesito
`))).toBe(true)
  })
  it('el archivo permitido NO está en la lista de quienes pueden leer el pedido: etiquetar.ts no lee necesito ni voy_a_producir', () => {
    expect(ARCHIVO_CON_EXCEPCION).toBe('src/lib/cerebro/portero/etiquetar.ts')
    expect(LINEA_CON_EXCEPCION).toMatch(/^const normalizar = \(t: string\): string => t\.normalize\('NFD'\)/)
  })
})
