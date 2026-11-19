/**
 * 19-nov · JUNTAR PÚBLICOS EN EL ALTA · entrega 1 · CC1 · certifica CC6 · US$ 0.
 * UNA sola función para los dos caminos que escriben `client_icp_documents`: el descubrimiento del alta (upsert por nombre) y el analizador de marca (insert).
 * Contrato con CC-CEREBRO (18-nov 14:43Z): el agente que nombra un público nuevo decide, con su `porque`:
 *   · `nuevo`                       → entra como hoy;
 *   · `mismo_que: <id>`             → el mismo público: entra ya ABSORBIDO (`fusionado_en`), no vigente;
 *   · `dentro_de: <id>`             → uno dentro de otro: entra como segmento del general (`segmento_de`), vigente;
 *   · `posible_duplicado_de: <id>`  → en duda: los dos vigentes, marcado (`posible_duplicado_de`).
 * El JUICIO es del agente; este código solo verifica lo EXACTO: que el id exista, sea del mismo cliente y esté vigente. Si la decisión falta,
 * no se lee o no cuadra, entra como `nuevo` y queda el aviso. Nada se frena ni va a una persona.
 * Solo INSERT o el upsert de siempre: nunca un UPDATE de fusión sobre otra fila (el AFTER UPDATE `icp_documents_brain_reembed` re-embebería). Por eso, si el
 * upsert caería sobre un nombre que ya existe, «mismo_que» baja a «posible_duplicado_de» (entrega 2).
 * Agnóstico: ningún dato de un cliente.
 */

export type DecisionDeFusion =
  | { tipo: 'nuevo'; porque: string | null }
  | { tipo: 'mismo_que' | 'dentro_de' | 'posible_duplicado_de'; id: string; porque: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CON_DESTINO = ['mismo_que', 'dentro_de', 'posible_duplicado_de'] as const

/** lee la decisión tal como la emite el agente: `{ nuevo: true, porque }` o `{ mismo_que | dentro_de | posible_duplicado_de: <id>, porque }`. Lo que no cuadra exacto → null (no se adivina). */
export function leerDecision(x: unknown): DecisionDeFusion | null {
  if (!x || typeof x !== 'object' || Array.isArray(x)) return null
  const o = x as Record<string, unknown>
  const porque = typeof o.porque === 'string' && o.porque.trim() ? o.porque.trim().slice(0, 2000) : null
  const destinos = CON_DESTINO.filter((k) => o[k] !== undefined)
  if (o.nuevo === true && !destinos.length) return { tipo: 'nuevo', porque }
  if (destinos.length !== 1 || o.nuevo !== undefined) return null
  const tipo = destinos[0], id = o[tipo]
  if (typeof id !== 'string' || !UUID.test(id.trim()) || !porque) return null
  return { tipo, id: id.trim().toLowerCase(), porque }
}

interface Lectura { data: unknown; error: { message: string } | null }
interface Consulta extends PromiseLike<Lectura> {
  select(c?: string): Consulta
  eq(c: string, v: unknown): Consulta
  maybeSingle(): PromiseLike<Lectura>
  single(): PromiseLike<Lectura>
  insert(fila: Record<string, unknown>): Consulta
  upsert(fila: Record<string, unknown>, o: { onConflict: string }): Consulta
}
export type Db = { from(tabla: string): Consulta }

export type ResultadoDeGuardar =
  | { ok: true; id: string; vigente: boolean; aplicada: DecisionDeFusion | null; aviso: string | null } // aplicada null = sin decisión: las marcas no se tocaron
  | { ok: false; motivo: string }

const TABLA = 'client_icp_documents'
const msj = (e: unknown) => (e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e)).slice(0, 300)

/**
 * Guarda un público. `fila` = las columnas del público (sin marcas de fusión). `modo`: el camino de entrada (`upsert` por `client_id,audience_segment`
 * como el descubrimiento; `insert` como el analizador de marca). NUNCA lanza.
 */
