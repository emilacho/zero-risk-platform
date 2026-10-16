/**
 * ARCHIVO DE LOS BRAZOS · de `FichaDeBrazo` a `cerebro_fichas`. Sin modelo (US$ 0): la decisión sale del código.
 *  · IDEMPOTENTE: la misma ficha (`ref`) o el mismo contenido (`huella`, sin fechas) no se escribe dos veces: correr el brazo dos veces el mismo día no duplica;
 *  · NADA SE BORRA: `reemplaza` = la ficha nueva apunta a la vieja (`version_de`) y la vieja queda con `retirada_en`, `motivo_retirada` y `reemplazada_por`;
 *  · el `alcance` (cliente · competidor · mercado · zona) viaja en la ficha: una cifra de un competidor NO es una cifra del cliente, y las de zona no llevan cliente (`zona:<país>`);
 *  · `dry_run` OBLIGATORIO: con true se calcula el plan y NO se escribe nada (ni el ingreso);
 *  · un error se junta y se DICE; una lectura fallida de lo vigente detiene SOLO a ese cliente (escribir a ciegas duplicaría).
 */
import { createHash, randomUUID } from 'node:crypto'
import type { Db } from '../alimentar'
import type { FichaDeBrazo } from './tipos'
import { claveDeAlcance, sedesDeFicha } from '../sedes-fuentes'

type Fila = Record<string, unknown>
export interface ResultadoDeArchivo {
  escritas: number
  iguales: number
  retiradas: number
  errores: string[]
  plan: Array<{ ref: string; accion: 'nueva' | 'reemplaza' | 'igual' | 'retira'; alcance: string }>
}
/** la huella del CONTENIDO sin las fechas (el texto lleva «observado 2026-10-15»: cambiar el día no es cambiar el dato) */
export const huellaDeFicha = (contenido: string): string => createHash('sha256').update(contenido.replace(/\d{4}-\d{2}-\d{2}/g, '').replace(/\s+/g, ' ').trim().toLowerCase()).digest('hex').slice(0, 24)

/** retirar sin reemplazo (un competidor que cerró, bajó o dejó de competir): la ficha queda con su motivo; nada se borra */
export interface RetiroDeBrazo { client_id: string; atributo: string; motivo: string }

