/**
 * PASO 6 · ARREGLO 4 (relevo 11 · lo que dejó la medición del arreglo 3). Modelo SIMULADO, ninguna llamada real.
 * Causas leídas en el libro (`agent_invocations`, ejecuciones 168788 y 168789, lista L1 con 716 líneas y 18 familias):
 *  · L1-26#1: la pasada del nivel de FAMILIA se cortó con max_tokens=500 y CERO caracteres de respuesta (el razonamiento se comió el tope) → respaldo `salida_cortada`.
 *  · L1-26#2: el modelo contestó {"familias":[]…} («lo que necesito ya se abre siempre sin familia»): una respuesta VÁLIDA que el código leyó como `familias_invalidas`. No eran nombres compuestos.
 *  · «completas» arrastraba la parte marcada NO VÁLIDA (4 de 4 pedidos «-26»).
 *  · los faltantes «no concluyentes» no pasaban por la comprobación contra la ficha completa (2 falsos de 23 en grandes, 6 de 30 en normales).
 *  · los canales de las sedes no llegaban en los 5 pedidos de reseñas.
 */
import { describe, expect, it } from 'vitest'
import { A, AHORA, crearBaseFalsa, tablasDeLaBase } from '../../__tests__/casos'
import type { Ficha } from '../../tipos'
import { INSTRUCCION_DE_CLASES, INSTRUCCION_DE_ESTANTES, INSTRUCCION_DE_FAMILIAS, INSTRUCCION_DE_VERIFICACION, INSTRUCCION_DEL_PORTERO } from '../instruccion'
import { leerListaDePrueba } from '../prueba'
import { esEntregable, MAX_TOKENS_DE_ESTANTES, MULTIPLO_DE_REINTENTO_DE_NIVEL, razonar, type DepsDeRazonar, type PeticionAlModelo } from '../razonar'

