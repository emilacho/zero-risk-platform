/**
 * 16-nov · Sprint 2 · S2-1 (CC1) · LA HOJA DE PLANOS Y LAS PROPUESTAS DEL VIDEO · US$ 0, sin base ni red ni modelo.
 *  · el traductor del guion lee los campos de la hoja (rol, dice, intención, tamaño, lente, luz, producto, termina en, prompts) y sigue tolerante: lo que falta se avisa en UNA línea por campo;
 *  · la duración aprobada es DATO de la plantilla (`limites.video.segundos_min/max`);
 *  · la mesa presenta N propuestas (dato `limites.video.propuestas`) en UNA integración: se guardan en `propuestas_video` y todavía no hay guion;
 *  · `faseDeLaProduccion` es la única verdad de «borrador o final» para los pasos que siguen.
 */
import { describe, expect, it } from 'vitest'
import { escribirHoja } from '@/lib/cadena/hoja'
import { CONVENCION_DE_LA_PIEZA, VIDEO_POR_OMISION, armarTarea, convencionDelGuion, VOZ_DEL_GANCHO } from '../mesa/pedidos'
import { guionLegible, rolDelPlano, traducirGuion } from '../video/guion'
import { tareaDeLaMirada } from '../video/mirada'
import { faseDeLaProduccion, parametrosDelVideo, traducirPropuestas } from '../video/propuestas'
import { abrirEncargo } from '../orquestador'
import { VIDEO_MESA } from '../plantillas/video-mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { Plantilla } from '../tipos'
import { CLIENTE, FOTOS, PARTE, crearMemoria } from './memoria'
import { jugar, type Turno } from './mesa-arnes'
import { crearMesaEnMemoria } from './mesa-memoria'
import { INSUMOS, TRAS_2012 } from './mesa-de-video-t8.test'
import type { EstadoMesa } from '../mesa/tipos'

export const PLANO_COMPLETO = [
  '## Plano 1 · 0–3 s',
  'Rol: gancho',
  'Dice: el pan sale caliente cada mañana',
  'Intención: que se detenga el pulgar',
  'Se ve: el pan recién salido del horno, el vapor sube',
  'Producto: sí',
  'Tamaño: detalle · Lente: 85 mm · Luz: lateral cálida de la mañana',
  'Movimiento: acercamiento lento',
  'Termina en: el pan en el centro, vapor arriba a la izquierda',
  'Texto en pantalla: Recién salido',
  `Foto: foto:${FOTOS[0].id}`,
  'Prompt de imagen: Close-up of a sourdough loaf fresh from the oven, steam rising, warm side light, no text',
  'Prompt de video: Slow push-in toward the loaf; steam keeps rising; ends centered',
].join('\n')
const PLANO_AMBIENTE = ['## Plano 2 · 3–9 s', 'Rol: dar prueba', 'Se ve: la mesa larga con gente desayunando, de lejos', 'Producto: no', 'Movimiento: cámara fija'].join('\n')

