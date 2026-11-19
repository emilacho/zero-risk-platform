/**
 * EL PASO `jefatura` DE LA OFICINA (J8a · diseño v4 §11.1 y §13.2) · puro: sin red ni base.
 * Reemplaza, en las tres plantillas de pieza, al jefe (`revision_jefe`), a las correcciones (`corrige*`, `ajusta_laminas*`), al revisor externo (`revisor_externo`) y a las decisiones (`decide*`, `decide_imagen`):
 * la oficina entrega la pieza ya chequeada por código a UNA revisión de la jefatura (tipo `pieza`) y, cuando la revisión cierra, aplica lo que volvió.
 *  · `sobreDeLaRevision` arma lo que se le manda (la entrada de `POST /api/jefatura/revisiones`, sin `devolver_a`, que lo pone el adaptador);
 *  · `aplicarSalidaDeJefatura` traduce la salida de la revisión al estado del encargo con el MISMO vocabulario de siempre (fichas `jefe` que bloquean y siguen sin tomarse ⇒ desacuerdo, opinión `externa` como OPINIÓN,
 *    `fichas_externas.sin_revision` ⇒ «sin segunda mirada», `respuesta_imagen` ⇒ la re-imagen que la oficina ya sabe hacer), así `cerrar`, la bandeja y las plantillas de después no cambian;
 *  · una revisión `fallida` o `incompleta_por_tope`, o que no pudo abrirse, NUNCA pierde la pieza: sigue a la bandeja marcada «revisión incompleta» / «sin revisar».
 */
import type { PayloadDeRevision, Productor, SalidaDeRevision } from '../jefatura/revision/contrato'
import { datos, fichaNueva } from './ayudas'
import { claseDe } from './clase'
import { quedaDesacuerdoDeHechos } from './hechos-del-negocio'
import { esDura, hallazgosDelJefe, leerRespuestas, marcaDeVuelta, pedidoDeRespuesta, repartir, type Destino, type Devolucion, type Enviada, type FichaDeLaHoja, type Hallazgo, type RespuestaDelCreador } from './sentido-contra-la-ficha'
import type { ContextoDelRevisor } from './ciego'
import type { Encargo } from './puertos'
import type { ResultadoDePaso } from './motor'
import type { Estado, Ficha, Plantilla } from './tipos'

/** la clave del paso en las plantillas, y el artefacto que deja (el que ya leían `cerrar` y la re-imagen) */
export const CLAVE_DEL_PASO_JEFATURA = 'jefatura'
export const ARTEFACTO_DE_LA_JEFATURA = 'respuesta_imagen'
export type FamiliaDePieza = 'post_img' | 'carrusel' | 'kit' | 'video'

/** fila #19 · la clase la declara la plantilla (nunca el nombre de la familia); una plantilla sin clase no llega aquí: la puerta no la abre */
export const familiaDePieza = (pl: Pick<Plantilla, 'clase'>): FamiliaDePieza => { const c = claseDe(pl); return c === 'carrusel' || c === 'kit' || c === 'video' ? c : 'post_img' }

/**
 * Quién corrige cada parte de la pieza (reparo 2 de CC#3: la fila `pieza` de la política solo declara texto e imagen; el carrusel y el kit llevan además a quien dibuja o estructura).
 * 🔴 Límite honesto (J2): la jefatura todavía solo ENTREGA texto corregido (`resolucion.v1`): quien dibuja las láminas o estructura el kit RESPONDE a sus hallazgos (tomada / no tomada, con razón) pero la jefatura no
 * recibe láminas ni estructura nuevas. Lo que esa respuesta cambie se aplica a mano desde la bandeja. Ver el informe: «pregunta para Emilio».
 */
export function productoresDeLaPieza(familia: FamiliaDePieza): Productor[] {
  const base: Productor[] = [{ donde: 'texto', agente: 'content-creator' }, { donde: 'hashtags', agente: 'content-creator' }, { donde: 'imagen', agente: 'marketing_instagram_curator' }]
  if (familia === 'carrusel') return [...base, { donde: 'laminas', agente: 'carousel-designer' }]
  if (familia === 'kit') return [...base, { donde: 'estructura', agente: 'design-visual-storyteller' }]
  // el video (parte 2 · 31-oct): no hay imagen que curar (el brazo filma); el guion lo escribe el guionista de la mesa; el video en sí no se corrige (se rehace o no: decide una persona)
  if (familia === 'video') return [{ donde: 'texto', agente: 'content-creator' }, { donde: 'hashtags', agente: 'content-creator' }, { donde: 'guion', agente: 'video-editor' }]
  return base
}

