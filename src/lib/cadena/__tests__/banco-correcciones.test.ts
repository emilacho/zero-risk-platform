/**
 * 17-nov · el PUERTO «banco» del receptor de correcciones (asignado por Lenovo · contrato de CC3) · CC1 · US$ 0, sin modelo, sin red.
 * La base de práctica es la MISMA del banco (ideas y filas reales de la campaña 28de888e de Náufrago, v4 aprobada).
 */
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import { BANCO_NAUFRAGO_V4 } from '../__fixtures__/banco-naufrago-v4'
import type { Campana, ConceptoGuardado } from '../almacen'
import type { Fila } from '../tipos'
import type { ConceptoLeido, IdeaDelBanco } from '../conceptos'
import { bancoEditar, bancoRetirar, editarEnElBanco, retirarDelBanco } from '../banco-de-ideas'
import { aplicarCorreccionDelBanco, IDEA_CAMBIADA, IDEA_FUERA_DEL_BANCO, leerRespuestaDelBanco, quienCorrige, verificarRespuestaDelBanco, type CorreccionAlBanco, type RespuestaDelBanco } from '../banco-correcciones'

const A = clienteA()
const CAMP = '28de888e-b3f2-4aca-86b3-2c7f7bf6685a'
const AHORA = '2026-11-17T06:40:00Z'
const tablero = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'tablero', workflow_execution_id: 'tablero:banco:2026-11-17T06:40', campana_id: CAMP, version: 4, ...extra })
const idea = (id: string) => BANCO_NAUFRAGO_V4.find((i) => i.id === id)!

/** el texto de la mesa como lo guarda la v4: cada línea de idea aparece en la integración Y en los aportes de los miembros (407 apariciones para 125 ids en la real) */
const TEXTO = [
  '## Gran idea', 'El náufrago que encontró algo mejor que el oro',
  '## Por qué funciona', 'Convierte la llegada en historia.',
  '## Cómo se ve', 'Luz de playa, madera.',
  '## Cómo suena', 'Primera persona, frases cortas.',
  '## Banco de ideas', ...BANCO_NAUFRAGO_V4.map((i) => i.linea),
  '## Ideas de los aportes', ...BANCO_NAUFRAGO_V4.map((i) => i.linea),
].join('\n')

const fila = (id: string, estado: Fila['estado'], idea_ref: string | null, red: string, formato: string, fecha: string) => ({
  campana_id: CAMP, calendario_version: 1, id, tanda: 1, semana: 1, dia_semana: 1, fecha, hora: '09:00', red, formato, pilar: null, tema: null, sede: null,
  requiere_abierto: false, depende_de: [], datos: [], pendientes: [], pieza_fija: null, origen: 'patron' as const, estado, avisos: [], idea_ref, concepto: null,
})

