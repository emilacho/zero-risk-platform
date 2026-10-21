/**
 * EL REINTENTO SISTÉMICO DE PIEZAS (21-oct · tercera prueba): un sobre `producir` rechazado (409 `plantilla_inactiva`) o una pieza que nunca llegó a encargo se vuelve a pedir SOLA, máx. 3 veces,
 * y a la 3.ª sin fruto avisa una vez en el hilo de #oficina-creativa. Puertos falsos: nada toca la red ni la base.
 */
import { describe, expect, it } from 'vitest'
import { ESPERAS_MIN, MAX_REINTENTOS, reintentarPiezas, textoDelAviso, type CampanaParaReintento, type Libreta, type ParteParaReintento, type PuertosDeReintento } from '../reintento-piezas'
import type { ResultadoDeEmision, SobreDeProducir } from '../autoproducir'
import type { ConfigDeOficina } from '../../oficina/sobre'

const CLIENTE = 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5'
const CAMPANA = '31dc6aaf-2e9c-426e-81c5-1645c500283e'
const PARTE = '2a93029a-d4e5-439e-87a8-4b67afdfec33'
const T0 = Date.parse('2026-10-21T10:02:24Z')
const min = (m: number) => new Date(T0 + m * 60_000)

interface Estado {
  ahora: Date
  interruptor: boolean; cadena: boolean
  campanas: CampanaParaReintento[]
  partes: ParteParaReintento[]
  conEncargo: Set<string>
  config: ConfigDeOficina
  plantillas: Record<string, boolean>
  freno: { bloqueado: boolean; motivo?: string }
  respuesta: ResultadoDeEmision['resultado']
  libreta: Libreta
  emitidos: SobreDeProducir[]
  avisos: string[]
  escrituras: number
  previuelo: { ok: true } | { ok: false; motivo: string }
  previuelos: string[]
}
const BRIEFS = [
  { brief_id: 'BRF-0001', fila_id: 's1-d1-lun_ig', familia: 'carrusel_ig_v1' },
  { brief_id: 'BRF-0002', fila_id: 's1-d1-fb_lun', familia: 'carrusel_ig_v1' },
  { brief_id: 'BRF-0004', fila_id: 's1-d1-hist_lun', familia: 'kit_historias' },
]
const base = (): Estado => ({
  ahora: min(20), interruptor: true, cadena: true,
  campanas: [{ id: CAMPANA, client_id: CLIENTE, sala_ref: { _sala_correlation_id: 'ccc4204b-7b95-4418-8ae6-57d360c65714' } }],
  partes: [{ id: PARTE, creado_en: new Date(T0).toISOString(), valido: true, briefs: BRIEFS }],
  conEncargo: new Set(), config: { estado: 'encendida', familias_activas: ['post_img', 'carrusel_ig_v1', 'kit_historias'], clientes_ensayo: [] },
  plantillas: { post_img: true, carrusel_ig_v1: true, kit_historias: true }, freno: { bloqueado: false }, respuesta: 'aceptado',
  libreta: {}, emitidos: [], avisos: [], escrituras: 0, previuelo: { ok: true }, previuelos: [],
})
const puertos = (s: Estado): PuertosDeReintento => ({
  ahora: () => s.ahora,
  interruptor: async () => s.interruptor,
  cadenaEncendida: async () => s.cadena,
  campanas: async () => s.campanas,
  partes: async () => s.partes,
  briefsConEncargo: async () => s.conEncargo,
  configOficina: async () => s.config,
  plantillaActiva: async (f) => s.plantillas[f] === true,
  cuando: async () => new Map([['s1-d1-lun_ig', { fecha: '2026-10-26', hora: '09:00' }]]),
  frenoDeGasto: async () => s.freno,
  previueloDeLaminas: async (cliente, familia) => { s.previuelos.push(`${cliente}:${familia}`); return s.previuelo },
  emitirSobre: async (x) => { s.emitidos.push(x); return { resultado: s.respuesta } },
  leerLibreta: async () => JSON.parse(JSON.stringify(s.libreta)) as Libreta,
  escribirLibreta: async (l) => { s.libreta = l; s.escrituras++ },
  avisar: async (t) => { s.avisos.push(t) },
})
const pasada = (s: Estado, ejecutar = true) => reintentarPiezas(puertos(s), { ejecutar })
const acciones = (r: Awaited<ReturnType<typeof pasada>>) => r.plan.map((l) => `${l.brief_id}:${l.accion}`)

