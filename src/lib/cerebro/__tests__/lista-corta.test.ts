/**
 * Paso 1 y 2 del tramo 1 · la lista corta de un cliente y los lectores de sus fuentes.
 * Lo que DEBE aparecer está escrito acá desde antes de que existiera el código.
 */
import { describe, expect, it } from 'vitest'
import { construirListaCorta } from '../lista-corta'
import type { Ficha, ListaCorta } from '../tipos'
import { A, AHORA, B, C, NO_EXISTE, Z, crearBaseFalsa, tablasDeLaBase } from './casos'

const DIA = 86_400_000
const porRef = (l: ListaCorta, ref: string): Ficha | undefined => l.lineas.find((f) => f.ref === ref)
const dev = (l: ListaCorta, ref: string): Ficha => {
  const f = porRef(l, ref)
  if (!f) throw new Error(`falta en la lista: ${ref} · hay: ${l.lineas.map((x) => x.ref).join(', ')}`)
  return f
}
const ESTADOS = ['dicho_por_dueno', 'visto_en_su_fuente', 'medido', 'de_tercero', 'inferido', 'borrador sin aprobar', 'aprobado', 'rechazado', 'propiedad_incierta']

async function listaDe(cliente: string, fallan: string[] = [], extra: Record<string, unknown> = {}) {
  const base = crearBaseFalsa(tablasDeLaBase(), fallan)
  const lista = await construirListaCorta(base.consulta, cliente, { ahora: AHORA, ...extra })
  return { lista, base }
}

