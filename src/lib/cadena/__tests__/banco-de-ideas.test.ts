/**
 * 17-nov · BANCO DE IDEAS editable desde el tablero (GO Lenovo · boceto aprobado por Emilio 06:28 · ADENDA 06:33 «Retirar») · CC1 · US$ 0, sin modelo, sin red.
 * Contrato con CC5 (RESPUESTA-CC5-a-CC1-banco-de-ideas-contrato) y las 4 medidas de CC6 (NOTA-CC6-a-CC1-CC5-banco-de-ideas-lo-que-voy-a-medir).
 * Ideas y filas REALES de la campaña 28de888e de Náufrago (v4 aprobada · SELECT 17-nov): `__fixtures__/banco-naufrago-v4.ts`.
 */
import { describe, expect, it, vi } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'
import { BANCO_NAUFRAGO_V4 } from '../__fixtures__/banco-naufrago-v4'
import type { Campana, ConceptoGuardado } from '../almacen'
import type { Fila } from '../tipos'
import { ACCIONES } from '../acciones'
import { ideaDelBanco, ideasDelTexto, resumenDeLaVersionAnterior, resumenDelBanco, type ConceptoLeido, type IdeaDelBanco } from '../conceptos'
import { conceptoParaElCalendario } from '../mesas'
import { avisoDeLaVueltaPorElTablero, bancoEditar, bancoRetirar, ideaDeReemplazo, lineaDeIdea, lineaSeLeeIgual, LARGO_MAXIMO_DE_CAMPO, PREFIJO_AVISO_DE_REASIGNACION, retirarDelBanco, textoConIdea } from '../banco-de-ideas'

const A = clienteA()
const CAMP = '28de888e-b3f2-4aca-86b3-2c7f7bf6685a'
const AHORA = '2026-11-17T06:40:00Z'
const tablero = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'tablero', workflow_execution_id: 'tablero:banco:2026-11-17T06:40', campana_id: CAMP, version: 4, ...extra })
const idea = (id: string) => BANCO_NAUFRAGO_V4.find((i) => i.id === id)!

/** el texto de la mesa como lo guarda la v4: cada línea de idea aparece en la integración Y en los aportes de los miembros (407 apariciones para 125 ids en la real) */
const TEXTO = [
  '## Gran idea', 'El náufrago que encontró algo mejor que el oro',
  '## Por qué funciona', 'Convierte la llegada en historia.',
  '## Cómo se ve', 'Luz de playa, madera.',
  '## Cómo suena', 'Primera persona, frases cortas.',
  '## Banco de ideas', ...BANCO_NAUFRAGO_V4.map((i) => i.linea),
  '## Ideas de los aportes', ...BANCO_NAUFRAGO_V4.map((i) => i.linea),
].join('\n')

const fila = (id: string, estado: Fila['estado'], idea_ref: string | null, red: string, formato: string, fecha: string) => ({
  campana_id: CAMP, calendario_version: 1, id, tanda: 1, semana: 1, dia_semana: 1, fecha, hora: '09:00', red, formato, pilar: null, tema: null, sede: null,
  requiere_abierto: false, depende_de: [], datos: [], pendientes: [], pieza_fija: null, origen: 'patron' as const, estado, avisos: [], idea_ref, concepto: null,
})

