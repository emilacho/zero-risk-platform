/**
 * PASO 6 · DOS ARREGLOS DE LA MEDICIÓN (relevo 6 · adenda 2). Modelo SIMULADO, ninguna llamada real.
 *  A · «30 de 30 a respaldo clases_invalidas»: el índice ofrece las clases como «E2 catalogo_item» y el modelo las repite como «catalogo_item». Se acepta el nombre SIN el estante
 *      cuando identifica a UN solo grupo entre los ofrecidos; si es ambiguo, no se adivina.
 *  B · el corte del resumen a 100 caracteres hacía declarar «faltante» lo que la ficha entregada sí trae: ahora la instrucción dice que un resumen terminado en «…» está CORTADO
 *      y que eso se resuelve ENTREGANDO la línea (y poniéndola en «duda»), no declarando «faltante».
 */
import { describe, expect, it } from 'vitest'
import { A, AHORA, crearBaseFalsa, tablasDeLaBase } from '../../__tests__/casos'
import type { Ficha } from '../../tipos'
import { normalizarNombre } from '../estantes'
import { INSTRUCCION_DE_CLASES, INSTRUCCION_DE_ESTANTES, INSTRUCCION_DE_FAMILIAS, INSTRUCCION_DEL_PORTERO } from '../instruccion'
import { lineaParaElModelo } from '../lista-numerada'
import { razonar, type DepsDeRazonar, type PeticionAlModelo } from '../razonar'

