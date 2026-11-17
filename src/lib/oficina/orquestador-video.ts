/**
 * EL BRAZO DE VIDEO DESDE LA OFICINA · parte 2 (31-oct · orden «construir todo antes de probar»). Familia `video_mesa`: la MESA escribe el guion (dirección creativa + guionista + coach de video corto
 * + especialista de YouTube + texto + curaduría de fotos propias); lo que sigue aquí es cola mecánica:
 *   abrir_video → (mesa) → pedido_de_video → video (el brazo `POST /api/video/generate`; espera ASÍNCRONA: un turno `brazo` que el vigía sondea) → chequeos_video → (jefatura) → empaquetar_entrega_video → cierre
 * Reglas de oficio: en dry_run NO se llama al brazo (el puerto devuelve un pedido simulado); el gasto del video entra al libro de la oficina como concepto `video` con el `session_id` del libro central
 * (`vid-<request_id>`); un video que falla, se cancela o se corta por NSFW cierra el encargo FALLIDO visible (nunca se rellena); un video que no vuelve en el plazo también.
 * Todo el contacto con el mundo entra por los puertos (`P.video` es el brazo).
 */
import crypto from 'node:crypto'
import { datos, fichaNueva } from './ayudas'
import { fechaLimiteDelBrief, parsearBrief, planDeOrigen, proporcionDelBrief, type BriefLeido } from './brief'
import { briefEsDelEncargo, claseDeLaFamilia } from './familia-del-brief'
import { claseDe } from './clase'
import { chequeosDePost, type FuentesDelCliente } from './chequeos'
import type { ContextoDelRevisor } from './ciego'
import { aUtc, chequeosDeEntrega, cuandoSePublica, manifiesto, nombreDeArchivo, textoParaCopiar, type ArchivoDeEntrega } from './entrega'
import { registrarPaso, siguientePaso, type ResultadoDePaso } from './motor'
import { materialDe } from './material-orquestador'
import { avanzar, fallar, plantillaDe, type Respuesta } from './orquestador'
import { FUNCION_DEL_BRIEF, FUNCION_DEL_MANUAL, FUNCION_DEL_PLAN, FUNCION_DEL_PORTERO } from './pedidos'
import { FUNCION_DEL_TABLERO } from './pedidos-laminas'
import type { Cambios, Encargo, EstadoDelBrazo, FuentesCompletas, Puertos } from './puertos'
import { avisoDePersonasReales, fotosConPermiso, type FotoRetirada, type PermisoDePersonaReal } from './video/permisos'
import type { Estado, Ficha, Paso, Plantilla } from './tipos'
import { CATALOGO_POR_OMISION, RELACIONES_PERMITIDAS, RELACION_POR_FORMATO, fichaPorOmision, type CatalogoDeModelos } from '../video/parametros'
import { sessionIdDeVideo } from '../video/libro'
import { guionLegible, type TraduccionDeGuion } from './video/guion'
import { LISTA_DE_FOTOS } from './mesa/pedidos'
import { COTAS } from './mesa/tipos'
import { armarPedidoDeLaOficina, buscarFotoPropia, formatoDeEntrega, formatoDeVideo, fotosPropiasConDireccion, pedidosParaCotizar, type PedidoDeVideoDeLaOficina } from './video/pedido'
import { avisoDeLaMiradaALaMesa, leerMirada, miradaLegible, nombreDelCuadro, PASO_MIRAR_VIDEO, tareaDeLaMirada, type CuadroDelVideo, type MiradaDelVideo, type SenalesDelVideo } from './video/mirada'
import { CONTRATOS_EN_TEXTO } from './pedidos'
import { fotosDeReferencia, type FotoDeReferencia } from './foto-de-referencia'
import { avisoDeLaRevisionALaMesa, calidadDeLaFase, faseDeProduccion, imagenesClaveVigentes, leerRevisionDeImagenesClave, pedidosDeImagenClave, PASO_IMAGENES_CLAVE, PASO_REVISAR_IMAGENES_CLAVE, SEGUNDOS_PARA_DOS_CUADROS, tareaDeLaRevisionDeImagenesClave, type ImagenClaveDelPlano, type ImagenesClave, type PlanoDeLaHoja } from './video/imagen-clave'
import { propuestasDe } from './video/aprobacion'
import { ARTEFACTO_PEDIDO_BORRADOR, borradoresOmitidos, FUNCION_BORRADOR_VIDEO, pedidosDeLosBorradores, RESOLUCION_DEL_BORRADOR_POR_OMISION, resolucionDelBorrador, type BorradorDeLaPropuesta, type BorradoresDeVideo } from './video/borradores'
import { pedidosPorPlano, type PedidoDePlano } from './video/planos'
import { cotizarYEnviar, encuadrarFotos, leerPlanos, separarPagados, textoDeLoCobrado, unirClips, type ClipCobrado, type PlanoEnviado } from './video/motor-planos'

/** 17-nov · DECISIÓN de Emilio: el rótulo de la entrega dice que el video y su audio son GENERADOS; ya no afirma «sin voces» (la voz la decide la mesa) */
export const ROTULO_DEL_VIDEO_GENERADO = '⚠️ El video es GENERADO por un modelo (Seedance), no una grabación real; su audio también es generado.'

/** para la jefatura: qué es el contexto «lo que vio el agente» */
export const FUNCION_DE_LA_MIRADA = 'lo que un agente con visión vio en los cuadros del video terminado (uno por plano), comparado con el guion y la fila; la imagen manda si no coinciden'

export type FamiliaDeVideo = 'video'
export const familiaDeVideo = (pl: Pick<Plantilla, 'clase'>): FamiliaDeVideo | null => (claseDe(pl) === 'video' ? 'video' : null)

/** el mismo marcador de lo simulado que usa `adaptadores.ts` (`PREFIJO_DRY`): `descargar` lo reconoce y no sale a la red */
const PREFIJO_DRY = 'https://dry.invalid/'
/** cuánto espera la oficina a que el brazo entregue un video antes de darlo por perdido (el brazo tarda ≈ 5–8 min por video; el peor caso medido 31-oct fue ≈ 7 min) */
export const MINUTOS_PARA_ESPERAR_AL_BRAZO = 45
/** 11-nov · #21 · lo que se mide del brazo: sus turnos terminados (`lectorDeVidaDeLaOficina` en `vigia.ts` lee `brazo:video` en los turnos de la oficina) */
export const AGENTE_DEL_BRAZO = 'brazo:video'

const r = (status: number, cuerpo: Record<string, unknown>): Respuesta => ({ status, cuerpo })
const sha = (x: unknown) => crypto.createHash('sha256').update(JSON.stringify(x)).digest('hex')
const txt = (x: unknown): string => (typeof x === 'string' ? x : x == null ? '' : String(x))
const arr = <T = string>(x: unknown): T[] => (Array.isArray(x) ? (x as T[]) : [])
const turnoDe = (e: Estado) => e.pasos_ejecutados + 1

export interface BaseV { brief: BriefLeido; proporcion: string; /** 11-nov · regla #17 · la proporción del brief no la admitía el generador: se usó la de por omisión (se avisa en la hoja de publicar) */ aviso_proporcion?: string; F: FuentesCompletas; familia: 'video'; plataforma: string; elementos: never[]; formato_video: string; /** 17-nov · Sprint 3 · T1 · el catálogo de modelos que leyó el encargo al ABRIR (el mismo que valida la ruta); los encargos de antes no lo traen: el del código */ catalogo_de_modelos?: CatalogoDeModelos; /** 17-nov · T1b · las fotos con personas reales que no viajaron (sin permiso vigente) y lo que se declara */ fotos_sin_permiso?: FotoRetirada[]; aviso_personas?: string }
const baseV = (e: Estado): BaseV => datos(e, 'encargo') as unknown as BaseV

/** lo que la mesa deja en el artefacto `guion` */
export type GuionDeLaMesa = TraduccionDeGuion & { texto: string }
/** lo que deja el paso `video` (y lo que lee todo lo de después) */
export interface VideoDelEncargo {
  request_id: string
  status: string
  simulado: boolean
  video_url: string | null
  url_proveedor: string | null
  copia: 'bucket' | 'solo_proveedor' | 'simulada' | null
  costo_usd: number
  costo_estimado_usd: number
  expires_at: string | null
  enviado_en: string
  terminado_en: string | null
  aviso?: string | null
  error?: string | null
  /** 11-nov · camino B · los clips de cada plano que se unieron (en orden) */
  planos?: Array<{ n: number; request_id: string; costo_usd: number; video_url: string }>
}
interface EnvioGuardado { request_id: string; status: string; costo_estimado_usd: number; costo_lista_usd?: number; descuento_pct?: number; enviado_en: string; n: number; /** 11-nov · camino B · un envío por plano */ planos?: PlanoEnviado[]; /** 17-nov · §2 de CC7 · el envío falló a mitad: el motivo; se espera a los enviados para anotar lo cobrado y el lote no se une */ lote_incompleto?: string }

/** 11-nov · camino B (GO Lenovo 16:43) · se enciende por la plantilla (`limites.video.plano_por_plano: true`); apagado => camino A (una toma), como hoy */
export const planoPorPlanoEncendido = (pl: Plantilla): boolean => ((pl.limites.video ?? {}) as { plano_por_plano?: unknown }).plano_por_plano === true

type SalidaCodigoV = { res: ResultadoDePaso; gastos?: Cambios['gastos']; fallido?: string }

// ───────────────────────── funciones de código
export async function ejecutarCodigoV(P: Puertos, enc: Encargo, pl: Plantilla, paso: Paso): Promise<SalidaCodigoV> {
  switch (paso.funcion) {
    case 'abrir_video': return abrir(P, enc, pl)
    case 'pedido_de_video': return pedido(enc, pl, enc.estado_del_motor)
    case 'chequeos_video': return chequeos(enc.estado_del_motor, pl)
    case 'cuadros_video': return cuadrosDelVideo(P, enc)
    case 'imagenes_clave': return imagenesClave(P, enc, pl, paso)
    case 'empaquetar_entrega_video': return empaquetar(P, enc)
    default: return { res: { costo_usd: 0 }, fallido: `función de código «${paso.funcion}» sin implementar` }
  }
}

async function abrir(P: Puertos, enc: Encargo, pl: Plantilla): Promise<SalidaCodigoV> {
  const fu = await P.fuentes(enc.client_id)
  if ('error' in fu) return { res: { costo_usd: 0 }, fallido: `no se pudieron leer las fuentes del cliente: ${fu.error}` }
  // 17-nov · Sprint 3 · T1b · decisión Lenovo (B): una foto propia con personas reales solo viaja con su permiso registrado. Se filtra AQUÍ, una vez: la mesa, la cotización,
  //   el pedido, las fichas de personaje y las imágenes clave leen estas fotos. Lo retirado se declara; la pieza sigue (sin revisión humana nueva)
  const permisos = await permisosDelCliente(P, enc.client_id)
  const pf = fotosConPermiso(fu.fotos ?? [], permisos, 'video', P.ahora(), fu.zona)
  fu.fotos = pf.fotos
  const aviso_personas = avisoDePersonasReales(pf.retiradas)
  const parte = await P.parte(enc.parte_id, enc.client_id)
  if (!parte) return { res: { costo_usd: 0 }, fallido: `la parte ${enc.parte_id} no existe para este cliente` }
  const brief = parsearBrief(parte.texto, enc.brief_id)
  if (!brief) return { res: { costo_usd: 0 }, fallido: `el brief ${enc.brief_id} no está en la parte` }
  const planId = planDeOrigen(parte.texto)
  const plan = planId ? await P.plan(planId, enc.client_id) : null
  if (plan) fu.plan_texto = plan
  // GO 11-nov «la mesa confía en la familia»: la familia ya la decidió la cadena; no se re-adivina por el texto del brief (red: la tabla de formatos de la cadena)
  const sala = await briefEsDelEncargo(brief, enc.familia, P.formatosDeLaCadena?.bind(P), claseDeLaFamilia(P))
  if (!sala.ok) return { res: { costo_usd: 0 }, fallido: sala.motivo }
  const formato_video = formatoDeVideo(brief)
  // 11-nov · regla #17: la proporción la escribió la hoja en LÍMITES (dato de la tabla de formatos); sin ella, o si el generador no la admite, la de por omisión del formato CON aviso
  const porOmision = RELACION_POR_FORMATO[formato_video] ?? String(pl.limites.formato_por_omision ?? '9:16')
  const leida = proporcionDelBrief(brief, porOmision)
  const proporcion = RELACIONES_PERMITIDAS.has(leida) ? leida : porOmision
  const aviso_proporcion = proporcion === leida ? undefined : `la proporción ${leida} del brief no la admite el generador de video; se usó ${porOmision}, la de por omisión del formato ${formato_video}`
  const plataforma = `${brief.red.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() || 'red'}-${formato_video}`
  // 11-nov · GO Lenovo 02:52Z · COTIZAR PRIMERO (real): antes de llamar a la mesa, el brazo estima GRATIS cada ruta que el guion puede usar. Si no puede cotizar, el encargo
  //   falla AQUÍ, en el primer paso y a US$ 0 (queda recuperable: `reapertura.ts`), en vez de enterarse al final con la mesa ya pagada. En seco no sale a la red (como el envío).
  // 17-nov · Sprint 3 · T1 · el catálogo de modelos de la configuración del brazo (gratis): la oficina compone con el MISMO que valida la ruta, y queda con el encargo
  const catalogo_de_modelos = await catalogoDelBrazo(P)
  const cotizacion = enc.dry_run ? null : await cotizarPrimero(P, enc, pl, brief, fu.fotos, proporcion, catalogo_de_modelos)
  if (cotizacion && !cotizacion.ok) return { res: { costo_usd: 0 }, fallido: cotizacion.motivo }
  return { res: { costo_usd: 0, artefacto: { brief, proporcion, ...(aviso_proporcion ? { aviso_proporcion } : {}), F: fu, familia: 'video', plataforma, elementos: [], formato_video, catalogo_de_modelos, ...(pf.retiradas.length ? { fotos_sin_permiso: pf.retiradas, aviso_personas } : {}), ...(cotizacion ? { cotizacion: cotizacion.rutas } : {}) } } }
}

