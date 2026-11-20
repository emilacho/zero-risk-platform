/**
 * 20-nov · GO Lenovo (decisión de Cerebro · sección firmada por Emilio el 18-nov): «Cómo se produce con IA» (`produccion_con_ia`) sale en el manual limpio,
 * en prosa, y llega ENTERO a la mesa de video. Si el manual no la trae (manuales viejos), el bloque no se imprime, no se declara omitido y nada se rellena.
 * Manual REAL de la repetición r68 (fixture guardado). US$ 0, sin base, sin red, sin modelo.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { renderManualLimpio } from '@/lib/brand-book-render-limpio'
import { armarTarea } from '../mesa/pedidos'
import type { EstadoMesa } from '../mesa/tipos'

const MANUAL_REAL = JSON.parse(fs.readFileSync('src/lib/manual/__tests__/fixtures/repeticion-r68/manual-guardado.json', 'utf8')) as Record<string, unknown>
const PROSA = 'Las fotos propias con oferta y fecha van primero; si falta una toma, se genera con la misma luz natural del local y nunca se inventa un plato que la casa no sirve.'
const TITULO = 'CÓMO SE PRODUCE CON IA'
const render = (bb: Record<string, unknown>) => renderManualLimpio({ brand_book: bb, client_name: 'Cliente' })

const est: EstadoMesa = { tipo: 'video', directorio_congelado: [], direccion: 'creative-director-mesa', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null }
const tareaDeVideo = (manual_texto: string) =>
  armarTarea({ tipo: 'aportar', agente: 'video-editor', tarjeta: undefined, est, libro: [], c: { cliente_nombre: 'Cliente', tipo: 'video', brief_id: 'F1-S1-ig-r1', brief_texto: '### F1-S1-ig-r1 · Instagram · reel', manual_texto, plan_texto: null, fotos: [], tope_usd: 10, gasto_usd: 0 } })

describe('20-nov · «Cómo se produce con IA» en el manual', () => {
  it('🔴 con la sección, sale con su título y su prosa, y cuenta como sección', () => {
    const r = render({ ...MANUAL_REAL, produccion_con_ia: PROSA })
    expect(r.texto).toContain(`${TITULO}\n`)
    expect(r.texto).toContain(PROSA)
    expect(r.secciones).toContain('produccion_con_ia')
    // el manual real ya trae sus propias fugas (positioning, icp_summary): la sección nueva no suma ninguna
    expect(r.fugas).toEqual(render(MANUAL_REAL).fugas)
  })

  it('🔴 también cuando viene dentro del borrador guardado (content_text)', () => {
    const r = render({ content_text: JSON.stringify({ brand_book_draft: { ...MANUAL_REAL, produccion_con_ia: PROSA } }) })
    expect(r.texto).toContain(TITULO)
    expect(r.texto).toContain(PROSA)
  })

  it('🔴 sin la sección (manual viejo), el manual sale igual que antes: sin título, sin relleno y sin declararla omitida', () => {
    const antes = render(MANUAL_REAL)
    for (const vacio of [undefined, '', '   ', null]) {
      const r = render({ ...MANUAL_REAL, produccion_con_ia: vacio })
      expect(r.texto).toBe(antes.texto)
      expect(r.omitidas).toEqual(antes.omitidas)
    }
    expect(antes.texto).not.toContain(TITULO)
    expect(antes.omitidas).not.toContain('produccion_con_ia')
    expect(antes.secciones).not.toContain('produccion_con_ia')
  })

  it('🔴 llega entera a la mesa de video, dentro del documento del manual', () => {
    const tarea = tareaDeVideo(render({ ...MANUAL_REAL, produccion_con_ia: PROSA }).texto)
    const inicio = tarea.indexOf('## 1 · Manual de marca')
    const fin = tarea.indexOf('## 2 · ')
    expect(inicio).toBeGreaterThan(-1)
    const bloque = tarea.slice(inicio, fin)
    expect(bloque).toContain(TITULO)
    expect(bloque).toContain(PROSA)
    expect(bloque).not.toContain('recortado')
  })

  it('sin la sección, la mesa de video recibe el manual de siempre', () => {
    expect(tareaDeVideo(render(MANUAL_REAL).texto)).not.toContain(TITULO)
  })
})
