/**
 * ESLABONES 1 y 3 de #1150 · la oficina devuelve sus correcciones al receptor (CC3) y lee `para_la_pieza` antes de soltar la pieza (US$ 0 · sin red).
 * De punta a punta por la puerta y la mesa reales: D1 con los hechos vivos → devolución al calendario → el cierre llama al receptor → la pieza espera, sale,
 * queda reemplazada o frenada según lo que diga. Las 6 medidas de CC7 (RESPUESTA-CC7-a-CC4-eslabones-1-y-3) más los lectores de `resultado_para_la_sala`.
 */
import { describe, expect, it } from 'vitest'
import { fichaEnLineas, type FichaDeOferta, type HechoDelNegocioPorOferta } from '../../cadena/ficha-de-oferta'
import { abrirEncargo, cerrar, plantillaDe, recibirResultado } from '../orquestador'
import { CLAVE_DE_LA_PALANCA } from '../mesa/con-mesa'
import { KIT_MESA } from '../plantillas/mesa'
import { KIT_HISTORIAS_CON_JEFATURA } from '../plantillas/con-jefatura'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { datos } from '../ayudas'
import { ARTEFACTO_ESPERA_DE_LA_CADENA, HORAS_PARA_AVISAR_LA_ESPERA, reglaDelMotivo, veredictoDe, type EsperaDeLaCadena, type ParaLaPieza } from '../espera-de-la-cadena'
import { revisarEsperasDeLaCadena } from '../vigia'
import { bloqueaElReintento, rastroDe } from '../reapertura'
import { estadoParaReRevisar } from '../re-revision'
import type { Plantilla } from '../tipos'
import type { PuertoDeLaCadena, RespuestaDeLaCadena } from '../puertos'
import type { SalidaDeRevision } from '../../jefatura/revision/contrato'
import type { Tarjeta } from '../mesa/tipos'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { AlmacenMemoria } from '../../cadena/__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../../cadena/__fixtures__/clientes'
import { puertoDeLaCadena } from '../../cadena/mesas'
import { relojDeLaCadena } from '../../cadena/reloj'
import { VERSION_BASE_DE_CORRECCION } from '../../cadena/correcciones-calendario'
import { diaSemanaIso } from '../../cadena/fechas'
import type { Campana } from '../../cadena/almacen'
import type { Fila as FilaDeLaCadena } from '../../cadena/tipos'
import { crearMesaEnMemoria } from './mesa-memoria'

const FICHA: FichaDeOferta = { clave: 'oferta-a', nombre: 'Oferta A', que_es: { valor: 'lo que se vende', fuente: 'ficha:1' }, oferta_y_precio: [{ valor: 'el principal $7,00', fuente: 'manual:precios' }], no_se_puede_afirmar: [] } as unknown as FichaDeOferta
const LINEAS = fichaEnLineas(FICHA, '2026-11-20')
const BRIEF = `### BRF-0300 · Instagram · kit_historias
- QUÉ ES: Kit semanal de historias y estados (1 elemento)
- OFERTA: oferta-a
- FICHA DE LA OFERTA:
${LINEAS.map((l) => `  - ${l}`).join('\n')}
- PROTAGONISTA: Lo principal llega a la zona norte.
- LÍMITES: 9:16
- VISUAL: Fondo de la marca.
- ELEMENTOS:
  - 2026-11-20 10:00 | historia | «ya llegó»: zona norte | producto | el principal 7.00
- LLAMADO A LA ACCIÓN: Pide en la web
`
const PIEZA = ['## Objetivo', 'Que la zona norte sepa que ya llega', '## Lámina 1 · El gancho', 'Título: ya llegó.', 'Texto: Pídelo desde casa.', 'Llamado: la web', 'Qué se ve: «ya llegó» sobre el fondo de la marca', 'Imagen: ninguna'].join('\n')
const parteCon = (b: string) => `# PARTE DE TRABAJO\nPlan de origen: 29d6daeb-a95a-4328-9c10-cf3cddc236f7 · Manual: versión 1\n\n## Entregables\n\n${b}\n### BRF-9999 · Instagram · imagen\n- QUÉ ES: otro\n`
const tarjeta = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[]): Tarjeta => ({ agente, rol, especialidad: agente, sabe_hacer: [], necesita: [], entrega: [], pertinente_en, activo: true, version: 1 })
const DIRECTORIO: Tarjeta[] = [tarjeta('creative-director-mesa', 'direccion', ['carrusel', 'kit', 'post']), tarjeta('content-creator', 'miembro', ['kit']), tarjeta('portero', 'portero', [])]
const LIMPIA: SalidaDeRevision = { revision_id: 'rev', artifact_type: 'pieza', artifact_id: 'x', resultado: 'limpia', marcas: { con_desacuerdo: false, sin_segunda_mirada: false }, desacuerdos: [], respuestas: [], costo_usd: 0, simulado: true } as unknown as SalidaDeRevision
const HECHOS: HechoDelNegocioPorOferta[] = [{ oferta: 'oferta-a', tipo: 'cierre_retiro', valor: 'la oferta se suspende', vigente_desde: '2026-11-18', fuente: 'dueno:chat-17nov' }]
const CAMPANA = 'camp-0001'