describe('A · negocio con varias sedes', () => {
  it('lista cada cosa del cliente y NADA de los otros clientes', async () => {
    const { lista } = await listaDe(A)
    expect(lista.estado).toBe('ok')
    for (const ref of [
      'clients:' + A, 'client_brand_books:bb-2', 'client_brand_books:bb-1', 'client_icp_documents:icp-1', 'client_competitive_landscape:comp-1',
      'client_web_pages:wp-a1', 'client_web_pages:wp-a2', 'client_sedes:sd-n', 'client_sedes:sd-c', 'client_sedes:sd-s',
      'client_sede_datos:dat-2', 'client_sede_datos:dat-3', 'client_sede_datos:dat-4', 'client_sede_datos:dat-5',
      'client_social_images:im-1', 'client_social_images:im-2', 'client_social_images:im-3', 'client_social_images:im-4', 'client_social_images:im-5',
      'client_historical_outputs:plan-1', 'client_historical_outputs:part-1', 'client_historical_outputs:pz-2', 'client_historical_outputs:pz-4',
      'client_brain_chunks:ch-2',
    ]) expect(porRef(lista, ref), ref).toBeDefined()
    const ajenos = ['bb-z1', 'icp-z', 'comp-z', 'wp-z1', 'sd-z', 'dat-z', 'im-z1', 'pz-z', 'hq-z', 'ch-z', 'bb-c1', 'im-c1', 'wp-b1', 'wp-c1']
    for (const f of lista.lineas) for (const a of ajenos) expect(f.ref, `se coló ${a}`).not.toContain(a)
  })

  it('cada lectura lleva el filtro del cliente (nunca una lectura sin filtro)', async () => {
    const { base } = await listaDe(A)
    expect(base.llamadas.length).toBeGreaterThan(5)
    for (const p of base.llamadas) {
      const filtro = p.tabla === 'clients' ? p.donde.id : p.donde.client_id
      expect(filtro, `lectura sin filtro de cliente en ${p.tabla}`).toBe(A)
    }
  })

  it('el manual: todas las versiones, una sola vigente (la de mayor versión), y su estado de aprobación', async () => {
    const { lista } = await listaDe(A)
    const v2 = dev(lista, 'client_brand_books:bb-2'), v1 = dev(lista, 'client_brand_books:bb-1')
    expect([v2.version, v2.vigente, v2.reemplazada, v2.estado, v2.estante]).toEqual([2, true, false, 'borrador sin aprobar', 'E1'])
    expect([v1.version, v1.vigente, v1.reemplazada, v1.estado]).toEqual([1, false, true, 'aprobado'])
  })

  it('lo vencido se LISTA con su aviso; nunca se oculta', async () => {
    const { lista } = await listaDe(A)
    const sitio = dev(lista, 'client_web_pages:wp-a1')
    expect(sitio.vencido).toBe(true) // 46 días > plazo de 30
    expect(sitio.aviso).toMatch(/^VENCIDO desde /)
    expect(sitio.aviso).toMatch(/verifícalo antes de afirmarlo/)
    expect(new Date(sitio.vigente_hasta as string).getTime()).toBe(new Date(sitio.fecha_fuente as string).getTime() + 30 * DIA)
    expect([sitio.origen, sitio.estado, sitio.estante]).toEqual(['su_fuente', 'visto_en_su_fuente', 'E2'])
    const competidor = dev(lista, 'client_web_pages:wp-a2')
    expect([competidor.origen, competidor.estado, competidor.estante]).toEqual(['tercero', 'de_tercero', 'E5'])
  })

  it('productos y servicios desde datos estructurados (con precio ⇒ plazo corto)', async () => {
    const { lista } = await listaDe(A)
    const uno = dev(lista, 'client_web_pages:wp-a1#producto:1'), dos = dev(lista, 'client_web_pages:wp-a1#producto:2')
    expect([uno.titulo, uno.clase, uno.estante, uno.estado]).toEqual(['Servicio uno', 'catalogo_item', 'E2', 'visto_en_su_fuente'])
    expect(uno.datos).toMatchObject({ precio: 40, moneda: 'USD' })
    expect(dos.datos).toMatchObject({ precio: 900 })
    expect(uno.vencido).toBe(true) // precio: 7 días, la página se verificó hace 46
    expect(lista.fuentes.productos.estado).toBe('ok')
  })

  it('sedes: una línea por sede y la última observación de cada (sede, campo, fuente) con el conteo de las anteriores', async () => {
    const { lista } = await listaDe(A)
    expect(porRef(lista, 'client_sede_datos:dat-1'), 'la observación vieja no se lista sola').toBeUndefined()
    const h = dev(lista, 'client_sede_datos:dat-2')
    expect([h.sede, h.observaciones_anteriores, h.vencido, h.estado]).toEqual(['norte', 1, false, 'visto_en_su_fuente'])
    expect(dev(lista, 'client_sede_datos:dat-3').vencido).toBe(true) // horario según Mapas hace 15 días: plazo 7
    expect(dev(lista, 'client_sede_datos:dat-4').vencido).toBe(true) // dirección hace 65 días: plazo 30
    expect(dev(lista, 'client_sede_datos:dat-5').sede).toBeNull()
  })

  it('fotos y portadas: el reel enlaza a su publicación (no a un archivo de video) y cada una con su contexto', async () => {
    const { lista } = await listaDe(A)
    const foto = dev(lista, 'client_social_images:im-1')
    expect([foto.clase, foto.origen, foto.vencido, foto.producto]).toEqual(['foto', 'su_fuente', false, ['Servicio uno']])
    const reel = dev(lista, 'client_social_images:im-2')
    expect([reel.clase, reel.enlace, reel.vencido]).toEqual(['portada_de_video', 'https://red/p2', true])
    expect(dev(lista, 'client_social_images:im-3').estado).toBe('de_tercero')
    expect(dev(lista, 'client_social_images:im-4').clase).toBe('logo')
  })

  it('H2 · cada foto o portada lleva su producto, el texto de la publicación, su fecha, su enlace y si es foto o portada', async () => {
    const { lista } = await listaDe(A)
    const foto = dev(lista, 'client_social_images:im-1')
    expect(foto.producto).toEqual(['Servicio uno'])
    expect(foto.titulo).toMatch(/Servicio uno/) // el producto se VE en la línea que lee el portero
    expect(foto.que_es).toMatch(/texto de la publicación/) // el texto de la publicación
    expect(foto.publicado_en).toMatch(/^[0-9]{4}-[0-9]{2}-[0-9]{2}/)
    expect(foto.producto_fuente).toBe('caption')
    expect([foto.clase, foto.enlace, foto.fecha_fuente === null]).toEqual(['foto', 'https://bucket/im-1.jpg', false])
    const reel = dev(lista, 'client_social_images:im-2')
    expect([reel.clase, reel.titulo]).toEqual(['portada_de_video', expect.stringMatching(/Portada/)])
    expect(reel.que_es).toMatch(/texto del reel/)
  })

  it('H2 · dos fotos no pueden salir con la misma línea (ni con el mismo título y el mismo texto)', async () => {
    const { lista } = await listaDe(A)
    const fotos = lista.lineas.filter((f) => ['foto', 'portada_de_video', 'logo'].includes(f.clase) && f.estante === 'E3')
    expect(fotos.length).toBeGreaterThanOrEqual(6)
    const huellas = fotos.map((f) => JSON.stringify([f.titulo, f.que_es]))
    expect(new Set(huellas).size, 'dos líneas de foto iguales').toBe(huellas.length)
    const seis = dev(lista, 'client_social_images:im-6'), siete = dev(lista, 'client_social_images:im-7')
    expect(`${seis.titulo}|${seis.que_es}`).not.toBe(`${siete.titulo}|${siete.que_es}`)
  })

  it('la vigencia de una publicación es la de su última verificación, no la fecha en que se publicó', async () => {
    const { lista } = await listaDe(A)
    const antigua = dev(lista, 'client_social_images:im-5')
    expect(antigua.vencido).toBe(false) // publicada hace 400 días, capturada hace 1
    expect(antigua.que_es).toMatch(/publicada el [0-9]{4}-[0-9]{2}-[0-9]{2}/) // la fecha de publicación se dice, no se pierde
  })

  it('una fila interna de resumen de competencia no se lista como competidor', async () => {
    const { lista } = await listaDe(A)
    const resumen = dev(lista, 'client_competitive_landscape:comp-res')
    expect(resumen.clase).toBe('resumen_de_competencia')
    expect(dev(lista, 'client_competitive_landscape:comp-1').clase).toBe('competidor')
  })

  it('las sedes llevan la fecha de su última actualización', async () => {
    const { lista } = await listaDe(A)
    expect(dev(lista, 'client_sedes:sd-n').fecha_fuente).not.toBeNull()
  })

  it('trabajos hechos: versión derivada con la clave que cada tipo SÍ trae', async () => {
    const { lista } = await listaDe(A)
    const v = (id: string) => dev(lista, 'client_historical_outputs:' + id)
    // piezas: (tipo, brief_id, parte_id) · la última APROBADA manda; un borrador más nuevo no la desplaza
    expect([v('pz-1').version, v('pz-1').vigente]).toEqual([1, false])
    expect([v('pz-2').version, v('pz-2').vigente, v('pz-2').estado]).toEqual([2, true, 'aprobado'])
    expect([v('pz-3').version, v('pz-3').vigente, v('pz-3').reemplazada, v('pz-3').estado]).toEqual([3, false, true, 'borrador sin aprobar'])
    expect([v('pz-4').version, v('pz-4').vigente]).toEqual([1, true])
    // partes de trabajo: clave (tipo, plan_id) · una parte NO VÁLIDA se lista, con aviso, y nunca es la vigente
    expect(v('part-1').vigente).toBe(true)
    expect([v('part-2').vigente, v('part-2').valida]).toEqual([false, false])
    expect(v('part-2').aviso).toMatch(/PARTE NO VÁLIDO/)
    // plan: clave (tipo) · vence a los 90 días de su fecha
    expect([v('plan-1').vigente, v('plan-1').vencido]).toEqual([true, false])
  })

  it('D1 · una pieza con valida:false (la clave de las PIEZAS) no sale vigente aunque sea la más nueva', async () => {
    const { lista } = await listaDe(A)
    const v = (id: string) => dev(lista, 'client_historical_outputs:' + id)
    expect([v('pz-5').vigente, v('pz-5').valida]).toEqual([true, true])
    expect([v('pz-6').vigente, v('pz-6').valida, v('pz-6').reemplazada]).toEqual([false, false, true])
    expect(v('pz-6').aviso).toMatch(/NO VÁLID/)
    expect(v('pz-6').aviso).toMatch(/la pieza no cerró/) // el motivo se dice
  })

  it('D2 · un tipo de trabajo sin clave de versión conocida NO se agrupa por tipo: cada fila es su propia cosa', async () => {
    const { lista } = await listaDe(A)
    for (const id of ['em-1', 'em-2', 'em-3']) {
      const f = dev(lista, 'client_historical_outputs:' + id)
      expect([f.version, f.vigente, f.reemplazada, f.versiones_anteriores], id).toEqual([1, true, false, 0])
    }
  })

  it('D2 · un tipo con clave conocida pero sin sus claves (no se sabe de qué entregable es) tampoco se agrupa por tipo', async () => {
    const { lista } = await listaDe(A)
    for (const id of ['pz-8', 'pz-9']) {
      const f = dev(lista, 'client_historical_outputs:' + id)
      expect([f.version, f.vigente, f.reemplazada], id).toEqual([1, true, false])
    }
  })

  it('observación 1 · el precio escrito en texto libre dentro de una página NO tiene plazo propio: rige el de la página (30 días)', async () => {
    const { lista } = await listaDe(A)
    const pagina = dev(lista, 'client_web_pages:wp-a3')
    expect(new Date(pagina.vigente_hasta as string).getTime()).toBe(new Date(pagina.fecha_fuente as string).getTime() + 30 * DIA)
    expect(lista.lineas.some((f) => f.ref.startsWith('client_web_pages:wp-a3#')), 'no se inventa un lector de precios en texto libre').toBe(false)
  })

  it('las correcciones y decisiones del aprobador van al estante E7 con la máxima autoridad', async () => {
    const { lista } = await listaDe(A)
    const d = dev(lista, 'client_historical_outputs:pz-2#decision')
    expect([d.estante, d.estado, d.clase]).toEqual(['E7', 'dicho_por_dueno', 'decision_del_aprobador'])
    expect(d.que_es).toMatch(/cambié el segundo párrafo/)
    expect(dev(lista, 'hitl_queue:hq-1').estante).toBe('E7')
    expect(porRef(lista, 'hitl_queue:hq-2'), 'una confirmación pendiente no es una decisión').toBeUndefined()
  })

  it('lo que dedujo un agente sale «inferido»; el dato del alta, «dicho por el dueño»', async () => {
    const { lista } = await listaDe(A)
    expect(dev(lista, 'clients:' + A).estado).toBe('dicho_por_dueno')
    const inf = dev(lista, `clients:${A}#config:business_model`)
    expect([inf.estado, inf.clase]).toEqual(['inferido', 'dato_inferido'])
    expect(porRef(lista, `clients:${A}#config:apify`), 'lo que no dedujo el descubrimiento no sale inferido').toBeUndefined()
  })

  it('los trozos del cerebro de una fuente que la lista ya cubre no se duplican; los de una fuente sin lector SÍ aparecen', async () => {
    const { lista } = await listaDe(A)
    expect(porRef(lista, 'client_brain_chunks:ch-1')).toBeUndefined()
    expect(dev(lista, 'client_brain_chunks:ch-2').clase).toBe('trozo')
  })

  it('invariantes de toda línea', async () => {
    const { lista } = await listaDe(A)
    const refs = lista.lineas.map((f) => f.ref)
    expect(new Set(refs).size, 'refs repetidos').toBe(refs.length)
    for (const f of lista.lineas) {
      expect(['E1', 'E2', 'E3', 'E4', 'E5', 'E6', 'E7', 'E8'], f.ref).toContain(f.estante)
      expect(ESTADOS, f.ref).toContain(f.estado)
      expect(f.peso_estimado, f.ref).toBeGreaterThan(0)
      if (f.vencido) expect(f.aviso, f.ref).toMatch(/^VENCIDO/)
      else expect(f.aviso ?? '', f.ref).not.toMatch(/^VENCIDO/)
    }
  })
})

