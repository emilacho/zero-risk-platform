/**
 * 19-nov · firma de Emilio (vía Lenovo 22:30Z) · CC1 · coordinado con CC3 (DISEÑO del receptor, nota 00:2xZ): una corrección del banco que RETIRA la idea, por el reloj real.
 *   La fila con brief recibe OTRA idea del capítulo (puerto de CC1) y vuelve a «lista_para_brief» por el RECEPTOR de CC3 (con su marca): el brief nuevo sale con la idea nueva,
 *   la pieza vieja queda reemplazada. La armazón es la de correcciones-banco-punta-a-punta (CC3). US$ 0, sin modelo, sin red.
 */
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import { BANCO_NAUFRAGO_V4 } from '../__fixtures__/banco-naufrago-v4'
import type { ConceptoGuardado } from '../almacen'
import type { Fila } from '../tipos'
import { relojDeLaCadena } from '../reloj'
import { INTERRUPTOR_DEL_BANCO, recibirCorreccionDelBanco } from '../banco-correcciones'
import { ACCIONES } from '../acciones'
import { bloqueaLaPieza } from '../correcciones'
import { bancoRetirar, motivoDePiezaVieja, textoDeAlarmaDePiezaVieja } from '../banco-de-ideas'

const A = clienteA()
const CAMP = '28de888e-b3f2-4aca-86b3-2c7f7bf6685a'
const T0 = '2026-11-17T21:00:00Z'
const mas = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString()
const VIGIA = { workflow_id: 'wf-vigia', workflow_execution_id: 'v1' }
const FILA = 's2-d4-jue_foto_olon'
const IDEA = 'C1-I16'

const fila = (id: string, estado: Fila['estado'], idea_ref: string | null, fecha: string) => ({
  campana_id: CAMP, calendario_version: 1, id, tanda: 1, semana: 1, dia_semana: 4, fecha, hora: '09:00', red: 'instagram', formato: 'foto', pilar: null, tema: null, sede: null,
  requiere_abierto: false, depende_de: [], datos: [], pendientes: [], pieza_fija: null, origen: 'patron' as const, estado, avisos: [], idea_ref, concepto: null,
})

function almacen() {
  const al = new AlmacenMemoria({
    contextos: { [A.clientId]: contextoDe(A) },
    config: { flujos: ['wf-cadena', 'wf-vigia'], estado_cadena: 'encendida', [INTERRUPTOR_DEL_BANCO]: true },
  })
  al.campanas.push({ id: CAMP, client_id: A.clientId, plan_id: 'plan-1', fecha_inicio: '2026-11-09', fecha_inicio_origen: 'regla', fecha_fin: '2027-02-06', zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: ['olon'], estado: 'activa', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: false })
  const base = { campana_id: CAMP, brief_devuelto: null, motivo: null, costo_usd: 5.34, plazo_en: null, encargo_id: null, hitl_id: null, nota_de_emilio: null, apunta_a: null, decidido_en: '2026-11-10T14:03:30Z', seco: false }
  al.conceptos.push({ ...base, version: 4, estado: 'lista', aprobacion: 'aprobado', texto_md: BANCO_NAUFRAGO_V4.map((i) => i.linea).join('\n'), leido: { gran_idea: { nombre: 'El náufrago', frase: 'algo mejor que el oro' }, capitulos: [], banco: structuredClone(BANCO_NAUFRAGO_V4), banco_parcial: [] } } as ConceptoGuardado)
  al.filasGuardadas.push(fila(FILA, 'briefeada', IDEA, '2026-11-19'), fila('s3-d4-jue_foto_olon', 'validada', IDEA, '2026-11-26'), fila('s1-otra', 'briefeada', 'C1-I07', '2026-11-12'))
  const porVersion = new Map<string, string>()
  al.mesaDelBanco = async (s) => { const k = `${s.campana_id}:${s.version}`; if (!porVersion.has(k)) porVersion.set(k, `enc-${porVersion.size + 1}`); return { estado: 'abierta', encargo_id: porVersion.get(k)! } }
  const entrega = (texto: string, ahora: string) => { const s = al.sobresDelBanco.at(-1)!; return recibirCorreccionDelBanco(al, { campana_id: s.campana_id, version: s.version, encargo_id: porVersion.get(`${s.campana_id}:${s.version}`)!, texto, costo_usd: 0.6, motivo: null }, ahora) }
  return { al, entrega }
}
const devolver = (al: AlmacenMemoria, extra: Record<string, unknown> = {}) =>
  ACCIONES.correcciones.recibir(al, { workflow_id: 'wf-cadena', workflow_execution_id: 'e1', campana_id: CAMP, fila_id: FILA, destino: 'hoja', campo_de_la_hoja: 'MENSAJE (uno)', motivo: 'el mensaje vende Olón como abierto en una fecha en que está cerrado', linea_de_la_ficha: 'olon · cierre_retiro · cerrada desde 2026-11-20', encargo_id: 'enc-pieza', dura: true, regla: 'D1', ...extra }, T0)
