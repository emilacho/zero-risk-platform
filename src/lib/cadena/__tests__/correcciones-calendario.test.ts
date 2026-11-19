/**
 * 17-nov · cambio 4 · entrega 2 · el creador «calendario» de una corrección: la mesa de reubicación por ENTRADA PROPIA (sin el interruptor · RESPUESTA-LENOVO).
 * Contra el almacén en memoria: sin modelo, sin red, US$ 0. Dos clientes de práctica de rubros distintos (A · cafetería, B · clínica veterinaria).
 * Mide: abre con el interruptor APAGADO · la fila de una pieza ya en la oficina · tomada aplica (y la fila vuelve a validada) · no tomada no toca · una propuesta que no cumple
 * NUNCA descarta (se reintenta) · la dura no se cierra con «no tomada» · la entrega vuelve por el puerto de siempre · las reubicaciones normales no la avisan ni la releen.
 */
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, clienteB, contextoDe, type ClienteFixture } from '../__fixtures__/clientes'
import type { Campana } from '../almacen'
import { diaSemanaIso, sumarDias } from '../fechas'
import { puertoDeLaCadena } from '../mesas'
import { relojDeLaCadena } from '../reloj'
import { avisosDeReubicacion, CLAVE_DE_LA_LIBRETA, INTERRUPTOR_DE_REUBICACION } from '../reubicar'
import { claveDeLaLibretaDeCorrecciones, creadorDelCalendario, VERSION_BASE_DE_CORRECCION, type LibretaDeCorrecciones } from '../correcciones-calendario'
import { ACCIONES } from '../acciones'
import { INTENTOS_POR_CORRECCION, VUELTAS_DE_REGLA_DURA } from '../correcciones'
import type { Fila } from '../tipos'

interface Caso { nombre: string; c: ClienteFixture; ahora: string; hoy: string; abierto: string; cerrado: string; red: string; formato: string; hora: string }
const CASOS: Caso[] = [
  { nombre: 'A · cafetería', c: clienteA(), ahora: '2026-11-12T15:00:00Z', hoy: '2026-11-12', abierto: '2026-11-19', cerrado: '2026-11-17', red: 'instagram', formato: 'foto', hora: '09:00' },
  { nombre: 'B · clínica veterinaria', c: clienteB(), ahora: '2026-11-17T15:00:00Z', hoy: '2026-11-17', abierto: '2026-11-23', cerrado: '2026-11-22', red: 'facebook', formato: 'foto', hora: '10:00' },
]
const CAMP = (k: Caso) => `00000000-0000-4000-8000-${k.c.clientId.replace(/[^0-9a-f]/g, '').padEnd(12, '0').slice(0, 12)}`
const UUID_CLIENTE = (k: Caso) => `11111111-1111-4111-8111-${k.nombre.startsWith('A') ? 'aaaaaaaaaaaa' : 'bbbbbbbbbbbb'}`
const masMin = (iso: string, m: number) => new Date(Date.parse(iso) + m * 60_000).toISOString()
const VIGIA = { workflow_id: 'wf-vigia', workflow_execution_id: 'v1' }
const R = 'RESPUESTA A LA JEFATURA C1'

