/**
 * 17-nov · GO Lenovo «quitar rejas» · tramo 4b de CC3 · identidades (A·11, coach del video, C6 delivery, C7, 9:16 fijo, C8) por el protocolo identity_content.
 * Una prueba por regla quitada (si vuelve, cae); lo que se queda (contratos, lo técnico de audio) también. US$ 0, sin red.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { aplicar4b, CABECERA_C7, NUEVO_C7 } from './fixtures/rejas-4b'

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..')
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n')
const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex')
const id = (f: string) => leer(`src/agents/identities/${f}.md`)
const MIG = leer('supabase/migrations/202611171700_agents_rejas_tramo_4b.sql')
const REV = leer('supabase/reversas/202611171700_agents_rejas_tramo_4b_REVERSA.sql')
// lo leído en producción el 17-nov (SELECT md5(identity_content)); editor_en_jefe vive en CRLF: su md5 en LF es el que deja la reversa
const VIVO: Record<string, { md5: string; lf?: string }> = {
  sales_outbound_strategist: { md5: '5b05b2011dd62fd51c852cc3a7273e9d' },
  'video-editor': { md5: '85cd2eb46a45359e8d4acc074b9e13aa' },
  editor_en_jefe: { md5: '595325647d08dd503659a86f608ae0a5', lf: 'd57c1ad7938b2cdb1ea57e2fe0142779' },
  'design-visual-storyteller': { md5: '505da900d7143397c2b6cc705b555195' },
  'whimsy-injector': { md5: '8e98ebc5c82c003032ff3ded72bd6d97' },
  'social-media-strategist': { md5: 'b7b702326660eefedcdcc7f7f5a770a7' },
  marketing_short_video_editing_coach: { md5: 'b3530d252459aa424fcefc98a026eca1' },
}
const VOSEO = /(?<![\p{L}])(agendá|reservá|escribí|descubrí|descargá|probá|recibí|pedí|tenés|podés|sabés|querés)(?![\p{L}])/iu
const bloqueDe = (sql: string, delim: string, n: string) => new RegExp(`-- ${n} · [^\\n]*\\n(?:--[^\\n]*\\n)?UPDATE public\\.agents SET identity_content = \\$${delim}\\$([\\s\\S]*?)\\$${delim}\\$`).exec(sql)![1]

describe('A·11 · el asunto del correo frío (Outbound Strategist · archivo sales-enablement.md)', () => {
  const t = id('sales-enablement')
  it('largo, mayúsculas y emojis los fija el manual; ya no «3-5 words, lowercase» ni «never ALL CAPS, never emoji» como regla', () => {
    expect(t).not.toMatch(/never ALL CAPS, never emoji/)
    expect(t).not.toMatch(/^- 3-5 words, lowercase, looks like an internal email$/m)
    expect(t).toContain("length and capitalization: the brand manual's style")
    expect(t).toContain('Capitals and emoji: as the brand manual sets them')
  })
  it('«sin clickbait» queda como sugerencia', () => {
    expect(t).toContain('- No clickbait (suggestion).')
  })
})

describe('C7 · el generador de video es dato de la oficina', () => {
  it('editor_en_jefe: fuera la sección de herramientas (árbol Veo/Seedance, su JSON y el playbook); queda una línea que dice que es dato', () => {
    const t = id('editor_en_jefe')
    expect(t).not.toContain(CABECERA_C7)
    expect(t).not.toMatch(/Seedance|Veo 3\.1|video_tool|decision_step_matched|video-ai-tool-selection/)
    expect(t.endsWith(NUEVO_C7)).toBe(true)
  })
  it('editor_en_jefe conserva lo suyo de jefe (identidad, responsabilidades, instrucciones de salida)', () => {
    const t = id('editor_en_jefe')
    for (const s of ['## Identity', '## Responsibilities', '## Client Adaptation', '## Output Instructions']) expect(t, s).toContain(s)
  })
  it('video-editor: sin el generador nombrado', () => {
    expect(id('video-editor')).not.toMatch(/Seedance|Veo/)
    expect(id('video-editor')).toContain('(which generator and model is data of the office)')
  })
})

describe('9:16 fijo · video-editor', () => {
  it('la proporción es dato del pedido; 9:16 solo como supuesto de partida', () => {
    const t = id('video-editor')
    expect(t).not.toMatch(/9:16 hardcoded/)
    expect(t).toContain('3. **Proporción · dato del pedido** · la dan el brief y la tabla de formatos de cada red (supuesto de partida: 9:16')
  })
})

describe('C6 · delivery-coordinator sin voseo (lo vivo ya estaba en tuteo)', () => {
  it('sin «Descubrí» ni «Agendá»', () => {
    expect(id('delivery-coordinator')).not.toMatch(VOSEO)
    expect(id('delivery-coordinator')).toContain("make primary CTA 'Agenda tu diagnóstico'")
  })
})

describe('C8 · los «must» genéricos pasan a supuesto de partida; manda el manual', () => {
  it('design-visual-storyteller · inicio, medio y fin', () => {
    expect(id('design-visual-storyteller')).not.toMatch(/must have clear narrative structure/)
    expect(id('design-visual-storyteller')).toContain('beginning, middle, end is a starting point; the brand manual and the brief rule')
  })
  it('whimsy-injector · cada elemento lúdico', () => {
    expect(id('whimsy-injector')).not.toMatch(/Every playful element must serve/)
    expect(id('whimsy-injector')).toContain('Every playful element should serve a functional or emotional purpose (starting point; the brand manual and the brief rule)')
  })
  it('social-media-strategist · hashtags de marca constantes', () => {
    expect(id('social-media-strategist')).not.toMatch(/Consistent branded and industry hashtags across platforms/)
    expect(id('social-media-strategist')).toContain("Branded and industry hashtags as the brand manual and each platform's data set them")
  })
})

describe('coach del gancho de video · estilo → dato; lo técnico de audio se queda', () => {
  const t = id('marketing_short_video_editing_coach')
  it('sin tipografías chinas fijas ni caras exageradas como regla', () => {
    expect(t).not.toMatch(/Source Han Sans|Alibaba PuHuiTi|Zcool/)
    expect(t).not.toMatch(/Thumbnail faces should be exaggerated/)
    expect(t).toContain("the brand manual's typography")
    expect(t).toContain('exaggerated expressions (surprise, joy, confusion) are one option, not a rule')
  })
  it('subtítulos en el tercio inferior y la miniatura: supuesto de partida', () => {
    expect(t).toContain("vertical video subtitles usually go in the lower third (starting point; the network's safe zones and the brief rule)")
    expect(t).toContain('Font size guidelines (starting point; the template and the network rule)')
    expect(t).toContain('high-contrast colors (starting point; the brand manual and the brief rule)')
  })
  it('lo técnico de audio sigue igual', () => {
    expect(t).toContain('Voice is king: For talking-head / narration videos, voice at -12dB to -6dB, BGM at -24dB to -18dB')
    expect(t).toContain('Sound effects level: Never louder than voice')
  })
})

describe('202611171700 · la migración y su reversa (protocolo identity_content)', () => {
  it.each(Object.keys(VIVO))('%s: la migración lleva el texto nuevo con guarda md5 del vivo; la reversa devuelve el vivo solo sobre el nuevo', (n) => {
    const nuevo = bloqueDe(MIG, 'ident', n)
    const antes = bloqueDe(REV, 'antes', n)
    const v = VIVO[n]
    expect(md5(antes)).toBe(v.lf ?? v.md5)
    const guarda = v.lf ? `IN ('${v.md5}', '${v.lf}')` : `= '${v.md5}'`
    expect(MIG).toContain(`$ident$\nWHERE name = '${n}' AND md5(identity_content) ${guarda};`)
    expect(MIG).toContain(`name = '${n}' AND md5(identity_content) = '${md5(nuevo)}') THEN RAISE EXCEPTION`)
    expect(REV).toContain(`$antes$\nWHERE name = '${n}' AND md5(identity_content) = '${md5(nuevo)}';`)
    expect(REV).toContain(`name = '${n}' AND md5(identity_content) ${guarda}) THEN RAISE EXCEPTION`)
    // el texto nuevo es el vivo con los pares del tramo (la misma función que generó el repo)
    const archivo = n === 'sales_outbound_strategist' ? 'sales-enablement.md' : `${n}.md`
    expect(aplicar4b(archivo, antes)).toBe(nuevo)
  })
  it('donde el repo y lo vivo eran iguales, quedan iguales; el coach (sin archivo) queda con su texto en el repo', () => {
    for (const [n, f] of [['sales_outbound_strategist', 'sales-enablement'], ['video-editor', 'video-editor'], ['design-visual-storyteller', 'design-visual-storyteller'], ['whimsy-injector', 'whimsy-injector'], ['marketing_short_video_editing_coach', 'marketing_short_video_editing_coach']]) expect(id(f), n).toBe(bloqueDe(MIG, 'ident', n))
  })
  it('solo toca identity_content de esas 7 filas', () => {
    expect(MIG.match(/^UPDATE public\.agents SET identity_content = /gm)).toHaveLength(7)
    expect(MIG).not.toMatch(/\b(DELETE|DROP|INSERT|ALTER|TRUNCATE)\b|SET model/)
  })
})
