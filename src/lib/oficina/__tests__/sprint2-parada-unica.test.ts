/**
 * 17-nov · DECISIÓN Lenovo 00:51 (`2026-11-17-DECISION-LENOVO-a-CC1-CC2-CC6-parada-unica.md`) · la parada del dueño es ÚNICA:
 *  · con la propuesta ya aprobada, si un paso posterior devuelve el trabajo a la mesa (`vuelve_a`), la mesa corrige SOLO la elegida: UN guion, sin volver a presentar
 *    propuestas ni a parar;
 *  · excepción: si la corrección obligaría a cambiar el concepto aprobado, la dirección escribe la mejor versión fiel al concepto y lo dice («Aviso de concepto: …»);
 *    el aviso va al guion (la ficha) y el encargo sigue, sin pedir otra aprobación.
 * La vuelta se provoca con el paso `pedido` (ya tiene `vuelve_a` a la mesa): la propuesta aprobada nombra una foto que no existe.
 */
import { describe, expect, it } from 'vitest'
import { escribirHoja } from '@/lib/cadena/hoja'
import { VOZ_DEL_GANCHO } from '../mesa/pedidos'
import { alLlegarAlPaso, avisoDeLaParadaUnica, avisosDeConcepto, propuestaAprobada, ROTULO_AVISO_DE_CONCEPTO } from '../video/aprobacion'
import { faseDeLaProduccion, type PropuestaDeVideo } from '../video/propuestas'
import { abrirEncargo, recibirDecisionDelDueno, type Respuesta } from '../orquestador'
import { VIDEO_MESA } from '../plantillas/video-mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { Estado, Paso, Plantilla } from '../tipos'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { jugar, type Turno } from './mesa-arnes'
import { crearMesaEnMemoria } from './mesa-memoria'
import { INSUMOS, TRAS_2012 } from './mesa-de-video-t8.test'
import { PROPUESTA } from './sprint2-hoja-de-planos-y-propuestas.test'

const PASO_APROBAR: Paso = {
  clave: 'aprobar_propuestas', tipo: 'codigo', quien: 'sala', funcion: 'aprobar_propuestas', condicion: { tipo: 'siempre' }, entrada: ['mesa'], salida_artefacto: 'aprobacion_propuestas', tope_usd: 0,
  vuelve_a: { paso: 'mesa', max: 2, si: { tipo: 'si_artefacto', artefacto: 'aprobacion_propuestas', campo: 'vuelve_a_la_mesa', igual: true } },
}
const PLANTILLA: Plantilla = (() => {
  const i = VIDEO_MESA.pasos.findIndex((p) => p.clave === 'mesa')
  return { ...VIDEO_MESA, pasos: [...VIDEO_MESA.pasos.slice(0, i + 1), PASO_APROBAR, ...VIDEO_MESA.pasos.slice(i + 1)], limites: { ...VIDEO_MESA.limites, video: { ...(VIDEO_MESA.limites.video as Record<string, unknown>), segundos_min: 6, segundos_max: 15, propuestas: 3 } } }
})()

/** P2 nombra una foto que no existe ⇒ al aprobarla, el paso `pedido` devuelve el trabajo a la mesa */
const CON_FOTO_INEXISTENTE = (md: string) => md.replace('Producto: no', 'Producto: no\nFoto: zzzz9999')
const TRES = [PROPUESTA(1, 'El vapor', 12), CON_FOTO_INEXISTENTE(PROPUESTA(2, 'La mesa larga', 15)), PROPUESTA(3, 'La puerta', 10)].join('\n')
/** la corrección de la elegida: UN guion (sin «# Propuesta»), con la foto quitada */
const UNO = (extra: string[] = []) => [PROPUESTA(2, 'La mesa larga corregida', 15).split('\n').slice(1).join('\n'), ...extra].join('\n')
const CITAS = ['# Citas', 'A2 usé: lo tomé', 'A3 usé: lo tomé', 'A4 usé: lo tomé', 'A5 usé: lo tomé', 'A6 usé: lo tomé']

