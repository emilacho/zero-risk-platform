/**
 * Ronda 68 · el manual limpio POR CÓDIGO: sin nombres internos citados, sin fragmentos, precios del menú = fuente, sin las palabras que el manual prohíbe.
 * Datos REALES de la repetición del tramo 1 (fixtures/repeticion-r68: el manual guardado por el cimiento + el material propio raspado). Código agnóstico: el cliente es solo dato.
 */
import fs from 'node:fs'
import { describe, expect, it } from 'vitest'
import { evaluarHechos, fuentesDeRaspado, recomprobar } from '..'
import { limpiarManual, quitarNombresInternos, repararFragmentos, usaPalabraProhibida, palabrasProhibidasDelManual } from '../limpieza'

const DIR = 'src/lib/manual/__tests__/fixtures/repeticion-r68'
const MANUAL = JSON.parse(fs.readFileSync(`${DIR}/manual-guardado.json`, 'utf8')) as Record<string, any>
const { propios, filas } = JSON.parse(fs.readFileSync(`${DIR}/filas-propias.json`, 'utf8'))
const fuentes = fuentesDeRaspado(filas, propios)
const todoElTexto = (m: unknown) => JSON.stringify(m)
const IDENT = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+\b/

describe('1 · nombres internos citados como fuente', () => {
  it('rojo de hoy: el manual guardado trae (discovery_summary) ×2 en positioning y (icp_signals) ×N en icp_summary', () => {
    expect((MANUAL.positioning.match(/\(discovery_summary\)/g) ?? []).length).toBe(2)
    expect((MANUAL.icp_summary.match(/\(icp_signals\)/g) ?? []).length).toBeGreaterThanOrEqual(10)
  })
  it('verde: la limpieza los quita de la prosa de TODO el manual (queda en el registro interno)', () => {
    const r = limpiarManual(MANUAL)
    const prosa = { ...r.manual }; delete prosa._field_meta; delete prosa._build; delete prosa._sacar
    expect(todoElTexto({ ...prosa, visual: undefined })).not.toMatch(/discovery_summary|icp_signals|client_icp_documents/)
    expect(r.quitados.filter((q) => q.motivo === 'nombre_interno_citado').length).toBeGreaterThan(5)
    // la oración que citaba sigue entera: solo se fue la etiqueta
    expect(r.manual.icp_summary).toContain('«Pocas opciones de delivery confiable entre semana cuando muchos restaurantes cierran»')
  })
  it('por FORMA, no por lista: cualquier identificador_con_guion_bajo o «ICP <campo>» entre paréntesis o corchetes sale; lo demás se queda', () => {
    expect(quitarNombresInternos('Pedimos poco (otro_campo_x) y rápido [responde a pain point S4; fuente_interna].').texto).toBe('Pedimos poco y rápido.')
    expect(quitarNombresInternos('El dato (ICP goals S2: «sin esperas») importa.').texto).toBe('El dato importa.')
    expect(quitarNombresInternos('Abrimos jueves a lunes (cierra mar–mié) en la playa.').texto).toBe('Abrimos jueves a lunes (cierra mar–mié) en la playa.')
    expect(quitarNombresInternos('Escríbenos a @mi_cuenta_x o en https://sitio.test/a_b_c').texto).toContain('@mi_cuenta_x')
  })
  it('las anotaciones [responde a …] del autor tampoco van en el manual', () => {
    const r = limpiarManual(MANUAL)
    expect(todoElTexto(r.manual.mensajes_clave)).not.toMatch(/responde a/i)
    expect(r.manual.mensajes_clave).toHaveLength(MANUAL.mensajes_clave.length)
  })
})

describe('3 · fragmentos: «oración. (cita), …»', () => {
  it('el positioning real de la repetición ya no empieza con «Según el análisis competitivo del mercado local.»', () => {
    const r = limpiarManual(MANUAL)
    expect(r.manual.positioning).not.toMatch(/^Según el análisis competitivo del mercado local/)
    expect(r.manual.positioning).not.toMatch(/\.\s*,/)
    expect(r.manual.positioning).toMatch(/^El mercado gastronómico de Olón/)
    expect(r.quitados.some((q) => q.motivo === 'fragmento' && /Según el análisis competitivo/.test(q.texto))).toBe(true)
  })
  it('reparador: introducción sin sujeto + continuación con coma sale entera; una oración sana no se toca; las abreviaturas no cortan', () => {
    expect(repararFragmentos('Según el análisis. , lo que le otorga una ventana. Dato sano y completo.').texto).toBe('Dato sano y completo.')
    expect(repararFragmentos('Sirve ceviche. con delivery. Otra frase.').texto).toBe('Sirve ceviche. Otra frase.')
    const sana = 'Cobra menos vs. la competencia, etc. y atiende hoy. Ver naufrago.ec para más.'
    expect(repararFragmentos(sana).texto).toBe(sana)
  })
  it('un valor corto en minúscula («producto», «grafica») NO es un fragmento: la limpieza no vacía los valores de la capa visual', () => {
    expect(repararFragmentos('producto').texto).toBe('producto')
    const m = { visual: { reglas: { capa_que_manda: { foto: 'producto', placa: 'grafica' } } } }
    expect(limpiarManual(m).manual).toEqual(m)
  })
  it('ningún campo del manual limpio queda con un renglón en minúscula inicial ni «. ,»', () => {
    const r = limpiarManual(MANUAL)
    for (const [k, v] of Object.entries(r.manual)) {
      if (k.startsWith('_') || typeof v !== 'string') continue
      for (const linea of v.split('\n')) { expect(linea, k).not.toMatch(/^[a-záéíóúñ]+[\s,]/); expect(linea, k).not.toMatch(/[.!?]\s+[,;]/) }
    }
  })
})