describe('los candados: nace apagado y no inventa nada', () => {
  it('sin el interruptor (o con algo que no es el booleano) no sale nada ni se anota nada', async () => {
    const s = base(); s.interruptor = false
    const r = await pasada(s)
    expect(r).toMatchObject({ accion: 'apagado', emitidos: 0, interruptor: false }); expect(s.emitidos).toHaveLength(0); expect(s.escrituras).toBe(0); expect(r.plan).toHaveLength(0)
  })
  it('con la cadena apagada tampoco sale nada', async () => {
    const s = base(); s.cadena = false
    expect((await pasada(s)).accion).toBe('cadena_apagada'); expect(s.emitidos).toHaveLength(0)
  })
  it('una pieza que YA tiene encargo no se reintenta (ya tiene dueño: lo reanuda o lo cierra el vigía de la oficina)', async () => {
    const s = base(); s.conEncargo = new Set(['BRF-0001', 'BRF-0002', 'BRF-0004'])
    const r = await pasada(s)
    expect(acciones(r)).toEqual(['BRF-0001:llego', 'BRF-0002:llego', 'BRF-0004:llego']); expect(s.emitidos).toHaveLength(0)
  })
  it('una campaña que no es activa con autoproducir real no llega aquí (el puerto no la entrega) y un parte no válido se ignora', async () => {
    const s = base(); s.partes = [{ ...s.partes[0], valido: false }]
    expect((await pasada(s)).plan).toHaveLength(0); expect(s.emitidos).toHaveLength(0)
  })
  it('un parte más viejo que 14 días ya no se reintenta', async () => {
    const s = base(); s.ahora = min(15 * 1440)
    expect((await pasada(s)).plan).toHaveLength(0)
  })
})

describe('qué se reintenta y qué no', () => {
  it('las 3 piezas sin encargo, pasados 15 min, salen cada una con la llave NUEVA :r1 y dry_run falso', async () => {
    const s = base()
    const r = await pasada(s)
    expect(r).toMatchObject({ accion: 'vigilado', emitidos: 3, duplicados: 0, rechazados: 0 })
    expect(s.emitidos.map((x) => x.idempotency_key)).toEqual([`${PARTE}:BRF-0001:producir:r1`, `${PARTE}:BRF-0002:producir:r1`, `${PARTE}:BRF-0004:producir:r1`])
    for (const x of s.emitidos) {
      expect(x.payload.dry_run).toBe(false); expect(x.source).toBe('brief/parte-listo'); expect(x.intent).toBe('producir')
      expect(x.client_id).toBe(CLIENTE); expect(x.tenant_id).toBe(CLIENTE); expect(x.correlation_id).toBe('ccc4204b-7b95-4418-8ae6-57d360c65714')
      expect(x.payload.parte_id).toBe(PARTE); expect(x.logical_period).toBe(`parte:${PARTE}`)
      expect(x.idempotency_key).not.toBe(`${PARTE}:${x.payload.brief_id}:producir`)
    }
    expect(s.emitidos[0].payload).toMatchObject({ familia: 'carrusel_ig_v1', fila_id: 's1-d1-lun_ig', fecha: '2026-10-26', hora: '09:00' })
    expect(s.libreta[`${PARTE}:BRF-0001`]).toMatchObject({ n: 1 })
  })
  it('antes de los 15 min NO sale (la pieza todavía puede estar en camino) y dice cuánto falta', async () => {
    const s = base(); s.ahora = min(10)
    const r = await pasada(s)
    expect(acciones(r)).toEqual(['BRF-0001:espera', 'BRF-0002:espera', 'BRF-0004:espera']); expect(r.plan[0].faltan_min).toBe(5); expect(s.emitidos).toHaveLength(0)
  })
  it('solo reintenta las que faltan: la que ya llegó a encargo se deja en paz', async () => {
    const s = base(); s.conEncargo = new Set(['BRF-0001'])
    const r = await pasada(s)
    expect(acciones(r)).toEqual(['BRF-0001:llego', 'BRF-0002:reintentar', 'BRF-0004:reintentar']); expect(s.emitidos).toHaveLength(2)
  })
  it('una familia que la oficina NO abriría hoy (fuera de la puerta o plantilla apagada) no es un fallo recuperable: no se reintenta', async () => {
    const s = base(); s.config = { ...s.config, familias_activas: ['post_img'] }
    expect(acciones(await pasada(s))).toEqual(['BRF-0001:sin_sala', 'BRF-0002:sin_sala', 'BRF-0004:sin_sala']); expect(s.emitidos).toHaveLength(0)
    const t = base(); t.plantillas.carrusel_ig_v1 = false
    expect(acciones(await pasada(t))).toEqual(['BRF-0001:sin_sala', 'BRF-0002:sin_sala', 'BRF-0004:reintentar'])
  })
  it('la decisión de la PUERTA manda aunque la plantilla de esa familia esté activa: familia fuera de la puerta = no se reintenta', async () => {
    const s = base(); s.config = { ...s.config, familias_activas: ['post_img'] }
    const p = puertos(s); p.plantillaActiva = async () => true
    const r = await reintentarPiezas(p, { ejecutar: true })
    expect(acciones(r)).toEqual(['BRF-0001:sin_sala', 'BRF-0002:sin_sala', 'BRF-0004:sin_sala']); expect(s.emitidos).toHaveLength(0)
  })
  it('con la oficina apagada, o en ensayo para otro cliente, no se reintenta', async () => {
    const a = base(); a.config = { ...a.config, estado: 'apagada' }
    expect((await pasada(a)).plan.every((l) => l.accion === 'sin_sala')).toBe(true)
    const e = base(); e.config = { ...e.config, estado: 'ensayo', clientes_ensayo: ['otro-cliente'] }
    expect((await pasada(e)).plan.every((l) => l.accion === 'sin_sala')).toBe(true)
  })
  it('un brief sin familia, sin id o con familia mal escrita se salta (nunca se inventa una sala)', async () => {
    const s = base(); s.partes[0].briefs = [{ brief_id: 'BRF-0009', fila_id: null, familia: null }, { brief_id: null, fila_id: null, familia: 'carrusel_ig_v1' }, { brief_id: 'BRF-0010', fila_id: null, familia: 'Carrusel IG' }]
    const r = await pasada(s)
    expect(acciones(r)).toEqual(['BRF-0009:sin_sala', 'BRF-0010:sin_sala']); expect(s.emitidos).toHaveLength(0)
  })
})

