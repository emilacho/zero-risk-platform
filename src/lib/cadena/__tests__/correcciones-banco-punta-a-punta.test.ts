/**
 * 17-nov · 🟡 CC6 #1150 · eslabón 2 · el banco DE PUNTA A PUNTA por el reloj real: devolución → receptor → puerto del banco de CC1 (#1149) → mesa → entrega → respuesta
 *   · tomada: la idea se escribe en el banco, las filas con brief vuelven a «lista_para_brief» (Lenovo) y la pieza vieja queda reemplazada (no sale)
 *   · dura no tomada dos veces: la pieza sigue frenada y sale UNA alarma
 * Base de práctica: la del banco de CC1 (ideas reales de la v4 aprobada). US$ 0, sin modelo, sin red.
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

describe('el banco de punta a punta por el reloj', () => {
  it('🔴 tomada: el reloj abre la mesa del banco, la idea se escribe, la fila con brief vuelve a «lista_para_brief» y la pieza vieja queda REEMPLAZADA (no sale)', async () => {
    const { al, entrega } = almacen()
    expect((await devolver(al)).status).toBe(201)
    expect(al.correcciones[0]).toMatchObject({ llave: `${FILA}:hoja`, destino: 'banco', idea_id: IDEA, regla: 'D1', dura: true })
    await relojDeLaCadena(al, VIGIA, T0)
    expect(al.sobresDelBanco).toHaveLength(1)
    expect(al.correcciones[0].estado).toBe('en_manos_del_creador')
    expect(bloqueaLaPieza(al.correcciones[0])).toBe(true)
    expect(await paraLaPiezaDe(al)).toEqual(['esperando'])
    expect(await entrega(bloque({ respuesta: 'tomada', accion: 'editar', cambios: { mensaje: 'el encebollado de siempre, en la sede abierta' }, explicacion: 'quito la fecha' }), mas(5))).toMatchObject({ ok: true })
    await relojDeLaCadena(al, VIGIA, mas(6))
    const c = al.correcciones[0]
    expect(c).toMatchObject({ estado: 'respondida', respuesta: 'tomada' })
    expect(bloqueaLaPieza(c)).toBe(true)
    expect(filaDe(al, FILA).estado).toBe('lista_para_brief')
    // la oficina lee: la pieza vieja queda REEMPLAZADA (no se suelta: la fila vuelve al brief · CC7/CC4)
    expect(await paraLaPiezaDe(al)).toEqual(['reemplazada'])
    // la que todavía no tenía brief no se toca; la de otra idea, tampoco
    expect(filaDe(al, 's3-d4-jue_foto_olon').estado).toBe('validada')
    expect(filaDe(al, 's1-otra').estado).toBe('briefeada')
    expect((c.version_nueva as { filas_al_brief: string[] }).filas_al_brief).toEqual([FILA])
    expect(al.alarmasEnviadas).toEqual([])
    // una sola vuelta: otra vuelta del reloj no vuelve a abrir ni a mover
    await relojDeLaCadena(al, VIGIA, mas(30))
    expect(al.sobresDelBanco).toHaveLength(1)
  })
  it('🔴 dura que el banco no toma dos veces: la pieza sigue FRENADA, la fila no vuelve y sale UNA alarma', async () => {
    const { al, entrega } = almacen()
    await devolver(al)
    await relojDeLaCadena(al, VIGIA, T0)
    await entrega(bloque({ respuesta: 'no_tomada', explicacion: 'la idea no promete la oferta' }), mas(5))
    await relojDeLaCadena(al, VIGIA, mas(6))
    if (al.sobresDelBanco.length > 1) await entrega(bloque({ respuesta: 'no_tomada', explicacion: 'sigo sin verlo' }), mas(10))
    for (const m of [11, 20, 90, 200]) await relojDeLaCadena(al, VIGIA, mas(m))
    const c = al.correcciones[0]
    expect(c).toMatchObject({ estado: 'respondida', respuesta: 'no_dicha' })
    expect(bloqueaLaPieza(c)).toBe(true)
    expect(filaDe(al, FILA).estado).toBe('briefeada')
    expect(al.alarmasEnviadas).toHaveLength(1)
    expect(al.alarmasEnviadas[0]).toContain(`fila ${FILA}`)
    expect(await paraLaPiezaDe(al)).toEqual(['frenada'])
  })
})
