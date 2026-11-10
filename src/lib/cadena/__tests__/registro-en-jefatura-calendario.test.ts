/**
 * 10-nov · TRAMO 3 DEL REVISOR DE REGISTRO (GO de Lenovo 22:20Z) · el calendario: las filas cuyo tema señala el revisor se corrigen POR FILA; V15 queda como pista.
 * Contra el almacén en memoria: sin modelo, sin red, US$ 0. DOS clientes de práctica de rubros distintos en cada criterio:
 *   · A · cafetería de barrio · VOSEO («pedís», «vos sabés» cumplen; «tú sabes», «tú eliges» no);
 *   · B · clínica veterinaria · USTED («pase», «mire» cumplen; «entrá», «mirá» no).
 * Un registro FIJO en el código (siempre tuteo, siempre usted…) rompe a uno de los dos: por eso cada criterio corre con los dos.
 * La vara de CC7, por fila: (1) las citas no se corrigen (el aviso de la revisión va a la fila que la trae); (2) TODOS los chequeos corren otra vez sobre la tanda corregida:
 * la fila que rompe uno se queda con su tema anterior, con aviso. Nada aquí nombra a un cliente real: los datos son de práctica.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, clienteB, contextoDe, tandaBuena, type ClienteFixture } from '../__fixtures__/clientes'
import type { EntradaDeRegistro, ResultadoDeAbrirRegistro } from '../almacen'
import { abrirCampana, calendarioGuardar, calendarioPreparar, estrategiaGuardar, estrategiaPreparar } from '../index'
import { EN_REVISION_DE_REGISTRO, recibirVueltaDeRegistro } from '../mesas'
import { aplicarVueltaDelCalendario, recibirVueltaDeLaCadena, seguirSinRevisionDelCalendario } from '../pasos'
import { relojDeLaCadena } from '../reloj'
import { artifactIdDeRegistro, cabeceraDeFila, leerArtifactIdDeRegistro, leerObjetoDeRegistro, objetoDeRegistro, temasDeLaVuelta, textoDelCalendario } from '../registro-en-jefatura'
import { TIPO_DE_ESPERA } from '../revision-jefatura'
import type { Fila, TandaAgente } from '../tipos'

const AHORA = '2026-10-09T12:00:00Z'
beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-interna' })
const wf = (extra: Record<string, unknown> = {}) => ({ workflow_id: 'wf-cadena', workflow_execution_id: 'ex-1', ...extra })
const ok = (o: unknown) => ({ success: true, structured_output: o, cost_usd: 0.3 })

interface Caso {
  nombre: string; c: ClienteFixture; registro: 'vos' | 'usted'
  /** dos temas en otro registro con su corrección (la frase exacta que cambia) y uno que CUMPLE aunque el detector de tuteo lo leería mal */
  malos: Array<{ tema: string; antes: string; despues: string; forma: string }>
  cumple: string
}
const CASOS: Caso[] = [
  {
    nombre: 'A · cafetería · voseo', c: clienteA(), registro: 'vos',
    malos: [
      { tema: 'Café de la tarde: tú sabes dónde', antes: 'tú sabes', despues: 'vos sabés', forma: 'tú' },
      { tema: 'Mesa libre junto a la ventana: tú eliges', antes: 'tú eliges', despues: 'vos elegís', forma: 'tú' },
    ],
    cumple: 'Si pedís temprano, la mesa larga es tuya',
  },
  {
    nombre: 'B · clínica veterinaria · usted', c: clienteB(), registro: 'usted',
    malos: [
      { tema: 'Control anual: entrá y mirá la sala nueva', antes: 'entrá y mirá', despues: 'pase y mire', forma: 'entrá' },
      { tema: 'Vacunas al día: mirá el calendario de su mascota', antes: 'mirá', despues: 'mire', forma: 'mirá' },
    ],
    cumple: 'Pase a conocer la sala de espera nueva',
  },
]

