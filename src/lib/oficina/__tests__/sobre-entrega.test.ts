import { describe, it, expect } from 'vitest'
import zlib from 'node:zlib'
import { validarSobre, decidirPuerta, claveDeIdempotencia, CONFIG_APAGADA, TARGET_STEP_PRODUCIR } from '../sobre'
import type { ConfigDeOficina } from '../sobre'
import { nombreDeArchivo, textoParaCopiar, leerMedidas, manifiesto, chequeosDeEntrega, aUtc, filasQueVencen } from '../entrega'
import type { FilaDeFormato } from '../entrega'
import { armarPedidoAlRevisor, destinoPermitidoParaOficina, PREGUNTA_AL_REVISOR } from '../ciego'

const PARTE = '426af72d-12c0-471c-9fda-2a2978db5175'
const base = { parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true }

describe('el sobre `brief/parte-listo · producir` + familia', () => {
  it('acepta el sobre actual SIN familia (compatible con la pieza simple)', () => {
    const r = validarSobre(base)
    expect(r.ok).toBe(true)
  })
  it('dry_run ausente o no booleano ⇒ se rechaza ANTES de gastar', () => {
    for (const dry_run of [undefined, 'false', 0, null]) {
      const r = validarSobre({ ...base, dry_run })
      expect(r.ok).toBe(false); if (!r.ok) expect(r.codigo).toBe('dry_run_ausente')
    }
  })
  it('client_id y tenant_id DENTRO del payload se ignoran y se anotan', () => {
    const r = validarSobre({ ...base, client_id: 'otro', tenant_id: 'x' })
    expect(r.ok && r.ignorados.sort()).toEqual(['client_id', 'tenant_id'])
    if (r.ok) expect(r.sobre).not.toHaveProperty('client_id')
  })
  it('valida parte_id (uuid), brief_id, tope (0–10] y familia', () => {
    expect(validarSobre({ ...base, parte_id: 'x' }).ok).toBe(false)
    expect(validarSobre({ ...base, brief_id: '' }).ok).toBe(false)
    expect(validarSobre({ ...base, tope_usd: 11 }).ok).toBe(false)
    expect(validarSobre({ ...base, tope_usd: 0 }).ok).toBe(false)
    expect(validarSobre({ ...base, familia: 'Post Img' }).ok).toBe(false)
    expect(validarSobre({ ...base, tope_usd: 10, familia: 'post_img' }).ok).toBe(true)
    expect(validarSobre('texto').ok).toBe(false)
  })
})

describe('la puerta decide: pasarela salvo que todo lo permita', () => {
  const sobre = (familia?: string) => ({ parte_id: PARTE, brief_id: 'BRF-0003', dry_run: true, ...(familia ? { familia } : {}) })
  const enc: ConfigDeOficina = { estado: 'encendida', familias_activas: ['post_img'], clientes_ensayo: [] }
  it('sin familia ⇒ pasarela (la pieza simple, cuerpo intacto)', () => { expect(decidirPuerta(sobre(), enc, TARGET_STEP_PRODUCIR, 'c1')).toEqual({ accion: 'pasarela', motivo: 'sin_familia' }) })
  it('oficina apagada ⇒ pasarela aunque venga familia (estado de semilla)', () => { expect(decidirPuerta(sobre('post_img'), CONFIG_APAGADA, TARGET_STEP_PRODUCIR, 'c1')).toEqual({ accion: 'pasarela', motivo: 'oficina_apagada' }) })
  it('familia no activa ⇒ pasarela', () => { expect(decidirPuerta(sobre('carrusel_ig_v1'), enc, TARGET_STEP_PRODUCIR, 'c1')).toEqual({ accion: 'pasarela', motivo: 'familia_no_activa' }) })
  it('ensayo: solo clientes de ensayo', () => {
    const e: ConfigDeOficina = { estado: 'ensayo', familias_activas: ['post_img'], clientes_ensayo: ['practica'] }
    expect(decidirPuerta(sobre('post_img'), e, TARGET_STEP_PRODUCIR, 'real')).toEqual({ accion: 'pasarela', motivo: 'cliente_fuera_del_ensayo' })
    expect(decidirPuerta(sobre('post_img'), e, TARGET_STEP_PRODUCIR, 'practica')).toEqual({ accion: 'abrir', familia: 'post_img' })
  })
  it('encendida + familia activa ⇒ abre', () => { expect(decidirPuerta(sobre('post_img'), enc, TARGET_STEP_PRODUCIR, 'c1')).toEqual({ accion: 'abrir', familia: 'post_img' }) })
  it('un origen que no es `producir` se rechaza', () => { expect(decidirPuerta(sobre('post_img'), enc, 'router.dispatch.otro.otro', 'c1')).toEqual({ accion: 'rechazar', motivo: 'origen_no_aceptado' }) })
  it('la semilla es apagada y sin familias', () => { expect(CONFIG_APAGADA).toEqual({ estado: 'apagada', familias_activas: [], clientes_ensayo: [] }) })
  it('la clave de idempotencia es distinta por encargo', () => {
    expect(claveDeIdempotencia({ parte_id: PARTE, brief_id: 'BRF-0003', familia: 'post_img' })).toBe(`${PARTE}:BRF-0003:post_img:1`)
    expect(claveDeIdempotencia({ parte_id: PARTE, brief_id: 'BRF-0003' })).toBe(`${PARTE}:BRF-0003:pieza:1`)
  })
})

