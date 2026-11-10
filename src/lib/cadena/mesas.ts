/**
 * LAS MESAS DE LA CADENA · lado de la CADENA (31-oct · nuevo orden · T3 · CC#1). El lado de la OFICINA es `oficina/mesa/de-la-cadena.ts` (CC#2, T2).
 *
 * Tres piezas:
 *   · ABRIR (`brief/abrir` · `concepto/abrir`): la cadena crea su fila (`cadena_brief_creativo` / `cadena_conceptos`) y DEVUELVE EL SOBRE que el flujo le lleva a la oficina
 *     (`POST /api/oficina/encargos` con `origen: 'cadena'`). La cadena no llama a la oficina: el flujo es el cartero (contrato de CC2, 31-oct).
 *   · RECIBIR (`P.cadena.entregarBrief/entregarConcepto` · y `brief/entregar` · `concepto/entregar` por HTTP): la mesa entrega su tablero; la cadena lo lee POR CÓDIGO
 *     (`leerBriefCreativo` · `leerConcepto`), guarda lo leído y decide: brief `validada`/`devuelta`; concepto `lista` (→ tarjeta a Emilio + espera que no vence),
 *     `sin_mesa` o `brief_devuelto`. «La primera entrega que cierra gana» (una entrega sobre una fila ya cerrada contesta `ya_cerrada`).
 *   · DECIDIR (`concepto/decidir`): Emilio aprueba o pide cambios (al concepto o al brief). Aprobar deja pasar la tanda 1 (`calendarioPreparar` consulta `aprobacion`).
 *     Cambios abre la versión n+1 con la nota EN EL MARCO. Cap: 2 vueltas por campaña; a la tercera, `necesita_humano`. Cambios sobre un concepto ya aprobado se ACEPTAN (nota 3 de CC3).
 *
 * Dos plazos, un dueño cada uno (reserva 2 de CC3 a T2): el plazo de TRABAJO de la mesa lo cierra la OFICINA (`plazo_mesa_min`); aquí `plazo_en` es solo una red de seguridad
 * (plazo + holgura): si la oficina nunca entrega, el reloj deja la mesa `sin_mesa` y la campaña sigue. El plazo de APROBACIÓN de Emilio vive en `cadena_esperas` (`aprobacion_concepto`).
 * Reaperturas: brief devuelto o concepto `sin_mesa` reabren UNA vez (versión 2); a la segunda, `necesita_humano`.
 * Todo esto solo existe con la palanca `cadena_config.nuevo_orden` encendida para el cliente; apagada, la cadena de hoy no tiene estas mesas (409).
 */
import type { Almacen, BriefCreativoGuardado, Campana, ConceptoGuardado, ContextoDelCliente, EsperaFila } from './almacen'
import { autorizarLlamada, cadena, err, WORKFLOW_DEL_TABLERO, type Respuesta } from './autorizar'
import type { ResultadoDeEmision } from './autoproducir'
import { briefAnteriorParaElMarco, ordenDeAnalisisDeImpacto } from './cambios-pedidos'
import { hallazgosDelBrief, insumosDelBrief, leerBriefCreativo, REFERENCIA_DEL_BRIEF_CREATIVO, type BriefCreativoLeido } from './brief-creativo'
import { escribirHoja } from './hoja'
import { hallazgosDelConcepto, idDeBrief, idDeConcepto, insumosDesdeEstrategia, leerConcepto, resumenDelBanco, resumenDeLaVersionAnterior, type ConceptoLeido, type InsumosDelConcepto } from './conceptos'
import { sumarDias } from './fechas'
import { medidaDeCampana } from './constantes'
import { metodoDe } from './metodos'
import { abrirEsperaDe, ponerNecesitaHumano, resolverEsperas } from './nucleo'
import { reglaDeIdioma, reglaDeRegistro } from './registro'
import { abrirRegistro, avisoDePistas, avisosDeLaSalida, esperaDeRegistroViva, leerArtifactIdDeRegistro, leerObjetoDeRegistro, objetoDeRegistro, pistasDeRegistro, registroFijado, seRevisaElRegistro, textoDeLaVuelta, type DocDeRegistro } from './registro-en-jefatura'
import { TIPO_DE_ESPERA as TIPO_DE_ESPERA_DE_JEFATURA } from './revision-jefatura'
import { recibirReubicacion, type EntregaDeReubicacion } from './reubicar'
import type { Estrategia, FormatosPorRed } from './tipos'
import { contextoDeLaMesa } from '../sedes/por-abrir'
import { bloqueDelPerfil, type PerfilParaLectores } from '../perfil-del-publico/lectores'

export const CAP_DE_VUELTAS_DE_CAMBIOS = 2
/** versión 1 + UNA reapertura (brief devuelto · concepto sin_mesa); a la siguiente, necesita_humano */
export const MAX_VERSIONES_POR_REAPERTURA = 2
export const PLAZO_DE_MESA_MIN = { brief: 30, concepto: 90 } as const
export const HOLGURA_DE_MESA_MIN = 30
export const TIPO_DE_ESPERA_DE_CONCEPTO = 'aprobacion_concepto'
export const objetoDeEsperaDeConcepto = (version: number): string => `concepto:v${version}`

export interface SobreParaLaOficina { tipo_de_mesa: 'brief' | 'concepto'; client_id: string; campana_id: string; version: number; dry_run: boolean; marco_texto: string; condiciones: string[] }
/**
 * El SOBRE con el que la puerta vuelve a entrar (31-oct · respuesta a CC2 «quién vuelve a entrar»): quien SABE del evento lo arma aquí y el flujo que ya corre lo lleva a la sala;
 * el vigía reemite el MISMO sobre de respaldo. La clave lleva la ETAPA (`campana:tanda-N:<etapa>`) para que la sala no lo trague como repetido cuando la pieza que faltaba ya está.
 */
export interface SobreDeTanda {
  /** la ÚNICA fuente de la cadena registrada en la sala (migración 202610110200: fuente + regla BRIEF → la puerta); hueco visto por CC2 el 31-oct · lo que distingue empuje de respaldo es la clave, no la fuente */
  source: 'cadena/vigia'; intent: 'briefear'
  payload: { modo: 'tanda_siguiente'; campana_id: string; tanda: number; dry_run: boolean; client_id: string }
  idempotency_key: string; logical_period: string; tenant_id: string; client_id: string
}
export type EntregaALaCadena = { ok: true; estado?: string; ya_cerrada?: boolean; /** el sobre con el que la puerta vuelve a entrar (si el próximo paso no es de una persona) */ siguiente?: { sobre: SobreDeTanda } } | { ok: false; error?: string }
/** `motivo` de un brief que Emilio mandó a rehacer desde la tarjeta de la gran idea (no cuenta como reapertura por fallo) */
export const MOTIVO_CAMBIOS_DE_EMILIO = 'cambios_de_emilio'
/** ¿el brief quedó devuelto CON nota del dueño? solo entonces su texto entra en el marco del brief nuevo (10-nov · decisión C) */
export function briefDevueltoConNota(b: Pick<BriefCreativoGuardado, 'estado' | 'motivo' | 'devolucion_texto' | 'texto_md'> | null | undefined): boolean {
  return !!b && b.estado === 'devuelta' && b.motivo === MOTIVO_CAMBIOS_DE_EMILIO && !!b.devolucion_texto?.trim() && !!b.texto_md?.trim()
}

type BriefDeLaSecuencia = Pick<BriefCreativoGuardado, 'version' | 'estado' | 'motivo' | 'devolucion_texto' | 'texto_md'>
/**
 * EL PEDIDO DE CAMBIOS QUE SIGUE VIVO para la versión `version` del brief (la que se abre o se rescata) · puro.
 *  · la nota: la del pedido, o la del brief anterior si Emilio lo mandó a rehacer, o (10-nov · CC7 opción a) la del anterior a ESE si el anterior lo devolvió
 *    el CÓDIGO: el pedido de Emilio no se cumplió todavía, así que sigue vivo UNA vez más (tras dos devoluciones de código seguidas ya no hay nota y rige el tope);
 *  · la base: con nota, el ÚLTIMO texto escrito (el brief devuelto, por Emilio o por el código), para que la mesa conserve lo que ya estaba bien y vea lo que le falta.
 * Caso real (Náufrago, 10-nov): v2 «cambios de Emilio» (costa → playa) → v3 devuelto por el código (faltaban 2 secciones) → el v4 lleva la nota y el v3 como base.
 */
export function pedidoDeCambiosVigente(briefs: BriefDeLaSecuencia[], version: number, notaDelPedido: string | null): { nota: string | null; base: BriefDeLaSecuencia | null; heredada: boolean } {
  const previo = briefs.find((b) => b.version === version - 1) ?? null
  const anteDelPrevio = briefs.find((b) => b.version === version - 2) ?? null
  const deEmilio = (b: BriefDeLaSecuencia | null) => !!b && b.estado === 'devuelta' && b.motivo === MOTIVO_CAMBIOS_DE_EMILIO
  const notaDelPrevio = deEmilio(previo) ? texto(previo!.devolucion_texto) : null
  const delCodigo = !!previo && previo.estado === 'devuelta' && previo.motivo !== MOTIVO_CAMBIOS_DE_EMILIO
  const heredada = !notaDelPedido && !notaDelPrevio && delCodigo && deEmilio(anteDelPrevio) ? texto(anteDelPrevio!.devolucion_texto) : null
  const nota = notaDelPedido ?? notaDelPrevio ?? heredada
  const base = nota && previo?.estado === 'devuelta' && texto(previo.texto_md) ? previo : null
  return { nota, base, heredada: !!heredada }
}
export interface EntregaDeBrief { campana_id: string; version: number; encargo_id: string; texto: string | null; costo_usd: number; motivo: string | null }
export interface EntregaDeConcepto extends EntregaDeBrief { brief_devuelto?: string | null }

// ───────────────────────────────────────────────────────── palanca y condiciones (puros)
/** APAGADA POR DEFECTO (reserva 5b de CC3): si la lectura de `cadena_config` falla, la cadena de HOY sigue (sin mesas); una palanca que no se puede leer nunca enciende nada */
export async function nuevoOrdenEncendido(al: Almacen, clientId: string): Promise<boolean> {
  let p: unknown
  try { p = await al.leerConfig('nuevo_orden') } catch { return false }
  const clientes = p && typeof p === 'object' && Array.isArray((p as { clientes?: unknown }).clientes) ? ((p as { clientes: unknown[] }).clientes as unknown[]) : []
  return clientes.includes(clientId)
}

