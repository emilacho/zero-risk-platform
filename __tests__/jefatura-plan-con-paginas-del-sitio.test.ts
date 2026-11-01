/**
 * Hallazgo en el primer «Pedir cambios» de Emilio (01-nov): ese camino no corre los brazos, el flujo declara «SIN PÁGINAS DEL SITIO» y el revisor marcó como falsos un precio y una frase reales,
 * aunque se le advirtió. El revisor recibe las páginas de verdad. Condiciones de CC3. US$ 0, sin red.
 */
import { describe, expect, it } from 'vitest'
import { almacenEnMemoria, puertosDePrueba, sobre } from './_helpers/jefatura-revision'
import { DbFalsa } from '../src/lib/oficina/__tests__/dbfalsa'
import { abrirRevision } from '../src/lib/jefatura/revision/orquestador'
import { conLasPaginasDelSitio, paginasPropiasDelSitio, TOPE_DE_LAS_PAGINAS, type PaginasDelSitio } from '../src/lib/jefatura/revision/carpeta-para-revisar'
import { crearPuertos } from '../src/lib/jefatura/revision/adaptadores'

const C = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
// el texto EXACTO que recibió el revisor en la corrida 210596
const BLOQUE_DEL_FLUJO = { titulo: 'Páginas del sitio del cliente', funcion: 'lo que publica', texto: 'SIN PÁGINAS DEL SITIO en el material de este plan. No marques como inventado un precio o un dato que pudiera venir del sitio sin poder contrastarlo.' }
const OTRO = { titulo: 'Manual de marca vigente', funcion: 'la vara', texto: 'el manual' }
const pagina = (o: Record<string, unknown>) => ({ client_id: C, competitor_id: null, owner_role: 'propio', url: 'https://x.test/', content_text: 'Encebollado $4.00. Hecho con alma de playa.', ...o })

describe('el revisor recibe las páginas de verdad', () => {
  const hay: PaginasDelSitio = { estado: 'hay', texto: '## https://x.test/\nEncebollado $4.00' }
  it('🔴 el bloque del camino sin brazos cambia por las páginas, y su advertencia desaparece', () => {
    const r = conLasPaginasDelSitio([OTRO, BLOQUE_DEL_FLUJO], hay)
    expect(r[1].texto).toContain('Encebollado $4.00')
    expect(r[1].texto).not.toMatch(/SIN P[AÁ]GINAS|No marques/)
    expect(r[0]).toEqual(OTRO)
  })
  it('🔴 si el cliente no tiene páginas, la ausencia se sigue declarando: no se inventa nada', () => {
    expect(conLasPaginasDelSitio([BLOQUE_DEL_FLUJO], { estado: 'no_hay' })).toEqual([BLOQUE_DEL_FLUJO])
  })
  it('si no se pudieron leer, lo dice y no pasa como que no existen', () => {
    expect(conLasPaginasDelSitio([BLOQUE_DEL_FLUJO], { estado: 'no_se_pudo', detalle: 'caída' })[0].texto).toMatch(/No se pudieron leer[^]*caída[^]*No las tomes como que no existen/)
  })
  it('las páginas que ya trajo el brazo no se tocan, y otro documento que diga lo mismo tampoco', () => {
    const delBrazo = { ...BLOQUE_DEL_FLUJO, texto: '{"titulo":"Inicio"}' }
    expect(conLasPaginasDelSitio([delBrazo], hay)).toEqual([delBrazo])
    const otroDoc = { ...OTRO, texto: 'SIN PÁGINAS DEL SITIO, dice el manual' }
    expect(conLasPaginasDelSitio([otroDoc], hay)).toEqual([otroDoc])
  })
})

