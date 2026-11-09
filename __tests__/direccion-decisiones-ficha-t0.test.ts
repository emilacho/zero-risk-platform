/**
 * 09-nov · T0 de la ficha única de decisión (`raw/tasks/2026-11-09-GO-LENOVO-a-CC1-CC4-CC6-construir-ficha-de-decision.md`, DISENO.md partes 2 y 4).
 * Cada decisión trae `ficha` al lado de sus campos de hoy. El traductor refleja lo que hoy se ofrece, con el vocabulario fijo y las puertas de la lista cerrada.
 * Una ficha que rompe el contrato se rechaza entera. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import type { Contexto } from '../src/lib/direccion/comun'
import { leerDecisiones, type Decision } from '../src/lib/direccion/decisiones'
import { DESTINOS, MAX_ACCIONES, PANTALLAS, VERBOS, conFicha, fichaDe, problemasDeLaFicha, type FichaDeDecision } from '../src/lib/direccion/decisiones-ficha'

const AHORA = new Date('2026-11-04T20:00:00Z')
const C1 = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const ENC = '99999999-9999-4999-8999-999999999999'
const hace = (dias: number) => new Date(AHORA.getTime() - dias * 86_400_000).toISOString()
const base = () => new DbFalsa().semilla('clients', [{ id: C1, name: 'Uno', industry: 'restaurante', status: 'active' }])
const ctx = (db: DbFalsa): Contexto => {
  const from = db.from.bind(db)
  db.from = ((t: string) => { const q = from(t) as unknown as Record<string, unknown>; for (const m of ['insert', 'update', 'upsert', 'delete']) q[m] = () => { throw new Error(`ESCRITURA en ${t}`) }; return q }) as unknown as typeof db.from
  return { db, ahora: () => AHORA, env: {} }
}
const pregunta = (x: Record<string, unknown> = {}) => ({ id: 'p1', client_id: C1, tema: 'cupo diario', tema_norm: 'cupo', pregunta: '¿Cuántas mesas?', estado: 'pendiente', canal: 'x', oficina: 'financiera', agente: 'jefe-financiero', creado_en: hace(1), ...x })
const espera = (x: Record<string, unknown> = {}) => ({ id: 'e1', client_id: C1, tipo: 'finanzas', clave: `finanzas:${ENC}`, estado: 'esperando', despertado: null, despertar_intentos: 0, creado_en: hace(1), sobre: { corrida: 'corr-1' }, ...x })
const buzon = (preguntas: Record<string, unknown>[]) => ({ encargo_id: ENC, tipo: 'buzon_respuestas', version: 1, contenido: { preguntas } })
const hitl = (id: string, type: string, x: Record<string, unknown> = {}) => ({ id, client_id: C1, type, title: `Revisión ${type}`, status: 'pending', priority: 'normal', payload: {}, metadata: {}, created_at: hace(2), expires_at: null, ...x })
const CAMP = { id: '28de888e', client_id: C1, estado: 'necesita_humano', estado_motivo: 'bloqueos', seco: false, archivada_en: null, actualizada_en: hace(1) }
const ESPERA_C = { campana_id: '28de888e', objeto_tipo: 'necesita_humano', estado: 'viva', seco: false, vence_en: '2026-11-13T11:23:08Z', accion_al_vencer: 'pausada', desde: hace(1) }

/** una decisión de hoy, armada a mano (los mismos campos que emite `leerDecisiones`) */
const dec = (x: Partial<Decision>): Decision => ({ id: 'd1', tipo: 'pregunta_al_dueno', subtipo: 'x', fuente: 'dueno_preguntas', client_id: C1, cliente: 'Uno', titulo: '¿Algo?', titulo_interno: '¿Algo?', desde: hace(1), vence: null, vencida: false, prioridad: null, decidir: { ruta: null, accion: null }, costo_usd: null, costo_nota: null, ...x })
const CIFRAS = [{ clave: 'meta_semanal', nombre: 'Meta de ventas por semana', valor: 5, unidad: null, nota: 'Dato', editable: true }, { clave: 'presupuesto', nombre: 'Presupuesto total al mes', valor: 1341.27, unidad: 'USD', nota: null }]
/** las 13 variantes del inventario (parte 1 del diseño) */
const VARIANTES: Record<string, Decision> = {
  firma_editable: dec({ tipo: 'firma_de_finanzas', fuente: 'finanzas_tableros', titulo: 'Tablero financiero: espera tu firma', permite: ['aceptar', 'editar'], cifras: CIFRAS, al_editar: 'El plan ya escrito no cambia.', criticos: ['Instagram lleva 6 años inactivo'], para_que: 'largo', para_que_corto: 'Validar cifras', destraba: 'largo', destraba_corto: 'Solo constancia', detiene: false, pregunta_de: { oficina: 'financiera', agente: null } }),
  plan: dec({ id: 'plan-1', tipo: 'plan', fuente: 'plan_aprobaciones', titulo: 'Plan de 90 días: espera tu decisión', decidir: { ruta: '/nuevo', accion: 'plan-aprobar' }, costo_nota: 'pedir cambios gasta hasta US$ 3', destraba: 'Al aprobar arrancan el PDF y el brief.', destraba_corto: 'PDF y brief', detiene: true }),
  pregunta_con_supuesto: dec({ permite: ['responder', 'asumir', 'descartar'], supuesto: 'Arrancas en 4 semanas', pregunta_de: { oficina: 'financiera', agente: 'jefe-financiero' }, detiene: false }),
  pausa: dec({ tipo: 'pregunta_de_finanzas', subtipo: 'plan_en_pausa', fuente: 'esperas_del_dueno', permite: [], pregunta_de: { oficina: 'financiera', agente: null }, para_que: 'largo', para_que_corto: 'Cuentas del plan', detiene: true }),
  no_volvio: dec({ tipo: 'pregunta_de_finanzas', subtipo: 'plan_no_volvio', fuente: 'esperas_del_dueno', permite: [], pregunta_de: { oficina: 'financiera', agente: null }, detiene: true, volvio: { motivo: 'x' } }),
  canal_viejo: dec({ tipo: 'pregunta_de_finanzas', fuente: 'finanzas_preguntas', permite: [], pregunta_de: { oficina: 'financiera', agente: null } }),
  campana: dec({ tipo: 'plan', subtipo: 'campana_necesita_humano', fuente: 'cadena_campanas', vence: '2026-11-13T11:23:08Z', permite: [], detiene: true, costo_nota: 'avisar no gasta', campana: { id: 'c', estado: 'necesita_humano', motivo: 'x', espera: { vence_en: '2026-11-13T11:23:08Z', al_vencer: 'pausada', al_vencer_texto: 'se pausa' } } }),
  pieza: dec({ tipo: 'pieza', fuente: 'hitl_queue', decidir: { ruta: '/piezas', accion: null } }),
  gran_idea: dec({ tipo: 'gran_idea', fuente: 'hitl_queue', decidir: { ruta: '/piezas', accion: null } }),
  plan_con_pendientes: dec({ tipo: 'plan', fuente: 'hitl_queue', decidir: { ruta: '/nuevo', accion: 'plan-aprobar' } }),
  palabra_del_dueno: dec({ tipo: 'plan', fuente: 'hitl_queue', decidir: { ruta: '/nuevo', accion: null } }),
  lista_de_competidores: dec({ tipo: 'revision', fuente: 'hitl_queue', decidir: { ruta: null, accion: 'revision-resolver' } }),
  otra_revision: dec({ tipo: 'revision', fuente: 'hitl_queue', decidir: { ruta: '/nuevo', accion: null } }),
}
const valida = (f: FichaDeDecision) => expect(problemasDeLaFicha(f), JSON.stringify(f)).toEqual([])

