/**
 * El almacén REAL de la oficina financiera (F2): lee el interruptor y guarda tableros con sus números. NADA de esto corre mientras la oficina esté apagada
 * (la puerta devuelve 409 antes). Recibe la base por parámetro para probarse sin red.
 */
import type { FilaDeNumero } from './firma'
import type { ConfigDeFinanzas, FilaDeTablero, PuertosDeTablero } from './ruta'

export type Db = { from(tabla: string): any }
type Fila = Record<string, unknown>

function ok<T>(r: { data: T; error: { message: string } | null }, que: string): T {
  if (r.error) throw new Error(`${que}: ${r.error.message}`)
  return r.data
}

export function almacenDeFinanzas(db: Db): PuertosDeTablero {
  return {
    async leerConfig(): Promise<ConfigDeFinanzas> {
      const r = ok(await db.from('finanzas_config').select('estado,clientes_ensayo,preguntas_slack,conversa').eq('id', 1).maybeSingle(), 'leer la configuración') as Fila | null
      // sin fila o con un valor raro: APAGADA (la dirección segura)
      const estado = r && ['apagada', 'ensayo', 'encendida'].includes(String(r.estado)) ? (String(r.estado) as ConfigDeFinanzas['estado']) : 'apagada'
      return {
        estado,
        clientes_ensayo: Array.isArray(r?.clientes_ensayo) ? (r!.clientes_ensayo as string[]) : [],
        preguntas_slack: r && ['apagado', 'borrador', 'envia'].includes(String(r.preguntas_slack)) ? (String(r.preguntas_slack) as ConfigDeFinanzas['preguntas_slack']) : 'apagado',
        conversa: r && ['apagado', 'ensayo', 'enciende'].includes(String(r.conversa)) ? (String(r.conversa) as ConfigDeFinanzas['conversa']) : 'apagado',
      }
    },
    async guardarTablero(t) {
      const previos = ok(await db.from('finanzas_tableros').select('id,version').eq('client_id', t.client_id).order('version', { ascending: false }).limit(1), 'leer la última versión') as Fila[] | null
      const version = previos?.[0] ? Number(previos[0].version) + 1 : 1
      const vig = (ok(await db.from('finanzas_tableros').select('id,estado').eq('client_id', t.client_id).eq('vigente', true).limit(1), 'leer el vigente') as Fila[] | null)?.[0] ?? null
      // el anterior vigente deja de serlo ANTES de insertar el nuevo (el índice único admite uno solo) …
      if (vig) ok(await db.from('finanzas_tableros').update({ vigente: false, estado: 'reemplazado' }).eq('id', vig.id), 'reemplazar el anterior')
      let id: string | null = null
      try {
        const fila = { client_id: t.client_id, version, vigente: true, estado: 'borrador', entrada: t.entrada, bloque: t.bloque, huella: t.huella, workflow_execution_id: t.workflow_execution_id, dry_run: false }
        const nuevo = ok(await db.from('finanzas_tableros').insert(fila).select('id').single(), 'guardar el tablero') as Fila
        id = String(nuevo.id)
        if (t.numeros.length) ok(await db.from('finanzas_numeros').insert(t.numeros.map((n) => ({ tablero_id: id, ...n }))), 'guardar los números')
        return { id, version }
      } catch (e) {
        // … y si algo falla a medias SE COMPENSA: se borra lo parcial y el anterior vuelve a ser el vigente, con su estado (el cliente nunca se queda sin tablero)
        const quedo: string[] = []
        if (id) { try { ok(await db.from('finanzas_tableros').delete().eq('id', id), 'borrar el parcial') } catch (x) { quedo.push(`parcial ${id} sin borrar: ${x instanceof Error ? x.message : String(x)}`) } }
        if (vig) { try { ok(await db.from('finanzas_tableros').update({ vigente: true, estado: vig.estado }).eq('id', vig.id), 'restaurar el anterior') } catch (x) { quedo.push(`anterior ${String(vig.id)} sin restaurar: ${x instanceof Error ? x.message : String(x)}`) } }
        throw new Error(`${e instanceof Error ? e.message : String(e)}${quedo.length ? ` · COMPENSACIÓN INCOMPLETA: ${quedo.join('; ')}` : ' · compensado: el cliente conserva su tablero vigente'}`)
      }
    },
    async leerTablero(id): Promise<FilaDeTablero | null> {
      const r = ok(await db.from('finanzas_tableros').select('id,client_id,version,vigente,estado,entrada,bloque,huella').eq('id', id).maybeSingle(), 'leer el tablero') as Fila | null
      return r ? ({ ...r, id: String(r.id), client_id: String(r.client_id), version: Number(r.version) } as unknown as FilaDeTablero) : null
    },
    async leerNumeros(tablero_id): Promise<FilaDeNumero[]> {
      const r = ok(await db.from('finanzas_numeros').select('clave,valor,minimo,maximo,unidad,tipo,fuente,fecha,formula,motivo').eq('tablero_id', tablero_id), 'leer los números') as Fila[] | null
      return (r ?? []).map((x) => ({ clave: String(x.clave), valor: x.valor == null ? null : Number(x.valor), minimo: x.minimo == null ? null : Number(x.minimo), maximo: x.maximo == null ? null : Number(x.maximo), unidad: (x.unidad as string | null) ?? null, tipo: x.tipo as FilaDeNumero['tipo'], fuente: String(x.fuente), fecha: (x.fecha as string | null) ?? null, formula: (x.formula as string | null) ?? null, motivo: (x.motivo as string | null) ?? null }))
    },
    async actualizarTablero(id, patch) {
      ok(await db.from('finanzas_tableros').update(patch).eq('id', id), 'firmar el tablero')
    },
  }
}