function fila(k: Caso, id: string, fecha: string, extra: Partial<Fila & { campana_id: string; calendario_version: number }> = {}): Fila & { campana_id: string; calendario_version: number } {
  return { id, tanda: 1, semana: 1, dia_semana: diaSemanaIso(fecha), fecha, hora: k.hora, red: k.red, formato: k.formato, pilar: 'p', tema: 't', sede: k.c.sedes[0].clave, requiere_abierto: true, depende_de: [], datos: [], pendientes: [], pide_video: false, estado: 'validada', avisos: [], campana_id: CAMP(k), calendario_version: 1, ...extra } as Fila & { campana_id: string; calendario_version: number }
}
function almacen(k: Caso, o: { mesa?: 'abre' | 'no_abre' } = {}) {
  const id = UUID_CLIENTE(k)
  // el interruptor de la reubicación queda APAGADO a propósito: la corrección no depende de él
  const al = new AlmacenMemoria({ contextos: { [id]: { ...contextoDe(k.c), clientId: id } }, config: { flujos: ['wf-cadena', 'wf-vigia'], estado_cadena: 'encendida' } })
  const campana: Campana = {
    id: CAMP(k), client_id: id, plan_id: 'plan-1', fecha_inicio: k.c.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: k.c.campana.fecha_fin, zona_horaria: 'UTC', pais: 'pais-de-practica', sedes: k.c.sedes.map((s) => s.clave),
    estado: 'activa', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: false,
  }
  al.campanas.push(campana)
  al.filasGuardadas.push(fila(k, 'pieza', sumarDias(k.hoy, 3), { estado: 'en_oficina' }), fila(k, 'otra', sumarDias(k.abierto, 14)))
  let n = 0
  al.mesaDeReubicacion = async () => (o.mesa === 'no_abre' ? { estado: 'no_abre', motivo: 'plantilla_inactiva' } : { estado: 'abierta', encargo_id: `enc-m${++n}` })
  return al
}
const filaDe = (al: AlmacenMemoria, id: string) => al.filasGuardadas.find((f) => f.id === id)!
const V1 = VERSION_BASE_DE_CORRECCION + 1, V2 = VERSION_BASE_DE_CORRECCION + 2
// la libreta PROPIA de las correcciones (por campaña); la de reubicación no se toca
const decisionDe = (al: AlmacenMemoria, k: Caso, v = V1) => ((al.config.get(claveDeLaLibretaDeCorrecciones(CAMP(k))) ?? { decisiones: {} }) as LibretaDeCorrecciones).decisiones[String(v)]
const corregir = (al: AlmacenMemoria, k: Caso, extra: Record<string, unknown> = {}) =>
  ACCIONES.correcciones.recibir(al, { workflow_id: 'wf-cadena', workflow_execution_id: 'e1', campana_id: CAMP(k), fila_id: 'pieza', destino: 'calendario', motivo: 'la oferta está cerrada ese día', linea_de_la_ficha: 'cierre: se retira', encargo_id: 'enc-pieza', dura: false, ...extra }, k.ahora)
const reloj = (al: AlmacenMemoria, ahora: string) => relojDeLaCadena(al, VIGIA, ahora)
const entregar = (al: AlmacenMemoria, k: Caso, version: number, texto: string | null) => puertoDeLaCadena(al, () => masMin(k.ahora, 5)).entregarReubicacion({ campana_id: CAMP(k), version, encargo_id: 'enc-m1', texto, costo_usd: 0.3, motivo: texto ? null : 'nada' })

