/**
 * JEFATURA · J8b · REPAROS DE CC#3 (R1–R4) · CC#1 · 14-oct. US$ 0, sin red:
 *  R1 «0 llamadores vivos» completa (por id, por dirección de webhook y por ejecuciones recientes) · R2 las guardas del `main()` probadas con un n8n y una base de MENTIRA ·
 *  R3 el orden firmado se hace cumplir (cabecera con confirmación; voto, filas y pendientes solo con la cabecera ya puesta) · R4 el nodo «③ ¿Y ahora?» de la oficina conoce `esperar_jefatura`.
 */
import fs from 'node:fs'
import { spawnSync } from 'node:child_process'
import { describe, expect, it } from 'vitest'
import { conEsperaDeLaJefatura, direccionesDe, ejecucionesRecientes, FLUJO_OFICINA, FLUJO_VOTO, NODO_AGENTE, NODO_Y_AHORA, paraLaOficina, referenciasA } from '../scripts/ops/jefatura-j8b/nucleo.mjs'
import { ejecutar, leerDias, leerFechaConfirmada, tieneLaCabecera } from '../scripts/ops/jefatura-j8b/guion.mjs'

type Json = Record<string, any>
const leerFlujo = (f: string) => JSON.parse(fs.readFileSync(f, 'utf8').split('\r\n').join('\n')) as Json
const OFICINA = leerFlujo('scripts/worker-staging/bTbWL9lUvQCfStAz/ANTES-bTbWL9lUvQCfStAz-2026-10-14.json')
const VOTO = leerFlujo('scripts/worker-staging/hi5nwPCGUWHkGnT7/ANTES-hi5nwPCGUWHkGnT7-2026-10-14.json')
const nodo = (f: Json, n: string) => (f.nodes as Json[]).find((x) => x.name === n) as Json
const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor

// ═════════════════════════════════════════════ R4 · el nodo «③ ¿Y ahora?»
describe('R4 · «③ ¿Y ahora?» de la oficina conoce `esperar_jefatura`', () => {
  const nuevo = conEsperaDeLaJefatura(OFICINA) as Json
  const correr = async (flujo: Json, e: Json) => {
    const js = String(nodo(flujo, NODO_Y_AHORA).parameters.jsCode)
    const $ = (n: string) => ({ first: () => ({ json: n === '⓪ Entrada · llave' ? { encargo_id: 'enc-1' } : {} }) })
    return new AsyncFunction('$input', '$', '$workflow', js)({ first: () => ({ json: e }) }, $, { id: 'WF' })
  }
  it('cambia SOLO ese nodo y SOLO suma una rama (una línea de comentario y una de código); lo demás queda idéntico', () => {
    for (const n of OFICINA.nodes as Json[]) if (n.name !== NODO_Y_AHORA) expect(JSON.stringify(nodo(nuevo, n.name))).toBe(JSON.stringify(n))
    expect(nuevo.connections).toEqual(OFICINA.connections)
    const a = String(nodo(OFICINA, NODO_Y_AHORA).parameters.jsCode).split('\r\n').join('\n').split('\n'), d = String(nodo(nuevo, NODO_Y_AHORA).parameters.jsCode).split('\n')
    expect(d.length).toBe(a.length + 2)
    expect(d.filter((l) => !a.includes(l)).length).toBe(2)
  })
  it('esperar_jefatura → TERMINA sin error y sin ítems (nada se despierta, nada va a la sala)', async () => {
    expect(await correr(nuevo, { statusCode: 200, body: { accion: 'esperar_jefatura', turno: { n: 4, tipo: 'jefatura' }, revision_id: 'r1' } })).toEqual([])
  })
  it('lo de siempre NO cambia: esperar sigue por «esperar», cerrado sigue por el cable, y todo lo demás sigue deteniéndose con su motivo', async () => {
    const a = await correr(OFICINA, { statusCode: 200, body: { accion: 'esperar', turno: { n: 2 } } }), d = await correr(nuevo, { statusCode: 200, body: { accion: 'esperar', turno: { n: 2 } } })
    expect(d).toEqual(a); expect(d[0].json.ruta).toBe('esperar')
    const cerrado = { statusCode: 200, body: { accion: 'cerrado', estado: 'cerrado', resultado_para_la_sala: 'ok', sala_ref: { _sala_correlation_id: 'c' } } }
    const ca = await correr(OFICINA, cerrado), cd = await correr(nuevo, cerrado)
    expect(cd[0].json.ruta).toBe('cable'); expect(cd[0].json.payload_cable.resultado).toBe('ok'); expect(cd[0].json.payload_cable.encargo_id).toBe(ca[0].json.payload_cable.encargo_id)
    for (const e of [{ statusCode: 409, body: { error: 'turno_no_esperado' } }, { statusCode: 500, body: {} }, { statusCode: 200, body: { accion: 'otra' } }, { statusCode: 200, body: { accion: 'esperar' } }, { error: { message: 'corte' } }]) {
      await expect(correr(nuevo, e)).rejects.toThrow(/OFICINA_/)
      await expect(correr(OFICINA, e)).rejects.toThrow(/OFICINA_/)
    }
  })
  it('un 200 sin acción reconocida con cuerpo de error NO se confunde con esperar_jefatura (solo la acción exacta)', async () => {
    await expect(correr(nuevo, { statusCode: 200, body: { accion: 'esperar_jefatura_x' } })).rejects.toThrow(/OFICINA_TURNO_RECHAZADO/)
    await expect(correr(nuevo, { statusCode: 202, body: { accion: 'esperar_jefatura' } })).rejects.toThrow(/OFICINA_TURNO_RECHAZADO/)
  })
  it('se niega si el nodo ya la conoce, si falta o se repite, o si la línea de esperar cambió (se revisa a mano)', () => {
    expect(() => conEsperaDeLaJefatura(nuevo)).toThrow(/ya conoce/)
    const sin = JSON.parse(JSON.stringify(OFICINA)); sin.nodes = sin.nodes.filter((n: Json) => n.name !== NODO_Y_AHORA)
    expect(() => conEsperaDeLaJefatura(sin)).toThrow(/UN nodo/)
    const otro = JSON.parse(JSON.stringify(OFICINA)); nodo(otro, NODO_Y_AHORA).parameters.jsCode = String(nodo(otro, NODO_Y_AHORA).parameters.jsCode).replace("b.accion === 'esperar' && b.turno", "b.accion === 'esperar'")
    expect(() => conEsperaDeLaJefatura(otro)).toThrow(/no aparece una sola vez/)
  })
  it('el flujo de la oficina para J8b trae las DOS cosas (cabecera y rama) y sale de un solo respaldo', () => {
    const j = paraLaOficina(OFICINA) as Json
    expect(tieneLaCabecera(j)).toBe(true); expect(String(nodo(j, NODO_Y_AHORA).parameters.jsCode)).toContain('esperar_jefatura')
    expect(tieneLaCabecera(OFICINA)).toBe(false)
  })
})

// ═════════════════════════════════════════════ R1 · 0 llamadores vivos
describe('R1 · el voto solo se desactiva con «0 llamadores vivos» (id, dirección y ejecuciones)', () => {
  const direcciones = direccionesDe(VOTO)
  it('el voto vivo expone su dirección de webhook (de ahí se busca a quien lo llama sin nombrar su id)', () => { expect(direcciones.length).toBeGreaterThan(0); expect(direcciones.every((d: string) => typeof d === 'string' && d.length > 3)).toBe(true) })
  const llamador = (por: string) => ({ id: 'X', name: 'otro', nodes: [{ name: 'Llamar al voto', parameters: { url: por } }] })
  it('encuentra a quien llama por la DIRECCIÓN aunque no mencione el id (lo que antes pasaba de largo)', () => {
    const otro = llamador(`https://n8n/webhook/${direcciones[0]}`)
    expect(referenciasA([VOTO, otro], FLUJO_VOTO)).toEqual([])
    expect(referenciasA([VOTO, otro], FLUJO_VOTO, { propio: VOTO })).toEqual([{ flujo: 'X', nombre: 'otro', nodo: 'Llamar al voto', por: 'direccion' }])
  })
  it('y a quien lo llama por el ID (sub-flujo), diciendo por qué lo encontró', () => {
    expect(referenciasA([VOTO, llamador(FLUJO_VOTO)], FLUJO_VOTO, { propio: VOTO })).toEqual([{ flujo: 'X', nombre: 'otro', nodo: 'Llamar al voto', por: 'id' }])
  })
  it('un flujo ajeno que no lo nombra no cuenta; el propio flujo no se cuenta aunque se nombre', () => {
    expect(referenciasA([VOTO, llamador('https://n8n/webhook/zero-risk/otra-cosa')], FLUJO_VOTO, { propio: VOTO })).toEqual([])
  })
  it('las ejecuciones de la ventana que nadie reconoció se listan; las viejas y las reconocidas no', () => {
    const ahora = '2026-10-14T20:00:00Z'
    const ej = [{ id: 1, status: 'error', startedAt: '2026-10-08T12:00:00Z' }, { id: 2, status: 'success', startedAt: '2026-10-13T12:00:00Z' }, { id: 3, status: 'error', startedAt: '2026-09-01T00:00:00Z' }]
    expect(ejecucionesRecientes(ej, { ahora }).map((e: Json) => e.id)).toEqual(['1', '2'])
    expect(ejecucionesRecientes(ej, { ahora, vistas: ['1'] }).map((e: Json) => e.id)).toEqual(['2'])
    expect(ejecucionesRecientes(ej, { ahora, dias: 3 }).map((e: Json) => e.id)).toEqual(['2'])
    expect(ejecucionesRecientes(ej, { ahora, vistas: ['1', '2'] })).toEqual([])
    expect(ejecucionesRecientes(undefined as never, { ahora })).toEqual([])
  })
})