function almacen(o: { banco?: IdeaDelBanco[]; versiones?: Partial<ConceptoGuardado>[] } = {}) {
  const al = new AlmacenMemoria({
    contextos: { [A.clientId]: contextoDe(A) },
    config: { flujos: ['wf-cadena'], estado_cadena: 'ensayo', clientes_ensayo: [A.clientId], nuevo_orden: { clientes: [A.clientId] } },
  })
  al.campanas.push({ id: CAMP, client_id: A.clientId, plan_id: 'plan-1', fecha_inicio: '2026-11-09', fecha_inicio_origen: 'regla', fecha_fin: '2027-02-06', zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: ['olon'], estado: 'calendario', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: false } as unknown as Campana)
  const base = { campana_id: CAMP, brief_devuelto: null, motivo: null, costo_usd: 5.34, plazo_en: null, encargo_id: null, hitl_id: null, nota_de_emilio: null, apunta_a: null, decidido_en: '2026-11-10T14:03:30Z', seco: false }
  const leido = { gran_idea: { nombre: 'El náufrago', frase: 'algo mejor que el oro' }, capitulos: [], banco: structuredClone(o.banco ?? BANCO_NAUFRAGO_V4), banco_parcial: [] }
  al.conceptos.push({ ...base, version: 3, estado: 'lista', aprobacion: 'cambios', texto_md: 'viejo', leido: { banco: [] } } as ConceptoGuardado)
  al.conceptos.push({ ...base, version: 4, estado: 'lista', aprobacion: 'aprobado', texto_md: TEXTO, leido } as ConceptoGuardado)
  for (const v of o.versiones ?? []) al.conceptos.push({ ...base, estado: 'lista', aprobacion: 'aprobado', texto_md: 'otra', leido: { banco: [] }, ...v } as ConceptoGuardado)
  // filas REALES de la campaña (id · estado · idea_ref · red · formato · fecha), SELECT 17-nov
  al.filasGuardadas.push(
    fila('s1-d4-jue_anuncio_fb', 'validada', 'C1-I07', 'facebook', 'anuncio_imagen', '2026-11-12'),
    fila('s1-d6-sab_anuncio_fb', 'validada', 'C1-I21', 'facebook', 'anuncio_imagen', '2026-11-14'),
    fila('s1-d4-jue_foto_olon', 'perdio_su_fecha', 'C1-I03', 'instagram', 'foto', '2026-11-12'),
    fila('s2-d4-jue_foto_olon', 'briefeada', 'C1-I16', 'instagram', 'foto', '2026-11-19'),
    fila('s2-d4-jue_anuncio_fb', 'validada', 'C1-I22', 'facebook', 'anuncio_imagen', '2026-11-19'),
    fila('s3-d4-jue_anuncio_fb', 'validada', 'C2-I05', 'facebook', 'anuncio_imagen', '2026-11-26'),
  )
  return al
}
const v4 = (al: AlmacenMemoria) => al.conceptos.find((c) => c.version === 4)!
const bancoDe = (al: AlmacenMemoria) => (v4(al).leido as unknown as ConceptoLeido).banco
const historialDe = (al: AlmacenMemoria) => (v4(al).leido as Record<string, unknown>).historial_del_banco as Array<Record<string, unknown>>
const filaDe = (al: AlmacenMemoria, id: string) => al.filasGuardadas.find((f) => f.id === id)!

const CORR = (extra: Partial<CorreccionAlBanco> = {}): CorreccionAlBanco => ({
  correccion_id: 'corr-1', campana_id: CAMP, idea_id: 'C1-I23', idea_sello: idea('C1-I23').linea, filas_afectadas: [],
  motivo: 'el mensaje vende Olón como abierto en una fecha en que está cerrado', linea_de_la_ficha: 'olon · cierre_retiro · cerrada desde 2026-11-20', regla: null, ...extra,
})
const bloque = (o: unknown) => `Leí la corrección.\n\n\`\`\`json\n${JSON.stringify(o)}\n\`\`\``