function almacen(o: { banco?: IdeaDelBanco[]; versiones?: Partial<ConceptoGuardado>[] } = {}) {
  const al = new AlmacenMemoria({
    contextos: { [A.clientId]: contextoDe(A) },
    config: { flujos: ['wf-cadena'], estado_cadena: 'ensayo', clientes_ensayo: [A.clientId], nuevo_orden: { clientes: [A.clientId] } },
  })
  al.campanas.push({ id: CAMP, client_id: A.clientId, plan_id: 'plan-1', fecha_inicio: '2026-11-09', fecha_inicio_origen: 'regla', fecha_fin: '2027-02-06', zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: ['olon'], estado: 'calendario', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: false } as unknown as Campana)
  const base = { campana_id: CAMP, brief_devuelto: null, motivo: null, costo_usd: 5.34, plazo_en: null, encargo_id: null, hitl_id: null, nota_de_emilio: null, apunta_a: null, decidido_en: '2026-11-10T14:03:30Z', seco: false }
  const leido = { gran_idea: { nombre: 'El náufrago', frase: 'algo mejor que el oro' }, capitulos: [], banco: structuredClone(o.banco ?? BANCO_NAUFRAGO_V4), banco_parcial: [] }
  al.conceptos.push({ ...base, version: 3, estado: 'lista', aprobacion: 'cambios', texto_md: 'viejo', leido: { banco: [] } } as ConceptoGuardado)
  al.conceptos.push({ ...base, version: 4, estado: 'lista', aprobacion: 'aprobado', texto_md: TEXTO, leido } as ConceptoGuardado)
  for (const v of o.versiones ?? []) al.conceptos.push({ ...base, estado: 'lista', aprobacion: 'aprobado', texto_md: 'otra', leido: { banco: [] }, ...v } as ConceptoGuardado)
  // filas REALES de la campaña (id · estado · idea_ref · red · formato · fecha), SELECT 17-nov
  al.filasGuardadas.push(
    fila('s1-d4-jue_anuncio_fb', 'validada', 'C1-I07', 'facebook', 'anuncio_imagen', '2026-11-12'),
    fila('s1-d6-sab_anuncio_fb', 'validada', 'C1-I21', 'facebook', 'anuncio_imagen', '2026-11-14'),
    fila('s1-d4-jue_foto_olon', 'perdio_su_fecha', 'C1-I03', 'instagram', 'foto', '2026-11-12'),
    fila('s2-d4-jue_foto_olon', 'briefeada', 'C1-I16', 'instagram', 'foto', '2026-11-19'),
    fila('s2-d4-jue_anuncio_fb', 'validada', 'C1-I22', 'facebook', 'anuncio_imagen', '2026-11-19'),
    fila('s3-d4-jue_anuncio_fb', 'validada', 'C2-I05', 'facebook', 'anuncio_imagen', '2026-11-26'),
  )
  return al
}
const v4 = (al: AlmacenMemoria) => al.conceptos.find((c) => c.version === 4)!
const bancoDe = (al: AlmacenMemoria) => (v4(al).leido as unknown as ConceptoLeido).banco
const historialDe = (al: AlmacenMemoria) => (v4(al).leido as Record<string, unknown>).historial_del_banco as Array<Record<string, unknown>>
const filaDe = (al: AlmacenMemoria, id: string) => al.filasGuardadas.find((f) => f.id === id)!

describe('la línea de una idea se rehace desde sus campos (cuidado 1 de CC6)', () => {
  it('las 6 ideas reales con «foto:» salen IGUALES a la línea que escribió la mesa; las 3 que no lo traen se leen igual (ganan « · foto:ninguna» al final)', () => {
    for (const i of BANCO_NAUFRAGO_V4) {
      const l = lineaDeIdea(i)
      if (/· foto:/.test(i.linea)) expect(l).toBe(i.linea)
      expect(lineaSeLeeIgual(i, l)).toBe(true)
    }
    expect(BANCO_NAUFRAGO_V4.filter((i) => !/· foto:/.test(i.linea)).map((i) => i.id)).toEqual(['C1-I22', 'C2-I02', 'C2-I05'])
    expect(lineaDeIdea(idea('C1-I22'))).toBe(`${idea('C1-I22').linea} · foto:ninguna`)
  })
  it('un campo con « · gancho: …» adentro NO se lee igual: se rechaza en vez de guardar otra idea', () => {
    const i = { ...idea('C1-I23'), mensaje: 'desliza · gancho: otro' }
    expect(lineaSeLeeIgual(i, lineaDeIdea(i))).toBe(false)
  })
  it('textoConIdea cambia TODAS las apariciones (integración + aportes) y quita con null', () => {
    const r = textoConIdea(TEXTO, 'C1-I23', '- C1-I23 · instagram · historia · NUEVA · mensaje: m · gancho: g · protagonista: p · serie: S1 · foto:ninguna')
    expect(r.cambiadas).toBe(2)
    expect(ideasDelTexto(r.md).filter((x) => x.id === 'C1-I23').map((x) => x.idea)).toEqual(['NUEVA', 'NUEVA'])
    const q = textoConIdea(TEXTO, 'C1-I23', null)
    expect(q.cambiadas).toBe(2)
    expect(ideasDelTexto(q.md).some((x) => x.id === 'C1-I23')).toBe(false)
    expect(ideasDelTexto(q.md)).toHaveLength(ideasDelTexto(TEXTO).length - 2)
    expect(textoConIdea(TEXTO.split('\n').join('\r\n'), 'C1-I23', null).md).toBe(q.md.split('\n').join('\r\n'))
  })
})

