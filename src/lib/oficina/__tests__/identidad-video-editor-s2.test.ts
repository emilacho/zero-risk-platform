/**
 * SPRINT 2 · S2-2 · la identidad nueva de `video-editor` (GO Lenovo 16-nov 21:55) · US$ 0, sin base ni red ni modelo.
 *  · sin voseo; sin «NO generas video real» ni el tope de 200 caracteres de Veo 3.1; con el método de la mesa y la hoja de planos (prompts en inglés);
 *  · conserva lo que la oficina exige (reportes a creative-director-mesa, Opus) y el contrato JSON de la cascada social (`scenes`, `veo3_prompt`);
 *  · la migración lleva el .md byte a byte con guarda md5 del texto vivo; la reversa devuelve el texto vivo solo sobre el nuevo.
 */
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { ROLES_DEL_PLANO } from '../video/biblioteca'

const RAIZ = path.resolve(__dirname, '..', '..', '..', '..')
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n')
const md5 = (t: string) => crypto.createHash('md5').update(t, 'utf8').digest('hex')
const ID = leer('src/agents/identities/video-editor.md')
const MIG = leer('supabase/migrations/202611162232_agents_video_editor_identidad_s2.sql')
const REV = leer('supabase/reversas/202611162232_agents_video_editor_identidad_s2_REVERSA.sql')
// 17-nov · A·6 (202611171500) cambió el .md después: la migración del 16-nov lleva el texto S2, cuyo md5 queda fijo aquí
const ID_S2 = /\$ident\$([\s\S]*?)\$ident\$/.exec(MIG)![1]
const MD5_S2 = '7c79ae8b8d8b901aeb60d0f7ed71ff89'
const E4 = leer('src/lib/oficina/__tests__/fixtures/video-editor-e4.md')
// voseo: las formas que el barrido del 11-oct encontró más las de este texto (omití, dejá, incluí)
const VOSEO = /\b(vos|sos|hacés|recibís|devolvés|producís|detectá|capturás|ejecutás|generás|necesitás|sabés|consolidás|tenés|podés|decí|escribí|omití|dejá|incluí|usá|elegí|nombrá|decidí|seguí|integrás|proponés)\b/i

describe('la identidad nueva de video-editor', () => {
  it('sin voseo; sin «NO generas video real», sin Veo 3.1 ni el tope de 200 caracteres; sin Higgsfield', () => {
    expect(ID).not.toMatch(VOSEO)
    expect(ID).not.toMatch(/NO generas video real|Veo 3\.1|≤200|Higgsfield/)
    expect(E4).toMatch(/NO generas video real/) // el texto viejo sí lo tenía (la prueba distingue)
  })
  it('conserva Opus y las tres líneas de reporte a creative-director-mesa; nunca cita a creative-director a secas', () => {
    expect(ID).toMatch(/^model: claude-opus-4-6$/m)
    for (const k of ['reports_to', 'peer_reviewer', 'escalation_path']) expect(ID).toMatch(new RegExp(`^${k}: creative-director-mesa$`, 'm'))
    expect(ID).not.toMatch(/creative-director(?!-mesa)/)
    expect(ID).toContain('Never skip the creative-director-mesa review for video deliverables')
  })
  it('el método de la mesa: la biblioteca como guía (no lista cerrada), los roles de la historia con las claves de la biblioteca, una técnica protagonista una vez, el ritmo que avisa, el gancho del coach como plano 1', () => {
    expect(ID).toContain('es una guía para elegir, no una lista cerrada: si otra técnica sirve mejor, úsala, nómbrala y di por qué')
    for (const r of ROLES_DEL_PLANO) expect(ID, r).toContain(`\`${r}\``)
    expect(ID).toContain('Cada técnica es protagonista una sola vez en el video')
    expect(ID).toContain('Es una guía que avisa, no una reja')
    expect(ID).toContain('integras el del coach como plano 1')
    expect(ID).toContain('`marketing_short_video_editing_coach`')
    expect(ID).toContain('Duración, red, formato y paradas son dato del brief y de la oficina')
  })
  it('la hoja de planos lleva los campos que lee la hoja de CC1 (rol, dice, intención, tamaño, lente, luz, producto, estado final, prompts) y los prompts van en inglés, completos, sin texto dibujado ni caras reales', () => {
    for (const k of ['**Rol**', '**Dice:**', '**Intención:**', '**Tamaño, lente y luz:**', '**Producto:**', '**Estado final:**', '**Prompt de imagen y prompt de video, en inglés.**']) expect(ID, k).toContain(k)
    expect(ID).toContain('tan largos como el plano necesite')
    expect(ID).toContain('Sin texto dibujado en la imagen')
    expect(ID).toContain('nunca la cara de una persona real identificable')
  })
  it('el contrato JSON de la cascada social sigue igual (scenes, veo3_prompt como nombre heredado, salida JSON estricta)', () => {
    expect(ID).toContain('"version": "video-specs-v1"')
    expect(ID).toContain('"scenes": [')
    expect(ID).toContain('"veo3_prompt": "Optional · complete English prompt for the office\'s video generator (legacy key name kept for the runner)')
    expect(ID).toContain('8. **Output ESTRICTO JSON · NO markdown · NO prose afuera del bloque JSON principal.**')
  })
})

describe('202611162232 · la migración y su reversa (protocolo identity_content)', () => {
  it('la migración lleva el .md byte a byte, con guarda md5 del texto vivo del 16-nov, y verifica el resultado; solo toca identity_content de video-editor', () => {
    expect(md5(ID_S2)).toBe(MD5_S2)
    expect(MIG).toContain("WHERE name = 'video-editor' AND md5(identity_content) = '9b401cee3f253715d2a3573d6b6c9971';")
    expect(MIG).toContain(`md5(identity_content) = '${MD5_S2}'`)
    expect(MIG.match(/^UPDATE public\.agents SET identity_content = /gm)).toHaveLength(1)
    expect(MIG).not.toMatch(/\b(DELETE|DROP|INSERT|ALTER|TRUNCATE)\b|SET model/)
  })
  it('la reversa devuelve el texto vivo (con su md5 exacto) y solo sobre el nuevo', () => {
    const b = /\$antes\$([\s\S]*?)\$antes\$/.exec(REV)
    expect(b).not.toBeNull()
    expect(md5(b![1])).toBe('9b401cee3f253715d2a3573d6b6c9971')
    expect(b![1]).not.toBe(ID_S2)
    expect(REV).toContain(`WHERE name = 'video-editor' AND md5(identity_content) = '${MD5_S2}';`)
  })
})
