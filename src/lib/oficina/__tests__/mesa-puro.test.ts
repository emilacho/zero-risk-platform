import { describe, expect, it } from 'vitest'
import { especialistasPertinentes, esPertinente, seccionDelDirectorio } from '../mesa/directorio'
import { huellaDePedido, idasYVueltas, leerCitas, participacion, pedidosSinContestar, verificarCitas } from '../mesa/libro'
import { cotaAgotada, pedidosAtendibles, siguienteDeLaMesa, techoDe } from '../mesa/planificador'
import { traducirPieza, hayImagenesAGenerar } from '../mesa/traductor'
import { COTAS, type Aporte, type EstadoMesa, type Tarjeta } from '../mesa/tipos'

const T = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[], activo = true): Tarjeta => ({ agente, rol, especialidad: `especialidad de ${agente}`, sabe_hacer: ['a'], necesita: ['b'], entrega: ['c'], pertinente_en, activo, version: 1 })
const DIR: Tarjeta[] = [
  T('creative-director-mesa', 'direccion', ['carrusel', 'kit']),
  T('content-creator', 'miembro', ['carrusel', 'kit']),
  T('carousel-designer', 'miembro', ['carrusel']),
  T('design-visual-storyteller', 'miembro', ['kit']),
  T('marketing_instagram_curator', 'miembro', ['carrusel', 'kit']),
  T('design-image-prompt-engineer', 'miembro', ['carrusel:si_imagen_generada', 'kit:si_imagen_generada']),
  T('portero', 'portero', []),
]
const est = (o: Partial<EstadoMesa> = {}): EstadoMesa => ({ tipo: 'carrusel', directorio_congelado: DIR, direccion: 'creative-director-mesa', turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null, ...o })
let n = 0
const A = (o: Partial<Aporte> & Pick<Aporte, 'de' | 'tipo'>): Aporte => { n++; return { id: `id-${n}`, encargo_id: 'e1', n, para: null, texto: 'texto del aporte', refs: [], responde_a: null, profundidad: 0, costo_usd: 0.1, workflow_execution_id: 'x', creado_en: '2026-10-28T00:00:00Z', ...o } }
const reset = () => { n = 0 }
const ctx = (g = 0.5, tope = 5, img = false) => ({ gasto_usd: g, tope_usd: tope, hayImagenGenerada: img })

describe('directorio · pertinencia como dato', () => {
  it('lo condicional a imagen solo cuenta si se genera alguna', () => {
    const prompt = DIR.find((t) => t.agente === 'design-image-prompt-engineer')!
    expect(esPertinente(prompt, 'carrusel', false)).toBe(false)
    expect(esPertinente(prompt, 'carrusel', true)).toBe(true)
    expect(esPertinente(prompt, 'post' as never, true)).toBe(false)
  })
  it('un agente inactivo o la dirección/portero no son «especialistas pertinentes»', () => {
    expect(especialistasPertinentes(DIR, 'carrusel', false).sort()).toEqual(['carousel-designer', 'content-creator', 'marketing_instagram_curator'])
    expect(especialistasPertinentes(DIR, 'kit', true).sort()).toEqual(['content-creator', 'design-image-prompt-engineer', 'design-visual-storyteller', 'marketing_instagram_curator'])
    expect(especialistasPertinentes(DIR.map((t) => (t.agente === 'content-creator' ? { ...t, activo: false } : t)), 'carrusel', false)).not.toContain('content-creator')
  })
  it('agregar un agente es agregar una fila: aparece en el directorio y es pertinente sin tocar código', () => {
    const nuevo = [...DIR, T('nuevo-especialista', 'miembro', ['carrusel'])]
    expect(especialistasPertinentes(nuevo, 'carrusel', false)).toContain('nuevo-especialista')
    expect(seccionDelDirectorio(nuevo, 'content-creator')).toMatch(/nuevo-especialista/)
    expect(seccionDelDirectorio(nuevo, 'content-creator')).toMatch(/content-creator\*\* \(tú\)/)
  })
})

