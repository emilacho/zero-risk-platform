/**
 * OFICINA DE MARKETING · T1 · F2 (firmada por Emilio 31-oct): el que redacta el plan propone y ajusta en la conversación financiera, y es DATO (`cadena_config.planeacion.redactor`), no un nombre en el código.
 * Más el punto 1 de CC3: `jefe-marketing` como proponente produce un `planteo.v1` VÁLIDO (contrato con una respuesta de ejemplo con la forma real de sus salidas: bloque ```json) y,
 * si se sale del esquema dos veces, el turno queda `fallo` con «sin supuestos del agente», la conversación sigue y termina sola (nunca se cuelga): Emilio lo ve en la bandeja/hilo.
 * Todo SIMULADO: US$ 0, 0 llamadas reales.
 */
import { describe, expect, it } from 'vitest'
import { estadoInicial } from '../src/lib/oficina/tipos'
import { almacenDeFinanzas } from '../src/lib/finanzas/almacen-supabase'
import { extraerJson, validarPlanteo } from '../src/lib/finanzas/conversa/esquemas'
import { abrirConversacion, avanzar, pedidoDelAgente, plantillaDelEncargo } from '../src/lib/finanzas/conversa/orquestador'
import { AGENTES, PLANTILLA_FINANCIERA, plantillaConRedactor, proponenteDe, REDACTOR_POR_OMISION, validarPlantillaFinanciera } from '../src/lib/finanzas/conversa/plantilla'
import type { AlmacenDeConversa, CambiosDeEncargo, EncargoDeConversa, PedidoAlModelo, PuertosDeConversa, TurnoDeConversa } from '../src/lib/finanzas/conversa/puertos'
import type { ConfigDeFinanzas } from '../src/lib/finanzas/ruta'

const CLIENTE = 'cliente-prueba'
const PASOS_DEL_PROPONENTE = ['planteo', 'ajuste', 'ajuste_2']