describe('leerRespuestaDelBanco · lo que no se lee es «no_dicha», nunca una decisión inventada', () => {
  it('🔴 lee los cuatro valores del contrato desde el ÚLTIMO bloque JSON', () => {
    expect(leerRespuestaDelBanco(bloque({ respuesta: 'tomada', accion: 'editar', cambios: { mensaje: 'nuevo' }, explicacion: null }))).toEqual({ respuesta: 'tomada', explicacion: null, accion: 'editar', cambios: { mensaje: 'nuevo' } })
    expect(leerRespuestaDelBanco(bloque({ respuesta: 'tomada', accion: 'retirar' }))).toEqual({ respuesta: 'tomada', explicacion: null, accion: 'retirar' })
    expect(leerRespuestaDelBanco(bloque({ respuesta: 'tomada_en_parte', accion: 'editar', cambios: { gancho: 'g' }, explicacion: 'solo el gancho' }))).toMatchObject({ respuesta: 'tomada_en_parte', explicacion: 'solo el gancho' })
    expect(leerRespuestaDelBanco(bloque({ respuesta: 'no_tomada', explicacion: 'la idea no nombra Olón' }))).toEqual({ respuesta: 'no_tomada', explicacion: 'la idea no nombra Olón' })
    expect(leerRespuestaDelBanco(`${bloque({ respuesta: 'no_tomada', explicacion: 'primero' })}\nlo pensé mejor\n${bloque({ respuesta: 'tomada', accion: 'retirar' })}`)).toMatchObject({ respuesta: 'tomada', accion: 'retirar' })
    expect(leerRespuestaDelBanco('pensé.\n{"respuesta":"no_tomada","explicacion":"suelto"}')).toEqual({ respuesta: 'no_tomada', explicacion: 'suelto' })
  })
  it('🔴 sin JSON, con valores desconocidos o sin la explicación obligatoria → «no_dicha» con motivo', () => {
    for (const s of ['', 'tomo la corrección', bloque({ respuesta: 'si' }), bloque({ respuesta: 'tomada', accion: 'borrar' }), bloque({ respuesta: 'no_tomada' }), bloque({ respuesta: 'tomada_en_parte', accion: 'editar', cambios: { mensaje: 'x' } }), bloque({ respuesta: 'tomada', accion: 'editar' }), '```json\n{roto\n```']) {
      const r = leerRespuestaDelBanco(s)
      expect(r.respuesta, s).toBe('no_dicha')
      expect((r as { motivo?: string }).motivo, s).toBeTruthy()
    }
  })
})

describe('verificarRespuestaDelBanco · el código decide si se escribe', () => {
  const I = idea('C1-I23')
  it('🔴 la idea cambió desde que se armó la corrección → «no_tomada» con «la idea ya cambió; corrección vieja» (no pisa una edición más nueva)', () => {
    expect(verificarRespuestaDelBanco(CORR({ idea_sello: 'otra línea' }), I, { respuesta: 'tomada', explicacion: null, accion: 'editar', cambios: { mensaje: 'x' } })).toEqual({ respuesta: 'no_tomada', explicacion: IDEA_CAMBIADA })
  })
  it('🔴 la idea ya no está en el banco → «no_tomada», sin escribir', () => {
    expect(verificarRespuestaDelBanco(CORR(), null, { respuesta: 'tomada', explicacion: null, accion: 'retirar' })).toEqual({ respuesta: 'no_tomada', explicacion: IDEA_FUERA_DEL_BANCO })
  })
  it('🔴 regla dura (D1/D2): «no_tomada» no vale → «no_dicha» con el motivo (se toma sí o sí); sin regla dura, «no_tomada» queda', () => {
    const no = { respuesta: 'no_tomada' as const, explicacion: 'no aplica' }
    for (const regla of ['D1', 'D2', 'd1 ']) expect(verificarRespuestaDelBanco(CORR({ regla }), I, no)).toMatchObject({ respuesta: 'no_dicha', motivo: expect.stringContaining('regla dura') })
    expect(verificarRespuestaDelBanco(CORR({ regla: '3' }), I, no)).toEqual(no)
    expect(verificarRespuestaDelBanco(CORR(), I, no)).toEqual(no)
  })
  it('🔴 los cambios pasan por las MISMAS reglas del tablero: solo campos editables, no vacíos, sin «·» que cambie la lectura, y al menos uno distinto', () => {
    const ed = (cambios: Record<string, string>) => verificarRespuestaDelBanco(CORR(), I, { respuesta: 'tomada', explicacion: null, accion: 'editar', cambios })
    expect(ed({ red: 'tiktok' }).respuesta).toBe('no_dicha')
    expect(ed({ mensaje: '   ' }).respuesta).toBe('no_dicha')
    expect(ed({ mensaje: I.mensaje }).respuesta).toBe('no_dicha')
    expect(ed({ mensaje: 'el ceviche de siempre' })).toEqual({ respuesta: 'tomada', explicacion: null, accion: 'editar', cambios: { mensaje: 'el ceviche de siempre' } })
  })
})

