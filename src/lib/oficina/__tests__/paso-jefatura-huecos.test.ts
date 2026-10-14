/**
 * J8a · LOS 8 HUECOS DE MUTACIÓN QUE ENCONTRÓ CC#3 (R4) · cada prueba mata una mutación que antes sobrevivía. US$ 0, sin red.
 *  1 re-imagen aunque la revisión sea incompleta · 2 aplicar la pieza corregida aunque la revisión falló · 3 el corte del rótulo del desacuerdo · 4 el carrusel que pierde los `hashtags`
 *  5 el aviso a #alertas cuando la revisión no cierra · 6 marcar el turno muerto como hecho · 7 que la ruta acepte otro tipo de artefacto · 8 que `jefaturaSinRespuesta` reaplique sin turno abierto
 */
import { describe, expect, it } from 'vitest'
import type { SalidaDeRevision } from '../../jefatura/revision/contrato'
import { abrirEncargo, avanzar, jefaturaSinRespuesta, recibirJefatura } from '../orquestador'
import { aplicarSalidaDeJefatura, costoDeLaJefatura, costoInvalido } from '../paso-jefatura'
import { POST_IMG_CON_JEFATURA } from '../plantillas/con-jefatura'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { Estado } from '../tipos'
import { BUENOS_PROMPTS, CLIENTE, PARTE, PIEZA_OK, REGLAS_CEVICHE, correr, crearMemoria, direccionGenerada, observacion } from './memoria'

type Json = Record<string, any>
const salida = (resultado: string, o: Json = {}): SalidaDeRevision => ({
  revision_id: 'rev-1', artifact_type: 'pieza', artifact_id: 'x', resultado, marcas: { con_desacuerdo: false, sin_segunda_mirada: false }, artefacto_final: {}, versiones: [], respuestas: [], opinion_externa: null, imagen_por_rehacer: false,
  desacuerdos: [], costo_usd: 0.2, pasos: 3, trace_id: 'jefatura:rev-1', devolver_a: null, simulado: false, ...o,
} as unknown as SalidaDeRevision)
const estado = (artefactos: Json = {}): Estado => ({ ultimo: 3, pasos_ejecutados: 5, gasto_usd: 1, vueltas: {}, artefactos: { pieza_post: { version: 1, version_consumida: 1, datos: { pie_de_foto: 'viejo', hashtags: ['#a'], llamado: 'viejo llamado' } }, ...artefactos }, fichas: [] } as never)
const tomadaImagen = { ficha_id: 'f', origen: 'externa', donde: 'imagen', estado: 'tomada', razon: 'la foto no se ve cálida' }

describe('hueco 1 · una revisión INCOMPLETA no dispara la re-imagen', () => {
  for (const resultado of ['fallida', 'incompleta_por_tope']) {
    it(`${resultado} con «imagen por rehacer» y la opinión tomada: NO se llama a la re-imagen ni se marca re_imagen`, () => {
      let llamadas = 0
      const r = aplicarSalidaDeJefatura({ familia: 'post_img' }, estado(), salida(resultado, { imagen_por_rehacer: true, respuestas: [tomadaImagen] }), { reImagen: () => { llamadas++; return { re_imagen: true } } })
      expect(llamadas).toBe(0); expect(r.artefacto).toMatchObject({ re_imagen: false, por_rehacer_humano: false })
    })
  }
  it('y una revisión que SÍ cerró bien con la opinión de imagen tomada, sí la dispara (con la razón de quien dirige la imagen)', () => {
    let razon = ''
    const r = aplicarSalidaDeJefatura({ familia: 'post_img' }, estado(), salida('con_desacuerdo', { imagen_por_rehacer: true, respuestas: [tomadaImagen] }), { reImagen: (t) => { razon = t?.razon ?? ''; return { re_imagen: true } } })
    expect(razon).toBe('la foto no se ve cálida'); expect(r.artefacto).toMatchObject({ re_imagen: true })
  })
  it('sin «imagen por rehacer» no se llama aunque haya una opinión de imagen tomada', () => {
    let llamadas = 0
    aplicarSalidaDeJefatura({ familia: 'post_img' }, estado(), salida('limpia', { imagen_por_rehacer: false, respuestas: [tomadaImagen] }), { reImagen: () => { llamadas++; return {} } })
    expect(llamadas).toBe(0)
  })
})