/** lo que el encargo sabe de sí para la revisión: la pieza, sus imágenes y los documentos (los mismos que veía el revisor externo) */
export interface MaterialDeLaRevision { pieza: string; imagenes: string[]; contexto: ContextoDelRevisor[] }

export interface SobreDeRevisionDePieza {
  artifact_type: 'pieza'
  artifact_id: string
  client_id: string
  journey_id: string | null
  payload: Omit<PayloadDeRevision, 'devolver_a'>
}

/** las marcas de los chequeos duros que siguen abiertas: viajan como DATO (regla 10), no entran en el pedido de nadie */
const marcasHeredadas = (e: Estado): string[] => e.fichas.filter((f) => f.origen === 'chequeo' && f.estado === 'abierta').map((f) => `${f.donde}: ${f.que ?? ''}`.trim())

export function sobreDeLaRevision(enc: Pick<Encargo, 'id' | 'client_id' | 'familia' | 'tope_usd' | 'dry_run' | 'sala_ref'>, pl: Pick<Plantilla, 'familia' | 'clase'> & Partial<Pick<Plantilla, 'limites'>>, e: Estado, m: MaterialDeLaRevision): SobreDeRevisionDePieza {
  const familia = familiaDePieza(pl)
  const heredadas = marcasHeredadas(e)
  const journey = enc.sala_ref && typeof enc.sala_ref._journey_id === 'string' && enc.sala_ref._journey_id ? enc.sala_ref._journey_id : null
  const nombreDeLaPieza = familia === 'carrusel' ? 'copy_carrusel' : familia === 'kit' ? 'copy_kit' : familia === 'video' ? 'copy_video' : 'pieza_post'
  return {
    artifact_type: 'pieza',
    artifact_id: enc.id,
    client_id: enc.client_id,
    journey_id: journey,
    payload: {
      texto: m.pieza,
      ...(m.imagenes.length ? { imagenes: m.imagenes } : {}),
      productores: productoresDeLaPieza(familia),
      familia,
      chequeos_previos: { pasaron: heredadas.length === 0, necesita_humano: false, marcas: heredadas },
      marcas_heredadas: heredadas,
      contexto: m.contexto,
      // lo que le queda al encargo: la jefatura nunca gasta más de lo que el encargo todavía tiene
      // 19-nov · G5b · 🔴 de CC7: lo que le queda a ESTA pieza (el tope de `plantillaDe`: min(su duración, el encargo)), no al sobre de la campaña
      tope_restante_usd: Math.max(0, +(Math.min(enc.tope_usd, pl.limites?.tope_encargo_usd ?? enc.tope_usd) - e.gasto_usd).toFixed(6)),
      dry_run: enc.dry_run,
      version: e.artefactos[nombreDeLaPieza]?.version ?? 1,
      generado_por_jefatura: null,
    },
  }
}

// ───────────────────────── lo que se hace con lo que vuelve
/** el costo que dice la jefatura entra al libro solo si es un número finito ≥ 0; NaN, Infinity, negativos, texto o ausente → 0 (nunca se propaga un valor que envenene la suma de la pieza) */
export const costoDeLaJefatura = (c: unknown): number => (typeof c === 'number' && Number.isFinite(c) && c >= 0 ? c : 0)
/** ¿vino un costo y no sirve? (para declararlo en vez de callarlo) */
export const costoInvalido = (c: unknown): boolean => c !== undefined && c !== null && costoDeLaJefatura(c) === 0 && !(typeof c === 'number' && c === 0)

