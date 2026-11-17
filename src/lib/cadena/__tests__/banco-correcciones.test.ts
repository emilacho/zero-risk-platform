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
import { puertoDeLaCadena } from '../mesas'
import { abrirCorreccionDelBanco, correccionDelBanco, INTERRUPTOR_DEL_BANCO, MESA_APAGADA, PLAZO_DE_LA_MESA_DEL_BANCO_MIN, PREFIJO_DE_LA_CORRECCION, PREFIJO_DEL_ENCARGO, recibirCorreccionDelBanco, SIN_ESCRITURA_CONDICIONAL, TOPE_DE_LA_CORRECCION_USD, versionDeLaMesa } from '../banco-correcciones'
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
    for (const regla of ['D1', 'D2', 'D3', 'd1 ', 'd3']) expect(verificarRespuestaDelBanco(CORR({ regla }), I, no)).toMatchObject({ respuesta: 'no_dicha', motivo: expect.stringContaining('regla dura') })
    for (const regla of ['3', 'D4', 'D', 'criterio']) expect(verificarRespuestaDelBanco(CORR({ regla }), I, no)).toEqual(no)
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

// ───────────────────────────────────────────────────────── E2 · el tic del receptor y la vuelta de la mesa (US$ 0: la mesa es un doble)
describe('E2 · la mesa «corrección del banco» desde la cadena', () => {
  const T0 = '2026-11-17T21:00:00Z'
  const V1 = versionDeLaMesa('corr-1', 1)
  const V2 = versionDeLaMesa('corr-1', 2)
  const clavesDelBanco = (al: AlmacenMemoria) => [...al.config.keys()].filter((k) => k.startsWith(PREFIJO_DE_LA_CORRECCION) || k.startsWith(PREFIJO_DEL_ENCARGO))
  const mas = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString()
  function encendido(o: { abre?: 'si' | 'no' } = {}) {
    const al = almacen()
    al.config.set(INTERRUPTOR_DEL_BANCO, true)
    let n = 0
    al.mesaDelBanco = async () => (o.abre === 'no' ? { estado: 'no_abre', motivo: 'plantilla_inactiva' } : { estado: 'abierta', encargo_id: `enc-${++n}` })
    return al
  }
  const entrega = (al: AlmacenMemoria, texto: string | null, costo = 0.6) => {
    const s = al.sobresDelBanco.at(-1)!
    return recibirCorreccionDelBanco(al, { campana_id: s.campana_id, version: s.version, encargo_id: `enc-${al.sobresDelBanco.length}`, texto, costo_usd: costo, motivo: null }, mas(5))
  }
  const editar = bloque({ respuesta: 'tomada', accion: 'editar', cambios: { mensaje: 'el encebollado de siempre' }, explicacion: 'quito la fecha' })
  const noLaTomo = bloque({ respuesta: 'no_tomada', explicacion: 'la idea no promete la oferta' })

  it('🔴 condición 6 · APAGADA (interruptor ausente o distinto de true): «no_dicha · mesa apagada» al instante, sin abrir mesa ni escribir la libreta', async () => {
    for (const v of [undefined, false, 'true', 1]) {
      const al = almacen()
      if (v !== undefined) al.config.set(INTERRUPTOR_DEL_BANCO, v)
      al.mesaDelBanco = async () => ({ estado: 'abierta', encargo_id: 'x' })
      const r = await abrirCorreccionDelBanco(al, CORR(), T0)
      expect(r).toEqual({ estado: 'respondida', resultado: { respuesta: { respuesta: 'no_dicha', motivo: MESA_APAGADA }, version: null, idea: null, reasignadas: [], con_brief_sin_tocar: [] } })
      expect(al.sobresDelBanco).toHaveLength(0)
      expect(clavesDelBanco(al)).toEqual([])
    }
  })
  it('🔴 abre UNA mesa con tope US$ 1,50 y un marco con la idea, la corrección y las hermanas (sin el cerebro); un tic en plazo no abre otra', async () => {
    const al = encendido()
    expect(await abrirCorreccionDelBanco(al, CORR({ regla: 'D1' }), T0)).toEqual({ estado: 'en_curso', encargo_id: 'enc-1', intentos: 1 })
    const s = al.sobresDelBanco[0]
    expect(s).toMatchObject({ tipo_de_mesa: 'banco', client_id: A.clientId, campana_id: CAMP, version: V1, dry_run: false, tope_usd: TOPE_DE_LA_CORRECCION_USD, condiciones: [] })
    expect(s.marco_texto).toContain(idea('C1-I23').linea)
    expect(s.marco_texto).toContain(CORR().motivo)
    expect(s.marco_texto).toContain(CORR().linea_de_la_ficha!)
    expect(s.marco_texto).toContain('Regla dura D1: se toma sí o sí')
    expect(s.marco_texto).toContain('## Cómo responder')
    expect(s.marco_texto).not.toMatch(/cerebro|client_brain|chunk/i)
    const hermana = BANCO_NAUFRAGO_V4.find((i) => i.id !== 'C1-I23' && i.capitulo === idea('C1-I23').capitulo)!
    expect(s.marco_texto).toContain(hermana.linea.slice(0, 60))
    expect(await abrirCorreccionDelBanco(al, CORR(), mas(10))).toMatchObject({ estado: 'en_curso', encargo_id: 'enc-1' })
    expect(al.sobresDelBanco).toHaveLength(1)
  })
  it('🔴 la entrega de la mesa VIGENTE escribe el banco; el tic siguiente devuelve la respuesta final; repetir la entrega no escribe dos veces', async () => {
    const al = encendido()
    await abrirCorreccionDelBanco(al, CORR(), T0)
    expect(await entrega(al, editar)).toEqual({ ok: true, estado: 'respondida' })
    expect(bancoDe(al).find((i) => i.id === 'C1-I23')!.mensaje).toBe('el encebollado de siempre')
    const r = await abrirCorreccionDelBanco(al, CORR(), mas(6))
    expect(r).toMatchObject({ estado: 'respondida', resultado: { respuesta: { respuesta: 'tomada', accion: 'editar' }, version: 4 } })
    const n = historialDe(al).length
    expect(await entrega(al, editar)).toEqual({ ok: true, ya_cerrada: true })
    expect(historialDe(al)).toHaveLength(n)
    expect(al.sobresDelBanco).toHaveLength(1)
  })
  it('🔴 condición 2 · una entrega que NO es de la mesa de esta corrección (otro encargo, otra versión u otra campaña) no escribe nada', async () => {
    const al = encendido()
    await abrirCorreccionDelBanco(al, CORR(), T0)
    const antes = JSON.stringify(v4(al))
    for (const p of [{ encargo_id: 'enc-otro', version: V1, campana_id: CAMP }, { encargo_id: 'enc-1', version: V1 + 1, campana_id: CAMP }, { encargo_id: 'enc-1', version: V1, campana_id: '00000000-0000-4000-8000-000000000000' }]) {
      expect(await recibirCorreccionDelBanco(al, { ...p, texto: editar, costo_usd: 0.5, motivo: null }, mas(5))).toEqual({ ok: true, ya_cerrada: true })
    }
    expect(JSON.stringify(v4(al))).toBe(antes)
  })
  it('🔴 condición 5 · regla dura: «no la tomo» pide UN reintento con lo que queda del tope y el motivo en el marco; si insiste, queda «no_dicha» y el banco no se toca', async () => {
    const al = encendido()
    const c = CORR({ regla: 'D1' })
    await abrirCorreccionDelBanco(al, c, T0)
    expect(await entrega(al, noLaTomo, 0.6)).toEqual({ ok: true, estado: 'reintento' })
    expect(await abrirCorreccionDelBanco(al, c, mas(6))).toMatchObject({ estado: 'en_curso', encargo_id: 'enc-2', intentos: 2 })
    const s2 = al.sobresDelBanco[1]
    expect(s2).toMatchObject({ version: V2, tope_usd: 0.9 })
    expect(s2.marco_texto).toContain('## Tu respuesta anterior no valió')
    expect(s2.marco_texto).toContain('regla dura D1')
    const antes = JSON.stringify(v4(al))
    expect(await entrega(al, noLaTomo, 0.6)).toEqual({ ok: true, estado: 'respondida' })
    const r = await abrirCorreccionDelBanco(al, c, mas(12))
    expect(r).toMatchObject({ estado: 'respondida', resultado: { respuesta: { respuesta: 'no_dicha', motivo: expect.stringContaining('regla dura D1') }, idea: null } })
    expect(JSON.stringify(v4(al))).toBe(antes)
    expect(al.sobresDelBanco).toHaveLength(2)
    expect((await correccionDelBanco(al, 'corr-1'))!.gasto_usd).toBe(1.2)
  })
  it('🔴 sin regla dura, «no_tomada» es la respuesta final al primer intento (no gasta un reintento)', async () => {
    const al = encendido()
    await abrirCorreccionDelBanco(al, CORR(), T0)
    expect(await entrega(al, noLaTomo)).toEqual({ ok: true, estado: 'respondida' })
    expect(await abrirCorreccionDelBanco(al, CORR(), mas(6))).toMatchObject({ estado: 'respondida', resultado: { respuesta: { respuesta: 'no_tomada', explicacion: 'la idea no promete la oferta' } } })
    expect(al.sobresDelBanco).toHaveLength(1)
  })
  it('🔴 una respuesta ilegible, una entrega sin texto o una mesa que vence piden reintento; tras 2 intentos, «no_dicha» con el motivo', async () => {
    const al = encendido()
    await abrirCorreccionDelBanco(al, CORR(), T0)
    expect(await entrega(al, 'tomo la corrección, gracias')).toEqual({ ok: true, estado: 'reintento' })
    await abrirCorreccionDelBanco(al, CORR(), mas(6))
    // la segunda mesa no entrega nunca: al pasar el plazo, el tic la da por perdida y cierra
    const r = await abrirCorreccionDelBanco(al, CORR(), mas(6 + PLAZO_DE_LA_MESA_DEL_BANCO_MIN + 1))
    expect(r).toMatchObject({ estado: 'respondida', resultado: { respuesta: { respuesta: 'no_dicha', motivo: expect.stringContaining('no devolvió la respuesta a tiempo') } } })
    expect(al.sobresDelBanco).toHaveLength(2)
    const al2 = encendido()
    await abrirCorreccionDelBanco(al2, CORR(), T0)
    expect(await entrega(al2, null)).toEqual({ ok: true, estado: 'reintento' })
    expect((await correccionDelBanco(al2, 'corr-1'))!.motivo).toBe('la mesa no entregó texto')
  })
  it('🔴 condición 6 · el reintento va DENTRO del mismo tope: si el primer intento ya lo gastó, no se abre otra mesa', async () => {
    const al = encendido()
    await abrirCorreccionDelBanco(al, CORR({ regla: 'D2' }), T0)
    expect(await entrega(al, noLaTomo, 1.6)).toEqual({ ok: true, estado: 'respondida' })
    expect(await abrirCorreccionDelBanco(al, CORR({ regla: 'D2' }), mas(6))).toMatchObject({ estado: 'respondida', resultado: { respuesta: { respuesta: 'no_dicha' } } })
    expect(al.sobresDelBanco).toHaveLength(1)
  })
  it('🔴 lo que se decide GRATIS no abre mesa: idea cambiada, idea fuera del banco, corrección ilegible, campaña inexistente', async () => {
    const al = encendido()
    expect(await abrirCorreccionDelBanco(al, CORR({ idea_sello: 'otra' }), T0)).toMatchObject({ estado: 'respondida', resultado: { respuesta: { respuesta: 'no_tomada', explicacion: IDEA_CAMBIADA } } })
    expect(await abrirCorreccionDelBanco(al, CORR({ correccion_id: 'c2', idea_id: 'C9-I99' }), T0)).toMatchObject({ estado: 'respondida', resultado: { respuesta: { respuesta: 'no_tomada', explicacion: IDEA_FUERA_DEL_BANCO } } })
    expect(await abrirCorreccionDelBanco(al, { ...CORR({ correccion_id: 'c3' }), motivo: '' }, T0)).toMatchObject({ estado: 'respondida', resultado: { respuesta: { respuesta: 'no_dicha' } } })
    expect(await abrirCorreccionDelBanco(al, CORR({ correccion_id: 'c4', campana_id: '00000000-0000-4000-8000-000000000000' }), T0)).toMatchObject({ estado: 'respondida', resultado: { respuesta: { respuesta: 'no_tomada' } } })
    expect(al.sobresDelBanco).toHaveLength(0)
  })
  it('🔴 la mesa que no abre (plantilla apagada) cuenta como intento: al segundo, «no_dicha» con el motivo; nunca queda en curso para siempre', async () => {
    const al = encendido({ abre: 'no' })
    expect(await abrirCorreccionDelBanco(al, CORR(), T0)).toMatchObject({ estado: 'en_curso', encargo_id: null, intentos: 1 })
    expect(await abrirCorreccionDelBanco(al, CORR(), mas(1))).toMatchObject({ estado: 'en_curso', intentos: 2 })
    expect(await abrirCorreccionDelBanco(al, CORR(), mas(2))).toMatchObject({ estado: 'respondida', resultado: { respuesta: { respuesta: 'no_dicha', motivo: expect.stringContaining('plantilla_inactiva') } } })
  })
  it('🔴 si se escribió el banco pero se perdió la libreta, el tic reconoce SU escritura en el historial (no la lee como «corrección vieja»)', async () => {
    const al = encendido()
    await abrirCorreccionDelBanco(al, CORR(), T0)
    await entrega(al, editar)
    al.config.delete(PREFIJO_DE_LA_CORRECCION + 'corr-1')
    expect(await abrirCorreccionDelBanco(al, CORR(), mas(6))).toMatchObject({ estado: 'respondida', resultado: { respuesta: { respuesta: 'tomada', accion: 'editar', cambios: { mensaje: 'el encebollado de siempre' } } } })
    expect(al.sobresDelBanco).toHaveLength(1)
  })
  it('🔴 la corrección GUARDADA manda: un tic posterior con otra idea para el mismo id no cambia lo que se corrige', async () => {
    const al = encendido()
    await abrirCorreccionDelBanco(al, CORR(), T0)
    await entrega(al, 'ilegible')
    await abrirCorreccionDelBanco(al, CORR({ idea_id: 'C1-I07', idea_sello: idea('C1-I07').linea }), mas(6))
    expect(al.sobresDelBanco[1].marco_texto).toContain(idea('C1-I23').linea)
    expect((await correccionDelBanco(al, 'corr-1'))!.correccion.idea_id).toBe('C1-I23')
  })
  it('🔴 observación de CC6 · dos tics de la MISMA corrección a la vez: la escritura condicional deja abrir UNA sola mesa', async () => {
    const al = encendido()
    const [a, b] = await Promise.all([abrirCorreccionDelBanco(al, CORR(), T0), abrirCorreccionDelBanco(al, CORR(), T0)])
    expect(al.sobresDelBanco).toHaveLength(1)
    expect([a.estado, b.estado]).toEqual(['en_curso', 'en_curso'])
    expect((await correccionDelBanco(al, 'corr-1'))).toMatchObject({ estado: 'abierta', intentos: 1, encargo_id: 'enc-1' })
  })
  it('🔴 observación de CC6 · dos correcciones de la misma campaña a la vez: cada una en su clave, con su versión; ninguna pisa a la otra', async () => {
    const al = encendido()
    const c2 = CORR({ correccion_id: 'corr-2', idea_id: 'C1-I07', idea_sello: idea('C1-I07').linea })
    await Promise.all([abrirCorreccionDelBanco(al, CORR(), T0), abrirCorreccionDelBanco(al, c2, T0)])
    expect(al.sobresDelBanco).toHaveLength(2)
    expect(new Set(al.sobresDelBanco.map((s) => s.version)).size).toBe(2)
    const [e1, e2] = [await correccionDelBanco(al, 'corr-1'), await correccionDelBanco(al, 'corr-2')]
    expect([e1!.estado, e2!.estado]).toEqual(['abierta', 'abierta'])
    expect(e1!.encargo_id).not.toBe(e2!.encargo_id)
    expect(al.config.get(PREFIJO_DEL_ENCARGO + e1!.encargo_id)).toBe('corr-1')
    expect(al.config.get(PREFIJO_DEL_ENCARGO + e2!.encargo_id)).toBe('corr-2')
  })
  it('🔴 observación de CC6 · la misma entrega dos veces a la vez: el banco se escribe UNA vez; una responde, la otra «ya_cerrada»', async () => {
    const al = encendido()
    await abrirCorreccionDelBanco(al, CORR(), T0)
    const n = (historialDe(al) ?? []).length
    const rs = await Promise.all([entrega(al, editar), entrega(al, editar)])
    expect(rs.filter((r) => 'estado' in r && r.estado === 'respondida')).toHaveLength(1)
    expect(rs.filter((r) => 'ya_cerrada' in r && r.ya_cerrada)).toHaveLength(1)
    expect(historialDe(al)).toHaveLength(n + 1)
  })
  it('🔴 observación de CC6 · el tope es ESTRICTO: una mesa que vence (costo desconocido) no se reintenta; un reintento solo abre con lo que queda y si alcanza para un turno', async () => {
    const al = encendido()
    await abrirCorreccionDelBanco(al, CORR(), T0)
    const r = await abrirCorreccionDelBanco(al, CORR(), mas(PLAZO_DE_LA_MESA_DEL_BANCO_MIN + 1))
    expect(r).toMatchObject({ estado: 'respondida', resultado: { respuesta: { respuesta: 'no_dicha', motivo: expect.stringContaining('no se reintenta') } } })
    expect(al.sobresDelBanco).toHaveLength(1)
    const al2 = encendido()
    await abrirCorreccionDelBanco(al2, CORR({ regla: 'D1' }), T0)
    expect(await entrega(al2, noLaTomo, 1.35)).toEqual({ ok: true, estado: 'respondida' })
    expect(al2.sobresDelBanco).toHaveLength(1)
  })
  it('🔴 una entrega de OTRO encargo con la misma versión no aplica aunque el índice la lleve a esta corrección', async () => {
    const al = encendido()
    await abrirCorreccionDelBanco(al, CORR(), T0)
    await al.escribirConfig(PREFIJO_DEL_ENCARGO + 'enc-otro', 'corr-1')
    const n = (historialDe(al) ?? []).length
    expect(await recibirCorreccionDelBanco(al, { campana_id: CAMP, version: V1, encargo_id: 'enc-otro', texto: editar, costo_usd: 0.3, motivo: null }, T0)).toEqual({ ok: true, ya_cerrada: true })
    expect((historialDe(al) ?? []).length).toBe(n)
    expect(await correccionDelBanco(al, 'corr-1')).toMatchObject({ estado: 'abierta', encargo_id: 'enc-1' })
  })
  it('🔴 un almacén SIN escritura condicional no abre la mesa: «no_dicha» y nada escrito', async () => {
    const al = encendido()
    ;(al as unknown as Record<string, unknown>).escribirConfigSiSello = undefined
    expect(await abrirCorreccionDelBanco(al, CORR(), T0)).toMatchObject({ estado: 'respondida', resultado: { respuesta: { respuesta: 'no_dicha', motivo: SIN_ESCRITURA_CONDICIONAL } } })
    expect(al.sobresDelBanco).toHaveLength(0)
    expect(clavesDelBanco(al)).toEqual([])
  })
  it('el puerto de la oficina lleva la entrega del banco a la cadena', async () => {
    const al = encendido()
    await abrirCorreccionDelBanco(al, CORR(), T0)
    const p = puertoDeLaCadena(al, () => mas(5))
    expect(await p.entregarBanco({ campana_id: CAMP, version: V1, encargo_id: 'enc-1', texto: editar, costo_usd: 0.5, motivo: null })).toEqual({ ok: true, estado: 'respondida' })
  })
})
