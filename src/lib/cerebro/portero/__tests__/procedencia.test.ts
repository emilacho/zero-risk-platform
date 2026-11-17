/**
 * ENCARGO 1 de Cerebro (17-nov, firma de Emilio) · cada imagen con PROCEDENCIA, LUGAR (la oferta) y FECHA con su fuente; «no consta» si no hay dato;
 * y una captura de la web guardada entera pero FUERA de la lista de fotos. US$ 0 · sin red (base, modelo y almacén simulados).
 */
import { describe, expect, it } from 'vitest'
import type { Consulta, Fila } from '../../consulta'
import { leerFotos } from '../../lectores'
import { PLAZOS_EN_DIAS } from '../../plazos'
import { crearEscritor } from '../etiqueta-escritura'
import { listarFotos } from '../fotos-pendientes'
import {
  datosPLF, esCapturaDeLaWeb, fechaDeLaFila, fechaDeLosMetadatos, fechaExifComoIso, fichaDeMapasEnDireccion, fichaDelNombreDeLaFoto, frasePLF, lugarDeLaFila, NO_CONSTA,
  procedenciaDeLaFila, sedeDeLaFichaDeMapas,
} from '../procedencia'
import { copiarFotosDeMapasPropia } from '../../../portero-alimenta/fotos-de-mapas-propia'

const C = 'cliente-a'
const consultaCon = (filas: Fila[]): Consulta => async (p) => ({ filas: filas.filter((x) => Object.entries(p.donde).every(([k, v]) => (v === null ? x[k] == null : x[k] === v))), error: null })
const foto = (id: string, extra: Fila = {}): Fila => ({ id, client_id: C, owner_role: 'propio', estado: 'ok', handle: 'cuenta', tipo: 'post_image', url: `https://x/${id}.jpg`, created_at: '2026-11-10T12:00:00Z', duplicado_de: null, ...extra })

/** un JPEG mínimo con EXIF: IFD0 → SubIFD con DateTimeOriginal (0x9003) y/o DateTimeDigitized (0x9004) */
function jpegConExif(fechas: { original?: string; digitalizada?: string }, le = true): Buffer {
  const entradas = [...(fechas.original ? [[0x9003, fechas.original]] : []), ...(fechas.digitalizada ? [[0x9004, fechas.digitalizada]] : [])] as Array<[number, string]>
  const u16 = (n: number) => { const b = Buffer.alloc(2); if (le) b.writeUInt16LE(n); else b.writeUInt16BE(n); return b }
  const u32 = (n: number) => { const b = Buffer.alloc(4); if (le) b.writeUInt32LE(n); else b.writeUInt32BE(n); return b }
  const ifd0 = 8, sub = ifd0 + 2 + 12 + 4, datos = sub + 2 + entradas.length * 12 + 4
  const partes: Buffer[] = [Buffer.from(le ? 'II' : 'MM', 'latin1'), u16(42), u32(ifd0), u16(1), u16(0x8769), u16(4), u32(1), u32(sub), u32(0), u16(entradas.length)]
  entradas.forEach(([tag], i) => partes.push(u16(tag), u16(2), u32(20), u32(datos + i * 20)))
  partes.push(u32(0))
  for (const [, t] of entradas) partes.push(Buffer.from(`${t}\0`, 'latin1'))
  const tiff = Buffer.concat(partes)
  const app1 = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), tiff])
  const largo = Buffer.alloc(2); largo.writeUInt16BE(app1.length + 2)
  return Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe1]), largo, app1, Buffer.from([0xff, 0xda, 0x00, 0x02, 0xff, 0xd9])])
}

