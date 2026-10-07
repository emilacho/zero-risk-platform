/**
 * PASO 3 DEL CEREBRO · la fuente `fichas` (lo vigente de `cerebro_fichas` aparece en la lista del portero y se lee completo por su referencia).
 * Cierra los renglones 2 y 14 del tablero. Pruebas escritas ANTES del código, con base simulada (la tabla real está vacía hoy y nadie la usa todavía).
 */
import { describe, expect, it } from 'vitest'
import { leerContenido, leerContenidos } from '../contenido'
import { construirListaCorta } from '../lista-corta'
import { entregarContenido } from '../portero/entregar'
import { armarIndice } from '../portero/indice'
import { numerarLista } from '../portero/lista-numerada'
import { type Ficha, NOMBRES_DE_FUENTE, type ListaCorta } from '../tipos'
import { A, AHORA, B, C, NO_EXISTE, Z, crearBaseFalsa, tablasDeLaBase, type Tablas } from './casos'
import { dias, ficha, tablasConFichas } from './fichas-casos'

const lista = async (cliente: string, t: Tablas = tablasConFichas(), fallan: string[] = []) => construirListaCorta(crearBaseFalsa(t, fallan).consulta, cliente, { ahora: AHORA })
const de = (l: ListaCorta, id: string): Ficha => {
  const f = l.lineas.find((x) => x.ref === `cerebro_fichas:${id}`)
  if (!f) throw new Error(`falta en la lista: cerebro_fichas:${id} · hay: ${l.lineas.filter((x) => x.ref.startsWith('cerebro_fichas:')).map((x) => x.ref).join(', ')}`)
  return f
}
const hay = (l: ListaCorta, id: string): boolean => l.lineas.some((x) => x.ref === `cerebro_fichas:${id}`)

describe('1 · `fichas` es una fuente más de la lista, con el mismo formato de línea y de referencia', () => {
  it('es la fuente número 13 y la lista informa su estado de lectura', async () => {
    expect(NOMBRES_DE_FUENTE).toContain('fichas')
    expect(NOMBRES_DE_FUENTE).toHaveLength(13)
    const l = await lista(A)
    expect(l.fuentes.fichas.estado).toBe('ok')
    expect(l.fuentes.fichas.n).toBeGreaterThan(0)
  })
  it('una ficha vigente sale con su referencia `cerebro_fichas:<id>`, su clase libre, título, qué es, producto, sede y peso', async () => {
    const f = de(await lista(A), 'fa-1')
    expect(f.ref).toBe('cerebro_fichas:fa-1')
    expect([f.clase, f.titulo, f.estante]).toEqual(['servicio_nuevo', 'Servicio nuevo del dueño', 'E8'])
    expect(f.que_es).toMatch(/Qué es la ficha fa-1/)
    expect([f.producto, f.sede]).toEqual([['Servicio uno'], 'norte'])
    expect(f.peso_estimado).toBeGreaterThan(10)
    expect(f.fecha_fuente).toBe(dias(5))
    expect(f.vencido).toBe(false) // su plazo es de 30 días y tiene 5
    expect(f.vigente_hasta).toBe(new Date(new Date(dias(5)).getTime() + 30 * 86_400_000).toISOString())
  })
  it.each([
    ['dueno', 'dicho_por_dueno', 'dueno'], ['su_fuente', 'visto_en_su_fuente', 'su_fuente'], ['plataforma', 'medido', 'plataforma'], ['tercero', 'de_tercero', 'tercero'],
  ])('el origen «%s» se lee como estado «%s» (quien lo afirmó sale del origen, nunca del texto)', async (origen, estado, esperado) => {
    const t = tablasConFichas()
    t.cerebro_fichas = [ficha('x', A, { origen })]
    const f = de(await lista(A, t), 'x')
    expect([f.estado, f.origen]).toEqual([estado, esperado])
  })
  it('propiedad AJENA: sobre terceros · INCIERTA: propiedad_incierta; lo sin clasificar lo dice', async () => {
    const l = await lista(A)
    expect(de(l, 'fa-10').sobre_terceros).toBe(true)
    expect(de(l, 'fa-11').estado).toBe('propiedad_incierta')
    expect(de(l, 'fa-11').aviso).toMatch(/SIN CLASIFICAR/)
    expect(de(l, 'fa-1').sobre_terceros).toBeUndefined()
  })
  it('un archivo sin texto sale como cosa completa: su nombre, tipo, tamaño y enlace', async () => {
    const f = de(await lista(A), 'fa-9')
    expect(f.que_es).toMatch(/local\.mp4/)
    expect(f.que_es).toMatch(/video\/mp4/)
    expect(f.que_es).toMatch(/5000000 bytes/)
    expect(f.enlace).toBe('https://almacen.example/local.mp4')
  })
})