interface Opciones { retiene?: boolean; puerto?: ((e: EntradaDeRegistro) => Promise<ResultadoDeAbrirRegistro>) | null; registro?: 'tu' | 'vos' | 'usted' | 'sin_dato' }
function almacen(k: Caso, o: Opciones = {}) {
  const id = k.c.clientId
  const al = new AlmacenMemoria({
    contextos: { [id]: { ...contextoDe(k.c), registro: o.registro ?? k.registro } },
    planes: { [id]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta' },
    journeys: [{ journeyId: 'journey-1', clientId: id }],
  })
  const retiene = o.retiene ?? true
  al.retencion = async (tipo) => ({ retener: retiene && tipo === 'registro', motivo: retiene && tipo === 'registro' ? 'jefatura_activa' : 'tipo_no_activo' })
  al.registro = o.puerto === undefined ? async () => ({ estado: 'esperando', revision_id: 'rev-1' }) : o.puerto
  return al
}

/** la tanda del agente: las 3 primeras piezas que no son fijas llevan los dos temas malos y el que cumple; el resto, temas neutros */
function tandaDe(k: Caso): TandaAgente {
  const t = tandaBuena(k.c)
  const libres = t.piezas.filter((p) => !p.pieza_fija)
  ;[...k.malos.map((m) => m.tema), k.cumple].forEach((tema, i) => { libres[i].tema = tema })
  return t
}

async function hastaGuardar(k: Caso, o: Opciones = {}, tanda: TandaAgente = tandaDe(k)) {
  const al = almacen(k, o)
  const ab = await abrirCampana(al, { ...wf(), client_id: k.c.clientId, seco: true }, AHORA)
  const campanaId = (ab.cuerpo.campana as { id: string }).id
  const pe = await estrategiaPreparar(al, { ...wf(), campana_id: campanaId }, AHORA)
  await estrategiaGuardar(al, { ...wf(), campana_id: campanaId, corrida_id: pe.cuerpo.corrida_id, resultado: ok(k.c.estrategia) }, AHORA)
  const p = await calendarioPreparar(al, { ...wf(), campana_id: campanaId, tanda: 1 }, AHORA)
  const g = await calendarioGuardar(al, { ...wf(), campana_id: campanaId, tanda: 1, corrida_id: p.cuerpo.corrida_id, resultado: ok(tanda) }, AHORA)
  const filas = async () => (await al.filas(campanaId, 1)).filter((f) => f.tanda === 1 && f.estado !== 'esquema')
  const fila = async (tema: string) => (await filas()).find((f) => f.tema === tema)!
  return { al, campanaId, g, filas, fila }
}
const esperaDe = (al: AlmacenMemoria, campanaId: string) => al.esperas.find((e) => e.campana_id === campanaId && e.objeto_tipo === TIPO_DE_ESPERA && e.objeto_id === objetoDeRegistro('calendario', 1))
/** la salida de la jefatura (la forma de `armarSalida`): con `texto`, una versión corregida; sin él, cierre sin versiones */
const salidaDe = (campanaId: string, texto: string | null, extra: Record<string, unknown> = {}) => ({
  revision_id: 'rev-1', artifact_type: 'registro', artifact_id: artifactIdDeRegistro('calendario', campanaId, 1), resultado: 'limpia', marcas: {},
  artefacto_final: texto === null ? {} : { texto }, versiones: texto === null ? [] : [{ etiqueta: 'A', paso: 'correccion:documento', texto, largo: texto.length }], ...extra,
})
/** la corrección que haría el creador: reemplazos exactos de las frases señaladas sobre el texto que recibió la jefatura */
const corregir = (texto: string, pares: Array<[string, string]>) => pares.reduce((t, [a, b]) => t.split(a).join(b), texto)

describe('el calendario como documento (código puro)', () => {
  const f = (id: string, tema: string | null, estado: Fila['estado'] = 'propuesta') => ({ id, tanda: 1, semana: 1, dia_semana: 1, fecha: '2026-10-12', hora: '10:00', red: 'instagram', formato: 'foto', pilar: null, tema, sede: null, requiere_abierto: false, depende_de: [], datos: [], pendientes: [], pieza_fija: null, origen: 'agente', estado, avisos: [] }) as Fila
  const filas = [f('s1-a', 'uno'), f('s1-b', 'dos\ncon salto'), f('s1-c', null), f('s1-d', 'fuera', 'descartada_sin_fuente'), f('s1-e', 'tres')]
  it('una línea por fila con tema, con su cabecera fija; ni vacías ni las que salieron', () => {
    expect(textoDelCalendario(filas)).toBe(`${cabeceraDeFila(filas[0])}uno\n${cabeceraDeFila(filas[1])}dos\ncon salto\n${cabeceraDeFila(filas[4])}tres`)
  })
  it('🔴 la vuelta se lee fila por fila, exacta (un tema con salto de línea también)', () => {
    const m = temasDeLaVuelta(textoDelCalendario(filas).replace('dos', 'DOS'), filas)!
    expect([...m.entries()]).toEqual([['s1-a', 'uno'], ['s1-b', 'DOS\ncon salto'], ['s1-e', 'tres']])
  })
  it('🔴 una cabecera tocada, repetida, fuera de orden o a mitad de línea: no se lee nada (nunca se adivina)', () => {
    const t = textoDelCalendario(filas)
    const cab = cabeceraDeFila(filas[1])
    expect(temasDeLaVuelta(t.replace('s1-b', 's1-x'), filas)).toBeNull()
    expect(temasDeLaVuelta(`${t}\n${cab}otra vez`, filas)).toBeNull()
    expect(temasDeLaVuelta([cabeceraDeFila(filas[4]) + 'tres', cabeceraDeFila(filas[0]) + 'uno', cab + 'dos\ncon salto'].join('\n'), filas)).toBeNull()
    // la primera en su lugar y las otras dos cambiadas de orden
    expect(temasDeLaVuelta([cabeceraDeFila(filas[0]) + 'uno', cabeceraDeFila(filas[4]) + 'tres', cab + 'dos\ncon salto'].join('\n'), filas)).toBeNull()
    expect(temasDeLaVuelta(t.replace(`\n${cab}`, ` ${cab}`), filas)).toBeNull()
    expect(temasDeLaVuelta(`basura\n${t}`, filas)).toBeNull()
  })
  it('los ids del calendario: objeto y artifact con la tanda (`t`), reversibles; los del brief y la gran idea no cambian', () => {
    expect(objetoDeRegistro('calendario', 2)).toBe('registro:calendario:t2')
    expect(leerObjetoDeRegistro('registro:calendario:t2')).toEqual({ doc: 'calendario', version: 2 })
    expect(leerObjetoDeRegistro('registro:calendario:v2')).toBeNull()
    expect(leerObjetoDeRegistro('registro:brief:t2')).toBeNull()
    expect(artifactIdDeRegistro('calendario', 'camp-1', 3)).toBe('registro:calendario:camp-1:t3')
    expect(leerArtifactIdDeRegistro('registro:calendario:camp-1:t3')).toEqual({ doc: 'calendario', campana_id: 'camp-1', version: 3 })
    expect(leerArtifactIdDeRegistro('registro:calendario:camp-1:v3')).toBeNull()
    expect(objetoDeRegistro('brief', 1)).toBe('registro:brief:v1')
    expect(leerArtifactIdDeRegistro('registro:concepto:camp-1:v2')).toEqual({ doc: 'concepto', campana_id: 'camp-1', version: 2 })
  })
})

describe.each(CASOS)('$nombre', (k) => {
  describe('apagado = byte a byte con hoy', () => {
    it('🔴 sin retener `registro`: V15 bloquea los temas en otro registro y pide la corrección de esas filas; ningún sobre ni espera', async () => {
      const x = await hastaGuardar(k, { retiene: false })
      const malas = await Promise.all(k.malos.map((m) => x.fila(m.tema)))
      expect(x.g.cuerpo).toMatchObject({ correccion: true })
      for (const f of malas) expect(x.g.cuerpo.fila_ids).toContain(f.id)
      expect(x.al.sobresDeRegistro).toEqual([])
      expect(x.al.esperas.filter((e) => e.objeto_tipo === TIPO_DE_ESPERA)).toEqual([])
    })
    it('🔴 apagado por cualquiera de los tres lados (no retiene · sin puerto · sin registro fijado): lo mismo que un almacén sin jefatura', async () => {
      const sinJefatura = async () => { const x = await hastaGuardar(k, { retiene: false, puerto: null }); x.al.retencion = null; return x }
      const base = await sinJefatura()
      for (const o of [{ retiene: false }, { puerto: null }]) {
        const x = await hastaGuardar(k, o)
        expect(x.g).toEqual(base.g)
        expect(await x.filas()).toEqual(await base.filas())
        expect(x.al.sobresDeRegistro).toEqual([])
      }
      const sinDato = await hastaGuardar(k, { registro: 'sin_dato' })
      expect(sinDato.al.sobresDeRegistro).toEqual([])
      expect(sinDato.g.cuerpo).toMatchObject({ ok: true }) // sin registro fijado nada bloquea por registro: la tanda se cierra como hoy
    })
    it(`el tema que cumple («${k.cumple}») no es pista ni bloqueo para este registro`, async () => {
      const t = tandaBuena(k.c)
      t.piezas.filter((p) => !p.pieza_fija)[0].tema = k.cumple
      const x = await hastaGuardar(k, { retiene: false }, t)
      expect(x.g.cuerpo).toMatchObject({ ok: true })
      expect((await x.fila(k.cumple)).avisos.some((a) => /registro/.test(a))).toBe(false)
    })
  })

  describe('retiene: la tanda espera al revisor', () => {
    it('🔴 V15 pasa a pista: la tanda no se cierra, las filas quedan `propuesta`, se abre la espera y sale UN sobre con el calendario fila por fila', async () => {
      const x = await hastaGuardar(k)
      expect(x.g.cuerpo).toMatchObject({ ok: true, tanda: 1, estado: EN_REVISION_DE_REGISTRO, objeto_id: 'registro:calendario:t1' })
      expect((await x.filas()).every((f) => f.estado === 'propuesta' || f.estado === 'espera_video')).toBe(true)
      expect(esperaDe(x.al, x.campanaId)?.estado).toBe('viva')
      expect(x.al.sobresDeRegistro).toHaveLength(1)
      const s = x.al.sobresDeRegistro[0]
      expect(s.artifact_id).toBe(artifactIdDeRegistro('calendario', x.campanaId, 1))
      expect(s.client_id).toBe(k.c.clientId)
      expect(s.payload).toMatchObject({ documento: 'el calendario', version: 1, dry_run: true, registro: { trato: k.registro }, productores: [{ donde: '*', agente: 'social-media-strategist' }] })
      expect(s.payload.texto).toBe(textoDelCalendario(await x.filas()))
      for (const m of k.malos) expect(s.payload.texto).toContain(`${cabeceraDeFila(await x.fila(m.tema))}${m.tema}`)
      // las pistas son las del registro DEL CLIENTE: la forma mala está; la que cumple, no
      for (const m of k.malos) expect(s.payload.pistas_de_registro).toContain(m.forma)
      expect(s.payload.pistas_de_registro.some((p) => k.cumple.includes(p))).toBe(false)
      expect(s.payload.documentos_de_origen.map((d) => d.titulo)).toEqual(['el plan', 'el manual'])
      // la campaña no arranca mientras se revisa
      expect((await x.al.campana(x.campanaId))!.estado).toBe('calendario')
    })
    it('🔴 mientras espera, volver a pedir la tanda no gasta: no abre corrida ni reconstruye corrección', async () => {
      const x = await hastaGuardar(k)
      const corridas = (await x.al.corridasDeCampana(x.campanaId)).length
      const p = await calendarioPreparar(x.al, { ...wf(), campana_id: x.campanaId, tanda: 1 }, AHORA)
      expect(p.cuerpo).toEqual({ accion: 'esperar_revision_de_registro', tanda: 1, objeto_id: 'registro:calendario:t1' })
      expect((await x.al.corridasDeCampana(x.campanaId)).length).toBe(corridas)
    })
  })

  describe('la vuelta corrige por fila', () => {
    it('🔴 los temas señalados se corrigen; los demás quedan igual; la tanda se cierra y la campaña arranca', async () => {
      const x = await hastaGuardar(k)
      const antes = await x.filas()
      const texto = corregir(x.al.sobresDeRegistro[0].payload.texto, k.malos.map((m) => [m.antes, m.despues]))
      const r = await recibirVueltaDeLaCadena(x.al, { marcas: {}, salida: salidaDe(x.campanaId, texto) }, AHORA)
      expect(r.status).toBe(200)
      const despues = await x.filas()
      const ids = await Promise.all(k.malos.map(async (m) => antes.find((f) => f.tema === m.tema)!.id))
      expect(r.cuerpo.registro).toEqual({ corregidas: ids, revertidas: [] })
      for (const [i, m] of k.malos.entries()) {
        const f = despues.find((y) => y.id === ids[i])!
        expect(f.tema).toBe(m.tema.split(m.antes).join(m.despues))
        expect(f.estado).toBe('validada')
        expect(f.avisos.some((a) => /otro registro/.test(a))).toBe(false)
      }
      for (const f of despues.filter((y) => !ids.includes(y.id))) expect(f.tema).toBe(antes.find((y) => y.id === f.id)!.tema)
      expect(esperaDe(x.al, x.campanaId)?.estado).toBe('resuelta')
      expect((await x.al.campana(x.campanaId))!.estado).toBe('activa')
      expect(r.cuerpo.revision).toEqual({ id: 'rev-1', resultado: 'limpia' })
      // nadie más reenvía el sobre de la cadena: la ruta lo intenta (con estos clientes, sin la palanca del nuevo orden, no hay sobre que mandar: lo pide el vigía)
      expect((r.cuerpo.empuje as { resultado?: string } | undefined)?.resultado).toBe('nada_que_mandar')
    })
    it('🔴 la fila cuya corrección rompe otro chequeo se queda con su tema anterior, con aviso; la otra sí se corrige', async () => {
      const x = await hastaGuardar(k)
      const [m1, m2] = k.malos
      // la segunda «corrección» mete un testimonio sin procedencia (V16 bloquea): esa fila no puede quedar así
      const texto = corregir(x.al.sobresDeRegistro[0].payload.texto, [[m1.antes, m1.despues], [m2.tema, `${m2.tema.split(m2.antes).join(m2.despues)} · testimonio de una clienta`]])
      const f2 = await x.fila(m2.tema)
      const r = await aplicarVueltaDelCalendario(x.al, salidaDe(x.campanaId, texto), AHORA)
      expect(r.status).toBe(200)
      expect(r.cuerpo.registro).toEqual({ corregidas: [(await x.fila(m1.tema.split(m1.antes).join(m1.despues))).id], revertidas: [f2.id] })
      const g2 = (await x.filas()).find((f) => f.id === f2.id)!
      expect(g2.tema).toBe(m2.tema)
      expect(g2.avisos.some((a) => a.includes('rompía otros chequeos (V16)'))).toBe(true)
      // y la pista sigue a la vista (el registro no se corrigió en esa fila)
      expect(g2.avisos.some((a) => /otro registro/.test(a))).toBe(true)
    })
    it('🔴 una vuelta que no se lee fila por fila deja TODOS los temas de antes, con el aviso en las filas con pistas', async () => {
      const x = await hastaGuardar(k)
      const antes = await x.filas()
      const f1 = await x.fila(k.malos[0].tema)
      const texto = corregir(x.al.sobresDeRegistro[0].payload.texto, [[k.malos[0].antes, k.malos[0].despues], [f1.id, `${f1.id}x`]])
      const r = await aplicarVueltaDelCalendario(x.al, salidaDe(x.campanaId, texto), AHORA)
      expect(r.cuerpo.registro).toEqual({ corregidas: [], revertidas: [] })
      const despues = await x.filas()
      for (const f of despues) expect(f.tema).toBe(antes.find((y) => y.id === f.id)!.tema)
      for (const m of k.malos) expect(despues.find((f) => f.tema === m.tema)!.avisos.some((a) => a.includes('no se pudo leer fila por fila'))).toBe(true)
      expect(esperaDe(x.al, x.campanaId)?.estado).toBe('resuelta')
    })
    it('cierre sin versiones (el revisor no corrigió nada): los temas quedan y las formas que ve el detector, como aviso', async () => {
      const x = await hastaGuardar(k)
      const r = await aplicarVueltaDelCalendario(x.al, salidaDe(x.campanaId, null), AHORA)
      expect(r.cuerpo.registro).toEqual({ corregidas: [], revertidas: [] })
      for (const m of k.malos) {
        const f = await x.fila(m.tema)
        expect(f.estado).toBe('validada')
        expect(f.avisos.some((a) => /otro registro/.test(a))).toBe(true)
      }
    })
    it('🔴 un cierre SIN versión no aplica texto aunque traiga uno (cierre por tope o fallido)', async () => {
      const x = await hastaGuardar(k)
      const texto = corregir(x.al.sobresDeRegistro[0].payload.texto, k.malos.map((m) => [m.antes, m.despues]))
      const r = await aplicarVueltaDelCalendario(x.al, { ...salidaDe(x.campanaId, texto), versiones: [] }, AHORA)
      expect(r.cuerpo.registro).toEqual({ corregidas: [], revertidas: [] })
      for (const m of k.malos) expect((await x.fila(m.tema)).estado).toBe('validada')
    })
    it('🔴 el aviso de una cita en otro registro va a la fila que la trae', async () => {
      const x = await hastaGuardar(k)
      const m = k.malos[0]
      const aviso = `«${m.antes}» está dentro de una cita: el documento de origen usa otro registro (la cita no se corrige)`
      const r = await aplicarVueltaDelCalendario(x.al, salidaDe(x.campanaId, null, { avisos: [aviso, '«frase que no está» en ningún tema'] }), AHORA)
      expect((await x.fila(m.tema)).avisos).toContain(aviso)
      expect((await x.fila(k.malos[1].tema)).avisos).not.toContain(aviso)
      expect(r.cuerpo.registro).toEqual({ corregidas: [], revertidas: [], avisos: ['«frase que no está» en ningún tema'] })
    })
  })

  describe('idempotencia y nunca de rehén', () => {
    it('🔴 la vuelta con la espera ya cerrada no toca la tanda retenida', async () => {
      const x = await hastaGuardar(k)
      const e = esperaDe(x.al, x.campanaId)!
      await x.al.actualizarEspera(e.id, { estado: 'cancelada' })
      const antes = await x.filas()
      const texto = corregir(x.al.sobresDeRegistro[0].payload.texto, k.malos.map((m) => [m.antes, m.despues]))
      const r = await aplicarVueltaDelCalendario(x.al, salidaDe(x.campanaId, texto), AHORA)
      expect(r.cuerpo).toEqual({ ok: true, ya_cerrada: true })
      expect(await x.filas()).toEqual(antes)
    })
    it('🔴 con la espera viva pero la tanda ya cerrada por otra vía: la vuelta no reescribe nada y resuelve la espera', async () => {
      const x = await hastaGuardar(k)
      const cerradas = (await x.filas()).map((f) => (f.estado === 'propuesta' ? { ...f, estado: 'validada' as const } : f))
      await x.al.guardarFilas(x.campanaId, 1, 1, cerradas)
      const texto = corregir(x.al.sobresDeRegistro[0].payload.texto, k.malos.map((m) => [m.antes, m.despues]))
      const r = await aplicarVueltaDelCalendario(x.al, salidaDe(x.campanaId, texto), AHORA)
      expect(r.cuerpo).toEqual({ ok: true, ya_cerrada: true })
      for (const m of k.malos) expect((await x.fila(m.tema)).estado).toBe('validada')
      expect(esperaDe(x.al, x.campanaId)?.estado).toBe('resuelta')
    })
    it('🔴 la vuelta repetida no cierra dos veces', async () => {
      const x = await hastaGuardar(k)
      const texto = corregir(x.al.sobresDeRegistro[0].payload.texto, k.malos.map((m) => [m.antes, m.despues]))
      await recibirVueltaDeLaCadena(x.al, { marcas: {}, salida: salidaDe(x.campanaId, texto) }, AHORA)
      const despues = await x.filas()
      const r2 = await recibirVueltaDeLaCadena(x.al, { marcas: {}, salida: salidaDe(x.campanaId, null) }, AHORA)
      expect(r2.cuerpo).toMatchObject({ ok: true, ya_cerrada: true })
      expect(await x.filas()).toEqual(despues)
    })
    it('🔴 la jefatura no abre (o falla): la tanda se cierra en el mismo paso, con las pistas como aviso, y la espera no queda viva', async () => {
      for (const puerto of [async () => ({ estado: 'no_abre' as const, motivo: 'politica_inactiva' }), async () => { throw new Error('se cayó') }]) {
        const x = await hastaGuardar(k, { puerto })
        expect(x.g.cuerpo).toMatchObject({ ok: true, tanda: 1 })
        for (const m of k.malos) {
          const f = await x.fila(m.tema)
          expect(f.estado).toBe('validada')
          expect(f.avisos.some((a) => a.startsWith('registro sin revisar (la jefatura no abrió la revisión:'))).toBe(true)
        }
        expect((await x.fila(k.cumple)).avisos.some((a) => a.startsWith('registro sin revisar'))).toBe(false)
        expect(esperaDe(x.al, x.campanaId)?.estado).toBe('resuelta')
        expect((await x.al.campana(x.campanaId))!.estado).toBe('activa')
      }
    })
    it('🔴 la jefatura cierra en la misma llamada: la vuelta se aplica ahí mismo', async () => {
      let x: Awaited<ReturnType<typeof hastaGuardar>> | null = null
      const puerto = async (e: EntradaDeRegistro): Promise<ResultadoDeAbrirRegistro> => ({ estado: 'cerrada', salida: salidaDe(e.artifact_id.split(':')[2], corregir(e.payload.texto, k.malos.map((m) => [m.antes, m.despues]))) })
      x = await hastaGuardar(k, { puerto })
      expect((x.g.cuerpo.registro as { corregidas: string[] }).corregidas).toHaveLength(2)
      for (const m of k.malos) expect((await x.filas()).some((f) => f.tema === m.tema)).toBe(false)
    })
    it('🔴 la espera vence sin vuelta: el reloj cierra la tanda con sus temas y el aviso «venció»', async () => {
      const x = await hastaGuardar(k)
      const e = esperaDe(x.al, x.campanaId)!
      const msg = await seguirSinRevisionDelCalendario(x.al, e, AHORA)
      expect(msg).toContain('se cerró sin revisión')
      for (const m of k.malos) expect((await x.fila(m.tema)).avisos.some((a) => a.startsWith('registro sin revisar (la revisión venció sin vuelta)'))).toBe(true)
      expect((await x.al.campana(x.campanaId))!.estado).toBe('activa')
      // y el reloj, cuando de verdad vence, va por este camino (no por el del brief ni por el de J7)
      const y = await hastaGuardar(k)
      const ey = esperaDe(y.al, y.campanaId)!
      const r = await relojDeLaCadena(y.al, { workflow_id: 'wf-vigia', workflow_execution_id: 'v1', seco: true }, new Date(Date.parse(ey.vence_en) + 6 * 60_000).toISOString())
      expect(r.status).toBe(200)
      // (días después: lo que ya no alcanza su fecha queda `perdio_su_fecha` con solo su razón, como siempre; la tanda igual se cerró por el camino del calendario)
      expect(JSON.stringify(r.cuerpo)).toContain('registro:calendario:t1: la tanda 1 se cerró sin revisión')
      expect((await y.filas()).every((f) => f.estado !== 'propuesta')).toBe(true)
    })
  })

  describe('la ruta de vuelta reparte por documento', () => {
    it('el brief y la gran idea siguen por su camino; ese camino rechaza un id del calendario', async () => {
      const x = await hastaGuardar(k)
      const r = await recibirVueltaDeRegistro(x.al, { marcas: {}, salida: salidaDe(x.campanaId, null) }, AHORA)
      expect(r.status).toBe(400)
      const otro = await recibirVueltaDeLaCadena(x.al, { marcas: {}, salida: { ...salidaDe(x.campanaId, null), artifact_id: artifactIdDeRegistro('brief', x.campanaId, 1) } }, AHORA)
      // no hay brief retenido: lo contesta el camino del brief («ya cerrada»), no el del calendario, que no se toca
      expect(otro.cuerpo).toMatchObject({ ok: true, ya_cerrada: true })
      expect(otro.cuerpo.registro).toBeUndefined()
      expect(esperaDe(x.al, x.campanaId)?.estado).toBe('viva')
      expect((await x.filas()).every((f) => f.estado === 'propuesta' || f.estado === 'espera_video')).toBe(true)
    })
    it('exige `artifact_type: registro` y `resultado`', async () => {
      const x = await hastaGuardar(k)
      expect((await recibirVueltaDeLaCadena(x.al, { salida: { ...salidaDe(x.campanaId, null), artifact_type: 'pieza' } }, AHORA)).status).toBe(400)
      expect((await recibirVueltaDeLaCadena(x.al, { salida: { ...salidaDe(x.campanaId, null), resultado: undefined } }, AHORA)).status).toBe(400)
      expect(esperaDe(x.al, x.campanaId)?.estado).toBe('viva')
    })
  })
})
