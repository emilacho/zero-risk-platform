/** Quitar la llave pegada como «respaldo» de una expresión de n8n, sin tocar nada más. Solo las funciones puras (el guion vivo se prueba con --seco). */
import { describe, expect, it } from 'vitest'
import { limpiarFlujo, quitarRespaldoPegado } from '../scripts/ops/quitar-llave-pegada-de-flujos.mjs'

const V = 'LLAVE-DE-PRUEBA-0123456789abcdef'
const q = (t: string, valor: string = V) => quitarRespaldoPegado(t, valor)

describe('quitarRespaldoPegado', () => {
  it('quita `|| \'valor\'` y deja la variable de entorno', () => {
    expect(q(`={{ $env.SUPABASE_SERVICE_ROLE_KEY || '${V}' }}`)).toEqual({ texto: '={{ $env.SUPABASE_SERVICE_ROLE_KEY }}', quitados: 1 })
  })
  it('también con comillas dobles y con espacios o sin ellos', () => {
    expect(q(`={{ $env.SUPABASE_SERVICE_ROLE_KEY||"${V}" }}`).texto).toBe('={{ $env.SUPABASE_SERVICE_ROLE_KEY }}')
    expect(q(`Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY   ||   '${V}' }}`).texto).toBe('Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY }}')
  })
  it('cuenta varias en el mismo texto', () => {
    expect(q(`a {{ $env.SUPABASE_SERVICE_ROLE_KEY || '${V}' }} b {{ $env.SUPABASE_SERVICE_ROLE_KEY || '${V}' }}`).quitados).toBe(2)
  })
  it('NO toca otra variable, otro valor ni un texto sin respaldo', () => {
    const otra = `={{ $env.OTRA_VARIABLE || '${V}' }}`
    expect(q(otra)).toEqual({ texto: otra, quitados: 0 })
    const otroValor = `={{ $env.SUPABASE_SERVICE_ROLE_KEY || 'otra-cosa' }}`
    expect(q(otroValor)).toEqual({ texto: otroValor, quitados: 0 })
    expect(q('={{ $env.SUPABASE_SERVICE_ROLE_KEY }}').quitados).toBe(0)
  })
  it('un valor vacío o un texto que no es cadena no hace nada', () => {
    expect(quitarRespaldoPegado('x', '').quitados).toBe(0); expect(quitarRespaldoPegado(5 as never, V).quitados).toBe(0)
  })
  it('el valor con caracteres especiales de expresión regular se trata como texto literal', () => {
    const raro = 'a.b+c(d)[e]$f'
    expect(quitarRespaldoPegado(`{{ $env.SUPABASE_SERVICE_ROLE_KEY || '${raro}' }}`, raro).quitados).toBe(1)
    expect(quitarRespaldoPegado(`{{ $env.SUPABASE_SERVICE_ROLE_KEY || 'aXb+c(d)[e]$f' }}`, raro).quitados).toBe(0)
  })
})

describe('limpiarFlujo', () => {
  const flujo = () => ({ name: 'f', nodes: [{ name: 'n1', parameters: { headerParameters: { parameters: [{ name: 'apikey', value: `={{ $env.SUPABASE_SERVICE_ROLE_KEY || '${V}' }}` }, { name: 'Authorization', value: `=Bearer {{ $env.SUPABASE_SERVICE_ROLE_KEY || "${V}" }}` }] } } }, { name: 'n2', parameters: { url: 'https://x.test' } }], connections: {} })
  it('limpia todos los textos anidados y no deja ninguno con el valor; el resto queda idéntico', () => {
    const f = flujo(); const r = limpiarFlujo(f, V)
    expect(r.quitados).toBe(2); expect(r.restantes).toBe(0); expect(JSON.stringify(r.flujo)).not.toContain(V)
    expect(r.flujo.nodes[1]).toEqual(f.nodes[1]); expect(r.flujo.connections).toEqual({})
    expect(r.flujo.nodes[0].parameters.headerParameters.parameters.map((p: { name: string }) => p.name)).toEqual(['apikey', 'Authorization'])
  })
  it('si el valor aparece FUERA de una expresión `$env … ||`, lo cuenta como restante (no se puede arreglar solo)', () => {
    const f = flujo(); (f.nodes[1].parameters as unknown as Record<string, string>).headers = `Bearer ${V}`
    const r = limpiarFlujo(f, V)
    expect(r.restantes).toBe(1)
  })
  it('no modifica el objeto original', () => {
    const f = flujo(); limpiarFlujo(f, V)
    expect(JSON.stringify(f)).toContain(V)
  })
})
