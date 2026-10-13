/**
 * KIT DEL SECO J5 · lo que NO se ve desde fuera, probado en el proceso (US$ 0):
 *  · IGUALDAD CON LA OFICINA (§13.3, aviso 3 §2): mismas entradas simuladas → mismas fichas, misma resolución y misma marca que la plantilla actual de la oficina para una pieza.
 *  · CEGUERA de GPT: el pedido al revisor externo trae el artefacto y el contexto y NADA de las fichas ni del hilo (con los tres clientes de práctica y los dos registros).
 *  · EL AVISO AGREGADO: uno por revisión que no cierra limpia, ninguno si cierra limpia (en seco no se envía a Slack: solo se ve con los puertos de prueba).
 */
import { describe, expect, it } from 'vitest'
import { CLIENTES } from '../scripts/ops/jefatura-seco/fixtures.mjs'
import { celdas } from '../scripts/ops/jefatura-seco/matriz.mjs'
import { armarPedidoCiego } from '../src/lib/jefatura/revision/pedidos'
import { correr as correrJefatura, puertosDePrueba, sobre as sobreJefatura } from './_helpers/jefatura-revision'
import { BUENOS_PROMPTS, FICHAS_VACIAS, PIEZA_OK, crearMemoria, correr as correrOficina, direccionGenerada, observacion, PARTE, CLIENTE, type Guion } from '../src/lib/oficina/__tests__/memoria'
import { abrirEncargo } from '../src/lib/oficina/orquestador'
import { TARGET_STEP_PRODUCIR } from '../src/lib/oficina/sobre'

type Json = Record<string, any>

// ───────────────────────── igualdad con la oficina (pieza · post con imagen)
const FICHA_DEL_JEFE = { que: '(simulado) hallazgo de fondo en texto', donde: 'texto', contra_que: 'el manual vigente (simulado)', propuesta: '(simulado) ajustar esa parte' }
const idsDe = (tarea: string) => [...String(tarea).matchAll(/^- \[([^\]\n]+)\]/gm)].map((m) => m[1])
const indicesDe = (t: string) => [...String(t).matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))

interface Caso { nombre: string; fichas: 'ninguna' | 'sugerencia' | 'bloquea'; toma: 'todo' | 'nada'; gpt: 'ok' | 'vacio' }
const CASOS: Caso[] = [
  { nombre: 'sin fichas, GPT sin texto', fichas: 'ninguna', toma: 'todo', gpt: 'vacio' },
  { nombre: 'sin fichas, GPT deja texto, toma todo', fichas: 'ninguna', toma: 'todo', gpt: 'ok' },
  { nombre: 'sin fichas, GPT deja texto, toma nada', fichas: 'ninguna', toma: 'nada', gpt: 'ok' },
  { nombre: 'sugerencia, GPT sin texto', fichas: 'sugerencia', toma: 'todo', gpt: 'vacio' },
  { nombre: 'bloquea, toma todo, GPT sin texto', fichas: 'bloquea', toma: 'todo', gpt: 'vacio' },
  { nombre: 'bloquea, toma nada, GPT sin texto', fichas: 'bloquea', toma: 'nada', gpt: 'vacio' },
  { nombre: 'bloquea, toma todo, GPT deja texto', fichas: 'bloquea', toma: 'todo', gpt: 'ok' },
  { nombre: 'bloquea, toma nada, GPT deja texto', fichas: 'bloquea', toma: 'nada', gpt: 'ok' },
]
const TEXTO_GPT = '(simulado) Lectura independiente: el enfoque se entiende; yo explicaría mejor el beneficio principal y revisaría el cierre. Esto es una opinión simulada para el ensayo en seco.'

