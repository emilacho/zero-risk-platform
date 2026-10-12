/**
 * Relevo 45 · CC#3 §4: el léxico base de V14 estaba inclinado a gastronomía y dejaba pasar en otros rubros afirmaciones que necesitan respaldo.
 * Estas frases salen de la recertificación (rojas antes del cambio). La regla es de ESTRUCTURA del texto, sin lista de un rubro.
 */
import { describe, it, expect } from 'vitest'
import { hallarAfirmaciones } from '../afirmaciones'
import { lexicoDelCliente } from '../lexico-por-rubro'

// r75 · H3 · la base solo marca lo ESTRUCTURAL; frescura/origen/porción son del paquete del rubro que las vende (se cargan por la industria de la ficha)
const INDUSTRIA: Record<string, string> = { gastro: 'restaurante de comida', tienda: 'tienda de productos' }
const hay = (t: string, conocidos: string[] = [], rubro = '') => hallarAfirmaciones(t, conocidos, { lexico: lexicoDelCliente(INDUSTRIA[rubro] ?? rubro, null) }).length > 0

describe('V14 · afirmaciones que necesitan respaldo en cualquier rubro', () => {
  const DEBEN_BLOQUEAR: [string, string][] = [
    ['software', 'Más de 500 usuarios activos'],
    ['hotel', 'Hotel con 20 habitaciones'],
    ['servicios', 'Sin costos ocultos'],
    ['industria', 'Empresa certificada ISO 9001'],
    ['software', 'El software más rápido del mercado'],
    ['clinica', 'Atendemos a más de 3.000 pacientes cada año'],
    ['clinica', 'La clínica con los médicos más experimentados de la ciudad'],
    ['legal', 'Estudio jurídico acreditado por el colegio de abogados'],
    ['gimnasio', 'Gimnasio con 4 salas de entrenamiento'],
    ['inmobiliaria', 'Contamos con 120 propiedades en venta'],
    ['educacion', 'Cursos avalados por la universidad'],
    ['servicios', 'Sin letra chica ni comisiones'],
    ['servicios', 'Más barato que la competencia'],
    ['tienda', 'Producto fabricado en Cuenca con materiales propios'],
    ['tienda', 'Recién llegados a la tienda'],
    ['transporte', 'Flota con 35 camiones propios'],
    ['industria', 'Cumplimos la norma ISO 9001'],
    ['transporte', 'Hasta 40 vehículos disponibles'],
    ['servicios', 'Mejor que cualquier otra opción'],
    ['gastro', 'Camarón y pescado de Olón'],
    ['gastro', 'El marisco llega el mismo día'],
  ]
  for (const [rubro, frase] of DEBEN_BLOQUEAR) {
    it(`[${rubro}] marca «${frase}»`, () => expect(hay(frase, [], rubro)).toBe(true))
  }

  const NO_DEBEN_BLOQUEAR: string[] = [
    'Carrusel con 5 láminas sobre el producto',
    '3 posts por semana durante 4 semanas',
    'Historia con 3 pasos para empezar',
    'Reel con 2 ideas de contenido',
    'Visítanos en la sede de Olón',
    'Menú del día',
    'Gracias de parte del equipo',
    'Cómo elegir un buen proveedor',
    'Pregunta de la semana para los seguidores',
    'Sin duda, una buena semana para empezar',
    'Explicamos qué es una auditoría y por qué conviene hacerla',
    'El lunes presentamos las novedades',
  ]
  for (const frase of NO_DEBEN_BLOQUEAR) {
    it(`no marca «${frase}»`, () => expect(hallarAfirmaciones(frase, ['Olón']).map((h) => h.texto)).toEqual([]))
  }

  it('lo que marca dice de qué tipo es (para que el mensaje al agente sea claro)', () => {
    const t = (f: string) => hallarAfirmaciones(f).map((h) => h.subtipo)
    expect(t('Empresa certificada ISO 9001')).toContain('certificacion')
    expect(t('Sin costos ocultos')).toContain('ausencia')
    expect(t('El software más rápido del mercado')).toContain('superlativo')
    expect(t('Hotel con 20 habitaciones')).toContain('cantidad')
  })

  it('el vocabulario propio del cliente sigue siendo dato: se agrega sin publicar', () => {
    expect(hallarAfirmaciones('Hay 12 canchas libres', [], { lexico: { cantidad_unidades: ['canchas'] } }).length).toBeGreaterThan(0)
  })
})
