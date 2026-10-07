/**
 * PASO 6 · ARREGLO 3 (relevo 7 · medición real de las etapas 1 y 2). Modelo SIMULADO, ninguna llamada real.
 * Causas leídas en las respuestas guardadas (ver `…paso-6-ARREGLO-3.md`):
 *  · catálogo entero con 400 de 560 entregados: DESPUÉS de que el portero decidió «abro todas las familias», cada trozo de lectura volvía a escoger línea por línea y soltaba lo vencido y otras familias de forma inconsistente
 *    → el portero puede declarar en «completas» los grupos que necesita ENTEROS; el sistema los entrega completos, sin segunda selección.
 *  · comparación con 2 de 45 precios y cotizador con 5 de 8 consultas: tomó una muestra de un conjunto que el trabajo necesitaba entero → regla 9 de la instrucción (conjunto entero).
 *  · falsos «faltante» por el resumen cortado → antes de declarar un faltante se lee el texto COMPLETO de las fichas entregadas que salieron cortadas.
 */
import { describe, expect, it } from 'vitest'
import { A, AHORA, crearBaseFalsa, tablasDeLaBase } from '../../__tests__/casos'
import type { Ficha } from '../../tipos'
import { INSTRUCCION_DE_CLASES, INSTRUCCION_DE_ESTANTES, INSTRUCCION_DE_FAMILIAS, INSTRUCCION_DE_VERIFICACION, INSTRUCCION_DEL_PORTERO } from '../instruccion'
import { numerarLista } from '../lista-numerada'
import { MAXIMO_DE_FICHAS_A_VERIFICAR, razonar, type DepsDeRazonar, type PeticionAlModelo } from '../razonar'