describe.each(CASOS)('$nombre', (k) => {
  it('🔴 con el interruptor APAGADO, la vigía abre la mesa de reubicación para la fila corregida (una pieza ya en la oficina), con la corrección en el marco', async () => {
    const al = almacen(k)
    expect(al.config.get(INTERRUPTOR_DE_REUBICACION)).toBeUndefined()
    expect((await corregir(al, k)).status).toBe(201)
    await reloj(al, k.ahora)
    expect(al.sobresDeReubicacion).toHaveLength(1)
    const s = al.sobresDeReubicacion[0]
    expect(s).toMatchObject({ tipo_de_mesa: 'reubicacion', campana_id: CAMP(k), version: V1, dry_run: false })
    expect(s.marco_texto).toContain('CORRECCIÓN DE LA JEFATURA (C1) · fila pieza')
    expect(s.marco_texto).toContain('«cierre: se retira»')
    expect(s.marco_texto).toMatch(/- pieza · /)
    expect(s.marco_texto).not.toMatch(/quedaron atrás sin producir/)
    expect(decisionDe(al, k)).toMatchObject({ huella: 'correccion:pieza:calendario', estado: 'abierta', version: V1 })
    expect(al.config.get(CLAVE_DE_LA_LIBRETA)).toBeUndefined()
    expect(al.correcciones[0]).toMatchObject({ estado: 'en_manos_del_creador', intentos: 1 })
    // la segunda vuelta no abre otra
    await reloj(al, masMin(k.ahora, 1))
    expect(al.sobresDeReubicacion).toHaveLength(1)
  })
  it('🔴 tomada con una fecha válida: la fila se mueve, vuelve a «validada» (entra al próximo lote) y la corrección queda respondida con la versión nueva', async () => {
    const al = almacen(k)
    await corregir(al, k)
    await reloj(al, k.ahora)
    const r = await entregar(al, k, V1, `- pieza · reubicar · ${k.abierto} · ${k.hora} · ese día ya vale la oferta\n${R}: tomada`)
    expect(r).toMatchObject({ ok: true, estado: 'aplicada' })
    expect(filaDe(al, 'pieza')).toMatchObject({ fecha: k.abierto, estado: 'validada' })
    expect(al.correcciones[0]).toMatchObject({ estado: 'respondida', respuesta: 'tomada', version_nueva: { accion: 'reubicar', fecha: k.abierto } })
    expect(decisionDe(al, k).estado).toBe('aplicada')
    // idempotente: la misma entrega otra vez no cambia nada
    expect(await entregar(al, k, V1, `- pieza · reubicar · ${sumarDias(k.abierto, 7)} · ${k.hora} · x\n${R}: tomada`)).toMatchObject({ ok: true, ya_cerrada: true })
    expect(filaDe(al, 'pieza').fecha).toBe(k.abierto)
  })
  it('🔴 no tomada (criterio): la fila NO se toca y la corrección queda respondida con su porqué', async () => {
    const al = almacen(k)
    await corregir(al, k)
    await reloj(al, k.ahora)
    const antes = structuredClone(filaDe(al, 'pieza'))
    expect(await entregar(al, k, V1, `${R}: no tomada: la ficha habla de otra sede`)).toMatchObject({ ok: true, estado: 'aplicada' })
    expect(filaDe(al, 'pieza')).toEqual(antes)
    expect(al.correcciones[0]).toMatchObject({ estado: 'respondida', respuesta: 'no_tomada', explicacion: 'la ficha habla de otra sede' })
  })
  it('🔴 una propuesta que NO cumple (día cerrado) NUNCA descarta la fila: queda igual y la corrección vuelve a la fila de espera para reintentar', async () => {
    const al = almacen(k)
    await corregir(al, k)
    await reloj(al, k.ahora)
    const antes = structuredClone(filaDe(al, 'pieza'))
    expect(await entregar(al, k, V1, `- pieza · reubicar · ${k.cerrado} · ${k.hora} · x\n${R}: tomada`)).toMatchObject({ ok: true, estado: 'fallida' })
    expect(filaDe(al, 'pieza')).toEqual(antes)
    expect(al.correcciones[0]).toMatchObject({ estado: 'recibida', intentos: 1 })
    expect(al.correcciones[0].explicacion).toMatch(/la propuesta no cumple/)
    // la vigía la reintenta con una versión NUEVA del sobre (no choca con la anterior)
    await reloj(al, masMin(k.ahora, 10))
    expect(al.sobresDeReubicacion.map((s) => s.version)).toEqual([V1, V2])
  })
  it('🔴 «tomada» sin decisión sobre la fila (o con DOS), o «no tomada» CON decisión: no dicha (se reintenta), la fila no se toca', async () => {
    for (const texto of [`${R}: tomada`, `- pieza · descartar · ya no va\n${R}: no tomada: no`, 'sin línea de respuesta', `- pieza · reubicar · ${k.abierto} · ${k.hora} · a\n- pieza · descartar · b\n${R}: tomada`]) {
      const al = almacen(k)
      await corregir(al, k)
      await reloj(al, k.ahora)
      const antes = structuredClone(filaDe(al, 'pieza'))
      expect(await entregar(al, k, V1, texto), texto).toMatchObject({ ok: true, estado: 'fallida' })
      expect(filaDe(al, 'pieza'), texto).toEqual(antes)
      expect(al.correcciones[0].estado, texto).toBe('recibida')
    }
  })
  it('🔴 una DURA no se cierra con «no tomada»: no dicha, vuelve al creador (19-nov · nada se frena); tras sus vueltas queda no_dicha y la pieza no se publica', async () => {
    const al = almacen(k)
    await corregir(al, k, { dura: true, origen: 'codigo' })
    const vista = async () => ((await ACCIONES.correcciones.del_encargo(al, { encargo_id: 'enc-pieza' }, k.ahora)).cuerpo.correcciones as Array<Record<string, unknown>>)[0]
    const n = INTENTOS_POR_CORRECCION * VUELTAS_DE_REGLA_DURA
    for (let i = 1; i <= n; i++) {
      await reloj(al, masMin(k.ahora, 10 * i))
      expect(await entregar(al, k, VERSION_BASE_DE_CORRECCION + i, `${R}: no tomada: no me parece (${i})`), `intento ${i}`).toMatchObject({ estado: 'fallida' })
      if (i === INTENTOS_POR_CORRECCION) expect(await vista()).toMatchObject({ estado: 'recibida', intentos: i, bloquea_la_pieza: true })
    }
    expect(await vista()).toMatchObject({ estado: 'respondida', respuesta: 'no_dicha', intentos: n, bloquea_la_pieza: true })
  })
  it('🔴 tomada con descartar: la fila pierde su fecha (la oferta no existe en la campaña)', async () => {
    const al = almacen(k)
    await corregir(al, k)
    await reloj(al, k.ahora)
    expect(await entregar(al, k, V1, `- pieza · descartar · la oferta se retira y no vuelve\n${R}: tomada`)).toMatchObject({ estado: 'aplicada' })
    expect(filaDe(al, 'pieza').estado).toBe('perdio_su_fecha')
    expect(al.correcciones[0]).toMatchObject({ respuesta: 'tomada', version_nueva: { accion: 'descartar' } })
  })
  it('🔴 las reubicaciones normales no la avisan ni la releen; la mesa que no abre vuelve a la fila de espera', async () => {
    const al = almacen(k)
    await corregir(al, k)
    await reloj(al, k.ahora)
    await entregar(al, k, V1, `- pieza · reubicar · ${k.abierto} · ${k.hora} · x\n${R}: tomada`)
    expect(await avisosDeReubicacion(al, true)).toEqual([])
    const otra = almacen(k, { mesa: 'no_abre' })
    await corregir(otra, k)
    await reloj(otra, k.ahora)
    expect(otra.correcciones[0]).toMatchObject({ estado: 'recibida', intentos: 1 })
    expect(decisionDe(otra, k).estado).toBe('fallida')
  })
  it('una fila que ya se aprobó o se canceló no se corrige desde el calendario (la mesa no abre, nada se toca)', async () => {
    const al = almacen(k)
    filaDe(al, 'pieza').estado = 'aprobada'
    await corregir(al, k)
    await reloj(al, k.ahora)
    expect(al.sobresDeReubicacion).toEqual([])
    expect(al.correcciones[0]).toMatchObject({ estado: 'recibida', intentos: 1 })
  })
  it('🔴 la libreta propia aguanta dos escrituras a la vez: dos correcciones abiertas juntas en la misma campaña quedan las dos, con versiones distintas', async () => {
    const al = almacen(k)
    filaDe(al, 'otra').estado = 'en_oficina'
    await corregir(al, k)
    await corregir(al, k, { fila_id: 'otra' })
    const [a1, a2] = al.correcciones
    const enManos = (c: typeof a1) => ({ ...c, estado: 'en_manos_del_creador' as const, intentos: 1, entregada_en: k.ahora })
    al.correcciones = [enManos(a1), enManos(a2)]
    await Promise.all([creadorDelCalendario(al, al.correcciones[0], k.ahora), creadorDelCalendario(al, al.correcciones[1], k.ahora)])
    expect(al.sobresDeReubicacion.map((x) => x.version).sort()).toEqual([V1, V2])
    expect([decisionDe(al, k, V1)?.huella, decisionDe(al, k, V2)?.huella].sort()).toEqual(['correccion:otra:calendario', 'correccion:pieza:calendario'])
    expect([decisionDe(al, k, V1)?.encargo_id, decisionDe(al, k, V2)?.encargo_id].every(Boolean)).toBe(true)
  })
  it('🔴 la escritura de otro en el medio no se pisa: si la libreta cambió entre la lectura y la escritura, se relee y se conserva lo del otro', async () => {
    const al = almacen(k)
    await corregir(al, k)
    const clave = claveDeLaLibretaDeCorrecciones(CAMP(k))
    const original = al.escribirConfigSiSello.bind(al)
    let una = false
    al.escribirConfigSiSello = async (kk, v, sello) => {
      if (!una && kk === clave) { una = true; await al.escribirConfig(kk, { ultima: 7, decisiones: { [String(VERSION_BASE_DE_CORRECCION + 7)]: { huella: 'correccion:de-otro', estado: 'abierta', version: VERSION_BASE_DE_CORRECCION + 7 } } }) }
      return original(kk, v, sello)
    }
    await reloj(al, k.ahora)
    expect(decisionDe(al, k, VERSION_BASE_DE_CORRECCION + 7)?.huella).toBe('correccion:de-otro')
    expect(decisionDe(al, k, VERSION_BASE_DE_CORRECCION + 8)?.huella).toBe('correccion:pieza:calendario')
  })
  it('🔴 k4 · una mesa VIEJA (la corrección venció y volvió a la fila de espera, o va en otro intento) no mueve la fila ni escribe respuesta', async () => {
    const al = almacen(k)
    await corregir(al, k)
    await reloj(al, k.ahora)
    const antes = structuredClone(filaDe(al, 'pieza'))
    // venció: la vigía la devuelve a «recibida»
    al.correcciones[0] = { ...al.correcciones[0], estado: 'recibida', entregada_en: null, explicacion: 'venció' }
    expect(await entregar(al, k, V1, `- pieza · reubicar · ${k.abierto} · ${k.hora} · x\n${R}: tomada`)).toMatchObject({ ok: true, estado: 'obsoleta' })
    expect(filaDe(al, 'pieza')).toEqual(antes)
    expect(al.correcciones[0]).toMatchObject({ estado: 'recibida', respuesta: null, explicacion: 'venció', intentos: 1 })
    // segundo intento en manos: la entrega del PRIMERO tampoco vale
    const b = almacen(k)
    await corregir(b, k)
    await reloj(b, k.ahora)
    b.correcciones[0] = { ...b.correcciones[0], intentos: 2 }
    expect(await entregar(b, k, V1, `- pieza · descartar · y\n${R}: tomada`)).toMatchObject({ ok: true, estado: 'obsoleta' })
    expect(filaDe(b, 'pieza').estado).toBe('en_oficina')
    expect(b.correcciones[0]).toMatchObject({ estado: 'en_manos_del_creador', respuesta: null })
  })
  it('🔴 Lenovo · desde «aprobada» solo con regla DURA y si la pieza NO se publicó; sin la consulta de publicación, no vuelve (lado seguro)', async () => {
    const abrir = async (o: { dura: boolean; publicada?: boolean }) => {
      const al = almacen(k)
      filaDe(al, 'pieza').estado = 'aprobada'
      if (o.publicada !== undefined) al.piezaPublicada = async () => o.publicada!
      await corregir(al, k, { dura: o.dura })
      await reloj(al, k.ahora)
      return al
    }
    expect((await abrir({ dura: false, publicada: false })).sobresDeReubicacion).toEqual([])
    expect((await abrir({ dura: true })).sobresDeReubicacion).toEqual([])
    expect((await abrir({ dura: true, publicada: true })).sobresDeReubicacion).toEqual([])
    const al = await abrir({ dura: true, publicada: false })
    expect(al.sobresDeReubicacion).toHaveLength(1)
    expect(await entregar(al, k, V1, `- pieza · reubicar · ${k.abierto} · ${k.hora} · la oferta vale ese día\n${R}: tomada`)).toMatchObject({ ok: true, estado: 'aplicada' })
    expect(filaDe(al, 'pieza')).toMatchObject({ estado: 'validada', fecha: k.abierto })
  })
  it('🔴 Lenovo · una sola vuelta por corrección: la entrega repetida no vuelve a mover la fila', async () => {
    const al = almacen(k)
    await corregir(al, k)
    await reloj(al, k.ahora)
    await entregar(al, k, V1, `- pieza · reubicar · ${k.abierto} · ${k.hora} · x\n${R}: tomada`)
    const tras = structuredClone(filaDe(al, 'pieza'))
    expect(await entregar(al, k, V1, `- pieza · descartar · otra vez\n${R}: tomada`)).toMatchObject({ ok: true, ya_cerrada: true })
    expect(filaDe(al, 'pieza')).toEqual(tras)
  })
})

