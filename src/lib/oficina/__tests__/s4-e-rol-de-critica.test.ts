/**
 * Sprint 4 · fase 1 · E · EL ROL DE CRÍTICA EN LAS MESAS (GO Lenovo · firma de Emilio 17:01 Zúrich). US$ 0: todo en memoria.
 * Lo que mide CC7 (NOTA sprint4-fase1): agnóstico por código, tres clientes con la MISMA prueba (Náufrago + una tienda online + un servicio profesional),
 * la mesa termina igual con o sin la crítica, la dirección deja escrito qué tomó / cambió / por qué EN LA SALIDA, y si la crítica falla la mesa sigue y lo declara.
 */
import { describe, expect, it } from 'vitest'
import { abrirEncargo, recibirResultado } from '../orquestador'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { criticoDe, especialistasPertinentes, esPertinente } from '../mesa/directorio'
import { siguienteDeLaMesa } from '../mesa/planificador'
import { armarTarea, type ContextoDeTurno } from '../mesa/pedidos'
import { ideasDeLosAportes, textoParaLaCadena } from '../mesa/de-la-cadena'
import { estadoDeLaMesa } from '../mesa/orquestador'
import { MARCA_DE_LA_CRITICA, PREFIJO_DE_LA_CRITICA, conMarcaDeLaCritica, criticaPendiente, estadoDeLaCritica, seccionDeLaCriticaParaLaDireccion, tareaDeLaCritica } from '../mesa/critica'
import { traducirPieza } from '../mesa/traductor'
import { leerCitas, verificarCitas } from '../mesa/libro'
import { traducirPropuestas } from '../video/propuestas'
import { traducirGuion } from '../video/guion'
import type { Aporte, EstadoMesa, Tarjeta, TipoDePieza } from '../mesa/tipos'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { DIRECTORIO, crearMesaEnMemoria } from './mesa-memoria'
import { parteCon, type Turno } from './mesa-arnes'

const CRITICO = 'social-media-strategist'
const DIRECCION = 'creative-director-mesa'
const T = (agente: string, rol: Tarjeta['rol'], pertinente_en: string[], activo = true): Tarjeta => ({ agente, rol, especialidad: `especialidad de ${agente}`, sabe_hacer: [], necesita: [], entrega: [], pertinente_en, activo, version: 1 })
const TARJETA_CRITICA = T(CRITICO, 'miembro', ['carrusel:critica', 'kit:critica', 'post:critica', 'video:critica', 'concepto:critica'])
const DIR: Tarjeta[] = [T(DIRECCION, 'direccion', ['carrusel', 'kit', 'concepto:dirige']), T('content-creator', 'miembro', ['carrusel', 'kit', 'concepto']), T('carousel-designer', 'miembro', ['carrusel']), TARJETA_CRITICA, T('portero', 'portero', [])]
const SIN_CRITICO = DIR.filter((t) => t.agente !== CRITICO)
const est = (o: Partial<EstadoMesa> = {}): EstadoMesa => ({ tipo: 'carrusel', directorio_congelado: DIR, direccion: DIRECCION, turnos: 0, integraciones: 0, devoluciones_por_citas: 0, libro_visto: 0, preguntas_del_traductor: 0, marcas: {}, fase: 'trabajando', cierre_forzado: null, pieza_texto: null, turno_abierto: null, ...o })
let n = 0
const A = (o: Partial<Aporte> & Pick<Aporte, 'de' | 'tipo'>): Aporte => { n++; return { id: `id-${n}`, encargo_id: 'e1', n, para: null, texto: 'texto', refs: [], responde_a: null, profundidad: 0, costo_usd: 0.1, workflow_execution_id: 'x', creado_en: '2026-11-17T00:00:00Z', ...o } }
const ctx = (g = 0.5, tope = 8, o: Record<string, unknown> = {}) => ({ gasto_usd: g, tope_usd: tope, hayImagenGenerada: false, ...o })
/** la dirección abrió y los dos especialistas aportaron: la ronda está lista para la crítica */
const ronda1 = (): Aporte[] => { n = 0; return [A({ de: DIRECCION, tipo: 'dirige' }), A({ de: 'content-creator', tipo: 'aporta' }), A({ de: 'carousel-designer', tipo: 'aporta' })] }
const critica = (texto = 'A2 choca con un hecho: la oferta no se vende en tienda física (manual).') => A({ de: CRITICO, tipo: 'aporta', texto: conMarcaDeLaCritica(texto) })

