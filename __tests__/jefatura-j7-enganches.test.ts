/**
 * JEFATURA · J7 · LOS ENGANCHES (CC#1 · 14-oct) · el cambio de cada flujo productor, EJECUTADO con el n8n en miniatura (el código real de los nodos nuevos, los originales con eco).
 * Lo que se prueba: (1) APAGADO = IDÉNTICO A HOY (cada nodo original recibe lo mismo, también con 4xx/5xx/corte/plazo/dry_run ambiguo), (2) la revisión suma su aviso sin frenar nada,
 * (3) lo que se manda a la ruta es una entrada VÁLIDA de la ruta real, (4) la estructura del flujo (nada se reintenta, sin llaves, sin nodos huérfanos, destinos intactos).
 * US$ 0: ningún flujo se aplica, ninguna llamada sale.
 */
import { describe, expect, it } from 'vitest'
import { validarEntrada } from '@/lib/jefatura/revision/contrato'
import { N } from '../scripts/worker-staging/jefatura-j7/gate.mjs'
import { antesDe, enganchaBrief, FLUJOS } from '../scripts/worker-staging/jefatura-j7/construir-enganches.mjs'
import { ejecutar, ENV, estructura, recibidoPorLosOriginales, resp, UUID, type Json } from './_helpers/j7-flujos'

