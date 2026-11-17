/**
 * SERVICIO DE RENDER HTML · Railway (Sprint 2 · S2-5 · CC2 · GO Lenovo 17-nov 02:47; crear el servicio aprobado, en modo que duerme).
 *
 *  GET  /salud                    sin llave · para el chequeo de Railway
 *  POST /png                      {html, ancho, alto} → image/png (el anuncio fijo de la plantilla #1068)
 *  POST /video                    {html, ancho, alto, segundos, fps?, calidad?, archivos:[{nombre,url}]} → 202 {id} (trabajo en fila)
 *  GET  /video/:id                → {id, estado: en_fila|rindiendo|listo|fallido, error, segundos_de_render, bytes}
 *  GET  /video/:id/archivo        → video/mp4 (cuando está listo)
 *  POST /analizar                 {voz?:{nombre,url}, musica?:{nombre,url}, idioma?} → 202 {id} (Sprint 3 · T5 · CC4: palabras con su tiempo y golpes de la música, en la MISMA fila)
 *  GET  /analisis/:id             → {id, estado, error, resultado (cuando está listo): {palabras, inicio_de_voz, motor, golpes, bpm, confianza, avisos}}
 * Todo menos /salud exige la cabecera `x-render-key` igual a RENDER_HTML_KEY (sin llave configurada, nadie pasa).
 * Sin base de datos ni almacenamiento: la plataforma guarda el resultado donde corresponde.
 */
import { createServer } from 'node:http'
import { hostsPermitidos } from './logica'
import { ColaDeRenders } from './cola'
import { cerrarNavegador, renderPng } from './navegador'
import { renderVideo } from './video'
import { analizar } from './analisis'
import { crearAtender, json, type Pedido } from './rutas'

const PUERTO = Number(process.env.PORT ?? 3000)
const HOSTS = hostsPermitidos(process.env.RENDER_HTML_HOSTS)
// Sprint 3 · T5 · el análisis del sonido va en la MISMA fila que los renders: uno a la vez (whisper y Chrome no caben juntos en un servidor chico)
const cola = new ColaDeRenders<Pedido>((x, id) => (x.tipo === 'video' ? renderVideo(x.p, id) : analizar(x.p, id, process.env)))
const atender = crearAtender({ cola, analisis: new Set<string>(), hosts: HOSTS, llave: process.env.RENDER_HTML_KEY, renderPng })

const servidor = createServer((req, res) => {
  atender(req, res).catch((e: unknown) => {
    const codigo = (e as { codigo?: number }).codigo ?? 500
    if (!res.headersSent) json(res, codigo, { error: (e instanceof Error ? e.message : String(e)).slice(0, 500) })
    else res.destroy()
  })
})
servidor.requestTimeout = 5 * 60 * 1000
servidor.listen(PUERTO, () => console.log(`[render-html] escuchando en ${PUERTO} · hosts permitidos: ${HOSTS.size}`))

for (const s of ['SIGTERM', 'SIGINT'] as const) process.on(s, () => { void cerrarNavegador().finally(() => process.exit(0)) })