/** palabras que atan el código a un restaurante o a un local (CC7 · punto 1): no pueden aparecer en lo que escribe el CÓDIGO de la crítica */
const ATADO = /\b(sedes?|locales?|local|platos?|restaurantes?|men[uú]s?|comidas?|cocina|chef|mesero|ceviche|encebollado|n[aá]ufrago)\b/i

describe('E · quién critica lo dice el dato (una tarjeta con `<tipo>:critica`)', () => {
  it('la marca lo hace crítico en ese tipo y lo saca de los aportes obligatorios', () => {
    expect(criticoDe(DIR, 'carrusel')?.agente).toBe(CRITICO)
    expect(criticoDe(DIR, 'concepto')?.agente).toBe(CRITICO)
    expect(criticoDe(DIR, 'brief')).toBeNull()
    expect(esPertinente(TARJETA_CRITICA, 'carrusel', true)).toBe(false)
    expect(especialistasPertinentes(DIR, 'carrusel', true)).toEqual(['content-creator', 'carousel-designer'])
  })
  it('sin la tarjeta (el directorio de hoy), apagada o con otro rol no hay crítico: la mesa es la de siempre', () => {
    expect(criticoDe(DIRECTORIO, 'carrusel')).toBeNull()
    expect(criticoDe(DIR.map((t) => (t.agente === CRITICO ? { ...t, activo: false } : t)), 'carrusel')).toBeNull()
    expect(criticoDe(DIR.map((t) => (t.agente === CRITICO ? { ...t, rol: 'portero' as const } : t)), 'carrusel')).toBeNull()
  })
})