async function montar(correccion: string) {
  const M = crearMemoria({ parte: escribirHoja(INSUMOS).texto_md, plantilla: PLANTILLA })
  const MS = crearMesaEnMemoria(TRAS_2012)
  M.P.mesa = MS
  const enviados: Array<Record<string, unknown>> = []
  M.P.video = { enviar: async (p) => { enviados.push(p as unknown as Record<string, unknown>); return { ok: true, request_id: 'r', status: 'simulado', costo_estimado_usd: 1, costo_lista_usd: 1, descuento_pct: 0, simulado: true } }, estado: async () => ({ ok: true, simulado: true }) }
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'F1-S1-ig-r1', dry_run: true, familia: 'video_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  let aprobado = false
  const tareas: string[] = []
  const responder = (t: Turno) => {
    if (t.tipo === 'dirigir') return { texto: 'Idea rectora: tres caminos para el pan.' }
    if (t.tipo === 'aportar') return { texto: t.agente === VOZ_DEL_GANCHO ? 'Gancho: el vapor.' : `Aporte de ${t.agente}.` }
    if (t.tipo === 'responder') return { texto: 'Entendido: corrijo la propuesta aprobada.' }
    if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') { tareas.push(t.task); return { texto: [aprobado ? correccion : TRES, ...CITAS].join('\n') } }
    return { texto: `Respuesta de ${t.agente}.` }
  }
  const seguir = (r: Respuesta) => jugar(M, id, r, responder, 120)
  const primera = await seguir(a)
  /** el dueño aprueba: desde aquí la dirección contesta con la corrección de la elegida */
  let antes = 0
  const aprobar = (propuesta_id = 'P2') => { aprobado = true; antes = tareas.length; return recibirDecisionDelDueno(M.P, id, { decision: 'aprobar', ronda: 1, propuesta_id }) }
  return { M, MS, id, enviados, seguir, tareas, primera, aprobar, tareasTrasAprobar: () => tareas.slice(antes) }
}
const estado = (T: Awaited<ReturnType<typeof montar>>) => T.M.encargos.get(T.id)!.estado_del_motor
const datos = <X = Record<string, unknown>>(e: Estado, tipo: string) => e.artefactos[tipo]?.datos as X

