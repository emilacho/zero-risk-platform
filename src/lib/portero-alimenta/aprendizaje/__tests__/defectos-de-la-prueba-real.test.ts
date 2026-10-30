/**
 * Los tres defectos que salieron en la PRUEBA REAL del 30-oct (modelo y huellas reales, cliente «zz prueba puerta»), cada uno con su prueba:
 *  1. «siempre» / «en mis publicaciones» subían una idea a GENERAL sin que el dueño hablara de otros negocios;
 *  2. un tono pedido después contra otro tono pedido antes (los dos «hacer») no se detectaba como choque;
 *  3. la puerta del dueño y el cron desmenuzaban la MISMA nota a la vez y duplicaban las ideas.
 */
import { describe, expect, it } from 'vitest'
import { CATALOGO_DE_ARRANQUE, espacioDeCliente } from '../datos'
import { leerIdeas, promptDeDesmenuzar } from '../desmenuzar'
import { procesarAprendizaje } from '../procesar'
import { crearBaseMini } from './dbmini'

type Fila = Record<string, unknown>
const CAT = CATALOGO_DE_ARRANQUE
const AHORA = new Date('2026-10-30T09:00:00.000Z')
const CID = '823873b9-cdb9-4018-a068-9ad0068c5bda'

describe('1 · subir de alcance exige una frase que hable de más que este cliente', () => {
  const comentario = 'En mis publicaciones usa siempre un tono cercano. Para todos mis negocios: nunca uses la palabra barato.'
  const base = { idea: 'Tono cercano', sobre: 'tono', atributo: 'tono', destinatario: 'texto', direccion: 'hacer', alcance: 'general', cita: 'usa siempre un tono cercano' }
  const leer = (o: Fila) => leerIdeas(JSON.stringify({ ideas: [{ ...base, ...o }] }), { comentario, catalogo: CAT, rubro: 'restaurante' }).ideas[0]

  it('«siempre» o «en mis publicaciones» NO son general, aunque estén en el comentario', () => {
    expect(leer({ evidencia_de_alcance: 'usa siempre un tono cercano' }).alcance).toBe('cliente')
    expect(leer({ evidencia_de_alcance: 'En mis publicaciones' }).alcance).toBe('cliente')
  })
  it('«para todos mis negocios» sí; las marcas son dato (se pueden ampliar)', () => {
    expect(leer({ evidencia_de_alcance: 'Para todos mis negocios' }).alcance).toBe('general')
    const o = { comentario: 'Cualquier marca mía debe evitar el barato.', catalogo: CAT, rubro: 'x', marcas: { general: ['cualquier marca mía'], industria: [] } }
    const j = JSON.stringify({ ideas: [{ ...base, evidencia_de_alcance: 'Cualquier marca mía' }] })
    expect(leerIdeas(j, o).ideas[0].alcance).toBe('general')
    expect(leerIdeas(j, { ...o, marcas: undefined }).ideas[0].alcance).toBe('cliente')
  })
  it('«no se sabe» y «general» no son un formato', () => {
    expect(leer({ formato: 'no_se_sabe', evidencia_de_alcance: 'Para todos mis negocios' }).formato).toBeNull()
    expect(leer({ formato: 'General' }).formato).toBeNull()
    expect(leer({ formato: 'carrusel' }).formato).toBe('carrusel')
  })
})

