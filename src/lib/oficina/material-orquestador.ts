/**
 * EL TURNO `material` · cuando a un paso le falta material la oficina se lo PIDE al portero (no a la consulta suelta) y espera su aviso. Mismo patrón que el paso `jefatura`:
 *  ① el turno se GUARDA antes del pedido (si el aviso llega rápido, ya hay un turno abierto que lo reciba);
 *  ② el pedido lleva `avisar_a` (la ruta de vuelta) y un `pedido_id` determinista (un reintento no paga dos veces);
 *  ③ la respuesta puede llegar en la misma llamada, por el aviso, o por la lectura del vigía (20 min; techo de 30): lo que no llegue se cierra como `sin_dato` y la oficina SIGUE (generar / declarar);
 *  ④ «el portero negó por tope», «no contestó» y «no tiene nada» son lo mismo para la pieza: sin dato. Nunca un error, nunca un cuelgue, nunca un gasto doble.
 * Todo nace APAGADO (`limites.material_activo`). Sin ese booleano la oficina funciona exactamente como antes.
 */
import crypto from 'node:crypto'
import { datos, fichaNueva } from './ayudas'
import { medirFotos } from './material-fotos'
import {
  leerRef, leerRespuestaDelPortero, limitesDeMaterial, necesidadesQueBloquean, pedidoDeFotos, pedidoDeHechos, rotuloDeOrigen,
  type ClaseDeMaterial, type NecesidadDeAgente, type PedidoAlPortero, type ResultadoDeMaterial,
} from './material'
import { avanzar, plantillaDe, type Respuesta } from './orquestador'
import type { Encargo, Puertos } from './puertos'
import type { Estado, Ficha, Plantilla } from './tipos'

const r = (status: number, cuerpo: Record<string, unknown>): Respuesta => ({ status, cuerpo })
export const ARTEFACTO_DE_MATERIAL = 'material'

export interface MaterialDelEncargo {
  clase: ClaseDeMaterial
  /** el paso que pidió el material (se reanuda en ÉL) */
  paso: string
  n: number
  pedido_id: string
  abierto_en: string
  estado: 'abierto' | 'resuelto'
  resultado?: { estado: ResultadoDeMaterial['estado']; detalle: string; costo_usd: number; fotos: ResultadoDeMaterial['fotos']; hechos: ResultadoDeMaterial['hechos']; cerrado_por: 'respuesta' | 'aviso' | 'vigia' | 'plazo' | 'ensayo' }
  necesidades?: NecesidadDeAgente[]
}
export const materialDe = (e: Estado): MaterialDelEncargo | undefined => datos(e, ARTEFACTO_DE_MATERIAL) as unknown as MaterialDelEncargo | undefined

function conMaterial(e: Estado, m: MaterialDelEncargo): Estado {
  const antes = e.artefactos[ARTEFACTO_DE_MATERIAL]
  return { ...e, artefactos: { ...e.artefactos, [ARTEFACTO_DE_MATERIAL]: { version: (antes?.version ?? 0) + 1, version_consumida: antes?.version_consumida ?? 0, datos: m as unknown as Record<string, unknown> } } }
}
const artefactoDe = (e: Estado) => ({ tipo: ARTEFACTO_DE_MATERIAL, version: e.artefactos[ARTEFACTO_DE_MATERIAL].version, contenido: e.artefactos[ARTEFACTO_DE_MATERIAL].datos, sha256: '', autor: 'oficina' })
const sha = (x: unknown) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex')
const turnoDe = (e: Estado) => e.pasos_ejecutados + 1

interface Apertura {
  clase: ClaseDeMaterial
  paso: string
  armar: (n: number, avisarA: string) => PedidoAlPortero
  necesidades?: NecesidadDeAgente[]
}

/** ① ANTES de las fotos: ¿hay suficientes fotos propias aptas? Si no, se pide al portero. Devuelve `null` para seguir con el paso. */
export async function antesDeLasFotos(P: Puertos, enc: Encargo, pl: Plantilla, pasoClave: string): Promise<Respuesta | null> {
  const lim = limitesDeMaterial(pl.limites)
  if (!lim.activo || !P.cerebro) return null
  const e = enc.estado_del_motor
  if ((e.vueltas['material:foto'] ?? 0) >= lim.max_pedidos) return null // ya se pidió (o el cupo es 0): se sigue con lo que hay
  const med = medirFotos(e, pl, P.ahora())
  if (med.aptas >= med.minimo) return null
  return abrir(P, enc, pl, { clase: 'foto', paso: pasoClave, armar: (n, avisarA) => pedidoDeFotos({ client_id: enc.client_id, encargo_id: enc.id, n, paso: pasoClave, protagonista: med.protas, minimo: med.minimo, aptas: med.aptas, avisar_a: avisarA, dry_run: enc.dry_run }) })
}

