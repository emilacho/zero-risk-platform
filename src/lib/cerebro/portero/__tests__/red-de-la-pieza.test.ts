/** Encargo 7 (21-nov) · la etiqueta `red` se deduce del raspador, del tipo o del enlace; sin señal → null («no consta»). Nombres de Lenovo. US$ 0. */
import { describe, expect, it } from 'vitest'
import {
  CAPAS_DEL_VAULT, RAW_DEL_VAULT, REDES_DEL_VAULT, TIPOS_DEL_VAULT,
  capaDeLaFicha, capaDeLaPieza, redDeLaFicha, redDeLaFotoOVideo, redDeUrl,
  tipoDeCarpetaDeFicha, tipoDeCarpetaDeFoto, tipoDeCarpetaDeVideo,
} from '../red-de-la-pieza'

describe('redDeUrl', () => {
  it('reconoce las redes por el host, con o sin www y con subdominios de archivos', () => {
    expect(redDeUrl('https://www.instagram.com/p/abc/')).toBe('instagram')
    expect(redDeUrl('https://scontent.cdninstagram.com/x.jpg')).toBe('instagram')
    expect(redDeUrl('https://www.tiktok.com/@x/video/1')).toBe('tiktok')
    expect(redDeUrl('https://youtu.be/abc')).toBe('youtube')
    expect(redDeUrl('https://x.com/a/status/1')).toBe('x')
    expect(redDeUrl('https://twitter.com/a')).toBe('x')
    expect(redDeUrl('https://www.facebook.com/p/1')).toBe('facebook')
    expect(redDeUrl('https://www.google.com/maps/place/x')).toBe('maps')
    expect(redDeUrl('https://www.reddit.com/r/quito/')).toBe('foros')
  })
  // 23-nov · hallazgo de CC6 en #1271 con datos vivos: Google no es solo Maps
  it('🔴 cada servicio de Google con su red (URLs reales de las fichas vivas); google.com a secas no dice nada', () => {
    expect(redDeUrl('https://adstransparency.google.com/advertiser/AR123?region=EC')).toBe('anuncios_google')
    expect(redDeUrl('https://trends.google.com/trending?geo=EC')).toBe('busquedas')
    expect(redDeUrl('https://maps.google.com/?cid=123')).toBe('maps')
    expect(redDeUrl('https://maps.app.goo.gl/abc123')).toBe('maps')
    expect(redDeUrl('https://goo.gl/maps/abc123')).toBe('maps')
    expect(redDeUrl('https://google.com.ec/maps/place/x')).toBe('maps')
    expect(redDeUrl('https://www.google.com/search?q=ceviche')).toBeNull()
    expect(redDeUrl('https://lh5.googleusercontent.com/x.jpg')).toBeNull() // la foto de Maps la decide su tipo, no este host
    expect(redDeUrl('https://www.google.com/mapsfalso/x')).toBeNull() // «empieza parecido» no es la ruta de Maps
  })
  it('un host desconocido, un texto que no es enlace o nada → null (no se inventa)', () => {
    expect(redDeUrl('https://extintores.ec/productos')).toBeNull()
    expect(redDeUrl('instagram')).toBeNull()
    expect(redDeUrl(null)).toBeNull()
    expect(redDeUrl('https://miinstagram.com/x')).toBeNull() // «termina parecido» no es la red
  })
})

describe('redDeLaFotoOVideo', () => {
  it('el tipo manda: Maps, web y anuncios no necesitan enlace', () => {
    expect(redDeLaFotoOVideo({ tipo: 'maps_portada' })).toBe('maps')
    expect(redDeLaFotoOVideo({ tipo: 'maps_foto' })).toBe('maps')
    expect(redDeLaFotoOVideo({ tipo: 'web_imagen', url: 'https://extintores.ec/x.jpg' })).toBe('sitio')
    expect(redDeLaFotoOVideo({ tipo: 'web_captura' })).toBe('sitio')
    expect(redDeLaFotoOVideo({ tipo: 'logo_hd' })).toBe('sitio')
    expect(redDeLaFotoOVideo({ tipo: 'video_web' })).toBe('sitio')
    expect(redDeLaFotoOVideo({ tipo: 'anuncio', post_url: 'https://dynamic.lightreader.com/x' })).toBe('anuncios_meta')
  })
  it('sin tipo que mande, decide el enlace (post_url primero, después url); sin señal → null', () => {
    expect(redDeLaFotoOVideo({ tipo: 'post_image', post_url: 'https://www.instagram.com/p/a/' })).toBe('instagram')
    expect(redDeLaFotoOVideo({ tipo: 'video_captura', url: 'https://www.tiktok.com/@a/video/1' })).toBe('tiktok')
    expect(redDeLaFotoOVideo({ tipo: 'reel', post_url: 'https://www.instagram.com/reel/a/' })).toBe('instagram')
    expect(redDeLaFotoOVideo({ tipo: 'post_image' })).toBeNull()
  })
})

