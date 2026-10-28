import { describe, expect, it } from 'vitest'
import { abrirEncargo, avanzar } from '../orquestador'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'
import { BRIEF_CARRUSEL, LAMINAS_OK, jugar, montar, parteCon, pieza } from './mesa-arnes'

describe('LA MESA · carrusel · punta a punta con equipo simulado', () => {
  it('camino feliz (ensayo): la dirección abre, cada especialidad aporta, la dirección integra y cita, se traduce, se dibuja y cierra', async () => {
    const { M, MS, a, id } = await montar()
    expect(a.status).toBe(200)
    const { ultima, turnos } = await jugar(M, id, a)
    expect(turnos[0]).toMatchObject({ agente: 'creative-director-mesa', tipo: 'dirigir' })
    const aportaron = turnos.filter((t) => t.tipo === 'aportar').map((t) => t.agente).sort()
    expect(aportaron).toEqual(['carousel-designer', 'content-creator', 'design-image-prompt-engineer', 'marketing_instagram_curator'])
    expect(turnos.at(-1)).toMatchObject({ agente: 'creative-director-mesa', tipo: 'integrar' })
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado', simulado: true })
    expect(MS.filas.map((f) => f.tipo)).toEqual(['dirige', 'aporta', 'aporta', 'aporta', 'aporta', 'integra'])
    expect(M.llamadas.render).toBe(1); expect(M.llamadas.renderReal).toBe(0)
    expect(M.llamadas.renderPedidos[0].slides).toHaveLength(5)
    expect(M.llamadas.imagen).toBe(1)
    expect(M.llamadas.salida).toBe(0); expect(M.llamadas.bandeja).toHaveLength(0)
    expect(turnos.map((t) => t.agente)).not.toContain('brand_strategist')
    expect(turnos.map((t) => t.agente)).not.toContain('editor_en_jefe')
  })

  it('cada turno lleva el manual primero, el directorio y las únicas tres reglas duras; nadie recibe campos ni topes de largo', async () => {
    const { M, a, id } = await montar()
    const { turnos } = await jugar(M, id, a)
    const t = turnos.find((x) => x.tipo === 'aportar')!.task
    expect(t.indexOf('Manual de marca')).toBeLessThan(t.indexOf('El brief de este entregable'))
    expect(t).toMatch(/Las únicas tres reglas duras/); expect(t).toMatch(/mesa_pedir/); expect(t).toMatch(/pedir_material/)
    expect(t).not.toMatch(/\d+ caracteres/i)
  })

  it('una lámina de 400 caracteres NUNCA se rechaza: la pieza se traduce, se dibuja completa y no queda ninguna ficha que bloquee', async () => {
    const larga = 'texto largo '.repeat(34).trim().slice(0, 400)
    const laminas = LAMINAS_OK.map((l, i) => (i === 1 ? [l[0], l[1], larga, l[3]] : l))
    const { M, a, id } = await montar()
    const { ultima } = await jugar(M, id, a, (t) => (t.tipo === 'integrar' ? { texto: pieza(laminas) } : undefined))
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(M.llamadas.renderPedidos[0].slides[1].body).toBe(larga)
    expect(M.encargos.get(id)!.estado_del_motor.fichas.filter((f) => f.gravedad === 'bloquea' && f.donde === 'laminas')).toHaveLength(0)
  })

  it('si la integración no cita a cada especialidad, se le devuelve UNA vez; después sigue con lo que hay', async () => {
    const { M, MS, a, id } = await montar()
    const { turnos, ultima } = await jugar(M, id, a, (t) => (t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? { texto: pieza(LAMINAS_OK, '## Citas\nA2 usé: los titulares') } : undefined))
    expect(turnos.filter((t) => t.tipo === 'devolver_citas')).toHaveLength(1)
    expect(ultima.cuerpo.accion).toBe('cerrado')
    expect(MS.filas.filter((f) => f.tipo === 'integra')).toHaveLength(2)
  })

  it('un agente cuyo turno muere 3 veces se omite: la mesa sigue sin él y no inventa su aporte', async () => {
    const { M, MS, a, id } = await montar()
    const { ultima } = await jugar(M, id, a, (t) => (t.agente === 'carousel-designer' ? { error: 'turno muerto' } : undefined))
    expect(ultima.cuerpo.accion).toBe('cerrado')
    expect(MS.filas.filter((f) => f.de === 'carousel-designer' && f.tipo === 'aporta')).toHaveLength(0)
    expect(MS.filas.filter((f) => f.de === 'carousel-designer' && f.tipo === 'nota')).toHaveLength(3)
  })

  it('un pedido de un compañero (mesa_pedir) obtiene su turno de respuesta; uno al portero sin cerebro se contesta «no disponible» y la mesa no se cuelga', async () => {
    const { M, MS, a, id } = await montar()
    const { turnos, ultima } = await jugar(M, id, a, (t) => {
      if (t.agente === 'content-creator' && t.tipo === 'aportar') {
        const base = { encargo_id: id, refs: [], profundidad: 0, costo_usd: 0, workflow_execution_id: null, responde_a: null }
        void MS.aportar({ ...base, de: 'content-creator', para: 'marketing_instagram_curator', tipo: 'pide', texto: 'dime qué foto propia sirve para el hook' })
        void MS.aportar({ ...base, de: 'content-creator', para: 'portero', tipo: 'pide', texto: 'el precio vigente del plato' })
      }
      return undefined
    })
    expect(ultima.cuerpo.accion).toBe('cerrado')
    expect(turnos.some((t) => t.tipo === 'responder' && t.agente === 'marketing_instagram_curator')).toBe(true)
    expect(MS.filas.find((f) => f.tipo === 'material')?.texto).toMatch(/no está disponible/)
  })

  it('el tope: con turnos carísimos la mesa «cierra con lo que hay» y el gasto no pasa del techo (tope × 1,2) más lo que cuesta un turno', async () => {
    const { M, a, id } = await montar()
    const r = await jugar(M, id, a, (t) => ({ texto: t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? pieza() : `aporte de ${t.agente}`, costo_usd: 1.4 }))
    expect(['cerrado', 'cerrado_por_tope']).toContain(String(r.ultima.cuerpo.estado))
    expect(M.encargos.get(id)!.gasto_usd).toBeLessThanOrEqual(5 * 1.2 + 1.4)
  })

  it('una pieza sin ninguna lámina no se puede traducir: el texto va a la bandeja marcado «sin dibujar» y no se pierde', async () => {
    const { M, MS, a, id } = await montar({ dry_run: false })
    const { turnos, ultima } = await jugar(M, id, a, (t) => (t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? { texto: 'Una idea sin láminas ni estructura: solo prosa.\n## Citas\nA2 usé: ideas\nA3 usé: ritmo\nA4 usé: visual\nA5 usé: prompt' } : undefined))
    void turnos
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', con_desacuerdo: true, sin_dibujar: true })
    expect(M.llamadas.render).toBe(0)
    expect(M.llamadas.bandeja).toHaveLength(1)
    expect(String(M.llamadas.bandeja[0].titulo)).toMatch(/SIN DIBUJAR/)
  })

  it('el observador (otro proveedor, fuera de la mesa) bloquea una imagen que muestra un texto que la pieza no pidió', async () => {
    const { M, a, id } = await montar({ dry_run: false })
    M.P.revisor = async (p) => { M.llamadas.revisor++; M.llamadas.revisorPedidos.push(p.texto); return { ok: true, texto: 'TEXTO_VISIBLE: "CERTIFICADO ISO 9001"\nMARCAS: ninguna\nPERSONAS: 0', costo_usd: 0.02, modelo: 'obs' } }
    const { ultima } = await jugar(M, id, a)
    expect(M.encargos.get(id)!.estado_del_motor.fichas.some((f) => f.id === 'observador-hook' && f.gravedad === 'bloquea')).toBe(true)
    expect(ultima.cuerpo.con_desacuerdo).toBe(true)
    expect(M.llamadas.revisorPedidos[0]).toMatch(/NO la evalúes/)
  })

  it('sin directorio, la pieza no abre y falla visible (nunca se lee un error como «directorio vacío»)', async () => {
    const M = crearMemoria({ parte: parteCon(BRIEF_CARRUSEL), plantilla: CARRUSEL_MESA })
    M.P.mesa = crearMesaEnMemoria([])
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    expect(a.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'fallido' })
    expect(String(a.cuerpo.motivo)).toMatch(/dirección creativa/)
  })

  it('reentrega: un «siguiente» repetido devuelve el MISMO turno con su pedido (no abre otro)', async () => {
    const { M, a, id } = await montar()
    const t1 = a.cuerpo.turno as { n: number }
    const again = await avanzar(M.P, id)
    expect(again.cuerpo).toMatchObject({ accion: 'esperar', reentrega: true })
    const t2 = again.cuerpo.turno as { n: number; pedido?: unknown }
    expect(t2.n).toBe(t1.n)
    expect(t2.pedido).toBeTruthy()
  })

  it('una lámina a la que le falta lo mínimo provoca UNA pregunta a la dirección (nunca más) y, contestada, la pieza se dibuja', async () => {
    const coja = LAMINAS_OK.map((l, i) => (i === 2 ? [l[0], '', '', l[3]] : l))
    const { M, MS, a, id } = await montar()
    const { turnos, ultima } = await jugar(M, id, a, (t, veces) => (t.tipo === 'integrar' ? { texto: pieza(coja) } : t.tipo === 'responder' && t.agente === 'creative-director-mesa' ? { texto: pieza() } : t.tipo === 'integrar' && veces > 1 ? { texto: pieza() } : undefined))
    expect(MS.filas.filter((f) => f.de === 'traductor' && f.tipo === 'devuelve')).toHaveLength(1)
    expect(turnos.some((t) => t.tipo === 'responder' && t.agente === 'creative-director-mesa')).toBe(true)
    expect(ultima.cuerpo.accion).toBe('cerrado')
  })
})
