/**
 * 10-nov · TRAMO 2 DEL REVISOR DE REGISTRO (GO de Lenovo 17:33Z) · el brief creativo y la gran idea pasan por el revisor de registro de la jefatura antes de cerrarse.
 * Contra el almacén en memoria: sin modelo, sin red, US$ 0. DOS clientes de práctica de rubros distintos en cada criterio:
 *   · A · cafetería de barrio · VOSEO («pedí», «vos sabés» cumplen; «pide», «tú sabes» no);
 *   · B · clínica veterinaria · USTED («pase», «mire» cumplen; «entrá», «mirá» no).
 * La vara de CC7: (1) las citas no se corrigen: una corrección que toca una cita se rechaza con el chequeo de citas (#984) sobre la versión corregida;
 * (2) TODOS los chequeos corren otra vez sobre la versión corregida: si uno se rompe, se queda la anterior con aviso.
 * Nada aquí nombra a un cliente real: los datos son de práctica.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, clienteB, contextoDe, type ClienteFixture } from '../__fixtures__/clientes'
import type { BriefCreativoGuardado, Campana, EntradaDeRegistro, EstrategiaGuardada, ResultadoDeAbrirRegistro } from '../almacen'
import { briefAbrir, cerrarMesasVencidas, conceptoAbrir, EN_REVISION_DE_REGISTRO, HOLGURA_DE_MESA_MIN, recibirBrief, recibirConcepto, recibirVueltaDeRegistro, seguirSinRevisionDeRegistro } from '../mesas'
import { relojDeLaCadena } from '../reloj'
import { artifactIdDeRegistro, leerArtifactIdDeRegistro, leerObjetoDeRegistro, objetoDeRegistro, sobreDeRegistro, textoDeLaVuelta } from '../registro-en-jefatura'
import { TIPO_DE_ESPERA } from '../revision-jefatura'

const AHORA = '2026-10-09T12:00:00Z'
beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-interna' })
const horas = (iso: string, h: number) => new Date(Date.parse(iso) + h * 3_600_000).toISOString()

interface Caso { nombre: string; c: ClienteFixture; registro: 'vos' | 'usted'; tonoMal: string; tonoBien: string; formasMal: string[]; suenaMal: string; suenaBien: string }
const CASOS: Caso[] = [
  { nombre: 'A · cafetería · voseo', c: clienteA(), registro: 'vos', tonoMal: 'Cercano: pide ya, tú sabes.', tonoBien: 'Cercano: pedí ya, vos sabés.', formasMal: ['tú', 'sabes'], suenaMal: 'Voz cercana: pide la mesa, tú eliges.', suenaBien: 'Voz cercana: pedí la mesa, vos elegís.' },
  { nombre: 'B · clínica veterinaria · usted', c: clienteB(), registro: 'usted', tonoMal: 'Cálido: entrá y mirá.', tonoBien: 'Cálido: pase y mire.', formasMal: ['entrá', 'mirá'], suenaMal: 'Voz serena: entrá y mirá a tu mascota.', suenaBien: 'Voz serena: pase y mire a su mascota.' },
]

const campDe = (k: Caso) => `camp-${k.c.clientId}`
const wf = (k: Caso, extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', campana_id: campDe(k), ...extra })
/** la cita LITERAL del plan del cliente (la frase de publicaciones por semana) */
const citaDelPlan = (c: ClienteFixture) => c.planTexto.split(/(?<=\.)\s+/).find((s) => /posts por semana/.test(s))!.replace(/\.$/, '')