describe('hueco 2 · la pieza corregida NO se aplica si la revisión falló', () => {
  const conPieza = (resultado: string) => salida(resultado, { artefacto_final: { pieza: { pie_de_foto: 'Nuevo pie', hashtags: ['#nuevo'] } } })
  it('fallida: no entra ninguna pieza nueva (ni en el post ni en el carrusel)', () => {
    expect(aplicarSalidaDeJefatura({ familia: 'post_img' }, estado(), conPieza('fallida'), { reImagen: () => ({}) }).otros_artefactos?.['pieza_post']).toBeUndefined()
    expect(aplicarSalidaDeJefatura({ familia: 'carrusel_ig_v1' }, estado(), conPieza('fallida'), { reImagen: () => ({}) }).otros_artefactos?.['copy_carrusel']).toBeUndefined()
  })
  for (const resultado of ['limpia', 'con_desacuerdo', 'sin_segunda_mirada', 'incompleta_por_tope']) {
    it(`${resultado}: la pieza corregida SÍ entra, mezclada con la anterior (lo que no cambió se conserva)`, () => {
      const r = aplicarSalidaDeJefatura({ familia: 'post_img' }, estado(), conPieza(resultado), { reImagen: () => ({}) })
      expect(r.otros_artefactos?.['pieza_post']).toEqual({ pie_de_foto: 'Nuevo pie', hashtags: ['#nuevo'], llamado: 'viejo llamado' })
    })
  }
})

describe('hueco 3 · el rótulo del desacuerdo («donde: qué») se parte solo cuando es un rótulo corto', () => {
  const fichasDe = (...d: string[]) => aplicarSalidaDeJefatura({ familia: 'post_img' }, estado(), salida('con_desacuerdo', { desacuerdos: d }), { reImagen: () => ({}) }).fichas!.filter((f) => f.origen === 'jefe').map((f) => [f.donde, f.que])
  it('«imagen: no se ve el producto» → donde imagen; «texto: falta el precio» → donde texto', () => {
    expect(fichasDe('imagen: no se ve el producto', 'texto: falta el precio')).toEqual([['imagen', 'no se ve el producto'], ['texto', 'falta el precio']])
  })
  it('sin dos puntos → donde «texto» y el desacuerdo entero como qué', () => { expect(fichasDe('el tono es muy frío')).toEqual([['texto', 'el tono es muy frío']]) })
  it('dos puntos en la posición 0 (sin rótulo) → no se parte: texto + línea entera', () => { expect(fichasDe(': sin rótulo')).toEqual([['texto', ': sin rótulo']]) })
  it('dos puntos demasiado lejos (≥ 24) NO es un rótulo: es parte de la frase', () => {
    const larga = 'una frase larga que menciona: algo despues' // los dos puntos quedan en la posición 27
    expect(larga.indexOf(':')).toBeGreaterThanOrEqual(24)
    expect(fichasDe(larga)).toEqual([['texto', larga]])
  })
  it('justo en el límite: dos puntos en la posición 23 SÍ parten; en la 24 no', () => {
    const en23 = 'a'.repeat(23) + ': qué'; const en24 = 'a'.repeat(24) + ': qué'
    expect(fichasDe(en23)).toEqual([['a'.repeat(23), 'qué']]); expect(fichasDe(en24)).toEqual([['texto', en24]])
  })
})

describe('hueco 4 · el carrusel conserva pie de foto, hashtags y llamado de la pieza corregida', () => {
  it('trae los tres campos y descarta lo que no es de la copia', () => {
    const r = aplicarSalidaDeJefatura({ familia: 'carrusel_ig_v1' }, estado({ copy_carrusel: { version: 1, version_consumida: 1, datos: { pie_de_foto: 'viejo', hashtags: ['#a'], llamado: 'viejo', laminas: ['x'] } } }), salida('limpia', { artefacto_final: { pieza: { pie_de_foto: 'Nuevo pie', hashtags: ['#n1', '#n2'], llamado: 'Escríbenos', titulo_interno: 'no entra' } } }), { reImagen: () => ({}) })
    expect(r.otros_artefactos?.['copy_carrusel']).toEqual({ pie_de_foto: 'Nuevo pie', hashtags: ['#n1', '#n2'], llamado: 'Escríbenos', laminas: ['x'] })
  })
  it('si la pieza trae solo los hashtags, cambian solo los hashtags', () => {
    const r = aplicarSalidaDeJefatura({ familia: 'carrusel_ig_v1' }, estado({ copy_carrusel: { version: 1, version_consumida: 1, datos: { pie_de_foto: 'viejo', hashtags: ['#a'], llamado: 'viejo' } } }), salida('limpia', { artefacto_final: { pieza: { hashtags: ['#solo'] } } }), { reImagen: () => ({}) })
    expect(r.otros_artefactos?.['copy_carrusel']).toEqual({ pie_de_foto: 'viejo', hashtags: ['#solo'], llamado: 'viejo' })
  })
  it('una pieza sin ninguno de los tres campos no toca la copia', () => {
    const r = aplicarSalidaDeJefatura({ familia: 'carrusel_ig_v1' }, estado(), salida('limpia', { artefacto_final: { pieza: { otra_cosa: 1 } } }), { reImagen: () => ({}) })
    expect(r.otros_artefactos?.['copy_carrusel']).toBeUndefined()
  })
})

