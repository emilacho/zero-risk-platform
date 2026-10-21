/**
 * EL SEGUNDO CEREBRO DEL PRODUCTOR · tipos compartidos.
 * Una NOTA del dueño es lo que Emilio dijo (o decidió) sobre una pieza: no es una regla ni una orden. La leen SOLO los agentes que producen la pieza, en su paso de auto-revisión.
 * La jefatura (reglas duras) y la segunda mirada GPT (opinión independiente) NO leen notas: nada de este módulo se importa desde `src/lib/jefatura` ni desde el revisor GPT (lo prueba un test).
 */

export type TipoDeNota = 'aprobada' | 'rechazada' | 'editada' | 'comentario'
export type AlcanceDeNota = 'cliente' | 'general'
export type OrigenDeNota = 'slack' | 'tablero' | 'manual'

export interface Nota {
  id: string
  client_id: string
  alcance: AlcanceDeNota
  tipo: TipoDeNota
  comentario: string | null
  hitl_id: string | null
  output_id: string | null
  pieza_titulo: string | null
  pieza_version: string | null
  pieza_familia: string | null
  origen: OrigenDeNota
  autor: string
  clave_unica: string
  creada_en: string
}
export type NotaNueva = Omit<Nota, 'id' | 'creada_en'>

/** lo que se sabe de una pieza en la bandeja (`hitl_queue`, tipo `content_piece_review`) */
export interface PiezaDeBandeja {
  hitl_id: string
  client_id: string
  type: string
  status: string
  output_id: string | null
  titulo: string
  familia: string | null
  version: string | null
  slack: { canal: string; ts: string } | null
}

export type ResultadoDeDecision = { ok: true } | { ok: false; error: string }
export type ResultadoDeNota = { ok: true; id: string; repetida: boolean } | { ok: false; error: string }

/** todo lo que el módulo necesita del mundo; nada de red propia */
export interface PuertosDeNotas {
  pieza(hitl_id: string): Promise<PiezaDeBandeja | null>
  /** decide la pieza por la MISMA ruta de siempre (`PATCH /api/hitl/[id]`): conserva sus efectos (publicación en ensayo, fecha de resolución, frase del aprobador) */
  decidir(hitl_id: string, d: { status: 'approved' | 'rejected'; reviewer: string; frase: string | null }): Promise<ResultadoDeDecision>
  guardarNota(n: NotaNueva): Promise<ResultadoDeNota>
  /** la pieza cuyo mensaje de Slack tiene este hilo (canal + ts de la raíz) */
  hitlDelHilo(canal: string, ts: string): Promise<string | null>
  abrirModalDeRechazo(trigger_id: string, ctx: { hitl_id: string; canal: string | null; ts: string | null; titulo: string }): Promise<boolean>
  /** responde en el hilo de la pieza (un fallo de Slack nunca frena nada) */
  responderEnHilo(canal: string, ts: string, texto: string): Promise<void>
  /**
   * sube una nota a la puerta del dueño del cerebro (idempotente por nota; guarda su estado para reintentar); NUNCA lanza. Sin este puerto no se sube nada.
   * `enviada`: el cerebro la tiene · `pendiente`: no respondió y se reintenta en la siguiente vuelta · `rechazada`: la puerta la rechazó (queda anotado el motivo)
   */
  enviarAlCerebro?(nota: NotaNueva & { id: string }, ctx: { ts: string; canal_slack: string; respondido_en: string }): Promise<EstadoDeEnvio>
}
export type EstadoDeEnvio = 'enviada' | 'pendiente' | 'rechazada'

export interface ConfiguracionDeNotas {
  /** ids de usuario de Slack que pueden decidir (Emilio). Vacío ⇒ NADIE puede: falla cerrado */
  autorizados: string[]
  /** el reloj (solo para pruebas); por omisión, la hora real */
  ahora?: () => Date
}
