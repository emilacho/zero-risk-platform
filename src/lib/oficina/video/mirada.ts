/**
 * UN AGENTE MIRA EL VIDEO ANTES DE LA BANDEJA · GO Lenovo 11-nov 16:43 Zúrich (decisión de Emilio 16:41: «material premium sin ver el dinero»).
 * Antes de que un video vaya a la jefatura y a la bandeja, se sacan cuadros de cada plano del guion y un agente con visión los compara con los planos y con la fila.
 * Sprint 2 · S2-7 (CC2 · GO-LENOVO 16-nov): TRES cuadros por plano (inicio, medio, final) + señales medidas con ffmpeg (cortes, negro, congelado, duración);
 * el agente juzga cada clip contra su ROL en la historia y contra su IMAGEN CLAVE (S2-3). Las señales son DATO para el agente, nunca un veredicto del código.
 * JUZGA EL AGENTE, NO EL CÓDIGO: aquí no hay listas ni frases fijas; el código solo arma el pedido, lee `coincide` y guarda lo que el agente vio.
 * Puro: sin red, sin base, sin ffmpeg (eso vive en `cuadros.ts`). Genérico: cualquier cliente, cualquier red.
 */
import { MAX_IMAGENES } from '../../imagenes-del-pedido'
import type { Plano } from './guion'

export const ESQUEMA_MIRADA_VIDEO = 'mirada_video.v1'
/** el paso de la plantilla que mira (una sola clave: la conocen el orquestador y la jefatura) */
export const PASO_MIRAR_VIDEO = 'mirar_video'
export const PASO_CUADROS_VIDEO = 'cuadros_video'

/** en qué momento del plano está el cuadro (S2-7): el arranque, el medio y cómo termina */
export type ParteDelPlano = 'inicio' | 'medio' | 'final'
export interface CuadroDelVideo { plano: number; segundo: number; url: string; parte?: ParteDelPlano }
/** el nombre del archivo de cada cuadro (único por plano y parte) */
export const nombreDelCuadro = (c: { plano: number; parte?: ParteDelPlano }) => `plano-${c.plano}${c.parte ? `-${c.parte}` : ''}.jpg`

/** cuadros por plano (S2-7): inicio, medio y final; un plano de menos de 1 s da solo el del medio */
export const CUADROS_POR_PLANO = 3
/** cuántos cuadros como mucho (el agente los recibe como imágenes: nunca una lista sin fin); con más planos se reparten parejo, de a 3 por plano */
export const MAX_CUADROS_DEL_VIDEO = 36

const redondo = (x: number) => Math.round(x * 100) / 100

/**
 * los instantes de cada plano: inicio y final un poco hacia adentro (donde ya no hay transición), y el medio; dentro de lo que dura el video de verdad (si se midió).
 * Con más planos de los que caben en `max`, se eligen planos repartidos parejo (primero y último incluidos) y cada uno conserva sus cuadros.
 */
export function instantesPorPlano(planos: Plano[], duracionReal?: number | null, max = MAX_CUADROS_DEL_VIDEO): Array<{ plano: number; segundo: number; parte: ParteDelPlano }> {
  const tope = duracionReal && duracionReal > 0 ? duracionReal : null
  const dentro = (s: number) => (tope !== null ? Math.min(s, Math.max(0, tope - 0.1)) : s)
  const porPlano: Array<Array<{ plano: number; segundo: number; parte: ParteDelPlano }>> = []
  for (const p of planos) {
    const desde = Number(p.desde), hasta = Number(p.hasta)
    if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta <= desde) continue
    const largo = hasta - desde
    const margen = Math.min(0.3, largo * 0.15)
    const crudos: Array<[ParteDelPlano, number]> = largo >= 1 ? [['inicio', desde + margen], ['medio', (desde + hasta) / 2], ['final', hasta - margen]] : [['medio', (desde + hasta) / 2]]
    const vistos = new Set<number>()
    const suyos: Array<{ plano: number; segundo: number; parte: ParteDelPlano }> = []
    // un video más corto que el guion: los cuadros se quedan dentro del video; si dos caen en el mismo segundo, queda uno
    for (const [parte, s] of crudos) { const seg = redondo(dentro(s)); if (vistos.has(seg)) continue; vistos.add(seg); suyos.push({ plano: p.n, segundo: seg, parte }) }
    porPlano.push(suyos)
  }
  const total = porPlano.reduce((n, x) => n + x.length, 0)
  if (total <= max) return porPlano.flat()
  const caben = Math.max(1, Math.floor(max / CUADROS_POR_PLANO))
  if (caben === 1) return porPlano[0].slice(0, Math.max(1, max))
  const elegidos = Array.from(new Set(Array.from({ length: caben }, (_, i) => Math.round((i * (porPlano.length - 1)) / (caben - 1)))))
  return elegidos.flatMap((i) => porPlano[i])
}

