/**
 * «CREAR CAMPAÑA» SIN VUELTA ATRÁS · EL ARREGLO PROPIO (GO Lenovo 10:28Z del 21-nov · firma de Emilio 10:25–10:27Z: «si algo falla internamente y no se dispara, lo arregla nuestro backend solo»).
 * Hueco que cierra: `crear` guarda el pedido y deja UN sobre de «plan listo»; si la sala lo rechaza, o la puerta falla al abrir, NADIE lo vuelve a pedir (re-emitir el mismo sobre da «duplicado»).
 *   · Lo corre el vigía de la oficina (cada 10 min, `POST /api/oficina/vigia`): ese reloj ya existe, así que no hace falta un flujo nuevo en n8n.
 *   · Para cada pedido SIN campaña, pasado su plazo, re-emite el sobre con una llave NUEVA por intento (`…:crear-campana:<llave>:r<n>`). La campaña sigue siendo UNA por llave
 *     (`abrirCampana` → `campanaPorLlave`): nunca nacen dos. Un rechazo de la sala también gasta un intento (canon de loops: tope explícito, nunca indefinido).
 *   · FALLIDA solo cuando (a) se agotan los intentos, o (b) la causa no se arregla sola: el cliente ya no tiene plan vigente y aprobado (`E-PLAN`) o la cadena no lo admite (`E-ADMITE`).
 *     Una vez fallida, la apertura se niega a nacer esa llave (`campanas.ts`, 409 `E-PEDIDO-FALLIDO`).
 *   · La libreta vive en `cadena_config.reparaciones_de_pedidos` (el pedido no se edita: candado de la base) y se escribe con SELLO: si otra pasada la cambió, no se pisa.
 *   · IDEMPOTENTE: la llave de cada intento es determinista; repetir la pasada no duplica (la sala contesta «duplicado»).
 *   · NUNCA llama a un modelo ni gasta: solo deja sobres en la sala; la planificación que nace después frena con su propia bolsa y su tope.
 *   · Solo mira pedidos recientes (`VENTANA_DEL_ARREGLO_MIN`): un pedido viejo sin anotación (de antes de este arreglo, o un ensayo olvidado) no se toca.
 *   · «en seco» (`ejecutar: false`) calcula el plan completo sin emitir y sin anotar.
 */
import type { Almacen } from './almacen'
import { compuerta } from './autorizar'
import { sobreDelPedido, type PedidoGuardado } from './crear-campana'
import { CLAVE_LIBRETA_DE_PEDIDOS, CODIGOS_DE_FALLA, libretaDe, type AnotacionDelPedido, type CodigoDeFalla, type LibretaDePedidos } from './libreta-de-pedidos'

export const MAX_INTENTOS_DEL_PEDIDO = 5
/**
 * Minutos de espera ANTES del intento n+1 (n = intentos propios ya hechos; para n = 0 se cuenta desde que se guardó el pedido).
 * La última posición es el plazo tras el último intento antes de darlo por fallido: alcanza de sobra para que la puerta termine de abrir lo que esté en vuelo.
 * El vigía corre cada 10 min, así que cada espera se cumple en la primera pasada después de su plazo. En total, unas 3 h 10 desde el pedido.
 */
export const ESPERAS_DEL_PEDIDO_MIN: readonly number[] = [10, 10, 20, 30, 60, 60]
/** un pedido más viejo que esto no se mira: la suma de las esperas (190 min) más un margen para pasadas que se saltaron */
export const VENTANA_DEL_ARREGLO_MIN = 6 * 60

export interface ReintentoDelPedido { pedido_id: string; intento: number; resultado: 'aceptado' | 'duplicado' | 'rechazado' | 'en_seco'; detalle?: string }
export interface FallaDelPedidoAnotada { pedido_id: string; codigo: CodigoDeFalla; detalle: string }
export type ResultadoDelArreglo =
  | { accion: 'sin_puertos'; detalle: string }
  | { accion: 'reparado' | 'en_seco'; revisados: number; reintentos: ReintentoDelPedido[]; fallidos: FallaDelPedidoAnotada[]; errores: Array<{ pedido_id: string; detalle: string }>; sin_escribir?: string }

const minutosDesde = (desde: string, ahora: Date): number => (ahora.getTime() - new Date(desde).getTime()) / 60000

