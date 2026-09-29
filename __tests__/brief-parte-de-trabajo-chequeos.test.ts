/**
 * LOS CHEQUEOS DEL PARTE DE TRABAJO · pruebas a costo cero · CC#1 · 2026-09-29 · encargo Lenovo §1.2 ④.
 * Regla de la arquitectura §6: cada chequeo lleva su prueba que PUEDE FALLAR («meter dos iguales a propósito:
 * si pasan, los chequeos no existen»). Aquí cada rojo mete el defecto a propósito y exige que se cace.
 */
import { describe, it, expect } from 'vitest'
import { createRequire } from 'node:module'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const DIR = join(process.cwd(), 'scripts', 'worker-staging', 'brief-parte-de-trabajo')
const { chequear, extraerParte, normalizar, CAMPOS_OBLIGATORIOS } = require(join(DIR, 'brief-chequeos.js'))

const PLAN = `# PLAN DE CAMPAÑA 90 DÍAS · NÁUFRAGO
## LAS CUATRO PUERTAS
### Semana 1-2 · el camino de Instagram para el turno de la mañana
Anuncio de imagen para mostrar el ceviche de Olón al adulto urbano guayaquileño.
### Semana 3-4 · pedidos por WhatsApp para el almuerzo de fin de semana`
const MANUAL = { forbidden_words: ['premium', 'el mejor', 'calidad garantizada', 'ghost kitchen'] }

type Brief = Record<string, unknown>
const brief = (n: number, extra: Brief = {}): Brief => ({
  id: 'BRF-000' + n,
  plataforma: 'Instagram',
  tipo_de_pieza: 'imagen',
  que_es: 'Anuncio de imagen fija para el turno de la mañana, variante ' + n,
  de_que_parte_del_plan: 'Semana 1-2 · el camino de Instagram para el turno de la mañana',
  objetivo: 'Mensajes a WhatsApp · botón «Enviar mensaje»',
  segmento: 'Adulto urbano guayaquileño de 25 a 45 años que quiere marisco fresco sin viajar a la costa. NO es el turista.',
  protagonista: 'El ceviche de Olón · uno solo',
  mensaje: 'El marisco de tu ceviche sale de Olón, no de un proveedor genérico ' + n + '.',
  hipotesis: 'Si mostramos el origen en la foto, el adulto urbano responde más que con la foto del plato solo.',
  limites: 'Titular ≤ 40 caracteres · proporción 4:5',
  vocabulario_obligatorio: ['Olón', 'marisco de Olón'],
  prohibido: ['premium', 'el mejor'],
  sintaxis: 'Frase completa en móvil',
  visual: { capa_que_manda: 'producto', descripcion: 'plano cenital sobre mesa clara', muestra: '2 fotos miradas de 12 piezas (10 son video)' },
  llamado_a_la_accion: 'Enviar mensaje',
  variantes: '2 · varía solo el titular',
  negativos: ['no se ríe de quien no cocina'],
  aprueba_y_para_cuando: 'Emilio · antes del viernes',
  ...extra,
})
const parteOk = () => ({ entregables: [brief(1), brief(2)], pendientes_declarados: [{ entregable: 'Reel', motivo: 'el sistema no mira video' }], huecos: ['presupuesto no fijado'], contradicciones_plan_vs_manual: [] })
const hallazgosDe = (parte: unknown, chequeo: string) => chequear(parte, MANUAL, PLAN).hallazgos.filter((h: { chequeo: string }) => h.chequeo === chequeo)

describe('chequear · un parte sano pasa', () => {
  it('dos briefs completos, distintos, sin prohibidas ni centinelas ⇒ ok, 0 hallazgos', () => {
    const r = chequear(parteOk(), MANUAL, PLAN)
    expect(r.hallazgos).toEqual([])
    expect(r.ok).toBe(true)
    expect(r.entregables_revisados).toBe(2)
  })
  it('la lista de campos obligatorios coincide con la referencia (15 campos + 3 listas se revisan aparte)', () => {
    expect(CAMPOS_OBLIGATORIOS).toHaveLength(15)
  })
})