/** cuánto se le deja gastar al video al cotizar: el tope por video de la plantilla, sin pasar el del encargo (el brazo además lo recorta al aprobado) */
const topeDeLaCotizacion = (pl: Plantilla): number => {
  const lim = (pl.limites.video ?? {}) as { tope_por_video_usd?: number }
  return Math.max(0, Math.min(lim.tope_por_video_usd ?? pl.limites.tope_encargo_usd, pl.limites.tope_encargo_usd))
}

/** la cotización gratis de cada ruta posible · el texto que devolvió el proveedor, si lo hubo, queda en el motivo del fallo (para poder verlo) */
/** 17-nov · T1b · el registro de permisos del cliente por su puerto · sin método o con error: null (nadie tiene permiso: lo seguro) · nunca lanza */
export async function permisosDelCliente(P: Pick<Puertos, 'permisosDePersonaReal'>, clientId: string): Promise<PermisoDePersonaReal[] | null> {
  if (!P.permisosDePersonaReal) return null
  try {
    const r = await P.permisosDePersonaReal(clientId)
    return Array.isArray(r) ? r : null
  } catch { return null }
}
/** 17-nov · T1 · el catálogo del brazo por su puerto · sin método, o si falla o devuelve algo raro: el del código (nunca lanza) */
export async function catalogoDelBrazo(P: Pick<Puertos, 'video'>): Promise<CatalogoDeModelos> {
  if (!P.video?.catalogo) return CATALOGO_POR_OMISION
  try {
    const c = await P.video.catalogo()
    return catalogoValido(c) ? c : CATALOGO_POR_OMISION
  } catch { return CATALOGO_POR_OMISION }
}
/** el catálogo con que se abrió el encargo (los de antes de T1 no lo traen: el del código) */
const catalogoValido = (c: unknown): c is CatalogoDeModelos => !!c && typeof c === 'object' && !!(c as CatalogoDeModelos).fichas && typeof (c as CatalogoDeModelos).fichas === 'object' && !!(c as CatalogoDeModelos).fichas[(c as CatalogoDeModelos).por_omision]
/**
 * 17-nov · T1 · LA vía de la oficina para la ficha del modelo: `fichaPorOmision(catalogoDelEncargo(estado))` · el catálogo que el encargo guardó al abrir (el mismo que valida la ruta).
 * Acepta el estado del encargo o su base. Nunca la ficha del código sola (`fichaPorOmision()`): repetiría el desajuste ruta/oficina.
 */
export const catalogoDelEncargo = (x: BaseV | Estado): CatalogoDeModelos => { const b = (x as Estado).artefactos ? baseV(x as Estado) : (x as BaseV); return catalogoValido(b?.catalogo_de_modelos) ? b.catalogo_de_modelos : CATALOGO_POR_OMISION }

async function cotizarPrimero(P: Puertos, enc: Encargo, pl: Plantilla, brief: BriefLeido, fotos: FuentesCompletas['fotos'], relacion: string, catalogo: CatalogoDeModelos = CATALOGO_POR_OMISION): Promise<{ ok: true; rutas: Array<{ ruta: string; costo_estimado_usd: number; costo_lista_usd: number | null }> } | { ok: false; motivo: string }> {
  const sinGastar = 'no se gastó nada; el encargo queda recuperable'
  if (!P.video?.cotizar) return { ok: false, motivo: `no se puede cotizar el video antes de abrir la mesa: el brazo de video no está conectado (${sinGastar})` }
  const lim = (pl.limites.video ?? {}) as { resolucion?: string }
  const ps = pedidosParaCotizar({ brief, fotos, clave: `${enc.id}:${enc.brief_id}`, relacion, ...(lim.resolucion ? { resolucion: lim.resolucion } : {}), catalogo })
  if (!ps.ok) return { ok: false, motivo: `no se pudo armar el pedido de cotización: ${ps.errores.join(' · ')} (${sinGastar})` }
  const rutas: Array<{ ruta: string; costo_estimado_usd: number; costo_lista_usd: number | null }> = []
  for (const { ruta, pedido: ped } of ps.pedidos) {
    const c = await P.video.cotizar({ pedido: ped, client_id: enc.client_id, encargo_id: enc.id, tope_usd: topeDeLaCotizacion(pl), workflow_id: `oficina:${enc.familia}`, workflow_execution_id: `${enc.id}:cotizar` })
    if (!c.ok) {
      const desc = c.descripcion ? ` · lo que dijo el proveedor sobre sus precios: «${c.descripcion.replace(/\s+/g, ' ').slice(0, 800)}»` : ''
      return { ok: false, motivo: `el brazo de video no pudo cotizar (${ruta === 'foto' ? 'con foto propia' : 'solo texto'}) antes de abrir la mesa: ${c.error}${desc} (${sinGastar})` }
    }
    rutas.push({ ruta, costo_estimado_usd: c.costo_estimado_usd, costo_lista_usd: c.costo_lista_usd ?? null })
  }
  // 11-nov · camino B encendido: también se cotiza UN plano con foto (imagen a video, 4 s) · es la ruta que usarán los planos con foto propia
  const conFoto = ps.pedidos.find((x) => x.ruta === 'foto')?.pedido
  if (planoPorPlanoEncendido(pl) && conFoto) {
    const ped = { ...conFoto, segundos: fichaPorOmision(catalogo).segundos_min, clave: `${conFoto.clave.replace(/:foto$/, '')}:plano_foto`, plano: true as const }
    const c = await P.video.cotizar({ pedido: ped, client_id: enc.client_id, encargo_id: enc.id, tope_usd: topeDeLaCotizacion(pl), workflow_id: `oficina:${enc.familia}`, workflow_execution_id: `${enc.id}:cotizar` })
    if (!c.ok) return { ok: false, motivo: `el brazo de video no pudo cotizar (un plano con foto propia) antes de abrir la mesa: ${c.error}${c.descripcion ? ` · lo que dijo el proveedor sobre sus precios: «${c.descripcion.replace(/\s+/g, ' ').slice(0, 800)}»` : ''} (${sinGastar})` }
    rutas.push({ ruta: 'plano_foto', costo_estimado_usd: c.costo_estimado_usd, costo_lista_usd: c.costo_lista_usd ?? null })
  }
  return { ok: true, rutas }
}

/** el guion de la mesa → el pedido al brazo (sin red): la clave idempotente es `<encargo>:<brief>:v<versión del guion>` */
function pedido(enc: Encargo, pl: Plantilla, e: Estado): SalidaCodigoV {
  const b = baseV(e)
  const g = datos(e, 'guion') as unknown as GuionDeLaMesa | undefined
  // Sprint 2 · S2-1 · con propuestas, el guion es la ELEGIDA: sin aprobación todavía no hay qué filmar (una plantilla que pide propuestas necesita su paso de aprobación antes de este)
  if ((!g || !Array.isArray(g.planos) || !g.planos.length) && e.artefactos.propuestas_video) return { res: { costo_usd: 0 }, fallido: 'hay propuestas del video sin aprobar y no hay guion elegido que pedir (la plantilla pide propuestas pero no tiene el paso de aprobación del dueño antes del pedido)' }
  if (!g || !Array.isArray(g.planos) || !g.planos.length) return { res: { costo_usd: 0 }, fallido: 'no hay guion traducido que pedir (la mesa no dejó planos)' }
  const lim = (pl.limites.video ?? {}) as { resolucion?: string }
  const clave = `${enc.id}:${enc.brief_id}:v${e.artefactos['guion']?.version ?? 1}`
  const a = armarPedidoDeLaOficina({ catalogo: catalogoDelEncargo(b), guion: g, brief: b.brief, fotos: b.F.fotos, clave, relacion: b.proporcion, ...(lim.resolucion ? { resolucion: lim.resolucion } : {}) })
  if (!a.ok) return { res: { costo_usd: 0 }, fallido: `el pedido al brazo de video no es válido: ${a.errores.join(' · ')}` }
  const fichas: Ficha[] = []
  // 11-nov · GO Lenovo 16:34 · si el guion nombra fotos que no existen (o un nombre corto que coincide con varias), el pedido VUELVE UNA SOLA VEZ a la mesa con el aviso de cuáles;
  //   la mesa rehace el guion con lo que hay y sigue. Sin freno: si ya no quedan vueltas (o la plantilla no tiene la vuelta), sigue como antes, con la ficha.
  const vuelve = a.pedido.fotos_no_halladas.length > 0 && quedaVueltaALaMesa(pl, e)
  if (vuelve) return { res: { costo_usd: 0, artefacto: { pedido: a.pedido, clave, fotos_no_halladas: a.pedido.fotos_no_halladas, avisos_del_guion: g.avisos ?? [], vuelve_a_la_mesa: true, aviso_a_la_mesa: avisoDeFotosALaMesa(a.pedido.fotos_no_halladas, a.ambiguas, b.F.fotos) } } }
  // 11-nov · GO Lenovo 18:50 · si le quedaba la vuelta pero no cabe en el tope, la ficha lo dice (no se calla por qué no volvió)
  const pasoPedido = pl.pasos.find((p) => p.funcion === 'pedido_de_video')
  const sinTope = a.pedido.fotos_no_halladas.length > 0 && !!pasoPedido && quedaVueltaDelPaso(pasoPedido, e) ? ' · no volvió a la mesa: rehacer el guion no cabe en el tope del encargo' : ''
  if (a.pedido.fotos_no_halladas.length) fichas.push(fichaNueva(`video-fotos-no-halladas-${e.pasos_ejecutados}`, 'chequeo', 'video', 'sugerencia', `el guion nombra fotos que no están entre las propias del cliente y no viajan al modelo: ${a.pedido.fotos_no_halladas.join(', ')}${sinTope}`, 'fotos propias del cliente', 'mirar el video: esos planos salen sin referencia'))
  if (a.pedido.prompt_recortado) fichas.push(fichaNueva(`video-prompt-recortado-${e.pasos_ejecutados}`, 'chequeo', 'video', 'sugerencia', 'el guion era más largo de lo que el modelo admite y se recortó', 'límite del pedido al modelo', 'mirar que el video cubra todos los planos'))
  // 11-nov · camino B: con 2 o más planos y el interruptor encendido, además del pedido de una toma (lo que ven la jefatura y la hoja) va un pedido POR PLANO
  let planos: PedidoDePlano[] | undefined
  if (planoPorPlanoEncendido(pl) && g.planos.length >= 2) {
    // 17-nov · S2-4 · cada clip arranca de la imagen clave FINAL de su plano (#1072/#1076); el encuadre la lleva a la proporción de la red como a cualquier foto
    const ic = imagenesClaveVigentes(e)
    const pp = pedidosPorPlano({ catalogo: catalogoDelEncargo(b), guion: g, brief: b.brief, fotos: b.F.fotos, clave, relacion: b.proporcion, ...(lim.resolucion ? { resolucion: lim.resolucion } : {}), ...(ic?.planos?.length ? { imagenesClave: ic.planos.map((x) => ({ n: x.n, url: x.url })) } : {}) })
    if (!pp.ok) return { res: { costo_usd: 0 }, fallido: `los pedidos por plano no son válidos: ${pp.errores.join(' · ')}` }
    planos = pp.pedidos
  }
  return { res: { costo_usd: 0, artefacto: { pedido: a.pedido, clave, fotos_no_halladas: a.pedido.fotos_no_halladas, avisos_del_guion: g.avisos ?? [], vuelve_a_la_mesa: false, ...(planos ? { planos } : {}) }, ...(fichas.length ? { fichas } : {}) } }
}

