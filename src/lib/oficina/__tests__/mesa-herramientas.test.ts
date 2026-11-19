import { describe, expect, it } from 'vitest'
import { abrirEncargo } from '../orquestador'
import { registrarHerramienta, MAX_PEDIDOS_POR_AGENTE } from '../mesa/herramienta'
import { CARRUSEL_MESA } from '../plantillas/mesa'
import { TARGET_STEP_PRODUCIR } from '../sobre'
import { CLIENTE, PARTE, crearMemoria } from './memoria'
import { crearMesaEnMemoria } from './mesa-memoria'
import { TOPE_DE_LO_ESCRITO } from '../../limites-de-tamano'

const BRIEF = `### BRF-0100 · Instagram · carrusel
- QUÉ ES: Carrusel de 5 láminas
- PROTAGONISTA: El plato del día.
- LÍMITES: 4:5
- VISUAL: El plato aparece completo.
- LLAMADO A LA ACCIÓN: Escríbenos
`
const parte = `# PARTE DE TRABAJO\nPlan de origen: 29d6daeb-a95a-4328-9c10-cf3cddc236f7 · Manual: versión 1\n\n## Entregables\n\n${BRIEF}\n### BRF-9999 · Instagram · imagen\n- QUÉ ES: otro\n`

/** abre la pieza y deja el turno de la dirección abierto (la dirección es quien llama) */
async function preparado() {
  const M = crearMemoria({ parte, plantilla: CARRUSEL_MESA })
  const MS = crearMesaEnMemoria()
  M.P.mesa = MS
  const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'carrusel_mesa' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
  return { M, MS, id: String(a.cuerpo.encargo_id), turno: a.cuerpo.turno as { agente: string } }
}
const llamar = (M: Awaited<ReturnType<typeof preparado>>['M'], o: Record<string, unknown>) => registrarHerramienta(M.P, o)

