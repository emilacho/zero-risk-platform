/**
 * r79 · D6 · EL ACABADO ENCAJA LA IMAGEN A LA PROPORCIÓN DEL FORMATO, POR CÓDIGO (sin agente, sin modelo, sin dependencias: PNG con `node:zlib`).
 *
 * Antes: el generador entrega 1024×1024 y el formato pedía 1080×1350 (4:5) ⇒ el chequeo de entrega BLOQUEABA y alguien tenía que recortar a mano.
 * Ahora, sin deformar nunca (misma escala en los dos ejes) y sin cortar contenido:
 *   · RECORTA solo si lo que se quita es casi vacío: se elige la ventana con la menor energía de bordes (texto, rostros, objetos) y se acepta si lo quitado es ≤ 3 % del total;
 *   · si no, ENCAJA: la imagen entera cabe en el lienzo del formato y las franjas se rellenan con el color de su borde más cercano.
 * Solo PNG de 8 bits sin entrelazado (lo que entrega el generador). Cualquier otra cosa (JPEG, 16 bits…) se devuelve `no_soportada` SIN tocarla: el chequeo de entrega la sigue declarando.
 */
import zlib from 'node:zlib'

export interface Rgba { ancho: number; alto: number; datos: Uint8Array }
export type ModoDeEncaje = 'ya_correcta' | 'recortada' | 'encajada' | 'no_soportada'
export interface ResultadoDeEncaje { modo: ModoDeEncaje; bytes: Buffer; ancho: number; alto: number; detalle: string }

const FIRMA = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
/** el recorte se acepta si lo que se quita pesa a lo sumo esta parte de la energía de bordes de la imagen */
export const TOPE_DE_ENERGIA_QUITADA = 0.03

// ───────────────────────── PNG
function crc32(b: Buffer): number {
  let c = ~0
  for (let i = 0; i < b.length; i++) { c ^= b[i]; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)) }
  return ~c >>> 0
}
const trozo = (tipo: string, datos: Buffer): Buffer => {
  const t = Buffer.from(tipo, 'ascii'), len = Buffer.alloc(4), crc = Buffer.alloc(4)
  len.writeUInt32BE(datos.length); crc.writeUInt32BE(crc32(Buffer.concat([t, datos])))
  return Buffer.concat([len, t, datos, crc])
}

