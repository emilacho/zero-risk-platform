/**
 * 18-nov · RELLENO DEL BANCO (CC1 · la (b) de Lenovo 09:59Z/13:08Z · reparto con CC2 20:56Z).
 * Las cuotas del plan (huecos × semanas por red y capítulo) viajan en el sobre de la mesa de concepto; después de integrar, la dirección tiene UN turno por capítulo
 * que no llega a su cuota para escribir solo las que faltan. La cuenta es la de la cadena (`leerConcepto` → `banco_parcial`) sobre el mismo texto que se le entrega.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../../cadena/__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../../cadena/__fixtures__/clientes'
import type { Campana, EstrategiaGuardada } from '../../cadena/almacen'
import { insumosDelBanco, insumosDesdeEstrategia, leerConcepto } from '../../cadena/conceptos'
import { briefAbrir, conceptoAbrir, recibirBrief } from '../../cadena/mesas'
import { capituloDelRelleno, conCabeceraDelRelleno, esRellenoDelBanco, rellenoPendiente, textoParaLaCadena, validarSobreDeLaCadena } from '../mesa/de-la-cadena'
import { tareaDelRelleno } from '../mesa/pedidos'
import { siguienteDeLaMesa } from '../mesa/planificador'
import { COTAS, type Aporte, type EstadoMesa, type Tarjeta } from '../mesa/tipos'

type Ap = { n?: number; de: string; tipo: string; texto: string }
const real = JSON.parse(readFileSync(join(__dirname, '../__fixtures__/libro-concepto-5-0aa14d17-real.json'), 'utf8')) as { libro: Ap[] }
const INS_REAL = {
  fases: [{ clave: 'desbloquear', semanas: 3 }, { clave: 'cimientos', semanas: 3 }, { clave: 'velocidad', semanas: 6 }, { clave: 'acumular', semanas: 6 }],
  redes: [{ red: 'instagram', huecos_por_semana: 6 }, { red: 'whatsapp', huecos_por_semana: 2 / 3 }],
}
const CONCEPTO = (ins = INS_REAL) => ({ tipo_de_mesa: 'concepto' as const, insumos_del_banco: ins })

// una mesa chica: 2 capítulos de 1 semana, instagram con 2 huecos ⇒ cuota 2 por capítulo
const INS = { fases: [{ clave: 'abrir', semanas: 1 }, { clave: 'crecer', semanas: 1 }], redes: [{ red: 'instagram', huecos_por_semana: 2 }] }
const idea = (id: string, t: string) => `- ${id} · instagram · post · ${t} · mensaje: m ${t} · gancho: g ${t}`
const INTEGRA = '## Gran idea\nLa mesa · noventa días\n\n## Citas\nA1 usé: la idea'
const base = (): Ap[] => [
  { n: 1, de: 'miembro', tipo: 'aporta', texto: [idea('C1-I01', 'uno'), idea('C1-I02', 'dos'), idea('C2-I01', 'tres')].join('\n') },
  { n: 2, de: 'dir', tipo: 'integra', texto: INTEGRA },
]

describe('relleno · la cuenta (la misma de la cadena)', () => {
  it('🔴 con el libro REAL del concepto 5: pide primero «desbloquear», 14 de instagram (cuota 18), numeradas desde C1-I09', () => {
    const r = rellenoPendiente(CONCEPTO(), real.libro)
    expect(r).toMatchObject({ capitulo: 'desbloquear', prefijo: '1', desde: 9, redes: [{ red: 'instagram', faltan: 14, esperadas: 18 }] })
    expect(r!.ya_estan).toHaveLength(7)
    expect(r!.ya_estan.every((i) => /^C1-I\d{2,}$/.test(i.id))).toBe(true)
  })
  it('🔴 un capítulo con su relleno escrito no se vuelve a pedir: sigue el siguiente que falta', () => {
    const libro = [...real.libro, { n: 999, de: real.libro.filter((a) => a.tipo === 'integra').pop()!.de, tipo: 'aporta', texto: conCabeceraDelRelleno('- C1-I09 · instagram · reel · x · mensaje: m · gancho: g', 'desbloquear') }]
    const r = rellenoPendiente(CONCEPTO(), libro)
    expect(r).not.toBeNull()
    expect(r!.capitulo).not.toBe('desbloquear')
  })
  it('🔴 la mesa chica: «abrir» completo, «crecer» con 1 de 2 ⇒ se pide «crecer» (prefijo C2, desde I02); con su relleno, el banco llega y no se pide nada', () => {
    const r1 = rellenoPendiente(CONCEPTO(INS), base())
    expect(r1).toMatchObject({ capitulo: 'crecer', prefijo: '2', desde: 2, redes: [{ red: 'instagram', faltan: 1, esperadas: 2 }] })
    const libro = [...base(), { n: 3, de: 'dir', tipo: 'aporta', texto: conCabeceraDelRelleno(idea('C2-I02', 'cuatro'), 'crecer') }]
    expect(rellenoPendiente(CONCEPTO(INS), libro)).toBeNull()
    const c = leerConcepto(textoParaLaCadena(libro, null, true), { ...INS, prohibidas: [], fotos: [] })
    expect(c.banco.map((i) => i.id).sort()).toEqual(['C1-I01', 'C1-I02', 'C2-I01', 'C2-I02'])
    expect(c.banco_parcial).toEqual([])
  })
  it('🔴 el relleno que repite un id del equipo con OTRA idea no le quita el id: se renumera', () => {
    const libro = [...base(), { n: 3, de: 'dir', tipo: 'aporta', texto: conCabeceraDelRelleno(idea('C2-I01', 'otra cosa'), 'crecer') }]
    const t = textoParaLaCadena(libro, null, true)
    expect(t).toContain(idea('C2-I01', 'tres'))
    expect(t).toContain(idea('C2-I02', 'otra cosa'))
  })
  it('🔴 el id renumerado de una idea del equipo NO cambia después del relleno (la dirección lo vio en «ya están»); el relleno que choca es el que se mueve', () => {
    const choca: Ap[] = [
      { n: 1, de: 'a', tipo: 'aporta', texto: idea('C1-I01', 'uno') },
      { n: 2, de: 'b', tipo: 'aporta', texto: idea('C1-I01', 'dos') },
      { n: 3, de: 'dir', tipo: 'integra', texto: '## Gran idea\nLa mesa · noventa días' },
    ]
    const antes = textoParaLaCadena(choca, null, true)
    expect(antes).toContain(idea('C1-I02', 'uno'))
    const con = textoParaLaCadena([...choca, { n: 4, de: 'dir', tipo: 'aporta', texto: conCabeceraDelRelleno([idea('C1-I09', 'nueve'), idea('C1-I02', 'pisa')].join('\n'), 'abrir') }], null, true)
    expect(con).toContain(idea('C1-I02', 'uno'))
    expect(con).toContain(idea('C1-I09', 'nueve'))
    expect(con).toContain(idea('C1-I03', 'pisa'))
  })
  it('🔴 caso de CC7: el relleno escribe C1-I03 y luego C1-I02 (que choca); el que choca NO cae sobre C1-I03, que ya es de «tres»', () => {
    const choca: Ap[] = [
      { n: 1, de: 'a', tipo: 'aporta', texto: idea('C1-I01', 'uno') },
      { n: 2, de: 'b', tipo: 'aporta', texto: idea('C1-I01', 'dos') },
      { n: 3, de: 'dir', tipo: 'integra', texto: '## Gran idea\nLa mesa · noventa días' },
      { n: 4, de: 'dir', tipo: 'aporta', texto: conCabeceraDelRelleno([idea('C1-I03', 'tres'), idea('C1-I02', 'cuatro')].join('\n'), 'abrir') },
    ]
    const t = textoParaLaCadena(choca, null, true)
    expect(t).toContain(idea('C1-I02', 'uno'))
    expect(t).toContain(idea('C1-I03', 'tres'))
    expect(t).toContain(idea('C1-I04', 'cuatro'))
    const ids = [...t.matchAll(/^- (C1-I\d{2,}) ·/gm)].map((m) => m[1])
    expect(new Set(ids).size).toBe(ids.length)
    const c = leerConcepto(t, { ...INS, prohibidas: [], fotos: [] })
    expect(c.banco.map((i) => i.id).sort()).toEqual(['C1-I01', 'C1-I02', 'C1-I03', 'C1-I04'])
  })
  it('🔴 el prefijo es el que YA usa el equipo en ese capítulo (aquí, el nombre: «Ccrecer»), no el número de orden', () => {
    const libro: Ap[] = [{ n: 1, de: 'miembro', tipo: 'aporta', texto: [idea('C1-I01', 'uno'), idea('C1-I02', 'dos'), idea('Ccrecer-I01', 'tres')].join('\n') }, { n: 2, de: 'dir', tipo: 'integra', texto: INTEGRA }]
    expect(rellenoPendiente(CONCEPTO(INS), libro)).toMatchObject({ capitulo: 'crecer', prefijo: 'crecer', desde: 2 })
  })
  it('un aporte de la dirección que NO es relleno sigue sin entrar al banco (como antes)', () => {
    const libro = [...base(), { n: 3, de: 'dir', tipo: 'aporta', texto: idea('C2-I02', 'suelta') }]
    expect(textoParaLaCadena(libro, null, true)).not.toContain('suelta')
  })
  it('🔴 nada que rellenar: sin insumos en el sobre, mesa que no es de concepto, sin integración, o cuotas cumplidas', () => {
    expect(rellenoPendiente({ tipo_de_mesa: 'concepto' }, base())).toBeNull()
    expect(rellenoPendiente({ tipo_de_mesa: 'brief', insumos_del_banco: INS }, base())).toBeNull()
    expect(rellenoPendiente(null, base())).toBeNull()
    expect(rellenoPendiente(CONCEPTO(INS), base().filter((a) => a.tipo !== 'integra'))).toBeNull()
    expect(rellenoPendiente(CONCEPTO({ ...INS, redes: [{ red: 'instagram', huecos_por_semana: 1 }] }), base())).toBeNull()
  })
  it('🔴 tope duro: nunca más rellenos que fases, aunque las cabeceras lleguen sin capítulo (no da vueltas)', () => {
    const sinCap = { de: 'dir', tipo: 'aporta', texto: '## Relleno del banco\n(nada)' }
    expect(rellenoPendiente(CONCEPTO(INS), [...base(), { n: 3, ...sinCap }])).not.toBeNull()
    expect(rellenoPendiente(CONCEPTO(INS), [...base(), { n: 3, ...sinCap }, { n: 4, ...sinCap }])).toBeNull()
  })
})

describe('relleno · la cabecera', () => {
  it('🔴 se anota SIEMPRE con la cabecera canónica de su capítulo (la escriba o no la dirección, o con otro capítulo)', () => {
    expect(conCabeceraDelRelleno('- C1-I09 · x', 'abrir')).toBe('## Relleno del banco · abrir\n\n- C1-I09 · x')
    expect(conCabeceraDelRelleno('## Relleno del banco · otro\n- C1-I09 · x', 'abrir')).toBe('## Relleno del banco · abrir\n\n- C1-I09 · x')
    expect(capituloDelRelleno(conCabeceraDelRelleno('x', 'crecer'))).toBe('crecer')
    expect(esRellenoDelBanco('texto\n## Relleno del banco · abrir')).toBe(false)
  })
})

describe('relleno · el sobre (de la cadena a la oficina)', () => {
  const ok = { tipo_de_mesa: 'concepto', dry_run: true, client_id: '11111111-1111-4111-8111-111111111111', campana_id: '22222222-2222-4222-8222-222222222222', version: 1, marco_texto: 'x'.repeat(30), condiciones: [] }
  it('🔴 la mesa de concepto conserva los insumos del banco; sin ellos el sobre es el de siempre', () => {
    const v = validarSobreDeLaCadena({ ...ok, insumos_del_banco: INS })
    expect(v.ok && v.sobre.insumos_del_banco).toEqual(INS)
    const s = validarSobreDeLaCadena(ok)
    expect(s.ok && 'insumos_del_banco' in s.sobre).toBe(false)
  })
  it('🔴 mal formados o en otra mesa: se rechaza el sobre con su motivo (no se cuela nada que no se conoce)', () => {
    for (const mal of [{ fases: 'x', redes: [] }, { fases: [{ clave: 'a b', semanas: 1 }], redes: [] }, { fases: [{ clave: 'a', semanas: -1 }], redes: [] }, { fases: [], redes: [{ red: '', huecos_por_semana: 1 }] }, { fases: [], redes: [{ red: 'ig', huecos_por_semana: 99 }] }]) {
      const v = validarSobreDeLaCadena({ ...ok, insumos_del_banco: mal })
      expect(v.ok).toBe(false)
    }
    expect(validarSobreDeLaCadena({ ...ok, tipo_de_mesa: 'brief', insumos_del_banco: INS }).ok).toBe(false)
    const v = validarSobreDeLaCadena({ ...ok, insumos_del_banco: { ...INS, extra: 1, fases: [{ clave: 'abrir', semanas: 1, otro: 'x' }] } })
    expect(v.ok && v.sobre.insumos_del_banco).toEqual({ fases: [{ clave: 'abrir', semanas: 1 }], redes: INS.redes })
  })
  it('🔴 la cadena manda en el sobre del concepto los insumos de SU estrategia, y la oficina los acepta tal cual', async () => {
    const A = clienteA()
    const al = new AlmacenMemoria({
      contextos: { [A.clientId]: contextoDe(A) }, planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
      config: { flujos: ['wf-cadena'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'ensayo', clientes_ensayo: [A.clientId], nuevo_orden: { clientes: [A.clientId] } },
      journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
    })
    const campana: Campana = { id: 'camp-1', client_id: A.clientId, plan_id: 'plan-1', fecha_inicio: A.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: A.campana.fecha_fin, zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: ['centro'], estado: 'calendario', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: true }
    const estr: EstrategiaGuardada = { campana_id: 'camp-1', version: 1, estado: 'validada', contenido: A.estrategia, agente: 'social-media-strategist', modelo: null, costo_usd: 0, workflow_execution_id: 'ex-0', seco: true }
    al.campanas.push(campana); al.estrategias.push(estr)
    const wf = { workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', campana_id: 'camp-1' }
    const AHORA = '2026-10-09T12:00:00Z'
    const b = await briefAbrir(al, wf, AHORA)
    expect(b.status).toBe(200)
    expect((b.cuerpo.sobre as Record<string, unknown>).insumos_del_banco).toBeUndefined()
    const BRIEF = ['## Brief creativo de campaña · Cliente · brf-0123456789ab · v1', '## De qué parte del plan sale', 'Fase 1: «Se publican 3 posts por semana en Instagram y 1 en Facebook».', '## Insight', 'La gente del barrio desayuna de pie porque cree que no hay dónde sentarse antes de las ocho.', '## Mensaje', 'Hay mesa desde las siete.', '## Público', 'Vecinos del barrio que desayunan fuera entre semana (del plan).', '## Cómo sabremos que funcionó', 'Pedidos por semana contra la meta del plan, revisados cada lunes.', '## Objetivo', 'Que entren 30 desayunos nuevos por semana.', '## Tono', 'Cercano y directo, sin exclamaciones.', '## Obligatorios', '- vocabulario: pan de masa madre', '- prohibido: barato', '- lo que no se dice: precios', '## Faltantes', '- ninguno', '## Contradicciones plan vs manual', '- ninguna'].join('\n')
    expect(await recibirBrief(al, { campana_id: 'camp-1', version: 1, encargo_id: 'enc-1', texto: BRIEF, costo_usd: 0.1, motivo: null }, AHORA)).toMatchObject({ ok: true, estado: 'validada' })
    const c = await conceptoAbrir(al, wf, AHORA)
    expect(c.status).toBe(200)
    const sobre = c.cuerpo.sobre as Record<string, unknown>
    expect(sobre.insumos_del_banco).toEqual(insumosDelBanco(A.estrategia))
    // contra la lectura de la cadena al RECIBIR el concepto (no contra la misma función): mismas fases con semanas y mismas redes con huecos
    const lector = insumosDesdeEstrategia(A.estrategia, [], [])
    expect(sobre.insumos_del_banco).toEqual({ fases: lector.fases.map((f) => ({ clave: f.clave, semanas: f.semanas })), redes: lector.redes })
    expect(lector.fases.length).toBeGreaterThan(0)
    expect(lector.redes.length).toBeGreaterThan(0)
    // el cliente y la campaña de práctica no tienen id uuid (en producción sí): se cambian SOLO esos dos campos y el resto del sobre viaja tal cual
    const crudo = validarSobreDeLaCadena(sobre)
    expect(crudo.ok ? [] : crudo.errores).toEqual(['`client_id` debe ser un uuid', '`campana_id` debe ser un uuid'])
    const v = validarSobreDeLaCadena({ ...sobre, client_id: ok.client_id, campana_id: ok.campana_id })
    expect(v.ok && v.sobre.insumos_del_banco).toEqual(insumosDelBanco(A.estrategia))
  })
})

describe('relleno · el planificador (paso 7b)', () => {
  const T = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[]): Tarjeta => ({ agente, rol, especialidad: `especialidad de ${agente}`, sabe_hacer: ['a'], necesita: ['b'], entrega: ['c'], pertinente_en, activo: true } as Tarjeta)
  const DIR: Tarjeta[] = [T('creative-director-mesa', 'direccion', ['carrusel']), T('content-creator', 'miembro', ['carrusel'])]
  const est = (): EstadoMesa => ({ tipo: 'carrusel', directorio_congelado: DIR, direccion: 'creative-director-mesa', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null } as EstadoMesa)
  let n = 0
  const A = (o: Partial<Aporte> & Pick<Aporte, 'de' | 'tipo'>): Aporte => { n++; return { id: `id-${n}`, encargo_id: 'e1', n, para: null, texto: 'texto del aporte', refs: [], responde_a: null, profundidad: 0, costo_usd: 0.1, workflow_execution_id: 'x', creado_en: '2026-10-28T00:00:00Z', ...o } as Aporte }
  const RP = { capitulo: 'crecer', prefijo: '2', desde: 2, redes: [{ red: 'instagram', faltan: 1, esperadas: 2 }], ya_estan: [] }
  const integrada = () => { n = 0; return [A({ de: 'creative-director-mesa', tipo: 'dirige' }), A({ de: 'content-creator', tipo: 'aporta' }), A({ de: 'creative-director-mesa', tipo: 'integra', texto: '## Lámina 1\nTítulo: hola\n\n## Citas\nA2 usé: aporte de content-creator para la pieza' })] }
  const ctx = (extra: Record<string, unknown> = {}) => ({ gasto_usd: 0.5, tope_usd: 5, hayImagenGenerada: false, ...extra })

  it('🔴 integrada y con las citas al día: si falta banco, la dirección rellena (responde a la integración); si no, sigue como antes', () => {
    const l = integrada()
    expect(siguienteDeLaMesa(est(), l, ctx({ relleno_del_banco: RP }))).toMatchObject({ accion: 'turno', agente: 'creative-director-mesa', tipo: 'rellenar_banco', responde_a: l[2].id })
    expect(siguienteDeLaMesa(est(), l, ctx({ relleno_del_banco: null })).accion).toBe('traducir')
    expect(siguienteDeLaMesa(est(), l, ctx()).accion).toBe('traducir')
  })
  it('🔴 el relleno escrito NO es un «aporte nuevo»: no pide otra integración (ni normal ni al agotarse la cota)', () => {
    const l = [...integrada(), A({ de: 'creative-director-mesa', tipo: 'aporta', texto: conCabeceraDelRelleno('- C2-I02 · x', 'crecer') })]
    expect(siguienteDeLaMesa(est(), l, ctx()).accion).toBe('traducir')
    expect(siguienteDeLaMesa(est(), l, ctx({ gasto_usd: 4.95 }))).toMatchObject({ accion: 'seguir_a_dibujar' })
    // un aporte cualquiera del equipo sí sigue siendo nuevo
    expect(siguienteDeLaMesa(est(), [...l, A({ de: 'content-creator', tipo: 'aporta' })], ctx())).toMatchObject({ tipo: 'integrar' })
  })
  it('🔴 la dirección que agotó sus reintentos no recibe el turno de relleno (la mesa entrega lo que hay)', () => {
    const l = integrada()
    const fallos = Array.from({ length: COTAS.REINTENTOS_DE_TURNO }, () => A({ de: 'creative-director-mesa', tipo: 'nota', texto: 'turno_fallido · la dirección no contestó' }))
    expect(siguienteDeLaMesa(est(), [...l, ...fallos], ctx({ relleno_del_banco: RP }))).not.toMatchObject({ tipo: 'rellenar_banco' })
    expect(siguienteDeLaMesa(est(), [...l, ...fallos.slice(1)], ctx({ relleno_del_banco: RP }))).toMatchObject({ tipo: 'rellenar_banco' })
  })
  it('🔴 con la cota agotada no hay relleno (cierra con lo que hay)', () => {
    const r = siguienteDeLaMesa(est(), integrada(), ctx({ gasto_usd: 4.95, relleno_del_banco: RP }))
    expect(r).not.toMatchObject({ tipo: 'rellenar_banco' })
  })
})

describe('relleno · la tarea de la dirección', () => {
  it('🔴 dice el capítulo, cuántas faltan por red, desde qué id seguir y lo que ya está (para no repetir)', () => {
    const t = tareaDelRelleno({ capitulo: 'crecer', prefijo: '2', desde: 2, redes: [{ red: 'instagram', faltan: 3, esperadas: 4 }, { red: 'whatsapp', faltan: 1, esperadas: 2 }], ya_estan: [{ id: 'C2-I01', red: 'instagram', mensaje: 'la mesa se llena' }] })
    expect(t).toContain('«crecer»')
    expect(t).toContain('faltan **4 ideas**')
    expect(t).toContain('- instagram: faltan 3 (la cuota es 4)')
    expect(t).toContain('- whatsapp: faltan 1 (la cuota es 2)')
    expect(t).toContain('**C2-I02**')
    expect(t).toContain('- C2-I01 · instagram · la mesa se llena')
    expect(t).toMatch(/no se toca/)
  })
})
