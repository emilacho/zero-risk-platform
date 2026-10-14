/**
 * Ayudas de las pruebas de los enganches de J7: correr un flujo con el n8n en miniatura, con TODOS los nodos originales (code/http) contestados por un eco para poder comparar
 * qué recibe cada uno, y los nodos `JEF · …` ejecutando su código REAL. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { correr } from '../../scripts/worker-staging/jefatura-j7/n8n-mini.mjs'
import { N, NOMBRES_DE_LA_PUERTA } from '../../scripts/worker-staging/jefatura-j7/gate.mjs'
import { NOMBRES_DE_LA_CADENA } from '../../scripts/worker-staging/jefatura-j7/plan-versiones.mjs'

export type Json = Record<string, any>
export const ENV = { SALA_DISPATCH_KEY: 'llave-de-prueba', N8N_WEBHOOK_BASE: 'https://n8n-production-72be.up.railway.app/webhook', ZERO_RISK_API_URL: 'https://zero-risk-platform.vercel.app' }
export const UUID = '3f2b8c1e-9d4a-4b7e-8a61-0c5d2e7f9a10'

/** un nodo NUEVO de J7 (la puerta o la cadena de versiones del plan): corre con su código real en las pruebas */
export const esDeLaPuerta = (n: string) => NOMBRES_DE_LA_PUERTA.includes(n) || NOMBRES_DE_LA_CADENA.includes(n)

/** una respuesta de la ruta en el formato de un nodo HTTP con respuesta completa */
export const resp = (statusCode: number, body: Json) => ({ statusCode, body })

export interface Opciones {
  inicio: string
  items: Json[]
  previos?: Record<string, Json | Json[]>
  /** respuestas de los nodos JEF · abrir / despertar / leer (por nombre) y de cualquier otro httpRequest que se quiera contestar distinto del eco */
  http?: Record<string, (cuerpo: any, ctx: any) => any>
  /** nodos originales con salida propia en vez del eco */
  stubs?: Record<string, (items: any[], ctx: any) => any>
  /** nodos originales que corren con su código REAL en vez del eco */
  reales?: string[]
}

/** corre desde `inicio` (su salida = `items`): los nodos originales devuelven un eco `{ _nodo, _recibio }`; los de la puerta corren de verdad */
export async function ejecutar(flujo: Json, o: Opciones): Promise<any> {
  const stubs: Record<string, any> = {}
  for (const n of flujo.nodes as Json[]) {
    if (esDeLaPuerta(n.name) || (o.reales ?? []).includes(n.name) || (o.http && n.name in o.http)) continue
    if (n.type === 'n8n-nodes-base.code' || n.type === 'n8n-nodes-base.httpRequest') {
      stubs[n.name] = (items: any[]) => [{ json: { _nodo: n.name, _recibio: items.map((i) => i.json) } }]
    }
  }
  Object.assign(stubs, o.stubs ?? {})
  return correr(flujo, { inicio: o.inicio, itemsDeInicio: o.items.map((json) => ({ json })), previos: o.previos ?? {}, stubs, http: o.http ?? {}, env: ENV })
}

/** lo que recibió cada nodo ORIGINAL (sin los de la puerta), en orden */
export const recibidoPorLosOriginales = (r: { visitas: Array<{ nodo: string; entrada: any }> }) => r.visitas.filter((v) => !esDeLaPuerta(v.nodo)).map((v) => ({ nodo: v.nodo, entrada: v.entrada }))

export const nombresDe = (f: Json) => (f.nodes as Json[]).map((n) => n.name as string)

/** los nodos originales no cambian, salvo los `retocados` (que se prueban aparte) */
export const igualesSinPuerta = (antes: Json, despues: Json, retocados: string[] = []) => {
  const a = new Map((antes.nodes as Json[]).map((n) => [n.name, JSON.stringify(n)]))
  const originales = (despues.nodes as Json[]).filter((n) => !esDeLaPuerta(n.name))
  return originales.length === a.size && originales.every((n) => retocados.includes(n.name) || a.get(n.name) === JSON.stringify(n))
}

