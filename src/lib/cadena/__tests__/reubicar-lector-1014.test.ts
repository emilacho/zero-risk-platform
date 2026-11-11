/**
 * 11-nov · GO de Lenovo 04:15Z · #1014 · el lector de la reubicación sin formato fijo (1), «no se leyó nada» = fallida y no descarta (2) y la RELECTURA de la respuesta
 * ya guardada, sin llamar al agente (3A). La primera decisión real llegó SIN guion y el lector exigía «- »: leyó cero decisiones y descartó las 2 filas.
 * Contra el almacén en memoria: sin modelo, sin red, US$ 0. DOS clientes de práctica de rubros distintos (A · cafetería · B · clínica veterinaria). Nada aquí nombra a un cliente real.
 */
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, clienteB, contextoDe, type ClienteFixture } from '../__fixtures__/clientes'
import type { Campana } from '../almacen'
import { diaSemanaIso, sumarDias } from '../fechas'
import { relojDeLaCadena } from '../reloj'
import { avisosDeReubicacion, CLAVE_DE_LA_LIBRETA, INTERRUPTOR_DE_REUBICACION, recibirReubicacion, type Libreta } from '../reubicar'
import { leerDecisiones } from '../reubicacion'
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

function fila(k: Caso, id: string, fecha: string, extra: Partial<Fila & { campana_id: string; calendario_version: number }> = {}): Fila & { campana_id: string; calendario_version: number } {
  return { id, tanda: 1, semana: 1, dia_semana: diaSemanaIso(fecha), fecha, hora: k.hora, red: k.red, formato: k.formato, pilar: 'p', tema: 't', sede: k.c.sedes[0].clave, requiere_abierto: true, depende_de: [], datos: [], pendientes: [], pieza_fija: null, origen: 'agente', estado: 'validada', avisos: [], campana_id: CAMP(k), calendario_version: 1, ...extra }
}
interface Op { encendida?: boolean; mesa?: 'abre' | 'no_abre' | null }
function almacen(k: Caso, o: Op = {}) {
  const id = UUID_CLIENTE(k)
  const al = new AlmacenMemoria({
    contextos: { [id]: { ...contextoDe(k.c), clientId: id } },
    config: { flujos: ['wf-cadena', 'wf-vigia'], estado_cadena: 'encendida', ...(o.encendida === false ? {} : { [INTERRUPTOR_DE_REUBICACION]: true }) },
  })
  const campana: Campana = {
    id: CAMP(k), client_id: id, plan_id: 'plan-1', fecha_inicio: k.c.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: k.c.campana.fecha_fin, zona_horaria: 'UTC', pais: 'pais-de-practica', sedes: k.c.sedes.map((s) => s.clave),
    estado: 'activa', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: false,
  }
  al.campanas.push(campana)
  const ayer = sumarDias(k.hoy, -1), antier = sumarDias(k.hoy, -2), lejos = sumarDias(k.abierto, 14)
  al.filasGuardadas.push(fila(k, 'pasada-a', antier), fila(k, 'pasada-b', ayer), fila(k, 'pasada-c', ayer, { formato: 'carrusel' }), fila(k, 'futura', lejos), fila(k, 'hecha', ayer, { estado: 'en_oficina' }))
  let n = 0
  if (o.mesa !== null) al.mesaDeReubicacion = async () => (o.mesa === 'no_abre' ? { estado: 'no_abre', motivo: 'plantilla_inactiva' } : { estado: 'abierta', encargo_id: `enc-${++n}` })
  return al
}
const filaDe = (al: AlmacenMemoria, id: string) => al.filasGuardadas.find((f) => f.id === id)!
const libreta = (al: AlmacenMemoria) => (al.config.get(CLAVE_DE_LA_LIBRETA) ?? {}) as Libreta
const decisionUnica = (al: AlmacenMemoria, k: Caso) => Object.values(libreta(al)[CAMP(k)].decisiones)
const reloj = (al: AlmacenMemoria, ahora: string, extra: Record<string, unknown> = {}) => relojDeLaCadena(al, { ...VIGIA, ...extra }, ahora)
const entrega = (k: Caso, version: number, texto: string | null) => ({ campana_id: CAMP(k), version, encargo_id: 'enc-1', texto, costo_usd: 0.2, motivo: texto ? null : 'la mesa no produjo nada' })

const avisoNoDecidida = (fecha: string) => `reubicación: perdió su fecha (${fecha}) · la propuesta no cumple: el agente no decidió esta fila`

