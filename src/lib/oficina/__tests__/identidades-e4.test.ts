/**
 * T6b · IDENTIDADES E4 (FIRMA de Emilio 31-oct 16:30Z · PROPUESTA-CC3-correcciones-del-equipo §2/§3 + ANEXO 2 · PLAN v3 T6b) · US$ 0, sin modelo.
 *  · las citas a `creative-director` (redactor de anuncios) desaparecen de carousel-designer, video-editor, web_designer, delivery-coordinator y ruflo: ahora citan a
 *    `creative-director-mesa` (dirección), `design-visual-storyteller` (dirección visual) o `design-image-prompt-engineer` (pedidos de imagen);
 *  · el voseo INTERNO de spell-check-corrector, video-editor y jefe-marketing pasa a tuteo; `creative-director-mesa` deja de fijar «español de Ecuador»;
 *  · «Idioma del JSON» = el del manual del cliente en carousel-designer, delivery-coordinator y style-consistency-reviewer; video-editor cabecera Opus y reporta a la mesa;
 *  · la migración 202610312010 lleva cada `.md` BYTE A BYTE con guarda md5 del texto vivo respaldado y exige las 9 filas; la reversa restaura el texto vivo (respaldo de fila).
 *    (sello 2010: 2008 y 2009 son de CC2 en la misma semana de trabajo).
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..')
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n')
const md5 = (s: string) => createHash('md5').update(s, 'utf8').digest('hex')
const RUTA_MIGRACION = 'supabase/migrations/202610312010_agents_identidades_e4.sql'
const RUTA_REVERSA = 'supabase/reversas/202610312010_agents_identidades_e4_REVERSA.sql'
const MIGRACION = leer(RUTA_MIGRACION)
const REVERSA = leer(RUTA_REVERSA)
const IDIOMA_JSON = 'Idioma del JSON · el del manual del cliente (si el manual no lo fija, el idioma del país del cliente); no mezcles idiomas.'
// «vos» como palabra entera (también «de vos», «con vos»), no solo «vos » con espacio: así se escapó un «después de vos» en el corrector
const VOSEO = /\b(vos|hacés|recibís|devolvés|producís|detectá|capturás|ejecutás|generás|necesitás|sabés|consolidás|tenés|podés|decí|escribí)\b/i

const AGENTES: ReadonlyArray<{ name: string; archivo: string }> = [
  { name: 'carousel-designer', archivo: 'carousel-designer.md' },
  { name: 'creative-director-mesa', archivo: 'creative-director-mesa.md' },
  { name: 'delivery-coordinator', archivo: 'delivery-coordinator.md' },
  { name: 'jefe-marketing', archivo: 'jefe-marketing.md' },
  { name: 'ruflo', archivo: 'ruflo.md' },
  { name: 'spell-check-corrector', archivo: 'spell-check-corrector.md' },
  { name: 'style-consistency-reviewer', archivo: 'style-consistency-reviewer.md' },
  { name: 'video-editor', archivo: 'video-editor.md' },
  { name: 'web_designer', archivo: 'web-designer.md' },
]
const identidad = (archivo: string) => leer(`src/agents/identities/${archivo}`)

describe('T6b · lo que dicen las identidades corregidas', () => {
  it.each(['carousel-designer.md', 'video-editor.md', 'web-designer.md', 'delivery-coordinator.md', 'ruflo.md'])('🔴 %s ya no cita a creative-director (solo a creative-director-mesa, design-visual-storyteller o design-image-prompt-engineer)', (archivo) => {
    const t = identidad(archivo)
    expect(t).not.toMatch(/creative-director(?!-mesa)/)
    expect(t).not.toMatch(/creative director/i)
    expect(t).toMatch(/creative-director-mesa|design-visual-storyteller|design-image-prompt-engineer/)
  })
  it('🔴 carousel-designer: la dirección visual viene de design-visual-storyteller (o de creative-director-mesa cuando dirige)', () => {
    const t = identidad('carousel-designer.md')
    expect(t).toContain('those come from the brand book + the visual direction given by `design-visual-storyteller` (or `creative-director-mesa` when it directs the piece).')
    expect(t).toContain('- `visual_direction` · output of `design-visual-storyteller` (palette_top5,')
  })
  it('🔴 video-editor: cabecera Opus y las tres líneas de reporte apuntan a creative-director-mesa; las citas del texto también', () => {
    const t = identidad('video-editor.md')
    expect(t).toMatch(/^model: claude-opus-4-6$/m)
    for (const k of ['reports_to', 'peer_reviewer', 'escalation_path']) expect(t).toMatch(new RegExp(`^${k}: creative-director-mesa$`, 'm'))
    expect(t).toContain('Never skip the creative-director-mesa review for video deliverables')
    expect(t).toContain('You work closely with creative-director-mesa (your peer reviewer)')
    expect(t).toContain('Deliver video assets to QA pipeline for creative-director-mesa review')
  })
  it('🔴 web_designer y delivery-coordinator: los pedidos de imagen son de design-image-prompt-engineer y la dirección visual de design-visual-storyteller', () => {
    const w = identidad('web-designer.md')
    expect(w).toContain("component plan and design-visual-storyteller's visual direction into a layout")
    expect(w).toContain('- **design-image-prompt-engineer** · produces image prompts for image slots')
    expect(w).toContain('5. **Open questions for brand-strategist or design-visual-storyteller** · explicit')
    const d = identidad('delivery-coordinator.md')
    expect(d).toContain("verify design-image-prompt-engineer's prompts are coherent with the")
    expect(d).toContain('"fix_owner": "content-creator | web-designer | design-visual-storyteller | design-image-prompt-engineer | ...",')
    expect(identidad('ruflo.md')).toContain('- creative-director-mesa: Brand guidelines, creative direction, creative review (visual direction: design-visual-storyteller)')
    expect(identidad('ruflo.md')).not.toContain('```json') // observación de CC3: el ejemplo va sin cerco, como vive hoy (la regla dice «NO uses markdown code blocks»)
  })
  it.each(['spell-check-corrector.md', 'video-editor.md', 'jefe-marketing.md'])('🔴 %s: sin voseo interno (texto interno en tuteo, firma de Emilio 11-oct)', (archivo) => {
    expect(identidad(archivo)).not.toMatch(VOSEO)
  })
  it('🔴 el corrector dice «Eres», «haces», «Recibes», «devuelves», «produces», «Detecta», «capturas»; el jefe «consolidas»; el editor «ejecutas», «generas», «necesitas», «sabes», «producen», «tú produces»', () => {
    const c = identidad('spell-check-corrector.md')
    for (const s of ['Eres el primer filtro', 'NO haces review', 'Recibes un payload', 'devuelves JSON', 'Si produces prose', '4. **Detecta inconsistencias', 'capturas', 'después de ti)']) expect(c, s).toContain(s)
    expect(identidad('jefe-marketing.md')).toContain('consolidas los resultados')
    const v = identidad('video-editor.md')
    for (const s of ['ejecutas **en paralelo**', 'NO generas video real', 'NO necesitas generar', 'NO sabes handlear', 'pero producen outputs distintos', 'tú produces especificaciones']) expect(v, s).toContain(s)
  })
  it.each(['carousel-designer.md', 'delivery-coordinator.md', 'style-consistency-reviewer.md'])('🔴 %s: «Idioma del JSON» es el del manual del cliente, no «siempre español … Ecuador»', (archivo) => {
    const t = identidad(archivo)
    expect(t).toContain(IDIOMA_JSON)
    expect(t).not.toMatch(/siempre español|Zero Risk Ecuador/)
  })
  it('🔴 creative-director-mesa ya no fija «español de Ecuador con tuteo» por omisión: sin dato declara el hueco', () => {
    const t = identidad('creative-director-mesa.md')
    expect(t).not.toMatch(/español de Ecuador|por omisión/)
    expect(t).toContain('en el idioma y el registro que fije el manual o el país del cliente (sin dato, declara que falta y evita la segunda persona marcada).')
  })
})

describe('T6b · la migración 202610312008 y su reversa (protocolo identity_content)', () => {
  it.each(AGENTES.map((a) => [a.name, a] as const))('🔴 %s: la migración lleva el .md byte a byte con guarda md5 del texto vivo; la reversa restaura solo sobre el texto nuevo', (_n, a) => {
    const nuevo = identidad(a.archivo)
    expect(MIGRACION, a.name).toContain(`$ident$${nuevo}$ident$`)
    // las 3 filas que viven en CRLF aceptan dos md5 (el CRLF de hoy y el LF que deja la reversa); las demás uno solo
    const dos = ['delivery-coordinator', 'style-consistency-reviewer', 'web_designer'].includes(a.name)
    expect(MIGRACION).toMatch(new RegExp(`WHERE name = '${a.name}' AND md5\\(identity_content\\) ${dos ? "IN \\('[0-9a-f]{32}', '[0-9a-f]{32}'\\)" : "= '[0-9a-f]{32}'"};`))
    expect(REVERSA).toContain(`WHERE name = '${a.name}' AND md5(identity_content) = '${md5(nuevo)}';`)
    // el respaldo de la reversa es el texto VIVO (distinto del nuevo) y no está vacío
    const bloque = new RegExp(`-- ${a.name} · vuelve al texto vivo[^\\n]*\\nUPDATE public\\.agents SET identity_content = \\$antes\\$([\\s\\S]*?)\\$antes\\$`).exec(REVERSA)
    expect(bloque, a.name).not.toBeNull()
    expect(bloque![1].length).toBeGreaterThan(1000)
    expect(bloque![1].replace(/\r\n/g, '\n')).not.toBe(nuevo)
    if (dos) expect(MIGRACION).toContain(`'${md5(bloque![1])}')`) // el md5 del texto LF de la reversa es el segundo de la guarda
  })
  it('🔴 la reversa, la migración y las 9 identidades se guardan en LF (lo que git guarda, no la carpeta de Windows) y .gitattributes lo fija con eol=lf', () => {
    // reserva de CC3: con autocrlf=true la carpeta materializa CRLF; lo que importa es el contenido guardado en git (índice), que es lo que se aplica en T9
    const enGit = (rel: string) => {
      try {
        return execFileSync('git', ['show', `:${rel}`], { cwd: RAIZ, encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 })
      } catch {
        return fs.readFileSync(path.join(RAIZ, rel), 'utf8') // sin git (CI sin índice): la carpeta, que allí es LF
      }
    }
    for (const rel of [RUTA_REVERSA, RUTA_MIGRACION, ...AGENTES.map((a) => `src/agents/identities/${a.archivo}`)]) expect(enGit(rel), rel).not.toMatch(/\r/)
    const atributos = leer('.gitattributes')
    for (const regla of ['src/agents/identities/*.md text eol=lf', 'supabase/migrations/202610312010_*.sql text eol=lf', 'supabase/reversas/202610312010_*.sql text eol=lf']) expect(atributos).toContain(regla)
  })
  it('🔴 el sello 2010 no choca con ninguna otra migración ni reversa del 31-oct (2008 y 2009 son de CC2)', () => {
    const sello = (f: string) => f.slice(0, 12)
    for (const carpeta of ['supabase/migrations', 'supabase/reversas']) {
      const del31 = fs.readdirSync(path.join(RAIZ, carpeta)).filter((f) => f.startsWith('20261031'))
      expect(del31.filter((f) => sello(f) === '202610312010'), carpeta).toHaveLength(1)
    }
  })
  it('🔴 el respaldo de la reversa es el texto de ANTES de E4 (con las citas viejas y el voseo), no una copia del nuevo', () => {
    expect(REVERSA).toContain('those come from the brand book + creative-director visual direction.')
    expect(REVERSA).toContain('reports_to: creative-director\n')
    expect(REVERSA).toContain('Vos sos el primer filtro')
    expect(REVERSA).toContain('consolidás')
    expect(REVERSA).toContain('(por omisión, español de Ecuador con tuteo)')
    expect(REVERSA).toContain("identity_source = 'msitarzewski/agency-agents -> strategy/nexus-strategy.md'")
  })
  it('🔴 la migración solo hace UPDATE de identity_content (+ identity_source de jefe-marketing), exige las 9 filas o se revierte, es idempotente y no toca modelos ni otras filas', () => {
    expect(MIGRACION).toContain('idempotente')
    expect(MIGRACION.match(/^UPDATE public\.agents SET identity_content = \$ident\$/gm)).toHaveLength(AGENTES.length)
    expect(MIGRACION).not.toMatch(/\b(DELETE|DROP|INSERT|ALTER|TRUNCATE)\b/)
    expect(MIGRACION).not.toMatch(/SET model|model =/)
    expect(MIGRACION).toContain("identity_source = 'project-local:src/agents/identities/jefe-marketing.md · adaptado de MatthiasMRC/bmad-marketing-growth (Max Growth) · corregido E4 2026-10-31 (antes decía msitarzewski nexus-strategy)'")
    expect(MIGRACION.match(/identity_source = /g)).toHaveLength(1)
    expect(MIGRACION).toMatch(/IF n <> 9 THEN\n\s*RAISE EXCEPTION 'identidades E4: solo % de 9 filas/)
    expect(MIGRACION).toContain('SIN APLICAR')
    expect(MIGRACION.trim().endsWith("NOTIFY pgrst, 'reload schema';")).toBe(true)
    expect(REVERSA.match(/^UPDATE public\.agents SET identity_content = \$antes\$/gm)).toHaveLength(AGENTES.length)
    expect(REVERSA).not.toMatch(/\b(DELETE|DROP|INSERT|ALTER)\b/)
  })
})
