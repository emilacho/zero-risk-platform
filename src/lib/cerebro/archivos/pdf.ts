/**
 * Lector de PDF en un PROCESO APARTE (relevo 4 · F1 de CC#3, ronda 2: proceso hijo en vez de hilo).
 * El PDF se lee en `trabajador-pdf.cjs` (donde vive `unpdf`/pdf.js), lanzado con `child_process.fork` como proceso independiente: con el montón topado
 * (`--max-old-space-size`), entorno vacío, un RELOJ DURO (SIGKILL desde afuera, a mitad de una página o de una descompresión) y un guardián de memoria dentro del propio proceso.
 * Por qué proceso y no hilo: cuando el montón de un hilo se agota, V8 puede abortar el proceso ENTERO (código 134); un proceso hijo muere SOLO y el principal sigue vivo.
 * FALLA CERRADO: si el proceso no arranca (no se puede crear, no encuentra su archivo o `unpdf`, no avisa que está listo a tiempo, el entorno no permite procesos hijos) el PDF NO
 * se lee y queda como archivo con ficha (`ilegible` con motivo `aislamiento_no_disponible`): nunca se lee un PDF sin aislamiento.
 * Un PDF escaneado se DECLARA como tal (no se inventa texto). Un PDF con JavaScript se lee como datos y se avisa. Sin red, sin disco, sin entorno.
 */
import { fork, type ChildProcess } from 'node:child_process'
import path from 'node:path'
import { lectura } from './comun'
import { TOPES } from './topes'
import type { LecturaDeArchivo } from './tipos'

export interface OpcionesDePdf {
  /** reloj duro, en milisegundos (por defecto 25 s) */
  tiempoMs?: number
  /** memoria TOTAL del proceso del PDF, en MB: al pasarla se mata (por defecto 1.024) */
  memoriaMaxMb?: number
  /** tope del montón de V8 del proceso del PDF, en MB (por defecto 512) */
  montonMaxMb?: number
  /** cuánto se espera a que el proceso avise que está listo (por defecto 10 s o el reloj, lo que sea menor) */
  arranqueMs?: number
  /** solo para pruebas: otro archivo de proceso (p. ej. uno que no existe, para probar que falla cerrado) */
  trabajador?: string
  /** solo para pruebas: topes de texto más chicos para no armar PDF enormes */
  topesDeTexto?: Partial<{ pdf_items_por_pagina: number; texto_salida_chars: number }>
}

export function clasificarErrorDePdf(e: unknown): 'protegido' | 'ilegible' {
  const nombre = e && typeof e === 'object' ? String((e as { name?: unknown }).name ?? '') : ''
  return nombre === 'PasswordException' ? 'protegido' : 'ilegible'
}

/** dónde está el archivo del proceso: parte de la raíz del proyecto (el mismo lugar relativo en el repositorio y en el empaquetado del servidor) */
export const RUTA_DEL_TRABAJADOR = path.join(process.cwd(), 'src', 'lib', 'cerebro', 'archivos', 'trabajador-pdf.cjs')

/** de a UN PDF por proceso principal: así lo que se vigila es la memoria de esa lectura y no la de varias a la vez */
let turno: Promise<unknown> = Promise.resolve()
let pendientes = 0

export function leerPdf(buf: Buffer, nombre: string, op: OpcionesDePdf = {}): Promise<LecturaDeArchivo> {
  if (buf.length > TOPES.pdf_bytes) return Promise.resolve(lectura('pdf', nombre, buf, 'sobre_el_tope', { motivo: `el PDF pesa ${buf.length} bytes (tope ${TOPES.pdf_bytes})` }))
  // tope de cola: un cliente no puede encolar PDF sin límite (la lectura que llegue de más se rechaza sin leer)
  if (pendientes >= TOPES.pdf_cola_max) return Promise.resolve(lectura('pdf', nombre, buf, 'ilegible', { motivo: `cola_llena: ya hay ${pendientes} PDF esperando turno (tope ${TOPES.pdf_cola_max}); intenta de nuevo luego` }))
  pendientes++
  const mio = turno.then(() => leerAislado(buf, nombre, op), () => leerAislado(buf, nombre, op))
  turno = mio.catch(() => undefined)
  return mio.finally(() => { pendientes-- })
}

/** lo que dejó escrito el proceso al morir: ¿se quedó sin memoria? (V8 o el guardián de memoria) */
const MURIO_POR_MEMORIA = /MEMORIA_AGOTADA|heap out of memory|Reached heap limit|Allocation failed|out of memory/i