describe('el traductor lee la hoja de planos (tolerante)', () => {
  it('cada campo de la hoja queda en su plano; «dar prueba» y «gancho» se guardan con la clave de la biblioteca (CC4); producto sí/no es booleano', () => {
    const g = traducirGuion([PLANO_COMPLETO, PLANO_AMBIENTE, '## Audio', 'ambiente de cocina'].join('\n'))
    expect(g.ok).toBe(true)
    expect(g.planos[0]).toMatchObject({
      n: 1, rol: 'captar', dice: 'el pan sale caliente cada mañana', intencion: 'que se detenga el pulgar', producto: true, tamano: 'detalle', lente: '85 mm', luz: 'lateral cálida de la mañana',
      estado_final: 'el pan en el centro, vapor arriba a la izquierda', texto_en_pantalla: 'Recién salido', foto_id: FOTOS[0].id,
      prompt_imagen: 'Close-up of a sourdough loaf fresh from the oven, steam rising, warm side light, no text', prompt_video: 'Slow push-in toward the loaf; steam keeps rising; ends centered',
    })
    expect(g.planos[1]).toMatchObject({ n: 2, rol: 'prueba', producto: false })
    expect(g.avisos.filter((a) => /rol en la historia|si sale el producto/.test(a))).toEqual([])
  })
  it('un rol que no está en la guía se guarda tal cual (no es lista cerrada) y sin aviso', () => {
    expect(rolDelPlano('respiro visual')).toBe('respiro visual')
    expect(rolDelPlano('Llamado a la acción')).toBe('llamado')
    expect(rolDelPlano('conclusión')).toBe('conclusion')
    const g = traducirGuion(['## Plano 1 · 0–8 s', 'Rol: respiro visual', 'Se ve: la calle', 'Producto: no'].join('\n'))
    expect(g.planos[0].rol).toBe('respiro visual')
    expect(g.avisos.some((a) => /rol/.test(a))).toBe(false)
  })
  it('el guion de siempre (sin hoja) se traduce igual que antes y la falta se avisa en UNA línea por campo, no una por plano', () => {
    const g = traducirGuion(['## Plano 1 · 0–3 s', 'Se ve: el pan', '## Plano 2 · 3–8 s', 'Se ve: la mesa', '## Plano 3 · 8–12 s', 'Se ve: la puerta'].join('\n'))
    expect(g.ok).toBe(true)
    expect(g.planos.map((p) => p.se_ve)).toEqual(['el pan', 'la mesa', 'la puerta'])
    expect(g.planos.every((p) => p.rol === undefined && p.producto === undefined)).toBe(true)
    const deLaHoja = g.avisos.filter((a) => /rol en la historia|si sale el producto/.test(a))
    expect(deLaHoja).toEqual(['ningún plano dice su rol en la historia: la mirada lo juzga contra lo que se ve', 'ningún plano dice si sale el producto: se toma de la foto (con foto propia, sí; sin foto, no)'])
  })
  it('si faltan en algunos planos, el aviso nombra cuáles', () => {
    const g = traducirGuion([PLANO_COMPLETO, '## Plano 2 · 3–8 s', 'Se ve: la mesa', '## Plano 3 · 8–12 s', 'Se ve: la puerta', 'Rol: llamado'].join('\n'))
    expect(g.avisos).toContain('el plano 2 no dice su rol en la historia: la mirada lo juzga contra lo que se ve')
    expect(g.avisos).toContain('los planos 2, 3 no dicen si sale el producto: se toma de la foto (con foto propia, sí; sin foto, no)')
  })
  it('varios campos en una línea separados por «·» se parten; un «·» dentro de «Se ve» no se toca', () => {
    const g = traducirGuion(['## Plano 1 · 0–8 s', 'Se ve: el pan · la mesa · la puerta', 'Tamaño: medio · Lente: 35 mm · Luz: de ventana'].join('\n'))
    expect(g.planos[0]).toMatchObject({ se_ve: 'el pan · la mesa · la puerta', tamano: 'medio', lente: '35 mm', luz: 'de ventana' })
  })
  it('«Producto:» con algo que no es sí o no queda sin dato (no se adivina)', () => {
    const g = traducirGuion(['## Plano 1 · 0–8 s', 'Se ve: el pan', 'Producto: a veces'].join('\n'))
    expect(g.planos[0].producto).toBeUndefined()
  })
})

