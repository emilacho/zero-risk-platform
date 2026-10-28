/**
 * EL MATERIAL DE LA OFICINA · la RUTA de vuelta del portero (condición 3 de CC#3), la FORMA de la migración (SIN APLICAR) con su reversa y la rama `esperar_material` del flujo `oficina · turno`. US$ 0: sin red, sin base real.
 */
import fs from 'node:fs'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { abrirEncargo } from '../src/lib/oficina/orquestador'
import { idDelPedido, refDeQuienPide } from '../src/lib/oficina/material'
import { materialDe } from '../src/lib/oficina/material-orquestador'
import { POST_IMG } from '../src/lib/oficina/plantillas/post-img'
import { TARGET_STEP_PRODUCIR } from '../src/lib/oficina/sobre'
import { FUENTES, CLIENTE, PARTE, BUENOS_PROMPTS, FICHAS_VACIAS, PIEZA_OK, correr, crearMemoria, direccionGenerada, observacion, type Memoria } from '../src/lib/oficina/__tests__/memoria'
import { conEsperaDelMaterial, LINEA_MATERIAL, NODO_Y_AHORA } from '../scripts/ops/material-oficina/nucleo.mjs'

const h = vi.hoisted(() => ({ M: null as unknown }))
vi.mock('@/lib/oficina/ruta', async (original) => ({ ...(await original<typeof import('@/lib/oficina/ruta')>()), puertosReales: () => ({ P: (h.M as { P: unknown }).P, db: {} }) }))
import { POST } from '../src/app/api/oficina/material-vuelta/route'

const INTERNA = 'llave-interna-de-prueba-material'
const DESPACHO = 'llave-de-despacho-de-prueba-material'
const llamarCon = async (cuerpo: unknown, cab: Record<string, string> = { 'x-api-key': INTERNA }) => {
  const r = await POST(new Request('http://app.test/api/oficina/material-vuelta', { method: 'POST', headers: { 'content-type': 'application/json', ...cab }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) }))
  return { status: r.status, j: (await r.json()) as Record<string, any> }
}
const indicesDe = (t: string) => [...t.matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))
const conFotos = (): Record<string, unknown> => ({ estado: 'completo', costo_usd: 0.1, huecos: [{ hueco: { tipo: 'fotos' }, estado: 'ya_esta', fotos: [{ foto_id: 'p-1', origen: 'propia', que_muestra: 'ceviche', producto_visto: ['Ceviches'], url: 'https://fotos.test/p-1.jpg' }] }] })

async function esperando(): Promise<{ M: Memoria; id: string; n: number }> {
  const plantilla = { ...POST_IMG, limites: { ...POST_IMG.limites, material_activo: true } }
  const M = crearMemoria({ plantilla })
  M.P.fuentes = async () => ({ ...FUENTES, fotos: [] })
  M.P.cerebro = { avisarA: 'https://zero-risk-platform.vercel.app/api/oficina/material-vuelta', pedir: async () => ({ ok: true, body: { estado: 'en_proceso', huecos: [{ estado: 'en_cadena' }] } }), leerPedido: async () => ({ ok: true, body: { estado: 'en_proceso' } }) }
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: false, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  const { ultima } = await correr(M, id, { paquete: () => ({ texto: 'portero' }) })
  return { M, id, n: (ultima.cuerpo.turno as { n: number }).n }
}