export interface DatosDeLaJefatura {
  revision_id: string | null
  resultado: string
  marcas: { con_desacuerdo: boolean; sin_segunda_mirada: boolean }
  desacuerdos: string[]
  respuestas: SalidaDeRevision['respuestas']
  costo_usd: number
  simulado: boolean
  /** `fallida` o `incompleta_por_tope`: la pieza sigue a la bandeja marcada «revisión incompleta» */
  incompleta: boolean
  /** la revisión no pudo abrirse (apagada, tipo no activo, sin presupuesto, error): la pieza sigue a la bandeja marcada «sin revisar» */
  sin_revisar: boolean
  motivo?: string
  /** frases que el dueño negó y siguen en la pieza: viajan a la bandeja como aviso */
  avisos?: string[]
  /** la jefatura mandó un costo que no es un número finito ≥ 0: se contó 0 y queda dicho aquí */
  costo_invalido?: true
  /** cambio 4 · el sentido contra la ficha (solo si la hoja trae ficha o, desde #1147, un cierre vivo de la oferta: D1 no depende de la foto; sin ninguno no aparece y nada cambia) */
  sentido?: DatosDelSentido
}
/** cambio 4 · lo que se guarda del sentido (firma de Emilio 17-nov 20:34: el regreso es automático y responde el creador de cada paso; sin persona en el medio) */
export interface DatosDelSentido {
  /** 18-nov · #1147 · `sin_ficha` solo cuando la hoja (o el cerebro de hoy) trae el cierre: entonces lo único que se mide es D1 */
  ficha: 'con_ficha' | 'sin_ficha'
  declarado: string[]
  /** hallazgos del código (exactos) y del jefe (sentido, con su cita verificada) */
  hallazgos: Hallazgo[]
  devoluciones: Devolucion[]
  /** correcciones que volvieron a la mesa (al creador de la pieza), con su número para que las responda */
  enviadas: Enviada[]
  /** ya se había devuelto (o el creador ya respondió): la jefatura NO reabre; queda registrado aquí y la pieza sigue */
  no_reabre: Hallazgo[]
  /** regla dura cuyo destino ya se devolvió y sigue rota: sin devolución nueva, pero sigue frenando la pieza (CC7 🟡 1) */
  duras_pendientes?: Hallazgo[]
  /** RESPUESTA-LENOVO 17-nov punto 3 · regla dura que SIGUE ROTA tras la vuelta (el creador no la tomó, o no respondió): la pieza NO se publica y sale UNA alarma (sin «una persona decide») */
  duras_no_tomadas?: Hallazgo[]
  /** lo que respondió el creador de la pieza a las correcciones de la vuelta anterior (solo en la revisión que sigue a esa vuelta) */
  respuestas_del_creador?: RespuestaDelCreador[]
  vuelve_a: Destino[]
  cita_no_verificada: boolean
}

export const datosDeLaJefatura = (e: Estado): DatosDeLaJefatura | null => (datos(e, ARTEFACTO_DE_LA_JEFATURA)?.jefatura as DatosDeLaJefatura | undefined) ?? null

/** una línea «donde: qué (…)» → { donde, que } (es el rótulo que arma la jefatura para cada desacuerdo) */
function partirDesacuerdo(linea: string): { donde: string; que: string } {
  const i = linea.indexOf(':')
  return i > 0 && i < 24 ? { donde: linea.slice(0, i).trim(), que: linea.slice(i + 1).trim() } : { donde: 'texto', que: linea.trim() }
}

export interface OpcionesDeAplicacion {
  /** la re-imagen que ya sabe hacer la oficina (post: `decidirReImagen`; láminas: `decisionDeReImagenL`); recibe si el que dirige la imagen tomó la opinión */
  reImagen: (tomada: { razon: string } | null) => Record<string, unknown>
  /**
   * 17-nov · GO Lenovo (d) · ¿puede la pieza VOLVER a la mesa con los desacuerdos? (el paso tiene `vuelve_a` a la mesa, le queda la vuelta y cabe en el tope, contando lo que costó esta revisión).
   * Sin la función (plantillas sin mesa), nunca vuelve: los desacuerdos van a la bandeja como siempre.
   */
  puedeVolverALaMesa?: (costoDeEstaRevision: number) => boolean
  /**
   * cambio 4 · la ficha de la oferta que trae la hoja y lo necesario para el regreso. Sin esto (o sin ficha) la aplicación es EXACTAMENTE la de antes.
   * `yaDevueltas`: las llaves fila:destino ya devueltas (una por fila y destino; la segunda va a una persona).
   * `exactos`: las reglas duras por código (D2 · D3 firmadas por Emilio · `exactos-de-la-ficha.ts`); sin él, solo el jefe juzga el sentido.
   * `previas`: la revisión anterior mandó correcciones a la mesa y la mesa ya volvió: lo que respondió el creador (sus líneas «RESPUESTA A LA JEFATURA S<n>: …»).
   */
  sentido?: { ficha: FichaDeLaHoja; textoDeLaPieza: string; filaId: string | null; encargoId: string; yaDevueltas: ReadonlySet<string>; exactos?: (f: FichaDeLaHoja, textoDeLaPieza: string) => { hallazgos: Hallazgo[]; declarado: string[] }; previas?: { enviadas: Enviada[]; lineasDeRespuesta: string[] } | null; declarado?: string[] }
}