describe('captura de la web: por su clase o por el tipo con que la guardó el raspado del sitio', () => {
  it('🔴 clase captura_web o tipo web_captura → captura; una foto, un logo o un fotograma de video no', () => {
    expect(esCapturaDeLaWeb({ clase: 'captura_web', tipo: 'post_image' })).toBe(true)
    expect(esCapturaDeLaWeb({ clase: 'foto', tipo: 'web_captura' })).toBe(true)
    expect(esCapturaDeLaWeb({ tipo: 'WEB_CAPTURA' })).toBe(true)
    expect(esCapturaDeLaWeb({ clase: 'foto', tipo: 'web_imagen' })).toBe(false)
    expect(esCapturaDeLaWeb({ tipo: 'video_captura' })).toBe(false)
    expect(esCapturaDeLaWeb({ tipo: 'maps_foto' })).toBe(false)
  })
})

describe('procedencia: la columna manda; vacía, se deduce de lo que dice la fila', () => {
  it.each([
    [{ procedencia: 'dueno', post_url: 'https://www.instagram.com/p/X/' }, 'dueno'],
    [{ post_url: 'https://www.instagram.com/p/DAvt/' , tipo: 'post_image' }, 'instagram'],
    [{ handle: 'instagram.com', tipo: 'web_captura', post_url: null }, 'instagram'],
    [{ post_url: 'https://m.facebook.com/x' }, 'facebook'],
    [{ post_url: 'https://www.tiktok.com/@a/video/1' }, 'tiktok'],
    [{ post_url: 'https://youtu.be/abc' }, 'youtube'],
    [{ tipo: 'maps_foto', handle: 'mapas-naufrago', post_url: 'https://www.google.com/maps/search/?api=1&query=N' }, 'mapas'],
    [{ tipo: 'web_imagen', post_url: 'https://naufrago.ec/' }, 'sitio_web'],
    [{ tipo: 'web_captura', post_url: 'https://naufrago.ec/faq' }, 'sitio_web'],
    [{ tipo: 'logo_hd', post_url: '' }, 'otro'],
    [{ procedencia: 'inventada', tipo: 'logo_hd' }, 'otro'],
  ])('%j → %s', (f, p) => expect(procedenciaDeLaFila(f as Fila)).toBe(p))
  it('un dominio que solo CONTIENE el nombre de una red no es esa red (miinstagram.com.ec es un sitio)', () => {
    expect(procedenciaDeLaFila({ post_url: 'https://miinstagram.com.ec/', tipo: 'web_imagen' })).toBe('sitio_web')
  })
})

describe('lugar: solo con un dato y su fuente; si no, «no consta»', () => {
  it('🔴 oferta + fuente válida → el lugar; sin fuente, con fuente inventada o sin oferta → no consta (nunca se adivina)', () => {
    expect(lugarDeLaFila({ oferta: 'olon', sede_id: 's1', lugar_fuente: 'mapas' })).toEqual({ oferta: 'olon', sede_id: 's1', fuente: 'mapas' })
    expect(lugarDeLaFila({ oferta: 'plan-pro', lugar_fuente: 'dueno' })).toEqual({ oferta: 'plan-pro', sede_id: null, fuente: 'dueno' })
    expect(lugarDeLaFila({ oferta: 'olon' })).toBe(NO_CONSTA)
    expect(lugarDeLaFila({ oferta: 'olon', lugar_fuente: 'lo_que_se_ve' })).toBe(NO_CONSTA)
    expect(lugarDeLaFila({ sede_id: 's1', lugar_fuente: 'mapas' })).toBe(NO_CONSTA)
  })
})