const ES_VIDEO = /video|reel|short|tiktok/i
/** las condiciones del directorio (`si_…`) las calcula la CADENA del plan de canales; la oficina solo las aplica (contrato de CC2) */
export function condicionesDe(e: Pick<Estrategia, 'canales' | 'patron_semanal'>, formatos: FormatosPorRed = {}): string[] {
  // solo las redes que publican (rol principal/réplica); un canal con rol «no» (excluido por el plan) no enciende condiciones
  const redes = new Set(e.canales.filter((c) => c.rol !== 'no').map((c) => String(c.red).toLowerCase()))
  const out = new Set<string>()
  if (redes.has('instagram') || redes.has('ig')) out.add('si_instagram')
  const hayVideo = e.patron_semanal.some((s) => ES_VIDEO.test(String(s.formato))) || redes.has('tiktok') || redes.has('youtube') ||
    [...redes].some((r) => (formatos[r] ?? []).some((f) => ES_VIDEO.test(f.formato)) && e.patron_semanal.some((s) => String(s.red).toLowerCase() === r && ES_VIDEO.test(String(s.formato))))
  if (hayVideo) out.add('si_video')
  return [...out]
}

// ───────────────────────────────────────────────────────── los marcos (texto, sin cliente en el código)
const fasesEnTexto = (e: Estrategia): string => e.fases.map((f) => `- ${f.clave}: días ${f.dia_desde}–${f.dia_hasta} · objetivo: ${f.objetivo} · plan dice: «${f.cita_plan}»`).join('\n') || '(la estrategia no trae fases)'
const canalesEnTexto = (e: Estrategia): string => e.canales.map((c) => `- ${c.red} (${c.rol})`).join('\n') || '(sin canales)'

const reglaDeLengua = (ctx: ContextoDelCliente): string => [reglaDeRegistro(ctx.registro), reglaDeIdioma(ctx.idioma)].filter(Boolean).join(' ')

export function marcoDelBrief(a: { ctx: ContextoDelCliente; estrategia: Estrategia; version: number; devolucion: string | null; nota: string | null; informeDeMercado?: string | null; metodo?: string | null; anterior?: string | null; perfil?: PerfilParaLectores | null }): string {
  const perfil = a.perfil ? bloqueDelPerfil(a.perfil) : ''
  return [
    '# Qué te pido',
    `Escribe el brief creativo de ESTA campaña (versión ${a.version}) a partir del plan, la estrategia y el manual del cliente. ${reglaDeLengua(a.ctx)}`,
    '',
    REFERENCIA_DEL_BRIEF_CREATIVO,
    // 31-oct (FIRMA 2 de Emilio · capa local): la casa del mensaje como guía para quien dirige el brief (`campaign-brief-agent`); `cadena_config.metodos.brief` la apaga o reemplaza
    ...(a.metodo ? ['', '# GUÍA PARA LA DIRECCIÓN DEL BRIEF (campaign-brief-agent · no es formato)', a.metodo] : []),
    ...(a.devolucion ? ['', '# DEVOLUCIÓN (la versión anterior se devolvió por esto; corrígelo, no lo discutas)', a.devolucion] : []),
    ...(a.nota ? ['', '# CAMBIOS PEDIDOS POR EL CLIENTE', a.nota] : []),
    // 10-nov (decisión C de Emilio): con cambios del dueño, la mesa analiza el impacto en TODO el brief y recibe el brief anterior (ver cambios-pedidos.ts)
    ...(a.nota ? ['', ordenDeAnalisisDeImpacto('el brief')] : []),
    ...(a.nota && a.anterior ? ['', a.anterior] : []),
    // 01-nov: el brief no lista las sedes; solo se añade la que tenga un estado que decir (sin ninguna, el pedido queda idéntico a hoy)
    // 10-nov (Lenovo por Emilio): la sede ABIERTA también se dice, con su fecha (contextoDeLaMesa)
    ...(a.ctx.sedes.some((s) => contextoDeLaMesa(s.estado, s.abierta_desde)) ? ['', '# SEDES', ...a.ctx.sedes.filter((s) => contextoDeLaMesa(s.estado, s.abierta_desde)).map((s) => `- ${s.clave}${s.nombre ? ` · ${s.nombre}` : ''} · ${contextoDeLaMesa(s.estado, s.abierta_desde)}`)] : []),
    '',
    '# ESTRATEGIA · canales',
    canalesEnTexto(a.estrategia),
    '# ESTRATEGIA · fases',
    fasesEnTexto(a.estrategia),
    ...(a.informeDeMercado ? ['', '# INFORME DE MERCADO (PROPUESTA · no es dato del cliente · contexto, no mandato)', a.informeDeMercado] : []),
    // 10-nov · perfil del público T2: lo OBSERVADO en voces públicas (contexto, no mandato) · sin perfil no se agrega nada (el marco queda como hoy)
    ...(perfil ? ['', perfil] : []),
    '',
    ...(a.ctx.eslogan ? [`# UNA FRASE QUE EL CLIENTE USA (contexto)\n«${a.ctx.eslogan.texto}»: ${a.ctx.eslogan.regla}`] : []),
    `# PALABRAS QUE LA MARCA EVITA (contexto, no prohibición: razona la intención; un claim propio sin prueba no va, una reseña citada y atribuida sí)\n${a.ctx.forbiddenWords.length ? a.ctx.forbiddenWords.map((w) => `- ${w}`).join('\n') : '(ninguna)'}${a.ctx.palabrasDuras?.length ? `\n\n# PROHIBIDAS DE VERDAD (una norma o una orden declarada, con su cita): estas no se usan\n${a.ctx.palabrasDuras.map((w) => `- ${w}`).join('\n')}` : ''}`,
    '',
    `# PLAN\n${a.ctx.planTexto}`,
  ].join('\n')
}

/**
 * 10-nov (GO v3 · punto 6): la mesa de la gran idea recibe la FECHA DE HOY y la fecha real de cada fase; lo que ya pasó no se propone (sirve para cualquier cliente).
 * Sin `hoy` o sin `inicio` no se agrega nada (el marco queda igual que antes).
 */
export function fechasDelConcepto(estrategia: Pick<Estrategia, 'fases'>, inicio: string | null | undefined, hoy: string | null | undefined): string | null {
  if (!inicio || !hoy) return null
  const lineas = estrategia.fases.map((f) => {
    const desde = sumarDias(inicio, f.dia_desde - 1)
    const hasta = sumarDias(inicio, f.dia_hasta - 1)
    const cuando = hasta < hoy ? 'YA PASÓ: no propongas piezas para estas fechas' : desde <= hoy ? `EN CURSO: solo piezas desde hoy (${hoy}); lo de días ya pasados no se propone` : 'por venir'
    return `- ${f.clave}: del ${desde} al ${hasta} · ${cuando}`
  })
  return [`# HOY · ${hoy} (la campaña empezó el ${inicio})`, 'Ninguna idea es para un día que ya pasó. Lo que anuncia algo que ya ocurrió (una apertura, un lanzamiento, un «llega hoy» de una fecha pasada) se cuenta como hecho, no como promesa.', ...lineas].join('\n')
}

export function marcoDelConcepto(a: { ctx: ContextoDelCliente; estrategia: Estrategia; briefTexto: string; version: number; nota: string | null; inicio?: string | null; hoy?: string | null; anterior?: string | null; perfil?: PerfilParaLectores | null }): string {
  const fechas = fechasDelConcepto(a.estrategia, a.inicio, a.hoy)
  const perfil = a.perfil ? bloqueDelPerfil(a.perfil) : ''
  return [
    '# Qué te pido',
    `La gran idea de ESTA campaña (versión ${a.version}): UNA frase paraguas, por qué funciona, cómo se ve, cómo suena; un CAPÍTULO por fase de la estrategia, y el BANCO DE IDEAS por capítulo y por red. ${reglaDeLengua(a.ctx)}`,
    '',
    '# Formato (concepto.v1) · se lee por código, exacto',
    '## Gran idea · «- nombre: …» y «- frase: …» · ## Por qué funciona · ## Cómo se ve (cita fotos propias como `foto:<id>`) · ## Cómo suena',
    '## Capítulo <clave de fase> · qué cuenta · «- serie: S1 · nombre · qué cuenta · redes» · y debajo «### Banco de ideas» con UNA idea por línea:',
    '`- C<fase>-I<nn> · red · formato · idea · mensaje: … · gancho: … · protagonista: … · serie: S1 · foto:<id>|ninguna`',
    'Cada idea trae mensaje y gancho propios y distintos; ids únicos; mínimo por red = huecos del patrón semanal × semanas de la fase (si no alcanza, lo declaras en «## Banco parcial»).',
    'Sin cifras con decimales inventadas, sin datos con valor (precios, horarios: los pone el estratega con su referencia), sin claims propios que no se puedan probar. ## Caminos descartados · ## Citas.',
    'Si la dirección decide que el brief no sirve, escribe «## Devolución del brief» con los puntos de los 6 criterios que fallan (UNA sola vez por campaña) y la mesa cierra.',
    ...(a.nota ? ['', '# CAMBIOS PEDIDOS POR EL CLIENTE (sobre la versión anterior)', a.nota] : []),
    // 10-nov (FASE 2 · opción A): el RESUMEN de la versión sobre la que el cliente pidió cambios (nunca el texto entero)
    ...(a.anterior ? ['', a.anterior] : []),
    // 10-nov (decisión C de Emilio): con cambios del dueño, la mesa analiza el impacto en TODA la gran idea antes de escribir (ver cambios-pedidos.ts)
    ...(a.nota ? ['', ordenDeAnalisisDeImpacto('la gran idea')] : []),
    ...(fechas ? ['', fechas] : []),
    '',
    '# BRIEF CREATIVO DE LA CAMPAÑA (validado)',
    a.briefTexto,
    // 10-nov · perfil del público T2: el mismo bloque que el brief · sin perfil no se agrega nada
    ...(perfil ? ['', perfil] : []),
    '',
    '# ESTRATEGIA · fases (un capítulo por fase)',
    fasesEnTexto(a.estrategia),
    '# ESTRATEGIA · canales y patrón semanal',
    canalesEnTexto(a.estrategia),
    a.estrategia.patron_semanal.map((s) => `- ${s.slot}: ${s.red} · ${s.formato} · día ${s.dia_semana} ${s.hora}`).join('\n') || '(sin patrón)',
    '',
    `# SEDES\n${a.ctx.sedes.length ? a.ctx.sedes.map((s) => `- ${s.clave}${s.nombre ? ` · ${s.nombre}` : ''}${contextoDeLaMesa(s.estado, s.abierta_desde) ? ` · ${contextoDeLaMesa(s.estado, s.abierta_desde)}` : ''}`).join('\n') : '(sin sedes)'}`,
    ...(a.ctx.eslogan ? [`# UNA FRASE QUE EL CLIENTE USA (contexto)\n«${a.ctx.eslogan.texto}»: ${a.ctx.eslogan.regla}`] : []),
    `# PALABRAS QUE LA MARCA EVITA (contexto, no prohibición: razona la intención; un claim propio sin prueba no va, una reseña citada y atribuida sí)\n${a.ctx.forbiddenWords.length ? a.ctx.forbiddenWords.map((w) => `- ${w}`).join('\n') : '(ninguna)'}${a.ctx.palabrasDuras?.length ? `\n\n# PROHIBIDAS DE VERDAD (una norma o una orden declarada, con su cita): estas no se usan\n${a.ctx.palabrasDuras.map((w) => `- ${w}`).join('\n')}` : ''}`,
  ].join('\n')
}