/** ¿al paso del pedido le queda su vuelta a la mesa Y CABE en el tope? (dato de la plantilla: `vuelve_a` del paso `pedido_de_video`; sin él, nunca vuelve).
 *  11-nov · GO Lenovo 18:50: la misma cuenta que la mirada del video (`quedaVueltaDelPaso` + `cabeLaVuelta(costoDeVolver)`), para que ninguna vuelta cierre el encargo por tope. */
export function quedaVueltaALaMesa(pl: Plantilla, e: Estado): boolean {
  const paso = pl.pasos.find((p) => p.funcion === 'pedido_de_video')
  return !!paso && quedaVueltaDelPaso(paso, e) && cabeLaVuelta(pl, e, costoDeVolver(pl, paso))
}

/** el aviso con que el pedido vuelve a la mesa: qué fotos no existen (o son ambiguas) y cuáles sí hay, con la MISMA lista de fotos que la mesa ya ve (`LISTA_DE_FOTOS`). Puro. */
export function avisoDeFotosALaMesa(noHalladas: string[], ambiguas: string[], fotos: FuentesCompletas['fotos']): string {
  const amb = new Set(ambiguas)
  const faltan = noHalladas.filter((x) => !amb.has(x))
  const partes: string[] = []
  if (faltan.length) partes.push(`${faltan.length === 1 ? 'la foto' : 'las fotos'} ${faltan.map((x) => `«${x}»`).join(', ')} no ${faltan.length === 1 ? 'existe' : 'existen'} entre las fotos propias del cliente`)
  if (ambiguas.length) partes.push(`${ambiguas.length === 1 ? 'el nombre' : 'los nombres'} ${ambiguas.map((x) => `«${x}»`).join(', ')} ${ambiguas.length === 1 ? 'coincide' : 'coinciden'} con varias fotos (escribe más caracteres del nombre)`)
  const propias = fotosPropiasConDireccion(fotos)
  const cab = `Aviso de la oficina antes de pedir el video: ${partes.join('; ')}. Esas fotos no le llegarían al generador de video.`
  if (!propias.length) return `${cab}\nEl cliente no tiene fotos propias: rehaz el guion sin «Foto:» en los planos (el video sale desde el texto). Integra el guion completo otra vez.`
  return `${cab}\nRehaz el guion con las fotos que sí hay (en «Foto:» va su nombre) o deja esos planos sin foto. Integra el guion completo otra vez.\nFotos propias disponibles:\n${LISTA_DE_FOTOS(propias)}`
}

function chequeos(e: Estado, pl: Plantilla): SalidaCodigoV {
  const b = baseV(e)
  const cv = datos(e, 'copy_video')
  if (!cv) return { res: { costo_usd: 0, artefacto: { fichas: 0 } }, fallido: 'no hay pie ni etiquetas que chequear' }
  const fs = chequeosDePost({
    pieza: { pie_de_foto: txt(cv.pie_de_foto), hashtags: arr(cv.hashtags), llamado: typeof cv.llamado === 'string' ? cv.llamado : undefined },
    fuentes: b.F.fuentes as FuentesDelCliente,
    limites: { pie_de_foto_max: Number(pl.limites.pie_de_foto_max ?? 2200), hashtags_max: Number(pl.limites.hashtags_max ?? 30), limites_verificados: pl.limites.limites_verificados === true },
    prohibidas_del_brief: b.brief.prohibido,
    imagen: { generada: true, declarada_en_bandeja: true },
  })
  const prefijo = `chk${e.pasos_ejecutados}`
  const fichas: Ficha[] = fs.map((f, i) => ({ ...f, id: `${prefijo}-${i}` }))
  const v = datos(e, 'video') as unknown as VideoDelEncargo | undefined
  const pv = datos(e, 'pedido_video')
  const lim = (pl.limites.video ?? {}) as { tope_por_video_usd?: number }
  let k = 0
  const nueva = (gravedad: Ficha['gravedad'], que: string, contra: string, propuesta: string) => fichas.push(fichaNueva(`${prefijo}-video-${k++}`, 'chequeo', 'video', gravedad, que, contra, propuesta))
  if (!v || !v.video_url) nueva('bloquea', 'el brazo no entregó un video', 'respuesta del brazo de video', 'una persona decide: rehacer o cerrar')
  else {
    if (v.copia === 'solo_proveedor') nueva('sugerencia', `el video quedó solo en el proveedor (no se pudo copiar a nuestro bucket)${v.expires_at ? `; vence ${v.expires_at}` : ''}`, 'copia de la entrega', 'descargarlo al aprobar, antes de que venza')
    if (!v.simulado && v.costo_usd > 0 && v.costo_estimado_usd > 0 && v.costo_usd > v.costo_estimado_usd * 1.05) nueva('sugerencia', `el video cobró US$ ${v.costo_usd.toFixed(4)} y se habían reservado US$ ${v.costo_estimado_usd.toFixed(4)}`, 'reserva del paso', 'revisar el libro del brazo')
    if (typeof lim.tope_por_video_usd === 'number' && v.costo_usd > lim.tope_por_video_usd + 1e-9) nueva('bloquea', `el video cobró US$ ${v.costo_usd.toFixed(4)}, más que el tope por video (US$ ${lim.tope_por_video_usd})`, 'tope por video', 'una persona decide')
  }
  for (const a of arr(pv?.avisos_del_guion)) nueva('sugerencia', `el traductor del guion avisó: ${a}`, 'guion de la mesa', 'mirar el video con eso en mente')
  return { res: { costo_usd: 0, artefacto: { fichas: fichas.length }, fichas, reemplazar_fichas: { origen: 'chequeo', donde: ['texto', 'hashtags', 'video'] } } }
}

/** un mp4 mínimo (solo la caja `ftyp`): lo que se entrega en dry_run para que la hoja, el manifiesto y los chequeos de entrega se ejerzan sin red */
export function mp4Simulado(): Buffer {
  const cuerpo = Buffer.from('isom\0\0\x02\0isomiso2avc1mp41', 'binary')
  const caja = Buffer.alloc(8)
  caja.writeUInt32BE(8 + cuerpo.length, 0)
  caja.write('ftyp', 4, 'ascii')
  return Buffer.concat([caja, cuerpo])
}

async function empaquetar(P: Puertos, enc: Encargo): Promise<SalidaCodigoV> {
  const e = enc.estado_del_motor
  const b = baseV(e)
  const v = datos(e, 'video') as unknown as VideoDelEncargo | undefined
  const cv = datos(e, 'copy_video')
  const g = datos(e, 'guion') as unknown as GuionDeLaMesa | undefined
  const pv = datos(e, 'pedido_video')
  if (!v || !v.video_url) return { res: { costo_usd: 0 }, fallido: 'no hay video que empaquetar' }
  if (!cv) return { res: { costo_usd: 0 }, fallido: 'no hay pie ni etiquetas que empaquetar' }
  const red = b.brief.red.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim() || 'red'
  const formato = formatoDeEntrega(b.formato_video)
  const fila = await P.almacen.leerFormato(red, formato)
  const cuando = cuandoSePublica(enc.sala_ref, fechaLimiteDelBrief(b.brief.aprueba))
  const expires = cuando ? aUtc(cuando.fecha, cuando.hora, b.F.zona) : null
  const nombreBase = (ext: string) => nombreDeArchivo({ fecha: cuando?.de === 'fila' ? cuando.fecha : null, hora: cuando?.de === 'fila' ? cuando.hora : null, red, formato: b.formato_video, brief_id: b.brief.id, n: 1, de: 1, ext })
  const archivos: ArchivoDeEntrega[] = []
  const fichasExtra: Ficha[] = []
  const bytes = v.simulado || v.video_url.startsWith(PREFIJO_DRY) ? mp4Simulado() : await P.descargar(v.video_url)
  if (bytes) archivos.push({ nombre: nombreBase('mp4'), bytes })
  else fichasExtra.push(fichaNueva('entrega-video-no-descargado', 'chequeo', 'entrega', 'bloquea', 'no se pudo descargar el video del brazo para la entrega', 'copia de la entrega', 'una persona lo baja del enlace del proveedor antes de que venza'))
  const texto = textoParaCopiar({ pie_de_foto: txt(cv.pie_de_foto), hashtags: arr(cv.hashtags) })
  const base = nombreBase('txt').replace(/\.txt$/, '')
  const pedidoEnviado = (pv?.pedido as PedidoDeVideoDeLaOficina | undefined)
  const hoja = [
    `# Publicar a mano · ${b.brief.id}`,
    `Red: ${b.brief.red} · formato: ${b.brief.formato} (${b.formato_video}, ${b.proporcion}) · ${g?.segundos ?? pedidoEnviado?.segundos ?? '?'} s`,
    `Hora de publicación: ${cuando ? (cuando.de === 'fila' ? `${cuando.fecha}${cuando.hora ? ' ' + cuando.hora : ''}${b.F.zona ? ' (' + b.F.zona + ')' : ' (zona del cliente sin registrar)'}` : `(aprobar antes de ${cuando.fecha})`) : 'sin fecha: se decide al aprobar'}`,
    b.aviso_proporcion ? `⚠️ ${b.aviso_proporcion}.` : '',
    b.aviso_personas ? `⚠️ ${b.aviso_personas}` : '',
    ROTULO_DEL_VIDEO_GENERADO,
    v.copia === 'solo_proveedor' ? `⚠️ El video quedó solo en el proveedor${v.expires_at ? ` y vence ${v.expires_at}` : ''}: descargarlo al aprobar.` : '',
    v.simulado ? '(ensayo: el video es simulado)' : '',
    '',
    '## Pasos',
    ...(fila?.pasos_publicacion?.map((x, i) => `${i + 1}. ${x}`) ?? ['(sin especificación de formato)']),
    '',
  ].filter((l) => l !== '').join('\n')
  const guionMd = [
    `# Guion · ${b.brief.id}`,
    g ? guionLegible(g) : '(sin guion traducido)',
    '',
    '## Pedido enviado al modelo',
    pedidoEnviado ? `Formato ${pedidoEnviado.formato} · ${pedidoEnviado.segundos} s · ${pedidoEnviado.resolucion} · ${pedidoEnviado.relacion} · fotos de referencia: ${pedidoEnviado.fotos.length}\n\n${pedidoEnviado.prompt}` : '(sin pedido)',
    '',
    g?.avisos?.length ? `## Avisos del traductor\n${g.avisos.map((a) => `- ${a}`).join('\n')}` : '',
  ].filter((l) => l !== '').join('\n')
  const man = manifiesto(archivos, { encargo_id: enc.id, brief_id: b.brief.id, aprobada_version: e.artefactos['copy_video']?.version ?? 1, expires_at: expires, video_generado: true, request_id: v.request_id, video_url_proveedor: v.url_proveedor, video_expires_at: v.expires_at, simulado: v.simulado })
  const fichas = [...chequeosDeEntrega(archivos, fila ?? null, { pie_de_foto: txt(cv.pie_de_foto), hashtags: arr(cv.hashtags) }, man), ...fichasExtra]
  const todos = [
    ...archivos.map((a) => ({ ...a, tipo: 'video/mp4' })),
    { nombre: `${base}_texto.txt`, bytes: Buffer.from(texto, 'utf8'), tipo: 'text/plain' },
    { nombre: `${base}_publicar.md`, bytes: Buffer.from(hoja, 'utf8'), tipo: 'text/markdown' },
    { nombre: `${base}_guion.md`, bytes: Buffer.from(guionMd, 'utf8'), tipo: 'text/markdown' },
    { nombre: 'manifest.json', bytes: Buffer.from(JSON.stringify(man, null, 2), 'utf8'), tipo: 'application/json' },
  ]
  let urls: Record<string, string> = {}
  if (!enc.dry_run) {
    const gu = await P.guardarArchivos(`oficina/${enc.client_id}/${enc.id}`, todos)
    if (!gu.ok) return { res: { costo_usd: 0 }, fallido: `no se pudieron guardar los archivos de la entrega: ${gu.error}` }
    urls = gu.urls
  }
  const mp4 = archivos[0]?.nombre
  const prefijo = `ent${e.pasos_ejecutados}`
  return {
    res: {
      costo_usd: 0,
      artefacto: { archivos: man.archivos, nombres: todos.map((x) => x.nombre), urls, texto_para_copiar: texto, expires_at: expires, video_url: (mp4 && urls[mp4]) || v.video_url, simulado: enc.dry_run },
      fichas: fichas.map((f, i) => ({ ...f, id: `${prefijo}-${i}` })),
      reemplazar_fichas: { origen: 'chequeo', donde: 'entrega' },
    },
  }
}