describe('ROJOS · cada chequeo caza el defecto metido a propósito', () => {
  it('ROJO · dos briefs con el MISMO mensaje ⇒ brief_repetido (si esto pasara, los chequeos no existen)', () => {
    const p = { entregables: [brief(1, { mensaje: 'El marisco sale de Olón.' }), brief(2, { mensaje: 'el marisco sale de OLÓN' })] }
    const h = hallazgosDe(p, 'brief_repetido')
    expect(h).toHaveLength(1)
    expect(h[0].entregable).toContain('BRF-0001')
    expect(h[0].entregable).toContain('BRF-0002')
  })
  it('ROJO · una cifra terminada en ,77 (o .77) ⇒ centinela · copió el ejemplo', () => {
    expect(hallazgosDe({ entregables: [brief(1, { limites: 'Presupuesto US$ 47,77 en la prueba' })] }, 'centinela')).toHaveLength(1)
    expect(hallazgosDe({ entregables: [brief(1, { limites: 'Presupuesto US$ 47.77' })] }, 'centinela')).toHaveLength(1)
    // y una cifra parecida pero legítima NO dispara
    expect(hallazgosDe({ entregables: [brief(1, { limites: 'Presupuesto US$ 47,7 · 1.777 vistas' })] }, 'centinela')).toHaveLength(0)
  })
  it('ROJO · centinela también en huecos/contradicciones/pendientes fuera de los briefs', () => {
    const p = { entregables: [brief(1)], huecos: ['el plan asume US$ 12,77 por cliente'] }
    expect(hallazgosDe(p, 'centinela')).toHaveLength(1)
  })
  it('ROJO · segmento «todos» / «público general» ⇒ publico_no_es_todos', () => {
    expect(hallazgosDe({ entregables: [brief(1, { segmento: 'Todos' })] }, 'publico_no_es_todos').length).toBeGreaterThan(0)
    expect(hallazgosDe({ entregables: [brief(1, { segmento: 'Público general interesado en comida' })] }, 'publico_no_es_todos').length).toBeGreaterThan(0)
  })
  it('ROJO · una palabra prohibida del manual usada en lo que el brief PIDE ⇒ palabra_prohibida (y NO si solo está en su lista de prohibidas)', () => {
    const usa = hallazgosDe({ entregables: [brief(1, { mensaje: 'La experiencia premium del mar en tu puerta.' })] }, 'palabra_prohibida')
    expect(usa).toHaveLength(1)
    expect(usa[0].detalle).toContain('premium')
    // el brief de brief(1) lista «premium» y «el mejor» en `prohibido`: eso es correcto y no se marca
    expect(hallazgosDe(parteOk(), 'palabra_prohibida')).toHaveLength(0)
  })
  it('ROJO · «ghost kitchen» (la que el juez pago dejó pasar con 0,94) se caza por búsqueda literal, con mayúsculas y tildes distintas', () => {
    const p = { entregables: [brief(1, { que_es: 'Anuncio de la Ghost-Kitchen de Náufrago' })] }
    expect(hallazgosDe(p, 'palabra_prohibida')).toHaveLength(1)
  })
  it('ROJO · un brief con mensaje que es una LISTA de mensajes, o de tres frases ⇒ un_mensaje', () => {
    expect(hallazgosDe({ entregables: [brief(1, { mensaje: ['uno', 'dos'] })] }, 'un_mensaje')).toHaveLength(1)
    expect(hallazgosDe({ entregables: [brief(1, { mensaje: 'Fresco. Barato. Rápido. Cerca de ti.' })] }, 'un_mensaje').length).toBeGreaterThan(0)
  })
  it('ROJO · una pieza de VIDEO con brief ⇒ video_sin_pendiente (debía ir a pendientes_declarados)', () => {
    const h = hallazgosDe({ entregables: [brief(1, { tipo_de_pieza: 'video' })] }, 'video_sin_pendiente')
    expect(h).toHaveLength(1)
    expect(h[0].detalle).toMatch(/no video ni audio/)
    expect(hallazgosDe({ entregables: [brief(1, { tipo_de_pieza: 'Reel' })] }, 'video_sin_pendiente')).toHaveLength(1)
  })
  it('ROJO · identificador faltante, mal formado o repetido ⇒ identificador', () => {
    expect(hallazgosDe({ entregables: [brief(1, { id: undefined })] }, 'identificador')).toHaveLength(1)
    expect(hallazgosDe({ entregables: [brief(1, { id: 'brief-1' })] }, 'identificador')).toHaveLength(1)
    expect(hallazgosDe({ entregables: [brief(1), brief(2, { id: 'BRF-0001' })] }, 'identificador')).toHaveLength(1)
  })
  it('ROJO · un campo obligatorio vacío o ausente ⇒ campo_faltante (no se rellena)', () => {
    const h = hallazgosDe({ entregables: [brief(1, { hipotesis: '', llamado_a_la_accion: undefined })] }, 'campo_faltante')
    expect(h.map((x: { detalle: string }) => x.detalle).join(' ')).toMatch(/hipotesis/)
    expect(h.map((x: { detalle: string }) => x.detalle).join(' ')).toMatch(/llamado_a_la_accion/)
  })
  it('ROJO · R6 · una regla visual sin muestra ⇒ visual_sin_muestra; visual como puro texto también', () => {
    expect(hallazgosDe({ entregables: [brief(1, { visual: { capa_que_manda: 'producto', descripcion: 'x' } })] }, 'visual_sin_muestra')).toHaveLength(1)
    expect(hallazgosDe({ entregables: [brief(1, { visual: 'luz natural y plano cenital' })] }, 'visual_sin_muestra')).toHaveLength(1)
    expect(hallazgosDe({ entregables: [brief(1, { visual: 'no aplica' })] }, 'visual_sin_muestra')).toHaveLength(0)
  })
  it('ROJO · la cita al plan que NO existe en el plan ⇒ cita_al_plan; una cita real, no', () => {
    expect(hallazgosDe({ entregables: [brief(1, { de_que_parte_del_plan: 'Capítulo inventado sobre pauta en televisión abierta' })] }, 'cita_al_plan')).toHaveLength(1)
    expect(hallazgosDe(parteOk(), 'cita_al_plan')).toHaveLength(0)
  })
  it('ROJO · un parte sin entregables ⇒ sin_entregables', () => {
    expect(hallazgosDe({ entregables: [] }, 'sin_entregables')).toHaveLength(1)
    expect(chequear({}, MANUAL, PLAN).ok).toBe(false)
  })
  it('lo que falla SE DECLARA y NO se corrige: el parte de entrada no cambia', () => {
    const p = { entregables: [brief(1, { segmento: 'Todos' })] }
    const antes = JSON.stringify(p)
    chequear(p, MANUAL, PLAN)
    expect(JSON.stringify(p)).toBe(antes)
  })
})

describe('extraerParte · nunca inventa si no hay JSON legible', () => {
  it('un bloque ```json con la lista «entregables» ⇒ legible', () => {
    const r = extraerParte('Aquí va el parte.\n```json\n' + JSON.stringify({ parte: parteOk() }) + '\n```\nfin')
    expect(r.legible).toBe(true)
    expect(r.parte.entregables).toHaveLength(2)
  })
  it('JSON suelto sin bloque también se lee', () => {
    expect(extraerParte(JSON.stringify(parteOk())).legible).toBe(true)
  })
  it('prosa sin JSON, texto vacío o JSON sin «entregables» ⇒ NO legible, con motivo', () => {
    expect(extraerParte('Éstos son los entregables: 1) anuncio 2) reel').legible).toBe(false)
    expect(extraerParte('').legible).toBe(false)
    expect(extraerParte('{"otra":"cosa"}').legible).toBe(false)
    expect(extraerParte('{"otra":"cosa"}').motivo).toMatch(/entregables/)
  })
})

describe('normalizar', () => {
  it('quita tildes, signos y mayúsculas', () => {
    expect(normalizar('¡El MARISCO, de Olón!')).toBe('el marisco de olon')
  })
})