// ───────────────────────────────────────────────────────── lo común
/** 10-nov · perfil del público T2: el perfil para una mesa · sin lector = sin perfil (como hoy) · un fallo se DICE (`no_se_pudo_leer`), nunca «no hay» */
export async function perfilParaLaMesa(al: Pick<Almacen, 'perfilDelPublico'>, clientId: string, mesa: 'brief' | 'gran_idea'): Promise<PerfilParaLectores> {
  if (!al.perfilDelPublico) return { estado: 'sin_perfil' }
  try { return await al.perfilDelPublico(clientId, mesa) } catch (e) { return { estado: 'no_se_pudo_leer', detalle: e instanceof Error ? e.message : String(e) } }
}

interface Cargado { campana: Campana; ctx: ContextoDelCliente; estrategia: Estrategia }
async function cargar(al: Almacen, cuerpo: Record<string, unknown>, autorizar: boolean): Promise<{ ok: true; c: Cargado } | { ok: false; r: Respuesta }> {
  const id = cadena(cuerpo.campana_id)
  if (!id) return { ok: false, r: err(400, 'E-CAMPOS', 'falta campana_id') }
  const campana = await al.campana(id)
  if (!campana) return { ok: false, r: err(404, 'E-CAMPANA', 'campaña inexistente') }
  if (autorizar) { const noAut = await autorizarLlamada(al, cuerpo, campana.client_id); if (noAut) return { ok: false, r: noAut } }
  if (!(await nuevoOrdenEncendido(al, campana.client_id))) return { ok: false, r: err(409, 'E-NUEVO-ORDEN-APAGADO', 'la palanca nuevo_orden está apagada para este cliente: la cadena de hoy no tiene mesas de brief ni de concepto') }
  const estr = await al.ultimaEstrategia(campana.id)
  if (!estr || estr.estado !== 'validada') return { ok: false, r: err(409, 'E-SIN-ESTRATEGIA', 'no hay una estrategia validada: el brief creativo sale de la estrategia') }
  const ctx = await al.cargarContexto(campana.client_id, campana.plan_id)
  if (!ctx) return { ok: false, r: err(409, 'E-SIN-CONTEXTO', 'no se pudo cargar el contexto del cliente (plan, manual)') }
  return { ok: true, c: { campana, ctx, estrategia: estr.contenido } }
}
const texto = (x: unknown): string | null => (typeof x === 'string' && x.trim() ? x.trim() : null)
const masMinutos = (iso: string, min: number): string => new Date(Date.parse(iso) + min * 60_000).toISOString()

// ───────────────────────────────────────────────────────── BRIEF
export async function briefAbrir(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const c = await cargar(al, cuerpo, true)
  if (!c.ok) return c.r
  const { campana, ctx, estrategia } = c.c
  const ultimo = await al.ultimoBriefCreativo(campana.id)
  const briefs = ultimo ? await al.briefsDe(campana.id) : []
  if (ultimo?.estado === 'borrador') {
    // hueco 1 de CC3: una mesa abierta cuyo sobre no llegó a la oficina se rescata devolviendo el MISMO sobre otra vez (la oficina es idempotente: `ya_existia`);
    // el marco se rearma con lo persistido (la devolución o la nota de la versión anterior); lo que solo viajaba en el sobre original (informe de mercado) no se recupera
    const previo = briefs.find((b) => b.version === ultimo.version - 1) ?? null
    const pedido = pedidoDeCambiosVigente(briefs, ultimo.version, null)
    const sobre: SobreParaLaOficina = {
      tipo_de_mesa: 'brief', client_id: campana.client_id, campana_id: campana.id, version: ultimo.version, dry_run: campana.seco,
      marco_texto: marcoDelBrief({
        ctx, estrategia, version: ultimo.version,
        devolucion: previo?.estado === 'devuelta' && previo.motivo !== MOTIVO_CAMBIOS_DE_EMILIO ? previo.devolucion_texto : null,
        nota: pedido.nota,
        anterior: pedido.base ? briefAnteriorParaElMarco(pedido.base) : null,
        metodo: await metodoDe(al, 'brief'),
      }),
      condiciones: condicionesDe(estrategia, await al.formatos()),
    }
    return { status: 200, cuerpo: { ya_abierta: true, version: ultimo.version, brief_id: idDeBrief(campana.id, ultimo.version), plazo_mesa_min: PLAZO_DE_MESA_MIN.brief, sobre } }
  }
  const version = (ultimo?.version ?? 0) + 1
  // la nota de Emilio llega con el sobre o, si la puerta vuelve a entrar sin ella, se recupera del brief que él mandó a rehacer (o, si al que siguió lo devolvió el código, del anterior a ese)
  const pedido = pedidoDeCambiosVigente(briefs, version, texto(cuerpo.nota))
  const nota = pedido.nota
  if (ultimo?.estado === 'validada' && !nota) return { status: 200, cuerpo: { ya_hecha: true, version: ultimo.version, brief_id: idDeBrief(campana.id, ultimo.version) } }
  // reapertura por devolución o fallo: UNA vez; con nota de Emilio (cambios) no cuenta como reapertura
  if (ultimo && (ultimo.estado === 'devuelta' || ultimo.estado === 'descartada') && !nota && ultimo.version >= MAX_VERSIONES_POR_REAPERTURA) {
    const r = await ponerNecesitaHumano(al, campana, `el brief creativo ya se ${ultimo.estado === 'devuelta' ? 'devolvió' : 'descartó'} ${ultimo.version} veces`, ahora)
    return { status: 409, cuerpo: { error: 'brief_agotado', necesita_humano: true, alerta: r.alerta } }
  }
  const plazoMin = typeof cuerpo.plazo_mesa_min === 'number' && cuerpo.plazo_mesa_min > 0 ? cuerpo.plazo_mesa_min : PLAZO_DE_MESA_MIN.brief
  const fila: BriefCreativoGuardado = { campana_id: campana.id, version, estado: 'borrador', texto_md: null, leido: null, devolucion_texto: null, motivo: null, costo_usd: null, encargo_id: null, seco: campana.seco, plazo_en: masMinutos(ahora, plazoMin + HOLGURA_DE_MESA_MIN) }
  await al.insertarBriefCreativo(fila)
  const sobre: SobreParaLaOficina = {
    tipo_de_mesa: 'brief', client_id: campana.client_id, campana_id: campana.id, version, dry_run: campana.seco,
    marco_texto: marcoDelBrief({ ctx, estrategia, version, devolucion: ultimo?.estado === 'devuelta' && ultimo.motivo !== MOTIVO_CAMBIOS_DE_EMILIO ? ultimo.devolucion_texto : null, nota, informeDeMercado: texto(cuerpo.informe_de_mercado), metodo: await metodoDe(al, 'brief'), anterior: pedido.base ? briefAnteriorParaElMarco(pedido.base) : null, perfil: await perfilParaLaMesa(al, campana.client_id, 'brief') }),
    condiciones: condicionesDe(estrategia, await al.formatos()),
  }
  return { status: 200, cuerpo: { version, brief_id: idDeBrief(campana.id, version), plazo_mesa_min: plazoMin, sobre } }
}

/** la entrega de la mesa del brief (puerto `P.cadena.entregarBrief`) · nunca lanza hacia la oficina: lo que falle se dice en `error` */
export async function recibirBrief(al: Almacen, p: EntregaDeBrief, ahora: string): Promise<EntregaALaCadena> {
  const campana = await al.campana(p.campana_id)
  if (!campana) return { ok: false, error: 'campaña inexistente' }
  const ultimo = await al.ultimoBriefCreativo(campana.id)
  if (!ultimo || ultimo.version !== p.version) return { ok: false, error: `la cadena no tiene abierta la versión ${p.version} del brief (última: ${ultimo?.version ?? 'ninguna'})` }
  if (ultimo.estado !== 'borrador') return { ok: true, ya_cerrada: true, estado: ultimo.estado }
  // tramo 2 del revisor de registro: una entrega repetida mientras la jefatura revisa no reabre ni descarta nada (solo un brief retenido tiene texto en `borrador`)
  if (ultimo.texto_md && (await esperaDeRegistroViva(al, campana.id, 'brief', p.version))) return { ok: true, estado: EN_REVISION_DE_REGISTRO }
  const base = { costo_usd: p.costo_usd, encargo_id: p.encargo_id, motivo: p.motivo }
  if (!texto(p.texto)) {
    await al.actualizarBriefCreativo(campana.id, p.version, { ...base, estado: 'descartada', motivo: p.motivo ?? 'la mesa no entregó texto' })
    if (p.version >= MAX_VERSIONES_POR_REAPERTURA) await ponerNecesitaHumano(al, campana, `la mesa del brief no entregó dos veces (${p.motivo ?? 'sin motivo'})`, ahora)
    return { ok: true, estado: 'descartada', ...(await siguienteDespuesDe(al, campana.id)) }
  }
  const estr = await al.ultimaEstrategia(campana.id)
  const ctx = await al.cargarContexto(campana.client_id, campana.plan_id)
  // tramo 2 del revisor de registro: con la jefatura reteniendo `registro`, el registro se lee como AVISO y, si nada más bloquea, la jefatura lo revisa antes de validar
  if (await seRevisaElRegistro(al, campana, ctx)) {
    const leidoA = leerBriefCreativo(p.texto as string, { ...insumosDelBrief(ctx, estr?.contenido.canales), registroSoloAviso: true })
    if (!bloqueosDelBrief(leidoA).length) {
      await al.actualizarBriefCreativo(campana.id, p.version, { ...base, texto_md: p.texto, leido: leidoA as unknown as Record<string, unknown> })
      const { r, vence_en } = await abrirRegistro(al, { doc: 'brief', campana, version: p.version, texto: p.texto as string, registro: registroFijado(ctx)!, origenes: origenesDelCliente(ctx) }, ahora)
      if (r.estado === 'esperando') {
        // la mesa no se da por vencida mientras la jefatura revisa: su plazo pasa a ser el de la espera (más la holgura)
        await al.actualizarBriefCreativo(campana.id, p.version, { plazo_en: masMinutos(vence_en, HOLGURA_DE_MESA_MIN) })
        return { ok: true, estado: EN_REVISION_DE_REGISTRO }
      }
      if (r.estado === 'cerrada') return aplicarVueltaDeRegistro(al, r.salida, ahora)
      return cerrarBriefDeRegistro(al, campana, p.version, p.texto as string, leidoA, avisoDePistas(pistasDeRegistro(registroFijado(ctx)!, p.texto as string), `la jefatura no abrió la revisión: ${r.motivo}`), ahora)
    }
  }
  const leido = leerBriefCreativo(p.texto as string, insumosDelBrief(ctx, estr?.contenido.canales))
  const bloquea = bloqueosDelBrief(leido)
  const estado = bloquea.length ? 'devuelta' : 'validada'
  await al.actualizarBriefCreativo(campana.id, p.version, { ...base, estado, texto_md: p.texto, leido: leido as unknown as Record<string, unknown>, devolucion_texto: bloquea.length ? bloquea.map((b) => `- ${b}`).join('\n') : null })
  if (estado === 'devuelta' && p.version >= MAX_VERSIONES_POR_REAPERTURA) await ponerNecesitaHumano(al, campana, `el brief creativo se devolvió por código dos veces: ${bloquea.slice(0, 3).join(' · ')}`, ahora)
  return { ok: true, estado, ...(await siguienteDespuesDe(al, campana.id)) }
}