describe('2 · los precios publicados por el cliente son fuente', () => {
  const precios = (t: string) => evaluarHechos({ manual: { m: t }, fuentes }).hechos.filter((h) => h.marcas.includes('cifra'))
  it('los datos estructurados de la carta (MenuItem → offers → price) llegan como fuente propia', () => {
    expect(fuentes.some((f) => f.tipo === 'primaria_propia' && f.rol === 'estructurado' && /precio: 3\.50/.test(f.texto))).toBe(true)
  })
  it('«$3.50–$9» (mínimo y máximo de la carta, con 9 = 9.00) tiene respaldo: no sale sin cita', () => {
    const hs = precios('Comida marina ecuatoriana en Olón a precio accesible ($3.50–$9 por plato).')
    expect(hs.length).toBeGreaterThan(0)
    for (const h of hs) expect(h.estado, h.clausula).toBe('verificado')
  })
  it('una cifra que el cliente NO publica sigue sin respaldo', () => {
    const hs = precios('Cobramos $14.75 por plato.')
    expect(hs.length).toBeGreaterThan(0)
    expect(hs.every((h) => h.estado === 'sin_cita')).toBe(true)
  })
  it('la puerta completa deja los precios del menú en el manual (antes los retiraba)', () => {
    const r = recomprobar({}, { positioning: 'Cocina marina a precio accesible ($3.50–$9 por plato), con servicio a domicilio.', mision: 'Servir comida marina accesible ($3.50–$9) a vecinos y visitantes todos los días.' }, { fuentes })
    expect(r.retirados.filter((x) => x.marca === 'cifra')).toEqual([])
    expect(r.manual.mision).toContain('$3.50–$9')
  })
})

describe('5 · el manual no usa sus propias palabras prohibidas', () => {
  it('rojo: las reglas visuales de la repetición usan «artesanal» y «exclusiva», que el mismo manual prohíbe', () => {
    const reglas = JSON.stringify(MANUAL.visual.reglas)
    expect(reglas).toMatch(/artesanal/); expect(reglas).toMatch(/exclusiva/)
  })
  it('verde: tras la limpieza ninguna parte del manual las usa (el elemento de la regla sale entero y el resto de la lista se queda)', () => {
    const r = limpiarManual(MANUAL)
    const prohibidas = palabrasProhibidasDelManual(r.manual)
    expect(prohibidas).toContain('artesanal')
    expect(usaPalabraProhibida(JSON.stringify((r.manual as Record<string, any>).visual.reglas), prohibidas)).toBeNull()
    expect((r.manual as Record<string, any>).visual.reglas.debe).toHaveLength(MANUAL.visual.reglas.debe.length - 1)
    expect((r.manual as Record<string, any>).visual.reglas.no_debe).toHaveLength(MANUAL.visual.reglas.no_debe.length - 1)
    expect(r.quitados.filter((q) => q.motivo === 'palabra_prohibida_propia').map((q) => q.ruta).every((x) => x.startsWith('visual.reglas'))).toBe(true)
  })
  it('MENCIONARLA no es usarla: entre comillas, o tras «nunca/evita/sin…», o en un texto del cliente citado', () => {
    const p = ['artesanal', 'reserva']
    expect(usaPalabraProhibida('Nunca digas artesanal en un titular.', p)).toBeNull()
    expect(usaPalabraProhibida('Evitar términos como artesanal.', p)).toBeNull()
    expect(usaPalabraProhibida('Dolor: «sin posibilidad de reserva» según el cliente.', p)).toBeNull()
    expect(usaPalabraProhibida('Es una cocina artesanal y cercana.', p)).toBe('artesanal')
    expect(usaPalabraProhibida('Haz tu reserva hoy', p)).toBe('reserva')
  })
  it('la cita del cliente sobre «reserva» en el perfil de cliente ideal NO se toca', () => {
    expect(limpiarManual(MANUAL).manual.icp_summary).toContain('sin posibilidad de reserva')
  })
})

describe('todo junto · la puerta real con el manual guardado de la repetición', () => {
  const r = recomprobar({}, MANUAL, { fuentes })
  it('sin nombres internos, sin fragmentos, sin palabras prohibidas propias y sin tocar lo creativo', () => {
    const t = todoElTexto({ ...r.manual, _field_meta: undefined, visual: (r.manual as Record<string, any>).visual?.reglas })
    expect(t).not.toMatch(/discovery_summary|icp_signals/)
    expect(r.manual.voice_description).toBe(MANUAL.voice_description)
    expect(r.manual.tagline_opciones).toEqual(MANUAL.tagline_opciones)
    expect(r.manual.proposito).toBe(MANUAL.proposito)
  })
  it('todo lo quitado queda SOLO en el registro interno (con su motivo) y el manual no repite el texto quitado', () => {
    expect(r.retirados.length).toBeGreaterThan(8)
    expect(r.retirados.every((x) => x.motivo && x.ruta)).toBe(true)
    expect(JSON.stringify(r.manual)).not.toContain('Según el análisis competitivo del mercado local')
  })
  it('idempotente: pasar el manual limpio otra vez no quita nada más', () => {
    const otra = recomprobar({}, r.manual, { fuentes })
    expect(otra.retirados.filter((x) => ['nombre_interno_citado', 'fragmento', 'palabra_prohibida_propia'].includes(x.marca))).toEqual([])
  })
  it('agnóstico: el módulo no nombra a ningún cliente, ciudad ni rubro', () => {
    const src = fs.readFileSync('src/lib/manual/limpieza.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
    expect(src).not.toMatch(/náufrago|naufrago|olón|guayaquil|ceviche|encebollado|marisco/i)
    void IDENT
  })
})