describe('T0 · cada decisión de hoy da una ficha válida', () => {
  it('🔴 las 13 variantes: verbos del vocabulario, puertas de la lista cerrada, a lo más 3 acciones y una principal', () => {
    expect(Object.keys(VARIANTES)).toHaveLength(13)
    for (const [k, d] of Object.entries(VARIANTES)) {
      const f = fichaDe(d)
      valida(f)
      expect(f.acciones.length, k).toBeLessThanOrEqual(MAX_ACCIONES)
      for (const a of f.acciones) { expect(VERBOS, k).toContain(a.verbo); expect(DESTINOS, k).toContain(a.destino) }
      expect(f.acciones.filter((a) => a.principal).length, k).toBeLessThanOrEqual(1)
      if (f.donde_se_hace) expect(PANTALLAS, k).toContain(f.donde_se_hace.pantalla)
    }
  })
  it('🔴 la ficha no trae tipo, subtipo, fuente ni clase: el dibujante no tiene con qué ramificar (el origen va aparte, solo para mostrarse)', () => {
    for (const [k, d] of Object.entries(VARIANTES)) for (const campo of ['tipo', 'subtipo', 'fuente', 'clase']) expect(fichaDe(d), `${k}.${campo}`).not.toHaveProperty(campo)
  })
  it('🔴 la firma: «Aprobar» a firmar-tablero; la cifra editable va a firmar-tablero y su vista previa a recalcular-tablero', () => {
    const f = fichaDe(VARIANTES.firma_editable)
    expect(f.acciones).toEqual([{ verbo: 'aprobar', principal: true, destino: 'firmar-tablero' }])
    expect(f.propuesta?.al_editar).toEqual({ destino: 'firmar-tablero', vista_previa: 'recalcular-tablero' })
    expect(f.propuesta?.al_cambiar).toBe('El plan ya escrito no cambia.')
    expect(f.propuesta?.cifras?.[0]).toMatchObject({ clave: 'meta_semanal', editable: true, nota: 'Dato' })
    expect(f.propuesta?.cifras?.[1]).not.toHaveProperty('editable'); expect(f.propuesta?.cifras?.[1]).not.toHaveProperty('nota')
    expect(f.decisivo).toEqual([{ largo: 'Instagram lleva 6 años inactivo' }])
    expect(f).toMatchObject({ uso: { corto: 'Validar cifras', largo: 'largo' }, desbloquea: { corto: 'Solo constancia', largo: 'largo' }, departamento: { oficina: 'financiera', nombre: 'Financiero' }, espera: { sin_limite: true } })
    expect(f).not.toHaveProperty('detiene') // false: no detiene nada, no hay rótulo
  })
  it('🔴 una firma que hoy no deja editar no ofrece tocar la cifra: sin al_editar ni editable', () => {
    const f = fichaDe({ ...VARIANTES.firma_editable, permite: ['aceptar'], cifras: CIFRAS.map(({ editable: _e, ...c }) => c), al_editar: undefined })
    valida(f)
    expect(f.propuesta).not.toHaveProperty('al_editar'); expect(f.propuesta).not.toHaveProperty('al_cambiar')
    expect(f.propuesta?.cifras?.some((c) => c.editable)).toBe(false)
  })
  it('🔴 una cifra marcada editable en una firma que la oficina no deja editar: se muestra sin poder tocarse, y la ficha sigue valiendo', () => {
    const f = fichaDe({ ...VARIANTES.firma_editable, permite: ['aceptar'] })
    valida(f)
    expect(f.propuesta?.cifras?.some((c) => c.editable)).toBe(false)
    expect(f.propuesta).not.toHaveProperty('al_editar'); expect(f.propuesta).not.toHaveProperty('al_cambiar')
  })
  it('🔴 la pregunta: Descartar, Asumir y Responder (principal), en ese orden, todas a la ruta de la oficina de preguntas', () => {
    const f = fichaDe(VARIANTES.pregunta_con_supuesto)
    expect(f.acciones).toEqual([
      { verbo: 'descartar', pide: { que: 'motivo', obligatorio: false }, destino: 'dueno-preguntas' },
      { verbo: 'asumir', destino: 'dueno-preguntas' },
      { verbo: 'responder', principal: true, pide: { que: 'texto', obligatorio: true }, destino: 'dueno-preguntas' },
    ])
    expect(f.propuesta).toEqual({ supuesto: 'Arrancas en 4 semanas' })
    expect(f.departamento).toEqual({ oficina: 'financiera', nombre: 'Financiero', agente: 'jefe-financiero' })
  })
  it('🔴 sin supuesto no hay Asumir, aunque la lista de hoy lo dijera', () => {
    const f = fichaDe({ ...VARIANTES.pregunta_con_supuesto, supuesto: undefined })
    expect(f.acciones.map((a) => a.verbo)).toEqual(['descartar', 'responder'])
    expect(f).not.toHaveProperty('propuesta')
  })
  it('🔴 lo que hoy se decide en otro panel queda sin verbos y con su pantalla', () => {
    const pantallas = Object.fromEntries(Object.entries(VARIANTES).map(([k, d]) => [k, fichaDe(d).donde_se_hace?.pantalla ?? null]))
    expect(pantallas).toEqual({ firma_editable: null, plan: 'plan', pregunta_con_supuesto: null, pausa: null, no_volvio: null, canal_viejo: null, campana: 'plan', pieza: 'piezas', gran_idea: 'gran_idea', plan_con_pendientes: 'plan', palabra_del_dueno: 'plan', lista_de_competidores: null, otra_revision: null })
    for (const k of ['plan', 'campana', 'pieza', 'gran_idea', 'plan_con_pendientes', 'palabra_del_dueno', 'pausa', 'no_volvio', 'canal_viejo', 'lista_de_competidores', 'otra_revision']) expect(fichaDe(VARIANTES[k]).acciones, k).toEqual([])
  })
  it('🔴 la campaña: detiene, vence con su espera y dice qué pasa al vencer', () => {
    expect(fichaDe(VARIANTES.campana)).toMatchObject({ detiene: { que: 'el plan' }, espera: { vence: '2026-11-13T11:23:08Z', al_vencer: 'se pausa' }, costo: { nota: 'avisar no gasta' }, departamento: { nombre: 'Plan de 90 días' } })
  })
  it('🔴 v7 · todo lo que detiene dice qué detiene («DETIENE EL PLAN»); lo que no detiene no lleva rótulo', () => {
    for (const k of ['plan', 'pausa', 'no_volvio', 'campana']) expect(fichaDe(VARIANTES[k]).detiene, k).toEqual({ que: 'el plan' })
    for (const k of ['firma_editable', 'pregunta_con_supuesto', 'pieza', 'canal_viejo']) expect(fichaDe(VARIANTES[k]), k).not.toHaveProperty('detiene')
  })
  it('🔴 v7 · «Sin fecha límite» solo donde la fuente lo declara (la firma); una pregunta sin plazo es «no se sabe», no «sin límite»', () => {
    expect(fichaDe(VARIANTES.firma_editable).espera).toEqual({ desde: VARIANTES.firma_editable.desde, sin_limite: true })
    for (const k of ['pregunta_con_supuesto', 'plan', 'pieza', 'pausa']) { expect(fichaDe(VARIANTES[k]).espera, k).not.toHaveProperty('sin_limite'); expect(fichaDe(VARIANTES[k]).espera, k).not.toHaveProperty('vence') }
    expect(fichaDe(VARIANTES.campana).espera).not.toHaveProperty('sin_limite') // vence: el plazo manda
  })
  it('🔴 sin corto se manda solo el largo; nunca un corto sin su largo', () => {
    const f = fichaDe(dec({ para_que: 'Para repartir los anuncios entre ciudades.', destraba_corto: 'Huérfano' }))
    expect(f.uso).toEqual({ largo: 'Para repartir los anuncios entre ciudades.' })
    expect(f).not.toHaveProperty('desbloquea')
  })
  it('🔴 CC7 · la ficha dice de qué cuenta es: el client_id y el nombre del cliente', () => {
    expect(fichaDe(dec({})).cuenta).toEqual({ client_id: C1, nombre: 'Uno' })
    expect(fichaDe(dec({ client_id: 'otro', cliente: 'Otro' })).cuenta).toEqual({ client_id: 'otro', nombre: 'Otro' })
  })
  it('🔴 cuenta y origen: de la agencia (sin cliente) va null; el origen es la tabla y la fila', () => {
    const f = fichaDe(dec({ client_id: null, cliente: null }))
    expect(f.cuenta).toBeNull(); expect(f.origen).toEqual({ fuente: 'dueno_preguntas', ref: 'd1' })
  })
})

