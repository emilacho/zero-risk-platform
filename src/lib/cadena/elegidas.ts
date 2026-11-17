/**
 * «PRODUCIR ESTAS FILAS» (CC1 · 17-nov · RESPUESTA de Lenovo, opción A de la mini-prueba). Hasta hoy una campaña PAUSADA no soltaba nada: el reloj solo pide lotes de campañas activas y
 * reanudarla suelta la semana entera (y después las siguientes). Esta acción suelta SOLO las filas elegidas, por el MISMO camino de siempre: el sobre de lote `cadena/vigia · briefear` a la sala →
 * el flujo de brief («parte por filas») → `autoproducir` → la oficina. La campaña sigue pausada.
 *
 * El candado es un PERMISO por fila (`cadena_filas_elegidas`, con lote y vencimiento): el flujo de brief y `autoproducir` dejan pasar una campaña pausada SOLO si todas las filas del lote tienen su permiso
 * vigente. Sin permiso, todo es como antes (campaña pausada = no se produce nada).
 *
 * Lo decide Emilio (gasta): la llamada viene del tablero (`workflow_id: 'tablero'`, decisión humana) o de un flujo de la cadena. Nunca llama a un modelo: solo deja el sobre en la sala.
 */
import type { Almacen, Campana } from './almacen'
import { autorizarLlamada, cadena, compuerta, err, leerSeco, type Respuesta } from './autorizar'
import { sobreDeLote } from './arranque'
import { huellaDeLote } from './lotes'
import { filaSinFamilia } from './sin-familia'

/** cuánto vive un permiso: alcanza para que el brief y la oficina abran; si no se usó en ese tiempo, la campaña vuelve a no soltar esa fila */
export const HORAS_DE_VIDA_DEL_PERMISO = 24
/** cuántas filas como máximo por llamada (una semana del calendario no pasa de ~14) */
export const MAXIMO_DE_FILAS_ELEGIDAS = 14
/** los estados en que una fila puede entrar a un lote (los mismos que el reloj: `lotes.ts`) */
const LISTAS = new Set(['validada', 'lista_para_brief'])

export interface PermisoDeFila { campana_id: string; fila_id: string; calendario_version: number; lote: string; vence_en: string; nota: string | null; workflow_id: string | null; workflow_execution_id: string | null }

/** el nombre del lote elegido: `elegidas-AAAAMMDDTHHMM` (UTC, al minuto) · lo valida la tabla */
export const loteElegido = (ahora: string): string => `elegidas-${ahora.slice(0, 4)}${ahora.slice(5, 7)}${ahora.slice(8, 10)}T${ahora.slice(11, 13)}${ahora.slice(14, 16)}`

/**
 * ¿una campaña pausada puede soltar ESTAS filas? Solo si TODAS tienen un permiso vigente. Lo usan `autoproducir` y (por `filas · listar`) el flujo de brief.
 * Una campaña activa no necesita permiso; cualquier otro estado, nunca.
 */
export async function filasPermitidas(al: Almacen, c: Pick<Campana, 'id' | 'estado'>, filaIds: readonly string[], ahora: string): Promise<boolean> {
  if (c.estado === 'activa') return true
  if (c.estado !== 'pausada' || !filaIds.length || !al.filasElegidas) return false
  const vigentes = new Set(await al.filasElegidas(c.id, ahora))
  return filaIds.every((id) => vigentes.has(id))
}