describe('la parada del dueño es ÚNICA · la mesa vuelve DESPUÉS de aprobar', () => {
  it('🔴 la revisión devuelve el trabajo tras aprobar P2 ⇒ la mesa corrige SOLO la elegida (un guion) y el encargo NO vuelve a esperar al dueño', async () => {
    const T = await montar(UNO())
    expect(T.primera.ultima.cuerpo).toMatchObject({ accion: 'esperar_dueno', ronda: 1 })
    const d = await T.aprobar()
    const { ultima, turnos } = await T.seguir(d)
    const e = estado(T)
    // la vuelta ocurrió (el pedido halló una foto que no existe) y la mesa integró otra vez
    expect(e.vueltas['pedido']).toBe(1)
    expect(T.tareasTrasAprobar().length).toBeGreaterThan(0)
    // NUNCA otra parada: ningún turno del dueño después de la decisión, el encargo cierra
    expect(turnos.some((t) => (t as { tipo: string }).tipo === 'dueno')).toBe(false)
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    // la aprobación sigue «aprobada» (P2) y la fase sigue final; las propuestas que vio el dueño no cambian (ronda 1)
    expect(datos(e, 'aprobacion_propuestas')).toMatchObject({ estado: 'aprobada', propuesta_id: 'P2', ronda: 1 })
    expect(faseDeLaProduccion(e)).toBe('final')
    expect(datos<{ ronda: number; propuestas: unknown[] }>(e, 'propuestas_video')).toMatchObject({ ronda: 1 })
    expect(datos<{ propuestas: unknown[] }>(e, 'propuestas_video').propuestas).toHaveLength(3)
    // el guion vigente es la corrección de la mesa (no la propuesta vieja), y el video se pide UNA vez, con ella
    expect(datos<{ texto: string }>(e, 'guion').texto).toContain('La mesa larga corregida')
    expect(datos<{ texto: string }>(e, 'guion').texto).not.toContain('zzzz9999')
    expect(T.enviados).toHaveLength(1)
  })
  it('🔴 la dirección recibe la propuesta aprobada UNA vez y se le pide UN guion, no N propuestas', async () => {
    const T = await montar(UNO())
    await T.seguir(await T.aprobar())
    const avisos = T.MS.filas.filter((x) => x.encargo_id === T.id && x.tipo === 'devuelve' && x.de === 'oficina-creativa')
    const delAprobado = avisos.filter((x) => x.texto.includes('YA APROBÓ'))
    expect(delAprobado).toHaveLength(1)
    expect(delAprobado[0].texto).toContain('P2 · «La mesa larga»')
    expect(delAprobado[0].texto).toContain('Foto: zzzz9999')
    // va ANTES del aviso de la vuelta (la dirección sabe qué corregir antes de leer el porqué)
    const iAprobado = avisos.indexOf(delAprobado[0])
    expect(avisos.findIndex((x) => x.texto.includes('zzzz9999') && !x.texto.includes('YA APROBÓ'))).toBeGreaterThan(iAprobado)
    // antes de aprobar se pedían las propuestas; después, cada pedido a la mesa es el de un solo guion
    expect(T.tareas[0]).toMatch(/PROPUESTAS COMPLETAS/)
    const tras = T.tareasTrasAprobar()
    expect(tras.length).toBeGreaterThan(0)
    // (el tablero que ven todavía muestra la integración vieja con «# Propuesta N»: lo que cambia es lo que se les PIDE)
    for (const t of tras) expect(t).not.toMatch(/PROPUESTAS COMPLETAS/)
  })
  it('🔴 excepción · la corrección pedía cambiar el concepto: el aviso va al guion (la ficha) y el encargo sigue sin pedir otra aprobación', async () => {
    const T = await montar(UNO([`${ROTULO_AVISO_DE_CONCEPTO} quitar la foto obligaba a perder la mesa larga; la mantengo con otra toma.`]))
    const { ultima } = await T.seguir(await T.aprobar())
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado' })
    const avisos = datos<{ avisos: string[] }>(estado(T), 'guion').avisos
    expect(avisos).toContain('la corrección pedía cambiar el concepto aprobado: quitar la foto obligaba a perder la mesa larga; la mantengo con otra toma.')
  })
  it('sin la excepción, el guion no trae aviso de concepto', async () => {
    const T = await montar(UNO())
    await T.seguir(await T.aprobar())
    expect(datos<{ avisos: string[] }>(estado(T), 'guion').avisos.some((a) => a.includes('concepto aprobado'))).toBe(false)
  })
  it('🔴 un video SIN propuestas (la plantilla de hoy) no lee «Aviso de concepto»: el guion queda con sus avisos de siempre', async () => {
    const M = crearMemoria({ parte: escribirHoja(INSUMOS).texto_md, plantilla: VIDEO_MESA })
    M.P.mesa = crearMesaEnMemoria(TRAS_2012)
    M.P.video = { enviar: async () => ({ ok: true, request_id: 'r', status: 'simulado', costo_estimado_usd: 1, costo_lista_usd: 1, descuento_pct: 0, simulado: true }), estado: async () => ({ ok: true, simulado: true }) }
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'F1-S1-ig-r1', dry_run: true, familia: 'video_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(a.cuerpo.encargo_id)
    const solo = [UNO([`${ROTULO_AVISO_DE_CONCEPTO} esto no viene de una aprobación`]), ...CITAS].join('\n')
    await jugar(M, id, a, (t: Turno) => (t.tipo === 'dirigir' ? { texto: 'Idea.' } : t.tipo === 'aportar' ? { texto: t.agente === VOZ_DEL_GANCHO ? 'Gancho: el vapor.' : 'Aporte.' } : t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? { texto: solo } : { texto: 'ok' }), 120)
    const g = datos<{ avisos: string[] }>(M.encargos.get(id)!.estado_del_motor, 'guion')
    expect(g).toBeDefined()
    expect(g.avisos.some((x) => x.includes('concepto aprobado'))).toBe(false)
    expect(g.avisos).not.toContain('x')
  })
})

