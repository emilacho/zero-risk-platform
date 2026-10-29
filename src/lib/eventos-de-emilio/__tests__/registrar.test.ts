/**
 * APRENDER DE EMILIO · etapa 1 · el evento crudo. US$ 0, sin red: una base falsa en memoria.
 */
import { describe, expect, it } from 'vitest'
import { canalDelRevisor, claveDelEvento, especialidadesValidas, registrarEventoDeEmilio } from '../registrar'
import { procesar } from '../../notas-del-dueno/recibir'
import type { PuertosDeNotas } from '../../notas-del-dueno/tipos'

const HITL = '11111111-1111-4111-8111-111111111111'
const CLIENTE = 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5'

type Fila = Record<string, unknown>
function baseFalsa(o: { tipo?: string; sinPieza?: boolean; falla?: string[] } = {}) {
  const tablas: Record<string, Fila[]> = {
    hitl_queue: o.sinPieza ? [] : [{ id: HITL, client_id: CLIENTE, type: o.tipo ?? 'content_piece_review', status: 'pending', output_id: 'aaaaaaaa-1111-4111-8111-aaaaaaaaaaaa', title: 'Carrusel mesa', metadata: { red: 'facebook', formato: 'carrusel', origen_de_imagenes_resumen: '1 generada' } }],
    clients: [{ id: CLIENTE, name: 'Zero Risk Seguridad Industrial', industry: 'seguridad industrial' }],
    oficina_encargos: [{ id: 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', hitl_queue_id: HITL, brief_id: 'BRF-0002', familia: 'carrusel_mesa', version_encargo: 3, estado: 'cerrado', gasto_usd: 4.2 }],
    oficina_turnos: [{ encargo_id: 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', n: 1, paso: 'mesa', agente: 'creative-director-mesa' }, { encargo_id: 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', n: 2, paso: 'mesa', agente: 'content-creator' }, { encargo_id: 'bbbbbbbb-1111-4111-8111-bbbbbbbbbbbb', n: 3, paso: 'imagen', agente: 'image-prompt-engineer' }],
    eventos_de_emilio: [], notas_del_dueno: [],
  }
  const from = (t: string) => {
    const filtros: Array<[string, unknown]> = []
    let insertado: Fila | null = null
    const q: any = {
      select: () => q, eq: (c: string, v: unknown) => { filtros.push([c, v]); return q }, order: () => q, limit: () => q,
      insert: (f: Fila) => { insertado = f; return q },
      maybeSingle: async () => ({ data: (tablas[t] ?? []).find((r) => filtros.every(([c, v]) => r[c] === v)) ?? null, error: o.falla?.includes(t) ? { message: 'caída' } : null }),
      single: async () => {
        if (!insertado) return { data: null, error: { message: 'sin insert' } }
        if (t === 'eventos_de_emilio' || t === 'notas_del_dueno') {
          if (tablas[t].some((r) => r.clave_unica === insertado!.clave_unica)) return { data: null, error: { code: '23505', message: 'duplicada' } }
          const fila = { id: `id-${tablas[t].length + 1}`, ...insertado }; tablas[t].push(fila); return { data: fila, error: null }
        }
        return { data: insertado, error: null }
      },
      then: (res: (v: unknown) => void) => { if (insertado) { tablas[t].push({ id: `id-${tablas[t].length + 1}`, ...insertado }); return res({ data: null, error: null }) } return res({ data: (tablas[t] ?? []).filter((r) => filtros.every(([c, v]) => r[c] === v)), error: o.falla?.includes(t) ? { message: 'caída' } : null }) },
    }
    return q
  }
  return { db: { from }, tablas }
}

const base = { canal: 'dashboard' as const, accion: 'pedir_cambios' as const, autor: 'emilio', hitl_id: HITL }

describe('el evento crudo de Emilio', () => {
  it('guarda el comentario LITERAL, las láminas marcadas y la foto del contexto (cliente, industria, formato, quién escribió cada paso)', async () => {
    const { db, tablas } = baseFalsa()
    const lit = '  La lámina 3 se ve "fría", cambia el titular; la 5 sin tanta letra.  '
    const r = await registrarEventoDeEmilio(db, { ...base, comentario: lit, laminas: [5, 3, 3], especialidades: ['Texto', 'diseño', 'inventada'], resultado: { http: 200 }, crudo: { x: 1 } })
    expect(r).toMatchObject({ ok: true, repetido: false })
    const e = tablas.eventos_de_emilio[0] as any
    expect(e).toMatchObject({ canal: 'dashboard', accion: 'pedir_cambios', decision: 'cambios_pedidos', autor: 'emilio', client_id: CLIENTE, hitl_id: HITL, brief_id: 'BRF-0002', familia: 'carrusel_mesa', pieza_titulo: 'Carrusel mesa', laminas: [3, 5], especialidades: ['texto', 'diseno'] })
    expect(e.comentario).toBe(lit)
    expect(e.contexto).toMatchObject({ cliente: 'Zero Risk Seguridad Industrial', industria: 'seguridad industrial', red: 'facebook', formato: 'carrusel' })
    expect(e.contexto.autores_por_paso).toEqual({ mesa: ['creative-director-mesa', 'content-creator'], imagen: ['image-prompt-engineer'] })
    expect(e.resultado).toEqual({ http: 200 })
  })
  it('es idempotente: el mismo clic repetido no duplica', async () => {
    const { db, tablas } = baseFalsa()
    const ahora = new Date('2026-10-29T15:00:10Z')
    const a = await registrarEventoDeEmilio(db, { ...base, accion: 'aprobar', ahora })
    const b = await registrarEventoDeEmilio(db, { ...base, accion: 'aprobar', ahora: new Date('2026-10-29T15:00:50Z') })
    expect(a).toMatchObject({ ok: true, repetido: false }); expect(b).toMatchObject({ ok: true, repetido: true })
    expect(tablas.eventos_de_emilio).toHaveLength(1)
  })
  it('otro comentario o otra decisión son OTRO evento (nada se sobrescribe)', async () => {
    const { db, tablas } = baseFalsa()
    await registrarEventoDeEmilio(db, { ...base, comentario: 'uno' })
    await registrarEventoDeEmilio(db, { ...base, comentario: 'dos' })
    await registrarEventoDeEmilio(db, { ...base, accion: 'rechazar', comentario: 'dos' })
    expect(tablas.eventos_de_emilio).toHaveLength(3)
  })
  it('solo piezas: otro tipo de bandeja o una fila que no existe no deja evento y no lanza', async () => {
    const otra = baseFalsa({ tipo: 'manual_review' })
    expect(await registrarEventoDeEmilio(otra.db, base)).toEqual({ ok: false, error: 'no_es_una_pieza' })
    const sin = baseFalsa({ sinPieza: true })
    expect(await registrarEventoDeEmilio(sin.db, base)).toEqual({ ok: false, error: 'pieza_sin_fila' })
    expect(otra.tablas.eventos_de_emilio).toHaveLength(0)
  })
  it('un hueco en la foto del contexto no impide guardar el evento: queda anotado', async () => {
    const { db, tablas } = baseFalsa({ falla: ['clients'] })
    const r = await registrarEventoDeEmilio(db, { ...base, comentario: 'hola' })
    expect(r.ok).toBe(true)
    expect((tablas.eventos_de_emilio[0] as any).contexto.huecos.join(' ')).toMatch(/clients/)
  })
  it('el espejo en notas_del_dueno solo se enciende con la bandera y solo para el dashboard (Slack ya escribe su nota)', async () => {
    const apagado = baseFalsa()
    await registrarEventoDeEmilio(apagado.db, { ...base, comentario: 'cámbialo', laminas: [2] })
    expect(apagado.tablas.notas_del_dueno).toHaveLength(0)
    const prendido = baseFalsa()
    await registrarEventoDeEmilio(prendido.db, { ...base, comentario: 'cámbialo', laminas: [2] }, { espejo: true })
    expect(prendido.tablas.notas_del_dueno[0]).toMatchObject({ tipo: 'editada', origen: 'tablero', client_id: CLIENTE, hitl_id: HITL, alcance: 'cliente' })
    expect((prendido.tablas.notas_del_dueno[0] as any).comentario).toBe('cámbialo [láminas: 2]')
    const slack = baseFalsa()
    await registrarEventoDeEmilio(slack.db, { ...base, canal: 'slack', accion: 'comentar', comentario: 'hola', slack: { canal: 'C1', ts: '1.2' } }, { espejo: true })
    expect(slack.tablas.notas_del_dueno).toHaveLength(0)
    expect(slack.tablas.eventos_de_emilio).toHaveLength(1)
  })
  it('aprobar sin comentario deja nota «aprobada» sin texto', async () => {
    const { db, tablas } = baseFalsa()
    await registrarEventoDeEmilio(db, { ...base, accion: 'aprobar' }, { espejo: true })
    expect(tablas.notas_del_dueno[0]).toMatchObject({ tipo: 'aprobada', comentario: null })
  })
})

describe('piezas pequeñas', () => {
  it('el canal sale del revisor: «slack:U123» es Slack; lo demás, el dashboard', () => {
    expect(canalDelRevisor('slack:U123')).toBe('slack'); expect(canalDelRevisor('emilio')).toBe('dashboard'); expect(canalDelRevisor(undefined)).toBe('dashboard')
  })
  it('la clave de Slack es exacta (canal + ts); la del dashboard cambia con el comentario, las láminas y el minuto', () => {
    const e = { ...base, ahora: new Date('2026-10-29T15:00:10Z') }
    expect(claveDelEvento({ ...e, canal: 'slack', slack: { canal: 'C1', ts: '1.2' } })).toBe(`slack:pedir_cambios:${HITL}:C1:1.2`)
    const k = claveDelEvento({ ...e, comentario: 'a', laminas: [1] })
    expect(claveDelEvento({ ...e, comentario: 'a', laminas: [1] })).toBe(k)
    expect(claveDelEvento({ ...e, comentario: 'b', laminas: [1] })).not.toBe(k)
    expect(claveDelEvento({ ...e, comentario: 'a', laminas: [2] })).not.toBe(k)
    expect(claveDelEvento({ ...e, comentario: 'a', laminas: [1], ahora: new Date('2026-10-29T15:05:00Z') })).not.toBe(k)
  })
  it('especialidades: normaliza acentos y mayúsculas, quita repetidas y desconocidas', () => {
    expect(especialidadesValidas(['TEXTO', 'texto', 'Diseño', 'dirección', 'x'])).toEqual(['texto', 'diseno', 'direccion'])
    expect(especialidadesValidas('texto')).toEqual([])
  })
})

describe('Slack: lo que Emilio escribe en el hilo y el clic en «Rechazar» dejan evento', () => {
  const pieza = { hitl_id: HITL, client_id: CLIENTE, type: 'content_piece_review', status: 'pending', output_id: null, titulo: 'T', familia: null, version: null, slack: { canal: 'C1', ts: '9.9' } }
  const puertos = (eventos: any[]): PuertosDeNotas => ({
    pieza: async () => pieza, decidir: async () => ({ ok: true }), guardarNota: async () => ({ ok: true, id: 'n1', repetida: false }), hitlDelHilo: async () => HITL,
    abrirModalDeRechazo: async () => true, responderEnHilo: async () => {}, registrarEvento: async (e) => { eventos.push(e) },
  })
  it('comentario en el hilo → evento con el texto tal cual y canal+ts', async () => {
    const ev: any[] = []
    await procesar(puertos(ev), { autorizados: ['U1'] }, { tipo: 'comentar', autor: 'U1', canal: 'C1', hilo_ts: '9.9', ts: '10.1', texto: 'la 4 se ve rara' } as never)
    expect(ev).toHaveLength(1)
    expect(ev[0]).toMatchObject({ accion: 'comentar', autor: 'U1', hitl_id: HITL, comentario: 'la 4 se ve rara', slack: { canal: 'C1', ts: '10.1' } })
  })
  it('clic en «Rechazar» → evento abrir_rechazo', async () => {
    const ev: any[] = []
    await procesar(puertos(ev), { autorizados: ['U1'] }, { tipo: 'abrir_rechazo', autor: 'U1', hitl_id: HITL, canal: 'C1', ts: '9.9', trigger_id: 't' } as never)
    expect(ev[0]).toMatchObject({ accion: 'abrir_rechazo', hitl_id: HITL })
  })
  it('alguien no autorizado NO deja evento; y un puerto que falla no frena la nota', async () => {
    const ev: any[] = []
    await procesar(puertos(ev), { autorizados: ['U1'] }, { tipo: 'comentar', autor: 'U2', canal: 'C1', hilo_ts: '9.9', ts: '10.1', texto: 'x' } as never)
    expect(ev).toHaveLength(0)
    const roto = { ...puertos([]), registrarEvento: async () => { throw new Error('caído') } }
    const r = await procesar(roto, { autorizados: ['U1'] }, { tipo: 'comentar', autor: 'U1', canal: 'C1', hilo_ts: '9.9', ts: '10.1', texto: 'x' } as never)
    expect(r.cuerpo).toMatchObject({ ok: true, nota_id: 'n1' })
  })
})
