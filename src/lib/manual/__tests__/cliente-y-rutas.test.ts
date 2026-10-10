/**
 * La revisión del manual aplicada a un cliente y sus dos rutas (relevo 51): lo que el alta llama en lugar de `.slice(0, 3500)` y para chequear hechos.
 * Cliente SINTÉTICO de otro rubro (clínica dental inventada). Sin base, sin red, sin modelo.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { chequeoDelManual, materiaDelCliente, propiosDeFicha } from '../cliente'
import { filaInstagram, filaSitio, PROPIOS } from './apoyo'
import { POST as POST_HECHOS } from '@/app/api/manual/hechos/route'
import { POST as POST_MATERIA } from '@/app/api/manual/materia/route'

const ESLOGAN = 'Sonríe sin miedo, tu clínica de siempre'
const largo = (n: number, m = 'texto') => `${m} `.repeat(n)

describe('propiosDeFicha · lo que es SUYO', () => {
  it('sitio de la ficha y usuarios de sus redes (con @, con dirección o sin ellos); sin redes, solo el sitio', () => {
    expect(propiosDeFicha({ website_url: 'https://www.clinicaejemplo.test', config: { apify: { own_handles: { instagram: '@clinicaejemplo', facebook: 'https://facebook.com/clinicaejemplo.ec/' } } } }))
      .toEqual({ sitio: 'https://www.clinicaejemplo.test', handles: ['clinicaejemplo', 'clinicaejemplo.ec'] })
    expect(propiosDeFicha({ website_url: null, config: null })).toEqual({ sitio: null, handles: [] })
    expect(propiosDeFicha({ config: { apify: { own_handles: { instagram: '   ', x: 5 } } } }).handles).toEqual([])
  })
})

describe('materiaDelCliente · R2 y R1 (la frase propia a más de 3.500 caracteres ya no se pierde)', () => {
  const filas = [
    filaSitio('s1', [
      // la página trae primero un volcado largo de datos y SOLO al final el título con la frase propia (el defecto del alta)
      { url: 'https://www.clinicaejemplo.test/', title: ESLOGAN, description: 'Odontología familiar', text: `${largo(900, 'dato')} Agenda hoy.` },
      { url: 'https://www.clinicaejemplo.test/nosotros', text: 'Somos un equipo de tres odontólogos.' },
    ]),
    filaInstagram('i1', 'clinicaejemplo', `${ESLOGAN}\nAgenda por WhatsApp`, [{ caption: 'Nuevo consultorio', ownerUsername: 'clinicaejemplo' }]),
    // un competidor que dice la misma frase en dos fuentes NO es propio
    filaInstagram('c1', 'otraclinica', `${ESLOGAN}\nSomos otra`, []),
    { ...filaInstagram('e1', 'clinicaejemplo', 'DATO SINTÉTICO DE ENSAYO', []), ensayo: true },
  ]
  const r = materiaDelCliente(filas, PROPIOS)
  it('la frase propia sale literal y de una fuente posicional', () => {
    expect(r.estado_eslogan).toBe('hallado')
    expect(r.eslogan?.literal).toBe(ESLOGAN)
    expect(r.fuentes_propias_leidas).toBeGreaterThan(1)
  })
  it('el título va primero aunque la página sea larga, y lo recortado lo dice con el marcador y los números', () => {
    expect(r.texto.indexOf(ESLOGAN)).toBeLessThan(r.texto.indexOf('dato dato'))
    const c = materiaDelCliente(filas, PROPIOS, { portada: 500 })
    expect(c.recortes.length).toBeGreaterThan(0)
    expect(c.texto).toMatch(/\[bloque recortado: se leyeron 500 de \d+ caracteres\]/)
    expect(c.total_leido).toBeLessThan(c.total_original)
  })
  it('solo entra lo propio: ni el competidor ni el ensayo', () => {
    expect(r.texto).not.toContain('Somos otra')
    expect(r.texto).not.toContain('DATO SINTÉTICO')
  })
  it('sin nada propio raspado: sin_dato, nunca un texto inventado', () => {
    const v = materiaDelCliente([], PROPIOS)
    expect(v.estado).toBe('sin_dato'); expect(v.texto).toBe(''); expect(v.estado_eslogan).toBe('sin_dato'); expect(v.eslogan).toBeNull()
  })
})

describe('chequeoDelManual · R3–R5 y R7', () => {
  const filas = [filaSitio('s1', [{ url: 'https://www.clinicaejemplo.test/', title: 'Clínica Ejemplo', text: 'Atendemos con cita previa. Somos un equipo de tres odontólogos.' }])]
  const manual = { positioning: 'Una clínica cercana con implantes certificados ISO 9001 y atención todos los días.', voice_description: 'Voz cálida y cercana.' }
  it('una certificación que nadie dijo queda sin respaldo; la voz (creativa) no se mira', () => {
    const r = chequeoDelManual({ manual, filas, propios: PROPIOS })
    expect(r.estado).toBe('revisado')
    expect(r.sin_respaldo.some((h) => h.campo === 'positioning' && h.estado === 'sin_cita')).toBe(true)
    expect(r.sin_respaldo.every((h) => h.campo !== 'voice_description')).toBe(true)
  })
  it('lo que solo está en un resumen de agente NO es respaldo, y la duda del agente se conserva', () => {
    const r = chequeoDelManual({
      manual, filas, propios: PROPIOS,
      sintesis: [{ id: 'icp:1', rotulo: 'documento de ICP', texto: 'La clínica ofrece implantes certificados ISO 9001. No sé si realmente están certificados o es marketing.' }],
    })
    const h = r.sin_respaldo.find((x) => x.campo === 'positioning')!
    expect(['solo_sintesis', 'con_duda']).toContain(h.estado)
  })
  it('sin afirmaciones de hecho, cero hallazgos', () => {
    expect(chequeoDelManual({ manual: { voice_description: 'Voz cálida y cercana.' }, filas, propios: PROPIOS }).sin_respaldo).toEqual([])
  })
})

describe('las rutas: llave, entrada y nada que escriba', () => {
  const antes = process.env.INTERNAL_API_KEY
  beforeEach(() => { process.env.INTERNAL_API_KEY = 'llave-de-prueba' })
  afterEach(() => { if (antes === undefined) delete process.env.INTERNAL_API_KEY; else process.env.INTERNAL_API_KEY = antes })
  const pedido = (cuerpo: unknown, llave: string | null = 'llave-de-prueba') => new Request('http://x/api/manual', { method: 'POST', headers: { 'content-type': 'application/json', ...(llave ? { 'x-api-key': llave } : {}) }, body: typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo) })
  for (const [nombre, POST] of [['materia', POST_MATERIA], ['hechos', POST_HECHOS]] as const) {
    it(`${nombre}: sin llave o con otra llave → 401`, async () => {
      expect((await POST(pedido({ client_id: '41dd3d62-d6de-4c9a-9996-6df78c1da118' }, null))).status).toBe(401)
      expect((await POST(pedido({ client_id: '41dd3d62-d6de-4c9a-9996-6df78c1da118' }, 'otra'))).status).toBe(401)
    })
    it(`${nombre}: cuerpo inválido o client_id que no es uuid → 400 (antes de tocar la base)`, async () => {
      expect((await POST(pedido('{no'))).status).toBe(400)
      expect((await POST(pedido([1]))).status).toBe(400)
      expect((await POST(pedido({ client_id: 'x' }))).status).toBe(400)
      expect((await POST(pedido({}))).status).toBe(400)
    })
  }
  it('hechos: `manual` debe ser un objeto', async () => {
    expect((await POST_HECHOS(pedido({ client_id: '41dd3d62-d6de-4c9a-9996-6df78c1da118', manual: 'texto' }))).status).toBe(400)
  })
})
