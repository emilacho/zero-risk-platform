/**
 * FORMATOS SIN FAMILIA (GO Lenovo 2026-11-11 00:08Z · punto b · CC3) · sin base, sin red, sin modelo (US$ 0).
 * Caso real (CC7, W46 de Náufrago): la parte por filas murió entera en «④ Chequeos» (`PARTE_HOJA_SIN_FAMILIA`) por 4 filas de `anuncio_imagen` (ig/fb) sin familia en
 * `cadena_formatos_por_red`. Regla nueva: esas filas salen del lote con la razón escrita, se avisa UNA vez por el buzón y el resto del lote sigue.
 * La tabla de formatos de la prueba es la REAL: la siembra de `202610090200_cadena_tablas.sql` con las familias que ponen `202610110100` y `202610312011`
 * (las mismas reglas de sus UPDATE), así que los formatos sin familia son exactamente los de producción: anuncio_imagen/anuncio_carrusel (ig/fb), texto (linkedin) y video (youtube).
 * Dos clientes de rubros distintos: Náufrago (restaurante · campaña real) y Zero Risk Seguridad Industrial (B2B · campaña construida).
 */
import { describe, expect, it } from 'vitest'
import { buildIdempotencyKey } from '@/lib/sala-event-log/idempotency'
import { filasLotes } from '../datos'
import { claveDelAviso, enviosDesdeElRegistro, HORAS_PARA_DARLO_POR_MUERTO, llavesDelRegistro, OPERACION_DE_ENTRADA, baseDelLote } from '../lote-muerto'
import { claveDelAvisoSinFamilia, esNotaSinFamilia, filaSinFamilia, notaSinFamilia } from '../sin-familia'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe, formatosDeLaMigracion } from '../__fixtures__/clientes'
import type { Almacen, Campana, EstrategiaGuardada } from '../almacen'
import { briefAbrir, conceptoAbrir, conceptoDecidir, hojaEscribir, recibirBrief, recibirConcepto } from '../mesas'
import type { Fila, FormatosPorRed } from '../tipos'

/** la tabla de producción: la siembra + los UPDATE de familia de las dos migraciones (mismas reglas) */
function formatosReales(): FormatosPorRed {
  const t = formatosDeLaMigracion()
  for (const [red, xs] of Object.entries(t)) for (const x of xs) {
    if (x.formato === 'foto') x.familia = 'post_img'
    else if (x.formato === 'carrusel') x.familia = 'carrusel_ig_v1'
    else if (x.formato === 'historia' || x.formato === 'estado') x.familia = 'kit_historias'
    else if (x.produccion === 'espera_brazo' && ['reel', 'video', 'short'].includes(x.formato) && !(red === 'youtube' && x.formato === 'video')) x.familia = 'video_mesa'
  }
  return t
}
/** la misma tabla ANTES de la columna familia (la que usan las pruebas viejas): nada se juzga */
const formatosSinColumna = (): FormatosPorRed => formatosDeLaMigracion()
/** la regla exacta de la guarda «④ Chequeos» del flujo de la parte (`construir-parte.mjs` · ATAJO_DE_LA_HOJA) */
const guardaDeLaParte = (avisos: string[]): string[] => avisos.filter((a) => /sin familia/.test(a))

