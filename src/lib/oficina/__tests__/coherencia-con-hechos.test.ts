/**
 * 17-nov · GO de Lenovo · COHERENCIA CON LOS HECHOS (DIAGNOSTICO-CC6 §4 c) · tramo 1 (la pieza) · US$ 0.
 * La vara es dato (migración 202611172000, leída de verdad); el bloque de hechos (o su aviso) llega a la revisión como documento; el rótulo se reconoce por dato.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { AVISO_SIN_BLOQUE, ROTULO_DE_HECHOS, TITULO_DEL_BLOQUE, abreConElRotulo, contextoDeHechos, esDesacuerdoDeHechos, hechosValidos, quedaDesacuerdoDeHechos } from '../hechos-del-negocio'
import { aplicarSalidaDeJefatura, prefijoDeLaBandeja } from '../paso-jefatura'
import { tareaDeRevisionDeFondo } from '../../jefatura/revision/pedidos'
import type { PayloadDeRevision, SalidaDeRevision } from '../../jefatura/revision/contrato'
import type { Estado, Ficha } from '../tipos'
import { jugar, montar } from './mesa-arnes'
import { CLIENTE } from './memoria'

const RAIZ = path.join(__dirname, '..', '..', '..', '..', 'supabase')
const SQL = fs.readFileSync(path.join(RAIZ, 'migrations', '202611172000_jefatura_pieza_coherencia_con_hechos.sql'), 'utf8')
const REV = fs.readFileSync(path.join(RAIZ, 'reversas', '202611172000_jefatura_pieza_coherencia_con_hechos_REVERSA.sql'), 'utf8')
const VARA = /\$h\$([\s\S]*?)\$h\$/.exec(SQL)![1]
const VARA_EN_REVERSA = /\$h\$([\s\S]*?)\$h\$/.exec(REV)![1]

const ficha = (p: Partial<Ficha>): Ficha => ({ id: 'f', origen: 'jefe', donde: 'texto', gravedad: 'bloquea', estado: 'no_tomada', ...p })

describe('la vara es dato de la política pieza', () => {
  it('solo toca la política pieza, aditiva e idempotente, y pide el rótulo exacto en el «que» de una ficha que bloquea', () => {
    expect(SQL).toMatch(/WHERE artifact_type = 'pieza'/)
    expect(SQL).toContain("NOT LIKE '%Coherencia con los hechos:%'")
    expect(SQL).not.toMatch(/DELETE|DROP|INSERT/i)
    expect(VARA).toContain(`«${ROTULO_DE_HECHOS}»`)
    expect(VARA).toContain('"bloquea"')
    expect(VARA).toContain(`«${TITULO_DEL_BLOQUE}»`)
    for (const p of ['nuevo', 'dónde', 'desde cuándo', 'manual', 'plan']) expect(VARA).toContain(p)
  })
  it('genérica y en tuteo: sin nombres de clientes ni sedes, sin voseo', () => {
    expect(VARA).not.toMatch(/Náufrago|Naufrago|Olón|Olon|Guayaquil|Pérez|Perez/i)
    expect(VARA).not.toMatch(/\b(propone|poné|decí|comprobá)\b/)
  })
  it('la reversa quita EXACTAMENTE la frase que agregó (lo demás de la indicación se conserva)', () => {
    expect(VARA_EN_REVERSA).toBe(VARA)
    expect(REV).toContain("replace(indicacion_fondo, ' ' || $h$")
    const antes = 'No repartes trabajo. Promesas sin fuente: algo.'
    expect((antes + ' ' + VARA).replace(' ' + VARA, '')).toBe(antes)
  })
  it('el revisor de fondo recibe la vara y el documento de hechos', () => {
    const politica = { indicacion_fondo: 'Revisas la pieza. ' + VARA, contra_que: [{ clave: 'manual', titulo: 'Manual de marca vigente', funcion: '' }] }
    const t = tareaDeRevisionDeFondo({ politica: politica as never, payload: { contexto: [contextoDeHechos(null)] } as unknown as PayloadDeRevision, tipo: 'pieza' as never, texto: 'Ya llegó.', duenos: [] })
    expect(t.task).toContain('Coherencia con los hechos:')
    expect(t.task).toContain(`### ${TITULO_DEL_BLOQUE}`)
    expect(t.task).toContain(AVISO_SIN_BLOQUE)
  })
})

describe('el bloque de hechos como documento del revisor', () => {
  it('con hechos: una línea por hecho con su dónde, desde cuándo y fuente', () => {
    const c = contextoDeHechos({ hechos: [{ que: 'sede', valor: 'local 2', donde: 'zona norte', desde: '2026-11-09', fuente: 'ficha del cliente' }, { que: 'sede', valor: 'local 1', desde: 'hace 3 años' }] })
    expect(c.titulo).toBe(TITULO_DEL_BLOQUE)
    expect(c.texto).toBe('- sede: local 2 · dónde: zona norte · desde: 2026-11-09 · fuente: ficha del cliente\n- sede: local 1 · desde: hace 3 años')
    expect(c.texto).not.toContain(AVISO_SIN_BLOQUE)
  })
  it('sin bloque, vacío o con hechos a medias: el documento NO se omite y dice que no hay bloque', () => {
    for (const l of [null, { hechos: [] }, { hechos: [{ que: 'sede', valor: '  ' }, { que: '', valor: 'x' }] }, { nada: 1 } as never]) {
      const c = contextoDeHechos(l)
      expect(c.titulo).toBe(TITULO_DEL_BLOQUE)
      expect(c.texto).toBe(AVISO_SIN_BLOQUE)
    }
  })
  it('ilegible: dice el motivo y además el aviso', () => {
    const c = contextoDeHechos({ no_se_pudo_leer: 'tiempo agotado' })
    expect(c.texto).toBe(`(no se pudo leer: tiempo agotado.) ${AVISO_SIN_BLOQUE}`)
  })
  it('hechosValidos limpia espacios y descarta lo que no es objeto', () => {
    expect(hechosValidos({ hechos: [null, 3, { que: ' sede ', valor: ' a\n b ', donde: '' }] })).toEqual([{ que: 'sede', valor: 'a b', donde: null, desde: null, fuente: null }])
    expect(hechosValidos(undefined)).toEqual([])
  })
})

describe('el rótulo se reconoce por dato', () => {
  it('abre con el rótulo sin importar mayúsculas, tildes, comillas o guion; en medio del texto no cuenta', () => {
    for (const s of ['hechos del negocio: la sede', 'Hechos del Negocio: x', '«hechos del negocio: x»', '- HECHOS DEL NEGOCIO: x', '  "hechos del negócio: x']) expect(abreConElRotulo(s)).toBe(true)
    for (const s of ['la pieza contradice hechos del negocio: x', 'hechos: x', '', undefined]) expect(abreConElRotulo(s)).toBe(false)
  })
  it('es desacuerdo de hechos solo si es del jefe, bloquea y está rotulada (en el qué o en el contra qué)', () => {
    expect(esDesacuerdoDeHechos(ficha({ que: 'hechos del negocio: anuncia como nueva una sede antigua' }))).toBe(true)
    expect(esDesacuerdoDeHechos(ficha({ que: 'la sede', contra_que: 'Hechos del negocio: sede desde 2023' }))).toBe(true)
    expect(esDesacuerdoDeHechos(ficha({ que: 'hechos del negocio: x', gravedad: 'sugerencia' }))).toBe(false)
    expect(esDesacuerdoDeHechos(ficha({ que: 'hechos del negocio: x', origen: 'externa' }))).toBe(false)
    expect(esDesacuerdoDeHechos(ficha({ que: 'falta el precio' }))).toBe(false)
  })
  it('queda un desacuerdo de hechos mientras no esté tomada', () => {
    expect(quedaDesacuerdoDeHechos([ficha({ que: 'hechos del negocio: x', estado: 'tomada' })])).toBe(false)
    expect(quedaDesacuerdoDeHechos([ficha({ que: 'hechos del negocio: x', estado: 'abierta' })])).toBe(true)
    expect(quedaDesacuerdoDeHechos([])).toBe(false)
  })
})

describe('de la salida de la jefatura a la bandeja', () => {
  const estado = (): Estado => ({ pasos_ejecutados: 4, fichas: [], artefactos: {}, gasto_usd: 0 }) as unknown as Estado
  const salida = (desacuerdos: string[]): SalidaDeRevision => ({ revision_id: 'r', resultado: 'cerrada', desacuerdos, respuestas: [], marcas: { con_desacuerdo: desacuerdos.length > 0, sin_segunda_mirada: false }, costo_usd: 0 }) as unknown as SalidaDeRevision
  const aBandeja = (desacuerdos: string[]) => {
    const e = estado()
    const res = aplicarSalidaDeJefatura({ familia: 'post', clase: 'post_img' } as never, e, salida(desacuerdos), { reImagen: () => ({ re_imagen: false }) })
    e.fichas = res.fichas ?? []
    e.artefactos = { respuesta_imagen: { version: 1, datos: res.artefacto } } as never
    return { e, prefijo: prefijoDeLaBandeja(e) }
  }
  it('el desacuerdo que llega como «texto: hechos del negocio: …» queda reconocible en la ficha y marca la bandeja', () => {
    const { e, prefijo } = aBandeja(['texto: hechos del negocio: anuncia una llegada a un lugar que existe desde antes (no tomada: x)'])
    expect(e.fichas.some(esDesacuerdoDeHechos)).toBe(true)
    expect(prefijo).toContain('⚠️ DESACUERDO DE HECHOS · ')
  })
  it('un desacuerdo de otra cosa no lleva esa marca', () => {
    expect(aBandeja(['texto: falta el precio']).prefijo).not.toContain('HECHOS')
    expect(aBandeja([]).prefijo).toBe('')
  })
})

describe('punta a punta: la revisión de la pieza recibe el documento de hechos', () => {
  const titulos = (s: { payload: { contexto: Array<{ titulo: string; texto: string }> } }) => s.payload.contexto
  it('sin puerto de hechos: el documento llega con el aviso «no hay bloque» y los de siempre siguen', async () => {
    const { M, a, id } = await montar()
    const sobres: Array<{ payload: { contexto: Array<{ titulo: string; texto: string }> } }> = []
    M.P.jefatura = (async (s: never) => { sobres.push(s); return { estado: 'esperando', revision_id: 'rev-1' } }) as never
    const { ultima } = await jugar(M, id, a)
    expect(ultima.cuerpo.accion).toBe('esperar_jefatura')
    const doc = titulos(sobres[0]).find((c) => c.titulo === TITULO_DEL_BLOQUE)
    expect(doc?.texto).toBe(AVISO_SIN_BLOQUE)
    expect(titulos(sobres[0]).map((c) => c.titulo)).toEqual(expect.arrayContaining(['Manual de marca del cliente', 'El brief de este entregable']))
  })
  it('con puerto: llegan los hechos del cliente del encargo; si el puerto falla, la revisión sigue con el motivo', async () => {
    for (const caso of ['ok', 'falla'] as const) {
      const { M, a, id } = await montar()
      const pedidos: string[] = []
      const sobres: Array<{ payload: { contexto: Array<{ titulo: string; texto: string }> } }> = []
      M.P.hechosDelNegocio = async (c: string) => { pedidos.push(c); if (caso === 'falla') throw new Error('sin conexión'); return { hechos: [{ que: 'apertura', valor: 'cocina nueva', desde: 'lunes 9' }] } }
      M.P.jefatura = (async (s: never) => { sobres.push(s); return { estado: 'esperando', revision_id: 'rev-1' } }) as never
      await jugar(M, id, a)
      expect(pedidos).toEqual([CLIENTE])
      const doc = titulos(sobres[0]).find((c) => c.titulo === TITULO_DEL_BLOQUE)!
      expect(doc.texto).toBe(caso === 'ok' ? '- apertura: cocina nueva · desde: lunes 9' : `(no se pudo leer: sin conexión.) ${AVISO_SIN_BLOQUE}`)
    }
  })
})