describe('la duración aprobada es DATO de la plantilla', () => {
  it('sin dato: lo que admite el modelo por omisión (17-nov · T1: su ficha, 4–30 s; antes 8–15 fijos) · un guion de 20 s queda en 20 y uno de 40 s se encaja en 30 con aviso', () => {
    expect(traducirGuion(['## Plano 1 · 0–20 s', 'Se ve: el pan'].join('\n')).segundos).toBe(20)
    const g = traducirGuion(['## Plano 1 · 0–40 s', 'Se ve: el pan'].join('\n'))
    expect(g.segundos).toBe(30)
    expect(g.avisos.some((a) => /se encaja en 30 s/.test(a))).toBe(true)
  })
  it('con dato 6–30: un guion de 20 s queda en 20 y uno de 4 s se alarga a 6', () => {
    expect(traducirGuion(['## Plano 1 · 0–20 s', 'Se ve: el pan'].join('\n'), { segundosMin: 6, segundosMax: 30 }).segundos).toBe(20)
    const corto = traducirGuion(['## Plano 1 · 0–4 s', 'Se ve: el pan'].join('\n'), { segundosMin: 6, segundosMax: 30 })
    expect(corto.segundos).toBe(6)
    expect(corto.avisos.some((a) => /lo aprobado es de 6 a 30 s: se alarga a 6 s/.test(a))).toBe(true)
  })
  it('parametrosDelVideo lee la plantilla y descarta lo que no tiene sentido (sin dato ⇒ lo de siempre: 8–15 s, una sola propuesta)', () => {
    expect(parametrosDelVideo(VIDEO_MESA)).toEqual({ segundos_min: 8, segundos_max: 15, propuestas: 1 })
    expect(parametrosDelVideo({ limites: { ...VIDEO_MESA.limites, video: { segundos_min: 6, segundos_max: 45, propuestas: 3 } } })).toEqual({ segundos_min: 6, segundos_max: 45, propuestas: 3 })
    expect(parametrosDelVideo({ limites: { ...VIDEO_MESA.limites, video: { segundos_min: 20, segundos_max: 10, propuestas: -1 } } })).toEqual({ segundos_min: 20, segundos_max: 20, propuestas: 1 })
  })
})

describe('la convención que recibe la mesa del video', () => {
  it('una sola propuesta: pide la hoja de planos (rol, dice, producto, termina en, prompts) y la duración de la plantilla', () => {
    const c = convencionDelGuion({ segundos_min: 6, segundos_max: 30, propuestas: 1 })
    for (const campo of ['Rol:', 'Dice:', 'Intención:', 'Producto: sí | no', 'Termina en:', 'Prompt de imagen:', 'Prompt de video:', 'Foto: foto:']) expect(c).toContain(campo)
    expect(c).toContain('de 6 a 30 s')
    expect(c).not.toContain('# Propuesta 1')
    expect(c).toContain('nunca la cara de una persona real identificable sin permiso')
    expect(CONVENCION_DE_LA_PIEZA('video')).toBe(convencionDelGuion(VIDEO_POR_OMISION))
  })
  it('tres propuestas: pide «# Propuesta N» con concepto, duración, red, objetivo y su hoja, distintas entre sí', () => {
    const c = convencionDelGuion({ segundos_min: 8, segundos_max: 30, propuestas: 3 })
    expect(c).toContain('Escribe 3 PROPUESTAS COMPLETAS y DISTINTAS')
    expect(c).toContain('# Propuesta 1 · <nombre corto>')
    expect(c).toContain('Duración: <N s> · Red: <la red> · Objetivo: <lo que tiene que lograr>')
    expect(c).toContain('hasta la Propuesta 3')
    expect(c).toContain('empieza directamente en «# Propuesta 1»')
  })
  it('la regla dura del video ya no fija 8–15 s ni prohíbe rostros generados: lee la duración de la plantilla', () => {
    const est = { tipo: 'video', direccion: 'creative-director-mesa', marcas: {}, directorio_congelado: TRAS_2012, condiciones: [] } as unknown as EstadoMesa
    const c = { cliente_nombre: 'X', tipo: 'video' as const, brief_id: 'B', brief_texto: 'b', manual_texto: 'm', plan_texto: null, fotos: [], tope_usd: 35, gasto_usd: 0, video: { segundos_min: 6, segundos_max: 40, propuestas: 3 } }
    const tarea = armarTarea({ tipo: 'integrar', agente: 'creative-director-mesa', tarjeta: undefined, est, libro: [], c })
    expect(tarea).toContain('planos con sus segundos (de 6 a 40 s en total)')
    expect(tarea).toContain('la cara o la voz de una persona real identificable sin su permiso registrado')
    // DECISIÓN Emilio 17-nov: voz, diálogo, locución y rostros generados los decide la mesa
    expect(tarea).toContain('Voz, diálogo, locución, rostros y personajes generados los decides tú según la pieza')
    expect(tarea).not.toMatch(/Sin voces|sin narración|solo música o ambiente/i)
    expect(tarea).not.toContain('8 a 15 s')
    const dirige = armarTarea({ tipo: 'dirigir', agente: 'creative-director-mesa', tarjeta: undefined, est, libro: [], c })
    expect(dirige).toContain('los 3 caminos DISTINTOS que vas a proponer al dueño')
    expect(dirige).toContain('los propones tú según el plan, la red y el objetivo: de 6 a 40 s')
  })
})

