/**
 * CAMBIO 4 · el sentido contra la ficha dentro del paso `jefatura` de la oficina (aplicación + punta a punta con el arnés de la mesa) · US$ 0.
 * Lo que mide CC7: sin ficha nada cambia; con ficha, cada hallazgo va a SU destino; lo de la cadena no vuelve a la mesa, queda guardado y marcado; tope una devolución por fila y destino.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { fichaEnLineas, type FichaDeOferta } from '../../cadena/ficha-de-oferta'
import { abrirEncargo } from '../orquestador'
import { aplicarSalidaDeJefatura, datosDeLaJefatura, llavesYaDevueltas, prefijoDeLaBandeja } from '../paso-jefatura'
import { fichaDeLaHoja, hallazgosDelJefe, TITULO_DE_LA_FICHA } from '../sentido-contra-la-ficha'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import type { SalidaDeRevision } from '../../jefatura/revision/contrato'
import type { Estado } from '../tipos'
import { BRIEF_CARRUSEL, jugar, parteCon } from './mesa-arnes'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'

const FICHA: FichaDeOferta = {
  clave: 'oferta-a', nombre: 'Oferta A',
  que_es: { valor: 'lo que se vende', fuente: 'ficha:1' },
  oferta_y_precio: [{ valor: 'el principal $7,00', fuente: 'manual:precios' }],
  no_se_puede_afirmar: [{ valor: 'que ya atiende en persona', fuente: 'cerebro:dueno · fichas:3', vigente_desde: '2026-10-01' }],
}
const LINEAS = fichaEnLineas(FICHA, '2026-10-14')
const LINEA_NO = LINEAS.find((l) => l.startsWith('NO se puede afirmar'))!
/** el brief de carrusel del arnés con los dos campos que escribe la hoja de la cadena */
const BRIEF_CON_FICHA = BRIEF_CARRUSEL.replace('- PROTAGONISTA:', `- OFERTA: oferta-a\n- FICHA DE LA OFERTA:\n${LINEAS.map((l) => `  - ${l}`).join('\n')}\n- PROTAGONISTA:`)

const estado = (artefactos: Record<string, unknown> = {}): Estado => ({ pasos_ejecutados: 4, fichas: [], artefactos, gasto_usd: 0, vueltas: {} }) as unknown as Estado
const salida = (desacuerdos: string[]): SalidaDeRevision => ({ revision_id: 'r', resultado: 'cerrada', desacuerdos, respuestas: [], marcas: { con_desacuerdo: desacuerdos.length > 0, sin_segunda_mirada: false }, costo_usd: 0 }) as unknown as SalidaDeRevision
const PL = { familia: 'post', clase: 'post_img' } as never
const sentido = (hoja: string, pieza: string, ya: string[] = []) => ({ ficha: fichaDeLaHoja(hoja), textoDeLaPieza: pieza, filaId: 'F-7', encargoId: 'enc-1', yaDevueltas: new Set(ya) })
const aplicar = (desacuerdos: string[], o: { hoja?: string; pieza?: string; ya?: string[]; puede?: boolean } = {}) => {
  const e = estado()
  const res = aplicarSalidaDeJefatura(PL, e, salida(desacuerdos), { reImagen: () => ({ re_imagen: false }), puedeVolverALaMesa: o.puede === false ? undefined : () => true, ...(o.hoja !== undefined ? { sentido: sentido(o.hoja, o.pieza ?? '', o.ya) } : {}) })
  e.fichas = res.fichas ?? []
  e.artefactos = { respuesta_imagen: { version: 1, datos: res.artefacto } } as never
  return { e, res, prefijo: prefijoDeLaBandeja(e), j: datosDeLaJefatura(e)! }
}

describe('sin ficha · todo queda como antes', () => {
  it.each([
    ['la hoja no trae el campo', BRIEF_CARRUSEL],
    ['la campaña no tiene fichas', BRIEF_CARRUSEL.replace('- PROTAGONISTA:', '- OFERTA: oferta-a\n- FICHA DE LA OFERTA: sin fichas de hechos todavía · declarado\n- PROTAGONISTA:')],
    ['esta oferta no tiene ficha', BRIEF_CARRUSEL.replace('- PROTAGONISTA:', '- OFERTA: oferta-b\n- FICHA DE LA OFERTA: sin ficha para «oferta-b» · declarado\n- PROTAGONISTA:')],
  ])('%s: la aplicación es igual a la de antes, incluso con un hallazgo rotulado «calendario»', (_c, hoja) => {
    const d = ['texto: sentido · calendario: no cuadra — ficha: «que ya atiende en persona»', 'texto: falta el llamado']
    for (const puede of [true, false]) {
      const antes = aplicar(d, { puede })
      const ahora = aplicar(d, { hoja, pieza: 'a $99', puede })
      expect(ahora.res).toEqual(antes.res)
      expect(ahora.prefijo).toBe(antes.prefijo)
      expect(ahora.j.sentido).toBeUndefined()
    }
  })
})