function png(w: number, h: number): Buffer {
  const sig = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  const chunk = (t: string, d: Buffer) => { const l = Buffer.alloc(4); l.writeUInt32BE(d.length); return Buffer.concat([l, Buffer.from(t), d, Buffer.alloc(4)]) }
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(Buffer.alloc(10))), chunk('IEND', Buffer.alloc(0))])
}

describe('sala 4 · entrega «lista para publicar»', () => {
  it('nombre de archivo: ASCII, ordenable, con fecha, hora y orden', () => {
    expect(nombreDeArchivo({ fecha: '2026-10-14', hora: '18:30', red: 'Instagram', formato: 'Carrusel', brief_id: 'BRF-0012', n: 1, de: 6, ext: 'PNG' })).toBe('2026-10-14_1830_instagram_carrusel_BRF-0012_01-de-06.png')
    expect(nombreDeArchivo({ fecha: '2026-10-14', hora: '18:30', red: 'instagram', formato: 'foto', brief_id: 'BRF-0003', n: 1, de: 1, ext: 'png' })).toBe('2026-10-14_1830_instagram_foto_BRF-0003_01-de-01.png')
  })
  it('sin fecha: «sin-fecha_sin-hora» (no se inventa)', () => {
    expect(nombreDeArchivo({ fecha: null, hora: '18:30', red: 'instagram', formato: 'foto', brief_id: 'BRF-0003', n: 1, de: 1, ext: 'png' })).toBe('sin-fecha_sin-hora_instagram_foto_BRF-0003_01-de-01.png')
  })
  it('los nombres se ordenan igual que el orden de las láminas (incluso con 10 o más)', () => {
    const n = Array.from({ length: 12 }, (_, i) => nombreDeArchivo({ fecha: '2026-10-14', hora: '09:00', red: 'x', formato: 'y', brief_id: 'B', n: i + 1, de: 12, ext: 'png' }))
    expect([...n].sort()).toEqual(n)
  })
  it('texto para copiar: pie, línea en blanco y hashtags con # una sola vez', () => {
    expect(textoParaCopiar({ pie_de_foto: ' Ceviche a $7.00 ', hashtags: ['ceviche', '#olon', ' '] })).toBe('Ceviche a $7.00\n\n#ceviche #olon')
    expect(textoParaCopiar({ pie_de_foto: 'Solo texto', hashtags: [] })).toBe('Solo texto')
  })
  it('lee las medidas del encabezado del PNG; un archivo corrupto da null', () => {
    expect(leerMedidas(png(1080, 1080))).toEqual({ ancho: 1080, alto: 1080, tipo: 'png' })
    expect(leerMedidas(png(1080, 1920))).toEqual({ ancho: 1080, alto: 1920, tipo: 'png' })
    expect(leerMedidas(Buffer.from('no soy una imagen'))).toBeNull()
    expect(leerMedidas(png(10, 10).subarray(0, 20))).toBeNull()
  })
  const fila: FilaDeFormato = { red: 'instagram', formato: 'foto', ancho: 1080, alto: 1080, tipos_archivo: ['png', 'jpeg'], peso_max_mb: 8, n_min: 1, n_max: 1, texto_max: 2200, hashtags_max: 30, verificado: false }
  it('el manifiesto lleva la huella de cada archivo y un cambio de un byte la cambia', () => {
    const a = png(1080, 1080), b = Buffer.from(a); b[b.length - 1] ^= 1
    const m1 = manifiesto([{ nombre: 'a.png', bytes: a }], {}), m2 = manifiesto([{ nombre: 'a.png', bytes: b }], {})
    expect(m1.archivos[0].sha256).toMatch(/^[0-9a-f]{64}$/)
    expect(m1.archivos[0].sha256).not.toBe(m2.archivos[0].sha256)
  })
  const chequear = (buf: Buffer, f: FilaDeFormato | null = fila, texto = { pie_de_foto: 'x', hashtags: [] as string[] }) => {
    const arch = [{ nombre: 'a.png', bytes: buf }]
    return chequeosDeEntrega(arch, f, texto, manifiesto(arch, {}))
  }
  it('medidas correctas ⇒ sin fichas', () => { expect(chequear(png(1080, 1080))).toEqual([]) })
  it('una PROPORCIÓN distinta BLOQUEA aunque la fila no esté verificada', () => {
    const f = chequear(png(1080, 1350))
    expect(f[0]).toMatchObject({ gravedad: 'bloquea' }); expect(f[0].que).toMatch(/1080×1350/)
  })
  it('la proporción correcta con otro tamaño (1024×1024 generada) solo avisa', () => {
    const f = chequear(png(1024, 1024))
    expect(f).toHaveLength(1); expect(f[0].gravedad).toBe('sugerencia'); expect(f[0].que).toMatch(/proporción correcta/)
  })
  it('un archivo ilegible bloquea; un formato sin especificación bloquea', () => {
    expect(chequear(Buffer.from('xx'))[0].que).toMatch(/no es una imagen legible/)
    expect(chequear(png(1080, 1080), null)[0].que).toMatch(/no hay especificación/)
  })
  it('límites de texto: sugerencia si la fila no está verificada; bloquea si lo está', () => {
    const largo = { pie_de_foto: 'a'.repeat(2300), hashtags: [] }
    expect(chequear(png(1080, 1080), fila, largo)[0].gravedad).toBe('sugerencia')
    expect(chequear(png(1080, 1080), { ...fila, verificado: true }, largo)[0].gravedad).toBe('bloquea')
  })
  it('cantidad de archivos fuera de rango y nombres repetidos', () => {
    const arch = [{ nombre: 'a.png', bytes: png(1080, 1080) }, { nombre: 'a.png', bytes: png(1080, 1080) }]
    const f = chequeosDeEntrega(arch, fila, { pie_de_foto: 'x', hashtags: [] }, manifiesto(arch, {}))
    expect(f.map((x) => x.que).join(' | ')).toMatch(/2 archivo\(s\)/)
    expect(f.map((x) => x.que).join(' | ')).toMatch(/nombres de archivo repetidos/)
  })
})