const QUE_ES = 'ficha de una cosa del archivo del cliente con su presentación y su detalle'
const ficha = (i: number, estante: Ficha['estante'], clase: string, titulo: string, familia?: string): Ficha => ({
  ref: `prueba:${estante}-${clase}-${String(i).padStart(4, '0')}`, estante, clase, titulo, que_es: QUE_ES, origen: 'su_fuente', estado: 'visto_en_su_fuente',
  fecha_fuente: '2026-09-20T00:00:00.000Z', vigente_hasta: null, vencido: false, peso_estimado: 300 + (i % 7) * 40, ...(familia ? { datos: { familia } } : {}),
})
/** E2 grande (catálogo + sitio + sede, sin familias) y estantes chicos; dos estantes con la MISMA clase («foto» en E3 y en E5) para probar la ambigüedad */
function lista(): Ficha[] {
  const f: Ficha[] = []
  for (let i = 0; i < 3; i++) f.push(ficha(i, 'E1', 'plan', `Plan ${i}`))
  for (let i = 0; i < 520; i++) f.push(ficha(i, 'E2', 'catalogo_item', `Producto ${String(i).padStart(4, '0')} de la línea ${i % 20}`))
  for (let i = 0; i < 6; i++) f.push(ficha(i, 'E2', 'sitio', `Página ${i}`))
  for (let i = 0; i < 4; i++) f.push(ficha(i, 'E2', 'sede', `Oficina ${i}`))
  for (let i = 0; i < 5; i++) f.push(ficha(i, 'E3', 'foto', `Foto de la sede ${i}`))
  for (let i = 0; i < 5; i++) f.push(ficha(i, 'E5', 'foto', `Foto de producto ${i}`))
  return f
}
type Contesta = (p: PeticionAlModelo) => string
function armar(contesta: Contesta) {
  const peticiones: PeticionAlModelo[] = []
  const deps: DepsDeRazonar = {
    consulta: crearBaseFalsa(tablasDeLaBase()).consulta,
    llamarModelo: async (p) => { peticiones.push(p); return { texto: contesta(p), usage: { input_tokens: 7000, output_tokens: 600 } } },
    registrar: async () => ({ ok: true }),
    ahora: () => AHORA,
  }
  return { deps, peticiones }
}
const cuerpo = (l: Ficha[]) => ({ cliente: A, workflow_id: 'wf-prueba', workflow_execution_id: 'ex-1', prueba: true, lista_de_prueba: l, voy_a_producir: { output: 'carrusel', material: 'video', canal: 'red', objetivo: 'vender' }, necesito: 'un carrusel', ronda: 1 })
const numerosDe = (t: string) => [...t.matchAll(/^#(\d+) /gm)].map((m) => Number(m[1]))
const listaDe = (p: PeticionAlModelo) => /<lista>\n([\s\S]*)\n<\/lista>/.exec(p.messages[0].content)![1]
const salida = (r: { cuerpo: Record<string, unknown> }) => r.cuerpo as Record<string, any>
const decision = (n: number[]) => JSON.stringify({ entregar: n, pixeles: [], por_que: [], faltantes: [], duda: [] })
const modelo = (clases: unknown[], estantes: unknown[] = ['E2']): Contesta => (p) => {
  if (p.system === INSTRUCCION_DE_ESTANTES) return JSON.stringify({ estantes })
  if (p.system === INSTRUCCION_DE_CLASES) return JSON.stringify({ clases })
  if (p.system === INSTRUCCION_DE_FAMILIAS) return JSON.stringify({ familias: [] })
  return decision(numerosDe(listaDe(p)).slice(0, 2))
}

describe('A · el nombre de la clase se acepta con o sin el estante, sin adivinar', () => {
  it('EL CASO MEDIDO: el modelo repite «catalogo_item», «sitio», «sede» (sin el estante) → se aceptan y la lectura sigue (antes: 30 de 30 a respaldo)', async () => {
    const { deps, peticiones } = armar(modelo(['catalogo_item', 'sitio', 'sede']))
    const r = salida(await razonar(deps, cuerpo(lista())))
    expect(r.modo).toBe('conversado')
    expect(r.niveles[1]).toMatchObject({ nivel: 'clase', grupos_invalidos: [] })
    expect([...r.niveles[1].grupos_elegidos].sort()).toEqual(['E2 catalogo_item', 'E2 sede', 'E2 sitio'])
    expect(peticiones.some((p) => p.system === INSTRUCCION_DEL_PORTERO)).toBe(true) // llegó a la lectura
  })
  it('el nombre completo sigue valiendo; mezclar completo, pelado, con otra capitalización y entre comillas también', async () => {
    const { deps } = armar(modelo(['E2 catalogo_item', 'SITIO', '«sede»', '"E2 sede"']))
    const r = salida(await razonar(deps, cuerpo(lista())))
    expect(r.niveles[1].grupos_elegidos.sort()).toEqual(['E2 catalogo_item', 'E2 sede', 'E2 sitio'])
    expect(r.niveles[1].grupos_invalidos).toEqual([])
  })
  it('un nombre pelado que NO existe es inválido; uno bueno junto a él sigue valiendo (se anota el malo)', async () => {
    const { deps } = armar(modelo(['catalogo_item', 'ficha_tecnica', 'nada_que_ver']))
    const r = salida(await razonar(deps, cuerpo(lista())))
    expect(r.modo).toBe('conversado')
    expect(r.niveles[1]).toMatchObject({ grupos_elegidos: ['E2 catalogo_item'], grupos_invalidos: ['ficha_tecnica', 'nada_que_ver'] })
  })
  it('AMBIGUO: «foto» existe en E3 y en E5 → NO se adivina: es inválido (y si es lo único que pidió, respaldo clases_invalidas, declarado)', async () => {
    const { deps } = armar(modelo(['foto'], ['E2', 'E3', 'E5']))
    const r = salida(await razonar(deps, cuerpo(lista())))
    expect(r).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'clases_invalidas' })
    expect(r.niveles[1]).toMatchObject({ grupos_elegidos: [], grupos_invalidos: ['foto'] })
  })
  it('con el estante delante deja de ser ambiguo: «E3 foto» vale aunque «foto» sola no', async () => {
    const { deps } = armar(modelo(['E3 foto', 'catalogo_item'], ['E2', 'E3', 'E5']))
    const r = salida(await razonar(deps, cuerpo(lista())))
    expect(r.niveles[1].grupos_elegidos.sort()).toEqual(['E2 catalogo_item', 'E3 foto'])
  })
  it('solo vale el nombre sin estante cuando identifica a UN grupo de los ofrecidos EN ESTE nivel: otra clase u otro estante no cuentan', async () => {
    // E5 no se eligió: su «foto» no se ofrece, así que «foto» identifica SOLO a «E3 foto»
    const { deps } = armar(modelo(['foto'], ['E2', 'E3']))
    const r = salida(await razonar(deps, cuerpo(lista())))
    expect(r.niveles[1]).toMatchObject({ grupos_elegidos: ['E3 foto'], grupos_invalidos: [] })
  })
  it('en el nivel de estante y de familia NO hay alias: un estante o una familia mal escritos siguen siendo inválidos', async () => {
    const { deps } = armar(modelo(['catalogo_item'], ['catalogo_item']))
    const r = salida(await razonar(deps, cuerpo(lista())))
    expect(r).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'estantes_invalidos' })
  })
  it('las familias NO tienen alias: «07» no vale por «Familia 07» (solo la clase se acepta sin su estante)', async () => {
    const conFamilias: Ficha[] = [...Array.from({ length: 3 }, (_, i) => ficha(i, 'E1', 'plan', `Plan ${i}`)), ...Array.from({ length: 520 }, (_, i) => ficha(i, 'E2', 'catalogo_item', `Producto ${i}`, `Familia ${String(i % 20).padStart(2, '0')}`))]
    const bueno = armar((p) => (p.system === INSTRUCCION_DE_ESTANTES ? JSON.stringify({ estantes: ['E2'] }) : p.system === INSTRUCCION_DE_FAMILIAS ? JSON.stringify({ familias: ['Familia 07'] }) : decision(numerosDe(listaDe(p)).slice(0, 2))))
    expect(salida(await razonar(bueno.deps, cuerpo(conFamilias))).niveles[1]).toMatchObject({ nivel: 'familia', grupos_elegidos: ['Familia 07'] })
    const malo = armar((p) => (p.system === INSTRUCCION_DE_ESTANTES ? JSON.stringify({ estantes: ['E2'] }) : JSON.stringify({ familias: ['07'] })))
    expect(salida(await razonar(malo.deps, cuerpo(conFamilias)))).toMatchObject({ modo: 'respaldo', motivo_de_respaldo: 'familias_invalidas' })
  })
  it('normalizarNombre ignora mayúsculas, espacios de más y las comillas de alrededor; no toca lo demás', () => {
    for (const x of ['E2 catalogo_item', '  e2   CATALOGO_ITEM ', '«E2 catalogo_item»', '"E2 catalogo_item"', '`E2 catalogo_item`', '“E2 catalogo_item”']) expect(normalizarNombre(x)).toBe('E2 CATALOGO_ITEM')
    expect(normalizarNombre('Familia 07')).toBe('FAMILIA 07')
    expect(normalizarNombre('Familia 07')).not.toBe(normalizarNombre('Familia 7'))
  })
})

