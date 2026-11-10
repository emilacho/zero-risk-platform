/**
 * 10-nov · LAS FILAS QUE QUEDARON ATRÁS · el lado de la cadena: el reloj abre UNA decisión, la vuelta se verifica por código y se aplica fila por fila; apagado = nada.
 * Contra el almacén en memoria: sin modelo, sin red, US$ 0. DOS clientes de práctica de rubros distintos en cada criterio:
 *   · A · cafetería de barrio (cierra martes y miércoles) · B · clínica veterinaria (cierra domingo).
 * Sabotaje del GO: una fila futura sana NUNCA se toca. Nada aquí nombra a un cliente real.
 */
import { describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, clienteB, contextoDe, type ClienteFixture } from '../__fixtures__/clientes'
import type { Campana } from '../almacen'
import { diaSemanaIso, sumarDias } from '../fechas'
import { puertoDeLaCadena } from '../mesas'
import { relojDeLaCadena } from '../reloj'
import { CLAVE_DE_LA_LIBRETA, INTERRUPTOR_DE_REUBICACION, PLAZO_DE_LA_DECISION_MIN, recibirReubicacion, type Libreta, type SobreDeReubicacion } from '../reubicar'
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

function fila(k: Caso, id: string, fecha: string, extra: Partial<Fila & { calendario_version: number }> = {}): Fila & { campana_id: string; calendario_version: number } {
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
    estado: 'activa', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: true,
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
/** «sacar» lo variable (el latido y la libreta) para comparar dos corridas del reloj */
const sinLatido = (c: Record<string, unknown>) => ({ ...c, latido: 'x' })

describe.each(CASOS)('$nombre', (k) => {
  const ayer = sumarDias(k.hoy, -1)

  describe('apagado = byte a byte con hoy', () => {
    it('🔴 sin el interruptor: el reloj no abre nada, no escribe la libreta, no toca filas y responde igual que sin filas pasadas', async () => {
      const al = almacen(k, { encendida: false })
      const antes = structuredClone(al.filasGuardadas)
      const r = await reloj(al, k.ahora)
      expect(al.sobresDeReubicacion).toEqual([])
      expect(al.config.has(CLAVE_DE_LA_LIBRETA)).toBe(false)
      expect(al.filasGuardadas).toEqual(antes)
      const sinPasadas = almacen(k, { encendida: false })
      sinPasadas.filasGuardadas = sinPasadas.filasGuardadas.filter((f) => !f.id.startsWith('pasada'))
      expect(sinLatido(r.cuerpo)).toEqual(sinLatido((await reloj(sinPasadas, k.ahora)).cuerpo))
    })
    it('el interruptor con un valor que no es `true` (texto, lista) cuenta como apagado', async () => {
      for (const v of ['true', 'si', [UUID_CLIENTE(k)], { clientes: [UUID_CLIENTE(k)] }]) {
        const al = almacen(k)
        al.config.set(INTERRUPTOR_DE_REUBICACION, v)
        await reloj(al, k.ahora)
        expect(al.sobresDeReubicacion, JSON.stringify(v)).toEqual([])
      }
    })
    it('🔴 una pasada del reloj en seco nunca abre la mesa (abrirla gasta)', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora, { seco: true })
      expect(al.sobresDeReubicacion).toEqual([])
    })
  })

  describe('el reloj abre UNA decisión', () => {
    it('🔴 un solo sobre por campaña con las filas pasadas sin producir; la futura y la ya producida van como contexto o no van', async () => {
      const al = almacen(k)
      const r = await reloj(al, k.ahora)
      expect(r.status).toBe(200)
      expect(al.sobresDeReubicacion).toHaveLength(1)
      const s: SobreDeReubicacion = al.sobresDeReubicacion[0]
      expect(s).toMatchObject({ tipo_de_mesa: 'reubicacion', campana_id: CAMP(k), client_id: UUID_CLIENTE(k), version: 1, dry_run: true, condiciones: [] })
      const pasadas = s.marco_texto.split('## Las filas que vienen')[0]
      for (const id of ['pasada-a', 'pasada-b', 'pasada-c']) expect(pasadas).toContain(`- ${id} ·`)
      expect(pasadas).not.toContain('- futura ·')
      expect(s.marco_texto).not.toContain('- hecha ·')
      expect(decisionUnica(al, k)).toMatchObject([{ estado: 'abierta', intentos: 1, version: 1, encargo_id: 'enc-1', fila_ids: ['pasada-a', 'pasada-b', 'pasada-c'] }])
    })
    it('🔴 idempotente: otra pasada del reloj dentro del plazo no abre otra mesa', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora)
      await reloj(al, masMin(k.ahora, 30))
      expect(al.sobresDeReubicacion).toHaveLength(1)
    })
    it('🔴 una sola decisión viva por campaña: si otra fila queda atrás mientras la mesa decide, no se abre una segunda mesa en paralelo', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora)
      al.filasGuardadas.push(fila(k, 'pasada-d', sumarDias(k.hoy, -3)))
      await reloj(al, masMin(k.ahora, 10))
      expect(al.sobresDeReubicacion).toHaveLength(1)
    })
    it('sin filas pasadas no abre nada', async () => {
      const al = almacen(k)
      al.filasGuardadas = al.filasGuardadas.filter((f) => !f.id.startsWith('pasada'))
      await reloj(al, k.ahora)
      expect(al.sobresDeReubicacion).toEqual([])
    })
    it('🔴 tope de intentos: la mesa que no vuelve se reintenta UNA vez; después, UN aviso y nada más', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora)
      await reloj(al, masMin(k.ahora, PLAZO_DE_LA_DECISION_MIN + 1))
      expect(al.sobresDeReubicacion.map((s) => s.version)).toEqual([1, 2])
      const r3 = await reloj(al, masMin(k.ahora, 2 * PLAZO_DE_LA_DECISION_MIN + 2))
      expect(al.sobresDeReubicacion).toHaveLength(2)
      expect(decisionUnica(al, k)[0].estado).toBe('agotada')
      const linea = (r3.cuerpo.alertas as Array<{ lineas: string[] }>).flatMap((a) => a.lineas).filter((l) => l.startsWith('reubicación:'))
      expect(linea).toHaveLength(1)
      const r4 = await reloj(al, masMin(k.ahora, 3 * PLAZO_DE_LA_DECISION_MIN))
      expect(al.sobresDeReubicacion).toHaveLength(2)
      expect((r4.cuerpo.alertas as Array<{ lineas: string[] }>).flatMap((a) => a.lineas).filter((l) => l.startsWith('reubicación:'))).toEqual([])
      expect(filaDe(al, 'pasada-a').estado).toBe('validada')
    })
    it('🔴 la mesa no abre (plantilla inactiva): cuenta como intento; al tope, un aviso y nada más', async () => {
      const al = almacen(k, { mesa: 'no_abre' })
      await reloj(al, k.ahora)
      await reloj(al, masMin(k.ahora, 1))
      await reloj(al, masMin(k.ahora, 2))
      await reloj(al, masMin(k.ahora, 3))
      expect(al.sobresDeReubicacion).toHaveLength(2)
      expect(decisionUnica(al, k)[0]).toMatchObject({ estado: 'agotada', intentos: 2 })
    })
    it('sin el puerto de la oficina: un aviso, ningún sobre', async () => {
      const al = almacen(k, { mesa: null })
      const r = await reloj(al, k.ahora)
      expect((r.cuerpo.alertas as Array<{ lineas: string[] }>).flatMap((a) => a.lineas).some((l) => l.includes('no puede abrir la mesa'))).toBe(true)
      await reloj(al, masMin(k.ahora, 1))
      expect(decisionUnica(al, k)).toHaveLength(1)
    })
  })

  describe('la vuelta: verificar por código y aplicar', () => {
    const decision = (k2: Caso) => [
      'Pensé cada una.',
      `- pasada-a · reubicar · ${k2.abierto} · es la que abre la semana: va al primer día abierto con margen`,
      '- pasada-b · fusionar · futura · cuenta lo mismo que la que viene',
      '- pasada-c · descartar · era de una fecha que ya no vuelve',
      '- futura · descartar · intento de tocar una fila futura (sabotaje)',
    ].join('\n')
    it('🔴 reubica, fusiona y descarta con sus razones en los avisos de cada fila; la fila futura sana NO se toca (sabotaje del GO)', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora)
      const futuraAntes = structuredClone(filaDe(al, 'futura'))
      const r = await recibirReubicacion(al, entrega(k, 1, decision(k)), k.ahora)
      expect(r).toMatchObject({ ok: true, estado: 'aplicada' })
      expect(filaDe(al, 'pasada-a')).toMatchObject({ estado: 'validada', fecha: k.abierto, dia_semana: diaSemanaIso(k.abierto) })
      expect(filaDe(al, 'pasada-a').avisos).toEqual([`reubicación: reubicada del ${sumarDias(k.hoy, -2)} al ${k.abierto} · es la que abre la semana: va al primer día abierto con margen`])
      expect(filaDe(al, 'pasada-b')).toMatchObject({ estado: 'cancelada' })
      expect(filaDe(al, 'pasada-b').avisos[0]).toMatch(/^reubicación: fusionada con futura/)
      expect(filaDe(al, 'pasada-c')).toMatchObject({ estado: 'perdio_su_fecha', avisos: [`reubicación: perdió su fecha (${ayer}) · era de una fecha que ya no vuelve`] })
      // la futura solo gana la nota de la fusión (su fecha, su estado y lo demás, iguales)
      const fut = filaDe(al, 'futura')
      expect({ ...fut, avisos: [] }).toEqual({ ...futuraAntes, avisos: [] })
      expect(fut.avisos).toEqual([`reubicación: absorbe a pasada-b (era del ${ayer}) · cuenta lo mismo que la que viene`])
      expect(filaDe(al, 'hecha')).toMatchObject({ estado: 'en_oficina', avisos: [] })
    })
    it('🔴 una propuesta que no cumple (día cerrado de la sede) se descarta con la razón del código, nunca a medias', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora)
      await recibirReubicacion(al, entrega(k, 1, `- pasada-a · reubicar · ${k.cerrado} · x\n- pasada-b · descartar · y\n- pasada-c · descartar · z`), k.ahora)
      expect(filaDe(al, 'pasada-a')).toMatchObject({ estado: 'perdio_su_fecha', fecha: sumarDias(k.hoy, -2) })
      expect(filaDe(al, 'pasada-a').avisos[0]).toMatch(/la propuesta no cumple: .*cerrada ese día/)
    })
    it('🔴 el resumen se avisa UNA vez por la línea de la campaña', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora)
      await recibirReubicacion(al, entrega(k, 1, decision(k)), k.ahora)
      const lineas = async (t: string) => ((await reloj(al, t)).cuerpo.alertas as Array<{ lineas: string[] }>).flatMap((a) => a.lineas).filter((l) => l.startsWith('reubicación de'))
      expect(await lineas(masMin(k.ahora, 1))).toEqual(['reubicación de 3 fila(s) que quedaron atrás: 1 reubicada(s), 1 fusionada(s), 1 descartada(s) · 1 decisión(es) sobre filas que no eran pasadas, ignorada(s)'])
      expect(await lineas(masMin(k.ahora, 2))).toEqual([])
      expect(al.sobresDeReubicacion).toHaveLength(1)
    })
    it('🔴 idempotente: la misma vuelta otra vez (o una vuelta vieja) no aplica nada', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora)
      await recibirReubicacion(al, entrega(k, 1, decision(k)), k.ahora)
      const antes = structuredClone(al.filasGuardadas)
      expect(await recibirReubicacion(al, entrega(k, 1, decision(k)), k.ahora)).toMatchObject({ ok: true, ya_cerrada: true })
      expect(await recibirReubicacion(al, entrega(k, 7, decision(k)), k.ahora)).toMatchObject({ ok: false })
      expect(al.filasGuardadas).toEqual(antes)
    })
    it('🔴 una vuelta sin texto deja la decisión fallida; el reloj la reintenta con otra versión y la vuelta del intento viejo ya no aplica', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora)
      expect(await recibirReubicacion(al, entrega(k, 1, null), k.ahora)).toMatchObject({ ok: true, estado: 'fallida' })
      await reloj(al, masMin(k.ahora, 1))
      expect(al.sobresDeReubicacion.map((s) => s.version)).toEqual([1, 2])
      expect(await recibirReubicacion(al, entrega(k, 1, decision(k)), k.ahora)).toMatchObject({ ok: false })
      expect(filaDe(al, 'pasada-a').estado).toBe('validada')
      expect(await recibirReubicacion(al, entrega(k, 2, decision(k)), k.ahora)).toMatchObject({ ok: true, estado: 'aplicada' })
      expect(filaDe(al, 'pasada-a').fecha).toBe(k.abierto)
    })
    it('🔴 una fila que otra vía tomó mientras la mesa decidía no se toca (escritura condicional)', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora)
      filaDe(al, 'pasada-a').estado = 'en_oficina'
      await recibirReubicacion(al, entrega(k, 1, decision(k)), k.ahora)
      expect(filaDe(al, 'pasada-a')).toMatchObject({ estado: 'en_oficina', fecha: sumarDias(k.hoy, -2), avisos: [] })
      expect(filaDe(al, 'pasada-c').estado).toBe('perdio_su_fecha')
    })
    it('🔴 una fila que quedó atrás DESPUÉS de abrir la decisión no se toca con esta vuelta (es de la decisión siguiente)', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora)
      al.filasGuardadas.push(fila(k, 'pasada-d', sumarDias(k.hoy, -3)))
      await recibirReubicacion(al, entrega(k, 1, decision(k)), k.ahora)
      expect(filaDe(al, 'pasada-d')).toMatchObject({ estado: 'validada', avisos: [] })
    })
    it('si el calendario cambió de versión mientras decidía, la decisión queda obsoleta y no toca nada', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora)
      al.filasGuardadas.push(fila(k, 'otra', sumarDias(k.abierto, 3), { calendario_version: 2 }))
      const antes = structuredClone(al.filasGuardadas)
      expect(await recibirReubicacion(al, entrega(k, 1, decision(k)), k.ahora)).toMatchObject({ ok: true, estado: 'obsoleta' })
      expect(al.filasGuardadas).toEqual(antes)
    })
    it('el puerto de la cadena (el de la oficina) entrega la reubicación', async () => {
      const al = almacen(k)
      await reloj(al, k.ahora)
      expect(await puertoDeLaCadena(al, () => k.ahora).entregarReubicacion(entrega(k, 1, decision(k)))).toMatchObject({ ok: true, estado: 'aplicada' })
    })
  })
})
