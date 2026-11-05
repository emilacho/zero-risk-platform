/**
 * 05-nov · LA META QUE EL DUEÑO FIRMÓ MANDA EN EL PLAN. Encargo de Lenovo «editar las cifras antes de firmar»: CC3 guarda la firma (#924) y esta pieza hace que la corrida siguiente la use.
 * La regla la cumple el código al calcular, no una instrucción al modelo: si el planteo trae otra meta, el cálculo usa la firmada y lo declara.
 */
import { describe, expect, it } from 'vitest'
import { abrirConversacion, avanzar, metaDeLaFirma } from '../src/lib/finanzas/conversa/orquestador'
import { almacenDeConversa } from '../src/lib/finanzas/conversa/almacen-supabase'
import { estadoInicial } from '../src/lib/oficina/tipos'
import type { AlmacenDeConversa, EncargoDeConversa, PuertosDeConversa } from '../src/lib/finanzas/conversa/puertos'
import { AGENTES } from '../src/lib/finanzas/conversa/plantilla'

const CLIENTE = 'cliente-1'
const rango = (min: number, max: number, base: number) => ({ min, max, base, tipo: 'supuesto', fuente: 'consulta' })
const PLANTEO = { meta_por_semana: 14, zonas: ['zona_a'], dias_y_horarios: { dias_activos_por_semana: 7 }, evento: 'mensaje', canales: [{ canal: 'meta_ig', peso: 1 }], produccion: { fraccion: 0.2 }, no_se: ['la tasa de cierre real'] }
const FPA = { agente: 'finance-fpa-analyst', resumen: 'r', supuestos: { ticket: rango(10, 14, 12), margen: rango(0.5, 0.6, 0.55), tasa_cierre: rango(0.25, 0.35, 0.3) }, preguntas_a_otros: [], alertas: [] }
const REDES = { agente: 'paid_media_paid_social_strategist', resumen: 'r', supuestos: { costo_por_resultado: rango(0.4, 1.2, 0.8) }, preguntas_a_otros: [], alertas: [] }
const VACIA = { agente: 'x', resumen: 'r', supuestos: {}, preguntas_a_otros: [], alertas: [] }
const ACUERDO = { salida: 'sale', hallazgos: [], conflictos_resueltos: [], preguntas_a_emilio: [] }
const FIRMA = { de_tablero: 't', de_version: 3, cambios: [{ clave: 'total_mes', propuesto: 1341.27, firmado: 939 }], meta_por_semana: 3.5, total_mes: 939, propuesto: { meta_por_semana: 5, total_mes: 1341.27 }, por: 'emilio', en: '2026-11-05T01:00:00Z' }

