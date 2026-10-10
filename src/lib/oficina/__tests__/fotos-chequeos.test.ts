import { describe, it, expect } from 'vitest'
import { candidatasFoto } from '../fotos'
import type { FotoEtiquetada } from '../fotos'
import { chequeosDePost } from '../chequeos'
import type { ContextoDeChequeo } from '../chequeos'
import etiquetas from './fixtures/etiquetas-16-fotos.json'

const fotos = etiquetas as unknown as FotoEtiquetada[]
const propios = { telefonos: ['0997744288'], handles: ['@naufrago.ec'], urls: ['https://www.naufrago.ec'], marcas_ajenas: ['rukutu'] }

describe('candidatasFoto con la batería REAL de las 16 etiquetas del cliente piloto (medidas el 09-oct)', () => {
  it('hay 16 etiquetas', () => { expect(fotos).toHaveLength(16) })
  it('para un brief de CEVICHE no sirve ninguna: la única de ceviche trae teléfono y @ de otro negocio y la regla la descarta SOLA', () => {
    const r = candidatasFoto(fotos, { protagonista: 'ceviche', prohibe_personas: true, proporcion: '1:1' }, propios)
    expect(r.candidatas).toHaveLength(0)
    const ceviche = r.descartadas.find((d) => d.id === '7a75e500')!
    expect(ceviche.motivos.join(' | ')).toMatch(/teléfono 997664119/)
    expect(ceviche.motivos.join(' | ')).toMatch(/usuario @rukutuio/)
    expect(ceviche.motivos.join(' | ')).toMatch(/marca ajena «rukutu»/)
    expect(ceviche.motivos.join(' | ')).not.toMatch(/protagonista/) // sí muestra ceviche: el motivo es el texto ajeno
  })
  it('cada foto descartada trae AL MENOS un motivo escrito', () => {
    const r = candidatasFoto(fotos, { protagonista: 'ceviche', prohibe_personas: true, proporcion: '1:1' }, propios)
    expect(r.descartadas).toHaveLength(16)
    for (const d of r.descartadas) expect(d.motivos.length).toBeGreaterThan(0)
  })
  it('para encebollado y sin personas hay candidatas, y ninguna es de las que tienen personas, logo o afiche', () => {
    const r = candidatasFoto(fotos, { protagonista: 'encebollado', prohibe_personas: true, proporcion: '1:1' }, propios)
    expect(r.candidatas.length).toBeGreaterThan(0)
    const ids = new Set(r.candidatas.map((c) => c.id))
    for (const f of fotos) if (ids.has(f.id)) { expect(f.con_personas).not.toBe(true); expect(f.tipo_de_toma).not.toBe('texto_afiche') }
    expect(ids.has('5d92d79f')).toBe(false) // trae personas
  })
  it('permitiendo personas, las fotos con personas vuelven a ser candidatas', () => {
    const sin = candidatasFoto(fotos, { protagonista: 'encebollado', prohibe_personas: true, proporcion: '1:1' }, propios).candidatas.length
    const con = candidatasFoto(fotos, { protagonista: 'encebollado', prohibe_personas: false, proporcion: '1:1' }, propios).candidatas.length
    expect(con).toBeGreaterThan(sin)
  })
  it('confianza media ⇒ requiere_mirar (el curador la ve)', () => {
    const r = candidatasFoto(fotos, { protagonista: 'encebollado', prohibe_personas: true, proporcion: '1:1' }, propios)
    expect(r.candidatas.every((c) => c.requiere_mirar)).toBe(true)
  })
  it('el teléfono y el usuario PROPIOS no descartan', () => {
    const f: FotoEtiquetada[] = [{ id: 'x', estado: 'ok', producto_visto: ['Ceviches'], texto_visible: 'Pide al 0997744288 @naufrago.ec', con_personas: false, tipo_de_toma: 'producto', formato: 'cuadrado', etiqueta_confianza: 'alta' }]
    expect(candidatasFoto(f, { protagonista: 'ceviche', prohibe_personas: true, proporcion: '1:1' }, propios).candidatas).toHaveLength(1)
  })
  it('sin etiquetar, logo y formato imposible se descartan; sin protagonista en el brief no se filtra por producto', () => {
    const base = { estado: 'ok', producto_visto: ['Ceviches'], texto_visible: '', con_personas: false, formato: 'cuadrado', etiqueta_confianza: 'alta' as const }
    const f: FotoEtiquetada[] = [
      { id: 'a', ...base, tipo_de_toma: null, etiqueta_confianza: null },
      { id: 'b', ...base, tipo_de_toma: 'logo' },
      { id: 'c', ...base, tipo_de_toma: 'producto', formato: 'panoramica' },
      { id: 'd', ...base, tipo_de_toma: 'producto', producto_visto: [] },
    ]
    const r = candidatasFoto(f, { protagonista: '', prohibe_personas: true, proporcion: '1:1' }, propios)
    expect(r.descartadas.map((x) => x.id).sort()).toEqual(['a', 'b', 'c'])
    expect(r.candidatas.map((x) => x.id)).toEqual(['d'])
  })
  it('una foto usada dentro de la ventana se marca (y se excluye si se pide); fuera de la ventana no', () => {
    const f: FotoEtiquetada[] = [{ id: 'u', estado: 'ok', producto_visto: ['Ceviches'], texto_visible: '', con_personas: false, tipo_de_toma: 'producto', formato: 'cuadrado', etiqueta_confianza: 'alta' }]
    const ahora = new Date('2026-10-20T12:00:00Z')
    const marcada = candidatasFoto(f, { protagonista: 'ceviche', prohibe_personas: true, proporcion: '1:1', usos: { u: '2026-10-15T12:00:00Z' }, ahora }, propios)
    expect(marcada.candidatas[0].reusada).toBe(true)
    const excluida = candidatasFoto(f, { protagonista: 'ceviche', prohibe_personas: true, proporcion: '1:1', usos: { u: '2026-10-15T12:00:00Z' }, ahora, excluir_reusadas: true }, propios)
    expect(excluida.candidatas).toHaveLength(0)
    const vieja = candidatasFoto(f, { protagonista: 'ceviche', prohibe_personas: true, proporcion: '1:1', usos: { u: '2026-09-01T12:00:00Z' }, ahora, excluir_reusadas: true }, propios)
    expect(vieja.candidatas).toHaveLength(1)
  })
  it('LÍMITE CONOCIDO (declarado): una marca ajena SIN teléfono ni @ solo se detecta si está en la lista de marcas ajenas', () => {
    const f: FotoEtiquetada[] = [{ id: 'm', estado: 'ok', producto_visto: ['Encebollados'], texto_visible: 'ONC; CAFÉ + LIMÓN', con_personas: false, tipo_de_toma: 'producto', formato: 'vertical', etiqueta_confianza: 'media' }]
    const sinLista = candidatasFoto(f, { protagonista: 'encebollado', prohibe_personas: true, proporcion: '4:5' }, { ...propios, marcas_ajenas: [] })
    expect(sinLista.candidatas).toHaveLength(1)
    const conLista = candidatasFoto(f, { protagonista: 'encebollado', prohibe_personas: true, proporcion: '4:5' }, { ...propios, marcas_ajenas: ['onc'] })
    expect(conLista.candidatas).toHaveLength(0)
  })
})