// ───────────────────────── las señales medidas (S2-7): lo que ffmpeg midió en cada plano. Son DATO para el agente; ninguna regla las convierte en veredicto
export interface SenalesDelPlano {
  plano: number
  /** segundos donde ffmpeg vio un cambio de escena dentro del plano (un corte que el guion no pidió, o el modelo que saltó de toma) */
  cortes: number[]
  /** segundos de imagen negra dentro del plano */
  negro_s: number
  /** segundos de imagen congelada (sin movimiento) dentro del plano */
  congelado_s: number
}
export interface SenalesDelVideo { duracion_s: number | null; por_plano: SenalesDelPlano[] }

const numerosDe = (salida: string, re: RegExp): number[] => [...salida.matchAll(re)].map((m) => Number(m[1])).filter(Number.isFinite)

/** tramos [inicio, fin] de negro o congelado leídos de la salida de ffmpeg; un tramo sin fin llega hasta la duración */
function tramos(inicios: number[], fines: number[], hasta: number | null): Array<[number, number]> {
  return inicios.map((a, i) => [a, fines.find((f) => f >= a) ?? fines[i] ?? hasta ?? a] as [number, number]).filter(([a, b]) => b > a)
}

const solape = (t: Array<[number, number]>, desde: number, hasta: number) => redondo(t.reduce((s, [a, b]) => s + Math.max(0, Math.min(b, hasta) - Math.max(a, desde)), 0))

/**
 * lee la salida de UNA pasada de ffmpeg con `blackdetect`, `freezedetect` y `select=gt(scene,…),showinfo` y la reparte por plano. Puro.
 * Un corte justo en la frontera entre dos planos (± 0,25 s) es la transición pedida, no un corte dentro del plano.
 */
export function senalesDeLaSalida(salida: string, planos: Plano[], duracion_s: number | null): SenalesDelVideo {
  const negro = tramos(numerosDe(salida, /black_start:\s*([\d.]+)/g), numerosDe(salida, /black_end:\s*([\d.]+)/g), duracion_s)
  const congelado = tramos(numerosDe(salida, /freeze_start:\s*([\d.]+)/g), numerosDe(salida, /freeze_end:\s*([\d.]+)/g), duracion_s)
  const cortes = numerosDe(salida, /Parsed_showinfo[^\n]*pts_time:\s*([\d.]+)/g)
  const por_plano: SenalesDelPlano[] = []
  for (const p of planos) {
    const desde = Number(p.desde), hasta = Number(p.hasta)
    if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta <= desde) continue
    por_plano.push({
      plano: p.n,
      cortes: cortes.filter((c) => c > desde + 0.25 && c < hasta - 0.25).map(redondo),
      negro_s: solape(negro, desde, hasta),
      congelado_s: solape(congelado, desde, hasta),
    })
  }
  return { duracion_s, por_plano }
}

export interface MiradaDelVideo {
  coincide: boolean
  orden_respetado: boolean | null
  faltantes: Array<{ plano: number | null; que_falta: string }>
  por_plano: Array<{ plano: number; se_ve: string }>
  para_la_mesa: string
}