describe('F2 · el redactor del plan es dato', () => {
  it('la omisión es jefe-marketing y la plantilla base lo usa en planteo, ajuste y ajuste_2 (y en ningún otro paso)', () => {
    expect(REDACTOR_POR_OMISION).toBe('jefe-marketing')
    expect(AGENTES.proponente).toBe(REDACTOR_POR_OMISION)
    expect(proponenteDe(PLANTILLA_FINANCIERA)).toBe('jefe-marketing')
    expect(PLANTILLA_FINANCIERA.pasos.filter((p) => p.tipo === 'agente' && p.quien === 'jefe-marketing').map((p) => p.clave)).toEqual(PASOS_DEL_PROPONENTE)
    expect(validarPlantillaFinanciera()).toEqual([])
  })
  it('plantillaConRedactor cambia SOLO los pasos del proponente; vacío o igual devuelve la misma plantilla; la validación acepta al configurado', () => {
    const con = plantillaConRedactor(PLANTILLA_FINANCIERA, 'otro-redactor')
    expect(con.pasos.filter((p) => p.quien === 'otro-redactor').map((p) => p.clave)).toEqual(PASOS_DEL_PROPONENTE)
    expect(con.pasos.filter((p) => p.tipo === 'agente' && p.quien !== 'otro-redactor').map((p) => p.quien)).toEqual(PLANTILLA_FINANCIERA.pasos.filter((p) => p.tipo === 'agente' && p.quien !== 'jefe-marketing').map((p) => p.quien))
    expect(con.limites).toEqual(PLANTILLA_FINANCIERA.limites)
    expect(validarPlantillaFinanciera(con)).toEqual([])
    expect(plantillaConRedactor(PLANTILLA_FINANCIERA, undefined)).toBe(PLANTILLA_FINANCIERA)
    expect(plantillaConRedactor(PLANTILLA_FINANCIERA, '   ')).toBe(PLANTILLA_FINANCIERA)
    expect(plantillaConRedactor(PLANTILLA_FINANCIERA, 'jefe-marketing')).toBe(PLANTILLA_FINANCIERA)
    // un redactor que además ya es especialista haría hablar dos veces al mismo en la ronda 2: la validación lo ve
    expect(validarPlantillaFinanciera(plantillaConRedactor(PLANTILLA_FINANCIERA, AGENTES.fpa)).some((x) => /habla más de (una|dos) vec/.test(x))).toBe(true)
  })
  it('plantillaDelEncargo lee el redactor: con dato lo usa, sin dato la omisión', () => {
    const enc = { id: 'e1', client_id: CLIENTE, estado: 'abierto', estado_del_motor: estadoInicial(), gasto_usd: 0, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: true, semilla: {} } as unknown as EncargoDeConversa
    expect(plantillaDelEncargo(enc, [], 'redactor-del-dato').pasos.find((p) => p.clave === 'planteo')?.quien).toBe('redactor-del-dato')
    expect(plantillaDelEncargo(enc, []).pasos.find((p) => p.clave === 'planteo')?.quien).toBe('jefe-marketing')
    expect(plantillaDelEncargo(enc, [], 'redactor-del-dato').pasos.find((p) => p.clave === 'cierre')?.quien).toBe(AGENTES.jefe)
  })
  it('el almacén real lee `cadena_config.planeacion.redactor` junto con `finanzas_config`; sin fila o mal formado no trae `redactor`', async () => {
    const base = (planeacion: unknown) => ({
      from(tabla: string) {
        const cadena: any = { select: () => cadena, eq: () => cadena, order: () => cadena, limit: () => cadena }
        cadena.maybeSingle = async () => ({ error: null, data: tabla === 'finanzas_config' ? { estado: 'ensayo', clientes_ensayo: [], preguntas_slack: 'apagado', conversa: 'ensayo' } : tabla === 'cadena_config' && planeacion !== undefined ? { valor: planeacion } : null })
        return cadena
      },
    })
    expect((await almacenDeFinanzas(base({ redactor: 'jefe-marketing' })).leerConfig()).redactor).toBe('jefe-marketing')
    expect((await almacenDeFinanzas(base({ redactor: ' otro ' })).leerConfig()).redactor).toBe('otro')
    for (const malo of [undefined, null, 'texto', { redactor: '' }, { redactor: 3 }, ['x']]) expect((await almacenDeFinanzas(base(malo)).leerConfig()).redactor, JSON.stringify(malo)).toBeUndefined()
  })
})

// ───────────────────────────────────────────────────────── punto 1 de CC3 · jefe-marketing produce un planteo.v1 válido
/** la forma REAL de las salidas de jefe-marketing en el libro (28–31 oct): un bloque ```json con el objeto, a veces con una línea antes */
const RESPUESTA_DE_JEFE_MARKETING = `Planteo de la meta semanal para la campaña, según el expediente y el plan vigente.

\`\`\`json
{
  "meta_por_semana": 18,
  "meta_ambiciosa_por_semana": 24,
  "zonas": ["zona_norte", "zona_centro"],
  "dias_y_horarios": { "dias_activos_por_semana": 6 },
  "evento": "mensaje",
  "canales": [{ "canal": "meta_ig", "peso": 0.7 }, { "canal": "base_propia", "peso": 0.3 }],
  "produccion": { "fraccion": 0.2 },
  "no_se": ["la tasa de cierre real del cliente", "el ticket promedio de la zona centro"],
  "equilibrio_respuesta": { "decision": "mantengo_la_meta", "motivo": "la meta cubre el equilibrio con margen" }
}
\`\`\``