describe('2 · vigencia, versiones, retiradas y descartes', () => {
  it('una fecha EXPLÍCITA del material ya pasada → vencida, con su aviso (nunca se oculta)', async () => {
    const f = de(await lista(A), 'fa-2')
    expect(f.vencido).toBe(true)
    expect(f.vigente_hasta).toBe(dias(10))
    expect(f.aviso).toMatch(/^VENCIDO desde /)
  })
  it('lo RECONFIRMADO renueva el plazo: el horario de hace 40 días reconfirmado hace 3 sigue vigente (plazo 7)', async () => {
    const f = de(await lista(A), 'fa-3')
    expect(f.vencido).toBe(false)
    expect(f.vigente_hasta).toBe(new Date(new Date(dias(3)).getTime() + 7 * 86_400_000).toISOString())
  })
  it('sin reconfirmar, el mismo horario sí vence', async () => {
    const t = tablasConFichas()
    t.cerebro_fichas = [ficha('x', A, { plazo: 'precio_oferta_horario', fecha_fuente: dias(40), reconfirmado_en: null })]
    expect(de(await lista(A, t), 'x').vencido).toBe(true)
  })
  it('un plazo que NO está en la lista de plazos, o sin plazo: no vence (no se sabe más)', async () => {
    const l = await lista(A)
    expect([de(l, 'fa-4').vencido, de(l, 'fa-4').vigente_hasta]).toEqual([false, null])
    const t = tablasConFichas()
    t.cerebro_fichas = [ficha('y', A, { plazo: 'sin_plazo', fecha_fuente: dias(900) }), ficha('z', A, { plazo: null, fecha_fuente: dias(900) })]
    const l2 = await lista(A, t)
    expect([de(l2, 'y').vencido, de(l2, 'z').vencido]).toEqual([false, false])
  })
  it('el plazo de una clase se cambia en plazos.json/por parámetro y las fichas lo siguen (una sola palanca)', async () => {
    const t = tablasConFichas()
    t.cerebro_fichas = [ficha('x', A, { plazo: 'catalogo_y_direccion', fecha_fuente: dias(5) })]
    const l = await construirListaCorta(crearBaseFalsa(t).consulta, A, { ahora: AHORA, plazos: { catalogo_y_direccion: 2 } })
    expect(de(l, 'x').vencido).toBe(true)
  })
  it('versiones: la que reemplaza a otra manda; la vieja queda marcada como reemplazada y apunta a la vigente', async () => {
    const l = await lista(A)
    const vieja = de(l, 'fa-5'), nueva = de(l, 'fa-6')
    expect([vieja.version, vieja.vigente, vieja.reemplazada, vieja.ref_de_la_vigente]).toEqual([1, false, true, 'cerebro_fichas:fa-6'])
    expect([nueva.version, nueva.vigente, nueva.reemplazada, nueva.versiones_anteriores]).toEqual([2, true, false, 1])
    expect(numerarLista(l).lineas.some((x) => x.ficha.ref === 'cerebro_fichas:fa-5')).toBe(false) // la reemplazada no sale en la lista numerada
    expect(numerarLista(l).lineas.some((x) => x.ficha.ref === 'cerebro_fichas:fa-6')).toBe(true)
  })
  it('una cadena de tres versiones: solo la última es vigente y las anteriores apuntan a ella', async () => {
    const t = tablasConFichas()
    t.cerebro_fichas = [ficha('v1', A), ficha('v2', A, { version_de: 'v1' }), ficha('v3', A, { version_de: 'v2' })]
    const l = await lista(A, t)
    expect([de(l, 'v1').version, de(l, 'v2').version, de(l, 'v3').version]).toEqual([1, 2, 3])
    expect([de(l, 'v1').ref_de_la_vigente, de(l, 'v2').ref_de_la_vigente, de(l, 'v3').vigente]).toEqual(['cerebro_fichas:v3', 'cerebro_fichas:v3', true])
  })
  it('lo RETIRADO se muestra con su marca y su motivo (como lo vencido): nunca se oculta, y no vence', async () => {
    const f = de(await lista(A), 'fa-7')
    expect(f.aviso).toMatch(/^RETIRADA desde /)
    expect(f.aviso).toMatch(/ya no está en su fuente/)
    expect([f.vencido, f.vigente_hasta]).toEqual([false, null])
  })
  it('lo DESCARTADO y lo de PRUEBA no existen para la lista', async () => {
    const l = await lista(A)
    expect(hay(l, 'fa-8')).toBe(false)
    expect(hay(l, 'fa-12')).toBe(false)
  })
  it('la misma foto que ya vive en client_social_images NO se duplica: se queda la de la tabla de fotos y la lista lo DECLARA', async () => {
    const l = await lista(A)
    expect(hay(l, 'fa-dup')).toBe(false)
    expect(l.lineas.some((x) => x.ref === 'client_social_images:im-1')).toBe(true)
    expect(l.fuentes.fichas.detalle).toMatch(/1 ficha omitida/)
    const enlaces = l.lineas.map((x) => x.enlace).filter((e): e is string => typeof e === 'string' && e.length > 0)
    expect(new Set(enlaces).size, 'dos líneas con el mismo enlace: una foto duplicada').toBe(enlaces.length)
  })
})

