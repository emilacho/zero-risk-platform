/**
 * 16-nov · Sprint 1 · Mejoras 1 y 2 (CC1) · de punta a punta en la mesa (memoria, US$ 0):
 *  · la dirección declara el objetivo y la escena de cada lámina → la dirección visual y el pedido del generador los llevan;
 *  · el pedido del generador = la descripción + un contexto que NO se escribe en la imagen; sin concepto, la descripción sola (como antes);
 *  · las indicaciones de la mesa piden «Objetivo de la pieza:» y «Qué se ve:» por lámina, sin copiar los planos del brief.
 */
import { describe, expect, it } from 'vitest'
import { pedidoDeImagen } from '../mesa/traductor'
import { CONVENCION_DE_LA_PIEZA } from '../mesa/pedidos'
import { abrirEncargo } from '../orquestador'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { BRIEF_CARRUSEL, CITAS_COMPLETAS, LAMINAS_OK, jugar, montar, parteCon, pieza, seccionesDeLaminas } from './mesa-arnes'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'

/** la mesa del arnés, con un brief de la hoja que trae OBJETIVO e IDEA DE LA PIEZA (lo que escribe la cadena desde el 16-nov) */
async function montarConBriefDeLaHoja() {
  const brief = BRIEF_CARRUSEL.replace('- MENSAJE (uno): Pídelo hoy.', '- OBJETIVO: que pidan el plato del día por WhatsApp\n- IDEA DE LA PIEZA: el plato que cambia cada mañana\n- QUÉ SE VE: el plato servido en la barra, luz de la mañana\n- MENSAJE (uno): Pídelo hoy.')
  const M = crearMemoria({ parte: parteCon(brief), plantilla: CARRUSEL_MESA })
  M.P.mesa = crearMesaEnMemoria()
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  return { M, a, id: String(a.cuerpo.encargo_id) }
}

describe('pedidoDeImagen · lo que recibe el generador', () => {
  it('sin concepto (o vacío): la descripción tal cual, como hasta hoy', () => {
    expect(pedidoDeImagen('un plato sobre madera')).toBe('un plato sobre madera')
    expect(pedidoDeImagen('un plato sobre madera', {})).toBe('un plato sobre madera')
  })
  it('con concepto: la descripción primero, después el contexto marcado como «no se escribe» y la orden de no poner textos ni logos', () => {
    const p = pedidoDeImagen('un plato sobre madera', { idea: 'el plato que cambia cada día', mensaje: 'Hoy cambia el plato', emocion: 'curiosidad', objetivo: 'que reserven hoy' })
    expect(p.startsWith('un plato sobre madera\n\nContexto de la pieza (solo para entender la escena; no se escribe en la imagen): ')).toBe(true)
    expect(p).toContain('idea: el plato que cambia cada día')
    expect(p).toContain('mensaje que acompaña: Hoy cambia el plato')
    expect(p).toContain('emoción: curiosidad')
    expect(p).toContain('lo que la pieza tiene que lograr: que reserven hoy')
    expect(p).toMatch(/La imagen no lleva textos, letras, logos ni marcas de agua/)
  })
  it('«qué se ve» igual a la descripción no se repite', () => {
    expect(pedidoDeImagen('un plato sobre madera', { que_se_ve: 'un plato sobre madera', idea: 'x' })).not.toContain('qué se ve:')
    expect(pedidoDeImagen('un plato sobre madera', { que_se_ve: 'otra escena', idea: 'x' })).toContain('qué se ve: otra escena')
  })
})

describe('la convención de la pieza pide objetivo y escena', () => {
  it('carrusel y kit: sección Objetivo, y «Qué se ve:» por lámina o elemento', () => {
    const c = CONVENCION_DE_LA_PIEZA('carrusel'), k = CONVENCION_DE_LA_PIEZA('kit')
    expect(c).toMatch(/## Objetivo/); expect(c).toMatch(/## Concepto/); expect(c).toMatch(/Qué se ve:/)
    expect(k).toMatch(/## Objetivo/); expect(k).toMatch(/Qué se ve:/)
  })
})

describe('de punta a punta · la mesa cierra con el objetivo y el concepto en la dirección visual y en el pedido', () => {
  const PIEZA_CON_OBJETIVO = (laminas = LAMINAS_OK) => `## Objetivo\nque reserven el plato de hoy\n## Concepto\nel plato que cambia cada día\n${seccionesDeLaminas(laminas)}\n## Pie\nEl plato del día te espera.\n## Etiquetas\n#plato #hoy\n${CITAS_COMPLETAS}`

  it('objetivo declarado por la dirección: llega a visual_direction y al pedido de la imagen generada; las secciones no se cuentan como láminas', async () => {
    const { M, a, id } = await montar()
    const { ultima } = await jugar(M, id, a, (t) => (t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? { texto: PIEZA_CON_OBJETIVO() } : undefined))
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado' })
    const art = M.encargos.get(id)!.estado_del_motor.artefactos
    const vd = art.visual_direction.datos as { objetivo?: string; imagenes: Array<{ ref: string; concepto?: Record<string, string> }> }
    expect(vd.objetivo).toBe('que reserven el plato de hoy')
    const hook = vd.imagenes.find((i) => i.ref === 'hook')!
    expect(hook.concepto).toMatchObject({ idea: 'el plato que cambia cada día', mensaje: 'Cada mañana empieza igual', objetivo: 'que reserven el plato de hoy' })
    const pv = art.prompts_validos.datos as { por_ref: Record<string, { prompts: Array<{ prompt: string; concepto?: unknown }> }> }
    const pedido = pv.por_ref.hook.prompts[0]
    expect(pedido.prompt.startsWith('un plato servido sobre una mesa de madera clara, luz natural')).toBe(true)
    expect(pedido.prompt).toContain('lo que la pieza tiene que lograr: que reserven el plato de hoy')
    expect(pedido.concepto).toEqual(hook.concepto)
    expect((art.laminas.datos as { laminas: unknown[] }).laminas).toHaveLength(5)
  })

  it('la dirección no declara objetivo: se usa el del brief de la hoja (con aviso) y la idea de la pieza viaja a cada imagen', async () => {
    const { M, a, id } = await montarConBriefDeLaHoja()
    const { ultima } = await jugar(M, id, a, (t) => (t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? { texto: pieza() } : undefined))
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado' })
    const art = M.encargos.get(id)!.estado_del_motor.artefactos
    const vd = art.visual_direction.datos as { objetivo?: string; imagenes: Array<{ ref: string; concepto?: Record<string, string> }> }
    expect(vd.objetivo).toBe('que pidan el plato del día por WhatsApp')
    expect(vd.imagenes.find((i) => i.ref === 'hook')!.concepto).toMatchObject({ idea: 'el plato que cambia cada mañana', objetivo: 'que pidan el plato del día por WhatsApp' })
    // el aviso «la dirección no declaró el objetivo…» va en `avisos_del_traductor` del registro de la mesa (la memoria del arnés no guarda contenidos); lo cubre sprint1-objetivo-y-concepto-traductor
    const pv = art.prompts_validos.datos as { por_ref: Record<string, { prompts: Array<{ prompt: string }> }> }
    expect(pv.por_ref.hook.prompts[0].prompt).toContain('lo que la pieza tiene que lograr: que pidan el plato del día por WhatsApp')
  })
})