describe('fecha: guardada con su fuente, o la de la publicación; la de la copia NO cuenta', () => {
  it('🔴 la guardada con fuente gana; sin ella, la publicación; sin ninguna → no consta aunque haya created_at', () => {
    expect(fechaDeLaFila({ fecha_origen: '2026-08-23T14:12:24.000Z', fecha_fuente: 'metadatos', posted_at: '2026-09-01T00:00:00Z' })).toEqual({ valor: '2026-08-23T14:12:24.000Z', fuente: 'metadatos' })
    expect(fechaDeLaFila({ posted_at: '2024-10-05T12:00:00Z' })).toEqual({ valor: '2024-10-05T12:00:00Z', fuente: 'publicacion' })
    expect(fechaDeLaFila({ created_at: '2026-11-10T12:00:00Z' })).toBe(NO_CONSTA)
    expect(fechaDeLaFila({ fecha_origen: '2026-08-23T14:12:24Z', fecha_fuente: 'adivinada' })).toBe(NO_CONSTA)
    expect(fechaDeLaFila({ fecha_origen: 'no es fecha', fecha_fuente: 'dueno' })).toBe(NO_CONSTA)
  })
  it('la frase dice las tres cosas y «no consta» donde falta', () => {
    expect(frasePLF({ tipo: 'web_imagen', post_url: 'https://naufrago.ec/' })).toBe('procedencia: el sitio web · lugar: no consta · fecha: no consta')
    expect(frasePLF({ tipo: 'maps_foto', handle: 'mapas-x', oferta: 'olon', lugar_fuente: 'mapas', fecha_origen: '2026-08-23T14:12:24.000Z', fecha_fuente: 'metadatos' }))
      .toBe('procedencia: ficha de Google Maps de «olon» · oferta «olon» (según su ficha de Google Maps) · fecha 2026-08-23 (metadatos del archivo (Google los reescribe: puede ser la fecha de subida))')
    expect(datosPLF({ post_url: 'https://www.instagram.com/p/X/', posted_at: '2024-10-05T12:00:00Z' })).toEqual({ procedencia: 'instagram', lugar: NO_CONSTA, fecha: { valor: '2024-10-05T12:00:00Z', fuente: 'publicacion' } })
  })
})

describe('la sede de una foto de Mapas: la que cita ESA ficha en sus datos tomados de Mapas', () => {
  const PLACE = 'ChIJ3asaJgArLJAR4P0azPMVwBc'
  const sedes = [{ id: 's-olon', clave: 'olon' }, { id: 's-gye', clave: 'guayaquil' }]
  const dato = (sede: string | null, ref: string, extra: Record<string, unknown> = {}) => ({ sede_id: sede, fuente: 'mapas', fuente_ref: ref, retirada_en: null, ...extra })
  const ref = (p: string) => `https://www.google.com/maps/search/?api=1&query=Naufrago&query_place_id=${p}`
  it('🔴 por el identificador completo o por su forma corta (la del nombre del archivo) → la sede y su clave como oferta', () => {
    expect(sedeDeLaFichaDeMapas(PLACE, [dato('s-olon', ref(PLACE))], sedes)).toEqual({ sede_id: 's-olon', oferta: 'olon' })
    expect(sedeDeLaFichaDeMapas(fichaDelNombreDeLaFoto('maps-chij3asajgarljar4p0azpmvwbc-2f8828d254ec'), [dato('s-olon', ref(PLACE))], sedes)).toEqual({ sede_id: 's-olon', oferta: 'olon' })
  })
  it('🔴 no se adivina: dato retirado, de otra fuente, sin sede, de otra ficha, o dos sedes con la misma ficha → null', () => {
    expect(sedeDeLaFichaDeMapas(PLACE, [dato('s-olon', ref(PLACE), { retirada_en: '2026-11-02T00:00:00Z' })], sedes)).toBeNull()
    expect(sedeDeLaFichaDeMapas(PLACE, [dato('s-olon', ref(PLACE), { fuente: 'sitio' })], sedes)).toBeNull()
    expect(sedeDeLaFichaDeMapas(PLACE, [dato(null, ref(PLACE))], sedes)).toBeNull()
    expect(sedeDeLaFichaDeMapas(PLACE, [dato('s-olon', ref('OtraFicha123'))], sedes)).toBeNull()
    expect(sedeDeLaFichaDeMapas(PLACE, [dato('s-olon', ref(PLACE)), dato('s-gye', ref(PLACE))], sedes)).toBeNull()
    expect(sedeDeLaFichaDeMapas(null, [dato('s-olon', ref(PLACE))], sedes)).toBeNull()
    expect(sedeDeLaFichaDeMapas(PLACE, [dato('s-sin-clave', ref(PLACE))], sedes)).toBeNull()
  })
  it('dos datos de la MISMA sede con la misma ficha siguen siendo una sede', () => {
    expect(sedeDeLaFichaDeMapas(PLACE, [dato('s-olon', ref(PLACE)), dato('s-olon', ref(PLACE))], sedes)).toEqual({ sede_id: 's-olon', oferta: 'olon' })
  })
  it('la ficha dentro de una dirección y dentro del nombre de la foto', () => {
    expect(fichaDeMapasEnDireccion(ref(PLACE))).toBe(PLACE)
    expect(fichaDeMapasEnDireccion('https://maps.google.com/?q=x')).toBeNull()
    expect(fichaDelNombreDeLaFoto('maps-chij3asajgarljar4p0azpmvwbc-2f8828d254ec')).toBe('chij3asajgarljar4p0azpmvwbc')
    expect(fichaDelNombreDeLaFoto('captura-naufrago-ec-9jpv5f')).toBeNull()
  })
})

