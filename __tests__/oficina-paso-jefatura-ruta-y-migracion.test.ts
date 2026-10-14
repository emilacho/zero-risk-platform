/**
 * J8a · la RUTA de vuelta `/api/jefatura/oficina-vuelta` y la FORMA de la migración del paso `jefatura` (SIN APLICAR) con su reversa. US$ 0: sin red, sin base real.
 */
import fs from 'node:fs'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { abrirEncargo } from '../src/lib/oficina/orquestador'
import { CARRUSEL_IG_V1 } from '../src/lib/oficina/plantillas/carrusel-ig-v1'
import { CARRUSEL_IG_CON_JEFATURA, KIT_HISTORIAS_CON_JEFATURA, POST_IMG_CON_JEFATURA } from '../src/lib/oficina/plantillas/con-jefatura'
import { KIT_HISTORIAS } from '../src/lib/oficina/plantillas/kit-historias'
import { POST_IMG } from '../src/lib/oficina/plantillas/post-img'
import { validarPlantilla } from '../src/lib/oficina/plantilla'
import { TARGET_STEP_PRODUCIR } from '../src/lib/oficina/sobre'
import type { Plantilla } from '../src/lib/oficina/tipos'
import { BUENOS_PROMPTS, CLIENTE, PARTE, PIEZA_OK, REGLAS_CEVICHE, correr, crearMemoria, direccionGenerada, observacion, type Memoria } from '../src/lib/oficina/__tests__/memoria'

const h = vi.hoisted(() => ({ M: null as unknown }))
vi.mock('@/lib/oficina/ruta', async (original) => ({ ...(await original<typeof import('@/lib/oficina/ruta')>()), puertosReales: () => ({ P: (h.M as { P: unknown }).P, db: {} }) }))
import { POST } from '../src/app/api/jefatura/oficina-vuelta/route'

const LLAVE = process.env.SALA_DISPATCH_KEY ?? 'test-dispatch-key-e67'
const pedir = (cuerpo: unknown, cab: Record<string, string> = { 'x-sala-dispatch-key': LLAVE }) => new Request('http://app.test/api/jefatura/oficina-vuelta', { method: 'POST', headers: { 'content-type': 'application/json', ...cab }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) })
const llamar = async (cuerpo: unknown, cab?: Record<string, string>) => { const r = await POST(pedir(cuerpo, cab)); return { status: r.status, j: (await r.json()) as Record<string, any> } }

const salida = (id: string, o: Record<string, unknown> = {}) => ({ revision_id: 'rev-1', artifact_type: 'pieza', artifact_id: id, resultado: 'limpia', marcas: { con_desacuerdo: false, sin_segunda_mirada: false }, artefacto_final: {}, versiones: [], respuestas: [], opinion_externa: null, imagen_por_rehacer: false, desacuerdos: [], costo_usd: 0.2, pasos: 3, trace_id: 'jefatura:rev-1', devolver_a: null, simulado: false, ...o })

async function esperando(): Promise<{ M: Memoria; id: string }> {
  const M = crearMemoria({ plantilla: POST_IMG_CON_JEFATURA })
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: false, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  M.P.jefatura = async () => ({ estado: 'esperando', revision_id: 'rev-1' })
  await correr(M, id, { paquete: () => ({ texto: 'portero' }), direccion_visual: () => ({ texto: direccionGenerada(REGLAS_CEVICHE) }), prompts: () => ({ texto: BUENOS_PROMPTS }), mirar: (_n, t) => ({ texto: observacion([...t.matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))) }), texto: () => ({ texto: PIEZA_OK }) })
  return { M, id }
}