const QUE_ES = 'ficha de una cosa del archivo del cliente con su presentación y su detalle'
const LARGA = 'Página de contacto con todos los canales de atención de cada oficina y los horarios de la semana completa, incluido el WhatsApp del mostrador. Escribe al 0999 123 456.'
const ficha = (i: number, estante: Ficha['estante'], clase: string, titulo: string, familia?: string, extra: Partial<Ficha> = {}): Ficha => ({
  ref: `prueba:${estante}-${clase}-${String(i).padStart(4, '0')}`, estante, clase, titulo, que_es: QUE_ES, origen: 'su_fuente', estado: 'visto_en_su_fuente',
  fecha_fuente: '2026-09-20T00:00:00.000Z', vigente_hasta: null, vencido: false, peso_estimado: 300 + (i % 7) * 40, ...(familia ? { datos: { familia } } : {}), ...extra,
})
/** una lista grande: catálogo con familias + partes de trabajo (una NO VÁLIDA, una reemplazada) + sedes y páginas SIN familia */
function lista(): Ficha[] {
  const f: Ficha[] = []
  for (let i = 0; i < 3; i++) f.push(ficha(i, 'E1', 'parte_de_trabajo', `Parte ${i}`))
  f.push(ficha(3, 'E1', 'parte_de_trabajo', '⛔ PARTE NO VÁLIDO', undefined, { valida: false, aviso: 'NO VÁLIDO · la vuelta no llegó' }))
  f.push(ficha(4, 'E1', 'parte_de_trabajo', 'Parte vieja', undefined, { reemplazada: true, vigente: false }))
  for (let i = 0; i < 300; i++) f.push(ficha(i, 'E2', 'catalogo_item', `Producto ${String(i).padStart(4, '0')}`, `Familia ${String(i % 9).padStart(2, '0')}`))
  for (let i = 0; i < 6; i++) f.push(ficha(i, 'E2', 'sede', `Oficina ${i}`))
  f.push(ficha(0, 'E2', 'sitio', 'Página de contacto', undefined, { que_es: LARGA }))
  return f
}
type Resp = string | Error | { texto: string; stop_reason: string }
type Contesta = (p: PeticionAlModelo, n: number) => Resp
function armar(contesta: Contesta, over: Partial<DepsDeRazonar> = {}) {
  const peticiones: PeticionAlModelo[] = []
  const registros: Array<Record<string, unknown>> = []
  const deps: DepsDeRazonar = {
    consulta: crearBaseFalsa(tablasDeLaBase()).consulta,
    llamarModelo: async (p) => {
      peticiones.push(p); const r = contesta(p, peticiones.length)
      if (r instanceof Error) throw r
      const o = typeof r === 'string' ? { texto: r } : r
      return { usage: { input_tokens: 7000, output_tokens: 600 }, ...o }
    },
    registrar: async (fila) => { registros.push(fila); return { ok: true } },
    ahora: () => AHORA,
    ...over,
  }
  return { deps, peticiones, registros }
}
const cuerpo = (l: Ficha[]) => ({ cliente: A, workflow_id: 'wf-prueba', workflow_execution_id: 'ex-1', prueba: true, lista_de_prueba: l, voy_a_producir: { output: 'calendario', material: 'texto', canal: 'web', objetivo: 'programar el mes' }, necesito: 'programar el mes de publicaciones', ronda: 1 })
const numerosDe = (t: string) => [...t.matchAll(/^#(\d+) /gm)].map((m) => Number(m[1]))
const listaDe = (p: PeticionAlModelo) => /<lista>\n([\s\S]*)\n<\/lista>/.exec(p.messages[0].content)![1]
const salida = (r: { cuerpo: Record<string, unknown> }) => r.cuerpo as Record<string, any>
const decision = (n: number[], extra: Record<string, unknown> = {}) => JSON.stringify({ entregar: n, pixeles: [], por_que: [{ numeros: n.slice(0, 1), linea: 'sirve' }], faltantes: [], duda: [], ...extra })
const navega = (o: { estantes?: string[]; clases?: unknown; completasClases?: unknown; familias?: unknown; final?: (n: number[], p: PeticionAlModelo) => Resp; verifica?: Resp }): Contesta => (p) => {
  if (p.system === INSTRUCCION_DE_ESTANTES) return JSON.stringify({ estantes: o.estantes ?? ['E1', 'E2'] })
  if (p.system === INSTRUCCION_DE_CLASES) return JSON.stringify({ clases: o.clases ?? [], ...(o.completasClases !== undefined ? { completas: o.completasClases } : {}) })
  if (p.system === INSTRUCCION_DE_FAMILIAS) return JSON.stringify({ familias: o.familias ?? [], completas: [] })
  if (p.system === INSTRUCCION_DE_VERIFICACION) return o.verifica ?? JSON.stringify({ siguen_faltando: [] })
  const n = numerosDe(listaDe(p))
  return o.final ? o.final(n, p) : decision(n.slice(0, 2))
}
const CLASES = ['parte_de_trabajo', 'catalogo_item', 'sede', 'sitio']

describe('«completas» no entrega lo NO VÁLIDO ni lo reemplazado', () => {
  it('esEntregable: solo lo marcado valida:false o reemplazada:true queda fuera', () => {
    expect(esEntregable({})).toBe(true)
    expect(esEntregable({ valida: true })).toBe(true)
    expect(esEntregable({ valida: false })).toBe(false)
    expect(esEntregable({ reemplazada: true })).toBe(false)
    expect(esEntregable({ reemplazada: false, valida: undefined })).toBe(true)
  })
  it('EL CASO MEDIDO: el grupo «parte_de_trabajo» se pide completo y la parte NO VÁLIDA no sale', async () => {
    const f = lista()
    const { deps } = armar(navega({ clases: CLASES, completasClases: ['parte_de_trabajo'] }))
    const r = salida(await razonar(deps, cuerpo(f)))
    expect(r.modo).toBe('conversado')
    const refs: string[] = r.decision.entregar
    for (const malo of f.filter((x) => x.valida === false || x.reemplazada === true)) expect(refs, malo.titulo).not.toContain(malo.ref)
    for (const bueno of f.filter((x) => x.clase === 'parte_de_trabajo' && x.valida !== false && x.reemplazada !== true)) expect(refs).toContain(bueno.ref)
    expect(r.decision.grupos_completos[0]).toMatchObject({ grupo: 'E1 parte_de_trabajo' })
  })
  it('la cuenta de lo completo excluye también lo no entregable, y lo excluido se declara', async () => {
    const f = lista()
    const { deps } = armar(navega({ clases: CLASES, completasClases: ['parte_de_trabajo'] }))
    const r = salida(await razonar(deps, cuerpo(f)))
    const g = r.decision.grupos_completos.find((x: any) => x.grupo === 'E1 parte_de_trabajo')
    expect(g.lineas).toBe(f.filter((x) => x.clase === 'parte_de_trabajo').length - 2)
    expect(g.excluidas_no_validas_o_reemplazadas).toBe(1) // la reemplazada ni siquiera llega a la lista (como en la real); la NO VÁLIDA llega marcada y se deja fuera de lo completo
  })
  it('si TODO lo completo era no entregable, la decisión sale sin esas líneas y sin romperse', async () => {
    const f = [ficha(0, 'E1', 'parte_de_trabajo', '⛔ NO VÁLIDO', undefined, { valida: false }), ...lista().filter((x) => x.clase !== 'parte_de_trabajo')]
    const { deps } = armar(navega({ clases: CLASES, completasClases: ['parte_de_trabajo'] }))
    const r = salida(await razonar(deps, cuerpo(f)))
    expect(r.modo).toBe('conversado')
    expect(r.decision.entregar).not.toContain(f[0].ref)
  })
})

describe('la lista de prueba trae lo mismo que la real en lo que decide si algo se puede entregar', () => {
  it('valida, reemplazada y aviso pasan; con valores que no son del tipo, no pasan', () => {
    const r = leerListaDePrueba(true, lista(), A, AHORA)
    expect(r && r.ok).toBe(true)
    const ls = (r as { ok: true; lista: { lineas: Ficha[] } }).lista.lineas
    expect(ls.find((x) => x.titulo.includes('NO VÁLIDO'))).toMatchObject({ valida: false, aviso: 'NO VÁLIDO · la vuelta no llegó' })
    expect(ls.find((x) => x.titulo === 'Parte vieja')).toMatchObject({ reemplazada: true })
    const mal = leerListaDePrueba(true, [{ ...lista()[0], valida: 'no', reemplazada: 1, aviso: 5 }], A, AHORA) as { ok: true; lista: { lineas: Ficha[] } }
    expect(mal.lista.lineas[0].valida).toBeUndefined()
    expect(mal.lista.lineas[0].reemplazada).toBeUndefined()
    expect(mal.lista.lineas[0].aviso).toBeUndefined()
  })
})

describe('el nivel de familia: «ninguna» es una respuesta válida cuando ya hay algo que leer', () => {
  const sinFamilias = navega({ clases: ['catalogo_item', 'sede', 'sitio'], familias: [] })
  it('EL CASO MEDIDO: {"familias":[]} con sedes y páginas SIN familia → conversado (no familias_invalidas) y lee lo que se abre siempre', async () => {
    const { deps, peticiones } = armar(sinFamilias)
    const r = salida(await razonar(deps, cuerpo(lista())))
    expect(r.modo).toBe('conversado')
    expect(r.motivo_de_respaldo).toBeUndefined()
    const lectura = peticiones.filter((p) => p.system === INSTRUCCION_DEL_PORTERO)
    expect(lectura).toHaveLength(1)
    expect(numerosDe(listaDe(lectura[0])).length).toBe(7) // 6 sedes + 1 página, sin una sola línea de catálogo
    expect(r.niveles.at(-1)).toMatchObject({ nivel: 'familia', grupos_elegidos: [], grupos_invalidos: [] })
  })
  it('«ninguna» NO vale si no hay nada que leer (ni sin-familia ni completas): sigue siendo respaldo declarado', async () => {
    const soloCatalogo = lista().filter((x) => x.clase === 'catalogo_item')
    const { deps } = armar(navega({ estantes: ['E2'], clases: ['catalogo_item'], familias: [] }))
    const r = salida(await razonar(deps, cuerpo(soloCatalogo)))
    expect(r.modo).toBe('respaldo')
    expect(r.motivo_de_respaldo).toBe('familias_invalidas')
  })
  it('«ninguna» con nombres inventados NO es una respuesta válida: respaldo y se anotan los inválidos', async () => {
    const { deps } = armar(navega({ clases: ['catalogo_item', 'sede'], familias: ['Familia que no existe'] }))
    const r = salida(await razonar(deps, cuerpo(lista())))
    expect(r.modo).toBe('respaldo')
    expect(r.motivo_de_respaldo).toBe('familias_invalidas')
    expect(r.niveles.at(-1).grupos_invalidos).toEqual(['Familia que no existe'])
  })
  it('«ninguna» con completas ya apartadas vale: no hace falta abrir nada más', async () => {
    const { deps } = armar(navega({ clases: ['catalogo_item'], completasClases: ['parte_de_trabajo', 'catalogo_item'], familias: [] }))
    const r = salida(await razonar(deps, cuerpo(lista())))
    expect(r.modo).toBe('conversado')
  })
  it('en los niveles de estante y de clase «ninguno» sigue siendo respaldo (no hay nada que leer)', async () => {
    const e = armar((p) => (p.system === INSTRUCCION_DE_ESTANTES ? JSON.stringify({ estantes: [] }) : '{}'))
    expect(salida(await razonar(e.deps, cuerpo(lista()))).motivo_de_respaldo).toBe('estantes_invalidos')
    const c = armar(navega({ clases: [] }))
    expect(salida(await razonar(c.deps, cuerpo(lista()))).motivo_de_respaldo).toBe('clases_invalidas')
  })
})

describe('si la pasada de un nivel se corta, se repite UNA vez con más margen', () => {
  const cortaLaPrimera = (nivelSystem: string, segunda: Resp): Contesta => {
    let cortadas = 0
    const base = navega({ clases: ['catalogo_item', 'sede'], familias: [] })
    return (p, n) => { if (p.system === nivelSystem && cortadas++ === 0) return { texto: '', stop_reason: 'max_tokens' }; if (p.system === nivelSystem && cortadas === 2) return segunda; return base(p, n) }
  }
  it('EL CASO MEDIDO (nivel de familia cortado sin una letra): la repetición con 3× el tope salva el pedido; las dos llamadas quedan registradas', async () => {
    const { deps, peticiones, registros } = armar(cortaLaPrimera(INSTRUCCION_DE_FAMILIAS, JSON.stringify({ familias: [], completas: [] })))
    const r = salida(await razonar(deps, cuerpo(lista())))
    expect(r.modo).toBe('conversado')
    const deFamilia = peticiones.filter((p) => p.system === INSTRUCCION_DE_FAMILIAS)
    expect(deFamilia.map((p) => p.max_tokens)).toEqual([1000, 3000])
    expect(MULTIPLO_DE_REINTENTO_DE_NIVEL).toBe(3)
    expect(MAX_TOKENS_DE_ESTANTES).toBe(1000)
    expect(r.niveles.at(-1).reintento_por_salida_cortada).toBe(true)
    const filas = registros.filter((x) => (x.metadata as any).nivel === 'familia')
    expect(filas).toHaveLength(2)
    expect(filas.map((x) => (x.metadata as any).motivo_de_respaldo)).toEqual(['salida_cortada', null])
    expect(registros.every((x) => x.workflow_id === 'wf-prueba' && x.client_id === 'prueba-portero')).toBe(true)
  })
  it('lo mismo en el nivel de clase y en el de estante', async () => {
    for (const sistema of [INSTRUCCION_DE_CLASES, INSTRUCCION_DE_ESTANTES]) {
      const base = navega({ clases: ['catalogo_item', 'sede'], familias: [] })
      let cortadas = 0
      const { deps, peticiones } = armar((p, n) => (p.system === sistema && cortadas++ === 0 ? { texto: '{"cla', stop_reason: 'max_tokens' } : base(p, n)))
      const r = salida(await razonar(deps, cuerpo(lista())))
      expect(r.modo, sistema.slice(0, 30)).toBe('conversado')
      expect(peticiones.filter((p) => p.system === sistema)).toHaveLength(2)
    }
  })
  it('si la repetición también se corta: respaldo declarado salida_cortada, solo DOS llamadas en ese nivel, nunca una tercera', async () => {
    const { deps, peticiones } = armar((p, n) => (p.system === INSTRUCCION_DE_FAMILIAS ? { texto: '', stop_reason: 'max_tokens' } : navega({ clases: ['catalogo_item', 'sede'] })(p, n)))
    const r = salida(await razonar(deps, cuerpo(lista())))
    expect(r.modo).toBe('respaldo')
    expect(r.motivo_de_respaldo).toBe('salida_cortada')
    expect(peticiones.filter((p) => p.system === INSTRUCCION_DE_FAMILIAS)).toHaveLength(2)
  })
  it('si la repetición no cabe en el tope de gasto, NO se hace: respaldo salida_cortada y se dice por qué', async () => {
    const { deps, peticiones } = armar(cortaLaPrimera(INSTRUCCION_DE_FAMILIAS, JSON.stringify({ familias: [], completas: [] })), { topeDeGastoUsd: 0.02 })
    const r = salida(await razonar(deps, cuerpo(lista())))
    expect(peticiones.filter((p) => p.system === INSTRUCCION_DE_FAMILIAS)).toHaveLength(1) // la primera cabe (≈0,014); la repetición a 3× (≈0,034) pasa del tope por llamada
    expect(r.modo).toBe('respaldo')
    expect(r.motivo_de_respaldo).toBe('salida_cortada')
    expect(r.niveles.at(-1).reintento_omitido_por_tope).toBe(true)
  })
  it('una salida que NO se cortó no se repite (el caso común sigue en una llamada por nivel)', async () => {
    const { deps, peticiones } = armar(navega({ clases: ['catalogo_item', 'sede'], familias: [] }))
    await razonar(deps, cuerpo(lista()))
    expect(peticiones.filter((p) => p.system === INSTRUCCION_DE_FAMILIAS)).toHaveLength(1)
    expect(peticiones.every((p) => p.system !== INSTRUCCION_DE_FAMILIAS || p.max_tokens === MAX_TOKENS_DE_ESTANTES)).toBe(true)
  })
})

describe('los faltantes «no concluyentes» pasan por la comprobación contra la ficha completa antes de quedar así', () => {
  const faltante = 'el WhatsApp del mostrador (la página de contacto está cortada)'
  /** el portero escoge a mano la página de contacto (línea cortada) y pide el catálogo completo → su lectura declara un faltante que NO ve */
  const escenario = (verifica: Resp, extra: Record<string, unknown> = {}) => armar(navega({
    clases: ['catalogo_item', 'sitio'], completasClases: ['catalogo_item'],
    final: (n) => decision(n, { faltantes: [faltante], duda: n.slice(0, 1), ...extra }), verifica,
  }))
  it('EL CASO MEDIDO: la página de contacto entregada SÍ trae el dato → el no concluyente se descarta y se dice', async () => {
    const { deps, peticiones } = escenario(JSON.stringify({ siguen_faltando: [] }))
    const r = salida(await razonar(deps, cuerpo(lista())))
    const v = peticiones.filter((p) => p.system === INSTRUCCION_DE_VERIFICACION)
    expect(v).toHaveLength(1)
    expect(v[0].messages[0].content).toContain('Escribe al 0999 123 456') // el texto COMPLETO de la ficha cortada
    expect(r.decision.faltantes).toEqual([])
    expect(r.decision.faltantes_no_concluyentes ?? []).toEqual([])
    expect(r.decision.faltantes_descartados_por_ficha_completa).toEqual([faltante])
    expect(r.verificacion_de_faltantes).toMatchObject({ estado: 'hecha', faltantes_antes: 1, faltantes_despues: 0 })
  })
  it('si la ficha completa NO lo trae, sigue como no concluyente (NO se promueve a faltante declarado)', async () => {
    const { deps } = escenario(JSON.stringify({ siguen_faltando: [1] }))
    const r = salida(await razonar(deps, cuerpo(lista())))
    expect(r.decision.faltantes).toEqual([])
    expect(r.decision.faltantes_no_concluyentes).toEqual([faltante])
    expect(r.decision.faltantes_descartados_por_ficha_completa).toBeUndefined()
  })
  it('primero se muestran las fichas escogidas a mano; las de grupos completos van al final (no gastan los 60 cupos)', async () => {
    const base = lista()
    // la página de contacto va DESPUÉS de 80 fichas cortadas de un grupo completo
    const f = [...base.slice(0, -1), ...Array.from({ length: 80 }, (_, i) => ficha(i, 'E2', 'catalogo_item', `Extra ${i}`, 'Familia 00', { que_es: LARGA + ' ' + i })), base[base.length - 1]]
    const { deps, peticiones } = armar(navega({
      estantes: ['E2'], clases: ['catalogo_item', 'sitio'], completasClases: ['catalogo_item'],
      final: (n) => decision(n, { faltantes: [faltante] }), verifica: JSON.stringify({ siguen_faltando: [] }),
    }))
    await razonar(deps, cuerpo(f))
    const v = peticiones.find((p) => p.system === INSTRUCCION_DE_VERIFICACION)!
    const fichas = v.messages[0].content.split('<fichas>')[1]
    expect(fichas.split('\n').find((l) => /^#\d+ /.test(l))).toMatch(/^#\d+ Página de contacto · /) // la escogida a mano primero (su TÍTULO, no el texto de las otras)
  })
  it('sin faltantes no concluyentes, o sin fichas cortadas entregadas, NO hay llamada de verificación', async () => {
    const a = escenario(JSON.stringify({ siguen_faltando: [] }), { faltantes: [] })
    await razonar(a.deps, cuerpo(lista()))
    expect(a.peticiones.some((p) => p.system === INSTRUCCION_DE_VERIFICACION)).toBe(false)
    const b = armar(navega({ clases: ['catalogo_item', 'sede'], completasClases: ['catalogo_item'], final: (n) => decision(n, { faltantes: [faltante] }) }))
    await razonar(b.deps, cuerpo(lista().filter((x) => x.clase !== 'sitio')))
    expect(b.peticiones.some((p) => p.system === INSTRUCCION_DE_VERIFICACION)).toBe(false)
  })
  it('si la comprobación falla o devuelve algo mal formado, los no concluyentes quedan como estaban y se dice', async () => {
    for (const mala of [new Error('boom') as Resp, 'no es json', JSON.stringify({ siguen_faltando: ['1'] })]) {
      const { deps } = escenario(mala)
      const r = salida(await razonar(deps, cuerpo(lista())))
      expect(r.modo).toBe('conversado')
      expect(r.decision.faltantes_no_concluyentes).toEqual([faltante])
      expect(r.verificacion_de_faltantes.estado).toBe('fallo')
    }
  })
  it('lo mismo cuando la lectura se hace en trozos (no cabe en una llamada)', async () => {
    const f = [...lista(), ...Array.from({ length: 200 }, (_, i) => ficha(i, 'E2', 'dato_de_sede', `Dato ${String(i).padStart(4, '0')}`))]
    const { deps, peticiones } = armar(navega({
      clases: ['catalogo_item', 'sitio', 'dato_de_sede'], completasClases: ['catalogo_item'],
      final: (n) => decision(n.slice(0, 1), { faltantes: [faltante], duda: n.slice(0, 1) }), verifica: JSON.stringify({ siguen_faltando: [] }),
    }), { topeDeEntradaTokens: 5000 })
    const r = salida(await razonar(deps, cuerpo(f)))
    expect(peticiones.filter((p) => p.system === INSTRUCCION_DEL_PORTERO).length).toBeGreaterThanOrEqual(2)
    expect(r.decision.faltantes_no_concluyentes ?? []).toEqual([])
    expect(r.decision.faltantes_descartados_por_ficha_completa).toEqual([faltante])
  })
})

describe('un dato que cada lugar tiene por separado llega de TODOS los lugares (por razonamiento, no por palabras)', () => {
  it('la regla 10 del portero y la regla 6 de clase/familia existen, en su sitio y sin nombrar rubro ni cliente', () => {
    expect(INSTRUCCION_DEL_PORTERO).toMatch(/10\. Cuando el trabajo usa un dato que cada lugar, sede o responsable tiene por separado/)
    expect(INSTRUCCION_DEL_PORTERO).toMatch(/entrega ese dato de TODOS, no solo del principal/)
    expect(INSTRUCCION_DEL_PORTERO.indexOf('10. ')).toBeGreaterThan(INSTRUCCION_DEL_PORTERO.indexOf('9. '))
    expect(INSTRUCCION_DEL_PORTERO.indexOf('10. ')).toBeLessThan(INSTRUCCION_DEL_PORTERO.indexOf('FORMATO:'))
    for (const t of [INSTRUCCION_DE_CLASES, INSTRUCCION_DE_FAMILIAS]) {
      expect(t).toMatch(/6\. Si el trabajo usa un dato que cada lugar, sede o responsable tiene por separado/)
      expect(t).toMatch(/en «completas» pon/)
    }
    expect(INSTRUCCION_DE_ESTANTES).not.toMatch(/cada lugar/)
    for (const t of [INSTRUCCION_DE_CLASES, INSTRUCCION_DE_FAMILIAS, INSTRUCCION_DEL_PORTERO]) expect(t).not.toMatch(/rese[ñn]a|laboratorio|cl[ií]nica|restaurante|marisquer|cotizador|n[aá]ufrago|p[eé]rez|ferreter|inmobiliari|medicament|academia|veterinari|farmacia/i)
  })
})