export async function filasProducir(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const id = cadena(cuerpo.campana_id)
  if (!id) return err(400, 'E-CAMPOS', 'falta campana_id')
  const ids = Array.isArray(cuerpo.fila_ids) ? cuerpo.fila_ids : null
  if (!ids || !ids.length || ids.some((x) => typeof x !== 'string' || !x.trim())) return err(400, 'E-CAMPOS', 'fila_ids debe ser una lista no vacía de ids de fila')
  if (new Set(ids).size !== ids.length) return err(400, 'E-FILAS-REPETIDAS', 'la lista repite filas')
  if (ids.length > MAXIMO_DE_FILAS_ELEGIDAS) return err(400, 'E-DEMASIADAS-FILAS', `hasta ${MAXIMO_DE_FILAS_ELEGIDAS} filas por vez`)
  const s = leerSeco(cuerpo); if (!s.ok) return s.r
  const c = await al.campana(id)
  if (!c) return err(404, 'E-CAMPANA', 'la campaña no existe')
  const noAut = await autorizarLlamada(al, cuerpo, c.client_id, { humano: true })
  if (noAut) return noAut
  if (c.estado !== 'pausada') return err(409, 'E-CAMPANA-NO-PAUSADA', `la campaña está ${c.estado}: elegir filas es para una campaña pausada (una activa las suelta el reloj)`)
  // el seco lo decide la campaña (como el reloj): una campaña real no se ensaya por esta puerta ni al revés
  if (s.seco !== (c.seco === true)) return err(409, 'E-SECO-NO-COINCIDE', `la campaña es ${c.seco === true ? 'de ensayo (seco)' : 'real'} y la llamada pidió ${s.seco ? 'seco' : 'real'}`)
  const cerrada = await compuerta(al, c.client_id, c.seco === true)
  if (cerrada) return cerrada
  if (!al.elegirFilas || !al.filasElegidas) return err(501, 'E-SIN-PERMISOS', 'el almacén no guarda permisos de filas elegidas: no se suelta nada')
  const version = Math.max(1, await al.ultimaVersionDeCalendario(c.id))
  const formatos = await al.formatos()
  const porId = new Map((await al.filas(c.id, version)).map((f) => [f.id, f]))
  const malas: Array<{ fila_id: string; motivo: string }> = []
  for (const fid of ids as string[]) {
    const f = porId.get(fid)
    if (!f) { malas.push({ fila_id: fid, motivo: 'no existe en el calendario vigente' }); continue }
    if (f.fecha < ahora.slice(0, 10)) { malas.push({ fila_id: fid, motivo: `su fecha (${f.fecha}) ya pasó` }); continue }
    if (!LISTAS.has(f.estado)) { malas.push({ fila_id: fid, motivo: f.estado === 'briefeada' ? 'ya salió briefeada: si su pieza falló, se rehace por pieza' : `está ${f.estado}` }); continue }
    // la MISMA regla que el reloj (`lotes.ts`): sin familia en la tabla no entra a un lote; una tabla sin familias = pieza simple, como hoy
    if (filaSinFamilia(f, formatos)) malas.push({ fila_id: fid, motivo: `su formato (${f.red} · ${f.formato}) no tiene familia que lo produzca` })
  }
  if (malas.length) return err(409, 'E-FILAS-NO-PRODUCIBLES', 'alguna fila no se puede producir; no se soltó ninguna', { filas: malas })
  const lote = loteElegido(ahora)
  const vence = new Date(new Date(ahora).getTime() + HORAS_DE_VIDA_DEL_PERMISO * 3_600_000).toISOString()
  const nota = cadena(cuerpo.nota)
  await al.elegirFilas((ids as string[]).map((fid) => ({
    campana_id: c.id, fila_id: fid, calendario_version: version, lote, vence_en: vence, nota: nota ? nota.slice(0, 500) : null,
    workflow_id: cadena(cuerpo.workflow_id), workflow_execution_id: cadena(cuerpo.workflow_execution_id),
  })))
  // el MISMO sobre que deja el reloj (`arranque.ts`), con su propio lote: la sala lo manda al flujo de brief
  const fila_ids = ids as string[]
  const r = await al.emitirSobre(sobreDeLote(c, { lote, fila_ids, idempotency_key: `${c.id}:${lote}:${version}:${huellaDeLote(fila_ids)}` }))
  if (r.resultado === 'rechazado') return err(502, 'E-SALA-RECHAZO', `la sala rechazó el sobre: ${r.detalle ?? 'sin detalle'}`, { lote, fila_ids })
  return { status: 200, cuerpo: { accion: 'producir', lote, fila_ids, version, vence_en: vence, sobre: r.resultado } }
}