// ───────────────────────────────────────────────────────── CONCEPTO
const cuentaDe = (cs: ConceptoGuardado[], f: (c: ConceptoGuardado) => boolean): number => cs.filter(f).length

/**
 * 10-nov (FASE 2 · opción A, 2.ª condición de CC7): el resumen de la versión INMEDIATAMENTE anterior a `version`, SOLO si el cliente pidió cambios sobre ella
 * (`lista` + `cambios`, por cualquiera de los dos caminos). Nunca en una vuelta normal ni después de un «sin mesa».
 */
export function anteriorConCambios(todos: ConceptoGuardado[], version: number): string | null {
  const previas = todos.filter((k) => k.version < version).sort((a, b) => a.version - b.version)
  const ant = previas[previas.length - 1]
  if (!ant || ant.estado !== 'lista' || ant.aprobacion !== 'cambios' || !ant.texto_md) return null
  return resumenDeLaVersionAnterior(ant.texto_md, ant.version)
}

export async function conceptoAbrir(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const c = await cargar(al, cuerpo, true)
  if (!c.ok) return c.r
  const { campana, ctx, estrategia } = c.c
  const brief = await al.ultimoBriefCreativo(campana.id)
  if (!brief || brief.estado !== 'validada') return err(409, 'E-SIN-BRIEF', `no hay un brief creativo validado (último: ${brief?.estado ?? 'ninguno'})`)
  const todos = await al.conceptosDe(campana.id)
  const ultimo = todos[todos.length - 1] ?? null
  // Emilio pidió cambios: la vuelta siguiente se abre aunque la puerta vuelva a entrar sin la nota (se recupera de la decisión)
  // 10-nov (FASE 2 · opción A, Lenovo por Emilio): en los DOS caminos (brief o gran idea) la gran idea siguiente recibe la nota y el resumen de la versión anterior
  const conCambios = ultimo?.estado === 'lista' && ultimo.aprobacion === 'cambios'
  const nota = texto(cuerpo.nota) ?? (conCambios ? texto(ultimo.nota_de_emilio) : null)
  if (ultimo?.estado === 'abierta') {
    // hueco 1 de CC3: el mismo sobre otra vez (la oficina es idempotente); el marco se rearma con la nota persistida en la fila
    const sobre: SobreParaLaOficina = {
      tipo_de_mesa: 'concepto', client_id: campana.client_id, campana_id: campana.id, version: ultimo.version, dry_run: campana.seco,
      marco_texto: marcoDelConcepto({ ctx, estrategia, briefTexto: brief.texto_md ?? '', version: ultimo.version, nota: texto(ultimo.nota_de_emilio), inicio: campana.fecha_inicio, hoy: ahora.slice(0, 10), anterior: anteriorConCambios(todos, ultimo.version), perfil: await perfilParaLaMesa(al, campana.client_id, 'gran_idea') }), condiciones: condicionesDe(estrategia, await al.formatos()),
    }
    return { status: 200, cuerpo: { ya_abierta: true, version: ultimo.version, concepto_id: idDeConcepto(campana.id, ultimo.version), brief_version: brief.version, sobre } }
  }
  if (ultimo?.estado === 'lista' && !nota && !conCambios) return { status: 200, cuerpo: { ya_hecha: true, version: ultimo.version, aprobacion: ultimo.aprobacion, concepto_id: idDeConcepto(campana.id, ultimo.version) } }
  // 09-nov (revalidar la gran idea): una versión anterior revalidada que espera a Emilio manda sobre las `sin_mesa` posteriores · no se abre otra mesa
  const vigente = conceptoVigente(todos)
  if (!nota && vigente && vigente !== ultimo && vigente.estado === 'lista') return { status: 200, cuerpo: { ya_hecha: true, version: vigente.version, aprobacion: vigente.aprobacion, concepto_id: idDeConcepto(campana.id, vigente.version) } }
  if (!nota && cuentaDe(todos, (x) => x.estado === 'sin_mesa') >= MAX_VERSIONES_POR_REAPERTURA) {
    const r = await ponerNecesitaHumano(al, campana, 'la mesa de concepto no entregó concepto dos veces', ahora)
    return { status: 409, cuerpo: { error: 'concepto_agotado', necesita_humano: true, alerta: r.alerta } }
  }
  const version = (ultimo?.version ?? 0) + 1
  const plazoMin = typeof cuerpo.plazo_mesa_min === 'number' && cuerpo.plazo_mesa_min > 0 ? cuerpo.plazo_mesa_min : PLAZO_DE_MESA_MIN.concepto
  const fila: ConceptoGuardado = {
    campana_id: campana.id, version, estado: 'abierta', aprobacion: null, texto_md: null, leido: null, brief_devuelto: null, motivo: null, costo_usd: null,
    plazo_en: masMinutos(ahora, plazoMin + HOLGURA_DE_MESA_MIN), encargo_id: null, hitl_id: null, nota_de_emilio: nota, apunta_a: null, decidido_en: null, seco: campana.seco,
  }
  await al.insertarConcepto(fila)
  const sobre: SobreParaLaOficina = {
    tipo_de_mesa: 'concepto', client_id: campana.client_id, campana_id: campana.id, version, dry_run: campana.seco,
    marco_texto: marcoDelConcepto({ ctx, estrategia, briefTexto: brief.texto_md ?? '', version, nota, inicio: campana.fecha_inicio, hoy: ahora.slice(0, 10), anterior: anteriorConCambios([...todos, fila], version), perfil: await perfilParaLaMesa(al, campana.client_id, 'gran_idea') }), condiciones: condicionesDe(estrategia, await al.formatos()),
  }
  return { status: 200, cuerpo: { version, concepto_id: idDeConcepto(campana.id, version), brief_version: brief.version, plazo_mesa_min: plazoMin, sobre } }
}

/** la entrega de la mesa de concepto (puerto `P.cadena.entregarConcepto`) */
/**
 * 10-nov (GO v3 · puntos 2, 5 y 7): los insumos con que se LEE una gran idea, en UN solo lugar (entrega y revalidación):
 * las fotos propias que existen (antes iba una lista vacía: toda foto citada salía «no existe»), el registro del cliente y el brief validado como fuente de los datos.
 */
export async function insumosDelConcepto(al: Almacen, campana: Pick<Campana, 'id' | 'client_id' | 'plan_id'>): Promise<InsumosDelConcepto> {
  const estr = await al.ultimaEstrategia(campana.id)
  const ctx = await al.cargarContexto(campana.client_id, campana.plan_id)
  const fotos = al.fotosPropias ? await al.fotosPropias(campana.client_id) : []
  const brief = await al.ultimoBriefCreativo(campana.id)
  const base = estr ? insumosDesdeEstrategia(estr.contenido, ctx?.forbiddenWords ?? [], fotos) : { fases: [], redes: [], prohibidas: ctx?.forbiddenWords ?? [], fotos }
  // 10-nov · perfil del público T2: el texto del perfil vigente para el aviso «frase del público sin fuente» (null = sin perfil o no se pudo leer) · sin lector, el aviso no corre
  const perfil = al.perfilDelPublico ? await perfilParaLaMesa(al, campana.client_id, 'gran_idea') : null
  return { ...base, duras: ctx?.palabrasDuras, registro: ctx?.registro, ...(brief?.estado === 'validada' && brief.texto_md ? { fuente: brief.texto_md } : {}), ...(perfil ? { perfil_del_publico: perfil.estado === 'vigente' ? perfil.texto : null, perfil_del_publico_estado: perfil.estado } : {}) }
}

