/**
 * 18-nov · LA MESA LEE EL ÍNDICE DEL CEREBRO (firma de Emilio, 16:53 Zúrich · contrato acordado con CC-CEREBRO al pie de
 * `PROPUESTA-CC2-a-CC-CEREBRO-el-lado-de-la-mesa-indice-y-entrega.md`).
 *
 * Antes, al abrir la mesa salía UN pedido mezclado al portero («fotos, hechos, reseñas…») y cada turno recibía, aparte, 3 o 4 trozos
 * empujados por parecido con el arranque de su tarea: siempre los mismos y sin mirar la sede. Ahora:
 *  · al abrir, la mesa pide el ÍNDICE una sola vez, diciendo lo suyo (sede/oferta, canal, tema, la pieza);
 *  · cada turno lee la BASE de su pieza ENTERA y el índice numerado de todo el cliente (lo de otra oferta viene marcado);
 *  · el empleado pide por NÚMERO los originales completos dentro de su mismo turno (`pedir_fichas`); lo que no existe dice «no consta».
 * Nada se recorta aquí (firma de hoy, «nada se recorta»). El código no juzga qué sirve: el empleado lee y decide.
 * Puro: arma el pedido, lee las respuestas y escribe la sección. Las llamadas viven en el puerto (`PuertoDelIndice`).
 */

/** lo que la mesa guarda del índice al abrir (una vez por encargo) y reusa en cada turno */
export interface IndiceDeLaMesa {
  /** lo fijo de la pieza, completo (hechos, manual, resumen vivo de su sede/oferta), tal como lo entrega el cerebro */
  base: string
  /** el índice numerado de TODO el cliente, con sus marcas («otra oferta: …»), tal como lo entrega el cerebro */
  lista_texto: string
  /** la huella del índice: la entrega por número la exige para que el número apunte a la misma lista */
  huella: string
  consulta_id?: string
  /** lo que la pieza dijo de sí misma al pedirlo (queda en el rastro de la mesa) */
  sede: string | null
  /** el aviso del cerebro si lo hubo (p. ej. «la pieza no dijo su sede») */
  aviso?: string
}

export interface PedidoDelIndice {
  cliente: string
  sede?: string
  oferta?: string
  canal?: string
  tema?: string
  pieza: { encargo_id: string; fila?: unknown }
  agente: string
}

export interface PedidoDeFichas {
  cliente: string
  numeros: number[]
  huella: string
  pieza: { encargo_id: string; fila?: unknown }
  turno?: string
  agente: string
  para_que?: string
}

const texto = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v, null, 1))
const limpio = (v: unknown): string | undefined => { const s = typeof v === 'string' ? v.trim() : ''; return s ? s : undefined }

/** la oferta de la hoja («sin oferta en la fila · declarado» no es una oferta) */
export function ofertaDeLaHoja(oferta: string | null | undefined): string | undefined {
  const o = limpio(oferta)
  return !o || /^sin oferta\b/i.test(o) ? undefined : o
}

/**
 * El pedido del índice al abrir la mesa. Hoy la oferta de un cliente ES su sede (`cadena/hoja.ts`, `FilaDeHoja.oferta`), así que va en los dos campos.
 * El tema es el protagonista de la hoja (sale de `fila.tema` cuando la idea no trae otro).
 */
export function pedidoDelIndice(o: { client_id: string; encargo_id: string; fila?: unknown; oferta?: string | null; canal?: string | null; tema?: string | null; agente: string }): PedidoDelIndice {
  const oferta = ofertaDeLaHoja(o.oferta)
  const canal = limpio(o.canal), tema = limpio(o.tema)
  return {
    cliente: o.client_id,
    ...(oferta ? { sede: oferta, oferta } : {}),
    ...(canal ? { canal } : {}),
    ...(tema ? { tema } : {}),
    pieza: { encargo_id: o.encargo_id, ...(o.fila !== undefined ? { fila: o.fila } : {}) },
    agente: o.agente,
  }
}

/** la respuesta del índice → lo que guarda la mesa; null si no trae huella ni lista (no se puede pedir por número) */
export function leerIndice(body: unknown, sede: string | null): IndiceDeLaMesa | null {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const huella = limpio(b.huella), lista_texto = texto(b.lista_texto)
  if (!huella || !lista_texto.trim()) return null
  const base = texto(b.base_de_la_pieza ?? b.fijo)
  const aviso = limpio(b.aviso)
  return { base, lista_texto, huella, ...(limpio(b.consulta_id) ? { consulta_id: limpio(b.consulta_id) } : {}), sede, ...(aviso ? { aviso } : {}) }
}

