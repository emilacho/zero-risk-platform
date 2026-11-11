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
import type { ConfigDeOficina } from '@/lib/oficina/sobre'

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
    if (oficina) (al as unknown as { configDeLaOficina: () => Promise<ConfigDeOficina> }).configDeLaOficina = async () => { if (oficina instanceof Error) throw oficina; return oficina }
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