describe('editar · solo el tablero, solo la versión aprobada vigente', () => {
  it('un flujo de la cadena (aunque exista) recibe 403: el banco solo se edita desde el tablero (medida de CC6)', async () => {
    const al = almacen()
    const r = await bancoEditar(al, { ...tablero(), workflow_id: 'wf-cadena', cambios: [{ idea_id: 'C1-I23', campos: { mensaje: 'x' } }] }, AHORA)
    expect(r.status).toBe(403)
    expect(r.cuerpo).toMatchObject({ ok: false, code: 'E-SOLO-TABLERO' })
    expect(bancoDe(al)).toEqual(BANCO_NAUFRAGO_V4)
  })
  it('sin workflow_execution_id: 400 (el tablero deja rastro de cada llamada)', async () => {
    const r = await bancoEditar(almacen(), { ...tablero(), workflow_execution_id: undefined, cambios: [{ idea_id: 'C1-I23', campos: { mensaje: 'x' } }] }, AHORA)
    expect(r.status).toBe(400)
    expect(r.cuerpo).toMatchObject({ ok: false, code: 'E-WORKFLOW-CTX' })
  })
  it('la pantalla vio otra versión: 409 sin escribir, con la vigente; también si la vigente pasó a ser una más nueva', async () => {
    const al = almacen()
    const r = await bancoEditar(al, { ...tablero({ version: 3 }), cambios: [{ idea_id: 'C1-I23', campos: { mensaje: 'x' } }] }, AHORA)
    expect(r.status).toBe(409)
    expect(r.cuerpo).toMatchObject({ ok: false, code: 'E-VERSION-NO-VIGENTE', version_vigente: 4 })
    const al5 = almacen({ versiones: [{ version: 5 }] })
    expect((await bancoEditar(al5, { ...tablero(), cambios: [{ idea_id: 'C1-I23', campos: { mensaje: 'x' } }] }, AHORA)).status).toBe(409)
    expect(bancoDe(al5)).toEqual(BANCO_NAUFRAGO_V4)
  })
  it('sin version: 400', async () => {
    expect((await bancoEditar(almacen(), { ...tablero({ version: undefined }), cambios: [{ idea_id: 'C1-I23', campos: { mensaje: 'x' } }] }, AHORA)).status).toBe(400)
  })
})

describe('editar · en tanda, todo o nada, con historial y el texto de la mesa al día', () => {
  it('edita 2 ideas reales en una tanda: banco, línea, texto de la mesa, historial y respuesta', async () => {
    const al = almacen()
    const r = await bancoEditar(al, { ...tablero({ autor: 'emilio' }), cambios: [
      { idea_id: 'C1-I23', campos: { mensaje: '  el náufrago dejó algo escrito.\n desliza para leerlo.  ' } },
      { idea_id: 'C1-I24', campos: { idea: 'dos frames: «no encontré oro.» — swipe al bowl', gancho: 'el silencio incomoda' } },
    ] }, AHORA)
    expect(r.status).toBe(200)
    expect(r.cuerpo).toMatchObject({ ok: true, version: 4 })
    const b = bancoDe(al)
    const i23 = b.find((i) => i.id === 'C1-I23')!, i24 = b.find((i) => i.id === 'C1-I24')!
    expect(i23.mensaje).toBe('el náufrago dejó algo escrito. desliza para leerlo.')
    expect(i23.linea).toBe(lineaDeIdea(i23))
    expect(i23.linea).toContain('mensaje: el náufrago dejó algo escrito. desliza para leerlo. · gancho: ')
    expect({ ...i23, mensaje: idea('C1-I23').mensaje, linea: idea('C1-I23').linea }).toEqual(idea('C1-I23'))
    expect([i24.idea, i24.gancho, i24.mensaje]).toEqual(['dos frames: «no encontré oro.» — swipe al bowl', 'el silencio incomoda', idea('C1-I24').mensaje])
    // el texto de la mesa: cada aparición de la idea, la línea nueva (la «versión anterior» que recibiría la mesa sale de ahí · medida 2 de CC6)
    const enTexto = ideasDelTexto(v4(al).texto_md!).filter((x) => x.id === 'C1-I23')
    expect(enTexto.map((x) => x.linea)).toEqual([i23.linea, i23.linea])
    expect(resumenDeLaVersionAnterior(v4(al).texto_md!, 4)).toContain('- C1-I24 · instagram · dos frames: «no encontré oro.» — swipe al bowl')
    // historial: una entrada por idea, solo lo que cambió + la línea, quién y cuándo
    const h = historialDe(al)
    expect(h).toHaveLength(2)
    expect(h[0]).toEqual({ accion: 'editar', idea_id: 'C1-I23', version: 4, antes: { mensaje: idea('C1-I23').mensaje, linea: idea('C1-I23').linea }, despues: { mensaje: i23.mensaje, linea: i23.linea }, quien: 'emilio', cuando: AHORA })
    expect(Object.keys(h[1].antes as object).sort()).toEqual(['gancho', 'idea', 'linea'])
    expect(r.cuerpo.historial).toEqual(h)
    expect(r.cuerpo.ideas).toEqual([i23, i24])
  })
  it('lo que leen el calendario y la hoja es lo editado (ningún lector cambia)', async () => {
    const al = almacen()
    await bancoEditar(al, { ...tablero(), cambios: [{ idea_id: 'C1-I23', campos: { mensaje: 'nuevo mensaje' } }] }, AHORA)
    const c = await conceptoParaElCalendario(al, { id: CAMP, client_id: A.clientId })
    expect(c.version).toBe(4)
    expect(ideaDelBanco(c.concepto!, 'C1-I23')?.mensaje).toBe('nuevo mensaje')
  })
  it('todo o nada: si una idea de la tanda no existe, 404 y NO se escribe ninguna', async () => {
    const al = almacen()
    const antes = structuredClone(v4(al))
    const r = await bancoEditar(al, { ...tablero(), cambios: [{ idea_id: 'C1-I23', campos: { mensaje: 'x' } }, { idea_id: 'C9-I99', campos: { mensaje: 'y' } }] }, AHORA)
    expect(r.status).toBe(404)
    expect(r.cuerpo).toMatchObject({ ok: false, code: 'E-IDEA-NO-EXISTE', idea_id: 'C9-I99' })
    expect(v4(al)).toEqual(antes)
  })
  it.each([
    ['red (no se edita en esta entrega)', { red: 'facebook' }, 'E-CAMPO-NO-EDITABLE'],
    ['vacío', { mensaje: '   ' }, 'E-CAMPO-VACIO'],
    ['más de 2000 caracteres', { idea: 'a'.repeat(LARGO_MAXIMO_DE_CAMPO + 1) }, 'E-CAMPO-LARGO'],
    ['« · gancho:» adentro', { mensaje: 'desliza · gancho: otro' }, 'E-CAMPO-INVALIDO'],
    ['un número', { mensaje: 7 }, 'E-CAMPO-VACIO'],
  ])('campo %s: 400 sin escribir', async (_, campos, code) => {
    const al = almacen()
    const antes = structuredClone(v4(al))
    const r = await bancoEditar(al, { ...tablero(), cambios: [{ idea_id: 'C1-I23', campos }] }, AHORA)
    expect(r.status).toBe(400)
    expect(r.cuerpo).toMatchObject({ ok: false, code })
    expect(v4(al)).toEqual(antes)
  })
  it('exactamente 2000 caracteres sí entra', async () => {
    const r = await bancoEditar(almacen(), { ...tablero(), cambios: [{ idea_id: 'C1-I23', campos: { idea: 'a'.repeat(LARGO_MAXIMO_DE_CAMPO) } }] }, AHORA)
    expect(r.status).toBe(200)
  })
  it('la misma idea dos veces en la tanda: 400', async () => {
    const r = await bancoEditar(almacen(), { ...tablero(), cambios: [{ idea_id: 'C1-I23', campos: { mensaje: 'a' } }, { idea_id: 'C1-I23', campos: { gancho: 'b' } }] }, AHORA)
    expect(r.cuerpo).toMatchObject({ code: 'E-IDEA-REPETIDA' })
  })
  it('sin cambios reales (mismo texto): 200 sin escribir ni historial', async () => {
    const al = almacen()
    const antes = structuredClone(v4(al))
    const r = await bancoEditar(al, { ...tablero(), cambios: [{ idea_id: 'C1-I23', campos: { mensaje: idea('C1-I23').mensaje } }] }, AHORA)
    expect(r.cuerpo).toMatchObject({ ok: true, sin_cambios: true, ideas: [] })
    expect(v4(al)).toEqual(antes)
  })
})