export function codificarPng(img: Rgba): Buffer {
  let opaca = true
  for (let i = 3; i < img.datos.length; i += 4) if (img.datos[i] !== 255) { opaca = false; break }
  const canales = opaca ? 3 : 4
  const fila = img.ancho * canales + 1
  const crudo = Buffer.alloc(fila * img.alto)
  for (let y = 0; y < img.alto; y++) {
    crudo[y * fila] = 0
    for (let x = 0; x < img.ancho; x++) for (let c = 0; c < canales; c++) crudo[y * fila + 1 + x * canales + c] = img.datos[(y * img.ancho + x) * 4 + c]
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(img.ancho, 0); ihdr.writeUInt32BE(img.alto, 4); ihdr[8] = 8; ihdr[9] = opaca ? 2 : 6
  return Buffer.concat([FIRMA, trozo('IHDR', ihdr), trozo('IDAT', zlib.deflateSync(crudo, { level: 6 })), trozo('IEND', Buffer.alloc(0))])
}

export function decodificarPng(b: Buffer): Rgba | null {
  try {
    if (b.length < 33 || !b.subarray(0, 8).equals(FIRMA)) return null
    let p = 8, ancho = 0, alto = 0, prof = 0, tipo = -1, entrelazado = 0
    const idat: Buffer[] = []
    let paleta: Buffer | null = null, trns: Buffer | null = null
    while (p + 8 <= b.length) {
      const len = b.readUInt32BE(p), t = b.toString('ascii', p + 4, p + 8), d = b.subarray(p + 8, p + 8 + len)
      if (t === 'IHDR') { ancho = d.readUInt32BE(0); alto = d.readUInt32BE(4); prof = d[8]; tipo = d[9]; entrelazado = d[12] }
      else if (t === 'PLTE') paleta = d
      else if (t === 'tRNS') trns = d
      else if (t === 'IDAT') idat.push(d)
      else if (t === 'IEND') break
      p += 12 + len
    }
    if (prof !== 8 || entrelazado !== 0 || !ancho || !alto || ancho * alto > 40_000_000) return null
    const canales = ({ 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 } as Record<number, number>)[tipo]
    if (!canales || (tipo === 3 && !paleta)) return null
    const crudo = zlib.inflateSync(Buffer.concat(idat))
    const fila = ancho * canales
    if (crudo.length < (fila + 1) * alto) return null
    const px = Buffer.alloc(fila * alto)
    for (let y = 0; y < alto; y++) {
      const f = crudo[y * (fila + 1)], o = y * fila, a = y * (fila + 1) + 1
      for (let i = 0; i < fila; i++) {
        const x = crudo[a + i]
        const izq = i >= canales ? px[o + i - canales] : 0
        const arr = y > 0 ? px[o - fila + i] : 0
        const dia = y > 0 && i >= canales ? px[o - fila + i - canales] : 0
        let v: number
        if (f === 0) v = x
        else if (f === 1) v = x + izq
        else if (f === 2) v = x + arr
        else if (f === 3) v = x + ((izq + arr) >> 1)
        else if (f === 4) { const pp = izq + arr - dia, pa = Math.abs(pp - izq), pb = Math.abs(pp - arr), pc = Math.abs(pp - dia); v = x + (pa <= pb && pa <= pc ? izq : pb <= pc ? arr : dia) }
        else return null
        px[o + i] = v & 255
      }
    }
    const out = new Uint8Array(ancho * alto * 4)
    for (let i = 0; i < ancho * alto; i++) {
      const s = i * canales, d = i * 4
      if (tipo === 6) { out[d] = px[s]; out[d + 1] = px[s + 1]; out[d + 2] = px[s + 2]; out[d + 3] = px[s + 3] }
      else if (tipo === 2) { out[d] = px[s]; out[d + 1] = px[s + 1]; out[d + 2] = px[s + 2]; out[d + 3] = 255 }
      else if (tipo === 0) { out[d] = out[d + 1] = out[d + 2] = px[s]; out[d + 3] = 255 }
      else if (tipo === 4) { out[d] = out[d + 1] = out[d + 2] = px[s]; out[d + 3] = px[s + 1] }
      else { const k = px[s]; out[d] = paleta![k * 3]; out[d + 1] = paleta![k * 3 + 1]; out[d + 2] = paleta![k * 3 + 2]; out[d + 3] = trns && k < trns.length ? trns[k] : 255 }
    }
    return { ancho, alto, datos: out }
  } catch { return null }
}

// ───────────────────────── geometría
/** reescala con promedio de área (reducir) o bilineal (ampliar): misma escala en ancho y alto SOLO si el llamador así lo pide; aquí se pide el tamaño exacto */
export function reescalar(img: Rgba, ancho: number, alto: number): Rgba {
  if (img.ancho === ancho && img.alto === alto) return img
  const out = new Uint8Array(ancho * alto * 4)
  const sx = img.ancho / ancho, sy = img.alto / alto
  for (let y = 0; y < alto; y++) {
    const y0 = y * sy, y1 = (y + 1) * sy
    for (let x = 0; x < ancho; x++) {
      const x0 = x * sx, x1 = (x + 1) * sx
      let r = 0, g = 0, bl = 0, a = 0, peso = 0
      const ya = Math.floor(y0), yb = Math.min(img.alto - 1, Math.ceil(y1) - 1)
      const xa = Math.floor(x0), xb = Math.min(img.ancho - 1, Math.ceil(x1) - 1)
      for (let yy = ya; yy <= Math.max(ya, yb); yy++) {
        const wy = Math.min(yy + 1, y1) - Math.max(yy, y0)
        for (let xx = xa; xx <= Math.max(xa, xb); xx++) {
          const w = Math.max(1e-6, (Math.min(xx + 1, x1) - Math.max(xx, x0))) * Math.max(1e-6, wy)
          const i = (Math.min(yy, img.alto - 1) * img.ancho + Math.min(xx, img.ancho - 1)) * 4
          r += img.datos[i] * w; g += img.datos[i + 1] * w; bl += img.datos[i + 2] * w; a += img.datos[i + 3] * w; peso += w
        }
      }
      const d = (y * ancho + x) * 4
      out[d] = Math.round(r / peso); out[d + 1] = Math.round(g / peso); out[d + 2] = Math.round(bl / peso); out[d + 3] = Math.round(a / peso)
    }
  }
  return { ancho, alto, datos: out }
}

const luz = (d: Uint8Array, i: number) => (d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000

/** energía de bordes por columna (eje 'x') o por fila (eje 'y') */
function energia(img: Rgba, eje: 'x' | 'y'): number[] {
  const { ancho: w, alto: h, datos: d } = img
  const n = eje === 'x' ? w : h
  const e = new Array<number>(n).fill(0)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const i = (y * w + x) * 4, l = luz(d, i)
    const dx = x + 1 < w ? Math.abs(l - luz(d, i + 4)) : 0
    const dy = y + 1 < h ? Math.abs(l - luz(d, i + w * 4)) : 0
    e[eje === 'x' ? x : y] += dx + dy
  }
  return e
}

/** la ventana de `largo` casillas con la MENOR energía quitada; empata hacia el centro. Devuelve el inicio y la fracción de energía que se quita. */
function mejorVentana(e: number[], largo: number): { inicio: number; quitada: number } {
  const n = e.length, total = e.reduce((a, b) => a + b, 0)
  if (largo >= n) return { inicio: 0, quitada: 0 }
  const pref = [0]; for (const v of e) pref.push(pref[pref.length - 1] + v)
  const centro = (n - largo) / 2
  let mejor = 0, mejorDentro = -1
  for (let s = 0; s <= n - largo; s++) {
    const dentro = pref[s + largo] - pref[s]
    if (dentro > mejorDentro + 1e-9 || (Math.abs(dentro - mejorDentro) <= 1e-9 && Math.abs(s - centro) < Math.abs(mejor - centro))) { mejorDentro = dentro; mejor = s }
  }
  return { inicio: mejor, quitada: total <= 0 ? 0 : (total - mejorDentro) / total }
}

function recortar(img: Rgba, x0: number, y0: number, w: number, h: number): Rgba {
  const out = new Uint8Array(w * h * 4)
  for (let y = 0; y < h; y++) out.set(img.datos.subarray(((y0 + y) * img.ancho + x0) * 4, ((y0 + y) * img.ancho + x0 + w) * 4), y * w * 4)
  return { ancho: w, alto: h, datos: out }
}

/** color medio de una franja de borde (de 1 a 3 casillas de grosor) */
function colorDeBorde(img: Rgba, lado: 'arriba' | 'abajo' | 'izq' | 'der'): [number, number, number] {
  let r = 0, g = 0, b = 0, n = 0
  const g3 = 3
  for (let k = 0; k < g3; k++) {
    const cuenta = lado === 'arriba' || lado === 'abajo' ? img.ancho : img.alto
    for (let t = 0; t < cuenta; t++) {
      const x = lado === 'izq' ? k : lado === 'der' ? img.ancho - 1 - k : t
      const y = lado === 'arriba' ? k : lado === 'abajo' ? img.alto - 1 - k : t
      const i = (Math.min(Math.max(y, 0), img.alto - 1) * img.ancho + Math.min(Math.max(x, 0), img.ancho - 1)) * 4
      r += img.datos[i]; g += img.datos[i + 1]; b += img.datos[i + 2]; n++
    }
  }
  return [Math.round(r / n), Math.round(g / n), Math.round(b / n)]
}

function lienzo(ancho: number, alto: number): Rgba { return { ancho, alto, datos: new Uint8Array(ancho * alto * 4) } }
function pintar(l: Rgba, x0: number, y0: number, w: number, h: number, c: [number, number, number]) {
  for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) { const i = (y * l.ancho + x) * 4; l.datos[i] = c[0]; l.datos[i + 1] = c[1]; l.datos[i + 2] = c[2]; l.datos[i + 3] = 255 }
}
function pegar(l: Rgba, img: Rgba, x0: number, y0: number) {
  for (let y = 0; y < img.alto; y++) l.datos.set(img.datos.subarray(y * img.ancho * 4, (y + 1) * img.ancho * 4), ((y0 + y) * l.ancho + x0) * 4)
}

