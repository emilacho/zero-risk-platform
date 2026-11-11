/**
 * AUTOPRODUCIR (CC#1 · 2026-10-11 · firma de Emilio: «el brief manda solo a producir»). Cuando la cadena deja un parte listo, cada brief sale SOLO hacia la sala de su familia:
 * un sobre `brief/parte-listo · producir` por brief, con la `familia` que dejó la copia por filas en `provenance_tag.familias_por_brief`; sin familia, el sobre va SIN `familia`
 * (la puerta de la oficina lo manda a la pieza simple, como hoy). Sin humano en el medio: Emilio solo aprueba en la bandeja.
 *
 * NACE APAGADO, con DOS candados que se leen aquí (y un tercero que es de la sala):
 *   1. el interruptor propio: `cadena_campanas.autoproducir` (por campaña · falso por omisión) · si no es `true`, no sale nada;
 *   2. la compuerta de la cadena (`compuerta`): lo real exige la cadena `encendida`, o `ensayo` con el cliente en `clientes_ensayo`; `dry_run: true` corre en cualquier estado (así se ensaya con todo apagado);
 *   3. la puerta de la oficina (su propia configuración): con la oficina `apagada` el sobre sigue por la pieza simple, intacto.
 * Respeta el freno de gasto §150 y el tope por cliente (#487): con el cliente ya al techo de las 24 h NO sale ningún sobre (lo real; el ensayo no gasta).
 * 10-nov · y el TOPE POR CAMPAÑA (`tope-de-campana.ts`): lo real solo suelta las piezas que caben entre lo gastado, lo comprometido y el tope que guarda la campaña;
 * sin tope o con el gasto ilegible no sale ninguna, y el buzón recibe UN aviso por campaña (y por monto de tope).
 * IDEMPOTENTE: la llave del sobre es `<parte_id>:<brief_id>:producir` · un brief = un sobre aunque la llamada se repita (la sala responde `duplicate`).
 * Este módulo NUNCA llama a un modelo ni despacha: solo deja sobres en la sala (que es quien despacha, ADR-018).
 */
import type { Almacen, Campana } from './almacen'
import { autorizarLlamada, cadena, compuerta, err, leerSeco, type Respuesta } from './autorizar'
import { avisoDeGastoIlegible, avisoDelTope, cierreDelTope, costoEsperadoDeLaPieza, decidirTope, esperandoPorVenir, filasPorVenir, medirGastoDeCampana, type AvisoDelTope, type DecisionDelTope } from './tope-de-campana'
import { hoyEnZona } from './campanas'
import { familiaDeFila } from './familia'
import { filaSinFamilia } from './sin-familia'
import { decidirPuerta, TARGET_STEP_PRODUCIR, type ConfigDeOficina, type Sobre } from '@/lib/oficina/sobre'

export const FUENTE_DEL_SOBRE = 'brief/parte-listo'
export const INTENCION_DEL_SOBRE = 'producir'
/** cuánto vive el parte de un ensayo en seco antes de borrarse solo (alcanza para que las salas lo lean; lo barre la siguiente llamada de ensayo) */
export const HORAS_DE_VIDA_DEL_PARTE_SECO = 24
const RE_FAMILIA =/^[a-z][a-z0-9_]{0,39}$/
const RE_BRIEF = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,39}$/

export interface BriefDeParte { brief_id: string | null; fila_id: string | null; familia: string | null }
/** el parte tal como lo dejó la copia por filas (`client_historical_outputs` · `campaign_brief_pack`) */
export interface ParteGuardada { id: string; client_id: string; valido: boolean; briefs: BriefDeParte[] }

export interface SobreDeProducir {
  source: typeof FUENTE_DEL_SOBRE
  intent: typeof INTENCION_DEL_SOBRE
  payload: { parte_id: string; brief_id: string; dry_run: boolean; familia?: string; fila_id?: string; fecha?: string; hora?: string; desde_worker?: string }
  idempotency_key: string
  logical_period: string
  tenant_id: string
  client_id: string
  correlation_id?: string
}
export interface ResultadoDeEmision { resultado: 'aceptado' | 'duplicado' | 'rechazado'; event_id?: string | null; detalle?: string }