/** cambio 4 · las llaves ya devueltas que guarda el encargo (de una revisión anterior del mismo encargo, p. ej. tras la vuelta a la mesa) */
export const llavesYaDevueltas = (e: Estado): Set<string> => new Set((datosDeLaJefatura(e)?.sentido?.devoluciones ?? []).map((d) => d.llave))

export function aplicarSalidaDeJefatura(pl: Pick<Plantilla, 'familia' | 'clase'>, e: Estado, salida: SalidaDeRevision, o: OpcionesDeAplicacion): ResultadoDePaso {
  const familia = familiaDePieza(pl)
  const incompleta = salida.resultado === 'fallida' || salida.resultado === 'incompleta_por_tope'
  const respuestas = Array.isArray(salida.respuestas) ? salida.respuestas : []
  // 17-nov · GO Lenovo (d) · un desacuerdo que la jefatura no pudo resolver (p. ej. falta en la pieza un dato que el brief pide) vuelve UNA vez a la mesa como corrección; solo si sigue, va a la bandeja marcado
  // revisión 2 = A · la jefatura ya separa lo de criterio en `observaciones`: la oficina recibe las dos listas y las pasa por SU misma regla (`fichasAlCierre`)
  const deLaJefatura = [...(Array.isArray(salida.desacuerdos) ? salida.desacuerdos : []), ...(Array.isArray(salida.observaciones) ? salida.observaciones : [])]
  const crudas = deLaJefatura.map((d) => String(d).trim()).filter(Boolean)
  // cambio 4 · con ficha: lo exacto (código) + el sentido del jefe (cita y destino verificados) se reparten por destino. Sin ficha, `sen` es null y todo sigue como antes,
  // salvo (18-nov · #1147) que la oferta esté cerrada en la fecha de la fila: D1 se mide igual (lo del jefe pasa tal cual: sin ficha no hay cita que verificar)
  const sen = o.sentido && (o.sentido.ficha.estado === 'con_ficha' || !!o.sentido.ficha.cierre) && !incompleta ? sentidoDeLaRevision(crudas, o.sentido) : null
  const lineas = sen ? sen.lineas : crudas
  // lo que vuelve a un paso de la cadena NO se arregla rehaciendo la pieza: no hay vuelta a la mesa. Tras una vuelta con correcciones de sentido, la jefatura no reabre
  const haciaAtras = !!sen && (sen.datos.devoluciones.length > 0 || (sen.datos.duras_pendientes?.length ?? 0) > 0 || sen.tras_la_vuelta)
  const vuelve = lineas.length > 0 && !haciaAtras && o.puedeVolverALaMesa?.(costoDeLaJefatura(salida.costo_usd)) === true
  // fichas de FONDO que siguen sin tomarse: el mismo desacuerdo de siempre (jefe · bloquea · sin tomar); `cerrar` ya sabe contarlas
  //   (si la pieza vuelve a la mesa, el desacuerdo viaja como corrección y NO queda como ficha: la revisión de la vuelta decide)
  const fichas: Ficha[] = (vuelve ? [] : sen ? lineas : deLaJefatura).map((d, i) => {
    const p = partirDesacuerdo(String(d))
    return { ...fichaNueva(`jefe-${e.pasos_ejecutados}-${i}`, 'jefe', p.donde, 'bloquea', p.que, 'revisión de la jefatura', 'observación de criterio: su creador ya la tuvo en su vuelta; queda declarada y la pieza sigue'), estado: 'no_tomada' as const, razon: 'la jefatura cerró sin que se tomara' }
  })
  // cambio 4 · firma de Emilio · cada regreso a la cadena vuelve SOLO a su creador (automático): la pieza no se publica mientras esa corrección no tenga respuesta (ficha que bloquea).
  //   La corrección que el creador de la pieza dejó sin responder NO bloquea (DECISION-EMILIO reglas duras: nada fuera de la lista bloquea): queda «no dicha», declarada y marcada en la bandeja;
  //   nunca se da por tomada. Lo que no reabre queda registrado en `sentido.no_reabre`, sin ficha.
  if (sen) {
    sen.datos.devoluciones.forEach((d, i) => fichas.push({ ...fichaNueva(`sentido-${e.pasos_ejecutados}-${i}`, 'jefe', d.destino, 'bloquea', `sentido · ${d.destino}: ${d.motivo}`, d.linea_de_la_ficha ? `ficha de la oferta: «${d.linea_de_la_ficha}»` : 'ficha de la oferta', d.dura ? `vuelve a ${d.destino}: regla dura, su creador la toma sí o sí` : `vuelve a ${d.destino}: su creador la toma, la toma en parte o no la toma, y dice por qué`), ...(d.dura ? { dura: true as const } : {}), estado: 'no_tomada' as const, razon: `devuelto a ${d.destino}` }))
    ;(sen.datos.duras_pendientes ?? []).forEach((h, i) => fichas.push({ ...fichaNueva(`sentido-dura-${e.pasos_ejecutados}-${i}`, 'jefe', h.destino, 'bloquea', `sentido · ${h.destino}: ${h.que}`, h.linea_de_la_ficha ? `ficha de la oferta: «${h.linea_de_la_ficha}»` : 'ficha de la oferta', `regla dura ya devuelta a ${h.destino} y sigue sin corregirse: no se publica hasta que su creador la corrija`), dura: true as const, estado: 'no_tomada' as const, razon: `regla dura ya devuelta a ${h.destino}` }))
    ;(sen.datos.duras_no_tomadas ?? []).filter((h) => h.destino === 'pieza' || !o.sentido?.filaId).forEach((h, i) => fichas.push({ ...fichaNueva(`sentido-no-tomada-${e.pasos_ejecutados}-${i}`, 'jefe', 'pieza', 'bloquea', `sentido · pieza: ${h.que}`, h.linea_de_la_ficha ? `ficha de la oferta: «${h.linea_de_la_ficha}»` : 'ficha de la oferta', REGLA_DURA_NO_TOMADA), dura: true as const, estado: 'no_tomada' as const, razon: 'regla dura no tomada tras la vuelta' }))
  }
  // la opinión libre de GPT llega como OPINIÓN (una ficha `externa` por dueño, nunca bloquea ni cuenta como desacuerdo), con lo que cada dueño decidió
  const externas = respuestas.filter((r) => r.origen === 'externa').sort((a, b) => (a.donde === 'texto' ? -1 : b.donde === 'texto' ? 1 : 0))
  const opinion = salida.opinion_externa
  externas.forEach((r, i) => fichas.push({ ...fichaNueva(i === 0 ? `ext-opinion-${e.pasos_ejecutados}` : `ext-opinion-${e.pasos_ejecutados}-${r.donde}`, 'externa', r.donde, 'sugerencia', opinion?.texto ?? '', 'opinión libre del revisor externo (sin criterios ni reglas)', 'quien hizo la parte decide qué toma y qué no'), estado: r.estado === 'tomada' || r.estado === 'no_tomada' ? r.estado : 'no_tomada', ...(r.razon ? { razon: r.razon } : {}) }))
  const tomadaImagen = respuestas.find((r) => r.origen === 'externa' && r.donde === 'imagen' && r.estado === 'tomada')
  // la pieza que vuelve a la mesa se rehace entera (la mesa traduce otra vez): no se pide además una re-imagen
  const rehacer = salida.imagen_por_rehacer === true && !incompleta && !vuelve
  const reimagen = rehacer ? o.reImagen({ razon: tomadaImagen?.razon ?? 'quien dirige la imagen tomó la opinión' }) : { re_imagen: false, por_rehacer_humano: false, motivo: null, razon: null }
  const jefatura: DatosDeLaJefatura = {
    revision_id: salida.revision_id ?? null, resultado: salida.resultado, marcas: salida.marcas ?? { con_desacuerdo: false, sin_segunda_mirada: false }, desacuerdos: salida.desacuerdos ?? [], respuestas,
    costo_usd: costoDeLaJefatura(salida.costo_usd), simulado: salida.simulado === true, incompleta, sin_revisar: false,
    ...(costoInvalido(salida.costo_usd) ? { costo_invalido: true as const } : {}),
    ...(salida.avisos?.length ? { avisos: salida.avisos } : {}),
    ...(sen ? { sentido: sen.datos } : {}),
  }
  const otros: Record<string, Record<string, unknown>> = {}
  // el texto corregido (solo si la revisión no falló): la oficina lo recibe como una versión nueva de la pieza y vuelve a chequear por código (chequeos_2/3)
  const pieza = (salida.artefacto_final as { pieza?: Record<string, unknown> } | undefined)?.pieza
  if (pieza && typeof pieza === 'object' && salida.resultado !== 'fallida') {
    if (familia === 'post_img') otros['pieza_post'] = { ...(datos(e, 'pieza_post') ?? {}), ...pieza }
    else if (familia === 'carrusel' || familia === 'video') {
      const nombre = familia === 'carrusel' ? 'copy_carrusel' : 'copy_video'
      const solo: Record<string, unknown> = {}
      for (const k of ['pie_de_foto', 'hashtags', 'llamado']) if (pieza[k] !== undefined) solo[k] = pieza[k]
      if (Object.keys(solo).length) otros[nombre] = { ...(datos(e, nombre) ?? {}), ...solo }
    }
  }
  if (salida.marcas?.sin_segunda_mirada) otros['fichas_externas'] = { sin_revision: true, motivo: 'el revisor externo no respondió tras los reintentos' }
  else if (opinion?.texto) otros['fichas_externas'] = { opinion: opinion.texto, modelo: opinion.modelo ?? null }
  // 💰 el gasto de la revisión SUMA al del encargo (R1 de CC#3): la oficina le pasó `tope − gasto` a la jefatura y los pasos que siguen (la re-imagen) deben ver lo que queda de verdad.
  // Solo suma al estado del encargo: NO se escribe otra fila en el libro (`oficina_gastos` no la lleva; el libro central `agent_invocations` ya la tiene).
  const aLaMesa = vuelve ? { vuelve_a_la_mesa: true, aviso_a_la_mesa: [avisoDeLaJefaturaALaMesa(lineas), ...(sen ? pedidoDeRespuesta(sen.datos.enviadas) : [])].join('\n') } : {}
  return { costo_usd: jefatura.costo_usd, artefacto: { ...reimagen, jefatura, ...aLaMesa }, ...(fichas.length ? { fichas } : {}), ...(Object.keys(otros).length ? { otros_artefactos: otros } : {}) }
}

