/**
 * F4 v2.1 · LA OFICINA CONDUCIDA POR EL PLAN (CC#1 · 15-oct): el camino que faltaba. Nadie copiaba `finanzas_id` / `finanzas_motivo` al sobre del plan; ahora el propio flujo de planeación
 * pide la oficina, la avanza paso a paso (tope de 40 pasos y 15 min) y lleva el resultado a «Redactor (B4)». US$ 0: n8n en miniatura, código REAL de los nodos, rutas simuladas.
 *
 * Camino: sobre del plan (plan_v3 + client_id, sin finanzas_id ni motivo) → «FIN · ¿abre la oficina?» → armar semilla → POST /api/finanzas/conversa abrir → (avanzar × N) → leer →
 *         «FIN · cerrar la oficina» (`finanzas_id` si hay tablero; `finanzas_motivo` de lista cerrada si no) → «FIN · sobre» → «FIN · ¿trae finanzas_id?» → leer el tablero → «Redactor (B4)».
 */
import { describe, expect, it } from 'vitest'
import { antesDeF4, enganchaFinanzas, FIN, NODOS, NOMBRES_NUEVOS, OF, MAX_PASOS_OFICINA, PLAZO_OFICINA_MS } from '../scripts/worker-staging/finanzas-f4/construir-f4.mjs'
import { correr } from '../scripts/worker-staging/finanzas-f4/n8n-mini.mjs'

type Json = Record<string, any>
const antes = antesDeF4() as Json
const flujo = enganchaFinanzas(antes) as Json
const ID = '3f2b8c1e-9d4a-4b7e-8a61-0c5d2e7f9a10'
const MANUAL = { client_id: 'x-1', manual_id: 'm1', manual_aprobado: true, registro_del_manual: { registro: 'tuteo', fuente: 'declarado_en_el_manual', pruebas: [] }, identidad_del_manual: { primary_colors: ['#112233'], tone: 'cercano' } }
const paquete = { ficha: { id: 'x-1', name: 'Negocio de práctica', country: 'Ecuador', industry: 'restaurante', config: { spend_cap_usd: 9 } }, manual: MANUAL, material: [], descartados: [], referencia: 'DOCUMENTO', casa: {}, plata: {}, hechos_del_dueno: ['Atiende por cita previa.'] }
const NUMEROS = [
  { clave: 'meta_por_semana', valor: 15, minimo: null, maximo: null, tipo: 'dato' },
  { clave: 'pauta_rendimiento_mes', valor: 225.33, minimo: null, maximo: null, tipo: 'supuesto' },
  { clave: 'total_mes', valor: 375.56, minimo: null, maximo: null, tipo: 'supuesto' },
]
const RESUMEN = { lineas: ['Meta: 15 ventas por semana.'], alertas: [] }
const tablero = (estado: string) => ({ statusCode: 200, body: { finanzas_id: ID, estado, huella: 'h', numeros: NUMEROS, semanas: 12, resumen: RESUMEN, montos_declarados: [] } })

/** pasa-todo para lo que no es de esta prueba (todo lo que sigue a B4); B4 y los nodos FIN corren con su código REAL */
const stubs = () => Object.fromEntries(flujo.nodes
  .filter((n: Json) => n.name !== NODOS.b4 && !NOMBRES_NUEVOS.includes(n.name) && n.name !== 'Webhook · planeacion')
  .map((n: Json) => [n.name, (items: unknown[]) => items]))

