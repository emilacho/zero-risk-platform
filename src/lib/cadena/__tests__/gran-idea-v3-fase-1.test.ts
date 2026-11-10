/**
 * 10-nov · GO de Lenovo «gran idea v3 · arreglos de raíz antes de gastar» (FASE 1, US$ 0) + ADENDA con las decisiones de Emilio.
 * El caso real va con la gran idea v2 de la campaña tal cual (`__fixtures__/concepto-v2-28de888e.md`), su brief validado (`brief-v2-28de888e.md`)
 * y su estrategia (`estrategia-28de888e.json`). Las 10 fotos son los ids completos reales de las fotos propias que la mesa citó por prefijo.
 * Lo que se prueba sirve para cualquier cliente: nada aquí nombra al cliente en el código bajo prueba.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { apareceFueraDeProhibicion, datosConValor, datoEnLaFuente, fotoExiste, insumosDesdeEstrategia, leerConcepto, type InsumosDelConcepto } from '../conceptos'
import { leerBriefCreativo, REFERENCIA_DEL_BRIEF_CREATIVO } from '../brief-creativo'
import { fechasDelConcepto, insumosDelConcepto, marcoDelConcepto } from '../mesas'
import type { Almacen } from '../almacen'
import { contextoDe, clienteA } from '../__fixtures__/clientes'

const fx = (n: string) => readFileSync(join(__dirname, '..', '__fixtures__', n), 'utf8')
const V2 = fx('concepto-v2-28de888e.md')
const BRIEF_V2 = fx('brief-v2-28de888e.md')
const ESTRATEGIA = JSON.parse(fx('estrategia-28de888e.json'))
const FOTOS = ['4c41cd56-414e-4597-a202-e8c34fd06f69', 'c0355f3d-5d7b-40e3-bd35-95bbff96db5a', 'fe452b8f-3c18-4fba-92f4-bf2186cc2626', '9f71b0e9-b01b-4ff1-b106-fdbc99b1baad', 'e8da814f-257d-4ae0-a54b-265ce6fb96b3', 'a7bd788f-e21c-43ba-b1b9-5661c716ad05', '19671014-329d-48b4-816b-c2c700b61de3', '4f09cef2-c849-421b-9bd7-1122b4489dbe', '6275c0ba-03fa-427a-aea9-6111d00f186a', 'f5d887ec-c9df-43a3-8f1d-8498ba26f024']
const PROHIBIDAS = ['premium', 'gourmet', 'artesanal']
const ins = (o: Partial<InsumosDelConcepto> = {}): InsumosDelConcepto => ({ ...insumosDesdeEstrategia(ESTRATEGIA, PROHIBIDAS, FOTOS), ...o })

describe('punto 3 · el lector encuentra la cita del objetivo de cada fase (negrita y paréntesis)', () => {
  it('🔴 caso real v2: los 4 capítulos traen su cita y ningún aviso «no cita el objetivo»', () => {
    const l = leerConcepto(V2, ins())
    expect(l.capitulos).toHaveLength(4)
    for (const c of l.capitulos) expect(c.objetivo_cita).toMatch(/^«.+»/)
    expect(l.capitulos[0].objetivo_cita).toContain('Pre-apertura y apertura de Guayaquil')
    expect(l.avisos.filter((a) => a.includes('no cita el objetivo'))).toEqual([])
  })
  it('🔴 «qué cuenta» y «cómo se ve» ya no empiezan ni terminan con ** sueltos', () => {
    for (const c of leerConcepto(V2, ins()).capitulos) {
      for (const v of [c.que_cuenta, c.como_se_ve, c.objetivo_cita]) { expect(v.startsWith('**')).toBe(false); expect(v.endsWith('**')).toBe(false) }
    }
  })
  it('sin negrita sigue igual (la forma vieja «Objetivo de la fase (cita): …»)', () => {
    const md = '## Capítulo desbloquear · x\nQué cuenta: algo · Objetivo de la fase (cita): «uno» · Cómo se ve: claro'
    const l = leerConcepto(md, ins())
    expect(l.capitulos[0]).toMatchObject({ que_cuenta: 'algo', objetivo_cita: '«uno»', como_se_ve: 'claro' })
  })
})

describe('punto 4 · una palabra dentro de una frase que la prohíbe no es usarla', () => {
  it('🔴 caso real v2: «Sin «premium», «gourmet», «artesanal»…» no da avisos', () => {
    expect(leerConcepto(V2, ins()).avisos.filter((a) => /premium|gourmet|artesanal/.test(a))).toEqual([])
  })
  it('🔴 usarla de verdad sí avisa (también en otra frase del mismo texto)', () => {
    expect(apareceFueraDeProhibicion('Sin «premium». El encebollado más premium de la costa.', 'premium')).toBe(true)
    expect(apareceFueraDeProhibicion('Un caldo premium para tu casa', 'premium')).toBe(true)
    const l = leerConcepto(`${V2}\n\n- nota: el caldo premium de la casa`, ins())
    expect(l.avisos.some((a) => a.includes('«premium»'))).toBe(true)
  })
  it('🔴 un «sin» lejano (más de 8 palabras antes) no tapa el uso', () => {
    expect(apareceFueraDeProhibicion('Llega sin espera a tu casa en zona norte y con todo el sabor premium', 'premium')).toBe(true)
  })
  it('las formas de prohibir: nunca, jamás, ni, no uses, evita, prohibido', () => {
    for (const t of ['Nunca digas premium', 'jamás premium', 'ni premium ni gourmet', 'No uses premium', 'Evita premium', 'Prohibido: premium']) expect(apareceFueraDeProhibicion(t, 'premium')).toBe(false)
  })
})

describe('punto 2 · las fotos citadas por su prefijo existen', () => {
  it('🔴 caso real v2: con las fotos propias, ninguna sale «no existe»', () => {
    expect(leerConcepto(V2, ins()).avisos.filter((a) => a.includes('no existe entre las fotos propias'))).toEqual([])
  })
  it('🔴 la entrega y la revalidación reciben las fotos del almacén (antes: lista vacía), el registro y el brief validado', async () => {
    const al = almacenDe({ fotos: FOTOS })
    const i = await insumosDelConcepto(al, { id: 'c', client_id: 'k', plan_id: 'p' })
    expect(i.fotos).toEqual(FOTOS)
    expect(i.registro).toBe('tu') // punto 5: el registro del cliente llega al lector
    expect(i.fuente).toBe(BRIEF_V2) // punto 7: el brief validado es la fuente de los datos
    expect(leerConcepto(V2, i).avisos.filter((a) => a.includes('no existe'))).toEqual([])
  })
  it('un prefijo de MENOS de 8 caracteres, o de dos fotos a la vez, no vale', () => {
    expect(fotoExiste('4f09cef', FOTOS)).toBe(false)
    expect(fotoExiste('4f09cef2', FOTOS)).toBe(true)
    expect(fotoExiste('4F09CEF2-C849-421B-9BD7-1122B4489DBE', FOTOS)).toBe(true)
    expect(fotoExiste('aaaaaaaa', ['aaaaaaaa-1', 'aaaaaaaa-2'])).toBe(false)
    expect(fotoExiste('ffffffff', FOTOS)).toBe(false)
  })
  it('una foto inventada sí se avisa', () => {
    expect(leerConcepto(`${V2}\n- otra: foto:deadbeef`, ins()).avisos).toContain('la foto «deadbeef» no existe entre las fotos propias')
  })
})

describe('punto 5 · el registro del cliente en los chequeos de la gran idea y del brief', () => {
  it('🔴 caso real v2 (cliente en tuteo): «Cómo suena» se marca aparte y el total trae las formas de voseo', () => {
    const l = leerConcepto(V2, ins({ registro: 'tu' }))
    const suena = l.avisos.find((a) => a.startsWith('«Cómo suena»'))
    expect(suena).toMatch(/entrá/)
    expect(suena).toMatch(/recibilo/)
    const todo = l.avisos.find((a) => a.startsWith('el concepto usa'))
    expect(todo).toMatch(/pedí/)
    expect(todo).toMatch(/sabés/)
  })
  it('sin registro fijado no se marca nada (no se inventa una regla)', () => {
    expect(leerConcepto(V2, ins()).avisos.filter((a) => /tuteo|voseo/.test(a))).toEqual([])
    expect(leerConcepto(V2, ins({ registro: 'sin_dato' })).avisos.filter((a) => /tuteo|voseo/.test(a))).toEqual([])
  })
  it('🔴 cliente en voseo: lo que se marca es el tuteo (agnóstico)', () => {
    const l = leerConcepto('## Gran idea\n- x · y\n## Cómo suena\nPide ya, tú sabes', ins({ registro: 'vos' }))
    expect(l.avisos.some((a) => a.startsWith('«Cómo suena»') && /no son voseo/.test(a))).toBe(true)
  })
  it('🔴 el brief: «Tono» se marca aparte y el total trae las formas', () => {
    const md = BRIEF_V2
    const b = leerBriefCreativo(md, { planTexto: md, prohibidas: [], registro: 'tu' })
    expect(b.avisos.some((a) => a.startsWith('el brief usa') && /pagás|entrá|pedí/.test(a))).toBe(true)
    const conTono = leerBriefCreativo('## Tono\nCercano, entrá y pedí.', { planTexto: '', prohibidas: [], registro: 'tu' })
    expect(conTono.avisos.some((a) => a.startsWith('«Tono»'))).toBe(true)
    expect(leerBriefCreativo(md, { planTexto: md, prohibidas: [] }).avisos.filter((a) => /tuteo/.test(a))).toEqual([])
  })
})

describe('punto 7 · un dato con valor que no está en el brief no tiene fuente', () => {
  it('🔴 caso real v2: «4,9» y «de lunes a domingo» se marcan; «1,5 s» (montaje) no', () => {
    const l = leerConcepto(V2, ins({ fuente: BRIEF_V2 }))
    const sin = l.avisos.filter((a) => a.includes('dato sin fuente'))
    expect(sin).toContain('la idea C3-I03 trae «4,9», que no está en el brief: dato sin fuente')
    expect(sin).toContain('la idea C3-I01 trae «de lunes a domingo», que no está en el brief: dato sin fuente')
    expect(sin.some((a) => a.includes('1,5'))).toBe(false)
  })
  it('🔴 si el brief sí lo trae, no se marca (coma o punto valen igual)', () => {
    const l = leerConcepto(V2, ins({ fuente: `${BRIEF_V2}\nGoogle Maps 4.9; abrimos de lunes a domingo` }))
    expect(l.avisos.filter((a) => a.includes('dato sin fuente'))).toEqual([])
    expect(datoEnLaFuente('4,9', 'puntaje 4.9')).toBe(true)
  })
  it('sin brief no se mira (no se inventa la falta)', () => {
    expect(leerConcepto(V2, ins()).avisos.filter((a) => a.includes('dato sin fuente'))).toEqual([])
  })
  it('qué cuenta como dato con valor', () => {
    expect(datosConValor('$3,50 · 10:30 · 15 % · 4,9 · de lunes a viernes · todos los días · 24/7 · 2 s · 1,5 segundos')).toEqual(['$3,50', '10:30', '15 %', '4,9', 'de lunes a viernes', 'todos los días', '24/7'])
  })
})

describe('punto 6 · la mesa de la gran idea recibe la fecha de hoy y no propone días pasados', () => {
  it('🔴 cada fase con su fecha real: ya pasó · en curso (solo desde hoy) · por venir', () => {
    const t = fechasDelConcepto(ESTRATEGIA, '2026-11-09', '2026-11-25')!
    expect(t).toContain('# HOY · 2026-11-25 (la campaña empezó el 2026-11-09)')
    expect(t).toContain('- desbloquear: del 2026-11-09 al 2026-11-22 · YA PASÓ')
    expect(t).toContain('- cimientos: del 2026-11-23 al 2026-12-06 · EN CURSO: solo piezas desde hoy (2026-11-25)')
    expect(t).toContain('- velocidad: del 2026-12-07 al 2027-01-03 · por venir')
  })
  it('🔴 el marco de la mesa lo lleva; sin hoy o sin inicio el marco queda igual que antes', () => {
    const ctx = contextoDe(clienteA())
    const base = { ctx, estrategia: ESTRATEGIA, briefTexto: 'b', version: 3, nota: null }
    expect(marcoDelConcepto({ ...base, inicio: '2026-11-09', hoy: '2026-11-10' })).toContain('# HOY · 2026-11-10')
    expect(marcoDelConcepto({ ...base, inicio: '2026-11-09' })).toBe(marcoDelConcepto(base))
    expect(marcoDelConcepto(base)).not.toContain('# HOY')
  })
})

describe('ADENDA 2 · el brief copia del plan el público, el objetivo con su número y cómo sabremos que funcionó', () => {
  const brief = (o: { publico?: boolean; medida?: boolean; objetivo?: string; faltantes?: string } = {}) => [
    '## De qué parte del plan sale', '«el plan dice esto con claridad»',
    '## Insight', 'uno', '## Mensaje', 'Llega a tu barrio.',
    ...(o.publico === false ? [] : ['## Público', 'Residentes de la zona norte.']),
    '## Objetivo', o.objetivo ?? '45 pedidos por semana.',
    ...(o.medida === false ? [] : ['## Cómo sabremos que funcionó', 'Pedidos por semana, revisión cada lunes.']),
    '## Tono', 'cercano', '## Obligatorios', '- vocabulario: caldo',
    ...(o.faltantes ? ['## Faltantes', o.faltantes] : []),
  ].join('\n')
  const leer = (md: string) => leerBriefCreativo(md, { planTexto: 'el plan dice esto con claridad', prohibidas: [] })
  it('completo: validado, con público y medida leídos', () => {
    const b = leer(brief())
    expect(b.bloqueos).toEqual([])
    expect(b.publico).toBe('Residentes de la zona norte.')
    expect(b.como_sabremos).toBe('Pedidos por semana, revisión cada lunes.')
  })
  it('🔴 sin «Público» o sin «Cómo sabremos que funcionó» se devuelve', () => {
    expect(leer(brief({ publico: false })).bloqueos).toContain('falta la sección «## Público»')
    expect(leer(brief({ medida: false })).bloqueos).toContain('falta la sección «## Cómo sabremos que funcionó»')
  })
  it('🔴 el objetivo sin número se devuelve, salvo que se declare en «Faltantes»', () => {
    expect(leer(brief({ objetivo: 'Que pidan más.' })).bloqueos.some((x) => x.startsWith('el objetivo de la campaña no trae su número'))).toBe(true)
    expect(leer(brief({ objetivo: 'Que pidan más.', faltantes: '- objetivo: el plan no da número' })).bloqueos).toEqual([])
  })
  it('🔴 el molde que recibe la mesa del brief pide las tres cosas del plan', () => {
    expect(REFERENCIA_DEL_BRIEF_CREATIVO).toContain('## Público · cópialo del PLAN')
    expect(REFERENCIA_DEL_BRIEF_CREATIVO).toContain('CON SU NÚMERO')
    expect(REFERENCIA_DEL_BRIEF_CREATIVO).toContain('## Cómo sabremos que funcionó · cópialo del PLAN')
  })
})

describe('caso real completo · la v2 releída con todo', () => {
  it('🔴 de 20 avisos a 7, los que de verdad faltan: banco parcial, 2 datos con valor, 2 sin fuente y 2 de voseo', () => {
    const l = leerConcepto(V2, ins({ registro: 'tu', fuente: BRIEF_V2 }))
    expect(l.bloqueos).toEqual([])
    expect(l.avisos.some((a) => a.startsWith('banco parcial: faltan 64 ideas'))).toBe(true)
    expect(l.avisos.filter((a) => /no cita el objetivo|no existe entre las fotos|premium|gourmet|artesanal/.test(a))).toEqual([])
    expect(l.avisos).toHaveLength(7)
  })
})

describe('insumos · un brief no validado no es fuente', () => {
  it('🔴 con el brief devuelto, la fuente no se pasa (no se mira)', async () => {
    const al = { ...almacenDe({ fotos: [] }), ultimoBriefCreativo: async () => ({ estado: 'devuelta', texto_md: BRIEF_V2 }) } as unknown as Almacen
    expect((await insumosDelConcepto(al, { id: 'c', client_id: 'k', plan_id: 'p' })).fuente).toBeUndefined()
  })
})

/** un almacén mínimo: solo lo que lee `insumosDelConcepto` */
function almacenDe(o: { fotos: string[] }): Almacen {
  return {
    ultimaEstrategia: async () => ({ contenido: ESTRATEGIA }),
    cargarContexto: async () => ({ ...contextoDe(clienteA()), registro: 'tu' }),
    fotosPropias: async () => o.fotos,
    ultimoBriefCreativo: async () => ({ estado: 'validada', texto_md: BRIEF_V2 }),
  } as unknown as Almacen
}
