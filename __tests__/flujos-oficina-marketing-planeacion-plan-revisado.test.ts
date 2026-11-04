/**
 * 01-nov · `parar_en: 'plan_revisado'` + tope del redactor (encargo de CC1 · PRESUPUESTO-CC1-corrida-corta-del-plan). US$ 0, sin red.
 * Se ejecuta el CÓDIGO REAL de «⓪ Llave», de «Parar · ¿plan revisado?» y de su resumen del flujo nuevo (`X9F0zp6LQ2xGEYVS`).
 * Lo que fija: el corte cae DESPUÉS de la jefatura y ANTES del PDF a Drive (que es la puerta al brief); las ramas laterales de la revisión
 * (marca de «revisión incompleta», aviso de plan con pendientes) siguen colgando de «Plan vigente»; sin el valor, el camino al PDF es el de hoy.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { recorrer } from './_emulador-n8n'

const RAIZ = path.join(__dirname, '..', 'scripts', 'ops', 'oficina-marketing')
const leer = (c: 'vivo' | 'nuevo') => JSON.parse(fs.readFileSync(path.join(RAIZ, c, 'X9F0zp6LQ2xGEYVS.json'), 'utf8'))
const vivo = leer('vivo'), nuevo = leer('nuevo')
const CLIENTE = '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312'
const ENV = { SALA_DISPATCH_KEY: 'k-sala' }
const web = (body: Record<string, unknown>) => ({ headers: { 'x-sala-dispatch-key': 'k-sala' }, body })
const WEBHOOK = (body: Record<string, unknown>) => ({ 'Webhook · planeacion': [web(body)] })
const salidas = (f: any, n: string) => (f.connections[n]?.main ?? []).map((g: any[]) => g.map((c) => c.node))

describe('«⓪ Llave» admite plan_revisado', () => {
  const llave = (body: Record<string, unknown>) => recorrer(nuevo, '⓪ Llave · Webhook · planeacion', web(body), { env: ENV, hasta: ['V9 · ¿pide el pre-vuelo?', 'Plan anterior · pedir'] })
  it('«plan_revisado» y «guardar_plan» pasan; cualquier otro valor DETIENE antes de gastar', async () => {
    for (const ok of ['plan_revisado', 'guardar_plan']) expect((await llave({ client_id: CLIENTE, parar_en: ok })).ultimo).toBe('Plan anterior · pedir')
    for (const raro of ['plan_revisad', 'PLAN_REVISADO', 'jefatura', '', 0, true, ['plan_revisado']]) await expect(llave({ client_id: CLIENTE, parar_en: raro })).rejects.toThrow(/PLANEACION_PARAR_EN_INVALIDO/)
  })
})

describe('el cableado del corte', () => {
  it('«Plan vigente» sigue con sus ramas laterales y el PDF solo se alcanza pasando por el corte', () => {
    expect(salidas(vivo, 'Plan vigente')[0]).toEqual(['JEF · plan · armar la marca', 'Plan → Drive (PDF)', 'Aviso · plan con pendientes'])
    expect(salidas(nuevo, 'Plan vigente')[0]).toEqual(['JEF · plan · armar la marca', 'Ciclo · armar cierres', 'Aviso · plan con pendientes'])
    expect(salidas(nuevo, 'Ciclo · comprobar')[0]).toEqual(['Parar · ¿plan revisado?'])
    expect(salidas(nuevo, 'Parar · ¿plan revisado?')).toEqual([['Parar · resumen (plan revisado)'], ['¿Compuerta?']])
    const haciaElPdf = Object.entries(nuevo.connections).filter(([, c]: any) => JSON.stringify(c).includes('"Plan → Drive (PDF)"')).map(([de]) => de)
    // tramo 2 · el PDF ya no cuelga de la planeación en el camino del plan: sale del sub-flujo «Plan · segunda mitad» (compuerta o llamada directa)
    expect(haciaElPdf).toEqual([])
  })
  it('«Parar · resumen (plan revisado)» es un final: no conecta con nada', () => {
    expect(nuevo.connections['Parar · resumen (plan revisado)']).toBeUndefined()
  })
  it('el corte «guardar_plan» de antes no se tocó', () => {
    expect(salidas(nuevo, 'Parar · ¿corta aquí?')).toEqual(salidas(vivo, 'Parar · ¿corta aquí?').length ? salidas(vivo, 'Parar · ¿corta aquí?') : [['Parar · resumen'], ['JEF · armar']])
  })
})

describe('la compuerta después de «Plan vigente»', () => {
  const vigente = { id: 'plan-7' }
  it('con «plan_revisado» la corrida termina en el resumen y NO llega al PDF, al cable ni al brief', async () => {
    const r = await recorrer(nuevo, 'Parar · ¿plan revisado?', vigente, { previos: WEBHOOK({ parar_en: 'plan_revisado' }), hasta: ['Plan → Drive (PDF)'] })
    expect(r.pasos).toEqual(['Parar · ¿plan revisado?', 'Parar · resumen (plan revisado)'])
    expect(r.item).toEqual({ parado_en: 'plan_revisado', plan_vigente_id: 'plan-7', jefatura_fase: null, redactor: null })
  })
  it('con la salida real de «Ciclo · comprobar» (trae plan_id, no id) el resumen NO dice plan_vigente_id: null', async () => {
    const r = await recorrer(nuevo, 'Parar · ¿plan revisado?', { ok: true, plan_id: 'plan-9', version: 2, aprobacion_id: 'ap-1', seco: false }, { previos: WEBHOOK({ parar_en: 'plan_revisado' }), hasta: ['Plan → Drive (PDF)'] })
    expect(r.item.plan_vigente_id).toBe('plan-9')
  })
  it('con «guardar_plan», sin parar_en, null o en un disparo que no es webhook, sigue al PDF como hoy', async () => {
    for (const p of [WEBHOOK({ parar_en: 'guardar_plan' }), WEBHOOK({ client_id: CLIENTE }), WEBHOOK({ parar_en: null }), {}]) {
      const r = await recorrer(nuevo, 'Parar · ¿plan revisado?', vigente, { previos: p, hasta: ['¿Compuerta?'] })
      expect(r.pasos).toEqual(['Parar · ¿plan revisado?', '¿Compuerta?'])
    }
  })
})

describe('el camino sin plan', () => {
  const vacio = { texto: '' }
  it('con parar_en (cualquiera de los dos) termina en «Parar · resumen (sin plan)»: ni PDF, ni cable, ni brief', async () => {
    for (const pe of ['guardar_plan', 'plan_revisado']) {
      const r = await recorrer(nuevo, 'Parar · ¿sin plan y con parar_en?', vacio, { previos: WEBHOOK({ parar_en: pe }), hasta: ['¿Salió el PDF?'] })
      expect(r.pasos).toEqual(['Parar · ¿sin plan y con parar_en?', 'Parar · resumen (sin plan)'])
      expect(r.item).toEqual({ parado_en: 'sin_plan', parar_en: pe, plan_guardado_id: null, redactor: null })
    }
    expect(nuevo.connections['Parar · resumen (sin plan)']).toBeUndefined()
  })
  it('sin parar_en (o null, o disparo que no es webhook) sigue a «¿Salió el PDF?» como hoy', async () => {
    for (const p of [WEBHOOK({ client_id: CLIENTE }), WEBHOOK({ parar_en: null }), {}]) {
      const r = await recorrer(nuevo, 'Parar · ¿sin plan y con parar_en?', vacio, { previos: p, hasta: ['¿Salió el PDF?'] })
      expect(r.pasos).toEqual(['Parar · ¿sin plan y con parar_en?', '¿Salió el PDF?'])
    }
  })
  it('«¿Hay plan?» falso solo llega a «¿Salió el PDF?» pasando por el corte; el verdadero sigue al validador', () => {
    expect(salidas(vivo, '¿Hay plan?')[1]).toEqual(['¿Salió el PDF?'])
    expect(salidas(nuevo, '¿Hay plan?')).toEqual([['Validar · ¿se pide?'], ['¿Sin plan · cerrar el pedido?']])
    expect(salidas(nuevo, '¿Sin plan · cerrar el pedido?')).toEqual([['Cambio · fallido'], ['Parar · ¿sin plan y con parar_en?']])
    expect(salidas(nuevo, 'Parar · ¿sin plan y con parar_en?')).toEqual([['Parar · resumen (sin plan)'], ['¿Salió el PDF?']])
  })
})

describe('el tope del redactor', () => {
  it('🔴 el REINTENTO de forma (mismo nodo) también manda el tope', () => {
    expect(salidas(nuevo, 'Validar · ¿reintenta?')[0]).toEqual(['Pedir el plan al redactor'])
  })
  it('«Pedir el plan al redactor» manda max_budget_usd: 2.5 y el resto del cuerpo no cambia', async () => {
    const cuerpo = async (flujo: any) => {
      let visto: any = null
      await recorrer(flujo, 'Pedir el plan al redactor', { pedido: 'P', cliente_id: CLIENTE, redactor_elegido: 'campaign-brief-agent' }, { env: ENV, http: async (_u: any, _h: any, c: any) => { visto = c; return { statusCode: 200, body: {} } }, previos: WEBHOOK({ dry_run: true }), hasta: ['Esperar al redactor'] })
      return visto
    }
    const n = await cuerpo(nuevo), v = await cuerpo(vivo)
    expect(v.max_budget_usd).toBeUndefined()
    expect(n.max_budget_usd).toBe(2.5)
    const { max_budget_usd, ...resto } = n
    expect(resto).toEqual(v)
  })
})