// ═════════════════════════════════════════════════════════════ BRIEF
describe('J7 · brief (BNXqlaX1oHSfZIpF) · entre «④ Chequeos» y «⑤ ¿Modo seco?»', () => {
  const antes = antesDe(FLUJOS.brief.id) as Json
  const despues = enganchaBrief(antes) as Json

  estructura('brief', antes, despues, { desde: '④ Chequeos', salida: 0 })

  const manual = 'MANUAL · tono cercano, tuteo. Palabras prohibidas: barato.'
  const plan = 'PLAN DE 90 DÍAS · '.padEnd(1500, 'x')
  const parteMd = '# Parte de trabajo\n\n## Brief b1\nMensaje: …\n'
  const quimica = (o: Json = {}): Json => ({
    client_id: UUID, client_name: 'Café de práctica', dry_run: false, plan_id: 'plan-1', manual_id: 'm-1', llego_la_vuelta: true, parte_valido: true, motivo_invalido: null, chequeos_ok: true,
    hallazgos: [], por_chequeo: {}, entregables: 1, parte_md: parteMd, _sala_correlation_id: 'corr-1', _journey_id: 'journey-1',
    fila_parte: { client_id: UUID, title: 'Parte de trabajo · briefs · 2026-10-14', output_type: 'campaign_brief_pack', content: parteMd, content_text: parteMd, producing_agent: 'campaign-brief-agent', status: 'draft',
      provenance_tag: { fuente: 'brief', workflow_id: 'WF', workflow_execution_id: 'EX', plan_id: 'plan-1', campana_id: 'camp-1', lote: '2026-W42', lote_key: 'camp-1:2026-W42:1', fila_ids: ['f1'], valido: true, dry_run: false, parte: { entregables: [{ id: 'b1' }] } } },
    ...o,
  })
  const previos = { '① GUARDA · sin manual aprobado se DETIENE': { manual_texto: manual }, '② GUARDA · sin plan se DETIENE': { plan_texto: plan }, '⓪ GUARDA · el lote': { filas_lote: [{ id: 'f1', tema: 'apertura' }] } }
  const correr = (flujo: Json, item: Json, http: Json = {}, extra: Json = {}) => ejecutar(flujo, { inicio: '④ Chequeos', items: [item], previos, http, ...extra })
  const noAbre = { [N.abrir]: () => resp(409, { error: 'jefatura_no_abre', motivo: 'apagada' }) }

  describe('APAGADO = IDÉNTICO A HOY', () => {
    it('con la jefatura apagada (409) cada nodo original recibe EXACTAMENTE lo mismo que sin el enganche', async () => {
      const item = quimica()
      const a = await correr(antes, item)
      const d = await correr(despues, item, noAbre)
      expect(recibidoPorLosOriginales(d)).toEqual(recibidoPorLosOriginales(a))
      expect(recibidoPorLosOriginales(d).length).toBeGreaterThan(2)
    })
    for (const [caso, h] of [
      ['tipo no activo (409)', () => resp(409, { error: 'jefatura_no_abre', motivo: 'tipo_no_activo' })],
      ['cliente fuera del ensayo (409)', () => resp(409, { error: 'jefatura_no_abre', motivo: 'fuera_del_ensayo' })],
      ['400 entrada inválida', () => resp(400, { error: 'entrada_invalida', errores: ['x'] })],
      ['401 sin llave', () => resp(401, { error: 'unauthorized' })],
      ['503 sin SALA_DISPATCH_KEY', () => resp(503, { error: 'sala_dispatch_key_not_configured' })],
      ['500 de la ruta', () => resp(500, { error: 'jefatura_error', detalle: 'x' })],
      ['corte de red (sin respuesta)', () => ({ error: { message: 'socket hang up' } })],
      ['respuesta que no es un objeto', () => resp(200, 'oops' as unknown as Json)],
      ['200 con una acción desconocida', () => resp(200, { accion: 'inventada', revision_id: UUID })],
    ] as Array<[string, () => Json]>) {
      it(`${caso}: el flujo sigue idéntico a hoy`, async () => {
        const item = quimica()
        const a = await correr(antes, item)
        const d = await correr(despues, item, { [N.abrir]: h })
        expect(recibidoPorLosOriginales(d)).toEqual(recibidoPorLosOriginales(a))
      })
    }
    it('si la revisión no cierra a tiempo (plazo) el parte sigue idéntico a hoy y NO queda nada guardado de la revisión', async () => {
      const item = quimica()
      const a = await correr(antes, item)
      const d = await correr(despues, item, {
        [N.abrir]: () => resp(200, { accion: 'esperar', revision_id: UUID, turno: { n: 1, tipo: 'agente', paso: 'revision_fondo', pedido: {} } }),
        [N.despertar]: () => resp(200, {}),
        [N.leer]: () => resp(200, { revision_id: UUID, estado: 'en_paso' }),
      })
      expect(recibidoPorLosOriginales(d)).toEqual(recibidoPorLosOriginales(a))
      const sondeos = d.visitas.filter((v: Json) => v.nodo === N.leer).length
      expect(sondeos).toBeGreaterThan(3)
      expect(sondeos).toBeLessThanOrEqual(Math.ceil(1200 / 90) + 2)
      expect(d.reloj - 1_700_000_000_000).toBeGreaterThanOrEqual(1200 * 1000 - 90_000)
    })
    it('una lectura que falla de paso (500) no corta la espera: sigue y, cuando cierra, aplica', async () => {
      let k = 0
      const d = await correr(despues, quimica(), {
        [N.abrir]: () => resp(200, { accion: 'esperar', revision_id: UUID, turno: { n: 1, tipo: 'agente', paso: 'revision_fondo', pedido: {} } }),
        [N.despertar]: () => resp(200, {}),
        [N.leer]: () => { k += 1; return k === 1 ? resp(500, { error: 'jefatura_error' }) : k === 2 ? ({ error: { message: 'timeout' } }) : resp(200, { revision_id: UUID, estado: 'cerrada', salida: { resultado: 'limpia', marcas: { con_desacuerdo: false, sin_segunda_mirada: false }, desacuerdos: [], costo_usd: 0.2, simulado: false } }) },
      })
      expect(k).toBe(3)
      const aplicado = d.visitas.find((v: Json) => v.nodo === N.aplicar)
      expect(aplicado.salida[0].fila_parte.provenance_tag.jefatura.resultado).toBe('limpia')
    })
    it('el nodo «JEF · aplicar» devuelve los MISMOS ítems del nodo de origen (no una copia retocada) cuando no hay revisión cerrada', async () => {
      const item = quimica()
      const d = await correr(despues, item, noAbre)
      const ap = d.visitas.find((v: Json) => v.nodo === N.aplicar)
      expect(ap.salida).toEqual([item])
    })
  })

  describe('no abre cuando no hay nada que revisar (y no llama a la ruta)', () => {
    for (const [caso, item] of [
      ['dry_run ausente (no se lee como real ni como seco)', (() => { const q = quimica(); delete q.dry_run; return q })()],
      ['dry_run como texto «false»', quimica({ dry_run: 'false' })],
      ['dry_run como 0', quimica({ dry_run: 0 })],
      ['parte no válido', quimica({ parte_valido: false })],
      ['la vuelta del redactor no llegó', quimica({ llego_la_vuelta: false })],
      ['sin lote_key', (() => { const q = quimica(); delete q.fila_parte.provenance_tag.lote_key; return q })()],
      ['parte sin texto', quimica({ parte_md: '   ' })],
    ] as Array<[string, Json]>) {
      it(`${caso}`, async () => {
        const a = await correr(antes, item)
        const d = await correr(despues, item, { [N.abrir]: () => { throw new Error('NO debía llamarse a la ruta') } })
        expect(d.llamadasHttp.length).toBe(0)
        expect(recibidoPorLosOriginales(d)).toEqual(recibidoPorLosOriginales(a))
      })
    }
  })

  describe('lo que se manda a la ruta', () => {
    it('es una entrada VÁLIDA de la ruta real (validarEntrada): tipo brief, artifact_id = lote_key, client_id en la raíz, dry_run booleano, devolver_a ninguno', async () => {
      const d = await correr(despues, quimica(), noAbre)
      const llamada = d.llamadasHttp.find((l: Json) => l.nodo === N.abrir)
      const v = validarEntrada(llamada.cuerpo)
      expect(v.ok).toBe(true)
      expect(llamada.cuerpo.artifact_type).toBe('brief')
      expect(llamada.cuerpo.artifact_id).toBe('camp-1:2026-W42:1')
      expect(llamada.cuerpo.client_id).toBe(UUID)
      expect(llamada.cuerpo.payload.dry_run).toBe(false)
      expect(llamada.cuerpo.payload.devolver_a).toEqual({ tipo: 'ninguno', destino: '' })
      expect(llamada.cuerpo.payload.texto).toBe(parteMd)
      expect(llamada.url).toBe('https://zero-risk-platform.vercel.app/api/jefatura/revisiones')
      expect(llamada.cabeceras['x-sala-dispatch-key']).toBe(ENV.SALA_DISPATCH_KEY)
    })
    it('lleva los documentos «contra qué» con los mismos títulos de la política (manual, plan y filas) y los chequeos de código ya hechos', async () => {
      const d = await correr(despues, quimica({ chequeos_ok: false, hallazgos: [{ chequeo: 'conteo', detalle: 'faltan 2 entregables' }] }), noAbre)
      const p = d.llamadasHttp.find((l: Json) => l.nodo === N.abrir).cuerpo.payload
      expect(p.contexto.map((c: Json) => c.titulo)).toEqual(['Manual de marca vigente', 'Plan vigente', 'Filas del calendario'])
      expect(p.contexto[0].texto).toBe(manual)
      expect(p.chequeos_previos).toEqual({ pasaron: false, necesita_humano: false, marcas: ['conteo: faltan 2 entregables'] })
    })
    it('un documento que no se pudo leer se omite (no se inventa) y la revisión igual se abre', async () => {
      const d = await ejecutar(despues, { inicio: '④ Chequeos', items: [quimica()], previos: { '① GUARDA · sin manual aprobado se DETIENE': { manual_texto: '' }, '② GUARDA · sin plan se DETIENE': { plan_texto: plan }, '⓪ GUARDA · el lote': { filas_lote: [] } }, http: noAbre })
      const p = d.llamadasHttp.find((l: Json) => l.nodo === N.abrir).cuerpo.payload
      expect(p.contexto.map((c: Json) => c.titulo)).toEqual(['Plan vigente'])
    })
    it('en seco manda dry_run: true (así la revisión de un ensayo no gasta)', async () => {
      const d = await correr(despues, quimica({ dry_run: true }), noAbre)
      expect(d.llamadasHttp.find((l: Json) => l.nodo === N.abrir).cuerpo.payload.dry_run).toBe(true)
    })
  })

  describe('con la revisión cerrada: suma su aviso, no frena nada', () => {
    const salida = (o: Json = {}): Json => ({ revision_id: UUID, resultado: 'con_desacuerdo', marcas: { con_desacuerdo: true, sin_segunda_mirada: false }, desacuerdos: ['La brief b1 promete un descuento que el plan no menciona'], costo_usd: 0.31, simulado: false, ...o })
    const cierraYa = (s: Json) => ({ [N.abrir]: () => resp(200, { accion: 'cerrado', revision_id: UUID, resultado: s.resultado, salida: s }) })

    it('cierra dentro de la ruta (sin turnos de agente): no se despierta ningún flujo ni se espera', async () => {
      const d = await correr(despues, quimica(), cierraYa(salida()))
      expect(d.visitas.some((v: Json) => v.nodo === N.despertar || v.nodo === N.esperar || v.nodo === N.leer)).toBe(false)
      expect(d.llamadasHttp.length).toBe(1)
    })
    it('con desacuerdo: agrega UN bloque al final del parte (content, content_text y parte_md) y anota la revisión en provenance_tag SIN perder ninguna clave', async () => {
      const item = quimica()
      const d = await correr(despues, item, cierraYa(salida()))
      const sig = d.visitas.find((v: Json) => v.nodo === '⑤ ¿Modo seco?')
      const q = sig.entrada[0]
      expect(q.fila_parte.content).toContain('## Revisión del sistema (jefatura · solo aviso)')
      expect(q.fila_parte.content).toContain('La brief b1 promete un descuento que el plan no menciona')
      expect(q.fila_parte.content.startsWith(parteMd)).toBe(true)
      expect(q.fila_parte.content_text).toBe(q.fila_parte.content)
      expect(q.parte_md).toBe(q.fila_parte.content)
      expect((q.fila_parte.content.match(/## Revisión del sistema/g) || []).length).toBe(1)
      const tag = q.fila_parte.provenance_tag
      for (const [k, v] of Object.entries(item.fila_parte.provenance_tag)) expect(tag[k]).toEqual(v)
      expect(tag.jefatura).toEqual({ revision_id: UUID, resultado: 'con_desacuerdo', con_desacuerdo: true, sin_segunda_mirada: false, desacuerdos: 1, costo_usd: 0.31, simulado: false })
    })
    it('limpia: el texto del parte NO cambia (solo queda anotada la revisión)', async () => {
      const item = quimica()
      const d = await correr(despues, item, cierraYa(salida({ resultado: 'limpia', marcas: { con_desacuerdo: false, sin_segunda_mirada: false }, desacuerdos: [] })))
      const q = d.visitas.find((v: Json) => v.nodo === '⑤ ¿Modo seco?').entrada[0]
      expect(q.fila_parte.content).toBe(parteMd)
      expect(q.parte_md).toBe(parteMd)
      expect(q.fila_parte.provenance_tag.jefatura.resultado).toBe('limpia')
    })
    for (const [resultado, frase] of [['sin_segunda_mirada', 'no tuvo segunda mirada'], ['incompleta_por_tope', 'tope de costo'], ['fallida', 'NO se revisó']] as const) {
      it(`${resultado}: el aviso lo dice con claridad y el parte sigue su camino`, async () => {
        const d = await correr(despues, quimica(), cierraYa(salida({ resultado, marcas: { con_desacuerdo: false, sin_segunda_mirada: resultado === 'sin_segunda_mirada' }, desacuerdos: [] })))
        const q = d.visitas.find((v: Json) => v.nodo === '⑤ ¿Modo seco?').entrada[0]
        expect(q.fila_parte.content).toContain(frase)
        expect(d.visitas.some((v: Json) => v.nodo === '⑤ Guardar el parte' || v.nodo === '⑤ Seco · lo que se habría escrito')).toBe(true)
      })
    }
    it('un parte NO válido o un dato de la fila no cambian por la revisión: «parte_valido», las filas y el cable de vuelta quedan como estaban', async () => {
      const item = quimica()
      const d = await correr(despues, item, cierraYa(salida()))
      const q = d.visitas.find((v: Json) => v.nodo === '⑤ ¿Modo seco?').entrada[0]
      for (const k of ['parte_valido', 'client_id', 'dry_run', 'plan_id', 'chequeos_ok', 'entregables', '_sala_correlation_id']) expect(q[k]).toEqual(item[k])
      expect(q.fila_parte.provenance_tag.fila_ids).toEqual(['f1'])
      expect(q.fila_parte.provenance_tag.valido).toBe(true)
    })
    it('despierta el turno con la revisión y el turno que dijo la ruta, y espera hasta que cierre (segundo sondeo)', async () => {
      let k = 0
      const turno = { n: 1, tipo: 'agente', paso: 'revision_fondo', pedido: { agent_name: 'jefe-marketing' } }
      const d = await correr(despues, quimica(), {
        [N.abrir]: () => resp(200, { accion: 'esperar', revision_id: UUID, turno }),
        [N.despertar]: () => resp(200, { ok: true }),
        [N.leer]: () => { k += 1; return k < 2 ? resp(200, { revision_id: UUID, estado: 'en_paso' }) : resp(200, { revision_id: UUID, estado: 'cerrada', salida: salida() }) },
      })
      const des = d.llamadasHttp.find((l: Json) => l.nodo === N.despertar)
      expect(des.cuerpo).toEqual({ revision_id: UUID, turno })
      expect(des.cabeceras['x-sala-dispatch-key']).toBe(ENV.SALA_DISPATCH_KEY)
      expect(des.url).toBe('https://n8n-production-72be.up.railway.app/webhook/zero-risk/jefatura-turno')
      const lecturas = d.llamadasHttp.filter((l: Json) => l.nodo === N.leer)
      expect(lecturas.length).toBe(2)
      expect(lecturas[0].cuerpo).toEqual({ accion: 'leer', revision_id: UUID })
      expect(d.visitas.find((v: Json) => v.nodo === '⑤ ¿Modo seco?').entrada[0].fila_parte.provenance_tag.jefatura.resultado).toBe('con_desacuerdo')
    })
    it('una revisión que ya existía (se reejecutó el lote) no despierta otro turno: espera y lee', async () => {
      const d = await correr(despues, quimica(), {
        [N.abrir]: () => resp(200, { accion: 'ya_existia', revision_id: UUID, estado: 'cerrada', resultado: 'limpia' }),
        [N.leer]: () => resp(200, { revision_id: UUID, estado: 'cerrada', salida: salida({ resultado: 'limpia', desacuerdos: [], marcas: { con_desacuerdo: false, sin_segunda_mirada: false } }) }),
      })
      expect(d.llamadasHttp.some((l: Json) => l.nodo === N.despertar)).toBe(false)
      expect(d.visitas.find((v: Json) => v.nodo === '⑤ ¿Modo seco?').entrada[0].fila_parte.provenance_tag.jefatura.resultado).toBe('limpia')
    })
    it('una revisión cerrada SIN salida no inventa nada: el parte sigue idéntico a hoy', async () => {
      const item = quimica()
      const a = await correr(antes, item)
      const d = await correr(despues, item, { [N.abrir]: () => resp(200, { accion: 'cerrado', revision_id: UUID, resultado: 'limpia' }) })
      expect(recibidoPorLosOriginales(d)).toEqual(recibidoPorLosOriginales(a))
    })
  })
})

// ═════════════════════════════════════════════════════════════ los archivos ARREGLADOS del repositorio
import fs from 'node:fs'
import { CONSTRUCTORES } from '../scripts/worker-staging/jefatura-j7/construir-enganches.mjs'
describe('J7 · los ARREGLADOS que se dejan en el repositorio salen del constructor y de su ANTES respaldado', () => {
  for (const [tipo, f] of Object.entries(FLUJOS) as Array<[string, { id: string }]>) {
    it(`${tipo} (${f.id}): el archivo es exactamente lo que construye el código, y el ANTES es del flujo correcto`, () => {
      const antes = antesDe(f.id) as Json
      expect(antes.id).toBe(f.id)
      const archivo = JSON.parse(fs.readFileSync(`scripts/worker-staging/jefatura-j7/ARREGLADO-${f.id}-j7-${tipo}-2026-10-14.json`, 'utf8').split('\r\n').join('\n'))
      expect(archivo).toEqual((CONSTRUCTORES as Json)[tipo](antes))
      // el ANTES no es el ARREGLADO (el enganche cambia algo) y ambos son JSON de n8n completos
      expect(archivo.nodes.length).toBeGreaterThan(antes.nodes.length)
      expect(archivo.connections).toBeTruthy(); expect(archivo.settings).toEqual(antes.settings)
    })
  }
})

// ═════════════════════════════════════════════════════════════ el guion de aplicar
import { spawnSync } from 'node:child_process'
describe('J7 · el guion de aplicar solo imprime sin --aplicar y no hace nada sin las variables', () => {
  const env = { ...process.env, N8N_BASE_URL: 'http://127.0.0.1:9', N8N_API_KEY: '' }
  const correr = (...args: string[]) => spawnSync(process.execPath, ['scripts/worker-staging/jefatura-j7/aplicar-enganche.mjs', ...args], { encoding: 'utf8', env })
  it('`orden` lista los 5 en el orden del diseño (pieza → brief → calendario → estrategia → plan) y dice que no tocó nada', () => {
    const r = correr('orden')
    expect(r.status).toBe(0)
    const tipos = [...r.stdout.matchAll(/^  (\w+)\s+(?:flujo|[A-Za-z0-9]{16}) /gm)].map((m) => m[1])
    expect(tipos).toEqual(['pieza', 'brief', 'calendario', 'estrategia', 'plan'])
    expect(r.stdout).toContain('Ahora no se ha tocado nada')
  })
  for (const tipo of ['brief', 'calendario', 'estrategia', 'plan', 'pieza']) {
    it(`${tipo}: sin --aplicar solo imprime; con --aplicar pero sin la llave de n8n se niega (error 2) sin tocar nada`, () => {
      const a = correr(tipo)
      expect(a.status).toBe(0); expect(a.stdout).toContain('(solo se imprime)')
      const b = correr(tipo, '--aplicar')
      expect(b.status).toBe(2); expect(b.stderr).toContain('N8N_API_KEY')
    })
  }
  it('`reversa <tipo>` también solo imprime sin --aplicar (y `reversa plan` no se confunde con la orden «orden»)', () => {
    const r = correr('reversa', 'plan')
    expect(r.status).toBe(0); expect(r.stdout).toContain('restaurar X9F0zp6LQ2xGEYVS'); expect(r.stdout).toContain('(solo se imprime)')
  })
  it('un tipo desconocido se rechaza', () => { expect(correr('inventado').status).toBe(2) })
})
