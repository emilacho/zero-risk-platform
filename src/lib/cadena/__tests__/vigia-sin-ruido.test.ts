/**
 * Vigía sin ruido (31-oct, ENCARGO vigia-sin-ruido): con el vigía cada 30 min, un aviso de ESTADO (V21, barrido de atascadas, «no se pudo intentar retomar»)
 * sale UNA vez mientras diga lo mismo; el que cambia, o desaparece y vuelve, sale de nuevo; el resumen semanal sale una vez por día. Nada se oculta.
 */
import { describe, expect, it } from 'vitest'
import { abrirCampana, relojDeLaCadena } from '../index'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { clienteA, contextoDe } from '../__fixtures__/clientes'

const A = clienteA()
const T0 = '2026-11-02T06:00:00Z' // lunes
const mas = (min: number, base = T0) => new Date(Date.parse(base) + min * 60_000).toISOString().replace('.000Z', 'Z')
const VIG = { workflow_id: 'wf-vigia', workflow_execution_id: 'v' }

function almacen(estado = 'encendida') {
  return new AlmacenMemoria({
    contextos: { [A.clientId]: contextoDe(A) },
    planes: { [A.clientId]: [{ plan_id: 'plan-1', fecha: '2026-10-08' }] },
    config: { estado_cadena: estado, flujos: ['wf-cadena', 'wf-vigia'], puerta_workflow_id: 'wf-puerta', ultimo_latido: T0 },
    journeys: [{ journeyId: 'journey-1', clientId: A.clientId }],
  })
}
let copias = 0
async function campanaPausadaSinReloj(al: AlmacenMemoria): Promise<string[]> {
  const r = await abrirCampana(al, { workflow_id: 'wf-cadena', workflow_execution_id: 'ex', client_id: A.clientId, seco: true }, T0)
  const base = al.campanas.find((c) => c.id === (r.cuerpo.campana as { id: string }).id)!
  // una segunda campaña con el mismo problema = copia con otro id (el mismo plan abre siempre la misma campaña)
  const c = al.campanas.includes(base) && base.estado === 'pausada' ? (al.campanas.push({ ...base, id: `copia-${++copias}` }), al.campanas[al.campanas.length - 1]) : base
  c.estado = 'pausada' // pausada SIN espera viva: el invariante V21 la marca en cada pasada
  return [c.id]
}
const lineasDe = (r: { cuerpo: Record<string, unknown> }) => (r.cuerpo.alertas as { campana_id: string; lineas: string[] }[]).flatMap((a) => a.lineas)
const v21 = (r: { cuerpo: Record<string, unknown> }) => lineasDe(r).filter((l) => l.startsWith('V21'))

describe('avisos de estado: salen una vez y no se repiten sin cambio', () => {
  it('V21 persistente: la 1.ª pasada avisa, las siguientes (cada 30 min) no; la violación sigue en `violaciones` (nada se oculta)', async () => {
    const al = almacen()
    await campanaPausadaSinReloj(al)
    const r1 = await relojDeLaCadena(al, VIG, mas(0))
    expect(v21(r1).filter((l) => l.includes('campana_sin_reloj'))).toHaveLength(1)
    for (const m of [30, 60, 90]) {
      const r = await relojDeLaCadena(al, VIG, mas(m))
      expect(v21(r).filter((l) => l.includes('campana_sin_reloj')), `+${m} min`).toHaveLength(0)
      expect((r.cuerpo.violaciones as { tipo: string }[]).some((v) => v.tipo === 'campana_sin_reloj')).toBe(true)
    }
  })
  it('un aviso NUEVO sí sale aunque el viejo siga: solo sale el nuevo', async () => {
    const al = almacen()
    await campanaPausadaSinReloj(al)
    await relojDeLaCadena(al, VIG, mas(0))
    await campanaPausadaSinReloj(al) // segunda campaña con el mismo problema
    const r = await relojDeLaCadena(al, VIG, mas(30))
    expect(v21(r).filter((l) => l.includes('campana_sin_reloj'))).toHaveLength(1)
  })
  it('si el problema desaparece y vuelve, vuelve a avisar', async () => {
    const al = almacen()
    const [id] = await campanaPausadaSinReloj(al)
    await relojDeLaCadena(al, VIG, mas(0))
    al.campanas.find((c) => c.id === id)!.estado = 'activa' // se arregló
    expect(v21(await relojDeLaCadena(al, VIG, mas(30))).filter((l) => l.includes('campana_sin_reloj'))).toHaveLength(0)
    al.campanas.find((c) => c.id === id)!.estado = 'pausada' // volvió
    expect(v21(await relojDeLaCadena(al, VIG, mas(60))).filter((l) => l.includes('campana_sin_reloj'))).toHaveLength(1)
  })
  it('lo que NO se manda (seco o ensayo sin «enviar») no cuenta como avisado', async () => {
    const al = almacen('ensayo')
    await campanaPausadaSinReloj(al)
    for (const m of [0, 30]) expect(v21(await relojDeLaCadena(al, VIG, mas(m))).filter((l) => l.includes('campana_sin_reloj')), `ensayo +${m}`).toHaveLength(1)
    al.config.set('estado_cadena', 'encendida')
    expect(v21(await relojDeLaCadena(al, { ...VIG, seco: true }, mas(60))).filter((l) => l.includes('campana_sin_reloj'))).toHaveLength(1)
    expect(v21(await relojDeLaCadena(al, VIG, mas(90))).filter((l) => l.includes('campana_sin_reloj'))).toHaveLength(1) // la primera que sí se manda
    expect(v21(await relojDeLaCadena(al, VIG, mas(120))).filter((l) => l.includes('campana_sin_reloj'))).toHaveLength(0)
  })
  it('los avisos de EVENTO (una llamada que venció) no se tocan: salen siempre que ocurren', async () => {
    const al = almacen()
    const r = await abrirCampana(al, { workflow_id: 'wf-cadena', workflow_execution_id: 'e', client_id: A.clientId, seco: true }, T0)
    const id = (r.cuerpo.campana as { id: string }).id
    const { estrategiaPreparar } = await import('../index')
    await estrategiaPreparar(al, { workflow_id: 'wf-cadena', workflow_execution_id: 'e', campana_id: id }, T0)
    const out = await relojDeLaCadena(al, { ...VIG, seco: true }, mas(60 * 24))
    expect(JSON.stringify(out.cuerpo.alertas)).toContain('pasó su plazo')
  })
})

