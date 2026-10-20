/**
 * Vigía de la prueba de punta a punta (CC#2 · 19-oct): mide el gasto de UN cliente de práctica y, en el tope, apaga los interruptores. Puro, US$ 0, sin red (todo entra por funciones).
 */
import { describe, expect, it } from 'vitest'
import {
  CLAVE_DEL_CANDADO, ejecutarApagado, evaluar, INTERRUPTORES_APAGADOS, medir, sumaDeAgentes, sumaDeApify, validarParametros, vigilarUnaVez,
} from '../scripts/ops/vigia-prueba.mjs'

const CLI = '41dd3d62-d6de-4c9a-9996-6df78c1da118'
const OTRO = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const llamada = (cliente: string, usd: number, extra: Record<string, unknown> = {}) => ({ amount_usd: usd, description: JSON.stringify({ tipo: 'llamada', client_id: cliente, ...extra }) })
const P = { cliente: CLI, desde: '2026-10-20T07:30:00.000Z', tope: 10, aviso: 8, intervalo: 30 }

describe('sumas', () => {
  it('agentes: suma lo que traiga, ignora lo que no es número', () => {
    expect(sumaDeAgentes([{ cost_usd: 0.25 }, { cost_usd: '1.5' }, { cost_usd: null }, { cost_usd: 'x' }, {}])).toBe(1.75)
    expect(sumaDeAgentes([])).toBe(0); expect(sumaDeAgentes(undefined as never)).toBe(0)
  })
  it('apify: solo llamadas de ESE cliente; ignora la fila del día, otros clientes, descripciones rotas y filas sin tipo', () => {
    const filas = [
      llamada(CLI, 0.4), llamada(CLI, 0.35), llamada(OTRO, 9), { amount_usd: 7, description: JSON.stringify({ tipo: 'dia', client_id: CLI }) },
      { amount_usd: 5, description: 'no es json' }, { amount_usd: 4, description: null }, { amount_usd: 3, description: JSON.stringify({ client_id: CLI }) },
    ]
    expect(sumaDeApify(filas as never, CLI)).toBe(0.75)
  })
  it('apify: prefiere el importe exacto cuando existe', () => {
    expect(sumaDeApify([{ amount_usd: 0.01, amount_usd_exact: 0.0123, description: JSON.stringify({ tipo: 'llamada', client_id: CLI }) }] as never, CLI)).toBe(0.0123)
  })
})

describe('evaluar (los bordes)', () => {
  it('justo bajo el aviso es ok; en el aviso, aviso; justo bajo el tope, aviso; en el tope, tope', () => {
    expect(evaluar(7.9999, { tope: 10, aviso: 8 }).nivel).toBe('ok')
    expect(evaluar(8, { tope: 10, aviso: 8 }).nivel).toBe('aviso')
    expect(evaluar(9.9999, { tope: 10, aviso: 8 }).nivel).toBe('aviso')
    expect(evaluar(10, { tope: 10, aviso: 8 }).nivel).toBe('tope')
    expect(evaluar(12, { tope: 10, aviso: 8 }).falta_para_el_tope).toBe(0)
    expect(evaluar(6, { tope: 10, aviso: 8 }).falta_para_el_tope).toBe(4)
  })
})

describe('validarParametros', () => {
  it('acepta lo correcto (aviso por omisión = 80 % del tope) y rechaza lo mal formado con el motivo', () => {
    const ok = validarParametros({ cliente: CLI, desde: '2026-10-20T09:30:00+02:00', tope: '10' })
    expect(ok.ok && ok.aviso).toBe(8); expect(ok.ok && ok.desde).toBe('2026-10-20T07:30:00.000Z'); expect(ok.ok && ok.intervalo).toBe(30)
    for (const mal of [{ cliente: 'x' }, { desde: 'ayer' }, { tope: '0' }, { tope: 'abc' }, { aviso: '11' }, { aviso: '0' }]) {
      const r = validarParametros({ cliente: CLI, desde: '2026-10-20T07:30:00Z', tope: '10', ...mal } as never)
      expect(r.ok).toBe(false)
    }
  })
  it('el intervalo nunca baja de 5 s', () => { const r = validarParametros({ cliente: CLI, desde: '2026-10-20T07:30:00Z', tope: '10', intervalo: '1' }); expect(r.ok && r.intervalo).toBe(5) })
})

// ───────────────────────────────────────────────────────── el apagado
function baseFalsa(opciones: { sinEscribir?: string } = {}) {
  const filas: Record<string, any> = {
    'settings:alta.abierta': { value: JSON.stringify({ abierta: true }) },
    'finanzas_config:id=eq.1': { estado: 'ensayo', conversa: 'ensayo', preguntas_slack: 'apagado', clientes_ensayo: [CLI] },
    'oficina_config:id=eq.1': { estado: 'ensayo', familias_activas: ['post'], clientes_ensayo: [CLI] },
    'jefatura_config:id=eq.1': { estado: 'ensayo', tipos_activos: ['pieza'], clientes_ensayo: [CLI] },
    'cadena_config:clave=eq.estado_cadena': { valor: 'ensayo' },
    'cadena_config:clave=eq.clientes_ensayo': { valor: [CLI] },
  }
  const log: Array<{ metodo: string; ruta: string; cuerpo?: any }> = []
  const rest = async (metodo: string, ruta: string, cuerpo?: any) => {
    log.push({ metodo, ruta, cuerpo })
    if (metodo === 'POST' && ruta.startsWith('settings')) { if (opciones.sinEscribir !== 'settings') filas['settings:alta.abierta'] = { value: cuerpo[0].value }; return { status: 201, json: null } }
    if (metodo === 'PATCH') { const k = ruta.replace('?', ':'); if (opciones.sinEscribir !== k.split(':')[0]) Object.assign(filas[k], cuerpo); return { status: 204, json: null } }
    if (metodo === 'GET' && ruta.startsWith('settings')) return { status: 200, json: [filas['settings:alta.abierta']] }
    if (metodo === 'GET') { const [t, resto] = ruta.split('?'); const filtro = resto.split('&').slice(-1)[0]; return { status: 200, json: [filas[`${t}:${filtro}`]] } }
    return { status: 500, json: null }
  }
  return { rest, log, filas }
}