describe('POST /api/oficina/material-vuelta', () => {
  let M!: Memoria; let id!: string; let n!: number
  const guardadas: Record<string, string | undefined> = {}
  beforeEach(async () => {
    for (const k of ['INTERNAL_API_KEY', 'SALA_DISPATCH_KEY']) guardadas[k] = process.env[k]
    process.env.INTERNAL_API_KEY = INTERNA; process.env.SALA_DISPATCH_KEY = DESPACHO
    ;({ M, id, n } = await esperando()); h.M = M
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 200 })))
  })
  afterEach(() => { vi.unstubAllGlobals(); for (const [k, v] of Object.entries(guardadas)) { if (v === undefined) delete process.env[k]; else process.env[k] = v } })
  const aviso = (o: Record<string, unknown> = {}) => ({ pedido_id: idDelPedido(id, n, 'foto'), ref_de_quien_pide: refDeQuienPide(id, n), ...conFotos(), ...o })

  it('la llave interna es la ÚNICA que abre: sin llave 401, equivocada 401, la de despacho NO vale (ni en su cabecera ni en x-api-key)', async () => {
    expect((await llamarCon(aviso(), {})).status).toBe(401)
    expect((await llamarCon(aviso(), { 'x-api-key': 'otra' })).status).toBe(401)
    expect((await llamarCon(aviso(), { 'x-sala-dispatch-key': DESPACHO })).status).toBe(401)
    expect((await llamarCon(aviso(), { 'x-api-key': DESPACHO })).status).toBe(401)
    expect((await llamarCon(aviso(), { 'x-api-key': INTERNA.slice(0, -1) })).status).toBe(401) // largo distinto: no lanza, rechaza
    expect(materialDe(M.encargos.get(id)!.estado_del_motor)!.estado).toBe('abierto') // nada de eso tocó el encargo
  })
  it('sin INTERNAL_API_KEY en el entorno la ruta se cierra (503) y si las dos llaves son la misma también', async () => {
    delete process.env.INTERNAL_API_KEY
    expect((await llamarCon(aviso(), { 'x-api-key': INTERNA })).status).toBe(503)
    process.env.INTERNAL_API_KEY = DESPACHO
    const r = await llamarCon(aviso(), { 'x-api-key': DESPACHO })
    expect(r.status).toBe(503); expect(r.j.error).toBe('llaves_iguales')
  })
  it.each([['no es JSON', 'no es json'], ['no es un objeto', '[]']])('entrada inválida (%s) = 400 y no cambia nada', async (_n, cuerpo) => {
    expect((await llamarCon(cuerpo)).status).toBe(400)
  })
  it('sin ref_de_quien_pide o con una ref mal formada = 400', async () => {
    expect((await llamarCon({ pedido_id: 'x' })).status).toBe(400)
    expect((await llamarCon(aviso({ ref_de_quien_pide: 'no-es-una-ref' }))).status).toBe(400)
  })
  it('un aviso válido reanuda el MISMO paso, sin ningún flujo intermedio, y despierta al flujo de la oficina para el siguiente empleado', async () => {
    const r = await llamarCon(aviso())
    expect(r.status).toBe(200)
    expect(r.j).toMatchObject({ accion: 'esperar', turno: { paso: 'direccion_visual' }, despertado: true })
    const f = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(f).toHaveLength(1)
    expect(String(f[0][0])).toMatch(/\/zero-risk\/oficina-turno$/)
    expect(JSON.parse(String((f[0][1] as RequestInit).body)).encargo_id).toBe(id)
  })
  it('la ref de OTRO encargo sin turno abierto = 404; la de otro turno o pedido = sin_efecto (200) y no despierta a nadie', async () => {
    expect((await llamarCon(aviso({ ref_de_quien_pide: refDeQuienPide('00000000-0000-4000-8000-0000000000ff', n) }))).status).toBe(404)
    const otroTurno = await llamarCon(aviso({ ref_de_quien_pide: refDeQuienPide(id, n + 5) }))
    expect(otroTurno.status).toBe(200); expect(otroTurno.j.accion).toBe('sin_efecto')
    const otroPedido = await llamarCon(aviso({ pedido_id: idDelPedido(id, n, 'hecho') }))
    expect(otroPedido.j.accion).toBe('sin_efecto')
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(0)
    expect(materialDe(M.encargos.get(id)!.estado_del_motor)!.estado).toBe('abierto')
  })
  it('un aviso repetido o tardío no hace nada ni despierta dos veces', async () => {
    expect((await llamarCon(aviso())).j.accion).toBe('esperar')
    const otra = await llamarCon(aviso())
    expect(otra.status).toBe(200); expect(otra.j.accion).toBe('sin_efecto')
    expect((globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls).toHaveLength(1)
  })
  it('son las ÚNICAS rutas de la oficina que aceptan la llave interna (material-vuelta y las herramientas de la mesa): el código lo declara y las demás siguen con la de despacho', () => {
    const fuente = fs.readFileSync(path.join(process.cwd(), 'src/app/api/oficina/material-vuelta/route.ts'), 'utf8')
    expect(fuente).toMatch(/checkInternalKey/)
    expect(fuente).not.toMatch(/checkLlaveDeLaSala/)
    const dir = path.join(process.cwd(), 'src/app/api/oficina')
    const rutas = fs.readdirSync(dir, { recursive: true }).map(String).filter((f) => f.endsWith('route.ts'))
    const conInterna = rutas.filter((f) => /checkInternalKey|requireInternalKey|INTERNAL_API_KEY/.test(fs.readFileSync(path.join(dir, f), 'utf8')))
    expect(conInterna.map((f) => f.replace(/\\/g, '/'))).toEqual(['material-vuelta/route.ts', 'mesa/herramienta/route.ts'])
  })
  it('la pieza termina en la bandeja después del aviso (end to end)', async () => {
    await llamarCon(aviso())
    const { ultima } = await correr(M, id, {
      direccion_visual: () => ({ texto: direccionGenerada() }), prompts: () => ({ texto: BUENOS_PROMPTS }), mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }),
      texto: () => ({ texto: PIEZA_OK }), revision_jefe: () => ({ texto: FICHAS_VACIAS }), corrige: () => ({ texto: '{"respuestas": []}' }), decide: () => ({ texto: '{"respuestas": []}' }), decide_imagen: () => ({ texto: '{"respuestas": []}' }),
    })
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(M.llamadas.bandeja).toHaveLength(1)
  })
})