describe('dos «Pedir los cambios» casi juntos no se pisan (medida 3 de CC6)', () => {
  it('en paralelo: los dos quedan, con sus dos entradas de historial; el segundo releyó y volvió a aplicar', async () => {
    const al = almacen()
    const escribir = vi.spyOn(al, 'actualizarConceptoSiSello')
    const [r1, r2] = await Promise.all([
      bancoEditar(al, { ...tablero(), cambios: [{ idea_id: 'C1-I23', campos: { mensaje: 'primero' } }] }, AHORA),
      bancoEditar(al, { ...tablero(), cambios: [{ idea_id: 'C1-I24', campos: { mensaje: 'segundo' } }] }, AHORA),
    ])
    expect([r1.status, r2.status]).toEqual([200, 200])
    expect(escribir).toHaveBeenCalledTimes(3) // 1 + (1 rechazada por sello + 1 reintento): sí hubo carrera
    expect(bancoDe(al).find((i) => i.id === 'C1-I23')!.mensaje).toBe('primero')
    expect(bancoDe(al).find((i) => i.id === 'C1-I24')!.mensaje).toBe('segundo')
    expect(historialDe(al).map((h) => h.idea_id).sort()).toEqual(['C1-I23', 'C1-I24'])
    expect(ideasDelTexto(v4(al).texto_md!).filter((x) => x.mensaje === 'primero' || x.mensaje === 'segundo')).toHaveLength(4)
  })
  it('si el sello cambia en cada intento, se rinde con 409 sin escribir', async () => {
    const al = almacen()
    const antes = structuredClone(v4(al))
    al.actualizarConceptoSiSello = async () => false
    const r = await bancoEditar(al, { ...tablero(), cambios: [{ idea_id: 'C1-I23', campos: { mensaje: 'x' } }] }, AHORA)
    expect(r.cuerpo).toMatchObject({ ok: false, code: 'E-CONCURRENTE' })
    expect(v4(al)).toEqual(antes)
  })
})

