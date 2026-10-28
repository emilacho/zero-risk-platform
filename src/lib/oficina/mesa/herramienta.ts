/**
 * LAS HERRAMIENTAS DEL TABLERO (`mesa_pedir` · `mesa_devolver` · `pedir_material`) · lo que la plataforma hace cuando el conector del corredor las llama.
 * Reglas de oficio: quien llama es SIEMPRE el agente del turno abierto (nadie pide «en nombre de» otro); un pedido repetido de la misma pareja no se anota dos veces; la profundidad y las idas y vueltas
 * tienen tope; jamás se informa éxito si el pedido no quedó en el libro (el conector lo toma como error). Puro respecto del mundo: todo entra por `P.mesa` y `P.almacen`.
 */
import { datos } from '../ayudas'
import type { Respuesta } from '../orquestador'
import type { Puertos } from '../puertos'
import { porteroDe } from './directorio'
import { huellaDePedido, idasYVueltas } from './libro'
import { COTAS, esFamiliaMesa, type EstadoMesa, type TipoDeAporte } from './tipos'

const r = (status: number, cuerpo: Record<string, unknown>): Respuesta => ({ status, cuerpo })
const HERRAMIENTAS = ['mesa_pedir', 'mesa_devolver', 'pedir_material'] as const
type Herramienta = (typeof HERRAMIENTAS)[number]
/** máximo de pedidos/devoluciones que un mismo agente puede anotar en una pieza (el planificador además acota por pareja y profundidad) */
export const MAX_PEDIDOS_POR_AGENTE = 6
const corto = (x: unknown, n: number): string => (typeof x === 'string' ? x.trim().slice(0, n) : '')

/** devuelve 200 con `ok:false` + `motivo` cuando el pedido no procede (el conector lo entrega al agente como error legible); 4xx solo para llamadas mal formadas o ajenas */
export async function registrarHerramienta(P: Puertos, cuerpo: unknown): Promise<Respuesta> {
  const b = (cuerpo && typeof cuerpo === 'object' ? cuerpo : {}) as Record<string, unknown>
  const herramienta = String(b.herramienta ?? '') as Herramienta
  if (!HERRAMIENTAS.includes(herramienta)) return r(400, { ok: false, error: 'herramienta_desconocida', detalle: `herramienta debe ser una de: ${HERRAMIENTAS.join(', ')}` })
  const encargoId = corto(b.encargo_id, 80), de = corto(b.de, 120)
  if (!encargoId || !de) return r(400, { ok: false, error: 'entrada_invalida', detalle: 'faltan encargo_id y de' })
  if (!P.mesa) return r(503, { ok: false, error: 'mesa_sin_puerto' })
  const enc = await P.almacen.leerEncargo(encargoId)
  if (!enc) return r(404, { ok: false, error: 'encargo_inexistente' })
  if (!esFamiliaMesa(enc.familia)) return r(409, { ok: false, error: 'no_es_de_la_mesa', detalle: 'este encargo no trabaja en la mesa' })
  const est = datos(enc.estado_del_motor, 'mesa') as unknown as EstadoMesa | undefined
  const abierto = est?.turno_abierto
  // solo el agente del turno abierto escribe en el tablero (un pedido fuera de turno o «en nombre de» otro no se anota)
  if (!est || !abierto || abierto.agente !== de) return r(409, { ok: false, error: 'fuera_de_turno', detalle: `${de} no tiene el turno abierto en esta pieza` })

  const libro = await P.mesa.libro(encargoId)
  const hechos = libro.filter((a) => (a.tipo === 'pide' || a.tipo === 'devuelve') && a.de === de).length
  if (hechos >= MAX_PEDIDOS_POR_AGENTE) return r(200, { ok: false, motivo: `ya anotaste ${MAX_PEDIDOS_POR_AGENTE} pedidos en esta pieza: decide con lo que hay` })
  const respondiendo = abierto.responde_a ? libro.find((a) => a.id === abierto.responde_a) : undefined
  const profundidad = respondiendo ? respondiendo.profundidad + 1 : 0
  if (profundidad > COTAS.MAX_PROFUNDIDAD) return r(200, { ok: false, motivo: `los pedidos encadenados llegaron a su tope (${COTAS.MAX_PROFUNDIDAD}): responde con lo que tienes` })

  let para: string, tipo: TipoDeAporte, texto: string
  const portero = porteroDe(est.directorio_congelado)
  if (herramienta === 'pedir_material') {
    if (!portero) return r(200, { ok: false, motivo: 'esta pieza no tiene portero del cerebro disponible' })
    para = portero.agente; tipo = 'pide'
    const que = corto(b.que, 600); if (que.length < 3) return r(200, { ok: false, motivo: 'di qué material necesitas' })
    texto = que + (corto(b.para_que, 300) ? ` (para: ${corto(b.para_que, 300)})` : '')
  } else {
    para = corto(b.a, 120)
    const t = est.directorio_congelado.find((x) => x.agente === para && x.activo)
    if (!t) return r(200, { ok: false, motivo: `«${para || '(vacío)'}» no está en el equipo de esta pieza; mira el directorio` })
    if (t.rol === 'portero') return r(200, { ok: false, motivo: 'al portero se le pide con pedir_material' })
    if (para === de) return r(200, { ok: false, motivo: 'no te puedes pedir algo a ti mismo' })
    if (idasYVueltas(libro, de, para) >= COTAS.MAX_IDAS_VUELTAS_POR_PAREJA) return r(200, { ok: false, motivo: `ya hubo ${COTAS.MAX_IDAS_VUELTAS_POR_PAREJA} idas y vueltas con ${para}: decide con lo que hay` })
    if (herramienta === 'mesa_devolver') {
      if (!libro.some((a) => a.de === para && (a.tipo === 'aporta' || a.tipo === 'responde' || a.tipo === 'dirige'))) return r(200, { ok: false, motivo: `${para} todavía no tiene un aporte que devolver` })
      tipo = 'devuelve'; texto = corto(b.comentarios, 1500)
      if (texto.length < 3) return r(200, { ok: false, motivo: 'di qué debe cambiar' })
    } else {
      tipo = 'pide'; const que = corto(b.que, 800)
      if (que.length < 3) return r(200, { ok: false, motivo: 'di qué le pides' })
      texto = que + (corto(b.para_que, 300) ? ` (para: ${corto(b.para_que, 300)})` : '')
    }
  }
  const huella = huellaDePedido(de, para, texto)
  const repetido = libro.find((a) => (a.tipo === 'pide' || a.tipo === 'devuelve') && a.de === de && a.para === para && huellaDePedido(a.de, a.para ?? '', a.texto) === huella)
  if (repetido) return r(200, { ok: true, duplicado: true, ref: `A${repetido.n}`, nota: 'ese pedido ya estaba anotado' })
  const ins = await P.mesa.aportar({ encargo_id: encargoId, de, para, tipo, texto, refs: [], responde_a: null, profundidad, costo_usd: 0, workflow_execution_id: null })
  if (!ins.ok) return r(200, { ok: false, motivo: `no se pudo anotar en el tablero: ${ins.error}` })
  return r(200, { ok: true, ref: `A${ins.aporte.n}`, para, nota: herramienta === 'pedir_material' ? 'el portero lo atiende al terminar tu turno; lo que traiga estará en el tablero' : `${para} responde en su turno; sigue con tu aporte` })
}
