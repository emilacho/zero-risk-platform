/**
 * J7 · brief / plan en SECO · EL PUNTO DE ESPERA «ANTES DE PASAR» (condición 4 de CC#3). CC#1 · 15-oct.
 *
 * Hoy «guardar» y «pasar» son UNA sola llamada: `estrategiaGuardar` deja la estrategia `validada` y mueve la campaña a `calendario`; `calendarioGuardar` deja las filas y la mueve a `activa`.
 * La `jefatura` tiene que poder revisar ENTRE guardar y pasar. Este módulo parte esa llamada en dos SIN cambiar nada mientras la jefatura no abra:
 *
 *   guardar  → ¿la jefatura abriría una revisión de este tipo para este cliente? (`decidirRetencion`: la MISMA puerta que `abrirRevision`)
 *      · NO  (apagada · tipo no activo · cliente fuera del ensayo · política inactiva · config ilegible) → pasa en la misma llamada, byte a byte como hoy;
 *      · SÍ  → guarda todo igual, NO mueve la campaña y abre una espera viva `revision_jefatura` (con su reloj) → responde `retenida_para_revision`.
 *   pasar    → `estrategiaPasar` / `calendarioPasar` (llamadas por el flujo cuando la revisión CIERRA) o el reloj (al vencer la espera: `pasar_sin_revision`): hacen EXACTAMENTE la
 *              transición que hacía guardar. Idempotentes. La cadena nunca queda de rehén de la jefatura: la firma A («un desacuerdo de un intermedio sigue + aviso a #alertas»).
 *
 * 🔴 «Pasar» no depende de que la revisión haya salido bien: cerrada · cerrada por tope · fallida · sin segunda mirada · vencida ⇒ la cadena sigue; lo que cambia es el AVISO que sale.
 * 🔴 Lo que SÍ la frena es lo que ya la frenaba: un bloqueo del código (`necesita_humano`) nunca llega aquí (no se guarda ni se retiene).
 * 🔴 Agnóstico: ninguna rama por tipo de cliente, rubro ni país.
 */
import type { Almacen, Campana, EsperaFila } from './almacen'
import { autorizarLlamada, cadena, err, type Respuesta } from './autorizar'
import { abrirEsperaDe, resolverEsperas } from './nucleo'
import type { Estrategia } from './tipos'

export const TIPO_DE_ESPERA = 'revision_jefatura'
export type TipoRetenible = 'estrategia' | 'calendario'

/** el pedazo de la config de la jefatura que decide si se retiene (no importa `jefatura/` aquí: la cadena no depende de ella) */
export interface ConfigParaRetener { estado: 'apagada' | 'ensayo' | 'encendida'; tipos_activos: string[]; clientes_ensayo: string[] }
export interface Retencion { retener: boolean; motivo: string }

/**
 * ¿La jefatura abriría una revisión de este tipo para este cliente? Es la MISMA lógica de `abrirRevision` (apagada · tipo no activo · fuera del ensayo) más «la política del tipo está activa».
 * Si no abriría, NO se retiene: una retención sin revisión posible sería una campaña esperando a nadie.
 */
export function decidirRetencion(p: { config: ConfigParaRetener | null; /** null = el tipo no tiene política legible (inexistente o inválida) */ politica: { activa: boolean } | null; tipo: TipoRetenible; client_id: string }): Retencion {
  const c = p.config
  if (!c) return { retener: false, motivo: 'jefatura_ilegible' }
  if (c.estado === 'apagada') return { retener: false, motivo: 'jefatura_apagada' }
  if (!c.tipos_activos.includes(p.tipo)) return { retener: false, motivo: 'tipo_no_activo' }
  if (c.estado === 'ensayo' && !c.clientes_ensayo.includes(p.client_id)) return { retener: false, motivo: 'fuera_del_ensayo' }
  if (!p.politica) return { retener: false, motivo: 'tipo_sin_politica_valida' }
  // como `abrirRevision`: en ensayo no hace falta que el renglón esté activo; encendida sí
  if (c.estado === 'encendida' && !p.politica.activa) return { retener: false, motivo: 'politica_inactiva' }
  return { retener: true, motivo: 'jefatura_activa' }
}