/** el receptor de CC3 en memoria: la llave no duplica; `para` dice qué contesta `del_encargo` por llave; los modos de falla son por llamada */
function receptor(o: { para?: (llave: string) => ParaLaPieza; recibir?: (llave: string, vez: number) => RespuestaDeLaCadena | null; leerCaido?: () => boolean } = {}) {
  const guardadas = new Map<string, Record<string, unknown>>()
  const llamadas: Array<Record<string, unknown>> = []
  let lecturas = 0
  const vecesPorLlave = new Map<string, number>()
  return {
    guardadas, llamadas, get lecturas() { return lecturas },
    puerto: {
      async devolverCorreccion(c: Record<string, unknown>): Promise<RespuestaDeLaCadena> {
        llamadas.push(c)
        const llave = String(c.llave)
        const vez = (vecesPorLlave.get(llave) ?? 0) + 1
        vecesPorLlave.set(llave, vez)
        const forzada = o.recibir?.(llave, vez)
        if (forzada) return forzada
        if (guardadas.has(llave)) return { status: 200, cuerpo: { ok: true, ya_estaba: true } }
        guardadas.set(llave, c)
        return { status: 201, cuerpo: { ok: true, ya_estaba: false } }
      },
      async correccionesDelEncargo(encargoId: string): Promise<RespuestaDeLaCadena> {
        lecturas++
        if (o.leerCaido?.()) return { status: 500, cuerpo: { ok: false, error: 'base caída' } }
        const lista = [...guardadas.values()].filter((c) => c.encargo_id === encargoId).map((c) => ({ llave: c.llave, destino: c.destino, para_la_pieza: o.para?.(String(c.llave)) ?? 'esperando', respuesta: o.para?.(String(c.llave)) === 'sigue' ? 'no_tomada' : null, explicacion: o.para?.(String(c.llave)) === 'sigue' ? 'la fila ya estaba aprobada' : null }))
        return { status: 200, cuerpo: { ok: true, correcciones: lista } }
      },
    },
  }
}

async function correr(o: { real?: boolean; campana?: string | null; rec?: ReturnType<typeof receptor> | null; cadena?: Partial<PuertoDeLaCadena> } = {}) {
  const pl: Plantilla = JSON.parse(JSON.stringify(KIT_MESA))
  const M = crearMemoria({ parte: parteCon(BRIEF), plantilla: pl, config: { familias_activas: ['kit_historias'] } })
  const plantillas: Record<string, { plantilla: Plantilla; activo: boolean }> = { kit_historias: { plantilla: KIT_HISTORIAS_CON_JEFATURA, activo: true }, kit_mesa: { plantilla: pl, activo: true } }
  M.P.almacen.leerPlantilla = async (f) => plantillas[f] ?? null
  const MS = crearMesaEnMemoria(DIRECTORIO)
  M.P.mesa = { ...MS, configDeLaCadena: async (k: string) => (k === CLAVE_DE_LA_PALANCA ? { clientes: [CLIENTE] } : undefined) }
  M.P.hechosPorOferta = async () => HECHOS
  M.P.jefatura = async () => ({ estado: 'cerrada', salida: LIMPIA })
  const parteOriginal = M.P.parte
  M.P.parte = async (id, c) => { const p = await parteOriginal(id, c); return p ? { ...p, campana_id: o.campana === undefined ? CAMPANA : o.campana } : p }
  const rec = o.rec === undefined ? receptor() : o.rec
  if (rec) M.P.cadena = { ...(M.P.cadena as PuertoDeLaCadena), ...rec.puerto }
  if (o.cadena) M.P.cadena = { ...(M.P.cadena as PuertoDeLaCadena), ...o.cadena }
  let r = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0300', dry_run: o.real === false, familia: 'kit_historias' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(r.cuerpo.encargo_id)
  M.encargos.get(id)!.sala_ref = { fila: { id: 'F-0300', fecha: '2026-11-20' } }
  for (let i = 0; i < 40 && r.cuerpo.accion === 'esperar'; i++) {
    const t = r.cuerpo.turno as { n: number; paso: string; agente: string }
    const [, tipo] = t.paso.split(':')
    let texto = `(${t.agente}) aporte breve`
    if (t.agente === 'creative-director-mesa' && tipo !== 'dirige') {
      const citas = MS.filas.filter((f) => f.encargo_id === id && f.tipo === 'aporta').map((f) => `A${f.n} usé: el titular`).join('\n')
      texto = `${PIEZA}\n## Citas\n${citas}`
    }
    r = await recibirResultado(M.P, id, t.n, { texto, costo_usd: 0, workflow_execution_id: `t-${t.n}` })
  }
  const enc = () => M.encargos.get(id)!
  const espera = () => datos(enc().estado_del_motor, ARTEFACTO_ESPERA_DE_LA_CADENA) as EsperaDeLaCadena | undefined
  /** lo que hace el vigía con este encargo: vuelve a correr su cierre */
  const vigia = async () => cerrar(M.P, enc(), await plantillaDe(M.P, enc()), false)
  const alertas = () => M.llamadas.avisos.filter((a) => a.canal === 'alertas')
  return { M, MS, r, id, enc, espera, vigia, alertas, rec }
}

