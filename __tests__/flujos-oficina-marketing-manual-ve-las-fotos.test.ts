/**
 * 19-nov · GO de Lenovo «la mesa creativa del manual ve las fotos» (CC2; certificó CC6, 🟡 menor: «ninguna prueba del repositorio mira estos 2 nodos»).
 * Ejecuta el CÓDIGO VIVO del nodo «[BB] Equipo · mesa creativa · preparar» (copia tomada con un GET después de aplicar, versionId c745d997)
 * con una base falsa de fotos. Fija:
 *  · el filtro: solo las propias, `ok`, sin duplicado, https y fuera de la carpeta de la web del cliente;
 *  · el orden por confianza y el tope de 20 (el máximo del cable `images`), con rótulo `foto:<id>` y modo base64;
 *  · la regla de los elementos reales IGUAL a la de la oficina (`REGLA_DE_LOS_ELEMENTOS_REALES`);
 *  · sin fotos o con la lectura caída, la tarea lo declara y el pedido va sin imágenes;
 *  · la evidencia y las partes creativas van ENTERAS (sin el tope viejo de 6 500).
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { REGLA_DE_LOS_ELEMENTOS_REALES } from '../src/lib/oficina/mesa/fotos-a-la-vista'

const copia = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', 'scripts/ops/oficina-marketing/vivo/ssLtwYPt7zxuvnM2-mesa-creativa-ve-las-fotos.json'), 'utf8'))
const codigoDe = (n: string): string => copia.nodes.find((x: { name: string }) => x.name === n).parameters.jsCode
const AsyncFunction = Object.getPrototypeOf(async function () { /* */ }).constructor as new (...a: string[]) => (...b: unknown[]) => Promise<Array<{ json: any }>>

type Fila = Record<string, unknown>
const foto = (n: number, extra: Fila = {}): Fila => ({ id: `f-${n}`, url: `https://almacen.test/client-social-images/c-1/propio/f-${n}.jpg`, estado: 'ok', owner_role: 'propio', duplicado_de: null, etiqueta_confianza: 'media', que_muestra: `la foto ${n}`, ...extra })

async function preparar(o: { filas?: Fila[]; falla?: boolean; respuesta?: unknown; grounding?: Record<string, unknown>; draft?: Record<string, unknown> } = {}) {
  const lecturas: string[] = []
  const helpers = {
    httpRequest: async (r: { url: string; method: string }) => {
      lecturas.push(`${r.method} ${r.url}`)
      if (o.falla) throw new Error('base caída')
      if ('respuesta' in o) return o.respuesta
      return o.filas ?? []
    },
  }
  const $ = (n: string) => { if (n !== 'Validate Deal Data') throw new Error('nodo no previsto ' + n); return { first: () => ({ json: { client_id: 'c-1' } }), all: () => [] } }
  const $json = { brand_book_draft: o.draft ?? { voice_description: 'Voz directa.' }, _grounding_refs: o.grounding ?? { discovery_summary: 'Cevichería familiar.' }, _equipo: {} }
  const fn = new AsyncFunction('$', '$json', '$env', '$execution', codigoDe('[BB] Equipo · mesa creativa · preparar'))
  const out = await fn.call({ helpers }, $, $json, { SUPABASE_SERVICE_ROLE_KEY: 'k', ZERO_RISK_API_URL: 'https://app.test', INTERNAL_API_KEY: 'k' }, { id: '777' })
  const pedidos = out.filter((x) => x.json._eq_body)
  return { lecturas, pedidos, body: pedidos[0]?.json._eq_body as { task: string; images?: Array<{ url: string; label: string }>; images_mode?: string } | undefined }
}