describe('POST /api/jefatura/oficina-vuelta', () => {
  let M!: Memoria
  let id!: string
  beforeEach(async () => { ({ M, id } = await esperando()); h.M = M })
  it('la llave de la sala: sin llave 401, equivocada 401, la interna no vale, sin la variable 503', async () => {
    expect((await llamar({}, {})).status).toBe(401)
    expect((await llamar({}, { 'x-sala-dispatch-key': 'otra' })).status).toBe(401)
    expect((await llamar({}, { 'x-api-key': 'la-interna' })).status).toBe(401)
    const guardada = process.env.SALA_DISPATCH_KEY
    delete process.env.SALA_DISPATCH_KEY
    try { expect((await llamar({}, { 'x-sala-dispatch-key': 'x' })).status).toBe(503) } finally { process.env.SALA_DISPATCH_KEY = guardada }
    expect(M.llamadas.bandeja).toHaveLength(0)
  })
  it.each([
    ['no es JSON', 'no es json'], ['no es objeto', '[]'], ['sin salida', {}], ['salida de otro tipo', { salida: salida(id, { artifact_type: 'plan' }) }],
    ['artifact_id que no es uuid', { salida: salida('no-es-uuid') }], ['sin resultado', { salida: { ...salida(id), resultado: undefined } }],
  ])('entrada inválida (%s) = 400 y no cambia nada', async (_n, cuerpo) => {
    expect((await llamar(cuerpo)).status).toBe(400)
    expect(M.llamadas.bandeja).toHaveLength(0)
  })
  it.each(['brief', 'estrategia', 'calendario', 'manual', 'plan', 'Pieza', '', null, 7])('hueco 7 · un artifact_type que no es «pieza» (%j) se rechaza con 400 y no cambia nada', async (tipo) => {
    const r = await llamar({ salida: salida(id, { artifact_type: tipo }) })
    expect(r.status).toBe(400); expect(r.j.errores.join(' ')).toMatch(/pieza/)
    expect(M.llamadas.bandeja).toHaveLength(0)
  })
  it('una entrega buena aplica la salida al encargo, lo hace seguir y deja UNA pieza en la bandeja', async () => {
    const r = await llamar({ marcas: { con_desacuerdo: false, sin_segunda_mirada: false }, salida: salida(id) })
    expect(r.status).toBe(200); expect(r.j).toMatchObject({ accion: 'cerrado', estado: 'cerrado', con_desacuerdo: false })
    expect(M.llamadas.bandeja).toHaveLength(1)
  })
  it('una entrega REPETIDA contesta 200 y no duplica nada', async () => {
    await llamar({ salida: salida(id) })
    const otra = await llamar({ salida: salida(id) })
    expect(otra.status).toBe(200); expect(M.llamadas.bandeja).toHaveLength(1); expect(M.llamadas.salidas).toHaveLength(1)
  })
  it('la salida de un encargo que no existe = 404; la que nombra a otro encargo ya abierto no se mezcla', async () => {
    expect((await llamar({ salida: salida('00000000-0000-4000-8000-0000000000aa') })).status).toBe(404)
    expect(M.llamadas.bandeja).toHaveLength(0)
  })
  it('si el puerto o el encargo fallan por dentro, contesta 500 con el motivo (no lanza)', async () => {
    h.M = { P: { almacen: { leerEncargo: async () => { throw new Error('base caída') } } } }
    const r = await llamar({ salida: salida(id) })
    expect(r.status).toBe(500); expect(r.j.error).toBe('oficina_error')
  })
  it('la ruta vive bajo /api/jefatura/ (el único prefijo de Vercel al que J4 entrega) y no menciona al cliente de la web', () => {
    const f = fs.readFileSync(path.join(process.cwd(), 'src/app/api/jefatura/oficina-vuelta/route.ts'), 'utf8')
    expect(f).not.toMatch(/naufrago/i)
  })
})

