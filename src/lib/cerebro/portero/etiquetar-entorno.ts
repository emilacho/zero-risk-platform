/**
 * El etiquetado de fotos pendientes CABLEADO al entorno real (base, almacén, modelo con imagen, registro en `log-invocation`). Lo comparten la ruta del cron
 * (`/api/brain/portero/etiquetar-pendientes`) y el pedido libre del portero («más fotos»). Cada llamada al modelo la registra `etiquetar()` con el flujo y la ejecución recibidos.
 */
import { crearBajador } from './almacen'
import { consultaDelEntorno } from './entorno'
import { crearEscritor } from './etiqueta-escritura'
import { etiquetar } from './etiquetar'
import { etiquetarPendientes, type PedidoDeEtiquetarPendientes } from './fotos-pendientes'
import { llamarAlModeloConImagen } from './modelo'
import { crearRegistrador } from './registro'

export function etiquetarPendientesDelEntorno(o: { origen: string; llaveInterna: string; workflowId: string; ejecucionId: string; plazoMs?: number }, p: PedidoDeEtiquetarPendientes) {
  const urlDeLaBase = process.env.NEXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? ''
  const consulta = consultaDelEntorno()
  const deps = {
    consulta, urlDeLaBase,
    llamarModelo: llamarAlModeloConImagen,
    bajarFoto: crearBajador({ urlDeLaBase }),
    escribir: crearEscritor({ urlDeLaBase, llave: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '' }),
    registrar: crearRegistrador({ origen: o.origen, llaveInterna: o.llaveInterna }),
  }
  return etiquetarPendientes(
    {
      consulta, plazoMs: o.plazoMs,
      etiquetarFoto: async ({ cliente, foto_id }) => {
        const x = await etiquetar(deps, { cliente, foto: foto_id, workflow_id: o.workflowId, workflow_execution_id: o.ejecucionId })
        const c = x.cuerpo as { escribio?: boolean; llamo_al_modelo?: boolean; costo_usd?: number; motivo_de_respaldo?: string; motivo?: string; error?: string; detalle_de_escritura?: string }
        return { llamo_al_modelo: c.llamo_al_modelo === true, escribio: c.escribio === true, costo_usd: Number(c.costo_usd) || 0, motivo: c.motivo_de_respaldo ?? c.motivo ?? c.detalle_de_escritura ?? c.error }
      },
    },
    p,
  )
}
