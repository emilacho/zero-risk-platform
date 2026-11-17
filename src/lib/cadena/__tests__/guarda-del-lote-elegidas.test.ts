/**
 * «PRODUCIR ESTAS FILAS» · la guarda VIVA del flujo de brief («⓪ GUARDA · el lote», n8n BNXqlaX1oHSfZIpF) con el cambio de `scripts/ops/cadena-guarda-elegidas.mjs`.
 * El código de la guarda es la copia exacta de lo vivo leída el 17-nov (último cambio del flujo: 10-nov), corrida con `$` e `$input` falsos. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { ANTES, DESPUES, compila, guardaAntes, guardaDespues } from '../../../../scripts/ops/cadena-guarda-elegidas.mjs'

const VIVO = readFileSync(join(__dirname, '..', '__fixtures__', 'guarda-del-lote-vivo-2026-11-10.js.txt'), 'utf8')
const NUEVO: string = guardaDespues(VIVO)

const fila = (id: string, estado = 'validada') => ({ id, estado })
/** corre el cuerpo del nodo Code como n8n: `$('⓪ Sobre · llave · modo seco')` da el sobre; `$input` da la respuesta de `filas · listar` */
async function correr(codigo: string, o: { estado: string; fila_ids: string[]; elegidas?: string[]; filas?: Array<{ id: string; estado: string }> }) {
  const sobre = { client_id: 'C1', campana_id: 'K1', lote: 'elegidas-20261117T1130', fila_ids: o.fila_ids }
  const body = { campana: { client_id: 'C1', estado: o.estado, plan_id: 'P1' }, version: 1, filas: o.filas ?? [fila('f1'), fila('f2'), fila('f3', 'briefeada')], ...(o.elegidas ? { elegidas: o.elegidas } : {}) }
  const $ = () => ({ first: () => ({ json: sobre }) })
  const $input = { first: () => ({ json: { statusCode: 200, body } }) }
  const f = new Function('$', '$input', `return (async () => {\n${codigo}\n})()`)
  return f($, $input) as Promise<Array<{ json: Record<string, unknown> }>>
}

describe('la guarda del lote · el cambio es UNA línea y compila', () => {
  it('la línea vieja está exactamente una vez en lo vivo; el después compila; la reversa devuelve lo vivo byte a byte', () => {
    expect(VIVO.split(ANTES).length - 1).toBe(1)
    expect(() => compila(NUEVO)).not.toThrow()
    expect(NUEVO).toContain(DESPUES)
    expect(guardaAntes(NUEVO)).toBe(VIVO)
  })
  it('aplicar dos veces o revertir lo que no es el después se NIEGA (no toca un flujo distinto del leído)', () => {
    expect(() => guardaDespues(NUEVO)).toThrow(/aparece 0 veces/)
    expect(() => guardaAntes(VIVO)).toThrow(/no es el después/)
  })
})

describe('la guarda del lote · antes y después', () => {
  it('campaña ACTIVA: pasa igual que antes (con o sin `elegidas`)', async () => {
    for (const codigo of [VIVO, NUEVO]) {
      const r = await correr(codigo, { estado: 'activa', fila_ids: ['f1', 'f2'] })
      expect(r[0].json.lote_key).toBe('K1:elegidas-20261117T1130:1')
    }
  })
  it('campaña PAUSADA sin permisos: antes y después se detiene con PARTE_CAMPANA_NO_ACTIVA', async () => {
    await expect(correr(VIVO, { estado: 'pausada', fila_ids: ['f1'] })).rejects.toThrow(/PARTE_CAMPANA_NO_ACTIVA/)
    await expect(correr(NUEVO, { estado: 'pausada', fila_ids: ['f1'] })).rejects.toThrow(/PARTE_CAMPANA_NO_ACTIVA.*sin permiso/)
  })
  it('campaña PAUSADA con TODAS las filas elegidas: ahora pasa (antes no)', async () => {
    await expect(correr(VIVO, { estado: 'pausada', fila_ids: ['f1', 'f2'], elegidas: ['f1', 'f2'] })).rejects.toThrow(/PARTE_CAMPANA_NO_ACTIVA/)
    const r = await correr(NUEVO, { estado: 'pausada', fila_ids: ['f1', 'f2'], elegidas: ['f1', 'f2', 'f9'] })
    expect((r[0].json.filas_lote as unknown[]).length).toBe(2)
  })
  it('campaña PAUSADA con UNA fila sin permiso: se detiene el lote entero', async () => {
    await expect(correr(NUEVO, { estado: 'pausada', fila_ids: ['f1', 'f2'], elegidas: ['f1'] })).rejects.toThrow(/PARTE_CAMPANA_NO_ACTIVA/)
  })
  it('el permiso NO salta las otras guardas: una fila elegida ya briefeada sigue frenando con PARTE_LOTE_YA_BRIEFEADO', async () => {
    await expect(correr(NUEVO, { estado: 'pausada', fila_ids: ['f1', 'f3'], elegidas: ['f1', 'f3'] })).rejects.toThrow(/PARTE_LOTE_YA_BRIEFEADO/)
  })
  it('otro estado (cerrada, calendario) con `elegidas`: se detiene igual que antes', async () => {
    for (const estado of ['cerrada', 'calendario', 'necesita_humano']) await expect(correr(NUEVO, { estado, fila_ids: ['f1'], elegidas: ['f1'] })).rejects.toThrow(/PARTE_CAMPANA_NO_ACTIVA/)
  })
})