describe('dos entregas A LA VEZ de la misma mesa (🟡 CC6 · cierre doble)', () => {
  it('🔴 solo una mueve la fila; la otra contesta «ya cerrada»', async () => {
    const k = CASOS[0]
    const al = almacen(k)
    await corregir(al, k)
    await reloj(al, k.ahora)
    const movidas: string[] = []
    const original = al.reubicarFila.bind(al)
    al.reubicarFila = async (...a: Parameters<typeof al.reubicarFila>) => { const ok = await original(...a); if (ok) movidas.push(String(a[3].estado)); return ok }
    const [x, y] = await Promise.all([
      entregar(al, k, V1, `- pieza · reubicar · ${k.abierto} · ${k.hora} · x\n${R}: tomada`),
      entregar(al, k, V1, `- pieza · descartar · y\n${R}: tomada`),
    ])
    expect(movidas).toHaveLength(1)
    expect([x, y].filter((z) => (z as { ya_cerrada?: boolean }).ya_cerrada)).toHaveLength(1)
  })
})

describe('lo que lee la oficina del calendario (para_la_pieza · CC4)', () => {
  const leer = async (al: AlmacenMemoria) => ((await ACCIONES.correcciones.del_encargo(al, { encargo_id: 'enc-pieza' }, CASOS[0].ahora)).cuerpo as { correcciones: Array<{ para_la_pieza: string }> }).correcciones.map((c) => c.para_la_pieza)
  it('🔴 esperando → reemplazada (reubicada) · no tomada de criterio → sigue', async () => {
    const k = CASOS[0]
    const al = almacen(k)
    await corregir(al, k)
    await reloj(al, k.ahora)
    expect(await leer(al)).toEqual(['esperando'])
    await entregar(al, k, V1, `- pieza · reubicar · ${k.abierto} · ${k.hora} · x\n${R}: tomada`)
    expect(await leer(al)).toEqual(['reemplazada'])
    const b = almacen(k)
    await corregir(b, k)
    await reloj(b, k.ahora)
    await entregar(b, k, V1, `${R}: no tomada: la ficha habla de otra sede`)
    expect(await leer(b)).toEqual(['sigue'])
  })
})

