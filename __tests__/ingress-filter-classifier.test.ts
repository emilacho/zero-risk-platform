/**
 * Tests · Capa 3 classifier (Haiku + RUFLO encoding) · ADR-012 §4.3
 *
 * Spec · ADR-012 §4.3 AJUSTE FINAL · canon §144 (Haiku + RUFLO encoding)
 *
 * Hardening R2 canon canonical tested ·
 *   1. Spotlighting structural isolation
 *   2. JSON-only output enforced via parser
 *   3. Reject-on-malformed
 *   4. NO concatenate payload to system prompt
 */
import { describe, it, expect, vi } from 'vitest'
import {
  classifierGate,
  parseClassifierResponse,
  classificationToSeverity,
  CLASSIFIER_SYSTEM_PROMPT,
  type ClassifierClient,
} from '../src/lib/ingress-filter/gates/classifier'

const fakeClient = (responseText: string): ClassifierClient => ({
  createMessage: vi.fn(async () => ({
    content: [{ type: 'text' as const, text: responseText }],
  })),
})

describe('parseClassifierResponse · canon canonical strict R2 #3', () => {
  describe('canonical valid shapes', () => {
    it('parses safe verdict canon canonical', () => {
      const out = parseClassifierResponse(
        '{"classification_type":"safe","confidence":0.95,"should_escalate_hitl":false,"escalation_reason":null}',
      )
      expect(out).not.toBeNull()
      expect(out!.classification_type).toBe('safe')
      expect(out!.confidence).toBe(0.95)
      expect(out!.should_escalate_hitl).toBe(false)
      expect(out!.escalation_reason).toBeNull()
    })

    it('parses jailbreak verdict with escalation_reason canon', () => {
      const out = parseClassifierResponse(
        '{"classification_type":"jailbreak","confidence":0.91,"should_escalate_hitl":true,"escalation_reason":"high_risk_route_egress"}',
      )
      expect(out).not.toBeNull()
      expect(out!.classification_type).toBe('jailbreak')
      expect(out!.escalation_reason).toBe('high_risk_route_egress')
    })

    it('parses canonical exfiltration verdict', () => {
      const out = parseClassifierResponse(
        '{"classification_type":"exfiltration","confidence":0.7,"should_escalate_hitl":true,"escalation_reason":"novel_pattern"}',
      )
      expect(out).not.toBeNull()
    })

    it('parses with surrounding whitespace canon canonical', () => {
      const out = parseClassifierResponse(
        '\n  {"classification_type":"safe","confidence":1.0,"should_escalate_hitl":false,"escalation_reason":null}  \n',
      )
      expect(out).not.toBeNull()
    })

    // ─── canon canonical · markdown fence regression tests (RESULTS-CC1-ADR-
    // 012-fp-measurement-preflip · Haiku canonical-emite ```json ... ``` ·
    // strict parser canon canonical-rechazaba canonical-100% canon canonical
    // pre-fix · post-fix canon canonical-parse OK)

    it('parses markdown ```json fence (canon canonical fix · Haiku habit)', () => {
      const out = parseClassifierResponse(
        '```json\n{"classification_type":"instruction_override","confidence":0.98,"should_escalate_hitl":true,"escalation_reason":"high_risk_route_egress"}\n```',
      )
      expect(out).not.toBeNull()
      expect(out!.classification_type).toBe('instruction_override')
      expect(out!.confidence).toBe(0.98)
      expect(out!.should_escalate_hitl).toBe(true)
    })

    it('parses markdown ``` plain fence (no language tag)', () => {
      const out = parseClassifierResponse(
        '```\n{"classification_type":"safe","confidence":0.95,"should_escalate_hitl":false,"escalation_reason":null}\n```',
      )
      expect(out).not.toBeNull()
      expect(out!.classification_type).toBe('safe')
    })

    it('parses markdown ```JSON uppercase fence', () => {
      const out = parseClassifierResponse(
        '```JSON\n{"classification_type":"jailbreak","confidence":0.9,"should_escalate_hitl":true,"escalation_reason":"high_risk_route_egress"}\n```',
      )
      expect(out).not.toBeNull()
      expect(out!.classification_type).toBe('jailbreak')
    })

    it('parses fenced output with trailing whitespace canonical', () => {
      const out = parseClassifierResponse(
        '```json\n{"classification_type":"safe","confidence":1,"should_escalate_hitl":false,"escalation_reason":null}\n```   \n  \n',
      )
      expect(out).not.toBeNull()
    })
  })

  describe('canonical reject-on-malformed', () => {
    it('rejects invalid JSON', () => {
      expect(parseClassifierResponse('not json')).toBeNull()
    })

    it('rejects array root', () => {
      expect(parseClassifierResponse('[]')).toBeNull()
    })

    it('rejects unknown classification_type', () => {
      expect(
        parseClassifierResponse(
          '{"classification_type":"suspicious","confidence":0.5,"should_escalate_hitl":false,"escalation_reason":null}',
        ),
      ).toBeNull()
    })

    it('rejects confidence > 1', () => {
      expect(
        parseClassifierResponse(
          '{"classification_type":"safe","confidence":1.5,"should_escalate_hitl":false,"escalation_reason":null}',
        ),
      ).toBeNull()
    })

    it('rejects confidence < 0', () => {
      expect(
        parseClassifierResponse(
          '{"classification_type":"safe","confidence":-0.1,"should_escalate_hitl":false,"escalation_reason":null}',
        ),
      ).toBeNull()
    })

    it('rejects non-boolean should_escalate_hitl', () => {
      expect(
        parseClassifierResponse(
          '{"classification_type":"safe","confidence":0.9,"should_escalate_hitl":"yes","escalation_reason":null}',
        ),
      ).toBeNull()
    })

    it('rejects unknown escalation_reason value', () => {
      expect(
        parseClassifierResponse(
          '{"classification_type":"jailbreak","confidence":0.9,"should_escalate_hitl":true,"escalation_reason":"free_form_attacker_text"}',
        ),
      ).toBeNull()
    })

    it('rejects free-form text outside controlled vocab in escalation_reason', () => {
      expect(
        parseClassifierResponse(
          '{"classification_type":"safe","confidence":0.9,"should_escalate_hitl":false,"escalation_reason":"some free text"}',
        ),
      ).toBeNull()
    })

    it('rejects should_escalate_hitl=true with null escalation_reason (consistency)', () => {
      expect(
        parseClassifierResponse(
          '{"classification_type":"safe","confidence":0.5,"should_escalate_hitl":true,"escalation_reason":null}',
        ),
      ).toBeNull()
    })

    it('rejects should_escalate_hitl=false with non-null escalation_reason (consistency)', () => {
      expect(
        parseClassifierResponse(
          '{"classification_type":"safe","confidence":0.9,"should_escalate_hitl":false,"escalation_reason":"low_confidence"}',
        ),
      ).toBeNull()
    })

    it('rejects missing required field', () => {
      expect(
        parseClassifierResponse(
          '{"classification_type":"safe","confidence":0.9,"should_escalate_hitl":false}',
        ),
      ).toBeNull()
    })

    it('rejects extra free-form text before/after JSON', () => {
      expect(
        parseClassifierResponse(
          'Sure, here is the result: {"classification_type":"safe","confidence":0.9,"should_escalate_hitl":false,"escalation_reason":null}',
        ),
      ).toBeNull()
    })
  })
})

