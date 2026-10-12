/** Lo que falta lo proponen los agentes · rotulado «propuesta del agente», solo lo vacío, el resto letra por letra igual. Cuatro rubros inventados, sin modelo. */
import { describe, expect, it } from 'vitest'
import { BATERIA_DE_RUBROS } from '../../rubros-de-prueba/baterias'
import { armarPedidos, camposFaltantes, fusionarPropuestas, leerRespuesta } from '../propuesta'
import type { Fuente } from '../procedencia'

const F = (id: string, texto: string): Fuente => ({ id, tipo: 'primaria_propia', canal: 'sitio', rol: 'cuerpo', rotulo: 'sitio propio', texto } as Fuente)
const DRAFT = { positioning: 'Un negocio local que cuida lo que hace.', mision: '', proposito: 'Que más gente pueda acceder a lo que hacemos.', voice_description: 'Cercana y clara.', personalidad: ['Cercana', 'Directa'], tagline_opciones: [], _field_meta: { mision: { estado: 'provisional' } }, campos_provisionales: ['mision'], campos_ausentes: [] }

describe('qué falta', () => {
  it('vacío, lista vacía y «PENDIENTE» faltan; lo que tiene contenido no', () => {
    expect(camposFaltantes(DRAFT)).toContain('mision'); expect(camposFaltantes(DRAFT)).toContain('tagline_opciones')
    expect(camposFaltantes(DRAFT)).not.toContain('proposito'); expect(camposFaltantes(DRAFT)).not.toContain('positioning')
    expect(camposFaltantes({ mision: 'PENDIENTE: reescribir con fuente' })).toContain('mision')
  })
})

describe('los pedidos', () => {
  it('solo el campo pedido, al agente que es dueño de ese campo, con el manual y la evidencia', () => {
    const r = armarPedidos({ draft: DRAFT, fuentes: [F('s1', 'Somos un negocio que ofrece lo suyo a quien pasa por la zona.')], campos: ['mision'], cliente: 'Negocio Demo' })
    expect(r.pedidos.length).toBe(1)
    expect(r.pedidos[0].agente).toBe('jefe-client-success'); expect(r.pedidos[0].campos).toEqual(['mision'])
    expect(r.pedidos[0].task).toContain('«mision»'); expect(r.pedidos[0].task).toContain('EVIDENCIA DEL CLIENTE'); expect(r.pedidos[0].task).toContain('quien pasa por la zona')
    expect(r.pedidos[0].task.length).toBeLessThanOrEqual(14000)
  })
  it('un campo que ya tiene contenido o que no se propone se rechaza con su motivo', () => {
    const r = armarPedidos({ draft: DRAFT, fuentes: [], campos: ['proposito', 'logo_usage_notes'] })
    expect(r.pedidos).toEqual([]); expect(r.rechazados.map((x) => x.motivo).join(' ')).toMatch(/nunca lo pisa[\s\S]*lista cerrada/)
  })
  it('varios campos de agentes distintos → un pedido por agente', () => {
    const r = armarPedidos({ draft: { ...DRAFT, mensajes_clave: [] }, fuentes: [], campos: ['mision', 'mensajes_clave'] })
    expect(r.pedidos.map((p) => p.agente).sort()).toEqual(['editor-en-jefe', 'jefe-client-success'])
  })
})

describe('leer la respuesta del agente (tolerante, sin inventar)', () => {
  it('con texto alrededor, con llaves dentro de la razón y con un campo que no devolvió', () => {
    const t = 'Claro, aquí está:\n{"mision": {"texto": "Ofrecemos cocina de la casa a quienes pasan por la zona.", "razon": "el sitio lo describe como {cocina de casa}"}}\nListo.'
    const r = leerRespuesta(t, ['mision', 'proposito'])
    expect(r.propuestas).toEqual([{ campo: 'mision', valor: 'Ofrecemos cocina de la casa a quienes pasan por la zona.', razon: 'el sitio lo describe como {cocina de casa}' }])
    expect(r.sin_leer.map((x) => x.campo)).toEqual(['proposito'])
  })
  it('una respuesta que no es JSON no inventa nada', () => {
    const r = leerRespuesta('No pude hacerlo', ['mision'])
    expect(r.propuestas).toEqual([]); expect(r.sin_leer[0].motivo).toMatch(/JSON legible/)
  })
  it('un campo devuelto vacío con su razón queda «sin propuesta» y dice qué falta', () => {
    const r = leerRespuesta('{"mision": {"texto": "", "razon": "la evidencia no dice a quién atiende"}}', ['mision'])
    expect(r.propuestas).toEqual([]); expect(r.sin_leer[0].motivo).toMatch(/la evidencia no dice a quién atiende/)
  })
  it('listas', () => {
    const r = leerRazonLista()
    expect(r.propuestas[0].valor).toEqual(['Cercana', 'Directa', 'Clara'])
  })
})
const leerRazonLista = () => leerRespuesta('{"personalidad": {"items": ["Cercana", " Directa ", "", "Clara"], "razon": "se ve en sus textos"}}', ['personalidad'])