export const PROPUESTA = (n: number, nombre: string, segundos: number) => [
  `# Propuesta ${n} · ${nombre}`,
  `Concepto: ${nombre} contado en ${segundos} segundos`,
  `Duración: ${segundos} s · Red: instagram · Objetivo: que reserven la mesa`,
  'Por qué: muestra el producto antes de los 3 segundos',
  PLANO_COMPLETO,
  `## Plano 2 · 3–${segundos} s`, 'Rol: llamado', 'Se ve: la puerta abierta con la mesa puesta', 'Producto: no',
  '## Audio', 'ambiente de cocina, sin voz',
  '## Pie', `Pie de ${nombre}.`,
  '## Etiquetas', '#pan #desayuno',
].join('\n')

describe('traducirPropuestas · la integración con N propuestas', () => {
  it('tres propuestas con su cabecera y su hoja; las citas comunes quedan aparte', () => {
    const md = [PROPUESTA(1, 'El vapor', 12), PROPUESTA(2, 'La mesa larga', 15), PROPUESTA(3, 'La puerta', 20), '# Citas', 'A2 usé: el gancho del vapor'].join('\n')
    const r = traducirPropuestas(md, { objetivo: 3, segundosMin: 6, segundosMax: 30 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.resultado.propuestas.map((p) => [p.id, p.nombre, p.segundos, p.red, p.objetivo])).toEqual([
      ['P1', 'El vapor', 12, 'instagram', 'que reserven la mesa'], ['P2', 'La mesa larga', 15, 'instagram', 'que reserven la mesa'], ['P3', 'La puerta', 20, 'instagram', 'que reserven la mesa'],
    ])
    expect(r.resultado.propuestas[0].concepto).toBe('El vapor contado en 12 segundos')
    expect(r.resultado.propuestas[0].por_que).toBe('muestra el producto antes de los 3 segundos')
    expect(r.resultado.propuestas[1].guion.planos[0]).toMatchObject({ rol: 'captar', producto: true })
    expect(r.resultado.propuestas[2].guion.pie_de_foto).toBe('Pie de La puerta.')
    expect(r.resultado.citas).toBe('A2 usé: el gancho del vapor')
    expect(r.resultado.ronda).toBe(1)
    expect(r.resultado.avisos).toEqual([])
  })
  it('sin títulos de propuesta: el texto entero es UNA propuesta y se avisa que se pedían más (no se rechaza)', () => {
    const r = traducirPropuestas([PLANO_COMPLETO, '## Audio', 'ambiente'].join('\n'), { objetivo: 3 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.resultado.propuestas).toHaveLength(1)
    expect(r.resultado.avisos[0]).toMatch(/se presenta el texto entero como una sola propuesta \(se pedían 3\)/)
  })
  it('una propuesta sin planos se descarta con su motivo y se presentan las demás; ninguna ⇒ no ok', () => {
    const r = traducirPropuestas([PROPUESTA(1, 'El vapor', 12), '# Propuesta 2 · Vacía', 'Concepto: nada', PROPUESTA(3, 'La puerta', 15)].join('\n'), { objetivo: 3 })
    expect(r.ok).toBe(true)
    if (!r.ok) return
    expect(r.resultado.propuestas.map((p) => p.id)).toEqual(['P1', 'P2'])
    expect(r.resultado.propuestas[1].nombre).toBe('La puerta')
    expect(r.resultado.avisos).toContain('«Propuesta 2 · Vacía» se descartó: no encontré planos (un encabezado por plano)')
    expect(r.resultado.avisos).toContain('se pidieron 3 propuestas y quedan 2: se presentan las que hay')
    const nada = traducirPropuestas('# Propuesta 1 · A\nConcepto: x\n# Propuesta 2 · B\nConcepto: y', { objetivo: 2 })
    expect(nada.ok).toBe(false)
  })
  it('la duración que declara la propuesta y la de su guion no coinciden: vale el guion, con aviso', () => {
    const md = PROPUESTA(1, 'El vapor', 12).replace('Duración: 12 s', 'Duración: 30 s')
    const r = traducirPropuestas(md, { objetivo: 1, segundosMin: 6, segundosMax: 30 })
    expect(r.ok && r.resultado.propuestas[0].segundos).toBe(12)
    expect(r.ok && r.resultado.propuestas[0].guion.avisos).toContain('la propuesta dice 30 s y su guion dura 12 s: vale el guion')
  })
})

describe('faseDeLaProduccion · una sola verdad para «borrador o final»', () => {
  const art = (datos: Record<string, unknown>) => ({ version: 1, version_consumida: 0, datos })
  it('sin propuestas ⇒ final (lo de hoy); con propuestas sin aprobar ⇒ propuesta; aprobada ⇒ final; con observaciones ⇒ propuesta', () => {
    expect(faseDeLaProduccion({ artefactos: {} })).toBe('final')
    expect(faseDeLaProduccion({ artefactos: { propuestas_video: art({}) } })).toBe('propuesta')
    expect(faseDeLaProduccion({ artefactos: { propuestas_video: art({}), aprobacion_propuestas: art({ estado: 'aprobada', propuesta_id: 'P2', ronda: 1 }) } })).toBe('final')
    expect(faseDeLaProduccion({ artefactos: { propuestas_video: art({}), aprobacion_propuestas: art({ estado: 'observaciones', ronda: 1 }) } })).toBe('propuesta')
  })
})

describe('quien revisa juzga el plano contra su rol', () => {
  it('la mirada del video y el guion legible (jefatura y entrega) llevan el rol, lo que dice y si sale el producto', () => {
    const g = traducirGuion([PLANO_COMPLETO, PLANO_AMBIENTE].join('\n'))
    const legible = guionLegible(g)
    expect(legible).toContain('Plano 1 · 0–3 s · captar\n  Dice: el pan sale caliente cada mañana\n  Intención: que se detenga el pulgar')
    expect(legible).toContain('Producto en cuadro: sí')
    expect(legible).toContain('Termina en: el pan en el centro, vapor arriba a la izquierda')
    const m = tareaDeLaMirada({ cuadros: [], planos: g.planos, segundos: 9, brief_texto: 'la fila', red: 'instagram', formato: 'reel', contrato: 'mirada_video.v1' }).task
    expect(m).toContain('- Plano 1 (0–3 s) · rol: captar · tenía que decir: el pan sale caliente cada mañana: el pan recién salido del horno, el vapor sube · producto en cuadro: sí')
  })
})

describe('DE PUNTA A PUNTA · un solo guion con la duración de la plantilla', () => {
  it('plantilla de 6 a 30 s y sin propuestas: la mesa escribe el guion directo (como hoy) y un guion de 20 s queda en 20, no se encaja en 15', async () => {
    const plantilla: Plantilla = { ...VIDEO_MESA, limites: { ...VIDEO_MESA.limites, video: { ...(VIDEO_MESA.limites.video as Record<string, unknown>), segundos_min: 6, segundos_max: 30 } } }
    const M = crearMemoria({ parte: escribirHoja(INSUMOS).texto_md, plantilla })
    M.P.mesa = crearMesaEnMemoria(TRAS_2012)
    M.P.video = { enviar: async () => ({ ok: true, request_id: 'r', status: 'simulado', costo_estimado_usd: 1, costo_lista_usd: 1, descuento_pct: 0, simulado: true }), estado: async () => ({ ok: true, simulado: true }) }
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'F1-S1-ig-r1', dry_run: true, familia: 'video_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(a.cuerpo.encargo_id)
    let aportes = 0
    const { turnos } = await jugar(M, id, a, (t: Turno) => {
      if (t.tipo === 'dirigir') return { texto: 'Idea rectora: el pan.' }
      if (t.tipo === 'aportar') { aportes++; return { texto: t.agente === VOZ_DEL_GANCHO ? 'Gancho: el vapor.' : `Aporte de ${t.agente}.` } }
      if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto: [PLANO_COMPLETO, '## Plano 2 · 3–20 s', 'Rol: llamado', 'Se ve: la puerta', 'Producto: no', '## Audio', 'ambiente', '## Pie', 'Ven.', '## Etiquetas', '#pan', '## Citas', ...Array.from({ length: aportes }, (_, i) => `A${i + 2} usé: lo tomé`)].join('\n') }
      return undefined
    })
    expect(turnos.find((x) => x.tipo === 'integrar')!.task).not.toContain('# Propuesta 1')
    const e = M.encargos.get(id)!.estado_del_motor
    expect(e.artefactos.propuestas_video).toBeUndefined()
    expect((e.artefactos.guion.datos as { segundos: number }).segundos).toBe(20)
  })
})

describe('DE PUNTA A PUNTA · la mesa con 3 propuestas (dato de la plantilla) las guarda y todavía no hay guion', () => {
  const CON_PROPUESTAS: Plantilla = { ...VIDEO_MESA, limites: { ...VIDEO_MESA.limites, video: { ...(VIDEO_MESA.limites.video as Record<string, unknown>), segundos_min: 6, segundos_max: 30, propuestas: 3 } } }
  it('la tarea de integrar pide 3 propuestas; el cierre deja `propuestas_video` (3, con sus hojas) sin `guion` ni `copy_video`; sin paso de aprobación, el pedido falla diciendo por qué', async () => {
    const hoja = escribirHoja(INSUMOS)
    const M = crearMemoria({ parte: hoja.texto_md, plantilla: CON_PROPUESTAS })
    M.P.mesa = crearMesaEnMemoria(TRAS_2012)
    const enviados: unknown[] = []
    M.P.video = { enviar: async (p) => { enviados.push(p); return { ok: true, request_id: 'r', status: 'simulado', costo_estimado_usd: 1, costo_lista_usd: 1, descuento_pct: 0, simulado: true } }, estado: async () => ({ ok: true, simulado: true }) }
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'F1-S1-ig-r1', dry_run: true, familia: 'video_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(a.cuerpo.encargo_id)
    let aportes = 0
    const { turnos, ultima } = await jugar(M, id, a, (t: Turno) => {
      if (t.tipo === 'dirigir') return { texto: 'Idea rectora: tres caminos para el pan.' }
      if (t.tipo === 'aportar') { aportes++; return { texto: t.agente === VOZ_DEL_GANCHO ? 'Gancho: el vapor.' : `Aporte de ${t.agente}.` } }
      if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto: [PROPUESTA(1, 'El vapor', 12), PROPUESTA(2, 'La mesa larga', 15), PROPUESTA(3, 'La puerta', 20), '# Citas', ...Array.from({ length: aportes }, (_, i) => `A${i + 2} usé: lo tomé`)].join('\n') }
      return undefined
    })
    expect(turnos.find((x) => x.tipo === 'integrar')!.task).toContain('Escribe 3 PROPUESTAS COMPLETAS y DISTINTAS')
    expect(turnos.find((x) => x.tipo === 'dirigir')!.task).toContain('los 3 caminos DISTINTOS')
    const e = M.encargos.get(id)!.estado_del_motor
    const pv = e.artefactos.propuestas_video?.datos as { propuestas: Array<{ id: string; segundos: number; guion: { planos: unknown[] } }>; ronda: number; texto: string }
    expect(pv.propuestas.map((p) => [p.id, p.segundos, p.guion.planos.length])).toEqual([['P1', 12, 2], ['P2', 15, 2], ['P3', 20, 2]])
    expect(pv.ronda).toBe(1)
    expect(pv.texto).toContain('# Propuesta 1 · El vapor')
    expect(e.artefactos.guion).toBeUndefined()
    expect(e.artefactos.copy_video).toBeUndefined()
    expect((e.artefactos.mesa?.datos as unknown as EstadoMesa).video).toEqual({ segundos_min: 6, segundos_max: 30, propuestas: 3 })
    expect(faseDeLaProduccion(e)).toBe('propuesta')
    expect(enviados).toHaveLength(0)
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'fallido' })
    expect(JSON.stringify(ultima.cuerpo)).toContain('hay propuestas del video sin aprobar')
  })
})