// ───────────────────────── S2-3 · una imagen clave por plano antes de filmar (ver `video/imagen-clave.ts`)
/**
 * una imagen vertical por plano de la hoja, con la calidad de la fase (DATO `limites.imagen_clave`):
 *  · PROPUESTAS (fase borrador, paso `imagenes_clave`): una tanda por propuesta, para que el dueño elija viendo cada video antes de fabricarlo;
 *  · FINAL (paso `imagenes_clave_final` con la propuesta aprobada, o `imagenes_clave` en el video sin propuestas): la del guion, en máxima calidad.
 * En el BORRADOR, los planos de más de 3 s llevan DOS cuadros (arranque y cierre, misma foto · decisión de Lenovo 16-nov 22:23); en final, uno (el clip de CC3 lee `url`).
 * En los planos de producto se edita sobre la foto real (la que nombra la hoja; si la mesa dejó candidatas, también la mejor apta); sin foto apta se genera desde la hoja.
 * Sin rejas: un plano cuya imagen falla queda sin imagen y con una ficha (su clip sale como hoy). El gasto nunca pasa el tope del paso ni lo que le queda al encargo:
 * primero el arranque de TODOS los planos de todas las propuestas y después los cierres, para que el tope no deje a una propuesta entera sin storyboard.
 */
async function imagenesClave(P: Puertos, enc: Encargo, pl: Plantilla, paso: Paso): Promise<SalidaCodigoV> {
  const e = enc.estado_del_motor
  const b = baseV(e)
  const fase = faseDeProduccion(e)
  const calidad = calidadDeLaFase(pl.limites as unknown as Record<string, unknown>, fase)
  const prefijo = `imagen-clave-${e.pasos_ejecutados}`
  const reemplazar = { origen: 'chequeo' as const, donde: 'imagen_clave' }
  // el paso final de un encargo SIN propuestas: `imagenes_clave` ya salió en final → copia sin gasto (nunca se paga dos veces la misma imagen)
  const previa = datos(e, PASO_IMAGENES_CLAVE) as unknown as ImagenesClave | undefined
  if (fase === 'final' && paso.salida_artefacto !== PASO_IMAGENES_CLAVE && previa?.fase === 'final') {
    return { res: { costo_usd: 0, artefacto: { ...previa, copiado_de: PASO_IMAGENES_CLAVE } as unknown as Record<string, unknown> } }
  }
  // qué hojas: en final, la del guion; en propuestas, la de cada propuesta (id «P1»…)
  const g = datos(e, 'guion') as unknown as (GuionDeLaMesa & { planos: PlanoDeLaHoja[] }) | undefined
  const hojas: Array<{ id: string | null; planos: PlanoDeLaHoja[] }> = fase === 'final'
    ? [{ id: null, planos: Array.isArray(g?.planos) ? g.planos : [] }]
    : (propuestasDe(e)?.propuestas ?? []).map((x) => ({ id: x.id, planos: (Array.isArray(x.guion?.planos) ? x.guion.planos : []) as PlanoDeLaHoja[] }))
  const vacio = (): SalidaCodigoV => ({ res: { costo_usd: 0, artefacto: { fase, calidad, planos: [], ...(fase === 'borrador' ? { propuestas: [] } : {}), hay_imagenes: false } as unknown as Record<string, unknown>, fichas: [fichaNueva(`${prefijo}-sin-planos`, 'chequeo', 'imagen_clave', 'sugerencia', fase === 'borrador' ? 'no hubo imágenes clave: las propuestas de la mesa no traen hojas de planos legibles' : 'no hubo imágenes clave: la hoja no trae planos', fase === 'borrador' ? 'propuestas de la mesa' : 'hoja de planos de la mesa', 'el video sale sin storyboard')], reemplazar_fichas: reemplazar } })
  if (!hojas.some((h) => h.planos.length)) return vacio()
  const propias = fotosPropiasConDireccion(b.F.fotos)
  // la hoja nombra las fotos por su nombre corto (regla del 11-nov): se resuelve al id completo; un nombre que no existe queda como está (no es apto y lo dice la ficha)
  const idCompleto = (x: string | undefined): string | undefined => {
    if (!x) return x
    const h = buscarFotoPropia(x, propias)
    return h && 'url' in h ? propias.find((f) => f.url === h.url)?.id ?? x : x
  }
  // con candidatas (las que muestran el protagonista) se rota sobre ellas; sin candidatas solo vale la foto que la hoja nombra
  const cands = datos(e, 'candidatas_foto')?.candidatas as Array<{ id: string; cercana?: boolean }> | undefined
  const fichas: Ficha[] = []
  const deLa = (id: string | null) => (id ? ` de la propuesta ${id}` : '')
  const clave = (id: string | null, resto: string) => `${prefijo}${id ? `-${id}` : ''}-${resto}`
  const tandas = hojas.map((h) => {
    const planos: PlanoDeLaHoja[] = h.planos.map((x) => ({ ...x, foto_id: idCompleto(x.foto_id) }))
    const nombradas = planos.flatMap((x) => (x.foto_id ? [{ id: x.foto_id }] : []))
    const aptas: FotoDeReferencia[] = fotosDeReferencia(propias, Array.isArray(cands) ? [...nombradas.filter((n) => cands.some((c) => c.id === n.id && !c.cercana)), ...cands] : nombradas)
    const { pedidos, no_aptas } = pedidosDeImagenClave({ planos, aptas, proporcion: b.proporcion, rotar: Array.isArray(cands) })
    for (const x of no_aptas) {
      const otra = pedidos.find((q) => q.n === x.n)?.foto
      fichas.push(fichaNueva(clave(h.id, `foto-no-apta-${x.n}`), 'chequeo', 'imagen_clave', 'sugerencia', `la hoja${deLa(h.id)} pide la foto «${x.id}» para el plano ${x.n}, pero no sirve de referencia (no es propia, no tiene dirección o no muestra el producto): ${otra ? `se usa «${otra.id}»` : 'se genera desde la hoja'}`, 'fotos propias del cliente', 'mirar que el producto sea el real'))
    }
    if (!planos.length) fichas.push(fichaNueva(clave(h.id, 'sin-planos'), 'chequeo', 'imagen_clave', 'sugerencia', `no hubo imágenes clave${deLa(h.id)}: su hoja no trae planos`, 'hoja de planos de la mesa', 'esa propuesta se presenta sin storyboard'))
    return { id: h.id, planos, pedidos, hechas: [] as ImagenClaveDelPlano[] }
  })
  const tope = Math.max(0, Math.min(Number(paso.tope_usd) || 0, +(pl.limites.tope_encargo_usd - e.gasto_usd).toFixed(4)))
  const gastos: NonNullable<Cambios['gastos']> = []
  let costo = 0, masCara = 0, pedidas = 0
  // el siguiente cuadro no se pide si ya no cabe otro como el más caro que salió (el primero se pide para medir su costo, SALVO que no quede nada:
  //   CC7 🟡 17-nov · con el tope en 0, el encargo ya gastó lo suyo y ninguna imagen se pide · regla «nada gasta sin dale»)
  const cabe = (): boolean => enc.dry_run || (tope > 0 && (pedidas === 0 || costo + masCara <= tope + 1e-9))
  const pedir = async (prompt: string, foto: FotoDeReferencia | null) => {
    pedidas++
    const r = await P.imagen({ prompt, client_id: enc.client_id, encargo_id: enc.id, dry_run: enc.dry_run, foto, size: calidad.size, quality: calidad.quality })
    if (r.ok) {
      costo += r.costo_usd; masCara = Math.max(masCara, r.costo_usd)
      gastos.push({ concepto: 'imagen', ref_tabla: 'agent_image_generations', ref_id: r.generation_id, cost_usd: r.costo_usd, base: 'usage' })
    }
    return r
  }
  // 1 · el arranque de cada plano, propuesta por propuesta
  for (const t of tandas) {
    for (const ped of t.pedidos) {
      if (!cabe()) { fichas.push(fichaNueva(clave(t.id, `tope-${ped.n}`), 'chequeo', 'imagen_clave', 'sugerencia', `el plano ${ped.n}${deLa(t.id)} quedó sin imagen clave: no cabía otra imagen en el tope del paso (US$ ${tope.toFixed(2)}; van US$ ${costo.toFixed(4)})`, 'tope del paso', 'su clip sale desde su foto o su texto')); continue }
      const r = await pedir(ped.prompt, ped.foto)
      if (!r.ok) { fichas.push(fichaNueva(clave(t.id, `falla-${ped.n}`), 'chequeo', 'imagen_clave', 'sugerencia', `el generador no devolvió la imagen clave del plano ${ped.n}${deLa(t.id)}: ${r.error}`, 'generador de imágenes', 'su clip sale desde su foto o su texto')); continue }
      const usada = !!ped.foto && r.referencia?.usada === true
      if (ped.foto && !usada) fichas.push(fichaNueva(clave(t.id, `sin-foto-${ped.n}`), 'chequeo', 'imagen_clave', 'sugerencia', `la imagen clave del plano ${ped.n}${deLa(t.id)} se generó sin la foto real «${ped.foto.id}» (${r.referencia?.motivo ?? 'sin motivo'}): el producto puede no ser el del cliente`, 'fotos propias del cliente', 'mirar que el producto sea el real'))
      t.hechas.push({ n: ped.n, url: r.url, imagenes: [r.url], prompt: ped.prompt, foto_referencia_id: usada ? ped.foto!.id : null, referencia_usada: usada, costo_usd: r.costo_usd, generation_id: r.generation_id })
    }
  }
  // 2 · el cierre de los planos largos (misma foto que su arranque; solo si el arranque salió)
  for (const t of tandas) {
    for (const ped of t.pedidos) {
      const h = t.hechas.find((x) => x.n === ped.n)
      if (fase !== 'borrador' || !ped.prompt_cierre || !h) continue
      if (!cabe()) { fichas.push(fichaNueva(clave(t.id, `tope-cierre-${ped.n}`), 'chequeo', 'imagen_clave', 'sugerencia', `el plano ${ped.n}${deLa(t.id)} dura más de ${SEGUNDOS_PARA_DOS_CUADROS} s y quedó con un solo cuadro: no cabía el de cierre en el tope del paso (US$ ${tope.toFixed(2)})`, 'tope del paso', 'el borrador muestra solo cómo arranca')); continue }
      const foto = h.referencia_usada ? ped.foto : null
      const r = await pedir(ped.prompt_cierre, foto)
      if (!r.ok) { fichas.push(fichaNueva(clave(t.id, `falla-cierre-${ped.n}`), 'chequeo', 'imagen_clave', 'sugerencia', `el generador no devolvió el cuadro de cierre del plano ${ped.n}${deLa(t.id)}: ${r.error}`, 'generador de imágenes', 'el borrador muestra solo cómo arranca')); continue }
      ;(h.imagenes ??= [h.url]).push(r.url)
      h.costo_usd = +(h.costo_usd + r.costo_usd).toFixed(6)
    }
  }
  const sinDe = (t: (typeof tandas)[number]) => t.planos.filter((x) => !t.hechas.some((h) => h.n === x.n)).map((x) => x.n)
  const alguna = tandas.some((t) => t.hechas.length > 0)
  // en ensayo las imágenes son simuladas (no hay nada que mirar): quedan en el artefacto, pero la revisión con visión no se llama (como los cuadros del video).
  // En borrador tampoco: las de las propuestas las mira el DUEÑO en su tarjeta; la revisión es de las finales (`imagenesClaveVigentes`)
  let artefacto: ImagenesClave
  if (fase === 'final') {
    const sin = sinDe(tandas[0])
    artefacto = { fase, calidad, planos: tandas[0].hechas, hay_imagenes: alguna && !enc.dry_run, ...(enc.dry_run ? { simulado: true } : {}), ...(sin.length ? { planos_sin_imagen: sin } : {}) }
  } else {
    const propuestas = tandas.map((t) => { const sin = sinDe(t); return { id: t.id as string, planos: t.hechas, costo_usd: +t.hechas.reduce((m, h) => m + h.costo_usd, 0).toFixed(6), ...(sin.length ? { planos_sin_imagen: sin } : {}) } })
    artefacto = { fase, calidad, planos: [], propuestas, hay_imagenes: false, ...(enc.dry_run ? { simulado: true } : {}) }
  }
  return { res: { costo_usd: +costo.toFixed(6), artefacto: artefacto as unknown as Record<string, unknown>, ...(fichas.length ? { fichas } : {}), reemplazar_fichas: reemplazar }, ...(gastos.length ? { gastos } : {}) }
}

