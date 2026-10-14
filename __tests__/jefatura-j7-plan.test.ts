/**
 * JEFATURA · J7 · PLAN (CC#1 · 14-oct) · el último en engancharse: después de «Guardar el plan» (A siempre se guarda primero) y antes del PDF a Drive y del «BRIEF · sobre».
 * Se ejecuta el flujo de planeación con el n8n en miniatura: el código REAL de la puerta y de la cadena de versiones, los chequeos por código de hoy (el mismo módulo de «¿Llegó la vuelta?») y las funciones PURAS
 * de la ruta (`elegirVersion`, `planDeGuardado`, `provenanceDeVersionNueva`, `provenanceConReemplazo`) contestando donde la ruta contestaría. US$ 0, sin red.
 * Se prueba: apagado = idéntico a hoy (también con la revisión cerrada sin versión nueva), A nunca cambia salvo su `reemplazado_por`, una hija por padre, ≤ 3 versiones, el rastro COMPLETO, la vigente llega a Drive y al brief,
 * y qué pasa si cualquier paso falla (A sigue vigente, nada se pierde, nada se reintenta).
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { validarEntrada } from '@/lib/jefatura/revision/contrato'
import { elegirVersion, planDeGuardado, provenanceConReemplazo, provenanceDeVersionNueva } from '@/lib/jefatura/revision/plan'
import { N } from '../scripts/worker-staging/jefatura-j7/gate.mjs'
import { antesDe, enganchaPlan, FLUJOS, RETOQUES_DEL_PLAN } from '../scripts/worker-staging/jefatura-j7/construir-enganches.mjs'
import { etapa, moduloDeLosChequeos, NOMBRES_DE_LA_CADENA, P } from '../scripts/worker-staging/jefatura-j7/plan-versiones.mjs'
import { ejecutar, estructura, recibidoPorLosOriginales, resp, UUID, type Json } from './_helpers/j7-flujos'

const antes = antesDe(FLUJOS.plan.id) as Json
const despues = enganchaPlan(antes) as Json
const idDeA = 'a0000000-0000-4000-8000-00000000000a'
const nodoDe = (f: Json, nombre: string) => (f.nodes as Json[]).find((n) => n.name === nombre) as Json

// ── textos: los chequeos de hoy (revisarPlan) marcan P4 cuando el presupuesto no sale de la meta
const relleno = 'Contenido de relleno del plan de noventa días. '.repeat(70)
const PRESUPUESTO_BUENO = 'Meta: 40 clientes nuevos en 90 días (ventas necesarias: 40). Costo por cliente: USD 12 (rango de mercado USD 8–15, fuente: benchmark del sector). Escenario conservador: 30 clientes con USD 450; escenario base: 40 clientes con USD 480; escenario optimista: 50 clientes con USD 500. Inversión total USD 480 en 90 días.'
const planMalo = (t = 'A') => `# Plan ${t}\n\n## Presupuesto\nInversión: 300 USD al mes.\n\n${relleno}\n`
const planBueno = (t = 'B') => `# Plan ${t}\n\n## Presupuesto\n${PRESUPUESTO_BUENO}\n\n${relleno}\n`
/** lo que guarda el flujo: sin espacios al final y con un salto de línea (igual que «¿Llegó la vuelta?») */
const procesado = (t: string) => t.replace(/\s+$/, '') + '\n'
const planCorto = '# Plan corto\n\nResumen.\n'

const tagA = { fuente: 'planeacion', workflow_id: 'X9F0zp6LQ2xGEYVS', workflow_execution_id: '149154', guardado_antes_de_drive: true, caracteres: 3000, registro_interno: { aviso_del_chequeo: 'x' }, estado_del_plan: 'con_pendientes', pendientes: 'P4 · presupuesto incompleto' }
const filaA = (o: Json = {}): Json => ({ id: idDeA, client_id: UUID, title: 'Plan de 90 dias · 2026-10-14', output_type: 'campaign_plan_90d', content: planMalo(), content_text: planMalo(), producing_agent: 'campaign-brief-agent', status: 'draft', provenance_tag: tagA, ...o })
const vuelta = (texto: string, o: Json = {}): Json => ({ llego_la_vuelta: true, texto, caracteres: texto.length, con_pendientes: true, pendientes: 'P4 · presupuesto incompleto', estado_del_plan: 'con_pendientes', chequeo_del_plan: { ok: false, marcas: [{ codigo: 'P4', que: 'el presupuesto no sale de la meta' }] }, client_id: UUID, client_name: 'Café de práctica', ...o })
const previos = (texto = planMalo(), o: Json = {}): Record<string, Json> => ({
  '¿Llegó la vuelta?': vuelta(texto, o),
  'Webhook · planeacion': { body: { client_id: UUID, tenant_id: UUID, dry_run: false, _journey_id: 'j-1', _sala_correlation_id: 'corr-1' } },
  '① Cargar el manual de marca': [{ id: 'm1', content_text: 'MANUAL · tuteo, tono cercano' }],
  'Ficha del cliente': { id: UUID, name: 'Café de práctica' },
  'Unir lo del dueño al paquete': { hechos_del_dueno: [{ texto: 'El local abre desde las 7' }] },
  'Redactor (B4)': { pedido: 'PEDIDO AL REDACTOR · ' + 'x'.repeat(200), cliente_id: UUID, registro_usado: { registro: 'tuteo' }, contexto_chequeo: null },
  'elegir brazos': { descartados: [] },
})