export async function guardarPublico(
  db: Db,
  p: { client_id: string; fila: Record<string, unknown>; decision?: unknown; modo: 'upsert' | 'insert' },
): Promise<ResultadoDeGuardar> {
  const nombre = typeof p.fila.audience_segment === 'string' ? p.fila.audience_segment : ''
  const avisos: string[] = []
  const sinTocar = (motivo: string, tipo?: string) => { avisos.push(`${motivo}; se guardó sin tocar sus marcas${tipo ? ` (decía ${tipo})` : ''}`); return null }
  // 19-nov · 🟡 CC6 #1211 opción (b): SIN decisión (ausente, ilegible o que no cuadra) NO se tocan las marcas: «no decir nada» no borra lo que alguien decidió.
  // Solo una decisión explícita y verificada (incluido `{ nuevo: true }`) las cambia.
  let d: DecisionDeFusion | null = null
  if (p.decision !== undefined && p.decision !== null) d = leerDecision(p.decision) ?? sinTocar('la decisión de fusión no se pudo leer')
  try {
    if (d && d.tipo !== 'nuevo') {
      const r = await db.from(TABLA).select('id, client_id, audience_segment, fusionado_en').eq('id', d.id).maybeSingle()
      const o = (r.data ?? null) as { client_id?: unknown; audience_segment?: unknown; fusionado_en?: unknown } | null
      const motivo = r.error ? `no se pudo leer el público ${d.id}: ${r.error.message}`
        : !o ? `el público ${d.id} no existe`
        : o.client_id !== p.client_id ? `el público ${d.id} es de otro cliente`
        : o.fusionado_en ? `el público ${d.id} ya no está vigente`
        : p.modo === 'upsert' && o.audience_segment === nombre ? null // es la MISMA fila por nombre: el upsert la refresca, no se marca contra sí misma
        : undefined
      if (motivo === null) d = null
      else if (motivo !== undefined) d = sinTocar(motivo, d.tipo)
    }
    // por el upsert, una decisión explícita mira primero la fila del MISMO nombre de ESTE cliente (🟡 n8: nunca la de otro cliente)
    if (d && p.modo === 'upsert') {
      const r = await db.from(TABLA).select('id, fusionado_en').eq('client_id', p.client_id).eq('audience_segment', nombre).maybeSingle()
      const ya = (r.data ?? null) as { id?: unknown; fusionado_en?: unknown } | null
      if (r.error) d = sinTocar(`no se pudo ver si el público «${nombre}» ya existe: ${r.error.message}`, d.tipo)
      else if (ya) {
        // condición 2 de CC6 (#1208): «mismo_que» sobre otra fila ya existente sería un UPDATE de fusión (trozos viejos en el cerebro + re-embebido) → queda en duda
        if (d.tipo === 'mismo_que') {
          avisos.push(`el público «${nombre}» ya existe; no se absorbe al actualizarlo: queda como posible duplicado de ${d.id}`)
          d = { tipo: 'posible_duplicado_de', id: d.id, porque: d.porque }
        }
        // 🟡 CC6 #1211: deshacer una fusión decidida se DICE
        if (typeof ya.fusionado_en === 'string') avisos.push(`se deshizo la fusión de «${nombre}» (estaba absorbido en ${ya.fusionado_en})`)
      }
    }
    // con decisión explícita van las 3 marcas y el porqué (null cuando no aplican: un público que vuelve no hereda marcas viejas). Requiere 202611190700 (aplicada 19-nov 06:53Z).
    const marcas: Record<string, unknown> = d
      ? {
          fusionado_en: d.tipo === 'mismo_que' ? d.id : null,
          segmento_de: d.tipo === 'dentro_de' ? d.id : null,
          posible_duplicado_de: d.tipo === 'posible_duplicado_de' ? d.id : null,
          fusion_porque: d.tipo === 'nuevo' ? null : d.porque,
        }
      : {}
    const fila = { ...p.fila, client_id: p.client_id, ...marcas }
    const w = p.modo === 'upsert'
      ? await db.from(TABLA).upsert(fila, { onConflict: 'client_id,audience_segment' }).select('id, fusionado_en').maybeSingle()
      : await db.from(TABLA).insert(fila).select('id, fusionado_en').single()
    if (w.error) return { ok: false, motivo: `no se pudo guardar el público «${nombre}»: ${w.error.message}`.slice(0, 300) }
    const guardada = (w.data ?? null) as { id?: unknown; fusionado_en?: unknown } | null
    const id = guardada?.id
    if (typeof id !== 'string') return { ok: false, motivo: `no se pudo guardar el público «${nombre}»: la base no devolvió el id` }
    // vigente = lo que la base DE VERDAD tiene tras escribir (un absorbido que vuelve sin decisión sigue absorbido y no se indexa)
    return { ok: true, id, vigente: !guardada?.fusionado_en, aplicada: d, aviso: avisos.length ? avisos.join(' · ') : null }
  } catch (e) {
    return { ok: false, motivo: `no se pudo guardar el público «${nombre}»: ${msj(e)}` }
  }
}