describe('E · el planificador: la crítica va después de los aportes y antes de integrar, una vez por ronda', () => {
  it('ronda con aportes → turno `criticar`; con la crítica escrita → integra la dirección', () => {
    const l = ronda1()
    expect(siguienteDeLaMesa(est(), l, ctx())).toMatchObject({ accion: 'turno', agente: CRITICO, tipo: 'criticar' })
    expect(siguienteDeLaMesa(est(), [...l, critica()], ctx())).toMatchObject({ accion: 'turno', agente: DIRECCION, tipo: 'integrar' })
  })
  it('sin crítico, la misma ronda va directo a integrar (control: la decisión de hoy)', () => {
    expect(siguienteDeLaMesa(est({ directorio_congelado: SIN_CRITICO }), ronda1(), ctx())).toMatchObject({ accion: 'turno', agente: DIRECCION, tipo: 'integrar' })
  })
  it('antes de que aporten los especialistas no hay crítica: primero se convoca a quien falta', () => {
    n = 0
    const l = [A({ de: DIRECCION, tipo: 'dirige' }), A({ de: 'content-creator', tipo: 'aporta' })]
    expect(siguienteDeLaMesa(est(), l, ctx())).toMatchObject({ agente: 'carousel-designer', tipo: 'aportar' })
  })
  it('una crítica de una ronda ANTERIOR no cuenta: la ronda 2 de la mesa de la gran idea se critica otra vez', () => {
    n = 0
    const l = [A({ de: DIRECCION, tipo: 'dirige' }), A({ de: 'content-creator', tipo: 'aporta' }), critica(), A({ de: DIRECCION, tipo: 'integra', texto: '## Gran idea\nX · y\n## Citas\nA2 usé: el camino uno' }), A({ de: 'content-creator', tipo: 'aporta' })]
    const e = est({ tipo: 'concepto' })
    expect(siguienteDeLaMesa(e, l, ctx(0.5, 8, { rondas_minimas: 2 }))).toMatchObject({ agente: CRITICO, tipo: 'criticar' })
    expect(siguienteDeLaMesa(e, [...l, critica()], ctx(0.5, 8, { rondas_minimas: 2 }))).toMatchObject({ agente: DIRECCION, tipo: 'integrar' })
  })
  it('la devolución de citas no abre otra crítica (no hay aportes nuevos que criticar)', () => {
    const l = [...ronda1(), critica(), A({ de: DIRECCION, tipo: 'integra', texto: '## Lámina 1\nTítulo: x\n## Citas\nA2 usé: algo con motivo' })]
    expect(criticaPendiente(est(), l, false)).toBeNull()
  })
  it('NO es un freno: tras 3 turnos muertos de la crítica, la dirección integra igual', () => {
    const l = [...ronda1(), A({ de: CRITICO, tipo: 'nota', texto: 'turno_fallido: x' }), A({ de: CRITICO, tipo: 'nota', texto: 'turno_fallido: x' })]
    expect(siguienteDeLaMesa(est(), l, ctx())).toMatchObject({ agente: CRITICO, tipo: 'criticar' })
    const tres = [...l, A({ de: CRITICO, tipo: 'nota', texto: 'turno_fallido: x' })]
    expect(siguienteDeLaMesa(est(), tres, ctx())).toMatchObject({ agente: DIRECCION, tipo: 'integrar' })
    expect(estadoDeLaCritica(est(), tres)).toMatchObject({ critico: CRITICO, motivo: expect.stringContaining('falló 3 veces') })
  })
  it('NO es un freno: con la cota agotada la mesa cierra con lo que hay, sin crítica', () => {
    expect(siguienteDeLaMesa(est({ turnos: 24 }), ronda1(), ctx())).toMatchObject({ agente: DIRECCION, tipo: 'integrar', motivo: expect.stringContaining('cierra con lo que hay') })
    expect(siguienteDeLaMesa(est(), ronda1(), ctx(5, 7))).toMatchObject({ agente: DIRECCION, tipo: 'integrar', motivo: expect.stringContaining('cierra con lo que hay') })
  })
  it('si lo único nuevo es de la dirección (contestó un pedido tras integrar), no hay crítica: no gasta un turno sobre nada del equipo (CC7 · m04)', () => {
    const integrada = [...ronda1(), critica(), A({ de: DIRECCION, tipo: 'integra', texto: '## Citas\nA2 usé: algo con motivo\nA3 usé: otra cosa con motivo' })]
    const l = [...integrada, A({ de: 'content-creator', tipo: 'pide', para: DIRECCION, texto: '¿la lámina 2 lleva foto?' }), A({ de: DIRECCION, tipo: 'responde', texto: 'Sí, la foto propia del cliente.' })]
    expect(criticaPendiente(est(), l, false)).toBeNull()
    expect(siguienteDeLaMesa(est(), l, ctx())).not.toMatchObject({ tipo: 'criticar' })
    // control: si quien escribe después de integrar es del equipo, sí hay crítica
    expect(criticaPendiente(est(), [...integrada, A({ de: 'content-creator', tipo: 'responde', texto: 'Otra propuesta para la lámina 2.' })], false)).toBe(CRITICO)
  })
  it('una tarjeta con `<tipo>` y `<tipo>:critica` a la vez critica y NO aporta: su aporte no se confunde con la crítica (CC7 · observación del encendido)', () => {
    const doble = DIR.map((t) => (t.agente === CRITICO ? { ...t, pertinente_en: ['carrusel', 'carrusel:critica'] } : t))
    expect(especialistasPertinentes(doble, 'carrusel', true)).toEqual(['content-creator', 'carousel-designer'])
    expect(siguienteDeLaMesa(est({ directorio_congelado: doble }), ronda1(), ctx())).toMatchObject({ agente: CRITICO, tipo: 'criticar' })
    // un aporte suyo SIN rótulo no es la crítica de la ronda
    expect(criticaPendiente(est({ directorio_congelado: doble }), [...ronda1(), A({ de: CRITICO, tipo: 'aporta', texto: 'un aporte cualquiera' })], false)).toBe(CRITICO)
  })
  it('la mesa corta (rondas hechas) no abre crítica', () => {
    const l = [...ronda1(), critica(), A({ de: DIRECCION, tipo: 'integra', texto: '## Citas\nA2 usé: algo con motivo' }), A({ de: 'content-creator', tipo: 'responde' })]
    expect(criticaPendiente(est(), l, true)).toBeNull()
  })
  it('la dirección nunca se critica a sí misma: una tarjeta de dirección con la marca no es crítico', () => {
    const dirCritica = SIN_CRITICO.map((t) => (t.agente === DIRECCION ? { ...t, pertinente_en: [...t.pertinente_en, 'carrusel:critica'] } : t))
    expect(criticoDe(dirCritica, 'carrusel')).toBeNull()
    expect(siguienteDeLaMesa(est({ directorio_congelado: dirCritica }), ronda1(), ctx())).toMatchObject({ agente: DIRECCION, tipo: 'integrar' })
  })
})

const C = (tipo: TipoDePieza, plan: string | null = 'PLAN · objetivo: ventas del trimestre · público: compradores nuevos · ruta 1 y ruta 2'): ContextoDeTurno => ({ cliente_nombre: 'Cliente', tipo, brief_id: 'B1', brief_texto: 'brief', manual_texto: 'manual', plan_texto: plan, fotos: [], tope_usd: 8, gasto_usd: 1 })

