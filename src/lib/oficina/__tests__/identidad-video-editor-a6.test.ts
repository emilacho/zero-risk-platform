/**
 * 17-nov · GO Lenovo «quitar rejas» · A·6 de CC3: `video-editor` ya no fija «rostros generados, naturales y del país del cliente».
 * Cómo se ven las personas lo deciden el manual, el brief y la escena; queda la LEY (ninguna cara real identificable sin permiso registrado).
 * Protocolo identity_content: la migración lleva el .md byte a byte con guarda md5 del texto vivo; la reversa devuelve el vivo solo sobre el nuevo. US$ 0.
 */
import { describe, expect, it } from 'vitest'
import crypto from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'
import { antesDe4b } from './fixtures/rejas-4b'

const RAIZ = path.resolve(__dirname, '../../../..')
const leer = (rel: string) => fs.readFileSync(path.join(RAIZ, rel), 'utf8').replace(/\r\n/g, '\n')
const md5 = (t: string) => crypto.createHash('md5').update(t, 'utf8').digest('hex')
// el texto del A·6: el de hoy sin los cambios posteriores del tramo 4b (generador nombrado y 9:16)
const ID = antesDe4b('video-editor.md', leer('src/agents/identities/video-editor.md'))
const MIG = leer('supabase/migrations/202611171500_agents_video_editor_a6_rostros.sql')
const REV = leer('supabase/reversas/202611171500_agents_video_editor_a6_rostros_REVERSA.sql')
const VIVO_17NOV = '7c79ae8b8d8b901aeb60d0f7ed71ff89'
const FRASE_VIEJA = 'Si hay personas, rostros generados, naturales y del país del cliente, nunca la cara de una persona real identificable.'
const FRASE_NUEVA = 'Si hay personas, cómo se ven lo deciden el manual, el brief y la escena; nunca la cara de una persona real identificable sin su permiso registrado.'

describe('A·6 · los rostros en la identidad de video-editor', () => {
  it('ya no fija cómo se ven las personas («naturales y del país del cliente»)', () => {
    expect(ID).not.toMatch(/naturales y del país del cliente/)
    expect(ID).not.toMatch(/rostros generados, naturales/)
  })
  it('queda la LEY: ninguna cara real identificable sin su permiso; cómo se ven lo deciden el manual, el brief y la escena', () => {
    expect(ID).toContain(FRASE_NUEVA)
  })
  it('solo cambió esa frase frente al texto vivo del 17-nov', () => {
    const b = /\$antes\$([\s\S]*?)\$antes\$/.exec(REV)![1]
    expect(md5(b)).toBe(VIVO_17NOV)
    expect(b.replace(FRASE_VIEJA, FRASE_NUEVA)).toBe(ID)
  })
})

describe('202611171500 · la migración y su reversa (protocolo identity_content)', () => {
  it('la migración lleva el .md byte a byte, con guarda md5 del vivo, verifica el resultado y solo toca identity_content de video-editor', () => {
    expect(MIG).toContain(`$ident$${ID}$ident$`)
    expect(MIG).toContain(`WHERE name = 'video-editor' AND md5(identity_content) = '${VIVO_17NOV}';`)
    expect(MIG).toContain(`md5(identity_content) = '${md5(ID)}'`)
    expect(MIG.match(/^UPDATE public\.agents SET identity_content = /gm)).toHaveLength(1)
    expect(MIG).not.toMatch(/\b(DELETE|DROP|INSERT|ALTER|TRUNCATE)\b|SET model/)
  })
  it('la reversa devuelve el vivo del 17-nov solo sobre el nuevo y lo comprueba', () => {
    expect(REV).toContain(`WHERE name = 'video-editor' AND md5(identity_content) = '${md5(ID)}';`)
    expect(REV).toContain(`md5(identity_content) = '${VIVO_17NOV}'`)
    expect(REV.match(/^UPDATE public\.agents SET identity_content = /gm)).toHaveLength(1)
  })
})
