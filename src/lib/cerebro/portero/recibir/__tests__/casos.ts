/** PASO 7 · ayudas de prueba: una base simulada en memoria (lee y escribe las dos tablas), un modelo simulado y los materiales de los casos del dorado (Q1 bicicletas…). */
import type { Consulta, Fila, PeticionDeLectura } from '../../../consulta'
import type { PeticionAlModelo, RespuestaDelModelo } from '../../razonar'
import { type Almacen, type Cambios, type FilaDeFicha, type FilaDeIngreso, type ResultadoDeAlmacen } from '../tipos'

export const A = '11111111-1111-1111-1111-111111111111'
export const B = '22222222-2222-2222-2222-222222222222'
export const AHORA = new Date('2026-10-07T12:00:00.000Z')

/** El repuesto de 3 partes del caso Q1: nombre, precio, garantía */
export const REPUESTO = (precio = '40 USD', conGarantia = true): string =>
  ['Cadena reforzada Taurus 9v', `Precio: ${precio}`, ...(conGarantia ? ['Garantía: 12 meses desde la compra'] : [])].join('\n\n')
export const OTRO_REPUESTO = 'Pedal de plataforma Kora\n\nPrecio: 25 USD\n\nGarantía: 6 meses'
export const PAGINA = (extra = ''): string => [extra, REPUESTO(), OTRO_REPUESTO].filter(Boolean).join('\n\n')

type Tabla = Record<string, unknown>[]
export class BaseSimulada {
  ingresos: Tabla = []
  fichas: Tabla = []
  llamadas: string[] = []
  fallarEn: 'crear' | 'aplicar' | 'cerrar' | null = null
  /** simula una lectura que se queda corta: si se fija, `leer` devuelve esa cantidad de filas repetidas */
  filasFalsas: number | null = null
  errorDeLectura: string | null = null
  private n = 0

  consulta: Consulta = async (p: PeticionDeLectura) => {
    this.llamadas.push(`leer:${p.tabla}`)
    if (this.errorDeLectura) return { filas: [], error: this.errorDeLectura }
    const tabla = p.tabla === 'cerebro_ingresos' ? this.ingresos : p.tabla === 'cerebro_fichas' ? this.fichas : []
    let filas = tabla.filter((f) => Object.entries(p.donde).every(([k, v]) => (v === null ? f[k] === null || f[k] === undefined : f[k] === v)))
    if (this.filasFalsas !== null && p.tabla === 'cerebro_fichas') filas = Array.from({ length: this.filasFalsas }, () => ({ ...(filas[0] ?? { id: 'x', firmas: [] }) }))
    return { filas: filas.map((f) => ({ ...f })) as Fila[], error: null }
  }

  almacen: Almacen = {
    crearIngreso: async (fila: FilaDeIngreso): Promise<ResultadoDeAlmacen> => {
      this.llamadas.push('crearIngreso')
      if (this.fallarEn === 'crear') return { ok: false, detalle: 'base caída (crear)' }
      this.ingresos.push({ ...fila, creado_en: AHORA.toISOString() })
      return { ok: true, id: fila.id }
    },
    aplicar: async (c: Cambios): Promise<ResultadoDeAlmacen> => {
      this.llamadas.push('aplicar')
      if (this.fallarEn === 'aplicar') return { ok: false, detalle: 'base caída (aplicar)', compensado: true }
      // todo o nada: se prepara una copia y solo al final se reemplaza
      const fichas = [...this.fichas, ...c.fichas.map((f: FilaDeFicha) => ({ ...f, retirada_en: null, motivo_retirada: null, creado_en: AHORA.toISOString() }))]
      for (const id of c.heredadas) { const f = fichas.find((x) => x.id === id); if (f) f.reconfirmado_en = c.reconfirmado_en }
      for (const r of c.retiradas) { const f = fichas.find((x) => x.id === r.id); if (f) { f.retirada_en = c.retirada_en; f.motivo_retirada = r.motivo } }
      const ing = this.ingresos.find((x) => x.id === c.ingreso_id)
      if (ing) Object.assign(ing, c.final)
      this.fichas = fichas
      return { ok: true }
    },
    cerrarIngreso: async (id, final): Promise<ResultadoDeAlmacen> => {
      this.llamadas.push(`cerrar:${final.estado}`)
      if (this.fallarEn === 'cerrar') return { ok: false, detalle: 'base caída (cerrar)' }
      const ing = this.ingresos.find((x) => x.id === id)
      if (ing) Object.assign(ing, final)
      return { ok: true }
    },
  }

  /** ids de las fichas vivas de un cliente */
  vivas = (cliente: string): Tabla => this.fichas.filter((f) => f.client_id === cliente && !f.retirada_en && !f.descartada && !this.fichas.some((h) => h.version_de === f.id))
  nuevoId = (): string => `00000000-0000-4000-8000-${String(++this.n).padStart(12, '0')}`
}

export interface Espia { peticiones: PeticionAlModelo[]; registros: Record<string, unknown>[] }
export type Respuesta = (p: PeticionAlModelo, n: number) => RespuestaDelModelo | Error | Promise<RespuestaDelModelo | Error>

export const respuestaJson = (j: unknown, usage = { input_tokens: 2000, output_tokens: 300 }): RespuestaDelModelo => ({ texto: JSON.stringify(j), stop_reason: 'end_turn', usage })

/** los números «[n]» que trae el mensaje, en orden */
export const numerosDelMensaje = (p: PeticionAlModelo): number[] => {
  const m = p.messages[0].content
  const material = m.split('FICHAS YA ARCHIVADAS')[0]
  return [...material.matchAll(/^\[(\d+)\] /gm)].map((x) => Number(x[1]))
}

/** Modelo que hace lo razonable: UNA ficha por grupo de 3 segmentos seguidos (el repuesto de Q1), nunca copia texto */
export const modeloDeGrupos = (tam = 3): Respuesta => (p) => {
  const ns = numerosDelMensaje(p)
  const afectadas = [...p.messages[0].content.matchAll(/^\[F(\d+)\] /gm)].map((x) => Number(x[1]))
  const fichas = []
  for (let i = 0; i < ns.length; i += tam) {
    const grupo = ns.slice(i, i + tam)
    fichas.push({ clase: 'producto', titulo: `Cosa ${grupo[0]}`, que_es: 'una cosa', segmentos: grupo, producto: [`Cosa ${grupo[0]}`], sede: null, propiedad: 'propia', porque: 'es del cliente', reemplaza: i === 0 && afectadas.length ? afectadas[0] : null, plazo: 'precio_oferta_horario' })
  }
  return respuestaJson({ fichas, descartes: [], nota: '' })
}

export function crearModelo(respuesta: Respuesta) {
  const espia: Espia = { peticiones: [], registros: [] }
  let n = 0
  return {
    espia,
    llamarModelo: async (p: PeticionAlModelo): Promise<RespuestaDelModelo> => {
      espia.peticiones.push(p)
      const r = await respuesta(p, ++n)
      if (r instanceof Error) throw r
      return r
    },
    registrar: async (fila: Record<string, unknown>) => { espia.registros.push(fila); return { ok: true as const } },
  }
}

export const cuerpo = (extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  cliente: A, origen: 'su_fuente', fuente_ref: 'sitio:/repuestos', es_completa: true, workflow_id: 'wf-recibir', workflow_execution_id: 'ex-1', texto: PAGINA(), ...extra,
})