describe('E · lo que lee la crítica y lo que sabe la dirección', () => {
  it('un solo camino para el plan (CC6 · a): la crítica recibe EXACTAMENTE la misma sección del plan que los demás asientos, en piezas y en la gran idea', () => {
    const l = ronda1()
    const seccion = (t: string) => t.slice(t.indexOf('## 3 · El plan de trabajo'), t.indexOf('## Fotos propias'))
    for (const tipo of ['carrusel', 'concepto'] as const) {
      const e = est({ tipo })
      const deCritica = armarTarea({ tipo: 'criticar', agente: CRITICO, tarjeta: TARJETA_CRITICA, est: e, libro: l, c: C(tipo) })
      const deMiembro = armarTarea({ tipo: 'aportar', agente: 'content-creator', tarjeta: DIR[1], est: e, libro: l, c: C(tipo) })
      expect(seccion(deCritica)).toBe(seccion(deMiembro))
      expect(deCritica).toContain('## Tu turno · CRÍTICA')
    }
    expect(tareaDeLaCritica(CRITICO)).toMatch(/«sin dato» y no lo supongas/)
  })
  it('una crítica de más de 8000 caracteres se recorta DECLARADO, con los dos números (CC7 · m12)', () => {
    const texto = `A2 choca con un hecho. ${'x'.repeat(9000)}COLA-QUE-NO-LLEGA`
    const largo = conMarcaDeLaCritica(texto).length
    const t = armarTarea({ tipo: 'integrar', agente: DIRECCION, tarjeta: DIR[0], est: est(), libro: [...ronda1(), critica(texto)], c: C('carrusel') })
    expect(t).toContain(`[… recortado: 8000 de ${largo} caracteres de la crítica]`)
    expect(t).not.toContain('COLA-QUE-NO-LLEGA')
    // control: la que cabe no lleva aviso
    expect(armarTarea({ tipo: 'integrar', agente: DIRECCION, tarjeta: DIR[0], est: est(), libro: [...ronda1(), critica('corta')], c: C('carrusel') })).not.toContain('recortado:')
  })
  it('la dirección recibe la crítica COMPLETA y el pedido de escribir «Crítica:» en las citas', () => {
    const larga = `A2 choca con un hecho. ${'detalle '.repeat(500)}FIN-DE-LA-CRITICA`
    const l = [...ronda1(), critica(larga)]
    const t = armarTarea({ tipo: 'integrar', agente: DIRECCION, tarjeta: DIR[0], est: est(), libro: l, c: C('carrusel') })
    expect(t).toContain('## La crítica de esta ronda (A4 · social-media-strategist)')
    expect(t).toContain('FIN-DE-LA-CRITICA')
    expect(t).toContain(`«${PREFIJO_DE_LA_CRITICA}»`)
    expect(t).toMatch(/asesora, no aprueba ni rechaza/)
    const dev = armarTarea({ tipo: 'devolver_citas', agente: DIRECCION, tarjeta: DIR[0], est: est(), libro: l, c: C('carrusel'), faltanCitas: 'x' })
    expect(dev).toContain('## La crítica de esta ronda')
  })
  it('si la crítica no llegó, la dirección lo sabe y lo declara', () => {
    const l = [...ronda1(), ...[1, 2, 3].map(() => A({ de: CRITICO, tipo: 'nota', texto: 'turno_fallido: x' }))]
    const t = armarTarea({ tipo: 'integrar', agente: DIRECCION, tarjeta: DIR[0], est: est(), libro: l, c: C('carrusel') })
    expect(t).toMatch(/La crítica no llegó: el turno de social-media-strategist falló 3 veces/)
    expect(t).toContain(`${PREFIJO_DE_LA_CRITICA} no llegó`)
  })
  it('sin crítico en la mesa, la tarea de la dirección es la de siempre', () => {
    const l = ronda1()
    const t = armarTarea({ tipo: 'integrar', agente: DIRECCION, tarjeta: DIR[0], est: est({ directorio_congelado: SIN_CRITICO }), libro: l, c: C('carrusel') })
    expect(t).not.toContain('La crítica de esta ronda')
    expect(seccionDeLaCriticaParaLaDireccion(est({ directorio_congelado: SIN_CRITICO }), l)).toBeNull()
  })
  it('agnóstico: lo que escribe el CÓDIGO de la crítica no nombra rubros, locales ni productos', () => {
    expect(tareaDeLaCritica(CRITICO)).not.toMatch(ATADO)
    expect(MARCA_DE_LA_CRITICA).not.toMatch(ATADO)
    const conAporte = seccionDeLaCriticaParaLaDireccion(est(), [...ronda1(), critica('x')])!.replace(/\[crítica[^\]]*\]\nx/, '')
    expect(conAporte).not.toMatch(ATADO)
    const sin = seccionDeLaCriticaParaLaDireccion(est({ cierre_forzado: 'tope' }), ronda1())!
    expect(sin).toMatch(/La crítica no llegó: la mesa cierra con lo que hay \(tope\)/)
    expect(sin).not.toMatch(ATADO)
  })
})