describe('retirar · la idea sale del banco y las filas sin brief pasan a otra del mismo capítulo (ADENDA 06:33)', () => {
  it('C1-I07 (real): la fila validada pasa a otra Facebook·foto del capítulo; la idea queda en ideas_retiradas, fuera del texto y con historial', async () => {
    const al = almacen()
    const r = await bancoRetirar(al, tablero({ idea_id: 'C1-I07' }), AHORA)
    expect(r.status).toBe(200)
    // C1-I21 y C1-I22 (las dos Facebook·foto de «desbloquear») tienen 1 uso cada una: desempata el id
    expect(r.cuerpo.reasignadas).toEqual([{ fila_id: 's1-d4-jue_anuncio_fb', idea_vieja: 'C1-I07', idea_nueva: 'C1-I21' }])
    expect(r.cuerpo.con_brief_sin_tocar).toEqual([])
    const f = filaDe(al, 's1-d4-jue_anuncio_fb')
    expect(f.idea_ref).toBe('C1-I21')
    expect(f.concepto).toBeNull()
    expect(f.avisos).toEqual([`${PREFIJO_AVISO_DE_REASIGNACION}la idea «C1-I07» se retiró del banco; la fila realiza ahora «C1-I21» (mismo capítulo)`])
    expect(bancoDe(al).map((i) => i.id)).not.toContain('C1-I07')
    const leido = v4(al).leido as Record<string, unknown>
    expect(leido.ideas_retiradas).toEqual([{ ...idea('C1-I07'), retirada_en: AHORA, retirada_por: 'emilio' }])
    expect(ideasDelTexto(v4(al).texto_md!).some((x) => x.id === 'C1-I07')).toBe(false)
    expect(resumenDelBanco(leido as unknown as ConceptoLeido).total).toBe(BANCO_NAUFRAGO_V4.length - 1)
    expect(historialDe(al)).toEqual([{ accion: 'retirar', idea_id: 'C1-I07', version: 4, antes: idea('C1-I07'), despues: null, quien: 'emilio', cuando: AHORA, reasignadas: r.cuerpo.reasignadas, con_brief_sin_tocar: [], con_brief_reasignadas: [] }])
    // ninguna fila queda apuntando a una idea retirada (medida 4 de CC6)
    const vivas = new Set(bancoDe(al).map((i) => i.id))
    for (const x of al.filasGuardadas.filter((y) => y.idea_ref && ['validada', 'lista_para_brief', 'propuesta', 'esquema', 'en_investigacion'].includes(y.estado))) expect(vivas.has(x.idea_ref!)).toBe(true)
  })
  // 19-nov · firma de Emilio: la fila con brief (sin aprobar) también cambia de idea y su brief se rehace · nuevas pruebas en banco-retirar-con-brief.test.ts
  it('🔴 C1-I16 (real) · 19-nov: desde el tablero, la fila YA briefeada vuelve al brief Y recibe otra idea del capítulo; sigue listada en con_brief_sin_tocar (contrato con el receptor)', async () => {
    const al = almacen()
    const r = await bancoRetirar(al, tablero({ idea_id: 'C1-I16' }), AHORA)
    expect(r.cuerpo).toMatchObject({ ok: true, con_brief_sin_tocar: ['s2-d4-jue_foto_olon'], con_brief_reasignadas: ['s2-d4-jue_foto_olon'] })
    const [re] = r.cuerpo.reasignadas as Array<{ fila_id: string; idea_vieja: string; idea_nueva: string | null }>
    expect(re).toMatchObject({ fila_id: 's2-d4-jue_foto_olon', idea_vieja: 'C1-I16' })
    expect(re.idea_nueva).toMatch(/^C1-I\d{2}$/)
    const f = filaDe(al, 's2-d4-jue_foto_olon')
    expect(f).toMatchObject({ idea_ref: re.idea_nueva, estado: 'lista_para_brief' })
    expect(f.avisos).toEqual([avisoDeLaVueltaPorElTablero('C1-I16'), `${PREFIJO_AVISO_DE_REASIGNACION}la idea «C1-I16» se retiró del banco; la fila realiza ahora «${re.idea_nueva}» (mismo capítulo)`])
  })
  it('C1-I03 (real): la fila que perdió su fecha no se toca ni se lista', async () => {
    const al = almacen()
    const r = await bancoRetirar(al, tablero({ idea_id: 'C1-I03' }), AHORA)
    expect(r.cuerpo).toMatchObject({ reasignadas: [], con_brief_sin_tocar: [] })
    expect(filaDe(al, 's1-d4-jue_foto_olon').idea_ref).toBe('C1-I03')
  })
  it('C2-I05: sin otra Facebook en «cimientos», pasa a la que hay del capítulo (C2-I02); sin ninguna, la fila queda sin idea y con aviso', async () => {
    const al = almacen()
    expect((await bancoRetirar(al, tablero({ idea_id: 'C2-I05' }), AHORA)).cuerpo.reasignadas).toEqual([{ fila_id: 's3-d4-jue_anuncio_fb', idea_vieja: 'C2-I05', idea_nueva: 'C2-I02' }])
    const solo = almacen({ banco: BANCO_NAUFRAGO_V4.filter((i) => i.id !== 'C2-I02') })
    expect((await bancoRetirar(solo, tablero({ idea_id: 'C2-I05' }), AHORA)).cuerpo.reasignadas).toEqual([{ fila_id: 's3-d4-jue_anuncio_fb', idea_vieja: 'C2-I05', idea_nueva: null }])
    expect(filaDe(solo, 's3-d4-jue_anuncio_fb')).toMatchObject({ idea_ref: null, avisos: [`${PREFIJO_AVISO_DE_REASIGNACION}la idea «C2-I05» se retiró del banco y su capítulo no tiene otra: la fila queda sin idea`] })
  })
  it('una idea ya retirada: 409 al retirarla otra vez y al editarla', async () => {
    const al = almacen()
    await bancoRetirar(al, tablero({ idea_id: 'C1-I07' }), AHORA)
    expect((await bancoRetirar(al, tablero({ idea_id: 'C1-I07' }), AHORA)).cuerpo).toMatchObject({ ok: false, code: 'E-IDEA-RETIRADA' })
    expect((await bancoEditar(al, { ...tablero(), cambios: [{ idea_id: 'C1-I07', campos: { mensaje: 'x' } }] }, AHORA)).cuerpo).toMatchObject({ ok: false, code: 'E-IDEA-RETIRADA' })
    expect(historialDe(al)).toHaveLength(1)
  })
  it('si el retiro se cortó con la idea ya fuera pero una fila todavía la cita, repetirlo termina la reasignación', async () => {
    const al = almacen()
    await bancoRetirar(al, tablero({ idea_id: 'C1-I07' }), AHORA)
    filaDe(al, 's1-d4-jue_anuncio_fb').idea_ref = 'C1-I07'
    const r = await bancoRetirar(al, tablero({ idea_id: 'C1-I07' }), AHORA)
    expect(r.cuerpo).toMatchObject({ ok: true, ya_retirada: true, reasignadas: [{ fila_id: 's1-d4-jue_anuncio_fb', idea_vieja: 'C1-I07', idea_nueva: 'C1-I21' }] })
    expect(historialDe(al)).toHaveLength(2)
  })
  it('solo el tablero y solo la vigente, también al retirar', async () => {
    const al = almacen()
    expect((await bancoRetirar(al, { ...tablero({ idea_id: 'C1-I07' }), workflow_id: 'wf-cadena' }, AHORA)).status).toBe(403)
    expect((await bancoRetirar(al, tablero({ idea_id: 'C1-I07', version: 3 }), AHORA)).status).toBe(409)
    expect(filaDe(al, 's1-d4-jue_anuncio_fb').idea_ref).toBe('C1-I07')
    expect(bancoDe(al)).toEqual(BANCO_NAUFRAGO_V4)
  })
})

