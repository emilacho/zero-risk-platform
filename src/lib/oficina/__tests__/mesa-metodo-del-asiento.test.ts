/**
 * T6 · EL MÉTODO DEL ASIENTO (CC#1 → mesa de la oficina) · US$ 0. El método de la pieza (content-creator) y las fichas por red (curador de Instagram)
 * se pegan a la TAREA del turno, después del marco y antes del formato de salida; apagados, reemplazados o con la configuración ilegible, se comportan como la configuración manda.
 */
import { describe, expect, it } from 'vitest'
import { METODO_PIEZA_POR_OMISION } from '../../cadena/metodos'
import { armarTarea, seccionDeMetodo } from '../mesa/pedidos'
import { pedidoDelTurno } from '../mesa/orquestador'
import { ARTEFACTO_MARCO } from '../mesa/de-la-cadena'
import { estadoInicial } from '../tipos'
import type { Encargo, Puertos } from '../puertos'
import type { EstadoMesa } from '../mesa/tipos'

const HOY = '2026-10-31T12:00:00Z'
const FICHAS = {
  instagram: { red: 'instagram', verificada_en: '2026-10-01', revisar_antes_de: '2026-12-30', filas: [{ dato: 'máximo de láminas', valor: '20', tipo: 'documentada', fuente: 'ayuda de Instagram', verificada_en: '2026-10-01' }] },
  tiktok: { red: 'tiktok', verificada_en: '2026-05-01', revisar_antes_de: '2026-08-01', filas: [{ dato: 'duración', valor: '10 min', tipo: 'folclore', fuente: '', verificada_en: '2026-05-01' }] },
}