describe('E · la crítica no se cuela como idea del banco ni como lámina', () => {
  it('las líneas de idea que la crítica cita NO entran al banco de la mesa de concepto', () => {
    n = 0
    const l = [A({ de: DIRECCION, tipo: 'dirige' }), A({ de: 'content-creator', tipo: 'aporta', texto: '- C1-I01 · instagram · carrusel · la idea · mensaje: m · gancho: g · protagonista: p · serie: S1 · foto:ninguna' }),
      critica('- C1-I01 · choca con un hecho: la oferta no está disponible en esa ciudad'), A({ de: DIRECCION, tipo: 'integra', texto: '## Gran idea\nX · y\n## Citas\nA2 usé: la idea uno' })]
    const ideas = ideasDeLosAportes(l, l[3].texto)
    expect(ideas).toEqual(['- C1-I01 · instagram · carrusel · la idea · mensaje: m · gancho: g · protagonista: p · serie: S1 · foto:ninguna'])
    // sin integración, lo que el equipo escribió va a la cadena, pero la crítica no
    expect(textoParaLaCadena(l.slice(0, 3), null)).not.toContain('choca con un hecho')
  })
  it('las líneas «Crítica:» van en «## Citas»: el traductor no las dibuja (mismas láminas que sin ellas)', () => {
    const base = '## Lámina 1 · hook\nTítulo: Uno\nTexto: a\nImagen: ninguna\n## Lámina 2 · cta\nTítulo: Dos\nTexto: b\nLlamado: Escríbenos\nImagen: ninguna\n## Pie\nP\n## Etiquetas\n#a\n## Citas\nA2 usé: el texto del titular'
    const conCritica = `${base}\n${PREFIJO_DE_LA_CRITICA} tomé A4 sobre A2 (la oferta no se vende en tienda física): cambié la lámina 1 porque prometía algo que no existe`
    const a = traducirPieza(base, 'carrusel'), b = traducirPieza(conCritica, 'carrusel')
    expect(b.laminas).toEqual(a.laminas)
    expect(b.avisos).toEqual(a.avisos)
  })
})