const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** lo que el agente devolvió → lo que guarda la sala (ya pasó el esquema); nada se inventa: lo que falta queda vacío */
export function leerMirada(v: Record<string, unknown>): MiradaDelVideo {
  const faltantes = (Array.isArray(v.faltantes) ? v.faltantes : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({ plano: Number.isFinite(Number(x.plano)) && x.plano !== null && x.plano !== '' ? Number(x.plano) : null, que_falta: txt(x.que_falta) }))
    .filter((x) => x.que_falta)
  const por_plano = (Array.isArray(v.por_plano) ? v.por_plano : [])
    .filter((x): x is Record<string, unknown> => !!x && typeof x === 'object')
    .map((x) => ({ plano: Number(x.plano), se_ve: txt(x.se_ve) }))
    .filter((x) => Number.isFinite(x.plano) && x.se_ve)
  return { coincide: v.coincide === true, orden_respetado: typeof v.orden_respetado === 'boolean' ? v.orden_respetado : null, faltantes, por_plano, para_la_mesa: txt(v.para_la_mesa) }
}

/** la línea de señales de un plano, legible; nada si ffmpeg no midió nada raro (no se rellena con ceros) */
function senalesLegibles(s: SenalesDelPlano | undefined): string {
  if (!s) return ''
  const partes = [
    ...(s.cortes.length ? [`${s.cortes.length} cambio(s) de escena dentro del plano (s ${s.cortes.join(', ')})`] : []),
    ...(s.negro_s > 0 ? [`${s.negro_s} s en negro`] : []),
    ...(s.congelado_s > 0 ? [`${s.congelado_s} s de imagen congelada`] : []),
  ]
  return partes.length ? ` · medido: ${partes.join('; ')}` : ' · medido: sin cortes, negro ni congelado'
}

/**
 * el pedido al agente: por plano, su imagen clave (si hubo) y sus cuadros en orden; los planos del guion con su rol; lo que midió ffmpeg; la fila del brief.
 * El agente decide si coincide.
 */
