/**
 * J8a · el adaptador REAL del puerto `jefatura` (abre la revisión con la base falsa de la jefatura, despierta el flujo con un `fetch` falso) y el vigía de la oficina con un paso `jefatura` esperando.
 * US$ 0: sin red, sin modelo, sin base real.
 */
import { describe, expect, it } from 'vitest'
import { DbFalsaJefatura } from '../../../../__tests__/_helpers/dbfalsa-jefatura'
import { FILAS_DE_POLITICA } from '../../../../__tests__/_helpers/jefatura-revision'
import { crearPuertos, type Entorno } from '../adaptadores'
import { abrirEncargo } from '../orquestador'
import { POST_IMG_CON_JEFATURA } from '../plantillas/con-jefatura'
import { sobreDeLaRevision } from '../paso-jefatura'
import { estadoInicial } from '../tipos'
import { MINUTOS_PARA_ESPERAR_A_LA_JEFATURA, revisarPasosMuertos } from '../vigia'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { DbFalsa } from './dbfalsa'
import { CLIENTE, PARTE, correr, crearMemoria, PIEZA_OK, BUENOS_PROMPTS, direccionGenerada, observacion, REGLAS_CEVICHE } from './memoria'

const ENV: Entorno = { baseUrl: 'https://app.test', internalKey: 'k-interna', dispatchKey: 'llave-de-despacho-de-prueba', n8nWebhookBase: 'https://n8n.test/webhook' }

function baseDeLaJefatura(estado: 'apagada' | 'ensayo' | 'encendida' = 'ensayo', tipos: string[] = ['pieza']): DbFalsaJefatura {
  const db = new DbFalsaJefatura()
  db.semilla('jefatura_config', [{ id: 1, estado, tipos_activos: tipos, clientes_ensayo: [CLIENTE] }])
  db.semilla('jefatura_grading_policies', [{ ...FILAS_DE_POLITICA['pieza'], is_active: false }])
  return db
}
interface Llamada { url: string; init?: RequestInit }
const fetchFalso = (o: { estado?: number; corta?: boolean } = {}) => {
  const llamadas: Llamada[] = []
  const f = (async (url: string | URL | Request, init?: RequestInit) => { llamadas.push({ url: String(url), init }); if (o.corta) throw new Error('red caída'); return new Response('{}', { status: o.estado ?? 200 }) }) as typeof fetch
  return { f, llamadas }
}
const encargo = { id: '00000000-0000-4000-8000-000000000001', client_id: CLIENTE, familia: 'post_img', tope_usd: 10, dry_run: true, sala_ref: null }
const sobre = () => sobreDeLaRevision(encargo, { familia: 'post_img' }, estadoInicial(), { pieza: 'Pie de foto\n#uno', imagenes: [], contexto: [{ titulo: 'Manual de marca del cliente', funcion: 'lo vigente', texto: 'Tono cercano.' }] })

describe('el puerto `jefatura` real', () => {
  it('abre la revisión (misma función que la ruta), le pone de vuelta la ruta de la oficina y despierta el flujo de turno con la llave de despacho', async () => {
    const db = baseDeLaJefatura(); const { f, llamadas } = fetchFalso()
    const P = crearPuertos(db as never, ENV, f)
    const r = await P.jefatura!(sobre())
    expect(r.estado).toBe('esperando')
    const rev = db.tablas['jefatura_revisiones'][0]
    expect(rev).toMatchObject({ artifact_type: 'pieza', artifact_id: encargo.id, client_id: CLIENTE, dry_run: true })
    expect(rev.devolver_a).toEqual({ tipo: 'webhook', destino: 'https://zero-risk-platform.vercel.app/api/jefatura/oficina-vuelta' })
    expect(llamadas).toHaveLength(1)
    expect(llamadas[0].url).toBe('https://n8n.test/webhook/zero-risk/jefatura-turno')
    const h = llamadas[0].init!.headers as Record<string, string>
    expect(h['x-sala-dispatch-key']).toBe('llave-de-despacho-de-prueba')
    const cuerpo = JSON.parse(String(llamadas[0].init!.body))
    expect(cuerpo).toMatchObject({ revision_id: String(rev.id), turno: { tipo: 'agente', paso: 'revision_fondo' } })
    expect(r).toEqual({ estado: 'esperando', revision_id: String(rev.id) })
  })
  it('repetir el encargo NO abre otra revisión ni despierta otro turno (la misma sigue esperando)', async () => {
    const db = baseDeLaJefatura(); const { f, llamadas } = fetchFalso()
    const P = crearPuertos(db as never, ENV, f)
    const a = await P.jefatura!(sobre()); const b = await P.jefatura!(sobre())
    expect(db.tablas['jefatura_revisiones']).toHaveLength(1)
    expect(b).toEqual(a); expect(llamadas).toHaveLength(1)
  })
  it('sin llave de despacho no despierta nada (la revisión queda abierta; la re-arma el vigía de la jefatura) y no lanza', async () => {
    const db = baseDeLaJefatura(); const { f, llamadas } = fetchFalso()
    const r = await crearPuertos(db as never, { ...ENV, dispatchKey: undefined }, f).jefatura!(sobre())
    expect(r.estado).toBe('esperando'); expect(llamadas).toHaveLength(0)
  })
  for (const [caso, o] of [['el flujo contesta 500', { estado: 500 }], ['la red se corta', { corta: true }]] as const) {
    it(`${caso}: la revisión queda abierta y NO se lanza nada`, async () => {
      const db = baseDeLaJefatura(); const { f } = fetchFalso(o)
      const r = await crearPuertos(db as never, ENV, f).jefatura!(sobre())
      expect(r.estado).toBe('esperando')
    })
  }
  it('la jefatura APAGADA no abre y no escribe nada: «no_abre» con el motivo', async () => {
    const db = baseDeLaJefatura('apagada', []); const { f, llamadas } = fetchFalso()
    const r = await crearPuertos(db as never, ENV, f).jefatura!(sobre())
    expect(r).toEqual({ estado: 'no_abre', motivo: 'apagada' })
    expect(db.tablas['jefatura_revisiones'] ?? []).toHaveLength(0); expect(llamadas).toHaveLength(0)
  })
  it('el tipo `pieza` fuera de `tipos_activos`, o un cliente fuera del ensayo, tampoco abren', async () => {
    expect(await crearPuertos(baseDeLaJefatura('ensayo', ['plan']) as never, ENV, fetchFalso().f).jefatura!(sobre())).toEqual({ estado: 'no_abre', motivo: 'tipo_no_activo' })
    const db = baseDeLaJefatura(); db.tablas['jefatura_config'][0].clientes_ensayo = ['otro-cliente']
    expect(await crearPuertos(db as never, ENV, fetchFalso().f).jefatura!(sobre())).toEqual({ estado: 'no_abre', motivo: 'fuera_del_ensayo' })
  })
  it('una base que falla NO lanza: sin leer la llave la jefatura queda cerrada (no abre) y, si falla al guardar, vuelve como `error`; en los dos casos la pieza queda «sin revisar»', async () => {
    const sinLlave = baseDeLaJefatura(); sinLlave.fallar['jefatura_config'] = 'base caída'
    expect(await crearPuertos(sinLlave as never, ENV, fetchFalso().f).jefatura!(sobre())).toMatchObject({ estado: 'no_abre' })
    const sinGuardar = baseDeLaJefatura(); sinGuardar.fallar['jefatura_revisiones'] = 'base caída'
    const r = await crearPuertos(sinGuardar as never, ENV, fetchFalso().f).jefatura!(sobre())
    expect(r.estado).toBe('error')
  })
  it('un sobre inválido (sin texto) vuelve como `error` con el motivo, sin abrir nada', async () => {
    const db = baseDeLaJefatura(); const s = sobre(); s.payload.texto = ''
    const r = await crearPuertos(db as never, ENV, fetchFalso().f).jefatura!(s)
    expect(r.estado).toBe('error'); expect(db.tablas['jefatura_revisiones'] ?? []).toHaveLength(0)
  })
})