describe('2 · «contradice»: el modelo señala qué ideas vigentes deja sin efecto la nueva', () => {
  it('el prompt lista las vigentes numeradas y solo se aceptan números de esa lista', () => {
    const p = promptDeDesmenuzar({ comentario: 'x', rubro: null, formato: null, catalogo: CAT, vigentes: ['Hacer (texto · tono): tono cercano'] })
    expect(p.texto).toContain('1. Hacer (texto · tono): tono cercano')
    const r = leerIdeas(JSON.stringify({ ideas: [{ idea: 'Tono formal y distante', sobre: 'tono', atributo: 'tono', destinatario: 'texto', direccion: 'hacer', alcance: 'cliente', cita: 'x', contradice: [1, 7, 'a', 1] }] }), { comentario: 'x', catalogo: CAT, vigentes: 1 })
    expect(r.ideas[0].contradice).toEqual([1])
  })

  const fichaVigente = (): Fila => ({
    id: 'vieja-1', client_id: espacioDeCliente(CID), clase: 'aprendizaje_del_dueno', que_es: 'Usar un tono cercano, de tú', observado_en: '2026-10-30T08:00:00.000Z', alcance: 'cliente', retirada_en: null, descartada: false,
    provenance_tag: { datos: { destinatario: 'texto', atributo: 'tono', sobre: 'tono cercano', direccion: 'hacer', industria: 'prueba', peso: 1, peso_al: '2026-10-30T08:00:00.000Z', choca_con: [], respaldos_en: ['c0'] } },
  })
  const cruda = (extra: Fila = {}): Fila => ({
    id: 'cruda-1', client_id: CID, clase: 'dato_del_dueno', observado_en: '2026-10-30T08:30:00.000Z', retirada_en: null, descartada: false,
    provenance_tag: { datos: { acumula: true, respuesta: 'Ahora prefiero un tono formal y distante.', respondido_en: '2026-10-30T08:30:00.000Z', canal: '#oficina-creativa', tema: 'tono formal', ...extra } },
  })
  function montar(crudas: Fila[]) {
    const t: Record<string, Fila[]> = { clients: [{ id: CID, industry: 'prueba' }], cerebro_fichas: [fichaVigente(), ...crudas], cerebro_ingresos: [], cerebro_aprendizaje_indice: [], cerebro_aprendizaje_catalogo: [] }
    const { db } = crearBaseMini(t, { rpc: () => ({ data: [], error: null }) })
    const pedidos: string[] = []
    let n = 0
    const deps = {
      db: db as never, ahora: () => AHORA, nuevoId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, workflowId: 'wf', ejecucionId: 'ex',
      llamarModelo: async (p: { messages: Array<{ content: string }> }) => {
        pedidos.push(p.messages[0].content)
        return { texto: JSON.stringify({ ideas: [{ idea: 'Usar un tono formal y distante', sobre: 'tono formal', atributo: 'tono', destinatario: 'texto', direccion: 'hacer', alcance: 'cliente', cita: 'un tono formal y distante', contradice: [1] }] }), usage: { input_tokens: 900, output_tokens: 200 } }
      },
      registrar: async () => ({ ok: true }),
      embeber: async (textos: string[]) => ({ ok: true as const, embeddings: textos.map(() => [1, 0, 0]), modelo: 'm' }),
    }
    return { t, deps, pedidos }
  }

  it('en el mismo espacio gana la más nueva: la vieja se retira con motivo y su ganadora', async () => {
    const m = montar([cruda()])
    const r = await procesarAprendizaje(m.deps as never, { dry_run: false, client_id: CID, solo: 'desmenuzar' })
    expect(r.errores).toEqual([])
    expect(m.pedidos[0]).toContain('1. Hacer (texto · tono): Usar un tono cercano, de tú') // la vigente le llegó al modelo
    const vieja = m.t.cerebro_fichas.find((f) => f.id === 'vieja-1') as Fila
    expect(vieja.retirada_en).toBeTruthy()
    expect(String(vieja.motivo_retirada)).toMatch(/choca con .*más nueva/)
    const nueva = m.t.cerebro_fichas.find((f) => f.clase === 'aprendizaje_del_dueno' && f.id !== 'vieja-1') as Fila
    expect(nueva.retirada_en).toBeNull()
    expect(vieja.reemplazada_por).toBe(nueva.id)
    expect(r.operaciones.retirar_por_choque).toBe(1)
  })
})