describe('aplicarCorreccionDelBanco · escribe con el núcleo del tablero', () => {
  it('🔴 «tomada · editar»: la idea cambia en el banco y en el texto, con historial a nombre de la mesa y su corrección', async () => {
    const al = almacen()
    const r = await aplicarCorreccionDelBanco(al, CORR(), { respuesta: 'tomada', explicacion: 'cambio el mensaje', accion: 'editar', cambios: { mensaje: 'el encebollado de siempre, en Guayaquil' } }, AHORA)
    expect(r.respuesta).toMatchObject({ respuesta: 'tomada', accion: 'editar' })
    expect(r.version).toBe(4)
    expect(bancoDe(al).find((i) => i.id === 'C1-I23')!.mensaje).toBe('el encebollado de siempre, en Guayaquil')
    expect(v4(al).texto_md).toContain('el encebollado de siempre, en Guayaquil')
    const h = historialDe(al).at(-1)!
    expect(h).toMatchObject({ accion: 'editar', idea_id: 'C1-I23', quien: quienCorrige('corr-1'), cuando: AHORA })
  })
  it('🔴 «tomada · retirar»: la idea sale del banco y las filas sin brief se reasignan (las con brief conservan su idea, como en el tablero)', async () => {
    const al = almacen()
    const r = await aplicarCorreccionDelBanco(al, CORR({ idea_id: 'C1-I07', idea_sello: idea('C1-I07').linea }), { respuesta: 'tomada', explicacion: null, accion: 'retirar' }, AHORA)
    expect(r.respuesta).toMatchObject({ respuesta: 'tomada', accion: 'retirar' })
    expect(bancoDe(al).some((i) => i.id === 'C1-I07')).toBe(false)
    expect(r.reasignadas.map((x) => x.fila_id)).toEqual(['s1-d4-jue_anuncio_fb'])
    expect(filaDe(al, 's1-d4-jue_anuncio_fb').idea_ref).not.toBe('C1-I07')
    expect((r.respuesta as { reasignadas?: unknown[] }).reasignadas).toEqual(r.reasignadas)
  })
  it('🔴 «no_tomada», «no_dicha», idea cambiada o regla dura rechazada: NADA se escribe', async () => {
    for (const [c, resp] of [
      [CORR(), { respuesta: 'no_tomada', explicacion: 'no aplica' }],
      [CORR(), { respuesta: 'no_dicha', motivo: 'x' }],
      [CORR({ idea_sello: 'vieja' }), { respuesta: 'tomada', explicacion: null, accion: 'retirar' }],
      [CORR({ regla: 'D1' }), { respuesta: 'no_tomada', explicacion: 'no' }],
    ] as Array<[CorreccionAlBanco, RespuestaDelBanco]>) {
      const al = almacen()
      const antes = JSON.stringify(v4(al))
      const r = await aplicarCorreccionDelBanco(al, c, resp, AHORA)
      expect(r.idea).toBeNull()
      expect(JSON.stringify(v4(al))).toBe(antes)
    }
  })
  it('🔴 la misma corrección aplicada dos veces no edita dos veces: la segunda ve la idea cambiada y responde «corrección vieja»', async () => {
    const al = almacen()
    const resp: RespuestaDelBanco = { respuesta: 'tomada', explicacion: null, accion: 'editar', cambios: { mensaje: 'nuevo mensaje' } }
    await aplicarCorreccionDelBanco(al, CORR(), resp, AHORA)
    const n = historialDe(al).length
    const r2 = await aplicarCorreccionDelBanco(al, CORR(), resp, AHORA)
    expect(r2.respuesta).toEqual({ respuesta: 'no_tomada', explicacion: IDEA_CAMBIADA })
    expect(historialDe(al)).toHaveLength(n)
  })
  it('🔴 sin gran idea aprobada: «no_tomada», sin escribir', async () => {
    const al = almacen()
    for (const c of al.conceptos) c.aprobacion = 'cambios'
    expect((await aplicarCorreccionDelBanco(al, CORR(), { respuesta: 'tomada', explicacion: null, accion: 'retirar' }, AHORA)).respuesta).toEqual({ respuesta: 'no_tomada', explicacion: IDEA_FUERA_DEL_BANCO })
  })
})