describe('el tope de 3 y el aviso: nunca un reintento sin fin', () => {
  it('la secuencia completa: r1 a los 15 min, r2 45 min después, r3 120 min después, y a los 60 min del último AVISA una vez', async () => {
    const s = base()
    let t = 20
    expect((await pasada(s)).emitidos).toBe(3)                       // r1
    s.ahora = min(t += 44); expect((await pasada(s)).emitidos).toBe(0) // faltan 1 min
    s.ahora = min(t += 1); expect((await pasada(s)).emitidos).toBe(3)  // r2
    s.ahora = min(t += 119); expect((await pasada(s)).emitidos).toBe(0)
    s.ahora = min(t += 1); expect((await pasada(s)).emitidos).toBe(3)  // r3
    expect(s.emitidos.slice(-3).map((x) => x.idempotency_key.split(':').pop())).toEqual(['r3', 'r3', 'r3'])
    s.ahora = min(t += 59); expect(s.avisos).toHaveLength(0); expect((await pasada(s)).avisados).toBe(0)
    s.ahora = min(t += 1)
    const fin = await pasada(s)
    expect(fin).toMatchObject({ emitidos: 0, avisados: 3 }); expect(acciones(fin)).toEqual(['BRF-0001:agotado', 'BRF-0002:agotado', 'BRF-0004:agotado'])
    expect(s.emitidos).toHaveLength(9)                                 // 3 piezas × 3 intentos, ni uno más
    expect(s.avisos).toHaveLength(3)
    expect(s.avisos[0]).toContain('s1-d1-lun_ig'); expect(s.avisos[0]).toContain('carrusel_ig_v1'); expect(s.avisos[0]).toContain('3 reintento(s)'); expect(s.avisos[0]).toContain(PARTE)
    // y ya no vuelve a avisar ni a emitir, por mucho que pase el tiempo
    s.ahora = min(t + 100_000 / 60)
    const despues = await pasada(s)
    expect(despues).toMatchObject({ emitidos: 0, avisados: 0 }); expect(acciones(despues)).toEqual(['BRF-0001:ya_avisado', 'BRF-0002:ya_avisado', 'BRF-0004:ya_avisado']); expect(s.avisos).toHaveLength(3)
  })
  it('el tope vale también cuando la sala RECHAZA el sobre: el intento se gasta igual', async () => {
    const s = base(); s.respuesta = 'rechazado'
    let t = 20
    const r1 = await pasada(s); expect(r1).toMatchObject({ emitidos: 0, rechazados: 3 })
    for (const espera of [45, 120]) { s.ahora = min(t += espera); await pasada(s) }
    s.ahora = min(t += 60); const fin = await pasada(s)
    expect(s.emitidos).toHaveLength(9); expect(fin.avisados).toBe(3)
    expect(Object.values(s.libreta).every((x) => x.n === MAX_REINTENTOS)).toBe(true)
  })
  it('si la pieza llega a encargo a mitad de camino, se deja de reintentar y no se avisa', async () => {
    const s = base()
    await pasada(s)                                                    // r1
    s.conEncargo = new Set(['BRF-0001', 'BRF-0002', 'BRF-0004'])
    s.ahora = min(20 + 45); const r = await pasada(s)
    expect(r.emitidos).toBe(0); expect(r.avisados).toBe(0); expect(s.emitidos).toHaveLength(3)
  })
  it('las esperas y el tope son los firmados: 15 · 45 · 120 · 60 min y 3 reintentos', () => {
    expect([...ESPERAS_MIN]).toEqual([15, 45, 120, 60]); expect(MAX_REINTENTOS).toBe(3)
  })
})