/**
 * cambio 4 · reparte: lo exacto del código + lo que el jefe rotuló «sentido · <destino>» (verificado). Las demás líneas del jefe siguen como siempre;
 * los hallazgos que vuelven a la pieza se suman como líneas (van a la mesa o quedan como desacuerdo); los de la cadena quedan como devoluciones.
 */
/** RESPUESTA-LENOVO 17-nov punto 3 · lo que dice la ficha de una regla dura no tomada: la pieza no se publica (nunca «una persona decide») */
export const REGLA_DURA_NO_TOMADA = 'regla dura no tomada tras la vuelta: la pieza no se publica (firma de Emilio: se toma sí o sí)'

/** RESPUESTA-LENOVO 17-nov punto 3 · las reglas duras que siguen rotas tras la vuelta: si hay alguna, la pieza se FRENA en el cierre (ni salida ni bandeja) con UNA alarma */
export function reglasDurasNoTomadas(e: Estado): Hallazgo[] {
  return datosDeLaJefatura(e)?.sentido?.duras_no_tomadas ?? []
}

function sentidoDeLaRevision(crudas: string[], s: NonNullable<OpcionesDeAplicacion['sentido']>): { lineas: string[]; datos: DatosDelSentido; tras_la_vuelta: boolean } {
  const ex = s.exactos ? s.exactos(s.ficha, s.textoDeLaPieza) : { hallazgos: [], declarado: [] }
  const jefe = hallazgosDelJefe(crudas, s.ficha)
  const hallazgos = [...ex.hallazgos, ...jefe.hallazgos]
  const tras = !!s.previas && s.previas.enviadas.length > 0
  // tras la vuelta (el creador ya respondió): la regla dura se vuelve a medir y, si sigue, queda como desacuerdo; lo de criterio para la pieza NO reabre (queda registrado y sigue)
  const aPieza = (h: Hallazgo) => h.destino === 'pieza' || !s.filaId
  // RESPUESTA-LENOVO punto 3 · la regla dura que sigue rota tras la vuelta NO vuelve a ser corrección ni desacuerdo «de persona»: frena la pieza (la mide el código, no la respuesta)
  const durasPiezaQueSiguen = tras ? hallazgos.filter((h) => aPieza(h) && esDura(h)) : []
  const sigue = tras ? hallazgos.filter((h) => !aPieza(h)) : hallazgos
  const noReabrePieza = tras ? hallazgos.filter((h) => aPieza(h) && !esDura(h)) : []
  const r = repartir(sigue, s.filaId, s.encargoId, s.yaDevueltas)
  const respuestas = tras ? leerRespuestas(s.previas!.enviadas, s.previas!.lineasDeRespuesta) : null
  const datos: DatosDelSentido = { ficha: s.ficha.estado, declarado: [...(s.declarado ?? []), ...ex.declarado], hallazgos, devoluciones: r.devoluciones, enviadas: tras ? [] : r.enviadas, no_reabre: [...noReabrePieza, ...r.no_reabre], ...(r.duras_pendientes.length ? { duras_pendientes: r.duras_pendientes } : {}), ...(tras && (durasPiezaQueSiguen.length || r.duras_pendientes.length) ? { duras_no_tomadas: [...durasPiezaQueSiguen, ...r.duras_pendientes] } : {}), ...(respuestas ? { respuestas_del_creador: respuestas } : {}), vuelve_a: r.vuelve_a, cita_no_verificada: r.cita_no_verificada }
  return { lineas: [...jefe.resto, ...r.a_la_mesa], datos, tras_la_vuelta: tras }
}