describe('hora local → UTC y vencimiento de la bandeja', () => {
  it('Guayaquil es UTC−5: 18:30 locales = 23:30Z', () => { expect(aUtc('2026-10-14', '18:30', 'America/Guayaquil')).toBe('2026-10-14T23:30:00.000Z') })
  it('cambio de día: 22:00 en Guayaquil = 03:00Z del día siguiente', () => { expect(aUtc('2026-10-14', '22:00', 'America/Guayaquil')).toBe('2026-10-15T03:00:00.000Z') })
  it('otra zona con horario de verano (Madrid, octubre = UTC+2)', () => { expect(aUtc('2026-10-14', '18:30', 'Europe/Madrid')).toBe('2026-10-14T16:30:00.000Z') })
  it('sin fecha, sin zona o zona inexistente ⇒ null (la pieza no vence y se declara)', () => {
    expect(aUtc(null, '10:00', 'America/Guayaquil')).toBeNull()
    expect(aUtc('2026-10-14', '10:00', null)).toBeNull()
    expect(aUtc('2026-10-14', '10:00', 'Mars/Olympus')).toBeNull()
  })
  const ahora = new Date('2026-10-14T12:00:00Z')
  const fila = (o: Record<string, unknown>) => ({ id: 'x', status: 'pending', expires_at: '2026-10-14T10:00:00Z', metadata: { origen: 'oficina' }, ...o })
  it('vence una `pending` de la oficina con fecha pasada', () => { expect(filasQueVencen([fila({})], ahora)).toHaveLength(1) })
  it('NO toca: aprobadas, sin fecha, futuras, ni filas ajenas a la oficina', () => {
    expect(filasQueVencen([fila({ status: 'approved' }), fila({ expires_at: null }), fila({ expires_at: '2026-10-15T00:00:00Z' }), fila({ metadata: { origen: 'otro' } }), fila({ metadata: null })], ahora)).toHaveLength(0)
  })
})