async function encargo(jefatura: () => Promise<Json>) {
  const M = crearMemoria({ plantilla: POST_IMG_CON_JEFATURA })
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: false, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  const id = String(a.cuerpo.encargo_id)
  M.P.jefatura = jefatura as never
  const estados: string[] = []
  const guardar = M.P.almacen.guardar.bind(M.P.almacen)
  M.P.almacen.guardar = async (c) => { if (c.turno?.paso === 'jefatura') estados.push(String(c.turno.estado)); return guardar(c) }
  await correr(M, id, { paquete: () => ({ texto: 'portero' }), direccion_visual: () => ({ texto: direccionGenerada(REGLAS_CEVICHE) }), prompts: () => ({ texto: BUENOS_PROMPTS }), mirar: (_n, t) => ({ texto: observacion([...t.matchAll(/índice (\d+)/g)].map((x) => Number(x[1]))) }), texto: () => ({ texto: PIEZA_OK }) })
  return { M, id, estados }
}
const avisosDeLaJefatura = (M: Json) => (M.llamadas.avisos as Array<{ canal: string; texto: string }>).filter((a) => a.canal === 'alertas' && /La jefatura no revisó la pieza/.test(a.texto))

describe('hueco 5 · el aviso a #alertas cuando la revisión NO se cerró', () => {
  for (const [caso, ap] of [['no abrió (apagada)', { estado: 'no_abre', motivo: 'apagada' }], ['dio error', { estado: 'error', motivo: 'la ruta se cayó' }]] as Array<[string, Json]>) {
    it(`${caso}: avisa UNA vez con el motivo y la pieza sigue «SIN REVISAR»`, async () => {
      const { M } = await encargo(async () => ap)
      const av = avisosDeLaJefatura(M)
      expect(av).toHaveLength(1); expect(av[0].texto).toContain(String(ap.motivo)); expect(av[0].texto).toMatch(/sin revisar/i)
      expect(String(M.llamadas.bandeja[0].titulo)).toMatch(/^⚠️ SIN REVISAR · /)
    })
  }
  it('si la revisión cerró no hay aviso de «no revisó» (ni limpia ni con desacuerdo)', async () => {
    const { M, id } = await encargo(async () => ({ estado: 'cerrada', salida: salida('limpia', { artifact_id: 'x' }) }))
    void id
    expect(avisosDeLaJefatura(M)).toHaveLength(0)
  })
})

describe('hueco 6 · el turno de una revisión que nunca contestó queda «muerto» antes de seguir', () => {
  it('jefaturaSinRespuesta marca el turno de la jefatura como muerto (y recién después lo da por hecho al aplicar «sin revisar»)', async () => {
    const { M, id, estados } = await encargo(async () => ({ estado: 'esperando', revision_id: 'rev-1' }))
    expect(estados).toEqual(['corriendo'])
    await jefaturaSinRespuesta(M.P, id, 'sin vuelta en 90 min')
    expect(estados).toEqual(['corriendo', 'muerto', 'hecho'])
  })
})

describe('R2 (contrato con el flujo de la oficina) · mientras la jefatura revisa, TODA respuesta es «esperar_jefatura» y nunca un «esperar» sin pedido', () => {
  it('al abrir la revisión y al repetir el «siguiente», la acción es la misma y trae el turno de tipo jefatura, sin pedido', async () => {
    const { M, id } = await encargo(async () => ({ estado: 'esperando', revision_id: 'rev-1' }))
    const otra = await avanzar(M.P, id)
    expect(otra.status).toBe(200); expect(otra.cuerpo.accion).toBe('esperar_jefatura'); expect(otra.cuerpo.turno).toMatchObject({ tipo: 'jefatura' }); expect((otra.cuerpo.turno as Json).pedido).toBeUndefined()
    expect(otra.cuerpo.accion).not.toBe('esperar')
  })
})

describe('despertar · la dirección de n8n es la misma que usa la jefatura', () => {
  it('la copia de la oficina coincide con la del contrato de la jefatura', async () => {
    const { N8N_POR_OMISION: laDeLaJefatura } = await import('../../jefatura/revision/contrato')
    const { N8N_POR_OMISION: laDeLaOficina } = await import('../despertar')
    expect(laDeLaOficina).toBe(laDeLaJefatura)
  })
})