// ═════════════════════════════════════════════ R2 + R3 · el guion con el mundo de mentira
const POLITICAS = [
  ...['ad_creative', 'copy', 'email', 'landing'].map((t) => ({ artifact_type: t, artifact_class: 'contenido', is_active: true })),
  ...['brand_book', 'competitive', 'icp'].map((t) => ({ artifact_type: t, artifact_class: 'cimiento', is_active: true })),
].sort((a, b) => a.artifact_type.localeCompare(b.artifact_type))
const ESC = [{ item_id: 'e1', approval_type: 'editor_escalation', status: 'pending' }, { item_id: 'r1', approval_type: 'ruflo_decision', status: 'pending' }]

function mundo(o: Json = {}) {
  const escrituras: Array<{ que: string; a?: any }> = []
  const archivos: Record<string, string> = { ...(o.archivos ?? {}) }
  const vivos: Record<string, Json> = { [FLUJO_OFICINA]: JSON.parse(JSON.stringify(o.oficina ?? OFICINA)), [FLUJO_VOTO]: JSON.parse(JSON.stringify(o.voto ?? VOTO)), ...(o.otros ?? {}) }
  const tablas: Record<string, Json[]> = { jefatura_grading_policies: JSON.parse(JSON.stringify(o.politicas ?? POLITICAS)), hitl_pending_approvals: JSON.parse(JSON.stringify(o.escalaciones ?? ESC)) }
  const T = {
    escrituras, archivos, vivos, tablas,
    ahora: () => '2026-10-14T20:00:00Z',
    enVuelo: async () => o.enVuelo ?? 0,
    flujo: async (id: string) => JSON.parse(JSON.stringify(vivos[id])),
    flujos: async () => Object.keys(vivos).map((id) => ({ id })),
    ejecuciones: async () => o.ejecuciones ?? [],
    respaldarFlujo: async (id: string, ruta: string) => { escrituras.push({ que: 'respaldar', a: id }); archivos[ruta] = JSON.stringify(vivos[id]); return { ok: o.respaldoFalla !== true, texto: 'respaldado ' + id } },
    diferencia: async (id: string, ruta: string) => ({ iguales: o.diferente?.includes(id) ? false : JSON.stringify(JSON.parse(archivos[ruta] ?? 'null')) === JSON.stringify(vivos[id]), texto: 'dif' }),
    putFlujo: async (id: string, cuerpo: Json) => { escrituras.push({ que: 'putFlujo', a: id }); vivos[id] = { ...vivos[id], ...cuerpo } },
    desactivar: async (id: string) => { escrituras.push({ que: 'desactivar', a: id }); vivos[id].active = false },
    rest: async (tabla: string, q: string, init: Json = {}) => {
      if (init.method === 'PATCH') {
        escrituras.push({ que: 'PATCH ' + tabla, a: q })
        const cuerpo = JSON.parse(init.body)
        const filas = tablas[tabla].filter((f) => (tabla === 'jefatura_grading_policies' ? ['ad_creative', 'copy', 'email', 'landing'].includes(f.artifact_type) && f.artifact_class === 'contenido' : f.approval_type === 'editor_escalation' && ['pending', 'notified', 'escalated'].includes(f.status)))
        for (const f of filas) Object.assign(f, cuerpo)
        return JSON.parse(JSON.stringify(filas))
      }
      return JSON.parse(JSON.stringify(tabla === 'hitl_pending_approvals' && /status=in/.test(q) ? tablas[tabla].filter((f) => f.approval_type === 'editor_escalation' && ['pending', 'notified', 'escalated'].includes(f.status)) : tablas[tabla]))
    },
    sha: (s: string) => 'sha:' + s.length,
    fs: { existe: (p: string) => p in archivos, leer: (p: string) => archivos[p], escribir: (p: string, s: string) => { escrituras.push({ que: 'escribir', a: p }); archivos[p] = s }, mkdir: (p: string) => { escrituras.push({ que: 'mkdir', a: p }) } },
  }
  return T
}
const CARPETA = 'C:/respaldos/j8b'
const ya = (T: ReturnType<typeof mundo>) => { // el respaldo ya hecho (como tras «respaldar --aplicar»)
  T.archivos[`${CARPETA}/respaldo-flujo-${FLUJO_OFICINA}.json`] = JSON.stringify(T.vivos[FLUJO_OFICINA]); T.archivos[`${CARPETA}/respaldo-flujo-${FLUJO_VOTO}.json`] = JSON.stringify(T.vivos[FLUJO_VOTO])
  T.archivos[`${CARPETA}/respaldo-politicas.json`] = JSON.stringify(T.tablas.jefatura_grading_policies, null, 2); T.archivos[`${CARPETA}/respaldo-editor-escalation.json`] = JSON.stringify(T.tablas.hitl_pending_approvals.filter((f) => f.approval_type === 'editor_escalation'))
  T.escrituras.length = 0
  return T
}
const conCabecera = (T: ReturnType<typeof mundo>) => { T.vivos[FLUJO_OFICINA] = paraLaOficina(T.vivos[FLUJO_OFICINA]) as Json; T.archivos[`${CARPETA}/respaldo-flujo-${FLUJO_OFICINA}.json`] = JSON.stringify(T.vivos[FLUJO_OFICINA]); return T }
const sinEscribir = (T: ReturnType<typeof mundo>) => expect(T.escrituras).toEqual([])
const CONF = ['--confirmo-j8a-probada', '2026-10-14']