describe('el vigía de la oficina con un paso `jefatura` esperando', () => {
  async function esperando() {
    const M = crearMemoria({ plantilla: POST_IMG_CON_JEFATURA })
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: false, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(a.cuerpo.encargo_id)
    M.P.jefatura = async () => ({ estado: 'esperando', revision_id: 'rev-1' })
    await correr(M, id, { paquete: () => ({ texto: 'portero' }), direccion_visual: () => ({ texto: direccionGenerada(REGLAS_CEVICHE) }), prompts: () => ({ texto: BUENOS_PROMPTS }), mirar: (_n, t) => ({ texto: observacion([...t.matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))) }), texto: () => ({ texto: PIEZA_OK }) })
    const turno = [...M.turnos.get(id)!.values()].find((t) => t.estado === 'corriendo')!
    const db = new DbFalsa()
    const inicio = new Date('2026-10-14T12:00:00Z')
    db.semilla('oficina_turnos', [{ encargo_id: id, n: turno.n, paso: 'jefatura', tipo: 'jefatura', estado: 'corriendo', inicio: inicio.toISOString() }])
    return { M, id, db, inicio }
  }
  const despues = (d: Date, min: number) => new Date(d.getTime() + min * 60_000)
  it('NO lo da por muerto a los 12 minutos (la revisión corre en n8n y puede tardar): no se toca', async () => {
    const { M, db, inicio, id } = await esperando()
    expect(await revisarPasosMuertos(M.P, db as never, despues(inicio, 40))).toEqual({ reanudar: [], fallidos: [], cierres: [] })
    expect(M.encargos.get(id)!.estado).toBe('en_paso'); expect(M.llamadas.bandeja).toHaveLength(0)
  })
  it(`pasados ${MINUTOS_PARA_ESPERAR_A_LA_JEFATURA} minutos la da por perdida: la pieza sigue «SIN REVISAR» y llega a la bandeja (nunca se pierde)`, async () => {
    const { M, db, inicio, id } = await esperando()
    const r = await revisarPasosMuertos(M.P, db as never, despues(inicio, MINUTOS_PARA_ESPERAR_A_LA_JEFATURA + 1))
    expect(r.reanudar).toEqual([id]); expect(r.fallidos).toEqual([])
    expect(M.encargos.get(id)!.estado).toBe('cerrado')
    expect(String(M.llamadas.bandeja[0].titulo)).toMatch(/^⚠️ SIN REVISAR · /)
    expect(M.llamadas.avisos.some((a) => a.canal === 'alertas' && /no contestó/.test(a.texto))).toBe(true)
  })
  it('un encargo ya cerrado no se revive', async () => {
    const { M, db, inicio, id } = await esperando()
    M.encargos.get(id)!.estado = 'cerrado'
    expect(await revisarPasosMuertos(M.P, db as never, despues(inicio, 300))).toEqual({ reanudar: [], fallidos: [], cierres: [] })
    expect(M.llamadas.bandeja).toHaveLength(0)
  })
})