function briefDe(k: Caso, tono: string, cambiar: (md: string) => string = (x) => x): string {
  const redes = k.c.estrategia.canales.filter((x) => x.rol !== 'no').map((x) => x.red)
  return cambiar([
    '## De qué parte del plan sale', `Fase 1: «${citaDelPlan(k.c)}».`,
    '## Insight', 'La gente cree que no hay un buen momento para venir de lunes a viernes.',
    '## Mensaje', 'Hay lugar desde temprano.',
    '## Público', 'Vecinos que pasan cerca de lunes a viernes (del plan).', '## Cómo sabremos que funcionó', 'Llegadas por semana contra la meta del plan, revisadas cada lunes.',
    '## Objetivo', 'Que lleguen 30 personas nuevas por semana.', ...redes.map((r) => `- ${r}: que vean el horario · «horario a la vista»`),
    '## Tono', tono,
    '## Obligatorios', '- vocabulario: horario', `- prohibido: ${k.c.forbiddenWords.join('; ')}`, '- lo que no se dice: precios',
    '## Faltantes', '- público: el manual no dice edades',
    '## Contradicciones plan vs manual', '- ninguna',
  ].join('\n'))
}
const conceptoDe = (suena: string) => [
  '## Gran idea  La mesa larga · Noventa días para encontrarse',
  '## Por qué funciona  El insight del brief dice que no hay buen momento; la idea lo vuelve costumbre.',
  '## Cómo se ve  Luz cálida, madera, manos.',
  `## Cómo suena  ${suena}`,
  '## Capítulo f1 · Abrir la puerta', 'Qué cuenta: se abre · Objetivo de la fase (cita): «presentar» · Cómo se ve en este capítulo: planos cerrados',
  '## Banco de ideas',
  '- C1-I01 · instagram · carrusel · la primera visita · mensaje: siempre hay lugar · gancho: ¿quién llegó primero? · protagonista: la puerta · serie: ninguna · foto:ninguna',
  '- C1-I02 · instagram · foto · las siete · mensaje: se llena de a poco · gancho: dos horas en una foto · protagonista: la sala · serie: ninguna · foto:ninguna',
  '- C1-I03 · facebook · foto · la silla libre · mensaje: ninguna silla sobra · gancho: un mes vacía · protagonista: la silla · serie: ninguna · foto:ninguna',
  '## Caminos descartados y por qué', '- «El producto del día»: habla del producto, no del lugar',
].join('\n')

