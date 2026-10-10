/**
 * R3 · PALABRAS DE CERTEZA · DATO por idioma (no por cliente, no por rubro). Se amplía sin tocar la lógica.
 * Cada entrada es una secuencia de palabras NORMALIZADAS (sin tildes, minúsculas); una palabra que termina en `*` es una RAÍZ (prefijo); sin `*`, exacta.
 * Son las palabras que SUBEN la certeza de una frase (convierten una opinión en un hecho que parece verificable).
 */
export interface PalabraDeCerteza { id: string; palabras: string[] }

export const PALABRAS_DE_CERTEZA_ES: PalabraDeCerteza[] = [
  { id: 'trazabilidad', palabras: ['trazab*'] },
  { id: 'verificable', palabras: ['verific*'] },
  { id: 'certificado', palabras: ['certific*'] },
  { id: 'garantia', palabras: ['garant*'] },
  { id: 'comprobado', palabras: ['comprob*'] },
  { id: 'unico', palabras: ['unic*'] },
  { id: 'exclusivo', palabras: ['exclusiv*'] },
  { id: 'ningun_competidor', palabras: ['ningun', 'competid*'] },
  { id: 'sin_igual', palabras: ['sin', 'igual'] },
  { id: 'el_mejor', palabras: ['el', 'mejor'] },
  { id: 'la_mejor', palabras: ['la', 'mejor'] },
  { id: 'los_mejores', palabras: ['los', 'mejores'] },
  { id: 'las_mejores', palabras: ['las', 'mejores'] },
  { id: 'lider', palabras: ['lider*'] },
  { id: 'premiado', palabras: ['premiad*'] },
  { id: 'origen', palabras: ['orige*'] },
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
      if (e.palabras.every((p, k) => palabras[i + k] !== undefined && coincide(palabras[i + k], p))) out.push({ id: e.id, palabra: palabras.slice(i, i + e.palabras.length).join(' '), indice: i })
    }
  }
  return out
}

/** ¿esta oración de una fuente contiene la MISMA palabra de certeza (misma entrada de la lista)? */
export const mencionaCerteza = (palabras: string[], id: string, lista: PalabraDeCerteza[] = PALABRAS_DE_CERTEZA_ES): boolean => buscarCerteza(palabras, lista).some((m) => m.id === id)