describe('fusionar', () => {
  it('rotula la propuesta, llena SOLO ese campo, deja el resto letra por letra igual y saca el campo de «provisionales»', () => {
    const r = fusionarPropuestas(DRAFT, [{ campo: 'mision', valor: 'Ofrecemos cocina de la casa a quienes pasan por la zona.', razon: 'el sitio lo describe así' }], [])
    expect(r.aplicadas).toEqual(['mision']); expect(r.campos_distintos).toEqual(['mision'])
    expect(r.draft.mision).toBe('Ofrecemos cocina de la casa a quienes pasan por la zona. [propuesta del agente — el sitio lo describe así]')
    for (const k of ['positioning', 'proposito', 'voice_description', 'personalidad', 'tagline_opciones']) expect(JSON.stringify(r.draft[k])).toBe(JSON.stringify((DRAFT as Record<string, unknown>)[k]))
    expect(r.draft.campos_provisionales).toEqual([]); expect(r.draft.campos_con_propuesta_del_agente).toEqual(['mision'])
    expect((r.draft._field_meta as Record<string, { estado: string }>).mision.estado).toBe('propuesta_del_agente')
    expect(DRAFT.mision).toBe('') // la entrada no se muta
  })
  it('nunca pisa un campo con contenido', () => {
    const r = fusionarPropuestas(DRAFT, [{ campo: 'proposito', valor: 'Otro propósito cualquiera.', razon: 'x' }], [])
    expect(r.aplicadas).toEqual([]); expect(r.rechazadas[0].motivo).toMatch(/nunca lo pisa/); expect(r.draft.proposito).toBe(DRAFT.proposito)
  })
  it('una propuesta que afirma un hecho sin respaldo NO se aplica (no es la puerta trasera)', () => {
    const r = fusionarPropuestas(DRAFT, [{ campo: 'mision', valor: 'Somos el mejor negocio certificado de la región, con 25 años de experiencia.', razon: 'x' }], [])
    expect(r.aplicadas).toEqual([]); expect(r.rechazadas[0].motivo).toMatch(/hecho\(s\) sin respaldo/); expect(r.hechos_sin_respaldo.length).toBeGreaterThan(0)
  })
  it('listas: cada elemento lleva su rótulo', () => {
    const r = fusionarPropuestas(DRAFT, [{ campo: 'tagline_opciones', valor: ['Algo cercano', 'Algo claro'], razon: 'desde su voz' }], [])
    expect(r.draft.tagline_opciones).toEqual(['Algo cercano [propuesta del agente — desde su voz]', 'Algo claro [propuesta del agente — desde su voz]'])
  })
})

describe.each(BATERIA_DE_RUBROS)('misión propuesta · $rubro', (c) => {
  it('una misión llana de este rubro se acepta, rotulada, y el resto no cambia', () => {
    const m = `${c.nombre} atiende a quienes buscan lo que hace, de forma cercana y clara.`
    const r = fusionarPropuestas(DRAFT, [{ campo: 'mision', valor: m, razon: 'resumen de lo que dice su sitio' }], [])
    expect(r.aplicadas).toEqual(['mision']); expect(r.campos_distintos).toEqual(['mision'])
    expect(String(r.draft.mision).endsWith('[propuesta del agente — resumen de lo que dice su sitio]')).toBe(true)
  })
})