// ═══════════════════════════════════════════════════════════ R3 · despertar al flujo tras la vuelta
describe('POST /api/jefatura/oficina-vuelta · despierta al flujo de la oficina cuando lo que sigue es un paso de empleado (R3)', () => {
  let M!: Memoria
  let id!: string
  beforeEach(async () => { ({ M, id } = await esperando()); h.M = M })
  const conReImagen = () => salida(id, { imagen_por_rehacer: true, respuestas: [{ ficha_id: 'x', origen: 'externa', donde: 'imagen', estado: 'tomada', razon: 'la foto no se ve cálida' }] })
  const espiarFetch = (respuesta: () => Promise<Response> | Response) => { const llamadas: Array<{ url: string; init: RequestInit }> = []; vi.stubGlobal('fetch', async (url: string, init: RequestInit) => { llamadas.push({ url, init }); return respuesta() }); return llamadas }
  const deshacer = () => vi.unstubAllGlobals()

  it('con una re-imagen por hacer: la respuesta es «esperar» y la ruta despierta a oficina-turno con la llave de SU entorno, el encargo y el turno (con su pedido)', async () => {
    const llamadas = espiarFetch(() => new Response('{}', { status: 200 }))
    try {
      const r = await llamar({ salida: conReImagen() })
      expect(r.status).toBe(200); expect(r.j).toMatchObject({ accion: 'esperar', despertado: true })
      expect(llamadas).toHaveLength(1)
      expect(llamadas[0].url).toMatch(/\/zero-risk\/oficina-turno$/)
      expect((llamadas[0].init.headers as Record<string, string>)['x-sala-dispatch-key']).toBe(LLAVE)
      const cuerpo = JSON.parse(String(llamadas[0].init.body))
      expect(cuerpo.encargo_id).toBe(id); expect(cuerpo.turno.pedido).toBeTruthy(); expect(cuerpo.turno.n).toBeGreaterThan(0)
      expect(llamadas[0].init.method).toBe('POST')
    } finally { deshacer() }
  })
  it('solo habla con NUESTRO n8n: la dirección sale de N8N_WEBHOOK_BASE o de la de producción, nunca del cuerpo de la entrega', async () => {
    const llamadas = espiarFetch(() => new Response('{}', { status: 200 }))
    try {
      await llamar({ salida: conReImagen(), destino: 'https://malo.test/x', webhook: 'https://malo.test/y' })
      expect(llamadas[0].url.startsWith('https://n8n-production-72be.up.railway.app/webhook/')).toBe(true)
    } finally { deshacer() }
  })
  it('si el flujo contesta un error o no se alcanza: lo dice (despertado:false + motivo), NO lanza y el paso queda esperando para que el vigía lo re-arme', async () => {
    for (const mala of [() => new Response('x', { status: 502 }), () => { throw new Error('ECONNRESET') }]) {
      const { M: M2, id: id2 } = await esperando(); h.M = M2
      espiarFetch(mala as never)
      try {
        const r = await llamar({ salida: salida(id2, { imagen_por_rehacer: true, respuestas: [{ ficha_id: 'x', origen: 'externa', donde: 'imagen', estado: 'tomada', razon: 'y' }] }) })
        expect(r.status).toBe(200); expect(r.j.accion).toBe('esperar'); expect(r.j.despertado).toBe(false); expect(String(r.j.motivo_sin_despertar)).toMatch(/HTTP 502|inalcanzable/)
      } finally { deshacer() }
    }
  })
  it('sin SALA_DISPATCH_KEY en el entorno no hay con qué despertar: lo dice y no llama a nadie', async () => {
    const llamadas = espiarFetch(() => new Response('{}'))
    const { despertarAlFlujoDeLaOficina } = await import('../src/lib/oficina/despertar')
    try {
      const d = await despertarAlFlujoDeLaOficina(fetch, { dispatchKey: '  ' }, id, { n: 1, pedido: {} })
      expect(d).toMatchObject({ despertado: false }); expect(llamadas).toHaveLength(0)
      expect(await despertarAlFlujoDeLaOficina(fetch, { dispatchKey: 'k' }, id, null)).toMatchObject({ despertado: false })
      expect(llamadas).toHaveLength(0)
    } finally { deshacer() }
  })
  it('sin re-imagen (el encargo cierra) NO se despierta a nadie y la respuesta es la de siempre', async () => {
    const llamadas = espiarFetch(() => new Response('{}'))
    try {
      const r = await llamar({ salida: salida(id) })
      expect(r.j).toMatchObject({ accion: 'cerrado' }); expect(r.j.despertado).toBeUndefined(); expect(llamadas).toHaveLength(0)
    } finally { deshacer() }
  })
  it('una entrega REPETIDA no despierta dos veces al flujo (la segunda ya no encuentra el turno de la jefatura abierto)', async () => {
    const llamadas = espiarFetch(() => new Response('{}', { status: 200 }))
    try {
      await llamar({ salida: conReImagen() }); const antes = llamadas.length
      await llamar({ salida: conReImagen() })
      expect(antes).toBe(1); expect(llamadas.length).toBeLessThanOrEqual(2)
      const r2 = await llamar({ salida: conReImagen() })
      expect(r2.status).toBe(200)
    } finally { deshacer() }
  })
})