const P = (id: string): PropuestaDeVideo => ({ id, nombre: `N${id}`, concepto: `C${id}`, segundos: 10, red: 'instagram', objetivo: 'o', por_que: 'p', guion: {} as PropuestaDeVideo['guion'], texto: `# ${id}` })
const E = (aprobacion: Record<string, unknown> | null): Pick<Estado, 'artefactos'> => ({
  artefactos: {
    propuestas_video: { version: 1, datos: { ronda: 1, propuestas: [P('P1'), P('P2')], citas: '', avisos: [] } },
    ...(aprobacion ? { aprobacion_propuestas: { version: 1, datos: aprobacion } } : {}),
  } as unknown as Estado['artefactos'],
})

describe('las piezas puras', () => {
  it('🔴 alLlegarAlPaso: ya aprobada ⇒ pasa de largo SIN tocar la aprobación; observaciones o sin decisión ⇒ espera', () => {
    const s = alLlegarAlPaso(E({ estado: 'aprobada', propuesta_id: 'P2', ronda: 1 }))
    expect('saltar' in s && s.saltar.artefacto).toEqual({ estado: 'aprobada', propuesta_id: 'P2', ronda: 1, vuelve_a_la_mesa: false, ya_aprobada: true })
    expect('saltar' in s && s.saltar.otros_artefactos).toBeUndefined()
    expect(alLlegarAlPaso(E({ estado: 'observaciones', observaciones: 'x', ronda: 1 }))).toEqual({ esperar: true, ronda: 1 })
    // solo «aprobada» salta: unas observaciones que nombran una propuesta siguen esperando
    expect(alLlegarAlPaso(E({ estado: 'observaciones', propuesta_id: 'P2', observaciones: 'x', ronda: 1 }))).toEqual({ esperar: true, ronda: 1 })
    expect(alLlegarAlPaso(E(null))).toEqual({ esperar: true, ronda: 1 })
  })
  it('una aprobación que nombra una propuesta que ya no está ⇒ espera (no se adivina)', () => {
    expect(alLlegarAlPaso(E({ estado: 'aprobada', propuesta_id: 'P9', ronda: 1 }))).toEqual({ esperar: true, ronda: 1 })
    expect(propuestaAprobada(E({ estado: 'aprobada', propuesta_id: 'P9', ronda: 1 }))).toBeNull()
  })
  it('propuestaAprobada: solo con «aprobada»', () => {
    expect(propuestaAprobada(E({ estado: 'aprobada', propuesta_id: 'P2', ronda: 1 }))?.id).toBe('P2')
    expect(propuestaAprobada(E({ estado: 'observaciones', ronda: 1 }))).toBeNull()
    expect(propuestaAprobada(E(null))).toBeNull()
    expect(propuestaAprobada({ artefactos: {} as Estado['artefactos'] })).toBeNull()
  })
  it('avisoDeLaParadaUnica: nombra la elegida, pide UN guion y trae su texto y la regla del concepto', () => {
    const t = avisoDeLaParadaUnica(P('P2'))
    expect(t).toContain('P2 · «NP2»')
    expect(t).toContain('UN guion')
    expect(t).toContain('No escribas «# Propuesta N»')
    expect(t).toContain(ROTULO_AVISO_DE_CONCEPTO)
    expect(t.endsWith('# P2')).toBe(true)
  })
  it('avisosDeConcepto: la línea con el rótulo (con o sin negritas o viñeta); sin ella, nada', () => {
    expect(avisosDeConcepto(`Plano 1\n${ROTULO_AVISO_DE_CONCEPTO} cambia la red`)).toEqual(['la corrección pedía cambiar el concepto aprobado: cambia la red'])
    expect(avisosDeConcepto('- **Aviso de concepto:** otra toma**')).toEqual(['la corrección pedía cambiar el concepto aprobado: otra toma'])
    expect(avisosDeConcepto('Aviso de concepto :  dos')).toEqual(['la corrección pedía cambiar el concepto aprobado: dos'])
    expect(avisosDeConcepto('el concepto se mantiene')).toEqual([])
    expect(avisosDeConcepto('Aviso de concepto aprobado por todos')).toEqual([])
    expect(avisosDeConcepto(`${ROTULO_AVISO_DE_CONCEPTO}   `)).toEqual([])
  })
})