// ───────────────────────────────────────────────────────── la regla (pura)
describe('qué fila es «sin familia» (contra la tabla real)', () => {
  const T = formatosReales()
  it.each([
    ['instagram', 'anuncio_imagen', true], ['facebook', 'anuncio_imagen', true], ['instagram', 'anuncio_carrusel', true], ['facebook', 'anuncio_carrusel', true],
    ['linkedin', 'texto', true], ['youtube', 'video', true], ['instagram', 'formato_que_no_existe', true],
    ['instagram', 'foto', false], ['facebook', 'carrusel', false], ['instagram', 'historia', false], ['whatsapp', 'estado', false], ['tiktok', 'video', false], ['linkedin', 'foto', false],
  ])('%s · %s → %s', (red, formato, esperado) => expect(filaSinFamilia({ red, formato }, T)).toBe(esperado))
  it('con la misma búsqueda que la hoja (mayúsculas en red y formato no la engañan)', () => {
    expect(filaSinFamilia({ red: 'Instagram', formato: 'FOTO' }, T)).toBe(false)
    expect(filaSinFamilia({ red: 'Instagram', formato: 'Anuncio_Imagen' }, T)).toBe(true)
  })
  it('una tabla sin ninguna familia (vacía, ilegible o anterior a la columna) no juzga nada: todo como hoy', () => {
    expect(filaSinFamilia({ red: 'instagram', formato: 'anuncio_imagen' }, {})).toBe(false)
    expect(filaSinFamilia({ red: 'instagram', formato: 'anuncio_imagen' }, formatosSinColumna())).toBe(false)
    // familias en blanco no cuentan como familias: tampoco se juzga
    const enBlanco = formatosSinColumna()
    for (const xs of Object.values(enBlanco)) for (const x of xs) x.familia = ''
    expect(filaSinFamilia({ red: 'instagram', formato: 'anuncio_imagen' }, enBlanco)).toBe(false)
  })
  it('🔴 (CC7 · 3) la clave del aviso lleva la versión del calendario: una versión nueva abre su propio incidente', () => {
    expect(claveDelAvisoSinFamilia('camp-1', 1)).not.toBe(claveDelAvisoSinFamilia('camp-1', 2))
    expect(claveDelAvisoSinFamilia('camp-1', 2)).toBe('cadena:formato-sin-familia:camp-1:2')
    expect(claveDelAvisoSinFamilia('camp-1', 1)).not.toBe(claveDelAvisoSinFamilia('camp-2', 1))
  })
  it('la nota es reconocible (para no repetirla) y dice la red y el formato', () => {
    const n = notaSinFamilia({ red: 'facebook', formato: 'anuncio_imagen' })
    expect(esNotaSinFamilia(n)).toBe(true)
    expect(n).toContain('facebook · anuncio_imagen')
    expect(esNotaSinFamilia('reubicación: otra cosa')).toBe(false)
  })
})

