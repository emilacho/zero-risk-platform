import { describe, expect, it } from 'vitest'
import { abrirEncargo, avanzar, recibirResultado, type Respuesta } from '../orquestador'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { CLIENTE, PARTE, crearMemoria, type Memoria } from './memoria'
import { crearMesaEnMemoria, type MesaEnMemoria } from './mesa-memoria'

const BRIEF_CARRUSEL = `### BRF-0100 · Instagram · carrusel
- QUÉ ES: Carrusel educativo de 5 láminas sobre el plato del día
- PROTAGONISTA: El plato del día. UNO.
- MENSAJE (uno): Pídelo hoy.
- LÍMITES: 4:5, de 5 a 8 láminas.
- VOCABULARIO OBLIGATORIO:
  - plato
- PROHIBIDO:
  - premium
- SINTAXIS: Frases cortas.
- VISUAL: El plato aparece completo. No aparecen personas.
- VISUAL OBLIGATORIO:
  - El plato aparece completo
- VISUAL PROHIBIDO:
  - No aparecen personas
- LLAMADO A LA ACCIÓN: Escríbenos por WhatsApp
- APRUEBA Y PARA CUÁNDO: Antes del 14 de octubre de 2026.
`
const parteCon = (b: string) => `# PARTE DE TRABAJO\nPlan de origen: 29d6daeb-a95a-4328-9c10-cf3cddc236f7 · Manual: versión 1\n\n## Entregables\n\n${b}\n### BRF-9999 · Instagram · imagen\n- QUÉ ES: otro\n`

const LAMINAS_OK = [
  ['hook', 'Cada mañana empieza igual', 'Hoy cambia el plato del día.', 'generar: un plato servido sobre una mesa de madera clara, luz natural'],
  ['problem', 'Siempre lo mismo', 'Lo de siempre cansa.', 'ninguna'],
  ['reframe', 'Prueba el plato del día', 'Preparado al momento.', 'ninguna'],
  ['benefit', 'Lo preparamos al momento', 'Fresco, cada día.', 'ninguna'],
  ['cta', 'Escríbenos por WhatsApp', 'Te esperamos.', 'ninguna'],
]
const seccionesDeLaminas = (laminas = LAMINAS_OK) => laminas.map(([rol, t, x, img], i) => `## Lámina ${i + 1} · ${rol}\nTítulo: ${t}\nTexto: ${x}\n${rol === 'cta' ? 'Llamado: Escríbenos por WhatsApp\n' : ''}Imagen: ${img}`).join('\n')
const CITAS_COMPLETAS = '## Citas\nA2 usé: los titulares\nA3 usé: el ritmo de las láminas\nA4 usé: la dirección visual del plato\nA5 usé: el prompt de la primera imagen'
const pieza = (laminas = LAMINAS_OK, citas = CITAS_COMPLETAS) => `${seccionesDeLaminas(laminas)}\n## Pie\nEl plato del día te espera.\n## Etiquetas\n#plato #hoy\n${citas}`

type Turno = { paso: string; agente: string; tipo: string; task: string; n: number }
type Responder = (t: Turno, veces: number) => { texto?: string; error?: string; costo_usd?: number } | undefined

async function montar(o: { dry_run?: boolean; tope?: number } = {}) {
  const M: Memoria = crearMemoria({ parte: parteCon(BRIEF_CARRUSEL), plantilla: CARRUSEL_MESA, tope: o.tope })
  const MS: MesaEnMemoria = crearMesaEnMemoria()
  M.P.mesa = MS
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: o.dry_run ?? true, familia: 'carrusel_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  return { M, MS, a, id: String(a.cuerpo.encargo_id) }
}

const POR_OMISION = (t: Turno): { texto: string } => {
  if (t.tipo === 'dirigir') return { texto: 'Idea rectora: un hook con el plato del día, ritmo corto.' }
  if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto: pieza() }
  return { texto: `Aporte de ${t.agente}: propuesta concreta para la pieza.` }
}

async function jugar(M: Memoria, id: string, primera: Respuesta, responder: Responder = () => undefined, max = 60) {
  let ultima = primera
  const turnos: Turno[] = []
  const veces: Record<string, number> = {}
  for (let i = 0; i < max && ultima.cuerpo.accion === 'esperar'; i++) {
    const t = ultima.cuerpo.turno as { n: number; paso: string; agente: string; pedido?: { task?: string } }
    const tipo = t.paso.split(':')[1] ?? t.paso
    const turno: Turno = { paso: t.paso, agente: t.agente, tipo, task: t.pedido?.task ?? '', n: t.n }
    turnos.push(turno)
    veces[t.paso] = (veces[t.paso] ?? 0) + 1
    const r: { texto?: string; error?: string; costo_usd?: number } = responder(turno, veces[t.paso]) ?? POR_OMISION(turno)
    ultima = await recibirResultado(M.P, id, t.n, { ...r, workflow_execution_id: `ex-${t.n}`, costo_usd: r.costo_usd ?? 0.05 })
  }
  return { ultima, turnos }
}

describe('LA MESA · carrusel · punta a punta con equipo simulado', () => {
  it('camino feliz (ensayo): la dirección abre, cada especialidad aporta, la dirección integra y cita, se traduce, se dibuja y cierra', async () => {
    const { M, MS, a, id } = await montar()
    expect(a.status).toBe(200)
    const { ultima, turnos } = await jugar(M, id, a)
    expect(turnos[0]).toMatchObject({ agente: 'creative-director', tipo: 'dirigir' })
    const aportaron = turnos.filter((t) => t.tipo === 'aportar').map((t) => t.agente).sort()
    expect(aportaron).toEqual(['carousel-designer', 'content-creator', 'design-image-prompt-engineer', 'marketing_instagram_curator'])
    expect(turnos.at(-1)).toMatchObject({ agente: 'creative-director', tipo: 'integrar' })
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
    const { turnos, ultima } = await jugar(M, id, a, (t, veces) => (t.tipo === 'integrar' ? { texto: pieza(coja) } : t.tipo === 'responder' && t.agente === 'creative-director' ? { texto: pieza() } : t.tipo === 'integrar' && veces > 1 ? { texto: pieza() } : undefined))
    expect(MS.filas.filter((f) => f.de === 'traductor' && f.tipo === 'devuelve')).toHaveLength(1)
    expect(turnos.some((t) => t.tipo === 'responder' && t.agente === 'creative-director')).toBe(true)
    expect(ultima.cuerpo.accion).toBe('cerrado')
  })
})