describe('3 · AISLAMIENTO: un cliente jamás aparece en la lista ni en la entrega del otro', () => {
  it('la lista de A no trae nada de Z ni de B, ni la de Z nada de A', async () => {
    const a = await lista(A), z = await lista(Z)
    expect(a.lineas.some((x) => /fz-1|fb-1/.test(x.ref))).toBe(false)
    expect(z.lineas.filter((x) => x.ref.startsWith('cerebro_fichas:')).map((x) => x.ref)).toEqual(['cerebro_fichas:fz-1'])
    expect(z.lineas.some((x) => /fa-/.test(x.ref))).toBe(false)
  })
  it('cada lectura de fichas lleva el filtro del cliente (nunca una lectura sin filtro)', async () => {
    const b = crearBaseFalsa(tablasConFichas())
    await construirListaCorta(b.consulta, A, { ahora: AHORA })
    const lecturas = b.llamadas.filter((p) => p.tabla === 'cerebro_fichas')
    expect(lecturas.length).toBeGreaterThan(0)
    for (const p of lecturas) expect(p.donde.client_id).toBe(A)
  })
  it('el lector de contenido: la ficha de OTRO cliente es sin_material, y la lectura lleva el filtro de ESTE cliente', async () => {
    const b = crearBaseFalsa(tablasConFichas())
    const r = await leerContenido(b.consulta, A, 'cerebro_fichas:fz-1')
    expect(r.estado).toBe('sin_material')
    expect(r.detalle).toBe('no_existe')
    expect(b.llamadas.every((p) => p.donde.client_id === A)).toBe(true)
  })
  it('entregar con OTRO cliente la referencia de una ficha de A: sin_material, 0 legibles', async () => {
    const refs = (await lista(A)).lineas.filter((x) => x.ref.startsWith('cerebro_fichas:')).map((x) => x.ref)
    expect(refs.length).toBeGreaterThan(3)
    const r = await entregarContenido(crearBaseFalsa(tablasConFichas()).consulta, { cliente: Z, refs }, { ahora: AHORA })
    const c = r.cuerpo as { material: Array<{ estado_de_lectura: string }> }
    expect(c.material.every((m) => m.estado_de_lectura === 'sin_material')).toBe(true)
  })
  it('pedir por número con la huella de A pero otro cliente → 409 (la lista cambió)', async () => {
    const i = (await armarIndice(crearBaseFalsa(tablasConFichas()).consulta, { cliente: A }, { ahora: AHORA })).cuerpo as { huella: string }
    const r = await entregarContenido(crearBaseFalsa(tablasConFichas()).consulta, { cliente: Z, numeros: [1], huella: i.huella }, { ahora: AHORA })
    expect(r.status).toBe(409)
  })
})