describe('eslabones 1 y 3 · puro', () => {
  it('lo más grave manda: frenada > reemplazada > esperando > sigue; sin lectura, se espera', () => {
    expect(veredictoDe(['sigue', 'reemplazada', 'esperando'])).toBe('reemplazada')
    expect(veredictoDe(['sigue', 'esperando'])).toBe('esperando')
    expect(veredictoDe(['reemplazada', 'frenada'])).toBe('frenada')
    expect(veredictoDe(['sigue', 'sigue'])).toBe('sigue')
    expect(veredictoDe([])).toBe('esperando')
  })
  it('la regla dura del motivo va como «D1»; lo de criterio sin regla', () => {
    expect(reglaDelMotivo('D1 · la oferta está cerrada')).toBe('D1')
    expect(reglaDelMotivo('d3 · precio')).toBe('D3')
    expect(reglaDelMotivo('el tono no calza')).toBeNull()
  })
})

describe('eslabón 1 · el llamado', () => {
  it('🔴 el cierre manda la devolución al receptor con su campaña (del parte), fila, destino, regla, llave y encargo', async () => {
    const m = await correr()
    expect(m.rec!.llamadas).toHaveLength(1)
    expect(m.rec!.llamadas[0]).toMatchObject({ accion: 'recibir', campana_id: CAMPANA, fila_id: 'F-0300', destino: 'calendario', regla: 'D1', dura: true, llave: 'F-0300:calendario', encargo_id: m.id })
  })
  it('🔴 parte sin campaña: no se llama al receptor, la pieza queda frenada y avisa UNA vez (aunque el vigía pase 3 veces)', async () => {
    const m = await correr({ campana: null })
    expect(m.rec!.llamadas).toEqual([])
    expect(m.r.cuerpo).toMatchObject({ frenada: true, para_la_pieza: 'frenada', output_id: null, hitl_queue_id: null })
    expect(m.alertas().filter((a) => /ninguna campaña/.test(a.texto))).toHaveLength(1)
  })
  it('🔴 medida 6 · si el receptor falla para una llamada, la vuelta siguiente reintenta SOLO esa y la llave no la duplica', async () => {
    const rec = receptor({ recibir: (_l, vez) => (vez === 1 ? { status: 500, cuerpo: { ok: false, error: 'caído' } } : null), para: () => 'sigue' })
    const m = await correr({ rec })
    expect(m.r.cuerpo).toMatchObject({ resultado_para_la_sala: 'esperando_a_la_cadena' })
    expect(m.espera()!.enviadas).toEqual([])
    await m.vigia()
    expect(rec.llamadas).toHaveLength(2)
    expect(rec.guardadas.size).toBe(1)
    expect(m.espera()!.enviadas).toEqual(['F-0300:calendario'])
    await m.vigia()
    expect(rec.llamadas).toHaveLength(2) // ya enviada: no se vuelve a mandar
  })
  it('`va_a: pieza`: no era de la cadena · no se reenvía y queda como observación de la pieza (sale)', async () => {
    const rec = receptor({ recibir: () => ({ status: 200, cuerpo: { ok: true, va_a: 'pieza', llave: 'F-0300:calendario' } }) })
    const m = await correr({ rec })
    expect(m.r.cuerpo).toMatchObject({ resultado_para_la_sala: 'encargo_en_bandeja', con_desacuerdo: false })
    expect(m.M.llamadas.bandeja).toHaveLength(1)
    expect(m.r.cuerpo.observaciones).toEqual(expect.arrayContaining([expect.stringMatching(/^pieza: D1 · .*no era de la cadena/)]))
  })
})

