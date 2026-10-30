/**
 * Blindaje de «la mesa lee las notas» (30-oct): los mutantes que el empleado #3 dejó vivos.
 * L14 · las líneas «N1 apliqué…» NUNCA llegan a pieza_texto, láminas, pie ni etiquetas · L16/L17 · el interruptor APRENDIZAJE_DEL_DUENO · L10 · marcar_uso=0 en la ruta de consulta. Todo simulado, US$ 0.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { quitarLineasDeNotas } from '../mesa/aprendizaje'
import type { NotaLeida } from '../mesa/tipos'
import { CITAS_COMPLETAS, LAMINAS_OK, jugar, montar, seccionesDeLaminas } from './mesa-arnes'

const NOTAS: NotaLeida[] = [
  { id: 'ficha-1', nota: 'No uses signos de exclamación en los titulares', direccion: 'evitar', alcance: 'cliente' },
  { id: 'ficha-2', nota: 'Muestra siempre el plato completo', direccion: 'hacer', alcance: 'industria' },
]
const cerebro = (notas: NotaLeida[]) => ({ consultar: vi.fn(async () => ({ ok: true as const, notas })), registrar: vi.fn(async () => undefined) })
const LINEAS = ['N1 apliqué: titulares sin exclamación', '- N2 no aplicaba: ya se veía completo', '**N7** apliqué: una nota que ese turno no tenía']
const CON_LINEAS_EN_TODAS_PARTES = `${seccionesDeLaminas(LAMINAS_OK)}\n${LINEAS[0]}\n## Pie\nEl plato del día te espera.\n${LINEAS[1]}\n## Etiquetas\n#plato #hoy\n${LINEAS[2]}\n${CITAS_COMPLETAS}\n${LINEAS[0]}`
const RASTRO_DE_NOTAS = /N\d+\s*\**\s*(apliqu|no aplicaba)|titulares sin exclamación|ya se veía completo|una nota que ese turno no tenía/

function estadoDe(M: Awaited<ReturnType<typeof montar>>['M'], id: string) {
  const e = M.encargos.get(id)!.estado_del_motor
  return { mesa: e.artefactos.mesa?.datos as { pieza_texto: string; tablero_para_la_jefatura?: string }, todo: JSON.stringify(e.artefactos) }
}

describe('L14 · las líneas de notas no llegan a la pieza, a las láminas ni al pie', () => {
  it('con notas leídas: ni pieza_texto, ni láminas, ni pie, ni etiquetas, ni el tablero de la jefatura, ni lo que se manda a dibujar las contienen', async () => {
    const { M, a, id } = await montar({ aprendizaje: cerebro(NOTAS) })
    const { ultima } = await jugar(M, id, a, (t) => (t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? { texto: CON_LINEAS_EN_TODAS_PARTES } : undefined))
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado' })
    const { mesa, todo } = estadoDe(M, id)
    expect(mesa.pieza_texto).toMatch(/El plato del día te espera/)
    expect(mesa.pieza_texto).not.toMatch(RASTRO_DE_NOTAS)
    expect(mesa.tablero_para_la_jefatura ?? '').not.toMatch(RASTRO_DE_NOTAS)
    expect(todo).not.toMatch(RASTRO_DE_NOTAS)
    expect(JSON.stringify(M.llamadas.renderPedidos)).not.toMatch(RASTRO_DE_NOTAS)
  })

  it('aunque el agente no hubiera recibido notas (cerebro vacío) o cite una que no existe, la red del cierre las retira igual', async () => {
    const { M, MS, a, id } = await montar({ aprendizaje: cerebro([]) })
    await jugar(M, id, a, (t) => (t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? { texto: CON_LINEAS_EN_TODAS_PARTES } : undefined))
    const { mesa, todo } = estadoDe(M, id)
    expect(MS.filas.filter((f) => f.tipo === 'integra').length).toBeGreaterThan(0)
    for (const fila of MS.filas) expect(fila.texto).not.toMatch(RASTRO_DE_NOTAS)
    expect(mesa.pieza_texto).not.toMatch(RASTRO_DE_NOTAS)
    expect(todo).not.toMatch(RASTRO_DE_NOTAS)
    expect(JSON.stringify(M.llamadas.renderPedidos)).not.toMatch(RASTRO_DE_NOTAS)
  })

  it('la red del cierre funciona sola: un libro que ya trae la línea (de un encargo anterior a este arreglo) tampoco la pasa a las láminas, al pie ni a la pieza', async () => {
    const { M, MS, a, id } = await montar({ aprendizaje: cerebro([]) })
    const aportar = MS.aportar.bind(MS)
    MS.aportar = async (x) => aportar(x.tipo === 'integra' ? { ...x, texto: CON_LINEAS_EN_TODAS_PARTES } : x)
    await jugar(M, id, a)
    const { mesa, todo } = estadoDe(M, id)
    expect(MS.filas.some((f) => f.tipo === 'integra' && RASTRO_DE_NOTAS.test(f.texto))).toBe(true)
    expect(mesa.pieza_texto).toMatch(/El plato del día te espera/)
    expect(mesa.pieza_texto).not.toMatch(RASTRO_DE_NOTAS)
    expect(todo).not.toMatch(RASTRO_DE_NOTAS)
  })

  it('y también sin el puerto del cerebro (apagado)', async () => {
    const { M, a, id } = await montar()
    await jugar(M, id, a, (t) => (t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? { texto: CON_LINEAS_EN_TODAS_PARTES } : undefined))
    expect(estadoDe(M, id).todo).not.toMatch(RASTRO_DE_NOTAS)
  })

  it('en cuanto cierra el turno de integrar, pieza_texto ya está limpia (no depende de la traducción posterior)', async () => {
    const { M, a, id } = await montar({ aprendizaje: cerebro(NOTAS) })
    const incompletas = `${seccionesDeLaminas(LAMINAS_OK)}\n## Pie\nEl plato del día te espera.\n## Etiquetas\n#plato #hoy\n## Citas\nA2 usé: los titulares\n${LINEAS[0]}\n${LINEAS[1]}`
    let vista: string | null = null
    await jugar(M, id, a, (t, veces) => {
      if (t.tipo === 'integrar' && veces === 1) return { texto: incompletas }
      if (t.tipo === 'devolver_citas' && vista === null) vista = estadoDe(M, id).mesa.pieza_texto
      return undefined
    })
    expect(vista).not.toBeNull()
    expect(vista).toMatch(/El plato del día te espera/)
    expect(vista).not.toMatch(RASTRO_DE_NOTAS)
  })

  it('quitarLineasDeNotas: viñetas, negritas y verbos distintos; deja intacto lo que no es una línea de nota', () => {
    const limpio = quitarLineasDeNotas('Título: Hoy cambia el plato\nN1 apliqué: x\n> N2 no aplicaba: y\n**N3** corregí: z\n• N4 ya cumplía: w\nNuestro plato N1 es único\nNota: llámanos')
    expect(limpio).toBe('Título: Hoy cambia el plato\nNuestro plato N1 es único\nNota: llámanos')
  })
})

describe('L16 / L17 · el interruptor APRENDIZAJE_DEL_DUENO en la entrada de la oficina', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules() })
  const entorno = async () => { const { entornoDe } = await import('../ruta'); return entornoDe(new Request('https://x.test/api/oficina/avanzar')) }

  it('sin la variable: encendido', async () => {
    delete process.env.APRENDIZAJE_DEL_DUENO
    expect((await entorno()).aprendizajeDelDueno).toBe(true)
  })
  it('con «1» o cualquier valor distinto de «0»: encendido', async () => {
    vi.stubEnv('APRENDIZAJE_DEL_DUENO', '1')
    expect((await entorno()).aprendizajeDelDueno).toBe(true)
  })
  it('con «0»: apagado', async () => {
    vi.stubEnv('APRENDIZAJE_DEL_DUENO', '0')
    expect((await entorno()).aprendizajeDelDueno).toBe(false)
  })
})

describe('L10 · la ruta de consulta respeta marcar_uso=0', () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.resetModules(); vi.doUnmock('@/lib/portero-alimenta/aprendizaje/entorno') })
  const montarRuta = async () => {
    const consultar = vi.fn(async () => ({ status: 200, body: { ok: true } }))
    vi.doMock('@/lib/portero-alimenta/aprendizaje/entorno', () => ({ consultarAprendizajeDelEntorno: consultar }))
    vi.stubEnv('INTERNAL_API_KEY', 'llave-de-prueba')
    const { GET } = await import('@/app/api/brain/consultar/route')
    return { consultar, GET }
  }
  const pedir = (query: string, llave: string | null = 'llave-de-prueba') =>
    new Request(`https://x.test/api/brain/consultar?clase=aprendizaje_del_dueno&client_id=c1${query}`, llave ? { headers: { 'x-api-key': llave } } : undefined)

  it('marcar_uso=0 (los ensayos): la consulta recibe marcar_uso:false', async () => {
    const { consultar, GET } = await montarRuta()
    const r = await GET(pedir('&marcar_uso=0'))
    expect(r.status).toBe(200)
    expect(consultar).toHaveBeenCalledWith(expect.objectContaining({ client_id: 'c1', marcar_uso: false }))
  })
  it('sin el parámetro (uso real) o con «1»: marcar_uso:true', async () => {
    const { consultar, GET } = await montarRuta()
    await GET(pedir(''))
    await GET(pedir('&marcar_uso=1'))
    expect(consultar).toHaveBeenCalledTimes(2)
    for (const [p] of consultar.mock.calls as unknown as Array<[{ marcar_uso: boolean }]>) expect(p.marcar_uso).toBe(true)
  })
  it('sin la llave interna: 401 y no consulta', async () => {
    const { consultar, GET } = await montarRuta()
    expect((await GET(pedir('', null))).status).toBe(401)
    expect(consultar).not.toHaveBeenCalled()
  })
})