/** lo que `guardar` consulta; un almacén sin esta capacidad (o que falla) NO retiene: la cadena sigue como hoy */
export async function retencionDe(al: Almacen, tipo: TipoRetenible, clientId: string): Promise<Retencion> {
  if (typeof al.retencionDeJefatura !== 'function') return { retener: false, motivo: 'sin_capacidad' }
  try { return await al.retencionDeJefatura(tipo, clientId) } catch { return { retener: false, motivo: 'jefatura_ilegible' } }
}

export const objetoDeRetencion = (tipo: TipoRetenible, ref: number): string => (tipo === 'estrategia' ? `estrategia:v${ref}` : `calendario:t${ref}`)

/** abre la espera `revision_jefatura` con su reloj; idempotente por `dedup_key` (un reintento de guardar no duplica) */
export async function retenerParaRevision(al: Almacen, campana: Campana, tipo: TipoRetenible, ref: number, ahora: string): Promise<EsperaFila> {
  return abrirEsperaDe(al, campana, TIPO_DE_ESPERA, objetoDeRetencion(tipo, ref), `la jefatura revisa ${tipo === 'estrategia' ? `la estrategia v${ref}` : `la tanda ${ref} del calendario`} antes de pasar`, ahora)
}

// ───────────────────────────────────────────────────────── la transición (la MISMA que hacía `guardar`)
export interface FechaPedida { pais: string | null; tipo: string; ambito: string; anio: number }
/** los tipos de fechas que ESTE cliente declaró y los años de la campaña: el flujo investiga solo eso (la misma cuenta que hacía `estrategiaGuardar`) */
export function fechasPedidasDe(campana: Pick<Campana, 'fecha_inicio' | 'fecha_fin'>, pais: string | null, e: Estrategia): FechaPedida[] {
  const anios = [...new Set([campana.fecha_inicio.slice(0, 4), campana.fecha_fin.slice(0, 4)].map(Number))]
  return pais ? e.fechas_que_importan.flatMap((f) => anios.map((anio) => ({ pais, tipo: f.tipo, ambito: f.ambito, anio }))) : []
}

export interface ResultadoDePasar { ya_pasada?: boolean; ok?: boolean; pasada_sin_revision?: boolean; estado_de_la_campana: string; fechas_pedidas?: FechaPedida[]; aviso?: string }

async function transicion(al: Almacen, campana: Campana, tipo: TipoRetenible): Promise<{ ya: boolean; fechas_pedidas?: FechaPedida[] }> {
  if (tipo === 'estrategia') {
    // ya pasó: la campaña ya está en `calendario` o más allá
    if (campana.estado !== 'estrategia' && campana.estado !== 'abierta') return { ya: true }
    const estr = await al.ultimaEstrategia(campana.id)
    if (!estr || estr.estado !== 'validada') throw Object.assign(new Error('no hay una estrategia validada para pasar'), { codigo: 'E-SIN-ESTRATEGIA' })
    await al.actualizarCampana(campana.id, { estado: 'calendario' })
    const ctx = await al.cargarContexto(campana.client_id, campana.plan_id)
    return { ya: false, fechas_pedidas: fechasPedidasDe(campana, ctx?.pais ?? null, estr.contenido) }
  }
  if (campana.estado !== 'calendario') return { ya: true }
  await al.actualizarCampana(campana.id, { estado: 'activa' })
  return { ya: false }
}

async function pasar(al: Almacen, campana: Campana, tipo: TipoRetenible, ref: number, sinRevision: boolean): Promise<ResultadoDePasar> {
  const t = await transicion(al, campana, tipo)
  await resolverEsperas(al, campana.id, TIPO_DE_ESPERA, objetoDeRetencion(tipo, ref))
  if (t.ya) return { ya_pasada: true, estado_de_la_campana: campana.estado }
  const nueva = await al.campana(campana.id)
  return { ok: true, ...(sinRevision ? { pasada_sin_revision: true, aviso: 'la espera de la revisión venció: la cadena sigue sin ella' } : {}), estado_de_la_campana: nueva?.estado ?? 'desconocido', ...(t.fechas_pedidas ? { fechas_pedidas: t.fechas_pedidas } : {}) }
}