// ═══════════════════════════════════════════════════════════ la migración (SIN APLICAR)
const RAIZ = process.cwd()
const MIGRACION = 'supabase/migrations/202610141000_oficina_paso_jefatura.sql'
const REVERSA = 'supabase/reversas/202610141000_oficina_paso_jefatura_REVERSA.sql'
const leer = (rel: string): string => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r/g, '')
const sinComentarios = (rel: string): string => leer(rel).split('\n').map((l) => l.replace(/^\s*--.*$/, '')).join('\n')
const bloque = (s: string, etiqueta: string): unknown => { const m = new RegExp(`\\$${etiqueta}\\$([\\s\\S]*?)\\$${etiqueta}\\$`).exec(s); return m ? JSON.parse(m[1]) : undefined }
const updateDe = (s: string, tipo: string): string => s.split('UPDATE public.oficina_tipos_de_grupo SET').slice(1).find((x) => x.includes(`WHERE tipo = '${tipo}'`)) ?? ''
const NUEVAS: Array<[string, Plantilla]> = [['post_img', POST_IMG_CON_JEFATURA], ['carrusel_ig_v1', CARRUSEL_IG_CON_JEFATURA], ['kit_historias', KIT_HISTORIAS_CON_JEFATURA]]
const VIEJAS: Array<[string, Plantilla]> = [['post_img', POST_IMG], ['carrusel_ig_v1', CARRUSEL_IG_V1], ['kit_historias', KIT_HISTORIAS]]