/** Encaja `img` a EXACTAMENTE `ancho`×`alto` sin deformar (misma escala en los dos ejes). Función pura sobre píxeles. */
export function encajarPixeles(img: Rgba, ancho: number, alto: number): { img: Rgba; modo: Exclude<ModoDeEncaje, 'no_soportada'> } {
  const meta = ancho / alto, fuente = img.ancho / img.alto
  if (Math.abs(fuente - meta) <= 0.005) return { img: reescalar(img, ancho, alto), modo: 'ya_correcta' }
  const demasiadoAncha = fuente > meta
  // 1 · ¿se puede recortar quitando casi nada?
  const largo = demasiadoAncha ? Math.round(img.alto * meta) : Math.round(img.ancho / meta)
  const v = mejorVentana(energia(img, demasiadoAncha ? 'x' : 'y'), largo)
  if (v.quitada <= TOPE_DE_ENERGIA_QUITADA) {
    const rec = demasiadoAncha ? recortar(img, v.inicio, 0, largo, img.alto) : recortar(img, 0, v.inicio, img.ancho, largo)
    return { img: reescalar(rec, ancho, alto), modo: 'recortada' }
  }
  // 2 · encajar entera y rellenar las franjas con el color del borde más cercano
  const L = lienzo(ancho, alto)
  if (demasiadoAncha) {
    const h = Math.round(img.alto * ancho / img.ancho), y0 = Math.floor((alto - h) / 2)
    const e = reescalar(img, ancho, h)
    pintar(L, 0, 0, ancho, y0, colorDeBorde(e, 'arriba')); pintar(L, 0, y0 + h, ancho, alto - y0 - h, colorDeBorde(e, 'abajo')); pegar(L, e, 0, y0)
  } else {
    const w = Math.round(img.ancho * alto / img.alto), x0 = Math.floor((ancho - w) / 2)
    const e = reescalar(img, w, alto)
    pintar(L, 0, 0, x0, alto, colorDeBorde(e, 'izq')); pintar(L, x0 + w, 0, ancho - x0 - w, alto, colorDeBorde(e, 'der')); pegar(L, e, x0, 0)
  }
  return { img: L, modo: 'encajada' }
}