function mundo(firma?: { ok: true; firma: Record<string, unknown> | null } | { ok: false; error: string }) {
  const encargos = new Map<string, EncargoDeConversa>()
  const arts: Record<string, Record<string, unknown>> = {}
  const pedidos: string[] = []
  const almacen: AlmacenDeConversa = {
    async crearEncargo(n) {
      const e = { id: 'enc-1', client_id: n.client_id, estado: 'abierto', estado_del_motor: estadoInicial(), gasto_usd: 0, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: n.dry_run, semilla: n.semilla } as unknown as EncargoDeConversa
      encargos.set(e.id, e)
      return { ok: true, encargo: structuredClone(e), nuevo: true }
    },
    async leerEncargo(id) { const e = encargos.get(id); return e ? structuredClone(e) : null },
    async guardar(ch) {
      const e = encargos.get(ch.encargo_id)!
      e.estado_del_motor = structuredClone(ch.estado_del_motor); e.gasto_usd = ch.gasto_usd
      if (ch.estado) e.estado = ch.estado
      if (ch.artefacto) arts[ch.artefacto.tipo] = structuredClone(ch.artefacto.contenido)
    },
    async artefactos() { return structuredClone(arts) },
    async turnos() { return [] },
    ...(firma ? { ultimaFirmaConCambios: async () => firma } : {}),
  }
  const respuestas: Record<string, unknown> = { [AGENTES.proponente]: PLANTEO, 'finance-fpa-analyst': FPA, paid_media_paid_social_strategist: REDES, 'paid_media_ppc_strategist': VACIA, 'tracking-specialist': VACIA }
  const P = {
    almacen,
    modelo: { async invocar(p: { agente: string; tarea?: string; pedido?: string }) { pedidos.push(JSON.stringify(p)); return { ok: true, salida: JSON.stringify(respuestas[p.agente] ?? ACUERDO), costo_usd: 0.01 } } },
    slack: { async publicar() { return { ok: true, ts: '1.1' } }, async leer(p: { desde_ts: string | null }) { return { ok: true, mensajes: [], leido_hasta: p.desde_ts } } },
    tableros: { async guardarTablero() { return { id: 'tab-1', version: 1 } }, async actualizarTablero() {}, async invocacionDelJefe() { return true } },
    async config() { return { estado: 'encendida', clientes_ensayo: [], preguntas_slack: 'apagado', conversa: 'enciende' } },
    ahora: () => new Date('2026-11-05T12:00:00Z'),
    canalDelHilo: 'C-PRIVADO',
    emilio_id: 'U',
  } as unknown as PuertosDeConversa
  return { P, encargos, arts, pedidos }
}
const abrir = (m: ReturnType<typeof mundo>, semilla: Record<string, unknown> = {}) => abrirConversacion(m.P, { client_id: CLIENTE, dry_run: false, semilla: { evento: 'mensaje', dias_activos_por_semana: 7, ...semilla } })
async function hastaElBloque(m: ReturnType<typeof mundo>) {
  for (let i = 0; i < 30 && !m.arts.bloque; i++) { const r = await avanzar(m.P, 'enc-1'); if (r.status !== 200 || r.cuerpo.terminado) break }
  return m.arts.bloque as { entrada: { meta_por_semana: number }; alertas_de_entrada?: string[] } & Record<string, unknown>
}

describe('la meta firmada por el dueño manda en el plan', () => {
  it('🔴 con una firma, el cálculo usa la meta firmada aunque el agente proponga otra, y lo declara', async () => {
    const m = mundo({ ok: true, firma: FIRMA })
    expect((await abrir(m)).status).toBe(200)
    const b = await hastaElBloque(m)
    expect(b.entrada.meta_por_semana).toBe(3.5)
    const alertas = JSON.stringify(b)
    expect(alertas).toContain('meta_fijada_por_el_dueno: se usó 3.5 por semana, firmada por emilio el 2026-11-05; la oficina proponía 14')
  })
  it('🔴 si el agente ya propone la firmada, no dice que proponía otra', async () => {
    const m = mundo({ ok: true, firma: { ...FIRMA, meta_por_semana: 14 } })
    await abrir(m)
    const b = await hastaElBloque(m)
    expect(b.entrada.meta_por_semana).toBe(14)
    expect(JSON.stringify(b)).toContain('se usó 14 por semana')
    expect(JSON.stringify(b)).not.toContain('la oficina proponía')
  })
  it('🔴 sin firma, todo sigue igual: manda lo que propone la oficina', async () => {
    const m = mundo({ ok: true, firma: null })
    await abrir(m)
    const b = await hastaElBloque(m)
    expect(b.entrada.meta_por_semana).toBe(14)
    expect(JSON.stringify(b)).not.toContain('meta_fijada_por_el_dueno')
  })
  it('🔴 los agentes reciben el dato en el expediente', async () => {
    const m = mundo({ ok: true, firma: FIRMA })
    await abrir(m)
    await hastaElBloque(m)
    expect(m.arts.expediente.meta_fijada_por_el_dueno).toEqual({ meta_por_semana: 3.5, total_mes: 939, por: 'emilio', en: '2026-11-05T01:00:00Z' })
    expect(m.pedidos.some((p) => p.includes('esa meta ya la firmó el dueño'))).toBe(true)
  })
  it('🔴 si no se puede leer la firma, no abre: calcular con otra meta ignoraría la firma sin decirlo', async () => {
    const m = mundo({ ok: false, error: 'caída' })
    const r = await abrir(m)
    expect(r.status).toBe(503)
    expect(r.cuerpo).toMatchObject({ error: 'firma_ilegible', sin_bloque: true })
    expect(m.encargos.size).toBe(0)
  })
  it('🔴 una firma sin meta válida tampoco abre', async () => {
    for (const meta of [undefined, 0, -1, '3', Number.NaN]) {
      const m = mundo({ ok: true, firma: { ...FIRMA, meta_por_semana: meta } })
      expect((await abrir(m)).status).toBe(503)
    }
  })
  it('🔴 una meta que llega de fuera en la semilla se ignora', async () => {
    const m = mundo({ ok: true, firma: null })
    await abrir(m, { meta_fijada_por_el_dueno: { meta_por_semana: 999 } })
    expect(m.encargos.get('enc-1')!.semilla.meta_fijada_por_el_dueno).toBeUndefined()
    const b = await hastaElBloque(m)
    expect(b.entrada.meta_por_semana).toBe(14)
  })
  it('🔴 una meta de fuera tampoco pisa la firmada', async () => {
    const m = mundo({ ok: true, firma: FIRMA })
    await abrir(m, { meta_fijada_por_el_dueno: { meta_por_semana: 999 } })
    expect(m.encargos.get('enc-1')!.semilla.meta_fijada_por_el_dueno?.meta_por_semana).toBe(3.5)
  })
  it('metaDeLaFirma conserva lo que trae y no inventa lo que falta', () => {
    expect(metaDeLaFirma(null)).toBeNull()
    expect(metaDeLaFirma({ meta_por_semana: 2 })).toEqual({ meta_por_semana: 2, total_mes: null, por: null, en: null })
    expect(metaDeLaFirma({ meta_por_semana: 2, total_mes: 'x', por: 1, en: 2 })).toEqual({ meta_por_semana: 2, total_mes: null, por: null, en: null })
  })
})

