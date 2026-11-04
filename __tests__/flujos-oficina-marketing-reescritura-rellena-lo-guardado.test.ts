/**
 * 04-nov · GO Lenovo «el juez ve lo mismo que el redactor»: en una reescritura la entrada se rellena con lo ya guardado (sitio propio y competidores) y declara su origen. Todo en seco (US$ 0).
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { construirReescrituraRellenaLoGuardado, N_SITIO, N_COMPETIDORES } from '../scripts/ops/oficina-marketing/reescritura-rellena-lo-guardado.mjs'

type Nodo = { name: string; parameters: Record<string, any> }
type Flujo = { nodes: Nodo[]; connections: Record<string, any> }
const ANTES = JSON.parse(readFileSync(join(process.cwd(), 'scripts/ops/oficina-marketing/respaldos/ujka3yHnKbjzXJJS-antes-de-rellenar-lo-guardado-2026-11-04.json'), 'utf8'))
const base = () => (ANTES.workflow || ANTES) as Flujo
const nuevo = () => { const f = structuredClone(base()); construirReescrituraRellenaLoGuardado(f); return f }
const ARMAR = '③ Armar la entrada del manual'
const PAGINAS = [{ url: 'https://x.ec', title: 'Inicio', content_text: 'Texto del sitio '.repeat(1000) + 'FIN_SITIO', crawled_at: '2026-11-04' }, { url: 'https://x.ec/menu', title: 'Menú', content_text: '  ' }]
const COMP = [{ competitor_name: 'Comp A', competitor_type: 'direct', value_proposition: 'precio bajo' }, { competitor_name: null }]

function armar(f: Flujo, sitio: unknown, comp: unknown) {
  const c = (f.nodes.find((n) => n.name === ARMAR) as Nodo).parameters.jsCode as string
  const ok = (body: unknown) => ({ first: () => ({ json: body === null ? { statusCode: 500, body: {} } : { statusCode: 200, body } }) })
  const dolar = (n: string) => {
    if (n === '⓪ Llave · Webhook · manual-cambios') return { first: () => ({ json: { sobre: { client_id: 'c', manual_base_id: 'm', manual_cambio_id: 'x', cambios_del_dueno: 'cambia', campos_validados: [] } } }) }
    if (n === '② Leer el manual vigente') return { first: () => ({ json: { statusCode: 200, body: [{ client_id: 'c', version: 5, content_text: JSON.stringify({ positioning: 'p' }) }] } }) }
    if (n === '② Leer la ficha del cliente') return { first: () => ({ json: { statusCode: 200, body: [{ name: 'N', industry: 'restaurante', website_url: 'https://x.ec' }] } }) }
    if (n === N_SITIO) return ok(sitio)
    if (n === N_COMPETIDORES) return ok(comp)
    throw new Error('nodo inesperado ' + n)
  }
  return new Function('$', c)(dolar)[0].json
}

describe('reescritura · se rellena con lo guardado', () => {
  it('antes: la entrada no traía materia ni competidores', () => {
    const c = (base().nodes.find((n) => n.name === ARMAR) as Nodo).parameters.jsCode as string
    expect(c).not.toContain('materia_cliente')
  })
  it('ahora trae el sitio propio ENTERO y los competidores, y declara su origen', () => {
    const j = armar(nuevo(), PAGINAS, COMP)
    const dp = j.discovery_package
    expect(dp.reescritura).toBe(true)
    expect(dp.materia_cliente.materia_origen).toBe('guardado')
    expect(dp.materia_cliente.sitio_estado).toBe('guardado')
    expect(dp.materia_cliente.sitio_texto).toContain('FIN_SITIO')
    expect(dp.materia_cliente.sitio_texto).toContain('### Inicio (https://x.ec)')
    expect(dp.materia_cliente.sitio_texto).not.toContain('Menú')
    expect(dp.materia_cliente.instagram_estado).toBe('no_guardado_aparte')
    expect(dp.competitors).toEqual([expect.objectContaining({ name: 'Comp A', value_proposition: 'precio bajo' })])
    expect(dp.discovery_summary).toContain('origen: guardado')
  })
  it('si las lecturas fallan, la reescritura sigue como hoy y lo dice', () => {
    const j = armar(nuevo(), null, null)
    expect(j.discovery_package.materia_cliente.sitio_estado).toBe('sin_guardado')
    expect(j.discovery_package.materia_cliente.sitio_texto).toBe('')
    expect(j.discovery_package.competitors).toEqual([])
    expect(j.discovery_package.discovery_summary).not.toContain('origen: guardado')
  })
  it('las dos lecturas nuevas no frenan el flujo y van en cadena antes de armar', () => {
    const f = nuevo()
    for (const n of [N_SITIO, N_COMPETIDORES]) { const x = f.nodes.find((y) => y.name === n) as Nodo & { onError?: string }; expect(x.onError).toBe('continueRegularOutput'); expect(x.parameters.method).toBe('GET') }
    const sale = (de: string) => f.connections[de].main[0].map((x: { node: string }) => x.node)
    expect(sale('② Leer la ficha del cliente')).toEqual([N_SITIO])
    expect(sale(N_SITIO)).toEqual([N_COMPETIDORES])
    expect(sale(N_COMPETIDORES)).toEqual([ARMAR])
  })
  it('solo cambia «③ Armar la entrada» y se suman 2 nodos', () => {
    const a = base().nodes, d = nuevo().nodes
    expect(d.length).toBe(a.length + 2)
    expect(a.filter((n) => JSON.stringify(n) !== JSON.stringify(d.find((y) => y.name === n.name))).map((n) => n.name)).toEqual([ARMAR])
  })
})