describe('la mesa creativa del manual ve las fotos (código vivo)', () => {
  it('lee las fotos UNA vez, solo con GET, solo las propias en ok del cliente', async () => {
    const { lecturas, pedidos } = await preparar({ filas: [foto(1)] })
    expect(pedidos).toHaveLength(1)
    expect(lecturas).toHaveLength(1)
    expect(lecturas[0]).toMatch(/^GET .*\/rest\/v1\/client_social_images\?client_id=eq\.c-1&owner_role=eq\.propio&estado=eq\.ok/)
  })

  it('el filtro: fuera las ajenas, las que no están ok, las duplicadas, las http, las de la web del cliente y las sin url o id', async () => {
    const filas = [
      foto(1),
      foto(2, { owner_role: 'competidor' }),
      foto(3, { estado: 'no_bajo' }),
      foto(4, { duplicado_de: 'f-1' }),
      foto(5, { url: 'http://almacen.test/f-5.jpg' }),
      foto(6, { url: 'https://almacen.test/CLIENT-WEBSITES/c-1/f-6.jpg' }),
      foto(7, { url: null }),
      foto(8, { id: null }),
      foto(9),
    ]
    const { body } = await preparar({ filas })
    expect(body!.images!.map((i) => i.label)).toEqual(['foto:f-1', 'foto:f-9'])
  })

  it('por confianza (alta, media, baja, sin dato) y, a igual confianza, en el orden de la base; tope 20; rótulo foto:<id>; base64', async () => {
    const filas = [
      ...Array.from({ length: 25 }, (_, i) => foto(i + 1, { etiqueta_confianza: i % 2 ? 'baja' : null })),
      foto(90, { etiqueta_confianza: 'media' }),
      foto(91, { etiqueta_confianza: 'alta' }),
    ]
    const { body } = await preparar({ filas })
    expect(body!.images).toHaveLength(20)
    expect(body!.images!.slice(0, 2).map((i) => i.label)).toEqual(['foto:f-91', 'foto:f-90'])
    expect(body!.images![2].label).toBe('foto:f-2')
    expect(body!.images![0]).toEqual({ url: 'https://almacen.test/client-social-images/c-1/propio/f-91.jpg', label: 'foto:f-91' })
    expect(body!.images_mode).toBe('base64')
  })

  it('la tarea lleva la regla de los elementos reales de la oficina, ENTERA, y la lista de las fotos a la vista', async () => {
    const { body } = await preparar({ filas: [foto(1, { que_muestra: 'el personaje de la marca con gorra dorada' })] })
    expect(body!.task).toContain(REGLA_DE_LOS_ELEMENTOS_REALES)
    expect(body!.task).toContain('nunca se dibuja «uno parecido»')
    expect(body!.task).toContain('creación nueva · basada en foto:<id>')
    expect(body!.task).toContain('### Fotos a la vista (1)\n- foto:f-1 · el personaje de la marca con gorra dorada')
  })

  it('sin fotos: el pedido va sin imágenes y la tarea lo dice', async () => {
    const { body } = await preparar({ filas: [] })
    expect(body!.images).toBeUndefined()
    expect(body!.images_mode).toBeUndefined()
    expect(body!.task).toContain('todavía no tiene fotos propias')
    expect(body!.task).not.toContain('Las fotos están a la vista')
  })

  it('la lectura cae: el nodo no se cae, el pedido va sin imágenes y la tarea lo dice', async () => {
    const { pedidos, body } = await preparar({ falla: true })
    expect(pedidos).toHaveLength(1)
    expect(body!.images).toBeUndefined()
    expect(body!.task).toContain('No se pudieron leer las fotos del cliente')
  })

  // m9 de CC6: una respuesta que no es lista (un error en cuerpo 200, un objeto) es «no se pudieron leer», nunca «no tiene fotos»
  for (const respuesta of [{ message: 'JWT expired' }, null, 'texto', { data: [] }]) {
    it(`la base contesta algo que no es una lista (${JSON.stringify(respuesta)}): se declara «no se pudieron leer»`, async () => {
      const { body } = await preparar({ respuesta })
      expect(body!.images).toBeUndefined()
      expect(body!.task).toContain('No se pudieron leer las fotos del cliente')
      expect(body!.task).not.toContain('todavía no tiene fotos propias')
    })
  }

  it('la evidencia y las partes creativas van ENTERAS (sin el tope viejo de 6 500)', async () => {
    const largo = (k: string) => `${k}:${'x'.repeat(30000)}:FIN-${k}`
    const { body } = await preparar({ filas: [foto(1)], grounding: { materia_cliente: largo('materia'), discovery_summary: largo('discovery'), icp_signals: largo('icp'), competitors: largo('competidores') }, draft: { voice_description: largo('voz') } })
    for (const k of ['materia', 'discovery', 'icp', 'competidores', 'voz']) expect(body!.task).toContain(`:FIN-${k}`)
    expect(body!.task).not.toContain('no cupo')
  })

  it('el nodo «recoger» no lee fotos (solo «preparar» las lee)', () => {
    const c = codigoDe('[BB] Equipo · mesa creativa')
    expect(c).toContain("MODO === 'preparar' ? await leerFotosDelManual(")
    expect(c).not.toContain('6500')
  })
})