describe('el puerto en proceso de la oficina (CC4 · devolverCorreccion · correccionesDelEncargo)', () => {
  it('🔴 la oficina devuelve SIN workflow_id (en proceso, de confianza): misma validación, misma llave; la ruta HTTP sigue exigiendo autorización', async () => {
    const k = CASOS[0]
    const al = almacen(k)
    const puerto = puertoDeLaCadena(al, () => k.ahora)
    const cuerpo = { campana_id: CAMP(k), fila_id: 'pieza', destino: 'calendario', motivo: 'la oferta está cerrada ese día', linea_de_la_ficha: 'cierre: se retira', encargo_id: 'enc-pieza', dura: true, regla: 'D1' }
    expect(await puerto.devolverCorreccion(cuerpo)).toMatchObject({ status: 201, cuerpo: { ok: true, correccion: { llave: 'pieza:calendario', para_la_pieza: 'esperando', bloquea_la_pieza: true } } })
    expect(await puerto.devolverCorreccion(cuerpo)).toMatchObject({ status: 200, cuerpo: { ya_estaba: true } })
    expect((await puerto.devolverCorreccion({ ...cuerpo, destino: 'otra' })).status).toBe(400)
    // por la ruta, sin workflow_id, no entra (la autorización de siempre) y no guarda nada
    expect((await ACCIONES.correcciones.recibir(al, { ...cuerpo, fila_id: 'otra' }, k.ahora)).status).toBeGreaterThanOrEqual(400)
    expect(al.correcciones.map((c) => c.llave)).toEqual(['pieza:calendario'])
    expect(await puerto.correccionesDelEncargo('enc-pieza')).toMatchObject({ status: 200, cuerpo: { correcciones: [{ llave: 'pieza:calendario', para_la_pieza: 'esperando' }] } })
  })
  it('🔴 nunca lanza: un almacén que falla devuelve 500 con el motivo', async () => {
    const puerto = puertoDeLaCadena(() => { throw new Error('sin base') })
    expect(await puerto.correccionesDelEncargo('x')).toMatchObject({ status: 500, cuerpo: { ok: false, error: 'sin base' } })
  })
})