const bloque = (o: unknown) => `Leí la corrección.\n\n\`\`\`json\n${JSON.stringify(o)}\n\`\`\``
const paraLaPiezaDe = async (al: AlmacenMemoria) => ((await ACCIONES.correcciones.del_encargo(al, { encargo_id: 'enc-pieza' }, T0)).cuerpo as { correcciones: Array<{ para_la_pieza: string; bloquea_la_pieza: boolean }> }).correcciones.map((c) => c.para_la_pieza)
const filaDe = (al: AlmacenMemoria, id: string) => al.filasGuardadas.find((f) => f.id === id)!

describe('19-nov · retirar por corrección, de punta a punta: la fila con brief cambia de idea y vuelve al brief por el receptor', () => {
  it('🔴 tomada «retirar»: la fila briefeada recibe otra idea del capítulo, vuelve a «lista_para_brief» CON la marca del receptor y la pieza vieja queda reemplazada', async () => {
    const { al, entrega } = almacen()
    expect((await devolver(al)).status).toBe(201)
    await relojDeLaCadena(al, VIGIA, T0)
    expect(al.sobresDelBanco).toHaveLength(1)
    expect(await entrega(bloque({ respuesta: 'tomada', accion: 'retirar', explicacion: 'la idea vende Olón abierto en una fecha en que está cerrado' }), mas(5))).toMatchObject({ ok: true })
    await relojDeLaCadena(al, VIGIA, mas(6))
    const c = al.correcciones[0]
    expect(c).toMatchObject({ estado: 'respondida', respuesta: 'tomada' })
    const f = filaDe(al, FILA)
    expect(f.estado).toBe('lista_para_brief')
    // la idea NUEVA (no la retirada): el brief que se rehace ya no realiza la idea que la jefatura sacó
    expect(f.idea_ref).not.toBe(IDEA)
    expect(f.idea_ref).toMatch(/^C1-I\d{2}$/)
    expect(f.avisos.some((x) => x.includes(`corrección ${c.llave}`))).toBe(true)
    expect((c.version_nueva as { filas_al_brief: string[] }).filas_al_brief).toEqual([FILA])
    expect(await paraLaPiezaDe(al)).toEqual(['reemplazada'])
    // la que no tenía brief también cambió de idea y no cambió de estado; la de otra idea no se toca
    expect(filaDe(al, 's3-d4-jue_foto_olon')).toMatchObject({ estado: 'validada' })
    expect(filaDe(al, 's3-d4-jue_foto_olon').idea_ref).not.toBe(IDEA)
    expect(filaDe(al, 's1-otra')).toMatchObject({ estado: 'briefeada', idea_ref: 'C1-I07' })
    // el puerto NO movió el estado: la única vuelta al brief es la del receptor (no está el aviso del tablero)
    expect(f.avisos.some((x) => x.includes('desde el tablero'))).toBe(false)
    expect(al.alarmasEnviadas).toEqual([])
    // una sola vuelta: otra vuelta del reloj no mueve nada más
    const antes = structuredClone(f)
    await relojDeLaCadena(al, VIGIA, mas(30))
    expect(filaDe(al, FILA)).toEqual(antes)
  })
})