interface Guion {
  abrir?: Json
  avanzar?: Json[]   // una por llamada; la última se repite
  leer?: Json
  tablero?: Json
}
async function ejecutar(body: Json, g: Guion = {}, paq: Json = paquete) {
  let k = 0
  const http: Record<string, (c: Json) => Json> = {
    [OF.abrir]: () => g.abrir ?? { statusCode: 200, body: { encargo_id: 'enc-1', estado: 'abierto' } },
    [OF.avanzar]: () => { const l = g.avanzar ?? [{ statusCode: 200, body: { terminado: true, estado: 'cerrado' } }]; return l[Math.min(k++, l.length - 1)] },
    [OF.leer]: () => g.leer ?? { statusCode: 200, body: { estado: 'cerrado', turnos: [] } },
    [FIN.leer]: () => g.tablero ?? { statusCode: 404, body: { error: 'tablero_inexistente' } },
  }
  const r = await correr(flujo, {
    inicio: NODOS.unir, itemsDeInicio: [{ json: paq }], previos: { 'Webhook · planeacion': { body } }, stubs: stubs(), http,
    env: { ZERO_RISK_API_URL: 'https://api.ejemplo.invalid', INTERNAL_API_KEY: 'llave-de-prueba' }, maxPasos: 600,
  })
  const b4 = r.visitas.find((v: Json) => v.nodo === NODOS.b4)
  return { r, b4: b4?.salida?.[0] as Json | undefined, llamadas: r.llamadasHttp as Json[] }
}
const hoy = async () => {
  const { b4 } = await ejecutar({ client_id: 'x-1', dry_run: false })
  return b4!
}
const SOBRE = { plan_v3: true, client_id: 'x-1', dry_run: false }
const firma = (salida: Json) => ({ statusCode: 200, body: { estado: salida.__estado ?? 'cerrado', turnos: [{ paso: 'firma', salida: { ...salida, __estado: undefined } }] } })