describe('4 · `entregar` y el lector de contenido: TODA referencia emitida es legible (la prueba «x de x» se extiende a fichas)', () => {
  it.each([[A, 'A'], [B, 'B'], [C, 'C'], [Z, 'Z']])('cliente %s: cada línea de su lista (con fichas) se lee con estado ok', async (cliente, nombre) => {
    const l = await lista(cliente)
    expect(l.lineas.length, nombre).toBeGreaterThan(0)
    const lecturas = await leerContenidos(crearBaseFalsa(tablasConFichas()).consulta, cliente, l.lineas.map((x) => x.ref))
    const malas = lecturas.filter((x) => x.estado !== 'ok').map((x) => `${x.ref} → ${x.estado} ${x.detalle ?? ''}`)
    expect(malas, 'referencias emitidas que no se pueden leer: ' + malas.join(' | ')).toEqual([])
  })
  it('la lista de A trae las fichas y TODAS se leen (incluida la retirada, la de archivo y las versiones)', async () => {
    const refs = (await lista(A)).lineas.filter((x) => x.ref.startsWith('cerebro_fichas:')).map((x) => x.ref)
    expect(refs.length).toBeGreaterThanOrEqual(9)
    for (const r of refs) expect((await leerContenido(crearBaseFalsa(tablasConFichas()).consulta, A, r)).estado, r).toBe('ok')
  })
  it('una ficha con texto entrega su contenido completo; la de un archivo entrega su descripción (nombre, tipo, tamaño, enlace)', async () => {
    const b = crearBaseFalsa(tablasConFichas())
    const t = await leerContenido(b.consulta, A, 'cerebro_fichas:fa-1')
    expect(t.texto).toMatch(/Texto completo de la ficha fa-1/)
    const f = await leerContenido(b.consulta, A, 'cerebro_fichas:fa-9')
    expect(f.texto).toMatch(/local\.mp4/)
    expect(f.texto).toMatch(/video\/mp4/)
    expect(f.texto).toMatch(/5000000/)
    expect(f.texto).toMatch(/https:\/\/almacen\.example\/local\.mp4/)
  })
  it('sin_material ≠ error_de_lectura: una ficha que no existe es sin_material; una lectura caída es error_de_lectura', async () => {
    expect((await leerContenido(crearBaseFalsa(tablasConFichas()).consulta, A, 'cerebro_fichas:no-existe')).estado).toBe('sin_material')
    expect((await leerContenido(crearBaseFalsa(tablasConFichas(), ['cerebro_fichas']).consulta, A, 'cerebro_fichas:fa-1')).estado).toBe('error_de_lectura')
  })
  it('entregar por número trae el texto completo de una ficha, con su etiqueta (estado, fecha, vencido y aviso)', async () => {
    const i = (await armarIndice(crearBaseFalsa(tablasConFichas()).consulta, { cliente: A }, { ahora: AHORA })).cuerpo as { huella: string; lista: Array<{ numero: number; ref: string }> }
    const n = i.lista.find((x) => x.ref === 'cerebro_fichas:fa-2')!.numero
    const r = await entregarContenido(crearBaseFalsa(tablasConFichas()).consulta, { cliente: A, numeros: [n], huella: i.huella }, { ahora: AHORA })
    const m = (r.cuerpo.material as Array<Record<string, unknown>>)[0]
    expect(m).toMatchObject({ ref: 'cerebro_fichas:fa-2', estado_de_lectura: 'ok', clase: 'oferta', vencido: true })
    expect(String(m.aviso)).toMatch(/^VENCIDO/)
    expect(String(m.texto)).toMatch(/Texto completo de la ficha fa-2/)
  })
  it('`ya_trae: ["fichas"]` quita TODAS las fichas de la lista del portero (clases libres incluidas) y un nombre desconocido se sigue reportando', async () => {
    const l = await lista(A)
    const n = numerarLista(l, { ya_trae: ['fichas', 'inventada'] })
    expect(n.lineas.some((x) => x.ficha.ref.startsWith('cerebro_fichas:'))).toBe(false)
    expect(n.ya_trae_desconocido).toEqual(['inventada'])
    expect(numerarLista(l).lineas.some((x) => x.ficha.ref.startsWith('cerebro_fichas:'))).toBe(true)
  })
})