describe('el revisor ciego y los recados', () => {
  it('el pedido al revisor es UNA pregunta abierta + el contexto del cliente + la pieza: sin reglas, sin rúbrica, sin lista de criterios ni formato de salida', () => {
    const p = armarPedidoAlRevisor({ pieza: 'Pie de foto: hola', imagenes: ['https://x/1.png', ''], contexto: [{ titulo: 'Manual de marca del cliente', texto: 'Voz directa' }, { titulo: 'Plan de trabajo del cliente', texto: '  ' }, { titulo: 'El brief de este entregable', texto: 'Brief X' }] })
    expect(p.texto.startsWith(PREGUNTA_AL_REVISOR)).toBe(true)
    expect(p.texto).toContain('## Manual de marca del cliente\nVoz directa')
    expect(p.texto).toContain('## El brief de este entregable\nBrief X')
    expect(p.texto).toContain('## La pieza\nPie de foto: hola')
    expect(p.texto).not.toContain('Plan de trabajo') // un contexto vacío se omite: no se inventa
    expect(p.imagenes).toEqual(['https://x/1.png'])
    expect(p.texto).not.toMatch(/gravedad|bloquea|sugerencia|rúbrica|JSON|"fichas"|debes|obligatorio/i)
  })
  it('el revisor es ciego POR CONSTRUCCIÓN: la función solo recibe pieza, imágenes y contexto (no el estado, no el hilo, no las fichas)', () => {
    expect(armarPedidoAlRevisor.length).toBe(1)
    const p = armarPedidoAlRevisor({ pieza: 'p', contexto: [] })
    expect(p.texto).toBe(`${PREGUNTA_AL_REVISOR}\n\n## La pieza\np`); expect(p.imagenes).toEqual([])
  })
  it('un recado a una PERSONA (`dueno`) se rechaza: el único humano es Emilio', () => {
    expect(destinoPermitidoParaOficina({ destino: 'dueno', tipo: 'persona', estado_del_brazo: 'opera' })).toMatchObject({ ok: false })
  })
  it('un destino apagado (`activo = false`) no se usa, aunque sea una herramienta que opera', () => {
    expect(destinoPermitidoParaOficina({ destino: 'imagen', tipo: 'herramienta', estado_del_brazo: 'opera', activo: false })).toMatchObject({ ok: false })
  })
  it('un recado a una herramienta que opera se permite; a una que no opera, no', () => {
    expect(destinoPermitidoParaOficina({ destino: 'imagen', tipo: 'herramienta', estado_del_brazo: 'opera' })).toEqual({ ok: true })
    expect(destinoPermitidoParaOficina({ destino: 'video', tipo: 'herramienta', estado_del_brazo: 'por_configurar' })).toMatchObject({ ok: false })
  })
})