describe('la fecha de los metadatos del archivo (sin red: los bytes de nuestro almacén)', () => {
  it('🔴 DateTimeOriginal en un JPEG (orden de bytes Intel y Motorola) → ISO', () => {
    expect(fechaDeLosMetadatos(jpegConExif({ original: '2026:08:23 14:12:24' }))).toBe('2026-08-23T14:12:24.000Z')
    expect(fechaDeLosMetadatos(jpegConExif({ original: '2026:06:14 11:55:15' }, false))).toBe('2026-06-14T11:55:15.000Z')
  })
  it('sin DateTimeOriginal usa DateTimeDigitized; con las dos gana la original', () => {
    expect(fechaDeLosMetadatos(jpegConExif({ digitalizada: '2025:01:02 03:04:05' }))).toBe('2025-01-02T03:04:05.000Z')
    expect(fechaDeLosMetadatos(jpegConExif({ original: '2024:12:31 23:59:59', digitalizada: '2025:01:02 03:04:05' }))).toBe('2024-12-31T23:59:59.000Z')
  })
  it('🔴 sin metadatos, una fecha imposible, un PNG o bytes rotos → null (no consta)', () => {
    expect(fechaDeLosMetadatos(jpegConExif({}))).toBeNull()
    expect(fechaDeLosMetadatos(jpegConExif({ original: '0000:00:00 00:00:00' }))).toBeNull()
    expect(fechaDeLosMetadatos(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]))).toBeNull()
    expect(fechaDeLosMetadatos(Buffer.from([0xff, 0xd8, 0x00, 0x00]))).toBeNull()
    expect(fechaDeLosMetadatos(jpegConExif({ original: '2026:08:23 14:12:24' }).subarray(0, 30))).toBeNull()
    expect(fechaExifComoIso('2026:02:30 10:00:00')).toBeNull()
    expect(fechaExifComoIso('2026:13:01 10:00:00')).toBeNull()
    expect(fechaExifComoIso('2026:08:23 24:00:00')).toBeNull()
  })
})

