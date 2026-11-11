/**
 * 11-nov · ADENDA 3 de CC7 sobre #1019 · el freno por campaña NO guarda lugar para las filas sin familia (nunca salen del lote: no son gasto por venir) · US$ 0, sin red.
 * Caso real (W46 de Náufrago): 4 filas de `anuncio_imagen` reservaban el tope más alto (US$ 5 c/u) y retenían piezas reales.
 * La tabla de formatos es la REAL (siembra + familias de las migraciones), como en `formatos-sin-familia.test.ts`.
 * Dos clientes de rubros distintos: Náufrago (restaurante · anuncio de Instagram) y Seguridad Industrial (B2B · texto de LinkedIn). Fechas en 2099: «desde hoy» no envejece.
 */
import { beforeEach, describe, expect, it } from 'vitest'
import { filasAutoproducir } from '../autoproducir'
import { AlmacenMemoria } from '../__fixtures__/almacen-memoria'
import { formatosDeLaMigracion } from '../__fixtures__/clientes'
import type { FormatosPorRed } from '../tipos'
import { decidirPuerta, TARGET_STEP_PRODUCIR, type ConfigDeOficina, type Sobre } from '@/lib/oficina/sobre'
import { configDesdeLaFila } from '@/lib/oficina/gasto-de-encargos'

beforeEach(() => { process.env.INTERNAL_API_KEY = 'k-interna' })

function formatosReales(): FormatosPorRed {
  const t = formatosDeLaMigracion()
  for (const [red, xs] of Object.entries(t)) for (const x of xs) {
    if (x.formato === 'foto') x.familia = 'post_img'
    else if (x.formato === 'carrusel') x.familia = 'carrusel_ig_v1'
    else if (x.formato === 'historia' || x.formato === 'estado') x.familia = 'kit_historias'
    else if (x.produccion === 'espera_brazo' && ['reel', 'video', 'short'].includes(x.formato) && !(red === 'youtube' && x.formato === 'video')) x.familia = 'video_mesa'
  }
  return t
}