/** 17-nov · GO Lenovo (d) · lo que la mesa recibe cuando la pieza vuelve: los desacuerdos de la jefatura como corrección (la dirección integra y la mesa traduce otra vez). Puro */
export function avisoDeLaJefaturaALaMesa(desacuerdos: string[]): string {
  return [
    'La jefatura revisó la pieza y quedaron estos desacuerdos sin resolver. Corrígelos en la pieza (si falta un dato que el brief pide, inclúyelo; si no lo tienes, dilo en la pieza y no lo inventes):',
    ...desacuerdos.slice(0, 8).map((d) => `- ${d.slice(0, 400)}`),
    'Es la única vuelta: después, la pieza va a la bandeja con lo que quede marcado.',
  ].join('\n')
}

/** la revisión no pudo abrirse o nunca contestó: la pieza sigue, sin fichas nuevas, marcada «sin revisar» (nunca se pierde y nunca se hace pasar por revisada) */
export function aplicarSinRevisar(motivo: string): ResultadoDePaso {
  const jefatura: DatosDeLaJefatura = { revision_id: null, resultado: 'sin_revisar', marcas: { con_desacuerdo: false, sin_segunda_mirada: false }, desacuerdos: [], respuestas: [], costo_usd: 0, simulado: false, incompleta: false, sin_revisar: true, motivo }
  return { costo_usd: 0, artefacto: { re_imagen: false, por_rehacer_humano: false, motivo: null, razon: null, jefatura } }
}