// ───────────────────────── un agente mira el video antes de la bandeja (GO Lenovo 11-nov 16:43 · ver `video/mirada.ts`)
/** los cuadros de cada plano del guion (S2-7: inicio, medio y final) y las señales que midió ffmpeg, guardados en la carpeta del encargo. Sin cuadros (sin ffmpeg, mp4 ilegible…) no hay mirada: ficha QUE BLOQUEA, nunca pasa callado. En ensayo no corre */
async function cuadrosDelVideo(P: Puertos, enc: Encargo): Promise<SalidaCodigoV> {
  const e = enc.estado_del_motor
  const v = datos(e, 'video') as unknown as VideoDelEncargo | undefined
  const g = datos(e, 'guion') as unknown as GuionDeLaMesa | undefined
  const sin = (causa: string): SalidaCodigoV => ({ res: { costo_usd: 0, artefacto: { cuadros: [], hay_cuadros: false, causa }, reemplazar_fichas: { origen: 'chequeo' as const, donde: 'mirada' }, fichas: [fichaNueva(`video-sin-mirar-${e.pasos_ejecutados}`, 'chequeo', 'mirada', 'bloquea', `nadie miró el video antes de la bandeja: ${causa}`, 'el video contra el guion y la fila', 'una persona mira el video antes de aprobar')] } })
  if (enc.dry_run || v?.simulado) return { res: { costo_usd: 0, artefacto: { cuadros: [], hay_cuadros: false, simulado: true } } }
  if (!v?.video_url) return sin('el brazo no entregó un video')
  if (!g || !Array.isArray(g.planos) || !g.planos.length) return sin('el guion no trae planos')
  if (!P.sacarCuadros) return sin('el sacador de cuadros no está conectado en este entorno')
  const bytes = await P.descargar(v.video_url)
  if (!bytes) return sin('no se pudo descargar el video')
  const c = await P.sacarCuadros(bytes, g.planos)
  if (!c.cuadros.length) return sin(c.causa ?? 'no salió ningún cuadro')
  const gu = await P.guardarArchivos(`oficina/${enc.client_id}/${enc.id}/cuadros-${e.pasos_ejecutados}`, c.cuadros.map((x) => ({ nombre: nombreDelCuadro(x), bytes: x.bytes, tipo: 'image/jpeg' })))
  if (!gu.ok) return sin(`no se pudieron guardar los cuadros: ${gu.error}`)
  const cuadros: CuadroDelVideo[] = c.cuadros.map((x) => ({ plano: x.plano, segundo: x.segundo, ...(x.parte ? { parte: x.parte } : {}), url: gu.urls[nombreDelCuadro(x)] })).filter((x) => !!x.url)
  if (!cuadros.length) return sin('el almacén no devolvió la dirección de ningún cuadro')
  const faltan = g.planos.filter((p) => !cuadros.some((x) => x.plano === p.n)).map((p) => p.n)
  // cada pasada reemplaza las fichas de la mirada anterior (la de una vuelta a la mesa no arrastra la ficha vieja)
  return { res: { costo_usd: 0, artefacto: { cuadros, hay_cuadros: true, duracion_s: c.duracion_s, senales: c.senales ?? null, ...(faltan.length ? { planos_sin_cuadro: faltan } : {}) }, reemplazar_fichas: { origen: 'chequeo' as const, donde: 'mirada' } } }
}

/** el pedido del agente que mira (solo el paso `mirar_video`; null = no es un paso de video con pedido propio) */
export function armarPedidoV(paso: Paso, e: Estado, errorDeFormato?: string): { task: string; images: string[]; esquema: string } | null {
  if (paso.clave === PASO_REVISAR_IMAGENES_CLAVE) {
    const bv = baseV(e)
    const gv = datos(e, 'guion') as unknown as GuionDeLaMesa | undefined
    const ic = imagenesClaveVigentes(e)
    const esq = paso.salida?.esquema ?? 'revision_imagenes_clave.v1'
    const fotos = fotosPropiasConDireccion(bv.F.fotos).map((f) => ({ id: f.id, url: f.url }))
    const t = tareaDeLaRevisionDeImagenesClave({ imagenes: ic?.planos ?? [], planos: (gv?.planos ?? []) as PlanoDeLaHoja[], fotos, brief_texto: bv.brief.texto, red: bv.brief.red, contrato: CONTRATOS_EN_TEXTO[esq] ?? '', ...(errorDeFormato ? { errorDeFormato } : {}) })
    return { ...t, esquema: esq }
  }
  if (paso.clave !== PASO_MIRAR_VIDEO) return null
  const b = baseV(e)
  const g = datos(e, 'guion') as unknown as GuionDeLaMesa | undefined
  const cv = datos(e, 'cuadros_video')
  const cuadros = arr<CuadroDelVideo>(cv?.cuadros)
  // S2-7 · el agente juzga cada clip contra su imagen clave (S2-3) y con lo que midió ffmpeg
  const imagenes_clave = arr<{ n: number; url: string }>(imagenesClaveVigentes(e)?.planos)
  const senales = (cv?.senales ?? null) as SenalesDelVideo | null
  const esquema = paso.salida?.esquema ?? 'mirada_video.v1'
  const t = tareaDeLaMirada({ cuadros, planos: g?.planos ?? [], segundos: g?.segundos ?? 0, brief_texto: b.brief.texto, red: b.brief.red, formato: b.brief.formato, contrato: CONTRATOS_EN_TEXTO[esquema] ?? '', imagenes_clave, senales, ...(errorDeFormato ? { errorDeFormato } : {}) })
  return { ...t, esquema }
}

/** lo que el agente vio → el artefacto; si NO coincide queda una ficha que bloquea con lo que faltó (la vuelta a la mesa, si la plantilla la tiene, lee `coincide`) */
export function procesarValorV(paso: Paso, v: Record<string, unknown>, e: Estado, pl: Plantilla): { res: ResultadoDePaso } | null {
  if (paso.clave === PASO_REVISAR_IMAGENES_CLAVE) return procesarRevisionDeImagenesClave(paso, v, e, pl)
  if (paso.clave !== PASO_MIRAR_VIDEO) return null
  const m = leerMirada(v)
  const detalle = m.faltantes.map((f) => `${f.plano !== null ? `plano ${f.plano}: ` : ''}${f.que_falta}`).join(' · ') || m.para_la_mesa || 'sin detalle'
  // 11-nov · ADENDA Emilio 16:43 «no se trata de yo mandarlo a corregir»: si no coincide y al paso le queda su vuelta (`vuelve_a` de la plantilla), el video vuelve SOLO
  //   a la mesa con lo que faltó (mecanismo de #1047); sin vuelta, la ficha que bloquea. Nunca un lazo: la vuelta se cuenta al cerrar la mesa y a la segunda sigue de largo
  // 11-nov · CC7 🟡: volver SOLO si además CABE lo que cuesta volver (filmar otro video, mirarlo…); si no, el encargo se cerraría por tope ANTES de la jefatura y el video
  //   ya pagado se perdería: peor que no mirar. Sin espacio sigue a la jefatura con la ficha que bloquea, que dice que no se rehízo por tope
  const queda = !m.coincide && quedaVueltaDelPaso(paso, e)
  const costo = queda ? costoDeVolver(pl, paso) : 0
  const cabe = queda && cabeLaVuelta(pl, e, costo)
  if (cabe) return { res: { costo_usd: 0, artefacto: { ...m, vuelve_a_la_mesa: true, aviso_a_la_mesa: avisoDeLaMiradaALaMesa(m) } as unknown as Record<string, unknown>, reemplazar_fichas: { origen: 'chequeo' as const, donde: 'mirada' } } }
  const sinTope = queda ? ` · no se rehízo solo: volver a la mesa y filmar otro video (reserva US$ ${costo.toFixed(2)}) pasa el tope del encargo (US$ ${pl.limites.tope_encargo_usd}; van US$ ${e.gasto_usd.toFixed(2)})` : ''
  const fichas: Ficha[] = m.coincide ? [] : [fichaNueva(`video-no-coincide-${e.pasos_ejecutados}`, 'chequeo', 'mirada', 'bloquea', `el agente que miró el video dice que no cuenta lo que pide el guion: ${detalle}`.slice(0, 700) + sinTope, 'los cuadros del video contra el guion y la fila', m.para_la_mesa || 'rehacer el video con lo que faltó')]
  return { res: { costo_usd: 0, artefacto: { ...m, vuelve_a_la_mesa: false } as unknown as Record<string, unknown>, fichas, reemplazar_fichas: { origen: 'chequeo' as const, donde: 'mirada' } } }
}

/**
 * S2-3 · la revisión de las imágenes clave (decisión de Emilio 16-nov 20:53): AVISA y devuelve a la mesa UNA vez si algo no coincide (y si cabe volver);
 * a la segunda, o sin espacio, sigue de largo con una ficha de SUGERENCIA (no bloquea: el storyboard lo cuida la mesa, no es puerta de nadie).
 */
function procesarRevisionDeImagenesClave(paso: Paso, v: Record<string, unknown>, e: Estado, pl: Plantilla): { res: ResultadoDePaso } {
  const rv = leerRevisionDeImagenesClave(v)
  const reemplazar = { origen: 'chequeo' as const, donde: 'revision_imagen_clave' }
  const queda = !rv.coincide && quedaVueltaDelPaso(paso, e)
  const costo = queda ? costoDeVolver(pl, paso) : 0
  if (queda && cabeLaVuelta(pl, e, costo)) return { res: { costo_usd: 0, artefacto: { ...rv, vuelve_a_la_mesa: true, aviso_a_la_mesa: avisoDeLaRevisionALaMesa(rv) } as unknown as Record<string, unknown>, reemplazar_fichas: reemplazar } }
  const detalle = rv.por_plano.filter((p) => !p.coincide).map((p) => `plano ${p.plano}: ${p.correccion || 'no coincide'}`).join(' · ') || rv.para_la_mesa || 'sin detalle'
  const porque = queda ? ' · no volvió a la mesa: rehacer la hoja y sus imágenes no cabe en el tope del encargo' : (e.vueltas?.[paso.clave] ?? 0) > 0 ? ' · ya volvió una vez a la mesa' : ''
  const fichas: Ficha[] = rv.coincide ? [] : [fichaNueva(`imagen-clave-no-coincide-${e.pasos_ejecutados}`, 'chequeo', 'revision_imagen_clave', 'sugerencia', `el agente que revisó las imágenes clave dice que no todas cuentan lo que pide la hoja: ${detalle}`.slice(0, 700) + porque, 'las imágenes clave contra la hoja de planos', rv.para_la_mesa || 'mirar esos planos en el video')]
  return { res: { costo_usd: 0, artefacto: { ...rv, vuelve_a_la_mesa: false } as unknown as Record<string, unknown>, fichas, reemplazar_fichas: reemplazar } }
}

/** la revisión de las imágenes clave no se pudo LEER: el video sigue (la revisión avisa, no frena) con una ficha de sugerencia */
export function sinLecturaDeRevisarImagenesClaveV(e: Estado, errores: string[]): ResultadoDePaso {
  return {
    costo_usd: 0,
    artefacto: { coincide: true, sin_lectura: true, por_plano: [], para_la_mesa: '', vuelve_a_la_mesa: false },
    reemplazar_fichas: { origen: 'chequeo' as const, donde: 'revision_imagen_clave' },
    fichas: [fichaNueva(`imagen-clave-sin-lectura-${e.pasos_ejecutados}`, 'chequeo', 'revision_imagen_clave', 'sugerencia', `nadie pudo confirmar que las imágenes clave cuentan lo que pide la hoja: la respuesta del agente no se pudo leer (${errores.slice(0, 2).join(' · ')})`, 'formato de la revisión', 'mirar el storyboard antes de aprobar')],
  }
}

/** lo que se reserva para VOLVER desde `paso` a su destino: los topes de los pasos que se repiten (destino → paso, inclusive) y, si el destino es la mesa, un turno de la mesa (la mesa se limita sola con su reserva, pero puede integrar una vez). Puro */
export function costoDeVolver(pl: Plantilla, paso: Paso): number {
  const de = pl.pasos.findIndex((x) => x.clave === paso.vuelve_a?.paso)
  const a = pl.pasos.findIndex((x) => x.clave === paso.clave)
  if (de < 0 || a < de) return Number.POSITIVE_INFINITY
  const topes = pl.pasos.slice(de, a + 1).reduce((s, x) => s + (Number(x.tope_usd) || 0), 0)
  return +(topes + (pl.pasos[de].funcion === 'mesa' ? COTAS.RESERVA_POR_TURNO_USD : 0)).toFixed(6)
}

/** ¿cabe la vuelta en el tope del encargo (y en la holgura de la prueba, si la hay)? lo mismo que mira el motor antes de cada paso, por adelantado. Puro */
export function cabeLaVuelta(pl: Plantilla, e: Estado, costo: number): boolean {
  if (e.gasto_usd + costo > pl.limites.tope_encargo_usd + 1e-9) return false
  const pr = pl.limites.prueba
  if (pr && costo > pr.limite_usd - pr.base_usd - Math.max(0, e.gasto_usd - pr.encargo_base_usd) + 1e-9) return false
  return true
}