// ───────────────────────────────────────────────────────── el reloj de los lotes (filasLotes)
const NAUFRAGO = { campana: '28de888e-b3f2-4aca-86b3-2c7f7bf6685a', client: '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', rubro: 'restaurante' } // real
const SEGURIDAD = { campana: '5e9a0000-0000-4000-8000-00000000c0de', client: 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5', rubro: 'seguridad industrial' } // client_id real · campaña construida
type C = typeof NAUFRAGO
const HOY = '2026-11-10'
const ENVIO = '2026-11-10T14:33:31.096Z'
const horas = (h: number) => new Date(Date.parse(ENVIO) + h * 3600_000).toISOString()
const wf = { workflow_id: 'wf-vigia', workflow_execution_id: 'ex-1' }

/** las filas de cada cliente: las sanas de su rubro y las «sin familia» que le tocan (W46 real de Náufrago: 4 anuncio_imagen) */
const SANAS: Record<string, Array<[string, string, string]>> = {
  [NAUFRAGO.campana]: [['s1-d2-mar_foto', 'instagram', 'foto'], ['s1-d3-mie_historia', 'instagram', 'historia'], ['s1-d5-vie_carrusel', 'facebook', 'carrusel']],
  [SEGURIDAD.campana]: [['s1-d2-mar_linkedin_foto', 'linkedin', 'foto'], ['s1-d4-jue_carrusel', 'linkedin', 'carrusel'], ['s1-d5-vie_estado', 'whatsapp', 'estado']],
}
const MALAS: Record<string, Array<[string, string, string]>> = {
  [NAUFRAGO.campana]: [['s1-d4-jue_anuncio_gye', 'instagram', 'anuncio_imagen'], ['s1-d4-jue_anuncio_fb', 'facebook', 'anuncio_imagen'], ['s1-d6-sab_anuncio_gye', 'instagram', 'anuncio_imagen'], ['s1-d6-sab_anuncio_fb', 'facebook', 'anuncio_imagen']],
  [SEGURIDAD.campana]: [['s1-d3-mie_texto', 'linkedin', 'texto'], ['s1-d6-sab_anuncio_carrusel', 'facebook', 'anuncio_carrusel']],
}

function escena(c: C, opciones: { sanas?: boolean; malas?: boolean; seco?: boolean; sinPuertos?: boolean; avisoFalla?: boolean; formatos?: FormatosPorRed } = {}) {
  // d1 = lunes 9-nov … d7 = domingo 15-nov: toda la semana ISO 2026-W46
  const fecha = (id: string) => `2026-11-${String(8 + Number(id.match(/d(\d)/)![1])).padStart(2, '0')}`
  const fila = ([id, red, formato]: [string, string, string]): Fila => ({ id, campana_id: c.campana, fecha, red, formato, estado: 'validada', avisos: [] } as unknown as Fila)
  const filas: Fila[] = [...(opciones.sanas === false ? [] : SANAS[c.campana]), ...(opciones.malas === false ? [] : MALAS[c.campana])].map((x) => ({ ...fila(x), fecha: fecha(x[0]) }))
  let formatos = opciones.formatos ?? formatosReales()
  const registro: Array<{ idempotency_key: string; created_at: string; fila_ids: string[] }> = []
  const avisos: Array<{ clave: string; accion: string; origen?: string; detalle: string }> = []
  const buzon = new Set<string>()
  const campana = { id: c.campana, client_id: c.client, estado: 'activa', seco: opciones.seco === true } as unknown as Campana
  const al = {
    campana: async (id: string) => (id === c.campana ? campana : null),
    leerConfig: async (k: string) => (k === 'flujos' ? ['wf-vigia'] : k === 'arranque_por_evento' ? true : undefined),
    journeyExiste: async () => false,
    formatos: async () => formatos,
    ultimaVersionDeCalendario: async () => 1,
    filas: async () => filas.map((f) => ({ ...f, avisos: [...f.avisos] })),
    reubicarFila: async (_c: string, _v: number, id: string, patch: Partial<Fila>, aviso: string) => {
      const f = filas.find((x) => x.id === id)
      if (!f || (f.estado !== 'validada' && f.estado !== 'lista_para_brief')) return false
      Object.assign(f, patch, { avisos: [...f.avisos, aviso] })
      return true
    },
    ...(opciones.sinPuertos ? {} : {
      enviosDeLote: async (clientId: string, lote: string, llave: string, filasDeHoy: readonly string[]) => {
        const llaves = llavesDelRegistro(clientId, lote, llave)
        return enviosDesdeElRegistro(llaves, registro.filter((r) => llaves.includes(r.idempotency_key)), filasDeHoy)
      },
      avisarLoteMuerto: async (a: { clave: string; origen?: string; detalle: string }) => {
        if (opciones.avisoFalla) return { ok: false as const, error: 'buzón caído' }
        const accion = buzon.has(a.clave) ? 'repetida' : 'abrio'
        buzon.add(a.clave); avisos.push({ clave: a.clave, accion, origen: a.origen, detalle: a.detalle })
        return { ok: true as const, accion }
      },
    }),
  } as unknown as Almacen
  /** el vigía manda cada sobre; la sala deduplica por la llave que deriva */
  const pasada = async (ahora: string) => {
    const r = await filasLotes(al, { ...wf, campana_id: c.campana, hoy: HOY }, ahora)
    const lotes = r.cuerpo.lotes as Array<{ lote: string; idempotency_key: string; fila_ids: string[] }>
    for (const l of lotes) {
      const k = buildIdempotencyKey({ operation_type: OPERACION_DE_ENTRADA, client_id: c.client, logical_period: l.lote, input_hash: l.idempotency_key })
      if (!registro.some((x) => x.idempotency_key === k)) registro.push({ idempotency_key: k, created_at: ahora, fila_ids: [...l.fila_ids] })
    }
    return { r, lotes }
  }
  /** «se gasta» = un sobre que la sala no había visto (un viaje nuevo a la parte por filas) */
  const viajes = () => registro.length
  return { al, filas, avisos, registro, pasada, viajes, ponerFormatos: (t: FormatosPorRed) => { formatos = t } }
}
const ids = (xs: Array<[string, string, string]>) => xs.map((x) => x[0]).sort()
const notas = (f: Fila) => f.avisos.filter(esNotaSinFamilia)

describe.each([['Náufrago (restaurante · campaña real)', NAUFRAGO], ['Seguridad industrial (B2B · campaña construida)', SEGURIDAD]])('%s', (_n, c) => {
  it('🔴 sabotaje · un lote TODO SANO sale igual que hoy: los mismos lotes, sin `sin_familia`, sin notas ni avisos', async () => {
    const hoy = escena(c, { malas: false, formatos: formatosSinColumna() }) // «hoy» = la regla no juzga
    const nuevo = escena(c, { malas: false })
    const a = await hoy.pasada(ENVIO), b = await nuevo.pasada(ENVIO)
    expect(b.r.cuerpo).toEqual(a.r.cuerpo)
    expect(b.r.cuerpo).not.toHaveProperty('sin_familia')
    expect(b.lotes).toHaveLength(1)
    expect([...b.lotes[0].fila_ids].sort()).toEqual(ids(SANAS[c.campana]))
    expect(nuevo.avisos).toEqual([])
    expect(nuevo.filas.every((f) => f.avisos.length === 0)).toBe(true)
  })

  it('🔴 un lote MIXTO: solo salen las filas sin familia, con su razón escrita; el resto sigue y se avisa UNA vez', async () => {
    const e = escena(c)
    const { r, lotes } = await e.pasada(ENVIO)
    expect(lotes).toHaveLength(1)
    expect([...lotes[0].fila_ids].sort()).toEqual(ids(SANAS[c.campana]))
    for (const f of e.filas) {
      const mala = MALAS[c.campana].some((x) => x[0] === f.id)
      expect(notas(f), f.id).toEqual(mala ? [notaSinFamilia(f)] : [])
      expect(f.estado).toBe('validada') // no se cancela: vuelve sola cuando su formato tenga familia
    }
    expect(r.cuerpo.sin_familia).toMatchObject({ fila_ids: expect.arrayContaining(ids(MALAS[c.campana])), anotadas: MALAS[c.campana].length, aviso: { ok: true, accion: 'abrio' } })
    expect(e.avisos).toHaveLength(1)
    expect(e.avisos[0]).toMatchObject({ clave: claveDelAvisoSinFamilia(c.campana, 1), accion: 'abrio', origen: 'cadena/reloj · formato sin familia' })
    for (const [id] of MALAS[c.campana]) expect(e.avisos[0].detalle).toContain(id)
    // las pasadas siguientes del reloj (cada 30 min): ni notas repetidas ni otro aviso
    for (const h of [0.5, 1, 1.5]) await e.pasada(horas(h))
    expect(e.avisos).toHaveLength(1)
    for (const f of e.filas) expect(notas(f).length).toBeLessThanOrEqual(1)
  })

  it('🔴 sabotaje · un lote TODO sin familia no gasta (ningún sobre en ninguna pasada) y avisa una sola vez', async () => {
    const e = escena(c, { sanas: false })
    for (const h of [0, 0.5, 2, 4, 6, 8]) {
      const { lotes } = await e.pasada(horas(h))
      expect(lotes).toEqual([])
    }
    expect(e.viajes()).toBe(0)
    expect(e.avisos).toHaveLength(1)
    expect(e.avisos[0].accion).toBe('abrio')
    expect(e.filas.every((f) => notas(f).length === 1)).toBe(true)
  })

  it('cuando su formato recibe familia, la fila vuelve sola al lote (sin tocar su estado)', async () => {
    const e = escena(c)
    await e.pasada(ENVIO)
    const t = formatosReales()
    for (const xs of Object.values(t)) for (const x of xs) if (!x.familia) x.familia = 'post_img'
    e.ponerFormatos(t)
    const { r, lotes } = await e.pasada(horas(0.5))
    expect([...lotes[0].fila_ids].sort()).toEqual([...ids(SANAS[c.campana]), ...ids(MALAS[c.campana])].sort())
    expect(r.cuerpo).not.toHaveProperty('sin_familia')
  })

  it('una fila sin familia NUEVA (otra que vence otro día) se anota y suma una repetición al MISMO incidente', async () => {
    const e = escena(c)
    await e.pasada(ENVIO)
    e.filas.push({ id: 's1-d7-dom_anuncio_extra', campana_id: c.campana, fecha: '2026-11-15', red: 'instagram', formato: 'anuncio_carrusel', estado: 'validada', avisos: [] } as unknown as Fila)
    const { r } = await e.pasada(horas(0.5))
    expect(r.cuerpo.sin_familia).toMatchObject({ anotadas: 1 })
    expect(e.avisos.map((a) => a.accion)).toEqual(['abrio', 'repetida'])
    expect(new Set(e.avisos.map((a) => a.clave))).toEqual(new Set([claveDelAvisoSinFamilia(c.campana, 1)]))
  })

  it('una fila que otra vía ya tomó (la escritura condicional no se aplica) no cuenta como anotada ni hace avisar', async () => {
    const e = escena(c, { sanas: false })
    // entre la lectura y la escritura, otra vía la pasó a briefeada: el almacén no escribe
    ;(e.al as unknown as { reubicarFila: () => Promise<boolean> }).reubicarFila = async () => false
    const { r } = await e.pasada(ENVIO)
    expect(r.cuerpo.sin_familia).toMatchObject({ anotadas: 0 })
    expect(r.cuerpo.sin_familia).not.toHaveProperty('aviso')
    expect(e.avisos).toEqual([])
  })

  it('un aviso que falla no frena el lote (el resto sale igual) y queda anotado en la respuesta', async () => {
    const e = escena(c, { avisoFalla: true })
    const { r, lotes } = await e.pasada(ENVIO)
    expect([...lotes[0].fila_ids].sort()).toEqual(ids(SANAS[c.campana]))
    expect(r.cuerpo.sin_familia).toMatchObject({ aviso: { ok: false, error: 'buzón caído' } })
  })

  it('campaña en seco: las filas sin familia también quedan fuera del lote, pero no se escribe nada ni se avisa', async () => {
    const e = escena(c, { seco: true })
    const { r, lotes } = await e.pasada(ENVIO)
    expect([...lotes[0].fila_ids].sort()).toEqual(ids(SANAS[c.campana]))
    expect(r.cuerpo).not.toHaveProperty('sin_familia')
    expect(e.filas.every((f) => f.avisos.length === 0)).toBe(true)
    expect(e.avisos).toEqual([])
  })

  it('sin los puertos del lote muerto (almacén viejo) la regla aplica igual', async () => {
    const e = escena(c, { sinPuertos: true })
    const { r, lotes } = await e.pasada(ENVIO)
    expect([...lotes[0].fila_ids].sort()).toEqual(ids(SANAS[c.campana]))
    expect(r.cuerpo.sin_familia).toMatchObject({ anotadas: MALAS[c.campana].length })
    expect(r.cuerpo.sin_familia).toMatchObject({ aviso: { ok: false, error: 'el almacén no avisa' } })
  })
})

describe('🔴 el caso real · W46 de Náufrago: el r1 se mandó CON los anuncios y murió; el reintento sale sin ellos', () => {
  it('el siguiente reintento (r2) lleva solo las filas con familia y la parte ya no ve ningún «sin familia»', async () => {
    const e = escena(NAUFRAGO, { formatos: formatosSinColumna() }) // así se armaron el original y el r1: con los anuncios adentro
    const orig = (await e.pasada(ENVIO)).lotes[0]
    expect(orig.fila_ids).toEqual(expect.arrayContaining(ids(MALAS[NAUFRAGO.campana])))
    const r1 = (await e.pasada(horas(HORAS_PARA_DARLO_POR_MUERTO))).lotes[0]
    expect(r1.idempotency_key).toBe(`${baseDelLote(orig.idempotency_key)}:r1`)
    e.ponerFormatos(formatosReales()) // se publica la regla
    const r2 = await e.pasada(horas(2 * HORAS_PARA_DARLO_POR_MUERTO))
    expect(r2.lotes[0].idempotency_key).toBe(`${baseDelLote(orig.idempotency_key)}:r2`)
    expect([...r2.lotes[0].fila_ids].sort()).toEqual(ids(SANAS[NAUFRAGO.campana]))
    expect(r2.r.cuerpo.lotes_muertos).toEqual([expect.objectContaining({ accion: 'reintento', intento: 2 })])
    // dos incidentes distintos: el del lote muerto y el de los formatos sin familia
    expect(new Set(e.avisos.map((a) => a.clave))).toEqual(new Set([claveDelAviso(orig.idempotency_key), claveDelAvisoSinFamilia(NAUFRAGO.campana, 1)]))
  })
})

// ───────────────────────────────────────────────────────── la hoja (la segunda red: si un lote viejo pide filas sin familia por id)
const A = clienteA()
const CAMP = 'camp-1'
const AHORA = '2026-10-09T12:00:00Z'
const wfh = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', campana_id: CAMP, ...extra })
function almacenHoja(formatos: FormatosPorRed) {
  const al = new AlmacenMemoria({
    contextos: { [A.clientId]: contextoDe(A) },
    planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'ensayo', clientes_ensayo: [A.clientId], nuevo_orden: { clientes: [A.clientId] } },
    journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
  })
  al.formatos = async () => formatos
  al.campanas.push({
    id: CAMP, client_id: A.clientId, plan_id: 'plan-1', fecha_inicio: A.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: A.campana.fecha_fin, zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: ['centro'],
    estado: 'calendario', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: true,
  } as Campana)
  al.estrategias.push({ campana_id: CAMP, version: 1, estado: 'validada', contenido: A.estrategia, agente: 'social-media-strategist', modelo: null, costo_usd: 0, workflow_execution_id: 'ex-0', seco: true } as EstrategiaGuardada)
  return al
}
const BRIEF = [
  '## De qué parte del plan sale', 'Fase 1: «Se publican 3 posts por semana en Instagram y 1 en Facebook».',
  '## Insight', 'La gente del barrio desayuna de pie porque cree que no hay dónde sentarse antes de las ocho.',
  '## Mensaje', 'Hay mesa desde las siete.',
  '## Público', 'Vecinos del barrio que desayunan fuera entre semana (del plan).', '## Cómo sabremos que funcionó', 'Pedidos por semana contra la meta del plan, revisados cada lunes.', '## Objetivo', 'Que entren 30 desayunos nuevos por semana.', '- instagram: que miren el pan recién salido · «ven a desayunar»', '- facebook: que guarden el horario · «guarda el horario»',
  '## Tono', 'Cercano y directo, sin exclamaciones.',
  '## Obligatorios', '- vocabulario: pan de masa madre; mesa larga', '- prohibido: barato; gratis', '- lo que no se dice: precios',
  '## Faltantes', '- público: el manual no dice edades',
  '## Contradicciones plan vs manual', '- ninguna',
].join('\n')
const CONCEPTO = [
  '## Gran idea  La mesa larga · Noventa días para sentarse juntos',
  '## Por qué funciona  El insight del brief dice que la gente desayuna de pie; la idea lo convierte en costumbre.',
  '## Cómo se ve  Luz cálida, madera, manos sobre la mesa.',
  '## Cómo suena  Voz cercana, frases cortas.',
  '## Capítulo f1 · Abrir la mesa', 'Qué cuenta: la mesa se abre · Objetivo de la fase (cita): «presentar» · Cómo se ve en este capítulo: planos cerrados',
  '## Banco de ideas',
  '- C1-I01 · instagram · carrusel · la primera silla · mensaje: aquí siempre hay una silla para ti · gancho: ¿quién se sentaba aquí? · protagonista: la silla · serie: ninguna · foto:ninguna',
  '- C1-I02 · instagram · foto · la mesa a las 7 · mensaje: la mesa se llena de a poco · gancho: mira lo que pasa en dos horas · protagonista: la mesa · serie: ninguna · foto:ninguna',
  '## Caminos descartados y por qué', '- «El plato del día»: habla del producto, no de la mesa',
].join('\n')
async function conGranIdea(al: AlmacenMemoria) {
  expect((await briefAbrir(al, wfh(), AHORA)).status).toBe(200)
  expect(await recibirBrief(al, { campana_id: CAMP, version: 1, encargo_id: 'enc-1', texto: BRIEF, costo_usd: 0.1, motivo: null }, AHORA)).toMatchObject({ ok: true, estado: 'validada' })
  expect((await conceptoAbrir(al, wfh(), AHORA)).status).toBe(200)
  expect(await recibirConcepto(al, { campana_id: CAMP, version: 1, encargo_id: 'enc-1', texto: CONCEPTO, costo_usd: 0.1, motivo: null }, AHORA)).toMatchObject({ ok: true, estado: 'lista' })
  expect((await conceptoDecidir(al, wfh({ decision: 'aprobar' }), AHORA)).status).toBe(200)
}
const filaH = (id: string, red: string, formato: string): Fila => ({
  id, tanda: 1, semana: 1, dia_semana: 1, fecha: '2026-10-12', hora: '12:00', red, formato, pilar: 'menu', tema: 'tema', sede: 'centro', requiere_abierto: false, depende_de: [], datos: [], pendientes: [], pieza_fija: null,
  origen: 'agente', estado: 'validada', avisos: [], fase: 'f1', idea_ref: 'C1-I01',
})

