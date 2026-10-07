/**
 * Lector de PDF AISLADO (relevo 4 · hallazgo F1 de CC#3, decisión de Lenovo «opción b»).
 * El PDF se lee en un HILO APARTE (`trabajador-pdf.cjs`, donde vive `unpdf`/pdf.js) con la memoria del montón topada y bajo un RELOJ DURO: al vencer el tiempo o
 * al crecer la memoria del proceso más de lo permitido, el hilo se MATA desde afuera —a mitad de una página, a mitad de una descompresión— y se declara
 * `tiempo_agotado` o `sobre_el_tope`. El proceso principal no se cuelga ni muere. Nada de revisar el PDF «por texto»: lo que protege es el aislamiento.
 * FALLA CERRADO: si el hilo no arranca (no se puede crear, no encuentra su archivo o `unpdf`, no avisa que está listo a tiempo) el PDF NO se lee y queda como
 * archivo con ficha (`ilegible` con motivo `aislamiento_no_disponible`): nunca se lee un PDF sin aislamiento.
 * Un PDF escaneado se DECLARA como tal (no se inventa texto). Un PDF con JavaScript se lee como datos y se avisa. Sin red, sin disco, sin entorno.
 */
import { Worker } from 'node:worker_threads'
import path from 'node:path'
import { lectura } from './comun'
import { TOPES } from './topes'
import type { LecturaDeArchivo } from './tipos'

export interface OpcionesDePdf {
  /** reloj duro, en milisegundos (por defecto 25 s) */
  tiempoMs?: number
  /** cuánto puede crecer la memoria del proceso mientras el hilo lee, en MB (por defecto 1.024) */
  memoriaMaxMb?: number
  /** tope del montón del propio hilo, en MB (por defecto 512) */
  montonMaxMb?: number
  /** cuánto se espera a que el hilo avise que está listo (por defecto 10 s o el reloj, lo que sea menor) */
  arranqueMs?: number
  /** solo para pruebas: otro archivo de hilo (p. ej. uno que no existe, para probar que falla cerrado) */
  trabajador?: string
  /** solo para pruebas: topes de texto más chicos para no armar PDF enormes */
  topesDeTexto?: Partial<{ pdf_items_por_pagina: number; texto_salida_chars: number }>
}

export function clasificarErrorDePdf(e: unknown): 'protegido' | 'ilegible' {
  const nombre = e && typeof e === 'object' ? String((e as { name?: unknown }).name ?? '') : ''
  return nombre === 'PasswordException' ? 'protegido' : 'ilegible'
}

/** dónde está el archivo del hilo: parte de la raíz del proyecto (el mismo lugar relativo en el repositorio y en el empaquetado del servidor) */
export const RUTA_DEL_TRABAJADOR = path.join(process.cwd(), 'src', 'lib', 'cerebro', 'archivos', 'trabajador-pdf.cjs')

/** de a UN PDF por proceso: así la memoria que se vigila es la de esa lectura y no la de varias a la vez */
let turno: Promise<unknown> = Promise.resolve()

export function leerPdf(buf: Buffer, nombre: string, op: OpcionesDePdf = {}): Promise<LecturaDeArchivo> {
  if (buf.length > TOPES.pdf_bytes) return Promise.resolve(lectura('pdf', nombre, buf, 'sobre_el_tope', { motivo: `el PDF pesa ${buf.length} bytes (tope ${TOPES.pdf_bytes})` }))
  const mio = turno.then(() => leerAislado(buf, nombre, op), () => leerAislado(buf, nombre, op))
  turno = mio.catch(() => undefined)
  return mio
}