describe('la idea de reemplazo', () => {
  it('misma red y formato antes que misma red; entre iguales, la menos usada', () => {
    const r = idea('C1-I07')
    const usos = new Map([['C1-I21', 2], ['C1-I22', 1]])
    expect(ideaDeReemplazo(BANCO_NAUFRAGO_V4, r, usos)?.id).toBe('C1-I22')
    const sinFacebook = BANCO_NAUFRAGO_V4.filter((i) => i.red !== 'facebook' || i.id === 'C1-I07')
    expect(ideaDeReemplazo(sinFacebook, r, new Map())?.capitulo).toBe('desbloquear')
    const igRed = ideaDeReemplazo(BANCO_NAUFRAGO_V4, idea('C1-I03'), new Map([['C1-I16', 5]]))
    expect(igRed?.id).toBe('C1-I16') // misma red y formato gana aunque se use más
    expect(ideaDeReemplazo(BANCO_NAUFRAGO_V4, idea('C1-I03'), new Map())?.id).toBe('C1-I16')
    expect(ideaDeReemplazo(BANCO_NAUFRAGO_V4.filter((i) => i.id !== 'C1-I16'), idea('C1-I03'), new Map())?.id).toBe('C1-I23') // misma red (instagram), otro formato
  })
})

describe('los mensajes que lee Emilio no traen códigos de idea (menor de CC6 a #343: el tablero muestra `detalle` tal cual)', () => {
  it('ningún detalle de error nombra un C<x>-I<nn>; el código viaja aparte en idea_id', async () => {
    const al = almacen()
    await bancoRetirar(al, tablero({ idea_id: 'C1-I07' }), AHORA)
    const errores = [
      await bancoEditar(al, { ...tablero(), cambios: [{ idea_id: 'C9-I99', campos: { mensaje: 'x' } }] }, AHORA),
      await bancoEditar(al, { ...tablero(), cambios: [{ idea_id: 'C1-I07', campos: { mensaje: 'x' } }] }, AHORA),
      await bancoEditar(al, { ...tablero(), cambios: [{ idea_id: 'C1-I23', campos: { mensaje: 'a' } }, { idea_id: 'C1-I23', campos: { gancho: 'b' } }] }, AHORA),
      await bancoEditar(al, { ...tablero(), cambios: [{ idea_id: 'C1-I23', campos: { mensaje: '' } }] }, AHORA),
      await bancoEditar(al, { ...tablero(), cambios: [{ idea_id: 'C1-I23', campos: { red: 'x' } }] }, AHORA),
      await bancoEditar(al, { ...tablero(), cambios: [{ idea_id: 'C1-I23', campos: {} }] }, AHORA),
      await bancoEditar(al, { ...tablero(), cambios: [{ idea_id: 'C1-I23', campos: { mensaje: 'a · gancho: b' } }] }, AHORA),
      await bancoRetirar(al, tablero({ idea_id: 'C1-I07' }), AHORA),
      await bancoRetirar(al, tablero({ idea_id: 'C9-I99' }), AHORA),
    ]
    for (const r of errores) {
      expect(r.cuerpo.ok).toBe(false)
      expect(String(r.cuerpo.detalle)).not.toMatch(/C[A-Za-z0-9_]+-I[0-9]{2,}/)
    }
    expect(errores[0].cuerpo.idea_id).toBe('C9-I99')
  })
})