describe('el camino exacto (con la oficina encendida)', () => {
  it('FIRMADO: abre → avanza hasta terminar → lee → finanzas_id al sobre → el redactor recibe el bloque firmado', async () => {
    const g: Guion = {
      avanzar: [{ statusCode: 200, body: { terminado: false, paso: 'planteo' } }, { statusCode: 200, body: { terminado: false, paso: 'fpa' } }, { statusCode: 200, body: { terminado: true, estado: 'cerrado' } }],
      leer: firma({ estado: 'firmado', finanzas_id: ID }), tablero: tablero('firmado'),
    }
    const { b4, llamadas, r } = await ejecutar(SOBRE, g)
    expect(llamadas.filter((l) => l.nodo === OF.abrir)).toHaveLength(1)
    expect(llamadas.filter((l) => l.nodo === OF.avanzar)).toHaveLength(3)
    // el sobre de la llamada: la oficina se abre con SU workflow y su ejecución (run-sdk los exige), el cliente y una semilla acotada
    const abrir = llamadas.find((l) => l.nodo === OF.abrir)!
    expect(abrir.url).toBe('https://api.ejemplo.invalid/api/finanzas/conversa')
    expect(abrir.cabeceras['x-api-key']).toBe('llave-de-prueba')
    expect(abrir.cuerpo).toMatchObject({ accion: 'abrir', client_id: 'x-1', dry_run: false })
    expect(abrir.cuerpo.semilla).toMatchObject({ rubro: 'restaurante', pais: 'Ecuador' })
    expect(JSON.stringify(abrir.cuerpo.semilla).length).toBeLessThan(5000)
    expect(llamadas.find((l) => l.nodo === FIN.leer)!.cuerpo).toEqual({ accion: 'leer', finanzas_id: ID, client_id: 'x-1' })
    expect(b4!.finanzas_id_usado).toBe(ID)
    expect(b4!.finanzas_estado_usado).toBe('firmado')
    expect(b4!.pedido).toContain('NÚMEROS DE LA OFICINA FINANCIERA (firmados)')
    expect(r.nombres.indexOf(OF.sobre)).toBeLessThan(r.nombres.indexOf(FIN.si))
  })

  it('SIN ACUERDO con bloque: el plan recibe el bloque rotulado «SIN FIRMA · sin_acuerdo»', async () => {
    const g: Guion = { leer: firma({ estado: 'sin_firma', finanzas_id: ID, sin_acuerdo: true, __estado: 'sin_acuerdo' }), tablero: tablero('sin_firma') }
    const { b4 } = await ejecutar(SOBRE, g)
    expect(b4!.pedido).toContain('SIN FIRMA · sin_acuerdo')
    expect(b4!.finanzas_motivo_usado).toBe('sin_acuerdo')
    expect(b4!.contexto_chequeo.finanzas.estado).toBe('sin_firma')
  })

  it('SIN FIRMA (el jefe no firmó): motivo «sin_firma»', async () => {
    const g: Guion = { leer: firma({ estado: 'sin_firma', finanzas_id: ID, sin_acuerdo: false }), tablero: tablero('sin_firma') }
    const { b4 } = await ejecutar(SOBRE, g)
    expect(b4!.finanzas_motivo_usado).toBe('sin_firma')
    expect(b4!.pedido).toContain('SIN FIRMA · sin_firma')
  })

  it('SIN BLOQUE (sin referencia / sin pauta): sin tablero, el motivo viaja y el redactor recibe el aviso', async () => {
    for (const [motivo, esperado] of [['sin_base', 'sin_referencia'], ['sin_pauta', 'sin_pauta'], ['otra_cosa', 'sin_bloque']] as const) {
      const g: Guion = { leer: firma({ estado: 'sin_bloque', motivo, finanzas_id: null, __estado: 'sin_acuerdo' }), tablero: { statusCode: 400, body: { error: 'entrada_invalida' } } }
      const { b4, llamadas } = await ejecutar(SOBRE, g)
      expect(b4!.pedido, motivo).toContain('SIN NÚMEROS FIRMADOS')
      expect(b4!.finanzas_motivo_usado, motivo).toBe(esperado)
      expect(b4!.finanzas_id_usado, motivo).toBeNull()
      // sin finanzas_id la lectura del tablero ni se intenta con un id inventado
      expect(llamadas.find((l) => l.nodo === FIN.leer)?.cuerpo?.finanzas_id ?? null, motivo).toBeNull()
    }
  })

  it('VENCIDO por tope de la conversación (cierre_por_tope) y por nunca terminar (40 pasos)', async () => {
    const porTope = await ejecutar(SOBRE, { leer: { statusCode: 200, body: { estado: 'cierre_por_tope', turnos: [] } } })
    expect(porTope.b4!.finanzas_motivo_usado).toBe('vencido')
    const sinFin = await ejecutar(SOBRE, { avanzar: [{ statusCode: 200, body: { terminado: false, paso: 'fpa' } }] })
    expect(sinFin.b4!.finanzas_motivo_usado).toBe('vencido')
    expect(sinFin.llamadas.filter((l) => l.nodo === OF.avanzar).length).toBeLessThanOrEqual(MAX_PASOS_OFICINA)
    expect(sinFin.llamadas.filter((l) => l.nodo === OF.avanzar).length).toBeGreaterThan(MAX_PASOS_OFICINA - 3)
  })

  it('la conversación se cae a mitad (500) o no abre (500): «sin_bloque», el plan sale', async () => {
    const aMitad = await ejecutar(SOBRE, { avanzar: [{ statusCode: 200, body: { terminado: false } }, { statusCode: 500, body: {} }] })
    expect(aMitad.b4!.finanzas_motivo_usado).toBe('sin_bloque')
    const noAbre = await ejecutar(SOBRE, { abrir: { statusCode: 500, body: { error: 'no_se_pudo_abrir' } } })
    expect(noAbre.b4!.finanzas_motivo_usado).toBe('sin_bloque')
    expect(noAbre.llamadas.filter((l) => l.nodo === OF.avanzar)).toHaveLength(0)
  })

  it('ENSAYO (dry_run): no hay tablero; el plan recibe «sin_firma», nunca un bloque inventado', async () => {
    const g: Guion = { leer: firma({ estado: 'firmado', finanzas_id: null }) }
    const { b4, llamadas } = await ejecutar({ ...SOBRE, dry_run: true }, g)
    expect(b4!.finanzas_motivo_usado).toBe('sin_firma')
    expect(llamadas.find((l) => l.nodo === OF.abrir)!.cuerpo.dry_run).toBe(true)
  })
})