describe('seccionDeMetodo', () => {
  it('content-creator recibe el método de la pieza por omisión; los demás asientos, nada', () => {
    const s = seccionDeMetodo('content-creator', undefined, undefined, HOY)
    expect(s).toContain('## Método de la oficina para ti')
    expect(s).toContain(METODO_PIEZA_POR_OMISION)
    for (const a of ['creative-director-mesa', 'design-visual-storyteller', 'whimsy-injector', 'portero']) expect(seccionDeMetodo(a, undefined, FICHAS, HOY)).toBe('')
  })
  it('apagado (false) = nada; texto de reemplazo = el texto; configuración ilegible = el de omisión', () => {
    expect(seccionDeMetodo('content-creator', { pieza: false }, undefined, HOY)).toBe('')
    expect(seccionDeMetodo('content-creator', { pieza: 'MÉTODO PROPIO' }, undefined, HOY)).toContain('MÉTODO PROPIO')
    expect(seccionDeMetodo('content-creator', 'basura', undefined, HOY)).toContain(METODO_PIEZA_POR_OMISION)
  })
  it('el curador recibe sus fichas como dato: la vencida se marca y la mal formada se ignora; sin fichas ni método de fichas, nada que inventar', () => {
    const s = seccionDeMetodo('marketing_instagram_curator', undefined, { ...FICHAS, rota: { red: 'x' } }, HOY)
    expect(s).toMatch(/## instagram · verificada 2026-10-01/)
    expect(s).toMatch(/## tiktok .*VENCIDA/)
    expect(s).not.toMatch(/## x/)
    expect(seccionDeMetodo('marketing_instagram_curator', { fichas_por_red: false }, undefined, HOY)).toBe('')
  })
  it('content-creator no recibe las fichas (son del curador)', () => {
    expect(seccionDeMetodo('content-creator', undefined, FICHAS, HOY)).not.toContain('FICHAS POR RED')
  })
})

describe('el método dentro del turno', () => {
  const est = { tipo: 'carrusel', directorio_congelado: [], direccion: 'creative-director-mesa', turnos: 1, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null } as unknown as EstadoMesa
  const c = { cliente_nombre: 'Cliente de práctica', tipo: 'carrusel' as const, brief_id: 'BRF-1', brief_texto: 'EL BRIEF', manual_texto: 'manual', plan_texto: null, fotos: [], tope_usd: 5, gasto_usd: 0 }
  const base = { tipo: 'aportar' as const, agente: 'content-creator', tarjeta: undefined, est, libro: [], c }

  it('va después del marco y antes del turno; sin método el pedido es byte a byte el de siempre', () => {
    const metodo = seccionDeMetodo('content-creator', undefined, undefined, HOY)
    const con = armarTarea({ ...base, metodo })
    expect(con.indexOf('EL BRIEF')).toBeLessThan(con.indexOf('## Método de la oficina para ti'))
    expect(con.indexOf('## Método de la oficina para ti')).toBeLessThan(con.indexOf('## Tu turno'))
    const sin = armarTarea(base)
    expect(sin).not.toContain('Método de la oficina')
    expect(armarTarea({ ...base, metodo: undefined })).toBe(sin)
    expect(con.replace(metodo + '\n\n', '')).toBe(sin)
  })
})

describe('pedidoDelTurno lee el método del puerto de la mesa', () => {
  const e0 = estadoInicial()
  const marco = { tipo_de_mesa: 'concepto', campana_id: 'c1', version: 1, cliente_nombre: 'Cliente de práctica', manual_texto: 'manual', plan_texto: null, marco_texto: 'EL MARCO', condiciones: [], fotos: [] }
  const enc = { id: 'e1', client_id: 'cli', parte_id: 'c1', brief_id: 'BRF', tipo_de_grupo: 'x', familia: 'concepto_mesa', version_encargo: 1, estado: 'en_paso', con_desacuerdo: false, imagen_generada: false, tope_usd: 5, gasto_usd: 0, dry_run: true, prueba: true, sala_ref: null,
    estado_del_motor: { ...e0, artefactos: { ...e0.artefactos, [ARTEFACTO_MARCO]: { version: 1, version_consumida: 0, datos: marco } } } } as unknown as Encargo
  const est = { tipo: 'concepto', directorio_congelado: [], direccion: 'creative-director-mesa', turnos: 1, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null } as unknown as EstadoMesa
  const turno = (agente: string) => ({ n: 1, agente, tipo: 'aportar' as const, responde_a: null })
  const puertos = (config: (k: string) => Promise<unknown>) => ({ mesa: { libro: async () => [], configDeLaCadena: config } }) as unknown as Puertos
  const tarea = async (P: Puertos, agente: string) => String((await pedidoDelTurno(P, enc, est, turno(agente))).pedido.task)

  it('con el puerto: content-creator lleva el método y las llaves leídas son las firmadas', async () => {
    const leidas: string[] = []
    const t = await tarea(puertos(async (k) => { leidas.push(k); return undefined }), 'content-creator')
    expect(t).toContain(METODO_PIEZA_POR_OMISION)
    expect(leidas).toEqual(['metodos'])
    const tc = await tarea(puertos(async (k) => { leidas.push(k); return k === 'fichas_por_red' ? FICHAS : undefined }), 'marketing_instagram_curator')
    expect(tc).toMatch(/## instagram · verificada/)
  })
  it('otro asiento no lee nada; con el método apagado no hay sección', async () => {
    const leidas: string[] = []
    const t = await tarea(puertos(async (k) => { leidas.push(k); return { pieza: false } }), 'whimsy-injector')
    expect(leidas).toEqual([]); expect(t).not.toContain('Método de la oficina')
    expect(await tarea(puertos(async () => ({ pieza: false })), 'content-creator')).not.toContain('Método de la oficina')
  })
  it('si la lectura falla (o no hay puerto de lectura) el turno sigue con el método por omisión, sin frenarse', async () => {
    const t = await tarea(puertos(async () => { throw new Error('base caída') }), 'content-creator')
    expect(t).toContain(METODO_PIEZA_POR_OMISION)
    const sinLectura = { mesa: { libro: async () => [] } } as unknown as Puertos
    expect(await tarea(sinLectura, 'content-creator')).not.toContain('Método de la oficina')
  })
})