export function tareaDeLaMirada(o: {
  cuadros: CuadroDelVideo[]; planos: Plano[]; segundos: number; brief_texto: string; red: string; formato: string; contrato: string; errorDeFormato?: string
  imagenes_clave?: Array<{ n: number; url: string }>; senales?: SenalesDelVideo | null; max?: number
  /** 19-nov · ADENDA 1 · P2b (CC5): el manual y el plan del cliente, ENTEROS, para que los ojos del video juzguen contra la marca y no solo contra el guion · ausentes = el pedido de siempre */
  manual_texto?: string; plan_texto?: string | null
}): { task: string; images: string[] } {
  const senalDe = new Map((o.senales?.por_plano ?? []).map((s) => [s.plano, s]))
  // Sprint 2 · S2-1 · el rol del plano en la historia y lo que tenía que decir van primero: el agente juzga si el plano CUMPLE su rol, no solo si se ve lo pedido
  const planos = o.planos.map((p) => `- Plano ${p.n} (${p.desde}–${p.hasta} s)${p.rol ? ` · rol: ${p.rol}` : ''}${p.dice ? ` · tenía que decir: ${p.dice}` : ''}: ${p.se_ve}${p.producto === undefined ? '' : ` · producto en cuadro: ${p.producto ? 'sí' : 'no'}`}${p.movimiento ? ` · cámara: ${p.movimiento}` : ''}${p.estado_final ? ` · cómo termina: ${p.estado_final}` : ''}${p.texto_en_pantalla ? ` · texto que se agrega en edición (NO debe verse en el clip): «${p.texto_en_pantalla}»` : ''}${o.senales ? senalesLegibles(senalDe.get(p.n)) : ''}`).join('\n')
  // las imágenes van agrupadas por plano: primero su imagen clave (lo que se aprobó antes de filmar), luego sus cuadros en el orden del video
  const claveDe = new Map((o.imagenes_clave ?? []).filter((x) => x.url).map((x) => [x.n, x.url]))
  const { planos: elegidos, recortados } = elegirImagenes(o.cuadros, claveDe, Math.max(1, o.max ?? MAX_IMAGENES))
  const imagenes: string[] = []
  const lineas: string[] = []
  for (const e of elegidos) {
    if (e.clave) { imagenes.push(e.clave); lineas.push(`- imagen ${imagenes.length}: IMAGEN CLAVE del plano ${e.n} (lo que se aprobó antes de filmar: el clip tiene que contarlo así)`) }
    for (const c of e.cuadros) { imagenes.push(c.url); lineas.push(`- imagen ${imagenes.length}: cuadro del plano ${c.plano}${c.parte ? ` (${c.parte})` : ''}, segundo ${c.segundo}`) }
  }
  if (recortados.length) lineas.push(`(el pedido admite ${Math.max(1, o.max ?? MAX_IMAGENES)} imágenes: en los planos ${recortados.join(', ')} no van todas las suyas; juzga lo que ves)`)
  const vistos = elegidos.length
  const duracion = o.senales?.duracion_s
  const task = [
    `## La pieza\nUn video de ${o.segundos} s${duracion ? ` (medido: ${duracion} s)` : ''} para ${o.red} (${o.formato}), ya generado por el modelo de video. Lo que sigue es lo que se pidió y lo que salió.`,
    `## La fila del brief (lo que la pieza tiene que contar)\n${o.brief_texto.trim() || '(sin texto)'}`,
    ...(o.manual_texto ? [`## El manual de marca del cliente\n<documento fuente="el manual de marca">\n${o.manual_texto}\n</documento>`] : []),
    ...(o.plan_texto ? [`## El plan de trabajo del cliente\n<documento fuente="el plan">\n${o.plan_texto}\n</documento>`] : []),
    `## Los planos del guion (lo que se pidió, en orden)\n${planos || '- (sin planos)'}`,
    ...(o.senales ? ['## Lo que midió ffmpeg\nEn cada plano dice si hubo cambios de escena dentro del plano, segundos en negro o imagen congelada. Es un DATO, no un veredicto: un corte puede ser lo que el plano pedía y una imagen quieta puede ser intencional. Tú decides si importa para lo que el plano tenía que contar.'] : []),
    `## Las imágenes que te muestro (por plano: su imagen clave si la hubo, y sus cuadros de inicio, medio y final)${vistos && vistos < o.planos.length ? ` · son ${vistos} de ${o.planos.length} planos (los demás no se muestran: no juzgues lo que no ves)` : ''}\n${lineas.join('\n') || '- (ninguna)'}`,
    '## Tu trabajo\nMira el video como lo haría el dueño de la pieza antes de publicarla. Decide TÚ, plano por plano, si cada clip cumple su ROL en la historia y si cuenta lo mismo que su imagen clave (el producto, el encuadre, cómo termina); y si el video entero cuenta lo que pide la fila, en orden. No hay una lista de cosas que buscar: lo importante lo decides tú leyendo el guion y la fila. Si algo importante falta o está cambiado, di qué y en qué plano, y escribe en `para_la_mesa` lo que el equipo creativo tendría que corregir para que el próximo video sí lo cuente. Si coincide, dilo y no inventes defectos.',
    ...(o.errorDeFormato ? [`## Corrige el formato\n${o.errorDeFormato}`] : []),
    `## Formato de tu respuesta\nSolo este JSON:\n${o.contrato}`,
  ].join('\n\n')
  return { task, images: imagenes }
}

/**
 * CC7 (16-nov · 🔴): el servicio de agentes acepta como mucho MAX_IMAGENES por pedido. Si no caben todas, se elige CON CRITERIO, en este orden:
 * el cuadro del medio de cada plano (si ni eso cabe, planos repartidos parejo, primero y último incluidos); luego la imagen clave de cada plano;
 * luego cómo termina (final); luego el arranque (inicio). Cada vuelta recorre los planos en orden. Puro.
 */