describe('punto 1 de CC3 · jefe-marketing como proponente', () => {
  it('su pedido NO depende del nombre: la tarea del planteo es la misma para cualquier redactor (identidad intacta; la instrucción va en la tarea)', () => {
    const paso = PLANTILLA_FINANCIERA.pasos.find((p) => p.clave === 'planteo')!
    const t = pedidoDelAgente(paso, { expediente: { rubro: 'x' } } as never)
    expect(t).toMatch(/planteo\.v1/)
    expect(t).toMatch(/Responde SOLO con un objeto JSON/)
    expect(t).not.toMatch(/jefe-marketing|campaign-brief-agent/)
  })
  it('una respuesta con la forma real de sus salidas (bloque ```json) pasa `extraerJson` + `validarPlanteo` = planteo.v1 válido', () => {
    const j = extraerJson(RESPUESTA_DE_JEFE_MARKETING)
    expect(j.ok).toBe(true)
    const v = validarPlanteo(j.ok ? j.valor : null)
    expect(v.ok, JSON.stringify(v)).toBe(true)
    expect(v.ok && v.valor.meta_por_semana).toBe(18)
    expect(v.ok && v.valor.canales.map((c) => c.canal)).toEqual(['meta_ig', 'base_propia'])
  })
})

// ───────────────────────────────────────────────────────── el camino fuera de esquema (SIMULADO)
const rango = (min: number, max: number, base?: number) => ({ min, max, ...(base !== undefined ? { base } : {}) })
const FPA = { agente: 'finance-fpa-analyst', resumen: 'supuestos', supuestos: { ticket: rango(10, 14, 12), margen: rango(0.5, 0.6, 0.55), tasa_cierre: rango(0.25, 0.35, 0.3) }, preguntas_a_otros: [], alertas: [] }
const ACUERDO_OK = { salida: 'sale', hallazgos: [], conflictos_resueltos: [], preguntas_a_emilio: [] }
type Guion = Record<string, unknown[]>
function mundo(guion: Guion, cfg: Partial<ConfigDeFinanzas> = {}) {
  const encargos = new Map<string, EncargoDeConversa>()
  const turnos: TurnoDeConversa[] = []
  const arts: Record<string, Record<string, unknown>> = {}
  const llamadas: PedidoAlModelo[] = []
  const publicados: string[] = []
  const cuenta: Record<string, number> = {}
  let seq = 0
  const almacen: AlmacenDeConversa = {
    async crearEncargo(n) {
      const e: EncargoDeConversa = { id: `enc-${++seq}`, client_id: n.client_id, estado: 'abierto', estado_del_motor: estadoInicial(), gasto_usd: 0, slack_canal: null, slack_ts: null, leido_hasta: null, tablero_id: null, dry_run: n.dry_run, semilla: n.semilla }
      encargos.set(e.id, e)
      return { ok: true, encargo: structuredClone(e), nuevo: true }
    },
    async leerEncargo(id) { const e = encargos.get(id); return e ? structuredClone(e) : null },
    async guardar(ch: CambiosDeEncargo) {
      const e = encargos.get(ch.encargo_id)!
      e.estado_del_motor = structuredClone(ch.estado_del_motor); e.gasto_usd = ch.gasto_usd
      for (const k of ['estado', 'slack_canal', 'slack_ts', 'leido_hasta', 'tablero_id'] as const) if (ch[k] !== undefined) (e as any)[k] = ch[k]
      if (ch.turno) turnos.push(structuredClone(ch.turno))
      if (ch.artefacto) arts[ch.artefacto.tipo] = structuredClone(ch.artefacto.contenido)
    },
    async artefactos() { return structuredClone(arts) },
    async turnos() { return structuredClone(turnos) },
  }
  const P: PuertosDeConversa = {
    almacen,
    modelo: {
      async invocar(p) {
        llamadas.push(p)
        const g = guion[p.agente] ?? []
        const k = (cuenta[p.agente] = (cuenta[p.agente] ?? 0) + 1)
        const v = g[Math.min(k - 1, g.length - 1)]
        if (v === undefined) return { ok: false, error: 'sin_guion', costo_usd: 0 }
        return { ok: true, salida: typeof v === 'string' ? v : JSON.stringify(v), costo_usd: 0.05 }
      },
    },
    slack: { async publicar(p) { publicados.push(p.texto); return { ok: true, ts: '1700000000.000100' } }, async leer(p) { return { ok: true, mensajes: [], leido_hasta: p.desde_ts } } },
    tableros: { async guardarTablero() { return { id: 'tab-1', version: 1 } }, async actualizarTablero() { /* nada */ }, async invocacionDelJefe() { return true } },
    async config() { return { estado: 'encendida', clientes_ensayo: [], preguntas_slack: 'apagado', conversa: 'enciende', ...cfg } },
    ahora: () => new Date('2026-10-31T12:00:00Z'),
    canalDelHilo: 'C-PRIVADO',
    emilio_id: 'U-EMILIO',
  }
  return { P, turnos, arts, llamadas, publicados, encargos }
}
async function correr(m: ReturnType<typeof mundo>, max = 30) {
  const r0 = await abrirConversacion(m.P, { client_id: CLIENTE, dry_run: false, semilla: { evento: 'mensaje', dias_activos_por_semana: 7 } })
  expect(r0.status).toBe(200)
  const id = r0.cuerpo.encargo_id as string
  for (let i = 0; i < max; i++) {
    const r = await avanzar(m.P, id)
    if (r.status !== 200) throw new Error(`status ${r.status}: ${JSON.stringify(r.cuerpo)}`)
    if (r.cuerpo.terminado) return { id, final: r }
  }
  throw new Error('no terminó')
}