describe('chequeos duros del post', () => {
  const ctx = (o: Partial<ContextoDeChequeo> & { pie?: string; tags?: string[] } = {}): ContextoDeChequeo => ({
    pieza: { pie_de_foto: o.pie ?? 'Ceviche a $7.00. Pídelo al 0997744288.', hashtags: o.tags ?? ['#ceviche', '#olon'] },
    fuentes: { palabras_prohibidas: ['premium', 'el mejor'], telefonos: ['+593 997 744 288'], handles: ['@naufrago.ec'], precios: ['7.00', '9.50'], competidores: ['Pez Azul'], registro: 'tuteo', ...(o.fuentes ?? {}) },
    limites: { pie_de_foto_max: 2200, hashtags_max: 30, limites_verificados: false, ...(o.limites ?? {}) },
    ...(o.prohibidas_del_brief ? { prohibidas_del_brief: o.prohibidas_del_brief } : {}), ...(o.imagen ? { imagen: o.imagen } : {}),
  })
  const mensajes = (c: ContextoDeChequeo) => chequeosDePost(c).map((f) => `${f.gravedad}:${f.donde}:${f.que}`).join(' | ')
  it('una pieza limpia no da fichas', () => { expect(chequeosDePost(ctx())).toEqual([]) })
  it('palabra prohibida (sin tildes, mayúsculas ni plurales) en el pie y en un hashtag', () => {
    expect(mensajes(ctx({ pie: 'El MEJOR ceviche, calidad PREMIUM' }))).toMatch(/palabra prohibida «premium»/)
    expect(mensajes(ctx({ pie: 'Ceviche', tags: ['#Premium'] }))).toMatch(/bloquea:hashtags:.*premium/)
    expect(mensajes(ctx({ pie: 'ceviche super', prohibidas_del_brief: ['super'] }))).toMatch(/«super»/)
  })
  it('VOSEO: «pedilo», «mirá», «Pedí» fallan con registro tuteo; «pídelo», «mira» no', () => {
    expect(mensajes(ctx({ pie: 'Pedilo ya al 0997744288' }))).toMatch(/bloquea:texto:voseo/)
    expect(mensajes(ctx({ pie: 'Mirá este plato. Pedí al 0997744288' }))).toMatch(/mirá.*pedí|pedí.*mirá/)
    expect(chequeosDePost(ctx({ pie: 'Pídelo ya. Mira este plato, al 0997744288' }))).toEqual([])
  })
  it('el voseo NO es falla si el registro del cliente no es tuteo; sin dato es solo sugerencia', () => {
    expect(chequeosDePost(ctx({ pie: 'Pedilo ya', fuentes: { registro: 'voseo' } as never }))).toEqual([])
    expect(mensajes(ctx({ pie: 'Pedilo ya', fuentes: { registro: 'sin_dato' } as never }))).toMatch(/^sugerencia:texto:voseo/)
  })
  it('teléfono y usuario que no son del cliente', () => {
    expect(mensajes(ctx({ pie: 'Escríbenos al 0997664119' }))).toMatch(/teléfono 997664119/)
    expect(mensajes(ctx({ pie: 'Síguenos en @otro_negocio' }))).toMatch(/usuario @otro_negocio/)
  })
  it('si no se pudieron LEER los teléfonos o usuarios del cliente, lo desconocido es «no verificado» (sugerencia), nunca «falso»', () => {
    expect(mensajes(ctx({ pie: 'Escríbenos al 0997664119', fuentes: { telefonos: [], telefonos_verificables: false } as never }))).toMatch(/^sugerencia:texto:teléfono/)
    expect(mensajes(ctx({ pie: 'Síguenos en @otro_negocio', fuentes: { handles: [], handles_verificables: false } as never }))).toMatch(/^sugerencia:texto:usuario/)
  })
  it('precio fuera de la carta bloquea; sin carta es solo sugerencia', () => {
    expect(mensajes(ctx({ pie: 'Ceviche a $8.00' }))).toMatch(/bloquea:texto:precio \$8.00/)
    expect(chequeosDePost(ctx({ pie: 'Ceviche a $9,50' }))).toEqual([])
    expect(mensajes(ctx({ pie: 'Ceviche a $8.00', fuentes: { precios: [] } as never }))).toMatch(/^sugerencia:texto:precio/)
  })
  it('hashtag con un competidor del cliente', () => { expect(mensajes(ctx({ tags: ['#pezazul'], pie: 'Ceviche' }))).toBe('') ; expect(mensajes(ctx({ tags: ['#Pez Azul'], pie: 'Ceviche' }))).toMatch(/competidor/) })
  it('límites de la plataforma: sugerencia mientras NO estén verificados; bloquean cuando lo están', () => {
    const largo = 'a'.repeat(2300)
    expect(mensajes(ctx({ pie: largo }))).toMatch(/^sugerencia:texto:.*límite/)
    expect(mensajes(ctx({ pie: largo, limites: { limites_verificados: true } as never }))).toMatch(/^bloquea:texto:.*límite/)
    const tags = Array.from({ length: 31 }, (_, i) => `#t${i}`)
    expect(mensajes(ctx({ pie: 'x', tags }))).toMatch(/sugerencia:hashtags/)
  })
  it('imagen generada sin declararla en la bandeja bloquea', () => {
    expect(mensajes(ctx({ imagen: { generada: true, declarada_en_bandeja: false } }))).toMatch(/bloquea:imagen/)
    expect(chequeosDePost(ctx({ imagen: { generada: true, declarada_en_bandeja: true } }))).toEqual([])
  })
})