export async function archivarFichasDeBrazos(o: { db: Db; fichas: FichaDeBrazo[]; ahora: Date; dry_run: boolean; workflow_id?: string; workflow_execution_id?: string; nuevoId?: () => string; retiros?: RetiroDeBrazo[] }): Promise<ResultadoDeArchivo> {
  const r: ResultadoDeArchivo = { escritas: 0, iguales: 0, retiradas: 0, errores: [], plan: [] }
  const id = o.nuevoId ?? randomUUID
  const iso = o.ahora.toISOString()
  const dia = iso.slice(0, 10)
  const porCliente = new Map<string, FichaDeBrazo[]>()
  for (const f of o.fichas) porCliente.set(f.client_id, [...(porCliente.get(f.client_id) ?? []), f])

  for (const [cid, fichas] of porCliente) {
    const leidas = await o.db.from('cerebro_fichas').select('id, ref, atributo, huella, retirada_en, vigente_hasta').eq('client_id', cid).is('retirada_en', null).limit(5000)
    if (leidas.error) { r.errores.push(`lectura de las fichas vigentes de ${cid}: ${leidas.error.message}`); continue }
    const vigentes = (Array.isArray(leidas.data) ? (leidas.data as Fila[]) : []).filter((x) => typeof x.ref === 'string' && (x.ref as string).startsWith('brazo:'))
    const porRef = new Map(vigentes.map((x) => [String(x.ref), x]))
    const porAtributo = new Map(vigentes.filter((x) => typeof x.atributo === 'string' && x.atributo).map((x) => [String(x.atributo), x]))
    const ingresoDe = new Map<string, string>()

    for (const f of fichas) {
      const huella = huellaDeFicha(f.contenido)
      const mismaRef = porRef.get(f.ref)
      const vigente = porAtributo.get(f.atributo)
      const igual = mismaRef ?? (vigente && vigente.huella === huella ? vigente : null)
      if (igual) {
        r.iguales++; r.plan.push({ ref: f.ref, accion: 'igual', alcance: f.alcance })
        // una cifra que sigue igual y sigue viva: se corre su vigencia (solo hacia adelante); el contenido no se toca
        if (f.renueva_vigencia && f.vigente_hasta && !o.dry_run && String(igual.vigente_hasta ?? '') < f.vigente_hasta) {
          const u = await o.db.from('cerebro_fichas').update({ vigente_hasta: f.vigente_hasta }).eq('id', String(igual.id)).eq('client_id', cid)
          if (u.error) r.errores.push(`vigencia de ${String(igual.id)}: ${u.error.message}`)
          else igual.vigente_hasta = f.vigente_hasta
        }
        continue
      }
      const reemplaza = f.decision === 'reemplaza' && !!vigente
      r.plan.push({ ref: f.ref, accion: reemplaza ? 'reemplaza' : 'nueva', alcance: f.alcance })
      if (o.dry_run) continue

      let ingreso = ingresoDe.get(f.origen)
      if (!ingreso) {
        const nuevo = id()
        const w = await o.db.from('cerebro_ingresos').insert({ id: nuevo, client_id: cid, origen: f.origen, fuente_ref: `portero-brazos:${f.brazo}`, es_completa: false, huella: `${dia}:${f.origen}:brazos`, material: null, estado: 'fichado', workflow_id: o.workflow_id ?? null, workflow_execution_id: o.workflow_execution_id ?? null })
        if (w.error) { r.errores.push(`ingreso ${f.origen} de ${cid}: ${w.error.message}`); continue }
        ingresoDe.set(f.origen, nuevo)
        ingreso = nuevo
      }
      const nueva = id()
      const w = await o.db.from('cerebro_fichas').insert({
        id: nueva, client_id: cid, ingreso_id: ingreso, ref: f.ref, clase: f.clase, titulo: f.titulo.slice(0, 160), que_es: f.contenido.slice(0, 200), contenido: f.contenido, origen: f.origen,
        fecha_fuente: f.fecha_fuente, reconfirmado_en: f.observado_en, plazo: null, sede: claveDeAlcance(sedesDeFicha({ datos: f.datos })) || null, vigente_hasta: f.vigente_hasta, version_de: reemplaza ? String(vigente!.id) : null, huella,
        // lo de un competidor, del mercado o de la zona es SOBRE terceros (los lectores lo marcan); lo del cliente es suyo
        propiedad: f.alcance === 'cliente' ? 'propia' : 'ajena', porque: `brazo ${f.brazo}: dato por código, sin modelo`, juzgado_por: 'regla',
        provenance_tag: { type: 'evidence', source: `brazo_${f.brazo}`, trust_level: 'untrusted', alcance: f.alcance, ingress_route: '/api/brain/alimentar/procesar', ...(f.datos ? { datos: f.datos } : {}), ...(f.metrica ? { metrica: f.metrica } : {}) },
        fuente_url: f.fuente_url, observado_en: f.observado_en, atributo: f.atributo, decision: f.decision, razon_de_decision: reemplaza ? 'la lectura nueva reemplaza a la vigente del mismo atributo' : 'dato nuevo',
        alcance: f.alcance, descartada: false,
      })
      if (w.error) { r.errores.push(`ficha ${f.ref}: ${w.error.message}`); continue }
      r.escritas++
      porRef.set(f.ref, { id: nueva, ref: f.ref, atributo: f.atributo, huella })
      if (reemplaza) {
        const u = await o.db.from('cerebro_fichas').update({ retirada_en: iso, motivo_retirada: `reemplazada por ${nueva} el ${dia}`, reemplazada_por: nueva }).eq('id', String(vigente!.id)).eq('client_id', cid)
        if (u.error) r.errores.push(`retiro de ${String(vigente!.id)}: ${u.error.message}`)
        else r.retiradas++
      }
      porAtributo.set(f.atributo, { id: nueva, ref: f.ref, atributo: f.atributo, huella })
    }
  }
  // retiros sin reemplazo: solo fichas vigentes de los brazos (`brazo:`), por atributo; en seco solo se cuentan
  for (const t of o.retiros ?? []) {
    const l = await o.db.from('cerebro_fichas').select('id, ref, atributo, retirada_en').eq('client_id', t.client_id).eq('atributo', t.atributo).is('retirada_en', null).limit(50)
    if (l.error) { r.errores.push(`lectura para retirar ${t.atributo}: ${l.error.message}`); continue }
    const quedan = (Array.isArray(l.data) ? (l.data as Fila[]) : []).filter((x) => typeof x.ref === 'string' && (x.ref as string).startsWith('brazo:'))
    for (const x of quedan) {
      r.plan.push({ ref: String(x.ref), accion: 'retira', alcance: 'competidor' })
      if (o.dry_run) continue
      const u = await o.db.from('cerebro_fichas').update({ retirada_en: iso, motivo_retirada: t.motivo.slice(0, 300) }).eq('id', String(x.id)).eq('client_id', t.client_id)
      if (u.error) r.errores.push(`retiro de ${String(x.id)}: ${u.error.message}`)
      else r.retiradas++
    }
  }
  return r
}
