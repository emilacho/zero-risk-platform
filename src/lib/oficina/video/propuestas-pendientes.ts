/**
 * 16-nov · Sprint 2 · S2-1 parte B (CC1) · la LECTURA de los videos parados en la aprobación del dueño, para «Tu oficina» (`direccion/decisiones-propuestas.ts` arma la tarjeta).
 * Vive en la oficina porque solo la oficina nombra sus tablas. Solo lectura; una fuente que falla se DECLARA en `fuentes` (regla de honestidad de la dirección).
 * Los encargos de ensayo (`dry_run`) se cuentan aparte; los clientes de práctica los omite `leerDecisiones`, como en las otras fuentes.
 */
import { leer, esObjeto, texto, type Db, type Fila, type Fuente } from '../../direccion/comun'
import { propuestasDeLaDecision, type PropuestasDeLaDecision } from '../../direccion/decisiones-propuestas'
import { TURNO_DEL_DUENO } from './aprobacion'

const TOPE = 200
/** la fuente que declara la decisión (`Decision.fuente` · `origen.fuente` de la ficha) */
export const FUENTE_DE_PROPUESTAS = 'oficina_turnos'

export interface DecisionDePropuestas { encargo_id: string; client_id: string | null; desde: string | null; propuestas: PropuestasDeLaDecision }

export async function leerPropuestasPendientes(db: Db, fuentes: Fuente[]): Promise<{ decisiones: DecisionDePropuestas[]; ensayos: number }> {
  const turnos = await leer(fuentes, FUENTE_DE_PROPUESTAS, db.from(FUENTE_DE_PROPUESTAS).select('encargo_id, n, paso, inicio').eq('tipo', TURNO_DEL_DUENO).eq('estado', 'corriendo').limit(TOPE), TOPE)
  if (!turnos.length) return { decisiones: [], ensayos: 0 }
  const ids = [...new Set(turnos.map((t) => String(t.encargo_id)))]
  const encargos = await leer(fuentes, 'oficina_encargos', db.from('oficina_encargos').select('id, client_id, brief_id, familia, dry_run, estado, estado_del_motor').in('id', ids).limit(TOPE), TOPE)
  const familias = [...new Set(encargos.map((e) => String(e.familia)))]
  const plantillas = familias.length ? await leer(fuentes, 'oficina_tipos_de_grupo', db.from('oficina_tipos_de_grupo').select('familia, pasos').in('familia', familias).limit(TOPE), TOPE) : []
  const pasosDe = new Map(plantillas.map((p) => [String(p.familia), Array.isArray(p.pasos) ? (p.pasos as Fila[]) : null]))
  let ensayos = 0
  const decisiones: DecisionDePropuestas[] = []
  for (const t of turnos) {
    const e = encargos.find((x) => String(x.id) === String(t.encargo_id))
    if (!e || (e.estado !== 'abierto' && e.estado !== 'en_paso')) continue
    if (e.dry_run === true) { ensayos++; continue }
    const motor = esObjeto(e.estado_del_motor) ? e.estado_del_motor : {}
    const propuestas = propuestasDeLaDecision({ id: String(e.id), brief_id: String(e.brief_id ?? '') }, motor, pasosDe.get(String(e.familia)) ?? null)
    if (!propuestas) continue
    decisiones.push({ encargo_id: String(e.id), client_id: texto(e.client_id), desde: texto(t.inicio), propuestas })
  }
  return { decisiones, ensayos }
}