export async function recibirConcepto(al: Almacen, p: EntregaDeConcepto, ahora: string): Promise<EntregaALaCadena> {
  const campana = await al.campana(p.campana_id)
  if (!campana) return { ok: false, error: 'campaña inexistente' }
  const todos = await al.conceptosDe(campana.id)
  const fila = todos.find((x) => x.version === p.version)
  if (!fila) return { ok: false, error: `la cadena no tiene la versión ${p.version} del concepto` }
  if (fila.estado !== 'abierta') return { ok: true, ya_cerrada: true, estado: fila.estado }
  // tramo 2 del revisor de registro: una entrega repetida mientras la jefatura revisa no reabre nada (solo una gran idea retenida tiene texto estando `abierta`)
  if (fila.texto_md && (await esperaDeRegistroViva(al, campana.id, 'concepto', p.version))) return { ok: true, estado: EN_REVISION_DE_REGISTRO }
  const base = { costo_usd: p.costo_usd, encargo_id: p.encargo_id, motivo: p.motivo }
  const devolucion = texto(p.brief_devuelto)
  if (devolucion) {
    await al.actualizarConcepto(campana.id, p.version, { ...base, estado: 'brief_devuelto', brief_devuelto: devolucion, texto_md: p.texto })
    const brief = await al.ultimoBriefCreativo(campana.id)
    if (brief) {
      await al.actualizarBriefCreativo(campana.id, brief.version, { estado: 'devuelta', devolucion_texto: devolucion })
      if (brief.version >= MAX_VERSIONES_POR_REAPERTURA) await ponerNecesitaHumano(al, campana, 'la dirección devolvió el brief y ya era la segunda versión', ahora)
    }
    return { ok: true, estado: 'brief_devuelto', ...(await siguienteDespuesDe(al, campana.id)) }
  }
  const sinMesa = (motivo: string): Promise<EntregaALaCadena> => conceptoSinMesa(al, campana, p.version, todos, { ...base, motivo, texto_md: p.texto }, ahora)
  if (!texto(p.texto)) return sinMesa(p.motivo ?? 'la mesa no entregó texto')
  const ctx = await al.cargarContexto(campana.client_id, campana.plan_id)
  // tramo 2 del revisor de registro: como en el brief, el registro de «Cómo suena» se lee como AVISO y la jefatura lo revisa antes de abrir la aprobación de Emilio
  if (await seRevisaElRegistro(al, campana, ctx)) {
    const ins = await insumosDelConcepto(al, campana)
    const leidoA = leerConcepto(p.texto as string, { ...ins, registroSoloAviso: true })
    if (leidoA.estado !== 'sin_concepto') {
      await al.actualizarConcepto(campana.id, p.version, { ...base, texto_md: p.texto, leido: leidoA as unknown as Record<string, unknown> })
      const origenes = [...origenesDelCliente(ctx), ...(ins.fuente ? [{ titulo: 'el brief creativo', texto: ins.fuente }] : [])]
      const { r, vence_en } = await abrirRegistro(al, { doc: 'concepto', campana, version: p.version, texto: p.texto as string, registro: registroFijado(ctx)!, origenes }, ahora)
      if (r.estado === 'esperando') {
        await al.actualizarConcepto(campana.id, p.version, { plazo_en: masMinutos(vence_en, HOLGURA_DE_MESA_MIN) })
        return { ok: true, estado: EN_REVISION_DE_REGISTRO }
      }
      if (r.estado === 'cerrada') return aplicarVueltaDeRegistro(al, r.salida, ahora)
      return cerrarConceptoDeRegistro(al, campana, p.version, p.texto as string, leidoA, avisoDePistas(pistasDeRegistro(registroFijado(ctx)!, p.texto as string), `la jefatura no abrió la revisión: ${r.motivo}`), ahora)
    }
  }
  const leido = leerConcepto(p.texto as string, await insumosDelConcepto(al, campana))
  if (leido.estado === 'sin_concepto') return sinMesa(`sin_concepto: ${leido.bloqueos.join(' · ')}`)
  await al.actualizarConcepto(campana.id, p.version, { ...base, estado: 'lista', aprobacion: 'pendiente', texto_md: p.texto, leido: leido as unknown as Record<string, unknown> })
  await abrirAprobacionDelConcepto(al, campana, p.version, leido, p.costo_usd, todos, ahora, ctx?.nombreDelNegocio ?? null)
  return { ok: true, estado: 'lista' }
}

/** la gran idea que no trae concepto: `sin_mesa` (y, a la segunda, `necesita_humano`) · la usan la entrega y el cierre de la revisión de registro */
async function conceptoSinMesa(al: Almacen, campana: Campana, version: number, todos: ConceptoGuardado[], patch: Partial<ConceptoGuardado> & { motivo: string }, ahora: string): Promise<EntregaALaCadena> {
  await al.actualizarConcepto(campana.id, version, { ...patch, estado: 'sin_mesa' })
  if (cuentaDe(todos, (x) => x.estado === 'sin_mesa') + 1 >= MAX_VERSIONES_POR_REAPERTURA) await ponerNecesitaHumano(al, campana, `la mesa de concepto no entregó concepto dos veces (${patch.motivo.slice(0, 160)})`, ahora)
  return { ok: true, estado: 'sin_mesa', ...(await siguienteDespuesDe(al, campana.id)) }
}

// ───────────────────────────────────────────────────────── tramo 2 del revisor de registro (10-nov · GO de Lenovo 17:33Z) · ver `registro-en-jefatura.ts`
export const EN_REVISION_DE_REGISTRO = 'en_revision_de_registro'
const bloqueosDelBrief = (l: BriefCreativoLeido): string[] => hallazgosDelBrief(l).filter((h) => h.severidad === 'bloquea').map((h) => h.ficha.que)
/** los documentos del cliente de los que el texto puede citar: el revisor comprueba sus citas contra ellos */
export const origenesDelCliente = (ctx: ContextoDelCliente | null): Array<{ titulo: string; texto: string }> => [{ titulo: 'el plan', texto: ctx?.planTexto ?? '' }, { titulo: 'el manual', texto: ctx?.manualTexto ?? '' }]
const conAvisos = <L extends { avisos: string[] }>(l: L, extra: string[]): L => ({ ...l, avisos: [...l.avisos, ...extra.filter((x) => !l.avisos.includes(x))] })

async function cerrarBriefDeRegistro(al: Almacen, campana: Campana, version: number, textoFinal: string, leido: BriefCreativoLeido, avisos: string[], ahora: string): Promise<EntregaALaCadena> {
  const l = conAvisos(leido, avisos)
  const bloquea = bloqueosDelBrief(l)
  const estado = bloquea.length ? 'devuelta' : 'validada'
  await resolverEsperas(al, campana.id, TIPO_DE_ESPERA_DE_JEFATURA, objetoDeRegistro('brief', version))
  await al.actualizarBriefCreativo(campana.id, version, { estado, texto_md: textoFinal, leido: l as unknown as Record<string, unknown>, devolucion_texto: bloquea.length ? bloquea.map((b) => `- ${b}`).join('\n') : null })
  if (estado === 'devuelta' && version >= MAX_VERSIONES_POR_REAPERTURA) await ponerNecesitaHumano(al, campana, `el brief creativo se devolvió por código dos veces: ${bloquea.slice(0, 3).join(' · ')}`, ahora)
  return { ok: true, estado, ...(await siguienteDespuesDe(al, campana.id)) }
}

async function cerrarConceptoDeRegistro(al: Almacen, campana: Campana, version: number, textoFinal: string, leido: ConceptoLeido, avisos: string[], ahora: string): Promise<EntregaALaCadena> {
  const todos = await al.conceptosDe(campana.id)
  await resolverEsperas(al, campana.id, TIPO_DE_ESPERA_DE_JEFATURA, objetoDeRegistro('concepto', version))
  if (leido.estado === 'sin_concepto') return conceptoSinMesa(al, campana, version, todos, { motivo: `sin_concepto: ${leido.bloqueos.join(' · ')}`, texto_md: textoFinal }, ahora)
  const l = conAvisos(leido, avisos)
  await al.actualizarConcepto(campana.id, version, { estado: 'lista', aprobacion: 'pendiente', texto_md: textoFinal, leido: l as unknown as Record<string, unknown> })
  const ctx = await al.cargarContexto(campana.client_id, campana.plan_id)
  await abrirAprobacionDelConcepto(al, campana, version, l, todos.find((x) => x.version === version)?.costo_usd ?? null, todos, ahora, ctx?.nombreDelNegocio ?? null)
  return { ok: true, estado: 'lista' }
}

/** lee el documento con TODOS sus chequeos y el registro como aviso (lo que corre sobre el original y otra vez sobre la versión corregida) */
async function releerParaRegistro(al: Almacen, campana: Campana, doc: DocDeRegistro, t: string): Promise<{ brief?: BriefCreativoLeido; concepto?: ConceptoLeido; bloqueos: string[]; ctx: ContextoDelCliente | null }> {
  const ctx = await al.cargarContexto(campana.client_id, campana.plan_id)
  if (doc === 'brief') {
    const estr = await al.ultimaEstrategia(campana.id)
    const brief = leerBriefCreativo(t, { ...insumosDelBrief(ctx, estr?.contenido.canales), registroSoloAviso: true })
    return { brief, bloqueos: bloqueosDelBrief(brief), ctx }
  }
  const concepto = leerConcepto(t, { ...(await insumosDelConcepto(al, campana)), registroSoloAviso: true })
  return { concepto, bloqueos: concepto.bloqueos, ctx }
}

/** el documento retenido que sigue esperando su revisión (brief en `borrador` · gran idea `abierta`, con su texto guardado); null si ya cerró por otra vía */
async function documentoRetenido(al: Almacen, campanaId: string, doc: DocDeRegistro, version: number): Promise<string | null> {
  if (doc === 'brief') {
    const b = (await al.briefsDe(campanaId)).find((x) => x.version === version)
    return b && b.estado === 'borrador' && b.texto_md ? b.texto_md : null
  }
  const c = (await al.conceptosDe(campanaId)).find((x) => x.version === version)
  return c && c.estado === 'abierta' && c.texto_md ? c.texto_md : null
}

async function cerrarDocumento(al: Almacen, campana: Campana, doc: DocDeRegistro, version: number, t: string, leido: Awaited<ReturnType<typeof releerParaRegistro>>, avisos: string[], ahora: string): Promise<EntregaALaCadena> {
  return doc === 'brief' ? cerrarBriefDeRegistro(al, campana, version, t, leido.brief!, avisos, ahora) : cerrarConceptoDeRegistro(al, campana, version, t, leido.concepto!, avisos, ahora)
}

/**
 * LA VUELTA de la revisión de registro (la entrega la ruta `api/jefatura/cadena-vuelta`, o la apertura si la jefatura cerró en la misma llamada). IDEMPOTENTE: sin espera viva no hace nada.
 *   · el texto corregido (solo si la jefatura produjo una versión) se vuelve a leer con TODOS los chequeos: si alguno se rompe, se queda la versión anterior con aviso (línea 2 de CC7);
 *   · el chequeo de citas (#984) es uno de ellos: una corrección que toca una cita deja de ser literal y se rechaza (línea 1 de CC7);
 *   · los avisos de la revisión (citas en otro registro) y las formas de otro registro que el detector aún ve quedan como avisos del documento: nunca bloquean.
 */
export async function aplicarVueltaDeRegistro(al: Almacen, salida: Record<string, unknown>, ahora: string): Promise<EntregaALaCadena> {
  const id = leerArtifactIdDeRegistro(String(salida.artifact_id ?? ''))
  if (!id || id.doc === 'calendario') return { ok: false, error: '`salida.artifact_id` no es de una revisión de registro del brief o de la gran idea (registro:<brief|concepto>:<campaña>:v<n>); la del calendario vuelve por `vuelta-de-registro.ts`' }
  const campana = await al.campana(id.campana_id)
  if (!campana) return { ok: false, error: 'campaña inexistente' }
  if (!(await esperaDeRegistroViva(al, campana.id, id.doc, id.version))) return { ok: true, ya_cerrada: true }
  const original = await documentoRetenido(al, campana.id, id.doc, id.version)
  if (original === null) { await resolverEsperas(al, campana.id, TIPO_DE_ESPERA_DE_JEFATURA, objetoDeRegistro(id.doc, id.version)); return { ok: true, ya_cerrada: true } }
  const avisos = avisosDeLaSalida(salida)
  const v = textoDeLaVuelta(salida, original)
  let final = v.texto
  let leido = await releerParaRegistro(al, campana, id.doc, final)
  if (v.corregido && leido.bloqueos.length) {
    avisos.push(`la corrección de registro rompía otros chequeos (${leido.bloqueos.slice(0, 3).join(' · ')}): se queda la versión anterior`)
    final = original
    leido = await releerParaRegistro(al, campana, id.doc, final)
  }
  const reg = registroFijado(leido.ctx)
  const pendientes = reg ? pistasDeRegistro(reg, final) : []
  if (pendientes.length) avisos.push(`el detector aún ve formas de otro registro (revísalas): ${pendientes.slice(0, 8).join(' · ')}`)
  return cerrarDocumento(al, campana, id.doc, id.version, final, leido, avisos, ahora)
}