describe('libro · citas (condición 2) y participación', () => {
  it('lee citas en formatos distintos', () => {
    const c = leerCitas('## Citas\n- A3 usé: el titular del gancho\nA5 descarté: no cabe con la foto del cliente\n**A7** usada — la idea del cierre\nno es una cita')
    expect(c.map((x) => [x.n, x.accion])).toEqual([[3, 'uso'], [5, 'descarte'], [7, 'uso']])
  })
  it('verifica existencia, cobertura por especialista y motivo del descarte', () => {
    reset()
    const l = [A({ de: 'creative-director-mesa', tipo: 'dirige' }), A({ de: 'content-creator', tipo: 'aporta' }), A({ de: 'carousel-designer', tipo: 'aporta' })]
    const pert = ['content-creator', 'carousel-designer']
    const M2 = 'A2 usé: el titular del gancho'
    expect(verificarCitas(`${M2}\nA3 usé: el ritmo de las láminas`, l, pert).ok).toBe(true)
    expect(verificarCitas(M2, l, pert)).toMatchObject({ ok: false, sin_cita: ['carousel-designer'] })
    // L01 · la cita a un aporte que NO existe no vale: devuelve la pieza aunque la cobertura esté completa
    const fantasma = verificarCitas(`${M2}\nA9 usé: un aporte fantasma\nA3 usé: el ritmo de las láminas`, l, pert)
    expect(fantasma.inexistentes).toEqual([9])
    expect(fantasma.ok).toBe(false)
    // …y una cita fantasma tampoco cubre a nadie
    expect(verificarCitas(`${M2}\nA9 usé: un aporte fantasma`, l, pert)).toMatchObject({ ok: false, sin_cita: ['carousel-designer'], inexistentes: [9] })
    // descartar SIN motivo no cuenta como citar
    expect(verificarCitas(`${M2}\nA3 descarté: no`, l, pert)).toMatchObject({ ok: false, sin_cita: ['carousel-designer'], descartes_sin_motivo: [3] })
    // descartar CON motivo sí cuenta
    expect(verificarCitas(`${M2}\nA3 descarté: choca con la proporción 4:5 del formato`, l, pert).ok).toBe(true)
  })
  it('T4 · un «usé» sin motivo suficiente (< 8 caracteres) no cuenta y se devuelve; con 8 exactos sí cuenta', () => {
    reset()
    const l = [A({ de: 'creative-director-mesa', tipo: 'dirige' }), A({ de: 'content-creator', tipo: 'aporta' }), A({ de: 'carousel-designer', tipo: 'aporta' })]
    const pert = ['content-creator', 'carousel-designer']
    expect(verificarCitas('A2 usé:\nA3 usé: el ritmo de las láminas', l, pert)).toMatchObject({ ok: false, sin_cita: ['content-creator'], usos_sin_motivo: [2] })
    expect(verificarCitas('A2 usé: sí\nA3 usé: el ritmo de las láminas', l, pert)).toMatchObject({ ok: false, usos_sin_motivo: [2] })
    expect(verificarCitas('A2 usé: 1234567\nA3 usé: 12345678', l, pert)).toMatchObject({ ok: false, usos_sin_motivo: [2], sin_cita: ['content-creator'] })
    expect(verificarCitas('A2 usé: 12345678\nA3 usé: 12345678', l, pert)).toMatchObject({ ok: true, usos_sin_motivo: [] })
  })
  it('participación cuenta solo aportes reales (no vacíos, no notas)', () => {
    reset()
    const l = [A({ de: 'a', tipo: 'aporta' }), A({ de: 'a', tipo: 'responde' }), A({ de: 'b', tipo: 'aporta', texto: '  ' }), A({ de: 'c', tipo: 'nota' })]
    expect(participacion(l)).toEqual({ a: 2 })
  })
  it('un pedido contestado deja de estar pendiente; idas y vueltas cuenta en ambos sentidos; la huella normaliza', () => {
    reset()
    const p = A({ de: 'x', tipo: 'pide', para: 'y' })
    const r = A({ de: 'y', tipo: 'responde', para: 'x', responde_a: p.id })
    expect(pedidosSinContestar([p])).toHaveLength(1)
    expect(pedidosSinContestar([p, r])).toHaveLength(0)
    expect(idasYVueltas([p, r], 'x', 'y')).toBe(2)
    expect(idasYVueltas([p, r], 'y', 'x')).toBe(2)
    expect(huellaDePedido('x', 'y', '  Dame   LA foto ')).toBe(huellaDePedido('x', 'y', 'dame la foto'))
  })
})