describe('19-nov · 🔴 condición de CC3 (00:21Z): el retiro se corta DESPUÉS de reasignar y ANTES de escribir el concepto', () => {
  it('🔴 repetirlo recupera la fila con brief por su aviso: termina en «lista_para_brief» con la marca del receptor y la pieza vieja reemplazada', async () => {
    const { al, entrega } = almacen()
    await devolver(al)
    await relojDeLaCadena(al, VIGIA, T0)
    // el corte: el proceso se cae al escribir el concepto (las filas ya recibieron la idea nueva; el historial no se escribió)
    const real = al.actualizarConceptoSiSello.bind(al)
    let cortado = true
    al.actualizarConceptoSiSello = async (...a: Parameters<typeof real>) => { if (cortado) throw new Error('corte'); return real(...a) }
    const texto = bloque({ respuesta: 'tomada', accion: 'retirar', explicacion: 'la idea vende Olón abierto en una fecha en que está cerrado' })
    await expect(entrega(texto, mas(5))).rejects.toThrow('corte')
    // 19-nov · CC3 00:59Z · la vuelta va primero: tras el corte la fila ya está SIN brief (con la idea nueva y la marca del receptor), nunca brief viejo + idea nueva
    expect(filaDe(al, FILA).idea_ref).not.toBe(IDEA)
    expect(filaDe(al, FILA).estado).toBe('lista_para_brief')
    expect(filaDe(al, FILA).avisos.some((x) => x.includes(`corrección ${al.correcciones[0].llave}`))).toBe(true)
    // vuelve la escritura: la entrega se repite (la ruta respondió 500 y n8n reintenta) y la fila con brief NO se pierde
    cortado = false
    expect(await entrega(texto, mas(6))).toMatchObject({ ok: true })
    for (let k = 7; k <= 40 && al.correcciones[0].estado !== 'respondida'; k += 3) await relojDeLaCadena(al, VIGIA, mas(k))
    const c = al.correcciones[0]
    expect(c).toMatchObject({ estado: 'respondida', respuesta: 'tomada' })
    const f = filaDe(al, FILA)
    expect(f.estado).toBe('lista_para_brief')
    expect(f.idea_ref).not.toBe(IDEA)
    expect(f.avisos.some((x) => x.includes(`corrección ${c.llave}`))).toBe(true)
    expect((c.version_nueva as { filas_al_brief: string[]; con_brief_sin_tocar: string[] }).filas_al_brief).toEqual([FILA])
    expect(await paraLaPiezaDe(al)).toEqual(['reemplazada'])
  })
})

