/**
 * Encargo 7 (21-nov) · la etiqueta `red` SE GUARDA: la pasada diaria que clasifica lo ajeno la escribe en fotos y videos,
 * y las fichas nacen con ella (el portero y el brazo de archivo). Sin señal → null («no consta»). US$ 0 · base falsa.
 */
import { describe, expect, it } from 'vitest'
import { alimentarCliente } from '../alimentar'
import { clasificarPendientes } from '../origen-de-lo-ajeno'
import { archivarFichasDeBrazos } from '../brazos/archivo'
import type { FichaDeBrazo } from '../brazos/tipos'
import { redDeLaFicha } from '../../cerebro/portero/red-de-la-pieza'
import { crearBaseFalsa } from './base-falsa'
import { CASOS, montar, ON, tablas } from './fixtures-despertar'

const C1 = 'c0000000-0000-4000-8000-000000000001'
const AHORA = new Date('2026-11-21T12:00:00Z')
const CLIENTE = { id: C1, name: 'Cliente', website_url: 'https://cliente.ec', country: 'EC', config: {} }
const base = (imgs: Array<Record<string, unknown>>, vids: Array<Record<string, unknown>> = []) => crearBaseFalsa({
  clients: [CLIENTE], client_sedes: [], cerebro_tendencias: [], apify_raw: [], client_social_images: imgs, client_videos: vids,
})

describe('🔴 la clasificación diaria escribe la red junto con el papel', () => {
  it('cada foto con su red (instagram por el enlace, maps por el tipo); dos iguales con red distinta son DOS escrituras', async () => {
    const imgs = [
      { id: 'ig', client_id: C1, owner_role: 'competidor', handle: 'x', post_id: 'p1', tipo: 'post_image', post_url: 'https://www.instagram.com/p/a/', clasificado_en: null },
      { id: 'mp', client_id: C1, owner_role: 'competidor', handle: 'x', post_id: 'p2', tipo: 'maps_portada', caption: 'N · Guayaquil', clasificado_en: null },
      { id: 'sin', client_id: C1, owner_role: 'competidor', handle: 'x', post_id: 'p3', tipo: 'post_image', clasificado_en: null },
    ]
    const { db, escrituras } = base(imgs)
    const r = await clasificarPendientes(db, { clientId: C1, tabla: 'client_social_images', dry_run: false, ahora: AHORA })
    expect(r).toMatchObject({ estado: 'ok', clasificadas: 3 })
    expect(imgs[0]).toMatchObject({ red: 'instagram' })
    expect(imgs[1]).toMatchObject({ red: 'maps' })
    expect(imgs[2]).toMatchObject({ red: null })
    // «ig» y «sin» comparten la clasificación (mercado · sin_registro) pero NO la red: dos escrituras separadas
    const ups = escrituras.filter((e) => e.op === 'update' && e.tabla === 'client_social_images')
    expect(ups.length).toBe(3)
    expect(ups.every((e) => 'red' in (e.fila ?? {}))).toBe(true)
  })
  it('los videos igual: el reel de TikTok dice tiktok; en seco no se escribe nada', async () => {
    const vids = [{ id: 'v1', client_id: C1, owner_role: 'competidor', handle: 'x', post_id: 'r1', tipo: 'reel', post_url: 'https://www.tiktok.com/@x/video/1', clasificado_en: null }]
    const t = base([], vids)
    await clasificarPendientes(t.db, { clientId: C1, tabla: 'client_videos', dry_run: false, ahora: AHORA })
    expect(vids[0]).toMatchObject({ red: 'tiktok' })
    const seco = base([], [{ ...vids[0], red: undefined, clasificado_en: null }])
    await clasificarPendientes(seco.db, { clientId: C1, tabla: 'client_videos', dry_run: true, ahora: AHORA })
    expect(seco.escrituras).toEqual([])
  })
})

describe('🔴 las fichas nacen con su red (el brazo de archivo)', () => {
  const ficha = (o: Partial<FichaDeBrazo>): FichaDeBrazo => ({
    origen: 'fuente_foros', brazo: 'fuentes', ref: `brazo:x:${o.atributo ?? 'a'}`, clase: 'foro', titulo: 'hilo', contenido: 'texto del hilo',
    fecha_fuente: '2026-11-20', observado_en: AHORA.toISOString(), vigente_hasta: null, fuente_url: null, atributo: 'a1', decision: 'suma', alcance: 'mercado',
    ...o,
  } as FichaDeBrazo)
  it('el enlace manda (reddit → foros); sin enlace decide la clase (metrica → ventas); sin señal → null', async () => {
    const t = crearBaseFalsa({ clients: [CLIENTE], cerebro_fichas: [], cerebro_ingresos: [] })
    const r = await archivarFichasDeBrazos({
      db: t.db, ahora: AHORA, dry_run: false,
      fichas: [
        ficha({ fuente_url: 'https://www.reddit.com/r/quito/x', atributo: 'a1' }),
        ficha({ clase: 'metrica', ref: 'brazo:x:m', atributo: 'a2', origen: 'ventas_loyverse' as FichaDeBrazo['origen'] }),
        ficha({ clase: 'competidor_evaluacion', ref: 'brazo:x:e', atributo: 'a3' }),
      ],
    })
    expect(r.errores).toEqual([])
    expect(r.escritas).toBe(3)
    const filas = t.escrituras.filter((e) => e.tabla === 'cerebro_fichas' && e.op === 'insert').map((e) => e.fila!)
    expect(filas.map((f) => f.red)).toEqual(['foros', 'ventas', null])
  })
})

describe('🔴 las fichas del portero diario también nacen con su red', () => {
  it('la corrida real sobre el raspado de prueba: cada ficha insertada lleva la red de su clase o su enlace, y al menos una la tiene', async () => {
    const c = CASOS[0]
    const m = montar(tablas(c) as Record<string, Array<Record<string, unknown>>>)
    await alimentarCliente({ db: m.base.db, client_id: c.id, dry_run: false, interruptores: ON, ahora: new Date('2026-11-21T12:00:00Z'), gasto_de_hoy_usd: 0, workflow_id: 'ogfq56oIEoHufFPM', workflow_execution_id: 'ex-1' })
    const filas = m.base.escrituras.filter((e) => e.tabla === 'cerebro_fichas' && e.op === 'insert').map((e) => e.fila!)
    expect(filas.length).toBeGreaterThan(0)
    for (const f of filas) expect(f.red, `ficha ${String(f.ref)}`).toBe(redDeLaFicha({ clase: f.clase, fuente_url: f.fuente_url }))
    expect(filas.some((f) => f.red !== null && f.red !== undefined)).toBe(true)
  })
})