/** los números que pide el empleado: enteros positivos, sin repetir, en su orden */
export function numerosPedidos(v: unknown): number[] {
  const out: number[] = []
  for (const x of Array.isArray(v) ? v : []) {
    const n = typeof x === 'number' ? x : typeof x === 'string' && /^\d+$/.test(x.trim()) ? Number(x.trim()) : NaN
    if (Number.isInteger(n) && n > 0 && !out.includes(n)) out.push(n)
  }
  return out
}

export interface FichaEntregada { numero: number | null; estado: string; contenido?: string; ref?: string; marca?: string; aviso?: string; motivo?: string }

/**
 * La respuesta de la entrega → una ficha por número pedido. Lee la forma del contrato (`{numero, contenido, estado}` y `no_consta`)
 * y la de hoy (`material[].texto` + `numeros_invalidos`). Un número pedido que no vuelve en ninguna parte sale «no_consta»: el empleado
 * nunca se queda creyendo que lo recibió.
 */
export function leerEntrega(body: unknown, pedidos: number[]): FichaEntregada[] {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const filas = ([] as unknown[]).concat(Array.isArray(b.fichas) ? b.fichas : [], Array.isArray(b.material) ? b.material : [], Array.isArray(b.entregas) ? b.entregas : [])
  const out: FichaEntregada[] = []
  for (const f of filas) {
    const r = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>
    const numero = typeof r.numero === 'number' ? r.numero : null
    const contenido = texto(r.contenido ?? r.texto)
    const estado = limpio(r.estado) ?? limpio(r.estado_de_lectura) ?? (contenido ? 'ok' : 'no_consta')
    out.push({ numero, estado, ...(contenido ? { contenido } : {}), ...(limpio(r.ref) ? { ref: limpio(r.ref) } : {}), ...(limpio(r.marca) ? { marca: limpio(r.marca) } : {}), ...(limpio(r.aviso) ? { aviso: limpio(r.aviso) } : {}), ...(limpio(r.motivo) ? { motivo: limpio(r.motivo) } : {}) })
  }
  for (const n of numerosPedidos(b.numeros_invalidos)) if (!out.some((f) => f.numero === n)) out.push({ numero: n, estado: 'no_consta', motivo: 'el número no está en el índice' })
  for (const n of pedidos) if (!out.some((f) => f.numero === n)) out.push({ numero: n, estado: 'no_consta', motivo: 'el cerebro no devolvió este número' })
  return out
}

/** lo que el empleado lee como resultado de `pedir_fichas`, en su mismo turno: cada original completo, o «no consta» */
export function fichasEnTexto(fichas: FichaEntregada[]): string {
  if (!fichas.length) return 'No pediste ningún número.'
  return fichas.map((f) => {
    const cab = `### Número ${f.numero ?? '?'}${f.ref ? ` · ${f.ref}` : ''}${f.marca ? ` · ${f.marca}` : ''}`
    if (f.estado === 'no_consta' || !f.contenido) return `${cab}\nNo consta${f.motivo ? `: ${f.motivo}` : ''}. No lo des por sabido.`
    return `${cab}${f.aviso ? `\n(aviso del cerebro: ${f.aviso})` : ''}\n${f.contenido}`
  }).join('\n\n')
}

/** la sección que va en la cabecera de cada turno que crea, critica o integra. Entera: sin recorte. */
export function seccionDelCerebro(i: IndiceDeLaMesa): string {
  return [
    '## Lo que sabemos del cliente',
    'Esto es lo que el cerebro tiene de este cliente. Viene **completo**: léelo antes de proponer. No inventes datos que no estén aquí.',
    ...(i.aviso ? [`(aviso del cerebro: ${i.aviso})`] : []),
    '',
    '### La base de esta pieza',
    i.base.trim() || '(el cerebro no trajo base para esta pieza)',
    '',
    '### Índice de todo lo que tiene el cerebro',
    'Cada línea es una ficha con su número. Lo marcado «otra oferta: …» es de otra sede u oferta del cliente: no lo tomes como de esta pieza.',
    'Si necesitas el original completo de una ficha (un horario, una historia, un precio, una reseña), pídelo con la herramienta `pedir_fichas` y sus números: te llega en este mismo turno. Si un número no existe, te dirá «no consta».',
    i.lista_texto.trim(),
  ].join('\n')
}