describe('el lector: la forma «fila · acción · …», con o sin viñeta (código puro)', () => {
  it('🔴 sin guion, con guion, con asterisco, con número, con id entre comillas o en negrita: se leen igual', () => {
    for (const linea of ['f1 · reubicar · 2026-12-07 · razón', '- f1 · reubicar · 2026-12-07 · razón', '* f1 · reubicar · 2026-12-07 · razón', '1. f1 · reubicar · 2026-12-07 · razón', '2) f1 · reubicar · 2026-12-07 · razón', '`f1` · reubicar · `2026-12-07` · razón', '- **f1** · **reubicar** · 2026-12-07 · razón', '   f1 · Reubicar · 2026-12-07 · razón']) {
      expect(leerDecisiones(linea), linea).toEqual([{ fila_id: 'f1', accion: 'reubicar', fecha: '2026-12-07', razon: 'razón' }])
    }
  })
  it('🔴 la respuesta real (sin guion, con párrafos y líneas en blanco antes): saca las dos decisiones y nada más', () => {
    const texto = 'Analizo el contexto completo y entrego las decisiones finales.\n\n**Razonamiento previo (resumen):**\n\n- `f-historia` (plazo 4 → disponible desde 2026-11-14): el pergamino abre la saga.\n\n---\n\nf-historia · reubicar · 2026-11-14 · empareja con la de ese día\n\nf-reel · reubicar · 2026-12-07 · primer día libre con margen'
    expect(leerDecisiones(texto).map((d) => [d.fila_id, d.accion])).toEqual([['f-historia', 'reubicar'], ['f-reel', 'reubicar']])
  })
  it('🔴 lo que no tiene la forma no es una decisión: prosa con «·», id con espacios, acción desconocida, sin razón para reubicar', () => {
    for (const linea of ['La idea · es buena · para todos', 'la fila uno · reubicar · 2026-12-07 · x', 'f1 · mover · 2026-12-07 · x', 'f1 · reubicar · 2026-12-07', 'f1 · descartar']) expect(leerDecisiones(linea), linea).toEqual([])
  })
})

