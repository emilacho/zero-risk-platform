/**
 * 18-nov · LA MESA LEE EL ÍNDICE DEL CEREBRO (firma de Emilio, 16:53 Zúrich), SIN CASILLAS (corrección de Emilio 19:19 Zúrich:
 * «el modelo razona sobre documentos completos, sin casillas»). Contrato con CC-CEREBRO de 18:34Z, al pie de
 * `PROPUESTA-CC2-a-CC-CEREBRO-el-lado-de-la-mesa-indice-y-entrega.md`.
 *
 * Antes, al abrir la mesa salía UN pedido mezclado al portero y cada turno recibía, aparte, 3 o 4 trozos empujados por parecido con
 * el arranque de su tarea: siempre los mismos. Ahora:
 *  · al abrir, la mesa pide el ÍNDICE una sola vez y manda su HOJA completa (brief + plan) como texto: nada de sede, oferta ni tema;
 *  · cada turno lee la BASE COMPLETA del cliente y el índice numerado de todo lo que tiene el cerebro. La sede, la fecha y la fuente de
 *    cada cosa van como DATO: nada se filtra ni se marca «no es tuyo». El agente lee la hoja y decide qué le sirve;
 *  · el empleado pide por NÚMERO los originales completos dentro de su mismo turno (`pedir_fichas`); lo que no existe dice «no consta».
 * Nada se recorta aquí (firma de hoy, «nada se recorta»). Si la pieza se equivoca de alcance, lo atrapa la jefatura, no un filtro.
 * Puro: arma el pedido, lee las respuestas y escribe la sección. Las llamadas viven en el puerto (`PuertoDelIndice`).
 */

/** lo que la mesa guarda del índice al abrir (una vez por encargo) y reusa en cada turno */
export interface IndiceDeLaMesa {
  /** la base completa del cliente, ya escrita como texto (cada cosa con su sede, fecha y fuente como dato), tal como la entrega el cerebro */
  base: string
  /** el índice numerado de TODO el cliente, tal como lo entrega el cerebro */
  lista_texto: string
  /** la huella del índice: la entrega por número la exige para que el número apunte a la misma lista */
  huella: string
  consulta_id?: string
  /** el aviso del cerebro si lo hubo */
  aviso?: string
}

/** la pieza tal como la ve el cerebro: su encargo, su fila y su hoja COMPLETA (solo para el rastro y para que el agente razone) */
export interface PiezaParaElCerebro { encargo_id: string; fila?: unknown; hoja: string }

export interface PedidoDelIndice { cliente: string; agente: string; turno?: string; pieza: PiezaParaElCerebro }

export interface PedidoDeFichas { cliente: string; agente: string; turno?: string; pieza: PiezaParaElCerebro; numeros: number[]; huella: string }

const texto = (v: unknown): string => (typeof v === 'string' ? v : v == null ? '' : JSON.stringify(v, null, 1))
const limpio = (v: unknown): string | undefined => { const s = typeof v === 'string' ? v.trim() : typeof v === 'number' ? String(v) : ''; return s ? s : undefined }

/** la hoja completa de la pieza: el texto de su brief y el plan, enteros (sin recorte) */
export function hojaDeLaPieza(brief_texto: string | null | undefined, plan_texto: string | null | undefined): string {
  const brief = String(brief_texto ?? '').trim(), plan = String(plan_texto ?? '').trim()
  return [brief || '(sin hoja)', ...(plan ? ['', '## El plan de trabajo', plan] : [])].join('\n')
}

/** la pieza para el cerebro: encargo, fila (si la hay) y la hoja completa */
export function piezaParaElCerebro(o: { encargo_id: string; fila?: unknown; brief_texto: string | null | undefined; plan_texto: string | null | undefined }): PiezaParaElCerebro {
  return { encargo_id: o.encargo_id, ...(o.fila !== undefined && o.fila !== null ? { fila: o.fila } : {}), hoja: hojaDeLaPieza(o.brief_texto, o.plan_texto) }
}

/** el pedido del índice al abrir la mesa: sin casillas. El cerebro responde 400 si llega `sede`, `oferta`, `tema`, `canal` o `para_que` */
export function pedidoDelIndice(o: { client_id: string; agente: string; pieza: PiezaParaElCerebro }): PedidoDelIndice {
  return { cliente: o.client_id, agente: o.agente, pieza: o.pieza }
}

/** el encabezado de una cosa del cerebro: su número (o «fijo»), su ref y, como DATO, su sede, su fecha y su fuente */
function encabezado(r: Record<string, unknown>, prefijo: string): string {
  const numero = typeof r.numero === 'number' ? r.numero : null
  const partes = [numero != null ? `${prefijo} ${numero}` : 'Fijo']
  if (limpio(r.ref)) partes.push(String(limpio(r.ref)))
  partes.push(limpio(r.sede) ? `sede ${limpio(r.sede)}` : 'sin sede')
  if (limpio(r.fecha_fuente)) partes.push(`fecha ${limpio(r.fecha_fuente)}`)
  if (limpio(r.fuente)) partes.push(`fuente ${limpio(r.fuente)}`)
  if (limpio(r.marca)) partes.push(String(limpio(r.marca)))
  return `### ${partes.join(' · ')}`
}

