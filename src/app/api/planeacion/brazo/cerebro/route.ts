/**
 * POST /api/planeacion/brazo/cerebro · la puerta del CEREBRO.
 *
 * El cerebro se LEE, no se escribe (canon 06-sep · lo raspado es materia prima
 * y vive en su tabla). Esta puerta sólo busca y devuelve el contrato §4.2.
 *
 * 🔴 Cero fragmentos tras una búsqueda que SÍ respondió es `sin_dato` —
 * «este cliente todavía no tiene conocimiento cargado» es información real y
 * accionable para el plan. Que la búsqueda se rompa es `sin_respuesta`.
 *
 * ═══════════════════════════════════════════════════════════════════════════
 * 🔴 SE BUSCA POR PARECIDO DE VERDAD · Y ANTES NO (corregido 10-sep · Lenovo)
 * ═══════════════════════════════════════════════════════════════════════════
 * La primera versión pedía `order created_at desc limit 12` y entregaba eso
 * como si fueran los fragmentos que responden a la pregunta. **Traía los 12
 * más NUEVOS y los presentaba como los más PARECIDOS** — un rótulo que miente,
 * y de los peores: el plan razona sobre el material equivocado sin saberlo, y
 * un cliente con conocimiento cargado hace meses queda mudo por antigüedad.
 *
 * Ahora usa la búsqueda que YA existe y ya está certificada:
 * `queryClientBrain()` → huella semántica de 1536 (OpenAI) + `query_client_brain`
 * sobre pgvector. Cada fragmento vuelve **con su parecido medido** (`similitud`)
 * y con el texto que se usó para buscar declarado en `fuente`.
 *
 * 📌 `similarity` es lo único que justifica la palabra «parecido». Sin ese
 * número no hay forma de saber si el fragmento contesta o solamente existe.
 */
import { checkInternalKey } from '@/lib/internal-auth'
import { getSupabaseAdmin } from '@/lib/supabase'
import { queryClientBrain, type BrainSection } from '@/lib/client-brain'
import { brazoCerebro } from '@/lib/planeacion/brazos'
import {
  conLimite,
  CUPO_EN_VUELO,
  enParalelo,
  extraDe,
  leerSobre,
  pedidoInvalido,
  responderLista,
  seRompio,
  sobreInvalido,
  type PedidoPuerta,
} from '@/lib/planeacion/puertas'
import { type RespuestaBrazo } from '@/lib/planeacion/contrato-brazos'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const FUENTE = 'cerebro · client_brain_chunks (pgvector) · búsqueda por parecido'
const RECORTE = 2000

/**
 * El texto con el que se busca · en este orden, y se DECLARA cuál se usó.
 * `objetivo` es el último recurso y NUNCA falta: la puerta ya rechaza el pedido
 * que no lo trae (`leerSobre`) ⇒ acá no hace falta una guarda de «no hay con
 * qué buscar», y poner una sería código que finge proteger.
 */
function textoDeBusqueda(p: PedidoPuerta): string {
  const q = p.params?.query ?? p.params?.pregunta ?? p.params?.texto
  const candidatos = [typeof q === 'string' ? q : '', p.proposito ?? '', p.objetivo ?? '']
  return candidatos.map((c) => c.trim()).find((c) => c.length > 0) ?? ''
}

async function atender(p: PedidoPuerta): Promise<RespuestaBrazo> {
  const objetivo = p.objetivo as string
  const extra = extraDe(p)

  if (!p.client_id) return pedidoInvalido('cerebro', FUENTE, p, 'falta client_id')

  const texto = textoDeBusqueda(p)

  const k = Math.min(Math.max(Number(p.params?.k ?? 12) || 12, 1), 50)
  const secciones = Array.isArray(p.params?.secciones) ? (p.params?.secciones as BrainSection[]) : undefined
  const fuente = FUENTE + ' · texto buscado: «' + texto.slice(0, 120) + '»' +
    (secciones?.length ? ' · secciones: ' + secciones.join(', ') : '')

  try {
    return await brazoCerebro({
      objetivo,
      fuente,
      ...extra,
      buscar: () => conLimite(p.limite_ms, async () => {
        const hallados = await queryClientBrain({
          client_id: p.client_id as string,
          query: texto,
          ...(secciones?.length ? { sections: secciones } : {}),
          match_count: k,
        })
        if (!hallados.length) return []

        // La procedencia no viene en la búsqueda (el RPC devuelve seis campos y
        // `provenance_tag` no es uno) · se trae aparte. Si esa lectura falla, el
        // fragmento igual vuelve: se DECLARA que la procedencia no se pudo leer,
        // no se lo tira ni se lo entrega como si no tuviera.
        const porId = new Map<string, { procedencia: unknown; cargado_el: unknown }>()
        let procedenciaLeida = true
        try {
          const { data, error } = await getSupabaseAdmin()
            .from('client_brain_chunks')
            .select('id, provenance_tag, created_at')
            .in('id', hallados.map((h) => h.chunk_id))
          if (error) throw new Error(error.message)
          for (const f of (data ?? []) as Array<Record<string, unknown>>) {
            porId.set(String(f.id), { procedencia: f.provenance_tag ?? null, cargado_el: f.created_at ?? null })
          }
        } catch {
          procedenciaLeida = false
        }

        return hallados.map((h) => {
          const completo = String(h.content_text ?? '')
          const extraDato = porId.get(h.chunk_id)
          return {
            seccion: h.label,
            de_donde: h.source_table,
            // el texto se recorta para no inflar la respuesta · se declara el recorte
            texto: completo.slice(0, RECORTE),
            recortado: completo.length > RECORTE,
            // 🔴 el número que sostiene la palabra «parecido»
            similitud: h.similarity,
            procedencia: extraDato?.procedencia ?? null,
            procedencia_leida: procedenciaLeida,
            cargado_el: extraDato?.cargado_el ?? null,
          }
        })
      }),
    })
  } catch (e) {
    return seRompio('cerebro', FUENTE, p, e)
  }
}

export async function POST(req: Request) {
  const auth = checkInternalKey(req)
  if (!auth.ok) {
    return sobreInvalido('cerebro', FUENTE, 'la puerta rechazó la llamada · ' + auth.reason)
  }
  const leido = await leerSobre(req)
  if (!leido.ok) return sobreInvalido('cerebro', FUENTE, leido.motivo)

  const rs = await enParalelo(leido.sobre.pedidos, CUPO_EN_VUELO, async (l) =>
    l.ok ? atender(l.pedido) : pedidoInvalido('cerebro', FUENTE, l.pedido, l.motivo),
  )
  return responderLista(rs)
}