describe('los otros dos avisos de estado: barrido de atascadas y «no se pudo intentar retomar»', () => {
  it('barrido 2b: una campaña atascada avisa una vez; si la causa cambia, avisa de nuevo', async () => {
    const al = almacen()
    const r = await abrirCampana(al, { workflow_id: 'wf-cadena', workflow_execution_id: 'e', client_id: A.clientId, seco: true }, T0)
    const id = (r.cuerpo.campana as { id: string }).id
    const { estrategiaPreparar } = await import('../index')
    await estrategiaPreparar(al, { workflow_id: 'wf-cadena', workflow_execution_id: 'e', campana_id: id }, T0)
    al.corridas[al.corridas.length - 1].estado = 'fallida' // la última llamada murió y no hay ninguna en curso
    const atascada = (x: { cuerpo: Record<string, unknown> }) => lineasDe(x).filter((l) => l.includes('quedó en'))
    expect(atascada(await relojDeLaCadena(al, VIG, mas(0)))).toHaveLength(1)
    expect(atascada(await relojDeLaCadena(al, VIG, mas(30)))).toHaveLength(0)
    al.corridas[al.corridas.length - 1].estado = 'vencida' // otro motivo: el texto cambia
    expect(atascada(await relojDeLaCadena(al, VIG, mas(60)))).toHaveLength(1)
  })
  it('2c: «no se pudo intentar retomar» sale una vez mientras diga lo mismo', async () => {
    const al = almacen()
    const r = await abrirCampana(al, { workflow_id: 'wf-cadena', workflow_execution_id: 'e', client_id: A.clientId, seco: true }, T0)
    const id = (r.cuerpo.campana as { id: string }).id
    const c = al.campanas.find((x) => x.id === id)!
    c.estado = 'necesita_humano'
    al.filasGuardadas.push({ id: 's1-d1-a', campana_id: id, calendario_version: 1, tanda: 1, estado: 'propuesta' } as never)
    al.hallazgosQueBloquean = async () => { throw new Error('la base no contestó') }
    const no = (x: { cuerpo: Record<string, unknown> }) => lineasDe(x).filter((l) => l.includes('no se pudo intentar retomar'))
    expect(no(await relojDeLaCadena(al, VIG, mas(0)))).toHaveLength(1)
    expect(no(await relojDeLaCadena(al, VIG, mas(30)))).toHaveLength(0)
    al.hallazgosQueBloquean = async () => { throw new Error('otro error distinto') }
    expect(no(await relojDeLaCadena(al, VIG, mas(60)))).toHaveLength(1)
  })
})

describe('resumen semanal: una vez por día', () => {
  it('con el vigía cada 30 min el lunes sale UN resumen; el lunes siguiente, otro', async () => {
    const al = almacen()
    await campanaPausadaSinReloj(al)
    const resumenes = async (min: number) => lineasDe(await relojDeLaCadena(al, { ...VIG, resumen: true }, mas(min))).filter((l) => l.startsWith('resumen:'))
    expect(await resumenes(0)).toHaveLength(1)
    for (let m = 30; m < 6 * 60; m += 30) expect(await resumenes(m), `+${m}`).toHaveLength(0)
    expect(await resumenes(7 * 24 * 60)).toHaveLength(1)
  })
  it('sin pedirlo (`resumen` ausente) no hay resumen; y un resumen no enviado (seco) no gasta el del día', async () => {
    const al = almacen()
    await campanaPausadaSinReloj(al)
    expect(lineasDe(await relojDeLaCadena(al, VIG, mas(0))).some((l) => l.startsWith('resumen:'))).toBe(false)
    expect(lineasDe(await relojDeLaCadena(al, { ...VIG, resumen: true, seco: true }, mas(30))).some((l) => l.startsWith('resumen:'))).toBe(true)
    expect(lineasDe(await relojDeLaCadena(al, { ...VIG, resumen: true }, mas(60))).some((l) => l.startsWith('resumen:'))).toBe(true)
  })
})