describe('hueco 8 · jefaturaSinRespuesta no reaplica nada si ya no hay un turno de la jefatura abierto', () => {
  it('después de que la jefatura entregó, un «no contestó» tardío NO suma pasos, NO avisa y NO duplica la bandeja', async () => {
    const { M, id } = await encargo(async () => ({ estado: 'esperando', revision_id: 'rev-1' }))
    await recibirJefatura(M.P, id, salida('limpia', { artifact_id: id }))
    const pasos = M.encargos.get(id)!.estado_del_motor.pasos_ejecutados, avisos = M.llamadas.avisos.length, bandeja = M.llamadas.bandeja.length
    const r = await jefaturaSinRespuesta(M.P, id, 'llegó tarde el vigía')
    expect(r.status).toBe(200)
    expect(M.encargos.get(id)!.estado_del_motor.pasos_ejecutados).toBe(pasos); expect(M.llamadas.avisos.length).toBe(avisos); expect(M.llamadas.bandeja.length).toBe(bandeja)
    expect(String(M.llamadas.bandeja[0].titulo)).not.toMatch(/SIN REVISAR/)
  })
  it('para un encargo que no existe contesta 404 y no escribe nada', async () => {
    const M = crearMemoria({ plantilla: POST_IMG_CON_JEFATURA })
    const r = await jefaturaSinRespuesta(M.P, '00000000-0000-4000-8000-0000000000aa', 'x')
    expect(r.status).toBe(404); expect(M.llamadas.avisos).toHaveLength(0)
  })
})

describe('reparo menor 3 (CC#3) · el costo de la jefatura es un número finito ≥ 0: NaN, Infinity, negativos o texto no entran al libro', () => {
  const malos: Array<[string, unknown]> = [['NaN', NaN], ['Infinity', Infinity], ['-Infinity', -Infinity], ['negativo', -0.5], ['texto', '0.3'], ['nulo', null], ['ausente', undefined], ['objeto', {}]]
  it('costoDeLaJefatura: acepta 0 y positivos finitos; todo lo demás es 0', () => {
    for (const ok of [0, 0.2, 3, 1e-9]) expect(costoDeLaJefatura(ok)).toBe(ok)
    for (const [n, v] of malos) expect(costoDeLaJefatura(v), n).toBe(0)
  })
  it('costoInvalido: dice «inválido» para lo que vino y no sirve; 0 y ausente no son inválidos', () => {
    expect(costoInvalido(0)).toBe(false); expect(costoInvalido(0.2)).toBe(false); expect(costoInvalido(undefined)).toBe(false); expect(costoInvalido(null)).toBe(false)
    for (const v of [NaN, Infinity, -1, '0.3', {}]) expect(costoInvalido(v), String(v)).toBe(true)
  })
  for (const [n, v] of malos) {
    it(`aplicarSalidaDeJefatura con costo ${n}: el costo del paso queda en 0 (finito), y solo lo que vino mal lo declara`, () => {
      const r: Json = aplicarSalidaDeJefatura({ familia: 'post_img' }, estado(), salida('limpia', { costo_usd: v as never }), { reImagen: () => ({ re_imagen: false }) })
      expect(r.costo_usd).toBe(0); expect(Number.isFinite(r.costo_usd)).toBe(true); expect(r.artefacto.jefatura.costo_usd).toBe(0)
      const dicho = r.artefacto.jefatura.costo_invalido === true
      expect(dicho).toBe(n !== 'nulo' && n !== 'ausente')
    })
  }
  it('con un costo bueno no cambia nada: el paso lleva 0.2 y no hay marca de costo inválido', () => {
    const r: Json = aplicarSalidaDeJefatura({ familia: 'post_img' }, estado(), salida('limpia', { costo_usd: 0.2 }), { reImagen: () => ({ re_imagen: false }) })
    expect(r.costo_usd).toBe(0.2); expect(r.artefacto.jefatura.costo_usd).toBe(0.2); expect(r.artefacto.jefatura.costo_invalido).toBeUndefined()
  })
  for (const [n, v] of malos.slice(0, 4)) {
    it(`recibirJefatura con costo ${n}: el turno y el gasto del encargo quedan finitos y no se mueven por ese valor`, async () => {
      const { M, id } = await encargo(async () => ({ estado: 'esperando', revision_id: 'rev-1' }))
      const antes = M.encargos.get(id)!.gasto_usd
      await recibirJefatura(M.P, id, salida('limpia', { artifact_id: id, costo_usd: v as never }))
      const turno = [...M.turnos.get(id)!.values()].find((t) => t.paso === 'jefatura')!
      expect(turno.cost_usd).toBe(0)
      const despues = M.encargos.get(id)!.gasto_usd
      expect(Number.isFinite(despues)).toBe(true); expect(despues).toBeCloseTo(antes, 6)
    })
  }
})