describe('E · las líneas «Crítica:» no son citas (CC6 · condición 2) ni contenido en ningún lector (CC7 · 2)', () => {
  const CRIT = [`${PREFIJO_DE_LA_CRITICA} tomé A4 sobre A2: cambié la lámina 1 porque prometía algo que el manual no sostiene`, `${PREFIJO_DE_LA_CRITICA} no tomé lo de A3: es opinión, no un hecho`, `${PREFIJO_DE_LA_CRITICA} no llegó (falló 3 veces)`]
  it('el lector de A<n> no las toma y el chequeo de citas no devuelve por ellas: ni cita mal formada, ni aporte inexistente, ni turno extra', () => {
    const l = [...ronda1(), critica()]
    const base = '## Lámina 1\nTítulo: x\n## Citas\nA2 usé: el texto del titular\nA3 usé: el ritmo de las láminas'
    for (const linea of CRIT) {
      expect(leerCitas(linea)).toEqual([])
      expect(leerCitas(`${base}\n${linea}`)).toEqual(leerCitas(base))
      expect(verificarCitas(`${base}\n${linea}`, l, ['content-creator', 'carousel-designer'])).toEqual(verificarCitas(base, l, ['content-creator', 'carousel-designer']))
      const conIntegra = [...l, A({ de: DIRECCION, tipo: 'integra', texto: `${base}\n${linea}` })]
      expect(siguienteDeLaMesa(est(), conIntegra, ctx())).not.toMatchObject({ tipo: 'devolver_citas' })
    }
  })
  it('control: una cita de verdad mal hecha SÍ devuelve (el chequeo sigue vivo)', () => {
    const l = [...ronda1(), critica(), A({ de: DIRECCION, tipo: 'integra', texto: `## Citas\nA2 usé: el texto del titular\n${CRIT[0]}` })]
    expect(siguienteDeLaMesa(est(), l, ctx())).toMatchObject({ tipo: 'devolver_citas' })
  })
  it('kit: las mismas piezas con o sin las líneas', () => {
    const kit = '## BRF-1 · la oferta del día\nTítulo: La oferta\nTexto: Hoy\n## segunda\nTítulo: Horario\nCTA: Escríbenos\n## Citas\nA2 usé: el texto del titular'
    const o = { refsDelKit: ['BRF-1', 'BRF-2'], tipoPorRef: { 'BRF-1': 'historia' as const, 'BRF-2': 'estado' as const } }
    const a = traducirPieza(kit, 'kit', o), b = traducirPieza(`${kit}\n${CRIT.join('\n')}`, 'kit', o)
    expect(b.laminas).toEqual(a.laminas)
    expect(b.avisos).toEqual(a.avisos)
  })
  it('video: el guion y las propuestas (una o dos) no cambian con las líneas', () => {
    const guion = ['## Plano 1 · 0–3 s', 'Rol: gancho', 'Dice: llega en un día', 'Se ve: la caja sobre la mesa, alguien la abre', 'Producto: sí', '## Plano 2 · 3–8 s', 'Rol: dar prueba', 'Se ve: la mesa de trabajo', 'Producto: no'].join('\n')
    const conCitas = (md: string, extra: string) => `${md}\n## Citas\nA2 usé: el gancho del guionista${extra}`
    const g0 = traducirGuion(conCitas(guion, '')), g1 = traducirGuion(conCitas(guion, `\n${CRIT.join('\n')}`))
    expect(g1.planos).toEqual(g0.planos)
    expect(g1.audio).toEqual(g0.audio)
    expect(g1.segundos).toEqual(g0.segundos)
    for (const md of [`# Propuesta 1 · Uno\n${guion}`, `# Propuesta 1 · Uno\n${guion}\n# Propuesta 2 · Dos\n${guion}`]) {
      const p0 = traducirPropuestas(conCitas(md, ''), { objetivo: 2 }), p1 = traducirPropuestas(conCitas(md, `\n${CRIT.join('\n')}`), { objetivo: 2 })
      expect(p0.ok && p1.ok).toBe(true)
      if (!p0.ok || !p1.ok) return
      expect(p1.resultado.propuestas.map((p) => [p.nombre, p.guion.planos, p.guion.segundos])).toEqual(p0.resultado.propuestas.map((p) => [p.nombre, p.guion.planos, p.guion.segundos]))
      expect(p1.resultado.avisos).toEqual(p0.resultado.avisos)
    }
  })
})

describe('E · la cota cubre a la crítica (CC7 · 4) y los tres «no llegó» (CC7 · 3)', () => {
  it('el turno de crítica cuenta en los turnos y en el gasto como cualquier turno; si es el que agota la cota, la dirección integra igual («cierra con lo que hay»)', () => {
    // por turnos: en el turno 23 de 24 critica; con la crítica hecha (turno 24) la cota se agotó y la dirección integra
    expect(siguienteDeLaMesa(est({ turnos: 23 }), ronda1(), ctx())).toMatchObject({ agente: CRITICO, tipo: 'criticar' })
    expect(siguienteDeLaMesa(est({ turnos: 24 }), [...ronda1(), critica()], ctx())).toMatchObject({ agente: DIRECCION, tipo: 'integrar', motivo: expect.stringContaining('cierra con lo que hay: se usaron los 24 turnos') })
    // por gasto (tope 8 · reserva de un turno 0,6 + lo que sigue 1,7): con 5,6 critica; con la crítica pagada (5,9) la dirección integra, todavía bajo el techo
    expect(siguienteDeLaMesa(est(), ronda1(), ctx(5.6, 8))).toMatchObject({ agente: CRITICO, tipo: 'criticar' })
    expect(siguienteDeLaMesa(est(), [...ronda1(), critica()], ctx(5.9, 8))).toMatchObject({ agente: DIRECCION, tipo: 'integrar', motivo: expect.stringContaining('cierra con lo que hay: el gasto') })
    // con la cota ya agotada antes de la crítica, no hay crítica
    expect(siguienteDeLaMesa(est(), ronda1(), ctx(5.9, 8))).toMatchObject({ agente: DIRECCION, tipo: 'integrar' })
  })
  it('no llegó porque falló · porque no cabe · porque no hay crítico: la dirección integra en los tres; los dos primeros lo dicen', () => {
    const fallo = [...ronda1(), ...[1, 2, 3].map(() => A({ de: CRITICO, tipo: 'nota', texto: 'turno_fallido: x' }))]
    const t1 = armarTarea({ tipo: 'integrar', agente: DIRECCION, tarjeta: DIR[0], est: est(), libro: fallo, c: C('carrusel') })
    expect(t1).toMatch(/La crítica no llegó: el turno de social-media-strategist falló 3 veces/)
    const t2 = armarTarea({ tipo: 'integrar', agente: DIRECCION, tarjeta: DIR[0], est: est({ cierre_forzado: 'tope' }), libro: ronda1(), c: C('carrusel') })
    expect(t2).toMatch(/La crítica no llegó: la mesa cierra con lo que hay/)
    const t3 = armarTarea({ tipo: 'integrar', agente: DIRECCION, tarjeta: DIR[0], est: est({ directorio_congelado: SIN_CRITICO }), libro: ronda1(), c: C('carrusel') })
    expect(t3).not.toMatch(/crítica/i)
  })
})