// ── la ruta y la base, simuladas con las MISMAS funciones puras de la ruta
interface Mundo { marcas: Json[]; avisos: string[]; filas: Json[]; llamadas: Array<{ nodo: string; cuerpo: any }>; insertadas: Json[]; parches: Json[]; versiones: Array<{ etiqueta: string; paso: string; texto: string; largo: number }> }
function mundo(o: { versiones: Mundo['versiones']; existentes?: Json[]; fallos?: Record<string, number | 'corte'>; sinSalida?: boolean; cierra?: Json }): { http: Record<string, (c: any) => any>; m: Mundo } {
  const m: Mundo = { marcas: [], avisos: [], filas: [filaA(), ...(o.existentes ?? [])], llamadas: [], insertadas: [], parches: [], versiones: o.versiones }
  const falla = (nodo: string) => (o.fallos && nodo in o.fallos ? (o.fallos[nodo] === 'corte' ? { error: { message: 'timeout' } } : resp(o.fallos[nodo] as number, { error: 'fallo de prueba' })) : null)
  const reg = (nodo: string, cuerpo: any) => m.llamadas.push({ nodo, cuerpo })
  const salida = { revision_id: UUID, artifact_type: 'plan', artifact_id: idDeA, resultado: 'limpia', marcas: { con_desacuerdo: false, sin_segunda_mirada: false }, versiones: m.versiones, respuestas: [], desacuerdos: [], costo_usd: 1.2, simulado: false, ...(o.cierra ?? {}) }
  const http: Record<string, (c: any) => any> = {
    [N.abrir]: (c) => { reg(N.abrir, c); return falla(N.abrir) ?? resp(200, { accion: 'cerrado', revision_id: UUID, resultado: salida.resultado, salida }) },
    [P.filas]: () => { reg(P.filas, null); return falla(P.filas) ?? resp(200, m.filas.map((f) => ({ id: f.id, provenance_tag: f.provenance_tag }))) },
    [P.elegir]: (c) => {
      reg(P.elegir, c)
      const f = falla(P.elegir); if (f) return f
      const produjo = ['A', ...c.evaluaciones.map((e: Json) => e.etiqueta).filter((e: string) => e !== 'A')]
      const ad = elegirVersion(c.evaluaciones)
      return resp(200, { accion: 'versiones_elegidas', adoptada: ad.adoptada, ultima: ad.ultima, adopto_la_ultima: ad.adoptoLaUltima, razones: ad.razones, plan_de_guardado: planDeGuardado(ad, { idDeA: c.id_de_a, existentes: c.existentes, produjo }), resultado: ad.adoptoLaUltima ? 'limpia' : 'con_desacuerdo', marcas: { con_desacuerdo: !ad.adoptoLaUltima, sin_segunda_mirada: false } })
    },
  }
  for (const S of ['B', 'C']) {
    const e = etapa(S)
    http[e.tag] = (c) => { reg(e.tag, c); const f = falla(e.tag); if (f) return f; try { return resp(200, { provenance_tag: provenanceDeVersionNueva(c.provenance_tag, { etiqueta: c.etiqueta, version: c.version, version_de: c.version_de, jefatura_revision_id: c.jefatura_revision_id }) }) } catch (x) { return resp(400, { error: 'provenance_invalido', detalle: String(x) }) } }
    http[e.guardar] = (c) => { reg(e.guardar, c); const f = falla(e.guardar); if (f) return f; const row = { id: `${S.toLowerCase()}0000000-0000-4000-8000-0000000000${S === 'B' ? '0b' : '0c'}`, created_at: '2026-10-14T20:00:00Z', ...c }; m.insertadas.push(row); m.filas.push(row); return resp(201, [row]) }
    http[e.reemplazo] = (c) => { reg(e.reemplazo, c); const f = falla(e.reemplazo); if (f) return f; try { return resp(200, { provenance_tag: provenanceConReemplazo(c.provenance_tag, { por: c.por, en: '2026-10-14T20:00:01Z' }) }) } catch (x) { return resp(400, { error: 'provenance_invalido', detalle: String(x) }) } }
    http[e.marcar] = (c) => { reg(e.marcar, c); const f = falla(e.marcar); if (f) return f; m.parches.push(c); return resp(200, [{ ok: true }]) }
  }
  http[P.marcaPatch] = (c) => { reg(P.marcaPatch, c); const f = falla(P.marcaPatch); if (f) return f; m.marcas.push(c); return resp(200, [{ ok: true }]) }
  http[P.marcaAvisar] = (c) => { reg(P.marcaAvisar, c); m.avisos.push(c.text); return { ok: true } }
  http['Plan → Drive (PDF)'] = (c) => { reg('Plan → Drive (PDF)', c); return { ok: true, file_id: 'f1', url: 'https://drive/f1', folder_id: 'fo1' } }
  http['BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)'] = (c) => { reg('BRIEF', c); return { ok: true } }
  http['Bandeja · plan con pendientes'] = (c) => { reg('Bandeja', c); return { ok: true, id: 'h1' } }
  return { http, m }
}
const NODOS_REALES = ['Aviso · plan con pendientes', '¿Salió el PDF?']
const correr = (flujo: Json, o: { texto?: string; fila?: Json; previosExtra?: Json; mundo: ReturnType<typeof mundo>; vuelta?: Json }) =>
  ejecutar(flujo, { inicio: 'Guardar el plan', items: [o.fila ?? filaA()], previos: { ...previos(o.texto, o.vuelta), ...(o.previosExtra ?? {}) }, http: o.mundo.http, reales: NODOS_REALES })
const sinGate = (r: Json) => r.llamadasHttp.filter((l: Json) => !l.nodo.startsWith('JEF · '))
const llamada = (r: Json, nodo: string) => r.llamadasHttp.filter((l: Json) => l.nodo === nodo)