describe('con ficha · cada hallazgo a su destino', () => {
  it('sentido · calendario con cita verificada: NO vuelve a la mesa, queda una devolución guardada, bloquea y marca la bandeja', () => {
    const { res, j, prefijo, e } = aplicar([`texto: sentido · calendario: la pieza dice que ya atiende en persona — ficha: «${LINEA_NO}»`], { hoja: BRIEF_CON_FICHA })
    expect((res.artefacto as { vuelve_a_la_mesa?: boolean }).vuelve_a_la_mesa).toBeUndefined()
    expect(j.sentido!.devoluciones).toEqual([{ llave: 'F-7:calendario', fila_id: 'F-7', destino: 'calendario', motivo: 'la pieza dice que ya atiende en persona', linea_de_la_ficha: LINEA_NO, encargo_id: 'enc-1', origen: 'jefe' }])
    expect(e.fichas).toEqual([expect.objectContaining({ origen: 'jefe', gravedad: 'bloquea', estado: 'no_tomada', donde: 'calendario' })])
    expect(prefijo).toContain('⚠️ VUELVE A CALENDARIO · ')
    expect(llavesYaDevueltas(e)).toEqual(new Set(['F-7:calendario']))
  })

  it('sentido · pieza (o lo exacto que es de la pieza): vuelve a la mesa como corrección, sin devolución', () => {
    const { res, j } = aplicar([], { hoja: BRIEF_CON_FICHA, pieza: 'El principal a $9,90' })
    expect((res.artefacto as { vuelve_a_la_mesa?: boolean }).vuelve_a_la_mesa).toBe(true)
    expect((res.artefacto as { aviso_a_la_mesa: string }).aviso_a_la_mesa).toMatch(/sentido · pieza: el precio «\$9,90»/)
    expect(j.sentido!.devoluciones).toEqual([])
  })

  it('el precio vigente no da hallazgo: sin desacuerdos la pieza sigue limpia', () => {
    const { res, j, prefijo } = aplicar([], { hoja: BRIEF_CON_FICHA, pieza: 'El principal a $7' })
    expect(res.fichas).toBeUndefined()
    expect(j.sentido!.hallazgos).toEqual([])
    expect(prefijo).toBe('')
  })

  it('cita que no está en la ficha: va a la pieza, marcada en la bandeja, nunca a la cadena', () => {
    const { j, prefijo } = aplicar(['texto: sentido · banco: no cuadra — ficha: «algo inventado»'], { hoja: BRIEF_CON_FICHA, puede: false })
    expect(j.sentido!.devoluciones).toEqual([])
    expect(prefijo).toContain('⚠️ CITA NO VERIFICADA · ')
    expect(prefijo).not.toContain('VUELVE A')
  })

  it('tope · lo ya devuelto a ese destino va a una persona: no abre otra devolución', () => {
    const { j, e } = aplicar([`texto: sentido · calendario: sigue sin cuadrar — ficha: «${LINEA_NO}»`], { hoja: BRIEF_CON_FICHA, ya: ['F-7:calendario'] })
    expect(j.sentido!.devoluciones).toEqual([])
    expect(j.sentido!.a_humano).toHaveLength(1)
    expect(e.fichas[0].propuesta).toMatch(/ya se devolvió a calendario: decide una persona/)
  })

  it('una revisión fallida no lee el sentido (la pieza sigue como «revisión incompleta», como antes)', () => {
    const e = estado()
    const s = { ...salida([`texto: sentido · calendario: x — ficha: «${LINEA_NO}»`]), resultado: 'fallida' } as SalidaDeRevision
    const res = aplicarSalidaDeJefatura(PL, e, s, { reImagen: () => ({ re_imagen: false }), sentido: sentido(BRIEF_CON_FICHA, '') })
    expect((res.artefacto as { jefatura: { sentido?: unknown } }).jefatura.sentido).toBeUndefined()
  })
})