describe('redDeLaFicha', () => {
  it('el enlace de la fuente gana; sin enlace decide la clase (la lista viva del 21-nov)', () => {
    expect(redDeLaFicha({ clase: 'comentarios', fuente_url: 'https://www.instagram.com/p/a/' })).toBe('instagram')
    // y gana TAMBIÉN cuando la clase diría otra red: una reseña traída de Instagram es de Instagram, no de Maps
    expect(redDeLaFicha({ clase: 'resenas', fuente_url: 'https://www.instagram.com/p/b/' })).toBe('instagram')
    expect(redDeLaFicha({ clase: 'metrica', fuente_url: null })).toBe('ventas')
    expect(redDeLaFicha({ clase: 'evento_local', fuente_url: null })).toBe('eventos')
    expect(redDeLaFicha({ clase: 'contexto_feriado', fuente_url: null })).toBe('eventos')
    expect(redDeLaFicha({ clase: 'tendencia_busqueda', fuente_url: null })).toBe('busquedas')
    expect(redDeLaFicha({ clase: 'foro', fuente_url: 'https://www.reddit.com/r/x/' })).toBe('foros')
    expect(redDeLaFicha({ clase: 'mencion', fuente_url: null })).toBe('menciones')
    expect(redDeLaFicha({ clase: 'sitio', fuente_url: 'https://naufrago.ec/' })).toBe('sitio')
    expect(redDeLaFicha({ clase: 'resenas', fuente_url: null })).toBe('maps')
    expect(redDeLaFicha({ clase: 'competidor_anuncios', fuente_url: null })).toBe('anuncios_meta')
    expect(redDeLaFicha({ clase: 'competidor_anuncios_google', fuente_url: null })).toBe('anuncios_google')
    // las 9 + 4 fichas vivas que CC6 encontró mal archivadas por la regla ancha de Google
    expect(redDeLaFicha({ clase: 'competidor_anuncios_google', fuente_url: 'https://adstransparency.google.com/advertiser/AR123' })).toBe('anuncios_google')
    expect(redDeLaFicha({ clase: 'tendencia_busqueda', fuente_url: 'https://trends.google.com/trending?geo=EC' })).toBe('busquedas')
  })
  it('lo del dueño y lo sintetizado no tienen red: null («no consta»)', () => {
    for (const clase of ['dato_del_dueno', 'aprendizaje_del_dueno', 'resumen_vivo', 'informe_de_analisis', 'competidor_evaluacion', 'precio', 'horario']) {
      expect(redDeLaFicha({ clase, fuente_url: null }), clase).toBeNull()
    }
  })
})

describe('capas y tipos de carpeta', () => {
  it('capaDeLaPieza: papel primero; una referencia decide por su nivel', () => {
    expect(capaDeLaPieza('propio', 'propio')).toBe('propio')
    expect(capaDeLaPieza('competidor', 'directa')).toBe('competencia')
    expect(capaDeLaPieza('mercado', 'competencia')).toBe('mercado')
    expect(capaDeLaPieza('referencia', 'mundo')).toBe('mundo')
    expect(capaDeLaPieza('referencia', 'global')).toBe('mundo')
    expect(capaDeLaPieza('referencia', 'pais')).toBe('pais')
    expect(capaDeLaPieza('referencia', 'directa')).toBe('competencia')
    expect(capaDeLaPieza('referencia', 'competencia')).toBe('mercado')
  })
  it('capaDeLaFicha: por el alcance vivo (cliente · competidor · mercado · pais · zona · general · null)', () => {
    expect(capaDeLaFicha('cliente')).toBe('propio')
    expect(capaDeLaFicha('competidor')).toBe('competencia')
    expect(capaDeLaFicha('mercado')).toBe('mercado')
    expect(capaDeLaFicha('zona')).toBe('mercado')
    expect(capaDeLaFicha('pais')).toBe('pais')
    expect(capaDeLaFicha('general')).toBe('propio')
    expect(capaDeLaFicha(null)).toBe('propio')
  })
  it('tipos de carpeta: fotos, videos y fichas caen en los 10 tipos de Lenovo', () => {
    expect(tipoDeCarpetaDeFoto('post_image')).toBe('publicacion')
    expect(tipoDeCarpetaDeFoto('video_captura')).toBe('foto')
    expect(tipoDeCarpetaDeFoto('maps_foto')).toBe('foto')
    expect(tipoDeCarpetaDeFoto('web_captura')).toBe('pagina')
    expect(tipoDeCarpetaDeFoto('anuncio')).toBe('anuncio')
    expect(tipoDeCarpetaDeVideo('reel')).toBe('reel')
    expect(tipoDeCarpetaDeVideo('video_feed')).toBe('video')
    expect(tipoDeCarpetaDeVideo('anuncio')).toBe('anuncio')
    expect(tipoDeCarpetaDeFicha('resenas')).toBe('resena')
    expect(tipoDeCarpetaDeFicha('comentarios')).toBe('comentario')
    expect(tipoDeCarpetaDeFicha('sitio')).toBe('pagina')
    expect(tipoDeCarpetaDeFicha('competidor_anuncios')).toBe('anuncio')
    expect(tipoDeCarpetaDeFicha('tendencia_del_publico')).toBe('tendencia')
    expect(tipoDeCarpetaDeFicha('dato_del_dueno')).toBe('ficha')
  })
  it('los nombres son los de Lenovo, uno por clave (cambiar un rótulo es cambiar una línea)', () => {
    expect(CAPAS_DEL_VAULT.pais).toBe('País')
    expect(REDES_DEL_VAULT.anuncios_meta).toBe('Anuncios de Meta')
    expect(REDES_DEL_VAULT.busquedas).toBe('Búsquedas de Google')
    expect(TIPOS_DEL_VAULT.ficha).toBe('Datos')
    expect(RAW_DEL_VAULT.raw_sin_clasificar).toBe('Sin clasificar')
    expect(Object.keys(REDES_DEL_VAULT)).toHaveLength(14)
    expect(Object.keys(TIPOS_DEL_VAULT)).toHaveLength(10)
    expect(Object.keys(CAPAS_DEL_VAULT)).toEqual(['propio', 'competencia', 'mercado', 'pais', 'mundo'])
  })
})