/**
 * La ruta `api/jefatura/cadena-vuelta`: valida la entrega `{ marcas, salida }` de la jefatura, aplica la vuelta y, como nadie más reenvía el sobre de la cadena (la entrega viene del flujo
 * de la jefatura, no de la puerta), lo deja ella misma en la sala con la clave del medio día (`tramoDeReemision`: la sala deduplica con el vigía). Un fallo al dejarlo no tumba la vuelta.
 */
export async function recibirVueltaDeRegistro(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const s = cuerpo.salida
  if (!s || typeof s !== 'object' || Array.isArray(s)) return err(400, 'E-CAMPOS', '`salida` debe ser la salida de la revisión')
  const salida = s as Record<string, unknown>
  if (salida.artifact_type !== 'registro') return err(400, 'E-CAMPOS', '`salida.artifact_type` debe ser «registro»: esta ruta solo vuelve a la cadena')
  const id = leerArtifactIdDeRegistro(String(salida.artifact_id ?? ''))
  if (!id || id.doc === 'calendario') return err(400, 'E-CAMPOS', '`salida.artifact_id` debe ser registro:<brief|concepto>:<campaña>:v<n>')
  if (typeof salida.resultado !== 'string') return err(400, 'E-CAMPOS', '`salida.resultado` es obligatorio')
  const re = await aplicarVueltaDeRegistro(al, salida, ahora)
  if (!re.ok) return err(409, 'E-VUELTA', re.error ?? 'la vuelta no se pudo aplicar')
  // el sobre con la clave del medio día (la MISMA que armaría el vigía): la sala deduplica y no hay trabajo doble
  const tramo = tramoDeReemision(ahora)
  const empuje = re.siguiente ? await empujarDesdeElTablero(al, tramo, await siguienteDespuesDe(al, id.campana_id, tramo)) : {}
  return { status: 200, cuerpo: { ...re, revision: { id: salida.revision_id ?? null, resultado: salida.resultado }, ...empuje } }
}

/** el reloj: la espera de una revisión de registro venció sin vuelta → el documento se cierra con su texto y las pistas como aviso (la cadena nunca queda de rehén) */
export async function seguirSinRevisionDeRegistro(al: Almacen, e: EsperaFila, ahora: string): Promise<string> {
  const o = leerObjetoDeRegistro(e.objeto_id)
  if (!o || o.doc === 'calendario') return `${e.objeto_id}: objeto no reconocido`
  const campana = await al.campana(e.campana_id)
  if (!campana) return `campaña ${e.campana_id} inexistente`
  const t = await documentoRetenido(al, campana.id, o.doc, o.version)
  if (t === null) return `${e.objeto_id}: ya había cerrado`
  const leido = await releerParaRegistro(al, campana, o.doc, t)
  const reg = registroFijado(leido.ctx)
  await cerrarDocumento(al, campana, o.doc, o.version, t, leido, avisoDePistas(reg ? pistasDeRegistro(reg, t) : [], 'la revisión de la jefatura no cerró a tiempo'), ahora)
  return `${e.objeto_id}: siguió sin revisión de registro (venció la espera de la jefatura)`
}

/** un concepto que quedó `lista`: la espera de la aprobación de Emilio (no vence, se recuerda) y su tarjeta «Gran idea» · lo usan la entrega y la revalidación (09-nov) */
export async function abrirAprobacionDelConcepto(al: Almacen, campana: Campana, version: number, leido: ConceptoLeido, costoUsd: number | null, todos: ConceptoGuardado[], ahora: string, nombreDelNegocio: string | null): Promise<string> {
  const p = { version, costo_usd: costoUsd }
  const hallazgos = hallazgosDelConcepto(leido)
  const espera = await abrirEsperaDe(al, campana, TIPO_DE_ESPERA_DE_CONCEPTO, objetoDeEsperaDeConcepto(p.version), 'esperando la aprobación de Emilio sobre la gran idea', ahora, { fechaInicio: campana.fecha_inicio, zona: campana.zona_horaria }, `concepto:${campana.id}:v${p.version}`)
  // 09-nov (🟡 de CC7 a #960): una vuelta atrás de `concepto/revalidar` CANCELA esta espera; si después se reintenta, la misma llave devuelve la cancelada: se revive
  if (espera.estado !== 'viva') await al.actualizarEspera(espera.id, { estado: 'viva' })
  const vueltasUsadas = cuentaDe(todos, (x) => x.aprobacion === 'cambios')
  const resumen = resumenDelBanco(leido)
  const hitl_id = await al.abrirTarjetaDeConcepto({
    client_id: campana.client_id, campana_id: campana.id, version: p.version, seco: campana.seco,
    titulo: `Gran idea · ${leido.gran_idea?.nombre ?? '(sin nombre)'} · campaña ${nombreDelNegocio ?? campana.client_id}`,
    vista_previa: `${leido.gran_idea?.frase ?? ''}\n${resumen.total} ideas en el banco · ${leido.capitulos.length} capítulo(s)${resumen.parcial.length ? ' · banco parcial' : ''}`,
    metadata: {
      origen: 'cadena', tipo: 'concepto', campana_id: campana.id, version: p.version, concepto_id: idDeConcepto(campana.id, p.version), brief_version: (await al.ultimoBriefCreativo(campana.id))?.version ?? null,
      seco: campana.seco, costo_usd: p.costo_usd, vueltas_restantes: Math.max(0, CAP_DE_VUELTAS_DE_CAMBIOS - vueltasUsadas), avisos: hallazgos.filter((h) => h.severidad === 'aviso').map((h) => h.ficha.que), resumen_del_banco: resumen,
    },
  })
  await al.actualizarConcepto(campana.id, p.version, { hitl_id })
  return hitl_id
}

export async function conceptoDecidir(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const id = cadena(cuerpo.campana_id)
  if (!id) return err(400, 'E-CAMPOS', 'falta campana_id')
  const campana = await al.campana(id)
  if (!campana) return err(404, 'E-CAMPANA', 'campaña inexistente')
  // la decisión la toma un humano: desde el tablero entra con workflow_id 'tablero' (T4); desde un flujo, como siempre
  const noAut = await autorizarLlamada(al, cuerpo, campana.client_id, { humano: true })
  if (noAut) return noAut
  const decision = cuerpo.decision === 'aprobar' || cuerpo.decision === 'cambios' ? cuerpo.decision : null
  if (!decision) return err(400, 'E-DECISION', 'decision debe ser «aprobar» o «cambios»')
  const todos = await al.conceptosDe(campana.id)
  const version = Number.isInteger(cuerpo.version) ? (cuerpo.version as number) : (todos[todos.length - 1]?.version ?? 0)
  const fila = todos.find((x) => x.version === version)
  if (!fila || fila.estado !== 'lista') return err(409, 'E-SIN-TARJETA', `la versión ${version} del concepto no está lista para decidir (${fila?.estado ?? 'no existe'})`)
  // reserva 3 de CC3: «cambios» cierra la versión (su tarjeta quedó rechazada y la vuelta siguiente ya está en marcha): no se vuelve a aprobar ni a mandar a cambios esa misma versión;
  // si Emilio se arrepiente, decide sobre la versión siguiente. (Cambios sobre una versión APROBADA sí valen: cambio de rumbo, nota 3 de CC3.)
  if (fila.aprobacion === 'cambios') return err(409, 'E-YA-DECIDIDO', `la versión ${version} del concepto ya se mandó a cambios (${fila.apunta_a ?? 'concepto'}); la decisión va sobre la versión siguiente`)
  const autor = texto(cuerpo.autor) ?? 'emilio'
  const nota = texto(cuerpo.nota)
  // falla 1 (GO de Lenovo 10-nov 14:37Z): desde el tablero, la plataforma manda ella misma el sobre a la sala con la clave del vigía de este medio día
  const tramoDelTablero = cuerpo.workflow_id === WORKFLOW_DEL_TABLERO ? tramoDeReemision(ahora) : undefined
  if (decision === 'aprobar') {
    if (fila.aprobacion === 'aprobado') return { status: 200, cuerpo: { ya_decidido: true, decision: 'aprobar', version } }
    await al.actualizarConcepto(campana.id, version, { aprobacion: 'aprobado', decidido_en: ahora, nota_de_emilio: nota ?? fila.nota_de_emilio, apunta_a: null })
    await resolverEsperas(al, campana.id, TIPO_DE_ESPERA_DE_CONCEPTO, objetoDeEsperaDeConcepto(version))
    if (fila.hitl_id) await al.cerrarTarjetaDeConcepto(fila.hitl_id, { status: 'approved', decision: { accion: 'aprobar', nota, version } })
    if (fila.hitl_id) await al.registrarDecisionDeEmilio({ hitl_id: fila.hitl_id, accion: 'aprobar', comentario: nota, autor, ahora })
    const re = await siguienteDespuesDe(al, campana.id, tramoDelTablero)
    return { status: 200, cuerpo: { decision: 'aprobar', version, concepto_id: idDeConcepto(campana.id, version), ...re, ...(await empujarDesdeElTablero(al, tramoDelTablero, re)) } }
  }
  const apuntaA = cuerpo.apunta_a === 'brief' ? 'brief' : cuerpo.apunta_a === 'concepto' ? 'concepto' : null
  if (!apuntaA) return err(400, 'E-APUNTA-A', 'cambios necesita apunta_a: «concepto» (otra ronda de la mesa) o «brief» (brief nuevo y concepto sobre él)')
  if (!nota) return err(400, 'E-NOTA', 'cambios necesita una nota: qué cambiar (va al marco de la mesa)')
  const vueltas = cuentaDe(todos, (x) => x.aprobacion === 'cambios')
  if (vueltas >= CAP_DE_VUELTAS_DE_CAMBIOS) {
    const r = await ponerNecesitaHumano(al, campana, `Emilio pidió cambios por tercera vez sobre la gran idea (cap ${CAP_DE_VUELTAS_DE_CAMBIOS}); se decide a mano`, ahora)
    return { status: 409, cuerpo: { error: 'vueltas_agotadas', necesita_humano: true, alerta: r.alerta } }
  }
  // cambios sobre un concepto YA aprobado también valen (cambio de rumbo a mitad de campaña · nota 3 de CC3): las filas ya ordenadas conservan su idea_ref
  await al.actualizarConcepto(campana.id, version, { aprobacion: 'cambios', apunta_a: apuntaA, nota_de_emilio: nota, decidido_en: ahora })
  await resolverEsperas(al, campana.id, TIPO_DE_ESPERA_DE_CONCEPTO, objetoDeEsperaDeConcepto(version))
  if (fila.hitl_id) await al.cerrarTarjetaDeConcepto(fila.hitl_id, { status: 'rejected', decision: { accion: 'pedir_cambios', apunta_a: apuntaA, nota, version } })
  if (fila.hitl_id) await al.registrarDecisionDeEmilio({ hitl_id: fila.hitl_id, accion: 'pedir_cambios', comentario: nota, autor, ahora })
  const brief = await al.ultimoBriefCreativo(campana.id)
  // cambios al brief: el brief vigente queda «devuelto por Emilio» (con su nota) para que la puerta, al volver a entrar, abra el brief nuevo y no el concepto
  if (apuntaA === 'brief' && brief && brief.estado === 'validada') await al.actualizarBriefCreativo(campana.id, brief.version, { estado: 'devuelta', devolucion_texto: nota, motivo: MOTIVO_CAMBIOS_DE_EMILIO })
  // la versión siguiente es la ÚLTIMA + 1 (no `version + 1`): cambios sobre una versión que no es la última no pueden chocar con una ya existente (reserva 3 de CC3)
  const ultimaVersion = todos.reduce((m, x) => Math.max(m, x.version), 0)
  const siguiente = apuntaA === 'brief' ? { mesa: 'brief' as const, version: (brief?.version ?? 0) + 1 } : { mesa: 'concepto' as const, version: ultimaVersion + 1 }
  const re = await siguienteDespuesDe(al, campana.id, tramoDelTablero)
  return { status: 200, cuerpo: { decision: 'cambios', version, apunta_a: apuntaA, siguiente: { ...siguiente, ...re.siguiente }, vueltas_restantes: CAP_DE_VUELTAS_DE_CAMBIOS - vueltas - 1, nota, ...(await empujarDesdeElTablero(al, tramoDelTablero, re)) } }
}