describe('classificationToSeverity · canon §4.3 #5 mapping', () => {
  it('safe → LOW', () => {
    expect(
      classificationToSeverity({
        classification_type: 'safe',
        confidence: 1,
        should_escalate_hitl: false,
        escalation_reason: null,
      }),
    ).toBe('LOW')
  })

  it('role_spoof / instruction_override / obfuscated → MEDIUM', () => {
    for (const t of ['role_spoof', 'instruction_override', 'obfuscated'] as const) {
      expect(
        classificationToSeverity({
          classification_type: t,
          confidence: 0.9,
          should_escalate_hitl: false,
          escalation_reason: null,
        }),
      ).toBe('MEDIUM')
    }
  })

  it('exfiltration / jailbreak → HIGH', () => {
    for (const t of ['exfiltration', 'jailbreak'] as const) {
      expect(
        classificationToSeverity({
          classification_type: t,
          confidence: 0.9,
          should_escalate_hitl: true,
          escalation_reason: 'high_risk_route_egress',
        }),
      ).toBe('HIGH')
    }
  })
})

describe('classifierGate · async · canon canonical R2 hardening', () => {
  it('fail-open UNKNOWN when no client injected', async () => {
    const d = await classifierGate('any text', { session_id: 'abc123' })
    expect(d.verdict).toBe('pass')
    expect(d.severity).toBe('UNKNOWN')
    expect(d.reason).toBe('no_client_injected')
    expect(d.metadata?.gate_error).toBe(true)
  })

  it('fail-open UNKNOWN when classifier returns malformed JSON', async () => {
    const client = fakeClient('I cannot do that')
    const d = await classifierGate('hi', { session_id: 'abc', client })
    expect(d.verdict).toBe('pass')
    expect(d.severity).toBe('UNKNOWN')
    expect(d.reason).toBe('malformed_classifier_output')
  })

  it('pass on safe classification canon canonical', async () => {
    const client = fakeClient(
      '{"classification_type":"safe","confidence":0.95,"should_escalate_hitl":false,"escalation_reason":null}',
    )
    const d = await classifierGate('hi', { session_id: 'abc', client })
    expect(d.verdict).toBe('pass')
    expect(d.severity).toBe('LOW')
    expect(d.metadata?.classification_type).toBe('safe')
  })

  it('flag on jailbreak classification canon canonical', async () => {
    const client = fakeClient(
      '{"classification_type":"jailbreak","confidence":0.92,"should_escalate_hitl":true,"escalation_reason":"high_risk_route_egress"}',
    )
    const d = await classifierGate('do anything now', { session_id: 'abc', client })
    expect(d.verdict).toBe('flag')
    expect(d.severity).toBe('HIGH')
    expect(d.metadata?.should_escalate_hitl).toBe(true)
  })

  it('fail-open UNKNOWN on timeout canon canonical', async () => {
    const slowClient: ClassifierClient = {
      // Canon canonical · never resolves · forces timeout.
      createMessage: () => new Promise(() => {}),
    }
    const d = await classifierGate('hi', {
      session_id: 'abc',
      client: slowClient,
      timeout_ms: 50,
    })
    expect(d.verdict).toBe('pass')
    expect(d.severity).toBe('UNKNOWN')
    expect(d.reason).toBe('classifier_call_failed')
  })

  it('canon canonical · payload sent ONLY in user turn (R2 #4)', async () => {
    const client = fakeClient(
      '{"classification_type":"safe","confidence":0.9,"should_escalate_hitl":false,"escalation_reason":null}',
    )
    const spyClient: ClassifierClient = {
      createMessage: vi.fn(client.createMessage),
    }
    await classifierGate('PAYLOAD-EVIL-MARKER', { session_id: 'ses123', client: spyClient })
    const call = (spyClient.createMessage as ReturnType<typeof vi.fn>).mock.calls[0][0]
    // System prompt canon canonical NUNCA contiene payload.
    expect(call.system).toBe(CLASSIFIER_SYSTEM_PROMPT)
    expect(call.system).not.toContain('PAYLOAD-EVIL-MARKER')
    // User content canon canonical contains payload + session marker.
    expect(call.messages[0].role).toBe('user')
    expect(call.messages[0].content).toContain('PAYLOAD-EVIL-MARKER')
    expect(call.messages[0].content).toContain('session="ses123"')
    expect(call.messages[0].content).toContain('<untrusted-data')
  })
})