describe('R2 · el guion SIN --aplicar no escribe NADA (ni en n8n, ni en la base, ni en disco)', () => {
  for (const orden of [['paso', 'cabecera'], ['paso', 'voto'], ['paso', 'contenido'], ['paso', 'pendientes']]) {
    it(`${orden.join(' ')} · solo imprime (con la cabecera ya puesta, para llegar hasta el final de cada guarda)`, async () => {
      const T = conCabecera(ya(mundo())); T.escrituras.length = 0
      const r = await ejecutar([...orden, '--carpeta', CARPETA], T)
      if (orden[1] === 'cabecera') { expect(r.codigo).toBe(3); expect(r.lineas.join(' ')).toContain('ya lleva la cabecera') } // la oficina ya la trae: no se pone dos veces
      else expect(r.codigo).toBe(0)
      sinEscribir(T)
      if (orden[1] !== 'cabecera') expect(r.lineas.join('\n')).toContain('(solo se imprime)')
    })
  }
  it('respaldar sin --aplicar no crea carpeta ni archivos', async () => { const T = mundo(); const r = await ejecutar(['respaldar', '--carpeta', CARPETA], T); expect(r.codigo).toBe(0); sinEscribir(T) })
  it('cabecera sin --aplicar sobre la oficina SIN cabecera: imprime el PUT que haría y no lo hace', async () => {
    const T = ya(mundo()); const r = await ejecutar(['paso', 'cabecera', '--carpeta', CARPETA], T)
    expect(r.codigo).toBe(0); expect(r.lineas.join('\n')).toContain('(solo se imprime) PUT del flujo'); sinEscribir(T)
  })
  it('`plan` y `comprobar` no escriben; una orden desconocida sale con 2', async () => {
    const T = ya(mundo()); expect((await ejecutar(['plan'], T)).codigo).toBe(0); expect((await ejecutar(['comprobar', '--carpeta', CARPETA], T)).codigo).toBe(0); sinEscribir(T)
    expect((await ejecutar(['inventada'], T)).codigo).toBe(2); expect((await ejecutar(['paso', 'otro', '--carpeta', CARPETA], T)).codigo).toBe(2)
  })
})

