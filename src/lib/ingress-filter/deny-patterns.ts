/**
 * Canon canonical deny patterns v1 · ADR-012 §4.2 · EN + ES post-R6
 *
 * canonical · runtime caller may also load patterns dynamically from
 * `public.ingress_deny_patterns` DB table · this canon canonical file is
 * the bootstrap canon canonical baseline · seed data candidate for
 * `INSERT INTO public.ingress_deny_patterns` post-migration apply.
 *
 * §148 honest caveat · ES patterns NUNCA testeadas contra golden set
 * hispano · FP rate UNKNOWN until PoC §7.3 item 1 (R5 elevado a gate
 * pre-flip-enforce). Lista canónica v1 · expandible v2 post-shadow.
 */
import type { Severity } from './types'

export interface DenyPattern {
  pattern_id: string
  pattern: RegExp
  description: string
  severity: Severity
  locale: 'en' | 'es' | 'all'
}

/** Canon EN patterns · canon canonical original DRAFT pre-R6. */
export const EN_PATTERNS: DenyPattern[] = [
  {
    pattern_id: 'ignore_previous_v1_en',
    pattern: /ignore (?:all |the |previous |earlier |above )?(?:instructions|prompts|rules|system message)/i,
    description: 'Direct instruction override attempt · canonical canon "ignore previous instructions"',
    severity: 'HIGH',
    locale: 'en',
  },
  {
    pattern_id: 'disregard_previous_v1_en',
    pattern: /(?:disregard|forget|override) (?:previous|earlier|above|all)/i,
    description: 'Instruction override variant · disregard/forget/override',
    severity: 'HIGH',
    locale: 'en',
  },
  {
    pattern_id: 'role_spoof_markers_v1_en',
    pattern: /\b(?:system|assistant|user)\s*[:=]\s*/i,
    description: 'Role spoof canonical · system:/assistant:/user: markers',
    severity: 'MEDIUM',
    locale: 'en',
  },
  {
    pattern_id: 'xml_role_tags_v1_en',
    pattern: /<\/?(?:system|assistant|user|sys|inst)>/i,
    description: 'XML role tag canonical · <system> <assistant> <user>',
    severity: 'HIGH',
    locale: 'en',
  },
  {
    pattern_id: 'markdown_system_block_v1_en',
    pattern: /```(?:system|instructions?|prompt)/i,
    description: 'Markdown code block claiming canonical to be system',
    severity: 'MEDIUM',
    locale: 'en',
  },
  {
    pattern_id: 'dan_mode_v1_en',
    pattern: /\bDAN\s+mode\b/i,
    description: 'Canonical jailbreak template · DAN mode',
    severity: 'HIGH',
    locale: 'en',
  },
  {
    pattern_id: 'developer_mode_v1_en',
    pattern: /\b(?:do anything now|developer mode|root mode)\b/i,
    description: 'Canonical jailbreak · developer mode / root mode / DAN',
    severity: 'HIGH',
    locale: 'en',
  },
  {
    pattern_id: 'reveal_system_prompt_v1_en',
    pattern: /(?:please |kindly )?(?:reveal|show|print|output|expose|disclose|repeat) (?:your |the |all )?(?:system|initial|original) (?:prompt|instructions|rules|message)/i,
    description: 'Canonical exfiltration · request to reveal system prompt',
    severity: 'HIGH',
    locale: 'en',
  },
  {
    pattern_id: 'role_change_v1_en',
    pattern: /\b(?:as |since |because )?(?:you are now|you're now|you become|act as)/i,
    description: 'Canonical role override · "you are now" / "act as"',
    severity: 'MEDIUM',
    locale: 'en',
  },
  {
    pattern_id: 'jailbreak_literal_v1_en',
    pattern: /\bjailbreak\b/i,
    description: 'Canonical · literal "jailbreak" keyword',
    severity: 'MEDIUM',
    locale: 'en',
  },
  // ─── v2 additions canon canonical · canon canonical RESULTS-CC1-ADR-012-fp-
  // measurement-preflip findings · 3 EN misses identificados golden set v1 ·
  // (canon canonical symmetric con ES role_brackets_v1_es existente).
  {
    pattern_id: 'role_brackets_v2_en',
    pattern: /\[(?:SYSTEM|ASSISTANT|USER|INSTRUCTION|END|SYS|INST)\]/i,
    description: 'Canonical role-spoof EN bracketed v2 · [SYSTEM] [ASSISTANT] [USER] [INSTRUCTION] [END] · canon symmetric con role_brackets_v1_es',
    severity: 'HIGH',
    locale: 'en',
  },
  {
    pattern_id: 'override_security_v2_en',
    pattern: /\b(?:override|bypass|disable|circumvent) (?:security|safety|safeguards?|filters?|guardrails?|restrictions?)\b/i,
    description: 'Canonical security override variant v2 · "override security" / "bypass safety" / "disable filters"',
    severity: 'HIGH',
    locale: 'en',
  },
  {
    pattern_id: 'print_internal_v2_en',
    pattern: /\b(?:print|show|output|reveal|expose|dump) (?:all |the |your )?(?:internal|hidden|secret) (?:instructions?|prompts?|rules?|configurations?)\b/i,
    description: 'Canonical exfiltration variant v2 · "print all internal instructions" / "show hidden prompt"',
    severity: 'HIGH',
    locale: 'en',
  },
]

/** Canon canonical ES patterns · post-R6 · mercado hispano nativo. */
export const ES_PATTERNS: DenyPattern[] = [
  {
    pattern_id: 'ignora_anteriores_v1_es',
    pattern: /(?:ignor[áa]|ignora) (?:todas? |las? |la |el |las |los )?(?:instrucciones|órdenes|reglas|mensaje del sistema|prompt) (?:anteriores?|previas?|de arriba|del? sistema)?/i,
    description: 'Canonical override ES · "ignorá las instrucciones anteriores"',
    severity: 'HIGH',
    locale: 'es',
  },
  {
    pattern_id: 'olvida_anterior_v1_es',
    pattern: /(?:olvid[áa]|olvida) (?:todo|las? |lo (?:anterior|de arriba)|todo lo (?:anterior|de antes|previo))/i,
    description: 'Canonical override ES · "olvidá todo lo anterior"',
    severity: 'HIGH',
    locale: 'es',
  },
  {
    pattern_id: 'descarta_reglas_v1_es',
    pattern: /(?:descart[áa]|ignor[áa]|sobreescrib[íi]|anul[áa]) (?:lo (?:anterior|previo)|las? reglas|las? instrucciones)/i,
    description: 'Canonical override variant ES · descartá/anulá/sobreescribí',
    severity: 'HIGH',
    locale: 'es',
  },
  {
    pattern_id: 'hacete_pasar_v1_es',
    pattern: /(?:hac[ée]te? pasar por|act[úu]a como|comport[áa]te como|simul[áa] (?:ser|que sos))/i,
    description: 'Canonical role-impersonation ES · "hacete pasar por"',
    severity: 'MEDIUM',
    locale: 'es',
  },
  {
    pattern_id: 'modo_dev_v1_es',
    pattern: /(?:modo|estado) (?:desarrollador|root|admin|administrador|sin restricciones|liberado)/i,
    description: 'Canonical jailbreak ES · "modo desarrollador"',
    severity: 'HIGH',
    locale: 'es',
  },
  {
    pattern_id: 'revela_sistema_v1_es',
    pattern: /(?:revel[áa]|muestr[áa]|imprim[íi]|expon[ée]|divulg[áa]|repet[íi]) (?:tu |el |la |las |los )?(?:prompt|instrucciones?|reglas?|mensaje|configuración) (?:del? sistema|inicial|original|interna)/i,
    description: 'Canonical exfiltration ES · revelá las instrucciones del sistema',
    severity: 'HIGH',
    locale: 'es',
  },
  {
    pattern_id: 'eres_ahora_v1_es',
    pattern: /(?:eres ahora|ahora sos|te convert[íi]s en|asum[íi] el rol de)/i,
    description: 'Canonical identity-override ES · "ahora sos"',
    severity: 'MEDIUM',
    locale: 'es',
  },
  {
    pattern_id: 'rompe_restricciones_v1_es',
    pattern: /(?:fug[áa]te|escap[áa]te|romp[ée]) (?:de )?(?:tus? )?(?:restricciones|reglas|filtros|límites)/i,
    description: 'Canonical jailbreak ES · "rompé tus restricciones"',
    severity: 'HIGH',
    locale: 'es',
  },
  {
    pattern_id: 'role_brackets_v1_es',
    pattern: /\[(?:SISTEMA|ASISTENTE|USUARIO|INSTRUCCI[ÓO]N)\]/i,
    description: 'Canonical role-spoof ES bracketed · [SISTEMA]',
    severity: 'HIGH',
    locale: 'es',
  },
  {
    pattern_id: 'respond_link_v1_es',
    pattern: /(?:respond[ée]|contest[áa]) (?:con|incluyendo) (?:el? )?(?:enlace|link|url)/i,
    description: 'Canonical response-hijack ES · review-monitor injection típica',
    severity: 'HIGH',
    locale: 'es',
  },
  // ─── v2 ES addition canon canonical · canon canonical "mostrá tus reglas"
  // canon canonical-variant (existing v1 ES exfiltration only covers "revelá"
  // canon canonical-not "mostrá" canonical-canon-form-imperative).
  {
    pattern_id: 'mostra_reglas_v2_es',
    pattern: /\b(?:mostr[áa](?:me)?|enseñ[áa](?:me)?|dec[íi]me|cont[áa]me|list[áa](?:me)?)\s+(?:el |la |las |los |tu |tus )?(?:reglas?|prompt|instrucciones?|configuración|sistema interno|mensaje del sistema|memoria)\b/i,
    description: 'Canonical exfiltration ES variant v2 · "mostrá tus reglas internas" · "enseñame el prompt" · canon canonical-complemento revela_sistema_v1_es',
    severity: 'HIGH',
    locale: 'es',
  },
]

/** Canon canonical all patterns · EN + ES merged. */
export const ALL_PATTERNS: DenyPattern[] = [...EN_PATTERNS, ...ES_PATTERNS]

/** Canon canonical helper · filter patterns by locale. */
export function patternsForLocale(locale: 'en' | 'es' | 'auto'): DenyPattern[] {
  if (locale === 'en') return EN_PATTERNS
  if (locale === 'es') return ES_PATTERNS
  return ALL_PATTERNS
}
