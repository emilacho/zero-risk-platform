/**
 * El pedido con límites de «mirar afuera» · el lado TypeScript del corredor · CC#1 · 2026-10-01 (PR #418).
 * La lógica pura vive en `mcp/mirar-afuera-limites.js` (la usa también el servidor MCP, que es JS y corre en su propio proceso): aquí sólo se CARGA, se lee del pedido y se ECO.
 * Se carga con `createRequire(import.meta.url)`: funciona igual en el servicio (tsx), en la imagen y en las pruebas (el cwd no importa).
 */
import { createRequire } from 'node:module'

export interface LimitesDeMirarAfuera { maxPedidos: number | null; permitidos: string[] | null }
export type ResultadoDeLimites = { ok: boolean; valor?: LimitesDeMirarAfuera | null; motivo?: string }

const modulo = createRequire(import.meta.url)('./mcp/mirar-afuera-limites.js') as {
  resolverLimites: (...c: unknown[]) => ResultadoDeLimites
  LIMITE_MAXIMO_DE_PEDIDOS: number
}

export const LIMITE_MAXIMO_DE_PEDIDOS: number = modulo.LIMITE_MAXIMO_DE_PEDIDOS

/** Lee `mirar_afuera_limites` del pedido (camelCase · snake_case · dentro de `context`) y lo valida · ausente ⇒ {ok:true, valor:null} · mal escrito ⇒ {ok:false, motivo} */
export function limitesDelPedido(body: Record<string, unknown>, ctx: Record<string, unknown>): ResultadoDeLimites {
  return modulo.resolverLimites(body.mirarAfueraLimites, body.mirar_afuera_limites, ctx.mirarAfueraLimites, ctx.mirar_afuera_limites)
}

/**
 * EL ECO: lo que el corredor devuelve en su acuse (202) para que quien pidió VERIFIQUE que los límites fueron aceptados (y no se perdieron por el camino).
 * Sin límites ⇒ `undefined` (el acuse es el de siempre, ni existe la clave).
 */
export function ecoDeLimites(valor: LimitesDeMirarAfuera | null | undefined): { max_pedidos?: number; permitidos?: string[] } | undefined {
  if (!valor) return undefined
  return { ...(typeof valor.maxPedidos === 'number' ? { max_pedidos: valor.maxPedidos } : {}), ...(Array.isArray(valor.permitidos) ? { permitidos: valor.permitidos } : {}) }
}

/** Lo que el corredor DICE que sabe hacer (GET /health) · permite a un flujo comprobar, ANTES de gastar, que este corredor trae el cambio */
export const CAPACIDADES_DEL_CORREDOR = { mirar_afuera_limites: 1 } as const