/** ② DESPUÉS de un agente: si dijo `necesito` (lo que BLOQUEA su trabajo) la promesa de la sala se cumple una vez por paso: se le pide al portero y el agente vuelve a trabajar con la respuesta */
export async function despuesDeUnAgente(P: Puertos, enc: Encargo, pl: Plantilla, pasoClave: string, valor: unknown): Promise<{ necesidades: NecesidadDeAgente[] }> {
  const lim = limitesDeMaterial(pl.limites)
  if (!lim.activo || !P.cerebro) return { necesidades: [] }
  const e = enc.estado_del_motor
  if ((e.vueltas[`necesito:${pasoClave}`] ?? 0) >= 1 || (e.vueltas['material:hecho'] ?? 0) >= lim.max_pedidos) return { necesidades: [] }
  return { necesidades: necesidadesQueBloquean(valor) }
}
export async function pedirLoQueElAgenteNecesita(P: Puertos, enc: Encargo, pl: Plantilla, pasoClave: string, necesidades: NecesidadDeAgente[]): Promise<Respuesta> {
  const e = enc.estado_del_motor
  const nuevo: Estado = { ...e, vueltas: { ...e.vueltas, [`necesito:${pasoClave}`]: 1 } }
  return abrir(P, { ...enc, estado_del_motor: nuevo }, pl, { clase: 'hecho', paso: pasoClave, necesidades, armar: (n, avisarA) => pedidoDeHechos({ client_id: enc.client_id, encargo_id: enc.id, n, paso: pasoClave, necesidades, avisar_a: avisarA, dry_run: enc.dry_run }) })
}

async function abrir(P: Puertos, enc: Encargo, pl: Plantilla, a: Apertura): Promise<Respuesta> {
  const lim = limitesDeMaterial(pl.limites)
  const e0 = enc.estado_del_motor
  const n = turnoDe(e0)
  const dispatch_key = `${enc.id}:${n}`
  const vueltas = { ...e0.vueltas, [`material:${a.clase}`]: (e0.vueltas[`material:${a.clase}`] ?? 0) + 1 }
  const pedido = a.armar(n, P.cerebro!.avisarA)
  const m: MaterialDelEncargo = { clase: a.clase, paso: a.paso, n, pedido_id: pedido.pedido_id, abierto_en: P.ahora().toISOString(), estado: 'abierto', ...(a.necesidades ? { necesidades: a.necesidades } : {}) }
  const e1 = conMaterial({ ...e0, vueltas }, m)
  // ① el turno se guarda ANTES del pedido: un aviso rápido encuentra su turno abierto
  await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: e1, gasto_usd: e1.gasto_usd, estado: 'en_paso', turno: { n, paso: a.paso, tipo: 'material', agente: null, estado: 'corriendo', dispatch_key, cost_usd: 0 } })
  const enc1: Encargo = { ...enc, estado_del_motor: e1 }
  if (enc.dry_run) return seguir(P, await cerrar(P, enc1, pl, { estado: 'seco', detalle: 'ensayo: no se le pidió nada al portero', costo_usd: 0, fotos: [], hechos: [] }, 'ensayo'))
  const resp = await P.cerebro!.pedir(pedido)
  if (!resp.ok) {
    // el portero negó (apagado, tope, entrada) o no se pudo hablar con él: es «sin dato», no un error de la pieza
    const negado = resp.http === 429 || /tope|apagad/i.test(resp.error)
    return seguir(P, await cerrar(P, enc1, pl, { estado: negado ? 'negado' : 'sin_dato', detalle: `el pedido no prosperó: ${resp.error}`.slice(0, 300), costo_usd: 0, fotos: [], hechos: [] }, 'respuesta'))
  }
  const res = leerRespuestaDelPortero(resp.body, a.clase)
  if (res.estado === 'en_proceso') return r(200, { accion: 'esperar_material', turno: { n, paso: a.paso, tipo: 'material', dispatch_key }, pedido_id: pedido.pedido_id, plazo_min: lim.plazo_min })
  return seguir(P, await cerrar(P, enc1, pl, { ...res, costo_usd: Math.min(res.costo_usd, lim.tope_usd) }, 'respuesta'))
}

