/**
 * Las 3 salidas REALES que mataron las piezas de la tercera prueba (21-oct 20:21–20:22Z, `agent_invocations.output_summary`): eran buenas en contenido y fallaron por la FORMA.
 * Aquí se prueba que, con la limpieza de forma, validan; y que lo que NO se puede arreglar sin cambiar el sentido sigue fallando con el error que dice la medida.
 */
import { describe, expect, it } from 'vitest'
import { DESCARTAR_EYEBROW_LARGO, ESQUEMAS, limpiarForma, procesarSalida, validar } from '../salida'
import { CONTRATOS_LAMINAS } from '../pedidos-laminas'
import { CONTRATOS_EN_TEXTO } from '../pedidos'

const j = (x: unknown) => JSON.stringify(x)
const REGLAS = { obligatorio: [{ id: 'o1', texto: 'El extintor físico aparece como protagonista', claves: ['extintor'], cita: 'extintor' }], prohibido: [{ id: 'p1', texto: 'Sin personas', claves: ['persona'], cita: 'sin personas' }] }

// ── BRF-0002 · 20:21:57Z · `foto_id: ""` en las imágenes que no son fotos (texto literal del curador; las reglas de imagen están acortadas)
const BRF_0002 = j({
  resumen: 'Carrusel Facebook BRF-0002: extintor físico como protagonista visual (etiqueta, manómetro, sello), paleta naranja/negro de Zero Risk, fragmentos nominales cortos en titulares, CTA a WhatsApp.',
  paleta: ['#FF4500 naranja Zero Risk', '#1A1A1A negro', '#FFFFFF blanco'],
  estilo: 'Plano detalle de extintor real en taller o espacio industrial, luz natural o artificial de trabajo, sin personas',
  imagenes: [
    { ref: 'hook', modo: 'generada', foto_id: '', motivo: 'Ninguna foto candidata muestra producto (extintor); se requiere imagen generada de extintor en primer plano' },
    { ref: 'proof', modo: 'generada', foto_id: '', motivo: 'Segunda imagen generada mostrando plano detalle de etiqueta con fecha de vencimiento y sello de inspección' },
    { ref: 'problem', modo: 'ninguna', foto_id: '', motivo: 'Lámina de texto sobre fondo naranja de marca; no requiere imagen' },
    { ref: 'benefit', modo: 'ninguna', foto_id: '', motivo: 'Lámina checklist sobre fondo de marca; no requiere imagen' },
    { ref: 'objection', modo: 'ninguna', foto_id: '', motivo: 'Lámina de texto sobre fondo de marca; no requiere imagen' },
    { ref: 'cta', modo: 'ninguna', foto_id: '', motivo: 'Lámina CTA sobre fondo de marca con botón WhatsApp; no requiere imagen' },
    { ref: 'cierre', modo: 'ninguna', foto_id: '', motivo: 'Lámina de cierre con logo sobre fondo de marca; no requiere imagen' },
  ],
  reglas_de_imagen: REGLAS,
})

// ── BRF-0001 · 20:22:07Z · entradas de `paleta` con descripción (texto literal)
const BRF_0001 = j({
  resumen: 'Carrusel 8 láminas (2 variantes de portada + 6 láminas compartidas) sobre fondo naranja Zero Risk.',
  paleta: ['#FF4500 (naranja Zero Risk — fondo dominante)', '#1A1A1A (negro — texto principal y formas gráficas)', '#FFFFFF (blanco — texto sobre negro y detalles de contraste)'],
  estilo: 'Plano detalle de extintor rojo en ambiente de taller o industria, luz natural lateral.',
  imagenes: [
    { ref: 'hook-A', modo: 'ninguna', motivo: 'Portada variante A: lámina de texto puro sobre fondo naranja. No requiere imagen.' },
    { ref: 'benefit', modo: 'generada', motivo: 'Lámina etiqueta: plano detalle de la etiqueta de un extintor rojo con fecha de recarga visible.' },
  ],
  reglas_de_imagen: REGLAS,
})