describe('leer las páginas', () => {
  it('solo las propias de este cliente; una vacía no cuenta; sin páginas lo dice', async () => {
    const db = new DbFalsa().semilla('client_web_pages', [pagina({}), pagina({ url: 'https://c.test/', competitor_id: 'k', content_text: 'DE LA COMPETENCIA' }), pagina({ url: 'https://o.test/', client_id: 'otro', content_text: 'DE OTRO' }), pagina({ url: 'https://v.test/', content_text: '  ' })])
    const r = await paginasPropiasDelSitio(db as never, C)
    expect(r.estado).toBe('hay')
    const t = (r as { texto: string }).texto
    expect(t).toContain('alma de playa'); expect(t).not.toMatch(/COMPETENCIA|DE OTRO|v\.test/)
    expect(await paginasPropiasDelSitio(new DbFalsa() as never, C)).toEqual({ estado: 'no_hay' })
  })
  it('🔴 un sitio enorme: ninguna página se corta; la que no cabe queda fuera y se nombra', async () => {
    const grande = 'x'.repeat(TOPE_DE_LAS_PAGINAS - 100)
    const db = new DbFalsa().semilla('client_web_pages', [pagina({ url: 'https://a.test/', content_text: grande }), pagina({ url: 'https://b.test/', content_text: 'y'.repeat(5_000) }), pagina({ url: 'https://c.test/', content_text: 'cabe' })])
    const t = ((await paginasPropiasDelSitio(db as never, C)) as { texto: string }).texto
    expect(t).toContain(grande)
    expect(t).toContain('cabe')
    expect(t).not.toContain('yyy')
    expect(t).toMatch(/no entraron estas páginas del sitio: https:\/\/b\.test\//)
    expect(t.length).toBeLessThanOrEqual(TOPE_DE_LAS_PAGINAS + 200)
  })
  it('una base caída no lanza', async () => {
    expect(await paginasPropiasDelSitio({ from() { throw new Error('caída') } } as never, C)).toEqual({ estado: 'no_se_pudo', detalle: 'caída' })
  })
})

describe('🔴 de punta a punta: abrir la revisión de un plan desde «Pedir cambios» (sin brazos)', () => {
  const abrir = async (p: { paginas?: PaginasDelSitio; contexto?: unknown[] }) => {
    const mem = almacenEnMemoria()
    const { P } = puertosDePrueba({ almacen: mem })
    let lecturas = 0
    if (p.paginas) P.paginasDelSitio = async () => { lecturas++; return p.paginas as PaginasDelSitio }
    const r = await abrirRevision(P, sobre('plan', { payload: { contexto: p.contexto ?? [OTRO, BLOQUE_DEL_FLUJO] } }))
    const id = String(r.cuerpo.revision_id)
    return { r, lecturas, guardado: (await P.almacen.leerRevision(id))?.entrada.contexto, pedido: JSON.stringify(r.cuerpo) }
  }
  it('lo guardado y lo que recibe el agente llevan las páginas, no el aviso', async () => {
    const { guardado, pedido } = await abrir({ paginas: { estado: 'hay', texto: '## https://x.test/\nEncebollado $4.00' } })
    expect(guardado?.[1].texto).toContain('Encebollado $4.00')
    expect(pedido).toContain('Encebollado $4.00')
    expect(pedido).not.toMatch(/SIN P[AÁ]GINAS DEL SITIO/)
  })
  it('un cliente sin páginas sigue declarado', async () => {
    const { guardado } = await abrir({ paginas: { estado: 'no_hay' } })
    expect(guardado?.[1]).toEqual(BLOQUE_DEL_FLUJO)
  })
  it('si el flujo ya trajo las páginas, no se consulta la base', async () => {
    const delBrazo = { ...BLOQUE_DEL_FLUJO, texto: '{"titulo":"Inicio"}' }
    const { lecturas, guardado } = await abrir({ paginas: { estado: 'hay', texto: 'OTRA' }, contexto: [delBrazo] })
    expect(lecturas).toBe(0)
    expect(guardado?.[0]).toEqual(delBrazo)
  })
  it('los puertos reales traen esa lectura', () => {
    expect(typeof crearPuertos(new DbFalsa() as never, {} as never).paginasDelSitio).toBe('function')
  })
})
