/**
 * Colaterales · escritores por tramo, el primero: el BRIEF (`cadena_brief_creativo`), de punta a punta con aplicar/deshacer (11-nov · diseño 🟢 CC7 + CC6).
 * Dos clientes de rubros distintos:
 *   · A · restaurante · el brief v4 REAL de producción (campaña 28de888e, `brief-naufrago-v4-real.md`) con la única cita que el verificador marcó copiada
 *     tal cual (así se validaría hoy), y los extractos LITERALES de su plan y su manual;
 *   · B · B2B industrial · plan y manual REALES (como los guarda la base, en JSON); el brief es de práctica (ese cliente no tiene brief en la cadena) y cita esos documentos.
 * La cadena se lee y escribe por SU almacén (aquí en memoria, que imita el único (campaña, versión)); el historial de retoques, por la base falsa del 2b.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it, expect } from 'vitest'
import A from './__fixtures__/naufrago-2026-11-10-extractos.json'
import B from './__fixtures__/b2b-industrial-2026-11-10.json'
import { pedazosDe, type Pedazo } from '../red'
import { almacenDeColaterales } from '../almacen'
import { aplicarAprobados, deshacerEdicion } from '../aplicar'
import { BriefConBloqueos, escritorDeBrief } from '../escritores'
import { baseFalsa } from './base-falsa'
import { AlmacenMemoria } from '../../cadena/__fixtures__/almacen-memoria'
import type { BriefCreativoGuardado, Campana, ContextoDelCliente, EstrategiaGuardada } from '../../cadena/almacen'
import { insumosDelBrief, leerBriefCreativo } from '../../cadena/brief-creativo'
import { bloqueosDelBrief, MOTIVO_RETOQUE_DE_COLATERALES } from '../../cadena/mesas'
import { idDeBrief } from '../../cadena/conceptos'

const fx = (n: string) => readFileSync(join(__dirname, '..', '..', 'cadena', '__fixtures__', n), 'utf8')
const TODAS: ReadonlySet<string> = new Set(['manual', 'plan', 'estrategia', 'brief', 'gran_idea', 'calendario', 'pieza'])

const BRIEF_B = [
  '## De qué parte del plan sale', '> «activar cuando exista perfil LinkedIn de empresa creado y validado»',
  '## Insight', 'La inspección llega y el responsable tiene que resolver todo en pocos días.',
  '## Público', '> «Voz directa, sin rodeos y precio-primero.»',
  '## Mensaje', 'Todo lo de seguridad contra incendios, con un solo proveedor.',
  '## Objetivo', 'Consultas entrantes por WhatsApp cada semana.',
  '## Cómo sabremos que funcionó', 'Consultas por semana.',
  '## Tono', 'Directo, en tuteo.',
  '## Obligatorios', '- vocabulario: extintores',
  '## Faltantes', '- objetivo: el plan no trae un número de consultas por semana',
].join('\n')

const CASOS = [
  {
    cliente: 'A · restaurante', campana: 'camp-a', client: 'cli-a',
    brief: fx('brief-naufrago-v4-real.md').replace('¿será tan bueno como en la playa?', '¿será tan bueno como en la costa?'),
    ctx: { planTexto: fx('plan-naufrago-extracto-citas.md'), manualTexto: fx('manual-naufrago-extracto-citas.md') },
    estrategia: JSON.parse(A.estrategia_v1),
    antes: 'pagas en efectivo al recibir', despues: 'pagas en efectivo o por transferencia al recibir',
    // el caso real del 10-nov al revés: el retoque mete la palabra que el plan NO dice dentro de una cita literal
    malo: { antes: '¿será tan bueno como en la costa?', despues: '¿será tan bueno como en la playa?' },
  },
  {
    cliente: 'B · B2B industrial', campana: 'camp-b', client: 'cli-b',
    brief: BRIEF_B,
    ctx: { planTexto: fx('plan-b2b-industrial-real.json.txt'), manualTexto: fx('manual-b2b-industrial-real.json.txt') },
    estrategia: JSON.parse(B.estrategia),
    antes: 'con un solo proveedor', despues: 'con un solo proveedor y un solo informe',
    malo: { antes: '«Voz directa, sin rodeos y precio-primero.»', despues: '«Voz directa y precio-primero.»' },
  },
]
type Caso = (typeof CASOS)[number]

const contexto = (c: Caso): ContextoDelCliente => ({ clientId: c.client, nombreDelNegocio: 'Negocio de práctica', pais: 'pais-de-practica', zonaHoraria: 'UTC', planTexto: c.ctx.planTexto, manualTexto: c.ctx.manualTexto, forbiddenWords: [], sedes: [], referencias: [], fechaDelPlan: '2026-10-08', registro: 'tu' } as unknown as ContextoDelCliente)
const leerComoLaMesa = (c: Caso, md: string, canales = c.estrategia.canales) => leerBriefCreativo(md, { ...insumosDelBrief(contexto(c), canales), registroSoloAviso: true })

function cadenaCon(c: Caso, extra: { estado?: BriefCreativoGuardado['estado']; briefs?: BriefCreativoGuardado[]; estrategias?: EstrategiaGuardada[] } = {}) {
  const al = new AlmacenMemoria({ contextos: { [c.client]: contexto(c) } })
  al.campanas.push({ id: c.campana, client_id: c.client, plan_id: 'plan-1', estado: 'activa', seco: false } as unknown as Campana)
  al.estrategias.push(...(extra.estrategias ?? [{ campana_id: c.campana, version: 1, estado: 'validada', contenido: c.estrategia, agente: 'estratega', modelo: 'm', costo_usd: 0.5, workflow_execution_id: 'x', seco: false }]))
  const v1: BriefCreativoGuardado = { campana_id: c.campana, version: 1, estado: extra.estado ?? 'validada', texto_md: c.brief, leido: leerComoLaMesa(c, c.brief) as unknown as Record<string, unknown>, devolucion_texto: null, motivo: null, costo_usd: 0.53, encargo_id: 'enc-1', plazo_en: null, seco: false }
  al.briefsCreativos.push(...(extra.briefs ?? [v1]))
  return al
}

async function preparar(c: Caso, cadena: AlmacenMemoria, antes = c.antes, despues = c.despues, base = '1') {
  const { db, tablas } = baseFalsa()
  const almacen = almacenDeColaterales(db)
  const texto = (await cadena.ultimoBriefCreativo(c.campana))?.texto_md ?? c.brief
  const ped = pedazosDe('brief', texto).map((p, i): Pedazo => ({ id: `C${i + 1}`, ...p })).filter((p) => p.texto.includes(antes))
  expect(ped.length, c.cliente).toBeGreaterThan(0)
  const { edicion } = await almacen.crearEdicion({ client_id: c.client, documento: 'plan', documento_ref: 'plan', version_base: '1', seccion: 's', antes, despues, llave: `${c.campana}:${antes}` })
  await almacen.guardarRetoques(edicion.id, ped.map((p) => ({ pedazo: p, documento_ref: c.campana, version_base: base, afecta: true, razon: 'repite lo editado', antes, despues, porque: 'repite lo editado', estado: 'propuesto' as const })))
  for (const f of tablas.colaterales_retoques) await almacen.pasarRetoque(String(f.id), 'propuesto', 'aprobado')
  return { tablas, almacen, edicion_id: edicion.id, ped }
}
const aplicar = (cadena: AlmacenMemoria, p: Awaited<ReturnType<typeof preparar>>) => aplicarAprobados({ almacen: p.almacen, escritores: { brief: escritorDeBrief(cadena) }, leerFilasActivas: async () => TODAS }, p.edicion_id)

describe('los dos briefs de partida son los que la mesa validaría hoy (control)', () => {
  for (const c of CASOS) it(c.cliente, () => expect(bloqueosDelBrief(leerComoLaMesa(c, c.brief))).toEqual([]))
})

describe('escritor del brief · dos clientes', () => {
  for (const c of CASOS) {
    it(`${c.cliente}: versión 2 VALIDADA, el retoque en su posición, el \`leido\` RECALCULADO, la marca, costo 0 y sin encargo`, async () => {
      const cadena = cadenaCon(c)
      const p = await preparar(c, cadena)
      const r = await aplicar(cadena, p)
      expect(r.pendientes).toEqual([])
      expect(r.aplicados).toHaveLength(p.ped.length)
      const [v1, v2] = cadena.briefsCreativos
      expect(cadena.briefsCreativos.map((b) => b.version)).toEqual([1, 2])
      expect(v2).toMatchObject({ campana_id: c.campana, version: 2, estado: 'validada', motivo: MOTIVO_RETOQUE_DE_COLATERALES, costo_usd: 0, encargo_id: null, plazo_en: null, devolucion_texto: null, seco: false })
      expect(v2.texto_md).toBe(c.brief.split(c.antes).join(c.despues))
      // el `leido` es el de SU texto (nunca la copia del de la v1): los pasos de abajo leen `leido`
      expect(v2.leido).toEqual(leerComoLaMesa(c, v2.texto_md!))
      expect(JSON.stringify(v2.leido)).toContain(c.despues)
      expect(JSON.stringify(v2.leido)).not.toBe(JSON.stringify(v1.leido))
      expect(v1.texto_md).toBe(c.brief) // la v1 no se tocó
      expect(p.tablas.colaterales_retoques.every((f) => f.estado === 'aplicado' && f.version_resultante === '2')).toBe(true)
      // línea de CC6: el retoque cambia el id del brief que citen las piezas que se armen DESPUÉS; las ya armadas siguen citando la v1
      expect(idDeBrief(c.campana, v2.version)).not.toBe(idDeBrief(c.campana, v1.version))
    })

    it(`${c.cliente}: 🔴 un retoque que deja un bloqueo del verificador NO se escribe (pendiente · escritura_rechazada)`, async () => {
      const cadena = cadenaCon(c)
      const p = await preparar(c, cadena, c.malo.antes, c.malo.despues)
      const r = await aplicar(cadena, p)
      expect(r.aplicados).toEqual([])
      expect(r.pendientes.map((x) => x.motivo)).toEqual(p.ped.map(() => 'escritura_rechazada'))
      expect(cadena.briefsCreativos).toHaveLength(1)
    })

    it(`${c.cliente}: deshacer = versión 3 con el texto de la base, validada y con la MISMA marca`, async () => {
      const cadena = cadenaCon(c)
      const p = await preparar(c, cadena)
      await aplicar(cadena, p)
      const d = await deshacerEdicion({ almacen: p.almacen, escritores: { brief: escritorDeBrief(cadena) } }, p.edicion_id)
      expect(d.no_deshechos).toEqual([])
      const f = cadena.briefsCreativos
      expect(f.map((x) => x.version)).toEqual([1, 2, 3])
      expect(f[2]).toMatchObject({ estado: 'validada', texto_md: c.brief, motivo: MOTIVO_RETOQUE_DE_COLATERALES, encargo_id: null, costo_usd: 0 })
      expect(f[2].leido).toEqual(leerComoLaMesa(c, c.brief))
    })
  }
})

describe('lo que NO se toca', () => {
  const c = CASOS[0]
  it('🔴 un brief en preparación (borrador) cuenta como ABIERTO: no se retoca (pendiente · documento_abierto)', async () => {
    const cadena = cadenaCon(c, { estado: 'borrador' })
    const r = await aplicar(cadena, await preparar(c, cadena))
    expect(r.pendientes.every((x) => x.motivo === 'documento_abierto')).toBe(true)
    expect(cadena.briefsCreativos).toHaveLength(1)
  })
  for (const estado of ['devuelta', 'descartada'] as const) {
    it(`🔴 un brief ${estado} no es vigente (se va a rehacer): pendiente · documento_no_existe`, async () => {
      const cadena = cadenaCon(c, { estado })
      const r = await aplicar(cadena, await preparar(c, cadena))
      expect(r.pendientes.every((x) => x.motivo === 'documento_no_existe')).toBe(true)
      expect(cadena.briefsCreativos).toHaveLength(1)
    })
  }
  it('🔴 si alguien escribió una versión después de la base, no se pisa (pendiente · version_cambiada)', async () => {
    const cadena = cadenaCon(c)
    const p = await preparar(c, cadena)
    cadena.briefsCreativos.push({ ...structuredClone(cadena.briefsCreativos[0]), version: 2 })
    const r = await aplicar(cadena, p)
    expect(r.pendientes.every((x) => x.motivo === 'version_cambiada')).toBe(true)
    expect(cadena.briefsCreativos).toHaveLength(2)
  })
  it('🔴 la escritura es CONDICIONAL: con la base que ya no es la última, o que dejó de estar validada, devuelve null sin escribir', async () => {
    const cadena = cadenaCon(c)
    const esc = escritorDeBrief(cadena)
    expect(await esc.escribirSiSigue(c.campana, '7', c.brief, 'm')).toBeNull()
    cadena.briefsCreativos[0].estado = 'devuelta'
    expect(await esc.escribirSiSigue(c.campana, '1', c.brief, 'm')).toBeNull()
    expect(cadena.briefsCreativos).toHaveLength(1)
  })
  it('🔴 la carrera: si la versión nueva ya existe cuando se inserta, null (la unicidad decide) y nada se duplica', async () => {
    const cadena = cadenaCon(c)
    const esc = escritorDeBrief(cadena)
    const ultimo = cadena.ultimoBriefCreativo.bind(cadena)
    // otra se adelanta ENTRE la lectura de la base y la inserción
    cadena.ultimoBriefCreativo = async (id: string) => { const f = await ultimo(id); cadena.briefsCreativos.push({ ...structuredClone(cadena.briefsCreativos[0]), version: 2, motivo: 'otra' }); cadena.ultimoBriefCreativo = ultimo; return f }
    expect(await esc.escribirSiSigue(c.campana, '1', c.brief.replace(c.antes, c.despues), 'm')).toBeNull()
    expect(cadena.briefsCreativos.map((b) => [b.version, b.motivo])).toEqual([[1, null], [2, 'otra']])
  })
  it('deshacer cuando la base ya tendría un bloqueo con el contexto de HOY: se avisa (escritura_rechazada), no tumba la corrida ni escribe', async () => {
    const cadena = cadenaCon(c)
    const p = await preparar(c, cadena)
    await aplicar(cadena, p)
    // el plan del cliente cambió y ya no contiene la cita de la base (la del retoque tampoco importa: se juzga la BASE que se restaura)
    const otro = { ...contexto(c), planTexto: 'otro plan sin esas frases' } as ContextoDelCliente
    cadena.cargarContexto = async () => otro
    const d = await deshacerEdicion({ almacen: p.almacen, escritores: { brief: escritorDeBrief(cadena) } }, p.edicion_id)
    expect(d.no_deshechos.map((x) => x.motivo)).toEqual(p.ped.map(() => 'escritura_rechazada'))
    expect(cadena.briefsCreativos).toHaveLength(2)
  })
})

describe('insumos del `leido` (línea 1 de CC7): los canales de la estrategia VIGENTE al retocar', () => {
  it('con una estrategia retocada en medio (v2 sin una red), el `leido` nuevo sale de la v2, no de la que usó el brief original', async () => {
    const c = CASOS[0]
    const v1 = c.estrategia
    const v2 = { ...structuredClone(v1), canales: v1.canales.map((k: { rol: string }) => (k.rol === 'principal' ? k : { ...k, rol: 'no' })) }
    expect(JSON.stringify(v2.canales)).not.toBe(JSON.stringify(v1.canales))
    const fila = (version: number, contenido: unknown): EstrategiaGuardada => ({ campana_id: c.campana, version, estado: 'validada', contenido: contenido as EstrategiaGuardada['contenido'], agente: 'estratega', modelo: 'm', costo_usd: 0, workflow_execution_id: 'x', seco: false })
    const cadena = cadenaCon(c, { estrategias: [fila(1, v1), fila(2, v2)] })
    await aplicar(cadena, await preparar(c, cadena))
    const nuevo = cadena.briefsCreativos[1]
    expect(nuevo.leido).toEqual(leerComoLaMesa(c, nuevo.texto_md!, v2.canales))
  })
})

describe('el `registro` va como aviso y un retoque no deja una espera de registro abierta (línea 2 de CC6)', () => {
  it('el escritor no abre esperas: después de aplicar, la cadena no tiene ninguna espera nueva', async () => {
    const c = CASOS[1]
    const cadena = cadenaCon(c)
    const antes = structuredClone(cadena.esperas ?? [])
    await aplicar(cadena, await preparar(c, cadena))
    expect(cadena.esperas ?? []).toEqual(antes)
    expect(cadena.briefsCreativos[1].estado).toBe('validada')
  })
})

describe('una sola marca y nace apagado (líneas de CC7)', () => {
  const src = (r: string) => readFileSync(join(__dirname, '..', '..', '..', '..', r), 'utf8')
  it('el escritor usa la constante exportada, nunca el texto escrito a mano (el contador lee la misma)', () => {
    const esc = src('src/lib/colaterales/escritores.ts')
    expect(esc).toContain('motivo: MOTIVO_RETOQUE_DE_COLATERALES')
    expect(esc).not.toContain(`'${MOTIVO_RETOQUE_DE_COLATERALES}'`)
    expect(src('src/lib/cadena/mesas.ts').match(new RegExp(`'${MOTIVO_RETOQUE_DE_COLATERALES}'`, 'g'))).toHaveLength(1)
  })
  it('nace apagado: fuera de las pruebas, SOLO los puertos del turno 2d crean el escritor del brief (el flujo 2d está apagado; nadie más lo llama)', () => {
    const { execSync } = require('node:child_process') as typeof import('node:child_process')
    const usos = execSync('git grep -l "escritorDeBrief" -- src', { cwd: join(__dirname, '..', '..', '..', '..'), encoding: 'utf8' }).trim().split('\n').filter((f) => !f.includes('__tests__'))
    expect(usos.sort()).toEqual(['src/lib/colaterales/escritores.ts', 'src/lib/colaterales/puertos-supabase.ts'])
  })
})

describe('el registro va como AVISO en el retoque (la jefatura ya lo juzgó contra el manual en 2d)', () => {
  it('con un cliente que trata de «usted», un brief en tuteo se retoca igual: el registro queda en avisos, no en bloqueos', async () => {
    const c = { ...CASOS[1], brief: CASOS[1].brief.replace('Directo, en tuteo.', 'Directo: tú tienes la inspección encima y te la resolvemos.') }
    expect(c.brief).not.toBe(CASOS[1].brief)
    const cadena = cadenaCon(c)
    const enUsted = { ...contexto(c), registro: 'usted' } as ContextoDelCliente
    cadena.cargarContexto = async () => enUsted
    // control: como bloqueo (la entrega sin revisión de registro), ese mismo texto se devolvería
    const comoBloqueo = leerBriefCreativo(c.brief.split(c.antes).join(c.despues), insumosDelBrief(enUsted, c.estrategia.canales))
    expect(bloqueosDelBrief(comoBloqueo).some((b) => b.includes('Tono'))).toBe(true)
    const r = await aplicar(cadena, await preparar(c, cadena))
    expect(r.pendientes).toEqual([])
    expect(cadena.briefsCreativos[1].estado).toBe('validada')
  })
})