/** Entrada de bytes. PNG de 8 bits: se encaja. Otra cosa: `no_soportada`, bytes intactos. */
export function encajarAProporcion(bytes: Buffer, destino: { ancho: number; alto: number }): ResultadoDeEncaje {
  const img = decodificarPng(bytes)
  if (!img) return { modo: 'no_soportada', bytes, ancho: 0, alto: 0, detalle: 'solo se encajan PNG de 8 bits sin entrelazado; el archivo queda como llegó' }
  if (img.ancho === destino.ancho && img.alto === destino.alto) return { modo: 'ya_correcta', bytes, ancho: img.ancho, alto: img.alto, detalle: 'ya mide lo que pide el formato' }
  const r = encajarPixeles(img, destino.ancho, destino.alto)
  const detalle = r.modo === 'recortada' ? `recortada de ${img.ancho}×${img.alto} a ${destino.ancho}×${destino.alto}: lo quitado era casi vacío (≤ ${Math.round(TOPE_DE_ENERGIA_QUITADA * 100)} % del detalle)`
    : r.modo === 'encajada' ? `encajada entera de ${img.ancho}×${img.alto} en ${destino.ancho}×${destino.alto} (con franjas del color del borde): recortarla habría cortado contenido`
      : `reescalada de ${img.ancho}×${img.alto} a ${destino.ancho}×${destino.alto} (misma proporción)`
  return { modo: r.modo, bytes: codificarPng(r.img), ancho: destino.ancho, alto: destino.alto, detalle }
}