describe('la puerta del tablero queda igual', () => {
  it('🔴 un flujo de la cadena sigue sin poder editar el banco por la acción del tablero (403): la única otra puerta es el puerto de correcciones', async () => {
    const al = almacen()
    const r = await bancoEditar(al, { ...tablero(), workflow_id: 'wf-cadena', cambios: [{ idea_id: 'C1-I23', campos: { mensaje: 'x' } }] }, AHORA)
    expect(r.status).toBe(403)
    const q = await bancoRetirar(al, { ...tablero({ idea_id: 'C1-I07' }), workflow_id: 'wf-cadena' }, AHORA)
    expect(q.status).toBe(403)
  })
})

describe('carrera con el tablero (condición 4 de CC6): la escritura condicional al sello pierde y nunca pisa', () => {
  /** el tablero edita la idea JUSTO cuando el puerto va a escribir: la primera escritura del puerto falla por sello y su reintento relee */
  function conTableroEnMedio(al: AlmacenMemoria, campos: Record<string, string>, idea_id = 'C1-I23') {
    const original = al.actualizarConceptoSiSello.bind(al)
    let ya = false
    al.actualizarConceptoSiSello = async (...a: Parameters<AlmacenMemoria['actualizarConceptoSiSello']>) => {
      if (!ya) { ya = true; await bancoEditar(al, { ...tablero(), cambios: [{ idea_id, campos }] }, AHORA) }
      return original(...a)
    }
  }
  it('🔴 editar: el tablero cambió el mensaje en medio → «no_tomada · la idea ya cambió», y queda la edición del tablero', async () => {
    const al = almacen()
    conTableroEnMedio(al, { mensaje: 'lo escribió Emilio' })
    const r = await aplicarCorreccionDelBanco(al, CORR(), { respuesta: 'tomada', explicacion: null, accion: 'editar', cambios: { gancho: 'gancho de la mesa' } }, AHORA)
    expect(r.respuesta).toEqual({ respuesta: 'no_tomada', explicacion: IDEA_CAMBIADA })
    const i = bancoDe(al).find((x) => x.id === 'C1-I23')!
    expect(i.mensaje).toBe('lo escribió Emilio')
    expect(i.gancho).toBe(idea('C1-I23').gancho)
    expect(historialDe(al).filter((h) => h.quien === quienCorrige('corr-1'))).toHaveLength(0)
  })
  it('🔴 retirar: el tablero cambió la idea en medio → «no_tomada», la idea sigue en el banco', async () => {
    const al = almacen()
    conTableroEnMedio(al, { mensaje: 'lo escribió Emilio' }, 'C1-I07')
    const r = await aplicarCorreccionDelBanco(al, CORR({ idea_id: 'C1-I07', idea_sello: idea('C1-I07').linea }), { respuesta: 'tomada', explicacion: null, accion: 'retirar' }, AHORA)
    expect(r.respuesta).toEqual({ respuesta: 'no_tomada', explicacion: IDEA_CAMBIADA })
    expect(bancoDe(al).find((x) => x.id === 'C1-I07')!.mensaje).toBe('lo escribió Emilio')
  })
  it('🔴 tablero y puerto a la vez sobre la misma idea: gane quien gane, nada se pisa (la edición del tablero queda y el puerto escribe solo sobre la idea que esperaba)', async () => {
    const al = almacen()
    const [t, p] = await Promise.all([
      bancoEditar(al, { ...tablero(), cambios: [{ idea_id: 'C1-I23', campos: { mensaje: 'lo escribió Emilio' } }] }, AHORA),
      aplicarCorreccionDelBanco(al, CORR(), { respuesta: 'tomada', explicacion: null, accion: 'editar', cambios: { gancho: 'gancho de la mesa' } }, AHORA),
    ])
    expect(t.status).toBe(200)
    const i = bancoDe(al).find((x) => x.id === 'C1-I23')!
    expect(i.mensaje).toBe('lo escribió Emilio')
    const delPuerto = historialDe(al).filter((h) => h.quien === quienCorrige('corr-1'))
    if (p.respuesta.respuesta === 'tomada') {
      expect(delPuerto).toHaveLength(1)
      expect((delPuerto[0].antes as Record<string, unknown>).linea).toBe(idea('C1-I23').linea)
      expect(i.gancho).toBe('gancho de la mesa')
    } else {
      expect(p.respuesta).toEqual({ respuesta: 'no_tomada', explicacion: IDEA_CAMBIADA })
      expect(delPuerto).toHaveLength(0)
    }
  })
})

