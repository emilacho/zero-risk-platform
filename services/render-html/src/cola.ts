/**
 * La fila de renders de video (S2-5 · CC2). Pura: quien dibuja se inyecta (en pruebas, un doble).
 *  · UN render a la vez (Chrome + ffmpeg en un servidor chico: dos a la vez se ahogan);
 *  · fila corta: lo que no cabe se rechaza (la plataforma reintenta), nunca se acumula sin límite;
 *  · lo terminado se guarda un rato para que la plataforma lo baje, y después se borra;
 *  · el servicio duerme si nadie le pide nada: la fila vive en memoria (si se reinicia, la plataforma ve «no existe» y pide de nuevo).
 */
import { randomUUID } from 'node:crypto'
import { LIMITES } from './logica'

export type EstadoDelTrabajo = 'en_fila' | 'rindiendo' | 'listo' | 'fallido'
export interface Trabajo<P> {
  id: string
  estado: EstadoDelTrabajo
  pedido: P | null
  creado: number
  empezado: number | null
  terminado: number | null
  error: string | null
  mp4: Buffer | null
  segundos_de_render: number | null
}
export type Dibujante<P> = (pedido: P, id: string) => Promise<Buffer>

export class ColaDeRenders<P> {
  private trabajos = new Map<string, Trabajo<P>>()
  private fila: string[] = []
  private corriendo: string | null = null

  constructor(private dibujar: Dibujante<P>, private reloj: () => number = Date.now, private filaMax: number = LIMITES.fila_max, private ttlMs: number = LIMITES.resultado_ttl_ms) {}

  /** agrega un trabajo; sin lugar en la fila ⇒ null (el servidor contesta 429) */
  agregar(pedido: P): Trabajo<P> | null {
    this.limpiar()
    if (this.fila.length >= this.filaMax) return null
    const t: Trabajo<P> = { id: randomUUID(), estado: 'en_fila', pedido, creado: this.reloj(), empezado: null, terminado: null, error: null, mp4: null, segundos_de_render: null }
    this.trabajos.set(t.id, t)
    this.fila.push(t.id)
    void this.siguiente()
    return t
  }

  ver(id: string): Trabajo<P> | null {
    this.limpiar()
    return this.trabajos.get(id) ?? null
  }

  /** cuántos hay ocupando el servicio (el que corre + los de la fila): con 0, el servicio puede dormir */
  ocupados(): number {
    return this.fila.length + (this.corriendo ? 1 : 0)
  }

  /** espera a que la fila se vacíe (solo pruebas) */
  async vaciar(): Promise<void> {
    while (this.ocupados() > 0) await new Promise((r) => setTimeout(r, 1))
  }

  private async siguiente(): Promise<void> {
    if (this.corriendo) return
    const id = this.fila.shift()
    if (!id) return
    const t = this.trabajos.get(id)
    if (!t || !t.pedido) return this.siguiente()
    this.corriendo = id
    t.estado = 'rindiendo'
    t.empezado = this.reloj()
    try {
      t.mp4 = await this.dibujar(t.pedido, id)
      t.estado = 'listo'
    } catch (e) {
      t.estado = 'fallido'
      t.error = (e instanceof Error ? e.message : String(e)).slice(0, 2000)
    } finally {
      t.terminado = this.reloj()
      t.segundos_de_render = Math.round(((t.terminado - (t.empezado ?? t.terminado)) / 1000) * 10) / 10
      // el pedido (documento + direcciones) no se guarda después de usarlo
      t.pedido = null
      this.corriendo = null
    }
    return this.siguiente()
  }

  /** lo terminado hace más del tiempo de guarda se borra (con su video) */
  private limpiar(): void {
    const ahora = this.reloj()
    for (const [id, t] of this.trabajos) if (t.terminado !== null && ahora - t.terminado > this.ttlMs) this.trabajos.delete(id)
  }
}

/** lo que se contesta del estado de un trabajo (nunca el video ni el pedido) */
export function estadoPublico<P>(t: Trabajo<P>): Record<string, unknown> {
  return { id: t.id, estado: t.estado, error: t.error, segundos_de_render: t.segundos_de_render, bytes: t.mp4?.length ?? null }
}