interface Opciones { retiene?: boolean; puerto?: ((e: EntradaDeRegistro) => Promise<ResultadoDeAbrirRegistro>) | null; registro?: 'tu' | 'vos' | 'usted' | 'sin_dato' }
function almacen(k: Caso, o: Opciones = {}) {
  const id = k.c.clientId
  const al = new AlmacenMemoria({
    contextos: { [id]: { ...contextoDe(k.c), registro: o.registro ?? k.registro } },
    planes: { [id]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta', estado_cadena: 'ensayo', clientes_ensayo: [id], nuevo_orden: { clientes: [id] } },
    journeys: [{ journeyId: 'journey-1', clientId: id }],
  })
  const campana: Campana = {
    id: campDe(k), client_id: id, plan_id: 'plan-1', fecha_inicio: k.c.campana.fecha_inicio, fecha_inicio_origen: 'regla', fecha_fin: k.c.campana.fecha_fin, zona_horaria: 'UTC', pais: 'pais-de-practica', sedes: k.c.sedes.map((s) => s.clave),
    estado: 'calendario', estado_motivo: null, presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: false, sala_ref: {}, reemplaza_a: null, seco: true,
  }
  const estrategia: EstrategiaGuardada = { campana_id: campDe(k), version: 1, estado: 'validada', contenido: k.c.estrategia, agente: 'social-media-strategist', modelo: null, costo_usd: 0, workflow_execution_id: 'ex-0', seco: true }
  al.campanas.push(campana)
  al.estrategias.push(estrategia)
  const retiene = o.retiene ?? true
  al.retencion = async (tipo) => ({ retener: retiene && tipo === 'registro', motivo: retiene && tipo === 'registro' ? 'jefatura_activa' : 'tipo_no_activo' })
  al.registro = o.puerto === undefined ? async () => ({ estado: 'esperando', revision_id: 'rev-1' }) : o.puerto
  return al
}
const entrega = (k: Caso, version: number, texto: string | null) => ({ campana_id: campDe(k), version, encargo_id: `enc-${version}`, texto, costo_usd: 0.1, motivo: null })
const brief = (al: AlmacenMemoria, k: Caso, v = 1) => al.briefsCreativos.find((b) => b.campana_id === campDe(k) && b.version === v)!
const concepto = (al: AlmacenMemoria, k: Caso, v = 1) => al.conceptos.find((b) => b.campana_id === campDe(k) && b.version === v)!
const esperaDe = (al: AlmacenMemoria, k: Caso, objeto: string) => al.esperas.find((e) => e.campana_id === campDe(k) && e.objeto_tipo === TIPO_DE_ESPERA && e.objeto_id === objeto)
/** la salida de la jefatura (la forma de `armarSalida`): con `texto`, una versión corregida; sin él, cierre sin versiones */
const salidaDe = (k: Caso, doc: 'brief' | 'concepto', version: number, texto: string | null, extra: Record<string, unknown> = {}) => ({
  revision_id: 'rev-1', artifact_type: 'registro', artifact_id: artifactIdDeRegistro(doc, campDe(k), version), resultado: 'limpia', marcas: {},
  artefacto_final: texto === null ? {} : { texto }, versiones: texto === null ? [] : [{ etiqueta: 'A', paso: 'correccion:documento', texto, largo: texto.length }], ...extra,
})
async function briefEnRevision(al: AlmacenMemoria, k: Caso, tono = k.tonoMal) {
  expect((await briefAbrir(al, wf(k), AHORA)).status).toBe(200)
  expect(await recibirBrief(al, entrega(k, 1, briefDe(k, tono)), AHORA)).toMatchObject({ ok: true, estado: EN_REVISION_DE_REGISTRO })
}
async function conBriefValidado(al: AlmacenMemoria, k: Caso) {
  const b: BriefCreativoGuardado = { campana_id: campDe(k), version: 1, estado: 'validada', texto_md: briefDe(k, k.tonoBien), leido: null, devolucion_texto: null, motivo: null, costo_usd: 0, encargo_id: 'enc-b', seco: true, plazo_en: null }
  al.briefsCreativos.push(b)
}

describe.each(CASOS)('$nombre', (k) => {
  describe('apagado = byte a byte con hoy', () => {
    it('🔴 sin retener `registro`: el registro de «Tono» sigue devolviendo el brief y no sale ningún sobre', async () => {
      const al = almacen(k, { retiene: false })
      await briefAbrir(al, wf(k), AHORA)
      const r = await recibirBrief(al, entrega(k, 1, briefDe(k, k.tonoMal)), AHORA)
      expect(r).toMatchObject({ ok: true, estado: 'devuelta' })
      expect(brief(al, k).devolucion_texto).toMatch(/Tono/)
      expect(al.sobresDeRegistro).toEqual([])
      expect(al.esperas.filter((e) => e.objeto_tipo === TIPO_DE_ESPERA)).toEqual([])
    })
    it('🔴 sin el puerto (almacén que no abre revisiones de registro) o sin registro fijado: igual que hoy', async () => {
      for (const o of [{ puerto: null }, { registro: 'sin_dato' as const }]) {
        const al = almacen(k, o)
        await briefAbrir(al, wf(k), AHORA)
        const r = await recibirBrief(al, entrega(k, 1, briefDe(k, k.tonoMal)), AHORA)
        expect(r.ok && r.estado).toBe(o.registro === 'sin_dato' ? 'validada' : 'devuelta')
        expect(al.sobresDeRegistro).toEqual([])
      }
    })
    it('la gran idea apagada: el registro de «Cómo suena» deja la gran idea sin concepto, como hoy', async () => {
      const al = almacen(k, { retiene: false })
      await conBriefValidado(al, k)
      await conceptoAbrir(al, wf(k), AHORA)
      expect(await recibirConcepto(al, entrega(k, 1, conceptoDe(k.suenaMal)), AHORA)).toMatchObject({ ok: true, estado: 'sin_mesa' })
      expect(al.sobresDeRegistro).toEqual([])
    })
  })

  describe('retiene: el brief espera al revisor', () => {
    it('🔴 el registro pasa a aviso, el brief queda en borrador con su texto, se abre la espera y sale UN sobre de registro', async () => {
      const al = almacen(k)
      await briefEnRevision(al, k)
      const b = brief(al, k)
      expect(b.estado).toBe('borrador')
      expect(b.texto_md).toBe(briefDe(k, k.tonoMal))
      const e = esperaDe(al, k, objetoDeRegistro('brief', 1))
      expect(e?.estado).toBe('viva')
      // la mesa no se da por vencida mientras la jefatura revisa: su plazo es el de la espera más la holgura
      expect(b.plazo_en).toBe(new Date(Date.parse(e!.vence_en) + HOLGURA_DE_MESA_MIN * 60_000).toISOString())
      expect(al.sobresDeRegistro).toHaveLength(1)
      const s = al.sobresDeRegistro[0]
      expect(s).toMatchObject({ artifact_type: 'registro', artifact_id: `registro:brief:${campDe(k)}:v1`, client_id: k.c.clientId, journey_id: null })
      expect(s.payload).toMatchObject({ texto: briefDe(k, k.tonoMal), dry_run: true, version: 1, documento: 'el brief creativo', registro: { trato: k.registro }, productores: [{ donde: '*', agente: 'campaign-brief-agent' }] })
      for (const f of k.formasMal) expect(s.payload.pistas_de_registro).toContain(f)
      expect(s.payload.documentos_de_origen.map((d) => d.titulo)).toEqual(['el plan', 'el manual'])
      expect(s.payload.documentos_de_origen[0].texto).toBe(k.c.planTexto)
    })
    it('🔴 el revisor revisa SIEMPRE que retenga, aunque el detector no vea nada (pistas vacías)', async () => {
      const al = almacen(k)
      await briefEnRevision(al, k, k.tonoBien)
      expect(al.sobresDeRegistro).toHaveLength(1)
      expect(al.sobresDeRegistro[0].payload.pistas_de_registro).toEqual([])
    })
    it('🔴 si OTRO chequeo bloquea (una cita que no está en el plan), se devuelve como hoy y no se abre revisión', async () => {
      const al = almacen(k)
      await briefAbrir(al, wf(k), AHORA)
      const malo = briefDe(k, k.tonoMal, (md) => md.replace(citaDelPlan(k.c), 'esta frase no está en el plan de nadie'))
      expect(await recibirBrief(al, entrega(k, 1, malo), AHORA)).toMatchObject({ ok: true, estado: 'devuelta' })
      expect(al.sobresDeRegistro).toEqual([])
      expect(esperaDe(al, k, objetoDeRegistro('brief', 1))).toBeUndefined()
    })
    it('🔴 una entrega repetida mientras revisa no descarta ni reabre (ni siquiera una entrega vacía)', async () => {
      const al = almacen(k)
      await briefEnRevision(al, k)
      expect(await recibirBrief(al, entrega(k, 1, briefDe(k, k.tonoMal)), AHORA)).toMatchObject({ ok: true, estado: EN_REVISION_DE_REGISTRO })
      expect(await recibirBrief(al, entrega(k, 1, null), AHORA)).toMatchObject({ ok: true, estado: EN_REVISION_DE_REGISTRO })
      expect(brief(al, k).estado).toBe('borrador')
      expect(al.sobresDeRegistro).toHaveLength(1)
    })
    it('🔴 el reloj de las mesas no descarta un brief que está en revisión', async () => {
      const al = almacen(k)
      await briefEnRevision(al, k)
      expect(await cerrarMesasVencidas(al, horas(AHORA, 3))).toEqual([])
      expect(brief(al, k).estado).toBe('borrador')
    })
  })

  describe('la vuelta del revisor', () => {
    it('🔴 con la versión corregida: el brief queda validado con ella, la espera se resuelve y los avisos de la revisión quedan', async () => {
      const al = almacen(k)
      await briefEnRevision(al, k)
      const corregido = briefDe(k, k.tonoBien)
      const r = await recibirVueltaDeRegistro(al, { marcas: {}, salida: salidaDe(k, 'brief', 1, corregido, { avisos: ['«x» está dentro de una cita: el documento de origen usa otro registro (la cita no se corrige)'] }) }, AHORA)
      expect(r.status, JSON.stringify(r.cuerpo)).toBe(200)
      expect(r.cuerpo).toMatchObject({ ok: true, estado: 'validada' })
      const b = brief(al, k)
      expect(b.estado).toBe('validada')
      expect(b.texto_md).toBe(corregido)
      expect((b.leido as { avisos: string[] }).avisos).toContain('«x» está dentro de una cita: el documento de origen usa otro registro (la cita no se corrige)')
      expect(esperaDe(al, k, objetoDeRegistro('brief', 1))?.estado).toBe('resuelta')
    })
    it('🔴 idempotente: la misma vuelta otra vez no toca nada', async () => {
      const al = almacen(k)
      await briefEnRevision(al, k)
      const s = { marcas: {}, salida: salidaDe(k, 'brief', 1, briefDe(k, k.tonoBien)) }
      await recibirVueltaDeRegistro(al, s, AHORA)
      const antes = structuredClone(brief(al, k))
      const r = await recibirVueltaDeRegistro(al, s, AHORA)
      expect(r.cuerpo).toMatchObject({ ok: true, ya_cerrada: true })
      expect(brief(al, k)).toEqual(antes)
    })
    it('🔴 pedido de CC7 · la espera ya NO está viva (terminó por otro camino) y el documento sigue retenido: la vuelta contesta `ya_cerrada` y no toca el brief ni la gran idea', async () => {
      const al = almacen(k)
      await briefEnRevision(al, k)
      esperaDe(al, k, objetoDeRegistro('brief', 1))!.estado = 'cancelada'
      const antesB = structuredClone(brief(al, k))
      expect(antesB.estado).toBe('borrador')
      expect((await recibirVueltaDeRegistro(al, { marcas: {}, salida: salidaDe(k, 'brief', 1, briefDe(k, k.tonoBien)) }, AHORA)).cuerpo).toMatchObject({ ok: true, ya_cerrada: true })
      expect(brief(al, k)).toEqual(antesB)
      expect(al.sobresDeRegistro).toHaveLength(1)
      // la gran idea `abierta` es justo el estado normal mientras espera: una vuelta tardía no la cierra ni la reescribe
      const al2 = almacen(k)
      await conBriefValidado(al2, k)
      await conceptoAbrir(al2, wf(k), AHORA)
      await recibirConcepto(al2, entrega(k, 1, conceptoDe(k.suenaMal)), AHORA)
      esperaDe(al2, k, objetoDeRegistro('concepto', 1))!.estado = 'resuelta'
      const antesC = structuredClone(concepto(al2, k))
      expect(antesC.estado).toBe('abierta')
      expect((await recibirVueltaDeRegistro(al2, { marcas: {}, salida: salidaDe(k, 'concepto', 1, conceptoDe(k.suenaBien)) }, AHORA)).cuerpo).toMatchObject({ ok: true, ya_cerrada: true })
      expect(concepto(al2, k)).toEqual(antesC)
      expect(al2.tarjetas).toEqual([])
    })
    it('🔴 sin versión (cierre sin cambios): se valida el original y lo que el detector aún ve queda como aviso, nunca bloquea', async () => {
      const al = almacen(k)
      await briefEnRevision(al, k)
      await recibirVueltaDeRegistro(al, { marcas: {}, salida: salidaDe(k, 'brief', 1, null) }, AHORA)
      const b = brief(al, k)
      expect(b.estado).toBe('validada')
      expect(b.texto_md).toBe(briefDe(k, k.tonoMal))
      expect((b.leido as { avisos: string[] }).avisos.some((a) => a.startsWith('el detector aún ve formas de otro registro') && k.formasMal.every((f) => a.includes(f)))).toBe(true)
    })
    it('🔴 línea 1 de CC7 · una corrección que toca una frase DENTRO de una cita se rechaza: se queda la versión anterior, con aviso', async () => {
      const al = almacen(k)
      await briefEnRevision(al, k)
      const cita = citaDelPlan(k.c)
      const tocada = briefDe(k, k.tonoBien, (md) => md.replace(cita, cita.replace('por semana', 'cada semana')))
      expect(tocada).not.toBe(briefDe(k, k.tonoBien))
      await recibirVueltaDeRegistro(al, { marcas: {}, salida: salidaDe(k, 'brief', 1, tocada) }, AHORA)
      const b = brief(al, k)
      expect(b.texto_md).toBe(briefDe(k, k.tonoMal))
      expect(b.estado).toBe('validada')
      expect((b.leido as { avisos: string[] }).avisos.some((a) => a.startsWith('la corrección de registro rompía otros chequeos'))).toBe(true)
    })
    it('🔴 línea 2 de CC7 · una corrección que borra una sección obligatoria no se guarda: se queda la versión anterior, con aviso', async () => {
      const al = almacen(k)
      await briefEnRevision(al, k)
      const sinInsight = briefDe(k, k.tonoBien, (md) => md.replace(/## Insight\n[^\n]*\n/, ''))
      expect(sinInsight).not.toContain('## Insight')
      await recibirVueltaDeRegistro(al, { marcas: {}, salida: salidaDe(k, 'brief', 1, sinInsight) }, AHORA)
      const b = brief(al, k)
      expect(b.texto_md).toBe(briefDe(k, k.tonoMal))
      expect(b.texto_md).toContain('## Insight')
      expect((b.leido as { avisos: string[] }).avisos.some((a) => a.startsWith('la corrección de registro rompía otros chequeos'))).toBe(true)
    })
    it('🔴 la ruta deja ella misma el sobre siguiente en la sala (nadie más lo reenvía)', async () => {
      const al = almacen(k)
      await briefEnRevision(al, k)
      const r = await recibirVueltaDeRegistro(al, { marcas: {}, salida: salidaDe(k, 'brief', 1, briefDe(k, k.tonoBien)) }, AHORA)
      const re = r.cuerpo as { siguiente?: { sobre: { etapa?: string } }; empuje?: { resultado: string } }
      expect(re.siguiente).toBeDefined()
      expect(re.empuje?.resultado).toBe('aceptado')
      expect(al.sobresEmitidos).toHaveLength(1)
      // con la clave de medio día del vigía (la sala deduplica)
      expect(JSON.stringify(al.sobresEmitidos[0])).toContain(':2026-10-09pm')
    })
    it('la ruta rechaza lo que no es una vuelta de registro de la cadena', async () => {
      const al = almacen(k)
      expect((await recibirVueltaDeRegistro(al, {}, AHORA)).status).toBe(400)
      expect((await recibirVueltaDeRegistro(al, { salida: { ...salidaDe(k, 'brief', 1, null), artifact_type: 'pieza' } }, AHORA)).status).toBe(400)
      expect((await recibirVueltaDeRegistro(al, { salida: { ...salidaDe(k, 'brief', 1, null), artifact_id: 'otra-cosa' } }, AHORA)).status).toBe(400)
      expect((await recibirVueltaDeRegistro(al, { salida: { ...salidaDe(k, 'brief', 1, null), resultado: undefined } }, AHORA)).status).toBe(400)
    })
  })

  describe('la cadena nunca queda de rehén', () => {
    it('🔴 la jefatura no abre: el brief se valida con las pistas como aviso y la espera se resuelve', async () => {
      const al = almacen(k, { puerto: async () => ({ estado: 'no_abre', motivo: 'tipo_no_activo' }) })
      await briefAbrir(al, wf(k), AHORA)
      expect(await recibirBrief(al, entrega(k, 1, briefDe(k, k.tonoMal)), AHORA)).toMatchObject({ ok: true, estado: 'validada' })
      const av = (brief(al, k).leido as { avisos: string[] }).avisos
      expect(av.some((a) => a.includes('la jefatura no abrió la revisión: tipo_no_activo') && k.formasMal.every((f) => a.includes(f)))).toBe(true)
      expect(esperaDe(al, k, objetoDeRegistro('brief', 1))?.estado).toBe('resuelta')
    })
    it('🔴 el puerto lanza: igual que «no abre» (nunca tumba la entrega)', async () => {
      const al = almacen(k, { puerto: async () => { throw new Error('se cayó la base') } })
      await briefAbrir(al, wf(k), AHORA)
      expect(await recibirBrief(al, entrega(k, 1, briefDe(k, k.tonoMal)), AHORA)).toMatchObject({ ok: true, estado: 'validada' })
      expect((brief(al, k).leido as { avisos: string[] }).avisos.some((a) => a.includes('se cayó la base'))).toBe(true)
    })
    it('🔴 la jefatura cierra en la misma llamada: la vuelta se aplica en el acto', async () => {
      const al = almacen(k, { puerto: async (e) => ({ estado: 'cerrada', salida: salidaDe(k, 'brief', e.payload.version, briefDe(k, k.tonoBien)) }) })
      await briefAbrir(al, wf(k), AHORA)
      expect(await recibirBrief(al, entrega(k, 1, briefDe(k, k.tonoMal)), AHORA)).toMatchObject({ ok: true, estado: 'validada' })
      expect(brief(al, k).texto_md).toBe(briefDe(k, k.tonoBien))
      expect(esperaDe(al, k, objetoDeRegistro('brief', 1))?.estado).toBe('resuelta')
    })
    it('🔴 la espera vence (reloj): el brief se cierra con su texto y las pistas como aviso; una vuelta tardía ya no toca nada', async () => {
      const al = almacen(k)
      await briefEnRevision(al, k)
      const e = esperaDe(al, k, objetoDeRegistro('brief', 1))!
      const r = await relojDeLaCadena(al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v1', seco: true }, horas(e.vence_en, 0.1))
      expect(r.status).toBe(200)
      expect((r.cuerpo.aplicado as string[]).some((x) => x.includes('siguió sin revisión de registro'))).toBe(true)
      const b = brief(al, k)
      expect(b.estado).toBe('validada')
      expect(b.texto_md).toBe(briefDe(k, k.tonoMal))
      expect((b.leido as { avisos: string[] }).avisos.some((a) => a.includes('la revisión de la jefatura no cerró a tiempo'))).toBe(true)
      expect((await recibirVueltaDeRegistro(al, { marcas: {}, salida: salidaDe(k, 'brief', 1, briefDe(k, k.tonoBien)) }, AHORA)).cuerpo).toMatchObject({ ya_cerrada: true })
      expect(brief(al, k).texto_md).toBe(briefDe(k, k.tonoMal))
    })
    it('vencer sobre un documento que ya cerró por otra vía no hace nada', async () => {
      const al = almacen(k)
      await briefEnRevision(al, k)
      const e = esperaDe(al, k, objetoDeRegistro('brief', 1))!
      await recibirVueltaDeRegistro(al, { marcas: {}, salida: salidaDe(k, 'brief', 1, briefDe(k, k.tonoBien)) }, AHORA)
      expect(await seguirSinRevisionDeRegistro(al, e, AHORA)).toMatch(/ya había cerrado/)
      expect(brief(al, k).texto_md).toBe(briefDe(k, k.tonoBien))
    })
  })

  describe('la gran idea', () => {
    it('🔴 retiene: «Cómo suena» en otro registro ya no la deja sin concepto; queda abierta y sale el sobre (con el brief validado entre los documentos de origen)', async () => {
      const al = almacen(k)
      await conBriefValidado(al, k)
      await conceptoAbrir(al, wf(k), AHORA)
      expect(await recibirConcepto(al, entrega(k, 1, conceptoDe(k.suenaMal)), AHORA)).toMatchObject({ ok: true, estado: EN_REVISION_DE_REGISTRO })
      expect(concepto(al, k).estado).toBe('abierta')
      expect(al.tarjetas).toEqual([])
      const s = al.sobresDeRegistro[0]
      expect(s).toMatchObject({ artifact_id: `registro:concepto:${campDe(k)}:v1`, payload: { documento: 'la gran idea', registro: { trato: k.registro } } })
      expect(s.payload.productores).toBeUndefined()
      expect(s.payload.documentos_de_origen.map((d) => d.titulo)).toEqual(['el plan', 'el manual', 'el brief creativo'])
    })
    it('🔴 la vuelta corregida: la gran idea queda lista y se abre la aprobación de Emilio con el texto corregido', async () => {
      const al = almacen(k)
      await conBriefValidado(al, k)
      await conceptoAbrir(al, wf(k), AHORA)
      await recibirConcepto(al, entrega(k, 1, conceptoDe(k.suenaMal)), AHORA)
      const r = await recibirVueltaDeRegistro(al, { marcas: {}, salida: salidaDe(k, 'concepto', 1, conceptoDe(k.suenaBien)) }, AHORA)
      expect(r.cuerpo).toMatchObject({ ok: true, estado: 'lista' })
      const c = concepto(al, k)
      expect(c).toMatchObject({ estado: 'lista', aprobacion: 'pendiente', texto_md: conceptoDe(k.suenaBien) })
      expect(al.tarjetas).toHaveLength(1)
      expect(esperaDe(al, k, objetoDeRegistro('concepto', 1))?.estado).toBe('resuelta')
    })
    it('🔴 línea 2 de CC7 · una corrección que se lleva la gran idea no se guarda: queda la versión anterior, lista, con aviso', async () => {
      const al = almacen(k)
      await conBriefValidado(al, k)
      await conceptoAbrir(al, wf(k), AHORA)
      await recibirConcepto(al, entrega(k, 1, conceptoDe(k.suenaMal)), AHORA)
      const rota = conceptoDe(k.suenaBien).replace(/## Gran idea[^\n]*\n/, '')
      await recibirVueltaDeRegistro(al, { marcas: {}, salida: salidaDe(k, 'concepto', 1, rota) }, AHORA)
      const c = concepto(al, k)
      expect(c).toMatchObject({ estado: 'lista', texto_md: conceptoDe(k.suenaMal) })
      expect((c.leido as { avisos: string[] }).avisos.some((a) => a.startsWith('la corrección de registro rompía otros chequeos'))).toBe(true)
    })
    it('una entrega repetida mientras revisa no reabre nada', async () => {
      const al = almacen(k)
      await conBriefValidado(al, k)
      await conceptoAbrir(al, wf(k), AHORA)
      await recibirConcepto(al, entrega(k, 1, conceptoDe(k.suenaMal)), AHORA)
      expect(await recibirConcepto(al, entrega(k, 1, null), AHORA)).toMatchObject({ ok: true, estado: EN_REVISION_DE_REGISTRO })
      expect(concepto(al, k).estado).toBe('abierta')
      expect(al.sobresDeRegistro).toHaveLength(1)
    })
  })
})

describe('el sobre y sus identificadores', () => {
  it('artifact_id y objeto de la espera son reversibles', () => {
    expect(leerArtifactIdDeRegistro(artifactIdDeRegistro('concepto', 'c-1', 3))).toEqual({ doc: 'concepto', campana_id: 'c-1', version: 3 })
    expect(leerObjetoDeRegistro(objetoDeRegistro('brief', 2))).toEqual({ doc: 'brief', version: 2 })
    expect(leerObjetoDeRegistro('estrategia:v1')).toBeNull()
    expect(leerArtifactIdDeRegistro('registro:pieza:c-1:v1')).toBeNull()
  })
  it('🔴 el sobre cumple el contrato de la jefatura para `registro` (mismo validador)', async () => {
    const { erroresDeLaEntradaDeRegistro } = await import('../../jefatura/revision/registro')
    for (const k of CASOS) {
      const s = sobreDeRegistro({ doc: 'brief', campana: { id: campDe(k), client_id: k.c.clientId, seco: false }, version: 1, texto: briefDe(k, k.tonoMal), registro: k.registro, origenes: [{ titulo: 'el plan', texto: k.c.planTexto }, { titulo: 'el manual', texto: '' }] })
      expect(erroresDeLaEntradaDeRegistro(s.payload as unknown as Record<string, unknown>)).toEqual([])
      expect(s.payload.dry_run).toBe(false)
      expect(s.payload.documentos_de_origen.map((d) => d.titulo)).toEqual(['el plan']) // un documento vacío no viaja
    }
  })
  it('el texto de la vuelta: el corregido solo si hubo versión y cambió', () => {
    expect(textoDeLaVuelta({ versiones: [{}], artefacto_final: { texto: 'nuevo' } }, 'viejo')).toEqual({ texto: 'nuevo', corregido: true })
    expect(textoDeLaVuelta({ versiones: [], artefacto_final: { texto: 'nuevo' } }, 'viejo')).toEqual({ texto: 'viejo', corregido: false })
    expect(textoDeLaVuelta({ versiones: [{}], artefacto_final: { texto: 'viejo' } }, 'viejo')).toEqual({ texto: 'viejo', corregido: false })
    expect(textoDeLaVuelta({ versiones: [{}], artefacto_final: {} }, 'viejo')).toEqual({ texto: 'viejo', corregido: false })
  })
})