describe('pendiente de datos: el mismo pre-vuelo de la puerta, sin gastar intentos', () => {
  it('si falta la identidad visual (o el slug) el brief queda PENDIENTE: no sale sobre, no se gasta intento, no se anota nada y dice por qué', async () => {
    const s = base(); s.previuelo = { ok: false, motivo: 'sin_identidad_visual' }
    const r = await pasada(s)
    expect(acciones(r)).toEqual(['BRF-0001:pendiente_de_datos', 'BRF-0002:pendiente_de_datos', 'BRF-0004:pendiente_de_datos']); expect(r.plan[0].detalle).toBe('sin_identidad_visual')
    expect(s.emitidos).toHaveLength(0); expect(s.libreta).toEqual({}); expect(s.escrituras).toBe(0); expect(s.avisos).toHaveLength(0)
  })
  it('la pasada que sigue con el dato ya llenado SALE enseguida (la espera ya estaba cumplida) y el intento cuenta desde ahí', async () => {
    const s = base(); s.previuelo = { ok: false, motivo: 'sin_identidad_visual' }
    await pasada(s); await pasada(s)
    s.previuelo = { ok: true }
    const r = await pasada(s)
    expect(r.emitidos).toBe(3); expect(s.emitidos[0].idempotency_key).toBe(`${PARTE}:BRF-0001:producir:r1`); expect(s.libreta[`${PARTE}:BRF-0001`].n).toBe(1)
  })
  it('estar pendiente no agota el tope: aunque pasen días sin dato, al llegar el dato todavía quedan los 3 intentos y no se avisó de fallo', async () => {
    const s = base(); s.previuelo = { ok: false, motivo: 'sin_slug' }
    for (const m of [20, 200, 2000, 20000]) { s.ahora = min(m); await pasada(s) }
    expect(s.avisos).toHaveLength(0); expect(s.libreta).toEqual({})
  })
  it('se consulta con el cliente y la FAMILIA de cada brief, y solo cuando va a salir (no para los que ya llegaron, no tienen sala o esperan)', async () => {
    const s = base(); s.conEncargo = new Set(['BRF-0001']); s.config = { ...s.config, familias_activas: ['carrusel_ig_v1'] }
    await pasada(s)
    expect(s.previuelos).toEqual([`${CLIENTE}:carrusel_ig_v1`])
    const t = base(); t.ahora = min(10); await pasada(t); expect(t.previuelos).toEqual([])
  })
  it('si el pre-vuelo MISMO falla (lanza), no bloquea: el brief sale y la puerta decide', async () => {
    const s = base(); const p = puertos(s); p.previueloDeLaminas = async () => { throw new Error('caída') }
    const r = await reintentarPiezas(p, { ejecutar: true })
    expect(r.emitidos).toBe(3)
  })
  it('en seco también muestra el pendiente (para revisar a US$ 0 qué faltaría)', async () => {
    const s = base(); s.previuelo = { ok: false, motivo: 'sin_identidad_visual' }
    const r = await pasada(s, false)
    expect(r.plan.every((l) => l.accion === 'pendiente_de_datos')).toBe(true); expect(s.escrituras).toBe(0)
  })
  it('el freno de gasto se mira DESPUÉS: con dato y cliente al techo, freno; sin dato, pendiente (no se gasta nada de ninguna manera)', async () => {
    const s = base(); s.freno = { bloqueado: true, motivo: 'techo' }
    expect(acciones(await pasada(s))[0]).toBe('BRF-0001:freno')
    s.previuelo = { ok: false, motivo: 'sin_slug' }
    expect(acciones(await pasada(s))[0]).toBe('BRF-0001:pendiente_de_datos')
  })
})