describe('la migración del paso `jefatura` (sin aplicar)', () => {
  const s = sinComentarios(MIGRACION)
  it('existe y la reversa NO está en supabase/migrations', () => {
    expect(fs.existsSync(path.join(RAIZ, MIGRACION))).toBe(true); expect(fs.existsSync(path.join(RAIZ, REVERSA))).toBe(true)
    expect(fs.readdirSync(path.join(RAIZ, 'supabase/migrations')).filter((f) => /(^|_)REVERSA(_|\.)/i.test(f))).toEqual([])
  })
  it('amplía el CHECK de los pasos para admitir «jefatura» y actualiza las tres plantillas SOLO si están inactivas; no crea, no borra, no enciende', () => {
    expect(s).toMatch(/DROP CONSTRAINT IF EXISTS oficina_turnos_tipo_valido;/)
    expect(s).toMatch(/ADD CONSTRAINT oficina_turnos_tipo_valido CHECK \(tipo IN \('portero', 'agente', 'codigo', 'externo', 'brazo', 'jefatura'\)\);/)
    for (const prohibido of [/\bCREATE\b/i, /\bTRUNCATE\b/i, /\bDELETE\b/i, /\bINSERT\b/i, /\bGRANT\b/i, /oficina_config/, /jefatura_config/]) expect(s, String(prohibido)).not.toMatch(prohibido)
    expect((s.match(/\bDROP\b/gi) ?? []).length).toBe(1)
    const ups = [...s.matchAll(/UPDATE public\.([a-z_]+) SET[\s\S]*?WHERE tipo = '([a-z_0-9]+)' AND activo = false;/g)].map((m) => `${m[1]}:${m[2]}`)
    expect(ups).toEqual(['oficina_tipos_de_grupo:post_img', 'oficina_tipos_de_grupo:carrusel_ig_v1', 'oficina_tipos_de_grupo:kit_historias'])
    expect(s).toMatch(/^\s*BEGIN;/m); expect(s).toMatch(/COMMIT;/); expect((s.match(/UPDATE /g) ?? []).length).toBe(3)
  })
  it('al terminar, cada plantilla es IDÉNTICA a la del código con jefatura (pasos, indicaciones y límites) y válida', () => {
    for (const [tipo, p] of NUEVAS) {
      const u = updateDe(s, tipo)
      expect(bloque(u, 'pasos')).toEqual(JSON.parse(JSON.stringify(p.pasos)))
      expect(bloque(u, 'ind')).toEqual(JSON.parse(JSON.stringify(p.indicaciones)))
      expect(bloque(u, 'lim')).toEqual(JSON.parse(JSON.stringify(p.limites)))
      expect(validarPlantilla({ ...p, pasos: bloque(u, 'pasos') as never })).toEqual([])
    }
  })
  it('las plantillas nuevas no traen ningún paso del jefe, de corrección, de opinión externa ni de decisión', () => {
    for (const [tipo] of NUEVAS) {
      const claves = (bloque(updateDe(s, tipo), 'pasos') as Array<{ clave: string; tipo: string }>)
      expect(claves.filter((x) => x.tipo === 'jefatura')).toHaveLength(1)
      expect(claves.map((x) => x.clave)).not.toEqual(expect.arrayContaining(['revision_jefe']))
      expect(claves.some((x) => ['externo'].includes(x.tipo) || /^(corrige|decide|ajusta_laminas)/.test(x.clave))).toBe(false)
    }
  })
  it('agnóstica: ningún dato nombra a un cliente, una ciudad o un producto', () => {
    const todo = leer(MIGRACION).toLowerCase()
    for (const x of ['naufrago', 'náufrago', 'guayaquil', 'ceviche', 'ecuador', 'rukut', 'perez', 'pérez']) expect(todo).not.toContain(x)
  })
  it('es repetible: correrla dos veces deja lo mismo (UPDATE con valores fijos, sin aritmética distinta de «version + 1» y CHECK recreado)', () => {
    expect(leer(MIGRACION)).toMatch(/DROP CONSTRAINT IF EXISTS/)
  })
})

describe('la reversa', () => {
  const r = sinComentarios(REVERSA)
  it('se NIEGA si ya hay pasos de la jefatura anotados, y lo comprueba ANTES de tocar nada', () => {
    expect(r).toMatch(/IF EXISTS \(SELECT 1 FROM public\.oficina_turnos WHERE tipo = 'jefatura'\) THEN\s+RAISE EXCEPTION 'REVERSA RECHAZADA/)
    expect(r.indexOf('RAISE EXCEPTION')).toBeLessThan(r.indexOf('UPDATE '))
    expect(r.indexOf('RAISE EXCEPTION')).toBeLessThan(r.indexOf('DROP CONSTRAINT'))
  })
  it('devuelve las tres plantillas INACTIVAS a la definición de julio (idénticas al código sin jefatura) y estrecha el CHECK', () => {
    expect((r.match(/UPDATE /g) ?? []).length).toBe(3)
    for (const [tipo, p] of VIEJAS) {
      const u = updateDe(r, tipo)
      expect(bloque(u, 'pasos')).toEqual(JSON.parse(JSON.stringify(p.pasos)))
      expect(bloque(u, 'ind')).toEqual(JSON.parse(JSON.stringify(p.indicaciones)))
      expect(bloque(u, 'lim')).toEqual(JSON.parse(JSON.stringify(p.limites)))
      expect(u).toMatch(/AND activo = false;/)
      expect((bloque(u, 'pasos') as Array<{ clave: string }>).some((x) => x.clave === 'revision_jefe')).toBe(true)
    }
    expect(r).toMatch(/ADD CONSTRAINT oficina_turnos_tipo_valido CHECK \(tipo IN \('portero', 'agente', 'codigo', 'externo', 'brazo'\)\);/)
    for (const prohibido of [/\bTRUNCATE\b/i, /\bDELETE\b/i, /\bINSERT\b/i]) expect(r).not.toMatch(prohibido)
  })
})