describe('fusionar (🟡 CC6 c6 · una prueba por transición)', () => {
  it('🔴 tomada con «fusionar»: la fila corregida queda «cancelada» (no «perdio_su_fecha») y la de destino recibe su aviso', async () => {
    const k = CASOS[0]
    const al = almacen(k)
    await corregir(al, k)
    await reloj(al, k.ahora)
    expect(await entregar(al, k, V1, `- pieza · fusionar · otra · la misma oferta ya sale ese día\n${R}: tomada`)).toMatchObject({ ok: true, estado: 'aplicada' })
    expect(filaDe(al, 'pieza').estado).toBe('cancelada')
    expect(filaDe(al, 'otra').avisos.length).toBeGreaterThan(0)
    expect(al.correcciones[0]).toMatchObject({ respuesta: 'tomada', version_nueva: { accion: 'fusionar', destino: 'otra' } })
  })
})

describe('🟡 CC7 22:02 · el hueco entre encargos: la misma fila vuelve con otro encargo (por el puerto real de la oficina)', () => {
  const k = CASOS[0]
  const cuerpo = (encargo: string, dura: boolean) => ({ campana_id: CAMP(k), fila_id: 'pieza', destino: 'calendario', motivo: 'la oferta está cerrada ese día', linea_de_la_ficha: 'cierre: se retira', encargo_id: encargo, dura, ...(dura ? { regla: 'D1' } : {}), llave: 'pieza:calendario' })
  const lee = async (al: AlmacenMemoria, encargo: string) => ((await puertoDeLaCadena(al, () => k.ahora).correccionesDelEncargo(encargo)).cuerpo as { correcciones: Array<{ llave: string; llave_guardada: string; para_la_pieza: string }> }).correcciones
  const entregarA = (al: AlmacenMemoria, version: number, encargo: string, texto: string, min: number) => puertoDeLaCadena(al, () => masMin(k.ahora, min)).entregarReubicacion({ campana_id: CAMP(k), version, encargo_id: encargo, texto, costo_usd: 0.3, motivo: null } as never)
  /** encargo 1 con regla dura: el creador la toma → la pieza vieja queda reemplazada; el brief se rehace y la pieza vuelve a la oficina con el encargo 2 */
  async function primeraRespondida() {
    const al = almacen(k)
    const puerto = puertoDeLaCadena(al, () => k.ahora)
    expect((await puerto.devolverCorreccion(cuerpo('enc-1', true))).status).toBe(201)
    await reloj(al, k.ahora)
    expect(await entregarA(al, V1, 'enc-m1', `- pieza · reubicar · ${k.abierto} · ${k.hora} · la oferta vale ese día\n${R}: tomada`, 5)).toMatchObject({ ok: true, estado: 'aplicada' })
    expect(await lee(al, 'enc-1')).toMatchObject([{ para_la_pieza: 'reemplazada' }])
    filaDe(al, 'pieza').estado = 'en_oficina'
    return { al, puerto }
  }
  it('🔴 DURA en el encargo 2 con la 1.ª ya respondida: abre una corrección NUEVA (la oficina ve su llave), llega al creador y la pieza 2 espera su respuesta', async () => {
    const { al, puerto } = await primeraRespondida()
    const r = await puerto.devolverCorreccion(cuerpo('enc-2', true))
    expect(r).toMatchObject({ status: 201, cuerpo: { ya_estaba: false, correccion: { llave: 'pieza:calendario', llave_guardada: 'pieza:calendario#2', estado: 'recibida', para_la_pieza: 'esperando' } } })
    expect(await lee(al, 'enc-2')).toMatchObject([{ llave: 'pieza:calendario', para_la_pieza: 'esperando' }])
    expect(await lee(al, 'enc-1')).toMatchObject([{ llave_guardada: 'pieza:calendario', para_la_pieza: 'reemplazada' }])
    // el mismo encargo 2 otra vez: idempotente
    expect(await puerto.devolverCorreccion(cuerpo('enc-2', true))).toMatchObject({ status: 200, cuerpo: { ya_estaba: true, correccion: { llave_guardada: 'pieza:calendario#2' } } })
    await reloj(al, masMin(k.ahora, 10))
    expect(al.sobresDeReubicacion).toHaveLength(2)
    expect(await entregarA(al, V2, 'enc-m2', `- pieza · descartar · la oferta no vale\n${R}: tomada`, 15)).toMatchObject({ ok: true, estado: 'aplicada' })
    expect(await lee(al, 'enc-2')).toMatchObject([{ para_la_pieza: 'reemplazada' }])
    expect(al.correcciones.map((c) => c.llave)).toEqual(['pieza:calendario', 'pieza:calendario#2'])
    // los dos encargos reenvían ya respondidos (la oficina reintenta): ninguno abre otra ni se cubre a sí mismo
    expect(await puerto.devolverCorreccion(cuerpo('enc-1', true))).toMatchObject({ status: 200, cuerpo: { ya_estaba: true, correccion: { llave_guardada: 'pieza:calendario' } } })
    expect(await puerto.devolverCorreccion(cuerpo('enc-2', true))).toMatchObject({ status: 200, cuerpo: { ya_estaba: true, correccion: { llave_guardada: 'pieza:calendario#2' } } })
    expect(al.correcciones.map((c) => [c.llave, c.encargos_cubiertos])).toEqual([['pieza:calendario', []], ['pieza:calendario#2', []]])
  })
  it('🔴 CRITERIO en el encargo 2 con la 1.ª ya respondida: NO se reabre (firma de Emilio) · queda como observación y la pieza 2 sigue', async () => {
    const { al, puerto } = await primeraRespondida()
    expect(await puerto.devolverCorreccion(cuerpo('enc-2', false))).toMatchObject({ status: 201, cuerpo: { correccion: { llave: 'pieza:calendario', estado: 'respondida', respuesta: 'no_tomada', para_la_pieza: 'sigue' } } })
    await reloj(al, masMin(k.ahora, 10))
    expect(al.sobresDeReubicacion).toHaveLength(1)
    expect(await lee(al, 'enc-2')).toMatchObject([{ para_la_pieza: 'sigue' }])
  })
  it('🔴 el encargo 2 llega con la 1.ª todavía ABIERTA: la misma corrección lo cubre · no se abre otra mesa · la respuesta vale para los dos', async () => {
    const al = almacen(k)
    const puerto = puertoDeLaCadena(al, () => k.ahora)
    await puerto.devolverCorreccion(cuerpo('enc-1', true))
    await reloj(al, k.ahora)
    expect(await puerto.devolverCorreccion(cuerpo('enc-2', true))).toMatchObject({ status: 200, cuerpo: { ya_estaba: true, correccion: { llave_guardada: 'pieza:calendario' } } })
    expect(await lee(al, 'enc-2')).toMatchObject([{ llave: 'pieza:calendario', para_la_pieza: 'esperando' }])
    await reloj(al, masMin(k.ahora, 2))
    expect(al.sobresDeReubicacion).toHaveLength(1)
    await entregarA(al, V1, 'enc-m1', `- pieza · reubicar · ${k.abierto} · ${k.hora} · la oferta vale ese día\n${R}: tomada`, 5)
    expect(await lee(al, 'enc-1')).toMatchObject([{ para_la_pieza: 'reemplazada' }])
    expect(await lee(al, 'enc-2')).toMatchObject([{ para_la_pieza: 'reemplazada' }])
    // el encargo 2 (cubierto) reenvía ya respondida: es la misma, no abre otra ni se repite en la lista
    expect(await puerto.devolverCorreccion(cuerpo('enc-2', true))).toMatchObject({ status: 200, cuerpo: { ya_estaba: true } })
    expect(al.correcciones).toHaveLength(1)
    expect(al.correcciones[0].encargos_cubiertos).toEqual(['enc-2'])
  })
})