/** el flujo lo llama cuando la revisión de la jefatura CIERRA (cualquier cierre); `revision` solo se registra en la respuesta (no decide) */
async function manejadorDePasar(tipo: TipoRetenible, al: Almacen, cuerpo: Record<string, unknown>): Promise<Respuesta> {
  const id = cadena(cuerpo.campana_id)
  if (!id) return err(400, 'E-CAMPOS', 'falta campana_id')
  const campana = await al.campana(id)
  if (!campana) return err(404, 'E-CAMPANA', 'la campaña no existe')
  const noAut = await autorizarLlamada(al, cuerpo, campana.client_id)
  if (noAut) return noAut
  const ref = Number(tipo === 'estrategia' ? cuerpo.version : cuerpo.tanda)
  if (!Number.isInteger(ref) || ref < 1) return err(400, 'E-CAMPOS', tipo === 'estrategia' ? '`version` debe ser un entero ≥ 1' : '`tanda` debe ser un entero ≥ 1')
  const viva = (await al.esperasVivas()).find((e) => e.campana_id === campana.id && e.objeto_tipo === TIPO_DE_ESPERA && e.objeto_id === objetoDeRetencion(tipo, ref))
  // sin espera viva: o ya pasó (idempotente) o nunca se retuvo (la jefatura estaba apagada): en los dos casos NO se mueve nada por esta vía
  if (!viva) {
    const ya = tipo === 'estrategia' ? campana.estado !== 'estrategia' && campana.estado !== 'abierta' : campana.estado !== 'calendario'
    return ya ? { status: 200, cuerpo: { ya_pasada: true, estado_de_la_campana: campana.estado } } : err(409, 'E-SIN-RETENCION', `no hay una espera de revisión viva para ${objetoDeRetencion(tipo, ref)}: esta ruta no pasa campañas que no se retuvieron`)
  }
  const r = await pasar(al, campana, tipo, ref, false)
  const rev = cuerpo.revision && typeof cuerpo.revision === 'object' && !Array.isArray(cuerpo.revision) ? (cuerpo.revision as Record<string, unknown>) : null
  return { status: 200, cuerpo: { ...r, ...(rev ? { revision: { id: rev.id ?? null, estado: rev.estado ?? null, resultado: rev.resultado ?? null, con_desacuerdo: rev.con_desacuerdo === true } } : {}) } }
}

export const estrategiaPasar = (al: Almacen, cuerpo: Record<string, unknown>): Promise<Respuesta> => manejadorDePasar('estrategia', al, cuerpo)
export const calendarioPasar = (al: Almacen, cuerpo: Record<string, unknown>): Promise<Respuesta> => manejadorDePasar('calendario', al, cuerpo)

/** el reloj (`accion_al_vencer = 'pasar_sin_revision'`): la espera venció sin cierre de la revisión → la cadena sigue y se AVISA; nunca queda esperando para siempre */
export async function pasarSinRevision(al: Almacen, e: EsperaFila): Promise<string> {
  const m = /^(estrategia):v(\d+)$|^(calendario):t(\d+)$/.exec(e.objeto_id)
  if (!m) return `${e.objeto_tipo} ${e.objeto_id}: objeto no reconocido`
  const tipo = (m[1] ?? m[3]) as TipoRetenible
  const ref = Number(m[2] ?? m[4])
  const campana = await al.campana(e.campana_id)
  if (!campana) return `campaña ${e.campana_id} inexistente`
  const r = await pasar(al, campana, tipo, ref, true)
  return r.ya_pasada ? `${e.objeto_id}: ya había pasado` : `${e.objeto_id}: pasó sin revisión (venció la espera de la jefatura)`
}