// ───────────────────────── la marca en la bandeja
export function prefijoDeLaBandeja(e: Estado): string {
  const j = datosDeLaJefatura(e)
  if (!j) return ''
  return (j.incompleta ? '⚠️ REVISIÓN INCOMPLETA · ' : '') + (j.sin_revisar ? '⚠️ SIN REVISAR · ' : '') + (quedaDesacuerdoDeHechos(e.fichas) ? '⚠️ DESACUERDO DE HECHOS · ' : '') + marcaDeVuelta(j.sentido?.vuelve_a ?? []) + (j.sentido?.cita_no_verificada ? '⚠️ CITA NO VERIFICADA · ' : '') + ((j.sentido?.respuestas_del_creador ?? []).some((r) => r.respuesta === 'no_dicha') ? '⚠️ CORRECCIÓN SIN RESPUESTA · ' : '')
}
export function metadataDeLaJefatura(e: Estado): Record<string, unknown> {
  const j = datosDeLaJefatura(e)
  if (!j) return {}
  return { jefatura_resultado: j.resultado, ...(j.revision_id ? { jefatura_revision_id: j.revision_id } : {}), ...(j.incompleta ? { revision_incompleta: true } : {}), ...(j.sin_revisar ? { sin_revisar: true, motivo_sin_revisar: j.motivo ?? null } : {}), ...(j.avisos?.length ? { avisos_de_jefatura: j.avisos } : {}) }
}
/** ¿la jefatura dejó la pieza con marca de revisión incompleta o sin revisar? (cuenta como desacuerdo: una persona la mira antes de aprobarla) */
export const revisionIncompleta = (e: Estado): boolean => { const j = datosDeLaJefatura(e); return !!j && (j.incompleta || j.sin_revisar) }
