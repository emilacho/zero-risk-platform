/**
 * 17-nov · GO Lenovo «quitar rejas» · tramo 4a de CC3 · identidades (A·3, A·4, A·5, A·7, A·8, A·9, A·10, C6) por el protocolo identity_content.
 * Una prueba por regla quitada (si vuelve, cae); lo que se queda (calidad C9, contrato JSON) también se prueba. US$ 0, sin red.
 */
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { antesDe4a, CAMBIOS_4A } from './fixtures/rejas-4a'

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..')
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n')
const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex')
const id = (n: string) => leer(`src/agents/identities/${n}.md`)
const MIG = leer('supabase/migrations/202611171600_agents_rejas_tramo_4a.sql')
const REV = leer('supabase/reversas/202611171600_agents_rejas_tramo_4a_REVERSA.sql')
// lo leído en producción el 17-nov (SELECT md5(identity_content))
const VIVO: Record<string, string> = {
  'tiktok-strategist': '1c1277c55faedf2a5a1a6367f82a4c6c',
  'inclusive-visuals-specialist': 'e44ddd6d864621bb231302b93967efd0',
  'carousel-designer': 'fe4f84a7d880b05dc6a74f943e058edd',
  'content-creator': '82a40babc166f3945cbdc38c070f5324',
  'style-consistency-reviewer': 'bbbc26672fe727c5a07c34bd01b85245',
}
const VOSEO = /\b(agendá|reservá|escribí|descargá|probá|recibí|tenés|podés|sabés|querés|hacé|decí)(?![\p{L}])/u

describe('A·3 · A·4 · TikTok', () => {
  it('sin público fijo «Gen Z y Gen Alpha»: el del plan y el brief', () => {
    expect(id('tiktok-strategist')).not.toMatch(/Gen Z and Gen Alpha/)
    expect(id('tiktok-strategist')).toContain('The audience is the one the plan and the brief name for this client (no fixed generation)')
  })
  it('sin «5-8» hashtags: los decide la tabla de formatos y la red', () => {
    expect(id('tiktok-strategist')).not.toMatch(/\(5-8 total\)/)
    expect(id('tiktok-strategist')).toContain("how many: the format table and the network's own rules decide")
  })
})

describe('A·5 · Inclusive Visuals', () => {
  it('los negativos son del manual y el brief; la lista fija es solo sugerencia', () => {
    const t = id('inclusive-visuals-specialist')
    expect(t).toContain('[NEGATIVE CONSTRAINTS]: ${negativosDelManualYElBrief}. Only if the brand manual and the brief say nothing, these are suggestions (the manual rules)')
    expect(t).not.toMatch(/Background subjects must exhibit/)
  })
  it('C9 se queda como calidad: sin actores de fondo clonados', () => {
    expect(id('inclusive-visuals-specialist')).toContain('Always (quality): no cloned background actors')
  })
})