describe('la ruta de fotos: trae procedencia, lugar y fecha; las capturas de la web no salen como fotos', () => {
  const filas = [
    foto('mapa', { tipo: 'maps_foto', handle: 'mapas-n', post_url: 'https://www.google.com/maps/search/?api=1&query=N', oferta: 'olon', sede_id: 's-olon', lugar_fuente: 'mapas', fecha_origen: '2026-08-23T14:12:24.000Z', fecha_fuente: 'metadatos' }),
    foto('post', { post_url: 'https://www.instagram.com/p/X/', posted_at: '2024-10-05T12:00:00Z' }),
    foto('web', { tipo: 'web_imagen', post_url: 'https://naufrago.ec/' }),
    foto('cap-tipo', { tipo: 'web_captura', post_url: 'https://naufrago.ec/privacidad', que_muestra: 'Captura de pantalla… aviso de cookies' }),
    foto('cap-clase', { tipo: 'post_image', clase: 'captura_web', clase_motivo: 'el etiquetador la vio como captura de pantalla' }),
    foto('cap-ajena', { owner_role: 'competidor', tipo: 'web_captura' }),
  ]
  it('🔴 las capturas (por tipo o por clase, propias o ajenas) quedan fuera y se cuentan aparte', async () => {
    const r = await listarFotos(consultaCon(filas), { cliente: C })
    if (!r.ok) throw new Error('debía leer')
    expect(r.fotos.map((f) => f.foto_id).sort()).toEqual(['mapa', 'post', 'web'])
    expect(r.capturas_de_la_web).toBe(3)
    expect(r.total).toBe(3)
    expect(r.por_origen.propia.total).toBe(3)
  })
  it('🔴 cada foto trae procedencia, lugar y fecha con su fuente, o «no consta»', async () => {
    const r = await listarFotos(consultaCon(filas), { cliente: C })
    if (!r.ok) throw new Error('debía leer')
    const por = Object.fromEntries(r.fotos.map((f) => [f.foto_id, f]))
    expect(por.mapa).toMatchObject({ procedencia: 'mapas', lugar: { oferta: 'olon', sede_id: 's-olon', fuente: 'mapas' }, fecha: { valor: '2026-08-23T14:12:24.000Z', fuente: 'metadatos' } })
    expect(por.post).toMatchObject({ procedencia: 'instagram', lugar: NO_CONSTA, fecha: { valor: '2024-10-05T12:00:00Z', fuente: 'publicacion' } })
    expect(por.web).toMatchObject({ procedencia: 'sitio_web', lugar: NO_CONSTA, fecha: NO_CONSTA })
  })
})

describe('la lista de la consulta: la captura se lee entera (todo es todo) pero con su clase, nunca como «foto»', () => {
  const ctx = (filas: Fila[]) => ({ consulta: consultaCon(filas), cliente: C, ahora: new Date('2026-11-17T12:00:00Z'), plazos: PLAZOS_EN_DIAS })
  it('🔴 clase captura_web, título «Captura de la web» y lo dice en su texto; la foto de Mapas dice su oferta y su fecha', async () => {
    const r = await leerFotos(ctx([
      foto('cap', { tipo: 'web_captura', post_url: 'https://naufrago.ec/privacidad', que_muestra: 'Captura de pantalla con aviso de cookies' }),
      foto('mapa', { tipo: 'maps_foto', handle: 'mapas-n', oferta: 'olon', lugar_fuente: 'mapas', fecha_origen: '2026-08-23T14:12:24.000Z', fecha_fuente: 'metadatos' }),
      foto('post', { post_url: 'https://www.instagram.com/p/X/', posted_at: '2024-10-05T12:00:00Z' }),
    ]))
    const por = Object.fromEntries(r.lineas.map((l) => [l.ref.split(':')[1], l]))
    expect(por.cap.clase).toBe('captura_web')
    expect(por.cap.titulo).toMatch(/^Captura de la web/)
    expect(por.cap.que_es).toMatch(/es una captura de pantalla, no una foto/)
    expect(por.cap.que_es).toMatch(/aviso de cookies/) // se guarda y se lee entera
    expect(por.mapa.clase).toBe('foto')
    expect(por.mapa.que_es).toMatch(/oferta «olon» \(según su ficha de Google Maps\) · fecha 2026-08-23/)
    expect(por.post.que_es).toMatch(/procedencia: Instagram · lugar: no consta · fecha 2024-10-05 \(fecha de la publicación\)/)
  })
})