describe('2b · el formato que el modelo pone a la idea vieja no la hace ganar (prueba real: «publicaciones»)', () => {
  it('la vieja con formato «publicaciones» y la nueva sin formato: gana la nueva; con formatos distintos solo se anota el choque', async () => {
    for (const [formatoNueva, retira] of [[null, true], ['reel', false]] as const) {
      const t: Record<string, Fila[]> = {
        clients: [{ id: CID, industry: 'prueba' }], cerebro_ingresos: [], cerebro_aprendizaje_indice: [], cerebro_aprendizaje_catalogo: [],
        cerebro_fichas: [
          { id: 'vieja-1', client_id: espacioDeCliente(CID), clase: 'aprendizaje_del_dueno', que_es: 'Tono formal', observado_en: '2026-10-30T08:00:00.000Z', alcance: 'cliente', retirada_en: null, descartada: false,
            provenance_tag: { datos: { destinatario: 'texto', atributo: 'tono', sobre: 'tono formal', direccion: 'hacer', formato: 'publicaciones', industria: 'prueba', peso: 1, peso_al: '2026-10-30T08:00:00.000Z', choca_con: [] } } },
          { id: 'cruda-1', client_id: CID, clase: 'dato_del_dueno', observado_en: '2026-10-30T08:30:00.000Z', retirada_en: null, descartada: false,
            provenance_tag: { datos: { acumula: true, respuesta: 'Vuelve al tono cercano.', respondido_en: '2026-10-30T08:30:00.000Z', canal: 'c', tema: 't' } } },
        ],
      }
      const { db } = crearBaseMini(t, { rpc: () => ({ data: [], error: null }) })
      let n = 0
      const r = await procesarAprendizaje({
        db: db as never, ahora: () => AHORA, nuevoId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`, workflowId: 'wf', ejecucionId: 'ex',
        llamarModelo: async () => ({ texto: JSON.stringify({ ideas: [{ idea: 'Tono cercano', sobre: 'tono cercano', atributo: 'tono', destinatario: 'texto', direccion: 'hacer', alcance: 'cliente', formato: formatoNueva ?? '', cita: 'tono cercano', contradice: [1] }] }), usage: { input_tokens: 10, output_tokens: 10 } }),
        registrar: async () => ({ ok: true }), embeber: async (x: string[]) => ({ ok: true as const, embeddings: x.map(() => [1]), modelo: 'm' }),
      } as never, { dry_run: false, client_id: CID, solo: 'desmenuzar' })
      expect(r.errores).toEqual([])
      expect(Boolean((t.cerebro_fichas.find((f) => f.id === 'vieja-1') as Fila).retirada_en)).toBe(retira)
      if (!retira) expect((((t.cerebro_fichas.find((f) => f.id === 'vieja-1') as Fila).provenance_tag as Fila).datos as Fila).choca_con).toHaveLength(1)
    }
  })
})

describe('3 · una nota no se desmenuza dos veces a la vez', () => {
  const t0 = (extra: Fila) => ({
    id: 'cruda-1', client_id: CID, clase: 'dato_del_dueno', observado_en: '2026-10-30T08:30:00.000Z', retirada_en: null, descartada: false,
    provenance_tag: { datos: { acumula: true, respuesta: 'Usa tono cercano.', respondido_en: '2026-10-30T08:30:00.000Z', canal: 'c', tema: 't', ...extra } },
  })
  function montar(extra: Fila) {
    const t: Record<string, Fila[]> = { clients: [{ id: CID, industry: 'prueba' }], cerebro_fichas: [t0(extra)], cerebro_ingresos: [], cerebro_aprendizaje_indice: [], cerebro_aprendizaje_catalogo: [] }
    const { db } = crearBaseMini(t, { rpc: () => ({ data: [], error: null }) })
    let llamadas = 0
    const deps = {
      db: db as never, ahora: () => AHORA, workflowId: 'wf', ejecucionId: 'ex',
      llamarModelo: async () => { llamadas++; return { texto: JSON.stringify({ ideas: [{ idea: 'Tono cercano', sobre: 'tono', atributo: 'tono', destinatario: 'texto', direccion: 'hacer', alcance: 'cliente', cita: 'tono cercano' }] }), usage: { input_tokens: 100, output_tokens: 50 } } },
      registrar: async () => ({ ok: true }), embeber: async (x: string[]) => ({ ok: true as const, embeddings: x.map(() => [1]), modelo: 'm' }),
    }
    return { t, deps, llamadas: () => llamadas }
  }
  it('una nota reservada hace pocos minutos por otra pasada se deja en paz', async () => {
    const m = montar({ desmenuzando_desde: new Date(AHORA.getTime() - 2 * 60_000).toISOString() })
    const r = await procesarAprendizaje(m.deps as never, { dry_run: false, solo: 'desmenuzar' })
    expect(r.notas_crudas_pendientes).toBe(0)
    expect(m.llamadas()).toBe(0)
  })
  it('si la otra pasada murió (reserva vieja), se retoma; y al terminar la reserva se limpia', async () => {
    const m = montar({ desmenuzando_desde: new Date(AHORA.getTime() - 30 * 60_000).toISOString() })
    const r = await procesarAprendizaje(m.deps as never, { dry_run: false, solo: 'desmenuzar' })
    expect(m.llamadas()).toBe(1)
    expect(r.fichas_nuevas).toBe(1)
    const d = ((m.t.cerebro_fichas[0].provenance_tag as Fila).datos as Fila)
    expect(d.desmenuzada_en).toBeTruthy(); expect(d.desmenuzando_desde).toBeNull()
  })
  it('si otra pasada la terminó mientras el modelo pensaba, esta lectura se descarta y no duplica fichas', async () => {
    const m = montar({})
    const original = m.deps.llamarModelo
    m.deps.llamarModelo = async () => {
      const x = await original()
      const d = (m.t.cerebro_fichas[0].provenance_tag as Fila).datos as Fila
      d.desmenuzada_en = '2026-10-30T09:00:01.000Z' // la otra pasada terminó primero
      return x
    }
    const r = await procesarAprendizaje(m.deps as never, { dry_run: false, solo: 'desmenuzar' })
    expect(r.fichas_nuevas).toBe(0)
    expect(m.t.cerebro_fichas.filter((f) => f.clase === 'aprendizaje_del_dueno')).toHaveLength(0)
  })
})
