/**
 * EL AVISO DE «CAMBIÓ UN RASPADOR» (19-oct) · una línea a #alertas, validada; sin Slack real (molde). Sin tocar Apify, base ni modelo.
 */
import fs from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { rutaAvisoDeRaspador, textoDelAviso } from '../aviso-de-raspador'
import { avisarAAlertas } from '../avisos'
import { CANAL_DE_ALERTAS } from '../vigilante'

const molde = (ok = true) => { const textos: string[] = []; return { textos, avisar: async (t: string) => { textos.push(t); return { ok, detalle: ok ? 'entregado' : 'Slack respondió 200 channel_not_found' } } } }
const BUENO = { dry_run: false, funcion: 'youtube_video_scraper', motivo: 'campo_desaparecido', detalle: 'downloadSubtitles ya no existe y no hay mapa' }

describe('aviso de raspador', () => {
  it('entrega UNA línea con la función, lo que pasó y el arreglo', async () => {
    const m = molde()
    const r = await rutaAvisoDeRaspador(m, BUENO)
    expect(r.status).toBe(200)
    expect(r.body).toMatchObject({ ok: true, enviado: true })
    expect(m.textos).toHaveLength(1)
    expect(m.textos[0]).toMatch(/\[RASPADOR\].*youtube_video_scraper.*downloadSubtitles/)
    expect(m.textos[0]).toMatch(/sin dato por cambio del raspador/)
    expect(m.textos[0]).toMatch(/recongelar-esquemas\.mjs aplicar/)
    expect(m.textos[0]).not.toMatch(/\n/)
  })
  it('en seco no envía, pero muestra el texto', async () => {
    const m = molde()
    const r = await rutaAvisoDeRaspador(m, { ...BUENO, dry_run: true })
    expect(m.textos).toHaveLength(0)
    expect(r.body).toMatchObject({ ok: true, dry_run: true, enviado: false })
    expect(String(r.body.texto)).toMatch(/youtube_video_scraper/)
  })
  it('valida: dry_run obligatorio, función con forma de función, motivo conocido, detalle no vacío', async () => {
    const m = molde()
    for (const malo of [null, [], { ...BUENO, dry_run: undefined }, { ...BUENO, funcion: 'Youtube Video' }, { ...BUENO, funcion: '' }, { ...BUENO, motivo: 'otro' }, { ...BUENO, detalle: '   ' }, { ...BUENO, detalle: 5 }]) {
      const r = await rutaAvisoDeRaspador(m, malo)
      expect(r.status).toBe(400)
    }
    expect(m.textos).toHaveLength(0)
  })
  it('un aviso que Slack no confirma NO se da por entregado (502): n8n no marca la sordina y lo reintenta', async () => {
    const r = await rutaAvisoDeRaspador(molde(false), BUENO)
    expect(r.status).toBe(502)
    expect(r.body).toMatchObject({ ok: false, enviado: false })
  })
  it('el detalle se limpia (sin saltos ni comillas de código)', async () => {
    const r = await rutaAvisoDeRaspador(molde(), { ...BUENO, dry_run: true, detalle: 'a\nb `c` d' })
    expect(String(r.body.texto)).not.toMatch(/[\n`]/)
  })
  it('el texto largo se recorta a 600 caracteres de detalle', async () => {
    const m = molde()
    await rutaAvisoDeRaspador(m, { ...BUENO, detalle: 'z'.repeat(5000) })
    expect(m.textos[0].length).toBeLessThan(1000)
  })
  it('sale por el bot de Slack al canal de alertas (no a #equipo)', async () => {
    const visto: Array<{ url: string; body: string }> = []
    const enviar = avisarAAlertas({ token: 't', fetchImpl: async (u, i) => { visto.push({ url: u, body: String(i?.body) }); return new Response(JSON.stringify({ ok: true }), { status: 200 }) } })
    const r = await rutaAvisoDeRaspador({ avisar: enviar }, BUENO)
    expect(r.status).toBe(200)
    expect(JSON.parse(visto[0].body).channel).toBe(CANAL_DE_ALERTAS)
  })
  it('la ruta exige la llave interna, solo anota el incidente en la base (nada más) y no llama a un modelo', () => {
    const src = fs.readFileSync(path.join(process.cwd(), 'src/app/api/brain/alimentar/aviso-de-raspador/route.ts'), 'utf8')
    expect(src).toMatch(/checkInternalKey/)
    expect(src.replace(/\/\*[\s\S]*?\*\//, '')).not.toMatch(/agenteDelRoster|apify|\.from\(/i) // la base solo entra como el almacén de incidentes de Slack (`avisarAAlertas({ db })`)
    const lib = fs.readFileSync(path.join(process.cwd(), 'src/lib/portero-alimenta/aviso-de-raspador.ts'), 'utf8')
    expect(lib.replace(/\/\*[\s\S]*?\*\//, '')).not.toMatch(/\bfetch\(|supabase/i)
  })
})