describe('planificador · el código reparte turnos y exige participación, no dicta el orden', () => {
  it('abre la dirección; luego convoca a cada especialidad pertinente que no aportó; luego integra; luego traduce', () => {
    reset()
    let l: Aporte[] = []
    expect(siguienteDeLaMesa(est(), l, ctx())).toMatchObject({ accion: 'turno', agente: 'creative-director-mesa', tipo: 'dirigir' })
    l = [A({ de: 'creative-director-mesa', tipo: 'dirige' })]
    const vistos: string[] = []
    for (let i = 0; i < 6; i++) {
      const s = siguienteDeLaMesa(est(), l, ctx())
      if (s.accion !== 'turno' || s.tipo !== 'aportar') break
      vistos.push(s.agente)
      l = [...l, A({ de: s.agente, tipo: 'aporta' })]
    }
    expect(vistos.sort()).toEqual(['carousel-designer', 'content-creator', 'marketing_instagram_curator'])
    expect(siguienteDeLaMesa(est(), l, ctx())).toMatchObject({ accion: 'turno', agente: 'creative-director-mesa', tipo: 'integrar' })
    const cita = (l.filter((a) => a.tipo === 'aporta').map((a) => `A${a.n} usé: aporte de ${a.de} para la pieza`)).join('\n')
    l = [...l, A({ de: 'creative-director-mesa', tipo: 'integra', texto: `## Lámina 1\nTítulo: hola\n\n## Citas\n${cita}` })]
    expect(siguienteDeLaMesa(est(), l, ctx()).accion).toBe('traducir')
  })
  it('una pieza hecha por un solo agente NO se cierra: sin el aporte del diseñador sigue convocándolo', () => {
    reset()
    const l = [A({ de: 'creative-director-mesa', tipo: 'dirige' }), A({ de: 'content-creator', tipo: 'aporta' }), A({ de: 'marketing_instagram_curator', tipo: 'aporta' }), A({ de: 'creative-director-mesa', tipo: 'integra', texto: 'A2 usé: copy completo\nA3 usé: foto elegida' })]
    expect(siguienteDeLaMesa(est(), l, ctx())).toMatchObject({ agente: 'carousel-designer', tipo: 'aportar' })
  })
  it('lo condicional a imagen: el de prompts se convoca solo si la pieza pide generar', () => {
    reset()
    const base = [A({ de: 'creative-director-mesa', tipo: 'dirige' }), A({ de: 'content-creator', tipo: 'aporta' }), A({ de: 'carousel-designer', tipo: 'aporta' }), A({ de: 'marketing_instagram_curator', tipo: 'aporta' })]
    expect(siguienteDeLaMesa(est(), base, ctx(0.5, 5, false))).toMatchObject({ tipo: 'integrar' })
    expect(siguienteDeLaMesa(est(), base, ctx(0.5, 5, true))).toMatchObject({ agente: 'design-image-prompt-engineer', tipo: 'aportar' })
  })
  it('un pedido a un compañero le da su turno; al portero abre material; un pedido nunca contestado no se repite', () => {
    reset()
    const l = [A({ de: 'creative-director-mesa', tipo: 'dirige' }), A({ de: 'content-creator', tipo: 'pide', para: 'carousel-designer', texto: 'dame el ritmo' })]
    expect(siguienteDeLaMesa(est(), l, ctx())).toMatchObject({ agente: 'carousel-designer', tipo: 'responder', responde_a: l[1].id })
    const m = [A({ de: 'creative-director-mesa', tipo: 'dirige' }), A({ de: 'content-creator', tipo: 'pide', para: 'portero', texto: 'precios vigentes' })]
    expect(siguienteDeLaMesa(est(), m, ctx())).toMatchObject({ accion: 'material', de: 'content-creator' })
  })
  it('cotas de bucle: profundidad máxima y idas y vueltas por pareja dejan el pedido sin atender', () => {
    reset()
    const l = [A({ de: 'creative-director-mesa', tipo: 'dirige' }), A({ de: 'content-creator', tipo: 'pide', para: 'carousel-designer', profundidad: COTAS.MAX_PROFUNDIDAD + 1 })]
    expect(pedidosAtendibles(est(), l)).toHaveLength(0)
    reset()
    const ping: Aporte[] = [A({ de: 'creative-director-mesa', tipo: 'dirige' })]
    for (let i = 0; i < COTAS.MAX_IDAS_VUELTAS_POR_PAREJA / 2; i++) {
      const p = A({ de: 'content-creator', tipo: 'pide', para: 'carousel-designer' })
      ping.push(p, A({ de: 'carousel-designer', tipo: 'responde', para: 'content-creator', responde_a: p.id }))
    }
    ping.push(A({ de: 'content-creator', tipo: 'devuelve', para: 'carousel-designer' }))
    expect(pedidosAtendibles(est(), ping)).toHaveLength(0)
  })
  it('un agente que falla 3 veces ya no se convoca (no hay bucle) y un pedido a un agente inactivo se ignora', () => {
    reset()
    const l = [A({ de: 'creative-director-mesa', tipo: 'dirige' }), ...[1, 2, 3].map(() => A({ de: 'carousel-designer', tipo: 'nota', texto: 'turno_fallido: x' }))]
    const s = siguienteDeLaMesa(est(), l, ctx())
    expect(s).not.toMatchObject({ agente: 'carousel-designer' })
    const inactivo = est({ directorio_congelado: DIR.map((t) => (t.agente === 'carousel-designer' ? { ...t, activo: false } : t)) })
    expect(pedidosAtendibles(inactivo, [A({ de: 'content-creator', tipo: 'pide', para: 'carousel-designer' })])).toHaveLength(0)
  })
  it('techo absoluto: tope × 1,2 corta todo; con el tope agotado hay UNA integración «con lo que hay» y luego a dibujar', () => {
    reset()
    const l = [A({ de: 'creative-director-mesa', tipo: 'dirige' }), A({ de: 'content-creator', tipo: 'aporta' })]
    expect(techoDe(5)).toBe(6)
    expect(siguienteDeLaMesa(est(), l, ctx(6.01, 5))).toEqual({ accion: 'cierre_por_tope', razon: 'techo_de_gasto' })
    expect(cotaAgotada(est(), ctx(3.4, 5))).toMatch(/tope de la pieza/)
    expect(siguienteDeLaMesa(est(), l, ctx(3.4, 5))).toMatchObject({ tipo: 'integrar', motivo: expect.stringContaining('cierra con lo que hay') })
    const l2 = [...l, A({ de: 'creative-director-mesa', tipo: 'integra', texto: 'x' })]
    expect(siguienteDeLaMesa(est(), l2, ctx(3.4, 5)).accion).toBe('seguir_a_dibujar')
    // sin plata para otro turno ni siquiera integra
    expect(siguienteDeLaMesa(est(), l, ctx(5.8, 5)).accion).toBe('seguir_a_dibujar')
    // los 24 turnos
    expect(cotaAgotada(est({ turnos: COTAS.MAX_TURNOS }), ctx(0.5, 5))).toMatch(/turnos/)
  })
  it('las citas faltantes se devuelven UNA vez y luego sigue (la jefatura lo verá)', () => {
    reset()
    const l = [A({ de: 'creative-director-mesa', tipo: 'dirige' }), A({ de: 'content-creator', tipo: 'aporta' }), A({ de: 'carousel-designer', tipo: 'aporta' }), A({ de: 'marketing_instagram_curator', tipo: 'aporta' }), A({ de: 'creative-director-mesa', tipo: 'integra', texto: 'A2 usé: x' })]
    expect(siguienteDeLaMesa(est(), l, ctx())).toMatchObject({ tipo: 'devolver_citas' })
    expect(siguienteDeLaMesa(est({ devoluciones_por_citas: 1 }), l, ctx()).accion).toBe('traducir')
  })
})

