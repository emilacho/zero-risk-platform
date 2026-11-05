/** Los puertos reales de la pausa: los usan `/api/finanzas/pausar` y `/api/finanzas/responder`. Las llaves salen del entorno que pasa la ruta, nunca del cuerpo. */
import type { Db } from '../almacen-supabase'
import { almacenDeConversa } from './almacen-supabase'
import { ETIQUETA_DE_TU_OFICINA } from './buzon'
import { despertarPorElFlujo, esperasDeFinanzas } from './esperas-supabase'
import { baseDeRunSdk, modeloRunSdk } from './modelo-run-sdk'
import type { ColumnasDeLaLlamada } from '@/lib/trabajo-de-la-llamada'
import { nombreDelClienteDe } from './nombre'
import type { DespertarAlPlan, PuertosDePausa } from './pausa'
import { slackMdPuerto } from '../../buzon-dueno/slack-md'
import { cerebroDelDueno } from '../../buzon-dueno/cerebro-dueno'
import { avisarAAlertas } from '../../buzon-dueno/alertas'

/** cómo se llama al plan: el único lugar que conoce su llave de despacho. La puerta de entrada de las rutas de finanzas sigue siendo la llave interna */
export const despertarDelEntorno = (env: Record<string, string | undefined>): DespertarAlPlan => despertarPorElFlujo({ base: env.N8N_BASE_URL, llave: env.SALA_DISPATCH_KEY })

export function puertosDePausa(env: Record<string, string | undefined>, db: Db, modo: PuertosDePausa['modo'], workflow_id: string, workflow_execution_id: string, canal_etiqueta?: string, trabajo?: ColumnasDeLaLlamada): PuertosDePausa {
  const crudo = (env.FINANZAS_CANAL_PREGUNTAS ?? '').trim()
  const canal = /^[CG][A-Z0-9]{8,}$/.test(crudo) ? crudo : undefined
  return {
    almacen: almacenDeConversa(db),
    canal,
    slack: slackMdPuerto({ token: env.SLACK_BOT_TOKEN ?? '', dueno_id: env.FINANZAS_EMILIO_ID ?? '', ...(canal ? { canal } : {}) }),
    cerebro: cerebroDelDueno({ base: baseDeRunSdk(env), llave: env.INTERNAL_API_KEY ?? '', workflow_id, workflow_execution_id, ...(canal_etiqueta ? { canal_etiqueta } : modo === 'registra' ? { canal_etiqueta: ETIQUETA_DE_TU_OFICINA } : canal ? { canal_etiqueta: 'canal privado de Slack «buzon-de-preguntas»' } : {}) }),
    modo,
    modelo: modeloRunSdk({ base: baseDeRunSdk(env), llave: env.INTERNAL_API_KEY, fetch: globalThis.fetch, workflow_id, trabajo }),
    ahora: () => new Date(),
    nombreDelCliente: nombreDelClienteDe(db),
    avisar: avisarAAlertas({ token: env.SLACK_BOT_TOKEN ?? '', canal: env.FINANZAS_CANAL_ALERTAS }),
    esperas: esperasDeFinanzas(db),
    despertar: despertarDelEntorno(env),
  }
}