describe('R2 · las guardas se detienen (y no escriben) cuando algo no está como debe', () => {
  it('con corridas en n8n: se detiene con 3 en todos los pasos', async () => {
    for (const p of ['cabecera', 'voto', 'contenido', 'pendientes']) { const T = ya(mundo({ enVuelo: 2 })); const r = await ejecutar(['paso', p, '--carpeta', CARPETA, '--aplicar', ...CONF], T); expect(r.codigo).toBe(3); expect(r.lineas.join(' ')).toMatch(/2 ejecución/); sinEscribir(T) }
  })
  it('sin carpeta o dentro de la bóveda: 2 y no escribe', async () => {
    const T = mundo(); expect((await ejecutar(['paso', 'cabecera', '--aplicar'], T)).codigo).toBe(2)
    expect((await ejecutar(['respaldar', '--aplicar', '--carpeta', 'C:/x/zr-vault/raw/j8b'], T)).codigo).toBe(2); sinEscribir(T)
  })
  it('el flujo vivo distinto de su respaldo: 4 y no pisa (oficina y voto)', async () => {
    const T = ya(mundo({ diferente: [FLUJO_OFICINA] })); const r = await ejecutar(['paso', 'cabecera', '--carpeta', CARPETA, '--aplicar', ...CONF], T); expect(r.codigo).toBe(4); sinEscribir(T)
    const V = conCabecera(ya(mundo({ diferente: [FLUJO_VOTO] }))); V.escrituras.length = 0
    expect((await ejecutar(['paso', 'voto', '--carpeta', CARPETA, '--aplicar'], V)).codigo).toBe(4); sinEscribir(V)
  })
  it('la tabla de políticas distinta de su respaldo: 4 y no apaga nada', async () => {
    const T = conCabecera(ya(mundo())); T.tablas.jefatura_grading_policies[0].is_active = false; T.escrituras.length = 0
    expect((await ejecutar(['paso', 'contenido', '--carpeta', CARPETA, '--aplicar'], T)).codigo).toBe(4); sinEscribir(T)
  })
  it('pendientes sin el respaldo de las editor_escalation: 4 y no cierra nada', async () => {
    const T = conCabecera(ya(mundo())); delete T.archivos[`${CARPETA}/respaldo-editor-escalation.json`]
    expect((await ejecutar(['paso', 'pendientes', '--carpeta', CARPETA, '--aplicar'], T)).codigo).toBe(4); sinEscribir(T)
  })
  it('respaldar: si el respaldo de un flujo falla, sale con 5 y no sigue escribiendo', async () => {
    const T = mundo({ respaldoFalla: true }); const r = await ejecutar(['respaldar', '--carpeta', CARPETA, '--aplicar'], T)
    expect(r.codigo).toBe(5); expect(T.escrituras.filter((e) => e.que === 'escribir')).toEqual([])
  })
})