describe('apagado = idéntico a hoy', () => {
  it('oficina APAGADA (409): el pedido y la salida de B4 son los de hoy, byte por byte', async () => {
    const a = await hoy()
    const { b4, llamadas } = await ejecutar(SOBRE, { abrir: { statusCode: 409, body: { error: 'conversa_apagada' } } })
    expect(JSON.stringify(b4)).toBe(JSON.stringify(a))
    expect(llamadas.filter((l) => String(l.url).includes('finanzas'))).toHaveLength(1) // solo el intento de abrir
  })
  it('sin plan_v3, o sin client_id: ni se intenta abrir la oficina y B4 sale idéntico', async () => {
    const a = await hoy()
    for (const body of [{ client_id: 'x-1', dry_run: false }, { plan_v3: true, dry_run: false }, { plan_v3: false, client_id: 'x-1' }]) {
      const { b4, llamadas } = await ejecutar(body)
      expect(JSON.stringify(b4), JSON.stringify(body)).toBe(JSON.stringify(a))
      expect(llamadas.filter((l) => String(l.url).includes('finanzas')), JSON.stringify(body)).toHaveLength(0)
    }
  })
  it('si la sala YA trae finanzas_id o finanzas_motivo, no se abre otra oficina (no se paga dos veces)', async () => {
    for (const extra of [{ finanzas_id: ID }, { finanzas_motivo: 'sin_acuerdo' }]) {
      const { llamadas } = await ejecutar({ ...SOBRE, ...extra }, { tablero: tablero('firmado') })
      expect(llamadas.filter((l) => l.nodo === OF.abrir || l.nodo === OF.avanzar), JSON.stringify(extra)).toHaveLength(0)
    }
  })
  it('el paquete que recibe B4 por el camino de la oficina es el ORIGINAL (la oficina no lo altera)', async () => {
    const { r } = await ejecutar(SOBRE, { leer: firma({ estado: 'firmado', finanzas_id: ID }), tablero: tablero('firmado') })
    const entradaB4 = r.visitas.find((v: Json) => v.nodo === NODOS.b4)!.entrada[0]
    expect(entradaB4).toEqual(paquete)
  })
})

describe('mutación: las guardas del cierre mueren si se rompen', () => {
  const codigo = (n: string) => String(flujo.nodes.find((x: Json) => x.name === n)!.parameters.jsCode)
  const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<any>
  it('«decidir»: pasado el plazo de 15 min el motivo es «vencido» (reloj falso)', async () => {
    const f = new AsyncFunction('$input', '$', '$runIndex', codigo(OF.decidir))
    const t0 = 1_700_000_000_000
    const $ = (n: string) => ({ first: () => ({ json: n === OF.armar ? { t0 } : { encargo_id: 'enc-1' } }) })
    const real = Date.now
    try {
      Date.now = () => t0 + PLAZO_OFICINA_MS + 1000
      const pasado = (await f({ first: () => ({ json: { statusCode: 200, body: { terminado: false } } }) }, $, 3))[0].json
      expect(pasado).toMatchObject({ fin: true, finanzas_motivo: 'vencido' })
      Date.now = () => t0 + 1000
      const dentro = (await f({ first: () => ({ json: { statusCode: 200, body: { terminado: false } } }) }, $, 3))[0].json
      expect(dentro).toMatchObject({ fin: false })
      const terminado = (await f({ first: () => ({ json: { statusCode: 200, body: { terminado: true, estado: 'cerrado' } } }) }, $, 3))[0].json
      expect(terminado).toMatchObject({ fin: true, leer: true })
    } finally { Date.now = real }
  })
  it('«cerrar»: un `firmado` SIN finanzas_id nunca se entrega como firmado', async () => {
    const f = new AsyncFunction('$', codigo(OF.cerrar))
    const $ = (n: string) => ({ first: () => ({ json: n === OF.decidir ? { fin: true, leer: true, estado: 'cerrado' } : n === OF.leer ? { statusCode: 200, body: { estado: 'cerrado', turnos: [{ paso: 'firma', salida: { estado: 'firmado', finanzas_id: null } }] } } : { body: {} } }) })
    const r = (await f($))[0].json
    expect(r.finanzas_id).toBeNull()
    expect(r.finanzas_motivo).toBe('sin_firma')
  })
})