// ───────────────────────── la mesa de punta a punta, MISMA prueba para tres clientes de rubros distintos (dobles · US$ 0)
interface Cliente { nombre: string; manual: string; brief: string; plan: string; laminas: string }
const lamina = (i: number, rol: string, titulo: string, texto: string) => `## Lámina ${i} · ${rol}\nTítulo: ${titulo}\nTexto: ${texto}\n${rol === 'cta' ? 'Llamado: Escríbenos\n' : ''}Imagen: ninguna`
const CLIENTES: Cliente[] = [
  { nombre: 'Náufrago', manual: 'Voz directa, tuteo. Cevichería con dos locales.', plan: 'Plan: subir pedidos del plato estrella en el trimestre.',
    brief: '### BRF-0100 · Instagram · carrusel\n- QUÉ ES: Carrusel sobre el plato del día\n- MENSAJE (uno): Pídelo hoy.\n- LLAMADO A LA ACCIÓN: Escríbenos\n',
    laminas: [lamina(1, 'hook', 'El plato del día', 'Hoy cambia.'), lamina(2, 'benefit', 'Al momento', 'Fresco.'), lamina(3, 'cta', 'Escríbenos', 'Te esperamos.')].join('\n') },
  { nombre: 'Lumbre Tienda', manual: 'Tienda online de lámparas. Solo envíos a domicilio: no hay tienda física.', plan: 'Plan: vender la lámpara de escritorio a quien trabaja desde casa.',
    brief: '### BRF-0100 · Instagram · carrusel\n- QUÉ ES: Carrusel sobre la lámpara de escritorio\n- MENSAJE (uno): Trabaja con buena luz.\n- LLAMADO A LA ACCIÓN: Escríbenos\n',
    laminas: [lamina(1, 'hook', 'Tu escritorio a oscuras', 'Hay una salida.'), lamina(2, 'benefit', 'Luz regulable', 'Tres tonos.'), lamina(3, 'cta', 'Escríbenos', 'Envío a tu casa.')].join('\n') },
  { nombre: 'Vera Contables', manual: 'Servicio profesional de contabilidad en línea para pequeñas empresas. Atención por videollamada.', plan: 'Plan: conseguir consultas iniciales de dueños de pequeñas empresas.',
    brief: '### BRF-0100 · Instagram · carrusel\n- QUÉ ES: Carrusel sobre la declaración mensual\n- MENSAJE (uno): No te atrases con el fisco.\n- LLAMADO A LA ACCIÓN: Escríbenos\n',
    laminas: [lamina(1, 'hook', '¿Otra vez a última hora?', 'Te pasa cada mes.'), lamina(2, 'benefit', 'Lo llevamos por ti', 'En línea.'), lamina(3, 'cta', 'Escríbenos', 'Primera consulta.')].join('\n') },
]