/** la causa que NO se arregla sola, o null · lanza si no se puede leer (ese pedido espera a la pasada siguiente) */
async function causaQueNoSeArregla(al: Almacen, p: PedidoGuardado): Promise<{ codigo: CodigoDeFalla; detalle: string } | null> {
  const plan = await al.resolverPlan(p.client_id, null)
  if (!plan || !al.planAprobado || !(await al.planAprobado(plan.plan_id))) return { codigo: CODIGOS_DE_FALLA.plan, detalle: 'el cliente ya no tiene un plan vigente y aprobado' }
  const cerrada = await compuerta(al, p.client_id, p.seco)
  if (cerrada) return { codigo: CODIGOS_DE_FALLA.admite, detalle: `la cadena no admite a este cliente (${String(cerrada.cuerpo.code ?? cerrada.cuerpo.error ?? 'cerrada')})` }
  return null
}

export async function repararPedidos(al: Almacen, ahora: Date, o: { ejecutar: boolean }): Promise<ResultadoDelArreglo> {
  if (!al.pedidosSinNacer || !al.leerConfigConSello || !al.escribirConfigSiSello) return { accion: 'sin_puertos', detalle: 'este almacén no sabe leer los pedidos sin nacer o escribir la libreta con sello' }
  const leida = await al.leerConfigConSello(CLAVE_LIBRETA_DE_PEDIDOS)
  const libreta: LibretaDePedidos = structuredClone(libretaDe(leida?.valor))
  const desde = new Date(ahora.getTime() - VENTANA_DEL_ARREGLO_MIN * 60000).toISOString()
  const pedidos = (await al.pedidosSinNacer(desde)).filter((p) => !p.campana_id)
  const reintentos: ReintentoDelPedido[] = [], fallidos: FallaDelPedidoAnotada[] = [], errores: Array<{ pedido_id: string; detalle: string }> = []
  let cambio = false
  const anotar = (id: string, a: AnotacionDelPedido) => { libreta[id] = a; cambio = true }
  for (const p of pedidos) {
    const a: AnotacionDelPedido = libreta[p.id] ?? { n: 0 }
    if (a.fallida) continue
    const espera = ESPERAS_DEL_PEDIDO_MIN[Math.min(a.n, ESPERAS_DEL_PEDIDO_MIN.length - 1)]
    if (minutosDesde(a.ultimo_en ?? p.creado_en, ahora) < espera) continue
    try {
      const causa = await causaQueNoSeArregla(al, p)
      const agotado = a.n >= MAX_INTENTOS_DEL_PEDIDO
      const falla = causa ?? (agotado
        ? (a.ultimo === 'rechazado'
          ? { codigo: CODIGOS_DE_FALLA.sala, detalle: `la sala rechazó el último de ${a.n} intentos` }
          : { codigo: CODIGOS_DE_FALLA.tiempo, detalle: `${a.n} intentos y la campaña no nació` })
        : null)
      if (falla) {
        fallidos.push({ pedido_id: p.id, ...falla })
        if (o.ejecutar) anotar(p.id, { ...a, fallida: { ...falla, en: ahora.toISOString() } })
        continue
      }
      const plan = await al.resolverPlan(p.client_id, null)
      if (!plan) throw new Error('el plan dejó de leerse entre dos lecturas')
      const base = sobreDelPedido(p, plan.plan_id)
      const intento = a.n + 1
      if (!o.ejecutar) { reintentos.push({ pedido_id: p.id, intento, resultado: 'en_seco' }); continue }
      const r = await al.emitirSobre({ ...base, idempotency_key: `${base.idempotency_key}:r${intento}` })
      reintentos.push({ pedido_id: p.id, intento, resultado: r.resultado, ...(r.detalle ? { detalle: String(r.detalle) } : {}) })
      anotar(p.id, { n: intento, ultimo_en: ahora.toISOString(), ultimo: r.resultado })
    } catch (e) {
      // un pedido que no se pudo leer o mandar no gasta intento: lo mira la pasada siguiente
      errores.push({ pedido_id: p.id, detalle: e instanceof Error ? e.message : String(e) })
    }
  }
  const base = { revisados: pedidos.length, reintentos, fallidos, errores }
  if (!o.ejecutar) return { accion: 'en_seco', ...base }
  if (cambio && !(await al.escribirConfigSiSello(CLAVE_LIBRETA_DE_PEDIDOS, libreta, leida?.sello ?? null))) {
    return { accion: 'reparado', ...base, sin_escribir: 'la libreta cambió durante la pasada: lo de esta vuelta se anota en la siguiente (los sobres repetidos dan «duplicado»)' }
  }
  return { accion: 'reparado', ...base }
}