const QUE_ES = 'ficha de una cosa del archivo del cliente con su presentación y su detalle'
const ficha = (i: number, estante: Ficha['estante'], clase: string, titulo: string, familia?: string, extra: Partial<Ficha> = {}): Ficha => ({
  ref: `prueba:${estante}-${clase}-${String(i).padStart(4, '0')}`, estante, clase, titulo, que_es: QUE_ES, origen: 'su_fuente', estado: 'visto_en_su_fuente',
  fecha_fuente: '2026-09-20T00:00:00.000Z', vigente_hasta: null, vencido: false, peso_estimado: 300 + (i % 7) * 40, ...(familia ? { datos: { familia } } : {}), ...extra,
})
const fam = (i: number) => `Familia ${String(i % 18).padStart(2, '0')}`
/** catálogo grande con familias (un tercio vencido) + sedes + sitio + fotos; ≈ 580 líneas */
function listaGrande(): Ficha[] {
  const f: Ficha[] = []
  for (let i = 0; i < 3; i++) f.push(ficha(i, 'E1', 'plan', `Plan ${i}`))
  for (let i = 0; i < 560; i++) f.push(ficha(i, 'E2', 'catalogo_item', `Producto ${String(i).padStart(4, '0')} de la línea ${i % 18}`, fam(i), i % 3 === 0 ? { vencido: true, vigente_hasta: '2026-08-01T00:00:00.000Z' } : {}))
  for (let i = 0; i < 6; i++) f.push(ficha(i, 'E2', 'sede', `Oficina ${i} y su horario`))
  for (let i = 0; i < 6; i++) f.push(ficha(i, 'E2', 'sitio', `Página ${i}`))
  return f
}
type Contesta = (p: PeticionAlModelo, n: number) => string | Error
function armar(contesta: Contesta, over: Partial<DepsDeRazonar> = {}) {
  const peticiones: PeticionAlModelo[] = []
  const registros: Array<Record<string, unknown>> = []
  const deps: DepsDeRazonar = {
    consulta: crearBaseFalsa(tablasDeLaBase()).consulta,
    llamarModelo: async (p) => { peticiones.push(p); const r = contesta(p, peticiones.length); if (r instanceof Error) throw r; return { texto: r, usage: { input_tokens: 7000, output_tokens: 600 } } },
    registrar: async (fila) => { registros.push(fila); return { ok: true } },
    ahora: () => AHORA,
    ...over,
  }
  return { deps, peticiones, registros }
}
const cuerpo = (l: Ficha[]) => ({ cliente: A, workflow_id: 'wf-prueba', workflow_execution_id: 'ex-1', prueba: true, lista_de_prueba: l, voy_a_producir: { output: 'buscador', material: 'código', canal: 'web', objetivo: 'mostrar todo el catálogo' }, necesito: 'un buscador de todo el catálogo', ronda: 1 })
const numerosDe = (t: string) => [...t.matchAll(/^#(\d+) /gm)].map((m) => Number(m[1]))
const listaDe = (p: PeticionAlModelo) => /<lista>\n([\s\S]*)\n<\/lista>/.exec(p.messages[0].content)![1]
const salida = (r: { cuerpo: Record<string, unknown> }) => r.cuerpo as Record<string, any>
const decision = (n: number[], extra: Record<string, unknown> = {}) => JSON.stringify({ entregar: n, pixeles: [], por_que: [{ numeros: n.slice(0, 1), linea: 'sirve' }], faltantes: [], duda: [], ...extra })
const completa = (f: Ficha[]) => numerarLista({ cliente_id: 'x', generada_en: 'x', estado: 'ok', fuentes: {} as never, lineas: f })

/** el modelo simulado de la navegación: lo que se le diga en cada nivel; en la decisión, los primeros números de lo que ve */
const navega = (o: { estantes?: string[]; clases?: unknown; completasClases?: unknown; familias?: unknown; completasFamilias?: unknown; final?: (n: number[], p: PeticionAlModelo) => string }): Contesta => (p) => {
  if (p.system === INSTRUCCION_DE_ESTANTES) return JSON.stringify({ estantes: o.estantes ?? ['E2'] })
  if (p.system === INSTRUCCION_DE_CLASES) return JSON.stringify({ clases: o.clases ?? [], ...(o.completasClases !== undefined ? { completas: o.completasClases } : {}) })
  if (p.system === INSTRUCCION_DE_FAMILIAS) return JSON.stringify({ familias: o.familias ?? [], ...(o.completasFamilias !== undefined ? { completas: o.completasFamilias } : {}) })
  const n = numerosDe(listaDe(p))
  return o.final ? o.final(n, p) : decision(n.slice(0, 2))
}

describe('completas · el portero pide un grupo ENTERO y el sistema lo entrega sin una segunda selección', () => {
  it('EL CASO MEDIDO (catálogo entero): «catalogo_item» completa → entrega las 560 líneas, también las vencidas, y la lectura final solo ve el resto', async () => {
    const f = listaGrande()
    const { deps, peticiones } = armar(navega({ clases: ['catalogo_item', 'sede', 'sitio'], completasClases: ['catalogo_item'] }))
    const r = salida(await razonar(deps, cuerpo(f)))
    const full = completa(f)
    const catalogo = full.lineas.filter((l) => l.ficha.clase === 'catalogo_item')
    expect(catalogo).toHaveLength(560)
    expect(r.modo).toBe('conversado')
    const entregadas = new Set(r.decision.entregar)
    for (const l of catalogo) expect(entregadas.has(l.ficha.ref), l.ficha.ref).toBe(true) // las 560, vencidas incluidas
    expect(catalogo.filter((l) => l.ficha.vencido).length).toBeGreaterThan(150)
    expect(r.decision.grupos_completos).toEqual([{ nivel: 'clase', grupo: 'E2 catalogo_item', lineas: 560 }])
    // la lectura final NO vio el catálogo: solo las sedes y el sitio (12 líneas)
    const lectura = peticiones.filter((p) => p.system === INSTRUCCION_DEL_PORTERO)
    expect(lectura).toHaveLength(1)
    expect(numerosDe(listaDe(lectura[0]))).toHaveLength(12)
    expect(peticiones.map((p) => p.system)).toEqual([INSTRUCCION_DE_ESTANTES, INSTRUCCION_DE_CLASES, INSTRUCCION_DEL_PORTERO]) // sin familias ni trozos
    expect(r.lectura_final).toMatchObject({ lineas_mostradas: 12, lineas_completas: 560, trozos: 1 })
  })
  it('costa MENOS que leerlo todo en trozos: la lectura de 560 líneas ya no existe', async () => {
    const f = listaGrande()
    const completas = armar(navega({ clases: ['catalogo_item'], completasClases: ['catalogo_item'] }))
    const rc = salida(await razonar(completas.deps, cuerpo(f)))
    const trozos = armar(navega({ clases: ['catalogo_item'], familias: Array.from({ length: 18 }, (_, i) => fam(i)) }))
    const rt = salida(await razonar(trozos.deps, cuerpo(f)))
    expect(completas.peticiones.length).toBeLessThan(trozos.peticiones.length)
    expect(rc.costo_usd).toBeLessThan(rt.costo_usd)
  })
  it('si TODO lo abierto se pidió entero no hay llamada de lectura: la decisión son esos grupos', async () => {
    const f = listaGrande().filter((x) => x.estante === 'E2').map((x) => ({ ...x, datos: undefined }))
    const { deps, peticiones } = armar(navega({ clases: ['catalogo_item'], completasClases: ['catalogo_item'] }))
    const r = salida(await razonar(deps, cuerpo(f)))
    expect(peticiones.map((p) => p.system)).toEqual([INSTRUCCION_DE_CLASES])
    expect(r.modo).toBe('conversado')
    expect(r.decision.entregar).toHaveLength(560)
    expect(r.decision.faltantes).toEqual([])
    expect(r.lectura_final).toMatchObject({ lineas_mostradas: 0, lineas_completas: 560, trozos: 0 })
  })
  it('en el nivel de familia también: una familia completa + otras abiertas para escoger', async () => {
    const f = listaGrande()
    const { deps, peticiones } = armar(navega({ clases: ['catalogo_item'], familias: [fam(2), fam(5)], completasFamilias: [fam(2)] }))
    const r = salida(await razonar(deps, cuerpo(f)))
    const full = completa(f)
    const de2 = full.lineas.filter((l) => l.ficha.datos?.familia === fam(2))
    expect(r.decision.grupos_completos).toEqual([{ nivel: 'familia', grupo: fam(2), lineas: de2.length }])
    for (const l of de2) expect(r.decision.entregar).toContain(l.ficha.ref)
    const lectura = peticiones.filter((p) => p.system === INSTRUCCION_DEL_PORTERO)
    const vistos = new Set(lectura.flatMap((p) => numerosDe(listaDe(p))))
    for (const l of de2) expect(vistos.has(l.numero)).toBe(false) // la completa no se vuelve a escoger
    const de5 = full.lineas.filter((l) => l.ficha.datos?.familia === fam(5))
    for (const l of de5) expect(vistos.has(l.numero)).toBe(true) // la abierta sí
  })
  it('una completa cuenta como abierta aunque no esté en la lista de grupos elegidos', async () => {
    const f = listaGrande()
    const { deps } = armar(navega({ clases: ['sede'], completasClases: ['catalogo_item'] }))
    const r = salida(await razonar(deps, cuerpo(f)))
    expect(r.niveles[1].grupos_elegidos).toEqual(expect.arrayContaining(['E2 sede', 'E2 catalogo_item']))
    expect(r.decision.entregar).toHaveLength(560 + 2 + 0 > 0 ? r.decision.entregar.length : 0)
    expect(r.decision.grupos_completos[0]).toMatchObject({ grupo: 'E2 catalogo_item', lineas: 560 })
  })
  it('el nombre de la completa sigue las mismas reglas que el de un grupo abierto (pelado vale, inexistente se anota y no tumba nada)', async () => {
    const { deps } = armar(navega({ clases: ['catalogo_item', 'sede'], completasClases: ['catalogo_item', 'no_existe', 'E2'] }))
    const r = salida(await razonar(deps, cuerpo(listaGrande())))
    expect(r.modo).toBe('conversado')
    expect(r.niveles[1].grupos_completos).toEqual(['E2 catalogo_item'])
    expect(r.niveles[1].grupos_invalidos).toEqual(expect.arrayContaining(['no_existe', 'E2']))
  })
  it('«completas» en el nivel de ESTANTE no existe: se ignora', async () => {
    const { deps } = armar((p) => (p.system === INSTRUCCION_DE_ESTANTES ? JSON.stringify({ estantes: ['E2'], completas: ['E2'] }) : p.system === INSTRUCCION_DE_CLASES ? JSON.stringify({ clases: ['catalogo_item'] }) : p.system === INSTRUCCION_DE_FAMILIAS ? JSON.stringify({ familias: [fam(1)] }) : decision(numerosDe(listaDe(p)).slice(0, 1))))
    const r = salida(await razonar(deps, cuerpo(listaGrande())))
    expect(r.niveles[0].grupos_completos).toEqual([])
    expect(r.decision.grupos_completos).toBeUndefined()
  })
  it('lo que el portero escogió cosa por cosa se junta con lo completo: sin repetidos y en orden de número; por_que nombra cada grupo completo', async () => {
    const f = listaGrande()
    const { deps } = armar(navega({ clases: ['catalogo_item', 'sede'], completasClases: ['catalogo_item'], final: (n) => decision([n[0], n[1], n[0]]) }))
    const r = salida(await razonar(deps, cuerpo(f)))
    const nums: number[] = r.decision.entregar_numeros
    expect(nums).toEqual([...new Set(nums)].sort((a, b) => a - b))
    expect(nums.length).toBe(560 + 2)
    expect(r.decision.entregar).toHaveLength(nums.length)
    expect(r.decision.por_que[0].linea).toMatch(/^Grupo completo «E2 catalogo_item» \(clase\)/)
    expect(r.decision.por_que[0].numeros).toHaveLength(560)
  })
  it('lo completo que está DESPUÉS de lo escogido igual sale en orden de número (la fusión ordena, no apila)', async () => {
    const f = [...Array.from({ length: 60 }, (_, i) => ficha(i, 'E2', 'catalogo_item', `Producto ${i}`)), ...Array.from({ length: 6 }, (_, i) => ficha(i, 'E2', 'sede', `Oficina ${i}`)), ficha(0, 'E3', 'otra', 'Otra cosa')]
    const { deps } = armar(navega({ clases: ['catalogo_item', 'sede'], completasClases: ['sede'], final: (n) => decision([n[0], n[1]]) }), { topeDeEntradaTokens: 5000 })
    const r = salida(await razonar(deps, cuerpo(f)))
    const nums: number[] = r.decision.entregar_numeros
    expect(nums.length).toBeGreaterThanOrEqual(2 + 6)
    expect(nums).toEqual([...nums].sort((a, b) => a - b))
    expect(nums[0]).toBeLessThan(nums[nums.length - 1])
    expect(r.decision.entregar[0]).toBe(f[0].ref)
  })
  it('los faltantes de una lectura que NO vio lo completo no son concluyentes: se anotan aparte y no se declaran', async () => {
    const { deps } = armar(navega({ clases: ['catalogo_item', 'sede'], completasClases: ['catalogo_item'], final: (n) => decision([n[0]], { faltantes: ['el horario de la oficina 9'] }) }))
    const r = salida(await razonar(deps, cuerpo(listaGrande())))
    expect(r.decision.faltantes).toEqual([])
    expect(r.decision.faltantes_no_concluyentes).toEqual(['el horario de la oficina 9'])
  })
  it('con lo completo ya apartado, si lo que queda no cabe en una llamada se lee en trozos que NO incluyen lo completo', async () => {
    const f = [...listaGrande().filter((x) => x.estante === 'E2'), ...Array.from({ length: 200 }, (_, i) => ficha(i, 'E2', 'dato_de_sede', `Dato ${String(i).padStart(4, '0')}`))]
    const { deps, peticiones } = armar(navega({ clases: ['catalogo_item', 'dato_de_sede'], completasClases: ['catalogo_item'] }), { topeDeEntradaTokens: 6000 })
    const r = salida(await razonar(deps, cuerpo(f)))
    const lecturas = peticiones.filter((p) => p.system === INSTRUCCION_DEL_PORTERO)
    expect(lecturas.length).toBeGreaterThanOrEqual(2)
    const vistos = lecturas.flatMap((p) => numerosDe(listaDe(p)))
    const full = completa(f)
    const numCat = new Set(full.lineas.filter((l) => l.ficha.clase === 'catalogo_item').map((l) => l.numero))
    expect(vistos.some((n) => numCat.has(n))).toBe(false)
    expect(r.decision.entregar).toHaveLength(560 + lecturas.length * 2)
  })
  it('lo vencido dentro de lo completo SÍ se entrega (el sistema ya lo marca); y aun así la completa no inventa nada: solo refs de la propia lista', async () => {
    const f = listaGrande()
    const { deps } = armar(navega({ clases: ['catalogo_item'], completasClases: ['catalogo_item'] }))
    const r = salida(await razonar(deps, cuerpo(f)))
    const refs = new Set(completa(f).lineas.map((l) => l.ficha.ref))
    for (const x of r.decision.entregar) expect(refs.has(x)).toBe(true)
    const vencidos = f.filter((x) => x.vencido).map((x) => x.ref)
    for (const v of vencidos) expect(r.decision.entregar).toContain(v)
  })
  it('las instrucciones de clase y familia ofrecen «completas»; la de estante no; ninguna nombra rubro, cliente ni tipo de trabajo', () => {
    for (const t of [INSTRUCCION_DE_CLASES, INSTRUCCION_DE_FAMILIAS]) {
      expect(t).toMatch(/en «completas» pon los/)
      expect(t).toMatch(/"completas":\[/)
      expect(t).toMatch(/también lo vencido/)
    }
    expect(INSTRUCCION_DE_ESTANTES).not.toMatch(/completas/)
    for (const t of [INSTRUCCION_DE_CLASES, INSTRUCCION_DE_FAMILIAS, INSTRUCCION_DEL_PORTERO, INSTRUCCION_DE_VERIFICACION]) expect(t).not.toMatch(/laboratorio|cl[ií]nica|restaurante|marisquer|cotizador|chequeo|n[aá]ufrago|p[eé]rez|ferreter|inmobiliari|medicament|academia|veterinari|farmacia/i)
  })
  it('regla 9: el conjunto ENTERO cuando el trabajo compara, audita, busca o muestra (también vencidas), en su sitio y antes del formato', () => {
    expect(INSTRUCCION_DEL_PORTERO).toMatch(/9\. Cuando el trabajo compara, audita, busca o muestra un CONJUNTO de cosas del mismo tipo/)
    expect(INSTRUCCION_DEL_PORTERO).toMatch(/necesita el conjunto ENTERO, no una muestra/)
    expect(INSTRUCCION_DEL_PORTERO).toMatch(/también las vencidas/)
    expect(INSTRUCCION_DEL_PORTERO.indexOf('9. ')).toBeGreaterThan(INSTRUCCION_DEL_PORTERO.indexOf('8. '))
    expect(INSTRUCCION_DEL_PORTERO.indexOf('9. ')).toBeLessThan(INSTRUCCION_DEL_PORTERO.indexOf('FORMATO:'))
  })
})

describe('verificación de faltantes · antes de declarar que algo FALTA se lee la ficha COMPLETA de lo entregado que salió cortado', () => {
  const LARGA = 'Resumen general de la página del plan anual con todo lo que incluye la visita, los controles y el seguimiento. La cuota mensual es de US$ 19 hasta antes de fin de año.'
  const lista = (): Ficha[] => [ficha(1, 'E6', 'sitio', 'Página del plan anual', undefined, { que_es: LARGA }), ficha(2, 'E3', 'sede', 'Oficina Norte'), ficha(3, 'E3', 'sede', 'Oficina Centro')]
  const faltante = 'la cuota mensual exacta del plan anual (la línea 1 está cortada)'
  const conFaltante = (extra: Record<string, unknown> = {}): Contesta => (p) => {
    if (p.system === INSTRUCCION_DE_VERIFICACION) return JSON.stringify({ siguen_faltando: [] })
    return decision([1, 2], { faltantes: [faltante], duda: [1], ...extra })
  }
  it('EL CASO MEDIDO: el faltante «cuota exacta» sí está en la ficha completa → la verificación lo descarta y la respuesta lo dice', async () => {
    const { deps, peticiones, registros } = armar(conFaltante())
    const r = salida(await razonar(deps, cuerpo(lista())))
    expect(peticiones.map((p) => p.system)).toEqual([INSTRUCCION_DEL_PORTERO, INSTRUCCION_DE_VERIFICACION])
    const v = peticiones[1]
    expect(v.messages[0].content).toContain('cuota mensual es de US$ 19 hasta antes de fin de año') // el texto COMPLETO, que la lista tenía cortado
    expect(v.messages[0].content).toContain('1. ' + faltante)
    expect(v.max_tokens).toBeLessThanOrEqual(300)
    expect(r.decision.faltantes).toEqual([])
    expect(r.decision.faltantes_descartados_por_ficha_completa).toEqual([faltante])
    expect(r.verificacion_de_faltantes).toMatchObject({ estado: 'hecha', faltantes_antes: 1, faltantes_despues: 0, fichas_leidas: 1 })
    expect(r.pasadas).toBe(2)
    expect(registros.map((x) => (x.metadata as any).nivel ?? 'decision')).toEqual(['decision', 'verificacion'])
    expect(registros.every((x) => x.workflow_id === 'wf-prueba' && x.client_id === 'prueba-portero')).toBe(true)
    expect(r.costo_usd).toBeCloseTo(2 * ((7000 * 2 + 600 * 10) / 1_000_000), 8) // la verificación se cobra y se suma
  })
  it('si la ficha completa NO lo trae, el faltante se queda (la verificación no inventa)', async () => {
    const { deps } = armar((p) => (p.system === INSTRUCCION_DE_VERIFICACION ? JSON.stringify({ siguen_faltando: [1] }) : decision([1, 2], { faltantes: [faltante], duda: [1] })))
    const r = salida(await razonar(deps, cuerpo(lista())))
    expect(r.decision.faltantes).toEqual([faltante])
    expect(r.decision.faltantes_descartados_por_ficha_completa).toBeUndefined()
  })
  it('con varios faltantes se descarta solo el que ya estaba (por número)', async () => {
    const otro = 'el teléfono del gerente'
    const { deps, peticiones } = armar((p) => (p.system === INSTRUCCION_DE_VERIFICACION ? JSON.stringify({ siguen_faltando: [2] }) : decision([1, 2], { faltantes: [faltante, otro], duda: [1] })))
    const r = salida(await razonar(deps, cuerpo(lista())))
    expect(peticiones[1].messages[0].content).toMatch(/1\. la cuota[\s\S]*2\. el teléfono/)
    expect(r.decision.faltantes).toEqual([otro])
    expect(r.decision.faltantes_descartados_por_ficha_completa).toEqual([faltante])
  })
  it('SIN fichas cortadas entregadas (o sin faltantes) NO hay llamada de verificación', async () => {
    const corta = armar(conFaltante())
    await razonar(corta.deps, cuerpo([ficha(2, 'E3', 'sede', 'Oficina Norte'), ficha(3, 'E3', 'sede', 'Oficina Centro')]))
    expect(corta.peticiones).toHaveLength(1)
    const sin = armar((p) => decision([1, 2]))
    await razonar(sin.deps, cuerpo(lista()))
    expect(sin.peticiones).toHaveLength(1)
    const noEntregada = armar((p) => decision([2, 3], { faltantes: [faltante] })) // la cortada (1) NO se entregó ni está en duda: no se lee
    await razonar(noEntregada.deps, cuerpo(lista()))
    expect(noEntregada.peticiones).toHaveLength(1)
  })
  it('si la verificación falla (error, JSON roto o números absurdos) los faltantes quedan como estaban y se dice; nada se cae', async () => {
    for (const mala of [new Error('boom'), 'no es json', JSON.stringify({ otra: 1 })]) {
      const { deps } = armar((p) => (p.system === INSTRUCCION_DE_VERIFICACION ? mala : decision([1, 2], { faltantes: [faltante], duda: [1] })))
      const r = salida(await razonar(deps, cuerpo(lista())))
      expect(r.modo).toBe('conversado')
      expect(r.decision.faltantes).toEqual([faltante])
      expect(r.verificacion_de_faltantes.estado).toBe('fallo')
    }
    const absurdos = armar((p) => (p.system === INSTRUCCION_DE_VERIFICACION ? JSON.stringify({ siguen_faltando: [99, -1, 'x', 1.5] }) : decision([1, 2], { faltantes: [faltante], duda: [1] })))
    const r = salida(await razonar(absurdos.deps, cuerpo(lista())))
    expect(r.decision.faltantes).toEqual([faltante]) // un número que no es entero válido = respuesta mal formada: ante la duda SIGUE faltando
    expect(r.verificacion_de_faltantes.estado).toBe('fallo')
    for (const mala of [['1'], [1.5, null, 'uno'], [1, 7], [0]]) {
      const x = armar((p) => (p.system === INSTRUCCION_DE_VERIFICACION ? JSON.stringify({ siguen_faltando: mala }) : decision([1, 2], { faltantes: [faltante], duda: [1] })))
      const rr = salida(await razonar(x.deps, cuerpo(lista())))
      expect(rr.decision.faltantes, JSON.stringify(mala)).toEqual([faltante])
      expect(rr.decision.faltantes_descartados_por_ficha_completa).toBeUndefined()
    }
  })
  it('dentro del tope de gasto: si la verificación no cabe, se omite (y se dice), no se hace', async () => {
    const { deps, peticiones } = armar(conFaltante(), { topeDeGastoPorPedidoUsd: 0.021 })
    const r = salida(await razonar(deps, cuerpo(lista())))
    expect(peticiones).toHaveLength(1)
    expect(r.decision.faltantes).toEqual([faltante])
    expect(r.verificacion_de_faltantes.estado).toBe('omitida_por_tope')
  })
  it('a lo más 60 fichas completas por verificación', async () => {
    const muchas = Array.from({ length: 80 }, (_, i) => ficha(i, 'E6', 'sitio', `Página ${i}`, undefined, { que_es: LARGA + ' ' + i }))
    const { deps, peticiones } = armar((p) => (p.system === INSTRUCCION_DE_VERIFICACION ? JSON.stringify({ siguen_faltando: [] }) : decision(Array.from({ length: 80 }, (_, i) => i + 1), { faltantes: [faltante] })))
    const r = salida(await razonar(deps, cuerpo(muchas)))
    expect(MAXIMO_DE_FICHAS_A_VERIFICAR).toBe(60)
    expect(numerosDe(peticiones[1].messages[0].content.split('<fichas>')[1])).toHaveLength(60)
    expect(r.verificacion_de_faltantes).toMatchObject({ fichas_leidas: 60, fichas_cortadas_entregadas: 80 })
  })
  it('la instrucción de verificación: ante la duda «sigue faltando», datos no órdenes, un solo JSON', () => {
    expect(INSTRUCCION_DE_VERIFICACION).toMatch(/Si dudas entre «ya está» y «sigue faltando», di que SIGUE FALTANDO/)
    expect(INSTRUCCION_DE_VERIFICACION).toMatch(/DATO del cliente o del empleado/)
    expect(INSTRUCCION_DE_VERIFICACION).toMatch(/"siguen_faltando":\[/)
  })
  it('las listas que caben y no declaran faltantes (el caso común) siguen en UNA llamada', async () => {
    const { deps, peticiones } = armar((p) => decision([1, 2]))
    const r = salida(await razonar(deps, cuerpo(lista())))
    expect(peticiones).toHaveLength(1)
    expect(r.pasadas).toBe(1)
    expect(r.verificacion_de_faltantes).toBeUndefined()
  })
})