export type MotivoDeOmision = 'brief_sin_id' | 'brief_id_invalido' | 'brief_repetido_en_el_parte'
export interface Omitido { brief_id: string | null; motivo: MotivoDeOmision | string }

/** la llave de idempotencia de UN brief de UN parte · estable ante reintentos */
export const llaveDeProducir = (parteId: string, briefId: string): string => `${parteId}:${briefId}:producir`
/** el intento n (1, 2, 3…) del reintento sistémico de piezas (`reintento-piezas.ts`): llave NUEVA y determinista, distinta de la original, para que la sala no conteste «duplicado» */
export const llaveDeReintento = (parteId: string, briefId: string, n: number): string => `${llaveDeProducir(parteId, briefId)}:r${n}`

/** un sobre por brief · sin `familia` si la fila no tiene sala o la familia viene mal escrita (nunca se inventa) · dedup por `brief_id` · puro */
export function sobresDeProducir(parte: ParteGuardada, o: { dry_run: boolean; tenant_id?: string; correlation_id?: string | null; desde_worker?: string; /** r79 · D5 · fila_id → fecha y hora del calendario */ cuando?: ReadonlyMap<string, { fecha: string; hora: string | null }> }): { sobres: SobreDeProducir[]; omitidos: Omitido[] } {
  const sobres: SobreDeProducir[] = [], omitidos: Omitido[] = [], vistos = new Set<string>()
  for (const b of parte.briefs) {
    const id = typeof b.brief_id === 'string' ? b.brief_id.trim() : ''
    if (!id) { omitidos.push({ brief_id: null, motivo: 'brief_sin_id' }); continue }
    if (!RE_BRIEF.test(id)) { omitidos.push({ brief_id: id, motivo: 'brief_id_invalido' }); continue }
    if (vistos.has(id)) { omitidos.push({ brief_id: id, motivo: 'brief_repetido_en_el_parte' }); continue }
    vistos.add(id)
    const familia = typeof b.familia === 'string' && RE_FAMILIA.test(b.familia.trim()) ? b.familia.trim() : null
    sobres.push({
      source: FUENTE_DEL_SOBRE, intent: INTENCION_DEL_SOBRE,
      payload: { parte_id: parte.id, brief_id: id, dry_run: o.dry_run, ...(familia ? { familia } : {}), ...(b.fila_id ? { fila_id: b.fila_id } : {}), ...(b.fila_id && o.cuando?.get(b.fila_id) ? { fecha: o.cuando.get(b.fila_id)!.fecha, ...(o.cuando.get(b.fila_id)!.hora ? { hora: o.cuando.get(b.fila_id)!.hora! } : {}) } : {}), ...(o.desde_worker ? { desde_worker: o.desde_worker } : {}) },
      idempotency_key: llaveDeProducir(parte.id, id),
      logical_period: `parte:${parte.id}`,
      tenant_id: o.tenant_id ?? parte.client_id,
      client_id: parte.client_id,
      ...(o.correlation_id ? { correlation_id: o.correlation_id } : {}),
    })
  }
  return { sobres, omitidos }
}

/**
 * POST /api/cadena/filas · `accion: 'autoproducir'` · `{ campana_id, parte_id, dry_run (obligatorio, booleano), workflow_id, workflow_execution_id, _sala_correlation_id?, _journey_id? }`.
 * Devuelve cuántos sobres salieron (`emitidos`), cuántos ya existían (`duplicados`), cuáles se omitieron y por qué. Con la compuerta cerrada contesta 409 SIN sacar nada.
 */
/** 11-nov · ¿la puerta de la oficina dejará esta familia SIN SALA para este cliente? (= no se produce y no espera pasarela) · la MISMA función que la oficina (`decidirPuerta`) · pura */
export const quedaSinSala = (familia: string | null, config: ConfigDeOficina, clientId: string): boolean =>
  !!familia && decidirPuerta({ familia } as Sobre, config, TARGET_STEP_PRODUCIR, clientId, (config.sin_pasarela ?? []).includes(familia)).accion === 'sin_sala'