const seguir = (P: Puertos, enc: Encargo): Promise<Respuesta> => avanzar(P, enc.id)

/** lo que se anota cuando el material no vino (o vino cercano): la pieza lo DECLARA, nunca lo inventa */
function fichaDeMaterial(clase: ClaseDeMaterial, res: ResultadoDeMaterial, paso: string): Ficha | null {
  if (res.estado === 'resuelto' || res.estado === 'seco') return null
  const donde = clase === 'foto' ? 'imagen' : 'texto'
  if (res.estado === 'cercano') return fichaNueva(`material-${clase}-cercano`, 'chequeo', donde, 'sugerencia', `el portero entregó lo más cercano que halló (${res.fotos.length || res.hechos.length} ${clase === 'foto' ? 'foto(s)' : 'dato(s)'}), no exactamente lo pedido para «${paso}»`, 'material pedido al portero', 'revisar lo rotulado como cercano')
  return fichaNueva(`material-${clase}-${res.estado}`, 'chequeo', donde, 'sugerencia', clase === 'foto' ? 'el portero no tenía fotos suficientes ni pudo traerlas a tiempo: las imágenes que faltan se generan con el contexto del cliente (rotuladas) o salen tipográficas' : `el portero no tenía los datos que pidió «${paso}»: la pieza los declara como faltantes, no los inventa`, 'material pedido al portero', clase === 'foto' ? 'revisar las imágenes rotuladas como generadas' : 'completar el dato a mano si hace falta')
}

/** cierra el turno de material (guarda lo recibido, refresca las fotos del cliente y descuenta el pedido); NO sigue: quien lo llama decide cómo continuar */
export async function cerrar(P: Puertos, enc0: Encargo, pl: Plantilla, res: ResultadoDeMaterial, por: NonNullable<MaterialDelEncargo['resultado']>['cerrado_por']): Promise<Encargo> {
  // se vuelve a leer: si el aviso del portero llegó mientras se esperaba su respuesta, el turno ya está cerrado y NO se cierra dos veces (ni se cobra dos veces)
  const enc = (await P.almacen.leerEncargo(enc0.id)) ?? enc0
  const e = enc.estado_del_motor
  const m = materialDe(e)
  if (!m || m.estado !== 'abierto') return enc
  const lim = limitesDeMaterial(pl.limites)
  const costo = Math.min(Math.max(0, res.costo_usd), lim.tope_usd)
  let est: Estado = e
  // las fotos que el portero acaba de traer o etiquetar ya están en la base: se vuelven a leer (US$ 0)
  if (m.clase === 'foto' && res.estado !== 'seco') {
    const fu = await P.fuentes(enc.client_id)
    const b = datos(e, 'encargo')
    if (!('error' in fu) && b) {
      const nueva = { ...b, F: { ...(b.F as object), fotos: fu.fotos, referencias: fu.referencias ?? [], vocabulario_de_productos: fu.vocabulario_de_productos } }
      est = { ...est, artefactos: { ...est.artefactos, encargo: { ...est.artefactos.encargo, datos: nueva } } }
    }
  }
  const ficha = fichaDeMaterial(m.clase, res, m.paso)
  const hecho: MaterialDelEncargo = { ...m, estado: 'resuelto', resultado: { estado: res.estado, detalle: res.detalle, costo_usd: costo, fotos: res.fotos, hechos: res.hechos, cerrado_por: por } }
  est = conMaterial(est, hecho)
  est = { ...est, pasos_ejecutados: est.pasos_ejecutados + 1, gasto_usd: +(est.gasto_usd + costo).toFixed(6), fichas: ficha ? [...est.fichas.filter((f) => f.id !== ficha.id), ficha] : est.fichas }
  const art = artefactoDe(est)
  await P.almacen.guardar({
    encargo_id: enc.id, estado_del_motor: est, gasto_usd: est.gasto_usd, estado: 'en_paso',
    turno: { n: m.n, paso: m.paso, tipo: 'material', agente: null, estado: res.estado === 'sin_dato' || res.estado === 'negado' ? 'hecho' : 'hecho', dispatch_key: `${enc.id}:${m.n}`, cost_usd: costo, error: res.estado === 'sin_dato' || res.estado === 'negado' ? `${res.estado}: ${res.detalle}`.slice(0, 300) : null },
    artefacto: { ...art, sha256: sha(art.contenido) },
    ...(ficha ? { fichas: [ficha] } : {}),
    ...(costo > 0 ? { gastos: [{ concepto: 'portero' as const, ref_tabla: 'cerebro_pedidos', ref_id: m.pedido_id, cost_usd: costo, base: 'usage' as const }] } : {}),
  })
  return { ...enc, estado_del_motor: est, gasto_usd: est.gasto_usd }
}