describe('R1 en el guion · el voto no se desactiva con llamadores o ejecuciones sin reconocer', () => {
  const dir = direccionesDe(VOTO)[0]
  it('con un llamador por ID: 6 y no desactiva', async () => {
    const T = conCabecera(ya(mundo({ otros: { LL: { id: 'LL', name: 'usa el voto', nodes: [{ name: 'x', parameters: { workflowId: FLUJO_VOTO } }] } } }))); T.escrituras.length = 0
    const r = await ejecutar(['paso', 'voto', '--carpeta', CARPETA, '--aplicar'], T); expect(r.codigo).toBe(6); expect(r.lineas.join(' ')).toContain('LL'); sinEscribir(T)
  })
  it('con un llamador por DIRECCIÓN (sin el id): 6 y no desactiva', async () => {
    const T = conCabecera(ya(mundo({ otros: { LL: { id: 'LL', name: 'llama por http', nodes: [{ name: 'x', parameters: { url: `https://n8n/webhook/${dir}` } }] } } }))); T.escrituras.length = 0
    const r = await ejecutar(['paso', 'voto', '--carpeta', CARPETA, '--aplicar'], T); expect(r.codigo).toBe(6); expect(r.lineas.join(' ')).toContain('direccion'); sinEscribir(T)
  })
  it('con ejecuciones recientes sin reconocer: 6; reconocidas por quien aplica: sigue', async () => {
    const ej = [{ id: 701, status: 'error', startedAt: '2026-10-13T10:00:00Z' }]
    const T = conCabecera(ya(mundo({ ejecuciones: ej }))); T.escrituras.length = 0
    const r = await ejecutar(['paso', 'voto', '--carpeta', CARPETA, '--aplicar'], T); expect(r.codigo).toBe(6); expect(r.lineas.join(' ')).toContain('--ejecuciones-vistas 701'); sinEscribir(T)
    const ok = await ejecutar(['paso', 'voto', '--carpeta', CARPETA, '--aplicar', '--ejecuciones-vistas', '701'], T)
    expect(ok.codigo).toBe(0); expect(T.escrituras).toEqual([{ que: 'desactivar', a: FLUJO_VOTO }]); expect(T.vivos[FLUJO_VOTO].active).toBe(false)
  })
  it('sin llamadores y sin ejecuciones: desactiva SOLO el voto (no toca ningún otro flujo)', async () => {
    const T = conCabecera(ya(mundo({ otros: { OT: { id: 'OT', name: 'otro', nodes: [{ name: 'x', parameters: { url: 'https://n8n/webhook/zero-risk/otra' } }], active: true } } }))); T.escrituras.length = 0
    const r = await ejecutar(['paso', 'voto', '--carpeta', CARPETA, '--aplicar'], T)
    expect(r.codigo).toBe(0); expect(T.escrituras).toEqual([{ que: 'desactivar', a: FLUJO_VOTO }]); expect(T.vivos.OT.active).toBe(true)
  })
})

describe('R3 · el orden firmado lo impone el guion: jefatura probada en piezas → cabecera → voto y filas', () => {
  it('la cabecera con --aplicar exige la fecha de la certificación de J8a probada (y que sea una fecha)', async () => {
    for (const conf of [[], ['--confirmo-j8a-probada'], ['--confirmo-j8a-probada', 'ayer'], ['--confirmo-j8a-probada', '2026-13-1']]) {
      const T = ya(mundo()); const r = await ejecutar(['paso', 'cabecera', '--carpeta', CARPETA, '--aplicar', ...conf], T)
      expect(r.codigo).toBe(3); expect(r.lineas.join(' ')).toContain('--confirmo-j8a-probada'); sinEscribir(T)
    }
  })
  it('con la confirmación pone la cabecera y la rama esperar_jefatura, escribe SOLO el flujo de la oficina y lo deja como estaba (activo o no)', async () => {
    const T = ya(mundo()); const activo = T.vivos[FLUJO_OFICINA].active
    const r = await ejecutar(['paso', 'cabecera', '--carpeta', CARPETA, '--aplicar', ...CONF], T)
    expect(r.codigo).toBe(0); expect(T.escrituras).toEqual([{ que: 'putFlujo', a: FLUJO_OFICINA }])
    expect(tieneLaCabecera(T.vivos[FLUJO_OFICINA])).toBe(true); expect(T.vivos[FLUJO_OFICINA].active).toBe(activo)
    expect(String(nodo(T.vivos[FLUJO_OFICINA], NODO_Y_AHORA).parameters.jsCode)).toContain('esperar_jefatura')
    expect(JSON.stringify(nodo(T.vivos[FLUJO_OFICINA], NODO_AGENTE).parameters.headerParameters.parameters.map((h: Json) => h.name))).toContain('x-skip-editor-middleware')
  })
  for (const p of ['voto', 'contenido', 'pendientes']) {
    it(`${p}: sin la cabecera ya puesta en la oficina viva se detiene (3) y no escribe, aunque todo lo demás esté bien`, async () => {
      const T = ya(mundo()); const r = await ejecutar(['paso', p, '--carpeta', CARPETA, '--aplicar'], T)
      expect(r.codigo).toBe(3); expect(r.lineas.join(' ')).toContain('orden firmado'); sinEscribir(T)
    })
  }
  it('contenido y pendientes, con la cabecera puesta, apagan SOLO las 4 filas / cierran SOLO las editor_escalation y dejan el cimiento y las ajenas intactos', async () => {
    const T = conCabecera(ya(mundo())); T.escrituras.length = 0
    expect((await ejecutar(['paso', 'contenido', '--carpeta', CARPETA, '--aplicar'], T)).codigo).toBe(0)
    expect(T.tablas.jefatura_grading_policies.filter((f) => f.artifact_class === 'contenido').every((f) => f.is_active === false)).toBe(true)
    expect(T.tablas.jefatura_grading_policies.filter((f) => f.artifact_class === 'cimiento').every((f) => f.is_active === true)).toBe(true)
    expect((await ejecutar(['paso', 'pendientes', '--carpeta', CARPETA, '--aplicar'], T)).codigo).toBe(0)
    expect(T.tablas.hitl_pending_approvals.find((f) => f.item_id === 'e1')).toMatchObject({ status: 'expired', resolver: 'editor apagado, cubierto por jefatura' })
    expect(T.tablas.hitl_pending_approvals.find((f) => f.item_id === 'r1')!.status).toBe('pending')
  })
  it('el respaldo --aplicar escribe SOLO los 4 archivos de respaldo en la carpeta de fuera de la bóveda', async () => {
    const T = mundo(); const r = await ejecutar(['respaldar', '--carpeta', CARPETA, '--aplicar'], T)
    expect(r.codigo).toBe(0)
    expect(T.escrituras.filter((e) => e.que === 'escribir').map((e) => e.a).sort()).toEqual([`${CARPETA}/respaldo-editor-escalation.json`, `${CARPETA}/respaldo-politicas.json`])
    expect(Object.keys(T.archivos).sort()).toEqual([`${CARPETA}/respaldo-editor-escalation.json`, `${CARPETA}/respaldo-flujo-${FLUJO_OFICINA}.json`, `${CARPETA}/respaldo-flujo-${FLUJO_VOTO}.json`, `${CARPETA}/respaldo-politicas.json`])
  })
})