describe('solo la idea corregida (condición 3 de CC6)', () => {
  it('🔴 una respuesta de la mesa que nombra otra idea no la toca: se escribe solo `idea_id` de la corrección', async () => {
    const al = almacen()
    const otra = idea('C1-I24')
    const leida = leerRespuestaDelBanco(bloque({ respuesta: 'tomada', accion: 'editar', idea_id: 'C1-I24', cambios: { mensaje: 'cambio pedido' } }))
    const r = await aplicarCorreccionDelBanco(al, CORR(), leida, AHORA)
    expect(r.respuesta.respuesta).toBe('tomada')
    expect(bancoDe(al).find((x) => x.id === 'C1-I24')).toEqual(otra)
    expect(bancoDe(al).find((x) => x.id === 'C1-I23')!.mensaje).toBe('cambio pedido')
    expect(historialDe(al).map((h) => h.idea_id)).toEqual(['C1-I23'])
  })
  it('🔴 retirar reasigna solo a ideas vivas del mismo banco (las elige el código, no la mesa)', async () => {
    const al = almacen()
    const leida = leerRespuestaDelBanco(bloque({ respuesta: 'tomada', accion: 'retirar', reasignadas: [{ fila_id: 's1-d4-jue_anuncio_fb', idea_nueva: 'C9-I99' }] }))
    const r = await aplicarCorreccionDelBanco(al, CORR({ idea_id: 'C1-I07', idea_sello: idea('C1-I07').linea }), leida, AHORA)
    const vivas = new Set(bancoDe(al).map((x) => x.id))
    for (const x of r.reasignadas) expect(x.idea_nueva === null || vivas.has(x.idea_nueva)).toBe(true)
    expect(filaDe(al, 's1-d4-jue_anuncio_fb').idea_ref).not.toBe('C9-I99')
  })
})

describe('el núcleo con línea esperada (solo el puerto la pasa)', () => {
  it('🔴 retirar con una línea esperada vieja: 409 E-IDEA-CAMBIADA ANTES de mover filas', async () => {
    const al = almacen()
    const r = await retirarDelBanco(al, { campana_id: CAMP, version: 4, autor: quienCorrige('corr-1') }, 'C1-I07', AHORA, 'línea vieja')
    expect(r.status).toBe(409)
    expect(r.cuerpo.code).toBe('E-IDEA-CAMBIADA')
    expect(filaDe(al, 's1-d4-jue_anuncio_fb').idea_ref).toBe('C1-I07')
    expect(bancoDe(al).some((x) => x.id === 'C1-I07')).toBe(true)
  })
  it('🔴 editar con una línea esperada vieja: 409 E-IDEA-CAMBIADA sin escribir; sin línea esperada (el tablero) escribe como siempre', async () => {
    const al = almacen()
    const ctx = { campana_id: CAMP, version: 4, autor: 'x' }
    const r = await editarEnElBanco(al, ctx, [{ idea_id: 'C1-I23', campos: { mensaje: 'm' } }], AHORA, { 'C1-I23': 'línea vieja' })
    expect(r.cuerpo.code).toBe('E-IDEA-CAMBIADA')
    expect(bancoDe(al).find((x) => x.id === 'C1-I23')!.mensaje).toBe(idea('C1-I23').mensaje)
    expect((await editarEnElBanco(al, ctx, [{ idea_id: 'C1-I23', campos: { mensaje: 'm' } }], AHORA)).status).toBe(200)
  })
})