describe('19-nov · decisión A de Lenovo (🔴 de CC7): la pieza vieja de una fila que volvió al brief se ARCHIVA sola, nunca una que Emilio ya decidió', () => {
  const pieza = (fila_id: string, hitl_id: string, status: string) => ({ campana_id: CAMP, fila_id, hitl_id, status, archivada_en: null as string | null, archivo_motivo: null as string | null })
  it('🔴 por la CORRECCIÓN: se archiva la pieza de la OTRA fila que volvió; la de la fila corregida no (la maneja la oficina: «reemplazada»); la aprobada no se toca', async () => {
    const { al, entrega } = almacen()
    al.filasGuardadas.push(fila('s2-otra-con-brief', 'briefeada', IDEA, '2026-11-20'), fila('s2-aprobada', 'aprobada', IDEA, '2026-11-21'))
    al.piezasEnBandeja.push(pieza(FILA, 'h-fila', 'pending'), pieza('s2-otra-con-brief', 'h-otra', 'pending'), pieza('s2-aprobada', 'h-aprobada', 'approved'))
    await devolver(al)
    await relojDeLaCadena(al, VIGIA, T0)
    expect(await entrega(bloque({ respuesta: 'tomada', accion: 'retirar', explicacion: 'la idea vende Olón abierto en una fecha en que está cerrado' }), mas(5))).toMatchObject({ ok: true })
    await relojDeLaCadena(al, VIGIA, mas(6))
    const c = al.correcciones[0]
    expect(c).toMatchObject({ estado: 'respondida', respuesta: 'tomada' })
    const vn = c.version_nueva as { filas_al_brief: string[]; piezas_viejas: { archivadas: string[] } }
    expect([...vn.filas_al_brief].sort()).toEqual([FILA, 's2-otra-con-brief'].sort())
    expect(vn.piezas_viejas).toMatchObject({ archivadas: ['h-otra'], ya_archivadas: [], no_archivadas: [] })
    const porId = (id: string) => al.piezasEnBandeja.find((p) => p.hitl_id === id)!
    expect(porId('h-otra')).toMatchObject({ archivada_en: mas(6), archivo_motivo: motivoDePiezaVieja(IDEA) })
    expect(porId('h-otra').archivo_motivo).toBe('reemplazada: la idea «C1-I16» se retiró del banco')
    expect(porId('h-fila')).toMatchObject({ archivada_en: null, status: 'pending' })
    expect(porId('h-aprobada')).toMatchObject({ archivada_en: null, status: 'approved' })
    expect(await paraLaPiezaDe(al)).toEqual(['reemplazada'])
    // la oficina solo recibió las filas que volvieron, sin la corregida
    expect(al.archivosDePiezas).toEqual([{ campana_id: CAMP, fila_ids: ['s2-otra-con-brief'], motivo: motivoDePiezaVieja(IDEA) }])
  })
  it('🔴 por el TABLERO: se archiva la pieza pendiente de la fila que volvió; la que Emilio ya decidió se declara y no se toca; repetir no duplica', async () => {
    const { al } = almacen()
    // «s2-sin-marca» volvió al brief por OTRA razón (sin la marca de este retiro): su pieza no es de este retiro y no se toca
    al.filasGuardadas.push(fila('s2-decidida', 'en_oficina', IDEA, '2026-11-20'), { ...fila('s2-sin-marca', 'lista_para_brief', 'C1-I07', '2026-11-22'), avisos: ['volvió al brief por otra cosa'] })
    al.piezasEnBandeja.push(pieza(FILA, 'h-fila', 'pending'), pieza('s2-decidida', 'h-decidida', 'edited'), pieza('s1-otra', 'h-ajena', 'pending'), pieza('s2-sin-marca', 'h-sin-marca', 'pending'))
    const tablero = { workflow_id: 'tablero', workflow_execution_id: 'tablero:banco:1', campana_id: CAMP, version: 4, idea_id: IDEA }
    const r = await bancoRetirar(al, tablero, mas(1))
    expect(r.status).toBe(200)
    expect(r.cuerpo.piezas_viejas).toEqual({ archivadas: ['h-fila'], ya_archivadas: [], no_archivadas: [{ fila_id: 's2-decidida', hitl_id: 'h-decidida', motivo: 'decidida_por_emilio', estado: 'edited' }] })
    expect((r.cuerpo.historial as Array<Record<string, unknown>>).at(-1)!.piezas_viejas).toEqual(r.cuerpo.piezas_viejas)
    const porId = (id: string) => al.piezasEnBandeja.find((p) => p.hitl_id === id)!
    expect(porId('h-fila')).toMatchObject({ archivada_en: mas(1), archivo_motivo: 'reemplazada: la idea «C1-I16» se retiró del banco' })
    expect(porId('h-decidida')).toMatchObject({ archivada_en: null, status: 'edited' })
    expect(porId('h-ajena')).toMatchObject({ archivada_en: null })
    expect(porId('h-sin-marca')).toMatchObject({ archivada_en: null })
    expect(al.archivosDePiezas.map((a) => [...a.fila_ids].sort())).toEqual([[FILA, 's2-decidida'].sort()])
    for (const id of [FILA, 's2-decidida']) expect(filaDe(al, id).estado).toBe('lista_para_brief')
    // repetir: la idea ya salió; lo archivado se cuenta como ya archivado, nada se escribe dos veces
    const r2 = await bancoRetirar(al, tablero, mas(2))
    expect(r2.cuerpo).toMatchObject({ code: 'E-IDEA-RETIRADA', piezas_viejas: { archivadas: [], ya_archivadas: ['h-fila'] } })
    expect(porId('h-fila').archivada_en).toBe(mas(1))
  })
  it('🔴 si la oficina no contesta, NADA se da por archivado y se dice; el retiro sigue', async () => {
    const { al } = almacen()
    al.archivarPiezasDeFilas = async () => ({ ok: false, motivo: 'no se pudo leer la bandeja: caída' })
    const r = await bancoRetirar(al, { workflow_id: 'tablero', workflow_execution_id: 'tablero:banco:2', campana_id: CAMP, version: 4, idea_id: IDEA }, mas(1))
    expect(r.status).toBe(200)
    expect(r.cuerpo.piezas_viejas).toEqual({ archivadas: [], ya_archivadas: [], no_archivadas: [], error: 'no se pudo leer la bandeja: caída', alarma: 'enviada' })
    expect(filaDe(al, FILA).estado).toBe('lista_para_brief')
    // «se dice» de verdad: UNA alarma con la campaña, las filas y el motivo
    expect(al.alarmasEnviadas).toEqual([textoDeAlarmaDePiezaVieja(CAMP, [FILA], motivoDePiezaVieja(IDEA), 'no se pudo leer la bandeja: caída')])
    expect(al.alarmasEnviadas[0]).toContain('no la apruebes')
  })
  it('🟡 CC3 01:31Z · por la CORRECCIÓN con la oficina caída: la corrección se cierra igual y sale UNA alarma (nadie lee el campo después de «respondida»)', async () => {
    const { al, entrega } = almacen()
    al.filasGuardadas.push(fila('s2-otra-con-brief', 'briefeada', IDEA, '2026-11-20'))
    al.archivarPiezasDeFilas = async () => ({ ok: false, motivo: 'la oficina no contestó: caída' })
    await devolver(al)
    await relojDeLaCadena(al, VIGIA, T0)
    await entrega(bloque({ respuesta: 'tomada', accion: 'retirar', explicacion: 'la idea vende Olón abierto en una fecha en que está cerrado' }), mas(5))
    await relojDeLaCadena(al, VIGIA, mas(6))
    const c = al.correcciones[0]
    expect(c).toMatchObject({ estado: 'respondida', respuesta: 'tomada' })
    expect((c.version_nueva as { piezas_viejas: unknown }).piezas_viejas).toMatchObject({ error: 'la oficina no contestó: caída', alarma: 'enviada' })
    expect(al.alarmasEnviadas).toEqual([textoDeAlarmaDePiezaVieja(CAMP, ['s2-otra-con-brief'], motivoDePiezaVieja(IDEA), 'la oficina no contestó: caída')])
    // otra vuelta del reloj no repite la alarma (la corrección ya está cerrada)
    await relojDeLaCadena(al, VIGIA, mas(30))
    expect(al.alarmasEnviadas).toHaveLength(1)
  })
  it('🟢 si la alarma tampoco sale, se anota «no_salio» (no se da por avisado)', async () => {
    const { al } = almacen()
    al.archivarPiezasDeFilas = async () => ({ ok: false, motivo: 'caída' })
    al.falloDeAviso = 'slack caído'
    const r = await bancoRetirar(al, { workflow_id: 'tablero', workflow_execution_id: 'tablero:banco:3', campana_id: CAMP, version: 4, idea_id: IDEA }, mas(1))
    expect(r.cuerpo.piezas_viejas).toMatchObject({ error: 'caída', alarma: 'no_salio' })
  })
})