describe('el escritor del cerebro: la clase va solo con la etiqueta completa, con su motivo y solo hacia «captura_web»', () => {
  const nueve = { que_muestra: 'captura de una página', producto_visto: [], etiquetada_en: '2026-11-17T00:00:00Z', etiqueta_modelo: 'm', texto_visible: '', etiqueta_confianza: 'baja' as const, con_personas: false, tipo_de_toma: 'texto_afiche' as const, formato: null }
  const armar = () => {
    const pedidos: Array<{ url: string; cuerpo: Record<string, unknown> }> = []
    const escribir = crearEscritor({ urlDeLaBase: 'https://base.test', llave: 'k', fetchImpl: async (u, i) => { pedidos.push({ url: u, cuerpo: JSON.parse(String(i?.body)) }); return new Response(null, { status: 204 }) } })
    return { escribir, pedidos }
  }
  it('🔴 etiqueta completa + clase captura_web con motivo → UN PATCH con las 11 columnas', async () => {
    const { escribir, pedidos } = armar()
    const r = await escribir({ foto_id: 'f1', cliente: 'c1', valores: { ...nueve, clase: 'captura_web', clase_motivo: 'el etiquetador la vio como captura de pantalla' } })
    expect(r.ok).toBe(true)
    expect(Object.keys(pedidos[0].cuerpo).sort()).toEqual(['clase', 'clase_motivo', ...Object.keys(nueve)].sort())
  })
  it.each([
    ['la clase sola', { clase: 'captura_web', clase_motivo: 'el etiquetador la vio como captura' }, /etiqueta completa/],
    ['la clase sin motivo', { ...nueve, clase: 'captura_web' }, /con su motivo/],
    ['el motivo sin clase', { ...nueve, clase_motivo: 'el etiquetador la vio como captura' }, /con su motivo/],
    ['volver a «foto»', { ...nueve, clase: 'foto', clase_motivo: 'el etiquetador dice que es una foto' }, /captura_web/],
    ['un motivo vacío', { ...nueve, clase: 'captura_web', clase_motivo: '  ' }, /motivo/],
    ['la clase con la toma sola', { con_personas: false, tipo_de_toma: 'otro', formato: null, clase: 'captura_web', clase_motivo: 'el etiquetador la vio como captura' }, /etiqueta completa/],
  ])('🔴 %s → no se escribe nada', async (_n, valores, motivo) => {
    const { escribir, pedidos } = armar()
    const r = await escribir({ foto_id: 'f1', cliente: 'c1', valores: valores as never })
    expect(r.ok).toBe(false)
    expect(r.detalle).toMatch(motivo)
    expect(pedidos).toHaveLength(0)
  })
  it('procedencia, oferta, sede o fecha NO las escribe el escritor de etiquetas (columna no permitida)', async () => {
    const { escribir, pedidos } = armar()
    for (const extra of [{ procedencia: 'mapas' }, { oferta: 'olon' }, { sede_id: 's' }, { fecha_origen: '2026-01-01T00:00:00Z' }]) {
      const r = await escribir({ foto_id: 'f1', cliente: 'c1', valores: { ...nueve, ...extra } as never })
      expect(r).toMatchObject({ ok: false, detalle: expect.stringMatching(/columna no permitida/) })
    }
    expect(pedidos).toHaveLength(0)
  })
})