describe('punto 1 de CC3 · jefe-marketing fuera de esquema (SIMULADO)', () => {
  const PROSA = 'Como director de marketing, recomiendo una meta de 20 mensajes por semana, priorizando Instagram; no ejecuto tareas directamente pero este es el planteo.'
  it('el redactor configurado es a quien se llama; con una respuesta válida la conversación cierra `sale`', async () => {
    const m = mundo({ 'jefe-marketing': [RESPUESTA_DE_JEFE_MARKETING, RESPUESTA_DE_JEFE_MARKETING], 'finance-fpa-analyst': [FPA, FPA], paid_media_paid_social_strategist: [{ agente: 'paid_media_paid_social_strategist', resumen: 'r', supuestos: { costo_por_resultado: rango(0.4, 1.2, 0.8) }, preguntas_a_otros: [], alertas: [] }], 'chief-financial-officer': [ACUERDO_OK, ACUERDO_OK] }, { redactor: 'jefe-marketing' })
    const { final } = await correr(m)
    expect(m.llamadas[0].agente).toBe('jefe-marketing')
    expect(m.llamadas.some((l) => l.agente === 'campaign-brief-agent')).toBe(false)
    expect(m.turnos.find((t) => t.paso === 'planteo')?.estado).toBe('hecho')
    expect(final.cuerpo.estado).toBe('cerrado')
  })
  it('prosa dos veces (reintento 1 agotado) ⇒ el turno del planteo queda `fallo` con «sin supuestos del agente», la conversación sigue con los demás y TERMINA sola; el hilo lo dice', async () => {
    const m = mundo({ 'jefe-marketing': [PROSA, PROSA, PROSA, PROSA], 'finance-fpa-analyst': [FPA, FPA], 'chief-financial-officer': [ACUERDO_OK, ACUERDO_OK] }, { redactor: 'jefe-marketing' })
    const { final } = await correr(m)
    const planteo = m.turnos.find((t) => t.paso === 'planteo')!
    expect(planteo.estado).toBe('fallo')
    expect(planteo.agente).toBe('jefe-marketing')
    expect(planteo.salida).toMatchObject({ sin_supuestos_del_agente: true, agente: 'jefe-marketing', habla: { fpa: true } })
    expect(String(planteo.error)).toMatch(/JSON|objeto/i)
    // dos llamadas al planteo (la primera + UN reintento de formato), ni una más
    expect(m.llamadas.filter((l) => l.paso === 'planteo')).toHaveLength(2)
    expect(final.cuerpo.terminado).toBe(true)
    expect(['cerrado', 'sin_acuerdo', 'cierre_por_tope', 'fallido']).toContain(final.cuerpo.estado)
    // lo degradado se publica en el hilo (lo que Emilio lee), no se esconde
    expect(m.publicados.some((t) => /sin supuestos|formato|degradad/i.test(t))).toBe(true)
  })
})