// ═══════════════════════════════════════════════════════════ la migración (SIN APLICAR)
const RAIZ = process.cwd()
const leer = (rel: string): string => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r/g, '')
describe('la migración del material y de «generar si no hay foto» (sin aplicar) y su reversa', () => {
  const mig = leer('supabase/migrations/202610271900_oficina_material_y_generar_si_falta.sql')
  const rev = leer('supabase/reversas/202610271900_oficina_material_y_generar_si_falta_REVERSA.sql')
  it('amplía el CHECK de los turnos con «material» y conserva los tipos anteriores', () => {
    expect(mig).toMatch(/CHECK \(tipo IN \('portero', 'agente', 'codigo', 'externo', 'brazo', 'jefatura', 'material'\)\)/)
    expect(rev).toMatch(/CHECK \(tipo IN \('portero', 'agente', 'codigo', 'externo', 'brazo', 'jefatura'\)\)/)
  })
  it('nace con el material APAGADO, no toca el tope del encargo ni los pasos, y fusiona (no reemplaza) los límites', () => {
    expect(mig).toContain('"material_activo":false')
    const sql = mig.replace(/^--.*$/gm, '')
    expect(sql).not.toMatch(/tope_encargo_usd/)
    expect(sql).not.toMatch(/\bpasos\s*=/)
    expect(mig).toMatch(/limites = limites \|\|/)
    expect(mig).toContain('"imagenes_generadas_max":8')
  })
  it('no enciende lo que espera la firma de Emilio (tope de 2,50 y DESCARTAR_EYEBROW_LARGO)', () => {
    expect(mig.replace(/^--.*$/gm, '')).not.toMatch(/2[.,]50|DESCARTAR_EYEBROW_LARGO/)
  })
  it('se niega con encargos en vuelo y verifica el resultado; la reversa se niega si ya hay turnos de material', () => {
    expect(mig).toMatch(/estado IN \('abierto', 'en_paso'\)[\s\S]*RAISE EXCEPTION/)
    expect(mig).toMatch(/n <> 3[\s\S]*RAISE EXCEPTION/)
    expect(rev).toMatch(/tipo = 'material'[\s\S]*RAISE EXCEPTION/)
  })
  it('la reversa quita exactamente las llaves que la migración puso', () => {
    for (const k of ['material_activo', 'material_plazo_min', 'material_techo_min', 'material_tope_usd', 'material_max_pedidos_por_encargo', 'generar_cuando_no_hay_foto', 'roles_sin_imagen']) {
      expect(mig).toContain(`"${k}"`); expect(rev).toContain(`'${k}'`)
    }
  })
})

