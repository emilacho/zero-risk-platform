/**
 * JEFATURA · J7 · ESTRATEGIA y CALENDARIO (CC#1 · 14-oct) · el enganche dentro de los sub-flujos de la cadena, entre «④ ¿Termina?» y «⑤ Salida».
 * CONDICIÓN 4 de CC#3 («antes de pasar de paso»): el sub-flujo NO termina hasta que la revisión cierre (o se acabe el plazo); la puerta de la cadena solo sigue cuando el sub-flujo devuelve su salida.
 * Apagado = idéntico a hoy. La corrección que produzca la jefatura NO se aplica todavía (falta `guardar_revisada`): esa condición está escrita en el papel y en la salida (`correccion_aplicada: false`).
 */
import { describe, expect, it } from 'vitest'
import { validarEntrada } from '@/lib/jefatura/revision/contrato'
import { N } from '../scripts/worker-staging/jefatura-j7/gate.mjs'
import { antesDe, enganchaSubflujo, FLUJOS } from '../scripts/worker-staging/jefatura-j7/construir-enganches.mjs'
import { ejecutar, estructura, resp, UUID, type Json } from './_helpers/j7-flujos'

for (const tipo of ['estrategia', 'calendario'] as const) {
  describe(`J7 · ${tipo} (${FLUJOS[tipo].id}) · dentro del sub-flujo, entre «④ ¿Termina?» y «⑤ Salida»`, () => {
    const antes = antesDe(FLUJOS[tipo].id) as Json
    const despues = enganchaSubflujo(antes, tipo) as Json
    estructura(tipo, antes, despues, { desde: '④ ¿Termina?', salida: 0, retocados: ['⑤ Salida'] })

    const run = { client_id: UUID, task: 'TAREA · manual + plan + reglas del ' + tipo }
    const objeto = tipo === 'estrategia' ? { pilares: [{ nombre: 'Cercanía' }], patron_semanal: [{ slot: 'a' }], fechas_que_importan: [] } : { piezas: [{ id: 'p1' }], ajustes_al_patron: [] }
    const base = (o: Json = {}): Json => ({ paso: tipo, campana_id: 'camp-1', seco: false, tanda: tipo === 'calendario' ? 2 : null, simulacro: null, vuelta: 1, correccion: null, workflow_id: 'WF', workflow_execution_id: 'EX', corrida_id: 77, fin: true, resultado: 'ok', alerta: null, fichas: [], detalle: { ok: true, version: 3, fechas_pedidas: [], avisos: ['aviso uno'] }, ...o })
    const previos = { '③ Armar guardar': { guardar: { resultado: { success: true, structured_output: objeto } } }, '① ¿Qué dijo?': { run_sdk: run } }
    const correr = (flujo: Json, item: Json, http: Json = {}) => ejecutar(flujo, { inicio: '④ ¿Termina?', items: [item], previos, http, reales: ['⑤ Salida'] })
    const noAbre = { [N.abrir]: () => resp(409, { error: 'jefatura_no_abre', motivo: 'tipo_no_activo' }) }
    const cierra = (o: Json = {}) => ({ [N.abrir]: () => resp(200, { accion: 'cerrado', revision_id: UUID, resultado: 'con_desacuerdo', salida: { revision_id: UUID, resultado: 'con_desacuerdo', marcas: { con_desacuerdo: true, sin_segunda_mirada: false }, desacuerdos: ['el patrón semanal no sigue el plan'], costo_usd: 0.4, simulado: false, ...o } }) })
    const salidaDe = (d: Json) => d.visitas.find((v: Json) => v.nodo === '⑤ Salida').salida[0]

    it('«⑤ Salida» sin revisión devuelve lo MISMO que sin el enganche (el retoque solo suma `jefatura` cuando existe)', async () => {
      const a = await correr(antes, base()); const d = await correr(despues, base(), noAbre)
      expect(salidaDe(d)).toEqual(salidaDe(a))
      expect('jefatura' in salidaDe(d)).toBe(false)
    })
    for (const [caso, h] of [['tipo no activo (409)', noAbre[N.abrir]], ['500 de la ruta', () => resp(500, { error: 'x' })], ['corte de red', () => ({ error: { message: 'timeout' } })], ['401', () => resp(401, {})]] as Array<[string, () => Json]>) {
      it(`${caso}: la salida del sub-flujo es idéntica a hoy`, async () => {
        const a = await correr(antes, base()); const d = await correr(despues, base(), { [N.abrir]: h })
        expect(salidaDe(d)).toEqual(salidaDe(a))
      })
    }
    describe('solo se revisa lo que terminó BIEN', () => {
      for (const [caso, item] of [
        ['necesita humano (regla 8: la jefatura no lo pasa por encima)', base({ resultado: 'necesita_humano', alerta: 'x' })],
        ['ya hecha', base({ resultado: 'ya_hecha' })],
        ['seco ausente', (() => { const b = base(); delete b.seco; return b })()],
        ['seco como texto', base({ seco: 'false' })],
        ['sin corrida_id', (() => { const b = base(); delete b.corrida_id; return b })()],
      ] as Array<[string, Json]>) {
        it(`${caso}: no abre y no llama a la ruta`, async () => {
          const a = await correr(antes, item); const d = await correr(despues, item, { [N.abrir]: () => { throw new Error('NO debía llamarse') } })
          expect(d.llamadasHttp.length).toBe(0)
          expect(salidaDe(d)).toEqual(salidaDe(a))
        })
      }
    })
    it('lo que manda es una entrada VÁLIDA de la ruta: tipo, artefacto único por corrida, cliente del pedido, el pedido como documento «contra qué», dry_run = seco', async () => {
      const d = await correr(despues, base({ seco: true }), noAbre)
      const l = d.llamadasHttp.find((x: Json) => x.nodo === N.abrir)
      expect(validarEntrada(l.cuerpo).ok).toBe(true)
      expect(l.cuerpo.artifact_type).toBe(tipo)
      expect(l.cuerpo.artifact_id).toBe(tipo === 'calendario' ? 'camp-1:calendario:t2:c77' : 'camp-1:estrategia:c77')
      expect(l.cuerpo.client_id).toBe(UUID)
      expect(l.cuerpo.payload.dry_run).toBe(true)
      expect(JSON.parse(l.cuerpo.payload.texto)).toEqual(objeto)
      expect(l.cuerpo.payload.contexto).toHaveLength(1)
      expect(l.cuerpo.payload.contexto[0].texto).toBe(run.task)
      expect(l.cuerpo.payload.chequeos_previos).toEqual({ pasaron: true, necesita_humano: false, marcas: ['aviso uno'] })
      expect(l.cuerpo.payload.devolver_a.tipo).toBe('ninguno')
    })
    it('con la revisión cerrada: la salida del sub-flujo suma `jefatura` (sin tocar nada más) y la corrección queda SIN aplicar', async () => {
      const a = await correr(antes, base()); const d = await correr(despues, base(), cierra())
      const { jefatura, ...resto } = salidaDe(d)
      expect(resto).toEqual(salidaDe(a))
      expect(jefatura).toEqual({ revision_id: UUID, resultado: 'con_desacuerdo', con_desacuerdo: true, sin_segunda_mirada: false, desacuerdos: ['el patrón semanal no sigue el plan'], costo_usd: 0.4, simulado: false, correccion_aplicada: false })
    })
    it('el sub-flujo NO termina hasta que la revisión cierra: «⑤ Salida» se ejecuta DESPUÉS de leer el cierre (condición 4)', async () => {
      let k = 0
      const d = await correr(despues, base(), {
        [N.abrir]: () => resp(200, { accion: 'esperar', revision_id: UUID, turno: { n: 1, tipo: 'agente', paso: 'revision_fondo', pedido: {} } }),
        [N.despertar]: () => resp(200, {}),
        [N.leer]: () => { k += 1; return k < 3 ? resp(200, { revision_id: UUID, estado: 'en_paso' }) : resp(200, { revision_id: UUID, estado: 'cerrada', salida: { resultado: 'limpia', marcas: {}, desacuerdos: [], costo_usd: 0.1, simulado: false } }) },
      })
      const orden = d.nombres as string[]
      expect(orden.indexOf('⑤ Salida')).toBeGreaterThan(orden.lastIndexOf(N.leer))
      expect(k).toBe(3)
      expect(salidaDe(d).jefatura.resultado).toBe('limpia')
    })
    it('plazo: si no cierra a tiempo el sub-flujo sale idéntico a hoy (lo que llegue tarde no se guarda)', async () => {
      const a = await correr(antes, base())
      const d = await correr(despues, base(), {
        [N.abrir]: () => resp(200, { accion: 'esperar', revision_id: UUID, turno: { n: 1, tipo: 'agente', paso: 'revision_fondo', pedido: {} } }),
        [N.despertar]: () => resp(200, {}), [N.leer]: () => resp(200, { revision_id: UUID, estado: 'en_paso' }),
      })
      expect(salidaDe(d)).toEqual(salidaDe(a))
      expect(d.reloj - 1_700_000_000_000).toBeGreaterThanOrEqual((tipo === 'estrategia' ? 1200 : 1500) * 1000 - 90_000)
    })
    it('la entrada «① ¿Termina?» (nada nuevo que revisar) NO pasa por la puerta', () => {
      expect(despues.connections['① ¿Termina?']).toEqual(antes.connections['① ¿Termina?'])
    })
  })
}