describe('ejecutarApagado', () => {
  it('cierra el candado y apaga cada interruptor, y lo lee de vuelta', async () => {
    const b = baseFalsa()
    const r = await ejecutarApagado(b.rest, new Date('2026-10-20T08:00:00Z'))
    expect(r.todo_apagado).toBe(true); expect(r.pasos).toHaveLength(1 + INTERRUPTORES_APAGADOS.length)
    expect(JSON.parse(b.filas['settings:alta.abierta'].value).abierta).toBe(false)
    expect(b.filas['finanzas_config:id=eq.1']).toMatchObject({ estado: 'apagada', conversa: 'apagado', preguntas_slack: 'apagado', clientes_ensayo: [] })
    expect(b.filas['oficina_config:id=eq.1']).toMatchObject({ estado: 'apagada', familias_activas: [], clientes_ensayo: [] })
    expect(b.filas['jefatura_config:id=eq.1']).toMatchObject({ estado: 'apagada', tipos_activos: [], clientes_ensayo: [] })
    expect(b.filas['cadena_config:clave=eq.estado_cadena'].valor).toBe('apagada'); expect(b.filas['cadena_config:clave=eq.clientes_ensayo'].valor).toEqual([])
  })
  it('el candado del alta es lo PRIMERO que se cierra (nada nuevo arranca mientras se apaga el resto)', async () => {
    const b = baseFalsa(); await ejecutarApagado(b.rest)
    expect(b.log[0].metodo).toBe('POST'); expect(b.log[0].ruta).toContain('settings'); expect(b.log[0].cuerpo[0].key).toBe(CLAVE_DEL_CANDADO)
  })
  it('si un interruptor no queda como debe al leerlo de vuelta, lo dice (todo_apagado = false)', async () => {
    for (const tabla of ['settings', 'finanzas_config', 'oficina_config', 'jefatura_config', 'cadena_config']) {
      const r = await ejecutarApagado(baseFalsa({ sinEscribir: tabla }).rest)
      expect(r.todo_apagado).toBe(false)
    }
  })
  it('no escribe fuera de los interruptores: solo `settings` y las cuatro `*_config`', async () => {
    const b = baseFalsa(); await ejecutarApagado(b.rest)
    const tablas = new Set(b.log.filter((x) => x.metodo !== 'GET').map((x) => x.ruta.split('?')[0]))
    expect([...tablas].sort()).toEqual(['cadena_config', 'finanzas_config', 'jefatura_config', 'oficina_config', 'settings'])
  })
})

// ───────────────────────────────────────────────────────── una vuelta
describe('vigilarUnaVez', () => {
  const consultarCon = (agentes: number, apify: number) => async () => ({ agentes: [{ cost_usd: agentes }], apify: [llamada(CLI, apify)] })
  it('bajo el aviso: código 0 y NO toca nada', async () => {
    const b = baseFalsa()
    const r = await vigilarUnaVez({ consultar: consultarCon(3, 1), rest: b.rest, apagar: true }, P)
    expect(r.codigo).toBe(0); expect(r.nivel).toBe('ok'); expect(r.total).toBe(4); expect(b.log).toHaveLength(0)
  })
  it('sobre el aviso: código 10 y NO apaga', async () => {
    const b = baseFalsa(); const r = await vigilarUnaVez({ consultar: consultarCon(7, 1.5), rest: b.rest, apagar: true }, P)
    expect(r.codigo).toBe(10); expect(b.log).toHaveLength(0)
  })
  it('en el tope SIN --apagar: código 20 y no escribe nada', async () => {
    const b = baseFalsa(); const r = await vigilarUnaVez({ consultar: consultarCon(9, 1), rest: b.rest, apagar: false }, P)
    expect(r.nivel).toBe('tope'); expect(r.codigo).toBe(20); expect(r.apagado).toBeNull(); expect(b.log).toHaveLength(0)
  })
  it('en el tope CON --apagar: apaga, lee de vuelta y sale con 20; si algo no se lee de vuelta, sale con 4', async () => {
    const ok = baseFalsa(); const r = await vigilarUnaVez({ consultar: consultarCon(9, 1), rest: ok.rest, apagar: true }, P)
    expect(r.codigo).toBe(20); expect(r.apagado?.todo_apagado).toBe(true)
    const mal = baseFalsa({ sinEscribir: 'finanzas_config' }); const r2 = await vigilarUnaVez({ consultar: consultarCon(9, 1), rest: mal.rest, apagar: true }, P)
    expect(r2.codigo).toBe(4)
  })
  it('mide con el cliente y la fecha que se le pasan (ni de otro cliente ni de antes de la prueba)', async () => {
    let visto: any = null
    await medir(async (p: any) => { visto = p; return { agentes: [], apify: [] } }, P)
    expect(visto).toMatchObject({ cliente: CLI, desde: '2026-10-20T07:30:00.000Z' })
  })
})