const resolucion = (tarea: string, toma: 'todo' | 'nada') => {
  const respuestas = idsDe(tarea).map((id) => ({ id, estado: toma === 'nada' ? 'no_tomada' : 'tomada', razon: toma === 'nada' ? '(simulado) no aplica' : '(simulado) tomado' }))
  return JSON.stringify({ respuestas, ...(toma === 'todo' && respuestas.length ? { pieza: { pie_de_foto: '(simulado) pie de foto corregido', hashtags: ['#simulado'] } } : {}) })
}
const solo = (tarea: string, toma: 'todo' | 'nada') => JSON.stringify({ respuestas: idsDe(tarea).map((id) => ({ id, estado: toma === 'nada' ? 'no_tomada' : 'tomada', razon: toma === 'nada' ? '(simulado) no aplica' : '(simulado) tomado' })) })

async function conLaOficina(c: Caso) {
  const M = crearMemoria()
  M.revisorTexto = () => ({ ok: true, texto: c.gpt === 'ok' ? TEXTO_GPT : '', costo_usd: 0, modelo: 'simulado' })
  const guion: Guion = {
    paquete: () => ({ texto: 'material del portero' }), direccion_visual: () => ({ texto: direccionGenerada() }), prompts: () => ({ texto: BUENOS_PROMPTS }),
    mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }), texto: () => ({ texto: PIEZA_OK }),
    revision_jefe: () => ({ texto: c.fichas === 'ninguna' ? FICHAS_VACIAS : JSON.stringify({ fichas: [{ ...FICHA_DEL_JEFE, gravedad: c.fichas }] }) }),
    corrige: (_n, t) => ({ texto: resolucion(t, c.toma) }), decide: (_n, t) => ({ texto: resolucion(t, c.toma) }), decide_imagen: (_n, t) => ({ texto: solo(t, c.toma) }),
    reimagen_prompts: () => ({ texto: BUENOS_PROMPTS }), reimagen_mirar: (_n, t) => ({ texto: observacion(indicesDe(t)) }),
  }
  const ab = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(ab.cuerpo.encargo_id)
  const { ultima, pasos } = await correrOficina(M, id, guion)
  const e = M.encargos.get(id)!.estado_del_motor
  return { fichas: e.fichas.map((f) => ({ origen: f.origen, donde: f.donde, gravedad: f.gravedad, estado: f.estado })), con_desacuerdo: ultima.cuerpo.con_desacuerdo === true, pasos, hubo_decision: pasos.some((p) => p === 'decide' || p === 'decide_imagen') }
}

async function conLaJefatura(c: Caso) {
  const { P } = puertosDePrueba()
  const run = await correrJefatura(P, sobreJefatura('pieza', { id: `igualdad-${c.nombre}`, simulacion: { fichas: c.fichas, toma: c.toma, gpt: c.gpt === 'ok' ? 'ok' : 'vacio' } }))
  const rev = [...(P as unknown as { almacen: { leerRevision: (id: string) => Promise<Json> } }).almacen ? [] : []]
  void rev
  const cuerpo = run.final.cuerpo as Json
  const fichas = (cuerpo.salida?.respuestas ?? []).map((r: Json) => ({ origen: r.origen, donde: r.donde, estado: r.estado }))
  return { fichas, con_desacuerdo: cuerpo.marcas?.con_desacuerdo === true, pasos: run.turnos.map((t) => t.paso), hubo_decision: run.turnos.some((t) => t.paso.startsWith('decision')), resultado: cuerpo.resultado }
}