describe('el gasto y la idempotencia', () => {
  it('con el cliente al techo del freno de gasto no sale NINGÚN sobre y NO se gasta un intento (cuando se libere, sigue)', async () => {
    const s = base(); s.freno = { bloqueado: true, motivo: 'tope de 24 h' }
    const r = await pasada(s)
    expect(acciones(r)).toEqual(['BRF-0001:freno', 'BRF-0002:freno', 'BRF-0004:freno']); expect(r.plan[0].detalle).toBe('tope de 24 h'); expect(s.emitidos).toHaveLength(0); expect(s.libreta).toEqual({})
    s.freno = { bloqueado: false }; expect((await pasada(s)).emitidos).toBe(3)
  })
  it('repetir la pasada con la sala diciendo «duplicado» cuenta duplicados y no explota (la llave del intento es determinista)', async () => {
    const s = base(); s.respuesta = 'duplicado'
    const r = await pasada(s)
    expect(r).toMatchObject({ emitidos: 0, duplicados: 3, rechazados: 0 })
    const llaves = s.emitidos.map((x) => x.idempotency_key)
    const t = base(); await pasada(t)
    expect(t.emitidos.map((x) => x.idempotency_key)).toEqual(llaves)
  })
  it('si emitir lanza, el intento se gasta como rechazo y el resto de la pasada sigue', async () => {
    const s = base(); const p = puertos(s); let n = 0
    p.emitirSobre = async (x) => { n++; if (n === 1) throw new Error('red caída'); s.emitidos.push(x); return { resultado: 'aceptado' } }
    const r = await reintentarPiezas(p, { ejecutar: true })
    expect(r).toMatchObject({ emitidos: 2, rechazados: 1 }); expect(s.libreta[`${PARTE}:BRF-0001`].n).toBe(1)
  })
})

describe('en seco: el plan sin tocar nada (así se revisa a US$ 0)', () => {
  it('calcula lo que haría pero no emite, no anota la libreta, no avisa y no pide el freno; ignora el interruptor y lo declara', async () => {
    const s = base(); s.interruptor = false; s.freno = { bloqueado: true }
    const r = await pasada(s, false)
    expect(r).toMatchObject({ accion: 'en_seco', interruptor: false, emitidos: 0, avisados: 0 }); expect(acciones(r)).toEqual(['BRF-0001:reintentar', 'BRF-0002:reintentar', 'BRF-0004:reintentar'])
    expect(s.emitidos).toHaveLength(0); expect(s.escrituras).toBe(0); expect(s.avisos).toHaveLength(0); expect(s.libreta).toEqual({})
  })
  it('en seco también ve lo agotado, sin avisar', async () => {
    const s = base(); s.libreta = { [`${PARTE}:BRF-0001`]: { n: 3, ultimo_en: min(0).toISOString() } }; s.ahora = min(70)
    const r = await pasada(s, false)
    expect(r.plan.find((l) => l.brief_id === 'BRF-0001')?.accion).toBe('agotado'); expect(s.avisos).toHaveLength(0); expect(s.escrituras).toBe(0)
  })
})

describe('el texto del aviso', () => {
  it('va en tuteo, sin voseo ni jerga en el cuerpo, con lo técnico al final entre paréntesis', () => {
    const t = textoDelAviso({ fila_id: 's1-d1-lun_ig', familia: 'carrusel_ig_v1', parte_id: PARTE, brief_id: 'BRF-0001', intentos: 3 })
    expect(t).toMatch(/te pide una decisión/); expect(t).not.toMatch(/\b(vos|sabés|tenés|decime|mirá)\b/i); expect(t).toMatch(/\*\(técnico · parte .* · brief BRF-0001\)\*$/)
  })
})
