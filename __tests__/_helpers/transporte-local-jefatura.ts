/**
 * Transporte LOCAL del kit del seco de la jefatura (CC#2 · J5): las tres rutas reales de J3 con la base falsa, en el mismo formato `{ llamar, envejecer }` que usa el conductor (`scripts/ops/jefatura-seco/nucleo.mjs`).
 * Sin red, sin modelo, sin base real: US$ 0. `vi.mock('@/lib/supabase')` lo hace quien importe este archivo (ver la prueba del kit).
 */
import { DbFalsaJefatura } from './dbfalsa-jefatura'
import { FILAS_DE_POLITICA } from './jefatura-revision'

export const LLAVE_LOCAL = 'test-dispatch-key-e67'
export const TIPOS_ACTIVOS = ['plan', 'estrategia', 'calendario', 'brief', 'pieza']

export function baseDelSeco(clientes: string[], estado: 'apagada' | 'ensayo' | 'encendida' = 'ensayo'): DbFalsaJefatura {
  const db = new DbFalsaJefatura()
  db.semilla('jefatura_config', [{ id: 1, estado, tipos_activos: TIPOS_ACTIVOS, clientes_ensayo: clientes }])
  db.semilla('jefatura_grading_policies', TIPOS_ACTIVOS.map((t) => ({ ...FILAS_DE_POLITICA[t], is_active: false })))
  return db
}

type Ruta = (r: Request) => Promise<Response>
export interface Rutas { revisiones: Ruta; turnos: Ruta; vigia: Ruta }

export function transporteLocal(rutas: Rutas, db: () => DbFalsaJefatura) {
  const llamar = async (ruta: string, cuerpo: unknown) => {
    const f = ruta === 'revisiones' ? rutas.revisiones : ruta === 'turnos' ? rutas.turnos : rutas.vigia
    const r = await f(new Request(`http://app.test/api/jefatura/${ruta}`, { method: 'POST', headers: { 'content-type': 'application/json', 'x-sala-dispatch-key': LLAVE_LOCAL }, body: JSON.stringify(cuerpo) }))
    return { status: r.status, body: (await r.json().catch(() => ({}))) as Record<string, any> }
  }
  /** pasan 20 min: el paso que sigue «corriendo» de esa revisión queda más viejo que el límite del vigía */
  const envejecer = async (revision_id: string) => {
    for (const p of db().tablas.jefatura_pasos ?? []) {
      if (p.revision_id === revision_id && p.estado === 'corriendo') for (const k of Object.keys(p)) if (/inicio|started|creado|created/.test(k)) p[k] = new Date(Date.now() - 20 * 60_000).toISOString()
    }
  }
  return { llamar, envejecer }
}