describe('IGUALDAD CON LA OFICINA · una pieza con las mismas entradas simuladas', () => {
  it.each(CASOS.map((c) => [c.nombre, c] as const))('%s: la misma marca de desacuerdo y las mismas fichas del jefe', async (_n, c) => {
    const o = await conLaOficina(c)
    const j = await conLaJefatura(c)
    // la marca que ve quien recibe la pieza
    expect(j.con_desacuerdo, `oficina ${o.con_desacuerdo} · jefatura ${j.con_desacuerdo}`).toBe(o.con_desacuerdo)
    // las fichas del jefe (qué, dónde, cómo terminaron): la oficina y la jefatura registran las mismas
    const delJefe = (fs: Json[]) => fs.filter((f) => f.origen === 'jefe').map((f) => `${f.donde}:${f.estado}`).sort()
    expect(delJefe(j.fichas)).toEqual(delJefe(o.fichas))
    expect(delJefe(j.fichas), 'la igualdad no puede ser vacía cuando hay ficha').toHaveLength(c.fichas === 'ninguna' ? 0 : 1)
    // si GPT dejó texto, en las dos corre la decisión del autor; si no, ninguna
    expect(j.hubo_decision, `oficina ${o.pasos.join(',')} · jefatura ${j.pasos.join(',')}`).toBe(o.hubo_decision)
  })
})

// ───────────────────────── ceguera de GPT
describe('CEGUERA · el pedido al revisor externo no trae fichas ni hilo (3 rubros × 2 registros)', () => {
  const PROHIBIDO = [/hallazgo de fondo/i, /\bbloquea\b/i, /\bsugerencia\b/i, /\bfichas? (que|del jefe|externas?|de revisi[oó]n)/i, /\(simulado\)/, /\bjefe\b/i, /\[ext-/i, /jefe-marketing/i, /propuesta:/i]
  it.each(CLIENTES.flatMap((c: { id: string }) => ['tuteo', 'voseo'].map((r) => [c.id, r] as const)))('%s · %s', (id, registro) => {
    for (const tipo of ['pieza', 'brief', 'calendario', 'estrategia', 'plan']) {
      const cel = celdas({ tipos: [tipo], clientes: [id], registros: [registro], casos: [tipo === 'plan' ? 'A-sin-fichas-gpt-sin-hallazgos' : tipo === 'pieza' ? 'sin-fichas-gpt-vacio' : 'sin-fichas'] })[0]
      const p = cel.sobre.payload
      const pedido = armarPedidoCiego({ tipo: tipo as never, texto: p.texto, imagenes: p.imagenes, contexto: p.contexto })
      // trae lo revisado COMPLETO y el contexto (el manual vigente entre ellos)
      expect(pedido.texto, `${tipo} trae el artefacto`).toContain(String(p.texto).slice(0, 200))
      expect(pedido.texto, `${tipo} trae el manual`).toContain('Manual de marca vigente')
      for (const re of PROHIBIDO) expect(pedido.texto, `${tipo}: no debe decir ${re}`).not.toMatch(re)
      // no trae las instrucciones internas de la jefatura (esas van solo a los empleados)
      expect(pedido.texto).not.toMatch(/Estás revisando|Respondes ítem por ítem/)
    }
  })
})

// ───────────────────────── el aviso agregado
describe('EL AVISO AGREGADO · uno por revisión que no cierra limpia, ninguno si cierra limpia', () => {
  it.each([
    ['limpia', { fichas: 'ninguna', gpt: 'vacio' }, 0],
    ['con desacuerdo', { fichas: 'bloquea', toma: 'nada', gpt: 'vacio' }, 1],
    ['sin segunda mirada', { fichas: 'ninguna', gpt: 'falla_red' }, 1],
    ['las dos marcas', { fichas: 'bloquea', toma: 'nada', gpt: 'falla_red' }, 1],
    ['fallida (formato roto siempre)', { fichas: 'bloquea', gpt: 'vacio', productor: 'formato_roto_siempre' }, 1],
    ['cortada por tope', { fichas: 'bloquea', gpt: 'ok', tope: 'exceso' }, 1],
  ] as const)('%s → %i aviso(s)', async (_n, simulacion, avisos) => {
    const { P, rastro } = puertosDePrueba()
    await correrJefatura(P, sobreJefatura('pieza', { id: `aviso-${_n}`, simulacion: simulacion as never }))
    expect(rastro.avisos).toHaveLength(avisos)
    for (const a of rastro.avisos) expect(a).toMatch(/seco/) // en seco el texto lo dice
  })
})
