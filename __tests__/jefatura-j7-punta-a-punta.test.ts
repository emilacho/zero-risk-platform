/**
 * J7 · seco punta a punta: la cadena (almacén en memoria) retiene ANTES de pasar, la jefatura (agentes simulados) revisa y el cierre —cualquiera— deja pasar.
 * La puerta de retención es la MISMA que `abrirRevision` (se alimenta de la config y política de la jefatura simulada). US$ 0 · sin base · sin red · sin modelo.
 * Entradas: el plan v2 REAL y un brief REAL de la evidencia del vault cuando existen (en CI no están: se usan textos de relleno y la prueba sigue siendo válida).
 */
import { describe, it, expect } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { abrirCampana, estrategiaPreparar, estrategiaGuardar } from '../src/lib/cadena'
import { decidirRetencion, estrategiaPasar, TIPO_DE_ESPERA } from '../src/lib/cadena/revision-jefatura'
import { AlmacenMemoria } from '../src/lib/cadena/__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../src/lib/cadena/__fixtures__/clientes'
import { almacenEnMemoria, puertosDePrueba, correr, sobre, TEXTO_DEL_PLAN } from './_helpers/jefatura-revision'

const VAULT = 'C:/Users/emili/OneDrive/Documents/zr-vault/raw/evidencia'
const leer = (rel: string, relleno: string) => { const p = `${VAULT}/${rel}`; return existsSync(p) ? readFileSync(p, 'utf8') : relleno }
const PLAN_V2 = leer('2026-10-12-CC1-plan-v2/corrida-real/plan-v2-texto.txt', TEXTO_DEL_PLAN)
const BRIEF_REAL = leer('2026-09-29-BRIEF-RESCATADO/parte.md', `# Brief\n${'Línea del brief con el posicionamiento y los pilares. '.repeat(80)}`)

const A = clienteA()
const AHORA = '2026-10-15T12:00:00Z'
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', ...extra })

/** la cadena cuya retención consulta a la jefatura simulada con la MISMA regla */
function cadenaConJefatura(activas: string[], estado: 'apagada' | 'ensayo' | 'encendida' = 'ensayo') {
  const mem = almacenEnMemoria({ activas, config: { estado, tipos_activos: ['plan', 'estrategia', 'calendario', 'brief', 'pieza'], clientes_ensayo: [A.clientId] } })
  const al = new AlmacenMemoria({ contextos: { [A.clientId]: contextoDe(A) }, planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-14' }] }, config: { flujos: ['wf-cadena'] }, journeys: [] })
  al.retencion = async (tipo, clientId) => {
    const config = await mem.almacen.leerConfig()
    const pol = await mem.almacen.leerPolitica(tipo)
    return decidirRetencion({ config, politica: pol.ok ? { activa: pol.activa } : null, tipo, client_id: clientId })
  }
  return { al, mem }
}
async function guardarEstrategia(al: AlmacenMemoria) {
  const id = ((await abrirCampana(al, { ...wf(), client_id: A.clientId, seco: true }, AHORA)).cuerpo.campana as { id: string }).id
  const p = await estrategiaPreparar(al, { ...wf(), campana_id: id }, AHORA)
  const g = await estrategiaGuardar(al, { ...wf(), campana_id: id, corrida_id: p.cuerpo.corrida_id, resultado: { success: true, structured_output: A.estrategia, cost_usd: 0.3 } }, AHORA)
  return { id, g }
}
const huella = (al: AlmacenMemoria) => JSON.stringify({ c: al.campanas.map((c) => c.estado), e: al.esperas.length, f: al.filas.length })

describe('J7 punta a punta · estrategia', () => {
  it('encendida con política inactiva ⇒ la cadena pasa sola como hoy (cero diferencias); en ensayo sí retiene, igual que abrirRevision', async () => {
    const { al: ens } = cadenaConJefatura([])
    expect((await guardarEstrategia(ens)).g.cuerpo.retenida_para_revision).toBeTruthy()
    const { al } = cadenaConJefatura([], 'encendida')
    const { id, g } = await guardarEstrategia(al)
    expect(g.cuerpo.retenida_para_revision).toBeUndefined()
    expect((await al.campana(id))!.estado).toBe('calendario')
  })
  it('política activa: retiene, la jefatura revisa (seco, 3 tipos de cierre) y estrategiaPasar deja pasar siempre', async () => {
    for (const simulacion of [undefined, { fichas: 'bloquea', toma: 'nada' }, { fichas: 'sugerencia' }]) {
      const { al, mem } = cadenaConJefatura(['estrategia'])
      const { id, g } = await guardarEstrategia(al)
      expect(g.cuerpo.retenida_para_revision).toBeTruthy()
      const antes = huella(al)
      const { P } = puertosDePrueba({ almacen: mem })
      const c = await correr(P, sobre('estrategia', { id: `estrategia:${id}:v1`, texto: JSON.stringify(A.estrategia), simulacion, client_id: A.clientId }))
      expect(c.final.cuerpo.accion).not.toBe('esperar') // cerró, cualquiera sea el cierre
      expect(huella(al)).toBe(antes) // la revisión NO toca las tablas de la cadena
      const p = await estrategiaPasar(al, { ...wf(), campana_id: id, version: 1, revision: { id: c.final.cuerpo.revision_id, estado: c.final.cuerpo.estado, resultado: c.final.cuerpo.resultado } })
      expect(p.status).toBe(200)
      expect((await al.campana(id))!.estado).toBe('calendario')
      expect((await al.esperasVivas()).filter((e) => e.objeto_tipo === TIPO_DE_ESPERA)).toHaveLength(0)
    }
  })
})

describe('J7 punta a punta · plan v2 real y brief real como entradas de la jefatura (seco)', () => {
  it('el plan v2 completo cierra sin tocar la cadena ni lo vivo (contadores iguales antes y después)', async () => {
    const { al, mem } = cadenaConJefatura(['plan'])
    const antes = huella(al)
    const { P, rastro } = puertosDePrueba({ almacen: mem })
    const c = await correr(P, sobre('plan', { texto: PLAN_V2, client_id: A.clientId }))
    expect(c.final.cuerpo.accion).not.toBe('esperar')
    expect(huella(al)).toBe(antes)
    expect(rastro.llamadasAlRevisor.every((l) => l.dry_run === true)).toBe(true)
  })
  it('el brief real: tipo «solo marca» (política ninguna) cierra y no corrige ni reescribe', async () => {
    const { al, mem } = cadenaConJefatura(['brief'])
    const antes = huella(al)
    const { P } = puertosDePrueba({ almacen: mem })
    const c = await correr(P, sobre('brief', { texto: BRIEF_REAL, client_id: A.clientId }))
    expect(c.final.cuerpo.accion).not.toBe('esperar')
    expect(huella(al)).toBe(antes)
  })
  it('jefatura apagada: abrir revisión es 409 y la cadena igual pasa (nunca de rehén)', async () => {
    const { al, mem } = cadenaConJefatura(['plan', 'estrategia'], 'apagada')
    const { P } = puertosDePrueba({ almacen: mem })
    const c = await correr(P, sobre('plan', { texto: PLAN_V2, client_id: A.clientId }))
    expect(c.aperturas[0].status).toBe(409)
    const { id } = await guardarEstrategia(al)
    expect((await al.campana(id))!.estado).toBe('calendario')
  })
})