/** la campaña tal como la necesita el tope */
export type CampanaDelTope = Pick<Campana, 'id' | 'client_id' | 'tope_gasto_usd' | 'zona_horaria'>
/**
 * LA decisión del tope de campaña para las piezas de UN parte (10-nov · CC1; 11-nov · extraída para que el reintento de piezas use la MISMA, GO Lenovo 03:02Z).
 * Lanza si el gasto o el calendario no se pueden leer (un error no es «cero gastado»: quien llama no suelta nada).
 *   · `cuestan`: briefs que cuentan su tope AUNQUE ya tengan un encargo (el reintento: su encargo fallido no gastó y la pieza va a volver a gastar);
 *   · `enCamino`: piezas de OTROS partes que el reintento ya soltó en esta misma pasada. Comprometen su tope salvo que ya estén contadas: una sin encargo cuyo sobre la sala ya
 *     recibió ya está en lo comprometido; una con encargo (fallido, sin gasto) o cuyo sobre nunca llegó, no → se suma (y deja de guardar lugar por fecha).
 */
export async function decidirTopeDelParte(
  al: Pick<Almacen, 'leerGastoDeCampana' | 'formatos' | 'configDeLaOficina'>, c: CampanaDelTope, parteId: string, todos: SobreDeProducir[],
  filasDelCalendario: Awaited<ReturnType<Almacen['filas']>> | null, cuando: ReadonlyMap<string, { fecha: string; hora: string | null }>,
  o: { cuestan?: ReadonlySet<string>; enCamino?: ReadonlyArray<{ parte_id: string; brief_id: string; familia: string | null }>; ahora?: Date } = {},
): Promise<DecisionDelTope> {
  const l = await al.leerGastoDeCampana(c.id, parteId)
  // lo más cercano primero también ENTRE partes: sin el calendario no se sabe qué va antes, y eso es gasto ilegible (no «nada antes»)
  if (!filasDelCalendario) throw new Error('no se pudo leer el calendario de la campaña')
  const formatos = await al.formatos()
  // 11-nov · GO Lenovo 01:10Z (ADENDA 3 de CC7 sobre #1019): el freno NO guarda lugar para lo que no se va a producir · genérico, cualquier cliente:
  //   · una fila sin familia nunca sale del lote (`sin-familia.ts`);
  //   · una fila cuya familia la puerta de la oficina deja SIN SALA (familia sin pieza simple, hoy `video_mesa`, que no abre): la misma función y la misma config que la oficina.
  //     Una familia inactiva CON pieza simple sí se produce (por la pasarela): sigue guardando lugar. Si la config no se puede leer, se guarda lugar como hoy (del lado seguro).
  let oficina: ConfigDeOficina | null = null
  try { oficina = al.configDeLaOficina ? await al.configDeLaOficina() : null } catch { oficina = null }
  const sinSala = (familia: string | null): boolean => !!oficina && quedaSinSala(familia, oficina, c.client_id)
  const seProduce = (f: (typeof filasDelCalendario)[number]): boolean => !filaSinFamilia(f, formatos) && !sinSala(familiaDeFila(f, formatos))
  const porVenir = filasPorVenir(filasDelCalendario.filter(seProduce).map((f) => ({ id: f.id, fecha: f.fecha, hora: f.hora ?? null, estado: f.estado, familia: familiaDeFila(f, formatos) })), hoyEnZona((o.ahora ?? new Date()).toISOString(), c.zona_horaria), l.partes, todos.map((x) => x.payload.fila_id))
  const conEncargo = new Set(l.encargos.filter((e) => e.parte_id === parteId && e.brief_id).map((e) => e.brief_id as string))
  const candidatas = todos.map((x) => ({ brief_id: x.payload.brief_id, familia: x.payload.familia ?? null, fecha: x.payload.fecha ?? null, hora: x.payload.hora ?? null, ya_tiene_encargo: conEncargo.has(x.payload.brief_id) && !o.cuestan?.has(x.payload.brief_id), no_se_produce: sinSala(x.payload.familia ?? null) }))
  // lo retenido (o nunca salido) de OTROS partes guarda lugar por fecha, como las filas por venir; lo que la sala ya recibió va en lo comprometido
  // 11-nov · GO Lenovo 01:59Z · la MISMA regla en las piezas de este parte (`no_se_produce`: salen como hoy, pero sin costo) y en las retenidas de otros partes (no guardan lugar).
  //   Un brief SIN familia no entra aquí: la puerta lo manda a la pasarela (se produce) y sigue contando con la cota pesimista; las filas sin familia ya no llegan a un parte (#1019).
  const medido = medirGastoDeCampana(l, parteId)
  const k = (p: string, b: string): string => `${p}|${b}`
  const enLaSala = new Set(l.soltados.map((x) => k(x.parte_id, x.brief_id)))
  const conEncargoReal = new Set(l.encargos.filter((e) => e.brief_id).map((e) => k(e.parte_id, e.brief_id as string)))
  const sumar = (o.enCamino ?? []).filter((x) => x.parte_id !== parteId && (conEncargoReal.has(k(x.parte_id, x.brief_id)) || !enLaSala.has(k(x.parte_id, x.brief_id))))
  const yaSumadas = new Set(sumar.map((x) => k(x.parte_id, x.brief_id)))
  const comprometido = medido.comprometido + sumar.reduce((a, x) => a + costoEsperadoDeLaPieza(l.topes_de_familia, l.reservas_de_familia, x.familia), 0)
  const esperando = medido.esperando.filter((b) => !sinSala(b.familia) && !yaSumadas.has(k(b.parte_id, b.brief_id)))
  return decidirTope(c.tope_gasto_usd, { gastado: medido.gastado, comprometido }, candidatas, l.topes_de_familia, [...porVenir, ...esperandoPorVenir(esperando, cuando)], l.reservas_de_familia)
}