describe('5 · errores y vacío', () => {
  it('si la lectura de fichas falla: la lista queda PARCIAL, la fuente `error_de_lectura` y lo demás intacto; nunca «no hay fichas»', async () => {
    const l = await lista(A, tablasConFichas(), ['cerebro_fichas'])
    expect(l.estado).toBe('parcial')
    expect(l.fuentes.fichas.estado).toBe('error_de_lectura')
    const base = await lista(A, tablasDeLaBase())
    expect(l.lineas.map((x) => x.ref)).toEqual(base.lineas.map((x) => x.ref))
  })
  it('CON `cerebro_fichas` VACÍA (o sin filas del cliente) la lista es IDÉNTICA a la de antes: mismas líneas, mismo orden, misma huella', async () => {
    const sin = await lista(A, tablasDeLaBase())
    const vacia = await lista(A, { ...tablasDeLaBase(), cerebro_fichas: [] })
    const deOtros = await lista(A, { ...tablasDeLaBase(), cerebro_fichas: [ficha('q', Z), ficha('r', B)] })
    for (const otra of [vacia, deOtros]) {
      expect(JSON.stringify(otra.lineas)).toBe(JSON.stringify(sin.lineas))
      expect(numerarLista(otra).huella).toBe(numerarLista(sin).huella)
      expect(otra.estado).toBe('ok')
    }
    expect(vacia.fuentes.fichas).toMatchObject({ estado: 'sin_material', n: 0 })
  })
  it('un cliente que no existe sigue siendo cliente_inexistente (la fuente nueva no lo cambia)', async () => {
    const l = await lista(NO_EXISTE)
    expect(l.estado).toBe('cliente_inexistente')
    expect(l.fuentes.fichas.estado).toBe('sin_material')
  })
  it('el índice del portero informa la lectura de `fichas` junto a las otras 12', async () => {
    const c = (await armarIndice(crearBaseFalsa(tablasConFichas()).consulta, { cliente: A }, { ahora: AHORA })).cuerpo as { lecturas: Record<string, string>; lista: Array<{ ref: string; estante: string }> }
    expect(Object.keys(c.lecturas)).toHaveLength(13)
    expect(c.lecturas.fichas).toBe('ok')
    expect(c.lista.some((x) => x.ref === 'cerebro_fichas:fa-1' && x.estante === 'E8')).toBe(true)
  })
})

describe('8 · el tope de lectura de la base (1.000 filas): una lectura que llega al tope NO se da por completa (condición de CC#3 al certificar el paso 3)', () => {
  const muchas = (n: number): Tablas => ({ ...tablasDeLaBase(), cerebro_fichas: Array.from({ length: n }, (_, i) => ficha(`fx-${i}`, A)) })
  it('con 999 fichas la fuente está «ok»', async () => {
    const l = await lista(A, muchas(999))
    expect(l.fuentes.fichas).toMatchObject({ estado: 'ok', n: 999 })
    expect(l.estado).toBe('ok')
  })
  it('con EXACTAMENTE 1.000 la fuente pasa a «error_de_lectura» con su aviso (la base corta ahí y podría faltar una versión nueva); la lista queda «parcial» y las líneas leídas se muestran', async () => {
    const l = await lista(A, muchas(1000))
    expect(l.fuentes.fichas.estado).toBe('error_de_lectura')
    expect(l.fuentes.fichas.detalle).toMatch(/recortada|1\.000/)
    expect(l.fuentes.fichas.n).toBe(1000)
    expect(l.estado).toBe('parcial')
    expect(l.lineas.filter((x) => x.ref.startsWith('cerebro_fichas:')).length).toBe(1000)
  })
  it('las fichas de OTRO cliente no cuentan para el tope', async () => {
    const t = { ...tablasDeLaBase(), cerebro_fichas: [...Array.from({ length: 600 }, (_, i) => ficha(`fx-${i}`, A)), ...Array.from({ length: 600 }, (_, i) => ficha(`fy-${i}`, B))] }
    expect((await lista(A, t)).fuentes.fichas.estado).toBe('ok')
  })
})