describe.each(CASOS)('$nombre', (k) => {
  const ayer = sumarDias(k.hoy, -1), antier = sumarDias(k.hoy, -2)
  const sinGuion = (k2: Caso) => `Pensé cada una.\n\npasada-a · reubicar · ${k2.abierto} · abre la semana\npasada-b · fusionar · futura · cuenta lo mismo\npasada-c · descartar · ya no vuelve`

  describe('(1) la vuelta sin guion se aplica', () => {
    it('🔴 la misma decisión que antes se perdía ahora reubica, fusiona y descarta', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora)
      expect(await recibirReubicacion(al, entrega(k, 1, sinGuion(k)), k.ahora)).toMatchObject({ ok: true, estado: 'aplicada' })
      expect(filaDe(al, 'pasada-a')).toMatchObject({ estado: 'validada', fecha: k.abierto })
      expect(filaDe(al, 'pasada-b')).toMatchObject({ estado: 'cancelada' })
      expect(filaDe(al, 'pasada-c')).toMatchObject({ estado: 'perdio_su_fecha', avisos: [`reubicación: perdió su fecha (${ayer}) · ya no vuelve`] })
    })
  })

  describe('(2) «no se leyó nada» = fallida, nunca descartar', () => {
    it('🔴 el agente respondió y no hay ninguna decisión legible: la decisión queda fallida con su aviso y NINGUNA fila se toca', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora)
      const antes = structuredClone(al.filasGuardadas)
      expect(await recibirReubicacion(al, entrega(k, 1, 'Lo pensé y creo que conviene moverlas a la semana que viene, con calma.'), k.ahora)).toMatchObject({ ok: true, estado: 'fallida' })
      expect(al.filasGuardadas).toEqual(antes)
      const [d] = decisionUnica(al, k)
      expect(d).toMatchObject({ estado: 'fallida', avisado: false })
      expect(d!.motivo).toMatch(/no se pudo leer ninguna decisión/)
      expect((await avisosDeReubicacion(al, true)).map((x) => x.texto).join()).toMatch(/no se tocó ninguna fila/)
      // el reloj la reintenta (otra versión), como cualquier fallida
      await reloj(al, k.ahora)
      expect(al.sobresDeReubicacion.map((s) => s.version)).toEqual([1, 2])
    })
    it('🔴 sabotaje: si SÍ se lee alguna decisión, la fila que el agente no decidió se sigue descartando con esa razón (como siempre)', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora)
      expect(await recibirReubicacion(al, entrega(k, 1, 'pasada-c · descartar · ya no vuelve'), k.ahora)).toMatchObject({ estado: 'aplicada' })
      expect(filaDe(al, 'pasada-a')).toMatchObject({ estado: 'perdio_su_fecha', avisos: [avisoNoDecidida(antier)] })
    })
  })

  describe('(3A) la relectura de la respuesta guardada (sin llamar al agente)', () => {
    /** el estado que dejó el lector viejo: decisión aplicada, las filas que no leyó en «perdió su fecha» y el texto guardado en el encargo */
    async function comoAnoche(textoGuardado: string | null) {
      const al = almacen(k)
      await reloj(al, k.ahora)
      await recibirReubicacion(al, entrega(k, 1, 'pasada-c · descartar · ya no vuelve'), k.ahora)
      expect(filaDe(al, 'pasada-a').estado).toBe('perdio_su_fecha')
      expect(filaDe(al, 'pasada-b').estado).toBe('perdio_su_fecha')
      if (textoGuardado !== null) al.textosDeLaMesa['enc-1'] = textoGuardado
      return al
    }
    it('🔴 el reloj relee la respuesta guardada: reubica y fusiona lo que el agente ya decidió, con las verificaciones de siempre; no abre otra mesa', async () => {
      const al = await comoAnoche(sinGuion(k))
      const r = await reloj(al, k.ahora)
      expect(r.status).toBe(200)
      // el mismo reloj manda el resumen por la línea de la campaña
      expect(JSON.stringify(r.cuerpo)).toMatch(/relectura de la respuesta que el agente ya había dado/)
      expect(filaDe(al, 'pasada-a')).toMatchObject({ estado: 'validada', fecha: k.abierto, dia_semana: diaSemanaIso(k.abierto) })
      expect(filaDe(al, 'pasada-a').avisos.at(-1)).toMatch(new RegExp(`^reubicación: reubicada del ${antier} al ${k.abierto} · abre la semana \\(relectura`))
      expect(filaDe(al, 'pasada-b')).toMatchObject({ estado: 'cancelada' })
      expect(filaDe(al, 'futura').avisos.at(-1)).toMatch(/absorbe a pasada-b/)
      // la que el agente ya había descartado no se toca otra vez
      expect(filaDe(al, 'pasada-c').avisos).toEqual([`reubicación: perdió su fecha (${ayer}) · ya no vuelve`])
      expect(al.sobresDeReubicacion).toHaveLength(1) // solo la mesa de anoche: la relectura no llama al agente
      const [d] = decisionUnica(al, k)
      expect(d).toMatchObject({ releida: true })
      expect(d!.resumen).toMatch(/relectura de la respuesta que el agente ya había dado\): 1 reubicada\(s\), 1 fusionada\(s\), 0 descartada/)
    })
    it('🔴 una sola vez: otra pasada del reloj no relee ni escribe nada más', async () => {
      const al = await comoAnoche(sinGuion(k))
      await reloj(al, k.ahora)
      const filas = structuredClone(al.filasGuardadas)
      await reloj(al, k.ahora)
      expect(al.filasGuardadas).toEqual(filas)
      expect(al.sobresDeReubicacion).toHaveLength(1)
    })
    it('🔴 la fecha que el agente propuso ya no cumple (día cerrado de la sede): la fila se queda fuera, con la razón del código', async () => {
      const al = await comoAnoche(`pasada-a · reubicar · ${k.cerrado} · x\npasada-b · descartar · y`)
      await reloj(al, k.ahora)
      expect(filaDe(al, 'pasada-a')).toMatchObject({ estado: 'perdio_su_fecha', fecha: antier })
      expect(filaDe(al, 'pasada-a').avisos.at(-1)).toMatch(/la propuesta no cumple: .*cerrada ese día.*relectura/)
      expect(filaDe(al, 'pasada-b').avisos.at(-1)).toMatch(/· y \(relectura/)
      expect(decisionUnica(al, k)[0]!.resumen).toMatch(/1 porque la fecha propuesta ya no cumple/)
    })
    it('🔴 sabotaje: una fila «perdió su fecha» por OTRA razón (el agente la descartó) no se relee aunque el texto la mencione', async () => {
      const al = await comoAnoche(`pasada-c · reubicar · ${k.abierto} · ahora sí`)
      await reloj(al, k.ahora)
      expect(filaDe(al, 'pasada-c')).toMatchObject({ estado: 'perdio_su_fecha', fecha: ayer })
    })
    it('🔴 sin texto guardado: se marca como releída y nada cambia (no se llama al agente)', async () => {
      const al = await comoAnoche(null)
      const filas = structuredClone(al.filasGuardadas)
      await reloj(al, k.ahora)
      expect(al.filasGuardadas).toEqual(filas)
      expect(decisionUnica(al, k)[0]).toMatchObject({ releida: true })
      expect(al.sobresDeReubicacion).toHaveLength(1)
    })
    it('🔴 apagado: con el interruptor en false no se relee nada', async () => {
      const al = await comoAnoche(sinGuion(k))
      al.config.set(INTERRUPTOR_DE_REUBICACION, false)
      const filas = structuredClone(al.filasGuardadas)
      await reloj(al, k.ahora)
      expect(al.filasGuardadas).toEqual(filas)
      expect(decisionUnica(al, k)[0]!.releida).toBeUndefined()
    })
    it('🔴 una fila que la respuesta guardada TAMPOCO decide queda como estaba: ni otra nota ni otro cambio', async () => {
      const al = await comoAnoche(`pasada-a · reubicar · ${k.abierto} · abre la semana`)
      const b = structuredClone(filaDe(al, 'pasada-b'))
      await reloj(al, k.ahora)
      expect(filaDe(al, 'pasada-a').estado).toBe('validada')
      expect(filaDe(al, 'pasada-b')).toEqual(b)
    })
    it('🔴 si el calendario cambió de versión, la decisión vieja no se relee (aunque la versión nueva tenga filas con el mismo id)', async () => {
      const al = await comoAnoche(sinGuion(k))
      for (const id of ['pasada-a', 'pasada-b']) al.filasGuardadas.push({ ...structuredClone(filaDe(al, id)), calendario_version: 2 })
      const v2 = () => al.filasGuardadas.filter((f) => f.calendario_version === 2)
      const antes = structuredClone(v2())
      await reloj(al, k.ahora)
      expect(v2()).toEqual(antes)
    })
    it('🔴 una fila que otra vía ya movió (no está en «perdió su fecha») no se toca', async () => {
      const al = await comoAnoche(sinGuion(k))
      filaDe(al, 'pasada-a').estado = 'cancelada'
      await reloj(al, k.ahora)
      expect(filaDe(al, 'pasada-a')).toMatchObject({ estado: 'cancelada', fecha: antier })
    })
    // 🟡 CC7 punto 2 · la fila que la relectura NO logra reubicar sigue en «perdió su fecha» con el aviso exacto: sin la marca se releería cada 30 min
    it('🔴 dos pasadas seguidas con una fecha que ya no cumple: UNA relectura, UN aviso por fila y UN resumen', async () => {
      const al = await comoAnoche(`pasada-a · reubicar · ${k.cerrado} · x
pasada-b · reubicar · ${k.cerrado} · y`)
      const r1 = await reloj(al, k.ahora)
      expect(JSON.stringify(r1.cuerpo).match(/relectura de la respuesta que el agente ya había dado/g) ?? []).toHaveLength(1)
      expect(filaDe(al, 'pasada-a').estado).toBe('perdio_su_fecha')
      const avisos = structuredClone(filaDe(al, 'pasada-a').avisos)
      expect(avisos.filter((a) => /relectura/.test(a))).toHaveLength(1)
      const r2 = await reloj(al, k.ahora)
      expect(filaDe(al, 'pasada-a').avisos).toEqual(avisos)
      expect(JSON.stringify(r2.cuerpo)).not.toMatch(/relectura/)
      expect(decisionUnica(al, k)[0]!.resumen!.match(/relectura de la respuesta/g)).toHaveLength(1)
      expect(await avisosDeReubicacion(al, true)).toEqual([])
    })
    // 🟡 CC7 punto 3 · como el resto de la reubicación (punto 3 de #1010): una campaña de ensayo no entra
    it('🔴 una campaña de ensayo no se relee', async () => {
      const al = await comoAnoche(sinGuion(k))
      al.campanas.find((c) => c.id === CAMP(k))!.seco = true
      const filas = structuredClone(al.filasGuardadas)
      await reloj(al, k.ahora)
      expect(al.filasGuardadas).toEqual(filas)
      expect(decisionUnica(al, k)[0]!.releida).toBeUndefined()
    })
    it('🔴 un entorno que no puede leer el texto guardado no marca ni manda avisos a la campaña', async () => {
      const al = await comoAnoche(sinGuion(k))
      ;(al as { textoGuardadoDeLaMesa?: unknown }).textoGuardadoDeLaMesa = undefined
      const filas = structuredClone(al.filasGuardadas)
      const r = await reloj(al, k.ahora)
      expect(al.filasGuardadas).toEqual(filas)
      expect(decisionUnica(al, k)[0]!.releida).toBeUndefined()
      expect(JSON.stringify(r.cuerpo)).not.toMatch(/no se pudo releer/)
    })
    // 🟡 CC7 punto 4 · un error pasajero al leer el texto guardado no da la relectura por hecha
    it('🔴 si la lectura del texto guardado falla, NO se marca y la pasada siguiente lo vuelve a intentar', async () => {
      const al = await comoAnoche(sinGuion(k))
      al.textosQueFallan.add('enc-1')
      const filas = structuredClone(al.filasGuardadas)
      await reloj(al, k.ahora)
      expect(al.filasGuardadas).toEqual(filas)
      expect(decisionUnica(al, k)[0]!.releida).toBeUndefined()
      al.textosQueFallan.delete('enc-1')
      await reloj(al, k.ahora)
      expect(filaDe(al, 'pasada-a')).toMatchObject({ estado: 'validada', fecha: k.abierto })
      expect(decisionUnica(al, k)[0]).toMatchObject({ releida: true })
      expect(al.sobresDeReubicacion).toHaveLength(1)
    })
  })

  // 11-nov · GO Lenovo 15:26 (opción A de Emilio): la hora que propone la mesa se ESCRIBE en la fila, por las dos vías
  describe('(opción A) la hora propuesta queda en la fila', () => {
    it('🔴 al recibir la decisión: fecha Y hora nuevas en la fila', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora)
      expect(await recibirReubicacion(al, entrega(k, 1, `pasada-a · reubicar · ${k.abierto} · 12:15 · no pisa a la otra pieza
pasada-b · descartar · y
pasada-c · descartar · z`), k.ahora)).toMatchObject({ estado: 'aplicada' })
      expect(filaDe(al, 'pasada-a')).toMatchObject({ estado: 'validada', fecha: k.abierto, hora: '12:15' })
      expect(filaDe(al, 'pasada-a').avisos.at(-1)).toContain(`a las 12:15 (antes ${k.hora})`)
    })
    it('🔴 en la relectura de la respuesta guardada: también la hora', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora)
      await recibirReubicacion(al, entrega(k, 1, 'pasada-c · descartar · ya no vuelve'), k.ahora)
      al.textosDeLaMesa['enc-1'] = `pasada-a · reubicar · ${k.abierto} · 12:15 · no pisa a la otra pieza`
      await reloj(al, k.ahora)
      expect(filaDe(al, 'pasada-a')).toMatchObject({ estado: 'validada', fecha: k.abierto, hora: '12:15' })
    })
  })

  // 🟡 CC7 punto 4 · el mismo hueco de anoche con otra cara: líneas legibles que no son de ESTAS filas
  describe('(2b) leídas = solo las de las filas de esta decisión', () => {
    it('🔴 el agente decide sobre filas con otro id: es fallida, con su aviso, y NINGUNA fila se toca', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora)
      const antes = structuredClone(al.filasGuardadas)
      expect(await recibirReubicacion(al, entrega(k, 1, `fila-a · reubicar · ${k.abierto} · x
fila-c · descartar · y`), k.ahora)).toMatchObject({ ok: true, estado: 'fallida' })
      expect(al.filasGuardadas).toEqual(antes)
      const [d] = decisionUnica(al, k)
      expect(d).toMatchObject({ estado: 'fallida', avisado: false })
      expect(d!.motivo).toMatch(/ninguna de sus 2 decisión\(es\) nombra una fila de esta reubicación/)
    })
    it('🔴 decidir sobre una fila que no es pasada (la futura) tampoco cuenta como leída', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora)
      const antes = structuredClone(al.filasGuardadas)
      expect(await recibirReubicacion(al, entrega(k, 1, 'futura · descartar · y'), k.ahora)).toMatchObject({ estado: 'fallida' })
      expect(al.filasGuardadas).toEqual(antes)
    })
    it('🔴 sabotaje: con UNA línea de estas filas entre otras ajenas, se aplica (y la ajena se ignora)', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora)
      expect(await recibirReubicacion(al, entrega(k, 1, `otra · descartar · z
pasada-a · reubicar · ${k.abierto} · x`), k.ahora)).toMatchObject({ estado: 'aplicada' })
      expect(filaDe(al, 'pasada-a')).toMatchObject({ estado: 'validada', fecha: k.abierto })
      expect(decisionUnica(al, k)[0]!.resumen).toMatch(/1 decisión\(es\) sobre filas que no eran pasadas, ignorada/)
    })
  })
})