/** ③ el AVISO del portero (`POST /api/oficina/material-vuelta`): reanuda el encargo en el MISMO paso. Idempotente: un aviso repetido, tardío o ajeno no hace nada. */
export async function recibirMaterial(P: Puertos, aviso: unknown): Promise<Respuesta> {
  const b = (aviso && typeof aviso === 'object' ? aviso : {}) as Record<string, unknown>
  const ref = leerRef(b.ref_de_quien_pide)
  if (!ref) return r(400, { error: 'entrada_invalida', detalle: '`ref_de_quien_pide` debe ser «<encargo_id>:<n>»' })
  const enc = await P.almacen.leerEncargo(ref.encargo_id)
  if (!enc) return r(404, { error: 'encargo_inexistente' })
  const abierto = await P.almacen.turnoAbierto(enc.id)
  const m = materialDe(enc.estado_del_motor)
  if (!abierto || abierto.tipo !== 'material' || abierto.n !== ref.n || !m || m.estado !== 'abierto' || m.pedido_id !== String(b.pedido_id ?? '')) return r(200, { accion: 'sin_efecto', motivo: 'no hay un turno de material abierto que corresponda a este aviso (repetido, tardío o ajeno)' })
  const pl = await plantillaDe(P, enc)
  let res = leerRespuestaDelPortero(b, m.clase)
  if (res.estado === 'en_proceso') res = { ...res, estado: 'sin_dato', detalle: 'el portero terminó sin traer lo pedido' }
  const nuevo = await cerrar(P, enc, pl, res, 'aviso')
  return avanzar(P, nuevo.id)
}

/** ④ el VIGÍA: un turno de material que lleva más de `plazo_min` se lee por nuestra cuenta; pasado el techo se cierra sin dato. Devuelve si lo cerró (para que el flujo lo reanude). */
export async function resolverMaterialVencido(P: Puertos, enc: Encargo, pl: Plantilla, inicioIso: string, ahora: Date): Promise<'cerrado' | 'espera'> {
  const m = materialDe(enc.estado_del_motor)
  if (!m || m.estado !== 'abierto') return 'cerrado'
  const lim = limitesDeMaterial(pl.limites)
  const minutos = (ahora.getTime() - new Date(inicioIso).getTime()) / 60_000
  if (minutos < lim.plazo_min) return 'espera'
  if (P.cerebro) {
    const l = await P.cerebro.leerPedido(m.pedido_id)
    if (l.ok) {
      const res = leerRespuestaDelPortero(l.body, m.clase)
      if (res.estado !== 'en_proceso') { await cerrar(P, enc, pl, res, 'vigia'); return 'cerrado' }
    }
  }
  if (minutos < lim.techo_min) return 'espera'
  await cerrar(P, enc, pl, { estado: 'sin_dato', detalle: `el portero no contestó en ${lim.techo_min} min: la oficina sigue con lo que hay`, costo_usd: 0, fotos: [], hechos: [] }, 'plazo')
  return 'cerrado'
}

/** lo que el portero trajo para el paso `paso`, en texto, para el pedido del agente que lo pidió (solo hechos; las fotos van por el curador) */
export function seccionDeMaterialParaElAgente(e: Estado, paso: string): string {
  const m = materialDe(e)
  if (!m || m.estado !== 'resuelto' || m.clase !== 'hecho' || m.paso !== paso || !m.necesidades?.length) return ''
  const hs = m.resultado?.hechos ?? []
  const pedidas = m.necesidades.map((x) => `- ${x.que}`).join('\n')
  const traidos = hs.length ? hs.map((h) => `- ${h.texto}${h.fuente ? ` (fuente: ${h.fuente})` : ''}`).join('\n') : '- (el portero no tenía nada de esto)'
  return `\n\n## Lo que pediste al portero y lo que trajo\nPediste:\n${pedidas}\nTrajo:\n${traidos}\nUsa SOLO lo que trajo, con su fuente. Lo que no vino lo declaras como faltante: no lo inventes y no vuelvas a pedirlo.`
}

/** el rótulo de las fotos para el curador y la bandeja */
export const rotulosDeFotos = (fotos: Array<{ origen?: 'propia' | 'competencia' | 'referencia' }>): string[] => [...new Set(fotos.map((f) => rotuloDeOrigen(f.origen)))]
