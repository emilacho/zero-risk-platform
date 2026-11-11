/**
 * Avisos sin Slack · entrega A + B (CC1 · certifican CC7 código y CC6 permisos).
 * Dos clientes REALES de rubros distintos (restaurante y B2B industrial, ids de `clients`) y un aviso del sistema sin cliente.
 * El almacén falso reproduce la regla de la función de la base (una abierta por clave; repetir cuenta; vencida = se cierra y se abre otra);
 * la función REAL se ejerce aparte contra un Postgres en memoria (evidencia en el papel de la entrega).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, it, expect } from 'vitest'
import { avisar, cerrar, cerrarFamilia, esContestada, notaDeContestada, errorLimpio, validarEntrada, EntradaInvalida, ErrorAlGuardar, type AlmacenDeAvisos, type Dependencias, type EntradaDeAviso, type Guardado, type PublicarEnSlack, type EstadoSlack, type Tipo } from '../nucleo'
import { almacenDeAvisos, canalesDesde, slackEncendido, slackPorBot } from '../adaptadores'

const RESTAURANTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const B2B = 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5'

interface FilaFalsa { id: string; clave: string; tipo: Tipo; detalle: string; repeticiones: number; ultima_en: number; cerrado_en: number | null; nota: string | null; slack_ts: string | null; slack_estado: EstadoSlack; slack_error: string | null; client_id: string | null }
function almacenFalso(o: { fallarGuardar?: boolean; fallarAnotar?: boolean; fallarContestada?: boolean } = {}) {
  const filas: FilaFalsa[] = []
  let n = 0, ahora = 1_000_000_000_000
  const almacen: AlmacenDeAvisos = {
    async avisar(e: EntradaDeAviso): Promise<Guardado> {
      if (o.fallarGuardar) throw new Error('connection reset')
      let ab = filas.find((f) => f.clave === e.clave && f.cerrado_en === null)
      let vencida = false
      if (ab && ahora - ab.ultima_en >= 24 * 3_600_000) { ab.cerrado_en = ahora; ab.nota = 'sin_actividad_24h'; ab = undefined; vencida = true }
      if (ab) {
        const antes = ab.detalle
        ab.repeticiones++; ab.detalle = e.detalle; ab.ultima_en = ahora
        return { aviso_id: ab.id, accion: antes === e.detalle ? 'repetida' : 'cambio', slack_ts: ab.slack_ts, slack_estado: ab.slack_estado }
      }
      const f: FilaFalsa = { id: `a${++n}`, clave: e.clave, tipo: e.tipo, detalle: e.detalle, repeticiones: 0, ultima_en: ahora, cerrado_en: null, nota: null, slack_ts: null, slack_estado: 'pendiente', slack_error: null, client_id: e.client_id ?? null }
      filas.push(f)
      return { aviso_id: f.id, accion: vencida ? 'reabrio' : 'abrio', slack_ts: null, slack_estado: 'pendiente' }
    },
    async cerrar(clave, nota) {
      const f = filas.find((x) => x.clave === clave && x.cerrado_en === null)
      if (!f) return null
      f.cerrado_en = ahora; f.nota = nota
      return { aviso_id: f.id, slack_ts: f.slack_ts, tipo: f.tipo }
    },
    async contestada(clave) {
      if (o.fallarContestada) throw new Error('lectura caída')
      const u = filas.filter((x) => x.clave === clave).at(-1)
      return u && u.cerrado_en !== null && esContestada(u.nota) ? { aviso_id: u.id, slack_ts: u.slack_ts, slack_estado: u.slack_estado } : null
    },
    async cerrarFamilia(prefijo, salvo, nota) {
      const fs = filas.filter((x) => x.clave.startsWith(prefijo) && x.clave !== salvo && x.cerrado_en === null)
      for (const f of fs) { f.cerrado_en = ahora; f.nota = nota }
      return fs.map((f) => ({ aviso_id: f.id, slack_ts: f.slack_ts, tipo: f.tipo }))
    },
    async anotarSlack(id, estado, ts, error) {
      if (o.fallarAnotar) throw new Error('timeout')
      const f = filas.find((x) => x.id === id)!
      f.slack_estado = estado; f.slack_ts = ts; f.slack_error = error
    },
  }
  return { almacen, filas, pasar: (h: number) => { ahora += h * 3_600_000 } }
}
function slackFalso(respuestas: ('ok' | 'falla')[] = []) {
  const llamadas: { canal: string; texto: string; hilo?: string }[] = []
  let i = 0
  const slack: PublicarEnSlack = async (canal, texto, hilo) => {
    llamadas.push({ canal, texto, hilo })
    return (respuestas[i++] ?? 'ok') === 'ok' ? { ok: true, ts: `ts-${llamadas.length}` } : { ok: false, error: 'Slack respondió 500 https://hooks.slack.com/services/T000/B000/abcdefabcdefabcdefabcdefabcdefab xoxb-123-456-secreto' }
  }
  return { slack, llamadas }
}
const deps = (a: AlmacenDeAvisos, s: PublicarEnSlack, encendido = true): Dependencias => ({ almacen: a, slack: s, slackEncendido: encendido, canales: { alarma: 'C-ALERTAS', pieza: 'C-OFICINA', pregunta: 'C-BUZON' } })
const aviso = (clave: string, detalle: string, extra: Partial<EntradaDeAviso> = {}) => ({ clave, tipo: 'alarma', origen: 'vigía de prueba', origen_tipo: 'plataforma', titulo: 'Algo se detuvo', detalle, ...extra })

describe('avisar · guarda primero, Slack después', () => {
  for (const [rubro, cliente] of [['restaurante', RESTAURANTE], ['B2B industrial', B2B], ['sistema (sin cliente)', null]] as const) {
    it(`${rubro}: abre, la misma repetición solo cuenta (sin otro mensaje), un detalle distinto va al hilo`, async () => {
      const { almacen, filas } = almacenFalso(); const { slack, llamadas } = slackFalso()
      const d = deps(almacen, slack)
      const r1 = await avisar(d, aviso(`prueba:${rubro}`, 'detalle 1', { client_id: cliente }))
      expect(r1).toMatchObject({ accion: 'abrio', slack: 'entregado' })
      const r2 = await avisar(d, aviso(`prueba:${rubro}`, 'detalle 1', { client_id: cliente }))
      expect(r2.accion).toBe('repetida')
      expect(llamadas).toHaveLength(1)
      const r3 = await avisar(d, aviso(`prueba:${rubro}`, 'detalle 2', { client_id: cliente }))
      expect(r3.accion).toBe('cambio')
      expect(llamadas).toHaveLength(2)
      expect(llamadas[1]).toMatchObject({ canal: 'C-ALERTAS', hilo: 'ts-1' })
      expect(filas).toHaveLength(1)
      expect(filas[0]).toMatchObject({ repeticiones: 2, slack_ts: 'ts-1', slack_estado: 'entregado', client_id: cliente })
    })
  }

  it('si GUARDAR falla: ErrorAlGuardar y 0 llamadas a Slack (nunca avisa de su propio fallo por la misma vía)', async () => {
    const { almacen } = almacenFalso({ fallarGuardar: true }); const { slack, llamadas } = slackFalso()
    await expect(avisar(deps(almacen, slack), aviso('prueba:x', 'd'))).rejects.toBeInstanceOf(ErrorAlGuardar)
    expect(llamadas).toHaveLength(0)
  })

  it('si Slack falla: el aviso queda guardado con «fallo» y el error LIMPIO (sin dirección ni llave); no lanza', async () => {
    const { almacen, filas } = almacenFalso(); const { slack } = slackFalso(['falla'])
    const r = await avisar(deps(almacen, slack), aviso('prueba:x', 'd', { client_id: B2B }))
    expect(r).toMatchObject({ accion: 'abrio', slack: 'fallo', slack_anotado: true })
    expect(filas[0].slack_estado).toBe('fallo')
    expect(filas[0].slack_error).not.toMatch(/hooks\.slack|xoxb|abcdefabcdef/)
    expect(filas[0].slack_error).toMatch(/\[dirección\]/)
  })

  it('primer mensaje fallido: la repetición NO responde en un hilo que no existe, manda uno nuevo y anota su ts (punto 4 CC7)', async () => {
    const { almacen, filas } = almacenFalso(); const { slack, llamadas } = slackFalso(['falla', 'ok'])
    const d = deps(almacen, slack)
    await avisar(d, aviso('prueba:x', 'd', { client_id: RESTAURANTE }))
    const r = await avisar(d, aviso('prueba:x', 'd', { client_id: RESTAURANTE }))
    expect(r.slack).toBe('entregado')
    expect(llamadas[1].hilo).toBeUndefined()
    expect(filas[0]).toMatchObject({ slack_ts: 'ts-2', slack_estado: 'entregado', repeticiones: 1 })
  })

  it('interruptor APAGADO: se guarda, se anota «apagado» y hay 0 llamadas a Slack', async () => {
    const { almacen, filas } = almacenFalso(); const { slack, llamadas } = slackFalso()
    const d = deps(almacen, slack, false)
    await avisar(d, aviso('prueba:x', 'd1', { client_id: RESTAURANTE }))
    await avisar(d, aviso('prueba:x', 'd2', { client_id: RESTAURANTE }))
    await cerrar(d, 'prueba:x', 'resuelto')
    expect(llamadas).toHaveLength(0)
    expect(filas[0]).toMatchObject({ slack_estado: 'apagado', repeticiones: 1 })
    expect(filas[0].cerrado_en).not.toBeNull()
  })

  it('vencida (24 h sin actividad): la vieja queda cerrada como historial y se abre OTRA, con mensaje nuevo (hilo nuevo)', async () => {
    const { almacen, filas, pasar } = almacenFalso(); const { slack, llamadas } = slackFalso()
    const d = deps(almacen, slack)
    await avisar(d, aviso('prueba:x', 'd', { client_id: B2B }))
    pasar(25)
    const r = await avisar(d, aviso('prueba:x', 'd', { client_id: B2B }))
    expect(r.accion).toBe('reabrio')
    expect(filas).toHaveLength(2)
    expect(filas[0]).toMatchObject({ nota: 'sin_actividad_24h' })
    expect(llamadas[1].hilo).toBeUndefined()
    expect(filas[1].slack_ts).toBe('ts-2')
  })

  it('si anotar Slack falla, el aviso sigue guardado y la llamada no lanza (slack_anotado: false)', async () => {
    const { almacen, filas } = almacenFalso({ fallarAnotar: true }); const { slack } = slackFalso()
    const r = await avisar(deps(almacen, slack), aviso('prueba:x', 'd'))
    expect(r).toMatchObject({ slack: 'entregado', slack_anotado: false })
    expect(filas).toHaveLength(1)
  })

  it('cada tipo va a SU canal (menos ruido) y un tipo sin canal anota «fallo» sin llamar a Slack', async () => {
    const { almacen, filas } = almacenFalso(); const { slack, llamadas } = slackFalso()
    await avisar(deps(almacen, slack), aviso('prueba:p', 'd', { tipo: 'pieza' }))
    await avisar(deps(almacen, slack), aviso('prueba:q', 'd', { tipo: 'pregunta' }))
    expect(llamadas.map((l) => l.canal)).toEqual(['C-OFICINA', 'C-BUZON'])
    const sinCanal: Dependencias = { ...deps(almacen, slack), canales: { alarma: 'C-ALERTAS' } }
    const r = await avisar(sinCanal, aviso('prueba:q2', 'd', { tipo: 'pregunta' }))
    expect(r.slack).toBe('fallo')
    expect(llamadas).toHaveLength(2)
    expect(filas.at(-1)!.slack_error).toMatch(/sin canal/)
  })

  it('cerrar: responde en el hilo del incidente; sin abierta no hace nada', async () => {
    const { almacen } = almacenFalso(); const { slack, llamadas } = slackFalso()
    const d = deps(almacen, slack)
    await avisar(d, aviso('prueba:x', 'd'))
    expect(await cerrar(d, 'prueba:x', 'ya volvió')).toEqual({ cerrado: true, slack: 'entregado' })
    expect(llamadas[1]).toMatchObject({ hilo: 'ts-1' })
    expect(await cerrar(d, 'prueba:x', 'otra')).toEqual({ cerrado: false, slack: 'sin_hilo' })
    // una PIEZA se cierra en el canal de piezas, aunque quien cierra no diga el tipo (nota CC7)
    await avisar(d, aviso('prueba:pieza', 'd', { tipo: 'pieza', client_id: RESTAURANTE }))
    await cerrar(d, 'prueba:pieza', 'aprobada')
    expect(llamadas.at(-1)).toMatchObject({ canal: 'C-OFICINA', hilo: 'ts-3' })
  })
})

describe('entrada', () => {
  it('rechaza lo que la tabla rechazaría, antes de la base', () => {
    const base = aviso('prueba:x', 'd')
    expect(() => validarEntrada({ ...base, clave: 'ab' })).toThrow(EntradaInvalida)
    expect(() => validarEntrada({ ...base, tipo: 'reporte' })).toThrow(EntradaInvalida)
    expect(() => validarEntrada({ ...base, origen_tipo: 'otro' })).toThrow(EntradaInvalida)
    expect(() => validarEntrada({ ...base, titulo: 'x'.repeat(201) })).toThrow(EntradaInvalida)
    expect(() => validarEntrada({ ...base, detalle: 'x'.repeat(2001) })).toThrow(EntradaInvalida)
    expect(() => validarEntrada({ ...base, client_id: 'no-es-uuid' })).toThrow(EntradaInvalida)
    // n8n trae su firma completa (guardarraíl 4)
    expect(() => validarEntrada({ ...base, origen_tipo: 'n8n', workflow_id: 'w' })).toThrow(EntradaInvalida)
    expect(validarEntrada({ ...base, origen_tipo: 'n8n', workflow_id: 'w', workflow_execution_id: 'e' }).workflow_execution_id).toBe('e')
  })
  it('errorLimpio quita direcciones y llaves y recorta a 300', () => {
    expect(errorLimpio('x https://hooks.slack.com/services/a/b/c y xoxb-1-2-abc z')).toBe('x [dirección] y [llave] z')
    expect(errorLimpio('e '.repeat(500))).toHaveLength(300)
  })
})

describe('adaptadores', () => {
  it('el interruptor: encendido salvo AVISOS_A_SLACK=apagado', () => {
    expect(slackEncendido({})).toBe(true)
    expect(slackEncendido({ AVISOS_A_SLACK: 'encendido' })).toBe(true)
    expect(slackEncendido({ AVISOS_A_SLACK: ' Apagado ' })).toBe(false)
  })
  it('canales: alarma y pieza fijos, pregunta solo si está configurada; nada a #equipo', () => {
    expect(canalesDesde({})).toEqual({ alarma: 'C0B7XUUEBHA', pieza: 'C0C7XUKNCLS' })
    expect(canalesDesde({ FINANZAS_CANAL_PREGUNTAS: 'C-B' }).pregunta).toBe('C-B')
    expect(Object.values(canalesDesde({ FINANZAS_CANAL_PREGUNTAS: 'C-B' }))).not.toContain('C0B2QCDMV7Y')
  })
  it('almacén: llama a las funciones de la base con todos sus parámetros y un error se LANZA', async () => {
    const llamadas: unknown[] = []
    const db = { rpc: async (fn: string, args: Record<string, unknown>) => { llamadas.push([fn, args]); return fn === 'avisos_avisar' ? { data: [{ aviso_id: 'u', accion: 'abrio', slack_ts: null, slack_estado: 'pendiente' }], error: null } : { data: null, error: { message: 'boom' } } }, from: () => ({ update: () => ({ eq: async () => ({ error: { message: 'sin permiso' } }) }) }) }
    const a = almacenDeAvisos(db)
    expect(await a.avisar(validarEntrada(aviso('prueba:x', 'd', { client_id: B2B })))).toEqual({ aviso_id: 'u', accion: 'abrio', slack_ts: null, slack_estado: 'pendiente' })
    expect(Object.keys((llamadas[0] as [string, Record<string, unknown>])[1]).sort()).toEqual(['p_clave', 'p_client_id', 'p_detalle', 'p_origen', 'p_origen_tipo', 'p_tipo', 'p_titulo', 'p_workflow_execution_id', 'p_workflow_id'])
    await expect(a.cerrar('prueba:x', 'n')).rejects.toThrow(/boom/)
    const conError = almacenDeAvisos({ rpc: async () => ({ data: null, error: { message: 'unique violation' } }), from: () => ({}) })
    await expect(conError.avisar(validarEntrada(aviso('prueba:x', 'd')))).rejects.toThrow(/guardar el aviso: unique violation/)
    await expect(a.anotarSlack('u', 'fallo', null, 'e')).rejects.toThrow(/sin permiso/)
  })
  it('Slack: sin token no llama; ok:false o sin ts es fallo', async () => {
    let n = 0
    const f = async () => { n++; return new Response(JSON.stringify({ ok: false, error: 'channel_not_found' }), { status: 200 }) }
    expect(await slackPorBot(undefined, f)('C', 't')).toEqual({ ok: false, error: 'sin SLACK_BOT_TOKEN' })
    expect(n).toBe(0)
    expect(await slackPorBot('tok', f)('C', 't')).toEqual({ ok: false, error: 'Slack respondió 200 channel_not_found' })
  })
})

describe('11-nov · una pregunta CONTESTADA no vuelve a salir (decisión Lenovo 18:50 · la de 40 se repitió 1065 veces)', () => {
  const pregunta = (clave: string, detalle: string, client_id: string) => aviso(clave, detalle, { tipo: 'pregunta', client_id })
  for (const [rubro, cliente] of [['restaurante', RESTAURANTE], ['b2b', B2B]] as const) {
    it(`${rubro}: cerrada como contestada → la misma clave ya no guarda ni publica; otra clave sí`, async () => {
      const { almacen, filas, pasar } = almacenFalso(); const { slack, llamadas } = slackFalso(); const d = deps(almacen, slack)
      await avisar(d, pregunta(`tope:${rubro}:40`, 'd1', cliente))
      expect(await cerrar(d, `tope:${rubro}:40`, 'el dueño subió el tope a 100', { contestada: true })).toEqual({ cerrado: true, slack: 'entregado' })
      expect(filas[0].nota).toBe('Contestada: el dueño subió el tope a 100')
      const antes = llamadas.length
      const r = await avisar(d, pregunta(`tope:${rubro}:40`, 'd2 distinto', cliente))
      expect(r).toMatchObject({ accion: 'contestada', aviso_id: filas[0].id, slack: 'entregado' })
      expect(filas).toHaveLength(1); expect(filas[0].repeticiones).toBe(0); expect(llamadas.length).toBe(antes)
      // ni pasadas 24 h vuelve
      pasar(25)
      expect((await avisar(d, pregunta(`tope:${rubro}:40`, 'd2 distinto', cliente))).accion).toBe('contestada')
      expect((await avisar(d, pregunta(`tope:${rubro}:100`, 'd3', cliente))).accion).toBe('abrio')
    })
  }
  it('un cierre SIN la marca (resuelto, vencido) sí deja que la pregunta vuelva', async () => {
    const { almacen, pasar } = almacenFalso(); const { slack } = slackFalso(); const d = deps(almacen, slack)
    await avisar(d, pregunta('tope:x:40', 'd', RESTAURANTE))
    await cerrar(d, 'tope:x:40', 'todo cabe')
    expect((await avisar(d, pregunta('tope:x:40', 'd', RESTAURANTE))).accion).toBe('abrio')
    pasar(25)
    expect((await avisar(d, pregunta('tope:x:40', 'd', RESTAURANTE))).accion).toBe('reabrio')
  })
  it('si se reabre después de contestada (otra fila más nueva, abierta), cuenta la ÚLTIMA fila: se avisa como siempre', async () => {
    const { almacen, filas } = almacenFalso(); const { slack } = slackFalso(); const d = deps(almacen, slack)
    await avisar(d, pregunta('tope:y:40', 'd', B2B))
    await cerrar(d, 'tope:y:40', 'listo', { contestada: true })
    filas.push({ ...filas[0], id: 'nueva', cerrado_en: null, nota: null })
    expect((await avisar(d, pregunta('tope:y:40', 'd', B2B))).accion).toBe('repetida')
  })
  it('si la lectura de «contestada» falla, se avisa como siempre (nunca se calla por un error)', async () => {
    const { almacen } = almacenFalso({ fallarContestada: true }); const { slack, llamadas } = slackFalso()
    expect((await avisar(deps(almacen, slack), pregunta('tope:z:40', 'd', RESTAURANTE))).accion).toBe('abrio')
    expect(llamadas).toHaveLength(1)
  })
  it('la marca: va al principio, no se duplica, sin distinguir mayúsculas; «no contestada» no cuenta', () => {
    expect(notaDeContestada('subió el tope')).toBe('Contestada: subió el tope')
    expect(notaDeContestada('Contestada: subió el tope')).toBe('Contestada: subió el tope')
    expect(notaDeContestada('')).toBe('Contestada')
    expect(notaDeContestada('x'.repeat(400))).toHaveLength(300)
    expect(esContestada('contestada: sí')).toBe(true)
    expect(esContestada('  CONTESTADA')).toBe(true)
    expect(esContestada('no contestada')).toBe(false)
    expect(esContestada('sin_actividad_24h')).toBe(false)
    expect(esContestada(null)).toBe(false)
  })
})

describe('11-nov · cerrar una FAMILIA de claves (lo que dejó de aplicar)', () => {
  it('cierra las abiertas del prefijo salvo la vigente, responde en cada hilo y no toca otras familias ni otra campaña', async () => {
    const { almacen, filas } = almacenFalso(); const { slack, llamadas } = slackFalso(); const d = deps(almacen, slack)
    await avisar(d, aviso('tope:camp-a:40', 'd', { tipo: 'pregunta', client_id: RESTAURANTE }))
    await avisar(d, aviso('tope:camp-a:60', 'd', { tipo: 'pregunta', client_id: RESTAURANTE }))
    await avisar(d, aviso('tope:camp-a:100', 'd', { tipo: 'pregunta', client_id: RESTAURANTE }))
    await avisar(d, aviso('tope:camp-ab:40', 'd', { tipo: 'pregunta', client_id: B2B }))
    await avisar(d, aviso('gasto:camp-a', 'd', { client_id: RESTAURANTE }))
    const antes = llamadas.length
    expect(await cerrarFamilia(d, 'tope:camp-a:', 'tope:camp-a:100', 'el tope ahora es 100')).toEqual({ cerradas: 2 })
    expect(filas.filter((f) => f.cerrado_en !== null).map((f) => f.clave)).toEqual(['tope:camp-a:40', 'tope:camp-a:60'])
    expect(filas.find((f) => f.clave === 'tope:camp-a:40')!.nota).toBe('el tope ahora es 100')
    expect(esContestada(filas[0].nota)).toBe(false)
    const respuestas = llamadas.slice(antes)
    expect(respuestas.map((l) => [l.canal, l.hilo])).toEqual([['C-BUZON', filas[0].slack_ts], ['C-BUZON', filas[1].slack_ts]])
    expect(respuestas[0].texto).toBe('✅ Resuelto · el tope ahora es 100')
    // sin salvo: cierra todas las de la familia
    expect(await cerrarFamilia(d, 'tope:camp-a:', null, 'todo cabe')).toEqual({ cerradas: 1 })
    expect(filas.find((f) => f.clave === 'tope:camp-ab:40')!.cerrado_en).toBeNull()
    expect(filas.find((f) => f.clave === 'gasto:camp-a')!.cerrado_en).toBeNull()
  })
  it('un prefijo con comodines o fuera de largo no se acepta; un error de la base se lanza como ErrorAlGuardar', async () => {
    const { almacen } = almacenFalso(); const { slack } = slackFalso(); const d = deps(almacen, slack)
    for (const p of ['tope:%', 'tope:_a', 'tope:*', 'to\\pe', 'ab', 'x'.repeat(161)]) await expect(cerrarFamilia(d, p, null, 'n')).rejects.toBeInstanceOf(EntradaInvalida)
    const roto: AlmacenDeAvisos = { ...almacen, cerrarFamilia: async () => { throw new Error('sin permiso') } }
    await expect(cerrarFamilia(deps(roto, slack), 'tope:a:', null, 'n')).rejects.toBeInstanceOf(ErrorAlGuardar)
  })
  it('con Slack apagado cierra igual y no llama a Slack', async () => {
    const { almacen, filas } = almacenFalso(); const { slack, llamadas } = slackFalso()
    await avisar(deps(almacen, slack), aviso('tope:c:1', 'd', { tipo: 'pregunta' }))
    const antes = llamadas.length
    expect(await cerrarFamilia(deps(almacen, slack, false), 'tope:c:', null, 'n')).toEqual({ cerradas: 1 })
    expect(filas[0].cerrado_en).not.toBeNull(); expect(llamadas.length).toBe(antes)
  })
})

describe('11-nov · adaptador real: contestada y cierre por familia', () => {
  type Llamada = [string, ...unknown[]]
  function dbFalsa(resp: { data: unknown; error: unknown }) {
    const llamadas: Llamada[] = []
    const q: Record<string, (...a: unknown[]) => unknown> = {}
    for (const m of ['select', 'eq', 'order', 'limit', 'update', 'like', 'is', 'neq']) q[m] = (...a: unknown[]) => { llamadas.push([m, ...a]); return q }
    ;(q as unknown as { then: unknown }).then = (ok: (v: unknown) => unknown) => Promise.resolve(resp).then(ok)
    return { db: { from: (t: string) => { llamadas.push(['from', t]); return q }, rpc: async () => ({ data: null, error: null }) }, llamadas }
  }
  it('contestada: lee la ÚLTIMA fila de la clave y solo cuenta si está cerrada con la marca', async () => {
    const si = dbFalsa({ data: [{ id: 'u', cerrado_en: '2026-11-11T17:47:11Z', nota_cierre: 'Contestada: subió el tope', slack_ts: 't1', slack_estado: 'entregado' }], error: null })
    expect(await almacenDeAvisos(si.db).contestada('tope:a:40')).toEqual({ aviso_id: 'u', slack_ts: 't1', slack_estado: 'entregado' })
    expect(si.llamadas).toEqual([['from', 'avisos'], ['select', 'id,cerrado_en,nota_cierre,slack_ts,slack_estado'], ['eq', 'clave', 'tope:a:40'], ['order', 'abierto_en', { ascending: false }], ['limit', 1]])
    for (const fila of [{ id: 'u', cerrado_en: null, nota_cierre: null }, { id: 'u', cerrado_en: null, nota_cierre: 'Contestada' }, { id: 'u', cerrado_en: 'x', nota_cierre: 'sin_actividad_24h' }]) expect(await almacenDeAvisos(dbFalsa({ data: [fila], error: null }).db).contestada('k')).toBeNull()
    expect(await almacenDeAvisos(dbFalsa({ data: [], error: null }).db).contestada('k')).toBeNull()
    expect(await almacenDeAvisos(dbFalsa({ data: null, error: { message: 'caída' } }).db).contestada('k')).toBeNull()
  })
  it('cerrarFamilia: update condicional de las ABIERTAS del prefijo, salvo la vigente; un error se lanza', async () => {
    const f = dbFalsa({ data: [{ id: 'a', slack_ts: 't', tipo: 'pregunta' }], error: null })
    expect(await almacenDeAvisos(f.db).cerrarFamilia('tope:a:', 'tope:a:100', 'n')).toEqual([{ aviso_id: 'a', slack_ts: 't', tipo: 'pregunta' }])
    const [, upd] = f.llamadas.find((l) => l[0] === 'update') as [string, Record<string, unknown>]
    expect(Object.keys(upd).sort()).toEqual(['cerrado_en', 'nota_cierre']); expect(upd.nota_cierre).toBe('n')
    expect(f.llamadas.filter((l) => ['like', 'is', 'neq', 'select'].includes(l[0]))).toEqual([['like', 'clave', 'tope:a:%'], ['is', 'cerrado_en', null], ['neq', 'clave', 'tope:a:100'], ['select', 'id,slack_ts,tipo']])
    const sinSalvo = dbFalsa({ data: [], error: null })
    await almacenDeAvisos(sinSalvo.db).cerrarFamilia('tope:a:', null, 'n')
    expect(sinSalvo.llamadas.some((l) => l[0] === 'neq')).toBe(false)
    await expect(almacenDeAvisos(dbFalsa({ data: null, error: { message: 'sin permiso' } }).db).cerrarFamilia('tope:a:', null, 'n')).rejects.toThrow(/cerrar la familia: sin permiso/)
  })
})

describe('migración 202611102000 · permisos cerrados y reversa', () => {
  const crudo = (p: string) => fs.readFileSync(path.join(process.cwd(), p), 'utf8').replace(/\r/g, '').replace(/--.*$/gm, '')
  const sql = crudo('supabase/migrations/202611102000_avisos.sql')
  const sentencias = sql.split(';').map((x) => x.replace(/\s+/g, ' ').trim()).filter(Boolean)
  it('una tabla, seguridad por fila, una regla solo para el servidor, todo en una transacción', () => {
    expect([...sql.matchAll(/create table if not exists public\.(\w+)/g)].map((m) => m[1])).toEqual(['avisos'])
    expect(sql).toMatch(/alter table public\.avisos enable row level security;/)
    expect([...sql.matchAll(/create policy (\w+) on public\.avisos for all to ([^;]+?) using/g)].map((m) => m[2].trim())).toEqual(['service_role'])
    expect(sql.indexOf('begin;')).toBeLessThan(sql.indexOf('create table'))
    expect(sql.lastIndexOf('commit;')).toBeGreaterThan(sql.lastIndexOf('grant execute'))
    expect(sql).not.toMatch(/\b(alter|drop|truncate|delete from|insert into|update)\s+(table\s+)?public\.(?!avisos\b)/i)
  })
  it('permisos: revoke all a los 4 roles y luego SOLO select, insert y update de las columnas que cambian', () => {
    expect(sql.indexOf('revoke all on public.avisos from public, anon, authenticated, service_role;')).toBeGreaterThan(-1)
    expect(sentencias.filter((l) => /^grant\b/i.test(l))).toEqual([
      'grant select, insert on public.avisos to service_role',
      'grant update (repeticiones, ultimo_detalle, ultima_en, cerrado_en, nota_cierre, slack_ts, slack_estado, slack_error) on public.avisos to service_role',
      'grant execute on function public.avisos_avisar(text, text, text, text, uuid, text, text, text, text) to service_role',
      'grant execute on function public.avisos_cerrar(text, text) to service_role',
    ])
    expect(sql).not.toMatch(/grant[^;]*\b(delete|truncate|trigger|references|all)\b/i)
    expect(sql).not.toMatch(/grant[^;]*\bto\s+[^;]*\b(anon|authenticated|public)\b/i)
  })
  it('las funciones: security invoker con search_path fijo, y EXECUTE se le quita a public, anon y authenticated', () => {
    for (const fn of ['avisos_avisar', 'avisos_cerrar']) {
      expect(sql).toMatch(new RegExp(`create or replace function public\\.${fn}\\([\\s\\S]*?language plpgsql security invoker set search_path = public, pg_temp as`))
      expect(sql).toMatch(new RegExp(`revoke execute on function public\\.${fn}\\([^)]*\\) from public, anon, authenticated;`))
    }
    expect(sql).not.toMatch(/security definer/i)
    // cerrar devuelve el tipo de la FILA: el cierre va al canal de la fila (nota CC7)
    expect(sql).toMatch(/avisos_cerrar\(p_clave text, p_nota text\)\s+returns table \(aviso_id uuid, slack_ts text, tipo text\)[\s\S]*?returning a\.id, a\.slack_ts, a\.tipo;/)
  })
  it('un incidente por fila: una sola ABIERTA por clave, y repetir = on conflict sobre ese índice', () => {
    expect(sql).toMatch(/create unique index if not exists avisos_una_abierta_por_clave on public\.avisos \(clave\) where cerrado_en is null;/)
    expect(sql).toMatch(/on conflict \(clave\) where cerrado_en is null\s+do update set repeticiones = a\.repeticiones \+ 1/)
    expect(sql).toMatch(/nota_cierre = 'sin_actividad_24h'[\s\S]*interval '24 hours'/)
    expect(sql).toMatch(/client_id uuid references public\.clients\(id\) on delete restrict,/)
    expect(sql).not.toMatch(/on delete (cascade|set null)/i)
    expect(sql).toMatch(/check \(origen_tipo <> 'n8n' or \(workflow_id is not null and workflow_execution_id is not null\)\)/)
  })
  it('la reversa vive fuera de migrations, es una transacción, se niega con historial y no vacía', () => {
    expect(fs.existsSync(path.join(process.cwd(), 'supabase/migrations/202611102000_avisos_REVERSA.sql'))).toBe(false)
    const r = crudo('supabase/reversas/202611102000_avisos_REVERSA.sql')
    expect(r.trim().startsWith('begin;')).toBe(true)
    expect(r).toMatch(/exists \(select 1 from public\.avisos\) then\s+raise exception/)
    expect(r.indexOf('raise exception')).toBeLessThan(r.indexOf('drop table'))
    expect(r).not.toMatch(/truncate|delete from|cascade/i)
    expect(r).toMatch(/commit;/)
  })
})

describe('regla del proyecto: un solo lugar nombra la tabla', () => {
  it('solo src/lib/avisos/adaptadores.ts escribe en `avisos` o llama a sus funciones', () => {
    const quien: string[] = []
    const recorrer = (d: string) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const p = path.join(d, e.name); if (e.isDirectory()) { if (e.name !== '__tests__' && e.name !== 'node_modules') recorrer(p) } else if (/\.tsx?$/.test(e.name) && !/\.test\./.test(e.name)) { const t = fs.readFileSync(p, 'utf8'); if (/from\(['"]avisos['"]\)|rpc\(['"]avisos_/.test(t)) quien.push(path.relative(process.cwd(), p).replace(/\\/g, '/')) } } }
    recorrer(path.join(process.cwd(), 'src'))
    expect(quien).toEqual(['src/lib/avisos/adaptadores.ts'])
  })
})
