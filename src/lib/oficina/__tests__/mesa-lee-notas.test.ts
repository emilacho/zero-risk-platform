/**
 * La mesa lee lo que el dueño ha dicho (29-oct). Todo simulado, US$ 0: el cerebro es un doble que anota quién preguntó qué.
 * Lo que se prueba: cada agente consulta UNA vez al abrir su turno con su destinatario; las notas viajan solo en la tarea de ese turno; el rastro sale de las líneas «N1 apliqué…» y esas líneas no llegan al tablero ni a la pieza;
 * si el cerebro falla o no hay notas la pieza se hace igual; la jefatura y la segunda mirada GPT no tocan el módulo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { esConsultanteExcluido } from '../../portero-alimenta/aprendizaje/datos'
import { puertoDeAprendizaje } from '../adaptadores'
import { destinatarioDe, leerRespuestaSobreNotas, rastroDeLasNotas, seccionDeNotasDelDueno, tareaParaConsultar } from '../mesa/aprendizaje'
import { reentregaDelTurno } from '../mesa/orquestador'
import type { NotaLeida } from '../mesa/tipos'
import { DIRECTORIO } from './mesa-memoria'
import { CITAS_COMPLETAS, jugar, montar, pieza, seccionesDeLaminas, LAMINAS_OK } from './mesa-arnes'

type Consulta = { client_id: string; agente: string; destinatario: string | null; formato: string; tarea: string; dry_run: boolean }
const NOTAS: NotaLeida[] = [
  { id: 'ficha-1', nota: 'No uses signos de exclamación en los titulares', direccion: 'evitar', alcance: 'cliente' },
  { id: 'ficha-2', nota: 'Muestra siempre el plato completo', direccion: 'hacer', alcance: 'industria' },
]

function cerebroDoble(o: { notas?: NotaLeida[]; falla?: 'error' | 'lanza'; registrarLanza?: boolean } = {}) {
  const consultas: Consulta[] = []
  const rastros: Array<Parameters<NonNullable<ReturnType<typeof puertoDeAprendizaje>>['registrar']>[0]> = []
  const puerto = {
    consultar: vi.fn(async (p: Consulta) => {
      consultas.push(p)
      if (o.falla === 'lanza') throw new Error('el cerebro se cayó')
      if (o.falla === 'error') return { ok: false as const, error: 'HTTP 502' }
      return { ok: true as const, notas: o.notas ?? NOTAS }
    }),
    registrar: vi.fn(async (r: (typeof rastros)[number]) => { if (o.registrarLanza) throw new Error('la base no contesta'); rastros.push(r) }),
  }
  return { puerto, consultas, rastros }
}

describe('MESA · cada agente lee las notas que le tocan al abrirse su turno', () => {
  it('consulta UNA vez por turno, con su destinatario, el formato de la pieza y una tarea que describe lo que va a producir', async () => {
    const c = cerebroDoble()
    const { M, a, id } = await montar({ aprendizaje: c.puerto })
    const { turnos } = await jugar(M, id, a)
    expect(c.consultas).toHaveLength(turnos.length)
    const por = (agente: string) => c.consultas.find((q) => q.agente === agente)!
    expect(por('creative-director-mesa').destinatario).toBe('direccion')
    expect(por('content-creator').destinatario).toBe('texto')
    expect(por('carousel-designer').destinatario).toBe('diseno')
    expect(por('marketing_instagram_curator').destinatario).toBe('imagen')
    expect(por('design-image-prompt-engineer').destinatario).toBe('imagen')
    for (const q of c.consultas) { expect(q.formato).toBe('carrusel'); expect(q.tarea).toMatch(/carrusel/); expect(q.tarea).toMatch(/plato del día/); expect(q.dry_run).toBe(true) }
  })

  it('las notas van al final de la tarea de ese turno, numeradas, con la instrucción de cerrar con una línea por nota', async () => {
    const c = cerebroDoble()
    const { M, a, id } = await montar({ aprendizaje: c.puerto })
    const { turnos } = await jugar(M, id, a)
    const t = turnos.find((x) => x.tipo === 'aportar' && x.agente === 'content-creator')!.task
    expect(t).toMatch(/Lo que el dueño ha dicho antes/)
    expect(t).toMatch(/\[N1\] \(evitar · de este cliente\) No uses signos de exclamación/)
    expect(t).toMatch(/\[N2\] \(hacer · de su rubro\) Muestra siempre el plato completo/)
    expect(t).toMatch(/N1 apliqué/)
    expect(t.indexOf('Lo que el dueño ha dicho antes')).toBeGreaterThan(t.indexOf('Tu turno'))
    // la dirección integra: las líneas van dentro de «## Citas»
    const integra = turnos.find((x) => x.tipo === 'integrar')!.task
    expect(integra).toMatch(/dentro de la sección «## Citas»/)
  })

  it('sin notas: la tarea queda exactamente como antes (sin sección, sin ruido) y no se escribe rastro', async () => {
    const c = cerebroDoble({ notas: [] })
    const { M, a, id } = await montar({ aprendizaje: c.puerto })
    const { turnos, ultima } = await jugar(M, id, a)
    expect(ultima.cuerpo.accion).toBe('cerrado')
    for (const t of turnos) expect(t.task).not.toMatch(/Lo que el dueño ha dicho antes/)
    expect(c.rastros).toHaveLength(0)
  })

  it('una reentrega del turno abierto muestra las MISMAS notas sin volver a preguntar al cerebro', async () => {
    const c = cerebroDoble()
    const { M, a, id } = await montar({ aprendizaje: c.puerto })
    expect(c.consultas).toHaveLength(1)
    const primera = (a.cuerpo.turno as { pedido: { task: string }; n: number; dispatch_key: string }).pedido.task
    const r = await reentregaDelTurno(M.P, M.encargos.get(id)!, { n: (a.cuerpo.turno as { n: number }).n, dispatch_key: (a.cuerpo.turno as { dispatch_key: string }).dispatch_key })
    expect((r.cuerpo.turno as { pedido: { task: string } }).pedido.task).toBe(primera)
    expect(primera).toMatch(/\[N1\]/)
    expect(c.consultas).toHaveLength(1)
  })
})

describe('MESA · el rastro y lo que NO llega a la pieza', () => {
  it('«N1 apliqué / N2 no aplicaba» deja el rastro (qué leyó, qué cambió) en autorevisiones_del_productor, por turno y sin repetir claves', async () => {
    const c = cerebroDoble()
    const { M, MS, a, id } = await montar({ aprendizaje: c.puerto })
    await jugar(M, id, a, (t) => (t.agente === 'content-creator' && t.tipo === 'aportar'
      ? { texto: 'Titular sin signos: «Hoy cambia el plato».\n\nN1 apliqué: quité los signos de exclamación del titular\nN2 no aplicaba: no escribo imágenes' }
      : undefined))
    const r = c.rastros.find((x) => x.agente === 'content-creator')!
    expect(r).toMatchObject({ client_id: expect.any(String), encargo_id: id, paso: 'mesa:aportar:content-creator', notas_vistas: ['ficha-1', 'ficha-2'], choco: true, costo_usd: 0 })
    expect(r.cambios).toEqual([{ nota_id: 'ficha-1', que_cambio: 'quité los signos de exclamación del titular' }])
    // los demás agentes no dijeron nada de las notas: quedan anotadas como «sin respuesta», sin dar por hecho que las cumplieron
    const otro = c.rastros.find((x) => x.agente === 'carousel-designer')!
    expect(otro.choco).toBe(false)
    expect(otro.cambios).toEqual([{ sin_respuesta: ['ficha-1', 'ficha-2'] }])
    expect(new Set(c.rastros.map((x) => x.clave_unica)).size).toBe(c.rastros.length)
    // esas líneas no entran al tablero
    const aporte = MS.filas.find((f) => f.de === 'content-creator' && f.tipo === 'aporta')!
    expect(aporte.texto).toMatch(/Titular sin signos/)
    expect(aporte.texto).not.toMatch(/N1 apliqué|N2 no aplicaba/)
  })

  it('la dirección cierra las notas dentro de «## Citas»: no estorban a las citas, no entran a la pieza ni al tablero que viaja a la jefatura', async () => {
    const c = cerebroDoble()
    const { M, MS, a, id } = await montar({ aprendizaje: c.puerto })
    const conNotas = `${seccionesDeLaminas(LAMINAS_OK)}\n## Pie\nEl plato del día te espera.\n## Etiquetas\n#plato #hoy\n${CITAS_COMPLETAS}\nN1 apliqué: titulares sin exclamación\nN2 apliqué: el plato se ve completo en la lámina 1`
    const { ultima } = await jugar(M, id, a, (t) => (t.tipo === 'integrar' || t.tipo === 'devolver_citas' ? { texto: conNotas } : undefined))
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(MS.filas.filter((f) => f.tipo === 'integra')).toHaveLength(1)
    const mesa = M.encargos.get(id)!.estado_del_motor.artefactos.mesa.datos as { pieza_texto: string; tablero_para_la_jefatura?: string }
    expect(mesa.pieza_texto).not.toMatch(/N1 apliqué|N2 apliqué/)
    expect(mesa.pieza_texto).toMatch(/A5 usé/)
    expect(mesa.tablero_para_la_jefatura ?? '').not.toMatch(/exclamación|N1 apliqué/)
    const r = c.rastros.find((x) => x.agente === 'creative-director-mesa' && x.paso === 'mesa:integrar:creative-director-mesa')!
    expect(r.choco).toBe(true)
    expect(r.cambios).toHaveLength(2)
  })

  it('el texto de las notas del dueño nunca llega a lo que se manda a dibujar', async () => {
    const c = cerebroDoble()
    const { M, a, id } = await montar({ aprendizaje: c.puerto })
    await jugar(M, id, a, (t) => (t.tipo === 'integrar' ? { texto: `${pieza()}\nN1 apliqué: sin signos` } : undefined))
    expect(JSON.stringify(M.llamadas.renderPedidos)).not.toMatch(/signos de exclamación|N1 apliqué/)
  })
})

describe('MESA · leer lo aprendido nunca frena una pieza', () => {
  it.each([['error', 'HTTP 502'], ['lanza', 'el cerebro se cayó']] as const)('si el cerebro falla (%s) la pieza se hace igual, sin sección de notas y con el motivo en el estado', async (falla, motivo) => {
    const c = cerebroDoble({ falla })
    const { M, a, id } = await montar({ aprendizaje: c.puerto })
    const { turnos, ultima } = await jugar(M, id, a)
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    for (const t of turnos) expect(t.task).not.toMatch(/Lo que el dueño ha dicho antes/)
    // queda dicho que NO se pudo leer (una fila por turno), sin inventar notas
    expect(c.rastros).toHaveLength(turnos.length)
    for (const r of c.rastros) { expect(r).toMatchObject({ notas_vistas: [], choco: false }); expect(JSON.stringify(r.cambios)).toContain(motivo) }
  })

  it('si el rastro no se puede escribir, la entrega sigue', async () => {
    const c = cerebroDoble({ registrarLanza: true })
    const { M, a, id } = await montar({ aprendizaje: c.puerto })
    const { ultima } = await jugar(M, id, a)
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado', estado: 'cerrado' })
    expect(c.puerto.registrar).toHaveBeenCalled()
  })

  it('sin el puerto (apagado) la mesa trabaja como siempre', async () => {
    const { M, a, id } = await montar()
    const { turnos, ultima } = await jugar(M, id, a)
    expect(ultima.cuerpo).toMatchObject({ accion: 'cerrado' })
    for (const t of turnos) expect(t.task).not.toMatch(/Lo que el dueño ha dicho antes/)
  })
})

describe('MESA · la jefatura y la segunda mirada GPT no leen las notas', () => {
  it('ningún agente del directorio ni la oficina figuran como consultantes excluidos (la mesa SÍ puede leer) y los jueces SÍ lo son', () => {
    for (const t of DIRECTORIO.filter((x) => x.rol !== 'portero')) expect(esConsultanteExcluido('oficina-creativa', t.agente), t.agente).toBe(false)
    for (const juez of ['brand_strategist', 'editor_en_jefe', 'jefe_client_success', 'revisor-gpt']) expect(esConsultanteExcluido('jefatura', juez), juez).toBe(true)
  })

  it('el código de la jefatura y del revisor no importa ni nombra el módulo de notas de la mesa', () => {
    const raiz = path.join(__dirname, '..', '..')
    const recorrer = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? (e.name === '__tests__' ? [] : recorrer(path.join(d, e.name))) : /\.(ts|tsx)$/.test(e.name) ? [path.join(d, e.name)] : []))
    const archivos = [...recorrer(path.join(raiz, 'jefatura')), path.join(raiz, 'revisor-gpt.ts'), path.join(raiz, 'revisor-gpt-libro.ts')].filter((f) => fs.existsSync(f))
    expect(archivos.length).toBeGreaterThan(3)
    for (const f of archivos) expect(fs.readFileSync(f, 'utf8'), path.relative(raiz, f)).not.toMatch(/mesa\/aprendizaje|aprendizaje_del_dueno|puertoDeAprendizaje|notas_del_dueno/)
  })

  it('el sobre que sale hacia la jefatura (paso-jefatura) no lee el estado de las notas del turno', () => {
    const f = fs.readFileSync(path.join(__dirname, '..', 'paso-jefatura.ts'), 'utf8')
    expect(f).not.toMatch(/notas_del_dueno|aprendizaje/)
  })
})

describe('puertoDeAprendizaje · la consulta real al cerebro (con fetch simulado)', () => {
  const entorno = { baseUrl: 'https://plataforma.test', internalKey: 'llave-de-prueba' }
  const consulta: Consulta = { client_id: '11111111-1111-4111-8111-111111111111', agente: 'content-creator', destinatario: 'texto', formato: 'carrusel', tarea: 'texto · carrusel del plato', dry_run: false }
  const respuesta = (cuerpo: unknown, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'content-type': 'application/json' } })

  it('llama al GET del cerebro con la llave interna, la clase, el especialista y el destinatario; entrega las notas reducidas', async () => {
    const f = vi.fn(async () => respuesta({ ok: true, notas: [{ ficha_id: 'f1', nota: 'sin exclamaciones', direccion: 'evitar', alcance: 'cliente', peso: 1, procedencia: { cita: 'x' } }, { ficha_id: '', nota: 'vacía' }], aviso_de_busqueda: 'sin modelo de huellas en este entorno' })) as unknown as typeof fetch
    const r = await puertoDeAprendizaje({ from: () => ({}) }, entorno, f).consultar(consulta)
    expect(r).toEqual({ ok: true, notas: [{ id: 'f1', nota: 'sin exclamaciones', direccion: 'evitar', alcance: 'cliente' }], aviso: 'sin modelo de huellas en este entorno' })
    const [url, init] = (f as unknown as ReturnType<typeof vi.fn>).mock.calls[0] as [string, { headers: Record<string, string> }]
    const u = new URL(url)
    expect(u.origin + u.pathname).toBe('https://plataforma.test/api/brain/consultar')
    expect(Object.fromEntries(u.searchParams)).toMatchObject({ client_id: consulta.client_id, clase: 'aprendizaje_del_dueno', oficina: 'oficina-creativa', agente: 'content-creator', destinatario: 'texto', formato: 'carrusel', limite: '10' })
    expect(u.searchParams.has('marcar_uso')).toBe(false)
    expect(init.headers['x-api-key']).toBe('llave-de-prueba')
  })

  it('en ensayo pide no marcar las notas como usadas; sin destinatario no lo manda', async () => {
    const f = vi.fn(async () => respuesta({ ok: true, notas: [], sin_dato: true })) as unknown as typeof fetch
    const r = await puertoDeAprendizaje({ from: () => ({}) }, entorno, f).consultar({ ...consulta, destinatario: null, dry_run: true })
    expect(r).toEqual({ ok: true, notas: [] })
    const u = new URL((f as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0] as string)
    expect(u.searchParams.get('marcar_uso')).toBe('0'); expect(u.searchParams.has('destinatario')).toBe(false)
  })

  it('un error del cerebro o de la red vuelve como {ok:false}, nunca lanza', async () => {
    const malo = vi.fn(async () => respuesta({ error: 'lectura_fallida', detalle: 'lectura: caída' }, 502)) as unknown as typeof fetch
    expect(await puertoDeAprendizaje({ from: () => ({}) }, entorno, malo).consultar(consulta)).toEqual({ ok: false, error: 'lectura: caída' })
    const caido = vi.fn(async () => { throw new Error('ECONNRESET') }) as unknown as typeof fetch
    expect(await puertoDeAprendizaje({ from: () => ({}) }, entorno, caido).consultar(consulta)).toEqual({ ok: false, error: 'ECONNRESET' })
  })
})

describe('piezas puras', () => {
  it('cada agente del directorio vivo tiene destinatario salvo uno desconocido (que lee sin filtro)', () => {
    for (const t of DIRECTORIO.filter((x) => x.rol !== 'portero')) expect(destinatarioDe(t.agente), t.agente).not.toBeNull()
    expect(destinatarioDe('agente-nuevo')).toBeNull()
  })
  it('la tarea para consultar es acotada y nombra el tipo de pieza', () => {
    expect(tareaParaConsultar({ cliente_nombre: 'X', tipo: 'kit', especialidad: 'texto', brief_texto: 'a '.repeat(2000) }).length).toBeLessThanOrEqual(1500)
    expect(tareaParaConsultar({ cliente_nombre: 'X', tipo: 'kit', especialidad: 'texto', brief_texto: 'b' })).toMatch(/kit de historias/)
  })
  it('sin notas la sección es vacía; con notas distingue «hacer» de «evitar»', () => {
    expect(seccionDeNotasDelDueno(undefined, 'aportar')).toBe('')
    expect(seccionDeNotasDelDueno({ notas: [], destinatario: null }, 'aportar')).toBe('')
    expect(seccionDeNotasDelDueno({ notas: NOTAS, destinatario: 'texto' }, 'aportar')).toMatch(/\(evitar · de este cliente\)[\s\S]*\(hacer · de su rubro\)/)
  })
  it('lee la respuesta con viñetas, negritas y verbos distintos; ignora notas que no existen; la última repetida vale', () => {
    const t = 'Pieza lista.\n- **N1** corregí: titular\n> N2 ya cumplía: el plato salía completo\nN9 apliqué: nota inexistente\nN1 apliqué: titular sin signos'
    const { texto, respuestas } = leerRespuestaSobreNotas(t, NOTAS)
    expect(respuestas).toEqual([{ nota_id: 'ficha-1', aplicada: true, que: 'titular sin signos' }, { nota_id: 'ficha-2', aplicada: false, que: 'el plato salía completo' }])
    expect(texto).toBe('Pieza lista.\nN9 apliqué: nota inexistente')
  })
  it('el rastro no da por cumplida una nota que el agente no mencionó', () => {
    const { respuestas } = leerRespuestaSobreNotas('N2 apliqué: ok', NOTAS)
    expect(rastroDeLasNotas({ notas: NOTAS, destinatario: null }, respuestas)).toEqual({ notas_vistas: ['ficha-1', 'ficha-2'], choco: true, cambios: [{ nota_id: 'ficha-2', que_cambio: 'ok' }, { sin_respuesta: ['ficha-1'] }] })
  })
})