async function mesaDe(cl: Cliente, directorio: Tarjeta[]) {
  const M = crearMemoria({ parte: parteCon(cl.brief), plantilla: CARRUSEL_MESA, fuentes: { cliente_nombre: cl.nombre, manual_texto: cl.manual }, plan: cl.plan })
  const MS = crearMesaEnMemoria(directorio)
  M.P.mesa = MS
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  return { M, MS, a, id: String(a.cuerpo.encargo_id) }
}
/** la mesa jugada: la crítica responde (o muere), la dirección integra con o sin líneas «Crítica:» */
async function jugarMesa(cl: Cliente, directorio: Tarjeta[], o: { criticaMuere?: boolean } = {}) {
  const { M, MS, a, id } = await mesaDe(cl, directorio)
  let ultima = a
  const turnos: Turno[] = []
  for (let i = 0; i < 40 && ultima.cuerpo.accion === 'esperar'; i++) {
    const t = ultima.cuerpo.turno as { n: number; paso: string; agente: string; pedido?: { task?: string } }
    const tipo = t.paso.split(':')[1] ?? t.paso
    turnos.push({ paso: t.paso, agente: t.agente, tipo, task: t.pedido?.task ?? '', n: t.n })
    const conCritica = turnos.some((x) => x.tipo === 'criticar')
    // la dirección cita lo que de verdad hay en el libro (los números cambian si la crítica murió y dejó notas)
    const CITAS = ['## Citas', ...MS.filas.filter((f) => f.tipo === 'aporta' && f.de !== CRITICO).map((f) => `A${f.n} usé: lo que propuso ${f.de} para la pieza`)].join('\n')
    const res =tipo === 'dirigir' ? { texto: 'Objetivo de la pieza: una consulta. Idea rectora: tres láminas.' }
      : tipo === 'criticar' ? (o.criticaMuere ? { error: 'turno muerto' } : { texto: `A3 choca con un hecho del manual de ${cl.nombre}: revisa la promesa de la lámina 1.` })
      : tipo === 'integrar' || tipo === 'devolver_citas' ? { texto: `${cl.laminas}\n## Pie\nP\n## Etiquetas\n#x\n${CITAS}${conCritica ? `\n${o.criticaMuere ? `${PREFIJO_DE_LA_CRITICA} no llegó (falló)` : `${PREFIJO_DE_LA_CRITICA} tomé A5: cambié la lámina 1 porque prometía algo que el manual no sostiene`}` : ''}` }
      : { texto: `Aporte de ${t.agente} para ${cl.nombre}.` }
    ultima = await recibirResultado(M.P, id, t.n, { ...res, workflow_execution_id: `ex-${t.n}`, costo_usd: 0.05 })
  }
  return { M, MS, id, ultima, turnos }
}

describe.each(CLIENTES)('E · la mesa de punta a punta · $nombre', (cl) => {
  it('con crítico: dirige → aportes → CRÍTICA → integra; la salida lleva «Crítica:» y las láminas son las mismas que sin crítica', async () => {
    const con = await jugarMesa(cl, DIR)
    const sin = await jugarMesa(cl, SIN_CRITICO)
    expect(con.turnos.map((t) => t.tipo)).toEqual(['dirigir', 'aportar', 'aportar', 'criticar', 'integrar'])
    expect(sin.turnos.map((t) => t.tipo)).toEqual(['dirigir', 'aportar', 'aportar', 'integrar'])
    // la crítica entró al tablero rotulada, y la dirección la recibió completa en su tarea
    const fila = con.MS.filas.find((f) => f.de === CRITICO)!
    expect(fila.texto.startsWith(MARCA_DE_LA_CRITICA)).toBe(true)
    expect(con.turnos.at(-1)!.task).toContain(`choca con un hecho del manual de ${cl.nombre}`)
    // la mesa termina igual: mismo cierre y las mismas láminas dibujadas
    expect(con.ultima.cuerpo).toMatchObject({ accion: sin.ultima.cuerpo.accion, estado: sin.ultima.cuerpo.estado })
    expect(con.M.llamadas.renderPedidos[0].slides).toEqual(sin.M.llamadas.renderPedidos[0].slides)
    // lo que la dirección decidió de la crítica queda en la SALIDA de la mesa (la pieza integrada), no solo en el libro
    const mesa = estadoDeLaMesa(con.M.encargos.get(con.id)!.estado_del_motor)!
    expect(mesa.pieza_texto).toContain(`${PREFIJO_DE_LA_CRITICA} tomé A5`)
    // y la jefatura ve la crítica en el tablero
    expect(mesa.tablero_para_la_jefatura).toContain('[crítica')
  })
  it('si la crítica muere 3 veces, la mesa sigue, cierra igual y la dirección lo declara en la salida', async () => {
    const r = await jugarMesa(cl, DIR, { criticaMuere: true })
    const sin = await jugarMesa(cl, SIN_CRITICO)
    expect(r.turnos.map((t) => t.tipo)).toEqual(['dirigir', 'aportar', 'aportar', 'criticar', 'criticar', 'criticar', 'integrar'])
    expect(r.turnos.at(-1)!.task).toMatch(/La crítica no llegó: el turno de social-media-strategist falló 3 veces/)
    expect(r.ultima.cuerpo).toMatchObject({ accion: sin.ultima.cuerpo.accion, estado: sin.ultima.cuerpo.estado })
    expect(r.M.llamadas.renderPedidos[0].slides).toEqual(sin.M.llamadas.renderPedidos[0].slides)
    expect(estadoDeLaMesa(r.M.encargos.get(r.id)!.estado_del_motor)!.pieza_texto).toContain(`${PREFIJO_DE_LA_CRITICA} no llegó`)
  })
})