// ───────────────────────────────────────────────────────── con qué sobre vuelve a entrar la puerta (respuesta a CC2 · 31-oct)
export function sobreDeTanda(c: Pick<Campana, 'id' | 'client_id' | 'seco'>, tanda: number, etapa: string): SobreDeTanda {
  return {
    source: 'cadena/vigia', intent: 'briefear',
    payload: { modo: 'tanda_siguiente', campana_id: c.id, tanda, dry_run: c.seco, client_id: c.client_id },
    idempotency_key: `${c.id}:tanda-${tanda}:${etapa}`, logical_period: `tanda-${tanda}`, tenant_id: c.client_id, client_id: c.client_id,
  }
}
/** la tanda que espera la gran idea: la siguiente a la última hecha (1 si no hay ninguna) */
export async function tandaQueEspera(al: Almacen, campanaId: string): Promise<number> {
  const version = Math.max(1, await al.ultimaVersionDeCalendario(campanaId))
  const hechas = (await al.filas(campanaId, version)).filter((f) => f.estado !== 'esquema')
  return hechas.reduce((m, f) => Math.max(m, f.tanda), 0) + 1
}
/**
 * La ETAPA por la que la puerta tiene que volver a entrar (va en la clave de idempotencia) · null = nada que reemitir: la palanca está apagada, una mesa está trabajando,
 * Emilio está decidiendo, o la campaña ya no corre. Es la MISMA para el empuje inmediato (las entregas y la decisión) y para el respaldo del vigía (`calendario/siguiente`).
 */
export async function etapaDeReentrada(al: Almacen, campana: Pick<Campana, 'id' | 'client_id'>): Promise<string | null> {
  const m = await conceptoParaElCalendario(al, campana)
  if (!m.espera) return m.concepto ? `concepto-v${m.version}` : null
  if (m.espera.falta === 'entrega' || m.espera.falta === 'aprobacion') return null
  if (m.espera.falta === 'concepto') return `abrir-concepto-v${(m.espera.version ?? 0) + 1}`
  const brief = await al.ultimoBriefCreativo(campana.id)
  if (brief?.estado === 'borrador') return null
  return `abrir-brief-v${(brief?.version ?? 0) + 1}`
}
/**
 * Hueco 2 de CC3: la sala deduplica por clave y NO reintenta un trabajo aceptado que murió a medias (la puerta de n8n contesta 200 al recibir; lo que muera después no vuelve solo).
 * Por eso el RESPALDO del vigía lleva en la etapa un tramo de medio día (`:2026-10-31pm`): mientras la campaña siga con algo que hacer, cada pasada del vigía es un sobre NUEVO para la sala
 * (la puerta es idempotente: `ya_abierta` devuelve el mismo sobre y la oficina contesta `ya_existia`). El empuje inmediato no lleva tramo.
 */
export const tramoDeReemision = (ahora: string): string => `${ahora.slice(0, 10)}${new Date(ahora).getUTCHours() < 12 ? 'am' : 'pm'}`
/** `{ siguiente: { sobre } }` para pegar a una respuesta, o `{}` si no hay con qué volver a entrar */
export async function siguienteDespuesDe(al: Almacen, campanaId: string, tramo?: string): Promise<{ siguiente?: { sobre: SobreDeTanda } }> {
  const c = await al.campana(campanaId)
  if (!c || (c.estado !== 'calendario' && c.estado !== 'activa')) return {}
  const tanda = await tandaQueEspera(al, c.id)
  if (tanda > medidaDeCampana(c).totalTandas) return {}
  const etapa = await etapaDeReentrada(al, c)
  return etapa ? { siguiente: { sobre: sobreDeTanda(c, tanda, tramo ? `${etapa}:${tramo}` : etapa) } } : {}
}
/**
 * Falla 1 (GO de Lenovo 10-nov 14:37Z): una decisión desde el TABLERO no tiene flujo que reenvíe el sobre (el dashboard lo dejaba caer y la campaña esperaba al vigía).
 * La plataforma lo deja ella misma en la sala. La clave lleva el tramo de medio día (`tramoDeReemision`), la MISMA que armaría el vigía en su pasada: la sala deduplica y no hay trabajo doble.
 * Un fallo NO tumba la decisión (ya está guardada): se declara en `empuje` y queda el vigía de respaldo. Sin tramo (no viene del tablero) no se manda nada: el flujo reenvía como siempre.
 */
export async function empujarDesdeElTablero(al: Almacen, tramo: string | undefined, re: { siguiente?: { sobre: SobreDeTanda } }): Promise<{ empuje?: ResultadoDeEmision | { resultado: 'nada_que_mandar' } }> {
  if (!tramo) return {}
  if (!re.siguiente) return { empuje: { resultado: 'nada_que_mandar' } }
  try { return { empuje: await al.emitirSobre(re.siguiente.sobre) } } catch (e) { return { empuje: { resultado: 'rechazado', detalle: `no se pudo dejar el sobre en la sala: ${e instanceof Error ? e.message.slice(0, 160) : 'error'}` } } }
}

// ───────────────────────────────────────────────────────── lo que el CALENDARIO y el RELOJ necesitan de las mesas
export interface ConceptoParaElCalendario {
  /** la gran idea APROBADA más reciente (una versión posterior en vuelta de cambios no la quita: las tandas siguientes la toman cuando se apruebe) */
  concepto: ConceptoLeido | null
  version: number | null
  /** palanca encendida y sin gran idea aprobada: el calendario espera (qué falta) · null = puede seguir (sin palanca o con concepto) */
  espera: null | { falta: 'brief' | 'concepto' | 'entrega' | 'aprobacion'; version: number | null; estado: string | null; aprobacion: string | null }
}
/**
 * 09-nov (revalidar la gran idea): la versión que cuenta para seguir. Es la última, SALVO que la última haya quedado `sin_mesa` y una anterior esté `lista` esperando a Emilio
 * (la revalidación la recuperó): entonces cuenta esa, y la cadena espera la decisión en vez de abrir otra mesa. Una `lista` con cambios pedidos no cuenta (ya se decidió).
 */
export function conceptoVigente(todos: ConceptoGuardado[]): ConceptoGuardado | null {
  const ultimo = todos[todos.length - 1] ?? null
  if (ultimo?.estado !== 'sin_mesa') return ultimo
  return [...todos].reverse().find((c) => c.estado === 'lista' && c.aprobacion === 'pendiente') ?? ultimo
}
export async function conceptoParaElCalendario(al: Almacen, campana: Pick<Campana, 'id' | 'client_id'>): Promise<ConceptoParaElCalendario> {
  if (!(await nuevoOrdenEncendido(al, campana.client_id))) return { concepto: null, version: null, espera: null }
  const todos = await al.conceptosDe(campana.id)
  const aprobado = [...todos].reverse().find((c) => c.aprobacion === 'aprobado' && c.leido)
  if (aprobado) return { concepto: aprobado.leido as unknown as ConceptoLeido, version: aprobado.version, espera: null }
  const ultimo = conceptoVigente(todos)
  const brief = await al.ultimoBriefCreativo(campana.id)
  // con cambios pedidos por Emilio al concepto (o al brief, ya rehecho y validado) falta el concepto nuevo, no una decisión
  const falta = !brief || brief.estado !== 'validada' ? 'brief' : !ultimo || ultimo.estado === 'sin_mesa' || ultimo.estado === 'brief_devuelto' || ultimo.aprobacion === 'cambios' ? 'concepto' : ultimo.estado === 'abierta' ? 'entrega' : 'aprobacion'
  return { concepto: null, version: null, espera: { falta, version: ultimo?.version ?? null, estado: ultimo?.estado ?? null, aprobacion: ultimo?.aprobacion ?? null } }
}

/**
 * el reloj: una mesa que pasó su red de seguridad (plazo + holgura) sin entregar se cierra (brief ⇒ `descartada` · concepto ⇒ `sin_mesa`) y la campaña sigue: reabre una vez, a la segunda `necesita_humano`.
 * Devuelve una línea por mesa cerrada. (El brief gana su plazo el 31-oct por el hueco 1 de CC3: un `borrador` cuyo sobre nunca llegó a la oficina paraba la campaña para siempre.)
 */