describe('la ruta', () => {
  it('las acciones están en la tabla de la ruta /api/cadena/concepto/banco', () => {
    expect(ACCIONES.banco.editar).toBe(bancoEditar)
    expect(ACCIONES.banco.retirar).toBe(bancoRetirar)
  })
})

describe('19-nov · firma de Emilio: al retirar, las filas CON BRIEF (sin aprobar) también cambian de idea y su brief se rehace', () => {
  const F = 's2-d4-jue_foto_olon'
  it('🔴 «en_oficina» también: vuelve al brief y recibe otra idea del capítulo', async () => {
    const al = almacen()
    filaDe(al, F).estado = 'en_oficina'
    const r = await bancoRetirar(al, tablero({ idea_id: 'C1-I16' }), AHORA)
    expect(r.cuerpo).toMatchObject({ ok: true, con_brief_sin_tocar: [F], con_brief_reasignadas: [F] })
    const f = filaDe(al, F)
    expect(f.estado).toBe('lista_para_brief')
    expect(f.idea_ref).not.toBe('C1-I16')
    expect(bancoDe(al).some((i) => i.id === f.idea_ref)).toBe(true)
  })
  for (const estado of ['aprobada', 'espera_video'] as const) {
    it(`🔴 «${estado}» NO se toca: conserva su idea y su estado, queda listada para el receptor (la aprobada vuelve solo con regla dura)`, async () => {
      const al = almacen()
      filaDe(al, F).estado = estado
      const r = await bancoRetirar(al, tablero({ idea_id: 'C1-I16' }), AHORA)
      expect(r.cuerpo).toMatchObject({ ok: true, reasignadas: [], con_brief_sin_tocar: [F], con_brief_reasignadas: [] })
      expect(filaDe(al, F)).toMatchObject({ estado, idea_ref: 'C1-I16', avisos: [] })
    })
  }
  it('🔴 la idea nueva es del MISMO capítulo, y ninguna fila con brief sin aprobar queda apuntando a la retirada', async () => {
    const al = almacen()
    await bancoRetirar(al, tablero({ idea_id: 'C1-I16' }), AHORA)
    expect(filaDe(al, F).idea_ref!.startsWith('C1-')).toBe(true)
    const vivas = new Set(bancoDe(al).map((i) => i.id))
    for (const x of al.filasGuardadas.filter((y) => y.idea_ref && ['briefeada', 'en_oficina', 'lista_para_brief', 'validada'].includes(y.estado))) expect(vivas.has(x.idea_ref!)).toBe(true)
  })
  it('🔴 la historia del banco guarda qué filas con brief cambiaron de idea', async () => {
    const al = almacen()
    await bancoRetirar(al, tablero({ idea_id: 'C1-I16' }), AHORA)
    expect(historialDe(al).at(-1)).toMatchObject({ accion: 'retirar', idea_id: 'C1-I16', con_brief_sin_tocar: [F], con_brief_reasignadas: [F] })
  })
  it('🟢 corte entre la vuelta y la idea nueva: la fila quedó sin brief con la idea vieja; repetir el retiro la termina (otra idea, sin moverla dos veces)', async () => {
    const al = almacen()
    const real = al.reasignarIdeaDeFila.bind(al)
    let cortes = 1
    al.reasignarIdeaDeFila = async (...a: Parameters<typeof real>) => (cortes-- > 0 ? false : real(...a))
    await bancoRetirar(al, tablero({ idea_id: 'C1-I16' }), AHORA)
    expect(filaDe(al, F)).toMatchObject({ estado: 'lista_para_brief', idea_ref: 'C1-I16' })
    const r = await bancoRetirar(al, tablero({ idea_id: 'C1-I16' }), AHORA)
    expect(r.status).toBe(200)
    const f = filaDe(al, F)
    expect(f.estado).toBe('lista_para_brief')
    expect(f.idea_ref).not.toBe('C1-I16')
    expect(f.avisos.filter((x) => x === avisoDeLaVueltaPorElTablero('C1-I16'))).toHaveLength(1)
  })
  it('🔴 corte ANTES de la vuelta (se cae al escribirla): la fila no cambia; repetir el retiro la devuelve al brief y le da otra idea (la vuelta va primero)', async () => {
    const al = almacen()
    const real = al.reubicarFila.bind(al)
    let cortes = 1
    al.reubicarFila = async (...a: Parameters<typeof real>) => { if (cortes-- > 0) throw new Error('corte'); return real(...a) }
    await expect(bancoRetirar(al, tablero({ idea_id: 'C1-I16' }), AHORA)).rejects.toThrow('corte')
    expect(filaDe(al, F)).toMatchObject({ estado: 'briefeada', idea_ref: 'C1-I16' })
    expect((await bancoRetirar(al, tablero({ idea_id: 'C1-I16' }), AHORA)).status).toBe(200)
    const f = filaDe(al, F)
    expect(f.estado).toBe('lista_para_brief')
    expect(f.idea_ref).not.toBe('C1-I16')
  })
  it('🔴 si la vuelta no se puede escribir (la fila cambió de estado entre medio), NO se le cambia la idea', async () => {
    const al = almacen()
    al.reubicarFila = async () => false
    const r = await bancoRetirar(al, tablero({ idea_id: 'C1-I16' }), AHORA)
    expect(r.cuerpo).toMatchObject({ ok: true, con_brief_sin_tocar: [F], con_brief_reasignadas: [] })
    expect(filaDe(al, F)).toMatchObject({ estado: 'briefeada', idea_ref: 'C1-I16' })
  })
  it('🔴 una fila que TODAVÍA cita la idea y ya lleva su aviso de reasignación se lista UNA sola vez (no se duplica para el receptor)', async () => {
    const al = almacen()
    filaDe(al, F).avisos = [`${PREFIJO_AVISO_DE_REASIGNACION}la idea «C1-I16» se retiró del banco; la fila realiza ahora «C1-I01» (mismo capítulo)`]
    const r = await bancoRetirar(al, tablero({ idea_id: 'C1-I16' }), AHORA)
    expect(r.cuerpo).toMatchObject({ ok: true, con_brief_sin_tocar: [F], con_brief_reasignadas: [F] })
  })
  it('🔴 i2 de CC7 · el rescate por aviso nombra la idea ENTERA: el aviso de «C1-I070» no rescata nada al retirar «C1-I07»', async () => {
    const al = almacen()
    filaDe(al, F).avisos = [`${PREFIJO_AVISO_DE_REASIGNACION}la idea «C1-I070» se retiró del banco; la fila realiza ahora «C1-I16» (mismo capítulo)`]
    const r = await bancoRetirar(al, tablero({ idea_id: 'C1-I07' }), AHORA)
    expect(r.cuerpo).toMatchObject({ ok: true, con_brief_sin_tocar: [], con_brief_reasignadas: [] })
    expect(filaDe(al, F)).toMatchObject({ estado: 'briefeada', idea_ref: 'C1-I16' })
  })
  it('🔴 i7 de CC7 · al repetir un retiro cortado por la corrección, la fila ya reasignada entra en «con_brief_reasignadas» y en la historia', async () => {
    const al = almacen()
    // el corte: la fila con brief ya recibió «C1-I01» y su aviso; el concepto no se escribió (la idea sigue en el banco)
    Object.assign(filaDe(al, F), { idea_ref: 'C1-I01', avisos: [`${PREFIJO_AVISO_DE_REASIGNACION}la idea «C1-I16» se retiró del banco; la fila realiza ahora «C1-I01» (mismo capítulo)`] })
    const r = await retirarDelBanco(al, { campana_id: CAMP, version: 4, autor: 'jefatura' }, 'C1-I16', AHORA)
    expect(r.cuerpo).toMatchObject({ ok: true, con_brief_sin_tocar: [F], con_brief_reasignadas: [F] })
    expect(historialDe(al).at(-1)).toMatchObject({ accion: 'retirar', idea_id: 'C1-I16', con_brief_sin_tocar: [F], con_brief_reasignadas: [F] })
    expect(filaDe(al, F)).toMatchObject({ estado: 'briefeada', idea_ref: 'C1-I01' })
  })
  it('🟢 las filas sin brief siguen como antes (validada pasa a otra idea sin cambiar de estado)', async () => {
    const al = almacen()
    await bancoRetirar(al, tablero({ idea_id: 'C1-I07' }), AHORA)
    expect(filaDe(al, 's1-d4-jue_anuncio_fb')).toMatchObject({ estado: 'validada', idea_ref: 'C1-I21' })
  })
})
