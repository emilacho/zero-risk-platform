/**
 * 19-nov · ADENDA 1 · P2b (CC5):
 *   1. el jefe de la pieza recibe el RESUMEN DEL ENCARGO (red, formato, qué es, objetivo, llamado) como un documento más;
 *   2. el manual y el plan llegan ENTEROS al pedido base de la oficina y al revisor de láminas (antes, manual 12 000 y plan 8000 / 12 000),
 *      y el aviso de un recorte dice de QUÉ documento es (antes decía «en el manual» también al cortar el plan).
 * Sin red, sin modelo, US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { construirTarea, contextoDelEncargo, FUNCION_DEL_RESUMEN, resumenParaElJefe, type ContextoDePedido } from '../pedidos'
import { construirTareaLaminas, contextoDelRevisorLaminas, type ContextoLaminas } from '../pedidos-laminas'
import { jugar, montar } from './mesa-arnes'
import { TOPE_REAL_DEL_PEDIDO } from '../../limites-de-tamano'

describe('ADENDA 1 · P2b · el resumen del encargo', () => {
  it('el documento lista red, formato, qué es, objetivo y llamado; lo que la hoja no dice, se dice', () => {
    const d = contextoDelEncargo({ red: 'instagram', formato: 'post', objetivo: 'que reserven', llamado: '' })
    expect(d.titulo).toBe('El resumen del encargo')
    expect(d.funcion).toBe(FUNCION_DEL_RESUMEN)
    expect(d.texto).toBe('- red: instagram\n- formato: post\n- qué es: (la hoja no lo dice)\n- objetivo: que reserven\n- llamado: (la hoja no lo dice)')
    expect(contextoDelEncargo({ red: 'tiktok', publico: 'quien vive cerca' }).texto).toContain('- público: quien vive cerca')
  })
  it('🔴 punta a punta: el sobre al jefe de la pieza lleva «El resumen del encargo», el primero, con la red de la hoja', async () => {
    const { M, a, id } = await montar()
    const sobres: Array<{ payload: { contexto: Array<{ titulo: string; texto: string }> } }> = []
    M.P.jefatura = (async (s: never) => { sobres.push(s); return { estado: 'esperando', revision_id: 'rev-1' } }) as never
    await jugar(M, id, a)
    expect(sobres.length).toBeGreaterThan(0)
    const c = sobres[0].payload.contexto
    expect(c[0].titulo).toBe('El resumen del encargo')
    expect(c[0].texto).toMatch(/^- red: \S+/)
    expect(c[0].texto).toMatch(/\n- objetivo: /)
    // los documentos de siempre siguen
    expect(c.map((x) => x.titulo)).toEqual(expect.arrayContaining(['Manual de marca del cliente', 'El brief de este entregable']))
  })
  // 19-nov · sabotaje c8 de CC6 (sobrevivía): sin la hoja del encargo no se inventa un resumen («(la hoja no lo dice)» en todo): no va
  //   (en el camino real el encargo sin hoja se cae antes: la decisión es la función que usa el orquestador, `resumenParaElJefe`, y se prueba aquí directo)
  it('🔴 si el encargo no trae la hoja, no hay resumen para el jefe; con la hoja, es el resumen de esa hoja', () => {
    expect(resumenParaElJefe(null)).toEqual([])
    expect(resumenParaElJefe(undefined)).toEqual([])
    const hoja = { red: 'instagram', formato: 'post', objetivo: 'que reserven' } as unknown as Parameters<typeof resumenParaElJefe>[0]
    expect(resumenParaElJefe(hoja)).toEqual([contextoDelEncargo({ red: 'instagram', formato: 'post', objetivo: 'que reserven' })])
  })
})

describe('ADENDA 1 · P2b · el manual y el plan llegan ENTEROS a los pedidos de la oficina y al revisor de láminas', () => {
  // más largos que los topes de antes (manual 12 000 · plan 8000 / 12 000): 60 000 cada uno, con una marca al final
  const MANUAL = 'm'.repeat(60_000) + ' FIN-DEL-MANUAL'
  const PLAN = 'p'.repeat(60_000) + ' FIN-DEL-PLAN'
  const fuentes = { manual_texto: MANUAL, plan_texto: PLAN, propios: { telefonos: [], handles: [] }, fuentes: { precios: [] } }
  const laminas = {
    brief: { id: 'BRF-9', texto: 'brief', red: 'facebook', formato: 'carrusel' }, fuentes, estado: { fichas: [] }, art: () => undefined, limites: {}, elementos: [],
    plataforma: 'facebook', familia: 'carrusel_mesa', refsValidos: [], refsGeneradas: [], sinFoto: false, png: [],
  } as unknown as ContextoLaminas
  const post = {
    brief: { id: 'BRF-9', texto: 'brief', red: 'instagram', formato: 'post' }, fuentes, proporcion: '4:5', estado: { fichas: [] }, art: () => undefined,
    reglas: { obligatorio: [], prohibido: [] }, imagenesAMirar: [],
  } as unknown as ContextoDePedido
  it('🔴 el pedido base de láminas trae el manual y el plan enteros, sin aviso de recorte', () => {
    const t = construirTareaLaminas('direccion_visual', laminas).task
    expect(t).toContain('FIN-DEL-MANUAL')
    expect(t).toContain('FIN-DEL-PLAN')
    expect(t).not.toContain('[… recortado')
  })
  it('🔴 el pedido base del post trae el manual y el plan enteros, sin aviso de recorte', () => {
    const t = construirTarea('direccion_visual', post).task
    expect(t).toContain('FIN-DEL-MANUAL')
    expect(t).toContain('FIN-DEL-PLAN')
    expect(t).not.toContain('[… recortado')
  })
  // 19-nov · sabotaje c5 de CC6 (sobrevivía): si un documento pasara el techo del pedido, el aviso dice CUÁL se cortó (antes decía «el manual» también al cortar el plan)
  it('🔴 sobre el techo, el aviso de recorte nombra el documento: «el plan» para el plan y «el manual» para el manual', () => {
    const largo = (x: string) => x.repeat(TOPE_REAL_DEL_PEDIDO + 5)
    const f2 = { ...fuentes, manual_texto: largo('m'), plan_texto: largo('p') }
    for (const t of [construirTarea('direccion_visual', { ...post, fuentes: f2 } as unknown as ContextoDePedido).task, construirTareaLaminas('direccion_visual', { ...laminas, fuentes: f2 } as unknown as ContextoLaminas).task]) {
      expect(t).toContain('\n[… recortado: 5 caracteres más en el plan]')
      expect(t).toContain('\n[… recortado: 5 caracteres más en el manual]')
    }
  })
  it('🔴 el revisor de láminas lee el manual y el plan enteros', () => {
    const c = contextoDelRevisorLaminas(laminas).contexto
    expect(c.find((x) => x.titulo === 'Manual de marca del cliente')!.texto).toBe(MANUAL)
    expect(c.find((x) => x.titulo === 'Plan de trabajo del cliente')!.texto).toBe(PLAN)
  })
})