/** ¿a este paso le queda vuelta? (su `vuelve_a.max` contra las vueltas ya contadas; sin `vuelve_a`, nunca) */
export function quedaVueltaDelPaso(paso: Paso, e: Estado): boolean {
  const max = Number(paso.vuelve_a?.max ?? 0)
  return max > 0 && (e.vueltas?.[paso.clave] ?? 0) < max
}

/** el agente contestó (con su reintento) pero no se pudo LEER: el video sigue SIN juzgar y una ficha que bloquea pide que una persona lo mire */
export function sinLecturaDeMirarV(e: Estado, errores: string[]): ResultadoDePaso {
  return {
    costo_usd: 0,
    artefacto: { coincide: true, sin_lectura: true, faltantes: [], por_plano: [], para_la_mesa: '', orden_respetado: null },
    reemplazar_fichas: { origen: 'chequeo' as const, donde: 'mirada' },
    fichas: [fichaNueva(`video-sin-lectura-${e.pasos_ejecutados}`, 'chequeo', 'mirada', 'bloquea', `nadie pudo confirmar que el video cuenta lo que pide el guion: la respuesta del agente que lo miró no se pudo leer (${errores.slice(0, 2).join(' · ')})`, 'formato de la mirada', 'una persona mira el video antes de aprobar')],
  }
}

// ───────────────────────── el paso `video`: enviar al brazo y esperar
const conEnvio = (e: Estado, envio: EnvioGuardado, art = 'pedido_video'): Estado => {
  const antes = e.artefactos[art]
  if (!antes) return e
  return { ...e, artefactos: { ...e.artefactos, [art]: { ...antes, version: antes.version + 1, datos: { ...antes.datos, envio } } } }
}
export const envioDe = (e: Estado): EnvioGuardado | null => {
  // 17-nov · S2-4 tramo 4 · el borrador de las propuestas guarda su envío aparte; manda el del turno más reciente
  const deVideo = (datos(e, 'pedido_video')?.envio as EnvioGuardado | undefined) ?? null
  const deBorrador = (datos(e, ARTEFACTO_PEDIDO_BORRADOR)?.envio as EnvioGuardado | undefined) ?? null
  if (deBorrador && (!deVideo || deBorrador.n > deVideo.n)) return deBorrador
  return deVideo
}

/**
 * el paso `video` del motor: manda el pedido al brazo. En dry_run el puerto no sale a la red y el paso se registra en el acto con un video simulado; en real se abre un turno `brazo`
 * (sin agente) y el encargo espera: el vigía sondea el estado y `recibirVideo` registra el paso cuando el brazo termina. El tope del paso nunca pasa de lo que le queda al encargo.
 */
export async function enviarVideo(P: Puertos, enc: Encargo, pl: Plantilla, paso: Paso): Promise<{ fallido?: string; esperar?: Record<string, unknown>; res?: ResultadoDePaso }> {
  if (paso.funcion === FUNCION_BORRADOR_VIDEO) return enviarBorradores(P, enc, pl, paso)
  const e = enc.estado_del_motor
  const pv = datos(e, 'pedido_video')
  const ped = pv?.pedido as PedidoDeVideoDeLaOficina | undefined
  if (!ped) return { fallido: 'no hay pedido de video que enviar' }
  if (!P.video) return { fallido: 'el puerto del brazo de video no está configurado' }
  const lim = (pl.limites.video ?? {}) as { tope_por_video_usd?: number }
  const tope = Math.max(0, Math.min(paso.tope_usd, lim.tope_por_video_usd ?? paso.tope_usd, +(pl.limites.tope_encargo_usd - e.gasto_usd).toFixed(4)))
  const n = turnoDe(e)
  const planos = pv?.planos as PedidoDePlano[] | undefined
  if (Array.isArray(planos) && planos.length) return enviarPlanos(P, enc, paso, e, planos, tope, n)
  const envio = await P.video.enviar({ pedido: ped, client_id: enc.client_id, encargo_id: enc.id, dry_run: enc.dry_run, tope_usd: tope, workflow_id: `oficina:${enc.familia}`, workflow_execution_id: `${enc.id}:${n}` })
  if (!envio.ok) return { fallido: `el brazo de video no aceptó el pedido: ${envio.error}${envio.descripcion ? ` · lo que dijo el proveedor sobre sus precios: «${envio.descripcion.replace(/\s+/g, ' ').slice(0, 800)}»` : ''}` }
  const ahora = P.ahora().toISOString()
  if (envio.simulado) {
    const v: VideoDelEncargo = { request_id: envio.request_id, status: 'simulado', simulado: true, video_url: `${PREFIJO_DRY}video-${encodeURIComponent(ped.clave)}.mp4`, url_proveedor: null, copia: 'simulada', costo_usd: 0, costo_estimado_usd: envio.costo_estimado_usd, expires_at: null, enviado_en: ahora, terminado_en: ahora }
    return { res: { costo_usd: 0, artefacto: v as unknown as Record<string, unknown> } }
  }
  const e2 = conEnvio(e, { request_id: envio.request_id, status: envio.status, costo_estimado_usd: envio.costo_estimado_usd, costo_lista_usd: envio.costo_lista_usd, descuento_pct: envio.descuento_pct, enviado_en: ahora, n })
  const dispatch_key = `${enc.id}:${n}`
  await P.almacen.guardar({
    encargo_id: enc.id, estado_del_motor: e2, gasto_usd: e2.gasto_usd, estado: 'en_paso',
    turno: { n, paso: paso.clave, tipo: 'brazo', agente: null, estado: 'corriendo', dispatch_key, cost_usd: 0 },
    artefacto: { tipo: 'pedido_video', version: e2.artefactos['pedido_video'].version, contenido: e2.artefactos['pedido_video'].datos, sha256: sha(e2.artefactos['pedido_video'].datos), autor: 'sala' },
  })
  return { esperar: { accion: 'esperar_brazo', turno: { n, paso: paso.clave, tipo: 'brazo', dispatch_key, request_id: envio.request_id }, video: { costo_estimado_usd: envio.costo_estimado_usd, costo_lista_usd: envio.costo_lista_usd ?? null, descuento_pct: envio.descuento_pct ?? 0, plazo_min: MINUTOS_PARA_ESPERAR_AL_BRAZO } } }
}

/**
 * 17-nov · S2-4 tramo 4 · el BORRADOR EN VIDEO de cada propuesta (ver `video/borradores.ts`): el mismo camino B a calidad de borrador, todas las propuestas en UN lote.
 * Fuera de la fase de propuestas (aprobada, o sin propuestas) pasa de largo SIN GASTAR. Una propuesta sin pedido válido no frena a las demás.
 */
async function enviarBorradores(P: Puertos, enc: Encargo, pl: Plantilla, paso: Paso): Promise<{ fallido?: string; esperar?: Record<string, unknown>; res?: ResultadoDePaso }> {
  const e = enc.estado_del_motor
  const resolucion = resolucionDelBorrador(pl.limites)
  const pasa = (motivo: string) => ({ res: { costo_usd: 0, artefacto: borradoresOmitidos(resolucion, motivo) as unknown as Record<string, unknown> } })
  if (!propuestasDe(e)?.propuestas?.length) return pasa('sin_propuestas')
  if (faseDeProduccion(e) !== 'borrador') return pasa('propuesta_aprobada')
  const b = baseV(e)
  const arm = pedidosDeLosBorradores({ e, enc, brief: b.brief, fotos: b.F.fotos, relacion: b.proporcion, resolucion, catalogo: catalogoDelEncargo(b) })
  if (!arm.pedidos.length) return { res: { costo_usd: 0, artefacto: { fase: 'borrador', resolucion, costo_usd: 0, propuestas: arm.ids.map((id) => ({ id, url: null, costo_usd: 0, planos: 0, error: arm.errores.find((x) => x.id === id)?.error ?? 'sin planos' })) } satisfies BorradoresDeVideo as unknown as Record<string, unknown> } }
  if (!P.video) return { fallido: 'el puerto del brazo de video no está configurado' }
  const tope = Math.max(0, Math.min(paso.tope_usd, +(pl.limites.tope_encargo_usd - e.gasto_usd).toFixed(4)))
  const n = turnoDe(e)
  const antes = e.artefactos[ARTEFACTO_PEDIDO_BORRADOR]
  const conPedido: Estado = { ...e, artefactos: { ...e.artefactos, [ARTEFACTO_PEDIDO_BORRADOR]: { version: (antes?.version ?? 0) + 1, version_consumida: antes?.version_consumida ?? 0, datos: { planos: arm.pedidos, resolucion, errores: arm.errores, ids: arm.ids } } } }
  return enviarPlanos(P, enc, paso, conPedido, arm.pedidos, tope, n, ARTEFACTO_PEDIDO_BORRADOR)
}

/** el artefacto del borrador a partir de lo que volvió: una entrada por propuesta, en el orden de la mesa */
function borradoresDe(ids: string[], resolucion: string, hechos: BorradorDeLaPropuesta[], errores: Array<{ id: string; error: string }>, simulado = false): BorradoresDeVideo {
  const propuestas = ids.map((id) => hechos.find((h) => h.id === id) ?? { id, url: null, costo_usd: 0, planos: 0, error: errores.find((x) => x.id === id)?.error ?? 'sin planos' })
  return { fase: 'borrador', resolucion, propuestas, costo_usd: +propuestas.reduce((s, x) => s + x.costo_usd, 0).toFixed(4), ...(simulado ? { simulado: true } : {}) }
}

/** 11-nov · camino B · encuadra, cotiza la suma, envía cada plano y deja el turno `brazo` esperando a TODOS (en seco: todo simulado, sin red) */
async function enviarPlanos(P: Puertos, enc: Encargo, paso: Paso, e: Estado, planos: PedidoDePlano[], tope: number, n: number, art = 'pedido_video'): Promise<{ fallido?: string; esperar?: Record<string, unknown>; res?: ResultadoDePaso }> {
  const ahora = P.ahora()
  // 17-nov · S2-4 tramo 3 · lo pagado se reutiliza: solo lo que falta se encuadra, se cotiza (la SUMA de lo que falta contra el tope) y se envía
  const { reutilizados, faltan } = await separarPagados(P, enc, planos)
  const juntos = (xs: PlanoEnviado[]) => [...reutilizados, ...xs].sort((a, b) => a.n - b.n)
  const en = await encuadrarFotos(P, enc, faltan, ahora.getTime())
  if (!en.ok) return { fallido: en.motivo }
  const env = await cotizarYEnviar(P, enc, en.planos, tope, n)
  if (!env.ok && !env.enviados?.length) return { fallido: env.motivo }
  const iso = ahora.toISOString()
  if (!env.ok) {
    const enviados = juntos(env.enviados!)
    const e2 = conEnvio(e, { request_id: enviados[0].request_id, status: 'queued', costo_estimado_usd: +enviados.reduce((s, x) => s + x.costo_estimado_usd, 0).toFixed(4), enviado_en: iso, n, planos: enviados, lote_incompleto: env.motivo }, art)
    const dispatch_key = `${enc.id}:${n}`
    await P.almacen.guardar({
      encargo_id: enc.id, estado_del_motor: e2, gasto_usd: e2.gasto_usd, estado: 'en_paso',
      turno: { n, paso: paso.clave, tipo: 'brazo', agente: null, estado: 'corriendo', dispatch_key, cost_usd: 0 },
      artefacto: { tipo: art, version: e2.artefactos[art].version, contenido: e2.artefactos[art].datos, sha256: sha(e2.artefactos[art].datos), autor: 'sala' },
    })
    return { esperar: { accion: 'esperar_brazo', lote_incompleto: true, turno: { n, paso: paso.clave, tipo: 'brazo', dispatch_key, request_id: enviados[0].request_id }, video: { planos: enviados.length, plazo_min: MINUTOS_PARA_ESPERAR_AL_BRAZO } } }
  }
  if (env.simulado && art === ARTEFACTO_PEDIDO_BORRADOR) {
    const d = e.artefactos[art].datos as { ids: string[]; resolucion: string; errores: Array<{ id: string; error: string }> }
    const hechos = d.ids.filter((id) => env.enviados.some((x) => x.propuesta === id)).map((id) => ({ id, url: `${PREFIJO_DRY}borrador-${id}.mp4`, costo_usd: 0, planos: env.enviados.filter((x) => x.propuesta === id).length }))
    return { res: { costo_usd: 0, artefacto: borradoresDe(d.ids, d.resolucion, hechos, d.errores, true) as unknown as Record<string, unknown> } }
  }
  if (env.simulado) {
    const v: VideoDelEncargo = { request_id: env.enviados[0].request_id, status: 'simulado', simulado: true, video_url: `${PREFIJO_DRY}video-unido.mp4`, url_proveedor: null, copia: 'simulada', costo_usd: 0, costo_estimado_usd: 0, expires_at: null, enviado_en: iso, terminado_en: iso, planos: env.enviados.map((x) => ({ n: x.n, request_id: x.request_id, costo_usd: 0, video_url: `${PREFIJO_DRY}plano-${x.n}.mp4` })) }
    return { res: { costo_usd: 0, artefacto: v as unknown as Record<string, unknown> } }
  }
  const todos = juntos(env.enviados)
  const e2 = conEnvio(e, { request_id: todos[0].request_id, status: 'queued', costo_estimado_usd: env.costo_estimado_usd, enviado_en: iso, n, planos: todos }, art)
  const dispatch_key = `${enc.id}:${n}`
  await P.almacen.guardar({
    encargo_id: enc.id, estado_del_motor: e2, gasto_usd: e2.gasto_usd, estado: 'en_paso',
    turno: { n, paso: paso.clave, tipo: 'brazo', agente: null, estado: 'corriendo', dispatch_key, cost_usd: 0 },
    artefacto: { tipo: art, version: e2.artefactos[art].version, contenido: e2.artefactos[art].datos, sha256: sha(e2.artefactos[art].datos), autor: 'sala' },
  })
  return { esperar: { accion: 'esperar_brazo', turno: { n, paso: paso.clave, tipo: 'brazo', dispatch_key, request_id: todos[0].request_id }, video: { costo_estimado_usd: env.costo_estimado_usd, planos: todos.length, ...(reutilizados.length ? { reutilizados: reutilizados.map((x) => x.n) } : {}), plazo_min: MINUTOS_PARA_ESPERAR_AL_BRAZO } } }
}