describe('J7 · plan (X9F0zp6LQ2xGEYVS) · después de «Guardar el plan»', () => {
  estructura('plan', antes, despues, { desde: 'Guardar el plan', salida: 0, retocados: [...new Set<string>(RETOQUES_DEL_PLAN.map((r: Json) => r.nodo))], nodosNuevosExtra: NOMBRES_DE_LA_CADENA, continuacion: { entrada: P.hay, salida: P.vigente, laterales: [P.marcaArmar] }, sinRespuestaCompleta: [P.marcaAvisar] })

  it('el enganche se detiene si el flujo cambió debajo (las 2 ramas, o un nodo a retocar)', () => {
    const roto = JSON.parse(JSON.stringify(antes)); roto.connections['Guardar el plan'].main[0] = roto.connections['Guardar el plan'].main[0].slice(0, 1)
    expect(() => enganchaPlan(roto)).toThrow(/ya no va a/)
    const otro = JSON.parse(JSON.stringify(antes)); nodoDe(otro, 'Plan → Drive (PDF)').parameters.jsonBody = String(nodoDe(otro, 'Plan → Drive (PDF)').parameters.jsonBody).replace("$('¿Llegó la vuelta?').first().json.texto", 'x')
    expect(() => enganchaPlan(otro)).toThrow(/se esperaban 4/)
  })
  it('solo se retocan 4 nodos (Drive, el aviso, «¿Salió el PDF?» y «BRIEF · sobre»), y solo en la lectura de la vuelta/el guardado', () => {
    expect([...new Set<string>(RETOQUES_DEL_PLAN.map((r: Json) => r.nodo))].sort()).toEqual(['Aviso · plan con pendientes', 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)', 'Plan → Drive (PDF)', '¿Salió el PDF?'].sort())
    for (const r of RETOQUES_DEL_PLAN) {
      const a = JSON.stringify(nodoDe(antes, r.nodo).parameters), d = JSON.stringify(nodoDe(despues, r.nodo).parameters)
      expect(a).not.toEqual(d)
      // revertir el retoque deja el nodo exactamente como estaba
      let x = d
      for (const q of RETOQUES_DEL_PLAN.filter((z: Json) => z.nodo === r.nodo)) x = x.split(JSON.stringify(q.a).slice(1, -1)).join(JSON.stringify(q.de).slice(1, -1))
      expect(x).toEqual(a)
    }
  })

  describe('el módulo de chequeos es EL MISMO de hoy (condición 3 de CC#3)', () => {
    const vuelta = String(nodoDe(antes, '¿Llegó la vuelta?').parameters.jsCode)
    const b4 = String(nodoDe(antes, 'Redactor (B4)').parameters.jsCode).split('\r\n').join('\n')
    const evaluar = String(nodoDe(despues, P.evaluar).parameters.jsCode)
    it('«JEF · plan · evaluar» trae, letra por letra, el módulo de «¿Llegó la vuelta?»', () => { expect(evaluar).toContain(moduloDeLosChequeos(vuelta)); expect(moduloDeLosChequeos(vuelta).length).toBeGreaterThan(40000) })
    it('y revisarPlan de «Redactor (B4)» es idéntico al de «¿Llegó la vuelta?» (las dos copias que ya existían no difieren)', () => {
      const cuerpo = (s: string) => { const a = s.indexOf('function revisarPlan'); let d = 0, j = s.indexOf('{', a); for (; j < s.length; j++) { if (s[j] === '{') d++; else if (s[j] === '}') { d--; if (d === 0) break } } return s.slice(a, j + 1) }
      expect(cuerpo(b4)).toBe(cuerpo(vuelta.split('\r\n').join('\n')))
    })
    it('medir una versión con el módulo da lo mismo que «¿Llegó la vuelta?» sobre el mismo texto', async () => {
      for (const texto of [planMalo('X'), planBueno('Y'), 'Voy a escribir el plan.\n\n---\n' + planBueno('Z') + '\n\n   ', 'Pedí que Tené razón.\n' + planMalo('W')]) {
        const real = await ejecutar(despues, { inicio: 'Esperar al redactor', items: [{ body: { response: texto } }], previos: { 'elegir brazos': { descartados: [] }, 'Redactor (B4)': { registro_usado: { registro: 'tuteo' }, contexto_chequeo: null, cliente_id: UUID }, 'Ficha del cliente': { name: 'Café' } }, reales: ['¿Llegó la vuelta?'], stubs: { '⑤ ¿Modo seco?': () => ({ items: [], salida: 0 }) } })
        const vv = real.visitas.find((x: Json) => x.nodo === '¿Llegó la vuelta?').salida[0]
        const cerrada = await ejecutar(despues, {
          inicio: 'Guardar el plan', items: [filaA()], previos: { ...previos(planMalo()), 'Redactor (B4)': { registro_usado: { registro: 'tuteo' }, contexto_chequeo: null, cliente_id: UUID, pedido: 'p' } },
          http: mundo({ versiones: [{ etiqueta: 'A', paso: 'a', texto: planMalo(), largo: 1 }, { etiqueta: 'B', paso: 'correccion', texto, largo: texto.length }] }).http, reales: NODOS_REALES,
        })
        const ev = cerrada.visitas.find((x: Json) => x.nodo === P.evaluar).salida[0]
        const p = ev.procesadas.B
        expect(p.texto).toBe(vv.texto)
        expect(p.estado_del_plan).toBe(vv.estado_del_plan)
        expect(p.con_pendientes).toBe(vv.con_pendientes)
        expect(p.pendientes).toBe(vv.pendientes)
        expect(p.chequeo_del_plan).toEqual(vv.chequeo_del_plan)
      }
    })
  })

  describe('APAGADO = IDÉNTICO A HOY', () => {
    const enHoy = async (o: Parameters<typeof correr>[1]) => correr(antes, o)
    it('con la jefatura apagada (409): cada nodo recibe lo mismo y el PDF y el brief llevan A (mismo texto, mismo plan_id)', async () => {
      const w = mundo({ versiones: [], fallos: { [N.abrir]: 409 } })
      const a = await enHoy({ mundo: mundo({ versiones: [] }) })
      const d = await correr(despues, { mundo: w })
      expect(sinGate(d).map((l: Json) => ({ n: l.nodo, u: l.url, c: l.cuerpo }))).toEqual(sinGate(a).map((l: Json) => ({ n: l.nodo, u: l.url, c: l.cuerpo })))
      expect(recibidoPorLosOriginales(d)).toEqual(recibidoPorLosOriginales(a))
      const brief = llamada(d, 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)')[0].cuerpo
      expect(brief.payload.plan_id).toBe(idDeA)
    })
    for (const [caso, h] of [['409 tipo no activo', () => resp(409, { error: 'jefatura_no_abre', motivo: 'tipo_no_activo' })], ['500', () => resp(500, { error: 'x' })], ['corte de red', () => ({ error: { message: 'timeout' } })], ['401', () => resp(401, {})], ['409 sin otra vuelta', () => resp(409, { error: 'sin_otra_vuelta' })]] as Array<[string, () => Json]>) {
      it(`${caso}: idéntico a hoy`, async () => {
        const a = await enHoy({ mundo: mundo({ versiones: [] }) })
        const w = mundo({ versiones: [] }); w.http[N.abrir] = h
        const d = await correr(despues, { mundo: w })
        expect(sinGate(d).map((l: Json) => [l.nodo, l.url, l.cuerpo])).toEqual(sinGate(a).map((l: Json) => [l.nodo, l.url, l.cuerpo]))
        expect(w.m.insertadas).toEqual([])
      })
    }
    it('con el plan A limpio (sin marcas) y la revisión cerrada SIN versión nueva: idéntico a hoy y no se escribe nada', async () => {
      const limpia = vuelta(planBueno('A'), { con_pendientes: false, pendientes: null, estado_del_plan: 'sin_marcas', chequeo_del_plan: { ok: true, marcas: [] } })
      const a = await enHoy({ mundo: mundo({ versiones: [] }), texto: planBueno('A'), vuelta: limpia })
      const w = mundo({ versiones: [{ etiqueta: 'A', paso: 'a', texto: planBueno('A'), largo: 100 }] })
      const d = await correr(despues, { mundo: w, texto: planBueno('A'), vuelta: limpia })
      expect(sinGate(d).map((l: Json) => [l.nodo, l.url, l.cuerpo])).toEqual(sinGate(a).map((l: Json) => [l.nodo, l.url, l.cuerpo]))
      expect(w.m.insertadas).toEqual([]); expect(w.m.parches).toEqual([])
      expect(llamada(d, P.elegir)).toHaveLength(0)
      expect(llamada(d, P.filas)).toHaveLength(0)
    })
    it('si la revisión no cierra a tiempo (plazo de 50 min) el plan sigue como hoy (PDF y brief con A) y NO se guarda ninguna versión (la marca se prueba en R4)', async () => {
      const a = await enHoy({ mundo: mundo({ versiones: [] }) })
      const w = mundo({ versiones: [] })
      w.http[N.abrir] = () => resp(200, { accion: 'esperar', revision_id: UUID, turno: { n: 1, tipo: 'agente', paso: 'revision_fondo', pedido: {} } })
      w.http[N.despertar] = () => resp(200, {}); w.http[N.leer] = () => resp(200, { revision_id: UUID, estado: 'en_paso' })
      const d = await correr(despues, { mundo: w })
      expect(sinGate(d).map((l: Json) => [l.nodo, l.url, l.cuerpo])).toEqual(sinGate(a).map((l: Json) => [l.nodo, l.url, l.cuerpo]))
      expect(w.m.insertadas).toEqual([]); expect(w.m.parches).toEqual([])
      expect(d.reloj - 1_700_000_000_000).toBeGreaterThanOrEqual(3000 * 1000 - 120_000)
    })
  })

  describe('no abre cuando no hay qué revisar (y no llama a la ruta)', () => {
    const casos: Array<[string, Parameters<typeof correr>[1]]> = [
      ['la vuelta del redactor no llegó', { mundo: mundo({ versiones: [] }), vuelta: { llego_la_vuelta: false } }],
      ['A no quedó guardado (sin id)', { mundo: mundo({ versiones: [] }), fila: filaA({ id: undefined }) }],
      ['la fila de A no devolvió su provenance_tag', { mundo: mundo({ versiones: [] }), fila: filaA({ provenance_tag: undefined }) }],
      ['el provenance_tag de A viene vacío', { mundo: mundo({ versiones: [] }), fila: filaA({ provenance_tag: {} }) }],
      ['client_id no es un uuid', { mundo: mundo({ versiones: [] }), vuelta: { client_id: "x'; drop table" } }],
    ]
    for (const [caso, o] of casos) {
      it(caso, async () => {
        const d = await correr(despues, o)
        expect(llamada(d, N.abrir)).toHaveLength(0)
        expect(d.llamadasHttp.filter((l: Json) => l.nodo.startsWith('JEF · '))).toHaveLength(0)
      })
    }
  })

  describe('lo que se manda a la ruta', () => {
    it('es una entrada VÁLIDA: plan, artifact_id = la fila de A, dry_run booleano, devolver_a ninguno, nunca generado por la jefatura, con el pedido del redactor y los documentos', async () => {
      const w = mundo({ versiones: [] }); w.http[N.abrir] = () => resp(409, { error: 'jefatura_no_abre', motivo: 'apagada' })
      const d = await correr(despues, { mundo: w })
      const c = llamada(d, N.abrir)[0].cuerpo
      expect(validarEntrada(c).ok).toBe(true)
      expect(c.artifact_type).toBe('plan'); expect(c.artifact_id).toBe(idDeA); expect(c.client_id).toBe(UUID); expect(c.journey_id).toBe('j-1')
      expect(c.payload.dry_run).toBe(false); expect(c.payload.devolver_a).toEqual({ tipo: 'ninguno', destino: '' })
      expect(c.payload.generado_por_jefatura).toBeNull(); expect(c.payload.texto).toBe(planMalo())
      expect(c.payload.pedido_del_plan).toContain('PEDIDO AL REDACTOR')
      expect(c.payload.contexto.map((x: Json) => x.titulo)).toEqual(['Manual de marca vigente', 'Ficha del cliente', 'Lo que dijo el dueño'])
      expect(c.payload.chequeos_previos).toEqual({ pasaron: false, necesita_humano: false, marcas: ['el presupuesto no sale de la meta'] })
    })
    it('dry_run solo es true si el sobre del flujo lo dice exactamente así (la misma regla de «Pedir el plan al redactor»)', async () => {
      for (const [dry, esperado] of [[true, true], ['true', false], [undefined, false], [1, false]] as Array<[any, boolean]>) {
        const w = mundo({ versiones: [] }); w.http[N.abrir] = () => resp(409, { error: 'jefatura_no_abre', motivo: 'apagada' })
        const d = await correr(despues, { mundo: w, previosExtra: { 'Webhook · planeacion': { body: { client_id: UUID, dry_run: dry } } } })
        expect(llamada(d, N.abrir)[0].cuerpo.payload.dry_run).toBe(esperado)
      }
    })
  })

  describe('con versiones nuevas', () => {
    const A = { etiqueta: 'A', paso: 'redactor', texto: planMalo(), largo: planMalo().length }
    const B = (t = planBueno('B')) => ({ etiqueta: 'B', paso: 'correccion:campaign-brief-agent', texto: t, largo: t.length })
    const C = (t = planBueno('C')) => ({ etiqueta: 'C', paso: 'decision:campaign-brief-agent', texto: t, largo: t.length })
    const ordenDeLlamadas = (r: Json) => r.llamadasHttp.map((l: Json) => l.nodo)

    it('A→B→C: A queda como estaba salvo su `reemplazado_por`; B y C se guardan en ese orden, cada una hija de la anterior, con el rastro COMPLETO', async () => {
      const w = mundo({ versiones: [A, B(planBueno('B')), C(planBueno('C') + 'Más detalle.\n')] })
      const d = await correr(despues, { mundo: w })
      // se guardaron B y luego C (una fila cada una)
      expect(w.m.insertadas).toHaveLength(2)
      const [b, c] = w.m.insertadas
      expect(b.title).toContain('versión B'); expect(c.title).toContain('versión C')
      expect(b.output_type).toBe('campaign_plan_90d'); expect(b.status).toBe('draft'); expect(b.producing_agent).toBe('campaign-brief-agent'); expect(b.client_id).toBe(UUID)
      // el rastro: lo de A se conserva y se suma la cadena
      for (const [k, v] of Object.entries(tagA)) if (!['caracteres', 'estado_del_plan', 'pendientes'].includes(k)) expect(b.provenance_tag[k]).toEqual(v)
      expect(b.provenance_tag).toMatchObject({ etiqueta: 'B', version: 2, version_de: idDeA, jefatura_revision_id: UUID, reentrega: 'version_nueva' })
      expect(c.provenance_tag).toMatchObject({ etiqueta: 'C', version: 3, version_de: b.id, jefatura_revision_id: UUID })
      expect(b.provenance_tag.reemplazado_por).toBeUndefined(); expect(c.provenance_tag.reemplazado_por).toBeUndefined()
      // lo que describe a la versión es de la versión, no de A
      expect(b.provenance_tag.caracteres).toBe(b.content_text.length); expect(b.provenance_tag.estado_del_plan).toBe('sin_marcas'); expect(b.provenance_tag.pendientes).toBeNull()
      // los padres se marcan con el objeto ENTERO y solo DESPUÉS de guardada la sucesora
      expect(w.m.parches).toHaveLength(2)
      expect(w.m.parches[0].provenance_tag).toEqual({ ...tagA, reemplazado_por: b.id, reemplazado_en: '2026-10-14T20:00:01Z' })
      expect(w.m.parches[1].provenance_tag).toEqual({ ...b.provenance_tag, reemplazado_por: c.id, reemplazado_en: '2026-10-14T20:00:01Z' })
      const ord = ordenDeLlamadas(d)
      expect(ord.indexOf(etapa('B').guardar)).toBeLessThan(ord.indexOf(etapa('B').marcar))
      expect(ord.indexOf(etapa('B').marcar)).toBeLessThan(ord.indexOf(etapa('C').tag))
      expect(ord.indexOf(etapa('C').guardar)).toBeLessThan(ord.indexOf(etapa('C').marcar))
      // los parches van a la fila correcta, y solo a esa
      const urls = llamada(d, etapa('B').marcar).concat(llamada(d, etapa('C').marcar)).map((l: Json) => l.url)
      expect(urls[0]).toMatch(new RegExp(`client_historical_outputs\\?id=eq\\.${idDeA}$`)); expect(urls[1]).toMatch(new RegExp(`client_historical_outputs\\?id=eq\\.${b.id}$`))
      // A no se vuelve a escribir (ni un POST con su id) y la tabla de planes solo recibió 2 inserciones
      expect(d.llamadasHttp.filter((l: Json) => l.nodo.startsWith('JEF · plan · guardar'))).toHaveLength(2)
    })
    it('lo que se pide a `elegir_version` trae las 3 evaluaciones con los chequeos de hoy y las filas existentes', async () => {
      const w = mundo({ versiones: [A, B(), C()] })
      const d = await correr(despues, { mundo: w })
      const c = llamada(d, P.elegir)[0].cuerpo
      expect(c).toMatchObject({ accion: 'elegir_version', revision_id: UUID, id_de_a: idDeA })
      expect(c.evaluaciones).toEqual([{ etiqueta: 'A', marcas: 1, largo: planMalo().length }, { etiqueta: 'B', marcas: 0, largo: procesado(planBueno('B')).length }, { etiqueta: 'C', marcas: 0, largo: procesado(planBueno('C')).length }])
      expect(c.existentes).toEqual([{ id: idDeA, version_de: null }])
      expect(llamada(d, P.filas)[0].url).toBe(`https://x.supabase.co/rest/v1/client_historical_outputs?select=id,provenance_tag&output_type=eq.campaign_plan_90d&client_id=eq.${UUID}&order=created_at.desc&limit=100`.replace('https://x.supabase.co', String(llamada(d, P.filas)[0].url).split('/rest/')[0]))
    })
    it('la vigente (C) es la que llega al PDF y al brief: su texto, su plan_id; y sus marcas mandan sobre el aviso de la bandeja', async () => {
      const w = mundo({ versiones: [A, B(), C(planBueno('C'))] })
      const d = await correr(despues, { mundo: w })
      const c = w.m.insertadas[1]
      expect(llamada(d, 'Plan → Drive (PDF)')[0].cuerpo).toEqual({ client_id: UUID, client_name: 'Café de práctica', nombre: 'Plan de 90 dias · ' + new Date().toISOString().slice(0, 10), texto: c.content_text })
      expect(llamada(d, 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)')[0].cuerpo.payload.plan_id).toBe(c.id)
      // C no tiene marcas: ya no hay «plan con pendientes» ni aviso en la bandeja (con A, que sí tenía, lo había)
      expect(llamada(d, 'Bandeja · plan con pendientes')).toHaveLength(0)
      const pdf = d.visitas.find((v: Json) => v.nodo === '¿Salió el PDF?').salida[0]
      expect(pdf).toMatchObject({ ok: true, plan_guardado: true, plan_guardado_id: c.id, hay_pdf: true })
    })
    it('B mejora y C empeora: se adopta B (C no se guarda como fila) y el plan vigente es B', async () => {
      const w = mundo({ versiones: [A, B(), C(planMalo('C'))] })
      const d = await correr(despues, { mundo: w })
      expect(w.m.insertadas.map((f) => f.provenance_tag.etiqueta)).toEqual(['B'])
      expect(w.m.parches).toHaveLength(1)
      expect(llamada(d, 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)')[0].cuerpo.payload.plan_id).toBe(w.m.insertadas[0].id)
      expect(llamada(d, etapa('C').tag)).toHaveLength(0)
    })
    it('B empeora (más marcas que A): se queda A, no se guarda nada y el PDF y el brief llevan A', async () => {
      const buenoA = vuelta(planBueno('A'), { con_pendientes: false, pendientes: null, estado_del_plan: 'sin_marcas', chequeo_del_plan: { ok: true, marcas: [] } })
      const w = mundo({ versiones: [{ ...A, texto: planBueno('A') }, B(planMalo('B'))] })
      const d = await correr(despues, { mundo: w, texto: planBueno('A'), vuelta: buenoA })
      expect(w.m.insertadas).toEqual([]); expect(w.m.parches).toEqual([])
      expect(llamada(d, 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)')[0].cuerpo.payload.plan_id).toBe(idDeA)
      expect(llamada(d, 'Plan → Drive (PDF)')[0].cuerpo.texto).toBe(planBueno('A'))
    })
    it('una versión demasiado corta (menos del 60 % del largo de A) no pasa: A sigue', async () => {
      const w = mundo({ versiones: [A, B(planCorto)] })
      await correr(despues, { mundo: w })
      expect(w.m.insertadas).toEqual([])
    })
    it('si B no pasa pero C sí, C cuelga directo de A (B queda solo en la traza)', async () => {
      const w = mundo({ versiones: [A, B(planCorto), C(planBueno('C'))] })
      await correr(despues, { mundo: w })
      expect(w.m.insertadas.map((f) => f.provenance_tag.etiqueta)).toEqual(['C'])
      expect(w.m.insertadas[0].provenance_tag).toMatchObject({ version: 2, version_de: idDeA })
      expect(w.m.parches).toHaveLength(1)
    })
    it('repetir la ejecución NO crea otra fila: si ya existe la hija de A, se reutiliza (G4/G7) y C cuelga de ESA hija', async () => {
      const bPrevia = { id: 'b-previa', client_id: UUID, provenance_tag: { ...tagA, etiqueta: 'B', version: 2, version_de: idDeA, jefatura_revision_id: 'otra' } }
      const w = mundo({ versiones: [A, B(), C()], existentes: [bPrevia] })
      const d = await correr(despues, { mundo: w })
      expect(w.m.insertadas.map((f) => f.provenance_tag.etiqueta)).toEqual(['C'])
      expect(w.m.insertadas[0].provenance_tag).toMatchObject({ version: 3, version_de: 'b-previa' })
      expect(llamada(d, etapa('B').guardar)).toHaveLength(0)
      expect(llamada(d, P.elegir)[0].cuerpo.existentes).toEqual([{ id: idDeA, version_de: null }, { id: 'b-previa', version_de: idDeA }])
      // el padre de C es la B previa: su rastro se leyó de la fila (no se inventó)
      expect(w.m.parches[0].provenance_tag).toMatchObject({ etiqueta: 'B', reemplazado_por: w.m.insertadas[0].id })
    })
    it('nunca hay más de 3 versiones: con una B y una C ya existentes no se inserta nada más', async () => {
      const bPrevia = { id: 'b-previa', client_id: UUID, provenance_tag: { ...tagA, etiqueta: 'B', version: 2, version_de: idDeA } }
      const cPrevia = { id: 'c-previa', client_id: UUID, provenance_tag: { ...tagA, etiqueta: 'C', version: 3, version_de: 'b-previa' } }
      const w = mundo({ versiones: [A, B(), C()], existentes: [bPrevia, cPrevia] })
      await correr(despues, { mundo: w })
      expect(w.m.insertadas).toEqual([])
    })
  })

  describe('si algo falla, A (o la última guardada) sigue vigente, nada se pierde y nada se reintenta', () => {
    const A = { etiqueta: 'A', paso: 'redactor', texto: planMalo(), largo: planMalo().length }
    const B = { etiqueta: 'B', paso: 'correccion', texto: planBueno('B'), largo: planBueno('B').length }
    const C = { etiqueta: 'C', paso: 'decision', texto: planBueno('C'), largo: planBueno('C').length }
    const conFallo = async (fallos: Record<string, number | 'corte'>) => { const w = mundo({ versiones: [A, B, C], fallos }); const d = await correr(despues, { mundo: w }); return { w, d } }
    const brief = (d: Json) => llamada(d, 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)')[0].cuerpo.payload.plan_id
    it('no se pueden leer las filas del plan: no se elige ni se guarda (no se podría evitar un duplicado)', async () => {
      const { w, d } = await conFallo({ [P.filas]: 500 })
      expect(w.m.insertadas).toEqual([]); expect(llamada(d, P.elegir)).toHaveLength(0); expect(brief(d)).toBe(idDeA)
    })
    for (const [caso, f] of [['la ruta de elegir contesta 500', 500], ['la ruta de elegir se corta', 'corte'], ['la ruta de elegir contesta 409', 409]] as Array<[string, number | 'corte']>) {
      it(`${caso}: A vigente y nada guardado`, async () => {
        const { w, d } = await conFallo({ [P.elegir]: f })
        expect(w.m.insertadas).toEqual([]); expect(brief(d)).toBe(idDeA)
        expect(llamada(d, 'Plan → Drive (PDF)')[0].cuerpo.texto).toBe(planMalo())
      })
    }
    it('el rastro de B no se pudo calcular (400): B no se guarda y no se prueba con C', async () => {
      const { w, d } = await conFallo({ [etapa('B').tag]: 400 })
      expect(w.m.insertadas).toEqual([]); expect(llamada(d, etapa('C').tag)).toHaveLength(0); expect(brief(d)).toBe(idDeA)
    })
    it('la inserción de B falla (500): A vigente, ningún padre marcado', async () => {
      const { w, d } = await conFallo({ [etapa('B').guardar]: 500 })
      expect(w.m.parches).toEqual([]); expect(brief(d)).toBe(idDeA); expect(llamada(d, etapa('B').reemplazo)).toHaveLength(0)
    })
    it('B se guardó pero no se pudo calcular el reemplazo de A: B es la vigente (ya está guardada) y A queda sin marca (se dice, no se esconde)', async () => {
      const { w, d } = await conFallo({ [etapa('B').reemplazo]: 500 })
      expect(w.m.insertadas).toHaveLength(1); expect(w.m.parches).toEqual([])
      expect(brief(d)).toBe(w.m.insertadas[0].id)
      expect(llamada(d, etapa('C').tag)).toHaveLength(0)
    })
    it('B guardada y marcada, y la inserción de C falla: B es la vigente', async () => {
      const { w, d } = await conFallo({ [etapa('C').guardar]: 500 })
      expect(w.m.insertadas.map((f) => f.provenance_tag.etiqueta)).toEqual(['B']); expect(brief(d)).toBe(w.m.insertadas[0].id)
    })
    it('el parche de A contesta con un error: B sigue siendo la vigente y no se intenta C', async () => {
      const { w, d } = await conFallo({ [etapa('B').marcar]: 500 })
      expect(w.m.insertadas).toHaveLength(1); expect(brief(d)).toBe(w.m.insertadas[0].id); expect(llamada(d, etapa('C').tag)).toHaveLength(0)
    })
    it('el plan sigue su camino aunque TODO falle: el PDF se genera y el brief se pide (con A)', async () => {
      const { d } = await conFallo({ [P.filas]: 'corte' })
      expect(llamada(d, 'Plan → Drive (PDF)')).toHaveLength(1)
      expect(llamada(d, 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)')).toHaveLength(1)
    })
    it('ningún nodo de la cadena reintenta: cada llamada de la cadena se hizo UNA vez', async () => {
      const w = mundo({ versiones: [A, B, C] }); const d = await correr(despues, { mundo: w })
      for (const nombre of NOMBRES_DE_LA_CADENA) { const veces = d.llamadasHttp.filter((l: Json) => l.nodo === nombre).length; expect(veces).toBeLessThanOrEqual(1) }
    })
  })

  it('la cadena respeta las reglas del plan: nada de naufrago.ec, ninguna llave pegada, y la tabla que escribe es SOLO client_historical_outputs', () => {
    const s = JSON.stringify((despues.nodes as Json[]).filter((n) => NOMBRES_DE_LA_CADENA.includes(n.name) || n.name.startsWith('JEF · ')))
    expect(s).not.toMatch(/naufrago/i)
    const tablas = [...s.matchAll(/\/rest\/v1\/([a-z_]+)/g)].map((m) => m[1])
    expect([...new Set(tablas)]).toEqual(['client_historical_outputs'])
  })
  it('el archivo del plan ARREGLADO se puede serializar sin perder nada (ida y vuelta por JSON)', () => {
    expect(JSON.parse(JSON.stringify(despues))).toEqual(despues)
    void fs
  })
})

// ═════════════════════════════════════════════════════════════ R4 · la espera del plan, cerrada POR DISEÑO (sin medir)
import { PLAZO_DEL_PLAN_S } from '../scripts/worker-staging/jefatura-j7/construir-enganches.mjs'
describe('R4 · la espera del plan: el máximo del diseño, por un camino que no depende del tope de ejecución de n8n, y con marca «revisión incompleta» si se pasa', () => {
  const nodoGate = (f: Json, n: string) => (f.nodes as Json[]).find((x) => x.name === n) as Json
  const A = { etiqueta: 'A', paso: 'redactor', texto: planMalo(), largo: planMalo().length }
  const BRIEF = 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)'
  const sinCierre = () => { const w = mundo({ versiones: [] }); w.http[N.abrir] = () => resp(200, { accion: 'esperar', revision_id: UUID, turno: { n: 1, tipo: 'agente', paso: 'revision_fondo', pedido: {} } }); w.http[N.despertar] = () => resp(200, {}); w.http[N.leer] = () => resp(200, { revision_id: UUID, estado: 'en_paso' }); return w }

  it('el plazo es el MÁXIMO del diseño: 3 turnos de 15 min + 200 s de GPT ≈ 48 min, redondeado a 50 min (3.000 s)', () => {
    expect(PLAZO_DEL_PLAN_S).toBe(3000); expect(PLAZO_DEL_PLAN_S).toBeGreaterThanOrEqual(3 * 15 * 60 + 200)
    expect(String(nodoGate(despues, N.armar).parameters.jsCode)).toContain('"plazo_s":3000')
  })
  it('no depende del tope de ejecución de n8n: la espera es una cadena de «Wait» guardados en base (cada uno > 65 s, que es lo que n8n guarda) y ninguna tajada de trabajo pasa de 60 s', () => {
    const w = nodoGate(despues, N.esperar)
    expect(w.type).toBe('n8n-nodes-base.wait'); expect(w.parameters.resume).toBe('timeInterval'); expect(w.parameters.unit).toBe('seconds')
    expect(w.parameters.amount).toBeGreaterThan(65); expect(w.parameters.amount).toBeLessThanOrEqual(300)
    for (const n of despues.nodes as Json[]) if (n.type === 'n8n-nodes-base.httpRequest' && (n.name.startsWith('JEF · ') || NOMBRES_DE_LA_CADENA.includes(n.name))) expect(n.parameters.options.timeout).toBeLessThanOrEqual(60000)
  })
  it('el plazo vive en un DATO del ítem (`plazo_fin`, calculado una vez) y se mira contra el reloj en cada lectura: una reanudación tardía no lo estira', async () => {
    const d = await correr(despues, { mundo: sinCierre() })
    const armar = d.visitas.find((v: Json) => v.nodo === N.armar).salida[0]
    expect(typeof armar.jef.plazo_fin).toBe('number'); expect(armar.jef.plazo_fin - 1_700_000_000_000).toBe(3000 * 1000)
    const lecturas = d.visitas.filter((v: Json) => v.nodo === N.leer).length
    expect(lecturas).toBeLessThanOrEqual(Math.ceil(3000 / 120) + 2); expect(lecturas).toBeGreaterThan(20)
    expect(d.reloj - 1_700_000_000_000).toBeGreaterThanOrEqual(3000 * 1000 - 120_000); expect(d.reloj - 1_700_000_000_000).toBeLessThanOrEqual(3000 * 1000 + 120_000)
  })
  it('si se pasa el plazo: el plan sigue (PDF y brief con A) y A queda marcado «revisión incompleta» en su rastro COMPLETO, con aviso; la versión que llegue tarde no se guarda (G6)', async () => {
    const w = sinCierre(); const d = await correr(despues, { mundo: w })
    expect(llamada(d, BRIEF)[0].cuerpo.payload.plan_id).toBe(idDeA)
    expect(llamada(d, 'Plan → Drive (PDF)')).toHaveLength(1); expect(w.m.insertadas).toEqual([])
    expect(w.m.marcas).toHaveLength(1)
    expect(llamada(d, P.marcaPatch)[0].url.endsWith('client_historical_outputs?id=eq.' + idDeA)).toBe(true)
    const tag = w.m.marcas[0].provenance_tag
    for (const [k, v] of Object.entries(tagA)) expect(tag[k]).toEqual(v)
    expect(tag.jefatura_marcas).toMatchObject({ resultado: 'incompleta_por_plazo', revision_id: UUID }); expect(tag.jefatura_marcas.motivo).toContain('se acabó la espera')
    expect(w.m.avisos).toHaveLength(1); expect(w.m.avisos[0]).toContain('revisión incompleta'); expect(w.m.avisos[0]).toContain('Café de práctica')
  })
  for (const resultado of ['con_desacuerdo', 'sin_segunda_mirada', 'incompleta_por_tope', 'fallida']) {
    it(`la revisión cerró «${resultado}» sin versión nueva: A sigue y queda marcado con ese resultado`, async () => {
      const w = mundo({ versiones: [A], cierra: { resultado } }); const d = await correr(despues, { mundo: w })
      expect(w.m.insertadas).toEqual([]); expect(w.m.marcas).toHaveLength(1); expect(w.m.marcas[0].provenance_tag.jefatura_marcas.resultado).toBe(resultado)
      expect(llamada(d, BRIEF)[0].cuerpo.payload.plan_id).toBe(idDeA)
    })
  }
  it('una revisión LIMPIA no deja marca ni aviso (y el plan sigue idéntico a hoy)', async () => {
    const w = mundo({ versiones: [A], cierra: { resultado: 'limpia' } }); await correr(despues, { mundo: w })
    expect(w.m.marcas).toEqual([]); expect(w.m.avisos).toEqual([])
  })
  for (const [caso, h] of [['apagada (409)', () => resp(409, { error: 'jefatura_no_abre', motivo: 'apagada' })], ['500', () => resp(500, { error: 'x' })], ['corte de red', () => ({ error: { message: 'timeout' } })]] as Array<[string, () => Json]>) {
    it(`${caso}: NO hay marca ni aviso (no hubo revisión: idéntico a hoy)`, async () => {
      const w = mundo({ versiones: [] }); w.http[N.abrir] = h; await correr(despues, { mundo: w })
      expect(w.m.marcas).toEqual([]); expect(w.m.avisos).toEqual([])
    })
  }
  it('con versión nueva adoptada y limpia (la última): no hay marca; con B adoptada y C que empeora (con_desacuerdo): la marca va en la fila de B (la vigente) con SU rastro completo', async () => {
    const B = { etiqueta: 'B', paso: 'correccion', texto: planBueno('B'), largo: planBueno('B').length }, C = { etiqueta: 'C', paso: 'decision', texto: planMalo('C'), largo: planMalo('C').length }
    const limpia = mundo({ versiones: [A, B] }); await correr(despues, { mundo: limpia })
    expect(limpia.m.marcas).toEqual([])
    const w = mundo({ versiones: [A, B, C] }); const d = await correr(despues, { mundo: w })
    expect(w.m.marcas).toHaveLength(1)
    expect(llamada(d, P.marcaPatch)[0].url.endsWith('client_historical_outputs?id=eq.' + w.m.insertadas[0].id)).toBe(true)
    expect(w.m.marcas[0].provenance_tag).toMatchObject({ etiqueta: 'B', version: 2, version_de: idDeA, jefatura_marcas: { resultado: 'con_desacuerdo' } })
  })
  it('si A queda adoptada aunque se produjeron versiones que empeoran: A se marca con_desacuerdo', async () => {
    const bueno = vuelta(planBueno('A'), { con_pendientes: false, pendientes: null, estado_del_plan: 'sin_marcas', chequeo_del_plan: { ok: true, marcas: [] } })
    const w = mundo({ versiones: [{ ...A, texto: planBueno('A') }, { etiqueta: 'B', paso: 'c', texto: planMalo('B'), largo: planMalo('B').length }] }); await correr(despues, { mundo: w, texto: planBueno('A'), vuelta: bueno })
    expect(w.m.insertadas).toEqual([]); expect(w.m.marcas[0].provenance_tag.jefatura_marcas.resultado).toBe('con_desacuerdo')
  })
  it('repetir la ejecución no vuelve a marcar ni a avisar (idempotente): una fila que ya trae esa marca de esa revisión se deja', async () => {
    const yaMarcada = filaA({ provenance_tag: { ...tagA, jefatura_marcas: { resultado: 'incompleta_por_plazo', revision_id: UUID } } })
    const w = sinCierre(); await correr(despues, { mundo: w, fila: yaMarcada })
    expect(w.m.marcas).toEqual([]); expect(w.m.avisos).toEqual([])
  })
  it('si no se puede escribir la marca (500), el plan IGUAL sigue su camino (la marca nunca frena la cadena)', async () => {
    const w = sinCierre(); const falla = w.http[P.marcaPatch]; w.http[P.marcaPatch] = () => resp(500, { error: 'x' }); void falla
    const d = await correr(despues, { mundo: w })
    expect(llamada(d, 'Plan → Drive (PDF)')).toHaveLength(1); expect(llamada(d, BRIEF)).toHaveLength(1)
  })
  it('lo que reciben el PDF y el brief es lo mismo con o sin marca (la rama es lateral y no cambia sus entradas)', async () => {
    const dCon = await correr(despues, { mundo: sinCierre() })
    const sin = mundo({ versiones: [] }); sin.http[N.abrir] = () => resp(409, { error: 'jefatura_no_abre', motivo: 'apagada' }); const dSin = await correr(despues, { mundo: sin })
    const cuerpos = (d: Json) => sinGate(d).filter((l: Json) => ['Plan → Drive (PDF)', BRIEF].includes(l.nodo)).map((l: Json) => l.cuerpo)
    expect(cuerpos(dCon)).toEqual(cuerpos(dSin))
  })
})

// ═════════════════════════════════════════════════════════════ reparos menores de CC#3 (J7 · recertificación 2) · (a) cota de sondeos · (b) la marca sin id o sin rastro
describe('reparo menor (a) · la cota de sondeos cierra la espera aunque `plazo_fin` falte o no sea un número', () => {
  const BRIEF = 'BRIEF · sobre · pedir el parte a la sala (E-brief · CC#2)'
  const sinCierre = () => { const w = mundo({ versiones: [] }); w.http[N.abrir] = () => resp(200, { accion: 'esperar', revision_id: UUID, turno: { n: 1, tipo: 'agente', paso: 'revision_fondo', pedido: {} } }); w.http[N.despertar] = () => resp(200, {}); w.http[N.leer] = () => resp(200, { revision_id: UUID, estado: 'en_paso' }); return w }
  const SIN_RELOJ = 'plazo_fin: Date.now() + CFG.plazo_s * 1000'
  const conPlazoFin = (valor: string) => {
    const f = JSON.parse(JSON.stringify(despues)) as Json
    const n = (f.nodes as Json[]).find((x) => x.name === N.armar) as Json
    expect(String(n.parameters.jsCode).split(SIN_RELOJ)).toHaveLength(2)
    n.parameters.jsCode = String(n.parameters.jsCode).replace(SIN_RELOJ, () => 'plazo_fin: ' + valor)
    return f
  }
  const COTA = Math.ceil(PLAZO_DEL_PLAN_S / 120) + 2
  for (const [caso, valor] of [['ausente', 'undefined'], ['texto no numérico', "'pronto'"], ['NaN', 'NaN']] as const) {
    it(`\`plazo_fin\` ${caso} y una revisión que nunca cierra: termina en «plazo» por la cota de ${COTA} sondeos, el plan sigue con A y queda marcado`, async () => {
      const w = sinCierre(); const d = await correr(conPlazoFin(valor), { mundo: w })
      expect(d.visitas.filter((v: Json) => v.nodo === N.leer).length).toBe(COTA)
      expect(llamada(d, BRIEF)).toHaveLength(1); expect(llamada(d, BRIEF)[0].cuerpo.payload.plan_id).toBe(idDeA)
      expect(llamada(d, 'Plan → Drive (PDF)')).toHaveLength(1); expect(w.m.insertadas).toEqual([])
      expect(w.m.marcas).toHaveLength(1); expect(w.m.marcas[0].provenance_tag.jefatura_marcas).toMatchObject({ resultado: 'incompleta_por_plazo', revision_id: UUID })
    })
  }
})

describe('reparo menor (b) · «Plan vigente» sin id o sin rastro: la rama de la marca no devuelve ítems y no hace ningún PATCH', () => {
  const sinCierre = () => { const w = mundo({ versiones: [] }); w.http[N.abrir] = () => resp(200, { accion: 'esperar', revision_id: UUID, turno: { n: 1, tipo: 'agente', paso: 'revision_fondo', pedido: {} } }); w.http[N.despertar] = () => resp(200, {}); w.http[N.leer] = () => resp(200, { revision_id: UUID, estado: 'en_paso' }); return w }
  // la revisión SÍ abre con el plan A (necesita su id); lo que se estropea es lo que «Plan vigente» entrega a la rama lateral de la marca
  const conVigenteRoto = (cambio: string) => {
    const f = JSON.parse(JSON.stringify(despues)) as Json
    const n = (f.nodes as Json[]).find((x) => x.name === P.vigente) as Json
    n.parameters.jsCode = ['// reparo (b): se estropea lo que entrega «Plan vigente»', 'const __o = (() => {', String(n.parameters.jsCode), '})()', 'return __o.map((i) => ({ json: { ...i.json, ' + cambio + ' } }))'].join(String.fromCharCode(10))
    return f
  }
  const casos: Array<[string, string]> = [
    ['sin id', 'id: undefined'], ['id vacío', "id: ''"], ['id que no es texto', 'id: 42'],
    ['rastro vacío ({})', 'provenance_tag: {}'], ['rastro nulo', 'provenance_tag: null'], ['rastro ausente', 'provenance_tag: undefined'], ['rastro en lista', "provenance_tag: ['x']"], ['rastro en texto', "provenance_tag: 'x'"],
  ]
  for (const [caso, cambio] of casos) {
    it(`${caso}: ningún PATCH ni aviso de la marca; el plan sigue su camino`, async () => {
      const w = sinCierre(); const d = await correr(conVigenteRoto(cambio), { mundo: w })
      expect(llamada(d, P.marcaPatch)).toEqual([]); expect(w.m.marcas).toEqual([]); expect(w.m.avisos).toEqual([])
      expect(llamada(d, 'Plan → Drive (PDF)')).toHaveLength(1)
    })
  }
  it('con id y rastro válidos sí marca (control: la prueba distingue la guarda de la ausencia de marca)', async () => {
    const w = sinCierre(); await correr(conVigenteRoto('cualquier_otro: 1'), { mundo: w })
    expect(w.m.marcas).toHaveLength(1)
  })
})

describe('reparo menor (c) · el aviso no promete lo que el flujo no impone', () => {
  it('dice «marcado para revisión» y no que una persona lo mira antes de enviarlo', async () => {
    const w = mundo({ versiones: [] }); w.http[N.abrir] = () => resp(200, { accion: 'esperar', revision_id: UUID, turno: { n: 1, tipo: 'agente', paso: 'revision_fondo', pedido: {} } }); w.http[N.despertar] = () => resp(200, {}); w.http[N.leer] = () => resp(200, { revision_id: UUID, estado: 'en_paso' })
    await correr(despues, { mundo: w })
    expect(w.m.avisos).toHaveLength(1); expect(w.m.avisos[0]).toContain('marcado para revisión'); expect(w.m.avisos[0]).not.toContain('una persona'); expect(w.m.avisos[0]).not.toContain('antes de enviarlo')
  })
})