describe('traductor tolerante · nunca rechaza por largo (condición 7)', () => {
  const lam = (n: number, cuerpo: string) => `## Lámina ${n}\nTítulo: Título ${n}\nTexto: ${cuerpo}\nImagen: ninguna\n`
  it('una lámina de 400 caracteres PASA con un aviso (no se rechaza)', () => {
    const largo = 'x'.repeat(400)
    const t = traducirPieza(lam(1, largo) + lam(2, 'corto') + '\n## Pie\nUn pie\n\n## Etiquetas\n#uno #dos', 'carrusel')
    expect(t.ok).toBe(true)
    expect(t.laminas![0].body).toHaveLength(400)
    expect(t.avisos.join(' ')).toMatch(/lámina 1.*400 caracteres/)
    expect(t.hashtags).toEqual(['#uno', '#dos'])
    expect(t.copy_carrusel!.texto_base).toContain('x'.repeat(400))
  })
  it('un titular de 300 caracteres tampoco mata la pieza', () => {
    const t = traducirPieza(`## Lámina 1 · hook\nTítulo: ${'t'.repeat(300)}\n`, 'carrusel')
    expect(t.ok).toBe(true)
    expect(t.avisos[0]).toMatch(/headline/)
  })
  it('roles: el del encabezado si es válido; si no, por posición; la última con llamado es cta', () => {
    const t = traducirPieza('## Lámina 1\nTítulo: a\n## Lámina 2 · proof\nTítulo: b\n## Lámina 3\nTítulo: c\nLlamado: escríbenos', 'carrusel')
    expect(t.laminas!.map((l) => l.rol)).toEqual(['hook', 'proof', 'cta'])
  })
  it('imágenes: foto propia, generar y ninguna', () => {
    const t = traducirPieza('## Lámina 1\nTítulo: a\nImagen: foto:abc123\n## Lámina 2\nTítulo: b\nImagen: generar: plato de ceviche de frente\n## Lámina 3\nTítulo: c', 'carrusel')
    expect(t.imagenes.map((i) => i.modo)).toEqual(['real', 'generada', 'ninguna'])
    expect(t.imagenes[0]).toMatchObject({ foto_id: 'abc123' })
    expect(hayImagenesAGenerar('## Lámina 1\nTítulo: a\nImagen: generar: algo', 'carrusel')).toBe(true)
  })
  it('máximo UNA pregunta: si falta el título pregunta una vez; la segunda vez entrega lo que hay o pasa como texto', () => {
    const md = '## Lámina 1\nTítulo: a\n## Lámina 2\n'
    const q = traducirPieza(md, 'carrusel', { preguntasHechas: 0 })
    expect(q.ok).toBe(false)
    expect(q.pregunta).toMatch(/lámina 2/i)
    const despues = traducirPieza(md, 'carrusel', { preguntasHechas: COTAS.MAX_PREGUNTAS_DEL_TRADUCTOR })
    expect(despues.pregunta).toBeUndefined()
    expect(despues.ok).toBe(true)
    expect(despues.laminas).toHaveLength(1)
  })
  it('si no entiende NADA: ok=false SIN pregunta y con motivo (la pieza completa pasa a la jefatura como texto)', () => {
    const t = traducirPieza('Hola, esta es mi idea suelta para una pieza sin estructura', 'carrusel', { preguntasHechas: 1 })
    expect(t).toMatchObject({ ok: false, motivo: expect.stringContaining('láminas') })
    expect(t.pregunta).toBeUndefined()
  })
  it('kit: una sección por elemento del brief, por ref o por orden', () => {
    const t = traducirPieza('## BRF-1 · plato del día\nTítulo: El plato\nTexto: Hoy\n## segunda\nTítulo: Horario\nCTA: Escríbenos', 'kit', { refsDelKit: ['BRF-1', 'BRF-2'], tipoPorRef: { 'BRF-1': 'historia', 'BRF-2': 'estado' } })
    expect(t.ok).toBe(true)
    expect(t.copy_kit!.map((c) => c.ref)).toEqual(['BRF-1', 'BRF-2'])
    expect(t.estructura!.map((e) => e.rol)).toEqual(['historia', 'estado'])
  })
})
