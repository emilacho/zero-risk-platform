/**
 * LA PUERTA DEL PORTERO (GO de Lenovo 28-oct · hallazgo 1 de CC#3) · US$ 0, sin red.
 * El webhook `zero-risk/portero` de n8n pide `x-portero-key` (credencial) Y `x-api-key`; la oficina mandaba solo `x-api-key` y n8n contestó `{"data":"Authorization data is wrong!"}`,
 * que `paquete` guardó como ÉXITO. Aquí: ① solo un portero cuenta como éxito, ② reintento y espera sin gasto, ③ chequeo gratis al abrir, ④ la llave no se escribe en el flujo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { crearPuertos, type Entorno } from '../adaptadores'
import { abrirEncargo, avanzar, PORTERO_NO_RESPONDE, recibirResultado } from '../orquestador'
import { POST_IMG } from '../plantillas/post-img'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { DbFalsa } from './dbfalsa'
import { BUENOS_PROMPTS, CLIENTE, FICHAS_VACIAS, FUENTES, PARTE, PIEZA_OK, correr, crearMemoria, direccionGenerada, observacion, type Guion } from './memoria'

const RAIZ = path.resolve(__dirname, '../../../..')
const leer = (p: string) => fs.readFileSync(path.join(RAIZ, p), 'utf8')
const ENV: Entorno = { baseUrl: 'https://app.test', internalKey: 'k-interna', porteroWebhookKey: 'k-portero', n8nWebhookBase: 'https://n8n.test/webhook' }
const resp = (status: number, cuerpo: unknown, texto?: string) => async () => ({ status, ok: status < 400, text: async () => texto ?? JSON.stringify(cuerpo), json: async () => cuerpo }) as unknown as Response

describe('① el chequeo gratis de la puerta (adaptador real)', () => {
  const chequeo = async (f: (u: string, i?: RequestInit) => Promise<Response>, env: Entorno = ENV) => crearPuertos(new DbFalsa() as never, env, f as never).chequearPortero!()
  it('con las dos llaves buenas el portero contesta 400 de validación: la puerta está viva', async () => {
    let visto: { url: string; h: Record<string, string>; body: string } | null = null
    const r = await chequeo(async (u, i) => { visto = { url: u, h: i!.headers as Record<string, string>, body: String(i!.body) }; return resp(400, { error: 'PORTERO_CLIENTE_INVALIDO', motivo: '«cliente» debe ser un uuid' })() })
    expect(r).toEqual({ ok: true })
    expect(visto!.url).toBe('https://n8n.test/webhook/zero-risk/portero')
    expect(visto!.h['x-portero-key']).toBe('k-portero')
    expect(visto!.h['x-api-key']).toBe('k-interna')
    expect(visto!.body).toBe('{}') // cuerpo vacío: el portero rechaza por validación, no llama al modelo, no cuesta
  })
  it('el rechazo de n8n («Authorization data is wrong!») NO es un portero', async () => {
    const r = await chequeo(resp(403, { data: 'Authorization data is wrong!' }))
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.detalle).toContain('403')
  })
  it('la llave incorrecta del propio portero (401 PORTERO_LLAVE_INCORRECTA) tampoco', async () => {
    expect((await chequeo(resp(401, { error: 'PORTERO_LLAVE_INCORRECTA' }))).ok).toBe(false)
  })
  it('HTML, vacío o caída de red: no es un portero', async () => {
    expect((await chequeo(resp(200, null, '<html>ok</html>'))).ok).toBe(false)
    expect((await chequeo(resp(200, {}, ''))).ok).toBe(false)
    expect((await chequeo(async () => { throw new Error('ECONNRESET') })).ok).toBe(false)
  })
  it('sin la llave en el entorno de pruebas (undefined) no hay chequeo cableado; en producción una llave vacía BLOQUEA y lo dice', async () => {
    expect(crearPuertos(new DbFalsa() as never, { ...ENV, porteroWebhookKey: undefined }, (async () => { throw new Error('no debe llamar') }) as never).chequearPortero).toBeUndefined()
  })
  it('sin PORTERO_WEBHOOK_KEY en el entorno lo dice (la llave sale de Doppler, no se inventa)', async () => {
    const r = await chequeo(resp(400, { error: 'PORTERO_CLIENTE_INVALIDO' }), { ...ENV, porteroWebhookKey: '' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.detalle).toContain('PORTERO_WEBHOOK_KEY')
  })
})

const indicesDe = (t: string) => [...t.matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))
const guion = (o: Partial<Guion> = {}): Guion => ({
  paquete: () => ({ texto: 'material del portero' }),
  direccion_visual: () => ({ texto: direccionGenerada() }),
  prompts: () => ({ texto: BUENOS_PROMPTS }),
  mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }),
  texto: () => ({ texto: PIEZA_OK }),
  revision_jefe: () => ({ texto: FICHAS_VACIAS }),
  corrige: () => ({ texto: '{"respuestas": []}' }), decide: () => ({ texto: '{"respuestas": []}' }), decide_imagen: () => ({ texto: '{"respuestas": []}' }),
  reimagen_prompts: () => ({ texto: BUENOS_PROMPTS }), reimagen_mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }),
  ...o,
})
const abrir = async (chequeo?: () => Promise<{ ok: true } | { ok: false; detalle: string }>, dry = false) => {
  const M = crearMemoria({ plantilla: POST_IMG })
  M.P.fuentes = async () => FUENTES
  if (chequeo) M.P.chequearPortero = chequeo
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: dry, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  return { M, a, id: String(a.cuerpo.encargo_id) }
}

describe('② el chequeo al abrir cada encargo', () => {
  it('puerta rota: NO se crea el encargo, UNA alarma en #alertas y 0 gasto', async () => {
    const { M, a } = await abrir(async () => ({ ok: false, detalle: 'HTTP 403 Authorization data is wrong!' }))
    expect(a.status).toBe(409)
    expect(a.cuerpo).toMatchObject({ error: 'portero_no_responde', pendiente: 'puerta_del_portero' })
    expect(M.encargos.size).toBe(0)
    expect(M.llamadas.avisos.filter((x) => x.canal === 'alertas')).toHaveLength(1)
  })
  it('puerta viva: el encargo se abre como siempre', async () => {
    const { a, M } = await abrir(async () => ({ ok: true }))
    expect(a.status).toBe(200)
    expect(M.encargos.size).toBe(1)
  })
  it('sin chequeo cableado (pruebas y apagado) la oficina abre igual que antes', async () => {
    expect((await abrir()).a.status).toBe(200)
  })
})

describe('③ lo que no es un portero jamás cuenta como éxito', () => {
  it('una respuesta rota en `paquete` se reintenta UNA vez y la pieza sigue con el portero bueno; sin gasto por el fallo', async () => {
    const { M, id } = await abrir()
    let intentos = 0
    const { ultima, pasos } = await correr(M, id, guion({ paquete: () => (++intentos === 1 ? { error: `${PORTERO_NO_RESPONDE} · Authorization data is wrong!`, costo_usd: 0 } : { texto: 'material del portero' }) }))
    expect(intentos).toBe(2)
    expect(pasos.filter((p) => p === 'paquete')).toHaveLength(2)
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado' })
    const turnos = [...M.turnos.get(id)!.values()].filter((t) => t.paso === 'paquete')
    expect(turnos.map((t) => t.estado)).toEqual(['fallo', 'hecho'])
    expect(turnos[0].cost_usd).toBe(0)
  })
  it('si sigue roto: UNA alarma, la pieza ESPERA (ni falla ni gasta) y no hay turno abierto', async () => {
    const { M, id } = await abrir()
    const { ultima } = await correr(M, id, guion({ paquete: () => ({ error: `${PORTERO_NO_RESPONDE} · HTTP 403`, costo_usd: 0 }) }))
    expect(ultima.cuerpo).toMatchObject({ accion: 'esperando_al_portero', veces: 2 })
    const e = M.encargos.get(id)!
    expect(e.estado).toBe('en_paso')
    expect(e.gasto_usd).toBe(0)
    expect(M.llamadas.avisos.filter((x) => x.canal === 'alertas')).toHaveLength(1)
    expect(await M.P.almacen.turnoAbierto(id)).toBeNull()
  })
  it('arreglada la llave, `siguiente` la reanuda en el mismo paso y la alarma no se repite en cada intento', async () => {
    const { M, id } = await abrir()
    await correr(M, id, guion({ paquete: () => ({ error: `${PORTERO_NO_RESPONDE} · HTTP 403`, costo_usd: 0 }) }))
    const otra = await avanzar(M.P, id)
    expect(otra.cuerpo).toMatchObject({ accion: 'esperar' })
    const t = otra.cuerpo.turno as { n: number; paso: string }
    expect(t.paso).toBe('paquete')
    const r = await recibirResultado(M.P, id, t.n, { error: `${PORTERO_NO_RESPONDE} · HTTP 403`, costo_usd: 0 })
    expect(r.cuerpo).toMatchObject({ accion: 'esperando_al_portero', veces: 3 })
    expect(M.llamadas.avisos.filter((x) => x.canal === 'alertas')).toHaveLength(1)
  })
  it('un fallo que NO es del tipo «no era el portero» sigue cerrando fallido como antes', async () => {
    const { M, id } = await abrir()
    const { ultima } = await correr(M, id, guion({ paquete: () => ({ error: 'el modelo se cayó', costo_usd: 0 }) }))
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'fallido' })
  })
})

describe('④ el flujo de n8n', () => {
  const codigo = leer('scripts/worker-staging/oficina/turno-n3p-portero.js')
  const correrNodo = (respuesta: unknown, dry = false) => {
    const f = new Function('$', '$input', '$execution', codigo)
    const entrada = { encargo_id: 'enc-1', dry_run: dry, turno: { n: 2, paso: 'paquete', tipo: 'portero' } }
    return (f(() => ({ first: () => ({ json: entrada }) }), { first: () => ({ json: respuesta }) }, { id: 'ex-1' }) as Array<{ json: { resultado_body: Record<string, unknown> } }>)[0].json.resultado_body
  }
  const PORTERO_BUENO = { caso: 'x', cliente: 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5', ronda: 1, modo: 'conversado', estado: 'ok', material: [], razonar: { costo_usd: 0.03 }, costo_usd: 0.03 }
  it('«Authorization data is wrong!» (con o sin cuerpo envuelto) es error, no texto', () => {
    for (const r of [{ data: 'Authorization data is wrong!' }, { body: { data: 'Authorization data is wrong!' } }]) {
      const b = correrNodo(r)
      expect(String(b.error)).toMatch(/^PORTERO_NO_RESPONDE · Authorization data is wrong!/)
      expect(b.texto).toBeUndefined()
    }
  })
  it('el rechazo del propio portero (error string + motivo), HTML y vacío tampoco son éxito', () => {
    expect(String(correrNodo({ error: 'PORTERO_LLAVE_INCORRECTA', motivo: 'falta o no coincide x-api-key' }).error)).toContain('PORTERO_NO_RESPONDE · PORTERO_LLAVE_INCORRECTA: falta')
    expect(String(correrNodo({ data: '<html>502</html>' }).error)).toContain('PORTERO_NO_RESPONDE')
    expect(String(correrNodo({}).error)).toContain('PORTERO_NO_RESPONDE')
    expect(String(correrNodo({ error: { message: 'timeout' } }).error)).toContain('PORTERO_NO_RESPONDE')
  })
  it('una respuesta de portero de verdad sigue pasando como texto y con su costo', () => {
    const b = correrNodo(PORTERO_BUENO)
    expect(b.error).toBeUndefined()
    expect(JSON.parse(String(b.texto)).modo).toBe('conversado')
    expect(b.costo_usd).toBe(0.03)
  })
  it('el modo seco no llama al portero y no se ve afectado', () => {
    expect(correrNodo({}, true).texto).toContain('simulado')
  })
  it('la llave del portero va por la CREDENCIAL de n8n (la misma que valida el webhook), nunca escrita en el flujo ni en el constructor', () => {
    const c = leer('scripts/worker-staging/oficina/construir-oficina.mjs')
    expect(c).toContain("id: 'fwf6hHajandyfnyz'")
    expect(c).toContain("genericAuthType: 'httpHeaderAuth'")
    expect(c).not.toMatch(/[0-9a-f]{40,}/i)
    expect(c).not.toMatch(/x-portero-key['"]?\s*,\s*value/)
  })
})