function leerAislado(buf: Buffer, nombre: string, op: OpcionesDePdf): Promise<LecturaDeArchivo> {
  const tiempoMs = op.tiempoMs ?? TOPES.tiempo_ms
  const memoriaMaxMb = op.memoriaMaxMb ?? 1024
  const arranqueMs = Math.min(op.arranqueMs ?? 10_000, tiempoMs)
  const topes = { pdf_paginas: TOPES.pdf_paginas, pdf_items_por_pagina: TOPES.pdf_items_por_pagina, texto_salida_chars: TOPES.texto_salida_chars, ...op.topesDeTexto }
  const ruta = op.trabajador ?? RUTA_DEL_TRABAJADOR

  return new Promise<LecturaDeArchivo>((resolve) => {
    let hijo: ChildProcess | null = null
    let listo = false
    let terminado = false
    let errores = ''
    let reloj: ReturnType<typeof setTimeout> | undefined
    let arranque: ReturnType<typeof setTimeout> | undefined
    const fin = (r: LecturaDeArchivo) => {
      if (terminado) return
      terminado = true
      if (reloj) clearTimeout(reloj)
      if (arranque) clearTimeout(arranque)
      // el proceso se MATA siempre al terminar (haya contestado o no): no queda trabajo en segundo plano
      if (hijo && hijo.exitCode === null) { try { hijo.kill('SIGKILL') } catch { /* ya murió */ } }
      resolve(r)
    }
    const sinAislamiento = (causa: string) => fin(lectura('pdf', nombre, buf, 'ilegible', { motivo: `aislamiento_no_disponible: ${causa.slice(0, 200)}` }))

    try {
      hijo = fork(ruta, [], { execArgv: [`--max-old-space-size=${op.montonMaxMb ?? 512}`], env: {} as NodeJS.ProcessEnv, serialization: 'advanced', stdio: ['ignore', 'ignore', 'pipe', 'ipc'] })
    } catch (e) {
      return sinAislamiento(`no se pudo crear el proceso (${e instanceof Error ? e.message : String(e)})`)
    }

    hijo.stderr?.on('data', (d: Buffer) => { if (errores.length < 4000) errores += d.toString('utf8') })
    arranque = setTimeout(() => { if (!listo) sinAislamiento(`el proceso no avisó que estaba listo en ${arranqueMs} ms`) }, arranqueMs)
    reloj = setTimeout(() => fin(lectura('pdf', nombre, buf, 'ilegible', { motivo: 'tiempo_agotado' })), tiempoMs)

    hijo.on('message', (m: { tipo?: string; resultado?: Record<string, unknown>; nombre?: string; mensaje?: string }) => {
      if (m.tipo === 'listo') {
        listo = true
        if (arranque) clearTimeout(arranque)
        hijo?.send({ datos: new Uint8Array(buf), topes, limite_mb: memoriaMaxMb })
      } else if (m.tipo === 'resultado' && m.resultado) {
        const { estado, texto, paginas, paginas_sin_texto, avisos, motivo } = m.resultado as { estado: LecturaDeArchivo['estado']; texto: string; paginas?: number; paginas_sin_texto?: number[]; avisos?: string[]; motivo?: string }
        fin(lectura('pdf', nombre, buf, estado, { texto: texto ?? '', avisos: avisos ?? [], ...(paginas !== undefined ? { paginas } : {}), ...(paginas_sin_texto ? { paginas_sin_texto } : {}), ...(motivo ? { motivo } : {}) }))
      } else if (m.tipo === 'error') {
        const estado = clasificarErrorDePdf({ name: m.nombre })
        fin(lectura('pdf', nombre, buf, estado, { motivo: estado === 'protegido' ? 'el PDF está protegido con contraseña' : `no se pudo leer el PDF (${(m.mensaje ?? '').slice(0, 160)})` }))
      }
    })
    hijo.on('error', (e: Error & { code?: string }) => sinAislamiento(`el proceso falló (${e.code ?? e.name}: ${e.message})`))
    hijo.on('exit', (codigo, senal) => {
      if (terminado) return
      if (!listo) return sinAislamiento(`el proceso terminó sin avisar (código ${codigo}, señal ${senal}) ${errores.replace(/\s+/g, ' ').slice(0, 100)}`)
      // murió SOLO (el principal sigue vivo): casi siempre es memoria; lo dice el propio proceso o V8 en la salida de errores, o el sistema lo mató (SIGKILL/SIGABRT)
      if (MURIO_POR_MEMORIA.test(errores) || senal === 'SIGKILL' || senal === 'SIGABRT' || codigo === 134) {
        return fin(lectura('pdf', nombre, buf, 'sobre_el_tope', { motivo: `memoria_agotada: el proceso del PDF murió solo (código ${codigo}, señal ${senal}); el principal sigue vivo` }))
      }
      fin(lectura('pdf', nombre, buf, 'ilegible', { motivo: `el proceso del PDF terminó sin dar respuesta (código ${codigo}, señal ${senal})` }))
    })
  })
}