/** lo que el video gasta en el libro de la oficina · camino B: un gasto por clip (cada uno tiene su fila en el libro central); camino A: uno solo. Puro */
export function gastosDelVideo(res: Extract<ResultadoDelBrazo, { ok: true }>, request_id: string): NonNullable<Cambios['gastos']> {
  if (res.planos) return res.planos.filter((p) => p.costo_usd > 0).map((p) => ({ concepto: 'video' as const, ref_tabla: 'agent_invocations', ref_id: sessionIdDeVideo(p.request_id), cost_usd: p.costo_usd, base: 'usage' as const }))
  const costo = Math.max(0, Number(res.costo_usd) || 0)
  return costo > 0 ? [{ concepto: 'video', ref_tabla: 'agent_invocations', ref_id: request_id ? sessionIdDeVideo(request_id) : null, cost_usd: costo, base: 'usage' }] : []
}

/** lo que el brazo entregó (o no): lo trae el vigía tras sondear, o una prueba */
export type ResultadoDelBrazo =
  | { ok: true; status: 'completed'; video_url: string; url_proveedor: string | null; costo_usd: number; expires_at: string | null; copia: 'bucket' | 'solo_proveedor'; aviso: string | null; /** camino B · los clips unidos (cada uno es un gasto en el libro) */ planos?: Array<{ n: number; request_id: string; costo_usd: number; video_url: string }> }
  | { ok: false; status: string; error: string; /** 17-nov · §2 de CC7 · camino B: lo que el proveedor YA cobró aunque el video falle */ cobrado?: ClipCobrado[] }

/** 17-nov · S2-4 tramo 4 · lo que vuelve del lote de borradores: uno por propuesta + los clips que se cobraron (un gasto por clip) */
export interface ResultadoDeLosBorradores { ok: true; status: 'borradores'; borradores: BorradorDeLaPropuesta[]; planos: Array<{ n: number; request_id: string; costo_usd: number; video_url: string }>; costo_usd: number }

/** el brazo terminó: se registra el paso `video` (artefacto + gasto en el libro de la oficina) y el encargo sigue; si falló, cierra FALLIDO visible. IDEMPOTENTE: una entrega repetida solo avanza */
export async function recibirVideo(P: Puertos, encargoId: string, n: number, res: ResultadoDelBrazo | ResultadoDeLosBorradores): Promise<Respuesta> {
  const enc = await P.almacen.leerEncargo(encargoId)
  if (!enc) return r(404, { error: 'encargo_inexistente' })
  const pl = await plantillaDe(P, enc)
  const abierto = await P.almacen.turnoAbierto(enc.id)
  if (!abierto || abierto.n !== n || abierto.tipo !== 'brazo') {
    if (n < turnoDe(enc.estado_del_motor)) return avanzar(P, enc.id)
    return r(409, { error: 'turno_no_esperado', esperado: abierto?.n ?? null, recibido: n })
  }
  const e = enc.estado_del_motor
  const sig = siguientePaso(e, pl)
  if (sig.accion !== 'ejecutar' || (sig.paso.funcion !== 'video' && sig.paso.funcion !== FUNCION_BORRADOR_VIDEO)) return r(409, { error: 'sin_paso_pendiente' })
  if (res.ok && res.status === 'borradores') return recibirBorradores(P, enc, pl, sig.indice, sig.paso, sig.vuelta, n, abierto, res)
  if (sig.paso.funcion === FUNCION_BORRADOR_VIDEO && res.ok) return r(409, { error: 'resultado_no_es_de_borradores' })
  const envio = envioDe(e)
  const request_id = envio?.request_id ?? ''
  const turnoBase = { n, paso: sig.paso.clave, tipo: 'brazo', agente: null, dispatch_key: abierto.dispatch_key, workflow_execution_id: abierto.workflow_execution_id ?? null }
  const ahora = P.ahora().toISOString()
  if (!res.ok) {
    // 17-nov · §2 de CC7 · lo que el proveedor YA cobró no se pierde: va al gasto del encargo (tope de campaña, fallidos «que gastaron») y al libro, un gasto por clip
    const cobrado = (res.cobrado ?? []).filter((c) => c.costo_usd > 0)
    const suma = +cobrado.reduce((s, c) => s + c.costo_usd, 0).toFixed(4)
    const e2: Estado = suma ? { ...e, gasto_usd: +(e.gasto_usd + suma).toFixed(4) } : e
    const gastos = cobrado.map((c) => ({ concepto: 'video' as const, ref_tabla: 'agent_invocations', ref_id: sessionIdDeVideo(c.request_id), cost_usd: c.costo_usd, base: 'usage' as const }))
    await P.almacen.guardar({ encargo_id: enc.id, estado_del_motor: e2, gasto_usd: e2.gasto_usd, turno: { ...turnoBase, estado: 'fallo', cost_usd: suma, error: `${res.status}: ${res.error}`.slice(0, 300) }, ...(gastos.length ? { gastos } : {}) })
    return fallar(P, { ...enc, estado_del_motor: e2, gasto_usd: e2.gasto_usd }, `el brazo de video no entregó (${res.status}): ${res.error}${textoDeLoCobrado(cobrado)}`)
  }
  const costo = Math.max(0, Number(res.costo_usd) || 0)
  const v: VideoDelEncargo = { request_id, status: 'completed', simulado: false, video_url: res.video_url, url_proveedor: res.url_proveedor, copia: res.copia, costo_usd: costo, costo_estimado_usd: envio?.costo_estimado_usd ?? 0, expires_at: res.expires_at, enviado_en: envio?.enviado_en ?? ahora, terminado_en: ahora, aviso: res.aviso, ...(res.planos ? { planos: res.planos } : {}) }
  const nuevo = registrarPaso(e, pl, sig.indice, { costo_usd: costo, artefacto: v as unknown as Record<string, unknown>, ...(sig.vuelta ? { vuelta: sig.vuelta } : {}) })
  const gastos = gastosDelVideo(res, request_id)
  await P.almacen.guardar({
    encargo_id: enc.id, estado_del_motor: nuevo, gasto_usd: nuevo.gasto_usd, estado: 'en_paso', fichas: nuevo.fichas,
    turno: { ...turnoBase, estado: 'hecho', cost_usd: costo },
    artefacto: { tipo: sig.paso.salida_artefacto, version: nuevo.artefactos[sig.paso.salida_artefacto].version, contenido: v as unknown as Record<string, unknown>, sha256: sha(v), autor: 'brazo-video' },
    ...(gastos.length ? { gastos } : {}),
  })
  return avanzar(P, enc.id)
}

/** la lectura del brazo → lo que `recibirVideo` entiende; null = todavía no terminó */
export function leerEstadoDelBrazo(st: EstadoDelBrazo, inicio: string, ahora: Date, plazoMin = MINUTOS_PARA_ESPERAR_AL_BRAZO): ResultadoDelBrazo | null {
  const vencido = new Date(inicio).getTime() < ahora.getTime() - plazoMin * 60_000
  if (!st.ok) return vencido ? { ok: false, status: 'sin_estado', error: `el brazo no contestó el estado en ${plazoMin} min (${st.error})` } : null
  if (st.simulado) return { ok: true, status: 'completed', video_url: `${PREFIJO_DRY}video-simulado.mp4`, url_proveedor: null, costo_usd: 0, expires_at: null, copia: 'bucket', aviso: 'simulado' }
  if (!st.terminal) return vencido ? { ok: false, status: 'sin_vuelta', error: `el brazo no terminó en ${plazoMin} min (último estado: ${st.status})` } : null
  if ('video_url' in st) return { ok: true, status: 'completed', video_url: st.video_url, url_proveedor: st.url_proveedor, costo_usd: st.costo_usd, expires_at: st.expires_at, copia: st.copia, aviso: st.aviso }
  return { ok: false, status: st.status, error: ('error' in st ? st.error : null) ?? 'el proveedor no entregó el video' }
}

/** EL VIGÍA sondea los turnos `brazo` abiertos (`oficina_turnos` corriendo): los que terminaron se registran y el encargo sigue; los que pasaron el plazo cierran fallidos */
/** 11-nov · #21 · `techoMin` = el plazo medido del brazo (nunca menos que los 45 min de hoy; `Infinity` = no se pudo medir: esta vuelta nada vence) */
export async function sondearVideos(P: Puertos, turnos: Array<{ encargo_id: string; n: number; paso: string; inicio: string }>, ahora: Date, techoMin: number = MINUTOS_PARA_ESPERAR_AL_BRAZO): Promise<{ reanudar: string[]; fallidos: string[]; cierres: Array<{ encargo_id: string; resultado_para_la_sala: string; sala_ref: Record<string, unknown> | null; client_id: string; brief_id: string }> }> {
  const reanudar: string[] = [], fallidos: string[] = []
  const cierres: Array<{ encargo_id: string; resultado_para_la_sala: string; sala_ref: Record<string, unknown> | null; client_id: string; brief_id: string }> = []
  for (const t of turnos) {
    const enc = await P.almacen.leerEncargo(t.encargo_id)
    if (!enc || ['cerrado', 'cerrado_por_tope', 'fallido', 'aprobada'].includes(enc.estado)) continue
    const envio = envioDe(enc.estado_del_motor)
    let res: ResultadoDelBrazo | ResultadoDeLosBorradores | null
    if (!envio?.request_id) res = { ok: false, status: 'sin_request_id', error: 'el turno del brazo no tiene pedido registrado' }
    else if (!P.video) res = { ok: false, status: 'sin_puerto', error: 'el puerto del brazo de video no está configurado' }
    else if (envio.planos?.length) res = await sondearPlanos(P, enc, envio.planos, t.inicio, ahora)
    else res = leerEstadoDelBrazo(await P.video.estado(envio.request_id), t.inicio, ahora, Math.max(techoMin, MINUTOS_PARA_ESPERAR_AL_BRAZO))
    if (!res) continue
    const out = await recibirVideo(P, enc.id, t.n, res)
    if (res.ok) { reanudar.push(enc.id); continue }
    fallidos.push(enc.id)
    cierres.push({ encargo_id: enc.id, resultado_para_la_sala: txt(out.cuerpo.resultado_para_la_sala) || 'fallido', sala_ref: enc.sala_ref, client_id: enc.client_id, brief_id: enc.brief_id })
  }
  return { reanudar, fallidos, cierres }
}