describe('B · el resumen cortado no se confunde con «no existe» (el falso «faltante» de la etapa 1)', () => {
  const larga = 'Resumen general de la página del plan anual con todo lo que incluye la visita, los controles y el seguimiento. La cuota mensual es de US$ 19 hasta antes de fin de año.'
  const ficha1 = (que_es: string): Ficha => ({ ...ficha(1, 'E6', 'sitio', 'Página del plan anual'), que_es })
  it('una línea cuyo resumen pasa de 100 caracteres sale CORTADA y marcada con «…» (el dato del final no se ve)', () => {
    expect(larga.length).toBeGreaterThan(100)
    const l = lineaParaElModelo(7, ficha1(larga))
    expect(l).toContain('…')
    expect(l).not.toContain('cuota mensual')
    expect(lineaParaElModelo(8, ficha1('resumen corto')).includes('…')).toBe(false)
  })
  it('la instrucción le dice al portero qué hacer con una línea cortada: entregarla y ponerla en «duda», no declarar «faltante»', () => {
    expect(INSTRUCCION_DEL_PORTERO).toMatch(/8\. Cuando el resumen de una línea termina en «…», ese resumen está CORTADO/)
    expect(INSTRUCCION_DEL_PORTERO).toMatch(/entrega esa línea y pon su número en «duda»/)
    expect(INSTRUCCION_DEL_PORTERO).toMatch(/En «faltantes» va únicamente lo que ninguna línea, ni siquiera una cortada, podría traer/)
    expect(INSTRUCCION_DEL_PORTERO.indexOf('8. ')).toBeGreaterThan(INSTRUCCION_DEL_PORTERO.indexOf('7. '))
    expect(INSTRUCCION_DEL_PORTERO.indexOf('8. ')).toBeLessThan(INSTRUCCION_DEL_PORTERO.indexOf('FORMATO:'))
  })
  it('la instrucción sigue siendo agnóstica: no nombra rubro, cliente ni tipo de trabajo', () => {
    expect(INSTRUCCION_DEL_PORTERO).not.toMatch(/laboratorio|cl[ií]nica|restaurante|marisquer|cotizador|chequeo|n[aá]ufrago|p[eé]rez|ferreter|inmobiliari|medicament|academia|veterinari/i)
  })
  it('el mensaje que recibe el modelo trae la instrucción nueva en la llamada de decisión (y las de nivel no la llevan)', async () => {
    const { deps, peticiones } = armar(modelo(['catalogo_item']))
    await razonar(deps, cuerpo(lista()))
    const decisiones = peticiones.filter((p) => p.system === INSTRUCCION_DEL_PORTERO)
    expect(decisiones.length).toBeGreaterThan(0)
    for (const p of peticiones.filter((x) => x.system !== INSTRUCCION_DEL_PORTERO)) expect(p.system).not.toMatch(/CORTADO/)
  })
})