// ── BRF-0004 · 20:22:44Z · texto del kit, JSON completo y literal (eyebrow de 26 caracteres)
const BRF_0004 = '```json\n{"elementos":[{"ref":"e01","eyebrow":"¿Tu extintor está vigente?","headline":"¿Sabes cuándo vence tu extintor?","body":"Revisa la etiqueta hoy. Una fecha vencida puede costar multas del Cuerpo de Bomberos.","cta":"Si no estás seguro, escríbenos","acompanamiento":"¿No estás seguro? Escríbenos por WhatsApp y te ayudamos a revisar.","hashtags":["#seguridad industrial","#extintores","#CuerpodeBomberos","#cumplimiento","#zeroriskgye"]},{"ref":"e02","eyebrow":"Ventanilla única","headline":"Extintores, señalética y EPP en un solo mensaje.","body":"Resuelve toda tu seguridad industrial con un solo proveedor. Sin coordinar múltiples empresas.","cta":"Escríbenos","acompanamiento":"Extintores, señalética y EPP — todo en un solo mensaje. Escríbenos.","hashtags":["#seguridadindustrial","#EPP","#señalética","#extintores","#zeroriskgye"]}],"necesito":[]}\n```'

const conLimpieza = { limpiarForma: true as const }

describe('las salidas reales que mataron las piezas', () => {
  it('BRF-0002 · SIN la limpieza falla (control); CON ella valida: los foto_id vacíos se omiten y se anotan', () => {
    const sin = procesarSalida(BRF_0002, 'direccion_imagenes.v1', 0, 1)
    expect(sin).toMatchObject({ ok: false, accion: 'reintentar' })
    if (!sin.ok && sin.accion === 'reintentar') expect(sin.mensaje_de_error).toMatch(/foto_id: texto demasiado corto/)
    const con = procesarSalida(BRF_0002, 'direccion_imagenes.v1', 1, 1, conLimpieza)
    expect(con.ok).toBe(true)
    if (con.ok) {
      const imgs = (con.valor.imagenes as Array<Record<string, unknown>>)
      expect(imgs).toHaveLength(7); expect(imgs.every((i) => !('foto_id' in i))).toBe(true)
      expect(imgs[0]).toMatchObject({ ref: 'hook', modo: 'generada' })
      expect(con.normalizados).toHaveLength(7)
    }
  })
  it('BRF-0001 · la paleta con descripción se queda con el #hex (46 car. → 7) y valida', () => {
    const sin = procesarSalida(BRF_0001, 'direccion_imagenes.v1', 1, 1)
    expect(sin.ok).toBe(false)
    if (!sin.ok && sin.accion === 'falla_visible') expect(sin.errores.join(' ')).toMatch(/paleta\[0\]: texto demasiado largo \(máx\. 40; el tuyo tiene 4\d\)/)
    const con = procesarSalida(BRF_0001, 'direccion_imagenes.v1', 0, 1, conLimpieza)
    expect(con.ok).toBe(true)
    if (con.ok) { expect(con.valor.paleta).toEqual(['#FF4500', '#1A1A1A', '#FFFFFF']); expect(con.normalizados).toHaveLength(3) }
  })
  it('BRF-0004 · el eyebrow de 26 NO se recorta (texto del autor): falla visible con la medida; el reintento se la dice', () => {
    const primero = procesarSalida(BRF_0004, 'copy_kit.v1', 0, 1, conLimpieza)
    expect(primero).toMatchObject({ ok: false, accion: 'reintentar' })
    if (!primero.ok && primero.accion === 'reintentar') expect(primero.mensaje_de_error).toContain('elementos[0].eyebrow: texto demasiado largo (máx. 24; el tuyo tiene 26)')
    const segundo = procesarSalida(BRF_0004, 'copy_kit.v1', 1, 1, conLimpieza)
    expect(segundo).toMatchObject({ ok: false, accion: 'falla_visible' })
  })
  it('BRF-0004 · con el interruptor ENCENDIDO (así quedó el 27-oct) el eyebrow que no cabe se descarta, se anota, y lo demás del autor queda tal cual', () => {
    expect(DESCARTAR_EYEBROW_LARGO).toBe(true)
    const r = procesarSalida(BRF_0004, 'copy_kit.v1', 1, 1, { limpiarForma: { descartarEyebrowLargo: true } })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const els = r.valor.elementos as Array<Record<string, unknown>>
      expect('eyebrow' in els[0]).toBe(false); expect(els[0].headline).toBe('¿Sabes cuándo vence tu extintor?'); expect(els[1].eyebrow).toBe('Ventanilla única')
      expect(r.normalizados?.[0]).toMatch(/elementos\[0\]\.eyebrow: «¿Tu extintor está vigente\?» \(26 > 24\) → se descarta/)
    }
  })
})