/** 11-nov · camino B · lee el estado de cada plano; cuando volvieron TODOS, los une (Railway) y devuelve el video unido; null = todavía no */
export async function sondearPlanos(P: Puertos, enc: Encargo, enviados: PlanoEnviado[], inicio: string, ahora: Date): Promise<ResultadoDelBrazo | ResultadoDeLosBorradores | null> {
  if (enviados.some((p) => p.propuesta)) return sondearBorradores(P, enc, enviados, inicio, ahora)
  const estados: EstadoDelBrazo[] = []
  // el reutilizado no se pregunta al proveedor (ya está en nuestro almacén y ya se pagó en su día)
  for (const p of enviados) estados.push(p.reutilizado ? ({ ok: true, terminal: true, status: 'reutilizado' } as EstadoDelBrazo) : await P.video!.estado(p.request_id))
  const vencido = new Date(inicio).getTime() < ahora.getTime() - MINUTOS_PARA_ESPERAR_AL_BRAZO * 60_000
  const l = leerPlanos(enviados, estados, vencido, MINUTOS_PARA_ESPERAR_AL_BRAZO)
  if (!l.listo) return null
  const cobradosDe = (cs: Array<{ n: number; request_id: string; costo_usd: number }>): ClipCobrado[] => cs.filter((c) => c.costo_usd > 0).map((c) => ({ n: c.n, request_id: c.request_id, costo_usd: c.costo_usd }))
  // 17-nov · §2 de CC7 · el envío se cortó a mitad: lote completo o nada · nunca se une, y se anota lo que los enviados cobraron
  const incompleto = envioDe(enc.estado_del_motor)?.lote_incompleto
  if (incompleto) return { ok: false, status: 'lote_incompleto', error: incompleto, cobrado: l.ok ? cobradosDe(l.clips) : l.cobrados }
  if (!l.ok) return { ok: false, status: l.status, error: l.error, cobrado: l.cobrados }
  const ped = datos(enc.estado_del_motor, 'pedido_video')?.pedido as PedidoDeVideoDeLaOficina | undefined
  const u = await unirClips(P, enc, l.clips, ped?.relacion ?? '9:16', ped?.resolucion ?? '720p', ahora.getTime())
  if (!u.ok) return { ok: false, status: 'no_se_unio', error: u.error, cobrado: cobradosDe(l.clips) }
  const costo = +l.clips.reduce((s, c) => s + c.costo_usd, 0).toFixed(4)
  const vence = l.clips.map((c) => c.expires_at).filter((x): x is string => !!x).sort()[0] ?? null
  return { ok: true, status: 'completed', video_url: u.video_url, url_proveedor: null, costo_usd: costo, expires_at: vence, copia: 'bucket', aviso: null, planos: l.clips.map((c) => ({ n: c.n, request_id: c.request_id, costo_usd: c.costo_usd, video_url: c.video_url })) }
}

/**
 * 17-nov · S2-4 tramo 4 · el lote de borradores: se espera a TODOS los clips de todas las propuestas; cada propuesta completa se une con su nombre; una que falló
 * (o un lote cortado a mitad: lote completo o nada) queda sin video y con su error. Todo lo cobrado vuelve para el gasto y el libro. Nunca devuelve fallo: no frena el encargo.
 */
async function sondearBorradores(P: Puertos, enc: Encargo, enviados: PlanoEnviado[], inicio: string, ahora: Date): Promise<ResultadoDeLosBorradores | null> {
  const estados: EstadoDelBrazo[] = []
  for (const p of enviados) estados.push(p.reutilizado ? ({ ok: true, terminal: true, status: 'reutilizado' } as EstadoDelBrazo) : await P.video!.estado(p.request_id))
  const vencido = new Date(inicio).getTime() < ahora.getTime() - MINUTOS_PARA_ESPERAR_AL_BRAZO * 60_000
  const ids = [...new Set(enviados.map((p) => p.propuesta ?? ''))]
  const lecturas = ids.map((id) => { const idx = enviados.flatMap((p, i) => (p.propuesta === id ? [i] : [])); return { id, l: leerPlanos(idx.map((i) => enviados[i]), idx.map((i) => estados[i]), vencido, MINUTOS_PARA_ESPERAR_AL_BRAZO) } })
  if (lecturas.some((x) => !x.l.listo)) return null
  const d = datos(enc.estado_del_motor, ARTEFACTO_PEDIDO_BORRADOR) as { resolucion?: string; envio?: EnvioGuardado; planos?: PedidoDePlano[] } | undefined
  const incompleto = d?.envio?.lote_incompleto
  const relacion = d?.planos?.[0]?.relacion ?? '9:16'
  const resolucion = d?.resolucion ?? RESOLUCION_DEL_BORRADOR_POR_OMISION
  const hechos: BorradorDeLaPropuesta[] = []
  const planos: ResultadoDeLosBorradores['planos'] = []
  for (const { id, l } of lecturas) {
    if (!l.listo) continue
    if (!l.ok) {
      for (const c of l.cobrados) planos.push({ n: c.n, request_id: c.request_id, costo_usd: c.costo_usd, video_url: '' })
      hechos.push({ id, url: null, costo_usd: +l.cobrados.reduce((s, c) => s + c.costo_usd, 0).toFixed(4), planos: enviados.filter((p) => p.propuesta === id).length, error: `${l.status}: ${l.error}` })
      continue
    }
    for (const c of l.clips) if (c.costo_usd > 0) planos.push({ n: c.n, request_id: c.request_id, costo_usd: c.costo_usd, video_url: c.video_url })
    const costo = +l.clips.reduce((s, c) => s + c.costo_usd, 0).toFixed(4)
    if (incompleto) { hechos.push({ id, url: null, costo_usd: costo, planos: l.clips.length, error: `lote_incompleto: ${incompleto}` }); continue }
    const u = await unirClips(P, enc, l.clips, relacion, resolucion, ahora.getTime(), `borrador-${id}`)
    hechos.push(u.ok ? { id, url: u.video_url, costo_usd: costo, planos: l.clips.length } : { id, url: null, costo_usd: costo, planos: l.clips.length, error: `no_se_unio: ${u.error}` })
  }
  return { ok: true, status: 'borradores', borradores: hechos, planos, costo_usd: +planos.reduce((s, c) => s + c.costo_usd, 0).toFixed(4) }
}

/** 17-nov · S2-4 tramo 4 · el lote de borradores volvió: el artefacto `borrador_video` (lo lee la tarjeta), su costo al encargo y un gasto por clip cobrado; el encargo sigue */
async function recibirBorradores(P: Puertos, enc: Encargo, pl: Plantilla, indice: number, paso: Paso, vuelta: string | undefined, n: number, abierto: { dispatch_key: string | null; workflow_execution_id?: string | null }, res: ResultadoDeLosBorradores): Promise<Respuesta> {
  const e = enc.estado_del_motor
  const d = datos(e, ARTEFACTO_PEDIDO_BORRADOR) as { ids?: string[]; resolucion?: string; errores?: Array<{ id: string; error: string }> } | undefined
  const art = borradoresDe(d?.ids ?? res.borradores.map((x) => x.id), d?.resolucion ?? RESOLUCION_DEL_BORRADOR_POR_OMISION, res.borradores, d?.errores ?? [])
  const costo = res.costo_usd
  const nuevo = registrarPaso(e, pl, indice, { costo_usd: costo, artefacto: art as unknown as Record<string, unknown>, ...(vuelta ? { vuelta } : {}) })
  const gastos = res.planos.filter((c) => c.costo_usd > 0).map((c) => ({ concepto: 'video' as const, ref_tabla: 'agent_invocations', ref_id: sessionIdDeVideo(c.request_id), cost_usd: c.costo_usd, base: 'usage' as const }))
  await P.almacen.guardar({
    encargo_id: enc.id, estado_del_motor: nuevo, gasto_usd: nuevo.gasto_usd, estado: 'en_paso', fichas: nuevo.fichas,
    turno: { n, paso: paso.clave, tipo: 'brazo', agente: null, dispatch_key: abierto.dispatch_key, workflow_execution_id: abierto.workflow_execution_id ?? null, estado: 'hecho', cost_usd: costo },
    artefacto: { tipo: paso.salida_artefacto, version: nuevo.artefactos[paso.salida_artefacto].version, contenido: art as unknown as Record<string, unknown>, sha256: sha(art), autor: 'brazo-video' },
    ...(gastos.length ? { gastos } : {}),
  })
  return avanzar(P, enc.id)
}

// ───────────────────────── la jefatura y el cierre
/** lo que la jefatura revisa de un video: el guion legible, el pie y las etiquetas, el pedido que se mandó al modelo y el enlace del video; las fotos de referencia como imágenes; el cerebro que leyó la mesa como contexto */
export function contextoDeRevisorV(pl: Plantilla, e: Estado): { pieza: string; imagenes: string[]; contexto: ContextoDelRevisor[] } {
  void pl
  const b = baseV(e)
  const g = datos(e, 'guion') as unknown as GuionDeLaMesa | undefined
  const cv = datos(e, 'copy_video') ?? {}
  const v = datos(e, 'video') as unknown as VideoDelEncargo | undefined
  const pv = datos(e, 'pedido_video')
  const ped = pv?.pedido as PedidoDeVideoDeLaOficina | undefined
  const pieza = [
    '## Guion del video',
    g ? guionLegible(g) : '(sin guion traducido)',
    '',
    '## Pie de foto',
    txt(cv.pie_de_foto) || '(vacío)',
    '',
    `## Etiquetas\n${arr(cv.hashtags).join(' ') || '(ninguna)'}`,
    '',
    '## Pedido enviado al modelo de video',
    ped ? `${ped.formato} · ${ped.segundos} s · ${ped.resolucion} · ${ped.relacion} · ${ped.fotos.length} foto(s) propia(s) de referencia\n${ped.prompt}` : '(sin pedido)',
    '',
    '## El video',
    v?.video_url ? `${v.video_url}${v.simulado ? ' (simulado)' : ''}${v.copia === 'solo_proveedor' ? ' (solo en el proveedor)' : ''} · costo US$ ${v.costo_usd.toFixed(4)}` : '(el brazo no entregó video)',
  ].join('\n')
  // 11-nov · la jefatura ve también lo que salió (los cuadros de cada plano), no solo las fotos de referencia · S2-7: solo el del MEDIO de cada plano, como antes (los 3 son para quien mira)
  const cuadros = arr<CuadroDelVideo>(datos(e, 'cuadros_video')?.cuadros).filter((c) => !c.parte || c.parte === 'medio').map((c) => c.url).filter(Boolean)
  const imagenes = [...(ped?.fotos ?? []), ...cuadros]
  const mirada = datos(e, 'mirada_video') as unknown as (MiradaDelVideo & { sin_lectura?: boolean }) | undefined
  const m = materialDe(e)
  const hechos = m?.resultado?.hechos ?? []
  const tablero = txt(datos(e, 'mesa')?.tablero_para_la_jefatura)
  const contexto: ContextoDelRevisor[] = [
    { titulo: 'Manual de marca', funcion: FUNCION_DEL_MANUAL, texto: b.F.manual_texto },
    ...(b.F.plan_texto ? [{ titulo: 'Plan de trabajo', funcion: FUNCION_DEL_PLAN, texto: b.F.plan_texto }] : []),
    { titulo: 'Brief', funcion: FUNCION_DEL_BRIEF, texto: b.brief.texto },
    ...(hechos.length ? [{ titulo: 'Material del portero', funcion: FUNCION_DEL_PORTERO, texto: hechos.map((h) => `- ${h.texto}${h.fuente ? ` (fuente: ${h.fuente})` : ''}`).join('\n') }] : []),
    ...(tablero ? [{ titulo: 'Tablero de la mesa', funcion: FUNCION_DEL_TABLERO, texto: tablero }] : []),
    ...(mirada && !mirada.sin_lectura ? [{ titulo: 'Lo que vio el agente que miró el video', funcion: FUNCION_DE_LA_MIRADA, texto: miradaLegible(mirada) }] : []),
  ]
  return { pieza, imagenes, contexto }
}

export function resumenDeCierreV(enc: Encargo, e: Estado, pl: Plantilla): { titulo: string; tituloBandeja: string; contenido: Record<string, unknown>; vista_previa: string; expires_at: string | null; generada: boolean; red: string; version: number } | null {
  if (!familiaDeVideo(pl)) return null
  const b = baseV(e)
  if (!b) return null
  const cv = datos(e, 'copy_video')
  const g = datos(e, 'guion') as unknown as GuionDeLaMesa | undefined
  const v = datos(e, 'video') as unknown as VideoDelEncargo | undefined
  if (!cv || !v) return null
  const ent = datos(e, 'entrega')
  const version = e.artefactos['copy_video']?.version ?? 1
  return {
    titulo: `Video ${enc.brief_id} · ${b.brief.red}`,
    tituloBandeja: `Aprobación · Video ${enc.brief_id} · ${b.brief.red} · ${g?.segundos ?? '?'} s · versión ${version} · ${b.F.cliente_nombre}`,
    contenido: {
      pie_de_foto: cv.pie_de_foto, hashtags: cv.hashtags, llamado: cv.llamado ?? null,
      guion: g ? guionLegible(g) : null, planos: g?.planos ?? [], segundos: g?.segundos ?? null,
      video: { url: txt(ent?.video_url) || v.video_url, url_proveedor: v.url_proveedor, copia: v.copia, costo_usd: v.costo_usd, expires_at: v.expires_at, request_id: v.request_id, simulado: v.simulado },
      entrega: ent ? { urls: ent.urls, expires_at: ent.expires_at } : null,
    },
    vista_previa: txt(cv.pie_de_foto).slice(0, 280), expires_at: (ent?.expires_at as string | null | undefined) ?? null, generada: true, red: b.brief.red, version,
  }
}