function leerAislado(buf: Buffer, nombre: string, op: OpcionesDePdf): Promise<LecturaDeArchivo> {
  const tiempoMs = op.tiempoMs ?? TOPES.tiempo_ms
  const memoriaMaxMb = op.memoriaMaxMb ?? 1024
  const arranqueMs = Math.min(op.arranqueMs ?? 10_000, tiempoMs)
  const topes = { pdf_paginas: TOPES.pdf_paginas, pdf_items_por_pagina: TOPES.pdf_items_por_pagina, texto_salida_chars: TOPES.texto_salida_chars, ...op.topesDeTexto }
  const ruta = op.trabajador ?? RUTA_DEL_TRABAJADOR

  return new Promise<LecturaDeArchivo>((resolve) => {
    let hilo: Worker | null = null
    let listo = false
    let terminado = false
    let reloj: ReturnType<typeof setTimeout> | undefined
    let arranque: ReturnType<typeof setTimeout> | undefined
    let vigia: ReturnType<typeof setInterval> | undefined
    const fin = (r: LecturaDeArchivo) => {
      if (terminado) return
      terminado = true
      if (reloj) clearTimeout(reloj)
      if (arranque) clearTimeout(arranque)
      if (vigia) clearInterval(vigia)
      // el hilo se MATA siempre al terminar (haya contestado o no): no queda trabajo en segundo plano
      if (hilo) void hilo.terminate().catch(() => undefined)
      resolve(r)
    }
    const sinAislamiento = (causa: string) => fin(lectura('pdf', nombre, buf, 'ilegible', { motivo: `aislamiento_no_disponible: ${causa.slice(0, 200)}` }))

    try {
      hilo = new Worker(ruta, { env: {}, resourceLimits: { maxOldGenerationSizeMb: op.montonMaxMb ?? 512, maxYoungGenerationSizeMb: 64, stackSizeMb: 4 } })
    } catch (e) {
      return sinAislamiento(`no se pudo crear el hilo (${e instanceof Error ? e.message : String(e)})`)
    }

    arranque = setTimeout(() => { if (!listo) sinAislamiento(`el hilo no avisó que estaba listo en ${arranqueMs} ms`) }, arranqueMs)
    reloj = setTimeout(() => fin(lectura('pdf', nombre, buf, 'ilegible', { motivo: 'tiempo_agotado' })), tiempoMs)

    hilo.on('message', (m: { tipo?: string; resultado?: Record<string, unknown>; nombre?: string; mensaje?: string }) => {
      if (m.tipo === 'listo') {
        listo = true
        if (arranque) clearTimeout(arranque)
        // la memoria se mide desde que el hilo está cargado: lo que crece después es lo que la lectura pide
        const base = process.memoryUsage.rss()
        vigia = setInterval(() => {
          const crecio = process.memoryUsage.rss() - base
          if (crecio > memoriaMaxMb * 1024 * 1024) fin(lectura('pdf', nombre, buf, 'sobre_el_tope', { motivo: `memoria_agotada: la lectura pidió más de ${memoriaMaxMb} MB` }))
        }, 20)
        hilo?.postMessage({ datos: new Uint8Array(buf), topes })
      } else if (m.tipo === 'resultado' && m.resultado) {
        const { estado, texto, paginas, paginas_sin_texto, avisos, motivo } = m.resultado as { estado: LecturaDeArchivo['estado']; texto: string; paginas?: number; paginas_sin_texto?: number[]; avisos?: string[]; motivo?: string }
        fin(lectura('pdf', nombre, buf, estado, { texto: texto ?? '', avisos: avisos ?? [], ...(paginas !== undefined ? { paginas } : {}), ...(paginas_sin_texto ? { paginas_sin_texto } : {}), ...(motivo ? { motivo } : {}) }))
      } else if (m.tipo === 'error') {
        const estado = clasificarErrorDePdf({ name: m.nombre })
        fin(lectura('pdf', nombre, buf, estado, { motivo: estado === 'protegido' ? 'el PDF está protegido con contraseña' : `no se pudo leer el PDF (${(m.mensaje ?? '').slice(0, 160)})` }))
      }
    })
    hilo.on('error', (e: Error & { code?: string }) => {
      if (!listo) return sinAislamiento(`el hilo falló al arrancar (${e.code ?? e.name}: ${e.message})`)
      if (e.code === 'ERR_WORKER_OUT_OF_MEMORY') return fin(lectura('pdf', nombre, buf, 'sobre_el_tope', { motivo: 'memoria_agotada: el hilo pasó su tope de montón' }))
      fin(lectura('pdf', nombre, buf, 'ilegible', { motivo: `no se pudo leer el PDF (${(e.message ?? '').slice(0, 160)})` }))
    })
    hilo.on('exit', (codigo) => {
      if (terminado) return
      if (!listo) return sinAislamiento(`el hilo terminó sin avisar (código ${codigo})`)
      fin(lectura('pdf', nombre, buf, 'ilegible', { motivo: `el hilo terminó sin dar respuesta (código ${codigo})` }))
    })
  })
}