const PARTE = '22222222-2222-4222-8222-222222222222'
const WF = { workflow_id: 'wf-copia-por-filas', workflow_execution_id: 'ex-1' }
const CLIENTES = [
  ['Náufrago (restaurante)', { client: '0a2ffbd4-957c-4315-a37f-b9e4fbbbb312', sin: { red: 'instagram', formato: 'anuncio_imagen' }, con: { red: 'instagram', formato: 'foto' } }],
  ['Seguridad Industrial (B2B)', { client: 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5', sin: { red: 'linkedin', formato: 'texto' }, con: { red: 'linkedin', formato: 'foto' } }],
] as const

describe.each(CLIENTES)('%s · el freno y las filas sin familia', (_n, C) => {
  /** el parte de hoy trae UNA pieza (B1 · foto del día 14, US$ 2,50); antes en el calendario va la fila `f0` (sin parte) con el formato que se pida */
  async function montar(tope: number, f0: { red: string; formato: string } | null, formatos: FormatosPorRed = formatosReales(), oficina?: ConfigDeOficina | Error) {
    const al = new AlmacenMemoria({ partes: [{ id: PARTE, client_id: C.client, valido: true, briefs: [{ brief_id: 'B1', fila_id: 'f1', familia: 'post_img' }] }], config: { flujos: ['wf-copia-por-filas'], estado_cadena: 'encendida' } })
    al.formatos = async () => formatos
    if (oficina) (al as unknown as { configDeLaOficina: () => Promise<ConfigDeOficina> }).configDeLaOficina = async () => { if (oficina instanceof Error) throw oficina; return { sin_pasarela: ['video_mesa'], ...oficina } /* fila #19 · dato: la plantilla video_mesa es de clase video */ }
    const c = await al.insertarCampana({ client_id: C.client, plan_id: 'plan-1', fecha_inicio: '2099-11-09', fecha_inicio_origen: 'regla', fecha_fin: '2099-12-20', zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: [], estado: 'activa', estado_motivo: null,
      presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: true, sala_ref: {}, reemplaza_a: null, seco: false, tope_gasto_usd: tope })
    al.lecturaDeGasto = { corridas: [{ costo_usd: 26.28, estado: 'ok', paso: 'estrategia' }] } // construido: lo gastado de Náufrago
    const fila = (id: string, fecha: string, x: { red: string; formato: string }) => ({ id, fecha, hora: '09:00', estado: 'validada', ...x, avisos: [], campana_id: c.id, calendario_version: 1 }) as any
    al.filasGuardadas.push(fila('f1', '2099-11-14', C.con), ...(f0 ? [fila('f0', '2099-11-12', f0)] : []))
    return { al, c }
  }
  const llamar = async (tope: number, f0: { red: string; formato: string } | null, formatos?: FormatosPorRed, oficina?: ConfigDeOficina | Error) => {
    const { al, c } = await montar(tope, f0, formatos, oficina)
    return (await filasAutoproducir(al, { campana_id: c.id, parte_id: PARTE, dry_run: false, ...WF })).cuerpo
  }

  it('🔴 una fila sin familia ANTES en el calendario no guarda lugar: el freno decide igual que si no existiera', async () => {
    // tope 32: 26,28 + 2,50 (B1) = 28,78 → cabe. Si la fila sin familia guardara el tope más alto (5): 33,78 → cortaría
    const conLaFila = await llamar(32, C.sin)
    const sinLaFila = await llamar(32, null)
    expect(conLaFila).toMatchObject({ emite: true, emitidos: 1, tope: { decision: 'cabe', retenidas: [] } })
    expect(conLaFila.tope).toEqual(sinLaFila.tope)
  })
  it('🔴 sabotaje · una fila CON familia antes en el calendario sigue guardando su lugar (el freno no se afloja de más)', async () => {
    // tope 31: 26,28 + 2,50 (lugar de la foto f0) + 2,50 (B1) = 31,28 > 31 → B1 espera
    expect(await llamar(31, C.con)).toMatchObject({ emitidos: 0, tope: { decision: 'corta', retenidas: ['B1'] } })
    // la misma cuenta con la fila sin familia: 28,78 ≤ 31 → sale
    expect(await llamar(31, C.sin)).toMatchObject({ emitidos: 1, tope: { decision: 'cabe' } })
  })
  it('una tabla sin ninguna familia no juzga: la fila sigue guardando lugar como hoy (con el tope más alto)', async () => {
    expect(await llamar(32, C.sin, formatosDeLaMigracion())).toMatchObject({ emitidos: 0, tope: { decision: 'corta', retenidas: ['B1'] } })
  })
// ── la familia INACTIVA (GO Lenovo 01:10Z): la misma puerta y la misma config que la oficina (`configDeLaPuerta`)
  const REEL = { red: 'instagram', formato: 'reel' } // familia video_mesa: sin pieza simple detrás
  const encendida = (familias: string[]): ConfigDeOficina => ({ estado: 'encendida', familias_activas: familias, clientes_ensayo: [] })
  const HOY = ['post_img', 'carrusel_ig_v1', 'kit_historias', 'carrusel_mesa'] // las activas de hoy (lectura de CC7)
  it('🔴 un reel cuya familia (video_mesa) la oficina NO abre no guarda lugar: igual que si no existiera', async () => {
    const conReel = await llamar(32, REEL, undefined, encendida(HOY))
    expect(conReel).toMatchObject({ emitidos: 1, tope: { decision: 'cabe' } })
    expect(conReel.tope).toEqual((await llamar(32, null, undefined, encendida(HOY))).tope)
  })
  it('🔴 sabotaje · con video_mesa ACTIVA el reel sí se produce y guarda su lugar (tope más alto, 5)', async () => {
    expect(await llamar(32, REEL, undefined, encendida([...HOY, 'video_mesa']))).toMatchObject({ emitidos: 0, tope: { decision: 'corta', retenidas: ['B1'] } })
  })
  it('🔴 (CC7 · 1) una familia inactiva CON pieza simple se produce igual (por la pasarela): sigue guardando lugar', async () => {
    // la foto (post_img) fuera de familias_activas: la oficina no la abre, pero va a la pieza simple → se produce → reserva 2,50
    expect(await llamar(31, C.con, undefined, encendida(['carrusel_mesa']))).toMatchObject({ emitidos: 0, tope: { decision: 'corta', retenidas: ['B1'] } })
  })
  it('oficina apagada, o el cliente fuera del ensayo: el reel tampoco se produce (no guarda lugar)', async () => {
    expect(await llamar(32, REEL, undefined, { estado: 'apagada', familias_activas: [...HOY, 'video_mesa'], clientes_ensayo: [] })).toMatchObject({ emitidos: 1, tope: { decision: 'cabe' } })
    expect(await llamar(32, REEL, undefined, { estado: 'ensayo', familias_activas: [...HOY, 'video_mesa'], clientes_ensayo: ['otro-cliente'] })).toMatchObject({ emitidos: 1, tope: { decision: 'cabe' } })
    // y si el cliente SÍ está en el ensayo, se produce y reserva
    expect(await llamar(32, REEL, undefined, { estado: 'ensayo', familias_activas: [...HOY, 'video_mesa'], clientes_ensayo: [C.client] })).toMatchObject({ emitidos: 0, tope: { decision: 'corta' } })
  })
  it('🔴 (CC7 · 2) si la config de la oficina no se puede leer, el reel sigue guardando lugar como hoy (del lado seguro; el error NO es «inactiva»)', async () => {
    expect(await llamar(32, REEL, undefined, new Error('la config de la oficina no contesta'))).toMatchObject({ emitidos: 0, tope: { decision: 'corta', retenidas: ['B1'] } })
    // sin el puerto (almacén viejo): igual que hoy
    expect(await llamar(32, REEL)).toMatchObject({ emitidos: 0, tope: { decision: 'corta', retenidas: ['B1'] } })
  })
})

// ── 🟡 de CC7 sobre #1021 (ADENDA 1): la normalización COMPARTIDA (la usan la puerta de la oficina y el freno) no puede leer «ensayo» como «encendida»
describe('la config compartida de la puerta · el estado de ensayo', () => {
  const CLIENTE = 'df7e47cc-bec4-4fa2-bc24-ff97ba5213a5'
  const puerta = (estado: string, clientes: string[]) => decidirPuerta({ familia: 'post_img' } as Sobre, configDesdeLaFila({ estado, familias_activas: ['post_img'], clientes_ensayo: clientes }), TARGET_STEP_PRODUCIR, CLIENTE).accion
  it('🔴 «ensayo» se lee como ensayo (ni encendida ni apagada)', () => {
    expect(configDesdeLaFila({ estado: 'ensayo', familias_activas: ['post_img'], clientes_ensayo: [CLIENTE] })).toEqual({ estado: 'ensayo', familias_activas: ['post_img'], clientes_ensayo: [CLIENTE] })
    expect(configDesdeLaFila({ estado: 'encendida', familias_activas: [], clientes_ensayo: [] }).estado).toBe('encendida')
  })
  it('🔴 en ensayo la puerta NO abre para un cliente fuera de clientes_ensayo; sí para uno dentro; encendida abre para todos', () => {
    expect(puerta('ensayo', ['otro-cliente'])).toBe('pasarela')
    expect(puerta('ensayo', [CLIENTE])).toBe('abrir')
    expect(puerta('encendida', [])).toBe('abrir')
  })
})

// ── GO Lenovo 01:59Z · la MISMA regla en las piezas del parte actual (`candidatas`) y en las retenidas de otros partes (`esperandoPorVenir`)
describe.each(CLIENTES)('%s · el freno no cuenta lo que no se produce · parte actual y otros partes', (_n, C) => {
  const encendida = (familias: string[]): ConfigDeOficina => ({ estado: 'encendida', familias_activas: familias, clientes_ensayo: [] })
  const HOY = ['post_img', 'carrusel_ig_v1', 'kit_historias', 'carrusel_mesa']
  /** B1 (foto del 14, US$ 2,50) en el parte de hoy · `R` = otro brief (fila `fr`, día 12, ANTES de B1) en este parte o en OTRO parte real todavía no recibido por la sala */
  async function llamar(tope: number, R: { familia: string | null; donde: 'este' | 'otro' }, oficina?: ConfigDeOficina | Error) {
    const briefs = [{ brief_id: 'B1', fila_id: 'f1', familia: 'post_img' }, ...(R.donde === 'este' ? [{ brief_id: 'R1', fila_id: 'fr', familia: R.familia }] : [])]
    const al = new AlmacenMemoria({ partes: [{ id: PARTE, client_id: C.client, valido: true, briefs: briefs as any }], config: { flujos: ['wf-copia-por-filas'], estado_cadena: 'encendida' } })
    al.formatos = async () => formatosReales()
    if (oficina) (al as unknown as { configDeLaOficina: () => Promise<ConfigDeOficina> }).configDeLaOficina = async () => { if (oficina instanceof Error) throw oficina; return { sin_pasarela: ['video_mesa'], ...oficina } /* fila #19 · dato: la plantilla video_mesa es de clase video */ }
    const c = await al.insertarCampana({ client_id: C.client, plan_id: 'plan-1', fecha_inicio: '2099-11-09', fecha_inicio_origen: 'regla', fecha_fin: '2099-12-20', zona_horaria: 'America/Guayaquil', pais: 'EC', sedes: [], estado: 'activa', estado_motivo: null,
      presupuesto_planificacion_usd: 6, ventana_parte_dias: 10, sustituir_video_por: 'ninguna', autoproducir: true, sala_ref: {}, reemplaza_a: null, seco: false, tope_gasto_usd: tope })
    al.lecturaDeGasto = { corridas: [{ costo_usd: 26.28, estado: 'ok', paso: 'estrategia' }], ...(R.donde === 'otro' ? { partes: [{ id: 'P-OTRO', briefs: [{ brief_id: 'R9', familia: R.familia, fila_id: 'fr' }] }] } : {}) }
    const fila = (id: string, fecha: string, x: { red: string; formato: string }) => ({ id, fecha, hora: '09:00', estado: 'validada', ...x, avisos: [], campana_id: c.id, calendario_version: 1 }) as any
    al.filasGuardadas.push(fila('f1', '2099-11-14', C.con), fila('fr', '2099-11-12', { red: 'instagram', formato: 'reel' }))
    const r = (await filasAutoproducir(al, { campana_id: c.id, parte_id: PARTE, dry_run: false, ...WF })).cuerpo as any
    return { ...r, salieron: (r.sobres ?? []).map((s: { brief_id: string }) => s.brief_id).sort() }
  }
  // tope 32: 26,28 + 2,50 (B1) = 28,78 cabe · si el reel contara su tope (5, el más alto): 26,28 + 5 + 2,50 = 33,78 → B1 se cortaría

  it('🔴 parte actual · un reel sin sala sale como hoy, pero no cuesta: no le quita el lugar a la foto', async () => {
    const r = await llamar(32, { familia: 'video_mesa', donde: 'este' }, encendida(HOY))
    expect(r).toMatchObject({ emitidos: 2, tope: { decision: 'cabe', estimado: 2.5, retenidas: [] } })
    expect(r.salieron).toEqual(['B1', 'R1'])
  })
  it('🔴 sabotaje · parte actual · con video_mesa ACTIVA el reel se produce y cuesta: la foto espera', async () => {
    expect(await llamar(32, { familia: 'video_mesa', donde: 'este' }, encendida([...HOY, 'video_mesa']))).toMatchObject({ emitidos: 1, salieron: ['R1'], tope: { decision: 'corta', estimado: 5, retenidas: ['B1'] } })
  })
  it('🔴 parte actual · una familia inactiva CON pieza simple (pasarela) sí cuesta; sin config legible, el reel cuesta como hoy', async () => {
    // la foto R1 (post_img) fuera de las activas va por la pasarela: se produce, cuesta 2,50 → 26,28 + 2,50 + 2,50 = 31,28 > 31
    expect(await llamar(31, { familia: 'post_img', donde: 'este' }, encendida(['carrusel_mesa']))).toMatchObject({ emitidos: 1, tope: { decision: 'corta', retenidas: ['B1'] } })
    expect(await llamar(32, { familia: 'video_mesa', donde: 'este' }, new Error('no contesta'))).toMatchObject({ emitidos: 1, tope: { decision: 'corta', retenidas: ['B1'] } })
    expect(await llamar(32, { familia: 'video_mesa', donde: 'este' })).toMatchObject({ emitidos: 1, tope: { decision: 'corta', retenidas: ['B1'] } })
  })
  it('🔴 otro parte · un reel retenido sin sala no guarda lugar: la foto de hoy sale', async () => {
    expect(await llamar(32, { familia: 'video_mesa', donde: 'otro' }, encendida(HOY))).toMatchObject({ emitidos: 1, salieron: ['B1'], tope: { decision: 'cabe', comprometido: 0 } })
  })
  it('🔴 sabotaje · otro parte · con video_mesa ACTIVA, o sin config legible, el reel retenido guarda su lugar', async () => {
    expect(await llamar(32, { familia: 'video_mesa', donde: 'otro' }, encendida([...HOY, 'video_mesa']))).toMatchObject({ emitidos: 0, tope: { decision: 'corta', retenidas: ['B1'] } })
    expect(await llamar(32, { familia: 'video_mesa', donde: 'otro' }, new Error('no contesta'))).toMatchObject({ emitidos: 0, tope: { decision: 'corta', retenidas: ['B1'] } })
  })
  it('otro parte · un brief SIN familia va por la pasarela (se produce): sigue guardando lugar con la cota pesimista', async () => {
    expect(await llamar(32, { familia: null, donde: 'otro' }, encendida(HOY))).toMatchObject({ emitidos: 0, tope: { decision: 'corta', retenidas: ['B1'] } })
  })
  it('el cliente fuera del ensayo: el reel no se produce (no cuesta); dentro del ensayo, sí', async () => {
    const ensayo = (clientes: string[]): ConfigDeOficina => ({ estado: 'ensayo', familias_activas: [...HOY, 'video_mesa'], clientes_ensayo: clientes })
    expect(await llamar(32, { familia: 'video_mesa', donde: 'otro' }, ensayo(['otro-cliente']))).toMatchObject({ emitidos: 1, tope: { decision: 'cabe' } })
    expect(await llamar(32, { familia: 'video_mesa', donde: 'este' }, ensayo([C.client]))).toMatchObject({ emitidos: 1, tope: { decision: 'corta', retenidas: ['B1'] } })
  })
})