describe('eslabón 3 · lo que dice `para_la_pieza`', () => {
  it('🔴 esperando: ni salida ni bandeja, `cerrado` con `esperando_a_la_cadena` y `pendiente` · 0 alarmas', async () => {
    const m = await correr()
    expect(m.r.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', resultado_para_la_sala: 'esperando_a_la_cadena', para_la_pieza: 'esperando', output_id: null })
    expect(m.enc().estado).toBe('cerrado')
    expect(m.M.llamadas.salidas).toEqual([])
    expect(m.M.llamadas.bandeja).toEqual([])
    expect(m.espera()).toMatchObject({ pendiente: true, veredicto: 'esperando' })
    expect(m.alertas()).toEqual([])
  })
  it('🔴 esperando → el vigía vuelve y ahora dice `sigue`: la pieza va a la bandeja con la explicación declarada, sin desacuerdo; `pendiente` pasa a false', async () => {
    let para: ParaLaPieza = 'esperando'
    const m = await correr({ rec: receptor({ para: () => para }) })
    expect(m.M.llamadas.bandeja).toEqual([])
    para = 'sigue'
    const v = await m.vigia()
    expect(v.cuerpo).toMatchObject({ resultado_para_la_sala: 'encargo_en_bandeja', con_desacuerdo: false })
    expect(m.M.llamadas.bandeja).toHaveLength(1)
    expect(m.M.llamadas.bandeja[0].metadata).toMatchObject({ con_desacuerdo: false, observaciones: expect.arrayContaining([expect.stringMatching(/^calendario: la cadena respondió «no_tomada» — la fila ya estaba aprobada/)]) })
    expect(m.espera()).toMatchObject({ pendiente: false, veredicto: 'sigue' })
    expect(m.alertas()).toEqual([])
  })
  it('🔴 reemplazada: la pieza vieja no se publica nunca · `cerrado` (no en_paso) con `reemplazada`, sin salida, sin bandeja, 0 alarmas; el vigía no lo vuelve a elegir', async () => {
    const m = await correr({ rec: receptor({ para: () => 'reemplazada' }) })
    expect(m.r.cuerpo).toMatchObject({ estado: 'cerrado', resultado_para_la_sala: 'reemplazada', para_la_pieza: 'reemplazada', output_id: null, hitl_queue_id: null })
    expect(m.enc().estado).toBe('cerrado')
    expect(m.M.llamadas.salidas).toEqual([])
    expect(m.M.llamadas.bandeja).toEqual([])
    expect(m.espera()!.pendiente).toBe(false)
    expect(m.alertas()).toEqual([])
  })
  it('🔴 CC6 21:40Z · dura TOMADA que el receptor contesta `sigue` (vuelta repetida): la pieza vieja NO sale, ni en la 2.ª vuelta', async () => {
    const rec = receptor({ para: () => 'sigue' })
    const lectura = rec.puerto.correccionesDelEncargo
    rec.puerto.correccionesDelEncargo = async (id) => { const r = await lectura(id); (r.cuerpo.correcciones as Array<Record<string, unknown>>).forEach((c) => { c.respuesta = 'tomada' }); return r }
    const m = await correr({ rec })
    expect(m.r.cuerpo).toMatchObject({ resultado_para_la_sala: 'esperando_a_la_cadena' })
    await m.vigia()
    expect(m.M.llamadas.bandeja).toEqual([])
    expect(m.M.llamadas.salidas).toEqual([])
  })
  it.each([
    ['ausente', undefined],
    ['nulo', null],
    ['vacío', ''],
    ['desconocido', 'publicar'],
    ['en mayúsculas', 'SIGUE'],
  ])('🔴 CC6 s4 · `para_la_pieza` %s: la falta de dato NO suelta la pieza · espera, sin salida ni bandeja, también tras el vigía', async (_n, valor) => {
    // la lectura del receptor se reescribe DESPUÉS del ayudante (que rellena con 'esperando'): llega sin el campo, nulo o con un valor que no es de los cuatro
    const rec = receptor({ para: () => 'sigue' })
    const lectura = rec.puerto.correccionesDelEncargo
    rec.puerto.correccionesDelEncargo = async (id) => {
      const r = await lectura(id)
      ;(r.cuerpo.correcciones as Array<Record<string, unknown>>).forEach((c) => { if (valor === undefined) delete c.para_la_pieza; else c.para_la_pieza = valor })
      return r
    }
    const m = await correr({ rec })
    const leida = (await rec.puerto.correccionesDelEncargo(m.enc().id)).cuerpo.correcciones as Array<Record<string, unknown>>
    expect(leida.length).toBeGreaterThan(0)
    expect(leida.every((c) => (valor === undefined ? !('para_la_pieza' in c) : c.para_la_pieza === valor))).toBe(true)
    expect(m.r.cuerpo).toMatchObject({ estado: 'cerrado', resultado_para_la_sala: 'esperando_a_la_cadena', para_la_pieza: 'esperando', output_id: null })
    expect(m.espera()).toMatchObject({ pendiente: true, veredicto: 'esperando' })
    await m.vigia()
    expect(m.M.llamadas.salidas).toEqual([])
    expect(m.M.llamadas.bandeja).toEqual([])
    expect(m.espera()).toMatchObject({ pendiente: true, veredicto: 'esperando' })
  })
  it('🔴 frenada: no sale y la oficina NO manda otra alarma (la mandó el receptor)', async () => {
    const m = await correr({ rec: receptor({ para: () => 'frenada' }) })
    expect(m.r.cuerpo).toMatchObject({ frenada: true, para_la_pieza: 'frenada', output_id: null })
    expect(m.M.llamadas.bandeja).toEqual([])
    expect(m.alertas()).toEqual([])
    expect(m.espera()!.pendiente).toBe(false)
  })
})

describe('las medidas de CC7', () => {
  it('🔴 medida 1 · el encargo que espera NO es una corrida viva (ni `abierto` ni `en_paso`): la puerta de publicación no lo cuenta', async () => {
    const m = await correr()
    expect(['abierto', 'en_paso']).not.toContain(m.enc().estado)
  })
  it('🔴 medida 2 · 3 vueltas del vigía con «esperando»: el gasto no cambia y no se abre ni un turno', async () => {
    const m = await correr()
    const gasto = m.enc().gasto_usd, filas = m.MS.filas.length, pasos = m.enc().estado_del_motor.pasos_ejecutados
    for (let i = 0; i < 3; i++) await m.vigia()
    expect(m.enc().gasto_usd).toBe(gasto)
    expect(m.MS.filas.length).toBe(filas)
    expect(m.enc().estado_del_motor.pasos_ejecutados).toBe(pasos)
    expect(m.M.gastos.filter((g) => g.cost_usd > 0)).toEqual([])
  })
  it('🔴 medida 3 · receptor caído 3 vueltas seguidas: UNA alarma en #alertas, las demás al hilo; la marca queda guardada en el artefacto', async () => {
    const m = await correr({ rec: receptor({ leerCaido: () => true }) })
    await m.vigia(); await m.vigia()
    expect(m.alertas().filter((a) => /receptor de la cadena no contestó/.test(a.texto))).toHaveLength(1)
    expect(m.M.llamadas.avisos.filter((a) => a.canal === 'hilo' && /receptor de la cadena no contestó/.test(a.texto))).toHaveLength(2)
    expect(m.espera()!.avisos.receptor_caido).toBeTruthy()
  })
  it(`🔴 medida 3 · ${HORAS_PARA_AVISAR_LA_ESPERA} h esperando: UNA alarma, aunque el vigía pase más veces; sigue sin salir`, async () => {
    const m = await correr()
    const t0 = m.M.P.ahora().getTime()
    m.M.P.ahora = () => new Date(t0 + HORAS_PARA_AVISAR_LA_ESPERA * 3600_000 + 60_000)
    await m.vigia(); await m.vigia(); await m.vigia()
    expect(m.alertas().filter((a) => /Esperando a la cadena/.test(a.texto))).toHaveLength(1)
    expect(m.M.llamadas.bandeja).toEqual([])
  })
  it('🔴 medida 5 · ensayo (dry_run): ningún llamado ni lectura al receptor; lo de la cadena queda declarado y la pieza sigue (simulada)', async () => {
    const m = await correr({ real: false })
    expect(m.rec!.llamadas).toEqual([])
    expect(m.rec!.lecturas).toBe(0)
    expect(m.r.cuerpo).toMatchObject({ resultado_para_la_sala: 'encargo_en_bandeja', simulado: true })
    expect(m.r.cuerpo.observaciones).toEqual(expect.arrayContaining([expect.stringMatching(/^calendario: \(ensayo\) no se devolvió a la cadena: D1 · /)]))
  })
  it('🔴 fichas «en la cadena» sin devoluciones que encontrar: NUNCA se suelta por falta de dato · espera y avisa UNA vez', async () => {
    const m = await correr({ rec: receptor({ para: () => 'sigue' }) })
    // la pieza salió (sigue); se borra lo que la oficina sabe de sus devoluciones y se vuelve a cerrar
    const e = m.enc().estado_del_motor
    delete e.artefactos[ARTEFACTO_ESPERA_DE_LA_CADENA]
    const jef = (e.artefactos['jefatura']?.datos ?? Object.values(e.artefactos).find((a) => (a.datos as { jefatura?: unknown }).jefatura)?.datos) as { jefatura: { sentido: { devoluciones: unknown[] } } }
    jef.jefatura.sentido.devoluciones = []
    const bandejaAntes = m.M.llamadas.bandeja.length
    const v = await m.vigia(); await m.vigia()
    expect(v.cuerpo).toMatchObject({ resultado_para_la_sala: 'esperando_a_la_cadena' })
    expect(m.M.llamadas.bandeja.length).toBe(bandejaAntes)
    expect(m.alertas().filter((a) => /no encuentra cuáles son/.test(a.texto))).toHaveLength(1)
  })
  it('🔴 dos devoluciones, el receptor lista solo una (`sigue`): la que falta cuenta como `esperando` · la pieza no sale', async () => {
    const rec = receptor({ para: () => 'sigue' })
    const lectura = rec.puerto.correccionesDelEncargo
    rec.puerto.correccionesDelEncargo = async (id) => { const r = await lectura(id); r.cuerpo.correcciones = (r.cuerpo.correcciones as Array<Record<string, unknown>>).filter((c) => c.llave !== 'F-0301:calendario'); return r }
    const m = await correr({ rec })
    const e = m.enc().estado_del_motor
    delete e.artefactos[ARTEFACTO_ESPERA_DE_LA_CADENA]
    const jef = Object.values(e.artefactos).find((x) => (x.datos as { jefatura?: unknown }).jefatura)!.datos as { jefatura: { sentido: { devoluciones: Array<Record<string, unknown>> } } }
    const d0 = jef.jefatura.sentido.devoluciones[0]
    jef.jefatura.sentido.devoluciones.push({ ...d0, fila_id: 'F-0301', llave: 'F-0301:calendario' })
    const bandejaAntes = m.M.llamadas.bandeja.length
    const v = await m.vigia()
    expect(v.cuerpo).toMatchObject({ resultado_para_la_sala: 'esperando_a_la_cadena' })
    expect(m.M.llamadas.bandeja.length).toBe(bandejaAntes)
  })
  it.each([['desconocido', 'publicar'], ['en mayúsculas', 'SIGUE']])('🔴 CC6 s4 · dos correcciones, una `sigue` y otra con `para_la_pieza` %s: la rara cuenta como `esperando`, no como ausente · la pieza no sale', async (_n, valor) => {
    const rec = receptor({ para: () => 'sigue' })
    const lectura = rec.puerto.correccionesDelEncargo
    rec.puerto.correccionesDelEncargo = async (id) => {
      const r = await lectura(id)
      ;(r.cuerpo.correcciones as Array<Record<string, unknown>>).forEach((c) => { if (c.llave === 'F-0301:calendario') c.para_la_pieza = valor })
      return r
    }
    const m = await correr({ rec })
    const e = m.enc().estado_del_motor
    delete e.artefactos[ARTEFACTO_ESPERA_DE_LA_CADENA]
    const jef = Object.values(e.artefactos).find((x) => (x.datos as { jefatura?: unknown }).jefatura)!.datos as { jefatura: { sentido: { devoluciones: Array<Record<string, unknown>> } } }
    const d0 = jef.jefatura.sentido.devoluciones[0]
    jef.jefatura.sentido.devoluciones.push({ ...d0, fila_id: 'F-0301', llave: 'F-0301:calendario' })
    const bandejaAntes = m.M.llamadas.bandeja.length
    const salidasAntes = m.M.llamadas.salidas.length
    const v = await m.vigia()
    const leida = (await rec.puerto.correccionesDelEncargo(m.enc().id)).cuerpo.correcciones as Array<Record<string, unknown>>
    expect(leida.map((c) => [c.llave, c.para_la_pieza]).sort()).toEqual([['F-0300:calendario', 'sigue'], ['F-0301:calendario', valor]])
    expect(v.cuerpo).toMatchObject({ resultado_para_la_sala: 'esperando_a_la_cadena', para_la_pieza: 'esperando' })
    expect(m.M.llamadas.bandeja.length).toBe(bandejaAntes)
    expect(m.M.llamadas.salidas.length).toBe(salidasAntes)
  })
  it('🔴 19-nov · CC7 punto 3 · la misma fila ya tiene la corrección de OTRO encargo (`ya_estaba` y no está en la lectura de este): NO frena · se vuelve a mandar en cada vuelta, la pieza espera con UNA alarma y sigue la respuesta que le toque', async () => {
    const rec = receptor({ para: () => 'reemplazada' })
    // el encargo 1 de la fila dejó su corrección: el receptor la tiene con OTRO encargo_id
    rec.guardadas.set('F-0300:calendario', { llave: 'F-0300:calendario', destino: 'calendario', encargo_id: 'encargo-anterior' })
    const m = await correr({ rec })
    expect(m.r.cuerpo).toMatchObject({ resultado_para_la_sala: 'esperando_a_la_cadena', para_la_pieza: 'esperando', output_id: null, hitl_queue_id: null })
    expect(m.r.cuerpo).not.toHaveProperty('frenada')
    await m.vigia(); await m.vigia()
    // cada vuelta la vuelve a mandar (el receptor real la cubre o abre una nueva para este encargo)
    expect(rec.llamadas.filter((c) => c.llave === 'F-0300:calendario')).toHaveLength(3)
    expect(m.M.llamadas.bandeja).toEqual([])
    expect(m.alertas().filter((a) => /de otro encargo/.test(a.texto))).toHaveLength(1)
    expect(m.alertas().filter((a) => /Pieza frenada/.test(a.texto))).toEqual([])
    expect(m.espera()!.pendiente).toBe(true)
    // el receptor abre la corrección para ESTE encargo: la pieza sigue su respuesta (aquí, reemplazada) y deja de esperar
    rec.guardadas.set('F-0300:calendario', { llave: 'F-0300:calendario', destino: 'calendario', encargo_id: m.id })
    const v = await m.vigia()
    expect(v.cuerpo).toMatchObject({ para_la_pieza: 'reemplazada' })
    expect(m.espera()!.pendiente).toBe(false)
    expect(m.M.llamadas.bandeja).toEqual([])
  })
  it('🔴 mi propio reintento que vuelve `ya_estaba` SÍ está en la lectura: no es de otro encargo, se lee su `para_la_pieza`', async () => {
    const rec = receptor({ recibir: (_l, vez) => (vez === 1 ? { status: 500, cuerpo: { ok: false } } : null), para: () => 'sigue' })
    const m = await correr({ rec })
    // el primer envío llegó pero la respuesta se perdió: el receptor la guardó para ESTE encargo
    rec.guardadas.set('F-0300:calendario', { llave: 'F-0300:calendario', destino: 'calendario', encargo_id: m.id })
    const v = await m.vigia()
    expect(v.cuerpo).toMatchObject({ resultado_para_la_sala: 'encargo_en_bandeja' })
    expect(m.alertas().filter((a) => /de otro encargo/.test(a.texto))).toEqual([])
  })
  it('sin el puerto del receptor: la pieza espera y lo dice UNA vez (nunca se suelta en silencio)', async () => {
    const m = await correr({ rec: null })
    expect(m.r.cuerpo).toMatchObject({ resultado_para_la_sala: 'esperando_a_la_cadena' })
    await m.vigia()
    expect(m.alertas().filter((a) => /Sin receptor de la cadena/.test(a.texto))).toHaveLength(1)
  })
})

describe('el vigía ③ y los lectores de `resultado_para_la_sala` (medida de CC7 21:24Z)', () => {
  const dbCon = (ids: string[]) => ({ from: () => ({ select: () => ({ in: () => ({ eq: async () => ({ data: ids.map((id) => ({ id })), error: null }) }) }) }) })
  it('🔴 el vigía vuelve a correr el cierre del que espera y no toca el que ya se resolvió', async () => {
    let para: ParaLaPieza = 'esperando'
    const m = await correr({ rec: receptor({ para: () => para }) })
    para = 'sigue'
    const v = await revisarEsperasDeLaCadena(m.M.P, dbCon([m.id]) as never)
    expect(v).toEqual({ revisados: [{ encargo_id: m.id, resultado_para_la_sala: 'encargo_en_bandeja', para_la_pieza: 'sigue' }], error: null })
    const otra = await revisarEsperasDeLaCadena(m.M.P, dbCon([m.id]) as never)
    expect(otra.revisados).toEqual([]) // ya no está pendiente
    expect(m.M.llamadas.bandeja).toHaveLength(1)
  })
  it('🔴 CC7 punto 4 · regla dura rota EN LA PIEZA + devolución a la cadena que sigue esperando: 3 vueltas del vigía → UNA sola alarma de freno', async () => {
    const m = await correr()
    expect(m.espera()!.pendiente).toBe(true)
    // la misma pieza, además, rompe una regla dura propia (la que no vuelve a la cadena): el cierre la frena
    m.enc().estado_del_motor.fichas.push({ id: 'regla-6-0', origen: 'chequeo', donde: 'archivos', gravedad: 'bloquea', que: 'falta el archivo que la red exige', estado: 'abierta', dura: true } as never)
    await m.vigia()
    const frenos = () => m.alertas().filter((a) => /frenada/i.test(a.texto) && !/cadena/.test(a.texto))
    expect(frenos()).toHaveLength(1)
    expect(m.espera()!.pendiente).toBe(false)
    for (let i = 0; i < 3; i++) await revisarEsperasDeLaCadena(m.M.P, dbCon([m.id]) as never)
    expect(frenos()).toHaveLength(1)
    expect(m.M.llamadas.bandeja).toEqual([])
  })
  it('🔴 el vigía nunca lanza: una base que falla vuelve como `error`', async () => {
    const db = { from: () => ({ select: () => ({ in: () => ({ eq: async () => ({ data: null, error: { message: 'sin red' } }) }) }) }) }
    const m = await correr()
    expect(await revisarEsperasDeLaCadena(m.M.P, db as never)).toEqual({ revisados: [], error: 'leer las esperas de la cadena: sin red' })
  })
  it('🔴 el vigía nunca lanza: si leer un encargo revienta a mitad de camino, vuelve como `error` con lo ya revisado', async () => {
    const m = await correr()
    m.M.P.almacen.leerEncargo = async () => { throw new Error('se cortó la base') }
    expect(await revisarEsperasDeLaCadena(m.M.P, dbCon([m.id]) as never)).toEqual({ revisados: [], error: 'se cortó la base' })
  })
  it('🔴 flujo de la oficina (③ ¿Y ahora?): el resultado viaja tal cual a la sala, que solo lo registra · no es «encargo_en_bandeja» ni «fallido»', async () => {
    const m = await correr()
    expect(m.r.cuerpo.accion).toBe('cerrado')
    expect(m.r.cuerpo.resultado_para_la_sala).not.toMatch(/^(encargo_en_bandeja|fallido)$/)
  })
  it('🔴 reintento de piezas de la cadena (`bloqueaElReintento`): el que espera y el reemplazado cuentan como «ya llegó» · no se vuelve a pedir el brief viejo', async () => {
    for (const para of ['esperando', 'reemplazada'] as const) {
      const m = await correr({ rec: receptor({ para: () => para }) })
      const fila = { brief_id: 'BRF-0300', tipo_de_grupo: m.enc().tipo_de_grupo, estado: m.enc().estado, gasto_usd: m.enc().gasto_usd, version_encargo: m.enc().version_encargo, estado_del_motor: m.enc().estado_del_motor }
      expect(bloqueaElReintento(rastroDe(fila as never), [rastroDe(fila as never)])).toBe(true)
    }
  })
})

describe('la versión siguiente no hereda la espera', () => {
  it('🔴 `estadoParaReRevisar` deja afuera `espera_de_la_cadena` (la versión nueva consulta a la cadena desde cero)', async () => {
    const m = await correr()
    const pl = await plantillaDe(m.M.P, m.enc())
    const r = estadoParaReRevisar(pl, m.enc().estado_del_motor)
    expect(r.ok).toBe(true)
    if (r.ok) expect(Object.keys(r.estado.artefactos)).not.toContain(ARTEFACTO_ESPERA_DE_LA_CADENA)
  })
})


describe('de punta a punta con el RECEPTOR REAL de CC3 (#1150 · puerto en proceso · almacén en memoria) · CERTIFICACION-CC7 punto 3 + TOMO-CC6', () => {
  const k = { c: clienteA(), ahora: '2026-11-12T15:00:00Z', abierto: '2026-11-19', hora: '09:00' }
  const CAMP_REAL = '00000000-0000-4000-8000-0000000c4c4c'
  const CLI_REAL = '11111111-1111-4111-8111-aaaaaaaaaaaa'
  function cadenaReal() {
    const al = new AlmacenMemoria({ contextos: { [CLI_REAL]: { ...contextoDe(k.c), clientId: CLI_REAL } }, config: { flujos: ['wf-cadena', 'wf-vigia'], estado_cadena: 'encendida' } })
    const campana: Campana = {
      id: CAMP_REAL, client_id: CLI_REAL, plan_id: 'plan-1', fecha_inicio: k.c.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: k.c.campana.fecha_fin, zona_horaria: 'UTC', pais: 'pais-de-practica', sedes: k.c.sedes.map((s) => s.clave),
      estado: 'activa', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: false,
    } as Campana
    al.campanas.push(campana)
    const fila = (id: string, fecha: string, estado: string) => ({ id, tanda: 1, semana: 1, dia_semana: diaSemanaIso(fecha), fecha, hora: k.hora, red: 'instagram', formato: 'foto', pilar: 'p', tema: 't', sede: k.c.sedes[0].clave, requiere_abierto: true, depende_de: [], datos: [], pendientes: [], pide_video: false, estado, avisos: [], campana_id: CAMP_REAL, calendario_version: 1 }) as unknown as FilaDeLaCadena & { campana_id: string; calendario_version: number }
    al.filasGuardadas.push(fila('F-0300', '2026-11-15', 'en_oficina'), fila('otra', '2026-12-03', 'validada'))
    let n = 0
    al.mesaDeReubicacion = async () => ({ estado: 'abierta', encargo_id: `enc-m${++n}` })
    const puerto = puertoDeLaCadena(al, () => k.ahora)
    return { al, puerto }
  }
  it('🔴 encargo 1: la D1 llega al receptor real, espera; la reubicación tomada la deja `reemplazada` y la pieza vieja NO sale · encargo 2 de la MISMA fila (CC3 f352d81): su propia corrección, esperando → tomada → `reemplazada`', async () => {
    const { al, puerto } = cadenaReal()
    const cadena = { devolverCorreccion: puerto.devolverCorreccion, correccionesDelEncargo: puerto.correccionesDelEncargo }
    const m = await correr({ rec: null, campana: CAMP_REAL, cadena })
    expect(al.correcciones).toHaveLength(1)
    expect(al.correcciones[0]).toMatchObject({ llave: 'F-0300:calendario', encargo_id: m.id, dura: true, regla: 'D1' })
    expect(m.r.cuerpo).toMatchObject({ resultado_para_la_sala: 'esperando_a_la_cadena', para_la_pieza: 'esperando' })
    // el creador del calendario la toma: la fila se mueve y vuelve a validada
    await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v1' }, k.ahora)
    const ent = await puerto.entregarReubicacion({ campana_id: CAMP_REAL, version: VERSION_BASE_DE_CORRECCION + 1, encargo_id: 'enc-m1', texto: `- F-0300 · reubicar · ${k.abierto} · ${k.hora} · ese día ya vale la oferta\nRESPUESTA A LA JEFATURA C1: tomada`, costo_usd: 0, motivo: null })
    expect(ent, JSON.stringify({ ent, sobres: al.sobresDeReubicacion.length, corr: al.correcciones[0]?.estado })).toMatchObject({ ok: true, estado: 'aplicada' })
    const v = await m.vigia()
    expect(v.cuerpo).toMatchObject({ resultado_para_la_sala: 'reemplazada', para_la_pieza: 'reemplazada', output_id: null })
    expect(m.M.llamadas.bandeja).toEqual([])
    // encargo 2 · el brief nuevo de la misma fila (otro encargo) y la jefatura vuelve a hallar una D1 para el calendario
    al.correcciones[0].encargo_id = 'encargo-1-de-la-fila'
    const m2 = await correr({ rec: null, campana: CAMP_REAL, cadena })
    // CC3 f352d81 · con la 1.ª ya respondida, la dura del encargo 2 abre su PROPIA corrección (#2): llega a su creador, no se pierde
    expect(al.correcciones).toHaveLength(2)
    expect(m2.r.cuerpo).toMatchObject({ resultado_para_la_sala: 'esperando_a_la_cadena', para_la_pieza: 'esperando', output_id: null })
    await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v2' }, k.ahora)
    const ent2 = await puerto.entregarReubicacion({ campana_id: CAMP_REAL, version: VERSION_BASE_DE_CORRECCION + 2, encargo_id: 'enc-m2', texto: `- F-0300 · reubicar · 2026-11-26 · ${k.hora} · la oferta sigue cerrada el 19
RESPUESTA A LA JEFATURA C1: tomada`, costo_usd: 0, motivo: null })
    expect(ent2, JSON.stringify(ent2)).toMatchObject({ ok: true, estado: 'aplicada' })
    const v2 = await m2.vigia()
    expect(v2.cuerpo).toMatchObject({ resultado_para_la_sala: 'reemplazada', para_la_pieza: 'reemplazada' })
    expect(m2.M.llamadas.bandeja).toEqual([])
    // la red de la oficina (`de otro encargo`) no se dispara cuando el receptor ya resuelve el hueco
    expect(m2.alertas().filter((x) => /de otro encargo/.test(x.texto))).toEqual([])
  })
})
