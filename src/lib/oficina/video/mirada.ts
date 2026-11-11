/**
 * UN AGENTE MIRA EL VIDEO ANTES DE LA BANDEJA · GO Lenovo 11-nov 16:43 Zúrich (decisión de Emilio 16:41: «material premium sin ver el dinero»).
 * Antes de que un video vaya a la jefatura y a la bandeja, se saca UN cuadro del medio de cada plano del guion y un agente con visión los compara con los planos y con la fila.
 * JUZGA EL AGENTE, NO EL CÓDIGO: aquí no hay listas ni frases fijas; el código solo arma el pedido, lee `coincide` y guarda lo que el agente vio.
 * Puro: sin red, sin base, sin ffmpeg (eso vive en `cuadros.ts`). Genérico: cualquier cliente, cualquier red.
 */
import type { Plano } from './guion'

export const ESQUEMA_MIRADA_VIDEO = 'mirada_video.v1'
/** el paso de la plantilla que mira (una sola clave: la conocen el orquestador y la jefatura) */
export const PASO_MIRAR_VIDEO = 'mirar_video'
export const PASO_CUADROS_VIDEO = 'cuadros_video'

export interface CuadroDelVideo { plano: number; segundo: number; url: string }

/** el instante del cuadro de cada plano: el medio del plano, dentro de lo que dura el video de verdad (si se midió) */
export function instantesPorPlano(planos: Plano[], duracionReal?: number | null): Array<{ plano: number; segundo: number }> {
  const tope = duracionReal && duracionReal > 0 ? duracionReal : null
  const out: Array<{ plano: number; segundo: number }> = []
  for (const p of planos) {
    const desde = Number(p.desde), hasta = Number(p.hasta)
    if (!Number.isFinite(desde) || !Number.isFinite(hasta) || hasta <= desde) continue
    let s = (desde + hasta) / 2
    // un video más corto que el guion: el cuadro se queda dentro del video (un poco antes del final, donde ffmpeg aún tiene imagen)
    if (tope !== null) s = Math.min(s, Math.max(0, tope - 0.1))
    out.push({ plano: p.n, segundo: Math.round(s * 100) / 100 })
  }
  return out
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

/** el pedido al agente: los cuadros en orden, cada uno con su plano y su segundo; los planos del guion; la fila del brief. El agente decide si coincide */
export function tareaDeLaMirada(o: { cuadros: CuadroDelVideo[]; planos: Plano[]; segundos: number; brief_texto: string; red: string; formato: string; contrato: string; errorDeFormato?: string }): { task: string; images: string[] } {
  const planos = o.planos.map((p) => `- Plano ${p.n} (${p.desde}–${p.hasta} s): ${p.se_ve}${p.movimiento ? ` · cámara: ${p.movimiento}` : ''}${p.texto_en_pantalla ? ` · texto en pantalla: «${p.texto_en_pantalla}»` : ''}`).join('\n')
  const cuadros = o.cuadros.map((c, i) => `- imagen ${i + 1}: cuadro del plano ${c.plano}, segundo ${c.segundo}`).join('\n')
  const task = [
    `## La pieza\nUn video de ${o.segundos} s para ${o.red} (${o.formato}), ya generado por el modelo de video. Lo que sigue es lo que se pidió y lo que salió.`,
    `## La fila del brief (lo que la pieza tiene que contar)\n${o.brief_texto.trim() || '(sin texto)'}`,
    `## Los planos del guion (lo que se pidió, en orden)\n${planos || '- (sin planos)'}`,
    `## Los cuadros que te muestro (uno del medio de cada plano, en orden)\n${cuadros || '- (ninguno)'}`,
    '## Tu trabajo\nMira los cuadros como lo haría el dueño de la pieza antes de publicarla. Decide TÚ si el video cuenta lo que pide el guion y la fila: si se ve lo que cada plano tenía que mostrar y si el orden se respeta. No hay una lista de cosas que buscar: lo importante lo decides tú leyendo el guion y la fila. Si algo importante falta o está cambiado, di qué y en qué plano, y escribe en `para_la_mesa` lo que el equipo creativo tendría que corregir para que el próximo video sí lo cuente. Si coincide, dilo y no inventes defectos.',
    ...(o.errorDeFormato ? [`## Corrige el formato\n${o.errorDeFormato}`] : []),
    `## Formato de tu respuesta\nSolo este JSON:\n${o.contrato}`,
  ].join('\n\n')
  return { task, images: o.cuadros.map((c) => c.url) }
}

/** lo que la jefatura lee como contexto: lo que vio el agente, legible */
export function miradaLegible(m: MiradaDelVideo): string {
  return [
    `Veredicto del agente que miró el video: ${m.coincide ? 'coincide con el guion y la fila' : 'NO coincide'}${m.orden_respetado === false ? ' · el orden de los planos no se respeta' : ''}.`,
    ...(m.faltantes.length ? ['Lo que falta o está cambiado:', ...m.faltantes.map((f) => `- ${f.plano !== null ? `plano ${f.plano}: ` : ''}${f.que_falta}`)] : []),
    ...(m.por_plano.length ? ['Lo que se ve en cada cuadro:', ...m.por_plano.map((p) => `- plano ${p.plano}: ${p.se_ve}`)] : []),
  ].join('\n')
}
