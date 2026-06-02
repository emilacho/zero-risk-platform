/**
 * Lakera Guard ClassifierClient · canon canonical canonical-pend-key §151
 *
 * Spec · ADR-012 §4.3 + §8 vendor decision · Lakera fallback condicional
 *       + spec-CC1-adr012-fp-measurement-preflip § "harness listo · slot Lakera"
 *
 * Canon canonical · STUB · NO real API call until §151 vendor ruling Emilio.
 * Bench harness can iterate this client alongside Haiku · returns canon
 * canonical "pend_key" placeholder so harness completes without errors.
 *
 * Real implementation canon canonical · when §151 ratified ·
 *   1. POST to https://api.lakera.ai/v2/guard with payload
 *   2. Parse response { flagged, categories, scores }
 *   3. Map to ClassifierOutput RUFLO encoding (this mapping canon canonical
 *      future · canon canonical not implemented hoy)
 */
import type {
  ClassifierClient,
  AnthropicMessageRequest,
  AnthropicMessageResponse,
} from '../gates/classifier'

export interface LakeraStubClientOptions {
  /** Canon canonical · API key · default reads process.env.LAKERA_API_KEY */
  apiKey?: string
  /** Canon canonical · if true · throws on call (default false · returns pend_key stub) */
  throw_on_call?: boolean
}

/**
 * Canon canonical Lakera stub client.
 *
 * `createMessage()` returns canon canonical a JSON canon canonical that
 * parses to UNKNOWN/pend_key gate decision · canon canonical harness logs
 * the stub for §151 review.
 */
export class LakeraStubClient implements ClassifierClient {
  private hasKey: boolean
  private throwOnCall: boolean

  constructor(options: LakeraStubClientOptions = {}) {
    const key = options.apiKey ?? process.env.LAKERA_API_KEY
    this.hasKey = !!key
    this.throwOnCall = options.throw_on_call ?? false
  }

  get isReady(): boolean {
    return this.hasKey
  }

  async createMessage(_req: AnthropicMessageRequest): Promise<AnthropicMessageResponse> {
    if (this.throwOnCall) {
      throw new Error('Lakera canon canonical-pend-key · §151 vendor ruling required')
    }

    if (!this.hasKey) {
      // Canon canonical · return malformed canon canonical · classifier parser
      // returns null · gate decision UNKNOWN. Operator sees that in harness
      // output canon canonical "Lakera: pend_key".
      return {
        content: [
          {
            type: 'text',
            text: 'LAKERA_PEND_KEY_§151_VENDOR_RULING',
          },
        ],
      }
    }

    // canon canonical · real Lakera implementation pending §151
    throw new Error('Lakera canon canonical · real implementation pending §151 ratification')
  }
}

/** Canon canonical factory · returns the stub. */
export function makeLakeraStubClient(options?: LakeraStubClientOptions): ClassifierClient {
  return new LakeraStubClient(options)
}
