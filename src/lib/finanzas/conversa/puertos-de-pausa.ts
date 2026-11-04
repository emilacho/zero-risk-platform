/** Los puertos reales de la pausa: los usan `/api/finanzas/pausar` y `/api/finanzas/responder`. Las llaves salen del entorno que pasa la ruta, nunca del cuerpo. */
import type { Db } from '../almacen-supabase'
import { almacenDeConversa } from './almacen-supabase'
import { despertarPorElFlujo, esperasDeFinanzas } from './esperas-supabase'
import { baseDeRunSdk } from './modelo-run-sdk'
import { nombreDelClienteDe } from './nombre'
import type { PuertosDePausa } from './pausa'
import { slackMdPuerto } from '../../buzon-dueno/slack-md'
import { cerebroDelDueno } from '../../buzon-dueno/cerebro-dueno'
import { avisarAAlertas } from '../../buzon-dueno/alertas'

export function puertosDePausa(env: Record<string, string | undefined>, db: Db, modo: PuertosDePausa['modo'], workflow_id: string, workflow_execution_id: string, canal_etiqueta?: string): PuertosDePausa {
  const crudo = (env.FINANZAS_CANAL_PREGUNTAS ?? '').trim()
  const canal = /^[CG][A-Z0-9]{8,}$/.test(crudo) ? crudo : undefined
  return {
    almacen: almacenDeConversa(db),
    canal,
    slack: slackMdPuerto({ token: env.SLACK_BOT_TOKEN ?? '', dueno_id: env.FINANZAS_EMILIO_ID ?? '', ...(canal ? { canal } : {}) }),
    cerebro: cerebroDelDueno({ base: baseDeRunSdk(env), llave: env.INTERNAL_API_KEY ?? '', workflow_id, workflow_execution_id, ...(canal_etiqueta ? { canal_etiqueta } : canal ? { canal_etiqueta: 'canal privado de Slack «buzon-de-preguntas»' } : {}) }),
    modo,
    ahora: () => new Date(),
    nombreDelCliente: nombreDelClienteDe(db),
    avisar: avisarAAlertas({ token: env.SLACK_BOT_TOKEN ?? '', canal: env.FINANZAS_CANAL_ALERTAS }),
    esperas: esperasDeFinanzas(db),
    despertar: despertarPorElFlujo({ base: env.N8N_BASE_URL, llave: env.INTERNAL_API_KEY }),
  }
}