/** la base completa como texto: cada cosa con su encabezado y su texto entero */
export function baseEnTexto(base: unknown): string {
  if (typeof base === 'string') return base
  if (!Array.isArray(base)) return ''
  return base.map((x) => {
    const r = (x && typeof x === 'object' ? x : {}) as Record<string, unknown>
    return `${encabezado(r, 'Ficha')}\n${texto(r.texto ?? r.contenido)}`
  }).join('\n\n')
}

/** la respuesta del índice → lo que guarda la mesa; null si no trae huella ni lista (no se podría pedir por número) */
export function leerIndice(body: unknown): IndiceDeLaMesa | null {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  const huella = limpio(b.huella), lista_texto = texto(b.lista_texto)
  if (!huella || !lista_texto.trim()) return null
  const base = baseEnTexto(b.base_completa ?? b.fijo)
  const aviso = limpio(b.aviso)
  return { base, lista_texto, huella, ...(limpio(b.consulta_id) ? { consulta_id: limpio(b.consulta_id) } : {}), ...(aviso ? { aviso } : {}) }
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

export interface FichaEntregada { numero: number | null; estado: string; contenido?: string; encabezado: string; aviso?: string; motivo?: string }

/**
 * La respuesta de la entrega → una ficha por número pedido. Lee la forma del contrato (`{numero, contenido, sede, fecha_fuente, fuente, estado}` y
 * `no_consta` con su motivo) y la de hoy (`material[].texto` + `numeros_invalidos`). Si la lista cambió (`huella_actual`), NADA se entregó por
 * número y todo sale «no consta». Un número pedido que no vuelve en ninguna parte sale «no consta»: el empleado nunca cree que lo recibió.
 */
export function leerEntrega(body: unknown, pedidos: number[]): FichaEntregada[] {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>
  if (limpio(b.huella_actual)) return pedidos.map((n) => ({ numero: n, estado: 'no_consta', encabezado: `### Número ${n}`, motivo: 'la lista del cerebro cambió desde que abrió la mesa: no se entregó nada por número' }))
  const filas = ([] as unknown[]).concat(Array.isArray(b.fichas) ? b.fichas : [], Array.isArray(b.material) ? b.material : [], Array.isArray(b.entregas) ? b.entregas : [])
  const out: FichaEntregada[] = []
  for (const f of filas) {
    const r = (f && typeof f === 'object' ? f : {}) as Record<string, unknown>
    const numero = typeof r.numero === 'number' ? r.numero : null
    const contenido = texto(r.contenido ?? r.texto)
    const estado = limpio(r.estado) ?? limpio(r.estado_de_lectura) ?? (contenido ? 'ok' : 'no_consta')
    out.push({ numero, estado, encabezado: encabezado(r, 'Número'), ...(contenido ? { contenido } : {}), ...(limpio(r.aviso) ? { aviso: limpio(r.aviso) } : {}), ...(limpio(r.motivo) ? { motivo: limpio(r.motivo) } : {}) })
  }
  for (const n of numerosPedidos(b.numeros_invalidos)) if (!out.some((f) => f.numero === n)) out.push({ numero: n, estado: 'no_consta', encabezado: `### Número ${n}`, motivo: 'el número no está en el índice' })
  for (const n of pedidos) if (!out.some((f) => f.numero === n)) out.push({ numero: n, estado: 'no_consta', encabezado: `### Número ${n}`, motivo: 'el cerebro no devolvió este número' })
  return out
}

/** lo que el empleado lee como resultado de `pedir_fichas`, en su mismo turno: cada original completo, o «no consta» */
export function fichasEnTexto(fichas: FichaEntregada[]): string {
  if (!fichas.length) return 'No pediste ningún número.'
  return fichas.map((f) => {
    if (f.estado === 'no_consta' || !f.contenido) return `${f.encabezado}\nNo consta${f.motivo ? `: ${f.motivo}` : ''}. No lo des por sabido.`
    return `${f.encabezado}${f.aviso ? `\n(aviso del cerebro: ${f.aviso})` : ''}\n${f.contenido}`
  }).join('\n\n')
}

/** la sección que va en la cabecera de cada turno que crea, critica o integra. Entera: sin recorte ni filtro. */
export function seccionDelCerebro(i: IndiceDeLaMesa): string {
  return [
    '## Lo que sabemos del cliente',
    'Esto es lo que el cerebro tiene de este cliente, **completo**: léelo antes de proponer y no inventes datos que no estén aquí.',
    'La sede, la fecha y la fuente de cada cosa son un dato, no un filtro: con la hoja de esta pieza en la mano, decide tú qué le sirve (un dato de otra sede puede servir, o no).',
    ...(i.aviso ? [`(aviso del cerebro: ${i.aviso})`] : []),
    '',
    '### La base del cliente',
    i.base.trim() || '(el cerebro no trajo base)',
    '',
    '### Índice de todo lo que tiene el cerebro',
    'Cada línea es una ficha con su número. Si necesitas el original completo de una ficha (un horario, una historia, un precio, una reseña), pídelo con la herramienta `pedir_fichas` y sus números: te llega en este mismo turno. Si un número no existe, te dirá «no consta».',
    i.lista_texto.trim(),
  ].join('\n')
}