describe('LA MESA · herramientas del tablero', () => {
  it('mesa_pedir anota el pedido del agente del turno, con su referencia; uno repetido no se anota dos veces', async () => {
    const { M, MS, id, turno } = await preparado()
    const r1 = await llamar(M, { herramienta: 'mesa_pedir', encargo_id: id, de: turno.agente, a: 'content-creator', que: 'tres titulares para el hook', para_que: 'abrir la pieza' })
    expect(r1.cuerpo).toMatchObject({ ok: true, para: 'content-creator' })
    const r2 = await llamar(M, { herramienta: 'mesa_pedir', encargo_id: id, de: turno.agente, a: 'content-creator', que: 'tres  titulares para el HOOK', para_que: 'abrir la pieza' })
    expect(r2.cuerpo).toMatchObject({ ok: true, duplicado: true })
    expect(MS.filas.filter((f) => f.tipo === 'pide')).toHaveLength(1)
  })

  it('pedir_material le escribe al portero; sin portero en el directorio responde ok:false (nunca éxito falso)', async () => {
    const { M, MS, id, turno } = await preparado()
    const r = await llamar(M, { herramienta: 'pedir_material', encargo_id: id, de: turno.agente, que: 'el precio vigente del plato' })
    expect(r.cuerpo).toMatchObject({ ok: true, para: 'portero' })
    expect(MS.filas.at(-1)).toMatchObject({ tipo: 'pide', para: 'portero' })
    const est = M.encargos.get(id)!.estado_del_motor.artefactos.mesa.datos as { directorio_congelado: Array<{ rol: string; activo: boolean }> }
    est.directorio_congelado.forEach((t) => { if (t.rol === 'portero') t.activo = false })
    const r2 = await llamar(M, { herramienta: 'pedir_material', encargo_id: id, de: turno.agente, que: 'otra cosa' })
    expect(r2.cuerpo).toMatchObject({ ok: false })
  })

  it('fuera de turno, otro agente, compañero que no existe, a uno mismo o al portero por la vía equivocada: no se anota nada', async () => {
    const { M, MS, id, turno } = await preparado()
    expect((await llamar(M, { herramienta: 'mesa_pedir', encargo_id: id, de: 'content-creator', a: 'carousel-designer', que: 'algo' })).status).toBe(409)
    expect((await llamar(M, { herramienta: 'mesa_pedir', encargo_id: id, de: turno.agente, a: 'nadie', que: 'algo' })).cuerpo).toMatchObject({ ok: false })
    expect((await llamar(M, { herramienta: 'mesa_pedir', encargo_id: id, de: turno.agente, a: turno.agente, que: 'algo' })).cuerpo).toMatchObject({ ok: false })
    expect((await llamar(M, { herramienta: 'mesa_pedir', encargo_id: id, de: turno.agente, a: 'portero', que: 'algo' })).cuerpo).toMatchObject({ ok: false })
    expect((await llamar(M, { herramienta: 'inventada', encargo_id: id, de: turno.agente })).status).toBe(400)
    expect((await llamar(M, { herramienta: 'mesa_pedir', encargo_id: 'no-existe', de: turno.agente, a: 'content-creator', que: 'algo' })).status).toBe(404)
    expect(MS.filas).toHaveLength(0)
  })

  it('mesa_devolver exige que el compañero ya tenga un aporte; y hay un tope de pedidos por agente', async () => {
    const { M, MS, id, turno } = await preparado()
    expect((await llamar(M, { herramienta: 'mesa_devolver', encargo_id: id, de: turno.agente, a: 'content-creator', comentarios: 'ajusta el tono' })).cuerpo).toMatchObject({ ok: false })
    for (let i = 0; i < MAX_PEDIDOS_POR_AGENTE + 2; i++) await llamar(M, { herramienta: 'mesa_pedir', encargo_id: id, de: turno.agente, a: ['content-creator', 'carousel-designer'][i % 2], que: `pedido distinto número ${i}` })
    expect(MS.filas.filter((f) => f.de === turno.agente)).toHaveLength(MAX_PEDIDOS_POR_AGENTE)
  })

  // 19-nov · G8 (2) · GO Lenovo 10:36 · «nada se recorta»: antes el pedido llegaba a 600/800, el «para qué» a 300 y los comentarios a 1500, cortados en silencio
  const largo = (fin: string, n: number) => `${'Necesito el dato exacto del precio vigente y la foto del plato tal como se sirve hoy en la sede. '.repeat(n)}${fin}`
  it('mesa_pedir anota el pedido y el «para qué» ENTEROS, también el final de uno largo', async () => {
    const { M, MS, id, turno } = await preparado()
    const que = largo('FIN-DEL-PEDIDO', 12), paraQue = largo('FIN-DEL-PARA-QUE', 5)
    expect(que.length).toBeGreaterThan(800)
    expect(paraQue.length).toBeGreaterThan(300)
    expect((await llamar(M, { herramienta: 'mesa_pedir', encargo_id: id, de: turno.agente, a: 'content-creator', que, para_que: paraQue })).cuerpo).toMatchObject({ ok: true })
    expect(MS.filas.at(-1)!.texto).toBe(`${que} (para: ${paraQue})`)
  })
  it('pedir_material le lleva al portero el pedido y el «para qué» ENTEROS', async () => {
    const { M, MS, id, turno } = await preparado()
    const que = largo('FIN-DEL-MATERIAL', 8), paraQue = largo('FIN-DEL-PARA-QUE', 4)
    expect(que.length).toBeGreaterThan(600)
    expect((await llamar(M, { herramienta: 'pedir_material', encargo_id: id, de: turno.agente, que, para_que: paraQue })).cuerpo).toMatchObject({ ok: true, para: 'portero' })
    expect(MS.filas.at(-1)!.texto).toBe(`${que} (para: ${paraQue})`)
  })
  it('mesa_devolver anota los comentarios ENTEROS', async () => {
    const { M, MS, id, turno } = await preparado()
    await MS.aportar({ encargo_id: id, de: 'content-creator', para: null, tipo: 'aporta', texto: 'tres titulares', refs: [], responde_a: null, profundidad: 0, costo_usd: 0, workflow_execution_id: null })
    const comentarios = largo('FIN-DE-LOS-COMENTARIOS', 18)
    expect(comentarios.length).toBeGreaterThan(1500)
    expect((await llamar(M, { herramienta: 'mesa_devolver', encargo_id: id, de: turno.agente, a: 'content-creator', comentarios })).cuerpo).toMatchObject({ ok: true })
    expect(MS.filas.at(-1)).toMatchObject({ tipo: 'devuelve', texto: comentarios })
  })
  it('encima del techo de lo escrito NO se recorta: ok:false con el motivo y no se anota nada', async () => {
    const { M, MS, id, turno } = await preparado()
    const enorme = 'x'.repeat(TOPE_DE_LO_ESCRITO + 1)
    for (const o of [{ herramienta: 'mesa_pedir', a: 'content-creator', que: enorme }, { herramienta: 'mesa_pedir', a: 'content-creator', que: 'tres titulares', para_que: enorme }, { herramienta: 'pedir_material', que: enorme }, { herramienta: 'pedir_material', que: 'el precio', para_que: enorme }]) {
      const r = await llamar(M, { ...o, encargo_id: id, de: turno.agente })
      expect(r.cuerpo).toMatchObject({ ok: false })
      expect(String(r.cuerpo.motivo)).toMatch(/no se recorta/)
    }
    expect(MS.filas.filter((f) => f.de === turno.agente)).toHaveLength(0)
    await MS.aportar({ encargo_id: id, de: 'content-creator', para: null, tipo: 'aporta', texto: 'tres titulares', refs: [], responde_a: null, profundidad: 0, costo_usd: 0, workflow_execution_id: null })
    expect((await llamar(M, { herramienta: 'mesa_devolver', encargo_id: id, de: turno.agente, a: 'content-creator', comentarios: enorme })).cuerpo).toMatchObject({ ok: false })
    expect(MS.filas.filter((f) => f.tipo === 'devuelve')).toHaveLength(0)
    // justo en el techo sí entra entero
    const justo = 'y'.repeat(TOPE_DE_LO_ESCRITO)
    expect((await llamar(M, { herramienta: 'mesa_devolver', encargo_id: id, de: turno.agente, a: 'content-creator', comentarios: justo })).cuerpo).toMatchObject({ ok: true })
    expect(MS.filas.at(-1)!.texto).toBe(justo)
  })

  it('un encargo de la oficina de siempre (familia v1) no tiene tablero: 409', async () => {
    const M = crearMemoria({ parte })
    M.P.mesa = crearMesaEnMemoria()
    const a = await abrirEncargo(M.P, { cuerpo: { parte_id: PARTE, brief_id: 'BRF-0100', dry_run: true, familia: 'post_img' }, client_id: CLIENTE, target_step_id: TARGET_STEP_PRODUCIR })
    const id = String(a.cuerpo.encargo_id ?? [...M.encargos.keys()][0])
    expect((await registrarHerramienta(M.P, { herramienta: 'mesa_pedir', encargo_id: id, de: 'x', a: 'y', que: 'zzz' })).status).toBe(409)
  })
})