export async function cerrarMesasVencidas(al: Almacen, ahora: string): Promise<Array<{ campana_id: string; texto: string }>> {
  const out: Array<{ campana_id: string; texto: string }> = []
  for (const b of await al.briefsVencidos(ahora)) {
    const motivo = `la mesa del brief (versión ${b.version}) no entregó antes de su plazo más la holgura (${b.plazo_en})`
    await al.actualizarBriefCreativo(b.campana_id, b.version, { estado: 'descartada', motivo })
    const campana = await al.campana(b.campana_id)
    const agotado = b.version >= MAX_VERSIONES_POR_REAPERTURA
    if (campana && agotado) await ponerNecesitaHumano(al, campana, `la mesa del brief no entregó dos veces (la última venció: ${b.plazo_en})`, ahora)
    out.push({ campana_id: b.campana_id, texto: `${motivo}: queda descartada${agotado ? ' · ya son dos: necesita_humano' : ' · se reabre una vez'}` })
  }
  for (const c of await al.conceptosVencidos(ahora)) {
    const motivo = `la mesa de concepto (versión ${c.version}) no entregó antes de su plazo más la holgura (${c.plazo_en})`
    await al.actualizarConcepto(c.campana_id, c.version, { estado: 'sin_mesa', motivo })
    const campana = await al.campana(c.campana_id)
    const sinMesa = (await al.conceptosDe(c.campana_id)).filter((x) => x.estado === 'sin_mesa').length
    if (campana && sinMesa >= MAX_VERSIONES_POR_REAPERTURA) await ponerNecesitaHumano(al, campana, `la mesa de concepto no entregó dos veces (la última venció: ${c.plazo_en})`, ahora)
    out.push({ campana_id: c.campana_id, texto: `${motivo}: queda sin_mesa${sinMesa >= MAX_VERSIONES_POR_REAPERTURA ? ' · ya son dos: necesita_humano' : ' · se reabre una vez'}` })
  }
  return out
}

export const HOLGURA_DE_PRODUCCION_DIAS = 2
/** cuántos días antes de la fecha de inicio hay que tener la gran idea: el mayor `lead_dias` de los formatos del patrón (mínimo 1) */
export function leadDiasDeLaPrimeraSemana(e: Pick<Estrategia, 'patron_semanal'>, formatos: FormatosPorRed): number {
  let lead = 1
  for (const s of e.patron_semanal) for (const f of formatos[String(s.red).toLowerCase()] ?? []) if (f.formato === s.formato && f.lead_dias > lead) lead = f.lead_dias
  return lead
}
/** UN aviso de ESTADO (el reloj lo repite solo si cambia): sin la gran idea aprobada la campaña perderá su primera semana · null si todavía hay tiempo */
export async function avisoDePrimeraSemana(al: Almacen, campana: Pick<Campana, 'id' | 'fecha_inicio'>, hoy: string): Promise<string | null> {
  const estr = await al.ultimaEstrategia(campana.id)
  const lead = estr ? leadDiasDeLaPrimeraSemana(estr.contenido, await al.formatos()) : 1
  const diasHasta = Math.floor((Date.parse(`${campana.fecha_inicio}T00:00:00Z`) - Date.parse(`${hoy.slice(0, 10)}T00:00:00Z`)) / 86_400_000)
  if (diasHasta > lead + HOLGURA_DE_PRODUCCION_DIAS) return null
  return diasHasta < 0
    ? `la campaña ya empezó (${campana.fecha_inicio}) y la gran idea sigue sin aprobarse: cada día sin decisión es un día sin piezas`
    : `sin la gran idea aprobada la campaña perderá su primera semana: las piezas del ${campana.fecha_inicio} necesitan ${lead} día(s) de producción más ${HOLGURA_DE_PRODUCCION_DIAS} de holgura y faltan ${diasHasta} día(s)`
}

// ───────────────────────────────────────────────────────── LA HOJA DE PRODUCCIÓN por código (hoja.v1) · `POST /api/cadena/hojas {accion: 'escribir'}`
const ESTADOS_QUE_NO_VAN_A_LA_HOJA = new Set(['esquema', 'cancelada', 'espera_video', 'vencida_sin_brazo', 'perdio_su_fecha', 'descartada_sin_fuente'])
/** la hoja de un lote de filas (por `fila_ids` o por `semana`): brief creativo validado + gran idea aprobada + filas con su `idea_ref` → el texto que la oficina ya lee (`parsearBrief`). No llama a nadie ni gasta. */
export async function hojaEscribir(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const c = await cargar(al, cuerpo, true)
  if (!c.ok) return c.r
  const { campana, ctx } = c.c
  const brief = await al.ultimoBriefCreativo(campana.id)
  if (!brief || brief.estado !== 'validada' || !brief.leido) return err(409, 'E-SIN-BRIEF', 'la hoja necesita el brief creativo validado')
  const mesa = await conceptoParaElCalendario(al, campana)
  if (!mesa.concepto) return err(409, 'E-SIN-CONCEPTO', 'la hoja necesita la gran idea aprobada')
  const version = Math.max(1, await al.ultimaVersionDeCalendario(campana.id))
  const todas = (await al.filas(campana.id, version)).filter((f) => !ESTADOS_QUE_NO_VAN_A_LA_HOJA.has(f.estado))
  const ids = Array.isArray(cuerpo.fila_ids) ? new Set(cuerpo.fila_ids.map(String)) : null
  const semana = Number.isInteger(cuerpo.semana) ? (cuerpo.semana as number) : null
  if (!ids && semana === null) return err(400, 'E-CAMPOS', 'la hoja se escribe por fila_ids (lista) o por semana (entero)')
  const filas = todas.filter((f) => (ids ? ids.has(f.id) : f.semana === semana))
  if (!filas.length) return err(409, 'E-SIN-FILAS', 'ninguna fila del calendario coincide (o todas están en un estado que no va a la hoja)')
  const manual = ctx.referencias.find((r) => r.origen === 'manual')
  const hoja = escribirHoja({
    client_name: ctx.nombreDelNegocio, plan_id: campana.plan_id, manual_id: manual?.id.replace(/^manual:/, '') ?? 'sin-manual', manual_version: cadena(cuerpo.manual_version) ?? 'vigente',
    hoy: ahora.slice(0, 10), lote_key: cadena(cuerpo.lote_key) ?? (ids ? `${campana.id.slice(0, 8)}:v${version}:ids` : `${campana.id.slice(0, 8)}:v${version}:s${semana}`),
    brief: brief.leido as unknown as BriefCreativoLeido, brief_id: idDeBrief(campana.id, brief.version), concepto: mesa.concepto, concepto_id: idDeConcepto(campana.id, mesa.version ?? 1),
    filas: filas.map((f) => ({ id: f.id, fecha: f.fecha, hora: f.hora, red: f.red, formato: f.formato, pilar: f.pilar, tema: f.tema, datos: f.datos, fase: f.fase ?? null, idea_ref: f.idea_ref ?? null })),
    formatos: await al.formatos(), seco: campana.seco,
  })
  return { status: 200, cuerpo: { hoja: hoja.texto_md, briefs: hoja.briefs, provenance: hoja.provenance, avisos: hoja.avisos, filas: filas.map((f) => f.id), brief_version: brief.version, concepto_version: mesa.version } }
}

// ───────────────────────────────────────────────────────── las entregas por HTTP (el flujo de la oficina también puede entregar por aquí) y el puerto en proceso
function leerEntrega(cuerpo: Record<string, unknown>): { ok: true; p: EntregaDeConcepto } | { ok: false; r: Respuesta } {
  const campana_id = cadena(cuerpo.campana_id)
  if (!campana_id) return { ok: false, r: err(400, 'E-CAMPOS', 'falta campana_id') }
  if (!Number.isInteger(cuerpo.version) || (cuerpo.version as number) < 1) return { ok: false, r: err(400, 'E-CAMPOS', 'version debe ser un entero positivo') }
  return { ok: true, p: { campana_id, version: cuerpo.version as number, encargo_id: cadena(cuerpo.encargo_id) ?? '', texto: texto(cuerpo.texto), costo_usd: typeof cuerpo.costo_usd === 'number' && cuerpo.costo_usd >= 0 ? cuerpo.costo_usd : 0, motivo: texto(cuerpo.motivo), brief_devuelto: texto(cuerpo.brief_devuelto) } }
}
export async function briefEntregar(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const e = leerEntrega(cuerpo)
  if (!e.ok) return e.r
  const campana = await al.campana(e.p.campana_id)
  if (!campana) return err(404, 'E-CAMPANA', 'campaña inexistente')
  const noAut = await autorizarLlamada(al, cuerpo, campana.client_id)
  if (noAut) return noAut
  const r = await recibirBrief(al, e.p, ahora)
  return { status: r.ok ? 200 : 409, cuerpo: { ...r } }
}
export async function conceptoEntregar(al: Almacen, cuerpo: Record<string, unknown>, ahora: string): Promise<Respuesta> {
  const e = leerEntrega(cuerpo)
  if (!e.ok) return e.r
  const campana = await al.campana(e.p.campana_id)
  if (!campana) return err(404, 'E-CAMPANA', 'campaña inexistente')
  const noAut = await autorizarLlamada(al, cuerpo, campana.client_id)
  if (noAut) return noAut
  const r = await recibirConcepto(al, e.p, ahora)
  return { status: r.ok ? 200 : 409, cuerpo: { ...r } }
}

/** el puerto que la OFICINA recibe en su entorno (`Entorno.puertoDeLaCadena`, CC2): en proceso, sin HTTP; nunca lanza.
 *  El almacén puede venir como fábrica DIFERIDA (se crea en la primera entrega): armar el entorno de la oficina no debe abrir la base. */
export function puertoDeLaCadena(al: Almacen | (() => Almacen), reloj: () => string = () => new Date().toISOString()): { entregarBrief(p: EntregaDeBrief): Promise<EntregaALaCadena>; entregarConcepto(p: EntregaDeConcepto): Promise<EntregaALaCadena>; entregarReubicacion(p: EntregaDeReubicacion): Promise<EntregaALaCadena> } {
  let instancia: Almacen | null = typeof al === 'function' ? null : al
  const almacen = (): Almacen => (instancia ??= (al as () => Almacen)())
  const seguro = async (f: (a: Almacen) => Promise<EntregaALaCadena>): Promise<EntregaALaCadena> => { try { return await f(almacen()) } catch (e) { return { ok: false, error: (e instanceof Error ? e.message : String(e)).slice(0, 300) } } }
  return {
    entregarBrief: (p) => seguro((a) => recibirBrief(a, p, reloj())),
    entregarConcepto: (p) => seguro((a) => recibirConcepto(a, p, reloj())),
    // 10-nov · la mesa de reubicación (filas que quedaron atrás): la cadena verifica la decisión por código antes de aplicarla
    entregarReubicacion: (p) => seguro((a) => recibirReubicacion(a, p, reloj())),
  }
}
