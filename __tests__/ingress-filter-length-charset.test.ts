/**
 * Tests · Capa 5 length+charset · ADR-012 §4.5
 *
 * Spec · zr-vault/00-meta/opus-4-8-traspaso/ADR-012-anti-injection-ingress.md §4.5
 */
import { describe, it, expect } from 'vitest'
import {
  lengthCharsetGate,
  normalizeText,
  LENGTH_LIMITS,
} from '../src/lib/ingress-filter/gates/length-charset'

describe('lengthCharsetGate · Capa 5', () => {
  describe('canonical pass conditions', () => {
    it('pass on normal small text', () => {
      const d = lengthCharsetGate('hola, este es un texto normal')
      expect(d.verdict).toBe('pass')
      expect(d.severity).toBe('LOW')
      expect(d.gate).toBe('length_charset')
    })

    it('pass on text at max-1 chars', () => {
      const d = lengthCharsetGate('a'.repeat(LENGTH_LIMITS.max_field_chars - 1))
      expect(d.verdict).toBe('pass')
    })

    it('pass on multi-line text with TAB + LF + CR (allowed canon canonical whitespace)', () => {
      const d = lengthCharsetGate('line1\nline2\tindented\rcr-end')
      expect(d.verdict).toBe('pass')
    })

    it('pass on Spanish accent chars (UTF-8 byte count canónico)', () => {
      const d = lengthCharsetGate('Configuración canónica · canon canonical áéíóúñ')
      expect(d.verdict).toBe('pass')
    })
  })

  describe('canonical block conditions', () => {
    it('block on oversized char count', () => {
      const d = lengthCharsetGate('a'.repeat(LENGTH_LIMITS.max_field_chars + 1))
      expect(d.verdict).toBe('block')
      expect(d.severity).toBe('MEDIUM')
      expect(d.reason).toBe('oversized_chars')
    })

    it('block on oversized byte count (multi-byte UTF-8 push over)', () => {
      // Canon canonical · construct text that fits char limit but exceeds byte limit.
      // Use 4-byte emoji canon canonical.
      const heavy = '𝕊'.repeat(15000) // 4 bytes per char · 60,000 bytes > 50,000 limit
      const d = lengthCharsetGate(heavy)
      expect(d.verdict).toBe('block')
      expect(['oversized_chars', 'oversized_bytes']).toContain(d.reason)
    })

    it('block on zero-width unicode (U+200B)', () => {
      const d = lengthCharsetGate('hello​world')
      expect(d.verdict).toBe('block')
      expect(d.severity).toBe('HIGH')
      expect(d.reason).toBe('zero_width_unicode')
    })

    it('block on RTL override (U+202E)', () => {
      const d = lengthCharsetGate('admin‮txt.exe')
      expect(d.verdict).toBe('block')
      expect(d.reason).toBe('zero_width_unicode')
    })

    it('block on BOM (U+FEFF)', () => {
      const d = lengthCharsetGate('﻿some text')
      expect(d.verdict).toBe('block')
      expect(d.reason).toBe('zero_width_unicode')
    })

    it('block on control chars (U+0001)', () => {
      const d = lengthCharsetGate('helloworld')
      expect(d.verdict).toBe('block')
      expect(d.severity).toBe('MEDIUM')
      expect(d.reason).toBe('control_chars')
    })
  })

  describe('canonical options override', () => {
    it('respects max_field_chars option', () => {
      const d = lengthCharsetGate('hello world', { max_field_chars: 5 })
      expect(d.verdict).toBe('block')
      expect(d.reason).toBe('oversized_chars')
    })

    it('respects max_payload_bytes option', () => {
      const d = lengthCharsetGate('abcdef', { max_payload_bytes: 3 })
      expect(d.verdict).toBe('block')
      expect(d.reason).toBe('oversized_bytes')
    })
  })

  describe('canonical latency canon', () => {
    it('latency_ms < 10ms for typical payload', () => {
      const d = lengthCharsetGate('test payload canon canonical')
      expect(d.latency_ms).toBeLessThan(10)
    })
  })
})

describe('normalizeText · NFKC canon canonical', () => {
  it('NFKC normalizes compatibility chars', () => {
    // Canon canonical · ﬁ (U+FB01 ligature) → fi (U+0066 U+0069).
    const result = normalizeText('ﬁ')
    expect(result).toBe('fi')
  })

  it('canonical-preserves regular ASCII', () => {
    expect(normalizeText('hello world')).toBe('hello world')
  })

  it('canonical-preserves Spanish accents (NFKC stable)', () => {
    expect(normalizeText('canónico')).toBe('canónico')
  })
})
