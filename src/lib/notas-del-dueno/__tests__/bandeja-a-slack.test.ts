import { describe, expect, it } from 'vitest'
import { crearPuertos, CANAL_DE_LA_OFICINA, type Entorno } from '../../oficina/adaptadores'
import { piezaParaSlackDeLaBandeja } from '../adaptadores'
import { DbFalsa } from '../../oficina/__tests__/dbfalsa'

const CLIENTE = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const SALIDA = '55555555-5555-4555-8555-555555555555'
const contenido = (j: unknown) => ['# Pieza', '', 'Pie', '', '```json', JSON.stringify(j, null, 2), '```'].join('\n')

function mundo(contenidoGuardado: string = contenido({ pie_de_foto: 'Ceviche de la casa 🌊', hashtags: ['#ceviche', '#olon'] })) {
  const db = new DbFalsa()
  db.semilla('clients', [{ id: CLIENTE, name: 'Náufrago' }])
  db.semilla('client_historical_outputs', [{ id: SALIDA, client_id: CLIENTE, content_text: contenidoGuardado }])
  const llamadas: Array<{ url: string; cuerpo: Record<string, unknown> }> = []
  const f = (async (url: string, init?: RequestInit) => {
    llamadas.push({ url, cuerpo: JSON.parse(String(init?.body ?? '{}')) })
    return new Response(JSON.stringify({ ok: true, ts: '9.9', channel: { id: 'D1' } }), { status: 200 })
  }) as unknown as typeof fetch
  return { db, llamadas, f }
}
const ENV: Entorno = { baseUrl: 'https://app.test', internalKey: 'k', slackToken: 'xoxb-1' } as Entorno
const bandeja = { client_id: CLIENTE, output_id: SALIDA, titulo: 'Aprobación · Pieza', vista_previa: 'vista previa', metadata: { familia: 'post_img', enlace_entrega: { 'a.png': 'https://x.test/a.png', 'b.json': 'https://x.test/b.json' } }, expires_at: null }

describe('la pieza armada para Slack', () => {
  it('trae el nombre del cliente, el pie de foto, los hashtags y solo las imágenes entregadas', async () => {
    const { db } = mundo()
    const p = await piezaParaSlackDeLaBandeja(db, { hitl_id: 'h', ...bandeja })
    expect(p).toMatchObject({ hitl_id: 'h', cliente: 'Náufrago', titulo: 'Aprobación · Pieza', familia: 'post_img', texto: 'Ceviche de la casa 🌊', hashtags: ['#ceviche', '#olon'], imagenes: ['https://x.test/a.png'] })
  })
  it('si la salida no se puede leer o no tiene JSON, llega con la vista previa', async () => {
    const { db } = mundo('sin json aquí')
    expect((await piezaParaSlackDeLaBandeja(db, { hitl_id: 'h', ...bandeja })).texto).toBe('vista previa')
    db.fallar['client_historical_outputs'] = 'caída'
    expect((await piezaParaSlackDeLaBandeja(db, { hitl_id: 'h', ...bandeja })).texto).toBe('vista previa')
    const m = mundo('```json\n{no es json\n```')
    expect((await piezaParaSlackDeLaBandeja(m.db, { hitl_id: 'h', ...bandeja })).texto).toBe('vista previa')
  })
})

describe('la bandeja de la oficina también manda la pieza a Slack (solo con la bandera encendida)', () => {
  it('con la bandera: la pieza queda en la bandeja Y llega a Slack con botones por el canal de la oficina (#oficina-creativa por omisión), y el ts queda guardado', async () => {
    const { db, llamadas, f } = mundo()
    const q = await crearPuertos(db, { ...ENV, notasDelDueno: true }, f).bandeja({ ...bandeja, expires_at: null })
    expect(q.ok).toBe(true)
    const post = llamadas.find((l) => l.url.endsWith('chat.postMessage'))!
    expect(post.cuerpo.channel).toBe(CANAL_DE_LA_OFICINA)
    expect(CANAL_DE_LA_OFICINA).toBe('C0C7XUKNCLS')
    expect(llamadas.filter((l) => l.url.endsWith('conversations.open'))).toHaveLength(0) // nunca mensajes directos
    expect(JSON.stringify(post.cuerpo.blocks)).toContain('nota_aprobar')
    expect(JSON.stringify(post.cuerpo.blocks)).toContain('Ceviche de la casa')
    const fila = db.tablas['hitl_queue'].find((x) => x.type === 'content_piece_review')!
    expect(fila.metadata).toMatchObject({ slack: { canal: CANAL_DE_LA_OFICINA, ts: '9.9' }, familia: 'post_img' })
  })
  it('el canal sale de la configuración de la oficina: si se cambia OFICINA_SLACK_CANAL, la pieza va por ese canal', async () => {
    const { db, llamadas, f } = mundo()
    await crearPuertos(db, { ...ENV, notasDelDueno: true, slackCanalHilo: 'C9OTRAOFIC' }, f).bandeja({ ...bandeja, expires_at: null })
    expect(llamadas.find((l) => l.url.endsWith('chat.postMessage'))!.cuerpo.channel).toBe('C9OTRAOFIC')
  })
  it('sin la bandera: solo bandeja, ni una llamada a Slack (la ruta de siempre)', async () => {
    const { db, llamadas, f } = mundo()
    expect((await crearPuertos(db, ENV, f).bandeja({ ...bandeja, expires_at: null })).ok).toBe(true)
    expect(llamadas).toHaveLength(0)
  })
  it('sin token de Slack: tampoco, aunque la bandera esté encendida', async () => {
    const { db, llamadas, f } = mundo()
    expect((await crearPuertos(db, { ...ENV, slackToken: undefined, notasDelDueno: true }, f).bandeja({ ...bandeja, expires_at: null })).ok).toBe(true)
    expect(llamadas).toHaveLength(0)
  })
  it('si Slack falla o lanza, la bandeja igual queda y devuelve ok', async () => {
    const { db } = mundo()
    const fallo = (async () => { throw new Error('red caída') }) as unknown as typeof fetch
    const q = await crearPuertos(db, { ...ENV, notasDelDueno: true }, fallo).bandeja({ ...bandeja, expires_at: null })
    expect(q.ok).toBe(true)
    expect(db.tablas['hitl_queue']).toHaveLength(1)
  })
})