describe('el escritor de fotos de Mapas: procedencia, sede (por la ficha) y fecha de los metadatos', () => {
  const PLACE = 'ChIJ3asaJgArLJAR4P0azPMVwBc'
  const ficha = { title: 'Náufrago', placeId: PLACE, address: '663R+25G, Olón', city: 'Olón', url: 'https://www.google.com/maps/place/x', imageUrls: ['https://lh3.test/a.jpg', 'https://lh3.test/b.jpg'] }
  const ctx = { nombre: 'Náufrago', ubicacion: ['Olón'], handles: [], dominios: [], telefonos: [] }
  function armar(o: { sedesResponden?: boolean; datos?: unknown[] } = {}) {
    const insertadas: Array<Record<string, unknown>> = []
    const fetchImpl = async (u: string, i?: RequestInit): Promise<Response> => {
      if (u.startsWith('https://lh3.test/a.jpg')) return new Response(new Uint8Array(jpegConExif({ original: '2026:08:23 14:12:24' })), { status: 200 })
      if (u.startsWith('https://lh3.test/b.jpg')) return new Response(new Uint8Array(Buffer.from([0xff, 0xd8, 0xff, 0xda, 0, 2, 0xff, 0xd9])), { status: 200 })
      if (u.includes('/rest/v1/client_sede_datos')) return o.sedesResponden === false ? new Response('caída', { status: 500 }) : Response.json(o.datos ?? [{ sede_id: 's-olon', fuente: 'mapas', fuente_ref: `https://www.google.com/maps/search/?api=1&query=N&query_place_id=${PLACE}`, retirada_en: null }])
      if (u.includes('/rest/v1/client_sedes')) return Response.json([{ id: 's-olon', clave: 'olon' }, { id: 's-gye', clave: 'guayaquil' }])
      if (u.includes('/rest/v1/client_social_images') && (!i?.method || i.method === 'GET')) return Response.json([])
      if (u.includes('/storage/v1/object/')) return new Response(null, { status: 200 })
      if (u.includes('/rest/v1/client_social_images') && i?.method === 'POST') { insertadas.push(...(JSON.parse(String(i.body)) as Array<Record<string, unknown>>)); return new Response(null, { status: 201 }) }
      return new Response('no esperado', { status: 404 })
    }
    return { insertadas, correr: () => copiarFotosDeMapasPropia({ clientId: 'c1', fichasCrudas: [ficha as never], ctx, urlDeLaBase: 'https://base.test', llave: 'k', fetchImpl: fetchImpl as never }) }
  }
  it('🔴 cada foto: procedencia mapas, oferta y sede de la ficha; la fecha de los metadatos si la trae, si no vacía', async () => {
    const a = armar()
    const r = await a.correr()
    expect(r.copiadas).toBe(2)
    const [conFecha, sinFecha] = a.insertadas
    expect(conFecha).toMatchObject({ procedencia: 'mapas', oferta: 'olon', sede_id: 's-olon', lugar_fuente: 'mapas', fecha_origen: '2026-08-23T14:12:24.000Z', fecha_fuente: 'metadatos' })
    expect(sinFecha).toMatchObject({ procedencia: 'mapas', oferta: 'olon', sede_id: 's-olon', lugar_fuente: 'mapas', fecha_origen: null, fecha_fuente: null })
    // todas las filas llevan las MISMAS columnas (la inserción en lote las exige iguales)
    expect(Object.keys(conFecha).sort()).toEqual(Object.keys(sinFecha).sort())
  })
  it('🔴 si los datos de la sede no se pueden leer, o la ficha no es de ninguna sede, se copia igual y el lugar queda vacío (no consta)', async () => {
    for (const o of [{ sedesResponden: false }, { datos: [] }]) {
      const a = armar(o)
      const r = await a.correr()
      expect(r.copiadas).toBe(2)
      for (const f of a.insertadas) expect(f).toMatchObject({ procedencia: 'mapas', oferta: null, sede_id: null, lugar_fuente: null })
    }
  })
})

describe('el contenido completo de una imagen (leer por referencia) también dice procedencia, lugar y fecha, y si es captura', () => {
  it('🔴 la captura lo dice con su motivo; la foto de Mapas trae su oferta; lo que falta dice «no consta»', async () => {
    const { leerContenido } = await import('../../contenido')
    const filas = [
      foto('cap', { tipo: 'web_captura', post_url: 'https://naufrago.ec/privacidad', clase: 'captura_web', clase_motivo: 'tipo web_captura: captura de la página' }),
      foto('mapa', { tipo: 'maps_foto', handle: 'mapas-n', oferta: 'olon', lugar_fuente: 'mapas' }),
    ]
    const cap = await leerContenido(consultaCon(filas), C, 'client_social_images:cap')
    expect(cap.texto).toMatch(/procedencia: el sitio web · lugar: no consta · fecha: no consta/)
    expect(cap.texto).toMatch(/Es una captura de pantalla de la web, no una foto \(tipo web_captura: captura de la página\)/)
    const mapa = await leerContenido(consultaCon(filas), C, 'client_social_images:mapa')
    expect(mapa.texto).toMatch(/oferta «olon» \(según su ficha de Google Maps\) · fecha: no consta/)
    expect(mapa.texto).not.toMatch(/captura de pantalla/)
  })
})
