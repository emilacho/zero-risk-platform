/**
 * C · EL PORTERO DECLARA EL FALTANTE COMO RECADO (relevo 18 · diseño de CC#3 §2.2.2). Solo LECTURA y forma: este módulo no abre ni cierra recados (eso es de la sala: la puerta
 * `POST /api/sala/recados`); el portero únicamente DECLARA el faltante con forma y recibe, como DATO, los destinos que existen y los recados que ya están abiertos del cliente.
 * Nada que venga del modelo se toma sin comprobar: un destino que no existe o un recado que no está abierto se anulan (con su nota) y el faltante sigue declarado.
 */
import { comoDato } from './instruccion'

export interface DestinoOfrecido { destino: string; tipo: string; estado_del_brazo: string }
export interface RecadoAbierto { numero: number; que_falta: string; destino: string }
export interface ContextoDeRecados { destinos: DestinoOfrecido[]; abiertos: RecadoAbierto[] }

/** lo que el modelo dijo de un faltante, ya acotado pero SIN comprobar contra el contexto */
export interface DetalleCrudo { que: string; para_que: string | null; bloquea: boolean; destino_propuesto: unknown; razon: string | null; recado_existente: unknown }
export interface FaltanteConForma {
  que: string
  para_que: string | null
  bloquea: boolean
  destino_propuesto: string | null
  razon: string | null
  recado_existente: number | null
  /** por qué se anuló algo de lo que dijo el modelo (destino_no_valido · recado_no_abierto) */
  nota?: string
}

export const MAXIMO_DE_DESTINOS_DE_PRUEBA = 30
export const MAXIMO_DE_RECADOS_DE_PRUEBA = 50

const esObjeto = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const texto = (v: unknown, max: number): v is string => typeof v === 'string' && v.length > 0 && v.length <= max

/** el bloque del mensaje al modelo: vacío si no hay nada que ofrecer (entonces el mensaje es EXACTAMENTE el de siempre) */
export function bloqueDeRecados(ctx: ContextoDeRecados | null): string {
  if (!ctx || (ctx.destinos.length === 0 && ctx.abiertos.length === 0)) return ''
  const partes: string[] = []
  if (ctx.destinos.length > 0) partes.push(`\n<destinos>\n${comoDato(ctx.destinos.map((d) => `${d.destino} · ${d.tipo} · ${d.estado_del_brazo}`).join('\n'))}\n</destinos>`)
  if (ctx.abiertos.length > 0) partes.push(`\n<recados_abiertos>\n${comoDato(ctx.abiertos.map((r) => `[R${r.numero}] ${r.que_falta} → ${r.destino}`).join('\n'))}\n</recados_abiertos>`)
  return partes.join('')
}

/**
 * Los faltantes que SIGUEN declarados (después de la verificación) con su forma, en su orden. Un faltante dado solo como texto sale con valores por defecto
 * (nunca queda uno sin forma). El destino debe existir en la lista ofrecida y el recado citado debe estar abierto; si no, se anulan con su nota.
 */
export function conForma(faltantes: string[], detalle: DetalleCrudo[], ctx: ContextoDeRecados | null): FaltanteConForma[] {
  const destinos = new Set((ctx?.destinos ?? []).map((d) => d.destino))
  const abiertos = new Set((ctx?.abiertos ?? []).map((r) => r.numero))
  const porQue = new Map(detalle.map((d) => [d.que, d]))
  return faltantes.map((que) => {
    const d = porQue.get(que)
    const notas: string[] = []
    let destino: string | null = null
    if (d && d.destino_propuesto !== null && d.destino_propuesto !== undefined && d.destino_propuesto !== '') {
      if (typeof d.destino_propuesto === 'string' && destinos.has(d.destino_propuesto)) destino = d.destino_propuesto
      else notas.push('destino_no_valido')
    }
    let recado: number | null = null
    if (d && d.recado_existente !== null && d.recado_existente !== undefined && d.recado_existente !== '') {
      if (typeof d.recado_existente === 'number' && Number.isInteger(d.recado_existente) && abiertos.has(d.recado_existente)) recado = d.recado_existente
      else notas.push('recado_no_abierto')
    }
    return { que, para_que: d?.para_que ?? null, bloquea: d?.bloquea === true, destino_propuesto: destino, razon: d?.razon ?? null, recado_existente: recado, ...(notas.length ? { nota: notas.join(' · ') } : {}) }
  })
}

/** el contexto que manda quien PRUEBA (solo con `prueba: true` y lista de prueba; en una corrida real lo manda el servidor) */
export function leerRecadosDePrueba(v: unknown): { ok: true; contexto: ContextoDeRecados } | { ok: false; errores: string[] } {
  if (!esObjeto(v)) return { ok: false, errores: ['`recados_de_prueba` debe ser un objeto {destinos, abiertos}'] }
  const errores: string[] = []
  const destinos: DestinoOfrecido[] = []
  const abiertos: RecadoAbierto[] = []
  if (!Array.isArray(v.destinos) || v.destinos.length > MAXIMO_DE_DESTINOS_DE_PRUEBA) errores.push(`\`destinos\` es una lista de a lo más ${MAXIMO_DE_DESTINOS_DE_PRUEBA}`)
  else v.destinos.forEach((d, i) => { if (esObjeto(d) && texto(d.destino, 100) && texto(d.tipo, 40) && texto(d.estado_del_brazo, 40)) destinos.push({ destino: d.destino, tipo: d.tipo, estado_del_brazo: d.estado_del_brazo }); else errores.push(`destino ${i + 1} mal formado`) })
  if (!Array.isArray(v.abiertos) || v.abiertos.length > MAXIMO_DE_RECADOS_DE_PRUEBA) errores.push(`\`abiertos\` es una lista de a lo más ${MAXIMO_DE_RECADOS_DE_PRUEBA}`)
  else v.abiertos.forEach((r, i) => { if (esObjeto(r) && typeof r.numero === 'number' && Number.isInteger(r.numero) && r.numero >= 1 && texto(r.que_falta, 2000) && texto(r.destino, 100)) abiertos.push({ numero: r.numero, que_falta: r.que_falta, destino: r.destino }); else errores.push(`recado ${i + 1} mal formado`) })
  return errores.length ? { ok: false, errores: errores.slice(0, 10) } : { ok: true, contexto: { destinos, abiertos } }
}
