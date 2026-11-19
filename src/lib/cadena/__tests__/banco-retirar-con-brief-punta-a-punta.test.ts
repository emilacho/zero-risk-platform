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
    expect(filaDe(al, FILA).idea_ref).not.toBe(IDEA)
    expect(filaDe(al, FILA).estado).toBe('briefeada')
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