describe('T0 · una ficha que rompe el contrato se rechaza entera', () => {
  const buena = () => fichaDe(VARIANTES.pregunta_con_supuesto)
  it('🔴 4 acciones', () => expect(problemasDeLaFicha({ ...buena(), acciones: [...buena().acciones, { verbo: 'aprobar', destino: 'plan-aprobar' }] })).toContain('4 acciones: el tope es 3'))
  it('🔴 dos principales', () => expect(problemasDeLaFicha({ ...buena(), acciones: buena().acciones.map((a) => ({ ...a, principal: true as const })) })).toContain('más de una acción principal'))
  it('🔴 un verbo fuera del vocabulario', () => expect(problemasDeLaFicha({ ...buena(), acciones: [{ verbo: 'firmar' as never, destino: 'firmar-tablero' }] })).toContain('verbo fuera del vocabulario: firmar'))
  it('🔴 una puerta que no está en la lista (una dirección libre, por ejemplo)', () => expect(problemasDeLaFicha({ ...buena(), acciones: [{ verbo: 'responder', destino: 'https://otro.lado/api' as never }] })).toContain('puerta desconocida: https://otro.lado/api'))
  it('🔴 un verbo repetido', () => expect(problemasDeLaFicha({ ...buena(), acciones: [{ verbo: 'responder', destino: 'dueno-preguntas' }, { verbo: 'responder', destino: 'dueno-preguntas' }] })).toContain('un verbo repetido'))
  it('🔴 asumir sin supuesto', () => expect(problemasDeLaFicha({ ...buena(), propuesta: undefined })).toContain('«asumir» sin supuesto'))
  it('🔴 una cifra editable sin a dónde va el cambio', () => {
    const f = fichaDe(VARIANTES.firma_editable)
    expect(problemasDeLaFicha({ ...f, propuesta: { ...f.propuesta, al_editar: undefined } })).toContain('una cifra editable sin a dónde va el cambio')
  })
  it('🔴 una pantalla fuera de la lista', () => expect(problemasDeLaFicha({ ...fichaDe(VARIANTES.pieza), donde_se_hace: { pantalla: 'cualquiera' as never } })).toContain('pantalla desconocida: cualquiera'))
  it('🔴 vence y «sin fecha límite» a la vez', () => expect(problemasDeLaFicha({ ...buena(), espera: { desde: null, vence: '2026-11-20T00:00:00Z', sin_limite: true } })).toContain('vence y a la vez «sin fecha límite»'))
  it('🔴 «detiene» sin decir qué', () => expect(problemasDeLaFicha({ ...buena(), detiene: { que: ' ' } })).toContain('«detiene» sin decir qué'))
  it('🔴 CC7 · una versión desconocida', () => expect(problemasDeLaFicha({ ...buena(), version: 2 as never })).toContain('versión desconocida'))
  it('🔴 CC7 · un departamento sin nombre', () => expect(problemasDeLaFicha({ ...buena(), departamento: { oficina: 'x', nombre: '  ' } })).toContain('sin departamento'))
  it('🔴 CC7 · un «uso» o «desbloquea» de solo espacios', () => {
    expect(problemasDeLaFicha({ ...buena(), uso: { largo: '   ' } })).toContain('«uso» sin texto')
    expect(problemasDeLaFicha({ ...buena(), desbloquea: { largo: 'ok', corto: ' ' } })).toContain('«desbloquea» sin texto')
  })
  it('🔴 sin «qué se decide»', () => expect(problemasDeLaFicha({ ...buena(), que_se_decide: '  ' })).toContain('sin «qué se decide»'))
  it('🔴 conFicha: si no vale, viaja null con sus problemas, y los campos de hoy siguen enteros', () => {
    const mala = dec({ titulo: '' })
    const r = conFicha(mala)
    expect(r.ficha).toBeNull(); expect(r.ficha_problemas).toContain('sin «qué se decide»')
    expect(r).toMatchObject({ id: 'd1', tipo: 'pregunta_al_dueno', fuente: 'dueno_preguntas' })
  })
})