// ═══════════════════════════════════════════════════════════ el flujo `oficina · turno`
describe('el flujo `oficina · turno` · rama `esperar_material` (SIN PUBLICAR: se publica antes de encender el material)', () => {
  const flujo = (js: string) => ({ nodes: [{ name: '⓪ Entrada · llave', parameters: {} }, { name: NODO_Y_AHORA, parameters: { jsCode: js } }] })
  const ESPERAR = "if (status === 200 && b.accion === 'esperar' && b.turno) return [{ json: { ruta: 'esperar', turno_body: { encargo_id: c.encargo_id, turno: b.turno } } }]"
  const JEFATURA = "if (status === 200 && b.accion === 'esperar_jefatura') return []"
  it('agrega la rama justo después de la de la jefatura (o de «esperar» si el nodo aún no la tiene) y termina SIN error', () => {
    const conJ = conEsperaDelMaterial(flujo(`${ESPERAR}\n${JEFATURA}\nthrow new Error('OFICINA_TURNO_RECHAZADO')`)).nodes[1].parameters.jsCode as string
    expect(conJ.indexOf(LINEA_MATERIAL)).toBeGreaterThan(conJ.indexOf(JEFATURA))
    expect(conJ.indexOf(LINEA_MATERIAL)).toBeLessThan(conJ.indexOf('throw new Error'))
    const sinJ = conEsperaDelMaterial(flujo(`${ESPERAR}\nthrow new Error('X')`)).nodes[1].parameters.jsCode as string
    expect(sinJ).toContain("b.accion === 'esperar_material') return []")
    // ejecuta el nodo con una respuesta `esperar_material`: devuelve [] y NO lanza
    const f = new Function('status', 'b', 'c', `${sinJ.replace(/\$\(/g, 'void(')}\nreturn 'siguió'`)
    expect(f(200, { accion: 'esperar_material' }, { encargo_id: 'x' })).toEqual([])
    expect(() => f(200, { accion: 'otra' }, { encargo_id: 'x' })).toThrow('X')
  })
  it('se niega si el nodo ya la tiene, si el nodo no está una sola vez o si la línea ancla cambió', () => {
    const ya = conEsperaDelMaterial(flujo(`${ESPERAR}\nthrow new Error('X')`))
    expect(() => conEsperaDelMaterial(ya)).toThrow(/ya conoce esperar_material/)
    expect(() => conEsperaDelMaterial({ nodes: [] })).toThrow(/UN nodo/)
    expect(() => conEsperaDelMaterial(flujo('return []'))).toThrow(/línea ancla/)
  })
  it('es pura: el flujo de entrada no se modifica', () => {
    const f = flujo(`${ESPERAR}\nthrow new Error('X')`)
    const antes = JSON.stringify(f)
    conEsperaDelMaterial(f)
    expect(JSON.stringify(f)).toBe(antes)
  })
  it('el nodo del repositorio (fuente del flujo) ya conoce las dos esperas', () => {
    const js = leer('scripts/worker-staging/oficina/turno-n4-sigue.js')
    expect(js).toMatch(/b\.accion === 'esperar_jefatura' \|\| b\.accion === 'esperar_material'/)
  })
})
