/**
 * R3 · PALABRAS DE CERTEZA · DATO por idioma (no por cliente, no por rubro). Se amplía sin tocar la lógica.
 * Cada entrada es una secuencia de palabras NORMALIZADAS (sin tildes, minúsculas); una palabra que termina en `*` es una RAÍZ (prefijo); sin `*`, exacta.
 * Son las palabras que SUBEN la certeza de una frase (convierten una opinión en un hecho que parece verificable).
 */
/**
 * M1-c · son PATRONES con objeto, no palabras sueltas: una palabra ambigua («única», «origen», «exclusivas») solo marca cuando la frase la usa como AFIRMACIÓN
 * (con artículo o verbo de ser delante, al inicio de la cláusula, o con la palabra que le da objeto), no como adorno creativo («una experiencia única», «de origen marino»).
 * `antes`: el patrón solo vale si la palabra anterior es una de estas (o si `inicio` y está al principio de la cláusula).
 */
export interface PalabraDeCerteza { id: string; palabras: string[]; antes?: string[]; inicio?: boolean }

const SER_O_ARTICULO = ['el', 'la', 'los', 'las', 'lo', 'es', 'son', 'somos', 'soy', 'eres', 'era', 'ser', 'unica', 'unico']

export const PALABRAS_DE_CERTEZA_ES: PalabraDeCerteza[] = [
  { id: 'trazabilidad', palabras: ['trazab*'] },
  { id: 'verificable', palabras: ['verificab*'] },
  { id: 'verificable', palabras: ['verificad*'] },
  { id: 'certificado', palabras: ['certific*'] },
  { id: 'garantia', palabras: ['garant*'] },
  { id: 'comprobado', palabras: ['comprob*'] },
  { id: 'unico', palabras: ['unic*'], antes: SER_O_ARTICULO, inicio: true },
  { id: 'unico', palabras: ['solo', 'nosotr*'] },
  { id: 'exclusivo', palabras: ['exclusiv*', 'de'] },
  { id: 'exclusivo', palabras: ['en', 'exclusiv*'] },
  { id: 'exclusivo', palabras: ['exclusivid*'] },
  { id: 'exclusivo', palabras: ['exclusiv*'], antes: ['es', 'son', 'somos', 'distribuidor', 'distribuidora', 'distribuidores', 'representante', 'representantes'] },
  { id: 'ningun_competidor', palabras: ['ningun', 'competid*'] },
  { id: 'sin_igual', palabras: ['sin', 'igual'] },
  { id: 'el_mejor', palabras: ['el', 'mejor'] },
  { id: 'la_mejor', palabras: ['la', 'mejor'] },
  { id: 'los_mejores', palabras: ['los', 'mejores'] },
  { id: 'las_mejores', palabras: ['las', 'mejores'] },
  { id: 'lider', palabras: ['lider*'] },
  { id: 'premiado', palabras: ['premiad*'] },
  { id: 'origen', palabras: ['denominacion', 'de', 'orige*'] },
  // «origen» solo marca cuando se le da un objeto de certeza («origen verificable», «origen real»); «de origen marino» es adorno
  // relato de origen COMO AFIRMACIÓN (r63 · CC#3 §4): «el origen es la prueba», «un origen geográfico específico», «lugar de origen»; «de origen marino», «narrativa de origen», «orgulloso de origen» siguen siendo adorno/voz
  { id: 'origen', palabras: ['orige*'], antes: ['el', 'un', 'su', 'este', 'nuestro', 'mismo'] },
  { id: 'origen', palabras: ['lugar', 'de', 'orige*'] },
  { id: 'origen', palabras: ['orige*', 'geograf*'] },
  { id: 'origen', palabras: ['orige*', 'especific*'] },
  ...['verificab*', 'verificad*', 'real', 'certific*', 'garant*', 'comprob*', 'unic*', 'exclusiv*'].map((o) => ({ id: 'origen', palabras: ['orige*', o] })),
  { id: 'el_primero', palabras: ['el', 'primer*'] },
  { id: 'la_primera', palabras: ['la', 'primer*'] },
  { id: 'primero_en', palabras: ['primer*', 'en'] },
  { id: 'cien_por_ciento', palabras: ['100%'] },
]

export interface MarcaDeCerteza { id: string; palabra: string; indice: number }

const coincide = (pal: string, patron: string): boolean => (patron.endsWith('*') ? pal.startsWith(patron.slice(0, -1)) : pal === patron)

/** las palabras de certeza que contiene un texto (ya partido en palabras normalizadas) */
export function buscarCerteza(palabras: string[], lista: PalabraDeCerteza[] = PALABRAS_DE_CERTEZA_ES): MarcaDeCerteza[] {
  const out: MarcaDeCerteza[] = []
  for (let i = 0; i < palabras.length; i++) {
    for (const e of lista) {
      if (e.antes && !((e.inicio && i === 0) || (i > 0 && e.antes.includes(palabras[i - 1])))) continue
      if (e.palabras.every((p, k) => palabras[i + k] !== undefined && coincide(palabras[i + k], p))) out.push({ id: e.id, palabra: palabras.slice(i, i + e.palabras.length).join(' '), indice: i })
    }
  }
  return out
}

/** ¿esta oración de una fuente contiene la MISMA palabra de certeza (misma entrada de la lista)? */
export const mencionaCerteza = (palabras: string[], id: string, lista: PalabraDeCerteza[] = PALABRAS_DE_CERTEZA_ES): boolean => buscarCerteza(palabras, lista).some((m) => m.id === id)