describe('R2 · la CLI real', () => {
  const env = { ...process.env, NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:9', SUPABASE_SERVICE_ROLE_KEY: 'x', N8N_API_KEY: 'x', N8N_BASE_URL: 'http://127.0.0.1:9' }
  it('`plan` sin variables ni red; bóveda y falta de carpeta salen con 2 y dicen por qué; sin variables de entorno sale con 2', () => {
    expect(spawnSync(process.execPath, ['scripts/ops/jefatura-j8b.mjs', 'plan'], { encoding: 'utf8', env: {} as never }).status).toBe(0)
    const b = spawnSync(process.execPath, ['scripts/ops/jefatura-j8b.mjs', 'respaldar', '--aplicar', '--carpeta', 'C:/x/zr-vault/raw/j8b'], { encoding: 'utf8', env })
    expect(b.status).toBe(2); expect(b.stderr).toContain('FUERA')
    const s = spawnSync(process.execPath, ['scripts/ops/jefatura-j8b.mjs', 'paso', 'cabecera'], { encoding: 'utf8', env })
    expect(s.status).toBe(2); expect(s.stderr).toContain('--carpeta')
    const sinVars = spawnSync(process.execPath, ['scripts/ops/jefatura-j8b.mjs', 'comprobar', '--carpeta', 'C:/x'], { encoding: 'utf8', env: { PATH: process.env.PATH ?? '' } as never })
    expect(sinVars.status).toBe(2); expect(sinVars.stderr).toContain('faltan variables')
  })
})

// ═════════════════════════════════════════════ reparos menores de CC#3 (14-oct) · entradas de la orden, estrictas
describe('reparo menor 1 · `--dias` solo un entero ≥ 7', () => {
  it('leerDias: sin valor = 7; acepta 7, 8, 30; rechaza todo lo demás con un mensaje que dice qué se esperaba', () => {
    expect(leerDias(null)).toEqual({ valor: 7 }); expect(leerDias(undefined)).toEqual({ valor: 7 })
    for (const ok of ['7', '8', '30', '007']) expect(leerDias(ok)).toEqual({ valor: Number(ok) })
    for (const mal of ['6', '0', '-3', '7.5', '1e1', 'siete', '', ' 7', '7 ', 'NaN', 'Infinity', '99999999999999999999', '+8', '0x10']) {
      const r: Json = leerDias(mal); expect(r.valor, mal).toBeUndefined(); expect(r.error, mal).toContain('entero de 7 o más')
    }
  })
  for (const mal of ['6', '0', '-3', '7.5', 'abc', '', '1e1']) {
    it(`paso voto con --dias «${mal}»: se rechaza con código 2, sin leer ni escribir nada del mundo`, async () => {
      const T = conCabecera(ya(mundo())); T.escrituras.length = 0
      const r = await ejecutar(['paso', 'voto', '--carpeta', CARPETA, '--aplicar', '--dias', mal], T)
      expect(r.codigo).toBe(2); expect(r.lineas.join(' ')).toContain('--dias'); expect(T.escrituras).toEqual([]); expect(T.vivos[FLUJO_VOTO].active).toBe(true)
    })
  }
  it('`--dias` sin valor al final de la línea también se rechaza (no cae en el 7 por omisión)', async () => {
    const T = conCabecera(ya(mundo())); T.escrituras.length = 0
    const r = await ejecutar(['paso', 'voto', '--carpeta', CARPETA, '--aplicar', '--dias'], T)
    expect(r.codigo).toBe(2); expect(T.escrituras).toEqual([])
  })
  it('con --dias 14 el paso corre y la ventana de 14 días es la que se usa (una ejecución de hace 10 días se ve)', async () => {
    const T = conCabecera(ya(mundo({ ejecuciones: [{ id: '801', status: 'success', startedAt: '2026-10-04T20:00:00Z' }] }))); T.escrituras.length = 0
    const corto = await ejecutar(['paso', 'voto', '--carpeta', CARPETA, '--aplicar', '--dias', '7'], T)
    expect(corto.codigo).toBe(0); expect(T.escrituras).toEqual([{ que: 'desactivar', a: FLUJO_VOTO }])
    const T2 = conCabecera(ya(mundo({ ejecuciones: [{ id: '801', status: 'success', startedAt: '2026-10-04T20:00:00Z' }] }))); T2.escrituras.length = 0
    const largo = await ejecutar(['paso', 'voto', '--carpeta', CARPETA, '--aplicar', '--dias', '14'], T2)
    expect(largo.codigo).toBe(6); expect(T2.escrituras).toEqual([])
  })
})

describe('reparo menor 2 · `--confirmo-j8a-probada` exige fecha real, no futura y no anterior al 2026-10-14', () => {
  const AHORA = '2026-10-14T20:00:00Z'
  it('leerFechaConfirmada: acepta hoy; rechaza ausente, mal formada, imposible, anterior y futura', () => {
    expect(leerFechaConfirmada('2026-10-14', AHORA)).toEqual({ valor: '2026-10-14' })
    expect(leerFechaConfirmada('2026-10-15', '2026-10-15T01:00:00Z')).toEqual({ valor: '2026-10-15' })
    for (const mal of [undefined, null, '', 'ayer', '2026-10-1', '14-10-2026', '2026-13-01', '2026-02-30', '2026-10-32', '2026-00-10', '2026-10-14T00:00:00Z']) {
      const r: Json = leerFechaConfirmada(mal, AHORA); expect(r.valor, String(mal)).toBeUndefined(); expect(r.error, String(mal)).toContain('--confirmo-j8a-probada')
    }
    expect((leerFechaConfirmada('2026-10-13', AHORA) as Json).error).toContain('anterior')
    expect((leerFechaConfirmada('2025-01-01', AHORA) as Json).error).toContain('anterior')
    expect((leerFechaConfirmada('2026-10-15', AHORA) as Json).error).toContain('futura')
    expect((leerFechaConfirmada('2099-01-01', AHORA) as Json).error).toContain('futura')
  })
  for (const [que, fecha, palabra] of [['anterior (13-oct)', '2026-10-13', 'anterior'], ['de otro año', '2025-10-14', 'anterior'], ['futura (15-oct)', '2026-10-15', 'futura'], ['imposible (30-feb)', '2026-02-30', 'fecha real'], ['mes 13', '2026-13-01', 'fecha real']]) {
    it(`la cabecera con --aplicar y una fecha ${que}: se detiene (código 3), no escribe y dice por qué`, async () => {
      const T = ya(mundo()); const r = await ejecutar(['paso', 'cabecera', '--carpeta', CARPETA, '--aplicar', '--confirmo-j8a-probada', fecha], T)
      expect(r.codigo).toBe(3); expect(r.lineas.join(' ')).toContain(palabra); sinEscribir(T)
    })
  }
  it('sin --aplicar (solo imprime) no pide la fecha: el ensayo no escribe', async () => {
    const T = ya(mundo()); const r = await ejecutar(['paso', 'cabecera', '--carpeta', CARPETA], T)
    expect(r.codigo).toBe(0); sinEscribir(T)
  })
})