describe('B · tienda con catálogo grande', () => {
  it('más de 30 productos ⇒ una línea por familia con su cantidad; el detalle se pide por número', async () => {
    const { lista } = await listaDe(B)
    const familias = lista.lineas.filter((f) => f.ref.includes('#familia:'))
    expect(familias.map((f) => f.cantidad)).toEqual([30, 30, 30, 30])
    expect(lista.lineas.some((f) => f.ref.includes('#producto:'))).toBe(false)
    expect(lista.lineas.length).toBeLessThan(20)
    expect(familias[0].vencido).toBe(false) // verificada hace 2 días
    expect(lista.fuentes.productos).toMatchObject({ estado: 'ok', n: 4 })
  })

  it('lo que no existe se declara «sin_material», no se inventa', async () => {
    const { lista } = await listaDe(B)
    expect(lista.fuentes.manual.estado).toBe('sin_material')
    expect(lista.fuentes.sedes.estado).toBe('sin_material')
    expect(lista.fuentes.fotos.estado).toBe('sin_material')
  })

  it('los plazos se cambian por dato, sin tocar la lógica', async () => {
    const corto = await listaDe(B, [], { plazos: { precio_oferta_horario: 1 } })
    expect(corto.lista.lineas.filter((f) => f.ref.includes('#familia:')).every((f) => f.vencido)).toBe(true) // 2 días > plazo de 1
  })
})

