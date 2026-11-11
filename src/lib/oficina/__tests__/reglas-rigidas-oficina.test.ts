/**
 * GO Lenovo 11-nov 03:55Z · arreglar las reglas rígidas del barrido que PUEDEN TRABAR una pieza · filas de la oficina (CC4). US$ 0 · sin red.
 * Regla de Emilio (21-oct): juzgar = agente; exacto = dato/código; nada de listas ni frases fijas. Dos clientes de rubros distintos en cada fila.
 */
import { describe, expect, it } from 'vitest'
import { registroDelManual } from '../adaptadores'
import { chequeosDeLaminas, type ContextoDeChequeoLaminas } from '../laminas'
import { chequeosDePost, type ContextoDeChequeo } from '../chequeos'

describe('fila #10 · el trato del manual lo resuelve el detector de la cadena (entiende negaciones)', () => {
  it('restaurante que vosea: «voseo, nunca tuteo» es voseo (antes la regex leía «tuteo» y bloqueaba su propio voseo)', () => {
    expect(registroDelManual('Cercano y porteño: voseo, nunca tuteo.')).toBe('voseo')
    expect(registroDelManual({ voice_description: 'Cálida, de barrio', writing_style: 'Siempre vos: pedí, vení, probá. Jamás tú.' })).toBe('voseo')
  })
  it('consultora B2B que tutea: «tutea, nunca vos» es tuteo; y el usted también se reconoce', () => {
    expect(registroDelManual('Profesional y cercana: tutea siempre, nunca vos.')).toBe('tuteo')
    expect(registroDelManual({ voice_description: 'Sobria', tone_guidelines: { trato: 'usted' } })).toBe('formal')
  })
  it('el trato explícito de la ficha cuenta; el «habitual del país» (baja confianza) NO lo fija: queda sin dato, como hoy', () => {
    expect(registroDelManual({ voice_description: 'Voz directa' }, { config: { trato: 'vos' } })).toBe('voseo')
    expect(registroDelManual({ voice_description: 'Voz directa' }, { config: {}, country: 'Argentina' })).toBe('sin_dato')
    expect(registroDelManual('Voz directa')).toBe('sin_dato')
    expect(registroDelManual(null)).toBe('sin_dato')
  })
  it('si el manual nombra dos tratos sin negar ninguno, no se elige: sin dato (el chequeo solo avisa)', () => {
    expect(registroDelManual('A veces tuteo, a veces voseo según la red.')).toBe('sin_dato')
  })
})

describe('fila #3 · un porcentaje que no está literal en las fuentes es un candidato: avisa, no bloquea', () => {
  const ctx = (texto: string, fuentes: string[]): ContextoDeChequeoLaminas => ({
    familia: 'carrusel', fuentes: { palabras_prohibidas: [], palabras_duras: [], telefonos: [], handles: [], precios: [], competidores: [], moneda: 'USD', registro: 'sin_dato', telefonos_verificables: false, handles_verificables: false },
    limites: { pie_de_foto_max: 2200, hashtags_max: 30, limites_verificados: false }, prohibidas_del_brief: [],
    texto_del_autor: { texto, hashtags: [] }, textos_de_laminas: [texto], fuentes_de_cifras: fuentes,
    fonts_faltantes: [], imagenes_sin_lamina: [], fotos_reusadas: [], problemas_de_contrato: [], texto_fuera_del_autor: [], problemas_de_armado: [], problemas_de_kit: [],
  } as unknown as ContextoDeChequeoLaminas)
  const delPorcentaje = (c: ContextoDeChequeoLaminas, p: string) => chequeosDeLaminas(c).filter((f) => f.que?.includes(p))
  it('restaurante: «100 % artesanal» no traba el carrusel; queda la ficha para que la revisión decida', () => {
    const f = delPorcentaje(ctx('Pan 100% artesanal, hecho cada mañana', ['El pan se hornea cada mañana']), '100%')
    expect(f).toHaveLength(1); expect(f[0].gravedad).toBe('sugerencia'); expect(f[0].que).toMatch(/revisar si es un dato que necesita respaldo/)
  })
  it('consultora B2B: «al 50 %» de una promo no traba; una cifra que SÍ está en las fuentes no marca nada', () => {
    expect(delPorcentaje(ctx('Diagnóstico al 50% este mes', ['Asesoría tributaria para pymes']), '50%').map((x) => x.gravedad)).toEqual(['sugerencia'])
    expect(delPorcentaje(ctx('Reducimos 30% el tiempo de cierre', ['Caso real: el cierre bajó 30% en 2025']), '30%')).toEqual([])
  })
  it('ninguna cifra fuera de las fuentes bloquea la pieza', () => {
    const fs = chequeosDeLaminas(ctx('Sube 80% tus ventas con 45 recetas', ['precio 12']))
    expect(fs.filter((x) => /80%|45/.test(x.que ?? '')).every((x) => x.gravedad === 'sugerencia')).toBe(true)
  })
})

describe('fila #11 · que la palabra coincida con un competidor es un candidato: avisa y decide el jefe', () => {
  const post = (pie: string, hashtags: string[], competidores: string[]): ContextoDeChequeo => ({
    pieza: { pie_de_foto: pie, hashtags },
    fuentes: { palabras_prohibidas: [], palabras_duras: [], telefonos: [], handles: [], precios: [], competidores, moneda: 'USD', registro: 'sin_dato', telefonos_verificables: false, handles_verificables: false },
    limites: { pie_de_foto_max: 2200, hashtags_max: 30, limites_verificados: false },
  } as unknown as ContextoDeChequeo)
  const deCompetidor = (c: ContextoDeChequeo) => chequeosDePost(c).filter((f) => /competidor/.test(f.que ?? ''))
  it('restaurante con un competidor llamado «La Playa»: «un almuerzo frente a la playa» no traba la pieza; queda la ficha', () => {
    const f = deCompetidor(post('Un almuerzo frente a la playa, con ceviche del día.', ['#Olon'], ['La Playa']))
    expect(f).toHaveLength(1); expect(f[0].gravedad).toBe('sugerencia'); expect(f[0].que).toMatch(/revisar si es una mención o una palabra común/)
  })
  it('consultora B2B con un competidor llamado «Contable» y el hashtag #Contable: también es candidato (lo decide el jefe), nunca un bloqueo del código', () => {
    const f = deCompetidor(post('Cierra tu año sin sorpresas.', ['#Contable', '#pymes'], ['Contable']))
    expect(f.map((x) => x.gravedad)).toEqual(['sugerencia'])
  })
  it('sin coincidencia no hay ficha', () => {
    expect(deCompetidor(post('Ceviche del día en Olón.', [], ['Pez Azul']))).toEqual([])
  })
})
