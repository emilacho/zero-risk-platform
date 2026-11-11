/**
 * #1025 · EL CABLE (certificación CC7 🟡): los puertos reales de la oficina traen `formatosDeLaCadena`, que lee `cadena_formatos_por_red`
 * por el almacén de la cadena. Sin este cable la protección de «la sala confía en la familia» se apagaría en silencio (el puerto es opcional).
 * US$ 0, sin red.
 */
import { describe, expect, it, vi } from 'vitest'

const LEIDAS: string[] = []
const FILAS = [
  { red: 'instagram', formato: 'foto', lead_dias: 3, produccion: 'opera', max_por_dia: 2, familia: 'post_img' },
  { red: 'instagram', formato: 'reel', lead_dias: 7, produccion: 'espera_brazo', max_por_dia: 2, familia: 'video_mesa' },
]
vi.mock('@/lib/supabase', () => ({
  getSupabaseAdmin: () => ({
    from: (t: string) => ({ select: () => ({ limit: () => { LEIDAS.push(t); return Promise.resolve({ data: FILAS, error: null }) } }) }),
  }),
}))

import { crearPuertos } from '../adaptadores'
import { briefEsDelEncargo } from '../familia-del-brief'

describe('el puerto real de la oficina lee la tabla de formatos por el almacén de la cadena', () => {
  it('trae `formatosDeLaCadena`, lee `cadena_formatos_por_red` y la sala frena un reel que cae en post_img', async () => {
    const P = crearPuertos({} as never, { baseUrl: 'http://x', internalKey: 'k' } as never)
    expect(typeof P.formatosDeLaCadena).toBe('function')
    const t = await P.formatosDeLaCadena!()
    expect(LEIDAS).toEqual(['cadena_formatos_por_red'])
    expect(t.instagram.map((f) => `${f.formato}→${f.familia}`)).toEqual(['foto→post_img', 'reel→video_mesa'])
    // con el puerto REAL, la protección está encendida: el reel en post_img frena y la foto pasa
    expect((await briefEsDelEncargo({ id: 'r', red: 'Instagram', formato: 'reel' }, 'post_img', P.formatosDeLaCadena!.bind(P))).ok).toBe(false)
    expect((await briefEsDelEncargo({ id: 'f', red: 'Instagram', formato: 'foto' }, 'post_img', P.formatosDeLaCadena!.bind(P))).ok).toBe(true)
  })
})