export async function filasAutoproducir(al: Almacen, cuerpo: Record<string, unknown>): Promise<Respuesta> {
  const campanaId = cadena(cuerpo.campana_id)
  // r74 · F7 · EN SECO el parte no se guarda: el flujo de la parte manda un `parte_seco` con lo que HABRÍA guardado (válido + briefs con su familia) y se ensaya autoproducir sin sembrar nada a mano.
  //   Solo vale con `dry_run: true`; con `dry_run: false` se ignora y se exige un parte guardado de verdad.
  const parteSeco = cuerpo.dry_run === true && cuerpo.parte_seco && typeof cuerpo.parte_seco === 'object' && !Array.isArray(cuerpo.parte_seco) ? (cuerpo.parte_seco as Record<string, unknown>) : null
  // r79 · D3 · si el ensayo trae la fila que HABRÍA guardado (`parte_seco.fila`), se guarda de verdad marcada como seco y con otra llave de lote: la puerta de la oficina lo encuentra por su uuid, un lote real nunca lo cuenta como repetido y vence solo
  const filaSeca = parteSeco && parteSeco.fila && typeof parteSeco.fila === 'object' && !Array.isArray(parteSeco.fila) ? (parteSeco.fila as Record<string, unknown>) : null
  const parteId = cadena(cuerpo.parte_id) ?? (parteSeco && campanaId ? `seco:${campanaId}:${cadena(parteSeco.lote) ?? 'lote'}` : null)
  if (!campanaId || !parteId) return err(400, 'E-CAMPOS', 'faltan campana_id o parte_id')
  if (typeof cuerpo.dry_run !== 'boolean' && typeof cuerpo.seco !== 'boolean') return err(400, 'E-SECO-INVALIDO', '`dry_run` es obligatorio y debe ser true o false (ausente o mal escrito = no se emite nada)')
  const s = leerSeco(cuerpo); if (!s.ok) return s.r
  const c = await al.campana(campanaId)
  if (!c) return err(404, 'E-CAMPANA', 'la campaña no existe')
  const noAut = await autorizarLlamada(al, cuerpo, c.client_id)
  if (noAut) return noAut
  // candado 1 · el interruptor propio (por campaña, falso por omisión)
  if (c.autoproducir !== true) return { status: 200, cuerpo: { accion: 'autoproducir', emite: false, motivo: 'autoproducir_apagado', emitidos: 0, duplicados: 0, rechazados: 0, omitidos: [], sobres: [] } }
  // candado 2 · la compuerta de la cadena (`dry_run: true` corre con todo apagado)
  const cerrada = await compuerta(al, c.client_id, s.seco)
  if (cerrada) return cerrada
  if (c.estado !== 'activa') return err(409, 'E-CAMPANA-NO-ACTIVA', `la campaña está ${c.estado}: solo una campaña activa deja briefs listos`)
  const texto = (v: unknown): string | null => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null)
  let idDelParteSeco: string | null = null
  if (parteSeco && filaSeca) {
    const t = filaSeca.provenance_tag && typeof filaSeca.provenance_tag === 'object' && !Array.isArray(filaSeca.provenance_tag) ? (filaSeca.provenance_tag as Record<string, unknown>) : null
    const contenido = texto(filaSeca.content)
    if (t && contenido && parteSeco.valido === true) {
      const ahora = new Date()
      try {
        await al.limpiarPartesSecos(ahora.toISOString())
        idDelParteSeco = await al.guardarParteSeco({
          client_id: c.client_id, lote: texto(t.lote_key) ?? texto(parteSeco.lote) ?? campanaId, // r81 · la llave del lote de verdad (campaña:semana:versión); dos lotes de una campaña ya no se pisan el parte de ensayo
          fila: { title: texto(filaSeca.title) ?? 'parte', content: contenido, ...(texto(filaSeca.content_text) ? { content_text: texto(filaSeca.content_text)! } : {}), ...(texto(filaSeca.producing_agent) ? { producing_agent: texto(filaSeca.producing_agent)! } : {}), provenance_tag: t },
          vence_en: new Date(ahora.getTime() + HORAS_DE_VIDA_DEL_PARTE_SECO * 3_600_000).toISOString(),
        })
      } catch { idDelParteSeco = null } // si no se pudo guardar, el ensayo sigue como antes (id `seco:…`)
    }
  }
  const parte: ParteGuardada | null = parteSeco
    ? { id: idDelParteSeco ?? parteId, client_id: c.client_id, valido: parteSeco.valido === true, briefs: (Array.isArray(parteSeco.briefs) ? (parteSeco.briefs as Array<Record<string, unknown>>) : []).map((b) => ({ brief_id: texto(b?.brief_id), fila_id: texto(b?.fila_id), familia: texto(b?.familia) })) }
    : await al.parteDe(parteId)
  if (!parte) return err(404, 'E-PARTE', 'el parte no existe (o no es un parte de trabajo)')
  if (parte.client_id !== c.client_id) return err(403, 'E-PARTE-AJENO', 'el parte no es del cliente de esta campaña')
  if (!parte.valido) return { status: 200, cuerpo: { accion: 'autoproducir', emite: false, motivo: 'parte_no_valido', emitidos: 0, duplicados: 0, rechazados: 0, omitidos: [], sobres: [] } }
  // el freno de gasto: solo lo real gasta
  if (!s.seco) {
    const freno = await al.frenoDeGasto(c.client_id)
    if (freno.bloqueado) return { status: 200, cuerpo: { accion: 'autoproducir', emite: false, motivo: 'freno_de_gasto', detalle: freno.motivo ?? null, emitidos: 0, duplicados: 0, rechazados: 0, omitidos: [], sobres: [] } }
  }
  const corr = cadena(cuerpo._sala_correlation_id)
  // r79 · D5 · la fecha y la hora de cada pieza salen de SU fila del calendario (la última versión de la campaña); si la fila no se halla, el sobre va sin fecha y la ficha del brief decide
  const cuando = new Map<string, { fecha: string; hora: string | null }>()
  let filasDelCalendario: Awaited<ReturnType<Almacen['filas']>> | null = null
  try { filasDelCalendario = await al.filas(c.id, Math.max(1, await al.ultimaVersionDeCalendario(c.id))); for (const f of filasDelCalendario) if (f.fecha) cuando.set(f.id, { fecha: f.fecha, hora: f.hora ?? null }) } catch { /* sin filas legibles: los sobres salen sin fecha (y lo real no suelta nada: el tope necesita el calendario) */ }
  const { sobres: todos, omitidos } = sobresDeProducir(parte, { dry_run: s.seco, correlation_id: corr, desde_worker: cadena(cuerpo.workflow_id) ?? undefined, cuando })
  // 10-nov · TOPE POR CAMPAÑA · solo lo real gasta: el ensayo no lo consulta
  let sobres = todos
  let tope: { decision: DecisionDelTope['tipo'] | 'gasto_ilegible'; tope?: number; gastado?: number; comprometido?: number; estimado?: number; retenidas: string[]; aviso?: unknown } | null = null
  if (!s.seco) {
    const firma = { origen: 'cadena/autoproducir · tope de campaña', workflow_id: cadena(cuerpo.workflow_id) ?? null, workflow_execution_id: cadena(cuerpo.workflow_execution_id) ?? null }
    const avisar = (a: AvisoDelTope) => al.avisarAlBuzon({ ...a, ...firma })
    let d: DecisionDelTope
    try {
      d = await decidirTopeDelParte(al, c, parte.id, todos, filasDelCalendario, cuando)
    } catch (e) {
      // un error no es «cero gastado»: no sale nada y se avisa (UNA vez por campaña)
      const aviso = await avisar(avisoDeGastoIlegible(c, e instanceof Error ? e.message : String(e)))
      return { status: 200, cuerpo: { accion: 'autoproducir', emite: false, motivo: 'gasto_de_campana_ilegible', emitidos: 0, duplicados: 0, rechazados: 0, omitidos, sobres: [], tope: { decision: 'gasto_ilegible', retenidas: todos.map((x) => x.payload.brief_id), aviso } } }
    }
    // 11-nov · lo que dejó de aplicar se cierra ANTES de avisar (UNA pregunta abierta por campaña): otros montos del tope y, si todo cabe, también la del actual
    const cierre = cierreDelTope(c, d)
    await al.cerrarEnElBuzon(cierre.prefijo, cierre.salvo, cierre.nota)
    if (d.tipo === 'sin_tope') {
      const aviso = await avisar(avisoDelTope(c, d))
      return { status: 200, cuerpo: { accion: 'autoproducir', emite: false, motivo: 'campana_sin_tope', emitidos: 0, duplicados: 0, rechazados: 0, omitidos, sobres: [], tope: { decision: 'sin_tope', retenidas: d.retenidas, aviso } } }
    }
    const sueltan = new Set(d.sueltan)
    sobres = todos.filter((x) => sueltan.has(x.payload.brief_id))
    tope = { decision: d.tipo, tope: d.tope, gastado: d.gastado, comprometido: d.comprometido, estimado: d.estimado, retenidas: d.tipo === 'corta' ? d.retenidas : [] }
    if (d.tipo === 'corta') tope.aviso = await avisar(avisoDelTope(c, d))
  }
  let emitidos = 0, duplicados = 0, rechazados = 0
  const detalle: Array<{ brief_id: string; familia: string | null; resultado: ResultadoDeEmision['resultado']; motivo?: string }> = []
  for (const sobre of sobres) {
    const r = await al.emitirSobre(sobre)
    if (r.resultado === 'aceptado') emitidos++; else if (r.resultado === 'duplicado') duplicados++; else rechazados++
    detalle.push({ brief_id: sobre.payload.brief_id, familia: sobre.payload.familia ?? null, resultado: r.resultado, ...(r.detalle ? { motivo: r.detalle } : {}) })
  }
  return { status: 200, cuerpo: { accion: 'autoproducir', emite: true, dry_run: s.seco, parte_id: parte.id, emitidos, duplicados, rechazados, omitidos, sobres: detalle, sin_familia: sobres.filter((x) => !x.payload.familia).length, ...(tope ? { tope } : {}) } }
}
