/** ayuda de pruebas de la mesa: la pieza de carrusel jugada de punta a punta con un equipo simulado (mismo arnés para las pruebas de la mesa) */
import { abrirEncargo, recibirResultado, type Respuesta } from '../orquestador'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { CLIENTE, PARTE, crearMemoria, type Memoria } from './memoria'
import { crearMesaEnMemoria, type MesaEnMemoria } from './mesa-memoria'

export const BRIEF_CARRUSEL = `### BRF-0100 · Instagram · carrusel
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
export const parteCon = (b: string) => `# PARTE DE TRABAJO\nPlan de origen: 29d6daeb-a95a-4328-9c10-cf3cddc236f7 · Manual: versión 1\n\n## Entregables\n\n${b}\n### BRF-9999 · Instagram · imagen\n- QUÉ ES: otro\n`

export const LAMINAS_OK = [
  ['hook', 'Cada mañana empieza igual', 'Hoy cambia el plato del día.', 'generar: un plato servido sobre una mesa de madera clara, luz natural'],
  ['problem', 'Siempre lo mismo', 'Lo de siempre cansa.', 'ninguna'],
  ['reframe', 'Prueba el plato del día', 'Preparado al momento.', 'ninguna'],
  ['benefit', 'Lo preparamos al momento', 'Fresco, cada día.', 'ninguna'],
  ['cta', 'Escríbenos por WhatsApp', 'Te esperamos.', 'ninguna'],
]
export const seccionesDeLaminas = (laminas = LAMINAS_OK) => laminas.map(([rol, t, x, img], i) => `## Lámina ${i + 1} · ${rol}\nTítulo: ${t}\nTexto: ${x}\n${rol === 'cta' ? 'Llamado: Escríbenos por WhatsApp\n' : ''}Imagen: ${img}`).join('\n')
export const CITAS_COMPLETAS = '## Citas\nA2 usé: los titulares\nA3 usé: el ritmo de las láminas\nA4 usé: la dirección visual del plato\nA5 usé: el prompt de la primera imagen'
export const pieza = (laminas = LAMINAS_OK, citas = CITAS_COMPLETAS) => `${seccionesDeLaminas(laminas)}\n## Pie\nEl plato del día te espera.\n## Etiquetas\n#plato #hoy\n${citas}`

export type Turno = { paso: string; agente: string; tipo: string; task: string; n: number }
export type Responder = (t: Turno, veces: number) => { texto?: string; error?: string; costo_usd?: number } | undefined

export async function montar(o: { dry_run?: boolean; tope?: number; aprendizaje?: NonNullable<Memoria['P']['aprendizaje']> } = {}) {
  const M: Memoria = crearMemoria({ parte: parteCon(BRIEF_CARRUSEL), plantilla: CARRUSEL_MESA, tope: o.tope })
  const MS: MesaEnMemoria = crearMesaEnMemoria()
  M.P.mesa = MS
  if (o.aprendizaje) M.P.aprendizaje = o.aprendizaje
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: o.dry_run ?? true, familia: 'carrusel_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  return { M, MS, a, id: String(a.cuerpo.encargo_id) }
}

export const POR_OMISION = (t: Turno): { texto: string } => {
  if (t.tipo === 'dirigir') return { texto: 'Idea rectora: un hook con el plato del día, ritmo corto.' }
  if (t.tipo === 'integrar' || t.tipo === 'devolver_citas') return { texto: pieza() }
  return { texto: `Aporte de ${t.agente}: propuesta concreta para la pieza.` }
}

export async function jugar(M: Memoria, id: string, primera: Respuesta, responder: Responder = () => undefined, max = 60) {
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