describe('la hoja (hojaEscribir) · segunda red, para un lote que ya viene con filas sin familia', () => {
  it('🔴 saca SOLO las filas sin familia, las declara con su motivo y la guarda de la parte ya no ve ningún «sin familia»', async () => {
    const al = almacenHoja(formatosReales())
    await conGranIdea(al)
    await al.guardarFilas(CAMP, 1, 1, [filaH('f-foto', 'instagram', 'foto'), filaH('f-anuncio-ig', 'instagram', 'anuncio_imagen'), filaH('f-carrusel', 'facebook', 'carrusel'), filaH('f-anuncio-fb', 'facebook', 'anuncio_imagen')])
    const r = await hojaEscribir(al, wfh({ fila_ids: ['f-foto', 'f-anuncio-ig', 'f-carrusel', 'f-anuncio-fb'] }), AHORA)
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200)
    expect(r.cuerpo.filas).toEqual(['f-foto', 'f-carrusel'])
    expect(r.cuerpo.excluidas).toEqual([
      { fila_id: 'f-anuncio-ig', motivo: notaSinFamilia({ red: 'instagram', formato: 'anuncio_imagen' }) },
      { fila_id: 'f-anuncio-fb', motivo: notaSinFamilia({ red: 'facebook', formato: 'anuncio_imagen' }) },
    ])
    expect(r.cuerpo.hoja).not.toContain('f-anuncio')
    expect(guardaDeLaParte(r.cuerpo.avisos as string[])).toEqual([])
    // lo que la parte marcará como briefeado (provenance) son solo las sanas
    expect(JSON.stringify(r.cuerpo.provenance)).not.toContain('f-anuncio')
  })
  it('🔴 sabotaje · un lote TODO sin familia: 409 E-SIN-FAMILIA, sin hoja (nada que gastar)', async () => {
    const al = almacenHoja(formatosReales())
    await conGranIdea(al)
    await al.guardarFilas(CAMP, 1, 1, [filaH('f-anuncio-ig', 'instagram', 'anuncio_imagen'), filaH('f-texto', 'linkedin', 'texto')])
    const r = await hojaEscribir(al, wfh({ semana: 1 }), AHORA)
    expect(r.status).toBe(409)
    expect(r.cuerpo.code).toBe('E-SIN-FAMILIA')
    expect(r.cuerpo).not.toHaveProperty('hoja')
  })
  it('🔴 sabotaje · un lote TODO sano: todas sus filas van a la hoja, sin `excluidas` y sin avisos de familia', async () => {
    const al = almacenHoja(formatosReales())
    await conGranIdea(al)
    await al.guardarFilas(CAMP, 1, 1, [filaH('f-foto', 'instagram', 'foto'), filaH('f-historia', 'instagram', 'historia'), filaH('f-estado', 'whatsapp', 'estado')])
    const r = await hojaEscribir(al, wfh({ semana: 1 }), AHORA)
    expect(r.status, JSON.stringify(r.cuerpo)).toBe(200)
    expect(r.cuerpo).not.toHaveProperty('excluidas')
    expect(r.cuerpo.filas).toEqual(['f-foto', 'f-historia', 'f-estado'])
    expect(guardaDeLaParte(r.cuerpo.avisos as string[])).toEqual([])
  })
})