describe('la limpieza de forma no inventa ni adivina', () => {
  const esq = ESQUEMAS['direccion_imagenes.v1']
  const base = { resumen: 'x', estilo: 'y', imagenes: [], reglas_de_imagen: REGLAS }
  it('un campo REQUERIDO vacío sigue fallando (no se omite)', () => {
    const v = limpiarForma(esq, { ...base, resumen: '' })
    expect(validar(esq, v).join(' ')).toMatch(/resumen: texto demasiado corto/)
  })
  it('un opcional con texto NO se toca; solo el vacío se omite', () => {
    const v = limpiarForma(esq, { ...base, imagenes: [{ ref: 'a', modo: 'real', foto_id: 'abc', motivo: 'm' }, { ref: 'b', modo: 'real', foto_id: '   ', motivo: 'm' }] }) as { imagenes: Array<Record<string, unknown>> }
    expect(v.imagenes[0].foto_id).toBe('abc'); expect('foto_id' in v.imagenes[1]).toBe(false)
  })
  it('una paleta larga SIN #hex no se arregla (falla visible); con hex corto o de 8 dígitos se respeta', () => {
    const largaSinHex = 'naranja intenso de la marca con descripción larguísima sin código de color alguno'
    expect(validar(esq, limpiarForma(esq, { ...base, paleta: [largaSinHex] })).join(' ')).toMatch(/paleta\[0\]: texto demasiado largo/)
    expect((limpiarForma(esq, { ...base, paleta: ['#abc ' + 'x'.repeat(50)] }) as { paleta: string[] }).paleta).toEqual(['#abc'])
    expect((limpiarForma(esq, { ...base, paleta: ['#FF450080 ' + 'x'.repeat(50)] }) as { paleta: string[] }).paleta).toEqual(['#FF450080'])
  })
  it('una paleta corta no se toca aunque tenga texto (pasa como siempre)', () => {
    expect((limpiarForma(esq, { ...base, paleta: ['#FF4500 naranja'] }) as { paleta: string[] }).paleta).toEqual(['#FF4500 naranja'])
  })
  it('con el interruptor del eyebrow encendido SOLO se descarta el eyebrow opcional: ningún otro campo del autor (body, headline) se toca', () => {
    const el = (extra: Record<string, unknown>) => ({ elementos: [{ ref: 'e01', headline: 'Titular', ...extra }] })
    const esqKit = ESQUEMAS['copy_kit.v1']
    const conBodyLargo = limpiarForma(esqKit, el({ body: 'x'.repeat(300) }), '$', [], { descartarEyebrowLargo: true })
    expect(validar(esqKit, conBodyLargo).join(' ')).toMatch(/body: texto demasiado largo/)
    const conHeadlineLargo = limpiarForma(esqKit, el({ headline: 'y'.repeat(120) }), '$', [], { descartarEyebrowLargo: true })
    expect(validar(esqKit, conHeadlineLargo).join(' ')).toMatch(/headline: texto demasiado largo/)
  })
  it('los contratos que ve el agente dicen lo que el esquema exige: foto_id solo si es real (si no, omitir), paleta en #RRGGBB, eyebrow contado', () => {
    for (const c of [CONTRATOS_LAMINAS['direccion_imagenes.v1'], CONTRATOS_EN_TEXTO['visual_direction.v1']]) {
      expect(c).toContain('OMITE la clave'); expect(c).toContain('"paleta": ["#RRGGBB"]')
    }
    expect(CONTRATOS_LAMINAS['copy_kit.v1']).toContain('caracteres CONTADOS'); expect(CONTRATOS_LAMINAS['laminas.v1']).toContain('caracteres CONTADOS')
  })
  it('sin la opción, procesarSalida se comporta exactamente como antes (la jefatura y los demás no cambian)', () => {
    expect(procesarSalida(BRF_0002, 'direccion_imagenes.v1', 1, 1).ok).toBe(false)
  })
  it('el mensaje de «demasiado largo» dice la medida; el de «demasiado corto» sigue igual', () => {
    expect(validar({ t: 'str', min: 1, max: 5 }, 'abcdefgh')).toEqual(['$: texto demasiado largo (máx. 5; el tuyo tiene 8)'])
    expect(validar({ t: 'str', min: 1, max: 5 }, '')).toEqual(['$: texto demasiado corto (mín. 1)'])
  })
})