/** la estructura que TODO enganche cumple */
export function estructura(nombre: string, antes: Json, despues: Json, o: { desde: string; salida: number; retocados?: string[]; nodosNuevosExtra?: string[]; /** si la puerta sigue con una continuación: el primero y el último nodo de ella */ continuacion?: { entrada: string; salida: string } }) {
  const nuevosDeLaPuerta = [...NOMBRES_DE_LA_PUERTA, ...(o.nodosNuevosExtra ?? [])]
  describe(`estructura · ${nombre}`, () => {
    it('los nodos que ya existían NO cambian ni una coma (solo se suman los de la puerta' + ((o.retocados ?? []).length ? ` y se retoca solo: ${(o.retocados ?? []).join(', ')}` : '') + ')', () => {
      expect(igualesSinPuerta(antes, despues, o.retocados)).toBe(true)
    })
    it('se suman exactamente los nodos de la puerta' + ((o.nodosNuevosExtra ?? []).length ? ' y de su continuación' : ' (12)') + ', con nombres únicos', () => {
      const nuevos = nombresDe(despues).filter((n) => !nombresDe(antes).includes(n))
      expect(nuevos.sort()).toEqual([...nuevosDeLaPuerta].sort())
      expect(new Set(nombresDe(despues)).size).toBe(nombresDe(despues).length)
    })
    it('lo que salía del nodo de origen ahora pasa por la puerta y sale de ' + (o.continuacion ? `«${o.continuacion.salida}»` : '«JEF · aplicar»') + ' hacia los MISMOS destinos', () => {
      const destinosAntes = antes.connections[o.desde].main[o.salida]
      expect(despues.connections[o.desde].main[o.salida]).toEqual([{ node: N.armar, type: 'main', index: 0 }])
      if (o.continuacion) {
        expect(despues.connections[N.aplicar].main[0]).toEqual([{ node: o.continuacion.entrada, type: 'main', index: 0 }])
        expect(despues.connections[o.continuacion.salida].main[0]).toEqual(destinosAntes)
      } else expect(despues.connections[N.aplicar].main[0]).toEqual(destinosAntes)
    })
    it('los demás enlaces originales quedan iguales', () => {
      for (const [de, c] of Object.entries(antes.connections as Json)) {
        (c as Json).main.forEach((salida: Json[], i: number) => { if (!(de === o.desde && i === o.salida)) expect(despues.connections[de].main[i]).toEqual(salida) })
      }
    })
    it('todo enlace nuevo apunta a un nodo que existe y todo nodo nuevo es alcanzable desde «JEF · armar»', () => {
      const existen = new Set(nombresDe(despues))
      for (const c of Object.values(despues.connections as Json)) for (const s of (c as Json).main) for (const d of s) expect(existen.has(d.node)).toBe(true)
      const visto = new Set<string>([N.armar]); const cola = [N.armar]
      while (cola.length) { const x = cola.shift() as string; for (const s of despues.connections[x]?.main ?? []) for (const d of s) if (!visto.has(d.node)) { visto.add(d.node); cola.push(d.node) } }
      for (const n of nuevosDeLaPuerta) expect(visto.has(n)).toBe(true)
    })
    it('NINGÚN nodo de la puerta se reintenta solo y todos los HTTP entregan siempre salida (nunca rompen el flujo)', () => {
      for (const n of (despues.nodes as Json[]).filter((x) => nuevosDeLaPuerta.includes(x.name))) {
        expect(n.retryOnFail ?? false).toBe(false)
        if (n.type === 'n8n-nodes-base.httpRequest') {
          expect(n.onError).toBe('continueRegularOutput')
          expect(n.parameters.options.response.response.neverError).toBe(true)
          expect(n.parameters.options.response.response.fullResponse).toBe(true)
        }
      }
    })
    it('ninguna llave pegada: la de despacho se lee del entorno', () => {
      const s = JSON.stringify(despues)
      expect(s).not.toMatch(/[0-9a-f]{64}/)
      expect(s).not.toMatch(/eyJ[A-Za-z0-9_-]{20,}/)
      expect(s).not.toMatch(/(?<![A-Za-z-])sk-[A-Za-z0-9_-]{20,}/)
      const abrir = (despues.nodes as Json[]).find((n) => n.name === N.abrir) as Json
      expect(JSON.stringify(abrir.parameters.headerParameters)).toContain('$env.SALA_DISPATCH_KEY')
      for (const n of (despues.nodes as Json[]).filter((x) => nuevosDeLaPuerta.includes(x.name) && x.type === 'n8n-nodes-base.httpRequest')) expect(JSON.stringify(n.parameters)).not.toMatch(/Bearer [A-Za-z0-9._-]{25,}/)
    })
    it('la puerta llama a las rutas de la jefatura y al flujo de turno, y a nada más', () => {
      const urls = (despues.nodes as Json[]).filter((n) => NOMBRES_DE_LA_PUERTA.includes(n.name) && n.parameters.url).map((n) => String(n.parameters.url))
      expect(urls.length).toBe(3)
      for (const u of urls) expect(u).toMatch(/\/api\/jefatura\/revisiones|\/zero-risk\/jefatura-turno/)
      // la continuación (solo el plan) además lee y escribe client_historical_outputs: ninguna otra tabla, ninguna otra ruta
      for (const n of (despues.nodes as Json[]).filter((x) => (o.nodosNuevosExtra ?? []).includes(x.name) && x.parameters.url)) expect(String(n.parameters.url)).toMatch(/\/api\/jefatura\/revisiones|\/rest\/v1\/client_historical_outputs/)
    })
  })
}