describe('la vara es dato de la política pieza (migración 202611180010)', () => {
  const RAIZ = path.join(__dirname, '..', '..', '..', '..', 'supabase')
  const SQL = fs.readFileSync(path.join(RAIZ, 'migrations', '202611180010_jefatura_pieza_sentido_contra_la_ficha.sql'), 'utf8')
  const REV = fs.readFileSync(path.join(RAIZ, 'reversas', '202611180010_jefatura_pieza_sentido_contra_la_ficha_REVERSA.sql'), 'utf8')
  const SQL_1122 = fs.readFileSync(path.join(RAIZ, 'migrations', '202611172000_jefatura_pieza_coherencia_con_hechos.sql'), 'utf8')
  const VARA = /\$s\$([\s\S]*?)\$s\$/.exec(SQL)![1]
  const VARA_1122 = /\$h\$([\s\S]*?)\$h\$/.exec(SQL_1122)![1]

  it('solo toca la política pieza, aditiva e idempotente; pide el rótulo, los cuatro destinos, «bloquea» y la cita', () => {
    expect(SQL).toMatch(/WHERE artifact_type = 'pieza'/)
    expect(SQL).toContain("NOT LIKE '%Sentido contra la ficha:%'")
    expect(SQL).not.toMatch(/DELETE|DROP|INSERT/i)
    expect(VARA).toContain(`«${TITULO_DE_LA_FICHA}»`)
    expect(VARA).toContain('«sentido · <destino>:»')
    for (const d of ['pieza', 'hoja', 'calendario', 'banco']) expect(VARA).toContain(`${d} (`)
    expect(VARA).toContain('"bloquea"')
    expect(VARA).toContain('— ficha: «')
    expect(VARA).toMatch(/Si no recibes ese documento, no uses este rótulo/)
  })
  it('agnóstico y en tuteo: ni rubro ni cliente, ni en esta vara ni en la de #1122 ya corregida', () => {
    const corregida = VARA_1122.replace('y la sede o la zona que importan son las correctas.', 'y la oferta o la zona que importan son las correctas.')
    expect(corregida).not.toBe(VARA_1122)
    for (const t of [VARA, corregida, TITULO_DE_LA_FICHA]) {
      expect(t).not.toMatch(/\b(sede|local|plato|restaurante|men[uú])\b/i)
      expect(t).not.toMatch(/Náufrago|Naufrago|Olón|Olon|Guayaquil|Pérez|Perez/i)
      expect(t).not.toMatch(/\b(poné|decí|comprobá|tenés|sabés)\b/)
    }
  })
  it('la reversa quita EXACTAMENTE la frase y devuelve la de #1122 (su reversa sigue encontrando su texto)', () => {
    expect(REV).toContain(`replace(indicacion_fondo, ' ' || $s$${VARA}$s$, '')`)
    expect(REV).toContain("'y la oferta o la zona que importan son las correctas.', 'y la sede o la zona que importan son las correctas.'")
    const antes = 'Revisas la pieza. ' + VARA_1122
    const aplicada = antes.replace('y la sede o la zona que importan son las correctas.', 'y la oferta o la zona que importan son las correctas.') + ' ' + VARA
    const revertida = aplicada.replace(' ' + VARA, '').replace('y la oferta o la zona que importan son las correctas.', 'y la sede o la zona que importan son las correctas.')
    expect(revertida).toBe(antes)
  })
  it('un hallazgo escrito como pide la vara se lee y se verifica', () => {
    const f = fichaDeLaHoja(BRIEF_CON_FICHA)
    const { hallazgos } = hallazgosDelJefe([`texto: sentido · hoja: el dato no cuadra — ficha: «${LINEA_NO}»`], f)
    expect(hallazgos).toEqual([{ destino: 'hoja', origen: 'jefe', que: 'el dato no cuadra', linea_de_la_ficha: LINEA_NO }])
  })
})

describe('punta a punta · la revisión de la pieza recibe la ficha solo si la hay', () => {
  async function montarCon(brief: string) {
    const M = crearMemoria({ parte: parteCon(brief), plantilla: CARRUSEL_MESA })
    M.P.mesa = crearMesaEnMemoria()
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    return { M, a, id: String(a.cuerpo.encargo_id) }
  }
  type Sobre = { payload: { contexto: Array<{ titulo: string; texto: string }> } }

  it('sin ficha: ningún documento «Ficha de la oferta» (el pedido queda como antes)', async () => {
    const { M, a, id } = await montarCon(BRIEF_CARRUSEL)
    const sobres: Sobre[] = []
    M.P.jefatura = (async (s: never) => { sobres.push(s); return { estado: 'esperando', revision_id: 'rev-1' } }) as never
    await jugar(M, id, a)
    expect(sobres[0].payload.contexto.map((c) => c.titulo)).not.toContain(TITULO_DE_LA_FICHA)
  })

  it('con ficha: el documento trae las líneas tal cual; la revisión que cierra con «sentido · calendario» deja la devolución en el encargo', async () => {
    const { M, a, id } = await montarCon(BRIEF_CON_FICHA)
    const sobres: Sobre[] = []
    M.P.jefatura = (async (s: never) => { sobres.push(s); return { estado: 'cerrada', salida: { ...salida([`texto: sentido · calendario: dice que ya atiende en persona — ficha: «${LINEA_NO}»`]), artifact_id: id } } }) as never
    await jugar(M, id, a)
    const doc = sobres[0].payload.contexto.find((c) => c.titulo === TITULO_DE_LA_FICHA)!
    for (const l of LINEAS) expect(doc.texto).toContain(l)
    const enc = await M.P.almacen.leerEncargo(id)
    const j = datosDeLaJefatura(enc!.estado_del_motor)!
    expect(j.sentido!.devoluciones.map((d) => d.llave)).toEqual(['BRF-0100:calendario'])
    expect(enc!.estado_del_motor.fichas.some((f) => f.origen === 'jefe' && f.donde === 'calendario' && f.gravedad === 'bloquea')).toBe(true)
  })
})