describe('A·7 · A·8 · A·9 · C6 · carrusel', () => {
  const t = id('carousel-designer')
  it('A·7: el número de láminas es dato; ni «ALWAYS 1 slide» ni «stick to convention»', () => {
    expect(t).not.toMatch(/ALWAYS 1 slide|stick to convention|drop to 1-3 max|## Per-platform constraints/)
    expect(t).toContain('Lengths and slide count are data: the limits of the request (the office template, the format table, the brand manual).')
  })
  it('A·8: sin largos fijos por campo ni rótulo numerado obligatorio', () => {
    expect(t).not.toMatch(/max (24|90|220|32) chars/)
    expect(t).not.toMatch(/eyebrows are NUMBERED/)
    expect(t).toContain('**Eyebrow rhythm** · optional · numbered, themed or none: the brand')
  })
  it('A·9: sin «una sola familia de verbos» en todas las redes (ni en las reglas, ni en el flujo, ni en las métricas)', () => {
    expect(t).not.toMatch(/NEVER mix CTA verb families|CTA verb family discipline|Decide CTA verb family ONCE|Single CTA verb family per cascade/)
    expect(t).toContain('4. Choose the CTA verbs for each platform (they may differ')
  })
  it('A·7: el número de láminas sale de los límites del pedido también en el flujo y en las métricas', () => {
    expect(t).not.toMatch(/Pick slide count from the convention table|convention range/)
    expect(t).toContain("Pick slide count from the request's limits (template, format table)")
  })
  it('A·9 aguas abajo: el revisor de estilo ya no exige una familia de verbos; solo marca lo que contradice el manual o el trato', () => {
    const r = id('style-consistency-reviewer')
    expect(r).not.toMatch(/pick a family, stick to it/)
    expect(r).toContain("flag only verbs that contradict the brand manual or the client's")
    expect(r).not.toMatch(VOSEO)
    expect(r).not.toMatch(/(?<![\p{L}])pedí(?![\p{L}])/u) // \b no sirve con letras acentuadas
  })
  it('C6: sin voseo', () => {
    expect(t).not.toMatch(VOSEO)
  })
  it('el contrato JSON del carrusel sigue igual (slide_count, cta_verb_family, open_questions)', () => {
    for (const k of ['"slide_count"', '"cta_verb_family": "agenda|reserva|escribe"', '"open_questions"', '`slide_index`', '`role`']) expect(t, k).toContain(k)
  })
})

describe('A·10 · content-creator · la landing', () => {
  it('los largos son referencia; mandan la plantilla de la landing y el manual', () => {
    expect(id('content-creator')).not.toMatch(/\*\*Copy rules per component type\*\*/)
    expect(id('content-creator')).toContain('(starting point · the landing template and the brand manual rule; if they set lengths or counts, those win)')
  })
})

describe('202611171600 · la migración y su reversa (protocolo identity_content)', () => {
  it.each(Object.keys(VIVO))('%s: la migración lleva el .md byte a byte con guarda md5 del vivo; la reversa devuelve el vivo solo sobre el nuevo', (n) => {
    const nuevo = id(n)
    expect(MIG).toContain(`UPDATE public.agents SET identity_content = $ident$${nuevo}$ident$\nWHERE name = '${n}' AND md5(identity_content) = '${VIVO[n]}';`)
    expect(MIG).toContain(`name = '${n}' AND md5(identity_content) = '${md5(nuevo)}') THEN RAISE EXCEPTION`)
    const b = new RegExp(`-- ${n} · vuelve al texto vivo[^\\n]*\\nUPDATE public\\.agents SET identity_content = \\$antes\\$([\\s\\S]*?)\\$antes\\$\\nWHERE name = '${n}' AND md5\\(identity_content\\) = '${md5(nuevo)}';`).exec(REV)
    expect(b, n).not.toBeNull()
    expect(md5(b![1])).toBe(VIVO[n])
    expect(REV).toContain(`name = '${n}' AND md5(identity_content) = '${VIVO[n]}') THEN RAISE EXCEPTION`)
  })
  it('solo toca identity_content de esas 5 filas', () => {
    expect(MIG.match(/^UPDATE public\.agents SET identity_content = /gm)).toHaveLength(5)
    expect(MIG).not.toMatch(/\b(DELETE|DROP|INSERT|ALTER|TRUNCATE)\b|SET model/)
  })
  it('frente a lo vivo cambia SOLO lo del tramo (en 4 el vivo = el repo de antes; en carousel-designer el vivo ya traía el tuteo)', () => {
    for (const n of ['tiktok-strategist', 'inclusive-visuals-specialist', 'content-creator', 'style-consistency-reviewer']) {
      const vivo = new RegExp(`-- ${n} · vuelve al texto vivo[^\\n]*\\nUPDATE public\\.agents SET identity_content = \\$antes\\$([\\s\\S]*?)\\$antes\\$`).exec(REV)![1]
      expect(antesDe4a(`${n}.md`, id(n)), n).toBe(vivo)
    }
    expect(Object.keys(CAMBIOS_4A).map((f) => f.replace(/\.md$/, '')).sort()).toEqual(Object.keys(VIVO).sort())
  })
})