describe('C · servicio profesional sin datos estructurados, con una lectura que falla', () => {
  it('un error de lectura JAMÁS se lee como vacío', async () => {
    const { lista } = await listaDe(C, ['client_social_images'])
    expect(lista.fuentes.fotos.estado).toBe('error_de_lectura')
    expect(lista.fuentes.fotos.detalle).toMatch(/fallo simulado/)
    expect(lista.estado).toBe('parcial')
    expect(lista.lineas.some((f) => f.ref.startsWith('client_social_images:'))).toBe(false)
    expect(porRef(lista, 'client_brand_books:bb-c1')).toBeDefined() // lo demás sigue
  })

  it('sin datos estructurados lo declara y el sitio sale resumido (sin repetir lo repetido)', async () => {
    const { lista } = await listaDe(C)
    expect(lista.fuentes.productos).toMatchObject({ estado: 'sin_material', detalle: 'sin_datos_estructurados' })
    const sitio = dev(lista, 'client_web_pages:wp-c1')
    expect(sitio.resumen?.match(/Frase repetida de la cabecera\./g)?.length).toBe(1)
    expect(sitio.resumen).toContain('Segunda frase distinta.')
  })

  it('si fallan TODAS las lecturas el resultado es error, no «cliente vacío»', async () => {
    const todas = Object.keys(tablasDeLaBase())
    const { lista } = await listaDe(C, todas)
    expect(lista.estado).toBe('error_de_lectura')
    expect(lista.lineas).toEqual([])
  })
})

describe('cliente que no existe', () => {
  it('lo dice; no devuelve una lista vacía que parezca «sin material»', async () => {
    const { lista } = await listaDe(NO_EXISTE)
    expect(lista.estado).toBe('cliente_inexistente')
    expect(lista.lineas).toEqual([])
  })
})

describe('aislamiento entre clientes', () => {
  it('la lista de Z solo trae filas de Z', async () => {
    const { lista } = await listaDe(Z)
    expect(lista.lineas.length).toBeGreaterThan(3)
    for (const f of lista.lineas) expect(f.ref, f.ref).toMatch(/z|Z/)
    expect(lista.lineas.some((f) => /bb-1|bb-2|icp-1|wp-a|pz-1|pz-2/.test(f.ref))).toBe(false)
  })
})