describe('T0 · la lista entera trae su ficha, al lado de lo de hoy', () => {
  it('🔴 todas las fuentes juntas: cada decisión trae una ficha válida y sus campos de hoy no cambian', async () => {
    const db = base()
      .semilla('esperas_del_dueno', [espera()]).semilla('finanzas_artefactos', [buzon([{ clave: 'cupo_diario', pregunta_id: 'p1' }])])
      .semilla('dueno_preguntas', [pregunta(), pregunta({ id: 'p2', tema: 'arranque', tema_norm: 'arranque', supuesto: 'En 4 semanas' })])
      .semilla('finanzas_tableros', [{ id: 't', client_id: C1, version: 2, estado: 'sin_firma', vigente: true, dry_run: false, creado_en: hace(1) }])
      .semilla('plan_aprobaciones', [{ id: 'a', client_id: C1, plan_id: 'plan-1', version: 1, estado: 'pendiente', creado_en: hace(1) }])
      .semilla('cadena_campanas', [CAMP]).semilla('cadena_esperas', [ESPERA_C])
      .semilla('finanzas_preguntas', [{ id: 'fp', client_id: C1, clave: 'k', texto: '¿Viejo?', estado: 'enviada', creado_en: hace(3) }])
      .semilla('hitl_queue', [hitl('h1', 'content_piece_review'), hitl('h2', 'concepto_review'), hitl('h3', 'confirm_competitor_list')])
    const r = await leerDecisiones(ctx(db))
    expect(r.decisiones.length).toBeGreaterThanOrEqual(10)
    for (const d of r.decisiones) {
      expect(d.ficha, `${d.id} ${JSON.stringify(d.ficha_problemas)}`).not.toBeNull()
      valida(d.ficha!)
      expect(d.ficha!.id).toBe(d.id); expect(d.ficha!.que_se_decide).toBe(d.titulo)
      expect(d.ficha!.cuenta, d.id).toEqual({ client_id: C1, nombre: 'Uno' }) // CC7: de qué cliente es
      expect(d).toHaveProperty('tipo'); expect(d).toHaveProperty('decidir') // lo de hoy sigue
    }
    const p2 = r.decisiones.find((d) => d.id === 'p2')!
    expect(p2.ficha!.acciones.map((a) => a.verbo)).toEqual(['descartar', 'asumir', 'responder'])
    expect(r.decisiones.find((d) => d.id === 'h1')!.ficha!.donde_se_hace).toEqual({ pantalla: 'piezas' })
  })
})
