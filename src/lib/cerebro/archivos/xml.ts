/**
 * Recorrido de XML mínimo y LINEAL (sin biblioteca, sin expresiones regulares sobre el documento entero): lo que Word y XLSX necesitan.
 * No resuelve entidades externas ni DTD (nada de red, nada de archivos): `<!...>` y `<?...?>` se saltan; solo se decodifican las cinco
 * entidades básicas y las referencias numéricas VÁLIDAS (las demás se descartan).
 */
export interface TokenXml {
  tipo: 'abre' | 'cierra' | 'vacia' | 'texto'
  /** nombre de la etiqueta tal cual (con prefijo, p. ej. `w:p`); vacío en texto */
  nombre: string
  /** el texto ya decodificado (solo en `texto`) */
  texto: string
  /** el contenido crudo de la etiqueta, para leer atributos bajo demanda */
  crudo: string
}

const ENTIDADES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }

function caracterDeReferencia(cuerpo: string): string {
  const hex = cuerpo[1] === 'x' || cuerpo[1] === 'X'
  const digitos = cuerpo.slice(hex ? 2 : 1)
  if (!digitos || digitos.length > 8 || !(hex ? /^[0-9a-fA-F]+$/ : /^[0-9]+$/).test(digitos)) return ''
  const cp = parseInt(digitos, hex ? 16 : 10)
  if (!Number.isFinite(cp) || cp > 0x10ffff || (cp >= 0xd800 && cp <= 0xdfff)) return ''
  if (cp < 0x20 && cp !== 9 && cp !== 10 && cp !== 13) return ''
  if (cp === 0xfffe || cp === 0xffff) return ''
  return String.fromCodePoint(cp)
}

export function decodificar(texto: string): string {
  if (texto.indexOf('&') < 0) return texto
  let salida = ''
  let i = 0
  while (i < texto.length) {
    const a = texto.indexOf('&', i)
    if (a < 0) { salida += texto.slice(i); break }
    salida += texto.slice(i, a)
    const z = texto.indexOf(';', a + 1)
    if (z < 0 || z - a > 12) { salida += '&'; i = a + 1; continue }
    const cuerpo = texto.slice(a + 1, z)
    if (cuerpo[0] === '#') salida += caracterDeReferencia(cuerpo)
    else if (cuerpo in ENTIDADES) salida += ENTIDADES[cuerpo]
    else salida += texto.slice(a, z + 1)
    i = z + 1
  }
  return salida
}

/** recorre el XML; si `alVer` devuelve `true` se detiene (para respetar topes de salida) */
export function recorrer(xml: string, alVer: (t: TokenXml) => boolean | void): void {
  let i = 0
  const n = xml.length
  while (i < n) {
    const a = xml.indexOf('<', i)
    if (a < 0) {
      if (i < n && alVer({ tipo: 'texto', nombre: '', texto: decodificar(xml.slice(i)), crudo: '' })) return
      return
    }
    if (a > i && alVer({ tipo: 'texto', nombre: '', texto: decodificar(xml.slice(i, a)), crudo: '' })) return
    if (xml.startsWith('<![CDATA[', a)) {
      const f = xml.indexOf(']]>', a + 9)
      const fin = f < 0 ? n : f
      if (alVer({ tipo: 'texto', nombre: '', texto: xml.slice(a + 9, fin), crudo: '' })) return
      i = f < 0 ? n : f + 3
      continue
    }
    if (xml.startsWith('<!--', a)) { const f = xml.indexOf('-->', a + 4); i = f < 0 ? n : f + 3; continue }
    if (xml[a + 1] === '?' || xml[a + 1] === '!') { const f = xml.indexOf('>', a + 2); i = f < 0 ? n : f + 1; continue }
    const f = xml.indexOf('>', a + 1)
    if (f < 0) return
    let crudo = xml.slice(a + 1, f)
    i = f + 1
    if (crudo[0] === '/') { if (alVer({ tipo: 'cierra', nombre: crudo.slice(1).trim(), texto: '', crudo })) return; continue }
    const vacia = crudo.endsWith('/')
    if (vacia) crudo = crudo.slice(0, -1)
    let e = 0
    while (e < crudo.length && !/\s/.test(crudo[e])) e++
    if (alVer({ tipo: vacia ? 'vacia' : 'abre', nombre: crudo.slice(0, e), texto: '', crudo })) return
  }
}

/** un atributo de una etiqueta (comillas dobles o simples); sin él → `undefined` */
export function atributo(crudo: string, nombre: string): string | undefined {
  let desde = 0
  while (desde < crudo.length) {
    const p = crudo.indexOf(nombre, desde)
    if (p < 0) return undefined
    const antes = p === 0 ? ' ' : crudo[p - 1]
    let q = p + nombre.length
    if (/\s/.test(antes)) {
      while (q < crudo.length && /\s/.test(crudo[q])) q++
      if (crudo[q] === '=') {
        q++
        while (q < crudo.length && /\s/.test(crudo[q])) q++
        const comilla = crudo[q]
        if (comilla === '"' || comilla === "'") {
          const f = crudo.indexOf(comilla, q + 1)
          if (f >= 0) return decodificar(crudo.slice(q + 1, f))
        }
      }
    }
    desde = p + nombre.length
  }
  return undefined
}