describe('la lectura de la última firma', () => {
  const db = (res: unknown, llamadas: unknown[][] = []) => {
    const q: Record<string, unknown> = {}
    for (const m of ['select', 'eq', 'not', 'order', 'limit']) q[m] = (...a: unknown[]) => { llamadas.push([m, ...a]); return q }
    ;(q as { then: unknown }).then = (ok: (x: unknown) => unknown, ko: (e: unknown) => unknown) => (res instanceof Error ? Promise.reject(res) : Promise.resolve(res)).then(ok, ko)
    return { from: (t: string) => { llamadas.push(['from', t]); return q } }
  }
  const almacen = (d: unknown) => almacenDeConversa(d as never)
  it('🔴 busca la última firma con cambios del cliente, real y por versión, no el último tablero', async () => {
    const l: unknown[][] = []
    expect(await almacen(db({ data: [{ firma_con_cambios: FIRMA }], error: null }, l)).ultimaFirmaConCambios!(CLIENTE)).toEqual({ ok: true, firma: FIRMA })
    expect(l).toEqual(expect.arrayContaining([['from', 'finanzas_tableros'], ['eq', 'client_id', CLIENTE], ['eq', 'dry_run', false], ['not', 'firma_con_cambios', 'is', null], ['order', 'version', { ascending: false }], ['limit', 1]]))
  })
  it('🔴 sin filas no hay firma', async () => expect(await almacen(db({ data: [], error: null })).ultimaFirmaConCambios!(CLIENTE)).toEqual({ ok: true, firma: null }))
  it('🔴 un error de la base es «no se pudo», nunca «no hay firma»', async () => {
    expect(await almacen(db({ data: null, error: { message: 'column does not exist' } })).ultimaFirmaConCambios!(CLIENTE)).toEqual({ ok: false, error: 'column does not exist' })
    expect(await almacen(db(new Error('red'))).ultimaFirmaConCambios!(CLIENTE)).toEqual({ ok: false, error: 'red' })
  })
})