describe('🟡 CC6 q5 · la carrera del insert: dos encargos de la misma fila en el mismo instante', () => {
  const k = CASOS[0]
  const cuerpo = (encargo: string, dura: boolean) => ({ campana_id: CAMP(k), fila_id: 'pieza', destino: 'calendario', motivo: 'la oferta está cerrada ese día', encargo_id: encargo, dura, ...(dura ? { regla: 'D1' } : {}) })
  it('🔴 el que PIERDE el insert vuelve a mirar la misma llave: la cubre (una sola corrección, una sola mesa), no abre «#2»', async () => {
    const al = almacen(k)
    const puerto = puertoDeLaCadena(al, () => k.ahora)
    const original = al.correccionInsertar.bind(al)
    let una = true
    // justo antes de su insert, otro encargo de la misma fila inserta primero: este pierde (nueva:false) una vez
    al.correccionInsertar = async (c) => {
      if (una) { una = false; await original({ ...c, encargo_id: 'enc-1' }) }
      return original(c)
    }
    expect(await puerto.devolverCorreccion(cuerpo('enc-2', true))).toMatchObject({ status: 200, cuerpo: { ya_estaba: true, correccion: { llave_guardada: 'pieza:calendario' } } })
    expect(al.correcciones.map((c) => [c.llave, c.encargo_id, c.encargos_cubiertos])).toEqual([['pieza:calendario', 'enc-1', ['enc-2']]])
    await reloj(al, k.ahora)
    expect(al.sobresDeReubicacion).toHaveLength(1)
  })
  it('🔴 lo mismo con una de CRITERIO: la previa sigue abierta → la cubre, NO queda como observación', async () => {
    const al = almacen(k)
    const puerto = puertoDeLaCadena(al, () => k.ahora)
    const original = al.correccionInsertar.bind(al)
    let una = true
    al.correccionInsertar = async (c) => { if (una) { una = false; await original({ ...c, encargo_id: 'enc-1', dura: true, regla: 'D1' }) } return original(c) }
    expect(await puerto.devolverCorreccion(cuerpo('enc-2', false))).toMatchObject({ status: 200, cuerpo: { ya_estaba: true } })
    expect(al.correcciones).toHaveLength(1)
    expect(al.correcciones[0]).toMatchObject({ estado: 'recibida', encargos_cubiertos: ['enc-2'] })
  })
})