export function elegirImagenes(cuadros: CuadroDelVideo[], claveDe: Map<number, string>, max: number): { planos: Array<{ n: number; clave: string | null; cuadros: CuadroDelVideo[] }>; recortados: number[] } {
  const orden = Array.from(new Set(cuadros.map((c) => c.plano)))
  const deUn = (n: number) => cuadros.filter((c) => c.plano === n)
  const medioDe = (n: number) => deUn(n).find((c) => c.parte === 'medio') ?? deUn(n)[0]
  const total = orden.reduce((s, n) => s + deUn(n).length + (claveDe.has(n) ? 1 : 0), 0)
  if (total <= max) return { planos: orden.map((n) => ({ n, clave: claveDe.get(n) ?? null, cuadros: deUn(n) })), recortados: [] }
  const planos = orden.length <= max ? orden : Array.from(new Set(Array.from({ length: max }, (_, i) => Math.round((i * (orden.length - 1)) / Math.max(1, max - 1))))).map((i) => orden[i])
  const sel = new Map(planos.map((n) => [n, { clave: null as string | null, cuadros: new Set<CuadroDelVideo>([medioDe(n)]) }]))
  let lugar = max - planos.length
  const vuelta = (tomar: (n: number) => boolean) => { for (const n of planos) { if (lugar <= 0) return; if (tomar(n)) lugar-- } }
  vuelta((n) => { const k = claveDe.get(n); if (!k) return false; sel.get(n)!.clave = k; return true })
  for (const parte of ['final', 'inicio'] as const) vuelta((n) => { const c = deUn(n).find((x) => x.parte === parte); if (!c || sel.get(n)!.cuadros.has(c)) return false; sel.get(n)!.cuadros.add(c); return true })
  // el resto de los cuadros que pudiera tener un plano sin parte declarada
  vuelta((n) => { const c = deUn(n).find((x) => !sel.get(n)!.cuadros.has(x)); if (!c) return false; sel.get(n)!.cuadros.add(c); return true })
  const out = planos.map((n) => ({ n, clave: sel.get(n)!.clave, cuadros: deUn(n).filter((c) => sel.get(n)!.cuadros.has(c)) }))
  const recortados = orden.filter((n) => { const o = out.find((x) => x.n === n); return !o || o.cuadros.length < deUn(n).length || (claveDe.has(n) && !o.clave) })
  return { planos: out, recortados }
}

/** lo que la mesa recibe cuando el video vuelve (la dirección lo lee como devolución): qué faltó por plano y lo que el agente pide. Puro */
export function avisoDeLaMiradaALaMesa(m: MiradaDelVideo): string {
  return [
    'Un agente miró el video terminado (inicio, medio y final de cada plano, contra su rol y su imagen clave) y NO cuenta lo que pide el guion. Rehagan el guion para que el video se filme con esto resuelto:',
    ...m.faltantes.map((f) => `- ${f.plano !== null ? `plano ${f.plano}: ` : ''}${f.que_falta}`),
    ...(m.orden_respetado === false ? ['- el orden de los planos no se respeta'] : []),
    ...(m.para_la_mesa ? [`Lo que pide el agente: ${m.para_la_mesa}`] : []),
  ].join('\n').slice(0, 3000)
}

/** lo que la jefatura lee como contexto: lo que vio el agente, legible */
export function miradaLegible(m: MiradaDelVideo): string {
  return [
    `Veredicto del agente que miró el video: ${m.coincide ? 'coincide con el guion y la fila' : 'NO coincide'}${m.orden_respetado === false ? ' · el orden de los planos no se respeta' : ''}.`,
    ...(m.faltantes.length ? ['Lo que falta o está cambiado:', ...m.faltantes.map((f) => `- ${f.plano !== null ? `plano ${f.plano}: ` : ''}${f.que_falta}`)] : []),
    ...(m.por_plano.length ? ['Lo que se ve en cada cuadro:', ...m.por_plano.map((p) => `- plano ${p.plano}: ${p.se_ve}`)] : []),
  ].join('\n')
}
